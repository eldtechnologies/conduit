/**
 * Send Message Route
 *
 * Main API endpoint for sending messages through any channel.
 * Handles validation, routing to channels, and response formatting.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { routeToChannel } from '../channels/index.js';
import { ValidationError } from '../utils/errors.js';
import { ErrorCode, type SendMessageResponse } from '../types/api.js';

const send = new Hono();

/**
 * Request body schema for send endpoint
 *
 * Validates the structure of incoming send requests.
 */
const sendRequestSchema = z.object({
  channel: z.enum(['email', 'sms', 'push', 'webhook'], {
    errorMap: () => ({ message: 'Invalid channel. Supported channels: email' }),
  }),
  templateId: z.string().min(1, 'Template ID is required'),
  to: z
    .string()
    .email('Invalid recipient email address')
    .max(320, 'Email address too long'),
  data: z.record(z.unknown()),
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
  // Parse and validate request body
  const body: unknown = await c.req.json();

  const parseResult = sendRequestSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new ValidationError(`Invalid request: ${errors.join(', ')}`, ErrorCode.VALIDATION_ERROR, {
      validationErrors: parseResult.error.errors,
    });
  }

  const request = parseResult.data;

  // Route to the appropriate channel
  const result = await routeToChannel(request);

  // Return success response
  const response: SendMessageResponse = {
    success: true,
    messageId: result.messageId,
    channel: request.channel,
    timestamp: result.timestamp,
  };

  return c.json(response, 200);
});

export default send;
