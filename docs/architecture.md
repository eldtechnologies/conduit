# Conduit Architecture

**Version**: 1.0
**Last Updated**: 2025-10-05
**Status**: Specification Phase

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
│  │  │ 1. CORS Validation        (middleware/cors.ts)             │ │   │
│  │  │    • Check Origin header against ALLOWED_ORIGINS           │ │   │
│  │  │    • Reject if not whitelisted                             │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 2. Authentication         (middleware/auth.ts)             │ │   │
│  │  │    • Extract X-API-Key header                              │ │   │
│  │  │    • Constant-time comparison against API_KEY_* env vars   │ │   │
│  │  │    • Return 401 if invalid                                 │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 3. Rate Limiting          (middleware/rateLimit.ts)        │ │   │
│  │  │    • Token bucket algorithm (per API key)                  │ │   │
│  │  │    • Check: 10/min, 100/hr, 500/day                        │ │   │
│  │  │    • Return 429 if exceeded                                │ │   │
│  │  └────────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────────┐ │   │
│  │  │ 4. Request Logger         (middleware/logger.ts)           │ │   │
│  │  │    • Structured JSON logging                               │ │   │
│  │  │    • Mask sensitive data (PII, keys)                       │ │   │
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
  // Server
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),

  // Providers (Phase 1)
  RESEND_API_KEY: z.string().min(1),

  // API Keys (dynamic - any KEY_* env var)
  // Parsed separately

  // CORS
  ALLOWED_ORIGINS: z.string().transform(s => s.split(',')),

  // Rate Limiting
  RATE_LIMIT_PER_MINUTE: z.string().default('10').transform(Number),
  RATE_LIMIT_PER_HOUR: z.string().default('100').transform(Number),
  RATE_LIMIT_PER_DAY: z.string().default('500').transform(Number),
});

export const config = envSchema.parse(process.env);

// Parse API keys
export const apiKeys = Object.entries(process.env)
  .filter(([key]) => key.startsWith('API_KEY_'))
  .map(([, value]) => value as string);
```

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
│   ├── cors.ts             # CORS validation
│   ├── auth.ts             # API key authentication
│   ├── rateLimit.ts        # Token bucket rate limiter
│   ├── logger.ts           # Structured logging
│   ├── securityHeaders.ts  # Security headers (HSTS, CSP, etc.)
│   └── bodyLimit.ts        # Request size limits
│
├── channels/
│   ├── index.ts            # Channel registry and router
│   ├── email.ts            # Resend email integration
│   ├── sms.ts              # Twilio SMS (Phase 2)
│   ├── push.ts             # Firebase push (Phase 2)
│   └── webhook.ts          # HTTP webhooks (Phase 3)
│
├── templates/
│   ├── index.ts            # Template registry
│   ├── email/
│   │   ├── index.ts
│   │   ├── contact-form.ts
│   │   └── newsletter.ts
│   ├── sms/
│   │   ├── index.ts
│   │   └── verification-code.ts
│   └── push/
│       ├── index.ts
│       └── new-message.ts
│
├── utils/
│   ├── validation.ts       # Shared validators
│   ├── errors.ts           # Custom error classes
│   ├── sanitize.ts         # XSS/HTML sanitization
│   └── circuitBreaker.ts   # Circuit breaker for provider APIs
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
│ Step 3: Middleware Layer 2 - Authentication                              │
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
│ Step 4: Middleware Layer 3 - Rate Limiting                               │
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
│ Step 5: Middleware Layer 4 - Logging                                     │
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
│ Step 6: Route Handler - /api/send                                        │
└──────────────────────────────────────────────────────────────────────────┘

routes/send.ts:
  1. Parse request body
  2. Validate structure:
     - channel: string (required)
     - templateId: string (required)
     - to: string (required)
     - data: object (required)
  3. Pass to channel router

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 7: Channel Router                                                   │
└──────────────────────────────────────────────────────────────────────────┘

channels/index.ts:
  1. Extract channel: 'email'
  2. Check if channel is supported:
     - email: ✅ Active (Phase 1)
     - sms: ❌ Coming soon (Phase 2)
     - push: ❌ Coming soon (Phase 2)
  3. Route to channels/email.ts

  If unsupported → Return 400 Invalid Channel

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 8: Template Loading & Validation                                    │
└──────────────────────────────────────────────────────────────────────────┘

channels/email.ts:
  1. Load template: templates/email/contact-form.ts
  2. Extract template definition:
     - id: 'contact-form'
     - schema: Zod validator
     - subject: Function (data → string)
     - html: Function (data → HTML string)
  3. Validate data against schema:
     {
       name: z.string().min(1).max(100),
       email: z.string().email(),
       message: z.string().min(1).max(5000),
       phone: z.string().max(20).optional()
     }
  4. Validation passes → Continue

  If validation fails → Return 400 Validation Error

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 9: Template Rendering                                               │
└──────────────────────────────────────────────────────────────────────────┘

templates/email/contact-form.ts:
  1. Sanitize input data (XSS prevention):
     - name: sanitizeHtml('John Doe') → 'John Doe'
     - email: sanitizeHtml('john@example.com') → 'john@example.com'
     - message: sanitizeHtml('I have a question...') → 'I have a question...'

  2. Render subject:
     subject(data) → "New Contact Form Submission from John Doe"

  3. Render HTML body:
     html(data) → `
       <html>
         <body>
           <h2>New Contact Form Submission</h2>
           <p><strong>Name:</strong> John Doe</p>
           <p><strong>Email:</strong> john@example.com</p>
           <p><strong>Phone:</strong> +1234567890</p>
           <hr>
           <p>I have a question...</p>
         </body>
       </html>
     `

          ║
          ▼

┌──────────────────────────────────────────────────────────────────────────┐
│ Step 10: Provider API Call - Resend                                      │
└──────────────────────────────────────────────────────────────────────────┘

channels/email.ts:
  1. Initialize Resend client with RESEND_API_KEY
  2. Prepare request:
     {
       from: 'noreply@company.com',
       to: 'hello@company.com',
       reply_to: 'customer@example.com',
       subject: 'New Contact Form Submission from John Doe',
       html: '<html>...</html>'
     }
  3. Call Resend API with timeout (10s) and circuit breaker
  4. Resend returns: { id: 'msg_abc123', status: 'sent' }

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
    "timestamp": "2025-10-05T10:30:00Z"
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

export interface Template<TData = unknown> {
  id: string;
  channel: 'email' | 'sms' | 'push' | 'webhook';
  validate: (data: unknown) => data is TData;
  render: (data: TData) => RenderedTemplate;
}

export type RenderedTemplate =
  | EmailTemplate
  | SmsTemplate
  | PushTemplate
  | WebhookTemplate;

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;  // Plain text version
}

export interface SmsTemplate {
  body: string;
}

export interface PushTemplate {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface WebhookTemplate {
  payload: Record<string, unknown>;
}
```

### Channel Handler Interface

```typescript
// types/channels.ts

export interface ChannelHandler<TRequest = unknown, TResponse = unknown> {
  name: string;
  status: 'active' | 'coming_soon' | 'disabled';
  send: (request: TRequest) => Promise<TResponse>;
  validate?: (request: unknown) => request is TRequest;
}

export interface EmailRequest {
  to: string;
  from: { email: string; name: string };
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResponse {
  messageId: string;
  provider: 'resend';
}
```

---

## Middleware Pipeline

### Execution Order

```
Request
  │
  ├─→ [1] CORS Validation
  │     • Runs on ALL routes (*)
  │     • Checks Origin header
  │     • Sets CORS headers
  │     • Continues if valid, returns 403 if invalid
  │
  ├─→ [2] Security Headers
  │     • Runs on ALL routes (*)
  │     • Sets HSTS, X-Frame-Options, CSP, etc.
  │     • Always continues (header-only)
  │
  ├─→ [3] Body Size Limit
  │     • Runs on /api/* routes only
  │     • Checks Content-Length header
  │     • Returns 413 if > 50KB
  │
  ├─→ [4] Authentication
  │     • Runs on /api/* routes only
  │     • Validates X-API-Key header
  │     • Returns 401 if invalid
  │     • Attaches API key metadata to context
  │
  ├─→ [5] Rate Limiting
  │     • Runs on /api/* routes only
  │     • Checks per-key token buckets
  │     • Returns 429 if limit exceeded
  │     • Consumes tokens if within limit
  │
  ├─→ [6] Request Logger
  │     • Runs on ALL routes (*)
  │     • Logs structured JSON
  │     • Masks sensitive data
  │     • Always continues
  │
  ├─→ [7] Route Handler
  │     • /api/send, /health, /api/channels
  │     • Business logic
  │
  └─→ [8] Response Logger
        • Logs response status, duration
        • Masks sensitive response data
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
import { smsHandler } from './sms';
import { pushHandler } from './push';
import { webhookHandler } from './webhook';

export const channels = {
  email: emailHandler,
  sms: smsHandler,      // Phase 2
  push: pushHandler,    // Phase 2
  webhook: webhookHandler // Phase 3
};

export async function routeToChannel(
  channel: string,
  templateId: string,
  request: SendMessageRequest
): Promise<SendMessageResponse> {
  const handler = channels[channel];

  if (!handler) {
    throw new Error(`Unsupported channel: ${channel}`);
  }

  if (handler.status !== 'active') {
    throw new Error(`Channel ${channel} is not yet available`);
  }

  // Load template
  const template = await loadTemplate(channel, templateId);

  // Validate data
  if (!template.validate(request.data)) {
    throw new Error('Invalid template data');
  }

  // Render template
  const rendered = template.render(request.data);

  // Send via channel handler
  const result = await handler.send({
    to: request.to,
    from: request.from,
    ...rendered
  });

  return {
    success: true,
    messageId: result.messageId,
    channel,
    timestamp: new Date().toISOString()
  };
}
```

### Email Channel Implementation

```typescript
// channels/email.ts

import { Resend } from 'resend';
import { config } from '../config';

const resend = new Resend(config.RESEND_API_KEY);

export const emailHandler: ChannelHandler<EmailRequest, EmailResponse> = {
  name: 'email',
  status: 'active',

  async send(request: EmailRequest): Promise<EmailResponse> {
    const result = await resend.emails.send({
      from: `${request.from.name} <${request.from.email}>`,
      to: request.to,
      reply_to: request.replyTo,
      subject: request.subject,
      html: request.html,
      text: request.text
    });

    return {
      messageId: result.id,
      provider: 'resend'
    };
  }
};
```

---

## Template Engine

### Template Structure

```typescript
// templates/email/contact-form.ts

import { z } from 'zod';
import { sanitizeHtml } from '../../utils/sanitize';

// Define data schema
export const contactFormSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  message: z.string().min(1).max(5000),
  phone: z.string().max(20).optional()
});

export type ContactFormData = z.infer<typeof contactFormSchema>;

// Template definition
export const contactFormTemplate: Template<ContactFormData> = {
  id: 'contact-form',
  channel: 'email',

  validate(data: unknown): data is ContactFormData {
    return contactFormSchema.safeParse(data).success;
  },

  render(data: ContactFormData): EmailTemplate {
    // Sanitize all user input
    const safeName = sanitizeHtml(data.name);
    const safeEmail = sanitizeHtml(data.email);
    const safeMessage = sanitizeHtml(data.message);
    const safePhone = data.phone ? sanitizeHtml(data.phone) : null;

    return {
      subject: `New Contact Form Submission from ${safeName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #f4f4f4; padding: 10px; border-bottom: 2px solid #333; }
              .content { padding: 20px 0; }
              .field { margin-bottom: 15px; }
              .label { font-weight: bold; color: #333; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>New Contact Form Submission</h2>
              </div>
              <div class="content">
                <div class="field">
                  <span class="label">Name:</span> ${safeName}
                </div>
                <div class="field">
                  <span class="label">Email:</span> ${safeEmail}
                </div>
                ${safePhone ? `
                  <div class="field">
                    <span class="label">Phone:</span> ${safePhone}
                  </div>
                ` : ''}
                <hr>
                <div class="field">
                  <span class="label">Message:</span>
                  <p>${safeMessage.replace(/\n/g, '<br>')}</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
        New Contact Form Submission

        Name: ${safeName}
        Email: ${safeEmail}
        ${safePhone ? `Phone: ${safePhone}\n` : ''}

        Message:
        ${safeMessage}
      `
    };
  }
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

## Summary

This architecture provides:

✅ **Security**: Multi-layer defense with CORS, auth, rate limiting, input validation
✅ **Simplicity**: Single endpoint, clear request/response format
✅ **Scalability**: Stateless design, horizontal scaling ready
✅ **Maintainability**: Modular structure, typed interfaces, clear separation of concerns
✅ **Extensibility**: Easy to add new channels and templates

**Next Steps**:
1. Implement Phase 1 (Email via Resend)
2. Add comprehensive tests
3. Deploy to Coolify
4. Monitor and iterate
5. Expand to Phase 2 (SMS + Push)
