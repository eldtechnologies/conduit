/**
 * Channel Tests
 *
 * Tests channel registry, routing, and email channel handler.
 */

import { describe, it, expect } from 'vitest';
import {
  getChannelHandler,
  routeToChannel,
  getRegisteredChannels,
  isChannelRegistered,
} from '../../src/channels/index.js';
import { emailHandler } from '../../src/channels/email.js';

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
      expect(emailHandler.send).toBeDefined();
      expect(typeof emailHandler.send).toBe('function');
    });

    // Note: Actual send tests would require mocking Resend
    // or using integration tests with a test API key
    // For now, we verify the method exists and has the right signature
  });
});
