/**
 * OpenAI LLM Provider
 *
 * Implementation for OpenAI GPT spam/abuse detection.
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
 * OpenAI API response structure (only the fields we read)
 */
interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  model?: string;
}

/**
 * OpenAI GPT Provider Implementation
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeout: number;
  private readonly endpoint: string;

  constructor(config: LLMProviderConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeout = config.timeout;
    this.endpoint = config.endpoint || 'https://api.openai.com/v1/chat/completions';
  }

  /**
   * Analyze content using OpenAI GPT
   *
   * @throws LLMProviderError on any failure (see LLMProvider.analyze)
   */
  async analyze(content: Record<string, string>, rules: FilterRules): Promise<FilterResult> {
    const startTime = Date.now();

    const data = (await postJson(
      this.name,
      this.endpoint,
      { Authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        max_tokens: 200, // Small response for JSON output
        temperature: 0, // Deterministic output
        response_format: { type: 'json_object' }, // Force JSON response (GPT-4+)
        messages: [
          { role: 'system', content: CONTENT_MODERATION_SYSTEM_PROMPT },
          { role: 'user', content: buildModerationPrompt(content, rules) },
        ],
      },
      this.timeout
    )) as OpenAIResponse | null;

    const text = data?.choices?.[0]?.message?.content ?? undefined;
    const decision = parseModerationText(text, this.name);

    return {
      ...decision,
      provider: this.name,
      model: data?.model,
      latency: Date.now() - startTime,
    };
  }

  /**
   * Health check - verify OpenAI API is reachable
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
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 5,
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
