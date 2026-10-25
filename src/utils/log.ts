/**
 * Leveled console logging
 *
 * Thin wrapper around console.info/warn/error that drops messages below the configured
 * LOG_LEVEL (debug < info < warn < error). Arguments are passed through unchanged, so
 * callers stay responsible for masking PII and secrets before logging.
 *
 * The level is read from `config` on every call, so tests can change it at runtime.
 */

import { config, LOG_LEVELS, type LogLevel } from '../config.js';

/**
 * Whether a message at `level` is emitted when the configured level is `threshold`.
 */
export function isLevelEnabled(level: LogLevel, threshold: LogLevel = config.logLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(threshold);
}

export const log = {
  /** Request/response lines, startup and shutdown messages. */
  info(...args: unknown[]): void {
    if (isLevelEnabled('info')) console.info(...args);
  },
  /** Recoverable problems: blocked content, fail-open fallbacks, rejected recipients. */
  warn(...args: unknown[]): void {
    if (isLevelEnabled('warn')) console.warn(...args);
  },
  /** Unexpected errors and provider failures. Emitted at every level. */
  error(...args: unknown[]): void {
    if (isLevelEnabled('error')) console.error(...args);
  },
};
