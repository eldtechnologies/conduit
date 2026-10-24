/**
 * Email Channel Handler
 *
 * Implements email sending via Resend.com API.
 * Handles timeouts, error mapping, and provider availability checks.
 */

import { Resend, type CreateEmailOptions } from 'resend';
import { ZodError } from 'zod';
import type { EmailFrom, SendMessageRequest } from '../types/api.js';
import type { ChannelHandler, ChannelSendResult } from '../types/channels.js';
import type { EmailTemplate } from '../types/templates.js';
import { config, TIMEOUTS } from '../config.js';
import {
  ProviderError,
  InternalError,
  ConduitError,
  ValidationError,
  fromZodError,
} from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';
import { getTemplate } from '../templates/index.js';

// Initialize Resend client
const resend = new Resend(config.resendApiKey);

/**
 * Sanitize email sender name to prevent header injection
 *
 * Removes newline characters (\r, \n) that could be used to inject
 * additional email headers (BCC, CC, Subject, etc.)
 *
 * @param name - The sender name to sanitize
 * @returns Sanitized name with newlines removed
 */
function sanitizeSenderName(name: string): string {
  return name.replace(/[\r\n]/g, '').trim();
}

/** Sender name used when the client does not supply one */
const DEFAULT_SENDER_NAME = 'Conduit';

/** Sender for keys without an allowlist (Resend test domain, works without verification) */
const FALLBACK_SENDER_EMAIL = 'onboarding@resend.dev';

/**
 * Resolve the From header for a send request
 *
 * SECURITY: The sender address is operator-controlled. A client-supplied `from.email` is
 * accepted only if it is in the API key's sender allowlist (API_KEY_<NAME>_FROM_ADDRESSES,
 * case-insensitive). Without an allowlist any client `from` is rejected, so a leaked
 * frontend key cannot send mail as arbitrary addresses on the verified domain.
 *
 * - `from` omitted: the first allowlisted address, or the Resend test sender without a list
 * - `from` given: must be allowlisted; `from.name` is kept (newlines stripped)
 *
 * @param from - The client-supplied sender, if any
 * @param allowlist - The key's allowed sender addresses (lowercased), if configured
 * @returns The formatted From header value
 * @throws ValidationError (400, SENDER_NOT_ALLOWED) if the client sender is not allowed
 */
export function resolveSender(
  from: EmailFrom | undefined,
  allowlist: readonly string[] | undefined
): string {
  const name = sanitizeSenderName(from?.name || DEFAULT_SENDER_NAME) || DEFAULT_SENDER_NAME;

  if (!from) {
    return `${name} <${allowlist?.[0] ?? FALLBACK_SENDER_EMAIL}>`;
  }

  if (!allowlist) {
    throw new ValidationError(
      'Sender not allowed: this API key does not accept a custom from address. Omit `from` to use the default sender.',
      ErrorCode.SENDER_NOT_ALLOWED
    );
  }

  const email = from.email.trim().toLowerCase();
  if (!allowlist.includes(email)) {
    throw new ValidationError(
      'Sender not allowed: from.email is not in the sender allowlist for this API key.',
      ErrorCode.SENDER_NOT_ALLOWED
    );
  }

  return `${name} <${email}>`;
}

/**
 * Email channel handler
 *
 * Implements the ChannelHandler interface for email delivery via Resend.
 */
export const emailHandler: ChannelHandler = {
  channel: 'email',

  /**
   * Send an email via Resend
   *
   * @param request - The send message request
   * @returns The send result with message ID
   * @throws ProviderError if Resend fails
   * @throws InternalError for unexpected errors
   */
  async send(request: SendMessageRequest): Promise<ChannelSendResult> {
    try {
      // Resolve the sender first: a disallowed `from` is rejected before any rendering
      const from = resolveSender(
        request.from,
        request.apiKey ? config.senderAllowlists.get(request.apiKey) : undefined
      );

      // Get and validate the template
      const template = getTemplate(request.channel, request.templateId) as EmailTemplate<unknown>;

      // Validate template data
      const validatedData = template.validate(request.data);

      // Render the template
      const rendered = {
        subject: template.subject(validatedData),
        html: template.html(validatedData),
        text: template.text(validatedData),
      };

      // Typed so the SDK's option names are enforced: the SDK maps `replyTo` to the
      // API's `reply_to` and silently drops unknown keys.
      const emailParams: CreateEmailOptions = {
        from,
        to: request.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        replyTo: request.replyTo,
      };

      // Send with timeout
      const sendPromise = resend.emails.send(emailParams);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new ProviderError('Email send timeout', ErrorCode.PROVIDER_TIMEOUT, {
              provider: 'resend',
              timeout: TIMEOUTS.provider,
            })
          );
        }, TIMEOUTS.provider);
      });

      const response = await Promise.race([sendPromise, timeoutPromise]);

      // Check for errors in response
      if (response.error) {
        const errorMsg = response.error.message;

        // Detect common domain verification errors and provide helpful guidance
        if (errorMsg.includes('not verified') || errorMsg.includes('domain is not verified')) {
          throw new ProviderError(
            `Resend API error: ${errorMsg}. ` +
              `To fix: Verify your domain at https://resend.com/domains or use onboarding@resend.dev for testing.`,
            ErrorCode.PROVIDER_ERROR,
            {
              provider: 'resend',
              error: response.error,
              hint: 'domain_not_verified',
            }
          );
        }

        // Generic Resend error
        throw new ProviderError(
          `Resend API error: ${errorMsg}`,
          ErrorCode.PROVIDER_ERROR,
          {
            provider: 'resend',
            error: response.error,
          }
        );
      }

      // Return success result
      return {
        messageId: response.data?.id || 'unknown',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Re-throw all Conduit errors (ValidationError, ProviderError, etc.)
      if (error instanceof ConduitError) {
        throw error;
      }

      // Template validation failures are client errors, not internal ones
      if (error instanceof ZodError) {
        throw fromZodError(error, 'Invalid template data');
      }

      // Wrap unknown errors
      throw new InternalError('Failed to send email', {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  /**
   * Check if the email channel is available
   *
   * Verifies that the Resend API key is configured.
   *
   * @returns true if the channel is available
   */
  isAvailable(): Promise<boolean> {
    // Check if API key is configured
    return Promise.resolve(!!config.resendApiKey && config.resendApiKey.length > 0);
  },

  /**
   * Get the provider name
   *
   * @returns The provider name
   */
  getProviderName(): string {
    return 'resend';
  },
};
