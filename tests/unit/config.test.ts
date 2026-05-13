/**
 * Configuration Tests
 *
 * Tests environment variable loading and validation.
 */

import { describe, it, expect } from 'vitest';
import { config, TIMEOUTS } from '../../src/config.js';

describe('Configuration', () => {
  describe('config object', () => {
    it('should load port from environment', () => {
      expect(config.port).toBe(3000);
      expect(typeof config.port).toBe('number');
    });

    it('should load nodeEnv from environment', () => {
      expect(config.nodeEnv).toBe('test');
      expect(['development', 'production', 'test']).toContain(config.nodeEnv);
    });

    it('should load Resend API key', () => {
      expect(config.resendApiKey).toBeDefined();
      expect(config.resendApiKey).toBe('re_test_key_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    });

    it('should load API keys array', () => {
      expect(Array.isArray(config.apiKeys)).toBe(true);
      expect(config.apiKeys.length).toBeGreaterThan(0);
      expect(config.apiKeys[0]).toBe('KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1');
    });

    it('should load allowed origins', () => {
      expect(Array.isArray(config.allowedOrigins)).toBe(true);
      expect(config.allowedOrigins.length).toBeGreaterThan(0);
      expect(config.allowedOrigins).toContain('http://localhost:8080');
    });

    it('should load rate limits', () => {
      expect(config.rateLimits).toBeDefined();
      expect(config.rateLimits.perMinute).toBe(10);
      expect(config.rateLimits.perHour).toBe(100);
      expect(config.rateLimits.perDay).toBe(500);
    });

    it('should load security settings', () => {
      expect(typeof config.enforceHttps).toBe('boolean');
      expect(config.enforceHttps).toBe(false); // Test environment
    });

    it('should load revoked keys (empty in test)', () => {
      expect(Array.isArray(config.revokedKeys)).toBe(true);
    });
  });

  describe('TIMEOUTS constants', () => {
    it('should define provider timeout', () => {
      expect(TIMEOUTS.provider).toBe(10000);
    });

    it('should define request timeout', () => {
      expect(TIMEOUTS.request).toBe(15000);
    });

    it('should define keep-alive timeout', () => {
      expect(TIMEOUTS.keepAlive).toBe(5000);
    });
  });

  describe('validation', () => {
    it('should have at least one API key configured', () => {
      expect(config.apiKeys.length).toBeGreaterThan(0);
    });

    it('should have at least one allowed origin', () => {
      expect(config.allowedOrigins.length).toBeGreaterThan(0);
    });

    it('should have valid rate limits', () => {
      expect(config.rateLimits.perMinute).toBeGreaterThan(0);
      expect(config.rateLimits.perHour).toBeGreaterThan(config.rateLimits.perMinute);
      expect(config.rateLimits.perDay).toBeGreaterThan(config.rateLimits.perHour);
    });
  });

  describe('LLM filter rules parsing', () => {
    it('should enable promptInjection from lowercase env value', () => {
      const apiKey = 'KEY_LLM_CASE_LOWER_abc123def456ghi789jkl012';
      const rules = config.llmFilterRules.get(apiKey);
      expect(rules).toBeDefined();
      expect(rules?.enabled).toBe(true);
      expect(rules?.categories.spam).toBe(true);
      expect(rules?.categories.promptInjection).toBe(true);
      // Categories not listed should be disabled
      expect(rules?.categories.abuse).toBe(false);
      expect(rules?.categories.phishing).toBe(false);
      expect(rules?.categories.scam).toBe(false);
    });

    it('should be case-insensitive for uppercase env values (SPAM, PROMPTINJECTION)', () => {
      const apiKey = 'KEY_LLM_CASE_UPPER_abc123def456ghi789jkl012';
      const rules = config.llmFilterRules.get(apiKey);
      expect(rules).toBeDefined();
      expect(rules?.categories.spam).toBe(true);
      expect(rules?.categories.promptInjection).toBe(true);
      expect(rules?.categories.abuse).toBe(false);
    });

    it('should preserve canonical camelCase keys on rules.categories', () => {
      // Consumers (e.g. src/llm/providers/openai.ts) read the keys directly
      // with Object.entries, so they must stay camelCase regardless of input casing.
      const apiKey = 'KEY_LLM_CASE_LOWER_abc123def456ghi789jkl012';
      const rules = config.llmFilterRules.get(apiKey);
      expect(rules).toBeDefined();
      expect(Object.keys(rules!.categories).sort()).toEqual(
        ['abuse', 'phishing', 'profanity', 'promptInjection', 'scam', 'spam'].sort()
      );
    });

    it('should ignore unknown categories without crashing', () => {
      const apiKey = 'KEY_LLM_CASE_UNKNOWN_abc123def456ghi789jkl';
      const rules = config.llmFilterRules.get(apiKey);
      expect(rules).toBeDefined();
      expect(rules?.categories.spam).toBe(true);
      // Unknown category is silently dropped, valid ones still applied
      expect(rules?.categories.promptInjection).toBe(false);
      expect(rules?.categories.abuse).toBe(false);
    });

    it('should still respect mixed-case canonical input (existing behavior)', () => {
      // The existing API_KEY_LLM_TEST uses camelCase 'promptInjection' input
      // — confirm this continues to work after the fix.
      const apiKey = 'KEY_LLM_TEST_xyz789abc012def345ghi678jkl901mno234';
      const rules = config.llmFilterRules.get(apiKey);
      expect(rules).toBeDefined();
      expect(rules?.categories.spam).toBe(true);
      expect(rules?.categories.abuse).toBe(true);
      expect(rules?.categories.profanity).toBe(true);
      expect(rules?.categories.promptInjection).toBe(true);
    });
  });
});
