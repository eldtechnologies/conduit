# Security Implementation Guide

This document provides step-by-step implementation guidance for hardening Conduit's security. All code examples are production-ready and should be implemented as-is.

## Critical Security Requirements

The following security measures are **MANDATORY** for production deployment.

---

## 1. HTTPS/TLS Enforcement

**Requirement**: All production traffic must use HTTPS (TLS 1.2+)

**Why**: Prevents man-in-the-middle attacks and protects API keys in transit.

**Implementation**:

```typescript
// src/middleware/securityHeaders.ts
import { Context, Next } from 'hono';

export async function enforceHttps(c: Context, next: Next) {
  // Check if request came over HTTP in production
  if (c.env.NODE_ENV === 'production' && c.req.header('x-forwarded-proto') !== 'https') {
    return c.text('HTTPS Required', 403);
  }

  // Add HTTP Strict Transport Security (HSTS) header
  // Tells browsers to only use HTTPS for 1 year
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  await next();
}
```

**Environment Configuration**:
```bash
# .env
ENFORCE_HTTPS=true  # Set to false only for local development
```

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
// src/middleware/bodyLimit.ts
import { bodyLimit } from 'hono/body-limit';
import { Hono } from 'hono';

const app = new Hono();

// Apply to /api/send endpoint
app.use('/api/send', bodyLimit({
  maxSize: 50 * 1024, // 50 KB
  onError: (c) => {
    return c.json({
      success: false,
      error: 'Request payload too large (max 50KB)',
      code: 'PAYLOAD_TOO_LARGE'
    }, 413);
  }
}));
```

**Template Field Limits**:

```typescript
// src/templates/email/contact-form.ts
import { z } from 'zod';

const contactFormSchema = z.object({
  name: z.string().min(1).max(100),          // Max 100 characters
  email: z.string().email().max(255),        // Max 255 characters
  message: z.string().min(1).max(5000),      // Max 5000 characters (~5KB)
  phone: z.string().max(20).optional()       // Max 20 characters
});
```

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

---

## 4. Constant-Time API Key Comparison

**Requirement**: Use `timingSafeEqual` to prevent timing attacks

**Why**: Standard string comparison (`===`) leaks timing information that attackers can use to guess keys.

**Implementation**:

```typescript
// src/middleware/auth.ts
import { timingSafeEqual } from 'crypto';
import { Context, Next } from 'hono';

function constantTimeCompare(a: string, b: string): boolean {
  // Ensure same length to prevent length leakage
  if (a.length !== b.length) {
    // Compare against dummy value to maintain constant time
    // (prevents early return timing difference)
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export async function auth(c: Context, next: Next) {
  const providedKey = c.req.header('X-API-Key');

  if (!providedKey) {
    return c.json({
      success: false,
      error: 'Missing X-API-Key header',
      code: 'UNAUTHORIZED'
    }, 401);
  }

  // Load valid keys from environment
  const validKeys = Object.entries(process.env)
    .filter(([key]) => key.startsWith('API_KEY_'))
    .map(([, value]) => value as string);

  // Constant-time comparison against all valid keys
  const isValid = validKeys.some(validKey =>
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
```

**Testing**:
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

**Template Usage**:

```typescript
// src/templates/email/contact-form.ts
import { sanitizeHtml } from '../../utils/sanitize';

export const contactFormTemplate = {
  id: 'contact-form',
  channel: 'email',

  html: (data: ContactFormData) => {
    // ALWAYS sanitize user input before rendering
    const safeName = sanitizeHtml(data.name);
    const safeEmail = sanitizeHtml(data.email);
    const safeMessage = sanitizeHtml(data.message);
    const safePhone = data.phone ? sanitizeHtml(data.phone) : null;

    return `
      <!DOCTYPE html>
      <html>
        <body>
          <h2>New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${safeName}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          ${safePhone ? `<p><strong>Phone:</strong> ${safePhone}</p>` : ''}
          <hr>
          <p><strong>Message:</strong></p>
          <p>${safeMessage.replace(/\n/g, '<br>')}</p>
        </body>
      </html>
    `;
  }
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

  // HSTS (only in production with HTTPS)
  if (c.env.NODE_ENV === 'production') {
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
// src/channels/email.ts
import { TIMEOUTS } from '../config';

export async function sendEmail(data: EmailRequest) {
  try {
    const response = await resend.emails.send({
      from: data.from,
      to: data.to,
      subject: data.subject,
      html: data.html
    }, {
      // Abort after 10 seconds
      signal: AbortSignal.timeout(TIMEOUTS.provider)
    });

    return response;
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error('Provider request timed out');
    }
    throw error;
  }
}
```

**Note**: For Resend SDK v2+, check if timeout support is built-in. Otherwise, wrap in Promise.race:

```typescript
const response = await Promise.race([
  resend.emails.send(data),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), TIMEOUTS.provider)
  )
]);
```

---

## 8. Health Endpoint Information Disclosure

**Requirement**: Split into public and authenticated endpoints

**Why**: Exposing provider details, version, and system info aids attackers.

**Implementation**:

```typescript
// src/routes/health.ts
import { Hono } from 'hono';
import { auth } from '../middleware/auth';

const health = new Hono();

// Public health check (minimal info, no auth required)
health.get('/', (c) => {
  return c.json({ status: 'healthy' });
});

// Detailed health check (requires authentication)
health.get('/detailed', auth, (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    channels: {
      email: {
        status: 'active',
        provider: 'Resend',
        configured: !!process.env.RESEND_API_KEY
      },
      sms: {
        status: 'coming_soon'
      }
    },
    checks: {
      memory: {
        used: process.memoryUsage().heapUsed / 1024 / 1024,
        total: process.memoryUsage().heapTotal / 1024 / 1024
      },
      uptime: process.uptime()
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

Recipient whitelisting is configured via environment variables and enforced by middleware. No code changes needed in application logic.

**Environment Configuration**:

```bash
# .env

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

1. Middleware extracts recipient email from request (`to` field)
2. Looks up API key's whitelist configuration from environment variables
3. Checks if recipient email matches:
   - Exact match in `API_KEY_*_RECIPIENTS` list, OR
   - Domain matches one in `API_KEY_*_RECIPIENT_DOMAINS` list
4. Blocks request with 403 if no match

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
  "code": "RECIPIENT_NOT_ALLOWED",
  "error": "Recipient 'attacker@evil.com' is not whitelisted for this API key"
}
```

**Testing**:

```typescript
// tests/security/recipientWhitelist.test.ts
import { describe, it, expect } from 'vitest';

describe('Recipient Whitelisting', () => {
  it('allows whitelisted email addresses', async () => {
    const res = await app.request('/api/send', {
      method: 'POST',
      headers: {
        'X-API-Key': 'KEY_WEBSITE_abc123',
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
        'X-API-Key': 'KEY_WEBSITE_abc123',
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
        'X-API-Key': 'KEY_WEBSITE_abc123',
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

**Purpose**: Invalidate compromised keys without redeployment

**Option A: Environment-based revocation list (simple)**

```bash
# .env
REVOKED_KEYS=KEY_OLD_abc123,KEY_COMPROMISED_xyz789
```

```typescript
// src/middleware/auth.ts
const revokedKeys = (process.env.REVOKED_KEYS || '').split(',').filter(Boolean);

export async function auth(c: Context, next: Next) {
  const providedKey = c.req.header('X-API-Key');

  // Check revocation list first
  if (revokedKeys.includes(providedKey || '')) {
    return c.json({
      success: false,
      error: 'API key has been revoked',
      code: 'UNAUTHORIZED'
    }, 401);
  }

  // Continue with normal validation...
}
```

**Option B: Redis-based key store (advanced, Phase 2+)**

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

**Implementation**:

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
- ✅ Auto-delete logs after 90 days
- ✅ PII masking in logs
- ✅ Right to erasure mechanism
- ✅ Data processing agreement with providers

**Log Retention Policy**:

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

**PII Masking**:

```typescript
// src/middleware/logger.ts
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `***@${domain}`;
}

function maskApiKey(key: string): string {
  return key.substring(0, key.lastIndexOf('_') + 4) + '***';
}

export async function logger(c: Context, next: Next) {
  const log = {
    timestamp: new Date().toISOString(),
    method: c.req.method,
    path: c.req.path,
    apiKey: maskApiKey(c.get('apiKey') || ''),
    origin: c.req.header('origin'),
    // Mask PII in request body
    // ...
  };

  console.log(JSON.stringify(log));
  await next();
}
```

---

## Security Testing

### Unit Tests

```typescript
// tests/security.test.ts
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
    expect(masked).toBe('***@example.com');

    const maskedKey = maskApiKey('KEY_APP_abc123xyz');
    expect(maskedKey).toBe('KEY_APP_***');
  });
});
```

### Dependency Scanning

```json
// package.json
{
  "scripts": {
    "audit": "npm audit",
    "audit:fix": "npm audit fix --audit-level=moderate",
    "audit:ci": "npm audit --audit-level=moderate"
  }
}
```

```yaml
# .github/workflows/security.yml
name: Security Audit

on: [push, pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run audit:ci
```

### Container Scanning

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
- Check structured logs for anomalies:
  ```bash
  grep "UNAUTHORIZED" /app/logs/*.log
  grep -A 5 "RATE_LIMIT_EXCEEDED" /app/logs/*.log
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

**Next**: See [review.md](review.md) for detailed security analysis and threat modeling.
