/**
 * Recipient Validation Middleware
 *
 * Validates that recipients are in the API key's whitelist (if configured).
 * Prevents stolen API keys from being used to spam arbitrary recipients.
 *
 * v1.1.0 - Security enhancement for stolen key mitigation
 */

import type { Context, Next } from 'hono';
import { config, type RecipientWhitelist } from '../config.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

/**
 * Check if recipient email is allowed by whitelist
 *
 * @param recipient - Email address to validate
 * @param whitelist - Whitelist configuration (emails + domains)
 * @returns true if recipient is allowed, false otherwise
 */
function isRecipientAllowed(recipient: string, whitelist: RecipientWhitelist): boolean {
  const recipientLower = recipient.toLowerCase().trim();

  // Check exact email match
  if (whitelist.emails.includes(recipientLower)) {
    return true;
  }

  // Check domain match
  const recipientDomain = recipientLower.split('@')[1];
  if (recipientDomain && whitelist.domains.includes(recipientDomain)) {
    return true;
  }

  return false;
}

/**
 * Recipient validation middleware
 *
 * Validates that the recipient is in the API key's whitelist.
 * If no whitelist is configured for the API key, all recipients are allowed (backward compatible).
 *
 * Must be applied AFTER authentication middleware (requires c.get('apiKey')).
 */
export async function validateRecipient(c: Context, next: Next) {
  const apiKey = c.get('apiKey') as string | undefined;

  if (!apiKey) {
    // This should never happen if authentication middleware is applied correctly
    throw new ForbiddenError('API key not found in context', ErrorCode.UNAUTHORIZED);
  }

  // ALWAYS parse request body once here and store it
  // This prevents body consumption issues with Hono's Request streams
  const body: any = await c.req.json();

  // Store parsed body in context for route handler to use
  (c.set as any)('parsedBody', body);

  // Get whitelist for this API key
  const whitelist = config.recipientWhitelists.get(apiKey);

  // If no whitelist configured, allow all recipients (backward compatible)
  if (!whitelist) {
    await next();
    return;
  }

  // Validate recipient field exists
  if (!body.to || typeof body.to !== 'string') {
    throw new ValidationError('Missing or invalid recipient', ErrorCode.VALIDATION_ERROR);
  }

  const recipient = body.to;

  // Check if recipient is in whitelist
  if (!isRecipientAllowed(recipient, whitelist)) {
    console.warn('Recipient not in whitelist:', {
      apiKey: apiKey.substring(0, 15) + '***', // Mask API key
      recipient: recipient.split('@')[0] + '@***', // Mask email
      whitelistEmails: whitelist.emails.length,
      whitelistDomains: whitelist.domains.length,
    });

    throw new ForbiddenError(
      'Recipient not allowed. This recipient is not in the whitelist for this API key.',
      ErrorCode.RECIPIENT_NOT_ALLOWED,
      {
        hint: 'Contact your administrator to add this recipient to the whitelist, or check your API key configuration.',
      }
    );
  }

  // Recipient is allowed, continue
  await next();
}
