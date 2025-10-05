/**
 * Body Size Limit Middleware
 *
 * CRITICAL: Prevents DoS attacks via large request payloads.
 * Checks Content-Length header before parsing body.
 * Returns 413 (Payload Too Large) if exceeds limit.
 *
 * Security:
 * - Protects against memory exhaustion attacks
 * - Validates before expensive JSON parsing
 * - Configurable limit (default 50KB)
 */

import type { Context, Next } from 'hono';
import { ValidationError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

/**
 * Maximum allowed request body size in bytes
 * 50KB is sufficient for typical API requests while preventing abuse
 */
const MAX_BODY_SIZE = 50 * 1024; // 50KB in bytes

/**
 * Body size limit middleware
 *
 * Checks the Content-Length header and rejects requests that exceed
 * the maximum allowed size. This prevents DoS attacks via large payloads.
 *
 * @param c - Hono context
 * @param next - Next middleware function
 * @throws ValidationError if payload exceeds limit
 */
export async function bodyLimit(c: Context, next: Next) {
  const contentLength = c.req.header('Content-Length');

  if (contentLength) {
    const size = parseInt(contentLength, 10);

    // Check if Content-Length is a valid number
    if (isNaN(size)) {
      throw new ValidationError(
        'Invalid Content-Length header',
        ErrorCode.VALIDATION_ERROR
      );
    }

    // Check if size exceeds limit
    if (size > MAX_BODY_SIZE) {
      throw new ValidationError(
        `Request body too large. Maximum size: ${MAX_BODY_SIZE / 1024}KB, received: ${Math.round(size / 1024)}KB`,
        ErrorCode.PAYLOAD_TOO_LARGE,
        {
          maxSize: MAX_BODY_SIZE,
          actualSize: size,
        }
      );
    }
  }

  // Note: Requests without Content-Length header are allowed
  // They will be caught by JSON parser if body is too large
  await next();
  return;
}
