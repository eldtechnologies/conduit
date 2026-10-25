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

    it('should forward a valid key to Resend, scoped to the app name', async () => {
      fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_1'));
      fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_2'));

      const first = await sendWithKey('KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1', 'order-123');
      const second = await sendWithKey('KEY_APP2_f3e5d7c9b1a3e5f7d9c1b3a5e7f9d1c3', 'order-123');

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const firstKey = sentIdempotencyKey(0);
      const secondKey = sentIdempotencyKey(1);
      // Scoped by the API_KEY_<NAME> app name; no part of the API key value is sent
      expect(firstKey).toBe('TEST:order-123');
      expect(secondKey).toBe('APP2:order-123');
      // Two apps using the same client key must not collide at Resend
      expect(firstKey).not.toBe(secondKey);
    });

    it('should not share a namespace between keys whose values have the same KEY_<NAME> prefix', async () => {
      fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_1'));
      fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_2'));

      // API_KEY_TEST and API_KEY_TEST_ALT both hold KEY_TEST_... values
      await sendWithKey('KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1', 'order-123');
      await sendWithKey('KEY_TEST_0123456789abcdef0123456789abcdef', 'order-123');

      expect(sentIdempotencyKey(0)).toBe('TEST:order-123');
      expect(sentIdempotencyKey(1)).toBe('TEST_ALT:order-123');
    });

    it('should shorten a long app name to a unique scope within the Resend limit', async () => {
      fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_1'));
      const clientKey = 'k'.repeat(200);

      const res = await sendWithKey('KEY_LONG_9f8e7d6c5b4a39281706f5e4d3c2b1a0', clientKey);

      expect(res.status).toBe(200);
      const sent = sentIdempotencyKey(0) ?? '';
      const [scope] = sent.split(':');
      expect(scope).toMatch(/^VERY_LONG_APPLICATION_NAME_FOR_IDEMPOT-[0-9a-f]{16}$/);
      expect(scope).toHaveLength(55);
      expect(sent).toBe(`${scope}:${clientKey}`);
      expect(sent.length).toBeLessThanOrEqual(256);
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

    it('should accept unknown template data fields and leave them out of the email', async () => {
      const res = await app.fetch(
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
            data: {
              name: 'Test',
              email: 'test@example.com',
              message: 'Hello',
              phone: 'phone-5550100',
              website: 'honeypot-value',
            },
          }),
        })
      );

      expect(res.status).toBe(200);
      const sentBody = fetchMock.mock.calls[0]?.[1]?.body;
      if (typeof sentBody !== 'string') throw new Error('Expected a JSON string request body');
      expect(sentBody).toContain('Hello');
      expect(sentBody).not.toContain('phone-5550100');
      expect(sentBody).not.toContain('honeypot-value');
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
