/**
 * LLM Provider Edge Case Tests
 *
 * Covers construction, endpoint selection, response parsing failures,
 * abort handling and health-check errors for every provider, plus the
 * provider registry. Both providers share the same control flow, so the
 * cases are parameterized over a per-provider response builder.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AnthropicProvider } from '@/llm/providers/anthropic.js';
import { OpenAIProvider } from '@/llm/providers/openai.js';
import {
  createLLMProvider,
  getSupportedProviders,
  LLMProviderError,
  LLMTimeoutError,
  LLMInvalidResponseError,
  type FilterRules,
  type LLMProvider,
  type LLMProviderConfig,
} from '@/llm/index.js';
import { installFetchMock, type FetchMock } from '../helpers/fetch.js';

const rules: FilterRules = {
  enabled: true,
  categories: {
    spam: true,
    abuse: false,
    profanity: true,
    promptInjection: false,
    phishing: false,
    scam: false,
  },
  threshold: 0.7,
  failMode: 'allow',
  maxCallsPerDay: 1000,
};

interface ProviderCase {
  name: 'anthropic' | 'openai';
  Provider: new (config: LLMProviderConfig) => LLMProvider;
  defaultEndpoint: string;
  /** Wrap raw model text in the provider's API response envelope */
  reply: (text: string | undefined) => Record<string, unknown>;
  /** Response envelope with no content at all */
  emptyReply: Record<string, unknown>;
}

const providerCases: ProviderCase[] = [
  {
    name: 'anthropic',
    Provider: AnthropicProvider,
    defaultEndpoint: 'https://api.anthropic.com/v1/messages',
    reply: (text) => ({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    emptyReply: { id: 'msg_1', content: [], model: 'claude-haiku-4-5-20251001' },
  },
  {
    name: 'openai',
    Provider: OpenAIProvider,
    defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
    reply: (text) => ({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 0,
      model: 'gpt-4o-mini',
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    emptyReply: { id: 'chatcmpl-1', choices: [], model: 'gpt-4o-mini' },
  },
];

describe.each(providerCases)('$name provider edge cases', (pc) => {
  let fetchMock: FetchMock;
  let provider: LLMProvider;

  const ok = (body: Record<string, unknown>) => ({ ok: true, json: () => Promise.resolve(body) });

  beforeEach(() => {
    fetchMock = installFetchMock();
    provider = new pc.Provider({
      provider: pc.name,
      apiKey: 'test-key',
      model: 'test-model',
      timeout: 5000,
    });
  });

  it('should require an API key', () => {
    expect(
      () => new pc.Provider({ provider: pc.name, model: 'test-model', timeout: 5000 })
    ).toThrow(/API key is required/);
  });

  it('should use the default endpoint when none is configured', async () => {
    fetchMock.mockResolvedValueOnce(
      ok(
        pc.reply(
          JSON.stringify({ allowed: true, confidence: 0.1, categories: [], reasoning: 'ok' })
        )
      )
    );

    await provider.analyze('hello', rules);

    expect(fetchMock.mock.calls[0]![0]).toBe(pc.defaultEndpoint);
  });

  it('should use a custom endpoint and only list enabled categories', async () => {
    const custom = new pc.Provider({
      provider: pc.name,
      apiKey: 'test-key',
      model: 'test-model',
      timeout: 5000,
      endpoint: 'https://llm.internal.example/v1',
    });
    fetchMock.mockResolvedValueOnce(
      ok(
        pc.reply(
          JSON.stringify({ allowed: true, confidence: 0.1, categories: [], reasoning: 'ok' })
        )
      )
    );

    await custom.analyze('hello', rules);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://llm.internal.example/v1');
    const prompt = init?.body as string;
    expect(prompt).toContain('Analyze this content for: spam, profanity');
    expect(prompt).not.toContain('for: spam, abuse');
  });

  it('should extract JSON from a markdown code block without a language tag', async () => {
    fetchMock.mockResolvedValueOnce(
      ok(
        pc.reply(
          '```\n' +
            JSON.stringify({
              allowed: false,
              confidence: 0.9,
              categories: ['spam'],
              reasoning: 'x',
            }) +
            '\n```'
        )
      )
    );

    const result = await provider.analyze('hello', rules);

    expect(result.fallback).toBeUndefined();
    expect(result.allowed).toBe(false);
    expect(result.provider).toBe(pc.name);
    expect(result.model).toBeDefined();
  });

  it('should fall back when the response has no content', async () => {
    fetchMock.mockResolvedValueOnce(ok(pc.emptyReply));

    const result = await provider.analyze('hello', { ...rules, failMode: 'block' });

    expect(result.fallback).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.fallbackReason).toContain('No content in response');
  });

  it('should fall back when the response JSON has an invalid structure', async () => {
    fetchMock.mockResolvedValueOnce(ok(pc.reply(JSON.stringify({ allowed: 'yes' }))));

    const result = await provider.analyze('hello', rules);

    expect(result.fallback).toBe(true);
    expect(result.fallbackReason).toContain('Invalid response structure');
  });

  it('should fall back when the response is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(ok(pc.reply('I cannot help with that')));

    const result = await provider.analyze('hello', rules);

    expect(result.fallback).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.fallbackReason).toContain('LLM returned invalid response');
  });

  it('should fall back with a timeout reason when the request is aborted', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));

    const result = await provider.analyze('hello', rules);

    expect(result.fallback).toBe(true);
    expect(result.fallbackReason).toBe('Request timeout');
    expect(result.reasoning).toBe('LLM analysis failed: Request timeout');
  });

  it('should include status and body in API error fallback reason', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    });

    const result = await provider.analyze('hello', rules);

    expect(result.fallbackReason).toMatch(/API error: 429 rate limited/);
  });

  it('should rethrow non-Error rejections', async () => {
    fetchMock.mockRejectedValueOnce('boom');

    await expect(provider.analyze('hello', rules)).rejects.toBe('boom');
  });

  it('should report unhealthy when the health check request throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(provider.healthCheck()).resolves.toBe(false);
  });
});

describe('LLM provider registry', () => {
  const base = { apiKey: 'test-key', model: 'test-model', timeout: 1000 };

  it('should create an Anthropic provider', () => {
    const provider = createLLMProvider({ ...base, provider: 'anthropic' });
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.name).toBe('anthropic');
  });

  it('should create an OpenAI provider', () => {
    const provider = createLLMProvider({ ...base, provider: 'openai' });
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe('openai');
  });

  it.each(['gemini', 'ollama'] as const)('should reject unimplemented provider %s', (name) => {
    expect(() => createLLMProvider({ ...base, provider: name })).toThrow(/not yet implemented/);
  });

  it('should reject unknown providers', () => {
    const config = { ...base, provider: 'mystery' } as unknown as LLMProviderConfig;
    expect(() => createLLMProvider(config)).toThrow('Unsupported LLM provider: mystery');
  });

  it('should list supported providers', () => {
    expect(getSupportedProviders()).toEqual(['anthropic', 'openai']);
  });
});

describe('LLM error classes', () => {
  it('should carry provider and original error on LLMProviderError', () => {
    const cause = new Error('root cause');
    const error = new LLMProviderError('failed', 'anthropic', cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('LLMProviderError');
    expect(error.provider).toBe('anthropic');
    expect(error.originalError).toBe(cause);
  });

  it('should format timeout errors', () => {
    const error = new LLMTimeoutError('openai', 250);

    expect(error).toBeInstanceOf(LLMProviderError);
    expect(error.name).toBe('LLMTimeoutError');
    expect(error.message).toBe('LLM request timed out after 250ms');
  });

  it('should format invalid response errors', () => {
    const error = new LLMInvalidResponseError('openai', 'bad json');

    expect(error).toBeInstanceOf(LLMProviderError);
    expect(error.name).toBe('LLMInvalidResponseError');
    expect(error.message).toBe('LLM returned invalid response: bad json');
  });
});
