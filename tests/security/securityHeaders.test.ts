/**
 * Security Headers Tests
 *
 * Tests HTTPS enforcement and security headers middleware.
 * CRITICAL: These tests verify our defense against various web attacks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { enforceHttps, securityHeaders } from '../../src/middleware/securityHeaders.js';
import { config } from '../../src/config.js';

describe('Security Headers Middleware', () => {
  // The middleware reads process.env.NODE_ENV per request and config.enforceHttps
  // (loaded once at import), so tests stub the former and mutate the latter.
  // Both are restored after every test, even when an assertion fails.
  const originalEnforceHttps = config.enforceHttps;

  afterEach(() => {
    vi.unstubAllEnvs();
    config.enforceHttps = originalEnforceHttps;
  });

  describe('enforceHttps', () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();
      app.use('*', enforceHttps);
      app.get('/test', (c) => c.text('OK'));
    });

    it('should reject HTTP requests in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const req = new Request('http://localhost:3000/test', {
        headers: { 'x-forwarded-proto': 'http' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(403);
      expect(await res.text()).toBe('HTTPS Required');
    });

    it('should allow HTTPS requests in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const req = new Request('http://localhost:3000/test', {
        headers: { 'x-forwarded-proto': 'https' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('OK');
    });

    it('should add HSTS header in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const req = new Request('http://localhost:3000/test', {
        headers: { 'x-forwarded-proto': 'https' },
      });
      const res = await app.fetch(req);

      expect(res.headers.get('strict-transport-security')).toBe(
        'max-age=31536000; includeSubDomains; preload'
      );
    });

    it('should allow HTTP in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      config.enforceHttps = false;

      const req = new Request('http://localhost:3000/test', {
        headers: { 'x-forwarded-proto': 'http' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('strict-transport-security')).toBeNull();
    });

    it('should reject HTTP outside production when ENFORCE_HTTPS is enabled', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      config.enforceHttps = true;

      const res = await app.fetch(
        new Request('http://localhost:3000/test', { headers: { 'x-forwarded-proto': 'http' } })
      );

      expect(res.status).toBe(403);
      expect(await res.text()).toBe('HTTPS Required');
    });

    it('should add HSTS outside production when ENFORCE_HTTPS is enabled', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      config.enforceHttps = true;

      const res = await app.fetch(
        new Request('http://localhost:3000/test', { headers: { 'x-forwarded-proto': 'https' } })
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('strict-transport-security')).toBe(
        'max-age=31536000; includeSubDomains; preload'
      );
    });
  });

  describe('enforceHttps health exemption', () => {
    let app: Hono;

    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
      app = new Hono();
      app.use('*', enforceHttps);
      app.get('/health', (c) => c.text('OK'));
      app.get('/health/detailed', (c) => c.text('OK'));
      app.get('/healthz', (c) => c.text('OK'));
    });

    const overHttp = (path: string) =>
      app.fetch(
        new Request(`http://localhost:3000${path}`, { headers: { 'x-forwarded-proto': 'http' } })
      );

    it('should allow plain HTTP for the public /health endpoint', async () => {
      const res = await overHttp('/health');

      expect(res.status).toBe(200);
    });

    it('should require HTTPS for /health/detailed (authenticated)', async () => {
      const res = await overHttp('/health/detailed');

      expect(res.status).toBe(403);
      expect(await res.text()).toBe('HTTPS Required');
    });

    it('should not exempt other paths that merely start with /health', async () => {
      const res = await overHttp('/healthz');

      expect(res.status).toBe(403);
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

      vi.stubEnv('NODE_ENV', 'production');

      const req = new Request('http://localhost:3000/test', {
        headers: { 'x-forwarded-proto': 'https' },
      });
      const res = await app.fetch(req);

      // Should have all security headers
      expect(res.headers.get('strict-transport-security')).toBe(
        'max-age=31536000; includeSubDomains; preload'
      );
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('content-security-policy')).toBeDefined();
    });
  });
});
