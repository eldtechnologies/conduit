/**
 * Body Size Limit Middleware Tests
 *
 * Tests the bodyLimit middleware to ensure it properly rejects
 * oversized payloads and prevents DoS attacks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../../src/index.js';
import { readJson, type ErrorResponse, type SuccessResponse } from '../helpers/response.js';
import { clearAllRateLimits } from '../../src/middleware/rateLimit.js';
import { installFetchMock, resendSuccessResponse, type FetchMock } from '../helpers/fetch.js';

interface HealthBody {
  status: string;
}

const VALID_API_KEY = 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1';
const MAX_SIZE = 50 * 1024; // 50KB
const MESSAGE_ID = 'msg_body_limit';

describe('Body Size Limit Middleware', () => {
  // Resend is mocked so accepted requests return 200 without any network call
  const originalFetch = global.fetch;
  let fetchMock: FetchMock;

  beforeEach(() => {
    clearAllRateLimits();
    fetchMock = installFetchMock();
    fetchMock.mockImplementation(() => Promise.resolve(resendSuccessResponse(MESSAGE_ID)));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Payload size validation', () => {
    it('should accept requests under 50KB', async () => {
      const smallPayload = JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'test@example.com',
        data: {
          name: 'Test User',
          email: 'test@example.com',
          message: 'Small message',
        },
      });

      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
          'Content-Length': smallPayload.length.toString(),
        },
        body: smallPayload,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      const sent = await readJson<SuccessResponse>(res);
      expect(sent.messageId).toBe(MESSAGE_ID);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should reject requests over 50KB with 413 status', async () => {
      // Create a payload larger than 50KB
      const largeMessage = 'x'.repeat(51 * 1024); // 51KB of 'x'
      const largePayload = JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'test@example.com',
        data: {
          name: 'Test User',
          email: 'test@example.com',
          message: largeMessage,
        },
      });

      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
          'Content-Length': largePayload.length.toString(),
        },
        body: largePayload,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(413);
      const body = await readJson<ErrorResponse>(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Request body too large');
      expect(body.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('should include max size and actual size in error details', async () => {
      // Create a message that's under template max (5000 chars) but over body limit
      // This won't actually work due to template validation, so we just test
      // that oversized Content-Length is rejected
      const largeSize = 55 * 1024; // 55KB
      const largeMessage = 'x'.repeat(4000); // Under template limit
      const largePayload = JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'test@example.com',
        data: {
          name: 'Test User',
          email: 'test@example.com',
          message: largeMessage,
        },
      });

      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
          'Content-Length': largeSize.toString(),
        },
        body: largePayload,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(413);
      const body = (await res.json()) as {
        error: string;
        code: string;
        details: { maxSize: number; actualSize: number };
      };
      expect(body.error).toContain('Maximum size: 50KB');
      expect(body.code).toBe('PAYLOAD_TOO_LARGE');
      expect(body.details).toBeDefined();
      expect(body.details.maxSize).toBe(MAX_SIZE);
      expect(body.details.actualSize).toBe(largeSize);
    });

    it('should allow small requests without Content-Length header', async () => {
      const payload = JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'test@example.com',
        data: {
          name: 'Test User',
          email: 'test@example.com',
          message: 'Test message',
        },
      });

      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
          // No Content-Length header
        },
        body: payload,
      });

      const res = await app.fetch(req);

      // Should not be rejected by bodyLimit middleware
      expect(res.status).toBe(200);
      const sent = await readJson<SuccessResponse>(res);
      expect(sent.messageId).toBe(MESSAGE_ID);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should reject streamed bodies over 50KB without Content-Length', async () => {
      const chunk = new TextEncoder().encode('x'.repeat(1024));
      let sent = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          // 5MB total, far beyond the limit
          if (sent >= 5 * 1024) {
            controller.close();
            return;
          }
          controller.enqueue(chunk);
          sent++;
        },
      });

      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
        },
        body: stream,
        duplex: 'half',
      });
      expect(req.headers.get('content-length')).toBeNull();

      const res = await app.fetch(req);

      expect(res.status).toBe(413);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('PAYLOAD_TOO_LARGE');
      // Reading stops once the limit is crossed
      expect(sent).toBeLessThan(5 * 1024);
    });

    it('should reject chunked bodies over 50KB even with a small Content-Length', async () => {
      const largePayload = 'x'.repeat(MAX_SIZE + 1);

      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
          'Content-Length': '10',
          'Transfer-Encoding': 'chunked',
        },
        body: largePayload,
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(413);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('should handle edge case: exactly 50KB', async () => {
      // Use Content-Length header set to exactly MAX_SIZE
      // Actual body is small, we're just testing the header check
      const payload = JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'test@example.com',
        data: {
          name: 'Test',
          email: 'test@example.com',
          message: 'Test message',
        },
      });

      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
          'Content-Length': MAX_SIZE.toString(), // Exactly at limit
        },
        body: payload,
      });

      const res = await app.fetch(req);

      // Exactly at limit should be allowed
      expect(res.status).toBe(200);
    });

    it('should handle edge case: 50KB + 1 byte', async () => {
      const size = MAX_SIZE + 1;

      // Use Content-Length header over limit by 1 byte
      const payload = JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'test@example.com',
        data: {
          name: 'Test',
          email: 'test@example.com',
          message: 'Test message',
        },
      });

      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
          'Content-Length': size.toString(), // Over limit by 1 byte
        },
        body: payload,
      });

      const res = await app.fetch(req);

      // Should be rejected by bodyLimit middleware
      expect(res.status).toBe(413);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('should handle invalid Content-Length header (non-numeric)', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
          'Content-Length': 'invalid-number',
        },
        body: '{}',
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.error).toContain('Invalid Content-Length');
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('should apply only to /api/* routes, not /health', async () => {
      // Health endpoint should not have body size limit
      const req = new Request('http://localhost:3000/health', {
        method: 'GET',
        // No body, no Content-Length
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      const body = await readJson<HealthBody>(res);
      expect(body.status).toBe('healthy');
    });
  });
});
