/**
 * Send Endpoint Integration Tests
 *
 * Tests the complete send flow with full middleware stack.
 * Resend is mocked via global fetch, so no request leaves the process.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { authenticate } from '../../src/middleware/auth.js';
import { rateLimit, clearAllRateLimits } from '../../src/middleware/rateLimit.js';
import send from '../../src/routes/send.js';
import { readJson, type ErrorResponse, type SuccessResponse } from '../helpers/response.js';
import { installFetchMock, resendSuccessResponse, type FetchMock } from '../helpers/fetch.js';

const MESSAGE_ID = 'msg_send_test';

describe('Send Endpoint', () => {
  const originalFetch = global.fetch;
  let app: Hono;
  let fetchMock: FetchMock;

  beforeEach(() => {
    clearAllRateLimits();
    fetchMock = installFetchMock();
    fetchMock.mockImplementation(() => Promise.resolve(resendSuccessResponse(MESSAGE_ID)));
    app = new Hono();
    app.onError(errorHandler);
    app.use('/api/*', authenticate);
    app.use('/api/*', rateLimit);
    app.route('/api', send);
  });

  afterEach(() => {
    clearAllRateLimits();
    global.fetch = originalFetch;
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
      // The per-minute limit is 10: every one of those sends succeeds
      for (let i = 0; i < 10; i++) {
        const res = await app.fetch(validSendRequest());
        expect(res.status).toBe(200);
      }
      expect(fetchMock).toHaveBeenCalledTimes(10);

      // 11th request is rate limited before reaching the provider
      const res = await app.fetch(validSendRequest());
      expect(res.status).toBe(429);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(fetchMock).toHaveBeenCalledTimes(10);
    });
  });

  describe('successful send', () => {
    it('should send email through Resend and return its message ID', async () => {
      const res = await app.fetch(validSendRequest());

      expect(res.status).toBe(200);
      const body = await readJson<SuccessResponse>(res);
      expect(body.success).toBe(true);
      expect(body.messageId).toBe(MESSAGE_ID);
      expect(body.channel).toBe('email');
      expect(body.timestamp).toBeDefined();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] ?? [];
      expect(url).toBe('https://api.resend.com/emails');
      expect(init?.method).toBe('POST');
    });
  });
});

function validSendRequest(): Request {
  return new Request('http://localhost:3000/api/send', {
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
}
