/**
 * Sanitization Tests
 *
 * Tests XSS protection and input sanitization.
 * CRITICAL: These tests verify our defense against XSS attacks.
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  sanitizeRichText,
  sanitizeEmail,
  sanitizeUrl,
  escapeHtml,
  truncate,
} from '../../src/utils/sanitize.js';

describe('Sanitization', () => {
  describe('sanitizeHtml', () => {
    it('should strip all HTML tags', () => {
      expect(sanitizeHtml('<b>Hello</b>')).toBe('Hello');
      expect(sanitizeHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    });

    it('should remove script tags and content', () => {
      expect(sanitizeHtml('<script>alert("XSS")</script>')).toBe('');
    });

    it('should remove inline JavaScript', () => {
      expect(sanitizeHtml('<img src=x onerror="alert(1)">')).toBe('');
    });

    it('should remove dangerous attributes', () => {
      expect(sanitizeHtml('<div onclick="alert(1)">Click</div>')).toBe('Click');
    });

    it('should handle nested attacks', () => {
      expect(sanitizeHtml('<div><script>alert("XSS")</script></div>')).toBe('');
    });

    it('should preserve text content', () => {
      expect(sanitizeHtml('Plain text is safe')).toBe('Plain text is safe');
    });

    it('should handle special characters', () => {
      expect(sanitizeHtml('Price: $100 & €50')).toBe('Price: $100 & €50');
    });

    it('should handle empty input', () => {
      expect(sanitizeHtml('')).toBe('');
    });
  });

  describe('sanitizeRichText', () => {
    it('should allow safe formatting tags', () => {
      expect(sanitizeRichText('<b>bold</b>')).toBe('<b>bold</b>');
      expect(sanitizeRichText('<i>italic</i>')).toBe('<i>italic</i>');
      expect(sanitizeRichText('<strong>strong</strong>')).toBe('<strong>strong</strong>');
      expect(sanitizeRichText('<em>emphasis</em>')).toBe('<em>emphasis</em>');
      expect(sanitizeRichText('<p>paragraph</p>')).toBe('<p>paragraph</p>');
    });

    it('should allow lists', () => {
      expect(sanitizeRichText('<ul><li>item</li></ul>')).toContain('<ul>');
      expect(sanitizeRichText('<ol><li>item</li></ol>')).toContain('<ol>');
    });

    it('should allow safe links', () => {
      const html = '<a href="https://example.com">Link</a>';
      const result = sanitizeRichText(html);
      expect(result).toContain('<a');
      expect(result).toContain('https://example.com');
    });

    it('should strip script tags', () => {
      expect(sanitizeRichText('<p>Text<script>alert(1)</script></p>')).toBe('<p>Text</p>');
    });

    it('should strip dangerous attributes', () => {
      const result = sanitizeRichText('<p onclick="alert(1)">Click</p>');
      expect(result).not.toContain('onclick');
      expect(result).toContain('Click');
    });

    it('should block javascript: URLs', () => {
      const result = sanitizeRichText('<a href="javascript:alert(1)">Click</a>');
      expect(result).not.toContain('javascript:');
    });

    it('should block data: URLs', () => {
      const result = sanitizeRichText(
        '<a href="data:text/html,<script>alert(1)</script>">Click</a>'
      );
      expect(result).not.toContain('data:');
    });
  });

  describe('sanitizeEmail', () => {
    it('should lowercase email', () => {
      expect(sanitizeEmail('USER@EXAMPLE.COM')).toBe('user@example.com');
    });

    it('should trim whitespace', () => {
      expect(sanitizeEmail('  user@example.com  ')).toBe('user@example.com');
    });

    it('should strip HTML', () => {
      expect(sanitizeEmail('<b>user@example.com</b>')).toBe('user@example.com');
    });

    it('should handle valid email', () => {
      expect(sanitizeEmail('user@example.com')).toBe('user@example.com');
    });
  });

  describe('sanitizeUrl', () => {
    it('should allow HTTP URLs', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
    });

    it('should allow HTTPS URLs', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    });

    it('should block javascript: URLs', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    });

    it('should block data: URLs', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('should block vbscript: URLs', () => {
      expect(sanitizeUrl('vbscript:alert(1)')).toBe('');
    });

    it('should trim whitespace', () => {
      expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
    });

    it('should strip HTML', () => {
      expect(sanitizeUrl('<a>https://example.com</a>')).toBe('https://example.com');
    });
  });

  describe('escapeHtml', () => {
    it('should escape < and >', () => {
      expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('should escape quotes', () => {
      expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
      expect(escapeHtml("'hello'")).toBe('&#x27;hello&#x27;');
    });

    it('should escape ampersands', () => {
      expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('should escape forward slashes', () => {
      expect(escapeHtml('</script>')).toBe('&lt;&#x2F;script&gt;');
    });

    it('should handle multiple special characters', () => {
      const input = '<script>alert("XSS")</script>';
      const expected = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;';
      expect(escapeHtml(input)).toBe(expected);
    });

    it('should not modify safe text', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('truncate', () => {
    it('should not truncate short text', () => {
      expect(truncate('Hello', 10)).toBe('Hello');
    });

    it('should truncate long text', () => {
      const text = 'This is a very long text that needs truncation';
      const result = truncate(text, 20);
      expect(result).toHaveLength(20);
      expect(result).toContain('...');
    });

    it('should add ellipsis when truncating', () => {
      const result = truncate('Hello World', 8);
      expect(result).toBe('Hello...');
    });

    it('should handle exact length', () => {
      const text = 'Hello';
      expect(truncate(text, 5)).toBe('Hello');
    });

    it('should handle empty string', () => {
      expect(truncate('', 10)).toBe('');
    });
  });

  describe('XSS attack vectors', () => {
    const xssVectors = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '<iframe src="javascript:alert(1)">',
      '<body onload=alert(1)>',
      '<input onfocus=alert(1) autofocus>',
      '<select onfocus=alert(1) autofocus>',
      '<textarea onfocus=alert(1) autofocus>',
      '<marquee onstart=alert(1)>',
      '<div style="background:url(javascript:alert(1))">',
    ];

    it('should block all common XSS vectors with sanitizeHtml', () => {
      xssVectors.forEach((vector) => {
        const result = sanitizeHtml(vector);
        expect(result).not.toContain('<script');
        expect(result).not.toContain('javascript:');
        expect(result).not.toContain('onerror');
        expect(result).not.toContain('onload');
        expect(result).not.toContain('onfocus');
      });
    });
  });
});
