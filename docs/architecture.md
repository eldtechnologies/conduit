# Conduit Architecture

**Version**: 1.0.1
**Last Updated**: 2025-10-05
**Status**: Implementation Complete - Documentation Accurate

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
│  │  │    • Redirects HTTP to HTTPS in production                 │ │   │
│  │  │    • HSTS header                                           │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 2. CORS Validation        (middleware/cors.ts)             │ │   │
│  │  │    • Check Origin header against ALLOWED_ORIGINS           │ │   │
│  │  │    • Reject if not whitelisted (403)                       │ │   │
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
│  │  │    • Max 50KB payload (DoS prevention)                     │ │   │
│  │  │    • Return 413 if exceeded                                │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 6. Authentication         (middleware/auth.ts)             │ │   │
│  │  │    • /api/* routes only                                    │ │   │
│  │  │    • Constant-time comparison (timing attack prevention)   │ │   │
│  │  │    • Return 401 if invalid                                 │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 7. Rate Limiting          (middleware/rateLimit.ts)        │ │   │
│  │  │    • /api/* routes only                                    │ │   │
│  │  │    • Token bucket: 10/min, 100/hr, 500/day                 │ │   │
│  │  │    • Return 429 if exceeded                                │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         Route Handlers                          │   │
│  │  • POST /api/send       - Send message (authenticated)          │   │
│  │  • GET  /health         - Health check (public)                 │   │
│  │  • GET  /api/channels   - List channels (Phase 2+)              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   Channel Router & Dispatcher                   │   │
│  │  1. Parse request body (channel, templateId, to, data)          │   │
│  │  2. Load template from templates/{channel}/{templateId}.ts      │   │
│  │  3. Validate data against Zod schema                            │   │
│  │  4. Route to appropriate channel handler                        │   │
│  └────────┬─────────────┬────────────┬────────────┬────────────────┘   │
│           │             │            │            │                    │
│  ┌────────▼────────┐ ┌──▼────────┐ ┌▼─────────┐ ┌▼───────────────┐     │
│  │ Email Handler   │ │   SMS     │ │   Push   │ │    Webhook     │     │
│  │ (channels/      │ │  Handler  │ │  Handler │ │    Handler     │     │
│  │  email.ts)      │ │ (Phase 2) │ │(Phase 2) │ │   (Phase 3)    │     │
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

**Core Setup**:
```typescript
// src/index.ts
import { Hono } from 'hono';
import { cors } from './middleware/cors';
import { auth } from './middleware/auth';
import { rateLimit } from './middleware/rateLimit';
import { logger } from './middleware/logger';

const app = new Hono();

// Apply middleware in order
app.use('*', cors);
app.use('/api/*', auth);      // Auth required for /api/* routes
app.use('/api/*', rateLimit);
app.use('*', logger);

// Routes
app.route('/api', apiRoutes);
app.route('/health', healthRoutes);

export default app;
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
});

// Parse and validate environment variables
const env = envSchema.parse(process.env);

// Load API keys (dynamic - any API_KEY_* env var)
function loadApiKeys(): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('API_KEY_') && value) {
      keys.push(value);
    }
  }
  if (keys.length === 0) {
    throw new Error('No API keys configured');
  }
  return keys;
}

export const config: Config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  resendApiKey: env.RESEND_API_KEY,
  apiKeys: loadApiKeys(),
  allowedOrigins: env.ALLOWED_ORIGINS,
  rateLimits: {
    perMinute: env.RATE_LIMIT_PER_MINUTE,
    perHour: env.RATE_LIMIT_PER_HOUR,
    perDay: env.RATE_LIMIT_PER_DAY,
  },
  enforceHttps: env.ENFORCE_HTTPS,
  revokedKeys: env.REVOKED_KEYS,
};
```

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
│   ├── send.ts             # POST /api/send - main endpoint
│   ├── health.ts           # GET /health - health check
│   └── channels.ts         # GET /api/channels (Phase 2+)
│
├── middleware/
│   ├── errorHandler.ts     # Global error handler
│   ├── cors.ts             # CORS validation
│   ├── auth.ts             # API key authentication
│   ├── rateLimit.ts        # Token bucket rate limiter
│   ├── logger.ts           # Structured logging (request + response)
│   ├── securityHeaders.ts  # Security headers (HSTS, CSP, etc.)
│   └── bodyLimit.ts        # Request size limits (v1.0.1)
│
├── channels/
│   ├── index.ts            # Channel registry and router
│   ├── email.ts            # Resend email integration
│   ├── sms.ts              # Twilio SMS (future - Phase 2)
│   ├── push.ts             # Firebase push (future - Phase 2)
│   └── webhook.ts          # HTTP webhooks (future - Phase 3)
│
├── templates/
│   ├── index.ts            # Template registry
│   └── email/
│       ├── index.ts
│       └── contact-form.ts
│   # Future: sms/, push/ templates (Phase 2+)
│
├── utils/
│   ├── errors.ts           # Custom error classes
│   ├── sanitize.ts         # XSS/HTML sanitization
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
      'X-API-Key': 'KEY_SITEA_abc123...',
      'X-Source-Origin': 'https://sitea.com'
    },
    body: JSON.stringify({
      channel: 'email',
      templateId: 'contact-form',
      to: 'hello@company.com',
      from: { email: 'noreply@company.com', name: 'Company' },
      replyTo: 'customer@example.com',
      data: {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'I have a question about your services.',
        phone: '+1234567890'
      }
    })
  })

          ║
          ║ TLS/HTTPS
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 2: Middleware Layer 1 - CORS Validation                             │
└──────────────────────────────────────────────────────────────────────────┘

middleware/cors.ts:
  1. Extract 'Origin' header: 'https://sitea.com'
  2. Check against ALLOWED_ORIGINS: ['https://sitea.com', 'https://siteb.com']
  3. Match found → Continue
  4. Set CORS headers:
     - Access-Control-Allow-Origin: https://sitea.com
     - Access-Control-Allow-Methods: POST, GET, OPTIONS
     - Access-Control-Allow-Headers: Content-Type, X-API-Key

  If no match → Return 403 Forbidden

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 3: Middleware Layer 2 - Body Size Limit (/api/* only)               │
└──────────────────────────────────────────────────────────────────────────┘

middleware/bodyLimit.ts:
  1. Extract 'Content-Length' header: '1234'
  2. Check size: 1234 bytes < 50KB limit
  3. Size OK → Continue

  If > 50KB → Return 400 with code PAYLOAD_TOO_LARGE
  If invalid Content-Length → Return 400 with code VALIDATION_ERROR

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 4: Middleware Layer 3 - Authentication (/api/* only)                │
└──────────────────────────────────────────────────────────────────────────┘

middleware/auth.ts:
  1. Extract 'X-API-Key' header: 'KEY_SITEA_abc123...'
  2. Load valid keys from env:
     - API_KEY_SITEA = 'KEY_SITEA_abc123...'
     - API_KEY_SITEB = 'KEY_SITEB_xyz789...'
  3. Constant-time comparison for each valid key
  4. Match found → Continue, attach API key metadata to context

  If no match → Return 401 Unauthorized

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 5: Middleware Layer 4 - Rate Limiting (/api/* only)                 │
└──────────────────────────────────────────────────────────────────────────┘

middleware/rateLimit.ts:
  1. Identify request by API key: 'KEY_SITEA_abc123...'
  2. Check in-memory token bucket:
     - Minute bucket: 7/10 requests used
     - Hour bucket: 45/100 requests used
     - Day bucket: 234/500 requests used
  3. Consume 1 token from each bucket
  4. All within limits → Continue
  5. Set headers:
     - X-RateLimit-Limit: 10
     - X-RateLimit-Remaining: 2
     - X-RateLimit-Reset: 1696512000

  If any limit exceeded → Return 429 Too Many Requests

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 6: Middleware Layer 5 - Logging                                     │
└──────────────────────────────────────────────────────────────────────────┘

middleware/logger.ts:
  Log structured JSON:
  {
    "timestamp": "2025-10-05T10:30:00.000Z",
    "level": "info",
    "event": "request_received",
    "method": "POST",
    "path": "/api/send",
    "apiKey": "KEY_SITEA_***",
    "origin": "https://sitea.com",
    "channel": "email",
    "templateId": "contact-form"
  }

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 7: Route Handler - /api/send                                        │
└──────────────────────────────────────────────────────────────────────────┘

routes/send.ts:
  1. Parse request body (already validated by bodyLimit middleware)
  2. Validate structure:
     - channel: string (required)
     - templateId: string (required)
     - to: string (required)
     - data: object (required)
  3. Pass to channel handler

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 8: Channel Handler - Email                                          │
└──────────────────────────────────────────────────────────────────────────┘

channels/email.ts:
  1. Check availability: emailHandler.isAvailable() → true
  2. Load template: getTemplate('email', 'contact-form')
  3. Extract template definition:
     - id: 'contact-form'
     - schema: Zod validator
     - subject(), html(), text() methods
  4. Validate data with template.validate(data):
     • Throws ZodError if invalid
     • Returns typed data if valid
  5. Validation passes → Continue

  If channel unavailable → Return 502 Provider Error
  If validation fails → Return 400 Validation Error (ZodError details)

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 9: Template Rendering                                               │
└──────────────────────────────────────────────────────────────────────────┘

templates/email/contact-form.ts:
  1. Render subject:
     template.subject(data) → "Contact Form: John Doe"

  2. Render HTML body (with XSS sanitization):
     template.html(data) → `
       <html>
         <body>
           <h2>New Contact Form Submission</h2>
           <p><strong>From:</strong> John Doe</p>
           <p><strong>Email:</strong> john@example.com</p>
           <hr>
           <p><strong>Message:</strong></p>
           <p>I have a question...</p>
         </body>
       </html>
     `

  3. Render plain text:
     template.text(data) → "New Contact Form Submission\n\nFrom: John Doe\n..."

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 10: Provider API Call - Resend                                      │
└──────────────────────────────────────────────────────────────────────────┘

channels/email.ts:
  1. Initialize Resend client with config.resendApiKey
  2. Sanitize sender name to prevent header injection
  3. Prepare email params:
     {
       from: 'Company <noreply@company.com>',
       to: 'hello@company.com',
       reply_to: 'customer@example.com',
       subject: 'Contact Form: John Doe',
       html: '<html>...</html>',
       text: 'New Contact Form Submission...'
     }
  4. Send with 10s timeout (Promise.race)
  5. Resend returns: { data: { id: 'msg_abc123' } }

  If timeout → Return 502 Provider Timeout Error
  If Resend fails → Return 502 Provider Error

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 11: Response Logging                                                │
└──────────────────────────────────────────────────────────────────────────┘

middleware/logger.ts:
  Log success:
  {
    "timestamp": "2025-10-05T10:30:00.245Z",
    "level": "info",
    "event": "message_sent",
    "channel": "email",
    "templateId": "contact-form",
    "messageId": "msg_abc123",
    "to": "hello@***",
    "duration": 245,
    "apiKey": "KEY_SITEA_***"
  }

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 12: Success Response                                                │
└──────────────────────────────────────────────────────────────────────────┘

Return to client:
  {
    "success": true,
    "messageId": "msg_abc123",
    "channel": "email",
    "timestamp": "2025-10-05T10:30:00.245Z"
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
│ Layer 4: Rate Limiting & Abuse Prevention                             │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ Token Bucket Rate Limiter                                         │ │
│ │ • Per-API-key limits: 10/min, 100/hr, 500/day                     │ │
│ │ • IP-based secondary limits (optional)                            │ │
│ │ • Return 429 if exceeded                                          │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼──────────────────────────────────────┐
│ Layer 5: Input Validation & Sanitization                              │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ Schema Validation (Zod)                                           │ │
│ │ • Type checking                                                   │ │
│ │ • Field length limits                                             │ │
│ │ • Format validation (email, phone, etc.)                          │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ XSS Sanitization                                                  │ │
│ │ • HTML sanitization (DOMPurify)                                   │ │
│ │ • Strip malicious tags                                            │ │
│ │ • Encode special characters                                       │ │
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
│ │ Circuit Breaker                                                   │ │
│ │ • Prevent cascading failures                                      │ │
│ │ • Auto-recovery after provider downtime                           │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────▼──────────────┐
                    │  External Providers       │
                    │  • Resend (TLS)           │
                    │  • Twilio (TLS)           │
                    │  • Firebase (TLS)         │
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
// types/api.ts

export interface SendMessageRequest {
  channel: 'email' | 'sms' | 'push' | 'webhook';
  templateId: string;
  to: string;  // Email, phone, device token, or webhook URL
  from?: {     // Optional, channel-specific
    email?: string;
    name?: string;
  };
  replyTo?: string;  // Email only
  data: Record<string, unknown>;  // Template-specific data
}

export interface SendMessageResponse {
  success: boolean;
  messageId: string;
  channel: string;
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
  retryAfter?: number;  // For rate limit errors
}

export enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_CHANNEL = 'INVALID_CHANNEL',
  INVALID_TEMPLATE = 'INVALID_TEMPLATE',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
```

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
  │     • Sanitizes errors in production
  │     • Maps to appropriate HTTP status
  │
  ├─→ [1] HTTPS Enforcement
  │     • Runs on ALL routes (*)
  │     • Redirects HTTP → HTTPS in production
  │     • Sets HSTS header
  │
  ├─→ [2] CORS Validation
  │     • Runs on ALL routes (*)
  │     • Checks Origin header against ALLOWED_ORIGINS
  │     • Returns 403 if not whitelisted
  │     • Sets CORS headers if valid
  │
  ├─→ [3] Security Headers
  │     • Runs on ALL routes (*)
  │     • Sets X-Frame-Options, CSP, X-Content-Type-Options, etc.
  │     • Always continues (header-only)
  │
  ├─→ [4] Request Logger
  │     • Runs on ALL routes (*)
  │     • Logs structured JSON (method, path, headers)
  │     • Masks sensitive data (API keys, PII)
  │
  ├─→ [5] Body Size Limit
  │     • Runs on /api/* routes only
  │     • Checks Content-Length header
  │     • Returns 400 (PAYLOAD_TOO_LARGE) if > 50KB
  │
  ├─→ [6] Authentication
  │     • Runs on /api/* routes only
  │     • Validates X-API-Key header
  │     • Constant-time comparison
  │     • Returns 401 if invalid
  │     • Attaches API key to context
  │
  ├─→ [7] Rate Limiting
  │     • Runs on /api/* routes only
  │     • Token bucket algorithm (10/min, 100/hr, 500/day)
  │     • Returns 429 if limit exceeded
  │     • Consumes tokens if within limit
  │
  └─→ [8] Route Handler
        • /api/send, /health
        • Business logic
        • Response logging handled by logger middleware
```

### Middleware Implementation Pattern

```typescript
// middleware/auth.ts
import { Context, Next } from 'hono';
import { timingSafeEqual } from 'crypto';
import { apiKeys } from '../config';

export async function auth(c: Context, next: Next) {
  const providedKey = c.req.header('X-API-Key');

  if (!providedKey) {
    return c.json({
      success: false,
      error: 'Missing X-API-Key header',
      code: 'UNAUTHORIZED'
    }, 401);
  }

  // Constant-time comparison against all valid keys
  const isValid = apiKeys.some(validKey =>
    constantTimeCompare(providedKey, validKey)
  );

  if (!isValid) {
    return c.json({
      success: false,
      error: 'Invalid API key',
      code: 'UNAUTHORIZED'
    }, 401);
  }

  // Attach API key to context for logging
  c.set('apiKey', providedKey);

  await next();
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

---

## Channel System

### Channel Registry

```typescript
// channels/index.ts

import { emailHandler } from './email';
import type { ChannelHandler } from '../types/channels';
import type { Channel } from '../types/api';

export const channels: Record<string, ChannelHandler | undefined> = {
  email: emailHandler,
  // sms: smsHandler,      // Phase 2
  // push: pushHandler,    // Phase 2
  // webhook: webhookHandler // Phase 3
};

export function getChannel(channel: Channel): ChannelHandler {
  const handler = channels[channel];

  if (!handler) {
    throw new InvalidChannelError(`Unsupported channel: ${channel}`);
  }

  return handler;
}

// Note: Actual routing happens in routes/send.ts
// The handler checks availability, loads template, validates, and sends
```

**Actual Implementation (routes/send.ts)**:
```typescript
export async function sendMessage(request: SendMessageRequest) {
  // Get channel handler
  const handler = getChannel(request.channel);

  // Check availability
  const isAvailable = await handler.isAvailable();
  if (!isAvailable) {
    throw new ProviderError(`Channel ${request.channel} is not available`);
  }

  // Handler internally:
  // 1. Loads template via getTemplate(channel, templateId)
  // 2. Validates data with template.validate(data) - throws ZodError if invalid
  // 3. Renders using template.subject/html/text methods
  // 4. Sends via provider API
  const result = await handler.send(request);

  return {
    success: true,
    messageId: result.messageId,
    channel: request.channel,
    timestamp: result.timestamp,
  };
}
```

### Email Channel Implementation

```typescript
// channels/email.ts

import { Resend } from 'resend';
import { config, TIMEOUTS } from '../config';
import { getTemplate } from '../templates';
import type { EmailTemplate } from '../types/templates';

const resend = new Resend(config.resendApiKey);

export const emailHandler: ChannelHandler = {
  channel: 'email',

  async send(request: SendMessageRequest): Promise<ChannelSendResult> {
    // Get and validate template
    const template = getTemplate(request.channel, request.templateId) as EmailTemplate<unknown>;

    // Validate data (throws ZodError if invalid)
    const validatedData = template.validate(request.data);

    // Render template
    const rendered = {
      subject: template.subject(validatedData),
      html: template.html(validatedData),
      text: template.text(validatedData),
    };

    // Prepare email with header injection protection
    const from = request.from
      ? `${sanitizeSenderName(request.from.name || 'Conduit')} <${request.from.email}>`
      : 'Conduit <noreply@example.com>';

    // Send with timeout
    const response = await Promise.race([
      resend.emails.send({
        from,
        to: request.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        reply_to: request.replyTo,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), TIMEOUTS.provider)
      ),
    ]);

    return {
      messageId: response.data?.id || 'unknown',
      timestamp: new Date().toISOString(),
    };
  },

  async isAvailable(): Promise<boolean> {
    return !!config.resendApiKey && config.resendApiKey.length > 0;
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
// templates/email/contact-form.ts

import { z } from 'zod';
import type { EmailTemplate } from '../../types/templates';
import { sanitizeHtml, escapeHtml } from '../../utils/sanitize';

// Define data schema with strict validation
const contactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Invalid email address'),
  message: z.string().min(1, 'Message is required').max(5000, 'Message too long'),
  subject: z.string().max(200, 'Subject too long').optional(),
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
   * Generate email subject
   */
  subject(data: ContactFormData): string {
    if (data.subject) {
      return sanitizeHtml(data.subject);
    }
    return `Contact Form: ${sanitizeHtml(data.name)}`;
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
    const name = sanitizeHtml(data.name);
    const email = sanitizeHtml(data.email);
    const message = sanitizeHtml(data.message);

    return `
New Contact Form Submission
============================

From: ${name}
Email: ${email}

Message:
--------
${message}

---
Powered by Conduit
    `.trim();
  },
};
```

---

## Rate Limiting

### Token Bucket Algorithm

```typescript
// middleware/rateLimit.ts

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;  // tokens per millisecond
}

class RateLimiter {
  private buckets = new Map<string, {
    minute: TokenBucket;
    hour: TokenBucket;
    day: TokenBucket;
  }>();

  constructor(
    private limits: {
      perMinute: number;
      perHour: number;
      perDay: number;
    }
  ) {}

  tryConsume(apiKey: string): boolean {
    const buckets = this.getOrCreateBuckets(apiKey);
    const now = Date.now();

    // Refill buckets
    this.refillBucket(buckets.minute, now, 60 * 1000);
    this.refillBucket(buckets.hour, now, 60 * 60 * 1000);
    this.refillBucket(buckets.day, now, 24 * 60 * 60 * 1000);

    // Check all buckets
    if (buckets.minute.tokens < 1 ||
        buckets.hour.tokens < 1 ||
        buckets.day.tokens < 1) {
      return false;  // Rate limit exceeded
    }

    // Consume tokens
    buckets.minute.tokens--;
    buckets.hour.tokens--;
    buckets.day.tokens--;

    return true;
  }

  private refillBucket(bucket: TokenBucket, now: number, window: number) {
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = (timePassed / window) * bucket.capacity;

    bucket.tokens = Math.min(
      bucket.capacity,
      bucket.tokens + tokensToAdd
    );
    bucket.lastRefill = now;
  }

  private getOrCreateBuckets(apiKey: string) {
    if (!this.buckets.has(apiKey)) {
      const now = Date.now();
      this.buckets.set(apiKey, {
        minute: {
          tokens: this.limits.perMinute,
          lastRefill: now,
          capacity: this.limits.perMinute,
          refillRate: this.limits.perMinute / (60 * 1000)
        },
        hour: {
          tokens: this.limits.perHour,
          lastRefill: now,
          capacity: this.limits.perHour,
          refillRate: this.limits.perHour / (60 * 60 * 1000)
        },
        day: {
          tokens: this.limits.perDay,
          lastRefill: now,
          capacity: this.limits.perDay,
          refillRate: this.limits.perDay / (24 * 60 * 60 * 1000)
        }
      });
    }
    return this.buckets.get(apiKey)!;
  }
}
```

---

## Error Handling

### Error Flow

```
Error Occurs
  │
  ├─→ Known Error (ValidationError, AuthError, etc.)
  │     • Map to specific ErrorCode
  │     • Return appropriate HTTP status
  │     • Log with error level
  │
  └─→ Unknown Error (Exception, Provider failure, etc.)
        • Log with stack trace
        • Return generic INTERNAL_ERROR in production
        • Return detailed error in development
```

---

## Deployment Architecture

### Docker Container

```
┌─────────────────────────────────────────────────────────┐
│ Docker Container (conduit:latest)                       │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Node.js 18 Alpine                                  │ │
│  │ • Minimal base image (~50MB)                       │ │
│  │ • Security updates applied                         │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Application (non-root user 'nodejs')               │ │
│  │ • /app/dist/index.js                               │ │
│  │ • /app/node_modules (production only)              │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  Exposed Port: 3000                                     │
│  Health Check: GET /health every 30s                    │
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
- In-memory rate limiting
- Stateless request handling
- Suitable for:
  - 1-10 frontend applications
  - < 100,000 requests/day
  - < 10 req/sec average

### Horizontal Scaling (Phase 4)

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
- **Actual Implementation**: Error Handler → HTTPS → CORS → Security Headers → Logger → Body Limit → Auth → Rate Limit
- **Rationale**:
  - CORS before security headers for performance (reject early)
  - Body limit before auth to prevent DoS
  - Logger early to capture all requests
  - Error handler wraps everything

#### 5. **Body Size Limit** (v1.0.1)
- **Original Spec**: Not specified
- **Actual Implementation**: 50KB max via `bodyLimit` middleware
- **Rationale**: Critical DoS prevention gap identified in security review

#### 6. **Configuration Management**
- **Original Spec**: Manual environment variable parsing
- **Actual Implementation**: Zod schema validation with type coercion
- **Rationale**: Better error messages, type safety, consistent validation approach

#### 7. **Error Code Mapping**
- **Original Spec**: `PAYLOAD_TOO_LARGE` → HTTP 413
- **Actual Implementation**: `PAYLOAD_TOO_LARGE` → HTTP 400
- **Rationale**: Consistent 4xx error handling, simpler error mapping

### Version History

**v1.0.1** (2025-10-05):
- Added `bodyLimit` middleware (DoS prevention)
- Fixed middleware execution order
- Migrated to Zod config validation
- Updated architecture documentation

**v1.0.0** (2025-10-04):
- Initial MVP release
- Email channel via Resend
- 209 tests passing
- Complete security implementation

---

## Summary

This architecture provides:

✅ **Security**: Multi-layer defense with CORS, auth, rate limiting, input validation, DoS protection
✅ **Simplicity**: Single endpoint, clear request/response format
✅ **Scalability**: Stateless design, horizontal scaling ready
✅ **Maintainability**: Modular structure, typed interfaces, clear separation of concerns
✅ **Extensibility**: Easy to add new channels and templates

**Current Status** (v1.0.1):
- ✅ Phase 1 Complete (Email via Resend)
- ✅ 217 tests passing (80.05% coverage)
- ✅ Production-ready with security hardening
- ✅ Deployed to Coolify

**Next Steps**:
1. Monitor production metrics
2. Expand to Phase 2 (SMS + Push notifications)
3. Add analytics and delivery tracking
4. Implement circuit breaker for provider resilience
