/**
 * Template Registry
 *
 * Central registry for all message templates across all channels.
 * Provides template loading, validation, and rendering.
 */

import type { Channel } from '../types/api.js';
import type { Template } from '../types/templates.js';
import { ValidationError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

// Email templates
import { contactFormTemplate } from './email/contact-form.js';

/**
 * Template registry
 * Maps channel:templateId to template implementations
 */
const templateRegistry: Map<string, Template<unknown>> = new Map([
  // Email templates
  ['email:contact-form', contactFormTemplate],
  // Future templates will be registered here
  // ['email:welcome', welcomeTemplate],
  // ['email:password-reset', passwordResetTemplate],
  // ['sms:verification', verificationTemplate], // Phase 2
]);

/**
 * Create a template key from channel and template ID
 *
 * @param channel - The channel name
 * @param templateId - The template ID
 * @returns The template key (channel:templateId)
 */
function createTemplateKey(channel: Channel, templateId: string): string {
  return `${channel}:${templateId}`;
}

/**
 * Get a template by channel and ID
 *
 * @param channel - The channel name (email, sms, push, webhook)
 * @param templateId - The template ID
 * @returns The template implementation
 * @throws ValidationError if template is not found
 */
export function getTemplate<TData = unknown>(channel: Channel, templateId: string): Template<TData> {
  const key = createTemplateKey(channel, templateId);
  const template = templateRegistry.get(key);

  if (!template) {
    const availableTemplates = Array.from(templateRegistry.keys()).join(', ');
    throw new ValidationError(
      `Template not found: ${key}. Available templates: ${availableTemplates}`,
      ErrorCode.INVALID_TEMPLATE
    );
  }

  return template as Template<TData>;
}

/**
 * Check if a template exists
 *
 * @param channel - The channel name
 * @param templateId - The template ID
 * @returns true if the template exists
 */
export function hasTemplate(channel: Channel, templateId: string): boolean {
  const key = createTemplateKey(channel, templateId);
  return templateRegistry.has(key);
}

/**
 * Get all templates for a channel
 *
 * @param channel - The channel name
 * @returns Array of template IDs for the channel
 */
export function getTemplatesForChannel(channel: Channel): string[] {
  const templates: string[] = [];

  for (const key of templateRegistry.keys()) {
    if (key.startsWith(`${channel}:`)) {
      const templateId = key.substring(channel.length + 1);
      templates.push(templateId);
    }
  }

  return templates;
}

/**
 * Get all registered templates
 *
 * @returns Map of template keys to template instances
 */
export function getAllTemplates(): Map<string, Template<unknown>> {
  return new Map(templateRegistry);
}
