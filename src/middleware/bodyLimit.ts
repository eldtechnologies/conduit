/**
 * Body Size Limit Middleware
 *
 * CRITICAL: Prevents DoS attacks via large request payloads.
 * Returns 413 (Payload Too Large) if the body exceeds the limit.
 *
 * Security:
 * - Protects against memory exhaustion attacks
 * - Rejects an oversized Content-Length before reading the body
 * - Counts the bytes actually read for bodies without Content-Length
 *   (chunked / streamed), so they cannot bypass the limit
 * - Configurable limit (default 50KB)
 */

import type { Context, Next } from 'hono';
import { bodyLimit as honoBodyLimit } from 'hono/body-limit';
import { PayloadTooLargeError, ValidationError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

/**
 * Maximum allowed request body size in bytes
 * 50KB is sufficient for typical API requests while preventing abuse
 */
const MAX_BODY_SIZE = 50 * 1024; // 50KB in bytes

/**
 * Hono's body limit trusts Content-Length when present (and no
 * Transfer-Encoding), and otherwise buffers the stream while counting bytes,
 * aborting as soon as the limit is passed.
 */
const enforceBodyLimit = honoBodyLimit({
  maxSize: MAX_BODY_SIZE,
  onError: (c) => {
    const details: Record<string, unknown> = { maxSize: MAX_BODY_SIZE };
    const contentLength = c.req.header('Content-Length');
    if (contentLength && !c.req.header('Transfer-Encoding')) {
      details.actualSize = parseInt(contentLength, 10);
    }

    throw new PayloadTooLargeError(
      `Request body too large. Maximum size: ${MAX_BODY_SIZE / 1024}KB`,
      details
    );
  },
});

/**
 * Body size limit middleware
 *
 * Rejects malformed Content-Length headers with 400, then enforces the
 * maximum body size on the declared length or on the bytes actually read.
 *
 * @param c - Hono context
 * @param next - Next middleware function
 * @throws ValidationError if Content-Length is not a number
 * @throws PayloadTooLargeError if the payload exceeds the limit
 */
export async function bodyLimit(c: Context, next: Next) {
  const contentLength = c.req.header('Content-Length');

  if (contentLength !== undefined && !/^\d+$/.test(contentLength.trim())) {
    throw new ValidationError('Invalid Content-Length header', ErrorCode.VALIDATION_ERROR);
  }

  await enforceBodyLimit(c, next);
}
