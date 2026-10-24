/**
 * Request Logging Middleware
 *
 * CRITICAL: Implements structured logging with PII masking for GDPR compliance.
 * Logs all requests and responses while protecting sensitive data.
 *
 * Security measures:
 * - Masks API keys, emails, phone numbers
 * - Masks sensitive field names (password, secret, token)
 * - Structured JSON logging
 * - Request ID for correlation
 * - Duration tracking
 */

import type { Context, Next } from 'hono';
import { randomUUID } from 'crypto';

/**
 * Mask an API key for logging
 * KEY_TEST_abcd1234... -> KEY_TEST_****
 *
 * Only the `KEY_<APP>` prefix of a well-formed key is kept. Anything else
 * (other formats, `Bearer ...` values) is fully masked so no secret part leaks.
 */
function maskApiKey(key: string): string {
  const parts = key.split('_');
  if (parts.length >= 3 && parts[0] === 'KEY' && parts[1]) {
    return `KEY_${parts[1]}_****`;
  }
  return '****';
}

/**
 * Mask an email address for logging
 * user@example.com -> u***@***.com
 */
function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) {
    return '***';
  }

  const [user, domain] = parts;
  const maskedUser = user && user.length > 0 ? user[0] + '***' : '***';
  const domainParts = domain?.split('.') || [];
  const maskedDomain = '***.' + (domainParts.pop() || 'com');

  return `${maskedUser}@${maskedDomain}`;
}

/**
 * Mask a phone number for logging
 * +1234567890 -> +***7890
 */
function maskPhone(phone: string): string {
  if (phone.length <= 4) {
    return '***';
  }
  return '***' + phone.slice(-4);
}

/**
 * Sensitive field names that should be masked
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'creditcard',
  'credit_card',
  'ssn',
  'passport',
]);

/**
 * Mask sensitive data in an object (recursive)
 */
function maskSensitiveData(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(maskSensitiveData);
  }

  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    // Mask sensitive fields
    if (SENSITIVE_FIELDS.has(lowerKey)) {
      masked[key] = '****';
      continue;
    }

    // Mask email-like values
    if (lowerKey.includes('email') && typeof value === 'string') {
      masked[key] = maskEmail(value);
      continue;
    }

    // Mask phone-like values
    if (lowerKey.includes('phone') && typeof value === 'string') {
      masked[key] = maskPhone(value);
      continue;
    }

    // Recursively mask nested objects
    if (typeof value === 'object') {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * Headers whose values are fully masked: session credentials and client IPs (PII)
 */
const MASKED_HEADERS = new Set([
  'cookie',
  'set-cookie',
  'x-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
  'true-client-ip',
  'forwarded',
]);

/**
 * Mask headers for logging
 */
function maskHeaders(headers: Headers): Record<string, string> {
  const masked: Record<string, string> = {};

  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();

    if (lowerKey === 'x-api-key' || lowerKey === 'authorization') {
      masked[key] = maskApiKey(value);
    } else if (
      MASKED_HEADERS.has(lowerKey) ||
      lowerKey.includes('token') ||
      lowerKey.includes('secret')
    ) {
      masked[key] = '****';
    } else {
      masked[key] = value;
    }
  });

  return masked;
}

/**
 * Request logging middleware
 *
 * Logs structured JSON with:
 * - Request ID (UUID)
 * - Request method, path, headers (masked)
 * - Response status, duration
 * - Masked sensitive data (API keys, emails, phones, passwords)
 *
 * Compatible with log aggregation tools (Datadog, CloudWatch, etc.)
 */
export async function logger(c: Context, next: Next) {
  // Skip logging in test environment unless explicitly enabled
  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_LOGGING !== 'true') {
    await next();
    return;
  }

  // Generate request ID for correlation
  const requestId = randomUUID();
  c.set('requestId', requestId);

  const startTime = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  // Log request start. The API key is not known yet (authentication runs
  // after the logger); the X-API-Key header is masked in `headers`.
  console.info(
    JSON.stringify({
      type: 'request',
      requestId,
      timestamp: new Date().toISOString(),
      method,
      path,
      headers: maskHeaders(c.req.raw.headers),
    })
  );

  // Execute request
  await next();

  // Read after next(): set by the auth middleware further down the chain
  const apiKey = c.get('apiKey') as string | undefined;

  // Calculate duration
  const duration = Date.now() - startTime;

  // Log request completion
  console.info(
    JSON.stringify({
      type: 'response',
      requestId,
      timestamp: new Date().toISOString(),
      method,
      path,
      status: c.res.status,
      duration,
      apiKey: apiKey ? maskApiKey(apiKey) : undefined,
    })
  );
}

// Export masking functions for testing
export { maskApiKey, maskEmail, maskPhone, maskSensitiveData, maskHeaders };
