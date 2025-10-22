/**
 * LLM Provider Registry
 *
 * Central registry for all LLM providers.
 * Handles provider initialization and selection.
 */

import { LLMProvider, LLMProviderConfig } from './providers/base.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';

/**
 * Create an LLM provider instance based on configuration
 *
 * @param config - Provider configuration
 * @returns LLMProvider instance
 * @throws Error if provider is not supported
 */
export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config);

    case 'openai':
      return new OpenAIProvider(config);

    case 'gemini':
      throw new Error('Gemini provider not yet implemented (Phase 2)');

    case 'ollama':
      throw new Error('Ollama provider not yet implemented (Phase 2)');

    default: {
      const exhaustiveCheck: never = config.provider;
      throw new Error(`Unsupported LLM provider: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * Get list of supported LLM providers
 */
export function getSupportedProviders(): string[] {
  return ['anthropic', 'openai'];
}

// Re-export types for convenience
export type {
  LLMProvider,
  LLMProviderConfig,
  FilterRules,
  FilterResult,
} from './providers/base.js';

export {
  LLMProviderError,
  LLMTimeoutError,
  LLMInvalidResponseError,
} from './providers/base.js';
