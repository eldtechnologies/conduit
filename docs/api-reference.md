# Conduit Specification

A lightweight, secure multi-channel communication proxy for sending emails, SMS, push notifications, and more from frontend applications without exposing API keys.

> **Implementation status**: only the **email** channel (via Resend) is implemented. SMS, push, webhooks and the other Phase 2+ items below are planned and **not implemented**; a request for those channels currently returns `400 INVALID_CHANNEL`.

## Overview

**Purpose**: Centralized communication service that handles multiple channels (email, SMS, push, webhooks) while keeping API keys secure on the backend.

**Vision**: Start with email, expand to all communication channels - one unified API for everything.

**Key Benefits**:
- Single service shared across multiple frontend applications
- API keys never exposed to client-side code
- Unified API for all communication channels
- Centralized rate limiting and abuse prevention
- Standardized message templates
- Simple REST API interface
- Minimal infrastructure footprint

## Architecture

### Tech Stack
- **Runtime**: Node.js 20.19+ (`engines` in package.json; the Docker image and CI use Node 22)
- **Framework**: Hono 4 with `@hono/node-server` 2
- **Language**: TypeScript 5 (strict mode)
- **Validation**: Zod 4
- **Email Provider**: Resend.com via the `resend` SDK 6 (Phase 1)
- **Optional content filtering**: Anthropic or OpenAI (LLM spam filtering, v1.2.0)
- **Tooling**: Vitest 4, ESLint 10, Prettier 3
- **Future Providers** (not implemented): Twilio (SMS), Firebase (Push), etc.
- **Deployment**: Docker + Coolify

### Why Hono?
- Extremely lightweight (~12KB)
- Fast startup and execution
- Built-in CORS, middleware support
- TypeScript-first
- Edge-compatible (can run on Cloudflare Workers if needed)
- Minimal dependencies

## Product Roadmap

### Phase 1: Email - **Implemented**
- ✅ Email sending via Resend
- ✅ Contact form template
- ✅ API key authentication (with revocation via `REVOKED_KEYS`)
- ✅ Rate limiting
- ✅ CORS protection
- ✅ Template system
- ✅ Recipient whitelisting per API key (v1.1.0)
- ✅ Optional LLM spam filtering per API key (v1.2.0)
- ✅ Sender allowlist per API key (`API_KEY_<NAME>_FROM_ADDRESSES`)
- ✅ Optional `Idempotency-Key` request header

### Phase 2: SMS & Push - **Planned, not implemented**
- 📱 SMS via Twilio
- 🔔 Push notifications via Firebase Cloud Messaging
- 📨 WhatsApp Business API integration
- 🎯 Multi-channel templates (email + SMS for same event)

### Phase 3: Webhooks & Integrations - **Planned, not implemented**
- 🌐 HTTP webhooks (POST to any endpoint)
- 💬 Slack notifications
- 📢 Discord notifications
- 🔗 Custom integrations

### Phase 4: Advanced Features - **Planned, not implemented**
- 📊 Analytics dashboard
- 📈 Delivery tracking & webhooks
- 🔄 Retry policies & dead letter queues
- 🎨 Visual template builder
- 📅 Scheduled sending
- 🧪 A/B testing

## API Specification

### Base URL
```
https://conduit.yourdomain.com
```

### Authentication
`POST /api/send` and `GET /health/detailed` require an API key in the `X-API-Key` header. `GET /health` is public.

```http
X-API-Key: KEY_MYSITE_<generated-suffix>
```

Missing, invalid and revoked keys all return `401 UNAUTHORIZED` (messages: `Missing API key`, `Invalid API key`, `API key has been revoked`).

### HTTPS

When `NODE_ENV=production` (or `ENFORCE_HTTPS=true`), every route except the exact path `/health` requires `X-Forwarded-Proto: https`, set by a trusted reverse proxy. Other requests get `403` with the plain-text body `HTTPS Required` (not JSON). HTTPS responses carry `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.

### Endpoints

#### POST /api/send
Sends a message via the specified channel.

**Request Headers**:
```http
Content-Type: application/json
X-API-Key: KEY_MYSITE_<generated-suffix>
Idempotency-Key: contact-form-7f3c9a      (optional)
X-Source-Origin: https://yourdomain.com    (optional, see CORS)
```

- `Idempotency-Key` (optional): 1-200 characters of `A-Z a-z 0-9 . _ : -`. A malformed value returns `400 VALIDATION_ERROR`. Conduit prefixes it with the app name of the authenticated key (`<NAME>` from its `API_KEY_<NAME>` variable, shortened with a hash suffix if longer than 55 characters; no part of the key value is sent) and passes it to Resend as its idempotency key, so a retry with the same key and body (for example after a `PROVIDER_TIMEOUT`) is not delivered twice. Reusing a key with a different body gets a Resend error (`502 PROVIDER_ERROR`). Each configured key has its own namespace, so two frontends can use the same `Idempotency-Key` values without colliding.
- `X-Source-Origin` (optional): used by the CORS check only when there is no `Origin` header (for server-side proxies and gateways). Browsers always send `Origin`, so for them it is ignored.

**Request Body (Email - Phase 1)**:
```json
{
  "channel": "email",
  "templateId": "contact-form",
  "to": "recipient@example.com",
  "replyTo": "customer@example.com",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "message": "Your message here",
    "subject": "Contact Form Submission"
  }
}
```

**Request fields** (validated in `src/routes/send.ts`; unknown top-level fields are stripped):

| Field | Required | Rules |
|-------|----------|-------|
| `channel` | Yes | String. Must be a registered channel (currently only `email`), otherwise `400 INVALID_CHANNEL`. Missing or non-string: `400 VALIDATION_ERROR`. |
| `templateId` | Yes | Non-empty string. Unknown template: `400 INVALID_TEMPLATE`. |
| `to` | Yes | Valid email address, max 320 characters. Checked against the key's recipient whitelist if one is configured (`403 RECIPIENT_NOT_ALLOWED`). |
| `data` | Yes | Object. Validated by the template's Zod schema (`400 VALIDATION_ERROR` on failure; fields not in the schema are dropped). |
| `from` | No | `{ "email": string, "name"?: string }`. `email` must be a valid address **and** in the key's `API_KEY_<NAME>_FROM_ADDRESSES` list (case-insensitive), otherwise `400 SENDER_NOT_ALLOWED`. A key with no sender allowlist rejects any `from`. `name`: max 100 characters, must not contain CR/LF or any of `<`, `>`, `"`, `@` (`400 VALIDATION_ERROR`). |
| `replyTo` | No | Valid email address. Sent as the email's Reply-To. |

**Sender address**: when `from` is omitted, the email is sent as `Conduit <first address in API_KEY_<NAME>_FROM_ADDRESSES>`. If the key has no sender allowlist, it falls back to the Resend test sender `Conduit <onboarding@resend.dev>`, which only delivers to the Resend account owner. Configure `API_KEY_<NAME>_FROM_ADDRESSES` with an address on your verified Resend domain for real delivery. When `from` is given, `from.name` (default `Conduit`) is used as the display name.

**Request Body (SMS - Phase 2, not implemented)**:
```json
{
  "channel": "sms",
  "templateId": "verification-code",
  "to": "+1234567890",
  "data": {
    "code": "123456",
    "appName": "Your App"
  }
}
```

**Request Body (Push - Phase 2, not implemented)**:
```json
{
  "channel": "push",
  "templateId": "new-message",
  "to": "device-token-here",
  "data": {
    "title": "New Message",
    "body": "You have a new message from John",
    "action": "/messages/123"
  }
}
```

**Request Body (Webhook - Phase 3, not implemented)**:
```json
{
  "channel": "webhook",
  "templateId": "slack-notification",
  "to": "https://hooks.slack.com/services/...",
  "data": {
    "text": "New user registration: john@example.com"
  }
}
```

The planned bodies above are shown for design reference only. Today they return `400 INVALID_CHANNEL` (and the `to` value must also pass the email check).

**Success Response (200 OK)**:
```json
{
  "success": true,
  "messageId": "msg_abc123",
  "channel": "email",
  "timestamp": "2025-10-05T10:30:00.000Z"
}
```

Outside production (`NODE_ENV` other than `production`), a key with LLM filtering enabled also gets an `llmAnalysis` object:

```json
{
  "success": true,
  "messageId": "msg_abc123",
  "channel": "email",
  "timestamp": "2025-10-05T10:30:00.000Z",
  "llmAnalysis": {
    "provider": "anthropic",
    "model": "claude-haiku-4-5",
    "allowed": true,
    "confidence": 0.05,
    "categories": [],
    "latency": 412
  }
}
```

When the LLM call fails and the key fails open, `llmAnalysis` has `"fallback": true` and `"fallbackReason": "LLM analysis failed"`. `llmAnalysis` is **never** returned in production.

**Request processing order** (first failing check wins): HTTPS → CORS → body size → authentication → JSON body parse and recipient whitelist → rate limit → channel → request schema → `Idempotency-Key` → sender allowlist → LLM filter (only if enabled for the key; validates template and template data before calling the LLM) → channel availability → template validation and send.

**Error Responses**:

All errors share this shape. `details` is only included outside production. `retryAfter` (seconds) is a top-level field on `429` responses and on `503` responses that carry a retry hint; those responses also get a `Retry-After` HTTP header with the same value.

```json
{
  "success": false,
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "details": { },
  "retryAfter": 60
}
```

Examples:

```json
// 400 Bad Request - unknown channel
{
  "success": false,
  "error": "Invalid channel: fax. Supported channels: email",
  "code": "INVALID_CHANNEL"
}

// 400 Bad Request - malformed JSON
{
  "success": false,
  "error": "Invalid JSON body",
  "code": "VALIDATION_ERROR"
}

// 401 Unauthorized
{
  "success": false,
  "error": "Invalid API key",
  "code": "UNAUTHORIZED"
}

// 429 Too Many Requests (also sets the header Retry-After: 6)
{
  "success": false,
  "error": "Rate limit exceeded (per-minute)",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 6
}
```

See [Error Codes](#error-codes) for the full list.

#### GET /health
Public health check endpoint (no API key, exempt from HTTPS enforcement). Used by the Docker `HEALTHCHECK`.

**Response (200 OK)**:
```json
{
  "status": "healthy"
}
```

#### GET /health/detailed
Authenticated diagnostics (`X-API-Key` required; HTTPS required in production).

**Response (200 OK)**:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-05T10:30:00.000Z",
  "version": "2.0.0-rc.1",
  "channels": {
    "email": {
      "status": "active",
      "provider": "resend",
      "configured": true
    }
  },
  "checks": {
    "memory": { "used": 18, "total": 34 },
    "uptime": 86400
  }
}
```

- `version`: read from `package.json` at startup (`"unknown"` if it cannot be read).
- `channels.email.status`: `"active"` when `RESEND_API_KEY` is set, otherwise `"inactive"`. Only `email` is listed.
- `checks.memory`: V8 heap used/total in MB. `checks.uptime`: seconds since start.

#### GET /api/channels (Phase 2+, not implemented)
List available channels and their status. This endpoint does not exist yet.

**Planned response (200 OK)**:
```json
{
  "channels": [
    {
      "id": "email",
      "name": "Email",
      "status": "active",
      "provider": "Resend",
      "templates": ["contact-form", "newsletter", "reset-password"]
    },
    {
      "id": "sms",
      "name": "SMS",
      "status": "active",
      "provider": "Twilio",
      "templates": ["verification-code", "alert"]
    }
  ]
}
```

## Templates

### Phase 1: Email Templates

#### contact-form
Contact form submissions. This is the only implemented template.

**Data Fields** (`src/templates/email/contact-form.ts`):
- `name` (string, required) - Sender's name, 1-100 characters
- `email` (string, required) - Sender's email, valid email address
- `message` (string, required) - Message content, 1-5000 characters
- `subject` (string, optional) - Subject line, max 200 characters

Other fields in `data` are dropped by the schema.

**Subject**: `subject` if given, otherwise `Contact Form: {name}`. The subject is plain text: tags are stripped, entities decoded and CR/LF removed.

**Email Body**: HTML body (user input HTML-escaped) plus a plain-text body (tags stripped, `&`, `<`, `>` kept as typed).

### Phase 2: SMS Templates (not implemented)

#### verification-code
Send verification codes.

**Required Data Fields**:
- `code` (string) - Verification code
- `appName` (string) - Application name

**SMS Body**: `Your {appName} verification code is: {code}. Valid for 10 minutes.`

#### alert
Generic alert messages.

**Required Data Fields**:
- `message` (string) - Alert message
- `appName` (string) - Application name

**SMS Body**: `{appName}: {message}`

### Phase 3: Push Notification Templates (not implemented)

#### new-message
New message notification.

**Required Data Fields**:
- `title` (string) - Notification title
- `body` (string) - Notification body
- `action` (string) - Deep link/URL to open

### Template Structure

Templates live in `src/templates/`, organized by channel, and are registered in `src/templates/index.ts` under the key `<channel>:<templateId>`:
```
src/templates/
├── email/
│   └── contact-form.ts
└── index.ts (template registry)
```

Each email template implements `EmailTemplate<TData>` from `src/types/templates.ts`:
```typescript
const contactFormSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  message: z.string().min(1).max(5000),
  subject: z.string().max(200).optional(),
});

export const contactFormTemplate: EmailTemplate<ContactFormData> = {
  id: 'contact-form',
  channel: 'email',
  schema: contactFormSchema,
  validate: (data) => contactFormSchema.parse(data), // throws ZodError -> 400 VALIDATION_ERROR
  subject: (data) => (data.subject ? toHeaderText(data.subject) : `Contact Form: ${toHeaderText(data.name)}`),
  html: (data) => `<!-- template HTML using escapeHtml(...) -->`,
  text: (data) => `<!-- plain text using toPlainText(...) -->`,
};
```

## Security Model

### API Key Management
1. **Generation**: `npm run generate-key -- APPNAME` (uses `crypto.randomBytes(16)`)
2. **Storage**: Environment variables (never in database)
3. **Format**: `KEY_<NAME>_<random>`; the generator produces 32 hex characters, and the loader accepts any suffix of 12+ alphanumeric characters
4. **Example**: `KEY_ELDTECH_cf5c8e452cf4842e2ff66511273410b8` (example only, generate your own)

**Environment Variables**:
```bash
API_KEY_ELDTECH=KEY_ELDTECH_cf5c8e452cf4842e2ff66511273410b8
API_KEY_PROJECTB=KEY_PROJECTB_bdf00cdacb6fa18791820026758f6549
API_KEY_PORTFOLIO=KEY_PORTFOLIO_c021a5b3d37412414c59b796e3a19974
```

**Startup validation** (`src/config.ts`): every `API_KEY_*` variable must be either
- an API key `API_KEY_<NAME>`, where `<NAME>` is uppercase letters/digits in segments separated by single underscores and the value matches `KEY_<NAME>_<12+ alphanumeric chars>`, or
- a per-key config variable `API_KEY_<NAME><SUFFIX>` (see [Per-API-key variables](#per-api-key-variables)) for a configured key.

Anything else (unknown suffixes, typos, empty values, lowercase names, values not in key format, config for an unconfigured key) fails startup. Error messages name the variable but never print its value. At least one API key is required.

**Revocation**: list keys in `REVOKED_KEYS` (comma-separated). Revoked keys get `401 UNAUTHORIZED`.

### CORS Configuration
Strict origin whitelisting via `ALLOWED_ORIGINS` (comma-separated, exact match, no wildcards):

```bash
ALLOWED_ORIGINS=https://eldtechnologies.com,https://projectb.com,http://localhost:8080
```

- `Origin` in the list: CORS headers are set (`Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, X-API-Key, X-Source-Origin, Idempotency-Key`, `Access-Control-Max-Age: 86400`). Preflight `OPTIONS` returns `204`.
- `Origin` present but not in the list: `403 ORIGIN_NOT_ALLOWED`, even if `X-Source-Origin` holds an allowed origin.
- `Origin` missing (or empty): `X-Source-Origin` is checked instead if present, and `403 ORIGIN_NOT_ALLOWED` if it is not in the list.
- No `Origin` and no `X-Source-Origin` (server-to-server, curl): the request continues.

### Rate Limiting
Per-API-key rate limits across ALL channels (applies to `/api/*`):

**Limits** (defaults, configurable with `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_HOUR`, `RATE_LIMIT_PER_DAY`):
- 10 requests per minute per API key
- 100 requests per hour per API key
- 500 requests per day per API key

**Strategy**: Token bucket per window, refilled continuously, stored in memory (per process; resets on restart). All three buckets are checked before any token is consumed, so a rejected request does not use up hour/day budget. A `429` reports the longest wait across the empty buckets in `retryAfter` and the `Retry-After` header.

**Headers on requests that pass**: `X-RateLimit-Limit-Minute`, `X-RateLimit-Limit-Hour`, `X-RateLimit-Limit-Day`, `X-RateLimit-Remaining-Minute`, `X-RateLimit-Remaining-Hour`, `X-RateLimit-Remaining-Day`.

**Note**: Rate limits apply to total requests across all channels, not per-channel. Rate limiting runs after recipient validation (a `403 RECIPIENT_NOT_ALLOWED` does not consume a token) and before LLM filtering (a `429` never triggers an LLM call).

### Channel-Specific Security

**Email** (implemented):
- Recipient whitelist per API key (`API_KEY_<NAME>_RECIPIENTS`, `_RECIPIENT_DOMAINS`)
- Sender allowlist per API key (`API_KEY_<NAME>_FROM_ADDRESSES`); display names cannot contain address delimiters
- Header injection protection (CR/LF rejected in sender name, stripped from subject)
- HTML-escaped HTML body, plain-text subject and text body
- Optional LLM content filtering per API key
- SPF/DKIM are handled by Resend domain verification, not by Conduit

**SMS** (Phase 2, not implemented):
- Phone number validation
- Carrier lookup
- SMS fraud detection

**Push** (Phase 2, not implemented):
- Device token validation
- Platform verification (iOS/Android)

**Webhooks** (Phase 3, not implemented):
- URL validation
- SSL/TLS enforcement
- Signature verification

## Security

🔒 **Security is critical for Conduit.** All security requirements, implementation guides, and best practices have been moved to dedicated security documentation.

### Security Documentation

- **[Security Overview](security/README.md)** - Security checklist, philosophy, and quick reference
- **[Security Review (archived, pre-v1.0.0)](security/archive/review-pre-v1.0.0.md)** - Original threat analysis, kept for history
- **[Security Implementation](security/implementation.md)** - Step-by-step hardening guide with code examples

### Critical Security Requirements (Phase 1)

All of these are implemented:

- [x] **HTTPS Enforcement** - `403 HTTPS Required` without `X-Forwarded-Proto: https` in production, HSTS header
- [x] **Request Size Limits** - Max 50KB body (`hono/body-limit`, also for chunked bodies without Content-Length), `413 PAYLOAD_TOO_LARGE`
- [x] **Cryptographically Secure API Keys** - `crypto.randomBytes`, not `Math.random()`
- [x] **Constant-Time Comparison** - `timingSafeEqual`, all keys checked
- [x] **XSS Sanitization** - HTML-escaped HTML body; DOMPurify-based plain-text helpers for subject and text body
- [x] **Security Headers** - X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy
- [x] **Template Field Limits** - Max lengths on all fields (Zod)
- [x] **Provider API Timeouts** - 10-second timeout that aborts the Resend request (`AbortSignal.timeout`), `502 PROVIDER_TIMEOUT`
- [x] **Split Health Endpoint** - Public `/health` vs authenticated `/health/detailed`
- [x] **Error Sanitization** - `details` and stack traces hidden in production

See **[security/implementation.md](security/implementation.md)** for complete implementation details with copy-paste ready code examples.

### Quick Security Reference

**Generate secure API keys**:
```bash
npm run generate-key -- APPNAME
```

**⚠️ DO NOT use Math.random()** - it's not cryptographically secure.

For full security guidance, start with **[security/README.md](security/README.md)**.

## Configuration

### Environment Variables

All variables are read and validated once at startup in `src/config.ts`. Invalid values fail startup.

#### Global variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | Yes | - | Resend API key |
| `ALLOWED_ORIGINS` | Yes | - | Comma-separated allowed origins (exact match) |
| `API_KEY_<NAME>` | Yes (at least one) | - | Frontend API key, see [API Key Management](#api-key-management) |
| `PORT` | No | `3000` | Server port (1-65535) |
| `NODE_ENV` | No | `development` | `development`, `production` or `test`. **Set `production` in production**: it enables HTTPS enforcement, HSTS and error sanitization. The Docker image and `docker-compose.yml` default to `production`. |
| `LOG_LEVEL` | No | `info` | Parsed but not currently used by the logger |
| `RATE_LIMIT_PER_MINUTE` | No | `10` | Positive integer |
| `RATE_LIMIT_PER_HOUR` | No | `100` | Positive integer |
| `RATE_LIMIT_PER_DAY` | No | `500` | Positive integer |
| `ENFORCE_HTTPS` | No | `false` | `true` also enforces HTTPS outside production. It cannot turn enforcement off when `NODE_ENV=production`. |
| `REVOKED_KEYS` | No | (empty) | Comma-separated revoked API key values |
| `LLM_PROVIDER` | No | - | `anthropic` or `openai` |
| `LLM_API_KEY` | No | - | LLM provider API key |
| `LLM_MODEL` | No | - | Model name, e.g. `claude-haiku-4-5` |
| `LLM_TIMEOUT` | No | `5000` | LLM request timeout in ms |
| `LLM_FALLBACK_MODE` | No | `allow` | Default per-key fail mode: `allow` or `block` (case-insensitive) |
| `LLM_ENDPOINT` | No | provider default | Custom endpoint URL (e.g. a proxy or regional endpoint) |

LLM filtering is configured only when `LLM_PROVIDER`, `LLM_API_KEY` and `LLM_MODEL` are all set. If any key sets `API_KEY_<NAME>_LLM_ENABLED=true` while one of them is missing, startup fails.

#### Per-API-key variables

`<NAME>` must match a configured `API_KEY_<NAME>`.

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEY_<NAME>_RECIPIENTS` | (none) | Comma-separated allowed recipient addresses (case-insensitive) |
| `API_KEY_<NAME>_RECIPIENT_DOMAINS` | (none) | Comma-separated allowed recipient domains (exact domain match) |
| `API_KEY_<NAME>_FROM_ADDRESSES` | (none) | Comma-separated allowed `from` addresses. The first is the default sender. An empty list or invalid address fails startup. Without it, any client `from` is rejected with `400 SENDER_NOT_ALLOWED`. |
| `API_KEY_<NAME>_LLM_ENABLED` | `false` | `true` enables LLM filtering for this key |
| `API_KEY_<NAME>_LLM_RULES` | `spam,abuse,promptInjection,phishing,scam` | Comma-separated categories to check (case-insensitive): `spam`, `abuse`, `profanity`, `promptInjection`, `phishing`, `scam`. Unknown names are ignored. |
| `API_KEY_<NAME>_LLM_THRESHOLD` | `0.7` | Block when the model rejects with confidence >= threshold (0-1; out-of-range values are ignored) |
| `API_KEY_<NAME>_LLM_FAIL_MODE` | `LLM_FALLBACK_MODE` | `allow` (send unfiltered) or `block` (`503`) when the LLM fails or the daily budget is used up. Invalid values fail startup. |
| `API_KEY_<NAME>_LLM_MAX_CALLS_PER_DAY` | `1000` | Daily LLM call budget (every attempt counts, resets at midnight UTC) |

If neither recipient variable is set for a key, all recipients are allowed.

**Removed**: `API_KEY_<NAME>_LLM_WHITELIST_SENDERS` was removed (sender fields are client-controlled and spoofable). Setting it fails startup.

#### Example

```bash
# Server
PORT=3000
NODE_ENV=production

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# API keys (generate with: npm run generate-key -- ELDTECH)
API_KEY_ELDTECH=KEY_ELDTECH_cf5c8e452cf4842e2ff66511273410b8
API_KEY_ELDTECH_RECIPIENTS=hello@eldtechnologies.com
API_KEY_ELDTECH_FROM_ADDRESSES=noreply@eldtechnologies.com

# CORS origins (comma-separated)
ALLOWED_ORIGINS=https://eldtechnologies.com

# Optional LLM spam filtering
# LLM_PROVIDER=anthropic
# LLM_API_KEY=sk-ant-xxxxx
# LLM_MODEL=claude-haiku-4-5
# API_KEY_ELDTECH_LLM_ENABLED=true
```

There are no `DEFAULT_FROM_*` variables; use `API_KEY_<NAME>_FROM_ADDRESSES`. Twilio, Firebase and Slack variables are not read (those channels are not implemented).

## Project Structure

```
conduit/
├── src/
│   ├── index.ts              # Hono app, middleware order, server startup
│   ├── config.ts             # Environment config (Zod), API key loading
│   ├── routes/
│   │   ├── send.ts          # POST /api/send handler
│   │   └── health.ts        # GET /health and /health/detailed
│   ├── middleware/
│   │   ├── errorHandler.ts  # Global error handler
│   │   ├── securityHeaders.ts # HTTPS enforcement + security headers
│   │   ├── cors.ts          # CORS handling
│   │   ├── logger.ts        # Request logging (masked)
│   │   ├── bodyLimit.ts     # 50KB body limit
│   │   ├── auth.ts          # API key validation
│   │   ├── recipientValidation.ts # JSON parse + recipient whitelist
│   │   ├── rateLimit.ts     # Rate limiting
│   │   └── llmFilter.ts     # LLM content filter (called from send route)
│   ├── channels/
│   │   ├── email.ts         # Resend integration (Phase 1)
│   │   └── index.ts         # Channel registry
│   ├── templates/
│   │   ├── email/
│   │   │   └── contact-form.ts
│   │   └── index.ts         # Template registry
│   ├── llm/                 # LLM providers (anthropic, openai)
│   ├── types/               # api.ts, channels.ts, templates.ts
│   └── utils/
│       ├── errors.ts        # Error classes and sanitization
│       ├── sanitize.ts      # HTML escaping / plain-text helpers
│       └── version.ts       # App version from package.json
├── tests/                   # unit/, integration/, security/, setup.ts
├── scripts/generate-api-key.ts
├── Dockerfile               # Multi-stage Docker build
├── docker-compose.yml
├── .dockerignore
├── package.json
├── tsconfig.json            # Typecheck (src, tests, scripts)
├── tsconfig.build.json      # Build (src only -> dist/)
└── README.md
```

## Deployment (Coolify)

### Dockerfile
See the [Dockerfile](../Dockerfile) in the repository root. In short:

- Builder stage (`node:22-alpine`): `npm ci`, `npm run build` (`tsc -p tsconfig.build.json` → `dist/`), `npm prune --production`
- Runtime stage (`node:22-alpine`): `ENV NODE_ENV=production`, non-root user `conduit` (uid 1001), copies `package*.json`, `node_modules` and `dist`
- `EXPOSE 3000`
- `HEALTHCHECK` runs `curl -f "http://localhost:${PORT:-3000}/health"` every 30s
- `CMD ["node", "dist/index.js"]` (same as `npm start`)

The image runs with `NODE_ENV=production`, so `/api/*` requires `X-Forwarded-Proto: https` from the proxy. For a local plain-HTTP run, pass `-e NODE_ENV=development`. `docker-compose.yml` also defaults `NODE_ENV` to `production`.

### Coolify Setup
1. Create new service in Coolify
2. Connect Git repository
3. Set environment variables in Coolify UI
4. Coolify auto-detects Dockerfile
5. Deploy

### Custom Domain
Set up subdomain in Coolify:
- `conduit.yourdomain.com` → Conduit Service
- Enable automatic SSL certificate

## Frontend Integration

### React Example (TypeScript)

**Email Service (Phase 1)**:
```typescript
// src/services/conduit.ts
const CONDUIT_URL = import.meta.env.VITE_CONDUIT_URL;
const API_KEY = import.meta.env.VITE_CONDUIT_API_KEY;

interface ContactFormData {
  name: string;
  email: string;
  message: string;
  subject?: string;
}

export async function sendEmail(data: ContactFormData): Promise<boolean> {
  try {
    const response = await fetch(`${CONDUIT_URL}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'contact@yourdomain.com',
        // `from` omitted: Conduit uses the key's first API_KEY_<NAME>_FROM_ADDRESSES entry
        replyTo: data.email,
        data,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Conduit error:', error);
    return false;
  }
}
```

**SMS Service (Phase 2, not implemented)**:
```typescript
export async function sendSMS(phone: string, code: string): Promise<boolean> {
  const response = await fetch(`${CONDUIT_URL}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      channel: 'sms',
      templateId: 'verification-code',
      to: phone,
      data: { code, appName: 'Your App' },
    }),
  });

  return response.ok;
}
```

**Push Notification (Phase 2, not implemented)**:
```typescript
export async function sendPushNotification(
  deviceToken: string,
  title: string,
  body: string
): Promise<boolean> {
  const response = await fetch(`${CONDUIT_URL}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      channel: 'push',
      templateId: 'new-message',
      to: deviceToken,
      data: { title, body, action: '/messages' },
    }),
  });

  return response.ok;
}
```

## Monitoring & Logging

### Logging Format
`src/middleware/logger.ts` writes two structured JSON lines per request (skipped when `NODE_ENV=test` unless `ENABLE_LOGGING=true`):

```json
{
  "type": "request",
  "requestId": "6f1c2c1e-6b0f-4b7e-9d43-3c0d8f1f2a10",
  "timestamp": "2025-10-05T10:30:00.000Z",
  "method": "POST",
  "path": "/api/send",
  "headers": { "x-api-key": "KEY_ELDTECH_****", "content-type": "application/json" }
}
{
  "type": "response",
  "requestId": "6f1c2c1e-6b0f-4b7e-9d43-3c0d8f1f2a10",
  "timestamp": "2025-10-05T10:30:00.245Z",
  "method": "POST",
  "path": "/api/send",
  "status": 200,
  "duration": 245,
  "app": "ELDTECH"
}
```

API keys are logged as `KEY_<NAME>_****` (anything not in that form as `****`). Cookie, Set-Cookie, client-IP headers (`X-Forwarded-For`, `X-Real-IP`, `CF-Connecting-IP`, `True-Client-IP`, `Forwarded`) and headers containing `token` or `secret` are logged as `****`.

### Metrics to Track
- Total messages sent per channel per day/hour
- Success rate per channel and template
- Average response time per channel
- Rate limit hits per API key
- Failed authentication attempts
- Provider API errors (Resend, LLM provider)

### Health Check Details
See [GET /health](#get-health) and [GET /health/detailed](#get-healthdetailed).

## Error Handling

### Error Codes
Generated from `ErrorCode` in `src/types/api.ts`, with the HTTP status the code actually returns:

| Code | HTTP Status | When |
|------|-------------|------|
| `UNAUTHORIZED` | 401 | Missing, invalid or revoked API key |
| `INVALID_CHANNEL` | 400 | `channel` is not a registered channel (only `email` is) |
| `INVALID_TEMPLATE` | 400 | Template ID not found for the channel |
| `VALIDATION_ERROR` | 400 | Malformed/non-object JSON, invalid request fields or template data, malformed `Content-Length` or `Idempotency-Key`, missing `to` for a key with a recipient whitelist |
| `SENDER_NOT_ALLOWED` | 400 | `from.email` not in the key's sender allowlist, or `from` sent for a key without one |
| `ORIGIN_NOT_ALLOWED` | 403 | Origin not in `ALLOWED_ORIGINS` |
| `RECIPIENT_NOT_ALLOWED` | 403 | Recipient not in the key's recipient whitelist |
| `CONTENT_BLOCKED_SPAM` | 403 | LLM filter blocked the content (spam, or no more specific category) |
| `CONTENT_BLOCKED_ABUSE` | 403 | LLM filter: abuse |
| `CONTENT_BLOCKED_PROFANITY` | 403 | LLM filter: profanity |
| `CONTENT_BLOCKED_PHISHING` | 403 | LLM filter: phishing |
| `CONTENT_BLOCKED_SCAM` | 403 | LLM filter: scam |
| `CONTENT_BLOCKED_PROMPT_INJECTION` | 403 | LLM filter: prompt injection |
| `PAYLOAD_TOO_LARGE` | 413 | Body larger than 50KB |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit hit; `retryAfter` + `Retry-After` header |
| `INTERNAL_ERROR` | 500 | Unexpected server error (generic message in production) |
| `PROVIDER_ERROR` | 502 | Resend returned an error |
| `PROVIDER_TIMEOUT` | 502 | Resend did not answer within 10s (request aborted) |
| `PROVIDER_UNAVAILABLE` | 503 | Channel provider not configured (cannot happen for email today: `RESEND_API_KEY` is required at startup) |
| `LLM_PROVIDER_ERROR` | 503 | LLM call failed (timeout, HTTP/network error, malformed output) for a key in `block` fail mode |
| `LLM_BUDGET_EXCEEDED` | 503 | Daily LLM budget used up for a key in `block` fail mode; `retryAfter` (seconds until midnight UTC) + `Retry-After` header |

The LLM block message is always `Content blocked by content filter`; categories, confidence and reasoning are only in `details` (non-production).

A revoked key returns `UNAUTHORIZED`, and an LLM timeout returns `LLM_PROVIDER_ERROR`. 2.0 removed the never-returned codes `INVALID_API_KEY`, `REVOKED_API_KEY`, `INVALID_REQUEST`, `MISSING_REQUIRED_FIELD`, `CORS_ERROR` and `LLM_TIMEOUT` from `ErrorCode`.

The HTTPS check returns `403` with a plain-text `HTTPS Required` body and no error code.

## Performance Considerations

### Response Times
- Target: < 500ms for /api/send (all channels)
- Health check: < 50ms

### Optimization Strategies
1. **Connection Pooling**: Reuse HTTP connections to providers
2. **Template Caching**: Pre-compile templates in memory
3. **Rate Limit Store**: In-memory, per process
4. **Minimal Dependencies**: Keep bundle size < 10MB
5. **Async Processing**: Queue long-running tasks (Phase 4, not implemented)

## API Versioning

The current endpoint is unversioned: `POST /api/send`. Versioned paths are planned, not implemented:
```
POST /api/v1/send
```

Breaking changes would require a new version:
```
POST /api/v2/send
```

## Migration Guide

### From Email-Only to Multi-Channel

**Old API (v0.x - Email Only)**:
```json
POST /api/send
{
  "templateId": "contact-form",
  "to": "user@example.com",
  "data": { ... }
}
```

**Current API (v1.0+ - Multi-Channel)**:
```json
POST /api/send
{
  "channel": "email",  // REQUIRED
  "templateId": "contact-form",
  "to": "user@example.com",
  "data": { ... }
}
```

`channel` is required; there is no default. A request without it returns `400 VALIDATION_ERROR`.

## Support & Maintenance

### Adding New Channel
1. Implement channel handler in `src/channels/`
2. Register it in `src/channels/index.ts`
3. Add templates to `src/templates/{channel}/` and register them in `src/templates/index.ts`
4. Add environment variables in `src/config.ts`
5. Update health check response in `src/routes/health.ts`
6. Deploy with zero downtime

### Adding New Frontend
1. Generate a new API key: `npm run generate-key -- APPNAME`
2. Add `API_KEY_<APPNAME>=<key>` to the Coolify environment
3. Recommended: set `API_KEY_<APPNAME>_RECIPIENTS` / `_RECIPIENT_DOMAINS` and `API_KEY_<APPNAME>_FROM_ADDRESSES`
4. Add origin to `ALLOWED_ORIGINS`
5. Restart service
6. Provide API key to frontend team (secure channel)

## License & Usage

Open source under MIT License. Free to use, modify, and distribute.

---

**Version**: 2.0.0-rc.1
**Last Updated**: 2026-10-24
**Maintainer**: ELD Technologies

**Tagline**: *One API for all your communication needs*
