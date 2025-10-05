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
import { config } from './config.js';

// Middleware
import { errorHandler } from './middleware/errorHandler.js';
import { enforceHttps, securityHeaders } from './middleware/securityHeaders.js';
import { corsProtection } from './middleware/cors.js';
import { logger } from './middleware/logger.js';
import { authenticate } from './middleware/auth.js';
import { rateLimit } from './middleware/rateLimit.js';

// Routes
import health from './routes/health.js';

const app = new Hono();

/**
 * Middleware Stack
 *
 * Order is critical for security and functionality:
 * 1. Error handler - catches all errors
 * 2. Security headers - HTTPS enforcement and security headers
 * 3. CORS - origin validation
 * 4. Logger - request/response logging (after CORS to log rejected requests)
 */

// 1. Global error handler
app.onError(errorHandler);

// 2. Security headers (HTTPS + headers) - applies to ALL routes
app.use('*', enforceHttps);
app.use('*', securityHeaders);

// 3. CORS protection - applies to ALL routes
app.use('*', corsProtection);

// 4. Request logging - applies to ALL routes
app.use('*', logger);

/**
 * Route-specific middleware
 *
 * Authentication and rate limiting only apply to /api/* routes.
 * Health check endpoints are public (or have their own auth).
 */

// Auth + Rate limiting for /api/* routes (future)
// app.use('/api/*', authenticate);
// app.use('/api/*', rateLimit);

// Auth for /health/detailed (detailed diagnostics)
app.use('/health/detailed', authenticate);

/**
 * Routes
 */

// Health check endpoints
app.route('/health', health);

// Future: API routes will be mounted here
// app.route('/api/send', sendRoutes); // Phase 6

/**
 * Server startup
 */
const port = config.port;

console.info(`🚀 Conduit starting...`);
console.info(`📝 Environment: ${config.nodeEnv}`);
console.info(`🔑 API Keys loaded: ${config.apiKeys.length}`);
console.info(`🌐 Allowed Origins: ${config.allowedOrigins.join(', ')}`);
console.info(`⚡ Server listening on port ${port}`);

/**
 * Graceful shutdown handling
 *
 * Ensures clean shutdown on SIGTERM/SIGINT.
 * Important for containerized environments (Docker, Kubernetes).
 */
const shutdown = (signal: string) => {
  console.info(`\n${signal} received. Shutting down gracefully...`);

  // Future: Close database connections, flush logs, etc.
  // For now, we just log and exit

  console.info('✅ Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/**
 * Export for testing and deployment
 */
export default {
  port,
  fetch: app.fetch,
};
