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
  resolveChannel,
} from '../../src/channels/index.js';
import { emailHandler } from '../../src/channels/email.js';
import { ProviderError, InternalError, ValidationError } from '../../src/utils/errors.js';
import { ErrorCode, type SendMessageRequest } from '../../src/types/api.js';
import { TIMEOUTS } from '../../src/config.js';
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

  describe('resolveChannel', () => {
    it('should return a registered channel', () => {
      expect(resolveChannel('email')).toBe('email');
    });

    it('should throw INVALID_CHANNEL for an unregistered channel', () => {
      let error: unknown;
      try {
        resolveChannel('fax');
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).code).toBe('INVALID_CHANNEL');
      expect((error as ValidationError).statusCode).toBe(400);
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
        from: { email: 'noreply@example.com', name: 'Evil\r\nBcc: x@y.z' },
        replyTo: 'jane@example.com',
      });

      const body = sentBody();
      expect(body.reply_to).toBe('jane@example.com');
      expect(body.from).toBe('EvilBcc: x@y.z <noreply@example.com>');
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

    describe('provider timeout', () => {
      const originalTimeout = TIMEOUTS.provider;

      beforeEach(() => {
        TIMEOUTS.provider = 20;
      });

      afterEach(() => {
        TIMEOUTS.provider = originalTimeout;
      });

      /** A fetch that never answers, but rejects like real fetch when its signal aborts. */
      function hangUntilAborted(_url: unknown, init?: RequestInit): Promise<unknown> {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const reason: unknown = init.signal?.reason;
            reject(reason instanceof Error ? reason : new Error('aborted'));
          });
        });
      }

      it('should abort the Resend request and report PROVIDER_TIMEOUT', async () => {
        fetchMock.mockImplementationOnce(hangUntilAborted);

        const error = await emailHandler.send(baseRequest).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).code).toBe(ErrorCode.PROVIDER_TIMEOUT);
        expect((error as ProviderError).statusCode).toBe(502);
        // The HTTP request itself was aborted, so a slow send cannot still be delivered
        const signal = fetchMock.mock.calls[0]?.[1]?.signal;
        expect(signal?.aborted).toBe(true);
      });

      it('should report PROVIDER_TIMEOUT when the response body read is aborted', async () => {
        // Headers arrive, then the body stalls until the abort (non-OK path re-throws)
        fetchMock.mockImplementationOnce((_url, init) =>
          Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: new Headers(),
            text: () => hangUntilAborted(_url, init),
          })
        );

        const error = await emailHandler.send(baseRequest).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).code).toBe(ErrorCode.PROVIDER_TIMEOUT);
      });

      it('should pass a live signal and succeed when Resend answers in time', async () => {
        fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_fast'));

        const result = await emailHandler.send(baseRequest);

        expect(result.messageId).toBe('email_fast');
        const signal = fetchMock.mock.calls[0]?.[1]?.signal;
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal?.aborted).toBe(false);
      });
    });

    it('should forward the idempotency key as the Idempotency-Key header', async () => {
      fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_idem'));

      await emailHandler.send({ ...baseRequest, idempotencyKey: 'scope:order-123' });

      const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
      expect(headers.get('Idempotency-Key')).toBe('scope:order-123');
    });

    it('should not send an Idempotency-Key header without a key', async () => {
      fetchMock.mockResolvedValueOnce(resendSuccessResponse('email_plain'));

      await emailHandler.send(baseRequest);

      const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
      expect(headers.has('Idempotency-Key')).toBe(false);
    });

    it('should report a ProviderError when the Resend API is unreachable', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

      const error = await emailHandler.send(baseRequest).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ProviderError);
      expect(error).not.toBeInstanceOf(InternalError);
    });
  });
});
