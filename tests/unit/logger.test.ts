/**
 * Logger Middleware Tests
 *
 * Tests PII masking and structured logging.
 * CRITICAL: Verifies GDPR compliance by ensuring sensitive data is masked.
 */

import { describe, it, expect } from 'vitest';
import {
  maskApiKey,
  maskEmail,
  maskPhone,
  maskSensitiveData,
  maskHeaders,
} from '../../src/middleware/logger.js';

describe('Logger Middleware', () => {
  describe('maskApiKey', () => {
    it('should mask API key preserving prefix', () => {
      const key = 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1';
      const masked = maskApiKey(key);

      expect(masked).toBe('KEY_TEST_****');
      expect(masked).not.toContain('a8f9d2c1');
    });

    it('should mask different API key formats', () => {
      expect(maskApiKey('KEY_PROD_abcd1234')).toBe('KEY_PROD_****');
      expect(maskApiKey('KEY_APP2_xyz789')).toBe('KEY_APP2_****');
    });

    it('should handle malformed API keys', () => {
      expect(maskApiKey('invalid_key')).toBe('invalid_key_****');
      expect(maskApiKey('short')).toBe('****');
    });
  });

  describe('maskEmail', () => {
    it('should mask email address', () => {
      const email = 'user@example.com';
      const masked = maskEmail(email);

      expect(masked).toBe('u***@***.com');
      expect(masked).not.toContain('user');
      expect(masked).not.toContain('example');
    });

    it('should mask different email formats', () => {
      expect(maskEmail('john.doe@company.co.uk')).toBe('j***@***.uk');
      expect(maskEmail('a@b.com')).toBe('a***@***.com');
    });

    it('should handle malformed emails', () => {
      expect(maskEmail('notanemail')).toBe('***');
      expect(maskEmail('')).toBe('***');
    });
  });

  describe('maskPhone', () => {
    it('should mask phone number showing last 4 digits', () => {
      const phone = '+12345678901';
      const masked = maskPhone(phone);

      expect(masked).toBe('***8901');
      expect(masked).not.toContain('1234567');
    });

    it('should mask different phone formats', () => {
      expect(maskPhone('555-123-4567')).toBe('***4567');
      expect(maskPhone('+1 (555) 123-4567')).toBe('***4567');
    });

    it('should handle short phone numbers', () => {
      expect(maskPhone('123')).toBe('***');
      expect(maskPhone('1234')).toBe('***');
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask password fields', () => {
      const data = {
        username: 'john',
        password: 'secret123',
        email: 'john@example.com',
      };

      const masked = maskSensitiveData(data);

      expect(masked).toEqual({
        username: 'john',
        password: '****',
        email: 'j***@***.com',
      });
    });

    it('should mask API key fields', () => {
      const data = {
        name: 'App',
        apiKey: 'KEY_TEST_abcd1234',
        api_key: 'KEY_PROD_xyz789',
      };

      const masked = maskSensitiveData(data);

      expect(masked).toEqual({
        name: 'App',
        apiKey: '****',
        api_key: '****',
      });
    });

    it('should mask email fields', () => {
      const data = {
        userEmail: 'user@example.com',
        contactEmail: 'contact@company.com',
        name: 'John',
      };

      const masked = maskSensitiveData(data);

      expect(masked).toEqual({
        userEmail: 'u***@***.com',
        contactEmail: 'c***@***.com',
        name: 'John',
      });
    });

    it('should mask phone fields', () => {
      const data = {
        phone: '+12345678901',
        phoneNumber: '555-123-4567',
        name: 'John',
      };

      const masked = maskSensitiveData(data);

      expect(masked).toEqual({
        phone: '***8901',
        phoneNumber: '***4567',
        name: 'John',
      });
    });

    it('should mask nested objects', () => {
      const data = {
        user: {
          name: 'John',
          email: 'john@example.com',
          credentials: {
            password: 'secret',
            token: 'abc123',
          },
        },
      };

      const masked = maskSensitiveData(data);

      expect(masked).toEqual({
        user: {
          name: 'John',
          email: 'j***@***.com',
          credentials: {
            password: '****',
            token: '****',
          },
        },
      });
    });

    it('should mask arrays', () => {
      const data = {
        users: [
          { name: 'Alice', email: 'alice@example.com' },
          { name: 'Bob', email: 'bob@example.com' },
        ],
      };

      const masked = maskSensitiveData(data);

      expect(masked).toEqual({
        users: [
          { name: 'Alice', email: 'a***@***.com' },
          { name: 'Bob', email: 'b***@***.com' },
        ],
      });
    });

    it('should handle null and undefined', () => {
      expect(maskSensitiveData(null)).toBe(null);
      expect(maskSensitiveData(undefined)).toBe(undefined);
    });

    it('should handle primitive values', () => {
      expect(maskSensitiveData('string')).toBe('string');
      expect(maskSensitiveData(123)).toBe(123);
      expect(maskSensitiveData(true)).toBe(true);
    });

    it('should mask all sensitive field names', () => {
      const data = {
        password: 'pass123',
        secret: 'secret123',
        token: 'token123',
        apiKey: 'key123',
        authorization: 'Bearer abc',
        creditCard: '1234-5678-9012-3456',
        ssn: '123-45-6789',
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;

      expect(masked.password).toBe('****');
      expect(masked.secret).toBe('****');
      expect(masked.token).toBe('****');
      expect(masked.apiKey).toBe('****');
      expect(masked.authorization).toBe('****');
      expect(masked.creditCard).toBe('****');
      expect(masked.ssn).toBe('****');
    });

    it('should be case-insensitive for field names', () => {
      const data = {
        PASSWORD: 'pass123',
        Secret: 'secret123',
        Token: 'token123',
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;

      expect(masked.PASSWORD).toBe('****');
      expect(masked.Secret).toBe('****');
      expect(masked.Token).toBe('****');
    });
  });

  describe('maskHeaders', () => {
    it('should mask X-API-Key header', () => {
      const headers = new Headers({
        'X-API-Key': 'KEY_TEST_abcd1234',
        'Content-Type': 'application/json',
      });

      const masked = maskHeaders(headers);

      expect(masked['x-api-key']).toBe('KEY_TEST_****');
      expect(masked['content-type']).toBe('application/json');
    });

    it('should mask Authorization header', () => {
      const headers = new Headers({
        Authorization: 'Bearer abc123def456',
        'User-Agent': 'Mozilla/5.0',
      });

      const masked = maskHeaders(headers);

      expect(masked['authorization']).toBe('****');
      expect(masked['user-agent']).toBe('Mozilla/5.0');
    });

    it('should mask headers with "token" in name', () => {
      const headers = new Headers({
        'X-Auth-Token': 'abc123',
        'X-Custom-Token': 'xyz789',
      });

      const masked = maskHeaders(headers);

      expect(masked['x-auth-token']).toBe('****');
      expect(masked['x-custom-token']).toBe('****');
    });

    it('should mask headers with "secret" in name', () => {
      const headers = new Headers({
        'X-Secret-Key': 'secret123',
      });

      const masked = maskHeaders(headers);

      expect(masked['x-secret-key']).toBe('****');
    });

    it('should not mask safe headers', () => {
      const headers = new Headers({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Test',
        Origin: 'http://localhost:8080',
      });

      const masked = maskHeaders(headers);

      expect(masked['content-type']).toBe('application/json');
      expect(masked['accept']).toBe('application/json');
      expect(masked['user-agent']).toBe('Test');
      expect(masked['origin']).toBe('http://localhost:8080');
    });
  });
});
