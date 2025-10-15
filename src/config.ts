/**
 * Environment Configuration
 *
 * Loads and validates environment variables with sensible defaults.
 * All configuration is loaded once at startup.
 * Uses Zod for robust validation and type coercion.
 */

import { z } from 'zod';

export interface RecipientWhitelist {
  emails: string[];
  domains: string[];
}

export interface Config {
  // Server
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: string;

  // Email provider (Phase 1)
  resendApiKey: string;

  // API keys (multiple frontends)
  apiKeys: string[];

  // CORS
  allowedOrigins: string[];

  // Rate limiting
  rateLimits: {
    perMinute: number;
    perHour: number;
    perDay: number;
  };

  // Security
  enforceHttps: boolean;
  revokedKeys: string[];

  // Recipient whitelisting (v1.1.0)
  recipientWhitelists: Map<string, RecipientWhitelist>;
}

/**
 * Zod schema for environment variable validation
 * Provides type coercion, transformation, and detailed error messages
 */
const envSchema = z.object({
  // Server configuration
  PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: 'PORT must be a valid port number (1-65535)',
    }),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  LOG_LEVEL: z.string().default('info'),

  // Provider API keys
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),

  // CORS configuration
  ALLOWED_ORIGINS: z
    .string()
    .min(1, 'ALLOWED_ORIGINS is required')
    .transform((val) => val.split(',').map((origin) => origin.trim())),

  // Rate limiting configuration
  RATE_LIMIT_PER_MINUTE: z
    .string()
    .default('10')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'RATE_LIMIT_PER_MINUTE must be a positive number',
    }),

  RATE_LIMIT_PER_HOUR: z
    .string()
    .default('100')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'RATE_LIMIT_PER_HOUR must be a positive number',
    }),

  RATE_LIMIT_PER_DAY: z
    .string()
    .default('500')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'RATE_LIMIT_PER_DAY must be a positive number',
    }),

  // Security configuration
  ENFORCE_HTTPS: z
    .string()
    .default('false')
    .transform((val) => val.toLowerCase() === 'true'),

  REVOKED_KEYS: z
    .string()
    .default('')
    .transform((val) => (val ? val.split(',').map((key) => key.trim()) : [])),
});

/**
 * Load API keys from environment variables
 * API keys are defined as API_KEY_* environment variables
 */
function loadApiKeys(): string[] {
  const keys: string[] = [];

  // Find all environment variables starting with API_KEY_
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('API_KEY_') && value) {
      // Skip if it's a recipient/domain whitelist variable
      if (!key.includes('_RECIPIENTS') && !key.includes('_RECIPIENT_DOMAINS')) {
        keys.push(value);
      }
    }
  }

  if (keys.length === 0) {
    throw new Error('No API keys configured. Set at least one API_KEY_* environment variable.');
  }

  return keys;
}

/**
 * Load recipient whitelists from environment variables
 * Whitelists are defined as API_KEY_*_RECIPIENTS and API_KEY_*_RECIPIENT_DOMAINS
 * Returns a Map keyed by API key value
 */
function loadRecipientWhitelists(apiKeys: string[]): Map<string, RecipientWhitelist> {
  const whitelists = new Map<string, RecipientWhitelist>();

  // For each API key, look for corresponding whitelist variables
  for (const [envKey, envValue] of Object.entries(process.env)) {
    if (!envKey.startsWith('API_KEY_')) continue;

    // Extract the API key name (e.g., "WEBSITE" from "API_KEY_WEBSITE_RECIPIENTS")
    let apiKeyName: string | null = null;

    if (envKey.endsWith('_RECIPIENTS')) {
      apiKeyName = envKey.substring('API_KEY_'.length, envKey.length - '_RECIPIENTS'.length);
    } else if (envKey.endsWith('_RECIPIENT_DOMAINS')) {
      apiKeyName = envKey.substring(
        'API_KEY_'.length,
        envKey.length - '_RECIPIENT_DOMAINS'.length
      );
    }

    if (!apiKeyName) continue;

    // Find the actual API key value
    const apiKeyValue = process.env[`API_KEY_${apiKeyName}`];
    if (!apiKeyValue || !apiKeys.includes(apiKeyValue)) continue;

    // Get or create whitelist for this API key
    let whitelist = whitelists.get(apiKeyValue);
    if (!whitelist) {
      whitelist = { emails: [], domains: [] };
      whitelists.set(apiKeyValue, whitelist);
    }

    // Parse the whitelist values
    if (envKey.endsWith('_RECIPIENTS') && envValue) {
      whitelist.emails = envValue
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0);
    } else if (envKey.endsWith('_RECIPIENT_DOMAINS') && envValue) {
      whitelist.domains = envValue
        .split(',')
        .map((domain) => domain.trim().toLowerCase())
        .filter((domain) => domain.length > 0);
    }
  }

  return whitelists;
}

// Parse and validate environment variables
const env = envSchema.parse(process.env);

// Load API keys first
const apiKeys = loadApiKeys();

// Load configuration once at module load
export const config: Config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  resendApiKey: env.RESEND_API_KEY,
  apiKeys,
  allowedOrigins: env.ALLOWED_ORIGINS,
  rateLimits: {
    perMinute: env.RATE_LIMIT_PER_MINUTE,
    perHour: env.RATE_LIMIT_PER_HOUR,
    perDay: env.RATE_LIMIT_PER_DAY,
  },
  enforceHttps: env.ENFORCE_HTTPS,
  revokedKeys: env.REVOKED_KEYS,
  recipientWhitelists: loadRecipientWhitelists(apiKeys),
};

// Timeout constants (in milliseconds)
export const TIMEOUTS = {
  provider: 10000, // 10 seconds for provider API calls
  request: 15000, // 15 seconds total request timeout
  keepAlive: 5000, // 5 seconds keep-alive timeout
};
