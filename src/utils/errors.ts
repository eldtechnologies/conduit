/**
 * Error Handling Utilities
 *
 * Custom error classes and error sanitization for production environments.
 */

import type { ErrorResponse } from '../types/api.js';
import { ErrorCode } from '../types/api.js';

/**
 * Base class for all Conduit errors
 */
export class ConduitError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ConduitError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Authentication errors (401)
 */
export class AuthError extends ConduitError {
  constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
    super(message, code, 401, details);
    this.name = 'AuthError';
  }
}

/**
 * Authorization/Forbidden errors (403)
 */
export class ForbiddenError extends ConduitError {
  constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
    super(message, code, 403, details);
    this.name = 'ForbiddenError';
  }
}

/**
 * Validation errors (400)
 */
export class ValidationError extends ConduitError {
  constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
    super(message, code, 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Rate limiting errors (429)
 */
export class RateLimitError extends ConduitError {
  constructor(
    message: string,
    public readonly retryAfter: number, // seconds
    details?: Record<string, unknown>
  ) {
    super(message, ErrorCode.RATE_LIMIT_EXCEEDED, 429, details);
    this.name = 'RateLimitError';
  }
}

/**
 * Provider errors (502)
 */
export class ProviderError extends ConduitError {
  constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
    super(message, code, 502, details);
    this.name = 'ProviderError';
  }
}

/**
 * Service unavailable errors (503)
 */
export class ServiceUnavailableError extends ConduitError {
  constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
    super(message, code, 503, details);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Internal server errors (500)
 */
export class InternalError extends ConduitError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.INTERNAL_ERROR, 500, details);
    this.name = 'InternalError';
  }
}

/**
 * Sanitize an error for client response
 *
 * In production, hides internal error details and stack traces.
 * In development, includes full error information for debugging.
 *
 * @param error - The error to sanitize
 * @param env - Environment (production/development/test)
 * @returns Sanitized error response
 */
export function sanitizeError(error: unknown, env: string): ErrorResponse {
  // If it's a ConduitError, we know the structure
  if (error instanceof ConduitError) {
    const response: ErrorResponse = {
      success: false,
      error: error.message,
      code: error.code,
    };

    // Include details in development
    if (env !== 'production' && error.details) {
      response.details = error.details;
    }

    // Add retryAfter for rate limit errors
    if (error instanceof RateLimitError) {
      response.retryAfter = error.retryAfter;
    }

    return response;
  }

  // Unknown error - be very careful in production
  if (env === 'production') {
    return {
      success: false,
      error: 'An unexpected error occurred',
      code: ErrorCode.INTERNAL_ERROR,
    };
  }

  // Development: include error details for debugging
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    error: errorMessage,
    code: ErrorCode.INTERNAL_ERROR,
    details: {
      originalError: error instanceof Error ? error.stack : String(error),
    },
  };
}

/**
 * Create an error response object
 *
 * Helper function to quickly create ErrorResponse objects
 */
export function createErrorResponse(
  message: string,
  code: ErrorCode,
  details?: Record<string, unknown>,
  retryAfter?: number
): ErrorResponse {
  const response: ErrorResponse = {
    success: false,
    error: message,
    code,
  };

  if (details) {
    response.details = details;
  }

  if (retryAfter !== undefined) {
    response.retryAfter = retryAfter;
  }

  return response;
}
