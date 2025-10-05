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
 */
function maskApiKey(key: string): string {
  const parts = key.split('_');
  if (parts.length >= 2) {
    return `${parts[0]}_${parts[1]}_****`;
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
 * Mask headers for logging
 */
function maskHeaders(headers: Headers): Record<string, string> {
  const masked: Record<string, string> = {};

  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();

    if (lowerKey === 'x-api-key' || lowerKey === 'authorization') {
      masked[key] = maskApiKey(value);
    } else if (lowerKey.includes('token') || lowerKey.includes('secret')) {
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
  const apiKey = c.get('apiKey') as string | undefined;

  // Log request start
  console.log(
    JSON.stringify({
      type: 'request',
      requestId,
      timestamp: new Date().toISOString(),
      method,
      path,
      apiKey: apiKey ? maskApiKey(apiKey) : undefined,
      headers: maskHeaders(c.req.raw.headers),
    })
  );

  // Execute request
  await next();

  // Calculate duration
  const duration = Date.now() - startTime;

  // Log request completion
  console.log(
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
