# Advanced Protection Techniques

**Status**: 🔬 Experimental / Planned
**Version**: 1.1.0+
**Last Updated**: 2025-10-14

> **⚠️ IMPLEMENTATION STATUS**: Most features in this document are **NOT yet implemented** in Conduit.
> This is a planning and design document for future enhancements. See the table below for current status.

## Implementation Status

| Feature | Status | Version | Location | Notes |
|---------|--------|---------|----------|-------|
| Honeypot Fields | 📋 Documented | - | Frontend only | Implementation guide only |
| Form Timing Checks | 📋 Documented | - | Frontend only | Implementation guide only |
| Keyword Filtering | 📋 Documented | - | Frontend only | Implementation guide only |
| CAPTCHA Integration | 📋 Documented | - | Frontend + Conduit | Implementation guide only |
| Behavioral Analysis | 🔬 Planned | v1.2.0 | Conduit middleware | Design complete |
| IP Rate Limiting | 🔬 Planned | v1.2.0 | Conduit middleware | Design complete |
| Domain Rate Limiting | 🔬 Planned | v1.2.0 | Conduit middleware | Design complete |
| Reputation Throttling | 🔬 Planned | v1.2.0 | Conduit middleware | Design complete |
| Content Filtering | 🔬 Planned | v1.2.0 | Conduit middleware | Design complete |
| **LLM Filtering (Local)** | 🔬 Planned | v1.3.0 | Conduit middleware | Architecture documented |
| **LLM Filtering (API)** | 🔬 Planned | v1.3.0 | Conduit middleware | Architecture documented |

**Legend**: ✅ Implemented | 📋 Documented (not coded) | 🔬 Planned (design only)

---

## Table of Contents

- [Overview](#overview)
- [Protection Techniques](#protection-techniques)
  - [1. LLM-Based Content Filtering](#1-llm-based-content-filtering)
  - [2. Honeypot Fields](#2-honeypot-fields)
  - [3. Behavioral Analysis](#3-behavioral-analysis)
  - [4. Advanced Rate Limiting](#4-advanced-rate-limiting)
  - [5. CAPTCHA Integration](#5-captcha-integration)
  - [6. Content Filtering](#6-content-filtering)
- [Implementation Guides](#implementation-guides)
- [Testing](#testing)
- [Performance Considerations](#performance-considerations)
- [Cost Analysis](#cost-analysis)

---

## Overview

This document covers **advanced protection techniques** that go beyond Conduit's Phase 1 security features. These techniques provide defense-in-depth against sophisticated attacks, form spam, and API key abuse.

### Security Philosophy

**Defense-in-Depth**: Multiple layers of protection, each catching different types of abuse:

```
Client Request
    ↓
[1. Honeypot Fields]      ← Catches 90% of bots (zero cost)
    ↓
[2. CAPTCHA]              ← Catches sophisticated bots (free tier)
    ↓
[3. Behavioral Analysis]  ← Catches rapid-fire abuse (zero cost)
    ↓
[4. Content Filtering]    ← Catches keyword spam (zero cost)
    ↓
[5. LLM Filtering]        ← Catches semantic spam (low cost)
    ↓
[6. Rate Limiting]        ← Final backstop (zero cost)
    ↓
Message Sent
```

### Risk Reduction Matrix

| Technique | Bot Prevention | Spam Prevention | Stolen Key Protection | Cost | Complexity |
|-----------|----------------|-----------------|----------------------|------|------------|
| Honeypot Fields | 90% | 30% | 0% | $0 | Low |
| CAPTCHA | 99% | 50% | 0% | $0* | Low |
| Behavioral Analysis | 70% | 80% | 95% | $0 | Medium |
| Content Filtering | 40% | 70% | 60% | $0 | Low |
| LLM Filtering | 60% | 95% | 90% | $1-5/mo | Medium |
| IP Rate Limiting | 80% | 60% | 40% | $0 | Medium |

*CAPTCHA free for most use cases (Cloudflare Turnstile: 1M requests/month free)

### Recommended Implementation Order

**Quick Wins (< 1 hour):**
1. Honeypot fields (30 min)
2. Content filtering - keywords (15 min)
3. Behavioral analysis - submission timestamps (15 min)

**High Impact (1-4 hours):**
4. CAPTCHA integration (2 hours)
5. IP-based rate limiting (2 hours)
6. Content filtering - advanced (2 hours)

**Advanced (4-8 hours):**
7. LLM content filtering (4-6 hours)
8. Reputation-based throttling (2-4 hours)

---

## Protection Techniques

### 1. LLM-Based Content Filtering

**Purpose**: Detect spam, phishing, and malicious content using AI semantic analysis.

**Benefits**:
- Catches spam that keyword filters miss
- Detects phishing attempts and social engineering
- Adapts to new spam patterns automatically
- Works across languages

**Options**:

#### Option A: Local LLM (Ollama)

**Pros**:
- Zero ongoing cost
- Complete privacy (data never leaves server)
- No external API dependencies
- Fast response times (< 500ms)

**Cons**:
- Requires 4-8GB RAM for model
- CPU/GPU for inference
- Slightly lower accuracy than GPT-4

**Recommended Model**: `llama3.2:3b` (3.2B parameters, 2GB)

#### Option B: OpenAI API (GPT-4o-mini)

**Pros**:
- Highest accuracy (95%+ spam detection)
- No server resources needed
- Always latest model
- Automatic scaling

**Cons**:
- Cost: ~$0.15 per 1000 messages (with caching)
- External dependency
- Data sent to OpenAI (privacy consideration)
- 100-500ms latency

#### Option C: Hybrid Approach (Recommended)

**Strategy**:
1. Pre-filter with keyword rules (free, fast)
2. If suspicious, check with local Ollama (free, 500ms)
3. If still uncertain, escalate to GPT-4o-mini (paid, 200ms)

**Cost**: ~$0.02 per 1000 messages (95% handled by free tiers)

---

### Implementation: Local LLM with Ollama

#### Step 1: Install Ollama

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama service
ollama serve

# Pull model (3.2B parameters, ~2GB)
ollama pull llama3.2:3b
```

#### Step 2: Create LLM Service

**File**: `src/services/contentModeration.ts`

```typescript
/**
 * Content Moderation Service
 *
 * Uses LLM to detect spam, phishing, and malicious content.
 * Supports both local (Ollama) and API (OpenAI) backends.
 */

import { config } from '../config.js';

export interface ModerationResult {
  isSpam: boolean;
  confidence: number; // 0.0 - 1.0
  reason: string;
  categories: string[]; // ['spam', 'phishing', 'promotional']
  processingTimeMs: number;
}

export interface ModerationRequest {
  subject?: string;
  body: string;
  from?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Ollama LLM moderator (local, free)
 */
export class OllamaModerator {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeout: number;

  constructor(baseUrl = 'http://localhost:11434', model = 'llama3.2:3b') {
    this.baseUrl = baseUrl;
    this.model = model;
    this.timeout = 5000; // 5 second timeout
  }

  async moderate(request: ModerationRequest): Promise<ModerationResult> {
    const startTime = Date.now();

    const prompt = this.buildPrompt(request);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: 0.1, // Low temperature for consistent results
            num_predict: 100, // Limit response length
          },
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      const result = this.parseResponse(data.response);

      return {
        ...result,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      // If LLM fails, fail open (allow message but log warning)
      console.warn('LLM moderation failed, allowing message:', error);
      return {
        isSpam: false,
        confidence: 0,
        reason: 'LLM unavailable',
        categories: [],
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  private buildPrompt(request: ModerationRequest): string {
    return `You are a content moderator. Analyze this email and determine if it is spam, phishing, or malicious.

Subject: ${request.subject || 'N/A'}
Body: ${request.body}
From: ${request.from || 'N/A'}

Respond ONLY with a JSON object in this exact format:
{
  "isSpam": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation",
  "categories": ["spam", "phishing", "promotional", "legitimate"]
}

Examples of spam:
- "Click here to claim your prize!"
- "Make $10,000 per day working from home"
- "Your account has been compromised, click here"
- Multiple links to external sites
- Excessive capitalization or exclamation marks

Examples of legitimate:
- Contact form submissions with reasonable questions
- Support requests with genuine issues
- Business inquiries with professional tone

Analyze the content above and respond with JSON only:`;
  }

  private parseResponse(response: string): Omit<ModerationResult, 'processingTimeMs'> {
    try {
      // Extract JSON from response (handles markdown code blocks)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const result = JSON.parse(jsonMatch[0]);

      return {
        isSpam: result.isSpam === true,
        confidence: Math.min(1, Math.max(0, result.confidence || 0)),
        reason: result.reason || 'Unknown',
        categories: Array.isArray(result.categories) ? result.categories : [],
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      // Fail open on parsing errors
      return {
        isSpam: false,
        confidence: 0,
        reason: 'Parse error',
        categories: [],
      };
    }
  }
}

/**
 * OpenAI GPT-4o-mini moderator (API, paid)
 */
export class OpenAIModerator {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeout: number;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
    this.timeout = 10000; // 10 second timeout
  }

  async moderate(request: ModerationRequest): Promise<ModerationResult> {
    const startTime = Date.now();

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You are a content moderator. Analyze emails and respond with JSON only: {"isSpam": boolean, "confidence": 0-1, "reason": string, "categories": string[]}',
            },
            {
              role: 'user',
              content: `Subject: ${request.subject || 'N/A'}\nBody: ${request.body}\nFrom: ${request.from || 'N/A'}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 150,
          response_format: { type: 'json_object' }, // Force JSON response
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const result = JSON.parse(data.choices[0].message.content);

      return {
        isSpam: result.isSpam === true,
        confidence: Math.min(1, Math.max(0, result.confidence || 0)),
        reason: result.reason || 'Unknown',
        categories: Array.isArray(result.categories) ? result.categories : [],
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.warn('OpenAI moderation failed, allowing message:', error);
      return {
        isSpam: false,
        confidence: 0,
        reason: 'OpenAI unavailable',
        categories: [],
        processingTimeMs: Date.now() - startTime,
      };
    }
  }
}

/**
 * Hybrid moderator (uses cheapest available option)
 */
export class HybridModerator {
  private ollama?: OllamaModerator;
  private openai?: OpenAIModerator;
  private keywordFilter: KeywordFilter;

  constructor(options: {
    ollamaUrl?: string;
    ollamaModel?: string;
    openaiKey?: string;
    openaiModel?: string;
  }) {
    if (options.ollamaUrl) {
      this.ollama = new OllamaModerator(options.ollamaUrl, options.ollamaModel);
    }
    if (options.openaiKey) {
      this.openai = new OpenAIModerator(options.openaiKey, options.openaiModel);
    }
    this.keywordFilter = new KeywordFilter();
  }

  async moderate(request: ModerationRequest): Promise<ModerationResult> {
    // Stage 1: Keyword pre-filter (free, < 1ms)
    const keywordResult = this.keywordFilter.check(request);
    if (keywordResult.isSpam && keywordResult.confidence > 0.8) {
      // High-confidence spam from keywords, skip LLM
      return keywordResult;
    }

    // Stage 2: Try local Ollama first (free, ~500ms)
    if (this.ollama) {
      const ollamaResult = await this.ollama.moderate(request);
      if (ollamaResult.confidence > 0.7) {
        // Confident result from local LLM
        return ollamaResult;
      }
    }

    // Stage 3: Escalate to OpenAI for uncertain cases (paid, ~200ms)
    if (this.openai) {
      return await this.openai.moderate(request);
    }

    // No LLM available, use keyword result
    return keywordResult;
  }
}

/**
 * Simple keyword-based spam filter
 */
class KeywordFilter {
  private readonly spamKeywords = [
    'viagra',
    'cialis',
    'casino',
    'lottery',
    'winner',
    'claim your prize',
    'click here now',
    'limited time offer',
    'act now',
    'congratulations you won',
    'nigerian prince',
    'inheritance',
    'wire transfer',
    'bitcoin',
    'cryptocurrency investment',
    'make money fast',
    'work from home',
    'lose weight fast',
  ];

  check(request: ModerationRequest): Omit<ModerationResult, 'processingTimeMs'> {
    const startTime = Date.now();
    const content = `${request.subject || ''} ${request.body}`.toLowerCase();

    const matches = this.spamKeywords.filter((keyword) => content.includes(keyword));

    const isSpam = matches.length > 0;
    const confidence = Math.min(1, matches.length * 0.3);

    return {
      isSpam,
      confidence,
      reason: isSpam ? `Spam keywords detected: ${matches.join(', ')}` : 'No spam keywords',
      categories: isSpam ? ['spam', 'keyword-match'] : ['legitimate'],
      processingTimeMs: Date.now() - startTime,
    };
  }
}
```

#### Step 3: Create Moderation Middleware

**File**: `src/middleware/contentModeration.ts`

```typescript
/**
 * Content Moderation Middleware
 *
 * Checks message content for spam/malicious content before sending.
 */

import type { Context, Next } from 'hono';
import { config } from '../config.js';
import { HybridModerator } from '../services/contentModeration.js';
import { ValidationError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

let moderator: HybridModerator | null = null;

// Initialize moderator once at startup
if (config.contentModeration?.enabled) {
  moderator = new HybridModerator({
    ollamaUrl: config.contentModeration.ollamaUrl,
    ollamaModel: config.contentModeration.ollamaModel,
    openaiKey: config.contentModeration.openaiKey,
    openaiModel: config.contentModeration.openaiModel,
  });
}

export async function moderateContent(c: Context, next: Next) {
  // Skip if moderation disabled
  if (!moderator) {
    await next();
    return;
  }

  const body: any = await c.req.json();

  // Only moderate email channel (SMS/push have character limits)
  if (body.channel !== 'email') {
    await next();
    return;
  }

  // Build moderation request
  const moderationRequest = {
    subject: body.data?.subject,
    body: JSON.stringify(body.data), // Check all template data
    from: body.from?.email,
    metadata: {
      templateId: body.templateId,
      to: body.to,
    },
  };

  const result = await moderator.moderate(moderationRequest);

  // Log moderation result
  console.info('Content moderation result:', {
    isSpam: result.isSpam,
    confidence: result.confidence,
    reason: result.reason,
    categories: result.categories,
    processingTimeMs: result.processingTimeMs,
    templateId: body.templateId,
  });

  // Block if spam with high confidence
  if (result.isSpam && result.confidence > config.contentModeration.threshold) {
    throw new ValidationError(
      'Content appears to be spam or malicious',
      ErrorCode.CONTENT_MODERATION_FAILED,
      {
        reason: result.reason,
        confidence: result.confidence,
        categories: result.categories,
      }
    );
  }

  // Attach moderation result to context for logging
  c.set('moderationResult', result);

  await next();
}
```

#### Step 4: Update Configuration

**File**: `src/config.ts` (add to Config interface)

```typescript
export interface Config {
  // ... existing config ...

  // Content moderation (optional)
  contentModeration?: {
    enabled: boolean;
    threshold: number; // 0.0-1.0, block if confidence > threshold
    ollamaUrl?: string;
    ollamaModel?: string;
    openaiKey?: string;
    openaiModel?: string;
  };
}
```

**File**: `src/config.ts` (add to envSchema)

```typescript
// Content moderation configuration (optional)
CONTENT_MODERATION_ENABLED: z
  .string()
  .default('false')
  .transform((val) => val.toLowerCase() === 'true'),

CONTENT_MODERATION_THRESHOLD: z
  .string()
  .default('0.8')
  .transform((val) => parseFloat(val))
  .refine((val) => !isNaN(val) && val >= 0 && val <= 1, {
    message: 'CONTENT_MODERATION_THRESHOLD must be between 0 and 1',
  }),

OLLAMA_URL: z.string().default('http://localhost:11434').optional(),

OLLAMA_MODEL: z.string().default('llama3.2:3b').optional(),

OPENAI_API_KEY: z.string().optional(),

OPENAI_MODEL: z.string().default('gpt-4o-mini').optional(),
```

**File**: `src/config.ts` (add to config object)

```typescript
export const config: Config = {
  // ... existing config ...

  contentModeration: env.CONTENT_MODERATION_ENABLED
    ? {
        enabled: true,
        threshold: env.CONTENT_MODERATION_THRESHOLD,
        ollamaUrl: env.OLLAMA_URL,
        ollamaModel: env.OLLAMA_MODEL,
        openaiKey: env.OPENAI_API_KEY,
        openaiModel: env.OPENAI_MODEL,
      }
    : undefined,
};
```

#### Step 5: Environment Configuration

**File**: `.env` (add these lines)

```bash
# Content Moderation (optional)
CONTENT_MODERATION_ENABLED=true
CONTENT_MODERATION_THRESHOLD=0.8  # Block if confidence > 80%

# Local LLM (Ollama) - free, private
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b

# OpenAI API (fallback for uncertain cases)
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o-mini
```

#### Step 6: Docker Compose with Ollama

**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  conduit:
    build: .
    ports:
      - '3000:3000'
    environment:
      - CONTENT_MODERATION_ENABLED=true
      - OLLAMA_URL=http://ollama:11434
    depends_on:
      - ollama
    networks:
      - conduit-network

  ollama:
    image: ollama/ollama:latest
    ports:
      - '11434:11434'
    volumes:
      - ollama-data:/root/.ollama
    networks:
      - conduit-network
    # Pull model on startup
    command: >
      sh -c "ollama serve & sleep 5 && ollama pull llama3.2:3b && wait"

volumes:
  ollama-data:

networks:
  conduit-network:
    driver: bridge
```

**Start services:**

```bash
docker-compose up -d
```

#### Performance Optimization: Response Caching

**File**: `src/services/contentModeration.ts` (add to class)

```typescript
/**
 * Cached moderator (avoids duplicate LLM calls)
 */
export class CachedModerator {
  private moderator: HybridModerator;
  private cache: Map<string, ModerationResult>;
  private readonly maxCacheSize: number;
  private readonly cacheTtlMs: number;

  constructor(
    moderator: HybridModerator,
    maxCacheSize = 1000,
    cacheTtlMs = 3600000 // 1 hour
  ) {
    this.moderator = moderator;
    this.cache = new Map();
    this.maxCacheSize = maxCacheSize;
    this.cacheTtlMs = cacheTtlMs;
  }

  async moderate(request: ModerationRequest): Promise<ModerationResult> {
    // Generate cache key from content hash
    const cacheKey = this.generateCacheKey(request);

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return { ...cached, fromCache: true };
    }

    // Not in cache, moderate with LLM
    const result = await this.moderator.moderate(request);

    // Store in cache
    this.cache.set(cacheKey, { ...result, timestamp: Date.now() });

    // Evict oldest entries if cache full
    if (this.cache.size > this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    return result;
  }

  private generateCacheKey(request: ModerationRequest): string {
    const crypto = require('crypto');
    const content = JSON.stringify(request);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
```

**Cost Savings**: 80-95% reduction in LLM calls for duplicate/similar content.

---

### 2. Honeypot Fields

**Purpose**: Catch bots that auto-fill all form fields.

**How it works**:
1. Add hidden field to forms (invisible to humans via CSS)
2. Bots fill the field, humans don't
3. Server rejects if honeypot field is filled

**Effectiveness**: 90% of bots, zero cost, < 1ms processing time

#### Implementation

**Frontend** (Next.js/React example):

```tsx
// components/ContactForm.tsx
export function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
    website: '', // Honeypot field
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side honeypot check (optional, defense-in-depth)
    if (formData.website) {
      console.log('Bot detected (honeypot filled)');
      return;
    }

    await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'admin@company.com',
        data: {
          name: formData.name,
          email: formData.email,
          message: formData.message,
          honeypot: formData.website, // Send to backend for validation
        },
      }),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        name="name"
        placeholder="Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        required
      />

      <input
        type="email"
        name="email"
        placeholder="Email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        required
      />

      <textarea
        name="message"
        placeholder="Message"
        value={formData.message}
        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
        required
      />

      {/* Honeypot field - hidden via CSS */}
      <input
        type="text"
        name="website"
        className="honeypot"
        value={formData.website}
        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
        autoComplete="off"
        tabIndex={-1}
      />

      <button type="submit">Send</button>
    </form>
  );
}
```

**CSS** (make honeypot invisible):

```css
/* Hide honeypot field from humans, visible to bots */
.honeypot {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
```

**Backend Middleware**:

**File**: `src/middleware/honeypot.ts`

```typescript
/**
 * Honeypot Field Validation
 *
 * Rejects requests if honeypot field is filled (bot detected).
 */

import type { Context, Next } from 'hono';
import { ValidationError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

export async function checkHoneypot(c: Context, next: Next) {
  const body: any = await c.req.json();

  // Check if template data contains honeypot field
  if (body.data && body.data.honeypot) {
    // Log bot attempt for monitoring
    console.warn('Honeypot triggered - bot detected:', {
      apiKey: c.get('apiKey'),
      templateId: body.templateId,
      honeypotValue: body.data.honeypot,
      ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    // Return error (don't reveal honeypot mechanism)
    throw new ValidationError(
      'Invalid form submission',
      ErrorCode.VALIDATION_ERROR,
      { field: 'honeypot' }
    );
  }

  await next();
}
```

**Integration** (add to middleware stack):

**File**: `src/index.ts`

```typescript
// Apply honeypot check before send route (after auth)
app.use('/api/send', authenticate);
app.use('/api/send', checkHoneypot); // Add this line
app.route('/api', send);
```

**Advanced Honeypot**: Multiple honeypot fields with different names:

```typescript
const HONEYPOT_FIELDS = [
  'website', // Common honeypot name
  'url', // Alternative name
  'phone2', // Looks like legitimate field
  'address2', // Looks like legitimate field
];

export function checkHoneypot(c: Context, next: Next) {
  const body: any = await c.req.json();

  // Check if ANY honeypot field is filled
  for (const field of HONEYPOT_FIELDS) {
    if (body.data && body.data[field]) {
      // Bot detected
      throw new ValidationError('Invalid form submission', ErrorCode.VALIDATION_ERROR);
    }
  }

  await next();
}
```

---

### 3. Behavioral Analysis

**Purpose**: Detect automated/suspicious submission patterns.

**Signals**:
- Form filled too quickly (< 3 seconds)
- Rapid-fire submissions from same API key
- Submissions at unusual times (2-5 AM)
- Multiple submissions with similar content
- Copy-paste patterns (no typing variation)

#### Implementation

**File**: `src/middleware/behavioralAnalysis.ts`

```typescript
/**
 * Behavioral Analysis Middleware
 *
 * Detects suspicious submission patterns (rapid-fire, too fast, etc.)
 */

import type { Context, Next } from 'hono';
import { ValidationError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

// In-memory store (use Redis in production)
const submissionTimestamps = new Map<string, number[]>();
const formStartTimes = new Map<string, number>();

export async function analyzeBehavior(c: Context, next: Next) {
  const apiKey = c.get('apiKey');
  const body: any = await c.req.json();
  const now = Date.now();

  // Check 1: Form filled too quickly
  const formStartTime = body.data?.formStartTime; // Frontend sends this
  if (formStartTime && now - formStartTime < 3000) {
    console.warn('Form filled too quickly (<3s):', {
      apiKey,
      durationMs: now - formStartTime,
    });

    throw new ValidationError(
      'Form submitted too quickly',
      ErrorCode.VALIDATION_ERROR,
      { hint: 'Please take your time filling out the form' }
    );
  }

  // Check 2: Rapid-fire submissions (> 3 submissions in 10 seconds)
  const timestamps = submissionTimestamps.get(apiKey) || [];
  const recentSubmissions = timestamps.filter((ts) => now - ts < 10000);

  if (recentSubmissions.length >= 3) {
    console.warn('Rapid-fire submissions detected:', {
      apiKey,
      submissionCount: recentSubmissions.length,
      windowMs: 10000,
    });

    throw new ValidationError(
      'Too many submissions in short time',
      ErrorCode.RATE_LIMIT_EXCEEDED,
      { retryAfter: 10 }
    );
  }

  // Store timestamp
  recentSubmissions.push(now);
  submissionTimestamps.set(apiKey, recentSubmissions);

  // Check 3: Suspicious submission time (2-5 AM local time)
  const hour = new Date().getHours();
  if (hour >= 2 && hour < 5) {
    console.warn('Submission during suspicious hours (2-5 AM):', {
      apiKey,
      hour,
    });

    // Don't block, but flag for review
    c.set('suspiciousTime', true);
  }

  await next();
}

// Cleanup old timestamps every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of submissionTimestamps.entries()) {
    const recent = timestamps.filter((ts) => now - ts < 60000);
    if (recent.length === 0) {
      submissionTimestamps.delete(key);
    } else {
      submissionTimestamps.set(key, recent);
    }
  }
}, 300000);
```

**Frontend** (send form start time):

```tsx
export function ContactForm() {
  const [formStartTime] = useState(Date.now());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await fetch('/api/send', {
      method: 'POST',
      body: JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'admin@company.com',
        data: {
          name: formData.name,
          email: formData.email,
          message: formData.message,
          formStartTime, // Send form start time
        },
      }),
    });
  };
}
```

---

### 4. Advanced Rate Limiting

#### IP-Based Rate Limiting

**Purpose**: Limit requests per IP address (secondary to API key limits).

**File**: `src/middleware/ipRateLimit.ts`

```typescript
/**
 * IP-Based Rate Limiting
 *
 * Secondary rate limit based on client IP address.
 * Complements API key rate limiting for defense-in-depth.
 */

import type { Context, Next } from 'hono';
import { RateLimitError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

interface IpBucket {
  tokens: number;
  lastRefill: number;
}

const ipBuckets = new Map<string, IpBucket>();

const IP_RATE_LIMITS = {
  perMinute: 20, // More generous than API key limits
  perHour: 200,
};

export async function ipRateLimit(c: Context, next: Next) {
  // Get client IP (handle proxies)
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    'unknown';

  if (ip === 'unknown') {
    // Can't rate limit without IP, allow but log warning
    console.warn('Unable to determine client IP for rate limiting');
    await next();
    return;
  }

  // Get or create bucket for this IP
  let bucket = ipBuckets.get(ip);
  if (!bucket) {
    bucket = { tokens: IP_RATE_LIMITS.perMinute, lastRefill: Date.now() };
    ipBuckets.set(ip, bucket);
  }

  // Refill tokens (1 per 3 seconds = 20 per minute)
  const now = Date.now();
  const timeSinceRefill = now - bucket.lastRefill;
  const tokensToAdd = Math.floor(timeSinceRefill / 3000); // 1 token per 3 seconds

  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(IP_RATE_LIMITS.perMinute, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  // Check if bucket has tokens
  if (bucket.tokens < 1) {
    console.warn('IP rate limit exceeded:', { ip });

    throw new RateLimitError(
      'Too many requests from this IP',
      ErrorCode.RATE_LIMIT_EXCEEDED,
      { retryAfter: 3 }
    );
  }

  // Consume token
  bucket.tokens -= 1;

  await next();
}

// Cleanup old IP buckets every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of ipBuckets.entries()) {
    if (now - bucket.lastRefill > 600000) {
      // 10 minutes
      ipBuckets.delete(ip);
    }
  }
}, 600000);
```

#### Domain-Based Rate Limiting

**Purpose**: Limit requests per recipient domain (e.g., max 10/hour to gmail.com).

**File**: `src/middleware/domainRateLimit.ts`

```typescript
/**
 * Domain-Based Rate Limiting
 *
 * Limits messages sent to same recipient domain.
 * Prevents abuse where stolen keys spam single provider.
 */

import type { Context, Next } from 'hono';
import { RateLimitError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

const domainBuckets = new Map<string, { count: number; resetAt: number }>();

const DOMAIN_LIMITS = {
  perHour: 100, // Max 100 emails per hour to same domain
  perDay: 500, // Max 500 emails per day to same domain
};

export async function domainRateLimit(c: Context, next: Next) {
  const body: any = await c.req.json();

  if (body.channel !== 'email') {
    await next();
    return;
  }

  // Extract domain from recipient email
  const recipientEmail = body.to;
  const domain = recipientEmail.split('@')[1]?.toLowerCase();

  if (!domain) {
    await next();
    return;
  }

  // Get or create bucket for this domain
  const now = Date.now();
  const hourKey = `${domain}:hour`;
  let hourBucket = domainBuckets.get(hourKey);

  if (!hourBucket || now > hourBucket.resetAt) {
    // Create new bucket or reset expired one
    hourBucket = {
      count: 0,
      resetAt: now + 3600000, // 1 hour from now
    };
    domainBuckets.set(hourKey, hourBucket);
  }

  // Check limit
  if (hourBucket.count >= DOMAIN_LIMITS.perHour) {
    console.warn('Domain rate limit exceeded:', { domain, limit: 'hourly' });

    throw new RateLimitError(
      `Too many emails to ${domain}`,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      { retryAfter: Math.ceil((hourBucket.resetAt - now) / 1000) }
    );
  }

  // Increment counter
  hourBucket.count += 1;

  await next();
}
```

#### Reputation-Based Throttling

**Purpose**: Slow down suspicious API keys without blocking completely.

**File**: `src/middleware/reputationThrottling.ts`

```typescript
/**
 * Reputation-Based Throttling
 *
 * API keys with poor reputation get slower rate limits.
 * Reputation score based on:
 * - Spam detection rate
 * - Bounce rate
 * - Complaint rate
 * - Age of API key
 */

import type { Context, Next } from 'hono';
import { config } from '../config.js';

interface ApiKeyReputation {
  score: number; // 0-100 (100 = excellent)
  spamAttempts: number;
  totalRequests: number;
  createdAt: number;
}

const reputations = new Map<string, ApiKeyReputation>();

export async function reputationThrottling(c: Context, next: Next) {
  const apiKey = c.get('apiKey');

  // Get or create reputation
  let reputation = reputations.get(apiKey);
  if (!reputation) {
    reputation = {
      score: 100, // Start with perfect score
      spamAttempts: 0,
      totalRequests: 0,
      createdAt: Date.now(),
    };
    reputations.set(apiKey, reputation);
  }

  // Increment total requests
  reputation.totalRequests += 1;

  // Check if previous request was flagged as spam
  const moderationResult = c.get('moderationResult');
  if (moderationResult?.isSpam) {
    reputation.spamAttempts += 1;
    // Decrease score (spam penalty)
    reputation.score = Math.max(0, reputation.score - 5);
  } else {
    // Slowly improve score for good behavior
    reputation.score = Math.min(100, reputation.score + 0.1);
  }

  // Apply throttling based on reputation
  if (reputation.score < 50) {
    // Poor reputation: enforce 5 second delay
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.warn('Throttled request due to poor reputation:', {
      apiKey,
      score: reputation.score,
    });
  } else if (reputation.score < 70) {
    // Medium reputation: enforce 2 second delay
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Attach reputation to context for logging
  c.set('reputation', reputation);

  await next();
}
```

---

### 5. CAPTCHA Integration

**Purpose**: Verify human users, block automated bots.

**Recommendation**: Cloudflare Turnstile (free, privacy-friendly, invisible)

#### Implementation: Cloudflare Turnstile

**Step 1: Get Turnstile Keys**

1. Go to Cloudflare Dashboard → Turnstile
2. Create new site
3. Copy Site Key and Secret Key

**Step 2: Frontend Integration**

```tsx
// components/ContactForm.tsx
import { useEffect, useState } from 'react';

export function ContactForm() {
  const [turnstileToken, setTurnstileToken] = useState('');

  useEffect(() => {
    // Load Turnstile script
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!turnstileToken) {
      alert('Please complete CAPTCHA verification');
      return;
    }

    await fetch('/api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Turnstile-Token': turnstileToken, // Send token in header
      },
      body: JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'admin@company.com',
        data: {
          name: formData.name,
          email: formData.email,
          message: formData.message,
        },
      }),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* ... form fields ... */}

      {/* Turnstile widget */}
      <div
        className="cf-turnstile"
        data-sitekey="YOUR_SITE_KEY"
        data-callback={(token) => setTurnstileToken(token)}
      />

      <button type="submit">Send</button>
    </form>
  );
}
```

**Step 3: Backend Verification**

**File**: `src/middleware/captcha.ts`

```typescript
/**
 * CAPTCHA Verification Middleware
 *
 * Verifies Cloudflare Turnstile tokens.
 */

import type { Context, Next } from 'hono';
import { config } from '../config.js';
import { ValidationError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

export async function verifyCaptcha(c: Context, next: Next) {
  // Skip if CAPTCHA disabled
  if (!config.captcha?.enabled) {
    await next();
    return;
  }

  // Get token from header
  const token = c.req.header('X-Turnstile-Token');

  if (!token) {
    throw new ValidationError(
      'CAPTCHA verification required',
      ErrorCode.VALIDATION_ERROR,
      { field: 'captcha' }
    );
  }

  // Verify token with Cloudflare
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: config.captcha.secretKey,
      response: token,
      remoteip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    }),
  });

  const result = await response.json();

  if (!result.success) {
    console.warn('CAPTCHA verification failed:', {
      errorCodes: result['error-codes'],
      token: token.substring(0, 20) + '...',
    });

    throw new ValidationError(
      'CAPTCHA verification failed',
      ErrorCode.VALIDATION_ERROR,
      { errors: result['error-codes'] }
    );
  }

  // CAPTCHA passed
  c.set('captchaVerified', true);

  await next();
}
```

**Step 4: Configuration**

**File**: `src/config.ts`

```typescript
export interface Config {
  // ... existing config ...

  captcha?: {
    enabled: boolean;
    secretKey: string;
  };
}

// Add to envSchema
CAPTCHA_ENABLED: z
  .string()
  .default('false')
  .transform((val) => val.toLowerCase() === 'true'),

TURNSTILE_SECRET_KEY: z.string().optional(),

// Add to config object
captcha: env.CAPTCHA_ENABLED
  ? {
      enabled: true,
      secretKey: getEnvVar('TURNSTILE_SECRET_KEY'), // Required if enabled
    }
  : undefined,
```

**Environment variables:**

```bash
CAPTCHA_ENABLED=true
TURNSTILE_SECRET_KEY=0x...
```

---

### 6. Content Filtering

#### Keyword Blacklist

**File**: `src/utils/contentFilter.ts`

```typescript
/**
 * Content Filtering Utilities
 *
 * Keyword blacklists, URL detection, disposable email detection.
 */

export class ContentFilter {
  private readonly spamKeywords = [
    // Pharmaceutical spam
    'viagra',
    'cialis',
    'pharmacy',
    'prescription',

    // Financial spam
    'casino',
    'lottery',
    'prize',
    'winner',
    'claim',
    'inheritance',
    'wire transfer',

    // Crypto spam
    'bitcoin',
    'crypto',
    'investment opportunity',
    'make money fast',

    // Phishing
    'verify your account',
    'click here now',
    'urgent action required',
    'suspended account',

    // SEO spam
    'increase traffic',
    'rank higher',
    'backlinks',

    // Other
    'work from home',
    'lose weight fast',
    'limited time offer',
  ];

  checkKeywords(text: string): { isSpam: boolean; matches: string[] } {
    const lowerText = text.toLowerCase();
    const matches = this.spamKeywords.filter((keyword) => lowerText.includes(keyword));

    return {
      isSpam: matches.length > 0,
      matches,
    };
  }

  checkUrls(text: string): { hasUrls: boolean; urlCount: number; urls: string[] } {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex) || [];

    return {
      hasUrls: urls.length > 0,
      urlCount: urls.length,
      urls,
    };
  }

  checkDisposableEmail(email: string): boolean {
    const disposableDomains = [
      'tempmail.com',
      'guerrillamail.com',
      '10minutemail.com',
      'mailinator.com',
      'throwaway.email',
    ];

    const domain = email.split('@')[1]?.toLowerCase();
    return disposableDomains.includes(domain);
  }

  checkExcessiveCaps(text: string): { isExcessive: boolean; capsPercentage: number } {
    const totalLetters = text.replace(/[^a-zA-Z]/g, '').length;
    const capsLetters = text.replace(/[^A-Z]/g, '').length;

    const capsPercentage = totalLetters > 0 ? (capsLetters / totalLetters) * 100 : 0;

    return {
      isExcessive: capsPercentage > 50, // > 50% caps is suspicious
      capsPercentage,
    };
  }

  analyzeContent(subject: string, body: string, fromEmail: string): {
    score: number; // 0-100 (100 = definitely spam)
    reasons: string[];
  } {
    let score = 0;
    const reasons: string[] = [];

    // Check keywords
    const keywordCheck = this.checkKeywords(`${subject} ${body}`);
    if (keywordCheck.isSpam) {
      score += keywordCheck.matches.length * 15;
      reasons.push(`Spam keywords: ${keywordCheck.matches.join(', ')}`);
    }

    // Check URLs
    const urlCheck = this.checkUrls(body);
    if (urlCheck.urlCount > 3) {
      score += 20;
      reasons.push(`Excessive URLs: ${urlCheck.urlCount}`);
    }

    // Check disposable email
    if (this.checkDisposableEmail(fromEmail)) {
      score += 25;
      reasons.push('Disposable email address');
    }

    // Check excessive caps
    const capsCheck = this.checkExcessiveCaps(`${subject} ${body}`);
    if (capsCheck.isExcessive) {
      score += 15;
      reasons.push(`Excessive capitalization: ${capsCheck.capsPercentage.toFixed(0)}%`);
    }

    // Check subject length
    if (subject.length > 100) {
      score += 10;
      reasons.push('Unusually long subject line');
    }

    // Normalize score to 0-100
    score = Math.min(100, score);

    return { score, reasons };
  }
}
```

**Middleware Integration:**

```typescript
// src/middleware/contentFilter.ts
import { ContentFilter } from '../utils/contentFilter.js';

const filter = new ContentFilter();

export async function filterContent(c: Context, next: Next) {
  const body: any = await c.req.json();

  const analysis = filter.analyzeContent(
    body.data?.subject || '',
    JSON.stringify(body.data),
    body.from?.email || ''
  );

  if (analysis.score > 70) {
    console.warn('Content filter triggered:', analysis);

    throw new ValidationError(
      'Content appears to be spam',
      ErrorCode.VALIDATION_ERROR,
      { reasons: analysis.reasons }
    );
  }

  c.set('contentFilterScore', analysis.score);

  await next();
}
```

---

## Testing

### Unit Tests

**File**: `tests/security/contentModeration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OllamaModerator, ContentFilter } from '@/services/contentModeration.js';

describe('Content Moderation', () => {
  describe('OllamaModerator', () => {
    it('should detect spam content', async () => {
      const moderator = new OllamaModerator();

      const result = await moderator.moderate({
        subject: 'CLAIM YOUR PRIZE NOW!!!',
        body: 'Click here to claim your $10,000 prize. Limited time offer!',
      });

      expect(result.isSpam).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.categories).toContain('spam');
    });

    it('should allow legitimate contact form', async () => {
      const moderator = new OllamaModerator();

      const result = await moderator.moderate({
        subject: 'Question about pricing',
        body: 'Hi, I would like to know more about your Enterprise plan. Can you send me details?',
      });

      expect(result.isSpam).toBe(false);
      expect(result.categories).toContain('legitimate');
    });
  });

  describe('ContentFilter', () => {
    it('should detect spam keywords', () => {
      const filter = new ContentFilter();

      const result = filter.checkKeywords('Buy viagra and cialis now!');

      expect(result.isSpam).toBe(true);
      expect(result.matches).toContain('viagra');
      expect(result.matches).toContain('cialis');
    });

    it('should detect excessive URLs', () => {
      const filter = new ContentFilter();

      const text = `
        Visit https://site1.com and https://site2.com
        Also check https://site3.com and https://site4.com
      `;

      const result = filter.checkUrls(text);

      expect(result.hasUrls).toBe(true);
      expect(result.urlCount).toBe(4);
    });

    it('should detect disposable emails', () => {
      const filter = new ContentFilter();

      expect(filter.checkDisposableEmail('user@tempmail.com')).toBe(true);
      expect(filter.checkDisposableEmail('user@company.com')).toBe(false);
    });
  });
});
```

### Integration Tests

**File**: `tests/integration/advancedProtection.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import app from '@/index.js';

describe('Advanced Protection Integration', () => {
  it('should block honeypot-filled forms', async () => {
    const response = await app.request('/api/send', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'admin@company.com',
        data: {
          name: 'John Doe',
          email: 'john@example.com',
          message: 'Hello',
          honeypot: 'bot-filled-this', // Honeypot triggered
        },
      }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.code).toBe('VALIDATION_ERROR');
  });

  it('should block rapid-fire submissions', async () => {
    // Make 3 rapid requests
    const requests = Array.from({ length: 3 }, () =>
      app.request('/api/send', {
        method: 'POST',
        headers: {
          'X-API-Key': 'valid-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: 'email',
          templateId: 'contact-form',
          to: 'admin@company.com',
          data: { name: 'Test', email: 'test@example.com', message: 'Test' },
        }),
      })
    );

    const responses = await Promise.all(requests);

    // At least one should be rate limited
    const rateLimited = responses.some((r) => r.status === 429);
    expect(rateLimited).toBe(true);
  });
});
```

---

## Performance Considerations

### Response Time Targets

| Protection Layer | Target | Acceptable | Notes |
|------------------|--------|------------|-------|
| Honeypot check | < 1ms | < 5ms | Simple field check |
| Keyword filter | < 5ms | < 20ms | Regex matching |
| Behavioral analysis | < 10ms | < 50ms | Timestamp checks |
| CAPTCHA verify | < 200ms | < 500ms | External API call |
| LLM (local) | < 500ms | < 2s | Ollama inference |
| LLM (API) | < 200ms | < 1s | OpenAI API |

### Optimization Strategies

**1. Caching**:
```typescript
// Cache LLM results for 1 hour (identical content)
const contentHash = crypto.createHash('sha256').update(content).digest('hex');
const cached = cache.get(contentHash);
if (cached) return cached;
```

**2. Parallel Checks**:
```typescript
// Run multiple checks in parallel
const [honeypotResult, keywordResult, behaviorResult] = await Promise.all([
  checkHoneypot(body),
  filterKeywords(body),
  analyzeBehavior(body),
]);
```

**3. Early Termination**:
```typescript
// Stop processing if high-confidence spam detected
if (keywordResult.confidence > 0.9) {
  return { isSpam: true, ... }; // Skip expensive LLM check
}
```

**4. Async Logging**:
```typescript
// Don't block request for logging
setImmediate(() => {
  logModerationResult(result);
});
```

---

## Cost Analysis

### Monthly Cost Estimates (1,000 messages/day)

| Protection | Setup Cost | Monthly Cost | Notes |
|------------|------------|--------------|-------|
| Honeypot | $0 | $0 | Zero cost |
| CAPTCHA (Turnstile) | $0 | $0 | 1M free/month |
| Behavioral Analysis | $0 | $0 | In-memory tracking |
| Content Filter | $0 | $0 | Keyword matching |
| **Local LLM (Ollama)** | $0 | $0 | Requires 4GB RAM |
| **OpenAI GPT-4o-mini** | $0 | ~$4.50 | $0.15/1000 input tokens |
| **Hybrid (recommended)** | $0 | ~$0.60 | 90% handled by free tiers |

**Total Recommended Cost**: **$0-1/month** (hybrid approach)

### Cost Reduction Strategies

1. **Pre-filtering**: Use free keyword filter before LLM (reduces LLM calls 80%)
2. **Caching**: Cache LLM results for identical content (reduces calls 50%)
3. **Local LLM**: Use Ollama for majority, OpenAI for edge cases only
4. **Rate limiting**: Prevents abuse that would increase costs

---

## Summary

**Quick Implementation Checklist**:

- [ ] **15-minute wins**:
  - [ ] Add honeypot field to forms
  - [ ] Implement keyword filter
  - [ ] Add form timing check

- [ ] **1-hour wins**:
  - [ ] Integrate Cloudflare Turnstile
  - [ ] Add IP-based rate limiting
  - [ ] Implement behavioral analysis

- [ ] **Advanced** (if needed):
  - [ ] Set up Ollama for local LLM
  - [ ] Configure OpenAI fallback
  - [ ] Enable domain-based rate limiting
  - [ ] Implement reputation throttling

**Next Steps**:
1. Read [spam-prevention.md](./spam-prevention.md) for practical implementation guide
2. Choose protection layers based on your threat model
3. Start with free/easy options (honeypot, keywords, CAPTCHA)
4. Add LLM filtering if spam persists
5. Monitor effectiveness and adjust thresholds

**Need Help?**
- See [spam-prevention.md](./spam-prevention.md) for quick start guide
- See [recipient-whitelisting.md](../features/recipient-whitelisting.md) for stolen key protection
- See [implementation.md](./implementation.md) for Phase 1 security features
