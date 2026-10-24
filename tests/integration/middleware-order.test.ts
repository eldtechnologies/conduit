/**
 * Middleware Order Integration Tests
 *
 * Verifies the security-critical ordering in src/index.ts through the full app:
 * - Rate limiting runs before LLM filtering, so 429'd requests never call the LLM
 * - Recipient validation runs before rate limiting, so 403'd recipients do not
 *   consume the key's tokens
 *
 * Lives in its own file so the in-memory rate limit state starts fresh.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '@/index.js';
import { readJson, type ErrorResponse } from '../helpers/response.js';
import { installFetchMock, resendSuccessResponse, type FetchMock } from '../helpers/fetch.js';
import { clearAllRateLimits } from '@/middleware/rateLimit.js';

const LLM_ENDPOINT = 'https://api.anthropic.com/v1/messages';

function isLlmCall(input: Parameters<typeof fetch>[0]): boolean {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return url.startsWith(LLM_ENDPOINT);
}

function llmAllowResponse(): Response {
  return new Response(
    JSON.stringify({
      id: 'msg_safe',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            allowed: true,
            confidence: 0.95,
            categories: ['safe'],
            reasoning: 'Legitimate inquiry',
          }),
        },
      ],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

async function send(apiKey: string, to: string): Promise<Response> {
  return app.fetch(
    new Request('http://localhost/api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        Origin: 'http://localhost:8080',
      },
      body: JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to,
        data: {
          name: 'Test User',
          email: 'test@example.com',
          message: 'Hello, I have a question about your product.',
        },
      }),
    })
  );
}

describe('Middleware order', () => {
  const originalFetch = global.fetch;
  let fetchMock: FetchMock;

  const llmCalls = () => fetchMock.mock.calls.filter(([input]) => isLlmCall(input)).length;

  beforeEach(() => {
    clearAllRateLimits();
    fetchMock = installFetchMock();
    fetchMock.mockImplementation((input) =>
      Promise.resolve(isLlmCall(input) ? llmAllowResponse() : resendSuccessResponse('mock-msg-id'))
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('should reject an LLM-enabled key over its minute limit with 429 without calling the LLM', async () => {
    const apiKey = process.env.API_KEY_LLM_TEST!;

    // Per-minute limit is 10 (tests/setup.ts)
    for (let i = 0; i < 10; i++) {
      expect((await send(apiKey, 'support@example.com')).status).toBe(200);
    }
    expect(llmCalls()).toBe(10);

    for (let i = 0; i < 5; i++) {
      const res = await send(apiKey, 'support@example.com');
      expect(res.status).toBe(429);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(res.headers.get('retry-after')).toBe(String(body.retryAfter));
    }

    // No LLM call for any of the rate-limited requests
    expect(llmCalls()).toBe(10);
  });

  it('should reject non-whitelisted recipients with 403 without consuming rate limit tokens', async () => {
    const apiKey = process.env.API_KEY_TEST_WHITELIST!;

    for (let i = 0; i < 15; i++) {
      const res = await send(apiKey, 'attacker@evil.com');
      expect(res.status).toBe(403);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('RECIPIENT_NOT_ALLOWED');
    }

    // The full per-minute budget is still available
    const res = await send(apiKey, 'allowed@example.com');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ratelimit-remaining-minute')).toBe('9');
  });
});
