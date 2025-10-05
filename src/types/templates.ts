/**
 * Template System Type Definitions
 *
 * Defines the interfaces for message templates across all channels.
 */

import type { Channel } from './api.js';
import type { ZodSchema } from 'zod';

/**
 * Base template interface
 * All templates must implement this interface
 */
export interface Template<TData = unknown> {
  /**
   * Unique template identifier
   */
  readonly id: string;

  /**
   * Channel this template is for
   */
  readonly channel: Channel;

  /**
   * Template description (for documentation)
   */
  readonly description?: string;

  /**
   * Zod schema for validating template data
   */
  readonly schema: ZodSchema<TData>;

  /**
   * Validate template data
   *
   * @param data - Unvalidated data
   * @returns Validated and typed data
   * @throws {ZodError} If validation fails
   */
  validate(data: unknown): TData;
}

/**
 * Email template interface
 */
export interface EmailTemplate<TData = unknown> extends Template<TData> {
  readonly channel: 'email';

  /**
   * Generate email subject from data
   *
   * @param data - Validated template data
   * @returns Email subject line
   */
  subject(data: TData): string;

  /**
   * Generate HTML email body from data
   *
   * @param data - Validated template data
   * @returns HTML email body (sanitized)
   */
  html(data: TData): string;

  /**
   * Generate plain text email body from data
   *
   * @param data - Validated template data
   * @returns Plain text email body
   */
  text(data: TData): string;
}

/**
 * SMS template interface (Phase 2)
 */
export interface SmsTemplate<TData = unknown> extends Template<TData> {
  readonly channel: 'sms';

  /**
   * Generate SMS message from data
   *
   * @param data - Validated template data
   * @returns SMS message text (max 160 chars for single message)
   */
  message(data: TData): string;
}

/**
 * Push notification template interface (Phase 2)
 */
export interface PushTemplate<TData = unknown> extends Template<TData> {
  readonly channel: 'push';

  /**
   * Generate push notification title
   *
   * @param data - Validated template data
   * @returns Notification title
   */
  title(data: TData): string;

  /**
   * Generate push notification body
   *
   * @param data - Validated template data
   * @returns Notification body text
   */
  body(data: TData): string;

  /**
   * Optional notification data/action
   *
   * @param data - Validated template data
   * @returns Additional notification data
   */
  data?(data: TData): Record<string, string>;
}

/**
 * Webhook template interface (Phase 3)
 */
export interface WebhookTemplate<TData = unknown> extends Template<TData> {
  readonly channel: 'webhook';

  /**
   * Generate webhook payload from data
   *
   * @param data - Validated template data
   * @returns JSON-serializable webhook payload
   */
  payload(data: TData): Record<string, unknown>;
}

/**
 * Union type of all template types
 */
export type AnyTemplate = EmailTemplate | SmsTemplate | PushTemplate | WebhookTemplate;

/**
 * Rendered email template output
 */
export interface RenderedEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Rendered SMS template output
 */
export interface RenderedSmsTemplate {
  message: string;
}

/**
 * Rendered push notification output
 */
export interface RenderedPushTemplate {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Rendered webhook template output
 */
export interface RenderedWebhookTemplate {
  payload: Record<string, unknown>;
}

/**
 * Union type of all rendered template outputs
 */
export type RenderedTemplate =
  | RenderedEmailTemplate
  | RenderedSmsTemplate
  | RenderedPushTemplate
  | RenderedWebhookTemplate;
