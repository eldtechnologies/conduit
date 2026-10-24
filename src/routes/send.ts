/**
 * Send Message Route
 *
 * Main API endpoint for sending messages through any channel.
 * Handles validation, routing to channels, and response formatting.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { routeToChannel } from '../channels/index.js';
import { config } from '../config.js';
import { filterContent } from '../middleware/llmFilter.js';
import { fromZodError } from '../utils/errors.js';
import type { SendMessageResponse, SendRequestBody } from '../types/api.js';

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
        .refine((val) => !val.includes('\r') && !val.includes('\n'), {
          message: 'Name cannot contain newline characters',
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
 *   "from": { "email": "sender@example.com", "name": "Sender Name" }, // optional
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

  const parseResult = sendRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw fromZodError(parseResult.error, 'Invalid request');
  }

  const request = parseResult.data;

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
