/**
 * OpenAI LLM Provider
 *
 * Implementation for OpenAI GPT spam/abuse detection.
 * Uses GPT-3.5-turbo or GPT-4 for content moderation.
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
 * OpenAI API response structure
 */
interface OpenAIResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Expected JSON structure from GPT
 */
interface ModerationResponse {
  allowed: boolean;
  confidence: number;
  categories: string[];
  reasoning: string;
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
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 200, // Small response for JSON output
            temperature: 0, // Deterministic output
            response_format: { type: 'json_object' }, // Force JSON response (GPT-4+)
            messages: [
              {
                role: 'system',
                content: CONTENT_MODERATION_SYSTEM_PROMPT,
              },
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
            `OpenAI API error: ${response.status} ${errorText}`,
            this.name
          );
        }

        const data = (await response.json()) as OpenAIResponse;
        const latency = Date.now() - startTime;

        // Parse the JSON response from GPT
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
   * Parse GPT's response and extract moderation decision
   */
  private parseResponse(data: OpenAIResponse, latency: number): FilterResult {
    try {
      // Extract content from GPT's response
      const content = data.choices[0]?.message?.content;
      if (!content) {
        throw new LLMInvalidResponseError(this.name, 'No content in response');
      }

      // GPT might wrap JSON in markdown code blocks, so extract it
      let jsonText = content.trim();
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
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
