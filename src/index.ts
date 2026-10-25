/**
 * Conduit - Multi-Channel Communication Proxy
 *
 * Main application entry point.
 * Initializes the Hono server with full middleware stack and routes.
 *
 * CRITICAL: Middleware order is important for security.
 * Do not change the order without understanding the implications.
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { log } from './utils/log.js';

// Middleware
import { errorHandler } from './middleware/errorHandler.js';
import { enforceHttps, securityHeaders } from './middleware/securityHeaders.js';
import { corsProtection } from './middleware/cors.js';
import { logger } from './middleware/logger.js';
import { authenticate } from './middleware/auth.js';
import { validateRecipient } from './middleware/recipientValidation.js';
import { rateLimit } from './middleware/rateLimit.js';
import { bodyLimit } from './middleware/bodyLimit.js';

// Routes
import health from './routes/health.js';
import send from './routes/send.js';

const app = new Hono();

/**
 * Middleware Stack
 *
 * Order is critical for security and functionality:
 * 0. Error handler - catches all errors
 * 1. Request logger - structured logging for all requests. First, so requests
 *    rejected by HTTPS enforcement or CORS (403) still get a response line.
 * 2. HTTPS enforcement - rejects plain HTTP with 403 in production
 * 3. CORS validation - reject unauthorized origins early (performance)
 * 4. Security headers - set security headers on all responses
 * 5. Body size limit - prevent DoS attacks via large payloads (/api/* only)
 * 6. Authentication - validate API keys (/api/* only)
 * 7. Recipient validation - check whitelist (/api/send only) - v1.1.0
 *    Runs before rate limiting so non-whitelisted recipients get 403
 *    without consuming the key's tokens.
 * 8. Rate limiting - token bucket per API key (/api/* only)
 *    MUST run before LLM filtering (and any other expensive work) so
 *    rate-limited requests never trigger paid LLM calls.
 * 9. LLM spam filtering - AI-powered content moderation (/api/send only) - v1.2.0
 *    Not mounted here: the send route calls filterContent() after validating the
 *    request schema and template data, so invalid requests never reach the LLM.
 */

// 0. Global error handler
app.onError(errorHandler);

// 1. Request logging - applies to ALL routes, including rejected ones
app.use('*', logger);

// 2. HTTPS enforcement - applies to ALL routes
app.use('*', enforceHttps);

// 3. CORS protection - applies to ALL routes (reject unauthorized origins early)
app.use('*', corsProtection);

// 4. Security headers - applies to ALL routes
app.use('*', securityHeaders);

/**
 * Route-specific middleware
 *
 * Body limit, authentication, and rate limiting only apply to /api/* routes.
 * Health check endpoints are public (or have their own auth).
 */

// 5. Body size limit for /api/* routes (prevent DoS)
app.use('/api/*', bodyLimit);

// 6. Authentication for /api/* routes
app.use('/api/*', authenticate);

// 7. Recipient validation for /api/send route (v1.1.0)
app.use('/api/send', validateRecipient);

// 8. Rate limiting for /api/* routes (before any LLM call)
app.use('/api/*', rateLimit);

// 9. LLM spam filtering runs inside the send route (routes/send.ts) after validation

// Auth for /health/detailed (detailed diagnostics)
app.use('/health/detailed', authenticate);

/**
 * Routes
 */

// Health check endpoints
app.route('/health', health);

// API routes - Send messages through any channel
app.route('/api', send);

/**
 * Server startup
 *
 * Only start the server if this file is being run directly (not imported for testing).
 * In test environments, the app is imported but the server should not start.
 */
const port = config.port;

// Check if this module is being run directly (not imported)
// In tests, this module is imported so we skip server startup
if (process.env.NODE_ENV !== 'test') {
  log.info(`🚀 Conduit starting...`);
  log.info(`📝 Environment: ${config.nodeEnv}`);
  log.info(`🔑 Frontends: ${config.apps.map((app) => app.name).join(', ')}`);
  log.info(`🛡️  Recipient Whitelists: ${config.recipientWhitelists.size} configured`);
  log.info(
    `🤖 LLM Filtering: ${config.llm ? `Enabled (${config.llm.provider}, ${config.llmFilterRules.size} API keys)` : 'Disabled'}`
  );
  log.info(`🌐 Allowed Origins: ${config.allowedOrigins.join(', ')}`);

  /**
   * Start the server
   */
  const server = serve({
    fetch: app.fetch,
    port,
  });

  log.info(`⚡ Server listening on port ${port}`);

  /**
   * Graceful shutdown handling
   *
   * Ensures clean shutdown on SIGTERM/SIGINT.
   * Important for containerized environments (Docker, Kubernetes).
   */
  const shutdown = (signal: string) => {
    log.info(`\n${signal} received. Shutting down gracefully...`);

    // Close the server
    server.close(() => {
      log.info('✅ Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Export for testing and deployment
 */
export default {
  port,
  fetch: app.fetch,
};
