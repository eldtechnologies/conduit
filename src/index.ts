/**
 * Conduit - Multi-Channel Communication Proxy
 *
 * Main application entry point.
 * Initializes the Hono server and mounts all routes.
 */

import { Hono } from 'hono';
import { config } from './config.js';

const app = new Hono();

/**
 * Health Check Endpoint
 * GET /health
 *
 * Returns basic health status without authentication.
 * For detailed diagnostics, use /health/detailed (to be implemented in Phase 3).
 */
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
  });
});

/**
 * Start the server
 */
const port = config.port;

console.info(`🚀 Conduit starting...`);
console.info(`📝 Environment: ${config.nodeEnv}`);
console.info(`🔑 API Keys loaded: ${config.apiKeys.length}`);
console.info(`🌐 Allowed Origins: ${config.allowedOrigins.join(', ')}`);
console.info(`⚡ Server listening on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
