/**
 * Environment Configuration
 *
 * Loads and validates environment variables with sensible defaults.
 * All configuration is loaded once at startup.
 */

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
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue || '';
}

function loadApiKeys(): string[] {
  const keys: string[] = [];

  // Find all environment variables starting with API_KEY_
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('API_KEY_') && value) {
      keys.push(value);
    }
  }

  if (keys.length === 0) {
    throw new Error('No API keys configured. Set at least one API_KEY_* environment variable.');
  }

  return keys;
}

function loadAllowedOrigins(): string[] {
  const origins = getEnvVar('ALLOWED_ORIGINS', '');
  if (!origins) {
    throw new Error('ALLOWED_ORIGINS environment variable is required');
  }

  return origins.split(',').map((origin) => origin.trim());
}

function loadRevokedKeys(): string[] {
  const revokedKeys = getEnvVar('REVOKED_KEYS', '');
  if (!revokedKeys) {
    return [];
  }

  return revokedKeys.split(',').map((key) => key.trim());
}

// Load configuration once at module load
export const config: Config = {
  port: parseInt(getEnvVar('PORT', '3000'), 10),
  nodeEnv: getEnvVar('NODE_ENV', 'development') as Config['nodeEnv'],
  logLevel: getEnvVar('LOG_LEVEL', 'info'),

  resendApiKey: getEnvVar('RESEND_API_KEY'),

  apiKeys: loadApiKeys(),
  allowedOrigins: loadAllowedOrigins(),

  rateLimits: {
    perMinute: parseInt(getEnvVar('RATE_LIMIT_PER_MINUTE', '10'), 10),
    perHour: parseInt(getEnvVar('RATE_LIMIT_PER_HOUR', '100'), 10),
    perDay: parseInt(getEnvVar('RATE_LIMIT_PER_DAY', '500'), 10),
  },

  enforceHttps: getEnvVar('ENFORCE_HTTPS', 'false') === 'true',
  revokedKeys: loadRevokedKeys(),
};

// Timeout constants (in milliseconds)
export const TIMEOUTS = {
  provider: 10000, // 10 seconds for provider API calls
  request: 15000, // 15 seconds total request timeout
  keepAlive: 5000, // 5 seconds keep-alive timeout
};
