#!/usr/bin/env node
/**
 * API Key Generator
 *
 * Generates cryptographically secure API keys for Conduit.
 * Uses crypto.randomBytes (NOT Math.random) for security.
 *
 * Usage:
 *   npm run generate-key -- APPNAME
 *   node scripts/generate-api-key.ts APPNAME
 *
 * Example:
 *   npm run generate-key -- mysite
 *   Output: KEY_MYSITE_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1
 */

import { randomBytes } from 'crypto';

/**
 * Generates a cryptographically secure API key
 *
 * @param appName - The application name (will be uppercased)
 * @returns API key in format KEY_<APPNAME>_<32-hex-chars>
 */
export function generateApiKey(appName: string): string {
  // Validate app name
  if (!appName || appName.trim().length === 0) {
    throw new Error('App name is required');
  }

  // Sanitize app name (only alphanumeric and underscores)
  const sanitizedName = appName
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_{2,}/g, '_');

  if (sanitizedName.length === 0) {
    throw new Error('App name must contain at least one alphanumeric character');
  }

  // Generate 16 random bytes = 32 hex characters
  const randomSuffix = randomBytes(16).toString('hex');

  return `KEY_${sanitizedName}_${randomSuffix}`;
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const appName = process.argv[2];

  if (!appName) {
    console.error('❌ Error: App name is required');
    console.error('');
    console.error('Usage:');
    console.error('  npm run generate-key -- <APPNAME>');
    console.error('');
    console.error('Example:');
    console.error('  npm run generate-key -- mysite');
    process.exit(1);
  }

  try {
    const apiKey = generateApiKey(appName);

    console.log('');
    console.log('✅ API Key generated successfully!');
    console.log('');
    console.log('━'.repeat(60));
    console.log(apiKey);
    console.log('━'.repeat(60));
    console.log('');
    console.log('Add this to your .env file:');
    console.log(`API_KEY_${appName.toUpperCase()}=${apiKey}`);
    console.log('');
    console.log('⚠️  IMPORTANT: Keep this key secret!');
    console.log('   - Do NOT commit .env to version control');
    console.log('   - Store securely in your deployment environment');
    console.log('');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}
