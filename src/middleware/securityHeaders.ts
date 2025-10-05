/**
 * Security Headers Middleware
 *
 * CRITICAL: Enforces HTTPS in production and sets comprehensive security headers.
 * This middleware MUST be applied first in the middleware chain.
 */

import type { Context, Next } from 'hono';
import { config } from '../config.js';

/**
 * Enforce HTTPS in production
 *
 * Rejects HTTP requests and adds HSTS header to force HTTPS for 1 year.
 * In development, this check is skipped to allow local HTTP testing.
 */
export async function enforceHttps(c: Context, next: Next) {
  // Only enforce HTTPS in production
  // Check process.env.NODE_ENV directly to allow dynamic testing
  if (process.env.NODE_ENV === 'production' || config.enforceHttps) {
    const proto = c.req.header('x-forwarded-proto') || 'http';

    if (proto !== 'https') {
      return c.text('HTTPS Required', 403);
    }

    // Add HSTS header (HTTP Strict Transport Security)
    // Tells browsers to only use HTTPS for 1 year, including subdomains
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  await next();
  return;
}

/**
 * Apply comprehensive security headers
 *
 * Adds multiple layers of security headers to protect against various attacks.
 * Should be applied to all routes.
 */
export async function securityHeaders(c: Context, next: Next) {
  // Prevent MIME-type sniffing
  // Forces browser to respect the Content-Type header
  c.header('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking attacks
  // Disallows embedding this site in iframes
  c.header('X-Frame-Options', 'DENY');

  // Enable browser XSS protection
  // Legacy header, but provides additional protection in older browsers
  c.header('X-XSS-Protection', '1; mode=block');

  // Control referrer information leakage
  // Only send origin when navigating to same origin
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict browser features
  // Disable geolocation, microphone, and camera access
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Content Security Policy
  // For JSON API, deny all content loading
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

  // Add HSTS in production (redundant with enforceHttps, but ensures it's set)
  // Check process.env.NODE_ENV directly to allow dynamic testing
  if (process.env.NODE_ENV === 'production' || config.enforceHttps) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  await next();
  return;
}
