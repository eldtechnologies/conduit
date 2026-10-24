/**
 * Rate Limiting Middleware Tests
 *
 * Tests token bucket algorithm and rate limit enforcement.
 * CRITICAL: Verifies protection against API abuse.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { rateLimit, clearAllRateLimits } from '../../src/middleware/rateLimit.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { readJson, type AppVariables, type ErrorResponse } from '../helpers/response.js';

describe('Rate Limiting Middleware', () => {
  let app: Hono<{ Variables: AppVariables }>;

  beforeEach(() => {
    clearAllRateLimits();
    app = new Hono<{ Variables: AppVariables }>();
    app.onError(errorHandler);
    app.use('*', (c, next) => {
      // Simulate auth middleware setting API key
      c.set('apiKey', 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1');
      return next();
    });
    app.use('*', rateLimit);
    app.get('/test', (c) => c.json({ message: 'OK' }));
  });

  afterEach(() => {
    clearAllRateLimits();
  });

  describe('rate limit enforcement', () => {
    it('should allow requests within limit', async () => {
      // Per-minute limit is 10, so first 10 requests should succeed
      for (let i = 0; i < 10; i++) {
        const req = new Request('http://localhost:3000/test');
        const res = await app.fetch(req);
        expect(res.status).toBe(200);
      }
    });

    it('should reject requests exceeding per-minute limit', async () => {
      // Exhaust the per-minute limit (10 requests)
      for (let i = 0; i < 10; i++) {
        await app.fetch(new Request('http://localhost:3000/test'));
      }

      // 11th request should be rate limited
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      expect(res.status).toBe(429);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(body.retryAfter).toBeGreaterThan(0);
    });

    it('should return Retry-After header when rate limited', async () => {
      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        await app.fetch(new Request('http://localhost:3000/test'));
      }

      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      expect(res.status).toBe(429);
      const body = await readJson<ErrorResponse>(res);
      expect(body.retryAfter).toBeDefined();
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(body.retryAfter).toBeLessThan(60); // Should be less than 1 minute
      expect(res.headers.get('retry-after')).toBe(String(body.retryAfter));
    });
  });

  describe('rate limit headers', () => {
    it('should include rate limit headers in response', async () => {
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      expect(res.headers.get('x-ratelimit-limit-minute')).toBe('10');
      expect(res.headers.get('x-ratelimit-limit-hour')).toBe('100');
      expect(res.headers.get('x-ratelimit-limit-day')).toBe('500');
    });

    it('should show remaining requests', async () => {
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      expect(res.headers.get('x-ratelimit-remaining-minute')).toBe('9'); // 10 - 1
      expect(res.headers.get('x-ratelimit-remaining-hour')).toBe('99'); // 100 - 1
      expect(res.headers.get('x-ratelimit-remaining-day')).toBe('499'); // 500 - 1
    });

    it('should decrease remaining count with each request', async () => {
      // First request
      let res = await app.fetch(new Request('http://localhost:3000/test'));
      expect(res.headers.get('x-ratelimit-remaining-minute')).toBe('9');

      // Second request
      res = await app.fetch(new Request('http://localhost:3000/test'));
      expect(res.headers.get('x-ratelimit-remaining-minute')).toBe('8');

      // Third request
      res = await app.fetch(new Request('http://localhost:3000/test'));
      expect(res.headers.get('x-ratelimit-remaining-minute')).toBe('7');
    });
  });

  describe('token bucket refill', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should refill tokens over time', async () => {
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        expect((await app.fetch(new Request('http://localhost:3000/test'))).status).toBe(200);
      }

      // Should be rate limited; one token (60s / 10) is 6 seconds away
      let res = await app.fetch(new Request('http://localhost:3000/test'));
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('6');

      // Not yet refilled just before a full token has accrued
      vi.advanceTimersByTime(5900);
      res = await app.fetch(new Request('http://localhost:3000/test'));
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('1');

      // Allowed once a full token has accrued, then limited again
      vi.advanceTimersByTime(200);
      res = await app.fetch(new Request('http://localhost:3000/test'));
      expect(res.status).toBe(200);
      res = await app.fetch(new Request('http://localhost:3000/test'));
      expect(res.status).toBe(429);
    });
  });

  describe('multiple API keys isolation', () => {
    it('should track rate limits separately for different API keys', async () => {
      const app1 = new Hono<{ Variables: AppVariables }>();
      app1.onError(errorHandler);
      app1.use('*', (c, next) => {
        c.set('apiKey', 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1');
        return next();
      });
      app1.use('*', rateLimit);
      app1.get('/test', (c) => c.json({ message: 'OK' }));

      const app2 = new Hono<{ Variables: AppVariables }>();
      app2.onError(errorHandler);
      app2.use('*', (c, next) => {
        c.set('apiKey', 'KEY_APP2_f3e5d7c9b1a3e5f7d9c1b3a5e7f9d1c3');
        return next();
      });
      app2.use('*', rateLimit);
      app2.get('/test', (c) => c.json({ message: 'OK' }));

      // Exhaust limit for first API key
      for (let i = 0; i < 10; i++) {
        await app1.fetch(new Request('http://localhost:3000/test'));
      }

      // First API key should be rate limited
      let res = await app1.fetch(new Request('http://localhost:3000/test'));
      expect(res.status).toBe(429);

      // Second API key should still work
      res = await app2.fetch(new Request('http://localhost:3000/test'));
      expect(res.status).toBe(200);
    });
  });

  describe('no API key', () => {
    it('should skip rate limiting if no API key is set', async () => {
      const app = new Hono();
      app.onError(errorHandler);
      app.use('*', rateLimit); // No auth middleware, so no API key
      app.get('/test', (c) => c.json({ message: 'OK' }));

      // Should allow request without rate limiting
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);
      expect(res.status).toBe(200);
    });
  });

  describe('per-hour and per-day limits (fake timers)', () => {
    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const hit = () => app.fetch(new Request('http://localhost:3000/test'));

    /**
     * Send a full per-minute batch every minute until a request is rejected.
     * Returns the first 429 response and the number of accepted requests.
     */
    async function sendMinuteBatchesUntilRejected(): Promise<{
      res: Response;
      accepted: number;
    }> {
      let accepted = 0;
      for (let minute = 0; minute < 24 * 60; minute++) {
        for (let i = 0; i < 10; i++) {
          const res = await hit();
          if (res.status === 429) {
            return { res, accepted };
          }
          accepted++;
        }
        vi.advanceTimersByTime(MINUTE);
      }
      throw new Error('Never rate limited');
    }

    it('should enforce the per-hour limit when the minute bucket has tokens', async () => {
      const { res, accepted } = await sendMinuteBatchesUntilRejected();

      // 100/hour capacity plus ~1.67 tokens/minute of refill over ~12 minutes
      expect(accepted).toBeGreaterThanOrEqual(100);
      expect(accepted).toBeLessThan(130);
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).not.toBeNull();
      const body = await readJson<ErrorResponse>(res);
      expect(body.error).toContain('per-hour');
      // Hour bucket refills 1 token every 36s
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(body.retryAfter).toBeLessThanOrEqual(36);
    });

    it('should enforce the per-day limit when minute and hour buckets have tokens', async () => {
      let accepted = 0;
      let rejected: Response | undefined;

      // Each hour: up to 100 requests spread over 10 minutes, then wait out the hour
      for (let hour = 0; hour < 24 && !rejected; hour++) {
        for (let minute = 0; minute < 10 && !rejected; minute++) {
          for (let i = 0; i < 10; i++) {
            const res = await hit();
            if (res.status === 429) {
              rejected = res;
              break;
            }
            accepted++;
          }
          vi.advanceTimersByTime(MINUTE);
        }
        vi.advanceTimersByTime(HOUR - 10 * MINUTE);
      }

      expect(rejected).toBeDefined();
      const body = await readJson<ErrorResponse>(rejected as Response);
      expect(body.error).toContain('per-day');
      expect(accepted).toBeGreaterThanOrEqual(500);
      // Day bucket refills 1 token every 172.8s
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(body.retryAfter).toBeLessThanOrEqual(173);
    });

    it('should not drain hour/day buckets with rejected requests', async () => {
      // Exhaust the minute bucket
      for (let i = 0; i < 10; i++) {
        expect((await hit()).status).toBe(200);
      }

      // Hammer the key with 200 requests that must all be rejected
      for (let i = 0; i < 200; i++) {
        expect((await hit()).status).toBe(429);
      }

      // After the minute bucket refills, the request succeeds and the
      // hour/day budget reflects only the 11 accepted requests
      vi.advanceTimersByTime(MINUTE);
      const res = await hit();
      expect(res.status).toBe(200);
      expect(res.headers.get('x-ratelimit-remaining-day')).toBe('489');
      expect(res.headers.get('x-ratelimit-remaining-hour')).toBe('90');
    });

    it('should report the longest wait across all depleted buckets', async () => {
      // Every 66s the minute bucket is full again (10 tokens) and the hour
      // bucket gains ~1.83. Draining the minute bucket each time drives the
      // hour bucket down until both empty on the same request.
      for (let step = 0; step < 50; step++) {
        let acceptedInStep = 0;
        let res = await hit();
        while (res.status === 200) {
          acceptedInStep++;
          res = await hit();
        }

        const body = await readJson<ErrorResponse>(res);
        if (body.error.includes('per-hour')) {
          // Minute bucket was drained too (all 10 tokens used this step), but
          // the hour bucket needs longer, so its wait is reported
          expect(acceptedInStep).toBe(10);
          expect(body.retryAfter).toBeGreaterThan(6);
          expect(res.headers.get('retry-after')).toBe(String(body.retryAfter));
          return;
        }
        expect(body.error).toContain('per-minute');
        vi.advanceTimersByTime(66 * 1000);
      }
      throw new Error('Hour bucket never became the binding limit');
    });
  });

  describe('error message', () => {
    it('should indicate which limit was exceeded', async () => {
      // Exhaust per-minute limit
      for (let i = 0; i < 10; i++) {
        await app.fetch(new Request('http://localhost:3000/test'));
      }

      const res = await app.fetch(new Request('http://localhost:3000/test'));
      const body = await readJson<ErrorResponse>(res);

      expect(body.error).toContain('per-minute');
    });
  });
});
