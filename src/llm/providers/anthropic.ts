/**
 * Anthropic Claude LLM Provider
 *
 * Implementation for Claude API spam/abuse detection.
 * Uses Claude 3 Haiku for fast, cost-effective content moderation.
 */

import {
  LLMProvider,
  LLMProviderConfig,
  FilterRules,
  FilterResult,
  CONTENT_MODERATION_SYSTEM_PROMPT,
  LLMProviderError,
  LLMTimeoutError,
  LLMInvalidResponseError,
} from './base.js';

/**
 * Anthropic API response structure
 */
interface AnthropicMessage {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Expected JSON structure from Claude
 */
interface ModerationResponse {
  allowed: boolean;
  confidence: number;
  categories: string[];
  reasoning: string;
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
   */
  async analyze(content: string, rules: FilterRules): Promise<FilterResult> {
    const startTime = Date.now();

    try {
      // Build the user prompt with rules
      const userPrompt = this.buildUserPrompt(content, rules);

      // Make API request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 200, // Small response for JSON output
            system: CONTENT_MODERATION_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: userPrompt,
              },
            ],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new LLMProviderError(
            `Anthropic API error: ${response.status} ${errorText}`,
            this.name
          );
        }

        const data = (await response.json()) as AnthropicMessage;
        const latency = Date.now() - startTime;

        // Parse the JSON response from Claude
        return this.parseResponse(data, latency);
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === 'AbortError') {
          throw new LLMTimeoutError(this.name, this.timeout);
        }
        throw error;
      }
    } catch (error) {
      const latency = Date.now() - startTime;

      // Handle timeout with fallback
      if (error instanceof LLMTimeoutError) {
        return this.createFallbackResponse(rules, latency, 'Request timeout');
      }

      // Handle other errors with fallback
      if (error instanceof Error) {
        return this.createFallbackResponse(rules, latency, error.message);
      }

      throw error;
    }
  }

  /**
   * Build user prompt with filter rules
   */
  private buildUserPrompt(content: string, rules: FilterRules): string {
    const enabledCategories = Object.entries(rules.categories)
      .filter(([, enabled]) => enabled)
      .map(([category]) => category);

    return `Analyze this content for: ${enabledCategories.join(', ')}

Content to analyze:
"""
${content}
"""

Respond with JSON only.`;
  }

  /**
   * Parse Claude's response and extract moderation decision
   */
  private parseResponse(data: AnthropicMessage, latency: number): FilterResult {
    try {
      // Extract text from Claude's response
      const text = data.content[0]?.text;
      if (!text) {
        throw new LLMInvalidResponseError(this.name, 'No content in response');
      }

      // Claude might wrap JSON in markdown code blocks, so extract it
      let jsonText = text.trim();
      const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      // Parse JSON
      const result = JSON.parse(jsonText) as ModerationResponse;

      // Validate response structure
      if (
        typeof result.allowed !== 'boolean' ||
        typeof result.confidence !== 'number' ||
        !Array.isArray(result.categories) ||
        typeof result.reasoning !== 'string'
      ) {
        throw new LLMInvalidResponseError(this.name, 'Invalid response structure');
      }

      return {
        allowed: result.allowed,
        confidence: result.confidence,
        categories: result.categories,
        reasoning: result.reasoning,
        provider: this.name,
        model: data.model,
        latency,
      };
    } catch (error) {
      if (error instanceof LLMInvalidResponseError) {
        throw error;
      }
      throw new LLMInvalidResponseError(
        this.name,
        error instanceof Error ? error.message : 'Failed to parse response'
      );
    }
  }

  /**
   * Create fallback response when LLM fails
   */
  private createFallbackResponse(
    rules: FilterRules,
    latency: number,
    reason: string
  ): FilterResult {
    return {
      allowed: rules.failMode === 'allow',
      confidence: 0,
      categories: [],
      reasoning: `LLM analysis failed: ${reason}`,
      provider: this.name,
      latency,
      fallback: true,
      fallbackReason: reason,
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
