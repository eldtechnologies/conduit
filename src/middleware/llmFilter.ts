/**
 * LLM Content Filter Middleware
 *
 * Analyzes message content using LLM providers to detect spam, abuse, and other violations.
 * Optional feature (v1.2.0) that can be enabled per API key.
 *
 * Must be applied AFTER authentication and recipient validation middleware.
 */

import type { Context, Next } from 'hono';
import { config } from '../config.js';
import { createLLMProvider, type FilterResult } from '../llm/index.js';
import { ForbiddenError, ServiceUnavailableError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

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
 * Extract content to analyze from request body
 * Concatenates all string fields from the data object
 */
function extractContentForAnalysis(body: unknown): string {
  // Type guard to check if body has the expected structure
  if (
    !body ||
    typeof body !== 'object' ||
    !('data' in body) ||
    !body.data ||
    typeof body.data !== 'object'
  ) {
    return '';
  }

  const parts: string[] = [];

  // Extract all string values from data object
  for (const [key, value] of Object.entries(body.data)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      // Include field name for context
      parts.push(`${key}: ${value}`);
    }
  }

  return parts.join('\n\n');
}

/**
 * Check if sender is whitelisted (skip LLM analysis)
 */
function isSenderWhitelisted(senderEmail: string | undefined, whitelist?: string[]): boolean {
  if (!whitelist || whitelist.length === 0 || !senderEmail) {
    return false;
  }

  const senderLower = senderEmail.toLowerCase().trim();
  return whitelist.includes(senderLower);
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
 * LLM filter middleware
 *
 * Analyzes message content for spam, abuse, and other violations.
 * Blocks messages that exceed the confidence threshold.
 *
 * Must be applied AFTER authentication middleware (requires c.get('apiKey')).
 * Must be applied AFTER recipientValidation middleware (requires c.get('parsedBody')).
 */
export async function llmFilter(c: Context, next: Next) {
  const apiKey = c.get('apiKey') as string | undefined;

  if (!apiKey) {
    // This should never happen if authentication middleware is applied correctly
    throw new ForbiddenError('API key not found in context', ErrorCode.UNAUTHORIZED);
  }

  // Check if LLM filtering is globally enabled
  if (!config.llm) {
    // LLM not configured, skip filtering
    await next();
    return;
  }

  // Get filter rules for this API key
  const rules = config.llmFilterRules.get(apiKey);

  // If no rules or not enabled for this key, skip filtering
  if (!rules || !rules.enabled) {
    await next();
    return;
  }

  // Check budget limits
  if (isOverBudget(apiKey, rules.maxCallsPerDay)) {
    // Handle budget exceeded based on fail mode
    if (rules.failMode === 'block') {
      throw new ServiceUnavailableError(
        'LLM budget exceeded for today',
        ErrorCode.LLM_BUDGET_EXCEEDED,
        {
          hint: 'Daily LLM analysis limit reached. Try again tomorrow or contact administrator.',
          retryAfter: getSecondsUntilReset(apiKey),
        }
      );
    }

    // Fail-open: Allow without LLM check
    console.warn('LLM budget exceeded, allowing without check:', {
      apiKey: apiKey.substring(0, 15) + '***',
      budget: rules.maxCallsPerDay,
    });
    await next();
    return;
  }

  // Get parsed body from context (set by recipientValidation middleware)
  const body = c.get('parsedBody') as unknown;
  if (!body) {
    // Body not parsed yet - should not happen in normal flow
    console.warn('LLM filter: No parsed body in context, skipping filter');
    await next();
    return;
  }

  // Check if sender is whitelisted - extract sender email safely
  let senderEmail: string | undefined;
  if (
    body &&
    typeof body === 'object' &&
    'data' in body &&
    body.data &&
    typeof body.data === 'object'
  ) {
    const data = body.data as Record<string, unknown>;
    senderEmail =
      (typeof data.email === 'string' ? data.email : undefined) ||
      (typeof data.from === 'string' ? data.from : undefined);
  }

  if (
    body &&
    typeof body === 'object' &&
    'from' in body &&
    body.from &&
    typeof body.from === 'object' &&
    'email' in body.from
  ) {
    const from = body.from as Record<string, unknown>;
    if (!senderEmail && typeof from.email === 'string') {
      senderEmail = from.email;
    }
  }

  if (isSenderWhitelisted(senderEmail, rules.whitelistSenders)) {
    const maskedEmail = senderEmail ? senderEmail.split('@')[0] + '@***' : 'unknown';
    console.info('Sender whitelisted, skipping LLM analysis:', {
      sender: maskedEmail,
    });
    await next();
    return;
  }

  // Extract content for analysis
  const content = extractContentForAnalysis(body);

  if (!content || content.trim().length === 0) {
    // No content to analyze, allow
    await next();
    return;
  }

  // Create LLM provider
  const provider = createLLMProvider({
    provider: config.llm.provider,
    apiKey: config.llm.apiKey,
    model: config.llm.model,
    timeout: config.llm.timeout,
    endpoint: config.llm.endpoint,
  });

  let result: FilterResult;

  try {
    // Analyze content with LLM
    result = await provider.analyze(content, rules);

    // Increment budget counter
    incrementBudget(apiKey);

    // Store result in context for route handler to include in response
    c.set('llmAnalysis', {
      provider: result.provider,
      model: result.model,
      allowed: result.allowed,
      confidence: result.confidence,
      categories: result.categories,
      latency: result.latency,
      fallback: result.fallback,
      fallbackReason: result.fallbackReason,
    });

    // Check if content should be blocked
    if (!result.allowed && result.confidence >= rules.threshold) {
      // Content blocked
      const errorCode = getErrorCodeForCategories(result.categories);

      console.warn('Content blocked by LLM filter:', {
        apiKey: apiKey.substring(0, 15) + '***',
        categories: result.categories,
        confidence: result.confidence,
        reasoning: result.reasoning,
      });

      throw new ForbiddenError(`Content blocked: ${result.reasoning}`, errorCode, {
        provider: result.provider,
        confidence: result.confidence,
        categories: result.categories,
        reasoning: result.reasoning,
        hint: 'If this is a legitimate message, please contact the site administrator',
      });
    }

    // Content allowed, continue
    await next();
  } catch (error) {
    // If error is ForbiddenError (content blocked), rethrow it
    if (error instanceof ForbiddenError) {
      throw error;
    }

    // Handle LLM provider errors based on fail mode
    console.error('LLM filter error:', error);

    if (rules.failMode === 'block') {
      // Fail-closed: Block the message
      throw new ServiceUnavailableError(
        'Unable to verify content safety',
        ErrorCode.LLM_PROVIDER_ERROR,
        {
          hint: 'Content moderation service temporarily unavailable. Please try again.',
          reason: error instanceof Error ? error.message : 'Unknown error',
        }
      );
    }

    // Fail-open: Allow the message
    console.warn('LLM filter failed, allowing message (fail-open mode):', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Store fallback info in context
    c.set('llmAnalysis', {
      provider: config.llm.provider,
      allowed: true,
      confidence: 0,
      categories: [],
      latency: 0,
      fallback: true,
      fallbackReason: error instanceof Error ? error.message : 'LLM analysis failed',
    });

    await next();
  }
}
