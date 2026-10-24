# Security Implementation Guide

This document provides step-by-step implementation guidance for hardening Conduit's security. Sections 1-9, 12 (environment-based revocation) and 13 are implemented in `src/`; sections 10, 11 and the Redis option in 12 are **not implemented**. Code examples are simplified; the source in `src/` is authoritative, and each section states what the code actually does.

## Critical Security Requirements

The following security measures are **MANDATORY** for production deployment.

---

## 1. HTTPS/TLS Enforcement

**Requirement**: All production traffic must use HTTPS (TLS 1.2+)

**Why**: Prevents man-in-the-middle attacks and protects API keys in transit.

**Implementation**:

```typescript
// src/middleware/securityHeaders.ts
import type { Context, Next } from 'hono';
import { config } from '../config.js';

export async function enforceHttps(c: Context, next: Next) {
  // Only the public health check is exempt (container health checks).
  // Exact match: /health/detailed and other /health* paths still require HTTPS.
  if (c.req.path === '/health') {
    await next();
    return;
  }

  if (process.env.NODE_ENV === 'production' || config.enforceHttps) {
    // HTTPS is detected via X-Forwarded-Proto: run behind a trusted reverse
    // proxy that sets or overwrites this header
    const proto = c.req.header('x-forwarded-proto') || 'http';
    if (proto !== 'https') {
      return c.text('HTTPS Required', 403);
    }

    // HTTP Strict Transport Security: only use HTTPS for 1 year
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  await next();
}
```

**Environment Configuration**:
```bash
# .env
# Default false. Enforces HTTPS even when NODE_ENV is not production
ENFORCE_HTTPS=true
```

With `NODE_ENV=production`, HTTPS is always enforced; `ENFORCE_HTTPS=false` does not turn it off. `NODE_ENV` defaults to `development`, so set `NODE_ENV=production` in production.

**Testing**:
```typescript
it('rejects HTTP requests in production', async () => {
  process.env.NODE_ENV = 'production';
  const res = await app.request('/api/send', {
    headers: { 'x-forwarded-proto': 'http' }
  });
  expect(res.status).toBe(403);
});
```

---

## 2. Request Size Limits

**Requirement**: Maximum 50KB payload to prevent DoS attacks

**Why**: Large payloads can exhaust memory and crash the server.

**Implementation**:

```typescript
// src/middleware/bodyLimit.ts (simplified)
import type { MiddlewareHandler } from 'hono';
import { bodyLimit as honoBodyLimit } from 'hono/body-limit';
import { PayloadTooLargeError, ValidationError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

const MAX_BODY_SIZE = 50 * 1024; // 50KB

// hono/body-limit trusts Content-Length when present (and no Transfer-Encoding);
// otherwise it counts the bytes actually read and aborts once the limit is passed,
// so chunked/streamed bodies without Content-Length cannot bypass it
const enforceBodyLimit = honoBodyLimit({
  maxSize: MAX_BODY_SIZE,
  onError: () => {
    throw new PayloadTooLargeError('Request body too large. Maximum size: 50KB', {
      maxSize: MAX_BODY_SIZE,
    });
  },
});

export const bodyLimit: MiddlewareHandler = async (c, next) => {
  const contentLength = c.req.header('Content-Length');
  if (contentLength !== undefined && !/^\d+$/.test(contentLength.trim())) {
    throw new ValidationError('Invalid Content-Length header', ErrorCode.VALIDATION_ERROR);
  }
  await enforceBodyLimit(c, next);
};

// src/index.ts
app.use('/api/*', bodyLimit);
```

Oversized bodies get 413 `PAYLOAD_TOO_LARGE` (`details.maxSize`, plus `details.actualSize` when a trusted `Content-Length` was sent, outside production only). A non-numeric `Content-Length` gets 400 `VALIDATION_ERROR`. `/health` is not covered by the limit.

**Template Field Limits**:

```typescript
// src/templates/email/contact-form.ts
import { z } from 'zod';

const contactFormSchema = z.object({
  name: z.string().min(1).max(100),          // Max 100 characters
  email: z.string().email(),                 // Valid email address
  message: z.string().min(1).max(5000),      // Max 5000 characters
  subject: z.string().max(200).optional(),   // Max 200 characters
});
```

The request schema in `src/routes/send.ts` also limits `to` to 320 characters and `from.name` to 100. Unknown `data` fields are dropped by the template schema.

**Testing**:
```typescript
it('rejects payloads over 50KB', async () => {
  const largePayload = JSON.stringify({ data: 'x'.repeat(51 * 1024) });
  const res = await app.request('/api/send', {
    method: 'POST',
    body: largePayload
  });
  expect(res.status).toBe(413);
});
```

---

## 3. Cryptographically Secure API Key Generation

**Requirement**: Use `crypto.randomBytes` for API key generation

**Why**: `Math.random()` is NOT cryptographically secure and can be predicted.

**WRONG (insecure)**:
```bash
# DO NOT USE - Math.random() is predictable
node -e "console.log('KEY_APP_' + Math.random().toString(36))"
```

**CORRECT (secure)**:
```bash
# Use crypto.randomBytes for cryptographically secure generation
node -e "console.log('KEY_APP_' + require('crypto').randomBytes(16).toString('hex'))"
```

**Dedicated Script**:

```typescript
// scripts/generate-api-key.ts
import crypto from 'crypto';

export function generateApiKey(appName: string): string {
  // Generate 16 random bytes = 32 hex characters
  const randomSuffix = crypto.randomBytes(16).toString('hex');
  return `KEY_${appName.toUpperCase()}_${randomSuffix}`;
}

// CLI usage
if (require.main === module) {
  const appName = process.argv[2] || 'APP';
  console.log(generateApiKey(appName));
}
```

**Package.json script**:
```json
{
  "scripts": {
    "generate-key": "tsx scripts/generate-api-key.ts"
  }
}
```

**Usage**:
```bash
npm run generate-key -- mysite
# Output: KEY_MYSITE_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1
```

The real script (`scripts/generate-api-key.ts`) also uppercases the name and replaces non-alphanumeric characters with `_`.

**Startup validation** (`src/config.ts`): every `API_KEY_*` environment variable is classified when Conduit starts.

- `API_KEY_<NAME>_<SUFFIX>` with a known suffix (`_RECIPIENTS`, `_RECIPIENT_DOMAINS`, `_FROM_ADDRESSES`, `_LLM_ENABLED`, `_LLM_RULES`, `_LLM_THRESHOLD`, `_LLM_FAIL_MODE`, `_LLM_MAX_CALLS_PER_DAY`) is a per-key config variable. `API_KEY_<NAME>` must be configured, otherwise startup fails
- Any other `API_KEY_<NAME>` is an API key. Its value must match `KEY_<NAME>_<12+ alphanumeric chars>` (the generator produces 32 hex chars), otherwise startup fails
- The removed `API_KEY_<NAME>_LLM_WHITELIST_SENDERS` fails startup with an explanation
- At least one API key must be configured

So a typo (`API_KEY_SITE_RECIPIENT`) or a config value (`true`, `70`, an email address) can never become an accepted API key. Error messages name the variable but not its value.

---

## 4. Constant-Time API Key Comparison

**Requirement**: Use `timingSafeEqual` to prevent timing attacks

**Why**: Standard string comparison (`===`) leaks timing information that attackers can use to guess keys.

**Implementation**:

```typescript
// src/middleware/auth.ts (simplified)
import { timingSafeEqual } from 'crypto';
import type { Context, Next } from 'hono';
import { config } from '../config.js';
import { AuthError } from '../utils/errors.js';
import { ErrorCode } from '../types/api.js';

/** Constant-time check of `key` against every same-length entry (no early exit) */
function matchesAny(key: string, candidates: string[]): boolean {
  let found = false;
  for (const candidate of candidates) {
    if (key.length === candidate.length && timingSafeEqual(Buffer.from(key), Buffer.from(candidate))) {
      found = true;
    }
  }
  return found;
}

export async function authenticate(c: Context, next: Next) {
  const apiKey = c.req.header('X-API-Key');

  if (!apiKey) {
    throw new AuthError('Missing API key', ErrorCode.UNAUTHORIZED);
  }

  if (matchesAny(apiKey, config.revokedKeys)) {
    throw new AuthError('API key has been revoked', ErrorCode.UNAUTHORIZED);
  }

  // config.apiKeys holds only the values that passed startup validation,
  // never per-key config values such as API_KEY_<NAME>_LLM_ENABLED
  if (!matchesAny(apiKey, config.apiKeys)) {
    throw new AuthError('Invalid API key', ErrorCode.UNAUTHORIZED);
  }

  // Attach API key to context (the logger masks it)
  c.set('apiKey', apiKey);

  await next();
}
```

Never build the key list from `Object.entries(process.env)` filtered on `API_KEY_`: that turns every per-key config value into an accepted API key. All three failures return 401 `UNAUTHORIZED`.

**Testing** (illustrative; `tests/security/auth.test.ts` instead checks that every same-length key is compared, with no early exit):
```typescript
it('uses constant-time comparison for API keys', async () => {
  // Statistical timing test
  const times: number[] = [];

  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    await validateKey('WRONG_KEY_xxxxxxxxxxxxxxxxx');
    times.push(performance.now() - start);
  }

  const avgTime = times.reduce((a, b) => a + b) / times.length;
  const variance = times.map(t => Math.abs(t - avgTime))
    .reduce((a, b) => a + b) / times.length;

  // Low variance = constant time (no timing leakage)
  expect(variance).toBeLessThan(0.1);
});
```

---

## 5. XSS Sanitization

**Requirement**: Sanitize all user input in email templates

**Why**: Malicious JavaScript in emails can execute in email clients, stealing credentials or phishing.

**Installation**:
```bash
npm install isomorphic-dompurify
```

**Implementation**:

```typescript
// src/utils/sanitize.ts
import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML to prevent XSS attacks.
 * Strips ALL HTML tags for plain text fields.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],   // Strip all HTML tags
    ALLOWED_ATTR: []    // Strip all attributes
  });
}

/**
 * Sanitize rich text (if needed for Phase 2+).
 * Allows only safe formatting tags.
 */
export function sanitizeRichText(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: []
  });
}
```

The real `sanitizeRichText()` also allows `<a>` with `href`/`title` and only `http(s)` links. It is not used by any current template.

**Template Usage** (as in `src/templates/email/contact-form.ts`, simplified):

```typescript
import { escapeHtml, toHeaderText, toPlainText } from '../../utils/sanitize.js';

export const contactFormTemplate = {
  id: 'contact-form',
  channel: 'email',

  // Subject is a header: tags stripped, entities decoded, CR/LF removed
  subject: (data: ContactFormData) =>
    data.subject ? toHeaderText(data.subject) : `Contact Form: ${toHeaderText(data.name)}`,

  // HTML body: ALWAYS entity-escape user input before rendering
  html: (data: ContactFormData) => {
    const name = escapeHtml(data.name);
    const email = escapeHtml(data.email);
    const message = escapeHtml(data.message).replace(/\n/g, '<br>');

    return `
      <p><strong>From:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong></p>
      <div>${message}</div>
    `;
  },

  // Plain-text body: tags stripped, '&', '<' and '>' kept as typed
  text: (data: ContactFormData) =>
    `From: ${toPlainText(data.name)}\nEmail: ${toPlainText(data.email)}\n\n${toPlainText(data.message)}`,
};
```

**Testing**:
```typescript
it('sanitizes XSS in templates', () => {
  const html = renderTemplate({
    name: '<script>alert("XSS")</script>',
    message: '<img src=x onerror=alert(1)>'
  });

  expect(html).not.toContain('<script>');
  expect(html).not.toContain('onerror');
  expect(html).toContain('&lt;script&gt;'); // Entities escaped
});
```

---

## 6. Security Headers

**Requirement**: Add comprehensive security headers

**Why**: Defense-in-depth protection against various attacks (clickjacking, MIME sniffing, etc.)

**Implementation**:

```typescript
// src/middleware/securityHeaders.ts
import { Context, Next } from 'hono';

export async function securityHeaders(c: Context, next: Next) {
  // Prevent MIME-type sniffing (forces browser to respect Content-Type)
  c.header('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking (disallows embedding in iframes)
  c.header('X-Frame-Options', 'DENY');

  // Enable browser XSS protection (legacy, but harmless)
  c.header('X-XSS-Protection', '1; mode=block');

  // Control referrer information leakage
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict browser features (microphone, camera, geolocation)
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Content Security Policy (for JSON API, deny everything)
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

  // HSTS (in production, or when ENFORCE_HTTPS=true)
  if (process.env.NODE_ENV === 'production' || config.enforceHttps) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  await next();
}
```

**Testing**:
```typescript
it('includes all security headers', async () => {
  const res = await app.request('/health');

  expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
  expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
});
```

---

## 7. Provider API Timeouts

**Requirement**: Prevent hanging requests to provider APIs

**Why**: Slow/hanging provider requests can exhaust server resources.

**Implementation**:

```typescript
// src/config.ts
export const TIMEOUTS = {
  provider: 10000,    // 10 seconds for provider APIs (Resend, Twilio, etc.)
  request: 15000,     // 15 seconds total request timeout
  keepAlive: 5000     // 5 seconds keep-alive timeout
};
```

```typescript
// src/channels/email.ts (simplified)
import { TIMEOUTS } from '../config.js';

// Abort the HTTP request itself on timeout (not just stop waiting for it),
// so a timed-out send is not delivered later
const signal = AbortSignal.timeout(TIMEOUTS.provider);
const requestOptions: CreateEmailRequestOptions = { signal };
if (request.idempotencyKey) {
  requestOptions.idempotencyKey = request.idempotencyKey;
}

let response: CreateEmailResponse;
try {
  response = await resend.emails.send(emailParams, requestOptions);
} catch (error) {
  if (signal.aborted) throw providerTimeoutError(); // 502 PROVIDER_TIMEOUT
  throw error;
}
// The SDK can also report an aborted fetch as response.error
if (response.error && signal.aborted) throw providerTimeoutError();
```

Do not use `Promise.race` for this: it stops waiting but lets the request continue, so the email may still be sent after the client was told it failed. After a `PROVIDER_TIMEOUT`, clients can retry with the same `Idempotency-Key` header (1-200 characters of `A-Z a-z 0-9 . _ : -`) without sending the email twice.

---

## 8. Health Endpoint Information Disclosure

**Requirement**: Split into public and authenticated endpoints

**Why**: Exposing provider details, version, and system info aids attackers.

**Implementation**:

```typescript
// src/routes/health.ts (simplified)
import { Hono } from 'hono';
import { emailHandler } from '../channels/email.js';
import { APP_VERSION } from '../utils/version.js'; // read from package.json at startup

const health = new Hono();

// Public health check (minimal info, no auth required)
health.get('/', (c) => {
  return c.json({ status: 'healthy' });
});

// Detailed health check (authentication applied in src/index.ts:
// app.use('/health/detailed', authenticate))
health.get('/detailed', async (c) => {
  const emailAvailable = await emailHandler.isAvailable();
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    channels: {
      email: {
        status: emailAvailable ? 'active' : 'inactive',
        provider: emailHandler.getProviderName(), // 'resend'
        configured: emailAvailable
      }
    },
    checks: {
      memory: { used: heapUsedMB, total: heapTotalMB }, // rounded MB
      uptime: secondsSinceStart
    }
  });
});

export default health;
```

---

## 9. Recipient Whitelisting (v1.1.0)

**Requirement**: Restrict which email addresses can receive messages per API key

**Why**: Prevents stolen API keys from being used to spam arbitrary recipients. This is a critical defense-in-depth measure.

**Implementation**:

Recipient whitelisting is configured via environment variables and enforced by middleware (`src/middleware/recipientValidation.ts`). No code changes needed in application logic.

**Environment Configuration**:

Every `API_KEY_<NAME>_RECIPIENTS` / `_RECIPIENT_DOMAINS` variable needs `API_KEY_<NAME>` to be set to a valid key; otherwise startup fails.

```bash
# .env
API_KEY_MYSITE=KEY_MYSITE_50c1c716a72d6637bb4bfa4e0d0c2269

# Option 1: Whitelist specific email addresses
API_KEY_MYSITE_RECIPIENTS=support@company.com,admin@company.com,contact@company.com

# Option 2: Whitelist entire domains
API_KEY_MYSITE_RECIPIENT_DOMAINS=company.com,subsidiary.com

# Option 3: Combine both (recipient must match EITHER list)
API_KEY_WEBSITE_RECIPIENTS=newsletter@company.com
API_KEY_WEBSITE_RECIPIENT_DOMAINS=company.com

# Multiple API keys with different restrictions
API_KEY_SUPPORT_RECIPIENTS=support@company.com
API_KEY_SUPPORT_RECIPIENT_DOMAINS=company.com

API_KEY_MARKETING_RECIPIENTS=marketing@company.com
API_KEY_MARKETING_RECIPIENT_DOMAINS=company.com,partner.com
```

**How It Works**:

1. Middleware extracts recipient email from request (`to` field); a missing or non-string `to` gets 400 `VALIDATION_ERROR` for keys with a whitelist
2. Looks up the API key's whitelist (loaded once at startup)
3. Checks if recipient email matches (case-insensitive):
   - Exact match in `API_KEY_*_RECIPIENTS` list, OR
   - Domain (exact, no subdomains) matches one in `API_KEY_*_RECIPIENT_DOMAINS` list
4. Blocks request with 403 `RECIPIENT_NOT_ALLOWED` if no match. This runs **before rate limiting**, so blocked requests do not consume rate-limit tokens

**Configuration Examples**:

```bash
# Single recipient only (contact form)
API_KEY_CONTACT_RECIPIENTS=support@company.com

# Multiple recipients (support team)
API_KEY_SUPPORT_RECIPIENTS=support@company.com,tech@company.com,admin@company.com

# Entire domain (internal tools)
API_KEY_INTERNAL_RECIPIENT_DOMAINS=company.com

# Domain + exceptions (newsletter service)
API_KEY_NEWSLETTER_RECIPIENTS=newsletter@mailservice.com
API_KEY_NEWSLETTER_RECIPIENT_DOMAINS=company.com

# Multiple domains (multi-brand company)
API_KEY_MULTIBRAND_RECIPIENT_DOMAINS=brand1.com,brand2.com,brand3.com
```

**Error Response** (when recipient not whitelisted):

```json
{
  "success": false,
  "error": "Recipient not allowed. This recipient is not in the whitelist for this API key.",
  "code": "RECIPIENT_NOT_ALLOWED"
}
```

The response never echoes the recipient or the whitelist. Outside production it also includes `details.hint`.

**Testing** (simplified; see `tests/security/recipientValidation.test.ts`):

```typescript
// tests/security/recipientValidation.test.ts
import { describe, it, expect } from 'vitest';

describe('Recipient Whitelisting', () => {
  it('allows whitelisted email addresses', async () => {
    const res = await app.request('/api/send', {
      method: 'POST',
      headers: {
        'X-API-Key': 'KEY_WEBSITE_657582934edbf009f73afb38c38111f6',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'support@company.com', // Whitelisted
        data: { name: 'Test', email: 'test@example.com', message: 'Test' }
      })
    });

    expect(res.status).toBe(200);
  });

  it('blocks non-whitelisted email addresses', async () => {
    const res = await app.request('/api/send', {
      method: 'POST',
      headers: {
        'X-API-Key': 'KEY_WEBSITE_657582934edbf009f73afb38c38111f6',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'attacker@evil.com', // NOT whitelisted
        data: { name: 'Test', email: 'test@example.com', message: 'Test' }
      })
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('RECIPIENT_NOT_ALLOWED');
  });

  it('allows emails from whitelisted domains', async () => {
    const res = await app.request('/api/send', {
      method: 'POST',
      headers: {
        'X-API-Key': 'KEY_WEBSITE_657582934edbf009f73afb38c38111f6',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'anyone@company.com', // Domain whitelisted
        data: { name: 'Test', email: 'test@example.com', message: 'Test' }
      })
    });

    expect(res.status).toBe(200);
  });
});
```

**Security Benefits**:

1. **Stolen Key Protection**: Even if API key is exposed, attacker can only send to whitelisted recipients
2. **Spam Prevention**: Prevents using Conduit for arbitrary spam campaigns
3. **Cost Control**: Limits potential abuse and associated costs
4. **Compliance**: Helps meet data protection requirements by controlling where PII can be sent

**Best Practices**:

- ✅ Use domain whitelisting for internal tools (e.g., `company.com`)
- ✅ Use specific email whitelisting for external services (e.g., `newsletter@mailservice.com`)
- ✅ Review whitelist configuration quarterly
- ✅ Log blocked attempts for security monitoring
- ❌ Don't use overly broad domain whitelists (e.g., `gmail.com`)
- ❌ Don't skip whitelisting for "low-risk" API keys

**Documentation**: See [../features/recipient-whitelisting.md](../features/recipient-whitelisting.md) for complete feature documentation and use cases.

---

## Important Security Enhancements

The following are **recommended** for production but not critical for MVP.

---

## 10. IP-Based Rate Limiting (Secondary)

**Status**: Not implemented. The design below is a proposal.

**What exists today** (`src/middleware/rateLimit.ts`): rate limiting per API key only, with in-memory token buckets for three windows (`RATE_LIMIT_PER_MINUTE`/`_PER_HOUR`/`_PER_DAY`, defaults 10/100/500). All three buckets are refilled and checked before any token is consumed, so a rejected request never drains the hour or day budget. A rejected request gets 429 `RATE_LIMIT_EXCEEDED` with `retryAfter` (the longest wait among the empty buckets) in the body and a `Retry-After` header. Successful requests get `X-RateLimit-Limit-*` and `X-RateLimit-Remaining-*` headers. State is per process and resets on restart.

**Purpose**: Additional protection if API key is compromised

**Implementation**:

```typescript
// src/middleware/rateLimit.ts
import { Context, Next } from 'hono';

const rateLimitConfig = {
  perKey: { minute: 10, hour: 100, day: 500 },
  perIP: { minute: 20, hour: 200 }  // Secondary limit, more lenient
};

export async function rateLimit(c: Context, next: Next) {
  const apiKey = c.get('apiKey');
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

  // Check both limits
  const keyLimitExceeded = !checkKeyLimit(apiKey);
  const ipLimitExceeded = !checkIPLimit(ip);

  if (keyLimitExceeded || ipLimitExceeded) {
    return c.json({
      success: false,
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 60
    }, 429);
  }

  await next();
}
```

---

## 11. Circuit Breaker for Provider APIs

**Status**: Not implemented. The design below is a proposal.

**Purpose**: Prevent cascading failures when providers are down

**Implementation**:

```typescript
// src/utils/circuitBreaker.ts
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: CircuitState = 'CLOSED';

  private readonly failureThreshold = 5;       // Open after 5 failures
  private readonly cooldownPeriod = 60000;     // 1 minute cooldown

  async call<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition to HALF_OPEN
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.cooldownPeriod) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker OPEN - service temporarily unavailable');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}
```

**Usage**:

```typescript
// src/channels/email.ts
import { CircuitBreaker } from '../utils/circuitBreaker';

const resendCircuit = new CircuitBreaker();

export async function sendEmail(data: EmailData) {
  return resendCircuit.call(async () => {
    return await resend.emails.send(data);
  });
}
```

---

## 12. API Key Revocation Mechanism

**Purpose**: Invalidate compromised keys without a code change

**Option A: Environment-based revocation list (simple)** - implemented

```bash
# .env
REVOKED_KEYS=KEY_OLD_647cfb9ac0dc1629d3075f5bf69816d1,KEY_COMPROMISED_0677f6aa823dff288eaf42dc9333e03d
```

`src/middleware/auth.ts` checks the header against `config.revokedKeys` with the same constant-time comparison as for valid keys (see [section 4](#4-constant-time-api-key-comparison)) and rejects a match with 401 `UNAUTHORIZED` ("API key has been revoked"), even if the key is still configured. Configuration is loaded at startup, so **restart Conduit** after changing `REVOKED_KEYS`. Removing the `API_KEY_<NAME>` variable (and its per-key config variables, which otherwise fail startup) and restarting also disables a key.

**Option B: Redis-based key store (advanced, Phase 2+)** - not implemented

```typescript
// Allows runtime revocation without restart
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

interface ApiKeyMetadata {
  name: string;
  enabled: boolean;
  createdAt: string;
  lastUsed: string;
}

export async function validateApiKey(key: string): Promise<boolean> {
  const metadata = await redis.get(`apikey:${key}`);
  if (!metadata) return false;

  const parsed: ApiKeyMetadata = JSON.parse(metadata);
  return parsed.enabled;
}

// Revocation endpoint (admin only)
app.post('/admin/revoke-key', adminAuth, async (c) => {
  const { keyId } = await c.req.json();
  const metadata = await redis.get(`apikey:${keyId}`);

  if (metadata) {
    const parsed = JSON.parse(metadata);
    parsed.enabled = false;
    await redis.set(`apikey:${keyId}`, JSON.stringify(parsed));
  }

  return c.json({ success: true });
});
```

---

## 13. Error Sanitization

**Requirement**: Hide internal errors in production

**What the code does** (`src/middleware/errorHandler.ts`, `src/utils/errors.ts`):

- All errors go through `app.onError(errorHandler)` in `src/index.ts`; routes do not catch and format errors themselves
- Conduit errors (`ConduitError` subclasses) keep their message and code. `details` is removed when `NODE_ENV=production`; `retryAfter` is kept for 429 and 503 responses
- Unknown errors are logged with `console.error` and return 500 `INTERNAL_ERROR` with `Internal server error` in production (the raw message otherwise)
- Stack traces are never included in responses

**Original design** (simplified, not the current code):

```typescript
// src/utils/errors.ts
export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  stack?: string;
}

export function sanitizeError(error: Error, env: string): ErrorResponse {
  if (env === 'production') {
    // Generic message in production (hide implementation details)
    return {
      success: false,
      error: 'An error occurred processing your request',
      code: 'INTERNAL_ERROR'
    };
  } else {
    // Detailed errors in development
    return {
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR',
      stack: error.stack
    };
  }
}
```

**Usage**:

```typescript
// src/routes/send.ts
try {
  // ... business logic
} catch (error) {
  console.error('Send error:', error);
  return c.json(
    sanitizeError(error as Error, c.env.NODE_ENV),
    500
  );
}
```

---

## Compliance & Privacy

### GDPR Requirements

**Data Collected**:
- Email addresses, names, phone numbers (PII)
- Source origins (for CORS validation)
- API usage metrics

**Legal Basis**:
- Legitimate interest (transactional communications)

**Requirements**:
- Auto-delete logs after 90 days (operator responsibility: Conduit logs to stdout/stderr and does not manage log files)
- ✅ PII masking in logs (implemented in `src/middleware/logger.ts`)
- Right to erasure mechanism (not implemented; Conduit stores no messages)
- Data processing agreement with providers (operator responsibility)

**Log Retention Policy** (only if you redirect Conduit's output to files):

```bash
# /etc/logrotate.d/conduit
/app/logs/*.log {
  daily                    # Rotate daily
  rotate 90                # Keep 90 days for GDPR compliance
  compress                 # Compress old logs
  delaycompress            # Don't compress yesterday's log
  notifempty               # Don't rotate if empty
  create 0640 nodejs nodejs # File permissions
  sharedscripts
  postrotate
    # Signal app to reopen log files (if needed)
  endrotate
}
```

**PII Masking** (`src/middleware/logger.ts`, simplified):

```typescript
// KEY_TEST_abcd1234... -> KEY_TEST_****; anything else -> ****
function maskApiKey(key: string): string {
  const parts = key.split('_');
  if (parts.length >= 3 && parts[0] === 'KEY' && parts[1]) {
    return `KEY_${parts[1]}_****`;
  }
  return '****';
}

// user@example.com -> u***@***.com
function maskEmail(email: string): string { /* ... */ }

export async function logger(c: Context, next: Next) {
  const requestId = randomUUID();

  // Request line: X-API-Key/Authorization masked with maskApiKey; cookies,
  // client IP headers and headers containing "token"/"secret" logged as ****
  console.info(JSON.stringify({
    type: 'request', requestId, timestamp, method, path,
    headers: maskHeaders(c.req.raw.headers),
  }));

  await next();

  // Response line: the authenticated key (set by auth, which runs later) is masked
  console.info(JSON.stringify({
    type: 'response', requestId, timestamp, method, path,
    status: c.res.status, duration,
    apiKey: apiKey ? maskApiKey(apiKey) : undefined,
  }));
}
```

Request bodies are not logged. For a key such as `KEY_MY_SITE_...` only the first name segment is kept (`KEY_MY_****`).

---

## Security Testing

### Unit Tests

The real tests live in `tests/security/` (auth, body limit, CORS, injection, rate limit, recipient validation, security headers), `tests/unit/` and `tests/integration/`. The snippet below is illustrative.

```typescript
// tests/security.test.ts (illustrative)
import { describe, it, expect } from 'vitest';

describe('Security', () => {
  it('enforces HTTPS in production', async () => {
    process.env.NODE_ENV = 'production';
    const res = await app.request('/api/send', {
      headers: { 'x-forwarded-proto': 'http' }
    });
    expect(res.status).toBe(403);
  });

  it('rejects payloads over 50KB', async () => {
    const largePayload = JSON.stringify({ data: 'x'.repeat(51 * 1024) });
    const res = await app.request('/api/send', {
      method: 'POST',
      body: largePayload
    });
    expect(res.status).toBe(413);
  });

  it('uses constant-time API key comparison', async () => {
    const times: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      await validateKey('WRONG_KEY_xxxxxxxxxxxxxxxxx');
      times.push(performance.now() - start);
    }

    const avgTime = times.reduce((a, b) => a + b) / times.length;
    const variance = times.map(t => Math.abs(t - avgTime))
      .reduce((a, b) => a + b) / times.length;

    expect(variance).toBeLessThan(0.1);
  });

  it('sanitizes XSS in email templates', () => {
    const html = renderTemplate({
      name: '<script>alert("XSS")</script>',
      message: '<img src=x onerror=alert(1)>'
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onerror');
  });

  it('includes all required security headers', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
  });

  it('masks sensitive data in logs', () => {
    const masked = maskEmail('user@example.com');
    expect(masked).toBe('u***@***.com');

    const maskedKey = maskApiKey('KEY_APP_588a0a9ee07f219a9e615f7a18eb155f');
    expect(maskedKey).toBe('KEY_APP_****');
  });
});
```

### Dependency Scanning

Implemented in `.github/workflows/security.yml` (on pushes and PRs to `main`, daily at 2 AM UTC, and on manual dispatch):

- `npm audit --audit-level=moderate`
- OSV Scanner on `package-lock.json` with `fail-on-vuln: true`
- Dependency Review on pull requests (`fail-on-severity: moderate`)

There are no `audit` scripts in `package.json`; run `npm audit` directly. See [automated-security.md](automated-security.md).

### Container Scanning

**Status**: Not implemented in CI. The commands and workflow below are a proposal.

```bash
# Run before deployment
docker scan conduit:latest

# Or with Trivy (more comprehensive)
trivy image conduit:latest
```

```yaml
# .github/workflows/container-scan.yml
name: Container Scan

on: [push]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build image
        run: docker build -t conduit:latest .
      - name: Run Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'conduit:latest'
          format: 'sarif'
          output: 'trivy-results.sarif'
      - name: Upload results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'
```

---

## Incident Response

### In Case of Security Breach

**1. Immediate Actions** (within minutes):
- Revoke compromised API keys via `REVOKED_KEYS` environment variable
- Restart Conduit service to apply changes
- Review recent logs for unauthorized access patterns

**2. Investigation** (within hours):
- Check structured logs for anomalies. Conduit logs to stdout/stderr; error codes are not logged, but every response line has the status and the app name (`"app"`, from `API_KEY_<NAME>`):
  ```bash
  docker logs conduit 2>&1 | grep '"type":"response"' | grep '"status":401'
  docker logs conduit 2>&1 | grep '"type":"response"' | grep '"status":429'
  ```
- Identify scope: which API keys, how many requests, what data accessed
- Document timeline of events

**3. Notification** (within 24-72 hours):
- Notify affected frontend application owners
- If PII exposed: comply with GDPR breach notification (72 hours max)
- Prepare incident report

**4. Recovery**:
- Generate new API keys using secure method (`crypto.randomBytes`)
- Distribute to application owners via secure channel (not email)
- Update `ALLOWED_ORIGINS` if needed
- Deploy fixes for vulnerability

**5. Post-Mortem**:
- Document root cause analysis
- Update security measures
- Schedule third-party security audit
- Review and update incident response procedures

---

## References

- **[OWASP API Security Top 10](https://owasp.org/www-project-api-security/)**
- **[Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)**
- **[CWE Top 25](https://cwe.mitre.org/top25/)**
- **[GDPR Guidelines](https://gdpr.eu/)**
- **[Hono Security Docs](https://hono.dev/docs/guides/security)**

---

**Next**: See [archive/review-pre-v1.0.0.md](archive/review-pre-v1.0.0.md) for the original (pre-v1.0.0) security analysis and threat modeling.
