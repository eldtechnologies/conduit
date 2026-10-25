/**
 * Leveled Logging Tests
 *
 * Verifies that LOG_LEVEL suppresses messages below the configured level.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { config, LOG_LEVELS, type LogLevel } from '../../src/config.js';
import { isLevelEnabled, log } from '../../src/utils/log.js';

describe('log helper', () => {
  const originalLevel = config.logLevel;

  afterEach(() => {
    config.logLevel = originalLevel;
    vi.restoreAllMocks();
  });

  function spyAll() {
    return {
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  }

  it.each<[LogLevel, number, number, number]>([
    ['debug', 1, 1, 1],
    ['info', 1, 1, 1],
    ['warn', 0, 1, 1],
    ['error', 0, 0, 1],
  ])('at LOG_LEVEL=%s emits info %i, warn %i, error %i times', (level, info, warn, error) => {
    config.logLevel = level;
    const spies = spyAll();

    log.info('info line');
    log.warn('warn line', { a: 1 });
    log.error('error line', new Error('boom'));

    expect(spies.info).toHaveBeenCalledTimes(info);
    expect(spies.warn).toHaveBeenCalledTimes(warn);
    expect(spies.error).toHaveBeenCalledTimes(error);
  });

  it('passes all arguments through unchanged', () => {
    const spies = spyAll();
    const details = { budget: 2 };

    log.warn('LLM budget exceeded:', details);

    expect(spies.warn).toHaveBeenCalledWith('LLM budget exceeded:', details);
  });

  it('orders levels from debug to error', () => {
    expect(LOG_LEVELS).toEqual(['debug', 'info', 'warn', 'error']);
    expect(isLevelEnabled('debug', 'debug')).toBe(true);
    expect(isLevelEnabled('debug', 'info')).toBe(false);
    expect(isLevelEnabled('error', 'warn')).toBe(true);
    expect(isLevelEnabled('info', 'error')).toBe(false);
  });

  it('defaults the threshold to the configured level', () => {
    config.logLevel = 'warn';
    expect(isLevelEnabled('info')).toBe(false);
    expect(isLevelEnabled('warn')).toBe(true);
  });
});
