/**
 * Send Message Route
 *
 * Main API endpoint for sending messages through any channel.
 * Handles validation, routing to channels, and response formatting.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { routeToChannel } from '../channels/index.js';
import { fromZodError } from '../utils/errors.js';
import type {
  LLMAnalysis,
  SendMessageRequest,
  SendMessageResponse,
  SendRequestBody,
} from '../types/api.js';

const send = new Hono();

/**
 * Request body schema for send endpoint
 *
 * Validates the structure of incoming send requests.
 */
const sendRequestSchema = z.object({
  channel: z.enum(['email', 'sms', 'push', 'webhook'], {
    error: 'Invalid channel. Supported channels: email',
  }),
  templateId: z.string().min(1, 'Template ID is required'),
  to: z
    .string()
    .email('Invalid recipient email address')
    .max(320, 'Email address too long'),
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
 * POST /api/send
 *
 * Send a message through any channel (email, SMS, push, webhook).
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
  // Cast c.get because parsedBody/llmAnalysis aren't in the Hono Variables map
  const getVar = c.get as (key: string) => unknown;
  let body = getVar('parsedBody') as SendRequestBody | undefined;
  if (!body) {
    body = await c.req.json<SendRequestBody>();
  }

  const parseResult = sendRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw fromZodError(parseResult.error, 'Invalid request');
  }

  // apiKey is set by the auth middleware, never by the client (the schema strips unknown
  // fields); the email channel uses it to enforce the key's sender allowlist
  const request: SendMessageRequest = {
    ...parseResult.data,
    apiKey: getVar('apiKey') as string | undefined,
  };

  // Route to the appropriate channel
  const result = await routeToChannel(request);

  // Get LLM analysis from context (if LLM filtering was applied)
  const llmAnalysis = getVar('llmAnalysis') as LLMAnalysis | undefined;

  // Return success response
  const response: SendMessageResponse = {
    success: true,
    messageId: result.messageId,
    channel: request.channel,
    timestamp: result.timestamp,
    ...(llmAnalysis && { llmAnalysis }), // Include LLM analysis if available
  };

  return c.json(response, 200);
});

export default send;
