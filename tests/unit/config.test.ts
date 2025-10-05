/**
 * Configuration Tests
 *
 * Tests environment variable loading and validation.
 */

import { describe, it, expect } from 'vitest';
import { config, TIMEOUTS } from '../../src/config.js';

describe('Configuration', () => {
  describe('config object', () => {
    it('should load port from environment', () => {
      expect(config.port).toBe(3000);
      expect(typeof config.port).toBe('number');
    });

    it('should load nodeEnv from environment', () => {
      expect(config.nodeEnv).toBe('test');
      expect(['development', 'production', 'test']).toContain(config.nodeEnv);
    });

    it('should load Resend API key', () => {
      expect(config.resendApiKey).toBeDefined();
      expect(config.resendApiKey).toBe('re_test_key_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    });

    it('should load API keys array', () => {
      expect(Array.isArray(config.apiKeys)).toBe(true);
      expect(config.apiKeys.length).toBeGreaterThan(0);
      expect(config.apiKeys[0]).toBe('KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1');
    });

    it('should load allowed origins', () => {
      expect(Array.isArray(config.allowedOrigins)).toBe(true);
      expect(config.allowedOrigins.length).toBeGreaterThan(0);
      expect(config.allowedOrigins).toContain('http://localhost:8080');
    });

    it('should load rate limits', () => {
      expect(config.rateLimits).toBeDefined();
      expect(config.rateLimits.perMinute).toBe(10);
      expect(config.rateLimits.perHour).toBe(100);
      expect(config.rateLimits.perDay).toBe(500);
    });

    it('should load security settings', () => {
      expect(typeof config.enforceHttps).toBe('boolean');
      expect(config.enforceHttps).toBe(false); // Test environment
    });

    it('should load revoked keys (empty in test)', () => {
      expect(Array.isArray(config.revokedKeys)).toBe(true);
    });
  });

  describe('TIMEOUTS constants', () => {
    it('should define provider timeout', () => {
      expect(TIMEOUTS.provider).toBe(10000);
    });

    it('should define request timeout', () => {
      expect(TIMEOUTS.request).toBe(15000);
    });

    it('should define keep-alive timeout', () => {
      expect(TIMEOUTS.keepAlive).toBe(5000);
    });
  });

  describe('validation', () => {
    it('should have at least one API key configured', () => {
      expect(config.apiKeys.length).toBeGreaterThan(0);
    });

    it('should have at least one allowed origin', () => {
      expect(config.allowedOrigins.length).toBeGreaterThan(0);
    });

    it('should have valid rate limits', () => {
      expect(config.rateLimits.perMinute).toBeGreaterThan(0);
      expect(config.rateLimits.perHour).toBeGreaterThan(config.rateLimits.perMinute);
      expect(config.rateLimits.perDay).toBeGreaterThan(config.rateLimits.perHour);
    });
  });
});
