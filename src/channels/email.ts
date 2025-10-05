/**
 * Email Channel Handler
 *
 * Implements email sending via Resend.com API.
 * Handles timeouts, error mapping, and provider availability checks.
 */

import { Resend } from 'resend';
import type { SendMessageRequest } from '../types/api.js';
import type { ChannelHandler, ChannelSendResult } from '../types/channels.js';
import { config, TIMEOUTS } from '../config.js';
import { ProviderError, InternalError, ConduitError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';
import { getTemplate } from '../templates/index.js';

// Initialize Resend client
const resend = new Resend(config.resendApiKey);

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
      // Get and validate the template
      const template = getTemplate(request.channel, request.templateId);

      // Validate template data
      const validatedData = template.validate(request.data);

      // Render the template
      const rendered = template.render(validatedData);

      // Prepare email parameters
      const from = request.from
        ? `${request.from.name || 'Conduit'} <${request.from.email}>`
        : 'Conduit <noreply@conduit.example.com>'; // Default sender

      const emailParams = {
        from,
        to: request.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        reply_to: request.replyTo,
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
        throw new ProviderError(
          `Resend API error: ${response.error.message}`,
          ErrorCode.PROVIDER_ERROR,
          {
            provider: 'resend',
            error: response.error,
          }
        );
      }

      // Return success result
      return {
        success: true,
        messageId: response.data?.id || 'unknown',
        channel: 'email',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Re-throw all Conduit errors (ValidationError, ProviderError, etc.)
      if (error instanceof ConduitError) {
        throw error;
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
  async isAvailable(): Promise<boolean> {
    // Check if API key is configured
    return !!config.resendApiKey && config.resendApiKey.length > 0;
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
