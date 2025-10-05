/**
 * Channel Handler Type Definitions
 *
 * Defines the interfaces that all channel implementations must follow.
 */

import type { Channel, SendMessageRequest } from './api.js';

/**
 * Result of sending a message through a channel
 */
export interface ChannelSendResult {
  messageId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Channel handler interface
 * All channel implementations (email, SMS, push, webhook) must implement this interface
 */
export interface ChannelHandler {
  /**
   * The channel type this handler supports
   */
  readonly channel: Channel;

  /**
   * Send a message through this channel
   *
   * @param request - The validated send request
   * @returns Channel-specific send result
   * @throws {Error} If sending fails
   */
  send(request: SendMessageRequest): Promise<ChannelSendResult>;

  /**
   * Check if this channel is available/healthy
   *
   * @returns True if the channel can send messages
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get the provider name for this channel (e.g., "Resend", "Twilio")
   */
  getProviderName(): string;
}

/**
 * Email-specific send request data
 * Extends the base request with email-specific fields
 */
export interface EmailSendRequest extends SendMessageRequest {
  channel: 'email';
  from: {
    email: string;
    name?: string;
  };
  replyTo?: string;
}

/**
 * SMS-specific send request data (Phase 2)
 */
export interface SmsSendRequest extends SendMessageRequest {
  channel: 'sms';
  // SMS-specific fields will be added in Phase 2
}

/**
 * Push notification send request data (Phase 2)
 */
export interface PushSendRequest extends SendMessageRequest {
  channel: 'push';
  // Push-specific fields will be added in Phase 2
}

/**
 * Webhook send request data (Phase 3)
 */
export interface WebhookSendRequest extends SendMessageRequest {
  channel: 'webhook';
  // Webhook-specific fields will be added in Phase 3
}

/**
 * Union type of all channel-specific requests
 */
export type ChannelSpecificRequest =
  | EmailSendRequest
  | SmsSendRequest
  | PushSendRequest
  | WebhookSendRequest;
