/**
 * Test Setup
 *
 * This file is loaded before all tests run.
 * Sets up environment variables and global test configuration.
 */

import { afterEach } from 'vitest';

// Set test environment variables BEFORE any application code loads
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.LOG_LEVEL = 'silent';
process.env.RESEND_API_KEY = 're_test_key_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.API_KEY_TEST = 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1';
process.env.API_KEY_APP2 = 'KEY_APP2_f3e5d7c9b1a3e5f7d9c1b3a5e7f9d1c3';
// A configured key that is also revoked: auth must reject it as revoked, not as unknown
process.env.API_KEY_REVOKED = 'KEY_REVOKED_1234567890abcdef1234567890abcdef';
process.env.REVOKED_KEYS = 'KEY_REVOKED_1234567890abcdef1234567890abcdef';

// Recipient whitelisting test keys (v1.1.0)
process.env.API_KEY_TEST_WHITELIST = 'KEY_TEST_WHITELIST_abc123def456ghi789jkl012mno345pq';
process.env.API_KEY_TEST_WHITELIST_RECIPIENTS = 'allowed@example.com,admin@example.com';
process.env.API_KEY_TEST_WHITELIST_RECIPIENT_DOMAINS = 'trusted.com';

process.env.API_KEY_TEST_NO_WHITELIST = 'KEY_TEST_NO_WHITELIST_xyz789abc012def345ghi678jkl901mno';

// Sender allowlist test key (API_KEY_*_FROM_ADDRESSES). Mixed case and spaces on purpose:
// entries are trimmed and lowercased, and the first entry is the key's default sender.
process.env.API_KEY_SENDER = 'KEY_SENDER_0f1e2d3c4b5a69788796a5b4c3d2e1f0';
process.env.API_KEY_SENDER_FROM_ADDRESSES = 'noreply@example.com, Support@Example.com';

// LLM spam filtering test keys (v1.2.0)
process.env.LLM_PROVIDER = 'anthropic';
process.env.LLM_API_KEY = 'sk-ant-test-key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.LLM_MODEL = 'claude-haiku-4-5-20251001';
process.env.LLM_TIMEOUT = '5000';
process.env.LLM_FALLBACK_MODE = 'allow';

// API key with LLM enabled
process.env.API_KEY_LLM_TEST = 'KEY_LLM_TEST_xyz789abc012def345ghi678jkl901mno234';
process.env.API_KEY_LLM_TEST_LLM_ENABLED = 'true';
process.env.API_KEY_LLM_TEST_LLM_RULES = 'spam,abuse,profanity,promptInjection';
process.env.API_KEY_LLM_TEST_LLM_THRESHOLD = '0.7';
process.env.API_KEY_LLM_TEST_LLM_FAIL_MODE = 'allow';
process.env.API_KEY_LLM_TEST_LLM_MAX_CALLS_PER_DAY = '1000';

// API key with LLM enabled in fail-closed (block) mode
process.env.API_KEY_LLM_BLOCK = 'KEY_LLM_BLOCK_abc123def456ghi789jkl012mno345';
process.env.API_KEY_LLM_BLOCK_LLM_ENABLED = 'true';
process.env.API_KEY_LLM_BLOCK_LLM_FAIL_MODE = 'block';

// API key without LLM
process.env.API_KEY_NO_LLM = 'KEY_NO_LLM_abc123def456ghi789jkl012mno345pqr567';

// API keys for case-insensitive LLM_RULES parsing tests.
// Each uses a different casing for the categories to verify the parser
// normalizes input before matching against canonical camelCase keys.
process.env.API_KEY_LLM_CASE_LOWER = 'KEY_LLM_CASE_LOWER_abc123def456ghi789jkl012';
process.env.API_KEY_LLM_CASE_LOWER_LLM_ENABLED = 'true';
process.env.API_KEY_LLM_CASE_LOWER_LLM_RULES = 'spam,promptinjection';

process.env.API_KEY_LLM_CASE_UPPER = 'KEY_LLM_CASE_UPPER_abc123def456ghi789jkl012';
process.env.API_KEY_LLM_CASE_UPPER_LLM_ENABLED = 'true';
process.env.API_KEY_LLM_CASE_UPPER_LLM_RULES = 'SPAM,PROMPTINJECTION';

process.env.API_KEY_LLM_CASE_UNKNOWN = 'KEY_LLM_CASE_UNKNOWN_abc123def456ghi789jkl';
process.env.API_KEY_LLM_CASE_UNKNOWN_LLM_ENABLED = 'true';
process.env.API_KEY_LLM_CASE_UNKNOWN_LLM_RULES = 'spam,unknownCategory';

// API key with very low LLM budget (for budget enforcement test).
// Must be set here in setup.ts so src/config.ts picks it up at module-load time.
process.env.API_KEY_LOW_BUDGET = 'KEY_LOW_BUDGET_test123test456test789';
process.env.API_KEY_LOW_BUDGET_LLM_ENABLED = 'true';
process.env.API_KEY_LOW_BUDGET_LLM_RULES = 'spam';
process.env.API_KEY_LOW_BUDGET_LLM_MAX_CALLS_PER_DAY = '2';
process.env.API_KEY_LOW_BUDGET_LLM_FAIL_MODE = 'allow';

process.env.ALLOWED_ORIGINS = 'http://localhost:8080,http://localhost:3001,https://test.com';
process.env.RATE_LIMIT_PER_MINUTE = '10';
process.env.RATE_LIMIT_PER_HOUR = '100';
process.env.RATE_LIMIT_PER_DAY = '500';
process.env.ENFORCE_HTTPS = 'false';

/**
 * Network guard: tests must never reach real external services.
 *
 * Any fetch to a non-local host that is not intercepted by a test's own mock
 * (see tests/helpers/fetch.ts) is rejected and fails the running test, even
 * when the code under test swallows the error (e.g. a provider failure that
 * becomes a 502 response).
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const realFetch = globalThis.fetch;
const blockedRequests: string[] = [];

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

globalThis.fetch = (input, init) => {
  const url = requestUrl(input);
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // Relative or malformed URLs are left to the real fetch to reject
    return realFetch(input, init);
  }
  if (LOCAL_HOSTS.has(hostname)) {
    return realFetch(input, init);
  }
  blockedRequests.push(`${init?.method ?? 'GET'} ${url}`);
  return Promise.reject(new Error(`Unmocked fetch to external host blocked in tests: ${url}`));
};

afterEach(() => {
  if (blockedRequests.length > 0) {
    const requests = blockedRequests.splice(0).join(', ');
    throw new Error(`Test made unmocked network request(s): ${requests}. Mock fetch instead.`);
  }
});
