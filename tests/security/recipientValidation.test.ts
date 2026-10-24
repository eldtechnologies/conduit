/**
 * Recipient Validation Tests
 *
 * Tests for the recipient whitelisting feature (v1.1.0).
 * Verifies that API keys can be restricted to specific recipients/domains.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import app from '@/index.js';
import { clearAllRateLimits } from '@/middleware/rateLimit.js';
import { readJson, type SuccessResponse, type ErrorResponse } from '../helpers/response.js';
import { installFetchMock, resendSuccessResponse, type FetchMock } from '../helpers/fetch.js';

describe('Recipient Validation (v1.1.0)', () => {
  // Resend SDK invokes global `fetch` under the hood (see node_modules/resend/dist/index.mjs).
  // Mocking it here lets these tests exercise the full middleware stack end-to-end
  // through `app.fetch(...)` without ever reaching the real Resend API with a fake key.
  const originalFetch = global.fetch;
  let fetchMock: FetchMock;

  beforeEach(() => {
    // The app keeps rate-limit state at module level; start every test with full buckets
    clearAllRateLimits();
    fetchMock = installFetchMock();
    fetchMock.mockImplementation(() => Promise.resolve(resendSuccessResponse('mock-msg-id')));
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  /**
   * NOTE: These tests assume the following environment configuration:
   *
   * API_KEY_TEST_WHITELIST=KEY_TEST_WHITELIST_abc123
   * API_KEY_TEST_WHITELIST_RECIPIENTS=allowed@example.com,admin@example.com
   * API_KEY_TEST_WHITELIST_RECIPIENT_DOMAINS=trusted.com
   *
   * API_KEY_TEST_NO_WHITELIST=KEY_TEST_NO_WHITELIST_xyz789
   * (No whitelist configured - should allow all recipients)
   */

  const WHITELISTED_KEY = process.env.API_KEY_TEST_WHITELIST!;
  const NO_WHITELIST_KEY = process.env.API_KEY_TEST_NO_WHITELIST!;

  beforeAll(() => {
    // Verify test environment is configured correctly
    if (!WHITELISTED_KEY) {
      throw new Error('API_KEY_TEST_WHITELIST not configured for tests');
    }
    if (!NO_WHITELIST_KEY) {
      throw new Error('API_KEY_TEST_NO_WHITELIST not configured for tests');
    }
  });

  describe('Exact Email Matching', () => {
    it('should allow requests to whitelisted email addresses', async () => {
      const response = await app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': WHITELISTED_KEY,
            Origin: 'https://test.com',
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            to: 'allowed@example.com', // Exact match in whitelist
            data: {
              name: 'Test User',
              email: 'test@example.com',
              message: 'Test message',
            },
          }),
        })
      );

      expect(response.status).toBe(200);
      const data = await readJson<SuccessResponse>(response);
      expect(data.success).toBe(true);
    });

    it('should reject requests to non-whitelisted email addresses', async () => {
      const response = await app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': WHITELISTED_KEY,
            Origin: 'https://test.com',
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            to: 'notallowed@example.com', // Not in whitelist
            data: {
              name: 'Test User',
              email: 'test@example.com',
              message: 'Test message',
            },
          }),
        })
      );

      expect(response.status).toBe(403);
      const data = await readJson<ErrorResponse>(response);
      expect(data.success).toBe(false);
      expect(data.code).toBe('RECIPIENT_NOT_ALLOWED');
      expect(data.error).toContain('not allowed');
    });

    it('should handle case-insensitive email matching', async () => {
      const response = await app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': WHITELISTED_KEY,
            Origin: 'https://test.com',
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            to: 'ALLOWED@EXAMPLE.COM', // Uppercase, should still match
            data: {
              name: 'Test User',
              email: 'test@example.com',
              message: 'Test message',
            },
          }),
        })
      );

      expect(response.status).toBe(200);
      const data = await readJson<SuccessResponse>(response);
      expect(data.success).toBe(true);
    });
  });

  describe('Domain Matching', () => {
    it('should allow requests to any address in whitelisted domain', async () => {
      const response = await app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': WHITELISTED_KEY,
            Origin: 'https://test.com',
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            to: 'anyone@trusted.com', // Domain is in whitelist
            data: {
              name: 'Test User',
              email: 'test@example.com',
              message: 'Test message',
            },
          }),
        })
      );

      expect(response.status).toBe(200);
      const data = await readJson<SuccessResponse>(response);
      expect(data.success).toBe(true);
    });

    it('should reject requests to non-whitelisted domains', async () => {
      const response = await app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': WHITELISTED_KEY,
            Origin: 'https://test.com',
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            to: 'user@untrusted.com', // Domain not in whitelist
            data: {
              name: 'Test User',
              email: 'test@example.com',
              message: 'Test message',
            },
          }),
        })
      );

      expect(response.status).toBe(403);
      const data = await readJson<ErrorResponse>(response);
      expect(data.success).toBe(false);
      expect(data.code).toBe('RECIPIENT_NOT_ALLOWED');
    });

    it('should handle case-insensitive domain matching', async () => {
      const response = await app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': WHITELISTED_KEY,
            Origin: 'https://test.com',
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            to: 'user@TRUSTED.COM', // Uppercase domain
            data: {
              name: 'Test User',
              email: 'test@example.com',
              message: 'Test message',
            },
          }),
        })
      );

      expect(response.status).toBe(200);
      const data = await readJson<SuccessResponse>(response);
      expect(data.success).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('should allow all recipients when no whitelist is configured', async () => {
      const response = await app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': NO_WHITELIST_KEY,
            Origin: 'https://test.com',
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            to: 'anyone@anywhere.com', // No whitelist = allow all
            data: {
              name: 'Test User',
              email: 'test@example.com',
              message: 'Test message',
            },
          }),
        })
      );

      expect(response.status).toBe(200);
      const data = await readJson<SuccessResponse>(response);
      expect(data.success).toBe(true);
    });

    it('should allow any domain when no whitelist is configured', async () => {
      const response = await app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': NO_WHITELIST_KEY,
            Origin: 'https://test.com',
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            to: 'test@randomdomain.xyz',
            data: {
              name: 'Test User',
              email: 'test@example.com',
              message: 'Test message',
            },
          }),
        })
      );

      expect(response.status).toBe(200);
      const data = await readJson<SuccessResponse>(response);
      expect(data.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    const sendRaw = (apiKey: string, body: string) =>
      app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            Origin: 'https://test.com',
          },
          body,
        })
      );

    it.each([
      ['malformed JSON', '{bad'],
      ['an empty body', ''],
    ])('should reject %s with 400 VALIDATION_ERROR', async (_label, raw) => {
      for (const key of [WHITELISTED_KEY, NO_WHITELIST_KEY]) {
        const response = await sendRaw(key, raw);

        expect(response.status).toBe(400);
        const data = await readJson<ErrorResponse>(response);
        expect(data.code).toBe('VALIDATION_ERROR');
        expect(data.error).toBe('Invalid JSON body');
      }
    });

    it.each([
      ['null', 'null'],
      ['an array', '[]'],
      ['a string', '"hello"'],
      ['a number', '42'],
    ])('should reject a JSON body that is %s with 400', async (_label, raw) => {
      for (const key of [WHITELISTED_KEY, NO_WHITELIST_KEY]) {
        const response = await sendRaw(key, raw);

        expect(response.status).toBe(400);
        const data = await readJson<ErrorResponse>(response);
        expect(data.code).toBe('VALIDATION_ERROR');
        expect(data.error).toBe('Request body must be a JSON object');
      }
    });

    it('should reject requests with missing recipient', async () => {
      const response = await app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': WHITELISTED_KEY,
            Origin: 'https://test.com',
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            // to: missing
            data: {
              name: 'Test User',
              email: 'test@example.com',
              message: 'Test message',
            },
          }),
        })
      );

      expect(response.status).toBe(400);
      const data = await readJson<ErrorResponse>(response);
      expect(data.success).toBe(false);
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('should reject requests with invalid recipient type', async () => {
      const response = await app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': WHITELISTED_KEY,
            Origin: 'https://test.com',
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            to: 123, // Invalid type (number instead of string)
            data: {
              name: 'Test User',
              email: 'test@example.com',
              message: 'Test message',
            },
          }),
        })
      );

      expect(response.status).toBe(400);
      const data = await readJson<ErrorResponse>(response);
      expect(data.success).toBe(false);
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('should return helpful error message with hint', async () => {
      const response = await app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': WHITELISTED_KEY,
            Origin: 'https://test.com',
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            to: 'blocked@spam.com',
            data: {
              name: 'Test User',
              email: 'test@example.com',
              message: 'Test message',
            },
          }),
        })
      );

      expect(response.status).toBe(403);
      const data = await readJson<ErrorResponse & { details?: { hint?: string } }>(response);
      expect(data.success).toBe(false);
      expect(data.code).toBe('RECIPIENT_NOT_ALLOWED');
      expect(data.error).toContain('not allowed');
      expect(data.details?.hint).toBeDefined();
      expect(data.details?.hint).toContain('whitelist');
    });
  });

  describe('Security', () => {
    it('should not reveal whitelist contents in error messages', async () => {
      const response = await app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': WHITELISTED_KEY,
            Origin: 'https://test.com',
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            to: 'attacker@evil.com',
            data: {
              name: 'Test User',
              email: 'test@example.com',
              message: 'Test message',
            },
          }),
        })
      );

      expect(response.status).toBe(403);
      const data = await readJson<ErrorResponse>(response);

      // Error message should NOT reveal specific whitelisted emails or domains
      expect(data.error).not.toContain('allowed@example.com');
      expect(data.error).not.toContain('admin@example.com');
      expect(data.error).not.toContain('trusted.com');
      expect(data.error).not.toContain('example.com');
    });

    it('should require authentication before checking whitelist', async () => {
      const response = await app.fetch(
        new Request('http://localhost/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // X-API-Key: missing
            Origin: 'https://test.com',
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            to: 'allowed@example.com',
            data: {
              name: 'Test User',
              email: 'test@example.com',
              message: 'Test message',
            },
          }),
        })
      );

      // Should fail at authentication, not recipient validation
      expect(response.status).toBe(401);
      const data = await readJson<ErrorResponse>(response);
      expect(data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Integration with Other Middleware', () => {
    const sendTo = (to: string): Promise<Response> =>
      Promise.resolve(
        app.fetch(
          new Request('http://localhost/api/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': WHITELISTED_KEY,
              Origin: 'https://test.com',
            },
            body: JSON.stringify({
              channel: 'email',
              templateId: 'contact-form',
              to,
              data: {
                name: 'Test User',
                email: 'test@example.com',
                message: 'Test message',
              },
            }),
          })
        )
      );

    it('should respect rate limiting after whitelist check', async () => {
      // 15 concurrent sends to a whitelisted recipient; the per-minute limit is 10
      const responses = await Promise.all(
        Array.from({ length: 15 }, () => sendTo('allowed@example.com'))
      );

      const statuses = responses.map((r) => r.status);
      expect(statuses.filter((status) => status === 200)).toHaveLength(10);
      expect(statuses.filter((status) => status === 429)).toHaveLength(5);
      expect(fetchMock).toHaveBeenCalledTimes(10);

      const firstRateLimited = responses.find((r) => r.status === 429);
      if (!firstRateLimited) throw new Error('Expected a rate-limited response');
      const rateLimitedData = await readJson<ErrorResponse>(firstRateLimited);
      expect(rateLimitedData.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should reject non-whitelisted recipients with 403 without consuming rate-limit tokens', async () => {
      const responses = await Promise.all(
        Array.from({ length: 15 }, () => sendTo('notallowed@example.com'))
      );

      expect(responses.map((r) => r.status)).toEqual(Array<number>(15).fill(403));
      expect(fetchMock).not.toHaveBeenCalled();

      // The rejected requests left the whole per-minute budget intact
      const allowed = await sendTo('allowed@example.com');
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get('x-ratelimit-remaining-minute')).toBe('9');
    });
  });
});
