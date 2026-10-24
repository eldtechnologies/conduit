/**
 * LLM Filter Middleware Unit Tests
 *
 * Exercises llmFilter in isolation on a minimal Hono app so each decision
 * branch (skip conditions, budget, whitelisting, blocking, fail modes) can be
 * driven directly. Filter rules are registered on the shared config map per
 * test and removed afterwards.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { config } from '@/config.js';
import { llmFilter } from '@/middleware/llmFilter.js';
import { errorHandler } from '@/middleware/errorHandler.js';
import { AnthropicProvider } from '@/llm/providers/anthropic.js';
import type { FilterRules } from '@/llm/index.js';
import { installFetchMock, type FetchMock } from '../helpers/fetch.js';
import { readJson } from '../helpers/response.js';

interface FilterTestResponse {
  success: boolean;
  code?: string;
  error?: string;
  passed?: boolean;
  llmAnalysis?: {
    allowed: boolean;
    confidence: number;
    fallback?: boolean;
    fallbackReason?: string;
  } | null;
  details?: {
    retryAfter?: number;
    reason?: string;
    categories?: string[];
  };
}

interface TestVariables {
  apiKey: string;
  parsedBody: unknown;
  llmAnalysis: FilterTestResponse['llmAnalysis'];
}

const baseRules: FilterRules = {
  enabled: true,
  categories: {
    spam: true,
    abuse: true,
    profanity: true,
    promptInjection: true,
    phishing: true,
    scam: true,
  },
  threshold: 0.7,
  failMode: 'allow',
  maxCallsPerDay: 1000,
};

let keyCounter = 0;
const registeredKeys: string[] = [];

/**
 * Register filter rules under a fresh API key (fresh key = fresh budget tracker).
 */
function registerRules(overrides: Partial<FilterRules> = {}): string {
  keyCounter++;
  const apiKey = `KEY_LLMFILTER_UNIT_${keyCounter}_0123456789abcdef`;
  config.llmFilterRules.set(apiKey, { ...baseRules, ...overrides });
  registeredKeys.push(apiKey);
  return apiKey;
}

/**
 * Build a test app. The request JSON carries the simulated context that
 * upstream middleware (auth, recipientValidation) would normally set.
 */
function buildApp() {
  const app = new Hono<{ Variables: TestVariables }>();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    const input = await c.req.json<{ apiKey?: string; body?: unknown }>();
    if (input.apiKey) c.set('apiKey', input.apiKey);
    if (input.body !== undefined) c.set('parsedBody', input.body);
    await next();
  });
  app.use('*', llmFilter);
  app.post('/', (c) =>
    c.json({ success: true, passed: true, llmAnalysis: c.get('llmAnalysis') ?? null })
  );
  return app;
}

async function run(apiKey: string | undefined, body?: unknown) {
  const res = await buildApp().fetch(
    new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, body }),
    })
  );
  return { status: res.status, data: await readJson<FilterTestResponse>(res) };
}

function anthropicReply(result: Record<string, unknown>) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: JSON.stringify(result) }],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
  };
}

const safeResult = { allowed: true, confidence: 0.1, categories: ['safe'], reasoning: 'ok' };

const messageBody = {
  data: { name: 'Jane', email: 'jane@example.com', message: 'Hello there' },
};

describe('llmFilter middleware', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const key of registeredKeys.splice(0)) {
      config.llmFilterRules.delete(key);
    }
    vi.restoreAllMocks();
  });

  describe('skip conditions', () => {
    it('should reject requests without an API key in context', async () => {
      const { status, data } = await run(undefined, messageBody);

      expect(status).toBe(403);
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('should skip filtering when LLM is not configured globally', async () => {
      const apiKey = registerRules();
      const savedLlm = config.llm;
      config.llm = undefined;
      try {
        const { status, data } = await run(apiKey, messageBody);
        expect(status).toBe(200);
        expect(data.llmAnalysis).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        config.llm = savedLlm;
      }
    });

    it('should skip filtering when the API key has no rules', async () => {
      const { status, data } = await run('KEY_LLMFILTER_UNIT_NORULES_0123456789', messageBody);

      expect(status).toBe(200);
      expect(data.llmAnalysis).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should skip filtering when rules are disabled for the API key', async () => {
      const apiKey = registerRules({ enabled: false });
      const { status } = await run(apiKey, messageBody);

      expect(status).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should skip filtering when no parsed body is in context', async () => {
      const apiKey = registerRules();
      const { status } = await run(apiKey);

      expect(status).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should skip analysis when body has no data object', async () => {
      const apiKey = registerRules();
      const { status } = await run(apiKey, { channel: 'email' });

      expect(status).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should skip analysis when data has no non-empty string fields', async () => {
      const apiKey = registerRules();
      const { status } = await run(apiKey, { data: { name: '   ', count: 3 } });

      expect(status).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('budget enforcement', () => {
    it('should return 503 with retryAfter when budget is exhausted in block mode', async () => {
      const apiKey = registerRules({ maxCallsPerDay: 0, failMode: 'block' });

      // First call initializes the tracker; second sees count (0) >= max (0)
      fetchMock.mockResolvedValue(anthropicReply(safeResult));
      await run(apiKey, messageBody);
      const { status, data } = await run(apiKey, messageBody);

      expect(status).toBe(503);
      expect(data.code).toBe('LLM_BUDGET_EXCEEDED');
      expect(data.details?.retryAfter).toBeGreaterThan(0);
      expect(data.details?.retryAfter).toBeLessThanOrEqual(24 * 60 * 60);
    });

    it('should allow without analysis when budget is exhausted in allow mode', async () => {
      const apiKey = registerRules({ maxCallsPerDay: 1, failMode: 'allow' });
      fetchMock.mockResolvedValue(anthropicReply(safeResult));

      await run(apiKey, messageBody);
      const { status, data } = await run(apiKey, messageBody);

      expect(status).toBe(200);
      expect(data.llmAnalysis).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('sender whitelisting', () => {
    const whitelistSenders = ['trusted@example.com'];

    it('should skip analysis for whitelisted data.email (case-insensitive)', async () => {
      const apiKey = registerRules({ whitelistSenders });
      const { status } = await run(apiKey, {
        data: { email: ' Trusted@Example.com ', message: 'Hi' },
      });

      expect(status).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should fall back to data.from when data.email is absent', async () => {
      const apiKey = registerRules({ whitelistSenders });
      const { status } = await run(apiKey, {
        data: { from: 'trusted@example.com', message: 'Hi' },
      });

      expect(status).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should fall back to top-level from.email when data has no sender', async () => {
      const apiKey = registerRules({ whitelistSenders });
      const { status } = await run(apiKey, {
        from: { email: 'trusted@example.com', name: 'Trusted' },
        data: { message: 'Hi' },
      });

      expect(status).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should prefer data.email over top-level from.email', async () => {
      const apiKey = registerRules({ whitelistSenders });
      fetchMock.mockResolvedValueOnce(anthropicReply(safeResult));

      const { status } = await run(apiKey, {
        from: { email: 'trusted@example.com' },
        data: { email: 'stranger@example.com', message: 'Hi' },
      });

      expect(status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should analyze when sender is not whitelisted', async () => {
      const apiKey = registerRules({ whitelistSenders });
      fetchMock.mockResolvedValueOnce(anthropicReply(safeResult));

      const { status, data } = await run(apiKey, messageBody);

      expect(status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(data.llmAnalysis?.allowed).toBe(true);
    });
  });

  describe('content analysis', () => {
    it('should send concatenated string fields to the provider', async () => {
      const apiKey = registerRules();
      fetchMock.mockResolvedValueOnce(anthropicReply(safeResult));

      await run(apiKey, messageBody);

      const [, init] = fetchMock.mock.calls[0]!;
      const sent = JSON.parse(init?.body as string) as {
        messages: Array<{ content: string }>;
      };
      expect(sent.messages[0]!.content).toContain('name: Jane');
      expect(sent.messages[0]!.content).toContain('message: Hello there');
    });

    it('should allow content flagged below the confidence threshold', async () => {
      const apiKey = registerRules({ threshold: 0.9 });
      fetchMock.mockResolvedValueOnce(
        anthropicReply({ allowed: false, confidence: 0.6, categories: ['spam'], reasoning: 'meh' })
      );

      const { status, data } = await run(apiKey, messageBody);

      expect(status).toBe(200);
      expect(data.llmAnalysis?.allowed).toBe(false);
      expect(data.llmAnalysis?.confidence).toBe(0.6);
    });

    it.each([
      [['abuse'], 'CONTENT_BLOCKED_ABUSE'],
      [['profanity'], 'CONTENT_BLOCKED_PROFANITY'],
      [['phishing'], 'CONTENT_BLOCKED_PHISHING'],
      [['scam'], 'CONTENT_BLOCKED_SCAM'],
      [['promptInjection'], 'CONTENT_BLOCKED_PROMPT_INJECTION'],
      [['spam', 'abuse'], 'CONTENT_BLOCKED_SPAM'],
      [['other'], 'CONTENT_BLOCKED_SPAM'],
    ])('should block categories %j with %s', async (categories, expectedCode) => {
      const apiKey = registerRules();
      fetchMock.mockResolvedValueOnce(
        anthropicReply({ allowed: false, confidence: 0.95, categories, reasoning: 'bad' })
      );

      const { status, data } = await run(apiKey, messageBody);

      expect(status).toBe(403);
      expect(data.code).toBe(expectedCode);
      expect(data.details?.categories).toEqual(categories);
    });
  });

  describe('provider failures', () => {
    it('should return 503 when provider throws in block mode', async () => {
      const apiKey = registerRules({ failMode: 'block' });
      vi.spyOn(AnthropicProvider.prototype, 'analyze').mockRejectedValueOnce(
        new Error('provider exploded')
      );

      const { status, data } = await run(apiKey, messageBody);

      expect(status).toBe(503);
      expect(data.code).toBe('LLM_PROVIDER_ERROR');
      expect(data.details?.reason).toBe('provider exploded');
    });

    it('should report unknown reason for non-Error throws in block mode', async () => {
      const apiKey = registerRules({ failMode: 'block' });
      // A non-Error rejection from fetch is rethrown by the provider as-is
      fetchMock.mockRejectedValueOnce('network down');

      const { status, data } = await run(apiKey, messageBody);

      expect(status).toBe(503);
      expect(data.details?.reason).toBe('Unknown error');
    });

    it('should allow with fallback analysis when provider throws in allow mode', async () => {
      const apiKey = registerRules({ failMode: 'allow' });
      vi.spyOn(AnthropicProvider.prototype, 'analyze').mockRejectedValueOnce(
        new Error('provider exploded')
      );

      const { status, data } = await run(apiKey, messageBody);

      expect(status).toBe(200);
      expect(data.llmAnalysis).toMatchObject({
        allowed: true,
        confidence: 0,
        fallback: true,
        fallbackReason: 'provider exploded',
      });
    });

    it('should use a generic fallback reason for non-Error throws in allow mode', async () => {
      const apiKey = registerRules({ failMode: 'allow' });
      fetchMock.mockRejectedValueOnce('network down');

      const { status, data } = await run(apiKey, messageBody);

      expect(status).toBe(200);
      expect(data.llmAnalysis?.fallbackReason).toBe('LLM analysis failed');
    });
  });
});
