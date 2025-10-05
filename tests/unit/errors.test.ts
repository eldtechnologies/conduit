/**
 * Error Handling Tests
 *
 * Tests custom error classes and error sanitization.
 */

import { describe, it, expect } from 'vitest';
import {
  ConduitError,
  AuthError,
  ValidationError,
  RateLimitError,
  ProviderError,
  InternalError,
  sanitizeError,
  createErrorResponse,
} from '../../src/utils/errors.js';
import { ErrorCode } from '../../src/types/api.js';

describe('Error Classes', () => {
  describe('ConduitError', () => {
    it('should create error with all properties', () => {
      const error = new ConduitError('Test error', ErrorCode.INTERNAL_ERROR, 500, { foo: 'bar' });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConduitError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.details).toEqual({ foo: 'bar' });
      expect(error.name).toBe('ConduitError');
    });

    it('should have stack trace', () => {
      const error = new ConduitError('Test', ErrorCode.INTERNAL_ERROR, 500);
      expect(error.stack).toBeDefined();
    });
  });

  describe('AuthError', () => {
    it('should create 401 error', () => {
      const error = new AuthError('Unauthorized', ErrorCode.UNAUTHORIZED);

      expect(error).toBeInstanceOf(ConduitError);
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.name).toBe('AuthError');
    });
  });

  describe('ValidationError', () => {
    it('should create 400 error', () => {
      const error = new ValidationError('Invalid input', ErrorCode.VALIDATION_ERROR, {
        field: 'email',
      });

      expect(error).toBeInstanceOf(ConduitError);
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.details).toEqual({ field: 'email' });
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('RateLimitError', () => {
    it('should create 429 error with retryAfter', () => {
      const error = new RateLimitError('Too many requests', 60);

      expect(error).toBeInstanceOf(ConduitError);
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(error.retryAfter).toBe(60);
      expect(error.name).toBe('RateLimitError');
    });
  });

  describe('ProviderError', () => {
    it('should create 502 error', () => {
      const error = new ProviderError('Provider failed', ErrorCode.PROVIDER_ERROR);

      expect(error).toBeInstanceOf(ConduitError);
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe(ErrorCode.PROVIDER_ERROR);
      expect(error.name).toBe('ProviderError');
    });
  });

  describe('InternalError', () => {
    it('should create 500 error', () => {
      const error = new InternalError('Something went wrong');

      expect(error).toBeInstanceOf(ConduitError);
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.name).toBe('InternalError');
    });
  });
});

describe('sanitizeError', () => {
  describe('with ConduitError', () => {
    it('should sanitize in production', () => {
      const error = new ValidationError('Invalid email', ErrorCode.VALIDATION_ERROR, {
        field: 'email',
      });
      const sanitized = sanitizeError(error, 'production');

      expect(sanitized.success).toBe(false);
      expect(sanitized.error).toBe('Invalid email');
      expect(sanitized.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(sanitized.details).toBeUndefined(); // Hidden in production
    });

    it('should include details in development', () => {
      const error = new ValidationError('Invalid email', ErrorCode.VALIDATION_ERROR, {
        field: 'email',
      });
      const sanitized = sanitizeError(error, 'development');

      expect(sanitized.success).toBe(false);
      expect(sanitized.error).toBe('Invalid email');
      expect(sanitized.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(sanitized.details).toEqual({ field: 'email' }); // Included in dev
    });

    it('should include retryAfter for RateLimitError', () => {
      const error = new RateLimitError('Too many requests', 60);
      const sanitized = sanitizeError(error, 'production');

      expect(sanitized.success).toBe(false);
      expect(sanitized.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(sanitized.retryAfter).toBe(60);
    });
  });

  describe('with unknown errors', () => {
    it('should hide details in production', () => {
      const error = new Error('Database connection failed');
      const sanitized = sanitizeError(error, 'production');

      expect(sanitized.success).toBe(false);
      expect(sanitized.error).toBe('An unexpected error occurred');
      expect(sanitized.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(sanitized.details).toBeUndefined();
    });

    it('should include stack trace in development', () => {
      const error = new Error('Database connection failed');
      const sanitized = sanitizeError(error, 'development');

      expect(sanitized.success).toBe(false);
      expect(sanitized.error).toBe('Database connection failed');
      expect(sanitized.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(sanitized.details?.originalError).toBeDefined();
    });

    it('should handle non-Error objects', () => {
      const sanitized = sanitizeError('String error', 'development');

      expect(sanitized.success).toBe(false);
      expect(sanitized.error).toBe('String error');
      expect(sanitized.code).toBe(ErrorCode.INTERNAL_ERROR);
    });
  });
});

describe('createErrorResponse', () => {
  it('should create basic error response', () => {
    const response = createErrorResponse('Not found', ErrorCode.INVALID_TEMPLATE);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Not found');
    expect(response.code).toBe(ErrorCode.INVALID_TEMPLATE);
    expect(response.details).toBeUndefined();
    expect(response.retryAfter).toBeUndefined();
  });

  it('should include details when provided', () => {
    const response = createErrorResponse('Validation failed', ErrorCode.VALIDATION_ERROR, {
      fields: ['name', 'email'],
    });

    expect(response.details).toEqual({ fields: ['name', 'email'] });
  });

  it('should include retryAfter when provided', () => {
    const response = createErrorResponse(
      'Rate limited',
      ErrorCode.RATE_LIMIT_EXCEEDED,
      undefined,
      60
    );

    expect(response.retryAfter).toBe(60);
  });
});
