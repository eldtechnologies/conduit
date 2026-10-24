/**
 * Channel Tests
 *
 * Tests channel registry, routing, and email channel handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getChannelHandler,
  getRegisteredChannels,
  isChannelRegistered,
} from '../../src/channels/index.js';
import { emailHandler, resolveSender } from '../../src/channels/email.js';
import { ProviderError, InternalError, ValidationError } from '../../src/utils/errors.js';
import { ErrorCode, type SendMessageRequest } from '../../src/types/api.js';
import { installFetchMock, resendSuccessResponse, type FetchMock } from '../helpers/fetch.js';

describe('Channel Infrastructure', () => {
  describe('getChannelHandler', () => {
    it('should return email handler', () => {
      const handler = getChannelHandler('email');
      expect(handler).toBe(emailHandler);
      expect(handler.channel).toBe('email');
    });

    it('should throw error for invalid channel', () => {
      expect(() => getChannelHandler('invalid')).toThrow('Invalid channel');
      expect(() => getChannelHandler('invalid')).toThrow('email');
    });

    it('should throw error for future channels', () => {
      expect(() => getChannelHandler('sms')).toThrow('Invalid channel');
      expect(() => getChannelHandler('push')).toThrow('Invalid channel');
      expect(() => getChannelHandler('webhook')).toThrow('Invalid channel');
    });
  });

  describe('getRegisteredChannels', () => {
    it('should return array of registered channels', () => {
      const channels = getRegisteredChannels();
      expect(channels).toContain('email');
      expect(channels).toHaveLength(1); // Only email for now
    });
  });

  describe('isChannelRegistered', () => {
    it('should return true for email', () => {
      expect(isChannelRegistered('email')).toBe(true);
    });

    it('should return false for unregistered channels', () => {
      expect(isChannelRegistered('sms')).toBe(false);
      expect(isChannelRegistered('push')).toBe(false);
      expect(isChannelRegistered('webhook')).toBe(false);
      expect(isChannelRegistered('invalid')).toBe(false);
    });
  });
});

// Configured in tests/setup.ts with API_KEY_SENDER_FROM_ADDRESSES
const SENDER_KEY = 'KEY_SENDER_0f1e2d3c4b5a69788796a5b4c3d2e1f0';

describe('resolveSender', () => {
  const allowlist = ['noreply@example.com', 'support@example.com'];

  function expectSenderNotAllowed(fn: () => unknown): void {
    let error: unknown;
    try {
      fn();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).statusCode).toBe(400);
    expect((error as ValidationError).code).toBe(ErrorCode.SENDER_NOT_ALLOWED);
  }

  it('uses the Resend test sender when from is omitted and no allowlist is configured', () => {
    expect(resolveSender(undefined, undefined)).toBe('Conduit <onboarding@resend.dev>');
  });

  it('uses the first allowlisted address when from is omitted', () => {
    expect(resolveSender(undefined, allowlist)).toBe('Conduit <noreply@example.com>');
  });

  it('accepts an allowlisted from address and keeps the name', () => {
    expect(resolveSender({ email: 'support@example.com', name: 'Support' }, allowlist)).toBe(
      'Support <support@example.com>'
    );
  });

  it('matches the allowlist case-insensitively', () => {
    expect(resolveSender({ email: 'Support@EXAMPLE.com' }, allowlist)).toBe(
      'Conduit <support@example.com>'
    );
  });

  it('rejects a from address that is not allowlisted', () => {
    expectSenderNotAllowed(() => resolveSender({ email: 'ceo@example.com' }, allowlist));
  });

  it('rejects any client from address when no allowlist is configured', () => {
    expectSenderNotAllowed(() => resolveSender({ email: 'noreply@example.com' }, undefined));
  });

  it('strips newlines from the sender name and falls back to the default name', () => {
    expect(resolveSender({ email: 'noreply@example.com', name: 'Evil\r\nBcc: x' }, allowlist)).toBe(
      'EvilBcc: x <noreply@example.com>'
    );
    expect(resolveSender({ email: 'noreply@example.com', name: '\r\n' }, allowlist)).toBe(
      'Conduit <noreply@example.com>'
    );
  });

  it('strips address delimiters from the sender name so it cannot override the address', () => {
    expect(
      resolveSender({ email: 'noreply@example.com', name: 'Boss <ceo@company.com>' }, allowlist)
    ).toBe('Boss ceocompany.com <noreply@example.com>');
  });
});

describe('Email Channel Handler', () => {
  describe('properties', () => {
    it('should have correct channel name', () => {
      expect(emailHandler.channel).toBe('email');
    });

    it('should have correct provider name', () => {
      expect(emailHandler.getProviderName()).toBe('resend');
    });
  });

  describe('isAvailable', () => {
    it('should return true when API key is configured', async () => {
      // RESEND_API_KEY is set in tests/setup.ts
      const available = await emailHandler.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('send', () => {
    it('should have send method', () => {
      expect('send' in emailHandler).toBe(true);
      expect(typeof emailHandler.send).toBe('function');
    });
  });

  describe('send via Resend SDK', () => {
    const originalFetch = global.fetch;
    let fetchMock: FetchMock;

    const baseRequest: SendMessageRequest = {
      channel: 'email',
      templateId: 'contact-form',
      to: 'owner@example.com',
      data: { name: 'Jane', email: 'jane@example.com', message: 'Hello' },
    };

    beforeEach(() => {
      fetchMock = installFetchMock();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    function sentBody(): Record<string, unknown> {
      const body = fetchMock.mock.calls[0]?.[1]?.body;
      if (typeof body !== 'string') throw new Error('Expected a JSON string request body');
      return JSON.parse(body) as Record<string, unknown>;
    }

    it('should POST the email to the Resend API and return the message ID', async () => {
      fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_abc'));

      const result = await emailHandler.send(baseRequest);

      expect(result.messageId).toBe('email_abc');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.resend.com/emails');
      expect(init?.method).toBe('POST');
      const body = sentBody();
      expect(body.from).toBe('Conduit <onboarding@resend.dev>');
      expect(body.to).toBe('owner@example.com');
      expect(typeof body.subject).toBe('string');
      expect(typeof body.html).toBe('string');
      expect(typeof body.text).toBe('string');
    });

    it('should send replyTo as reply_to and sanitize the sender name', async () => {
      fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_reply'));

      await emailHandler.send({
        ...baseRequest,
        apiKey: SENDER_KEY,
        from: { email: 'noreply@example.com', name: 'Evil\r\nBcc: x@y.z' },
        replyTo: 'jane@example.com',
      });

      const body = sentBody();
      expect(body.reply_to).toBe('jane@example.com');
      expect(body.from).toBe('EvilBcc: xy.z <noreply@example.com>');
    });

    it("should default to the key's first allowlisted sender when from is omitted", async () => {
      fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_default'));

      await emailHandler.send({ ...baseRequest, apiKey: SENDER_KEY });

      expect(sentBody().from).toBe('Conduit <noreply@example.com>');
    });

    it('should reject a client from without calling Resend when the key has no allowlist', async () => {
      const error = await emailHandler
        .send({
          ...baseRequest,
          apiKey: 'KEY_TEST_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1',
          from: { email: 'ceo@example.com' },
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).code).toBe(ErrorCode.SENDER_NOT_ALLOWED);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should reject a client from when the request carries no API key', async () => {
      const error = await emailHandler
        .send({ ...baseRequest, from: { email: 'noreply@example.com' } })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should map a Resend API error to a ProviderError', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 422,
            name: 'validation_error',
            message: 'Invalid `to` field',
          }),
          { status: 422, headers: { 'content-type': 'application/json' } }
        )
      );

      const error = await emailHandler.send(baseRequest).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).message).toBe('Resend API error: Invalid `to` field');
    });

    it('should add a domain verification hint for unverified domains', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 403,
            name: 'validation_error',
            message: 'The example.com domain is not verified.',
          }),
          { status: 403, headers: { 'content-type': 'application/json' } }
        )
      );

      const error = await emailHandler.send(baseRequest).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).message).toContain('https://resend.com/domains');
    });

    it('should report a ProviderError when the Resend API is unreachable', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

      const error = await emailHandler.send(baseRequest).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ProviderError);
      expect(error).not.toBeInstanceOf(InternalError);
    });
  });
});
