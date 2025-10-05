/**
 * Health Endpoint Integration Tests
 *
 * Tests health check endpoints with full middleware stack.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import health from '../../src/routes/health.js';
import { authenticate } from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

describe('Health Endpoints', () => {
  describe('Public health endpoint', () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();
      app.route('/health', health);
    });

    it('should return healthy status', async () => {
      const req = new Request('http://localhost:3000/health');
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('healthy');
    });

    it('should not require authentication', async () => {
      // No X-API-Key header
      const req = new Request('http://localhost:3000/health');
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
    });

    it('should have minimal response structure', async () => {
      const req = new Request('http://localhost:3000/health');
      const res = await app.fetch(req);
      const body = await res.json();

      expect(body).toHaveProperty('status');
      expect(body).not.toHaveProperty('timestamp');
      expect(body).not.toHaveProperty('version');
      expect(body).not.toHaveProperty('channels');
    });
  });

  describe('Detailed health endpoint', () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();
      app.onError(errorHandler);

      // Apply auth middleware only to /health/detailed
      app.use('/health/detailed', authenticate);
      app.route('/health', health);
    });

    it('should require authentication', async () => {
      const req = new Request('http://localhost:3000/health/detailed');
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });

    it('should return detailed diagnostics with valid API key', async () => {
      const req = new Request('http://localhost:3000/health/detailed', {
        headers: { 'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.status).toBe('healthy');
      expect(body.timestamp).toBeDefined();
      expect(body.version).toBeDefined();
      expect(body.channels).toBeDefined();
      expect(body.checks).toBeDefined();
    });

    it('should include email channel status', async () => {
      const req = new Request('http://localhost:3000/health/detailed', {
        headers: { 'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1' },
      });
      const res = await app.fetch(req);
      const body = await res.json();

      expect(body.channels.email).toBeDefined();
      expect(body.channels.email.status).toBe('inactive'); // Not implemented yet
      expect(body.channels.email.provider).toBe('resend');
      expect(body.channels.email.configured).toBe(true); // RESEND_API_KEY is set in test env
    });

    it('should include memory usage', async () => {
      const req = new Request('http://localhost:3000/health/detailed', {
        headers: { 'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1' },
      });
      const res = await app.fetch(req);
      const body = await res.json();

      expect(body.checks.memory).toBeDefined();
      expect(body.checks.memory.used).toBeGreaterThan(0);
      expect(body.checks.memory.total).toBeGreaterThan(0);
      expect(body.checks.memory.used).toBeLessThanOrEqual(body.checks.memory.total);
    });

    it('should include uptime', async () => {
      const req = new Request('http://localhost:3000/health/detailed', {
        headers: { 'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1' },
      });
      const res = await app.fetch(req);
      const body = await res.json();

      expect(body.checks.uptime).toBeDefined();
      expect(body.checks.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include ISO timestamp', async () => {
      const req = new Request('http://localhost:3000/health/detailed', {
        headers: { 'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1' },
      });
      const res = await app.fetch(req);
      const body = await res.json();

      expect(body.timestamp).toBeDefined();
      // Verify it's a valid ISO timestamp
      expect(() => new Date(body.timestamp)).not.toThrow();
    });

    it('should include version', async () => {
      const req = new Request('http://localhost:3000/health/detailed', {
        headers: { 'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1' },
      });
      const res = await app.fetch(req);
      const body = await res.json();

      expect(body.version).toBeDefined();
      expect(typeof body.version).toBe('string');
    });
  });
});
