/**
 * Health Check Routes
 *
 * Provides health status endpoints for monitoring and diagnostics.
 * - Public endpoint: minimal status for external monitoring
 * - Authenticated endpoint: detailed diagnostics for internal use
 */

import { Hono } from 'hono';
import type { HealthResponse, DetailedHealthResponse } from '../types/api.js';

const health = new Hono();

// Track server start time for uptime calculation
const startTime = Date.now();

/**
 * Public health check endpoint
 * GET /health
 *
 * Returns minimal health status for external monitoring.
 * No authentication required.
 */
health.get('/', (c) => {
  const response: HealthResponse = {
    status: 'healthy',
  };

  return c.json(response, 200);
});

/**
 * Detailed health check endpoint
 * GET /health/detailed
 *
 * Returns comprehensive diagnostics including:
 * - Channel availability
 * - Memory usage
 * - Uptime
 *
 * Requires authentication (API key).
 * Use this for internal monitoring and debugging.
 */
health.get('/detailed', (c) => {
  // Calculate memory usage
  const memUsage = process.memoryUsage();
  const memoryMB = {
    used: Math.round(memUsage.heapUsed / 1024 / 1024),
    total: Math.round(memUsage.heapTotal / 1024 / 1024),
  };

  // Calculate uptime
  const uptime = Math.floor((Date.now() - startTime) / 1000); // seconds

  const response: DetailedHealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    channels: {
      email: {
        status: 'inactive', // Will be 'active' once email channel is implemented
        provider: 'resend',
        configured: !!process.env.RESEND_API_KEY,
      },
      // Future channels (Phase 2+)
      // sms: { status: 'inactive', provider: 'twilio', configured: false },
      // push: { status: 'inactive', provider: 'firebase', configured: false },
      // webhook: { status: 'inactive', configured: false },
    },
    checks: {
      memory: memoryMB,
      uptime,
    },
  };

  return c.json(response, 200);
});

export default health;
