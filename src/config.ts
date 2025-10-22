/**
 * Environment Configuration
 *
 * Loads and validates environment variables with sensible defaults.
 * All configuration is loaded once at startup.
 * Uses Zod for robust validation and type coercion.
 */

import { z } from 'zod';
import type { FilterRules } from './llm/index.js';

export interface RecipientWhitelist {
  emails: string[];
  domains: string[];
}

export interface LLMConfig {
  enabled: boolean;
  provider: 'anthropic' | 'openai' | 'gemini' | 'ollama';
  apiKey: string;
  model: string;
  timeout: number;
  fallbackMode: 'allow' | 'block';
  endpoint?: string;
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

  // LLM spam filtering (v1.2.0)
  llm?: LLMConfig;
  llmFilterRules: Map<string, FilterRules>;
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

  // LLM spam filtering configuration (optional, v1.2.0)
  LLM_PROVIDER: z
    .enum(['anthropic', 'openai', 'gemini', 'ollama'])
    .optional()
    .or(z.literal('')),

  LLM_API_KEY: z.string().optional().or(z.literal('')),

  LLM_MODEL: z.string().optional().or(z.literal('')),

  LLM_TIMEOUT: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'LLM_TIMEOUT must be a positive number',
    }),

  LLM_FALLBACK_MODE: z.enum(['allow', 'block']).default('allow'),

  LLM_ENDPOINT: z.string().optional().or(z.literal('')),
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

/**
 * Load LLM configuration from environment variables
 * Returns undefined if LLM filtering is not configured
 */
function loadLLMConfig(env: z.infer<typeof envSchema>): LLMConfig | undefined {
  // Check if LLM provider is configured
  if (!env.LLM_PROVIDER || !env.LLM_API_KEY || !env.LLM_MODEL) {
    return undefined;
  }

  return {
    enabled: true,
    provider: env.LLM_PROVIDER,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    timeout: env.LLM_TIMEOUT,
    fallbackMode: env.LLM_FALLBACK_MODE,
    endpoint: env.LLM_ENDPOINT || undefined,
  };
}

/**
 * Load per-API-key LLM filter rules from environment variables
 * Returns a Map keyed by API key value
 *
 * Environment variables format:
 * API_KEY_MYSITE_LLM_ENABLED=true
 * API_KEY_MYSITE_LLM_RULES=spam,abuse,profanity
 * API_KEY_MYSITE_LLM_THRESHOLD=0.7
 * API_KEY_MYSITE_LLM_FAIL_MODE=allow
 * API_KEY_MYSITE_LLM_MAX_CALLS_PER_DAY=1000
 * API_KEY_MYSITE_LLM_WHITELIST_SENDERS=user@domain.com
 */
function loadLLMFilterRules(apiKeys: string[]): Map<string, FilterRules> {
  const filterRulesMap = new Map<string, FilterRules>();

  // For each API key, look for corresponding LLM filter rules
  for (const [envKey, envValue] of Object.entries(process.env)) {
    if (!envKey.startsWith('API_KEY_')) continue;
    if (!envKey.includes('_LLM_')) continue;

    // Extract the API key name (e.g., "MYSITE" from "API_KEY_MYSITE_LLM_ENABLED")
    const parts = envKey.split('_');
    const apiKeyIndex = parts.indexOf('LLM');
    if (apiKeyIndex < 2) continue;

    const apiKeyName = parts.slice(1, apiKeyIndex).join('_');
    const actualApiKey = process.env[`API_KEY_${apiKeyName}`];

    if (!actualApiKey || !apiKeys.includes(actualApiKey)) continue;

    // Get or create filter rules for this API key
    let rules = filterRulesMap.get(actualApiKey);
    if (!rules) {
      rules = {
        enabled: false,
        categories: {
          spam: true,
          abuse: true,
          profanity: false,
          promptInjection: true,
          phishing: true,
          scam: true,
        },
        threshold: 0.7,
        failMode: 'allow',
        maxCallsPerDay: 1000,
      };
      filterRulesMap.set(actualApiKey, rules);
    }

    // Parse the specific configuration
    const configKey = parts.slice(apiKeyIndex + 1).join('_');

    switch (configKey) {
      case 'ENABLED':
        rules.enabled = envValue?.toLowerCase() === 'true';
        break;

      case 'RULES':
        if (envValue) {
          const categories = envValue.split(',').map((c) => c.trim().toLowerCase());
          // Reset all to false first
          Object.keys(rules.categories).forEach((key) => {
            rules.categories[key as keyof typeof rules.categories] = false;
          });
          // Enable specified categories
          categories.forEach((cat) => {
            if (cat in rules.categories) {
              rules.categories[cat as keyof typeof rules.categories] = true;
            }
          });
        }
        break;

      case 'THRESHOLD':
        if (envValue) {
          const threshold = parseFloat(envValue);
          if (!isNaN(threshold) && threshold >= 0 && threshold <= 1) {
            rules.threshold = threshold;
          }
        }
        break;

      case 'FAIL_MODE':
        if (envValue === 'allow' || envValue === 'block') {
          rules.failMode = envValue;
        }
        break;

      case 'MAX_CALLS_PER_DAY':
        if (envValue) {
          const maxCalls = parseInt(envValue, 10);
          if (!isNaN(maxCalls) && maxCalls > 0) {
            rules.maxCallsPerDay = maxCalls;
          }
        }
        break;

      case 'WHITELIST_SENDERS':
        if (envValue) {
          rules.whitelistSenders = envValue
            .split(',')
            .map((email) => email.trim().toLowerCase())
            .filter((email) => email.length > 0);
        }
        break;
    }
  }

  return filterRulesMap;
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
  llm: loadLLMConfig(env),
  llmFilterRules: loadLLMFilterRules(apiKeys),
};

// Timeout constants (in milliseconds)
export const TIMEOUTS = {
  provider: 10000, // 10 seconds for provider API calls
  request: 15000, // 15 seconds total request timeout
  keepAlive: 5000, // 5 seconds keep-alive timeout
};
