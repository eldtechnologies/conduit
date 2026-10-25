/**
 * Environment Configuration
 *
 * Loads and validates environment variables with sensible defaults.
 * All configuration is loaded once at startup.
 * Uses Zod for robust validation and type coercion.
 */

import { z } from 'zod';
import type { FilterRules } from './llm/index.js';

/** Supported LOG_LEVEL values, from most to least verbose. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface RecipientWhitelist {
  emails: string[];
  domains: string[];
}

export interface LLMConfig {
  enabled: boolean;
  provider: 'anthropic' | 'openai';
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
  logLevel: LogLevel;

  // Email provider (Phase 1)
  resendApiKey: string;

  // API keys (multiple frontends)
  apiKeys: string[];

  /**
   * Frontend apps: the name from API_KEY_<NAME> paired with its key. Logs use the name,
   * never anything derived from the key value.
   */
  apps: { name: string; key: string }[];

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

  // Sender allowlists: API key value -> allowed `from` addresses (lowercased).
  // The first address is the key's default sender.
  senderAllowlists: Map<string, string[]>;

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

  // Case-insensitive; an unknown level fails startup instead of silently logging at the default
  LOG_LEVEL: z
    .string()
    .default('info')
    // Empty means "use the default", like the per-key LLM settings (e.g. LOG_LEVEL=${LOG_LEVEL} in compose)
    .transform((val) => val.trim().toLowerCase() || 'info')
    .pipe(z.enum(LOG_LEVELS, { error: `LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}` })),

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
  LLM_PROVIDER: z.enum(['anthropic', 'openai']).optional().or(z.literal('')),

  LLM_API_KEY: z.string().optional().or(z.literal('')),

  LLM_MODEL: z.string().optional().or(z.literal('')),

  LLM_TIMEOUT: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'LLM_TIMEOUT must be a positive number',
    }),

  // Case-insensitive like per-key API_KEY_*_LLM_FAIL_MODE
  LLM_FALLBACK_MODE: z
    .string()
    .default('allow')
    .transform((val) => val.trim().toLowerCase())
    .pipe(z.enum(['allow', 'block'], { error: 'LLM_FALLBACK_MODE must be "allow" or "block"' })),

  LLM_ENDPOINT: z.string().optional().or(z.literal('')),
});

const API_KEY_PREFIX = 'API_KEY_';

/**
 * Suffixes that identify per-API-key configuration variables (NOT API keys themselves).
 * A config var is `API_KEY_<NAME><SUFFIX>`, where `API_KEY_<NAME>` must be a configured key.
 * Any other `API_KEY_*` var is treated as an API key and its value must be a valid key.
 */
const API_KEY_CONFIG_SUFFIXES = [
  '_RECIPIENTS',
  '_RECIPIENT_DOMAINS',
  '_FROM_ADDRESSES',
  '_LLM_ENABLED',
  '_LLM_RULES',
  '_LLM_THRESHOLD',
  '_LLM_FAIL_MODE',
  '_LLM_MAX_CALLS_PER_DAY',
] as const;

/**
 * Per-key config suffixes for features that were removed. Setting one fails startup
 * with the given reason instead of being silently ignored, so operators notice that
 * behaviour they relied on is gone.
 */
const REMOVED_API_KEY_CONFIG_SUFFIXES: ReadonlyArray<{ suffix: string; reason: string }> = [
  {
    suffix: '_LLM_WHITELIST_SENDERS',
    reason:
      'the LLM sender whitelist was removed for security reasons: sender fields are supplied by the client and trivially spoofable, so it let anyone skip content filtering. Remove this variable',
  },
];

type ApiKeyConfigSuffix = (typeof API_KEY_CONFIG_SUFFIXES)[number];

/** Key names: uppercase alphanumeric segments separated by single underscores (e.g. LOW_BUDGET). */
const API_KEY_NAME_PATTERN = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;

/**
 * API key values: `KEY_<NAME>_<random>`, as produced by `npm run generate-key`
 * (32 hex chars). Shorter alphanumeric suffixes (12+ chars) are accepted for keys
 * created before the generator existed. Config values such as `true`, `70`, an email
 * address or free text can never match, so they can never become API keys.
 */
const API_KEY_VALUE_PATTERN = /^KEY_[A-Z0-9]+(?:_[A-Z0-9]+)*_[A-Za-z0-9]{12,}$/;

interface ApiKeyConfigVar {
  envName: string;
  keyName: string;
  suffix: ApiKeyConfigSuffix;
  value: string;
}

interface ApiKeyEnv {
  /** Key name (e.g. "MYSITE") -> trimmed API key value */
  keys: Map<string, string>;
  configVars: ApiKeyConfigVar[];
}

/**
 * Classify all API_KEY_* environment variables into API keys and per-key config vars.
 *
 * Fails startup (throws) when:
 * - an API_KEY_* var is not a recognised config var and its value is not a valid API key
 *   (prevents config values or typos such as API_KEY_SITE_RECIPIENT from becoming keys)
 * - a per-key config var refers to a key name that is not configured (typo protection)
 *
 * Error messages name the offending variable but never include its value.
 */
function loadApiKeyEnv(env: NodeJS.ProcessEnv): ApiKeyEnv {
  const keys = new Map<string, string>();
  const configVars: ApiKeyConfigVar[] = [];
  const errors: string[] = [];

  for (const [envName, rawValue] of Object.entries(env)) {
    if (!envName.startsWith(API_KEY_PREFIX) || rawValue === undefined) continue;
    const value = rawValue.trim();

    const removed = REMOVED_API_KEY_CONFIG_SUFFIXES.find((r) => envName.endsWith(r.suffix));
    if (removed) {
      errors.push(`${envName}: ${removed.reason}`);
      continue;
    }

    const suffix = API_KEY_CONFIG_SUFFIXES.find((s) => envName.endsWith(s));
    if (suffix) {
      const keyName = envName.slice(API_KEY_PREFIX.length, envName.length - suffix.length);
      if (API_KEY_NAME_PATTERN.test(keyName)) {
        configVars.push({ envName, keyName, suffix, value });
        continue;
      }
    }

    const keyName = envName.slice(API_KEY_PREFIX.length);
    if (!API_KEY_NAME_PATTERN.test(keyName)) {
      errors.push(
        `${envName}: invalid API key variable name (use API_KEY_<NAME> with uppercase letters, digits and single underscores)`
      );
    } else if (!API_KEY_VALUE_PATTERN.test(value)) {
      errors.push(
        `${envName}: not a recognised per-key config variable (${API_KEY_CONFIG_SUFFIXES.join(', ')}) and its value is not a valid API key (expected KEY_<NAME>_<random>, generate one with npm run generate-key)`
      );
    } else {
      keys.set(keyName, value);
    }
  }

  for (const configVar of configVars) {
    if (!keys.has(configVar.keyName)) {
      errors.push(
        `${configVar.envName}: configures API key "${configVar.keyName}" but API_KEY_${configVar.keyName} is not set`
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid API key configuration:\n  - ${errors.join('\n  - ')}`);
  }

  if (keys.size === 0) {
    throw new Error('No API keys configured. Set at least one API_KEY_* environment variable.');
  }

  return { keys, configVars };
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

const emailSchema = z.string().email();

/**
 * Recipient domains: two or more DNS labels (letters, digits, inner hyphens), no wildcard,
 * no leading `@` and no trailing dot. The last label must start with a letter, so IP
 * addresses are rejected. Values are already lowercased by parseList.
 */
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** 1-based positions of the entries that fail `isValid`. */
function invalidPositions(entries: string[], isValid: (entry: string) => boolean): number[] {
  return entries
    .map((entry, index) => (isValid(entry) ? -1 : index + 1))
    .filter((position) => position > 0);
}

/**
 * Build recipient whitelists from API_KEY_<NAME>_RECIPIENTS (email addresses) and
 * API_KEY_<NAME>_RECIPIENT_DOMAINS (domains), both comma-separated.
 * Returns a Map keyed by API key value.
 *
 * Fails startup (throws) when a list is empty or contains an invalid entry: an empty list
 * would silently block every recipient, and an invalid entry can never match. Errors name
 * the variable and entry position but not the value.
 */
function loadRecipientWhitelists(apiKeyEnv: ApiKeyEnv): Map<string, RecipientWhitelist> {
  const whitelists = new Map<string, RecipientWhitelist>();
  const errors: string[] = [];

  for (const { envName, keyName, suffix, value } of apiKeyEnv.configVars) {
    if (suffix !== '_RECIPIENTS' && suffix !== '_RECIPIENT_DOMAINS') continue;

    const entries = parseList(value);
    const kind = suffix === '_RECIPIENTS' ? 'email address' : 'domain';
    if (entries.length === 0) {
      errors.push(`${envName}: must list at least one ${kind}`);
      continue;
    }

    const invalid =
      suffix === '_RECIPIENTS'
        ? invalidPositions(entries, (entry) => emailSchema.safeParse(entry).success)
        : invalidPositions(entries, (entry) => DOMAIN_PATTERN.test(entry));
    if (invalid.length > 0) {
      const hint = suffix === '_RECIPIENT_DOMAINS' ? ' (use example.com, without @ or *.)' : '';
      errors.push(`${envName}: invalid ${kind} at position ${invalid.join(', ')}${hint}`);
      continue;
    }

    // loadApiKeyEnv guarantees every config var refers to a configured key
    const apiKeyValue = apiKeyEnv.keys.get(keyName)!;
    let whitelist = whitelists.get(apiKeyValue);
    if (!whitelist) {
      whitelist = { emails: [], domains: [] };
      whitelists.set(apiKeyValue, whitelist);
    }

    if (suffix === '_RECIPIENTS') {
      whitelist.emails = entries;
    } else {
      whitelist.domains = entries;
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid recipient whitelist configuration:\n  - ${errors.join('\n  - ')}`);
  }

  return whitelists;
}

/**
 * Build sender allowlists from API_KEY_<NAME>_FROM_ADDRESSES (comma-separated email addresses).
 * Returns a Map keyed by API key value; order is preserved so the first address is the default.
 *
 * Fails startup (throws) when a list is empty or contains an invalid email address, so a typo
 * can never silently widen or disable the sender policy. Errors name the variable and entry
 * position but not the value.
 */
function loadSenderAllowlists(apiKeyEnv: ApiKeyEnv): Map<string, string[]> {
  const allowlists = new Map<string, string[]>();
  const errors: string[] = [];

  for (const { envName, keyName, suffix, value } of apiKeyEnv.configVars) {
    if (suffix !== '_FROM_ADDRESSES') continue;

    const addresses = parseList(value);
    if (addresses.length === 0) {
      errors.push(`${envName}: must list at least one email address`);
      continue;
    }

    const invalid = invalidPositions(
      addresses,
      (address) => emailSchema.safeParse(address).success
    );
    if (invalid.length > 0) {
      errors.push(`${envName}: invalid email address at position ${invalid.join(', ')}`);
      continue;
    }

    // loadApiKeyEnv guarantees every config var refers to a configured key
    allowlists.set(apiKeyEnv.keys.get(keyName)!, [...new Set(addresses)]);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid sender allowlist configuration:\n  - ${errors.join('\n  - ')}`);
  }

  return allowlists;
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
 * API_KEY_MYSITE_LLM_FAIL_MODE=allow   (defaults to LLM_FALLBACK_MODE)
 * API_KEY_MYSITE_LLM_MAX_CALLS_PER_DAY=1000
 *
 * Fails startup (throws) when FAIL_MODE is not allow/block, THRESHOLD is not a number in
 * [0, 1] or MAX_CALLS_PER_DAY is not a positive integer: silently falling back to the default
 * would hide a typo (e.g. a threshold of 70 from the old 0-100 scale). Empty values use the
 * default. Errors name the variable but not the value.
 */
function loadLLMFilterRules(
  apiKeyEnv: ApiKeyEnv,
  defaultFailMode: FilterRules['failMode']
): Map<string, FilterRules> {
  const filterRulesMap = new Map<string, FilterRules>();
  const errors: string[] = [];

  for (const { envName, keyName, suffix, value } of apiKeyEnv.configVars) {
    if (!suffix.startsWith('_LLM_')) continue;

    // loadApiKeyEnv guarantees every config var refers to a configured key
    const apiKeyValue = apiKeyEnv.keys.get(keyName)!;
    let rules = filterRulesMap.get(apiKeyValue);
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
        failMode: defaultFailMode,
        maxCallsPerDay: 1000,
      };
      filterRulesMap.set(apiKeyValue, rules);
    }

    switch (suffix) {
      case '_LLM_ENABLED':
        rules.enabled = value.toLowerCase() === 'true';
        break;

      case '_LLM_RULES':
        if (value) {
          const categories = value.split(',').map((c) => c.trim().toLowerCase());
          // Build a case-insensitive lookup from lowercase input to the canonical
          // camelCase keys on rules.categories (e.g. 'promptinjection' -> 'promptInjection').
          // Without this, camelCase categories like 'promptInjection' would be silently
          // dropped because the input is lowercased before the membership check.
          const categoryKeys = Object.keys(rules.categories);
          const lowercaseToCanonical = new Map<string, string>(
            categoryKeys.map((key) => [key.toLowerCase(), key])
          );
          // Reset all to false first
          categoryKeys.forEach((key) => {
            rules.categories[key as keyof typeof rules.categories] = false;
          });
          // Enable specified categories (unknown categories are ignored)
          categories.forEach((cat) => {
            const canonicalKey = lowercaseToCanonical.get(cat);
            if (canonicalKey) {
              rules.categories[canonicalKey as keyof typeof rules.categories] = true;
            }
          });
        }
        break;

      case '_LLM_THRESHOLD': {
        if (!value) break;
        // Plain decimals only: Number() alone would also accept "0x1", "1e0" or "-0"
        const threshold = Number(value);
        if (!/^(?:\d+\.?\d*|\.\d+)$/.test(value) || threshold < 0 || threshold > 1) {
          errors.push(`${envName} must be a number between 0 and 1 (e.g. 0.7)`);
          break;
        }
        rules.threshold = threshold;
        break;
      }

      case '_LLM_FAIL_MODE': {
        if (!value) break;
        const failMode = value.toLowerCase();
        if (failMode !== 'allow' && failMode !== 'block') {
          // Fail fast: silently ignoring a typo like "blok" would leave the key fail-open
          errors.push(`${envName} must be "allow" or "block"`);
          break;
        }
        rules.failMode = failMode;
        break;
      }

      case '_LLM_MAX_CALLS_PER_DAY': {
        if (!value) break;
        // 0 is rejected: it would skip every LLM check (or block every send in block mode).
        // Use _LLM_ENABLED=false to turn filtering off.
        if (!/^[0-9]+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
          errors.push(`${envName} must be a positive integer`);
          break;
        }
        rules.maxCallsPerDay = Number(value);
        break;
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid LLM filter configuration:\n  - ${errors.join('\n  - ')}`);
  }

  return filterRulesMap;
}

/**
 * Build and validate the full configuration from an environment.
 * Throws on invalid configuration so the server fails fast at startup.
 * Exported for tests; application code should import `config`.
 */
export function loadConfig(processEnv: NodeJS.ProcessEnv): Config {
  const parsed = envSchema.safeParse(processEnv);
  if (!parsed.success) {
    // Same shape as the API key errors: one line per variable, names and rules only
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`
    );
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  }
  const env = parsed.data;
  const apiKeyEnv = loadApiKeyEnv(processEnv);

  const llm = loadLLMConfig(env);
  const llmFilterRules = loadLLMFilterRules(apiKeyEnv, env.LLM_FALLBACK_MODE);

  // A key that asks for LLM filtering must never silently run unfiltered because the
  // global provider config is incomplete (that would bypass a fail-closed key entirely)
  const llmEnabledKeys = [...llmFilterRules.values()].filter((rules) => rules.enabled).length;
  if (llmEnabledKeys > 0 && !llm) {
    const missing = (['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL'] as const).filter(
      (name) => !env[name]
    );
    throw new Error(
      `LLM filtering is enabled for ${llmEnabledKeys} API key(s) but the LLM provider is not configured. Missing: ${missing.join(', ')}`
    );
  }

  return {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    resendApiKey: env.RESEND_API_KEY,
    apiKeys: [...apiKeyEnv.keys.values()],
    apps: [...apiKeyEnv.keys].map(([name, key]) => ({ name, key })),
    allowedOrigins: env.ALLOWED_ORIGINS,
    rateLimits: {
      perMinute: env.RATE_LIMIT_PER_MINUTE,
      perHour: env.RATE_LIMIT_PER_HOUR,
      perDay: env.RATE_LIMIT_PER_DAY,
    },
    enforceHttps: env.ENFORCE_HTTPS,
    revokedKeys: env.REVOKED_KEYS,
    recipientWhitelists: loadRecipientWhitelists(apiKeyEnv),
    senderAllowlists: loadSenderAllowlists(apiKeyEnv),
    llm,
    llmFilterRules,
  };
}

// Load configuration once at module load
export const config: Config = loadConfig(process.env);

// Timeout constants (in milliseconds)
export const TIMEOUTS = {
  provider: 10000, // 10 seconds for provider API calls
  request: 15000, // 15 seconds total request timeout
  keepAlive: 5000, // 5 seconds keep-alive timeout
};
