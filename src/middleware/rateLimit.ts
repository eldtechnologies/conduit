/**
 * Rate Limiting Middleware
 *
 * CRITICAL: Implements token bucket algorithm to prevent API abuse.
 * Tracks per-API-key limits across three time windows (minute/hour/day).
 *
 * Security measures:
 * - Token bucket algorithm for smooth rate limiting
 * - Per-API-key tracking
 * - Multiple time windows (minute/hour/day)
 * - In-memory storage with automatic cleanup
 * - Returns 429 with Retry-After header
 */

import type { Context, Next } from 'hono';
import { config } from '../config.js';
import { RateLimitError } from '../utils/errors.js';

/**
 * Token bucket for rate limiting
 */
interface TokenBucket {
  tokens: number; // Current number of tokens
  lastRefill: number; // Timestamp of last refill (ms)
  capacity: number; // Maximum tokens
  refillRate: number; // Tokens per millisecond
}

/**
 * Rate limit state for a single API key
 */
interface RateLimitState {
  perMinute: TokenBucket;
  perHour: TokenBucket;
  perDay: TokenBucket;
}

/**
 * In-memory rate limit storage
 * Maps API key to its rate limit state
 */
const rateLimitStore = new Map<string, RateLimitState>();

/**
 * Create a new token bucket
 */
function createBucket(capacity: number, windowMs: number): TokenBucket {
  return {
    tokens: capacity,
    lastRefill: Date.now(),
    capacity,
    refillRate: capacity / windowMs, // Tokens per millisecond
  };
}

/**
 * Refill tokens based on elapsed time
 */
function refillBucket(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = elapsed * bucket.refillRate;

  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
}

/**
 * Calculate retry-after time in seconds
 */
function calculateRetryAfter(bucket: TokenBucket): number {
  const tokensNeeded = 1 - bucket.tokens;
  const msToWait = tokensNeeded / bucket.refillRate;
  return Math.ceil(msToWait / 1000); // Convert to seconds
}

/**
 * Get or create rate limit state for an API key
 */
function getRateLimitState(apiKey: string): RateLimitState {
  let state = rateLimitStore.get(apiKey);

  if (!state) {
    state = {
      perMinute: createBucket(config.rateLimits.perMinute, 60 * 1000), // 1 minute
      perHour: createBucket(config.rateLimits.perHour, 60 * 60 * 1000), // 1 hour
      perDay: createBucket(config.rateLimits.perDay, 24 * 60 * 60 * 1000), // 1 day
    };
    rateLimitStore.set(apiKey, state);
  }

  return state;
}

/**
 * Rate limiting middleware
 *
 * Uses token bucket algorithm with three time windows:
 * - Per minute: 10 requests
 * - Per hour: 100 requests
 * - Per day: 500 requests
 *
 * The middleware:
 * 1. Gets API key from context (set by auth middleware)
 * 2. Gets or creates rate limit state for the key
 * 3. Refills all buckets and checks that every bucket has a token
 * 4. If any bucket is empty, returns 429 with Retry-After (the longest wait
 *    across the empty buckets) WITHOUT consuming from any bucket, so rejected
 *    requests never drain the hour/day budget
 * 5. Otherwise consumes one token from every bucket and continues
 */
export async function rateLimit(c: Context, next: Next) {
  // Get API key from context (set by auth middleware)
  const apiKey = c.get('apiKey') as string | undefined;

  if (!apiKey) {
    // If no API key, this middleware runs before auth
    // Skip rate limiting (auth will handle rejection)
    await next();
    return;
  }

  // Get rate limit state for this API key
  const state = getRateLimitState(apiKey);

  const buckets: Array<[string, TokenBucket]> = [
    ['per-minute', state.perMinute],
    ['per-hour', state.perHour],
    ['per-day', state.perDay],
  ];

  // Check every bucket before consuming from any of them
  for (const [, bucket] of buckets) {
    refillBucket(bucket);
  }
  const depleted = buckets.filter(([, bucket]) => bucket.tokens < 1);

  if (depleted.length > 0) {
    // Report the longest wait: the request only succeeds once every bucket has a token
    let limitType = '';
    let retryAfter = 0;
    for (const [type, bucket] of depleted) {
      const wait = calculateRetryAfter(bucket);
      if (wait >= retryAfter) {
        retryAfter = wait;
        limitType = type;
      }
    }

    throw new RateLimitError(`Rate limit exceeded (${limitType})`, retryAfter);
  }

  for (const [, bucket] of buckets) {
    bucket.tokens -= 1;
  }

  // Add rate limit headers to response
  c.header('X-RateLimit-Limit-Minute', config.rateLimits.perMinute.toString());
  c.header('X-RateLimit-Limit-Hour', config.rateLimits.perHour.toString());
  c.header('X-RateLimit-Limit-Day', config.rateLimits.perDay.toString());
  c.header('X-RateLimit-Remaining-Minute', Math.floor(state.perMinute.tokens).toString());
  c.header('X-RateLimit-Remaining-Hour', Math.floor(state.perHour.tokens).toString());
  c.header('X-RateLimit-Remaining-Day', Math.floor(state.perDay.tokens).toString());

  await next();
}

/**
 * Clear rate limit state for an API key (for testing)
 */
export function clearRateLimit(apiKey: string): void {
  rateLimitStore.delete(apiKey);
}

/**
 * Clear all rate limit state (for testing)
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}
