/**
 * Test Setup
 *
 * This file is loaded before all tests run.
 * Sets up environment variables and global test configuration.
 */

// Set test environment variables BEFORE any application code loads
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.LOG_LEVEL = 'silent';
process.env.RESEND_API_KEY = 're_test_key_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.API_KEY_TEST = 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1';
process.env.API_KEY_APP2 = 'KEY_APP2_f3e5d7c9b1a3e5f7d9c1b3a5e7f9d1c3';
process.env.REVOKED_KEYS = 'KEY_REVOKED_1234567890abcdef1234567890abcdef';

// Recipient whitelisting test keys (v1.1.0)
process.env.API_KEY_TEST_WHITELIST = 'KEY_TEST_WHITELIST_abc123def456ghi789jkl012mno345pq';
process.env.API_KEY_TEST_WHITELIST_RECIPIENTS = 'allowed@example.com,admin@example.com';
process.env.API_KEY_TEST_WHITELIST_RECIPIENT_DOMAINS = 'trusted.com';

process.env.API_KEY_TEST_NO_WHITELIST =
  'KEY_TEST_NO_WHITELIST_xyz789abc012def345ghi678jkl901mno';

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

// API key without LLM
process.env.API_KEY_NO_LLM = 'KEY_NO_LLM_abc123def456ghi789jkl012mno345pqr567';

process.env.ALLOWED_ORIGINS = 'http://localhost:8080,http://localhost:3001,https://test.com';
process.env.RATE_LIMIT_PER_MINUTE = '10';
process.env.RATE_LIMIT_PER_HOUR = '100';
process.env.RATE_LIMIT_PER_DAY = '500';
process.env.ENFORCE_HTTPS = 'false';
