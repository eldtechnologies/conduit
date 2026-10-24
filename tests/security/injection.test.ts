/**
 * Security Tests - Injection Vulnerabilities
 *
 * Tests for various injection attack vectors including:
 * - Email header injection
 * - Input validation bypasses
 */

import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/index.js';
import { readJson, type ErrorResponse } from '../helpers/response.js';

const VALID_API_KEY = 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1';
// Key with a sender allowlist (a client `from` is rejected for keys without one)
const SENDER_API_KEY = 'KEY_SENDER_0f1e2d3c4b5a69788796a5b4c3d2e1f0';

describe('Email Header Injection Prevention', () => {
  beforeEach(() => {
    // Tests run with test environment variables from tests/setup.ts
  });

  describe('from.name validation', () => {
    it('should reject newline characters in from.name (\\n)', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'recipient@example.com',
          from: {
            email: 'sender@example.com',
            name: 'John Doe\nBcc: hacker@evil.com',
          },
          data: {
            name: 'Test User',
            email: 'test@example.com',
            message: 'Test message',
          },
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Name cannot contain newline characters');
    });

    it('should reject carriage return characters in from.name (\\r)', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'recipient@example.com',
          from: {
            email: 'sender@example.com',
            name: 'John Doe\rBcc: hacker@evil.com',
          },
          data: {
            name: 'Test User',
            email: 'test@example.com',
            message: 'Test message',
          },
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Name cannot contain newline characters');
    });

    it('should reject CRLF sequences in from.name (\\r\\n)', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'recipient@example.com',
          from: {
            email: 'sender@example.com',
            name: 'John Doe\r\nBcc: hacker@evil.com\r\nSubject: Phishing',
          },
          data: {
            name: 'Test User',
            email: 'test@example.com',
            message: 'Test message',
          },
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Name cannot contain newline characters');
    });

    it('should accept valid from.name without newlines', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': SENDER_API_KEY,
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'recipient@example.com',
          from: {
            email: 'noreply@example.com', // allowlisted for SENDER_API_KEY in tests/setup.ts
            name: 'John Doe',
          },
          data: {
            name: 'Test User',
            email: 'test@example.com',
            message: 'Test message',
          },
        }),
      });

      const res = await app.fetch(req);
      // May fail due to invalid RESEND_API_KEY in tests, but should pass validation
      // Either 200 (success) or 502 (provider error) is acceptable
      expect([200, 502]).toContain(res.status);
    });
  });

  describe('to field validation', () => {
    it('should reject invalid email addresses', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'not-an-email',
          data: {
            name: 'Test User',
            email: 'test@example.com',
            message: 'Test message',
          },
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Invalid recipient email address');
    });

    it('should reject malformed email addresses with special characters', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'invalid<>@@@example.com',
          data: {
            name: 'Test User',
            email: 'test@example.com',
            message: 'Test message',
          },
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Invalid recipient email address');
    });

    it('should reject email addresses exceeding 320 characters', async () => {
      // Create a very long email address (321 characters)
      const tooLongEmail = 'a'.repeat(310) + '@example.com'; // 323 chars total, exceeds limit

      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: tooLongEmail,
          data: {
            name: 'Test User',
            email: 'test@example.com',
            message: 'Test message',
          },
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await readJson<ErrorResponse>(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Email address too long');
    });

    it('should accept valid email addresses', async () => {
      const req = new Request('http://localhost:3000/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': VALID_API_KEY,
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'valid@example.com',
          data: {
            name: 'Test User',
            email: 'test@example.com',
            message: 'Test message',
          },
        }),
      });

      const res = await app.fetch(req);
      // May fail due to invalid RESEND_API_KEY in tests, but should pass validation
      // Either 200 (success) or 502 (provider error) is acceptable
      expect([200, 502]).toContain(res.status);
    });
  });
});
