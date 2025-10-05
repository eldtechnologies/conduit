/**
 * Error Handler Middleware
 *
 * Catches all errors and converts them to standardized JSON responses.
 * Sanitizes error details in production.
 */

import type { Context } from 'hono';
import { ConduitError, sanitizeError } from '../utils/errors.js';

/**
 * Global error handler
 *
 * Catches ConduitError instances and converts them to JSON responses.
 * For unknown errors, returns 500 Internal Server Error.
 */
export function errorHandler(err: Error, c: Context) {
  // Handle our custom errors
  if (err instanceof ConduitError) {
    const env = process.env.NODE_ENV || 'development';
    const sanitized = sanitizeError(err, env);
    return c.json(sanitized, err.statusCode as 400 | 401 | 429 | 500 | 502);
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
