/**
 * LLM Content Filter
 *
 * Analyzes message content using LLM providers to detect spam, abuse, and other violations.
 * Optional feature (v1.2.0) that can be enabled per API key.
 *
 * Not mounted as middleware: the send route calls filterContent() AFTER validating
 * the request schema, so invalid requests never trigger (paid) LLM calls. Template
 * data is validated here before the call, and only the validated template fields
 * are sent to the LLM. It runs after authentication, recipient validation and
 * rate limiting (see src/index.ts).
 */

import type { Context } from 'hono';
import { ZodError } from 'zod';
import { config } from '../config.js';
import { createLLMProvider, type FilterRules } from '../llm/index.js';
import { getChannelHandler } from '../channels/index.js';
import { getTemplate } from '../templates/index.js';
import { ForbiddenError, ServiceUnavailableError, fromZodError } from '../utils/errors.js';
import { ErrorCode, type LLMAnalysis, type SendMessageRequest } from '../types/api.js';
import { maskApiKey } from './logger.js';

/**
 * In-memory budget tracker for LLM API calls per API key
 * Tracks daily usage to enforce maxCallsPerDay limits
 */
interface BudgetTracker {
  count: number;
  resetAt: Date;
}

const budgetTrackers = new Map<string, BudgetTracker>();

/**
 * Check if API key has exceeded LLM budget
 */
function isOverBudget(apiKey: string, maxCallsPerDay: number): boolean {
  const tracker = budgetTrackers.get(apiKey);
  const now = new Date();

  // No tracker yet or tracker expired, create new one
  if (!tracker || now > tracker.resetAt) {
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0); // Reset at midnight UTC
    budgetTrackers.set(apiKey, { count: 0, resetAt: tomorrow });
    return false;
  }

  // Check if over budget
  return tracker.count >= maxCallsPerDay;
}

/**
 * Increment budget usage for API key
 */
function incrementBudget(apiKey: string): void {
  const tracker = budgetTrackers.get(apiKey);
  if (tracker) {
    tracker.count++;
  }
}

/**
 * Get seconds until budget resets
 */
function getSecondsUntilReset(apiKey: string): number {
  const tracker = budgetTrackers.get(apiKey);
  if (!tracker) return 0;

  const now = new Date();
  return Math.ceil((tracker.resetAt.getTime() - now.getTime()) / 1000);
}

/**
 * Validate the request's template data with the template's own schema.
 *
 * Uses the same lookup and validation as the channel handler, so a request that
 * would be rejected at send time is rejected here, before any LLM call.
 *
 * @returns The validated (schema-stripped) template data
 * @throws ValidationError for unknown channels/templates or invalid template data
 */
function validateTemplateData(request: SendMessageRequest): unknown {
  // Resolve the channel first so unsupported channels keep their INVALID_CHANNEL error
  getChannelHandler(request.channel);
  const template = getTemplate(request.channel, request.templateId);

  try {
    return template.validate(request.data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw fromZodError(error, 'Invalid template data');
    }
    throw error;
  }
}

/**
 * Collect the non-empty string fields of validated template data.
 */
function extractContentForAnalysis(validatedData: unknown): Record<string, string> {
  const content: Record<string, string> = {};
  if (!validatedData || typeof validatedData !== 'object') {
    return content;
  }

  for (const [key, value] of Object.entries(validatedData)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      content[key] = value;
    }
  }

  return content;
}

/**
 * Get error code based on detected categories
 */
function getErrorCodeForCategories(categories: string[]): ErrorCode {
  if (categories.includes('spam')) return ErrorCode.CONTENT_BLOCKED_SPAM;
  if (categories.includes('abuse')) return ErrorCode.CONTENT_BLOCKED_ABUSE;
  if (categories.includes('profanity')) return ErrorCode.CONTENT_BLOCKED_PROFANITY;
  if (categories.includes('phishing')) return ErrorCode.CONTENT_BLOCKED_PHISHING;
  if (categories.includes('scam')) return ErrorCode.CONTENT_BLOCKED_SCAM;
  if (categories.includes('promptInjection')) return ErrorCode.CONTENT_BLOCKED_PROMPT_INJECTION;

  // Default to spam if no specific category matched
  return ErrorCode.CONTENT_BLOCKED_SPAM;
}

/**
 * Analysis outcome: client-facing metadata plus the model's reasoning (logs/dev only)
 */
interface AnalysisOutcome {
  analysis: LLMAnalysis;
  reasoning?: string;
}

/**
 * Run the provider and apply the key's failMode to any failure.
 *
 * Providers throw on every failure (timeout, HTTP/network error, malformed or
 * inconsistent output). 'block' fails closed with 503; 'allow' fails open.
 */
async function analyzeWithFailMode(
  apiKey: string,
  content: Record<string, string>,
  rules: FilterRules
): Promise<AnalysisOutcome> {
  const llm = config.llm!;
  const provider = createLLMProvider({
    provider: llm.provider,
    apiKey: llm.apiKey,
    model: llm.model,
    timeout: llm.timeout,
    endpoint: llm.endpoint,
  });

  // Count every attempt (including failures) so maxCallsPerDay caps outbound calls
  incrementBudget(apiKey);

  try {
    const result = await provider.analyze(content, rules);
    return {
      analysis: {
        provider: result.provider,
        model: result.model,
        allowed: result.allowed,
        confidence: result.confidence,
        categories: result.categories,
        latency: result.latency,
      },
      reasoning: result.reasoning,
    };
  } catch (error) {
    // Full provider error (may include upstream response text) is logged only
    console.error('LLM filter error:', {
      apiKey: maskApiKey(apiKey),
      failMode: rules.failMode,
      error: error instanceof Error ? error.message : String(error),
    });

    if (rules.failMode === 'block') {
      throw new ServiceUnavailableError(
        'Unable to verify content safety',
        ErrorCode.LLM_PROVIDER_ERROR,
        {
          hint: 'Content moderation service temporarily unavailable. Please try again.',
        }
      );
    }

    console.warn('LLM filter failed, allowing message (fail-open mode):', {
      apiKey: maskApiKey(apiKey),
    });

    return {
      analysis: {
        provider: llm.provider,
        allowed: true,
        confidence: 0,
        categories: [],
        latency: 0,
        fallback: true,
        fallbackReason: 'LLM analysis failed',
      },
    };
  }
}

/**
 * Filter a validated send request with the LLM content filter.
 *
 * Skips silently when LLM filtering is not configured or not enabled for the key.
 * Otherwise validates the template data, enforces the daily budget and analyzes
 * only the validated template fields.
 *
 * @param c - Request context (requires c.get('apiKey') from the auth middleware)
 * @param request - Request that already passed the send route's schema validation
 * @returns Analysis metadata, or undefined when no analysis was performed
 * @throws ValidationError for invalid channel/template/template data
 * @throws ForbiddenError when content is blocked
 * @throws ServiceUnavailableError in block mode when the budget is exhausted or the provider fails
 */
export async function filterContent(
  c: Context,
  request: SendMessageRequest
): Promise<LLMAnalysis | undefined> {
  const apiKey = c.get('apiKey') as string | undefined;

  if (!apiKey) {
    // This should never happen if authentication middleware is applied correctly
    throw new ForbiddenError('API key not found in context', ErrorCode.UNAUTHORIZED);
  }

  // Check if LLM filtering is globally enabled
  if (!config.llm) {
    return undefined;
  }

  // Get filter rules for this API key; skip if none or not enabled
  const rules = config.llmFilterRules.get(apiKey);
  if (!rules || !rules.enabled) {
    return undefined;
  }

  // Invalid template data must never reach the LLM
  const content = extractContentForAnalysis(validateTemplateData(request));
  if (Object.keys(content).length === 0) {
    return undefined;
  }

  // Check budget limits
  if (isOverBudget(apiKey, rules.maxCallsPerDay)) {
    if (rules.failMode === 'block') {
      throw new ServiceUnavailableError(
        'LLM budget exceeded for today',
        ErrorCode.LLM_BUDGET_EXCEEDED,
        {
          hint: 'Daily LLM analysis limit reached. Try again tomorrow or contact administrator.',
        },
        getSecondsUntilReset(apiKey)
      );
    }

    // Fail-open: Allow without LLM check
    console.warn('LLM budget exceeded, allowing without check:', {
      apiKey: maskApiKey(apiKey),
      budget: rules.maxCallsPerDay,
    });
    return undefined;
  }

  const { analysis, reasoning } = await analyzeWithFailMode(apiKey, content, rules);

  // Check if content should be blocked
  if (!analysis.allowed && analysis.confidence >= rules.threshold) {
    const errorCode = getErrorCodeForCategories(analysis.categories);

    console.warn('Content blocked by LLM filter:', {
      apiKey: maskApiKey(apiKey),
      categories: analysis.categories,
      confidence: analysis.confidence,
      reasoning,
    });

    // The message is generic; moderation internals are in details (stripped in production)
    throw new ForbiddenError('Content blocked by content filter', errorCode, {
      provider: analysis.provider,
      confidence: analysis.confidence,
      categories: analysis.categories,
      reasoning,
      hint: 'If this is a legitimate message, please contact the site administrator',
    });
  }

  return analysis;
}
