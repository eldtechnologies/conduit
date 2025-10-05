/**
 * Template Tests
 *
 * Tests template registry and contact form template.
 */

import { describe, it, expect } from 'vitest';
import {
  getTemplate,
  hasTemplate,
  getTemplatesForChannel,
  getAllTemplates,
} from '../../src/templates/index.js';
import { contactFormTemplate } from '../../src/templates/email/contact-form.js';

describe('Template Infrastructure', () => {
  describe('getTemplate', () => {
    it('should return contact form template', () => {
      const template = getTemplate('email', 'contact-form');
      expect(template).toBe(contactFormTemplate);
      expect(template.id).toBe('contact-form');
    });

    it('should throw error for invalid template', () => {
      expect(() => getTemplate('email', 'invalid')).toThrow('Template not found');
      expect(() => getTemplate('email', 'invalid')).toThrow('contact-form');
    });

    it('should throw error for invalid channel', () => {
      expect(() => getTemplate('sms' as any, 'contact-form')).toThrow('Template not found');
    });
  });

  describe('hasTemplate', () => {
    it('should return true for contact-form', () => {
      expect(hasTemplate('email', 'contact-form')).toBe(true);
    });

    it('should return false for non-existent template', () => {
      expect(hasTemplate('email', 'invalid')).toBe(false);
      expect(hasTemplate('sms' as any, 'contact-form')).toBe(false);
    });
  });

  describe('getTemplatesForChannel', () => {
    it('should return email templates', () => {
      const templates = getTemplatesForChannel('email');
      expect(templates).toContain('contact-form');
      expect(templates).toHaveLength(1); // Only contact-form for now
    });

    it('should return empty array for channels with no templates', () => {
      const templates = getTemplatesForChannel('sms' as any);
      expect(templates).toEqual([]);
    });
  });

  describe('getAllTemplates', () => {
    it('should return map of all templates', () => {
      const templates = getAllTemplates();
      expect(templates).toBeInstanceOf(Map);
      expect(templates.has('email:contact-form')).toBe(true);
      expect(templates.size).toBeGreaterThan(0);
    });
  });
});

describe('Contact Form Template', () => {
  describe('properties', () => {
    it('should have correct metadata', () => {
      expect(contactFormTemplate.id).toBe('contact-form');
      expect(contactFormTemplate.channel).toBe('email');
      expect(contactFormTemplate.schema).toBeDefined();
    });
  });

  describe('validate', () => {
    it('should validate valid data', () => {
      const validData = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Hello, this is a test message.',
      };

      const result = contactFormTemplate.validate(validData);
      expect(result).toEqual(validData);
    });

    it('should validate data with subject', () => {
      const validData = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Hello!',
        subject: 'Custom Subject',
      };

      const result = contactFormTemplate.validate(validData);
      expect(result.subject).toBe('Custom Subject');
    });

    it('should reject missing name', () => {
      const invalidData = {
        email: 'john@example.com',
        message: 'Hello',
      };

      expect(() => contactFormTemplate.validate(invalidData)).toThrow();
    });

    it('should reject invalid email', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'invalid-email',
        message: 'Hello',
      };

      expect(() => contactFormTemplate.validate(invalidData)).toThrow('Invalid email');
    });

    it('should reject missing message', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      expect(() => contactFormTemplate.validate(invalidData)).toThrow();
    });

    it('should reject name longer than 100 characters', () => {
      const invalidData = {
        name: 'a'.repeat(101),
        email: 'john@example.com',
        message: 'Hello',
      };

      expect(() => contactFormTemplate.validate(invalidData)).toThrow('less than 100');
    });

    it('should reject message longer than 5000 characters', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'a'.repeat(5001),
      };

      expect(() => contactFormTemplate.validate(invalidData)).toThrow('less than 5000');
    });

    it('should reject subject longer than 200 characters', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Hello',
        subject: 'a'.repeat(201),
      };

      expect(() => contactFormTemplate.validate(invalidData)).toThrow('less than 200');
    });
  });

  describe('subject', () => {
    it('should generate subject from name when no subject provided', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Hello',
      };

      const subject = contactFormTemplate.subject(data);
      expect(subject).toBe('Contact Form: John Doe');
    });

    it('should use custom subject when provided', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Hello',
        subject: 'Question about pricing',
      };

      const subject = contactFormTemplate.subject(data);
      expect(subject).toBe('Question about pricing');
    });

    it('should sanitize subject HTML', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Hello',
        subject: '<script>alert("XSS")</script>Question',
      };

      const subject = contactFormTemplate.subject(data);
      expect(subject).not.toContain('<script>');
      expect(subject).toContain('Question');
    });
  });

  describe('html', () => {
    it('should render HTML email', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'This is a test message.',
      };

      const html = contactFormTemplate.html(data);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('John Doe');
      expect(html).toContain('john@example.com');
      expect(html).toContain('This is a test message');
    });

    it('should escape HTML in user input', () => {
      const data = {
        name: '<script>alert("XSS")</script>',
        email: 'test@example.com',
        message: '<img src=x onerror=alert(1)>',
      };

      const html = contactFormTemplate.html(data);

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should convert newlines to <br> tags', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Line 1\nLine 2\nLine 3',
      };

      const html = contactFormTemplate.html(data);

      expect(html).toContain('Line 1<br>Line 2<br>Line 3');
    });
  });

  describe('text', () => {
    it('should render plain text email', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'This is a test message.',
      };

      const text = contactFormTemplate.text(data);

      expect(text).toContain('John Doe');
      expect(text).toContain('john@example.com');
      expect(text).toContain('This is a test message');
      expect(text).toContain('New Contact Form Submission');
    });

    it('should sanitize HTML in plain text', () => {
      const data = {
        name: '<b>John</b>',
        email: 'test@example.com',
        message: '<script>alert(1)</script>Hello',
      };

      const text = contactFormTemplate.text(data);

      expect(text).not.toContain('<b>');
      expect(text).not.toContain('<script>');
      expect(text).toContain('John');
      expect(text).toContain('Hello');
    });
  });

  describe('render', () => {
    it('should render complete email', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Test message',
        subject: 'Custom Subject',
      };

      const subject = contactFormTemplate.subject(data);
      const html = contactFormTemplate.html(data);
      const text = contactFormTemplate.text(data);

      expect(subject).toBe('Custom Subject');
      expect(html).toContain('John Doe');
      expect(text).toContain('John Doe');
    });
  });
});
