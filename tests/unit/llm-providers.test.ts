/**
 * LLM Provider Unit Tests
 *
 * Tests for LLM provider implementations (Anthropic, OpenAI).
 * Uses mock fetch responses to test provider behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMProviderError, LLMTimeoutError } from '@/llm/index.js';
import { AnthropicProvider } from '@/llm/providers/anthropic.js';
import { OpenAIProvider } from '@/llm/providers/openai.js';
import type { FilterRules } from '@/llm/providers/base.js';
import { installFetchMock, type FetchMock } from '../helpers/fetch.js';

/** fetch mock that never settles on its own and rejects only when aborted */
function hangUntilAborted(_input: Parameters<typeof fetch>[0], init?: RequestInit) {
  return new Promise<never>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('aborted', 'AbortError'))
    );
  });
}

const content = (message: string) => ({ message });

// Default filter rules for testing
const defaultRules: FilterRules = {
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

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();

    provider = new AnthropicProvider({
      provider: 'anthropic',
      apiKey: 'test-api-key',
      model: 'claude-haiku-4-5-20251001',
      timeout: 5000,
    });
  });

  describe('analyze()', () => {
    it('should detect spam with high confidence', async () => {
      // Mock successful spam detection response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  allowed: false,
                  confidence: 0.95,
                  categories: ['spam', 'promotional'],
                  reasoning: 'Unsolicited marketing content',
                }),
              },
            ],
            model: 'claude-haiku-4-5-20251001',
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
      });

      const result = await provider.analyze(content('BUY CHEAP VIAGRA NOW!!!'), defaultRules);

      expect(result.allowed).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.categories).toContain('spam');
      expect(result.provider).toBe('anthropic');
      // Latency can be 0 when the mocked fetch resolves synchronously within
      // the same Date.now() tick — assert the field exists and is non-negative.
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should allow legitimate messages', async () => {
      // Mock successful legitimate content response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_124',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  allowed: true,
                  confidence: 0.92,
                  categories: ['safe'],
                  reasoning: 'Legitimate inquiry',
                }),
              },
            ],
            model: 'claude-haiku-4-5-20251001',
            stop_reason: 'end_turn',
            usage: { input_tokens: 80, output_tokens: 40 },
          }),
      });

      const result = await provider.analyze(
        content('Hi, I have a question about your product'),
        defaultRules
      );

      expect(result.allowed).toBe(true);
      expect(result.categories).not.toContain('spam');
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      // Mock response with markdown code block
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_125',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: '```json\n{"allowed": false, "confidence": 0.85, "categories": ["abuse"], "reasoning": "Threatening language"}\n```',
              },
            ],
            model: 'claude-haiku-4-5-20251001',
            stop_reason: 'end_turn',
            usage: { input_tokens: 90, output_tokens: 45 },
          }),
      });

      const result = await provider.analyze(content('Test message'), defaultRules);

      expect(result.allowed).toBe(false);
      expect(result.categories).toContain('abuse');
    });

    it('should read the verdict from the first text block when other blocks come first', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_126',
            type: 'message',
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: '', signature: 'sig' },
              {
                type: 'text',
                text: '{"allowed": false, "confidence": 0.9, "categories": ["spam"], "reasoning": "Ad"}',
              },
            ],
            model: 'claude-haiku-5-5',
            stop_reason: 'end_turn',
          }),
      });

      const result = await provider.analyze(content('BUY NOW'), defaultRules);

      expect(result.allowed).toBe(false);
      expect(result.categories).toContain('spam');
    });

    it('should treat a response without a text block as a provider failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'thinking', thinking: '', signature: 'sig' }],
            stop_reason: 'max_tokens',
          }),
      });

      await expect(provider.analyze(content('Test message'), defaultRules)).rejects.toThrow(
        'No content in response'
      );
    });

    it('should throw a timeout error when the request exceeds the timeout', async () => {
      fetchMock.mockImplementationOnce(hangUntilAborted);

      const shortTimeoutProvider = new AnthropicProvider({
        provider: 'anthropic',
        apiKey: 'test-api-key',
        model: 'claude-haiku-4-5-20251001',
        timeout: 50,
      });

      await expect(
        shortTimeoutProvider.analyze(content('Test message'), defaultRules)
      ).rejects.toBeInstanceOf(LLMTimeoutError);
    });

    it('should throw on API errors regardless of failMode', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      for (const failMode of ['allow', 'block'] as const) {
        await expect(
          provider.analyze(content('Test message'), { ...defaultRules, failMode })
        ).rejects.toThrow(LLMProviderError);
      }
    });
  });

  describe('healthCheck()', () => {
    it('should return true when API is healthy', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'msg_test' }),
      });

      const isHealthy = await provider.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return false when API is unhealthy', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const isHealthy = await provider.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });
});

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();

    provider = new OpenAIProvider({
      provider: 'openai',
      apiKey: 'test-api-key',
      model: 'gpt-3.5-turbo',
      timeout: 5000,
    });
  });

  describe('analyze()', () => {
    it('should detect spam with high confidence', async () => {
      // Mock successful spam detection response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1234567890,
            model: 'gpt-3.5-turbo',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: JSON.stringify({
                    allowed: false,
                    confidence: 0.93,
                    categories: ['spam'],
                    reasoning: 'Marketing spam detected',
                  }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
      });

      const result = await provider.analyze(content('BUY NOW LIMITED TIME OFFER!!!'), defaultRules);

      expect(result.allowed).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.categories).toContain('spam');
      expect(result.provider).toBe('openai');
    });

    it('should allow legitimate messages', async () => {
      // Mock successful legitimate content response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-124',
            object: 'chat.completion',
            created: 1234567891,
            model: 'gpt-3.5-turbo',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: JSON.stringify({
                    allowed: true,
                    confidence: 0.88,
                    categories: ['safe'],
                    reasoning: 'Normal message',
                  }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 80, completion_tokens: 40, total_tokens: 120 },
          }),
      });

      const result = await provider.analyze(content('Hello, how are you?'), defaultRules);

      expect(result.allowed).toBe(true);
      expect(result.categories).not.toContain('spam');
    });

    it('should throw a timeout error when the request exceeds the timeout', async () => {
      fetchMock.mockImplementationOnce(hangUntilAborted);

      const shortTimeoutProvider = new OpenAIProvider({
        provider: 'openai',
        apiKey: 'test-api-key',
        model: 'gpt-3.5-turbo',
        timeout: 50,
      });

      await expect(
        shortTimeoutProvider.analyze(content('Test message'), defaultRules)
      ).rejects.toBeInstanceOf(LLMTimeoutError);
    });
  });

  describe('healthCheck()', () => {
    it('should return true when API is healthy', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'chatcmpl-test' }),
      });

      const isHealthy = await provider.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return false when API is unhealthy', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const isHealthy = await provider.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });
});
