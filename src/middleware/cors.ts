/**
 * CORS Protection Middleware
 *
 * CRITICAL: Validates Origin header against whitelist to prevent unauthorized cross-origin requests.
 * Handles preflight requests and sets appropriate CORS headers.
 *
 * Security measures:
 * - Strict origin validation (no wildcards)
 * - Whitelist-based approach
 * - Rejects unauthorized origins with 403
 * - Handles preflight (OPTIONS) requests
 */

import type { Context, Next } from 'hono';
import { config } from '../config.js';
import { AuthError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

/**
 * Validate CORS and set appropriate headers
 *
 * SECURITY: Uses strict origin validation. No wildcards allowed.
 * Only whitelisted origins in ALLOWED_ORIGINS can access the API.
 *
 * The middleware:
 * 1. Extracts Origin header from request
 * 2. Checks if origin is in allowed list
 * 3. Sets CORS headers for allowed origins
 * 4. Handles preflight (OPTIONS) requests
 * 5. Rejects unauthorized origins with 403
 */
export async function corsProtection(c: Context, next: Next) {
  const origin = c.req.header('Origin');

  // If no Origin header, continue (same-origin request or non-browser client)
  // Browser requests will always include Origin header for cross-origin requests
  if (!origin) {
    await next();
    return;
  }

  // Check if origin is in the allowed list
  const isAllowed = config.allowedOrigins.includes(origin);

  if (!isAllowed) {
    throw new AuthError('Origin not allowed', ErrorCode.ORIGIN_NOT_ALLOWED);
  }

  // Set CORS headers for allowed origin
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  c.header('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight requests
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: c.res.headers,
    });
  }

  await next();
  return;
}
