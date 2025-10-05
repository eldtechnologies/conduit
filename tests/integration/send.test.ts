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
      const body = await res.json();
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
      const body = await res.json();
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
      const body = await res.json();
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
      const body = await res.json();
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
      const body = await res.json();
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
      expect(res.status).toBe(500); // Template validation error becomes internal error
      const body = await res.json();
      expect(body.success).toBe(false);
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
      const body = await res.json();
      expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
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

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.messageId).toBeDefined();
      expect(body.channel).toBe('email');
      expect(body.timestamp).toBeDefined();
    });
  });
  */
});
