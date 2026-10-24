/**
 * Configuration Tests
 *
 * Tests environment variable loading and validation.
 */

import { describe, it, expect } from 'vitest';
import { config, loadConfig, TIMEOUTS } from '../../src/config.js';
import { generateApiKey } from '../../scripts/generate-api-key.js';

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

describe('loadConfig (API key and per-key config parsing)', () => {
  const MYSITE_KEY = 'KEY_MYSITE_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1';

  function baseEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
    return {
      NODE_ENV: 'test',
      RESEND_API_KEY: 're_test',
      ALLOWED_ORIGINS: 'http://localhost:5173',
      API_KEY_MYSITE: MYSITE_KEY,
      ...extra,
    };
  }

  describe('API key detection', () => {
    it('accepts a key produced by the generator script', () => {
      const key = generateApiKey('my_app');
      const cfg = loadConfig(baseEnv({ API_KEY_MY_APP: key }));
      expect(cfg.apiKeys).toEqual([MYSITE_KEY, key]);
    });

    it('accepts documented keys with a 12+ char alphanumeric suffix', () => {
      const cfg = loadConfig(
        baseEnv({
          API_KEY_ELDTECH: 'KEY_ELDTECH_a8f9d2c1b4e6',
          API_KEY_LOW_BUDGET: 'KEY_LOW_BUDGET_test123test456test789',
        })
      );
      expect(cfg.apiKeys).toContain('KEY_ELDTECH_a8f9d2c1b4e6');
      expect(cfg.apiKeys).toContain('KEY_LOW_BUDGET_test123test456test789');
    });

    it.each([
      ['API_KEY_MYSITE_SPAM_FILTER_ENABLED', 'true'],
      ['API_KEY_MYSITE_SPAM_FILTER_PROVIDER', 'anthropic'],
      ['API_KEY_MYSITE_SPAM_FILTER_THRESHOLD', '70'],
      ['API_KEY_MYSITE_LLM_CUSTOM_PROMPT', 'Custom prompt text'],
      ['API_KEY_SITE_RECIPIENT', 'me@example.com'],
      ['API_KEY_OTHER', 'KEY_OTHER_short'],
      ['API_KEY_OTHER', ''],
    ])('fails startup when %s is not a valid key (value %j)', (name, value) => {
      expect(() => loadConfig(baseEnv({ [name]: value }))).toThrow(name);
    });

    it('never includes the offending value in the error message', () => {
      const secret = 'Super secret custom prompt';
      let message = '';
      try {
        loadConfig(baseEnv({ API_KEY_MYSITE_LLM_CUSTOM_PROMPT: secret }));
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('API_KEY_MYSITE_LLM_CUSTOM_PROMPT');
      expect(message).not.toContain(secret);
    });

    it('fails startup on malformed API key variable names', () => {
      expect(() => loadConfig(baseEnv({ API_KEY_mysite2: MYSITE_KEY }))).toThrow(
        'API_KEY_mysite2: invalid API key variable name'
      );
      expect(() => loadConfig(baseEnv({ API_KEY_A__B: MYSITE_KEY }))).toThrow('API_KEY_A__B');
    });

    it('reports every offending variable at once', () => {
      expect(() =>
        loadConfig(baseEnv({ API_KEY_BAD_ONE: 'true', API_KEY_BAD_TWO: 'open' }))
      ).toThrow(/API_KEY_BAD_ONE[\s\S]*API_KEY_BAD_TWO/);
    });

    it('fails startup when no API keys are configured', () => {
      const env = baseEnv();
      delete env.API_KEY_MYSITE;
      expect(() => loadConfig(env)).toThrow('No API keys configured');
    });

    it('trims whitespace around key values', () => {
      const cfg = loadConfig(
        baseEnv({
          API_KEY_MYSITE: `  ${MYSITE_KEY} \t`,
          API_KEY_MYSITE_RECIPIENTS: 'a@example.com',
        })
      );
      expect(cfg.apiKeys).toEqual([MYSITE_KEY]);
      expect(cfg.recipientWhitelists.get(MYSITE_KEY)?.emails).toEqual(['a@example.com']);
    });
  });

  describe('per-key config vars', () => {
    it.each([
      'API_KEY_MYSTE_RECIPIENTS',
      'API_KEY_MYSTE_RECIPIENT_DOMAINS',
      'API_KEY_MYSTE_LLM_ENABLED',
      'API_KEY_MYSTE_LLM_FAIL_MODE',
    ])('fails startup when %s refers to an unconfigured key', (name) => {
      expect(() => loadConfig(baseEnv({ [name]: 'block' }))).toThrow(
        `${name}: configures API key "MYSTE" but API_KEY_MYSTE is not set`
      );
    });

    it('maps config vars to key names containing underscores and LLM', () => {
      const lowBudget = 'KEY_LOW_BUDGET_0123456789abcdef';
      const llmApp = 'KEY_MY_LLM_APP_0123456789abcdef';
      const cfg = loadConfig(
        baseEnv({
          API_KEY_LOW_BUDGET: lowBudget,
          API_KEY_LOW_BUDGET_LLM_MAX_CALLS_PER_DAY: '2',
          API_KEY_LOW_BUDGET_RECIPIENT_DOMAINS: 'Example.com',
          API_KEY_MY_LLM_APP: llmApp,
          API_KEY_MY_LLM_APP_LLM_ENABLED: 'TRUE',
        })
      );
      expect(cfg.apiKeys).toHaveLength(3);
      expect(cfg.llmFilterRules.get(lowBudget)?.maxCallsPerDay).toBe(2);
      expect(cfg.recipientWhitelists.get(lowBudget)?.domains).toEqual(['example.com']);
      expect(cfg.llmFilterRules.get(llmApp)?.enabled).toBe(true);
      expect(cfg.llmFilterRules.has(MYSITE_KEY)).toBe(false);
    });

    it.each(['block', 'BLOCK', ' Block '])('parses FAIL_MODE %j case-insensitively', (mode) => {
      const cfg = loadConfig(baseEnv({ API_KEY_MYSITE_LLM_FAIL_MODE: mode }));
      expect(cfg.llmFilterRules.get(MYSITE_KEY)?.failMode).toBe('block');
    });

    it('fails startup on an invalid FAIL_MODE instead of silently failing open', () => {
      expect(() => loadConfig(baseEnv({ API_KEY_MYSITE_LLM_FAIL_MODE: 'blok' }))).toThrow(
        'API_KEY_MYSITE_LLM_FAIL_MODE must be "allow" or "block"'
      );
    });

    it('defaults per-key FAIL_MODE to LLM_FALLBACK_MODE', () => {
      const cfg = loadConfig(
        baseEnv({ LLM_FALLBACK_MODE: 'block', API_KEY_MYSITE_LLM_ENABLED: 'true' })
      );
      expect(cfg.llmFilterRules.get(MYSITE_KEY)?.failMode).toBe('block');
    });

    it('lets per-key FAIL_MODE override LLM_FALLBACK_MODE', () => {
      const cfg = loadConfig(
        baseEnv({ LLM_FALLBACK_MODE: 'block', API_KEY_MYSITE_LLM_FAIL_MODE: 'allow' })
      );
      expect(cfg.llmFilterRules.get(MYSITE_KEY)?.failMode).toBe('allow');
    });

    it('defaults per-key FAIL_MODE to allow when LLM_FALLBACK_MODE is unset', () => {
      const cfg = loadConfig(baseEnv({ API_KEY_MYSITE_LLM_ENABLED: 'true' }));
      expect(cfg.llmFilterRules.get(MYSITE_KEY)?.failMode).toBe('allow');
    });

    it('fails startup when the removed LLM sender whitelist is configured', () => {
      let message = '';
      try {
        loadConfig(baseEnv({ API_KEY_MYSITE_LLM_WHITELIST_SENDERS: 'owner@example.com' }));
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('API_KEY_MYSITE_LLM_WHITELIST_SENDERS');
      expect(message).toContain('removed for security reasons');
      expect(message).toContain('spoofable');
      expect(message).not.toContain('owner@example.com');
    });

    it('fails startup for the removed sender whitelist even for an unknown key name', () => {
      expect(() =>
        loadConfig(baseEnv({ API_KEY_OTHER_LLM_WHITELIST_SENDERS: 'a@example.com' }))
      ).toThrow('API_KEY_OTHER_LLM_WHITELIST_SENDERS: the LLM sender whitelist was removed');
    });
  });

  describe('LLM_PROVIDER', () => {
    it.each(['gemini', 'ollama'])('fails startup for unimplemented provider %s', (provider) => {
      expect(() => loadConfig(baseEnv({ LLM_PROVIDER: provider }))).toThrow();
    });

    it.each(['anthropic', 'openai'] as const)('accepts provider %s', (provider) => {
      const cfg = loadConfig(
        baseEnv({ LLM_PROVIDER: provider, LLM_API_KEY: 'sk-test', LLM_MODEL: 'model' })
      );
      expect(cfg.llm?.provider).toBe(provider);
    });
  });
});
