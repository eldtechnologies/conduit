/**
 * Contact Form Email Template
 *
 * Template for sending contact form submissions via email.
 * Validates input data and renders HTML and plain text versions.
 */

import { z } from 'zod';
import type { EmailTemplate } from '../../types/templates.js';
import { sanitizeHtml, escapeHtml } from '../../utils/sanitize.js';

/**
 * Contact form data schema
 *
 * Validates:
 * - Name: 1-100 characters
 * - Email: Valid email format
 * - Message: 1-5000 characters
 * - Subject (optional): Max 200 characters
 */
const contactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  email: z.string().email('Invalid email address'),
  message: z
    .string()
    .min(1, 'Message is required')
    .max(5000, 'Message must be less than 5000 characters'),
  subject: z.string().max(200, 'Subject must be less than 200 characters').optional(),
});

/**
 * Contact form data type
 */
export type ContactFormData = z.infer<typeof contactFormSchema>;

/**
 * Contact form template implementation
 */
export const contactFormTemplate: EmailTemplate<ContactFormData> = {
  id: 'contact-form',
  channel: 'email',
  schema: contactFormSchema,

  /**
   * Validate contact form data
   *
   * @param data - The raw form data
   * @returns Validated and typed data
   * @throws ValidationError if data is invalid
   */
  validate(data: unknown): ContactFormData {
    return contactFormSchema.parse(data);
  },

  /**
   * Generate email subject
   *
   * @param data - Validated contact form data
   * @returns Email subject line
   */
  subject(data: ContactFormData): string {
    if (data.subject) {
      return sanitizeHtml(data.subject);
    }
    return `Contact Form: ${sanitizeHtml(data.name)}`;
  },

  /**
   * Render HTML email body
   *
   * @param data - Validated contact form data
   * @returns HTML email body
   */
  html(data: ContactFormData): string {
    // Sanitize all user input to prevent XSS
    const name = escapeHtml(data.name);
    const email = escapeHtml(data.email);
    const message = escapeHtml(data.message).replace(/\n/g, '<br>');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contact Form Submission</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 20px; margin-bottom: 20px;">
    <h1 style="margin: 0; font-size: 24px; color: #007bff;">New Contact Form Submission</h1>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 4px; padding: 20px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6;">
          <strong style="color: #495057;">From:</strong>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6;">
          ${name}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6;">
          <strong style="color: #495057;">Email:</strong>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #dee2e6;">
          <a href="mailto:${email}" style="color: #007bff; text-decoration: none;">${email}</a>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top: 20px;">
          <strong style="color: #495057; display: block; margin-bottom: 8px;">Message:</strong>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; white-space: pre-wrap; word-wrap: break-word;">
            ${message}
          </div>
        </td>
      </tr>
    </table>
  </div>

  <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 12px; color: #6c757d;">
    <p style="margin: 0;">This email was sent from your contact form.</p>
    <p style="margin: 8px 0 0 0;">Powered by Conduit</p>
  </div>
</body>
</html>
    `.trim();
  },

  /**
   * Render plain text email body
   *
   * @param data - Validated contact form data
   * @returns Plain text email body
   */
  text(data: ContactFormData): string {
    // Sanitize user input (remove HTML if any)
    const name = sanitizeHtml(data.name);
    const email = sanitizeHtml(data.email);
    const message = sanitizeHtml(data.message);

    return `
New Contact Form Submission
============================

From: ${name}
Email: ${email}

Message:
--------
${message}

---
This email was sent from your contact form.
Powered by Conduit
    `.trim();
  },
};
