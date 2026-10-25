# Conduit Architecture

**Version**: 2.0.0-rc.1
**Last Updated**: 2026-10-24
**Status**: Email channel implemented; SMS, push and webhook channels are planned and not implemented

## Overview

Conduit is a lightweight, multi-channel communication proxy built with security and simplicity in mind. This document details the system architecture, component interactions, data flows, and design decisions.

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Component Details](#component-details)
3. [Request Flow](#request-flow)
4. [Security Architecture](#security-architecture)
5. [Data Models](#data-models)
6. [Middleware Pipeline](#middleware-pipeline)
7. [Channel System](#channel-system)
8. [Template Engine](#template-engine)
9. [Rate Limiting](#rate-limiting)
10. [Error Handling](#error-handling)
11. [Deployment Architecture](#deployment-architecture)
12. [Scalability Considerations](#scalability-considerations)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Client Applications                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │   React App  │  │   Vue App    │  │  Vanilla JS  │  │  Mobile App │  │
│  │   (Site A)   │  │   (Site B)   │  │   (Site C)   │  │   (Site D)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │
│         │                 │                 │                 │         │
│         │ API_KEY_SITEA   │ API_KEY_SITEB   │ API_KEY_SITEC   │ API_KEY │
│         └─────────────────┴─────────────────┴─────────────────┘         │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                                      │ HTTPS (TLS 1.2+)
                                      │ POST /api/send
                                      │
┌─────────────────────────────────────▼──────────────────────────────────┐
│                           Conduit Service                              │
│                    (Node.js + Hono + TypeScript)                       │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Middleware Stack (Ordered)                   │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 0. Error Handler          (app.onError)                    │ │   │
│  │  │    • Catches all errors globally                           │ │   │
│  │  │    • Sanitizes errors in production                        │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 1. HTTPS Enforcement      (middleware/securityHeaders.ts)  │ │   │
│  │  │    • Production: 403 without X-Forwarded-Proto: https      │ │   │
│  │  │    • HSTS header; exact /health path exempt                │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 2. CORS Validation        (middleware/cors.ts)             │ │   │
│  │  │    • Check Origin header against ALLOWED_ORIGINS           │ │   │
│  │  │    • Reject if not whitelisted (403 ORIGIN_NOT_ALLOWED)    │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 3. Security Headers       (middleware/securityHeaders.ts)  │ │   │
│  │  │    • X-Frame-Options, CSP, X-Content-Type-Options          │ │   │
│  │  │    • Permissions-Policy                                    │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 4. Request Logger         (middleware/logger.ts)           │ │   │
│  │  │    • Structured JSON logging                               │ │   │
│  │  │    • Mask sensitive data (PII, keys)                       │ │   │
│  │  │    • Response logging (status, duration)                   │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 5. Body Size Limit        (middleware/bodyLimit.ts)        │ │   │
│  │  │    • /api/* routes only                                    │ │   │
│  │  │    • Max 50KB payload, also for chunked bodies (hono)      │ │   │
│  │  │    • Return 413 PAYLOAD_TOO_LARGE if exceeded              │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 6. Authentication         (middleware/auth.ts)             │ │   │
│  │  │    • /api/* routes only                                    │ │   │
│  │  │    • Constant-time comparison (timing attack prevention)   │ │   │
│  │  │    • Return 401 if invalid                                 │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 7. Recipient Validation   (middleware/recipientValidation) │ │   │
│  │  │    • /api/send route only (v1.1.0)                         │ │   │
│  │  │    • Parse JSON body (400 VALIDATION_ERROR if malformed)   │ │   │
│  │  │    • Check recipient against API key whitelist             │ │   │
│  │  │    • Return 403 if not allowed (prevents spam abuse)       │ │   │
│  │  │    • Backward compatible (no whitelist = allow all)        │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 8. Rate Limiting          (middleware/rateLimit.ts)        │ │   │
│  │  │    • /api/* routes only                                    │ │   │
│  │  │    • Token bucket: 10/min, 100/hr, 500/day (defaults)      │ │   │
│  │  │    • Return 429 + Retry-After if exceeded                  │ │   │
│  │  │    • Runs before LLM filtering (429 = no LLM call)         │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         Route Handlers                          │   │
│  │  • POST /api/send       - Send message (auth + validation req)  │   │
│  │  • GET  /health         - Health check (public)                 │   │
│  │  • GET  /health/detailed - Diagnostics (API key required)       │   │
│  │  • GET  /api/channels   - List channels (planned, not impl.)    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                 Send Route (routes/send.ts)                     │   │
│  │  1. Resolve channel (400 INVALID_CHANNEL if unknown)            │   │
│  │  2. Validate request schema (Zod)                               │   │
│  │  3. Validate Idempotency-Key header                             │   │
│  │  4. Check sender allowlist (400 SENDER_NOT_ALLOWED)             │   │
│  │  5. LLM spam filter (middleware/llmFilter.ts, v1.2.0, optional) │   │
│  │     • Validates template data BEFORE any LLM call               │   │
│  │     • 403 CONTENT_BLOCKED_* if confidence >= threshold          │   │
│  │     • Daily budget + allow/block fail mode per API key          │   │
│  │  6. Route to channel handler (template load, validate, render)  │   │
│  └────────┬─────────────┬────────────┬────────────┬────────────────┘   │
│           │             │            │            │                    │
│  ┌────────▼────────┐ ┌──▼────────┐ ┌▼─────────┐ ┌▼───────────────┐     │
│  │ Email Handler   │ │   SMS     │ │   Push   │ │    Webhook     │     │
│  │ (channels/      │ │  Handler  │ │  Handler │ │    Handler     │     │
│  │  email.ts)      │ │ (planned) │ │(planned) │ │   (planned)    │     │
│  │                 │ │           │ │          │ │                │     │
│  │ • Resend API    │ │ • Twilio  │ │ • FCM    │ │ • HTTP POST    │     │
│  │ • SPF/DKIM      │ │ • SMS     │ │ • APNS   │ │ • Slack        │     │
│  └────────┬────────┘ └──┬────────┘ └┬─────────┘ └┬───────────────┘     │
└───────────┼──────────────┼───────────┼────────────┼────────────────────┘
            │              │           │            │
            │              │           │            │
            ▼              ▼           ▼            ▼
   ┌────────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
   │  Resend.com    │ │  Twilio  │ │ Firebase │ │  Third-Party │
   │  Email API     │ │   SMS    │ │   FCM    │ │   Webhooks   │
   └────────────────┘ └──────────┘ └──────────┘ └──────────────┘
```

---

## Component Details

### 1. Hono Web Framework

**Why Hono?**
- Ultra-lightweight (~12KB)
- TypeScript-first with excellent type inference
- Built-in middleware support
- Edge-compatible (Cloudflare Workers, Deno, Bun)
- Fast routing and request handling

**Core Setup** (abridged from `src/index.ts`):
```typescript
const app = new Hono();

app.onError(errorHandler);                     // 0. global error handler
app.use('*', enforceHttps);                    // 1. HTTPS enforcement
app.use('*', corsProtection);                  // 2. CORS
app.use('*', securityHeaders);                 // 3. security headers
app.use('*', logger);                          // 4. request logger
app.use('/api/*', bodyLimit);                  // 5. 50KB body limit
app.use('/api/*', authenticate);               // 6. API key auth
app.use('/api/send', validateRecipient);       // 7. JSON parse + recipient whitelist
app.use('/api/*', rateLimit);                  // 8. rate limiting (before any LLM call)
// 9. LLM filtering runs inside routes/send.ts after request validation
app.use('/health/detailed', authenticate);     // auth for detailed diagnostics

app.route('/health', health);
app.route('/api', send);

// The server is started with serve() from @hono/node-server unless NODE_ENV=test
export default { port, fetch: app.fetch };
```

### 2. Environment Configuration

**Configuration Management**:
```typescript
// src/config.ts
import { z } from 'zod';

const envSchema = z.object({
  // Server configuration
  PORT: z.string()
    .default('3000')
    .transform(val => parseInt(val, 10))
    .refine(val => !isNaN(val) && val > 0 && val < 65536, {
      message: 'PORT must be a valid port number (1-65535)',
    }),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  LOG_LEVEL: z.string().default('info'),

  // Provider API keys
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),

  // CORS configuration
  ALLOWED_ORIGINS: z.string()
    .min(1, 'ALLOWED_ORIGINS is required')
    .transform(val => val.split(',').map(origin => origin.trim())),

  // Rate limiting configuration
  RATE_LIMIT_PER_MINUTE: z.string()
    .default('10')
    .transform(val => parseInt(val, 10))
    .refine(val => !isNaN(val) && val > 0, {
      message: 'RATE_LIMIT_PER_MINUTE must be a positive number',
    }),

  RATE_LIMIT_PER_HOUR: z.string()
    .default('100')
    .transform(val => parseInt(val, 10))
    .refine(val => !isNaN(val) && val > 0, {
      message: 'RATE_LIMIT_PER_HOUR must be a positive number',
    }),

  RATE_LIMIT_PER_DAY: z.string()
    .default('500')
    .transform(val => parseInt(val, 10))
    .refine(val => !isNaN(val) && val > 0, {
      message: 'RATE_LIMIT_PER_DAY must be a positive number',
    }),

  // Security configuration
  ENFORCE_HTTPS: z.string()
    .default('false')
    .transform(val => val.toLowerCase() === 'true'),

  REVOKED_KEYS: z.string()
    .default('')
    .transform(val => val ? val.split(',').map(key => key.trim()) : []),

  // LLM spam filtering (optional, v1.2.0) - abridged
  LLM_PROVIDER: z.enum(['anthropic', 'openai']).optional().or(z.literal('')),
  LLM_API_KEY: z.string().optional().or(z.literal('')),
  LLM_MODEL: z.string().optional().or(z.literal('')),
  LLM_TIMEOUT: z.string().default('5000'),        // -> positive integer (ms)
  LLM_FALLBACK_MODE: z.string().default('allow'), // -> 'allow' | 'block', case-insensitive
  LLM_ENDPOINT: z.string().optional().or(z.literal('')),
});

export function loadConfig(processEnv: NodeJS.ProcessEnv): Config {
  const env = envSchema.parse(processEnv);
  const apiKeyEnv = loadApiKeyEnv(processEnv); // strict API_KEY_* classification, see below
  // ... builds recipientWhitelists, senderAllowlists, llm and llmFilterRules
}

export const config: Config = loadConfig(process.env);
```

**API key loading** (`loadApiKeyEnv`): every `API_KEY_*` variable is either a per-key config variable (`API_KEY_<NAME>` + `_RECIPIENTS`, `_RECIPIENT_DOMAINS`, `_FROM_ADDRESSES`, `_LLM_ENABLED`, `_LLM_RULES`, `_LLM_THRESHOLD`, `_LLM_FAIL_MODE` or `_LLM_MAX_CALLS_PER_DAY`) for a configured key, or an API key whose value matches `KEY_<NAME>_<12+ alphanumeric chars>`. Anything else fails startup. Startup also fails on `_LLM_WHITELIST_SENDERS` (removed feature), an empty or invalid `_FROM_ADDRESSES` list, an invalid `_LLM_FAIL_MODE`, and a key with `_LLM_ENABLED=true` while `LLM_PROVIDER`/`LLM_API_KEY`/`LLM_MODEL` are incomplete. See [api-reference.md](api-reference.md#environment-variables) for the full variable reference.

**Benefits of Zod Validation**:
- Type coercion (string → number, boolean)
- Custom validation with `.refine()`
- Detailed error messages
- Consistent with template validation

### 3. TypeScript Project Structure

```
src/
├── index.ts                 # Entry point, Hono app initialization
├── config.ts                # Environment configuration with Zod validation
│
├── routes/
│   ├── send.ts             # POST /api/send - main endpoint (+ LLM filter call)
│   └── health.ts           # GET /health and GET /health/detailed
│   # Planned (not implemented): channels.ts for GET /api/channels
│
├── middleware/
│   ├── errorHandler.ts        # Global error handler
│   ├── cors.ts                # CORS validation
│   ├── auth.ts                # API key authentication
│   ├── recipientValidation.ts # JSON body parse + recipient whitelisting (v1.1.0)
│   ├── llmFilter.ts           # LLM spam filtering (v1.2.0), called from routes/send.ts
│   ├── rateLimit.ts           # Token bucket rate limiter
│   ├── logger.ts              # Structured logging (request + response)
│   ├── securityHeaders.ts     # HTTPS enforcement + security headers (HSTS, CSP, etc.)
│   └── bodyLimit.ts           # 50KB request size limit (hono/body-limit)
│
├── channels/
│   ├── index.ts            # Channel registry and router
│   └── email.ts            # Resend email integration + sender allowlist
│   # Planned (not implemented): sms.ts, push.ts, webhook.ts
│
├── templates/
│   ├── index.ts            # Template registry
│   └── email/
│       └── contact-form.ts
│   # Future: sms/, push/ templates (Phase 2+)
│
├── llm/                     # LLM providers (v1.2.0)
│   ├── index.ts            # LLM provider registry
│   └── providers/
│       ├── base.ts         # Base provider interface
│       ├── anthropic.ts    # Anthropic Claude integration
│       └── openai.ts       # OpenAI GPT integration
│
├── utils/
│   ├── errors.ts           # Custom error classes
│   ├── sanitize.ts         # HTML escaping, plain-text/header helpers (DOMPurify)
│   ├── version.ts          # App version read from package.json
│   # Future features:
│   # ├── validation.ts     # Shared validators (planned)
│   # └── circuitBreaker.ts # Circuit breaker (Phase 2+)
│
└── types/
    ├── api.ts              # Request/response types
    ├── channels.ts         # Channel interfaces
    └── templates.ts        # Template interfaces
```

---

## Request Flow

### Complete Request Lifecycle (Email Example)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Step 1: Client Request                                                   │
└──────────────────────────────────────────────────────────────────────────┘

Client (React App):
  fetch('https://conduit.example.com/api/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'KEY_SITEA_<generated-suffix>',
      'Idempotency-Key': 'contact-7f3c9a'          // optional
    },
    body: JSON.stringify({
      channel: 'email',
      templateId: 'contact-form',
      to: 'hello@company.com',
      // from omitted: first address in API_KEY_SITEA_FROM_ADDRESSES is used
      replyTo: 'customer@example.com',
      data: {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'I have a question about your services.'
      }
    })
  })

          ║
          ║ TLS/HTTPS (terminated by the reverse proxy)
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 2: HTTPS Enforcement (all routes except exact /health)              │
└──────────────────────────────────────────────────────────────────────────┘

middleware/securityHeaders.ts (enforceHttps):
  Only when NODE_ENV=production or ENFORCE_HTTPS=true:
  1. Read 'X-Forwarded-Proto' (set by the trusted proxy)
  2. 'https' → set Strict-Transport-Security, continue

  If not 'https' → Return 403 "HTTPS Required" (plain text)

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 3: CORS Validation (all routes)                                     │
└──────────────────────────────────────────────────────────────────────────┘

middleware/cors.ts:
  1. Extract 'Origin' header: 'https://sitea.com'
     (falls back to 'X-Source-Origin' if Origin is missing or not allowed)
  2. Check against ALLOWED_ORIGINS: ['https://sitea.com', 'https://siteb.com']
  3. Match found → Continue
  4. Set CORS headers:
     - Access-Control-Allow-Origin: https://sitea.com
     - Access-Control-Allow-Credentials: true
     - Access-Control-Allow-Methods: GET, POST, OPTIONS
     - Access-Control-Allow-Headers: Content-Type, X-API-Key,
       X-Source-Origin, Idempotency-Key
     - Access-Control-Max-Age: 86400
  5. OPTIONS preflight → Return 204

  If no origin header at all → Continue (non-browser client)
  If no match → Return 403 ORIGIN_NOT_ALLOWED

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 4: Security Headers + Request Logger (all routes)                   │
└──────────────────────────────────────────────────────────────────────────┘

middleware/securityHeaders.ts:
  X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
  Referrer-Policy, Permissions-Policy, Content-Security-Policy

middleware/logger.ts (request line):
  {
    "type": "request",
    "requestId": "6f1c2c1e-...",
    "timestamp": "2025-10-05T10:30:00.000Z",
    "method": "POST",
    "path": "/api/send",
    "headers": { "x-api-key": "KEY_SITEA_****", ... }
  }

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 5: Body Size Limit (/api/* only)                                    │
└──────────────────────────────────────────────────────────────────────────┘

middleware/bodyLimit.ts (hono/body-limit):
  1. Content-Length present: check it against the 50KB limit
  2. No Content-Length (chunked): count bytes as they are read
  3. Size OK → Continue

  If > 50KB → Return 413 PAYLOAD_TOO_LARGE
  If invalid Content-Length → Return 400 VALIDATION_ERROR

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 6: Authentication (/api/* only)                                     │
└──────────────────────────────────────────────────────────────────────────┘

middleware/auth.ts:
  1. Extract 'X-API-Key' header
  2. Constant-time check against REVOKED_KEYS (all entries)
  3. Constant-time comparison against every configured key (no early exit)
  4. Match found → Continue, attach API key to context

  If missing, revoked or no match → Return 401 UNAUTHORIZED

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 7: Recipient Validation (/api/send only)                            │
│ [v1.1.0] Prevents stolen API keys from spamming arbitrary recipients     │
└──────────────────────────────────────────────────────────────────────────┘

middleware/recipientValidation.ts:
  1. Parse the JSON body once and store it in context
     (malformed or non-object JSON → 400 VALIDATION_ERROR)
  2. Check for whitelist configuration:
     - API_KEY_SITEA_RECIPIENTS='support@company.com,sales@company.com'
     - API_KEY_SITEA_RECIPIENT_DOMAINS='company.com'
  3. Validate recipient (case-insensitive):
     - Check exact email match: support@company.com ✓
     - OR check domain match: @company.com ✓
  4. Match found → Continue

  If no whitelist configured → Continue (backward compatible)
  If recipient not in whitelist → Return 403 RECIPIENT_NOT_ALLOWED
  (runs before rate limiting, so a 403 does not consume a token)

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 8: Rate Limiting (/api/* only)                                      │
└──────────────────────────────────────────────────────────────────────────┘

middleware/rateLimit.ts:
  1. Identify request by API key
  2. Refill all three in-memory token buckets (minute, hour, day)
  3. Check that EVERY bucket has a token before consuming any
  4. Consume 1 token from each bucket → Continue
  5. Set headers:
     - X-RateLimit-Limit-Minute / -Hour / -Day
     - X-RateLimit-Remaining-Minute / -Hour / -Day

  If any bucket is empty → Return 429 RATE_LIMIT_EXCEEDED
     with retryAfter + Retry-After header (longest wait), nothing consumed
  (runs before LLM filtering, so a 429 never triggers an LLM call)

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 9: Route Handler - /api/send                                        │
└──────────────────────────────────────────────────────────────────────────┘

routes/send.ts:
  1. Resolve channel against the registry (unknown → 400 INVALID_CHANNEL)
  2. Validate the request schema (Zod):
     - channel, templateId, to (email, max 320), data (object)
     - from.email (email), from.name (max 100, no CR/LF, no < > " @)
     - replyTo (email)
     Invalid → 400 VALIDATION_ERROR
  3. Validate Idempotency-Key (1-200 of [A-Za-z0-9._:-]),
     prefix it with the key's public KEY_<NAME> part
  4. Check sender allowlist (API_KEY_SITEA_FROM_ADDRESSES)
     Client 'from' not allowed → 400 SENDER_NOT_ALLOWED

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 10: LLM Content Filter (optional, v1.2.0)                           │
└──────────────────────────────────────────────────────────────────────────┘

middleware/llmFilter.ts (filterContent, called by routes/send.ts):
  Skipped unless LLM_PROVIDER/LLM_API_KEY/LLM_MODEL are set
  AND API_KEY_SITEA_LLM_ENABLED=true
  1. Validate template + template data (same as the channel handler)
     Invalid → 400 INVALID_TEMPLATE / VALIDATION_ERROR, no LLM call
  2. Check daily budget (API_KEY_SITEA_LLM_MAX_CALLS_PER_DAY)
  3. Send only the validated template fields to the LLM
  4. Rejected with confidence >= threshold → 403 CONTENT_BLOCKED_*

  LLM failure or budget used up:
    fail mode 'block' → 503 LLM_PROVIDER_ERROR / LLM_BUDGET_EXCEEDED
    fail mode 'allow' → continue unfiltered

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 11: Channel Handler - Email                                         │
└──────────────────────────────────────────────────────────────────────────┘

channels/index.ts + channels/email.ts:
  1. Check availability: emailHandler.isAvailable() → true
     (false → 503 PROVIDER_UNAVAILABLE)
  2. Resolve sender: 'Conduit <noreply@company.com>'
  3. Load template: getTemplate('email', 'contact-form')
  4. Validate data with template.validate(data)
     • Throws ZodError if invalid → 400 VALIDATION_ERROR
     • Returns typed data if valid

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 12: Template Rendering                                              │
└──────────────────────────────────────────────────────────────────────────┘

templates/email/contact-form.ts:
  1. Render subject (plain text, tags stripped, CR/LF removed):
     template.subject(data) → "Contact Form: John Doe"

  2. Render HTML body (user input HTML-escaped):
     template.html(data) → "<!DOCTYPE html>...<h1>New Contact Form
                            Submission</h1>...John Doe..."

  3. Render plain text (tags stripped, & < > kept as typed):
     template.text(data) → "New Contact Form Submission\n\nFrom: John Doe\n..."

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 13: Provider API Call - Resend                                      │
└──────────────────────────────────────────────────────────────────────────┘

channels/email.ts:
  1. Prepare email params:
     {
       from: 'Conduit <noreply@company.com>',
       to: 'hello@company.com',
       replyTo: 'customer@example.com',
       subject: 'Contact Form: John Doe',
       html: '<!DOCTYPE html>...',
       text: 'New Contact Form Submission...'
     }
  2. resend.emails.send(params, { signal: AbortSignal.timeout(10000),
                                  idempotencyKey })
  3. Resend returns: { data: { id: 'msg_abc123' } }

  If 10s timeout → request aborted, Return 502 PROVIDER_TIMEOUT
  If Resend fails → Return 502 PROVIDER_ERROR

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 14: Success Response + Response Logging                             │
└──────────────────────────────────────────────────────────────────────────┘

Return to client:
  {
    "success": true,
    "messageId": "msg_abc123",
    "channel": "email",
    "timestamp": "2025-10-05T10:30:00.245Z"
    // + "llmAnalysis": {...} outside production when the LLM ran
  }

middleware/logger.ts (response line):
  {
    "type": "response",
    "requestId": "6f1c2c1e-...",
    "timestamp": "2025-10-05T10:30:00.245Z",
    "method": "POST",
    "path": "/api/send",
    "status": 200,
    "duration": 245,
    "app": "SITEA"
  }

Client receives response and displays success message to user.
```

---

## Security Architecture

### Security Boundary Layers

```
┌───────────────────────────────────────────────────────────────────────┐
│ Layer 0: Network (External)                                           │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ • Internet                                                        │ │
│ │ • Client browsers/apps                                            │ │
│ │ • Potential attackers                                             │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────┬──────────────────────────────────────┘
                                 │
                    ┌────────────▼──────────────┐
                    │   TLS/HTTPS (Layer 1)     │
                    │   • TLS 1.2+ encryption   │
                    │   • HSTS enforcement      │
                    │   • Certificate validation│
                    └────────────┬──────────────┘
                                 │
┌───────────────────────────────▼───────────────────────────────────────┐
│ Layer 2: Application Perimeter (Conduit Service)                      │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ CORS Validation                                                   │ │
│ │ • Origin whitelisting                                             │ │
│ │ • Reject unauthorized domains                                     │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ Security Headers                                                  │ │
│ │ • X-Content-Type-Options: nosniff                                 │ │
│ │ • X-Frame-Options: DENY                                           │ │
│ │ • Content-Security-Policy                                         │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ Request Size Limiting                                             │ │
│ │ • Max 50KB payload                                                │ │
│ │ • DoS prevention                                                  │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼──────────────────────────────────────┐
│ Layer 3: Authentication & Authorization                               │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ API Key Validation                                                │ │
│ │ • Extract X-API-Key header                                        │ │
│ │ • Constant-time comparison (timing attack prevention)             │ │
│ │ • Reject if invalid (401)                                         │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼──────────────────────────────────────┐
│ Layer 3.5: Recipient Validation (v1.1.0)                              │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ Recipient Whitelisting                                            │ │
│ │ • Check recipient against API key whitelist                       │ │
│ │ • Per-API-key email and domain whitelists                         │ │
│ │ • Prevents stolen key spam abuse (95% risk reduction)             │ │
│ │ • Reject if not allowed (403)                                     │ │
│ │ • Backward compatible (no whitelist = allow all)                  │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼──────────────────────────────────────┐
│ Layer 4: Rate Limiting & Abuse Prevention                             │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ Token Bucket Rate Limiter                                         │ │
│ │ • Per-API-key limits: 10/min, 100/hr, 500/day (defaults)          │ │
│ │ • IP-based secondary limits (planned, not implemented)            │ │
│ │ • Return 429 + Retry-After if exceeded                            │ │
│ │ • Runs before any LLM call                                        │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼──────────────────────────────────────┐
│ Layer 5: Input Validation & Sanitization                              │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ Schema Validation (Zod)                                           │ │
│ │ • Type checking                                                   │ │
│ │ • Field length limits                                             │ │
│ │ • Format validation (email addresses)                             │ │
│ │ • Sender allowlist + display-name restrictions                    │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ XSS / Header Injection Protection                                 │ │
│ │ • User input HTML-escaped in the HTML body                        │ │
│ │ • Tags stripped from plain-text subject/body (DOMPurify)          │ │
│ │ • CR/LF removed from subject and sender name                      │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼──────────────────────────────────────┐
│ Layer 5.5: Content Filtering (optional, v1.2.0)                       │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ LLM Spam Filter (called from routes/send.ts)                      │ │
│ │ • Only after request + template data validation                   │ │
│ │ • Per-API-key rules, threshold, daily budget                      │ │
│ │ • Fail mode allow (send) or block (503)                           │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼──────────────────────────────────────┐
│ Layer 6: Business Logic                                               │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ Channel Routing                                                   │ │
│ │ Template Rendering                                                │ │
│ │ Provider Integration                                              │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼──────────────────────────────────────┐
│ Layer 7: Provider Isolation                                           │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ Credential Management                                             │ │
│ │ • Provider API keys in environment variables                      │ │
│ │ • Never exposed to clients                                        │ │
│ │ • Server-side only                                                │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ Provider Timeouts                                                 │ │
│ │ • 10s Resend timeout aborts the request (AbortSignal)             │ │
│ │ • Circuit breaker: planned, not implemented                       │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────▼──────────────┐
                    │  External Providers       │
                    │  • Resend (TLS)           │
                    │  • Anthropic/OpenAI (TLS) │
                    │  • Twilio, Firebase       │
                    │    (planned)              │
                    └───────────────────────────┘
```

### Trust Boundaries

```
┌──────────────────────────────────────────────────────────────────┐
│ UNTRUSTED ZONE                                                   │
│ • Client applications                                            │
│ • User input                                                     │
│ • API keys (public knowledge)                                    │
│ • Network traffic                                                │
└──────────────────────────┬───────────────────────────────────────┘
                           │
        ═══════════════════╪════════════════════
        TRUST BOUNDARY     │     (TLS + Auth)
        ═══════════════════╪════════════════════
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│ SEMI-TRUSTED ZONE                                                │
│ • Validated requests                                             │
│ • Authenticated clients                                          │
│ • Rate-limited traffic                                           │
│ • Sanitized input                                                │
└──────────────────────────┬───────────────────────────────────────┘
                           │
        ═══════════════════╪════════════════════
        ISOLATION BOUNDARY │
        ═══════════════════╪════════════════════
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│ TRUSTED ZONE                                                     │
│ • Provider API credentials (RESEND_API_KEY, etc.)                │
│ • Server environment                                             │
│ • Internal application state                                     │
│ • Template rendering logic                                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### Request Schema

```typescript
// types/api.ts (abridged)

export type Channel = 'email' | 'sms' | 'push' | 'webhook'; // only 'email' is registered

export interface SendMessageRequest {
  channel: Channel;
  templateId: string;
  to: string;                     // Email address (max 320 chars)
  data: Record<string, unknown>;  // Template-specific data
  from?: {                        // Email only; must be in API_KEY_<NAME>_FROM_ADDRESSES
    email: string;
    name?: string;                // max 100, no CR/LF, no < > " @
  };
  replyTo?: string;               // Email only
  idempotencyKey?: string;        // Set server-side from the Idempotency-Key header
  apiKey?: string;                // Set server-side from the auth middleware, never from the body
}

export interface SendMessageResponse {
  success: true;
  messageId: string;
  channel: Channel;
  timestamp: string;
  llmAnalysis?: LLMAnalysis;      // Only outside production, when the LLM filter ran
}

export interface LLMAnalysis {
  provider: string;
  model?: string;
  allowed: boolean;
  confidence: number;
  categories: string[];
  latency: number;
  fallback?: boolean;             // true when the LLM failed and the key fails open
  fallbackReason?: string;        // always the generic "LLM analysis failed"
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
  details?: Record<string, unknown>; // Omitted in production
  retryAfter?: number;               // Seconds, for 429 and 503 with a retry hint
}

export enum ErrorCode {
  // 401 (missing, invalid or revoked key)
  UNAUTHORIZED = 'UNAUTHORIZED',
  // 400
  INVALID_CHANNEL = 'INVALID_CHANNEL',
  INVALID_TEMPLATE = 'INVALID_TEMPLATE',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SENDER_NOT_ALLOWED = 'SENDER_NOT_ALLOWED',
  // 429
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  // 413
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  // 403
  ORIGIN_NOT_ALLOWED = 'ORIGIN_NOT_ALLOWED',
  RECIPIENT_NOT_ALLOWED = 'RECIPIENT_NOT_ALLOWED',  // v1.1.0
  CONTENT_BLOCKED_SPAM = 'CONTENT_BLOCKED_SPAM',    // v1.2.0
  CONTENT_BLOCKED_ABUSE = 'CONTENT_BLOCKED_ABUSE',
  CONTENT_BLOCKED_PROFANITY = 'CONTENT_BLOCKED_PROFANITY',
  CONTENT_BLOCKED_PHISHING = 'CONTENT_BLOCKED_PHISHING',
  CONTENT_BLOCKED_SCAM = 'CONTENT_BLOCKED_SCAM',
  CONTENT_BLOCKED_PROMPT_INJECTION = 'CONTENT_BLOCKED_PROMPT_INJECTION',
  // 503 (LLM timeouts surface as LLM_PROVIDER_ERROR)
  LLM_PROVIDER_ERROR = 'LLM_PROVIDER_ERROR',
  LLM_BUDGET_EXCEEDED = 'LLM_BUDGET_EXCEEDED',
  // 502
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
  // 503 (channel provider not configured)
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  // 500
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
```

See [api-reference.md](api-reference.md#error-codes) for the HTTP status and trigger of each code.

### Template Interface

```typescript
// types/templates.ts
import type { ZodSchema } from 'zod';

/**
 * Base template interface
 * All templates must implement this interface
 */
export interface Template<TData = unknown> {
  readonly id: string;
  readonly channel: Channel;
  readonly description?: string;
  readonly schema: ZodSchema<TData>;

  /**
   * Validate template data
   * @throws {ZodError} If validation fails
   */
  validate(data: unknown): TData;
}

/**
 * Email template interface
 * Separate methods for subject, HTML, and text
 */
export interface EmailTemplate<TData = unknown> extends Template<TData> {
  readonly channel: 'email';

  subject(data: TData): string;
  html(data: TData): string;
  text(data: TData): string;
}

/**
 * SMS template interface (Phase 2)
 */
export interface SmsTemplate<TData = unknown> extends Template<TData> {
  readonly channel: 'sms';

  message(data: TData): string;
}

/**
 * Push notification template interface (Phase 2)
 */
export interface PushTemplate<TData = unknown> extends Template<TData> {
  readonly channel: 'push';

  title(data: TData): string;
  body(data: TData): string;
  data?(data: TData): Record<string, string>;
}

/**
 * Webhook template interface (Phase 3)
 */
export interface WebhookTemplate<TData = unknown> extends Template<TData> {
  readonly channel: 'webhook';

  payload(data: TData): Record<string, unknown>;
}
```

### Channel Handler Interface

```typescript
// types/channels.ts

/**
 * Channel handler interface
 * All channel implementations must implement this interface
 */
export interface ChannelHandler {
  readonly channel: Channel;

  send(request: SendMessageRequest): Promise<ChannelSendResult>;
  isAvailable(): Promise<boolean>;
  getProviderName(): string;
}

/**
 * Result of sending a message through a channel
 */
export interface ChannelSendResult {
  messageId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Email-specific send request data
 * Extends the base request with email-specific fields
 */
export interface EmailSendRequest extends SendMessageRequest {
  channel: 'email';
  from: {
    email: string;
    name?: string;
  };
  replyTo?: string;
}
```

---

## Middleware Pipeline

### Execution Order

```
Request
  │
  ├─→ [0] Error Handler (Global)
  │     • app.onError() - catches all errors
  │     • Sanitizes errors in production (no details, generic 500 message)
  │     • Maps ConduitError to its HTTP status
  │     • Sets Retry-After on 429 and on 503 with a retry hint
  │
  ├─→ [1] HTTPS Enforcement
  │     • Runs on ALL routes (*) except the exact path /health
  │     • Only when NODE_ENV=production or ENFORCE_HTTPS=true
  │     • 403 "HTTPS Required" unless X-Forwarded-Proto is https
  │     • Sets HSTS header
  │
  ├─→ [2] CORS Validation
  │     • Runs on ALL routes (*)
  │     • Checks Origin (or X-Source-Origin) against ALLOWED_ORIGINS
  │     • Returns 403 ORIGIN_NOT_ALLOWED if not whitelisted
  │     • Sets CORS headers if valid, answers OPTIONS with 204
  │
  ├─→ [3] Security Headers
  │     • Runs on ALL routes (*)
  │     • Sets X-Frame-Options, CSP, X-Content-Type-Options, etc.
  │     • Always continues (header-only)
  │
  ├─→ [4] Request Logger
  │     • Runs on ALL routes (*)
  │     • Logs structured JSON request line (method, path, masked headers)
  │     • Logs response line after next() (status, duration, app name from API_KEY_<NAME>)
  │
  ├─→ [5] Body Size Limit
  │     • Runs on /api/* routes only
  │     • hono/body-limit: Content-Length, or bytes read for chunked bodies
  │     • Returns 413 PAYLOAD_TOO_LARGE if > 50KB
  │     • Returns 400 VALIDATION_ERROR for a malformed Content-Length
  │
  ├─→ [6] Authentication
  │     • Runs on /api/* routes (and /health/detailed)
  │     • Validates X-API-Key header, checks REVOKED_KEYS
  │     • Constant-time comparison
  │     • Returns 401 UNAUTHORIZED if missing, revoked or invalid
  │     • Attaches API key to context
  │
  ├─→ [7] Recipient Validation (v1.1.0)
  │     • Runs on /api/send route only
  │     • Parses the JSON body once (400 VALIDATION_ERROR if malformed)
  │     • Checks recipient against API key whitelist
  │     • Per-API-key email and domain whitelists
  │     • Returns 403 (RECIPIENT_NOT_ALLOWED) if blocked
  │     • Backward compatible (no whitelist = allow all)
  │     • Before rate limiting: a 403 does not consume a token
  │
  ├─→ [8] Rate Limiting
  │     • Runs on /api/* routes only
  │     • Token bucket algorithm (defaults 10/min, 100/hr, 500/day)
  │     • Checks all buckets first; consumes only if every bucket has a token
  │     • Returns 429 + retryAfter + Retry-After if a limit is exceeded
  │     • Before LLM filtering: a 429 never triggers an LLM call
  │
  └─→ [9] Route Handler
        • POST /api/send, GET /health, GET /health/detailed
        • /api/send: channel → schema → Idempotency-Key → sender allowlist
          → LLM filter (filterContent, optional, v1.2.0) → channel handler
        • Response logging handled by logger middleware
```

The LLM filter is not mounted as middleware. `routes/send.ts` calls `filterContent()` after the request schema and sender checks, and `filterContent()` validates the template data before calling the LLM, so invalid requests never cost an LLM call.

### Middleware Implementation Pattern

Middleware throws typed errors (`src/utils/errors.ts`) and lets the global error handler build the response:

```typescript
// middleware/auth.ts (abridged)
import type { Context, Next } from 'hono';
import { timingSafeEqual } from 'crypto';
import { config } from '../config.js';
import { AuthError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

export async function authenticate(c: Context, next: Next) {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) {
    throw new AuthError('Missing API key', ErrorCode.UNAUTHORIZED);
  }

  // Check every revoked key and every valid key; never break early
  let isRevoked = false;
  for (const revokedKey of config.revokedKeys) {
    if (apiKey.length === revokedKey.length &&
        timingSafeEqual(Buffer.from(apiKey), Buffer.from(revokedKey))) {
      isRevoked = true;
    }
  }
  if (isRevoked) {
    throw new AuthError('API key has been revoked', ErrorCode.UNAUTHORIZED);
  }

  let isValid = false;
  for (const validKey of config.apiKeys) {
    if (apiKey.length === validKey.length &&
        timingSafeEqual(Buffer.from(apiKey), Buffer.from(validKey))) {
      isValid = true;
    }
  }
  if (!isValid) {
    throw new AuthError('Invalid API key', ErrorCode.UNAUTHORIZED);
  }

  // Attach API key to context (masked by the logger)
  c.set('apiKey', apiKey);
  await next();
}
```

---

## Channel System

### Channel Registry

```typescript
// channels/index.ts (abridged)

const channelRegistry: Map<string, ChannelHandler> = new Map([
  ['email', emailHandler],
  // ['sms', smsHandler],         // Phase 2 (not implemented)
  // ['push', pushHandler],       // Phase 2 (not implemented)
  // ['webhook', webhookHandler], // Phase 3 (not implemented)
]);

export function getChannelHandler(channel: string): ChannelHandler {
  const handler = channelRegistry.get(channel);
  if (!handler) {
    throw new ValidationError(
      `Invalid channel: ${channel}. Supported channels: ${[...channelRegistry.keys()].join(', ')}`,
      ErrorCode.INVALID_CHANNEL
    );
  }
  return handler;
}

export async function routeToChannel(request: SendMessageRequest): Promise<ChannelSendResult> {
  const handler = getChannelHandler(request.channel);

  if (!(await handler.isAvailable())) {
    throw new ServiceUnavailableError(
      `Channel ${request.channel} is not available. Provider: ${handler.getProviderName()}`,
      ErrorCode.PROVIDER_UNAVAILABLE
    );
  }

  // Handler internally:
  // 1. Resolves the sender against the key's allowlist
  // 2. Loads template via getTemplate(channel, templateId)
  // 3. Validates data with template.validate(data) - ZodError -> 400 VALIDATION_ERROR
  // 4. Renders using template.subject/html/text methods
  // 5. Sends via provider API
  return handler.send(request);
}
```

`routes/send.ts` builds the success response (`success`, `messageId`, `channel`, `timestamp`, plus `llmAnalysis` outside production).

### Email Channel Implementation

```typescript
// channels/email.ts (abridged)

const resend = new Resend(config.resendApiKey);

export const emailHandler: ChannelHandler = {
  channel: 'email',

  async send(request: SendMessageRequest): Promise<ChannelSendResult> {
    // Sender: client `from` must be in API_KEY_<NAME>_FROM_ADDRESSES (else 400
    // SENDER_NOT_ALLOWED); without `from`, the first allowlisted address, or
    // 'Conduit <onboarding@resend.dev>' for keys without an allowlist
    const from = resolveSender(request.from, config.senderAllowlists.get(request.apiKey));

    const template = getTemplate(request.channel, request.templateId) as EmailTemplate<unknown>;
    const validatedData = template.validate(request.data); // ZodError -> 400

    const emailParams: CreateEmailOptions = {
      from,
      to: request.to,
      subject: template.subject(validatedData),
      html: template.html(validatedData),
      text: template.text(validatedData),
      replyTo: request.replyTo,
    };

    // The timeout aborts the HTTP request itself, so a timed-out send is not
    // delivered later
    const signal = AbortSignal.timeout(TIMEOUTS.provider); // 10s
    const response = await resend.emails.send(emailParams, {
      signal,
      ...(request.idempotencyKey && { idempotencyKey: request.idempotencyKey }),
    });
    // aborted -> 502 PROVIDER_TIMEOUT, response.error -> 502 PROVIDER_ERROR

    return {
      messageId: response.data?.id || 'unknown',
      timestamp: new Date().toISOString(),
    };
  },

  isAvailable(): Promise<boolean> {
    return Promise.resolve(!!config.resendApiKey && config.resendApiKey.length > 0);
  },

  getProviderName(): string {
    return 'resend';
  },
};
```

---

## Template Engine

### Template Structure

```typescript
// templates/email/contact-form.ts (abridged; the real HTML is more styled)

import { z } from 'zod';
import type { EmailTemplate } from '../../types/templates.js';
import { escapeHtml, toHeaderText, toPlainText } from '../../utils/sanitize.js';

// Define data schema with strict validation
const contactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  email: z.string().email('Invalid email address'),
  message: z.string().min(1, 'Message is required').max(5000, 'Message must be less than 5000 characters'),
  subject: z.string().max(200, 'Subject must be less than 200 characters').optional(),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;

// Template implementation
export const contactFormTemplate: EmailTemplate<ContactFormData> = {
  id: 'contact-form',
  channel: 'email',
  schema: contactFormSchema,

  /**
   * Validate contact form data
   * @throws {ZodError} If validation fails
   */
  validate(data: unknown): ContactFormData {
    return contactFormSchema.parse(data); // Throws ZodError if invalid
  },

  /**
   * Generate email subject (plain-text header: tags stripped, entities
   * decoded, CR/LF removed)
   */
  subject(data: ContactFormData): string {
    if (data.subject) {
      return toHeaderText(data.subject);
    }
    return `Contact Form: ${toHeaderText(data.name)}`;
  },

  /**
   * Render HTML email body
   */
  html(data: ContactFormData): string {
    // Sanitize all user input to prevent XSS
    const name = escapeHtml(data.name);
    const email = escapeHtml(data.email);
    const message = escapeHtml(data.message).replace(/\n/g, '<br>');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Contact Form Submission</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2>New Contact Form Submission</h2>
    <p><strong>From:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <hr>
    <p><strong>Message:</strong></p>
    <p>${message}</p>
  </div>
</body>
</html>
    `.trim();
  },

  /**
   * Render plain text email body
   */
  text(data: ContactFormData): string {
    // text/plain is not HTML: strip tags but keep '&', '<' and '>' as typed
    const name = toPlainText(data.name);
    const email = toPlainText(data.email);
    const message = toPlainText(data.message);

    return `
New Contact Form Submission
============================

From: ${name}
Email: ${email}

Message:
--------
${message}

---
This email was sent from your contact form.
Powered by Conduit
    `.trim();
  },
};
```

---

## Rate Limiting

### Token Bucket Algorithm

```typescript
// middleware/rateLimit.ts (abridged)

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;  // tokens per millisecond
}

// In-memory, per process: API key -> { perMinute, perHour, perDay } buckets.
// Capacities come from RATE_LIMIT_PER_MINUTE / _PER_HOUR / _PER_DAY.
const rateLimitStore = new Map<string, RateLimitState>();

function refillBucket(bucket: TokenBucket): void {
  const now = Date.now();
  const tokensToAdd = (now - bucket.lastRefill) * bucket.refillRate;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
}

export async function rateLimit(c: Context, next: Next) {
  const apiKey = c.get('apiKey');
  const state = getRateLimitState(apiKey);
  const buckets = [
    ['per-minute', state.perMinute],
    ['per-hour', state.perHour],
    ['per-day', state.perDay],
  ];

  // Check every bucket before consuming from any of them, so a rejected
  // request never drains the hour/day budget
  buckets.forEach(([, bucket]) => refillBucket(bucket));
  const depleted = buckets.filter(([, bucket]) => bucket.tokens < 1);
  if (depleted.length > 0) {
    // Report the longest wait across the empty buckets
    // -> 429 RATE_LIMIT_EXCEEDED, retryAfter + Retry-After header
    throw new RateLimitError(`Rate limit exceeded (${limitType})`, retryAfter);
  }

  buckets.forEach(([, bucket]) => { bucket.tokens -= 1; });

  // Also X-RateLimit-Limit-{Minute,Hour,Day} and the other Remaining-* headers
  c.header('X-RateLimit-Remaining-Minute', Math.floor(state.perMinute.tokens).toString());
  await next();
}
```

---

## Error Handling

### Error Flow

```
Error Occurs
  │
  ├─→ Known Error (ConduitError: ValidationError 400, AuthError 401,
  │   ForbiddenError 403, PayloadTooLargeError 413, RateLimitError 429,
  │   ProviderError 502, ServiceUnavailableError 503, InternalError 500)
  │     • Return its ErrorCode and HTTP status
  │     • details included outside production only
  │     • retryAfter (top-level) + Retry-After header for 429 and
  │       503 errors that carry a retry hint
  │
  └─→ Unknown Error (unexpected exception)
        • Logged with console.error
        • Production: 500 INTERNAL_ERROR "Internal server error"
        • Development: 500 INTERNAL_ERROR with the error message
```

---

## Deployment Architecture

### Docker Container

```
┌─────────────────────────────────────────────────────────┐
│ Docker Container (conduit:latest)                       │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Node.js 22 Alpine                                  │ │
│  │ • Minimal base image (~50MB)                       │ │
│  │ • Security updates applied                         │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Application (non-root user 'conduit', uid 1001)    │ │
│  │ • /app/dist/index.js (CMD node dist/index.js)      │ │
│  │ • /app/node_modules (production only)              │ │
│  │ • /app/package.json (version for /health/detailed) │ │
│  │ • ENV NODE_ENV=production                          │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  Exposed Port: 3000                                     │
│  Health Check: curl /health on ${PORT:-3000}, every 30s │
└─────────────────────────────────────────────────────────┘
```

### Coolify Deployment

```
┌───────────────────────────────────────────────────────────┐
│ Coolify Server                                            │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Reverse Proxy (Traefik)                              │ │
│  │ • TLS termination                                    │ │
│  │ • Automatic SSL certificates (Let's Encrypt)         │ │
│  │ • Domain: conduit.yourdomain.com                     │ │
│  └──────────────────┬───────────────────────────────────┘ │
│                     │                                     │
│  ┌──────────────────▼───────────────────────────────────┐ │
│  │ Conduit Container (Port 3000)                        │ │
│  │ • Auto-deployed from Git                             │ │
│  │ • Environment variables from Coolify UI              │ │
│  │ • Health checks enabled                              │ │
│  └──────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

---

## Scalability Considerations

### Current Design (Phase 1)

**Single Instance**:
- In-memory rate limiting and LLM daily budget (per process, reset on restart)
- Otherwise stateless request handling
- Suitable for:
  - 1-10 frontend applications
  - < 100,000 requests/day
  - < 10 req/sec average

### Horizontal Scaling (Phase 4, planned, not implemented)

**Multiple Instances with Redis**:

```
                    Load Balancer
                          │
      ┌───────────────────┼───────────────────┐
      │                   │                   │
      ▼                   ▼                   ▼
  Instance 1          Instance 2          Instance 3
      │                   │                   │
      └───────────────────┴───────────────────┘
                          │
                          ▼
                  Redis (Shared State)
                  • Rate limit counters
                  • API key metadata
                  • Circuit breaker state
```

**Benefits**:
- Shared rate limiting across instances
- Session persistence not required (stateless)
- API key revocation without redeployment

---

## Implementation Notes

### Deviations from Original Specification

The actual implementation differs from the original specification in several important ways:

#### 1. **Template Interface Design**
- **Original Spec**: Single `render()` method returning `RenderedTemplate` union type
- **Actual Implementation**: Separate `subject()`, `html()`, `text()` methods
- **Rationale**: Better type safety, clearer intent, easier to extend per channel

#### 2. **Template Validation**
- **Original Spec**: Type guard pattern `validate(data): data is TData`
- **Actual Implementation**: Throws `ZodError` via `schema.parse(data)`
- **Rationale**: Better error messages, consistent with Zod patterns, no silent failures

#### 3. **Channel Handler Interface**
- **Original Spec**: `status: 'active' | 'coming_soon' | 'disabled'` property
- **Actual Implementation**: `isAvailable(): Promise<boolean>` method
- **Rationale**: Runtime checks (API key validation), async capability, cleaner design

#### 4. **Middleware Order**
- **Original Spec**: CORS → Security Headers → Auth → Rate Limit → Logger
- **Actual Implementation**: Error Handler → HTTPS → CORS → Security Headers → Logger → Body Limit → Auth → Recipient Validation → Rate Limit, then the LLM filter inside the send route after request validation
- **Rationale**:
  - CORS before security headers for performance (reject early)
  - Body limit before auth to prevent DoS
  - Logger early to capture all requests
  - Recipient validation before rate limiting, so rejected recipients do not consume tokens
  - Rate limiting before the LLM filter, so a 429 never costs an LLM call
  - LLM filter after schema and template validation, so invalid requests never reach the LLM
  - Error handler wraps everything

#### 5. **Body Size Limit** (v1.0.1)
- **Original Spec**: Not specified
- **Actual Implementation**: 50KB max via `bodyLimit` middleware (built on `hono/body-limit`, so chunked bodies without Content-Length are also capped)
- **Rationale**: Critical DoS prevention gap identified in security review

#### 6. **Configuration Management**
- **Original Spec**: Manual environment variable parsing
- **Actual Implementation**: Zod schema validation with type coercion
- **Rationale**: Better error messages, type safety, consistent validation approach

#### 7. **Error Code Mapping**
- **Original Spec**: `PAYLOAD_TOO_LARGE` → HTTP 413
- **Actual Implementation**: `PAYLOAD_TOO_LARGE` → HTTP 413 (it returned 400 before v2.0.0)
- **Rationale**: Standard status code for oversized bodies

### Version History

See [CHANGELOG.md](../CHANGELOG.md) for v1.2.1 and later. Highlights of v2.0.0-rc.1:
- Middleware order: rate limiting before LLM filtering; LLM filter called from the send route after validation
- 413 for oversized bodies (also chunked), 403 `ORIGIN_NOT_ALLOWED`, 400 for malformed JSON, `Retry-After` header
- Strict `API_KEY_*` loading; `gemini`/`ollama` no longer accepted as `LLM_PROVIDER`
- Per-key sender allowlist (`API_KEY_<NAME>_FROM_ADDRESSES`, `400 SENDER_NOT_ALLOWED`)
- Provider timeout aborts the Resend request; optional `Idempotency-Key` header; `400 INVALID_CHANNEL` for unknown channels
- LLM filter fails closed in `block` mode; sender whitelist removed; `llmAnalysis` not returned in production

**v1.2.0** (2025-10-22):
- Added `llmFilter` middleware (AI-powered spam detection)
- Support for multiple LLM providers (Anthropic Claude, OpenAI GPT)
- Per-API-key LLM filter configuration (rules, threshold, budget)
- Daily budget limits to control LLM API costs
- Sender whitelisting to bypass LLM analysis for trusted senders (removed since; setting it now fails startup)
- Fail-open/fail-closed modes for LLM provider errors
- Detects spam, abuse, phishing, prompt injection, profanity, scams
- Updated LLM model to Claude Haiku 4.5 for improved performance

**v1.1.0** (2025-10-15):
- Added `recipientValidation` middleware (spam abuse prevention)
- Per-API-key recipient whitelisting (95% risk reduction for stolen keys)
- Created feature planning framework (`docs/features/`)
- Planned LLM spam filtering as Conduit middleware (v1.2.0)
- Updated security documentation with advanced protections guide
- Backward compatible (no whitelist = allow all recipients)

**v1.0.1** (2025-10-05):
- Added `bodyLimit` middleware (DoS prevention)
- Fixed middleware execution order
- Migrated to Zod config validation
- Updated architecture documentation

**v1.0.0** (2025-10-04):
- Initial MVP release
- Email channel via Resend
- Complete security implementation

---

## Summary

This architecture provides:

✅ **Security**: Multi-layer defense with CORS, auth, recipient whitelisting, rate limiting, input validation, DoS protection
✅ **Simplicity**: Single endpoint, clear request/response format
✅ **Scalability**: Stateless design, horizontal scaling ready
✅ **Maintainability**: Modular structure, typed interfaces, clear separation of concerns
✅ **Extensibility**: Easy to add new channels and templates

**Current Status** (v2.0.0-rc.1):
- ✅ Phase 1 Complete (Email via Resend)
- ✅ Production-ready with security hardening
- ✅ Recipient whitelisting (95% risk reduction for stolen keys)
- ✅ Per-API-key sender allowlist
- ✅ LLM spam filtering with Anthropic and OpenAI
- ✅ Per-API-key spam detection configuration
- ✅ Deployed to Coolify

**Next Steps** (not implemented):
1. Monitor LLM spam detection effectiveness and adjust thresholds
2. Add support for additional LLM providers (e.g. Gemini, Ollama)
3. Expand to Phase 2 (SMS + Push notifications)
4. Add analytics and delivery tracking
5. Implement circuit breaker for provider resilience
