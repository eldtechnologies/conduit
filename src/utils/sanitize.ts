/**
 * Input Sanitization Utilities
 *
 * Provides XSS protection using DOMPurify for user-generated content.
 * CRITICAL: All user input must be sanitized before rendering in emails or other outputs.
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML to prevent XSS attacks
 *
 * Strips ALL HTML tags and attributes by default.
 * Use this for plain text fields (name, email, message, etc.)
 *
 * @param dirty - Untrusted user input
 * @returns Sanitized string with all HTML removed
 *
 * @example
 * sanitizeHtml('<script>alert("XSS")</script>') // Returns: ''
 * sanitizeHtml('John <b>Doe</b>') // Returns: 'John Doe'
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [], // Strip all HTML tags
    ALLOWED_ATTR: [], // Strip all attributes
    KEEP_CONTENT: true, // Keep text content
  });
}

/**
 * Sanitize rich text content
 *
 * Allows only safe formatting tags (b, i, em, strong, p, br, ul, ol, li, a).
 * Use this for message bodies where basic formatting is needed (Phase 2+).
 *
 * @param dirty - Untrusted user input with HTML
 * @returns Sanitized HTML with only allowed tags
 *
 * @example
 * sanitizeRichText('<p>Hello <script>alert("XSS")</script></p>')
 * // Returns: '<p>Hello </p>'
 *
 * sanitizeRichText('<p>Hello <b>world</b></p>')
 * // Returns: '<p>Hello <b>world</b></p>'
 */
export function sanitizeRichText(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href', 'title'], // Only for <a> tags
    ALLOWED_URI_REGEXP: /^https?:\/\//, // Only allow http(s) links
  });
}

/**
 * Sanitize email addresses
 *
 * Basic email validation and sanitization.
 * Note: Full validation is done with Zod schemas.
 *
 * @param email - Email address to sanitize
 * @returns Sanitized email (lowercase, trimmed)
 */
export function sanitizeEmail(email: string): string {
  return sanitizeHtml(email).toLowerCase().trim();
}

/**
 * Sanitize URL for email templates
 *
 * Ensures URLs are safe and don't contain javascript: or data: schemes.
 *
 * @param url - URL to sanitize
 * @returns Sanitized URL or empty string if invalid
 */
export function sanitizeUrl(url: string): string {
  const sanitized = sanitizeHtml(url).trim();

  // Reject dangerous schemes
  if (
    sanitized.startsWith('javascript:') ||
    sanitized.startsWith('data:') ||
    sanitized.startsWith('vbscript:')
  ) {
    return '';
  }

  return sanitized;
}

/**
 * Escape HTML entities for safe display
 *
 * Converts special characters to HTML entities.
 * Use this when you need to display user input as-is without any HTML processing.
 *
 * @param text - Text to escape
 * @returns HTML entity-escaped text
 *
 * @example
 * escapeHtml('<script>alert("XSS")</script>')
 * // Returns: '&lt;script&gt;alert("XSS")&lt;/script&gt;'
 */
export function escapeHtml(text: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return text.replace(/[&<>"'/]/g, (char) => entities[char] || char);
}

/**
 * Truncate text to a maximum length
 *
 * Useful for ensuring data doesn't exceed field limits.
 * Adds ellipsis if truncated.
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - 3) + '...';
}
