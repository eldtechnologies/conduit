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
process.env.ALLOWED_ORIGINS = 'http://localhost:8080,http://localhost:3001';
process.env.RATE_LIMIT_PER_MINUTE = '10';
process.env.RATE_LIMIT_PER_HOUR = '100';
process.env.RATE_LIMIT_PER_DAY = '500';
process.env.ENFORCE_HTTPS = 'false';
