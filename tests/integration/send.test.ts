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
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.error).toContain('Invalid channel');
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

  describe('sender allowlist (API_KEY_*_FROM_ADDRESSES)', () => {
    // SENDER key allowlist in tests/setup.ts: noreply@example.com (default), support@example.com
    const SENDER_KEY = 'KEY_SENDER_0f1e2d3c4b5a69788796a5b4c3d2e1f0';
    const NO_ALLOWLIST_KEY = 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1';
    const originalFetch = global.fetch;
    let fetchMock: FetchMock;

    beforeEach(() => {
      fetchMock = installFetchMock();
      fetchMock.mockImplementation(() => Promise.resolve(resendSuccessResponse('email_sender')));
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    function sendRequest(apiKey: string, extra: Record<string, unknown> = {}): Promise<Response> {
      return Promise.resolve(
        app.fetch(
          new Request('http://localhost:3000/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({
              channel: 'email',
              templateId: 'contact-form',
              to: 'owner@example.com',
              data: { name: 'Jane', email: 'jane@example.com', message: 'Hello' },
              ...extra,
            }),
          })
        )
      );
    }

    function sentFrom(): unknown {
      const body = fetchMock.mock.calls[0]?.[1]?.body;
      if (typeof body !== 'string') throw new Error('Expected a JSON string request body');
      return (JSON.parse(body) as Record<string, unknown>).from;
    }

    async function expectSenderNotAllowed(res: Response): Promise<void> {
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.success).toBe(false);
      expect(body.code).toBe('SENDER_NOT_ALLOWED');
      expect(fetchMock).not.toHaveBeenCalled();
    }

    it('sends from an allowlisted address', async () => {
      const res = await sendRequest(SENDER_KEY, {
        from: { email: 'support@example.com', name: 'Support' },
      });

      expect(res.status).toBe(200);
      expect(sentFrom()).toBe('Support <support@example.com>');
    });

    it('matches the allowlist case-insensitively', async () => {
      const res = await sendRequest(SENDER_KEY, { from: { email: 'NoReply@Example.COM' } });

      expect(res.status).toBe(200);
      expect(sentFrom()).toBe('Conduit <noreply@example.com>');
    });

    it('rejects a from address outside the allowlist', async () => {
      await expectSenderNotAllowed(
        await sendRequest(SENDER_KEY, { from: { email: 'ceo@example.com', name: 'CEO' } })
      );
    });

    it('uses the first allowlisted address when from is omitted', async () => {
      const res = await sendRequest(SENDER_KEY);

      expect(res.status).toBe(200);
      expect(sentFrom()).toBe('Conduit <noreply@example.com>');
    });

    it('rejects any from for a key without an allowlist', async () => {
      await expectSenderNotAllowed(
        await sendRequest(NO_ALLOWLIST_KEY, { from: { email: 'noreply@example.com' } })
      );
    });

    it('keeps the default sender for a key without an allowlist when from is omitted', async () => {
      const res = await sendRequest(NO_ALLOWLIST_KEY);

      expect(res.status).toBe(200);
      expect(sentFrom()).toBe('Conduit <onboarding@resend.dev>');
    });

    it('ignores an apiKey field in the body (cannot borrow another key allowlist)', async () => {
      await expectSenderNotAllowed(
        await sendRequest(NO_ALLOWLIST_KEY, {
          apiKey: SENDER_KEY,
          from: { email: 'noreply@example.com' },
        })
      );
    });

    it('still accepts a single replyTo address', async () => {
      const res = await sendRequest(SENDER_KEY, { replyTo: 'jane@example.com' });

      expect(res.status).toBe(200);
      const body = fetchMock.mock.calls[0]?.[1]?.body;
      expect(JSON.parse(body as string)).toMatchObject({ reply_to: 'jane@example.com' });
    });

    it.each([['a@example.com,b@example.com'], [['a@example.com', 'b@example.com']]])(
      'rejects a replyTo that is not a single email (%j)',
      async (replyTo) => {
        const res = await sendRequest(SENDER_KEY, { replyTo });

        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
      }
    );
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
