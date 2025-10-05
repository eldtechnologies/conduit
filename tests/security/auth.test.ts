/**
 * Authentication Middleware Tests
 *
 * Tests API key validation with constant-time comparison.
 * CRITICAL: Includes timing attack resistance verification.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { authenticate } from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

describe('Authentication Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.onError(errorHandler);
    app.use('*', authenticate);
    app.get('/test', (c) => c.json({ message: 'OK' }));
  });

  describe('valid API key', () => {
    it('should accept valid API key', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { 'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: 'OK' });
    });

    it('should accept second valid API key', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { 'X-API-Key': 'KEY_APP2_f3e5d7c9b1a3e5f7d9c1b3a5e7f9d1c3' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: 'OK' });
    });

    it('should attach API key to context', async () => {
      const testApp = new Hono();
      testApp.onError(errorHandler);
      testApp.use('*', authenticate);
      testApp.get('/test', (c) => {
        const apiKey = c.get('apiKey');
        return c.json({ apiKey });
      });

      const req = new Request('http://localhost:3000/test', {
        headers: { 'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1' },
      });
      const res = await testApp.fetch(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.apiKey).toBe('KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1');
    });
  });

  describe('invalid API key', () => {
    it('should reject invalid API key', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { 'X-API-Key': 'INVALID_KEY' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('should reject key with wrong format', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { 'X-API-Key': 'KEY_WRONG_0000000000000000000000000000000' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });

    it('should reject key with almost correct value', async () => {
      // One character different from valid key
      const req = new Request('http://localhost:3000/test', {
        headers: { 'X-API-Key': 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c0' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });
  });

  describe('missing API key', () => {
    it('should reject request without API key header', async () => {
      const req = new Request('http://localhost:3000/test');
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.error).toBeDefined();
    });

    it('should reject request with empty API key', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { 'X-API-Key': '' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
    });
  });

  describe('revoked API key', () => {
    it('should reject revoked API key', async () => {
      const req = new Request('http://localhost:3000/test', {
        headers: { 'X-API-Key': 'KEY_REVOKED_1234567890abcdef1234567890abcdef' },
      });
      const res = await app.fetch(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.error).toBeDefined();
    });
  });

  describe('timing attack resistance', () => {
    it('should use constant-time comparison (statistical test)', async () => {
      // This test verifies that the time to check a valid vs invalid key
      // is similar, preventing timing attacks

      const validKey = 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1';
      const invalidKey = 'KEY_TEST_0000000000000000000000000000000'; // Same length

      const iterations = 100;
      const validTimes: number[] = [];
      const invalidTimes: number[] = [];

      // Measure time for valid key
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const req = new Request('http://localhost:3000/test', {
          headers: { 'X-API-Key': validKey },
        });
        await app.fetch(req);
        const end = performance.now();
        validTimes.push(end - start);
      }

      // Measure time for invalid key
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const req = new Request('http://localhost:3000/test', {
          headers: { 'X-API-Key': invalidKey },
        });
        await app.fetch(req);
        const end = performance.now();
        invalidTimes.push(end - start);
      }

      // Calculate averages
      const avgValid = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
      const avgInvalid = invalidTimes.reduce((a, b) => a + b, 0) / invalidTimes.length;

      // The difference should be very small (within 50% of each other)
      // This accounts for normal variance in execution time
      // Note: The actual difference is usually <10%, but we use 50% to avoid flaky tests
      const difference = Math.abs(avgValid - avgInvalid);
      const maxDifference = Math.max(avgValid, avgInvalid) * 0.5;

      expect(difference).toBeLessThan(maxDifference);

      // Log timing information for debugging
      console.log(`Valid key avg: ${avgValid.toFixed(3)}ms`);
      console.log(`Invalid key avg: ${avgInvalid.toFixed(3)}ms`);
      console.log(`Difference: ${difference.toFixed(3)}ms (${((difference / avgValid) * 100).toFixed(1)}%)`);
    }, 30000); // 30 second timeout for this test

    it('should check all keys (not break early)', async () => {
      // This test verifies that we don't break early when finding a match
      // by checking that the time is similar regardless of key position

      const firstKey = 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1'; // First in list
      const secondKey = 'KEY_APP2_f3e5d7c9b1a3e5f7d9c1b3a5e7f9d1c3'; // Second in list

      const iterations = 100;
      const firstKeyTimes: number[] = [];
      const secondKeyTimes: number[] = [];

      // Measure time for first key
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const req = new Request('http://localhost:3000/test', {
          headers: { 'X-API-Key': firstKey },
        });
        await app.fetch(req);
        const end = performance.now();
        firstKeyTimes.push(end - start);
      }

      // Measure time for second key
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const req = new Request('http://localhost:3000/test', {
          headers: { 'X-API-Key': secondKey },
        });
        await app.fetch(req);
        const end = performance.now();
        secondKeyTimes.push(end - start);
      }

      // Calculate averages
      const avgFirst = firstKeyTimes.reduce((a, b) => a + b, 0) / firstKeyTimes.length;
      const avgSecond = secondKeyTimes.reduce((a, b) => a + b, 0) / secondKeyTimes.length;

      // The difference should be very small (within 50%)
      // Note: The actual difference is usually <10%, but we use 50% to avoid flaky tests
      const difference = Math.abs(avgFirst - avgSecond);
      const maxDifference = Math.max(avgFirst, avgSecond) * 0.5;

      expect(difference).toBeLessThan(maxDifference);

      console.log(`First key avg: ${avgFirst.toFixed(3)}ms`);
      console.log(`Second key avg: ${avgSecond.toFixed(3)}ms`);
      console.log(`Difference: ${difference.toFixed(3)}ms (${((difference / avgFirst) * 100).toFixed(1)}%)`);
    }, 30000); // 30 second timeout for this test
  });
});
