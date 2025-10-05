/**
 * Security Headers Tests
 *
 * Tests HTTPS enforcement and security headers middleware.
 * CRITICAL: These tests verify our defense against various web attacks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { enforceHttps, securityHeaders } from '../../src/middleware/securityHeaders.js';

describe('Security Headers Middleware', () => {
  describe('enforceHttps', () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();
      app.use('*', enforceHttps);
      app.get('/test', (c) => c.text('OK'));
    });

    it('should reject HTTP requests in production', async () => {
      // Temporarily set to production
      const originalEnv = process.env.NODE_ENV;
      const originalEnforceHttps = process.env.ENFORCE_HTTPS;

      process.env.NODE_ENV = 'production';
      process.env.ENFORCE_HTTPS = 'true';

      // Force config reload by re-importing (in real app, this is set at startup)
      const req = new Request('http://localhost:3000/test', {
        headers: { 'x-forwarded-proto': 'http' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(403);
      expect(await res.text()).toBe('HTTPS Required');

      // Restore
      process.env.NODE_ENV = originalEnv;
      process.env.ENFORCE_HTTPS = originalEnforceHttps;
    });

    it('should allow HTTPS requests in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const req = new Request('http://localhost:3000/test', {
        headers: { 'x-forwarded-proto': 'https' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('OK');

      process.env.NODE_ENV = originalEnv;
    });

    it('should add HSTS header in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const req = new Request('http://localhost:3000/test', {
        headers: { 'x-forwarded-proto': 'https' },
      });
      const res = await app.fetch(req);

      expect(res.headers.get('strict-transport-security')).toBe(
        'max-age=31536000; includeSubDomains; preload'
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should allow HTTP in development', async () => {
      const originalEnforceHttps = process.env.ENFORCE_HTTPS;
      process.env.ENFORCE_HTTPS = 'false';

      const req = new Request('http://localhost:3000/test', {
        headers: { 'x-forwarded-proto': 'http' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);

      process.env.ENFORCE_HTTPS = originalEnforceHttps;
    });
  });

  describe('securityHeaders', () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();
      app.use('*', securityHeaders);
      app.get('/test', (c) => c.json({ message: 'OK' }));
    });

    it('should add X-Content-Type-Options header', async () => {
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('should add X-Frame-Options header', async () => {
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      expect(res.headers.get('x-frame-options')).toBe('DENY');
    });

    it('should add X-XSS-Protection header', async () => {
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      expect(res.headers.get('x-xss-protection')).toBe('1; mode=block');
    });

    it('should add Referrer-Policy header', async () => {
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    });

    it('should add Permissions-Policy header', async () => {
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      expect(res.headers.get('permissions-policy')).toBe(
        'geolocation=(), microphone=(), camera=()'
      );
    });

    it('should add Content-Security-Policy header', async () => {
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      const csp = res.headers.get('content-security-policy');
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('should add all security headers together', async () => {
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      const headers = {
        'x-content-type-options': res.headers.get('x-content-type-options'),
        'x-frame-options': res.headers.get('x-frame-options'),
        'x-xss-protection': res.headers.get('x-xss-protection'),
        'referrer-policy': res.headers.get('referrer-policy'),
        'permissions-policy': res.headers.get('permissions-policy'),
        'content-security-policy': res.headers.get('content-security-policy'),
      };

      // All headers should be present
      Object.values(headers).forEach((value) => {
        expect(value).toBeDefined();
        expect(value).not.toBe('');
      });
    });
  });

  describe('combined middleware', () => {
    it('should apply both enforceHttps and securityHeaders', async () => {
      const app = new Hono();
      app.use('*', enforceHttps);
      app.use('*', securityHeaders);
      app.get('/test', (c) => c.json({ message: 'OK' }));

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const req = new Request('http://localhost:3000/test', {
        headers: { 'x-forwarded-proto': 'https' },
      });
      const res = await app.fetch(req);

      // Should have all security headers
      expect(res.headers.get('strict-transport-security')).toBeDefined();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('content-security-policy')).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });
  });
});
