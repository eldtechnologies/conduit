/**
 * Send Endpoint Integration Tests
 *
 * Tests the complete send flow with full middleware stack.
 * Note: Tests that would send actual emails are skipped to avoid
 * using real API calls. These can be enabled with a test API key.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { authenticate } from '../../src/middleware/auth.js';
import { rateLimit, clearAllRateLimits } from '../../src/middleware/rateLimit.js';
import send from '../../src/routes/send.js';
import { readJson, type ErrorResponse } from '../helpers/response.js';
import { installFetchMock, resendSuccessResponse, type FetchMock } from '../helpers/fetch.js';

describe('Send Endpoint', () => {
  let app: Hono;

  beforeEach(() => {
    clearAllRateLimits();
    app = new Hono();
    app.onError(errorHandler);
    app.use('/api/*', authenticate);
    app.use('/api/*', rateLimit);
    app.route('/api', send);
  });

  afterEach(() => {
    clearAllRateLimits();
  });

  describe('authentication', () => {
    it('should require API key', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'test@example.com',
          data: { name: 'Test', email: 'test@example.com', message: 'Hello' },
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
    });

    it('should reject invalid API key', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'INVALID_KEY',
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'test@example.com',
          data: { name: 'Test', email: 'test@example.com', message: 'Hello' },
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
    });
  });

  describe('request validation', () => {
    it('should validate required fields', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
        },
        body: JSON.stringify({}),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid channel', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
        },
        body: JSON.stringify({
          channel: 'invalid',
          templateId: 'contact-form',
          to: 'test@example.com',
          data: {},
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('INVALID_CHANNEL');
      expect(body.error).toContain('Invalid channel');
    });

    const postSend = (payload: Record<string, unknown>) =>
      app.fetch(
        new Request('http://localhost:3000/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
          },
          body: JSON.stringify(payload),
        })
      );

    it('should return INVALID_CHANNEL for an unknown channel even if other fields are invalid', async () => {
      const res = await postSend({ channel: 'fax', templateId: '', to: 'not-an-email' });

      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('INVALID_CHANNEL');
    });

    it('should return INVALID_CHANNEL for a planned but unregistered channel', async () => {
      const res = await postSend({
        channel: 'sms',
        templateId: 'contact-form',
        to: 'test@example.com',
        data: {},
      });

      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('INVALID_CHANNEL');
    });

    it('should return VALIDATION_ERROR for a missing or non-string channel', async () => {
      const base = { templateId: 'contact-form', to: 'test@example.com', data: {} };

      const missing = await readJson<ErrorResponse>(await postSend(base));
      expect(missing.code).toBe('VALIDATION_ERROR');
      expect(missing.error).toContain('channel');

      const numeric = await readJson<ErrorResponse>(await postSend({ ...base, channel: 42 }));
      expect(numeric.code).toBe('VALIDATION_ERROR');
    });

    it('should reject missing templateId', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
        },
        body: JSON.stringify({
          channel: 'email',
          to: 'test@example.com',
          data: {},
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
    });

    it('should reject missing to field', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          data: {},
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
    });

    it('should reject invalid from email', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'test@example.com',
          data: {},
          from: { email: 'invalid-email' },
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.error).toContain('Invalid from email');
    });

    it('should reject invalid replyTo email', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'test@example.com',
          data: {},
          replyTo: 'invalid-email',
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.error).toContain('Invalid reply-to email');
    });
  });

  describe('template validation', () => {
    it('should reject invalid template', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'non-existent',
          to: 'test@example.com',
          data: { name: 'Test', email: 'test@example.com', message: 'Hello' },
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('INVALID_TEMPLATE');
      expect(body.error).toContain('Template not found');
    });

    it('should validate template data', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'test@example.com',
          data: { name: 'Test' }, // Missing required fields
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.success).toBe(false);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.error).toContain('Invalid template data');
      expect(body.error).toContain('email:');
      expect(body.error).toContain('message:');
    });

    it('should report each invalid template field', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'test@example.com',
          data: { name: '', email: 'not-an-email', message: '' },
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.error).toContain('name: Name is required');
      expect(body.error).toContain('email: Invalid email address');
      expect(body.error).toContain('message: Message is required');
    });
  });

  describe('rate limiting', () => {
    it('should enforce rate limits', async () => {
      // Make 10 requests (the per-minute limit)
      for (let i = 0; i < 10; i++) {
        await app.fetch(
          new Request('http://localhost:3000/api/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
            },
            body: JSON.stringify({
              channel: 'email',
              templateId: 'contact-form',
              to: 'test@example.com',
              data: { name: 'Test', email: 'test@example.com', message: 'Hello' },
            }),
          })
        );
      }

      // 11th request should be rate limited
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'test@example.com',
          data: { name: 'Test', email: 'test@example.com', message: 'Hello' },
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(429);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Idempotency-Key header', () => {
    const originalFetch = global.fetch;
    let fetchMock: FetchMock;

    beforeEach(() => {
      fetchMock = installFetchMock();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    const sendWithKey = (apiKey: string, idempotencyKey?: string) =>
      app.fetch(
        new Request('http://localhost:3000/api/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            ...(idempotencyKey !== undefined && { 'Idempotency-Key': idempotencyKey }),
          },
          body: JSON.stringify({
            channel: 'email',
            templateId: 'contact-form',
            to: 'test@example.com',
            data: { name: 'Test', email: 'test@example.com', message: 'Hello' },
          }),
        })
      );

    const sentIdempotencyKey = (call: number): string | null => {
      const init = fetchMock.mock.calls[call]?.[1];
      return new Headers(init?.headers).get('Idempotency-Key');
    };

    it('should forward a valid key to Resend, scoped to the API key', async () => {
      fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_1'));
      fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_2'));

      const first = await sendWithKey('KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1', 'order-123');
      const second = await sendWithKey('KEY_APP2_f3e5d7c9b1a3e5f7d9c1b3a5e7f9d1c3', 'order-123');

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const firstKey = sentIdempotencyKey(0);
      const secondKey = sentIdempotencyKey(1);
      // Scoped by the public app name only; the secret part of the API key is not sent
      expect(firstKey).toBe('KEY_TEST:order-123');
      expect(secondKey).toBe('KEY_APP2:order-123');
      // Two apps using the same client key must not collide at Resend
      expect(firstKey).not.toBe(secondKey);
    });

    it('should send no Idempotency-Key when the header is absent', async () => {
      fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_1'));

      const res = await sendWithKey('KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1');

      expect(res.status).toBe(200);
      expect(sentIdempotencyKey(0)).toBeNull();
    });

    it.each([
      ['empty', ''],
      ['too long', 'a'.repeat(201)],
      ['disallowed characters', 'key with spaces'],
      ['non-ASCII', 'clé'],
    ])('should reject a %s key with 400 and not call Resend', async (_label, key) => {
      const res = await sendWithKey('KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1', key);

      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.error).toContain('Idempotency-Key');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // Note: Actual email sending test is skipped to avoid using real API calls
  // To enable, set a test RESEND_API_KEY and uncomment the test below
  /*
  describe('successful send', () => {
    it('should send email successfully', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'test@example.com',
          data: {
            name: 'John Doe',
            email: 'john@example.com',
            message: 'This is a test message from the integration test.',
          },
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);

      const body = await readJson<ErrorResponse>(res);
      expect(body.success).toBe(true);
      expect(body.messageId).toBeDefined();
      expect(body.channel).toBe('email');
      expect(body.timestamp).toBeDefined();
    });
  });
  */
});
