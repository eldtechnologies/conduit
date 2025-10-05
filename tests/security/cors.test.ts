/**
 * CORS Protection Middleware Tests
 *
 * Tests CORS origin validation and header handling.
 * CRITICAL: Verifies protection against unauthorized cross-origin requests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { corsProtection } from '../../src/middleware/cors.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

describe('CORS Protection Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.onError(errorHandler);
    app.use('*', corsProtection);
    app.get('/test', (c) => c.json({ message: 'OK' }));
    app.post('/test', (c) => c.json({ message: 'OK' }));
  });

  describe('allowed origins', () => {
    it('should allow request from whitelisted origin', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { Origin: 'http://localhost:8080' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
    });

    it('should allow request from second whitelisted origin', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { Origin: 'http://localhost:3001' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3001');
    });

    it('should set all required CORS headers', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { Origin: 'http://localhost:8080' },
      });
      const res = await app.fetch(req);

      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
      expect(res.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
      expect(res.headers.get('access-control-allow-headers')).toBe(
        'Content-Type, X-API-Key, X-Source-Origin'
      );
      expect(res.headers.get('access-control-max-age')).toBe('86400');
    });
  });

  describe('disallowed origins', () => {
    it('should reject request from non-whitelisted origin', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { Origin: 'http://evil.com' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('ORIGIN_NOT_ALLOWED');
    });

    it('should reject request from subdomain not in whitelist', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { Origin: 'http://subdomain.localhost:8080' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });

    it('should reject request from different port', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { Origin: 'http://localhost:9999' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });

    it('should reject request with https when http is whitelisted', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { Origin: 'https://localhost:8080' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });
  });

  describe('same-origin requests', () => {
    it('should allow request without Origin header', async () => {
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
    });

    it('should not set CORS headers for same-origin request', async () => {
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });
  });

  describe('preflight requests', () => {
    it('should handle OPTIONS preflight request', async () => {
      const req = new Request('http://localhost:3000/test', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:8080' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
      expect(res.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
    });

    it('should reject preflight from disallowed origin', async () => {
      const req = new Request('http://localhost:3000/test', {
        method: 'OPTIONS',
        headers: { Origin: 'http://evil.com' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });

    it('should return empty body for preflight', async () => {
      const req = new Request('http://localhost:3000/test', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:8080' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(204);
      const text = await res.text();
      expect(text).toBe('');
    });
  });

  describe('security', () => {
    it('should not allow wildcard origin', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { Origin: '*' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });

    it('should not set wildcard in response headers', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { Origin: 'http://localhost:8080' },
      });
      const res = await app.fetch(req);

      expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
    });

    it('should be case-sensitive for origin matching', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { Origin: 'http://LOCALHOST:8080' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });
  });

  describe('X-Source-Origin fallback (proxy/gateway scenarios)', () => {
    it('should use X-Source-Origin when Origin is missing', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { 'X-Source-Origin': 'http://localhost:8080' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
    });

    it('should use X-Source-Origin when Origin is not whitelisted (proxy modified it)', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: {
          Origin: 'http://api-gateway.internal', // Proxy address (not whitelisted)
          'X-Source-Origin': 'http://localhost:8080', // Real client origin (whitelisted)
        },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
    });

    it('should prefer Origin when it is whitelisted', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: {
          Origin: 'http://localhost:8080', // Whitelisted
          'X-Source-Origin': 'http://localhost:3001', // Also whitelisted but should be ignored
        },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
    });

    it('should reject when both Origin and X-Source-Origin are not whitelisted', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: {
          Origin: 'http://evil.com',
          'X-Source-Origin': 'http://another-evil.com',
        },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('ORIGIN_NOT_ALLOWED');
    });

    it('should reject when X-Source-Origin is not whitelisted', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { 'X-Source-Origin': 'http://evil.com' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });

    it('should handle OPTIONS preflight with X-Source-Origin', async () => {
      const req = new Request('http://localhost:3000/test', {
        method: 'OPTIONS',
        headers: { 'X-Source-Origin': 'http://localhost:8080' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
      expect(res.headers.get('access-control-allow-headers')).toContain('X-Source-Origin');
    });
  });
});
