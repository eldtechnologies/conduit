/**
 * Authentication Middleware
 *
 * CRITICAL: Uses constant-time comparison to prevent timing attacks.
 * Validates API keys from X-API-Key header against configured keys.
 *
 * Security measures:
 * - timingSafeEqual for constant-time comparison
 * - Always checks ALL keys (never breaks early)
 * - Validates revoked keys list
 * - Attaches API key to context for logging
 */

import type { Context, Next } from 'hono';
import { timingSafeEqual } from 'crypto';
import { config } from '../config.js';
import { AuthError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

/**
 * Authenticate API key using constant-time comparison
 *
 * SECURITY: Uses timingSafeEqual to prevent timing attacks that could
 * be used to guess valid API keys by measuring response times.
 *
 * The middleware:
 * 1. Extracts X-API-Key header
 * 2. Checks if key is revoked (constant-time)
 * 3. Validates against configured keys (constant-time)
 * 4. Always checks ALL keys to prevent timing leaks
 * 5. Attaches API key to context for logging
 */
export async function authenticate(c: Context, next: Next) {
  const apiKey = c.req.header('X-API-Key');

  if (!apiKey) {
    throw new AuthError('Missing API key', ErrorCode.UNAUTHORIZED);
  }

  // Check if key is revoked using constant-time comparison
  // SECURITY: Don't break early - check all revoked keys
  let isRevoked = false;
  for (const revokedKey of config.revokedKeys) {
    if (apiKey.length === revokedKey.length) {
      const keyBuffer = Buffer.from(apiKey);
      const revokedBuffer = Buffer.from(revokedKey);

      if (timingSafeEqual(keyBuffer, revokedBuffer)) {
        isRevoked = true;
      }
    }
  }

  if (isRevoked) {
    throw new AuthError('API key has been revoked', ErrorCode.UNAUTHORIZED);
  }

  // Validate API key using constant-time comparison
  // SECURITY: Always check ALL keys to prevent timing attacks
  let isValid = false;

  for (const validKey of config.apiKeys) {
    // Only compare if lengths match (timingSafeEqual requires same length)
    if (apiKey.length === validKey.length) {
      const keyBuffer = Buffer.from(apiKey);
      const validBuffer = Buffer.from(validKey);

      // Use constant-time comparison to prevent timing attacks
      // Don't break early - continue checking all keys
      if (timingSafeEqual(keyBuffer, validBuffer)) {
        isValid = true;
      }
    }
  }

  if (!isValid) {
    throw new AuthError('Invalid API key', ErrorCode.UNAUTHORIZED);
  }

  // Attach API key to context for logging (will be masked by logger)
  c.set('apiKey', apiKey);

  await next();
}
