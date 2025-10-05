/**
 * React + TypeScript Contact Form Example
 *
 * This example shows how to integrate Conduit with a React form using TypeScript.
 * Demonstrates proper error handling, loading states, and form validation.
 */

import { useState, FormEvent } from 'react';

// Type definitions for Conduit API
interface ConduitSuccessResponse {
  success: true;
  messageId: string;
  channel: string;
  timestamp: string;
}

interface ConduitErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: unknown;
  retryAfter?: number;
}

type ConduitResponse = ConduitSuccessResponse | ConduitErrorResponse;

interface FormData {
  name: string;
  email: string;
  message: string;
  subject?: string;
}

export function ContactForm() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    message: '',
    subject: '',
  });

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('https://your-conduit-api.com/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'KEY_MYSITE_your_actual_key_here', // Replace with your actual key
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'contact@yoursite.com', // Your destination email
          data: {
            name: formData.name,
            email: formData.email,
            message: formData.message,
            subject: formData.subject || undefined,
          },
        }),
      });

      const data = await response.json() as ConduitResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.success === false ? data.error : 'Failed to send message');
      }

      setStatus('success');
      setFormData({ name: '', email: '', message: '', subject: '' }); // Reset form
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="contact-form">
      <div className="form-group">
        <label htmlFor="name">Name *</label>
        <input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          maxLength={100}
          disabled={status === 'loading'}
        />
      </div>

      <div className="form-group">
        <label htmlFor="email">Email *</label>
        <input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
          disabled={status === 'loading'}
        />
      </div>

      <div className="form-group">
        <label htmlFor="subject">Subject (optional)</label>
        <input
          id="subject"
          type="text"
          value={formData.subject}
          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
          maxLength={200}
          disabled={status === 'loading'}
        />
      </div>

      <div className="form-group">
        <label htmlFor="message">Message *</label>
        <textarea
          id="message"
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          required
          maxLength={5000}
          rows={5}
          disabled={status === 'loading'}
        />
      </div>

      <button type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Sending...' : 'Send Message'}
      </button>

      {status === 'success' && (
        <div className="alert alert-success">
          ✅ Message sent successfully!
        </div>
      )}

      {status === 'error' && (
        <div className="alert alert-error">
          ❌ {errorMessage}
        </div>
      )}
    </form>
  );
}
