/**
 * Health Endpoint Integration Tests
 *
 * Tests health check endpoints with full middleware stack.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { Hono } from 'hono';
import health from '../../src/routes/health.js';
import { authenticate } from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { emailHandler } from '../../src/channels/email.js';
import { readJson } from '../helpers/response.js';

const PACKAGE_VERSION = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

interface PublicHealthResponse {
  status: string;
  timestamp?: string;
  version?: string;
  channels?: unknown;
}

interface DetailedHealthResponse {
  status: string;
  timestamp: string;
  version: string;
  channels: {
    email: { status: string; provider: string; configured: boolean };
  };
  checks: {
    memory: { used: number; total: number };
    uptime: number;
  };
}

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
      const body = await readJson<PublicHealthResponse>(res);
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
      const body = await readJson<PublicHealthResponse>(res);

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
      const body = await readJson<DetailedHealthResponse>(res);

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
      const body = await readJson<DetailedHealthResponse>(res);

      expect(body.channels.email).toBeDefined();
      expect(body.channels.email.status).toBe('active');
      expect(body.channels.email.provider).toBe('resend');
      expect(body.channels.email.configured).toBe(true); // RESEND_API_KEY is set in test env
    });

    it('should include memory usage', async () => {
      const req = new Request('http://localhost:3000/health/detailed', {
        headers: { 'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1' },
      });
      const res = await app.fetch(req);
      const body = await readJson<DetailedHealthResponse>(res);

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
      const body = await readJson<DetailedHealthResponse>(res);

      expect(body.checks.uptime).toBeDefined();
      expect(body.checks.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include ISO timestamp', async () => {
      const req = new Request('http://localhost:3000/health/detailed', {
        headers: { 'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1' },
      });
      const res = await app.fetch(req);
      const body = await readJson<DetailedHealthResponse>(res);

      expect(body.timestamp).toBeDefined();
      // Verify it's a valid ISO timestamp
      expect(() => new Date(body.timestamp)).not.toThrow();
    });

    it('should include version', async () => {
      const req = new Request('http://localhost:3000/health/detailed', {
        headers: { 'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1' },
      });
      const res = await app.fetch(req);
      const body = await readJson<DetailedHealthResponse>(res);

      expect(body.version).toBeDefined();
      expect(typeof body.version).toBe('string');
    });

    describe('version and provider configuration', () => {
      const savedVersion = process.env.npm_package_version;

      afterEach(() => {
        vi.restoreAllMocks();
        if (savedVersion === undefined) {
          delete process.env.npm_package_version;
        } else {
          process.env.npm_package_version = savedVersion;
        }
      });

      const fetchDetailed = async () => {
        const res = await app.fetch(
          new Request('http://localhost:3000/health/detailed', {
            headers: { 'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1' },
          })
        );
        return readJson<DetailedHealthResponse>(res);
      };

      it('should report the package.json version', async () => {
        const body = await fetchDetailed();

        expect(body.version).toBe(PACKAGE_VERSION);
      });

      it('should report the package.json version outside npm scripts (Docker runs node directly)', async () => {
        delete process.env.npm_package_version;
        const body = await fetchDetailed();

        expect(body.version).toBe(PACKAGE_VERSION);
        expect(body.version).not.toBe('0.1.0');
      });

      it('should report email as inactive and unconfigured when the channel is unavailable', async () => {
        vi.spyOn(emailHandler, 'isAvailable').mockResolvedValue(false);
        const body = await fetchDetailed();

        expect(body.channels.email.status).toBe('inactive');
        expect(body.channels.email.configured).toBe(false);
      });
    });
  });
});
