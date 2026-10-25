/**
 * Send Message Route
 *
 * Main API endpoint for sending messages through any channel.
 * Handles validation, routing to channels, and response formatting.
 */

import { createHash } from 'crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { resolveChannel, routeToChannel } from '../channels/index.js';
import { resolveSender } from '../channels/email.js';
import { config } from '../config.js';
import { filterContent } from '../middleware/llmFilter.js';
import { fromZodError, ValidationError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';
import type { SendMessageRequest, SendMessageResponse, SendRequestBody } from '../types/api.js';

const send = new Hono();

/**
 * Request body schema for send endpoint
 *
 * Validates the structure of incoming send requests.
 */
const sendRequestSchema = z.object({
  // Only the type is checked here: whether the channel exists is decided by the
  // channel registry, so unknown channels get INVALID_CHANNEL, not VALIDATION_ERROR.
  channel: z.string({ error: 'Channel is required' }),
  templateId: z.string().min(1, 'Template ID is required'),
  to: z.string().email('Invalid recipient email address').max(320, 'Email address too long'),
  data: z.record(z.string(), z.unknown()),
  from: z
    .object({
      email: z.string().email('Invalid from email'),
      name: z
        .string()
        .max(100, 'Name must be at most 100 characters')
        .refine((val) => !val.includes('\r') && !val.includes('\n'), {
          message: 'Name cannot contain newline characters',
        })
        // An address-like display name ("ceo@company.com", "x <ceo@company.com>") would
        // spoof or override the allowlisted sender address in the From header
        .refine((val) => !/[<>"@]/.test(val), {
          message: 'Name cannot contain <, >, " or @ characters',
        })
        .optional(),
    })
    .optional(),
  replyTo: z.string().email('Invalid reply-to email').optional(),
});

/**
 * Client Idempotency-Key format: 1-200 characters of [A-Za-z0-9._:-].
 * Leaves room for the app-name scope (max 55 chars + ':') within Resend's 256-character limit.
 */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

/** Longest app-name scope that fits Resend's 256-character limit next to a 200-char key */
const MAX_IDEMPOTENCY_SCOPE_LENGTH = 55;

/**
 * Validate the optional Idempotency-Key header and scope it to the authenticated app
 *
 * All frontends share one Resend account, so the client key is prefixed with the
 * caller's app name to keep one app's keys from colliding with another's.
 *
 * @param header - Raw Idempotency-Key header value, if any
 * @param appName - The authenticated app name (from API_KEY_<NAME>)
 * @returns The provider idempotency key, or undefined when no header was sent
 * @throws ValidationError if the header is malformed
 */
function toIdempotencyKey(
  header: string | undefined,
  appName: string | undefined
): string | undefined {
  if (header === undefined) {
    return undefined;
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(header)) {
    throw new ValidationError(
      'Invalid Idempotency-Key header: use 1-200 characters of A-Z, a-z, 0-9, ".", "_", ":" or "-"',
      ErrorCode.VALIDATION_ERROR
    );
  }

  return `${idempotencyScope(appName)}:${header}`;
}

/**
 * Idempotency namespace for an app: its name from the `API_KEY_<NAME>` variable
 *
 * The name is unique per configured key, unlike the `KEY_<NAME>` prefix of the key value,
 * so two keys never share a namespace. It contains no part of the secret key. Names too
 * long for Resend's limit are shortened with a hash suffix so they stay unique.
 *
 * @param appName - The authenticated app name
 * @returns The scope (at most 55 chars), or 'anonymous' when there is no app name
 */
function idempotencyScope(appName: string | undefined): string {
  if (!appName) {
    return 'anonymous';
  }
  if (appName.length <= MAX_IDEMPOTENCY_SCOPE_LENGTH) {
    return appName;
  }
  const hash = createHash('sha256').update(appName).digest('hex').slice(0, 16);
  return `${appName.slice(0, MAX_IDEMPOTENCY_SCOPE_LENGTH - hash.length - 1)}-${hash}`;
}

/**
 * POST /api/send
 *
 * Send a message through any channel (email, SMS, push, webhook).
 *
 * Optional header: Idempotency-Key (1-200 chars of [A-Za-z0-9._:-]). Retrying with the
 * same key and body does not send the email twice (e.g. after a PROVIDER_TIMEOUT).
 *
 * Request body:
 * {
 *   "channel": "email",
 *   "templateId": "contact-form",
 *   "to": "recipient@example.com",
 *   "data": { "name": "John", "email": "john@example.com", "message": "..." },
 *   "from": { "email": "sender@example.com", "name": "Sender Name" }, // optional, must be in API_KEY_<NAME>_FROM_ADDRESSES
 *   "replyTo": "reply@example.com" // optional
 * }
 *
 * Response (200):
 * {
 *   "success": true,
 *   "messageId": "abc123",
 *   "channel": "email",
 *   "timestamp": "2025-10-05T12:00:00.000Z"
 * }
 *
 * Response (400/401/429/500):
 * {
 *   "success": false,
 *   "error": "Error message",
 *   "code": "ERROR_CODE",
 *   "details": { ... } // optional
 * }
 */
send.post('/send', async (c) => {
  // Use pre-parsed body from recipientValidation middleware if available (v1.1.0)
  // The body is parsed by recipientValidation middleware to prevent consumption issues
  // Fall back to parsing here if middleware not applied (backward compatible)
  // Cast c.get because parsedBody isn't in the Hono Variables map
  const getVar = c.get as (key: string) => unknown;
  let body = getVar('parsedBody') as SendRequestBody | undefined;
  if (!body) {
    body = await c.req.json<SendRequestBody>();
  }

  // Reject an unknown channel before field validation, so the error code does not
  // depend on whether the rest of the body happens to be valid
  if (typeof body?.channel === 'string') {
    resolveChannel(body.channel);
  }

  const parseResult = sendRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw fromZodError(parseResult.error, 'Invalid request');
  }

  const idempotencyKey = toIdempotencyKey(
    c.req.header('Idempotency-Key'),
    getVar('appName') as string | undefined
  );

  // apiKey is set by the auth middleware, never by the client (the schema strips unknown
  // fields); the email channel uses it to enforce the key's sender allowlist
  const request: SendMessageRequest = {
    ...parseResult.data,
    apiKey: getVar('apiKey') as string | undefined,
    channel: resolveChannel(parseResult.data.channel),
    ...(idempotencyKey && { idempotencyKey }),
  };

  // Reject a disallowed sender before spending an LLM call on the request
  if (request.channel === 'email') {
    resolveSender(
      request.from,
      request.apiKey ? config.senderAllowlists.get(request.apiKey) : undefined
    );
  }

  // LLM content filtering (v1.2.0) runs only after the request has been validated,
  // and validates template data itself, so invalid requests never trigger LLM calls
  const llmAnalysis = await filterContent(c, request);

  // Route to the appropriate channel
  const result = await routeToChannel(request);

  // Return success response
  const response: SendMessageResponse = {
    success: true,
    messageId: result.messageId,
    channel: request.channel,
    timestamp: result.timestamp,
    // Moderation internals help attackers tune content, so they are never sent in production
    ...(llmAnalysis && config.nodeEnv !== 'production' && { llmAnalysis }),
  };

  return c.json(response, 200);
});

export default send;
