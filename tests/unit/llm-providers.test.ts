/**
 * LLM Provider Unit Tests
 *
 * Tests for LLM provider implementations (Anthropic, OpenAI).
 * Uses mock fetch responses to test provider behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnthropicProvider } from '@/llm/providers/anthropic.js';
import { OpenAIProvider } from '@/llm/providers/openai.js';
import type { FilterRules } from '@/llm/providers/base.js';

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
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    provider = new AnthropicProvider({
      provider: 'anthropic',
      apiKey: 'test-api-key',
      model: 'claude-3-haiku-20240307',
      timeout: 5000,
    });
  });

  describe('analyze()', () => {
    it('should detect spam with high confidence', async () => {
      // Mock successful spam detection response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
          model: 'claude-3-haiku-20240307',
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      });

      const result = await provider.analyze('BUY CHEAP VIAGRA NOW!!!', defaultRules);

      expect(result.allowed).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.categories).toContain('spam');
      expect(result.provider).toBe('anthropic');
      expect(result.latency).toBeGreaterThan(0);
    });

    it('should allow legitimate messages', async () => {
      // Mock successful legitimate content response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
          model: 'claude-3-haiku-20240307',
          stop_reason: 'end_turn',
          usage: { input_tokens: 80, output_tokens: 40 },
        }),
      });

      const result = await provider.analyze('Hi, I have a question about your product', defaultRules);

      expect(result.allowed).toBe(true);
      expect(result.categories).not.toContain('spam');
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      // Mock response with markdown code block
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg_125',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: '```json\n{"allowed": false, "confidence": 0.85, "categories": ["abuse"], "reasoning": "Threatening language"}\n```',
            },
          ],
          model: 'claude-3-haiku-20240307',
          stop_reason: 'end_turn',
          usage: { input_tokens: 90, output_tokens: 45 },
        }),
      });

      const result = await provider.analyze('Test message', defaultRules);

      expect(result.allowed).toBe(false);
      expect(result.categories).toContain('abuse');
    });

    it('should handle timeout with fallback', async () => {
      // Mock timeout
      fetchMock.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 100);
        });
      });

      const shortTimeoutProvider = new AnthropicProvider({
        provider: 'anthropic',
        apiKey: 'test-api-key',
        model: 'claude-3-haiku-20240307',
        timeout: 50,
      });

      const result = await shortTimeoutProvider.analyze('Test message', {
        ...defaultRules,
        failMode: 'allow',
      });

      expect(result.fallback).toBe(true);
      expect(result.allowed).toBe(true); // fail-open mode
      expect(result.confidence).toBe(0);
    });

    it('should handle API errors with fallback', async () => {
      // Mock API error
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await provider.analyze('Test message', {
        ...defaultRules,
        failMode: 'allow',
      });

      expect(result.fallback).toBe(true);
      expect(result.allowed).toBe(true); // fail-open mode
    });

    it('should block on error with fail-closed mode', async () => {
      // Mock API error
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await provider.analyze('Test message', {
        ...defaultRules,
        failMode: 'block',
      });

      expect(result.fallback).toBe(true);
      expect(result.allowed).toBe(false); // fail-closed mode
    });
  });

  describe('healthCheck()', () => {
    it('should return true when API is healthy', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_test' }),
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
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;

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
        json: async () => ({
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

      const result = await provider.analyze('BUY NOW LIMITED TIME OFFER!!!', defaultRules);

      expect(result.allowed).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.categories).toContain('spam');
      expect(result.provider).toBe('openai');
    });

    it('should allow legitimate messages', async () => {
      // Mock successful legitimate content response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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

      const result = await provider.analyze('Hello, how are you?', defaultRules);

      expect(result.allowed).toBe(true);
      expect(result.categories).not.toContain('spam');
    });

    it('should handle timeout with fallback', async () => {
      // Mock timeout
      fetchMock.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 100);
        });
      });

      const shortTimeoutProvider = new OpenAIProvider({
        provider: 'openai',
        apiKey: 'test-api-key',
        model: 'gpt-3.5-turbo',
        timeout: 50,
      });

      const result = await shortTimeoutProvider.analyze('Test message', {
        ...defaultRules,
        failMode: 'allow',
      });

      expect(result.fallback).toBe(true);
      expect(result.allowed).toBe(true); // fail-open mode
    });
  });

  describe('healthCheck()', () => {
    it('should return true when API is healthy', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'chatcmpl-test' }),
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
