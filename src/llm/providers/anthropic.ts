/**
 * Anthropic Claude LLM Provider
 *
 * Implementation for Claude API spam/abuse detection.
 */

import {
  LLMProvider,
  LLMProviderConfig,
  FilterRules,
  FilterResult,
  CONTENT_MODERATION_SYSTEM_PROMPT,
  buildModerationPrompt,
  parseModerationText,
  postJson,
} from './base.js';

/**
 * Anthropic API response structure (only the fields we read)
 */
interface AnthropicMessage {
  content?: Array<{
    type: string;
    text?: string;
  }>;
  model?: string;
}

/**
 * Anthropic Claude Provider Implementation
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeout: number;
  private readonly endpoint: string;

  constructor(config: LLMProviderConfig) {
    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeout = config.timeout;
    this.endpoint = config.endpoint || 'https://api.anthropic.com/v1/messages';
  }

  /**
   * Analyze content using Claude
   *
   * @throws LLMProviderError on any failure (see LLMProvider.analyze)
   */
  async analyze(content: Record<string, string>, rules: FilterRules): Promise<FilterResult> {
    const startTime = Date.now();

    const data = (await postJson(
      this.name,
      this.endpoint,
      { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: this.model,
        max_tokens: 200, // Small response for JSON output
        system: CONTENT_MODERATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildModerationPrompt(content, rules) }],
      },
      this.timeout
    )) as AnthropicMessage | null;

    const decision = parseModerationText(data?.content?.[0]?.text, this.name);

    return {
      ...decision,
      provider: this.name,
      model: data?.model,
      latency: Date.now() - startTime,
    };
  }

  /**
   * Health check - verify Anthropic API is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      // Simple test request
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 10,
          messages: [
            {
              role: 'user',
              content: 'test',
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }
}
