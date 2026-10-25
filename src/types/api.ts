/**
 * Core API Type Definitions
 *
 * Defines the request/response structures for the Conduit API.
 */

/**
 * Error codes returned by the API
 */
export enum ErrorCode {
  // Authentication errors (401): missing, invalid or revoked API key
  UNAUTHORIZED = 'UNAUTHORIZED',

  // Validation errors (400)
  INVALID_CHANNEL = 'INVALID_CHANNEL',
  INVALID_TEMPLATE = 'INVALID_TEMPLATE',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Payload errors (413)
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',

  // Origin not in ALLOWED_ORIGINS (403)
  ORIGIN_NOT_ALLOWED = 'ORIGIN_NOT_ALLOWED',

  // Recipient validation (403) - v1.1.0
  RECIPIENT_NOT_ALLOWED = 'RECIPIENT_NOT_ALLOWED',

  // Sender validation (400): client `from` not in the key's sender allowlist
  SENDER_NOT_ALLOWED = 'SENDER_NOT_ALLOWED',

  // LLM spam filtering (403) - v1.2.0
  CONTENT_BLOCKED_SPAM = 'CONTENT_BLOCKED_SPAM',
  CONTENT_BLOCKED_ABUSE = 'CONTENT_BLOCKED_ABUSE',
  CONTENT_BLOCKED_PROFANITY = 'CONTENT_BLOCKED_PROFANITY',
  CONTENT_BLOCKED_PHISHING = 'CONTENT_BLOCKED_PHISHING',
  CONTENT_BLOCKED_SCAM = 'CONTENT_BLOCKED_SCAM',
  CONTENT_BLOCKED_PROMPT_INJECTION = 'CONTENT_BLOCKED_PROMPT_INJECTION',

  // LLM provider errors (503) - v1.2.0; timeouts are reported as LLM_PROVIDER_ERROR
  LLM_PROVIDER_ERROR = 'LLM_PROVIDER_ERROR',
  LLM_BUDGET_EXCEEDED = 'LLM_BUDGET_EXCEEDED',

  // Provider errors (502)
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',

  // Channel provider not configured (503)
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

  /**
   * Provider idempotency key, derived from the client's Idempotency-Key header.
   * Retries with the same key within the provider's window are not re-sent.
   */
  idempotencyKey?: string;

  /**
   * The authenticated API key, set server-side by the send route (never taken from the
   * client body: the request schema strips unknown fields). Channels use it to apply
   * per-key policy such as the sender allowlist; when absent, the most restrictive
   * policy applies.
   */
  apiKey?: string;

  // Future: SMS/Push/Webhook specific fields (Phase 2+)
}

/**
 * Raw send request body shape as parsed from JSON.
 *
 * Used for typing the result of `c.req.json()` BEFORE Zod validation.
 * All fields are marked optional and use loose types because the body is
 * untrusted user input - actual validation happens via `sendRequestSchema`
 * in routes/send.ts.
 */
export interface SendRequestBody {
  channel?: unknown;
  templateId?: unknown;
  to?: unknown;
  data?: unknown;
  from?: unknown;
  replyTo?: unknown;
}

/**
 * LLM analysis metadata (v1.2.0)
 *
 * Returned to clients only outside production; it is omitted in production so
 * moderation internals cannot be used to tune content past the filter.
 * `fallbackReason` is always a generic string, never provider error text.
 */
export interface LLMAnalysis {
  provider: string;
  model?: string;
  allowed: boolean;
  confidence: number;
  categories: string[];
  latency: number;
  fallback?: boolean;
  fallbackReason?: string;
}

/**
 * Success response
 */
export interface SendMessageResponse {
  success: true;
  messageId: string;
  channel: Channel;
  timestamp: string;
  llmAnalysis?: LLMAnalysis; // LLM analysis metadata (v1.2.0, non-production only)
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
