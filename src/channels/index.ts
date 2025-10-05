/**
 * Channel Registry and Routing
 *
 * Central registry for all communication channels (email, SMS, push, webhook).
 * Routes messages to the appropriate channel handler based on the channel type.
 */

import type { SendMessageRequest } from '../types/api.js';
import type { ChannelHandler, ChannelSendResult } from '../types/channels.js';
import { ValidationError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

// Channel handlers
import { emailHandler } from './email.js';

/**
 * Channel registry
 * Maps channel names to their handlers
 */
const channelRegistry: Map<string, ChannelHandler> = new Map([
  ['email', emailHandler],
  // Future channels will be registered here
  // ['sms', smsHandler], // Phase 2
  // ['push', pushHandler], // Phase 2
  // ['webhook', webhookHandler], // Phase 3
]);

/**
 * Get a channel handler by name
 *
 * @param channel - The channel name (email, sms, push, webhook)
 * @returns The channel handler
 * @throws ValidationError if channel is not found or not available
 */
export function getChannelHandler(channel: string): ChannelHandler {
  const handler = channelRegistry.get(channel);

  if (!handler) {
    throw new ValidationError(
      `Invalid channel: ${channel}. Supported channels: ${Array.from(channelRegistry.keys()).join(', ')}`,
      ErrorCode.INVALID_CHANNEL
    );
  }

  return handler;
}

/**
 * Route a message to the appropriate channel handler
 *
 * This is the main entry point for sending messages through any channel.
 * It validates the channel, retrieves the handler, and delegates the send operation.
 *
 * @param request - The send message request
 * @returns The send result from the channel handler
 * @throws ValidationError if channel is invalid
 * @throws ProviderError if the provider fails
 */
export async function routeToChannel(request: SendMessageRequest): Promise<ChannelSendResult> {
  // Get the handler for this channel
  const handler = getChannelHandler(request.channel);

  // Check if the channel is available
  const isAvailable = await handler.isAvailable();
  if (!isAvailable) {
    throw new ValidationError(
      `Channel ${request.channel} is not available. Provider: ${handler.getProviderName()}`,
      ErrorCode.PROVIDER_UNAVAILABLE
    );
  }

  // Send the message through the channel handler
  const result = await handler.send(request);

  return result;
}

/**
 * Get all registered channels
 *
 * @returns Array of channel names
 */
export function getRegisteredChannels(): string[] {
  return Array.from(channelRegistry.keys());
}

/**
 * Check if a channel is registered
 *
 * @param channel - The channel name to check
 * @returns true if the channel is registered
 */
export function isChannelRegistered(channel: string): boolean {
  return channelRegistry.has(channel);
}
