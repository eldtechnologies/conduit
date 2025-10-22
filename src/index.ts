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

// Middleware
import { errorHandler } from './middleware/errorHandler.js';
import { enforceHttps, securityHeaders } from './middleware/securityHeaders.js';
import { corsProtection } from './middleware/cors.js';
import { logger } from './middleware/logger.js';
import { authenticate } from './middleware/auth.js';
import { validateRecipient } from './middleware/recipientValidation.js';
import { llmFilter } from './middleware/llmFilter.js';
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
 * 1. HTTPS enforcement - redirects HTTP to HTTPS in production
 * 2. CORS validation - reject unauthorized origins early (performance)
 * 3. Security headers - set security headers on all responses
 * 4. Request logger - structured logging for all requests
 * 5. Body size limit - prevent DoS attacks via large payloads (/api/* only)
 * 6. Authentication - validate API keys (/api/* only)
 * 7. Recipient validation - check whitelist (/api/send only) - v1.1.0
 * 8. LLM spam filtering - AI-powered content moderation (/api/send only) - v1.2.0
 * 9. Rate limiting - token bucket per API key (/api/* only)
 */

// 0. Global error handler
app.onError(errorHandler);

// 1. HTTPS enforcement - applies to ALL routes
app.use('*', enforceHttps);

// 2. CORS protection - applies to ALL routes (reject unauthorized origins early)
app.use('*', corsProtection);

// 3. Security headers - applies to ALL routes
app.use('*', securityHeaders);

// 4. Request logging - applies to ALL routes
app.use('*', logger);

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

// 8. LLM spam filtering for /api/send route (v1.2.0)
app.use('/api/send', llmFilter);

// 9. Rate limiting for /api/* routes
app.use('/api/*', rateLimit);

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
  console.info(`🚀 Conduit starting...`);
  console.info(`📝 Environment: ${config.nodeEnv}`);
  console.info(`🔑 API Keys loaded: ${config.apiKeys.length}`);
  console.info(`🛡️  Recipient Whitelists: ${config.recipientWhitelists.size} configured`);
  console.info(`🤖 LLM Filtering: ${config.llm ? `Enabled (${config.llm.provider}, ${config.llmFilterRules.size} API keys)` : 'Disabled'}`);
  console.info(`🌐 Allowed Origins: ${config.allowedOrigins.join(', ')}`);

  /**
   * Start the server
   */
  const server = serve({
    fetch: app.fetch,
    port,
  });

  console.info(`⚡ Server listening on port ${port}`);

  /**
   * Graceful shutdown handling
   *
   * Ensures clean shutdown on SIGTERM/SIGINT.
   * Important for containerized environments (Docker, Kubernetes).
   */
  const shutdown = (signal: string) => {
    console.info(`\n${signal} received. Shutting down gracefully...`);

    // Close the server
    server.close(() => {
      console.info('✅ Shutdown complete');
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
