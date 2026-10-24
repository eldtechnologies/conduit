/**
 * Error Handler Middleware
 *
 * Catches all errors and converts them to standardized JSON responses.
 * Sanitizes error details in production.
 */

import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ConduitError, getRetryAfter, sanitizeError } from '../utils/errors.js';

/**
 * Global error handler
 *
 * Catches ConduitError instances and converts them to JSON responses.
 * Errors with a retry hint (429, 503) also get a Retry-After header.
 * For unknown errors, returns 500 Internal Server Error.
 */
export function errorHandler(err: Error, c: Context) {
  // Handle our custom errors
  if (err instanceof ConduitError) {
    const env = process.env.NODE_ENV || 'development';
    const sanitized = sanitizeError(err, env);
    const retryAfter = getRetryAfter(err);
    if (retryAfter !== undefined) {
      c.header('Retry-After', String(retryAfter));
    }
    return c.json(sanitized, err.statusCode as ContentfulStatusCode);
  }

  // Handle unknown errors
  console.error('Unexpected error:', err);
  return c.json(
    {
      success: false,
      code: 'INTERNAL_ERROR',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    },
    500
  );
}
