/**
 * Core API Type Definitions
 *
 * Defines the request/response structures for the Conduit API.
 */

/**
 * Error codes returned by the API
 */
export enum ErrorCode {
  // Authentication errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_API_KEY = 'INVALID_API_KEY',
  REVOKED_API_KEY = 'REVOKED_API_KEY',

  // Validation errors (400)
  INVALID_REQUEST = 'INVALID_REQUEST',
  INVALID_CHANNEL = 'INVALID_CHANNEL',
  INVALID_TEMPLATE = 'INVALID_TEMPLATE',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Payload errors (413)
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',

  // CORS errors (403)
  CORS_ERROR = 'CORS_ERROR',
  ORIGIN_NOT_ALLOWED = 'ORIGIN_NOT_ALLOWED',

  // Recipient validation (403) - v1.1.0
  RECIPIENT_NOT_ALLOWED = 'RECIPIENT_NOT_ALLOWED',

  // Provider errors (502)
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',

  // Internal errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Supported communication channels
 */
export type Channel = 'email' | 'sms' | 'push' | 'webhook';

/**
 * Email sender information
 */
export interface EmailFrom {
  email: string;
  name?: string;
}

/**
 * Base request structure for all channels
 */
export interface SendMessageRequest {
  channel: Channel;
  templateId: string;
  to: string;
  data: Record<string, unknown>;

  // Email-specific fields (Phase 1)
  from?: EmailFrom;
  replyTo?: string;

  // Future: SMS/Push/Webhook specific fields (Phase 2+)
}

/**
 * Success response
 */
export interface SendMessageResponse {
  success: true;
  messageId: string;
  channel: Channel;
  timestamp: string;
}

/**
 * Error response
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
  details?: Record<string, unknown>;
  retryAfter?: number; // Seconds (for rate limiting)
}

/**
 * Union type for all API responses
 */
export type ApiResponse = SendMessageResponse | ErrorResponse;

/**
 * Health check response (public)
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * Detailed health check response (authenticated)
 */
export interface DetailedHealthResponse extends HealthResponse {
  timestamp: string;
  version: string;
  channels: {
    [key in Channel]?: {
      status: 'active' | 'inactive' | 'degraded';
      provider?: string;
      configured: boolean;
    };
  };
  checks: {
    memory: {
      used: number;
      total: number;
    };
    uptime: number;
  };
}
