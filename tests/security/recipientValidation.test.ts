/**
 * Recipient Validation Tests
 *
 * Tests for the recipient whitelisting feature (v1.1.0).
 * Verifies that API keys can be restricted to specific recipients/domains.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import app from '@/index.js';

describe('Recipient Validation (v1.1.0)', () => {
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
      const data = await response.json();
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
      const data = await response.json();
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
      const data = await response.json();
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
      const data = await response.json();
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
      const data = await response.json();
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
      const data = await response.json();
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
      const data = await response.json();
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
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
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
      const data = await response.json();
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
      const data = await response.json();
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
      const data = await response.json();
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
      const data = await response.json();

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
      const data = await response.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Integration with Other Middleware', () => {
    it('should respect rate limiting after whitelist check', async () => {
      // Make multiple rapid requests to trigger rate limit
      const requests = Array.from({ length: 15 }, () =>
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
              to: 'allowed@example.com',
              data: {
                name: 'Test User',
                email: 'test@example.com',
                message: 'Test message',
              },
            }),
          })
        )
      );

      const responses = await Promise.all(requests);

      // Some should succeed, some should be rate limited
      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      const rateLimitedData = await rateLimited[0].json();
      expect(rateLimitedData.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });
});
