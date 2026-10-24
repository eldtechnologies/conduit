/**
 * Authentication Middleware Tests
 *
 * Tests API key validation with constant-time comparison.
 * CRITICAL: Includes timing attack resistance verification.
 */

// Wrap crypto.timingSafeEqual in a spy (real behaviour kept) so tests can
// assert which comparisons auth performs, instead of measuring wall-clock time.
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

/** Decode a buffer passed to timingSafeEqual back into the key string. */
const asText = (view: NodeJS.ArrayBufferView) =>
  Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString();

const REVOKED_CONFIGURED_KEY = 'KEY_REVOKED_1234567890abcdef1234567890abcdef';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { timingSafeEqual } from 'crypto';
import { authenticate } from '../../src/middleware/auth.js';
import { config } from '../../src/config.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { readJson, type AppVariables, type ErrorResponse } from '../helpers/response.js';

describe('Authentication Middleware', () => {
  let app: Hono<{ Variables: AppVariables }>;

  beforeEach(() => {
    app = new Hono<{ Variables: AppVariables }>();
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
      const testApp = new Hono<{ Variables: AppVariables }>();
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
      const body = await readJson<{ apiKey: string }>(res);
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
      const body = await readJson<ErrorResponse>(res);
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
      const body = await readJson<ErrorResponse>(res);
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
    const originalRevokedKeys = [...config.revokedKeys];

    afterEach(() => {
      config.revokedKeys = [...originalRevokedKeys];
    });

    const requestWith = (apiKey: string) =>
      app.fetch(new Request('http://localhost:3000/test', { headers: { 'X-API-Key': apiKey } }));

    it('should reject a configured key that is revoked', async () => {
      // Precondition: the key is valid, so only revocation can reject it
      expect(config.apiKeys).toContain(REVOKED_CONFIGURED_KEY);
      expect(config.revokedKeys).toContain(REVOKED_CONFIGURED_KEY);

      const res = await requestWith(REVOKED_CONFIGURED_KEY);

      expect(res.status).toBe(401);
      const body = await readJson<ErrorResponse>(res);
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.error).toBe('API key has been revoked');
    });

    it('should accept the same key once it is no longer revoked', async () => {
      config.revokedKeys = [];

      const res = await requestWith(REVOKED_CONFIGURED_KEY);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: 'OK' });
    });

    it('should not reject other keys because of the revoked list', async () => {
      const res = await requestWith('KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1');

      expect(res.status).toBe(200);
    });
  });

  describe('timing attack resistance', () => {
    const timingSafeEqualSpy = vi.mocked(timingSafeEqual);

    beforeEach(() => {
      timingSafeEqualSpy.mockClear();
    });

    /** Strings passed as the second (reference) argument of each comparison. */
    const comparedAgainst = () =>
      timingSafeEqualSpy.mock.calls.map(([, reference]) => asText(reference));

    const sameLengthKeys = (apiKey: string) => [
      ...config.revokedKeys.filter((key) => key.length === apiKey.length),
      ...config.apiKeys.filter((key) => key.length === apiKey.length),
    ];

    const requestWith = (apiKey: string) =>
      app.fetch(new Request('http://localhost:3000/test', { headers: { 'X-API-Key': apiKey } }));

    it('should compare a matching first key against every same-length key (no early break)', async () => {
      const firstKey = config.apiKeys[0];
      if (!firstKey) throw new Error('No API keys configured');
      const expected = sameLengthKeys(firstKey);
      // Needs other same-length keys after the match, or an early break is undetectable
      expect(config.apiKeys.filter((key) => key.length === firstKey.length).length).toBeGreaterThan(
        1
      );

      const res = await requestWith(firstKey);

      expect(res.status).toBe(200);
      expect(comparedAgainst()).toEqual(expected);
    });

    it('should compare a matching last key against every same-length key', async () => {
      const lastKey = config.apiKeys[config.apiKeys.length - 1];
      if (!lastKey) throw new Error('No API keys configured');

      const res = await requestWith(lastKey);

      expect(res.status).toBe(200);
      expect(comparedAgainst()).toEqual(sameLengthKeys(lastKey));
    });

    it('should compare an invalid key against every same-length key', async () => {
      const validKey = 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1';
      const invalidKey = 'KEY_TEST_' + '0'.repeat(validKey.length - 'KEY_TEST_'.length);
      expect(invalidKey).toHaveLength(validKey.length);

      const res = await requestWith(invalidKey);

      expect(res.status).toBe(401);
      expect(comparedAgainst()).toEqual(sameLengthKeys(invalidKey));
      expect(comparedAgainst()).toContain(validKey);
    });

    it('should never use a non-constant-time comparison for configured keys', async () => {
      // Every comparison goes through timingSafeEqual with equal-length buffers
      await requestWith('KEY_APP2_f3e5d7c9b1a3e5f7d9c1b3a5e7f9d1c3');

      expect(timingSafeEqualSpy).toHaveBeenCalled();
      for (const [candidate, reference] of timingSafeEqualSpy.mock.calls) {
        expect(asText(candidate)).toBe('KEY_APP2_f3e5d7c9b1a3e5f7d9c1b3a5e7f9d1c3');
        expect(candidate.byteLength).toBe(reference.byteLength);
      }
    });
  });
});
