# Conduit Security Review

**Document Version**: 1.0
**Review Date**: 2025-10-05
**Project Phase**: Pre-Implementation (Specification Review)
**Reviewer**: Security Architecture Analysis

## Executive Summary

Conduit's architecture demonstrates solid foundational security principles, particularly in API key isolation and CORS protection. However, several critical gaps must be addressed before production deployment to prevent common web application vulnerabilities and ensure defense-in-depth.

**Risk Assessment**: MEDIUM-HIGH (pre-implementation phase allows for early fixes)

### Quick Stats
- ✅ **7 Security Strengths** identified
- 🔴 **7 Critical Gaps** requiring immediate attention
- ⚠️ **10 Important Concerns** recommended for hardening
- 📋 **24 Total Recommendations**

---

## Threat Model

### Attack Surface

1. **Public API Endpoint** (`POST /api/send`)
   - Accepts JSON payloads from untrusted clients
   - Processes user-supplied data for email/SMS/push/webhooks
   - Direct internet exposure

2. **Health Endpoint** (`GET /health`)
   - Publicly accessible (no authentication)
   - Exposes system information

3. **API Keys**
   - Embedded in client-side code (public knowledge by design)
   - Transmitted via HTTP headers
   - Multiple keys for different frontends

4. **Provider Integrations**
   - Resend (email), Twilio (SMS), Firebase (push)
   - Server-side credentials
   - Outbound API calls

### Threat Actors

1. **Opportunistic Attackers**: Scanning for common vulnerabilities
2. **Spammers/Abusers**: Using compromised API keys for bulk messaging
3. **Malicious Users**: Exploiting rate limits, input validation, or DoS vectors
4. **Insider Threats**: Frontend developers with access to API keys

### Attack Scenarios

| Attack | Likelihood | Impact | Current Mitigation | Status |
|--------|-----------|--------|-------------------|--------|
| API Key Exposure | HIGH | HIGH | Keys in env vars only | ⚠️ Partial |
| Rate Limit Bypass | MEDIUM | HIGH | Token bucket per key | ⚠️ Needs IP limiting |
| XSS via Email Template | HIGH | MEDIUM | None specified | 🔴 Missing |
| Large Payload DoS | HIGH | HIGH | None specified | 🔴 Missing |
| MITM Attack | MEDIUM | CRITICAL | None specified | 🔴 Missing HTTPS enforcement |
| Timing Attack on Auth | LOW | MEDIUM | None specified | 🔴 Missing constant-time comparison |
| Provider Credential Leak | LOW | CRITICAL | Env vars only | ⚠️ Needs secrets management |
| Information Disclosure | MEDIUM | LOW | Partial log masking | ⚠️ Needs improvement |
| Spam/Abuse | HIGH | MEDIUM | Rate limiting | ⚠️ Needs additional controls |
| Replay Attack | LOW | LOW | None | ⚠️ Optional hardening |

---

## Security Strengths ✅

### 1. Provider Credential Isolation
**What**: All provider API keys (Resend, Twilio, Firebase) stored server-side only
**Why It Matters**: Prevents client-side exposure of high-value credentials
**Implementation**: Environment variables, never exposed in responses
**Rating**: ⭐⭐⭐⭐⭐ Excellent

### 2. Strict CORS Whitelisting
**What**: Explicit origin whitelist, no wildcards
**Why It Matters**: Prevents unauthorized domains from using the API
**Implementation**: `ALLOWED_ORIGINS` env var with exact matching
**Rating**: ⭐⭐⭐⭐⭐ Excellent

### 3. Comprehensive Rate Limiting
**What**: Multi-tier rate limits per API key (minute/hour/day) across all channels
**Why It Matters**: Prevents abuse and excessive costs
**Implementation**: Token bucket algorithm with sliding window
**Rating**: ⭐⭐⭐⭐ Very Good (needs IP-based secondary limiting)

### 4. Sensitive Data Masking in Logs
**What**: API keys and email addresses partially masked in structured logs
**Why It Matters**: Reduces log exposure risk
**Example**: `"apiKey": "KEY_ELDTECH_***"`, `"to": "contact@***"`
**Rating**: ⭐⭐⭐⭐ Very Good

### 5. Non-Root Container User
**What**: Dockerfile creates unprivileged `nodejs` user
**Why It Matters**: Limits container escape impact
**Implementation**: `USER nodejs` directive
**Rating**: ⭐⭐⭐⭐ Very Good

### 6. Input Validation Framework
**What**: Zod schemas for template data validation
**Why It Matters**: Type-safe validation prevents malformed data
**Rating**: ⭐⭐⭐⭐ Very Good (needs XSS sanitization layer)

### 7. Layered Middleware Architecture
**What**: Ordered middleware: CORS → Auth → Rate Limit → Logging
**Why It Matters**: Defense-in-depth with clear security checkpoints
**Rating**: ⭐⭐⭐⭐⭐ Excellent

---

## Critical Security Gaps 🔴

### 1. Missing HTTPS/TLS Enforcement

**Severity**: CRITICAL
**CWE**: CWE-319 (Cleartext Transmission of Sensitive Information)

**Problem**:
- No explicit requirement for HTTPS in specification
- API keys transmitted in headers could be intercepted over HTTP
- No HTTP Strict Transport Security (HSTS) headers mentioned

**Impact**:
- API keys exposed to network eavesdroppers
- Man-in-the-middle attacks possible
- Credentials compromised on public WiFi

**Remediation**:
```typescript
// Add to middleware/security.ts
app.use('*', async (c, next) => {
  // Enforce HTTPS in production
  if (c.env.NODE_ENV === 'production' && c.req.header('x-forwarded-proto') !== 'https') {
    return c.text('HTTPS Required', 403);
  }

  // Add HSTS header (1 year, include subdomains)
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  await next();
});
```

**Configuration**:
```bash
# Add to .env
ENFORCE_HTTPS=true  # Set to false only for local development
```

---

### 2. No Request Size Limits

**Severity**: CRITICAL
**CWE**: CWE-400 (Uncontrolled Resource Consumption)

**Problem**:
- No maximum payload size specified
- Large JSON bodies could exhaust memory
- Template data fields unbounded

**Impact**:
- Denial of Service via memory exhaustion
- Server crashes under large payload attacks
- Increased latency for legitimate users

**Remediation**:
```typescript
// Add to middleware/bodyLimit.ts
import { bodyLimit } from 'hono/body-limit';

app.use('/api/send', bodyLimit({
  maxSize: 50 * 1024, // 50 KB - enough for contact forms, prevents abuse
  onError: (c) => {
    return c.json({
      success: false,
      error: 'Request payload too large (max 50KB)',
      code: 'PAYLOAD_TOO_LARGE'
    }, 413);
  }
}));
```

**Template-Level Limits**:
```typescript
// In each template validator
const contactFormSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  message: z.string().min(1).max(5000), // 5KB text limit
  phone: z.string().max(20).optional()
});
```

---

### 3. Insecure API Key Generation

**Severity**: CRITICAL
**CWE**: CWE-330 (Use of Insufficiently Random Values)

**Problem**:
- Spec says "random 32-character alphanumeric" without specifying cryptographic randomness
- Example in user guide uses `Math.random()` which is NOT cryptographically secure
- Predictable keys could be brute-forced

**Current (INSECURE) Example**:
```bash
# From user guide - DO NOT USE
node -e "console.log('KEY_MYSITE_' + Math.random().toString(36).substring(2, 15))"
```

**Remediation**:
```bash
# Use crypto.randomBytes for cryptographically secure generation
node -e "console.log('KEY_MYSITE_' + require('crypto').randomBytes(16).toString('hex'))"
```

Or create a dedicated script:
```typescript
// scripts/generate-api-key.ts
import crypto from 'crypto';

function generateApiKey(appName: string): string {
  const randomSuffix = crypto.randomBytes(16).toString('hex'); // 32 hex chars
  return `KEY_${appName.toUpperCase()}_${randomSuffix}`;
}

console.log(generateApiKey(process.argv[2] || 'APP'));
```

**Run with**: `npm run generate-key -- mysite`

---

### 4. Missing Constant-Time Comparison

**Severity**: HIGH
**CWE**: CWE-208 (Observable Timing Discrepancy)

**Problem**:
- Standard string comparison (`===`) leaks timing information
- Attacker can use timing analysis to guess API keys character-by-character

**Vulnerable Code**:
```typescript
// DO NOT DO THIS
if (providedKey === validKey) {
  // Timing leaks position of first mismatched character
}
```

**Remediation**:
```typescript
// middleware/auth.ts
import { timingSafeEqual } from 'crypto';

function constantTimeCompare(a: string, b: string): boolean {
  // Ensure same length to prevent length leakage
  if (a.length !== b.length) {
    // Compare against dummy value to maintain constant time
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// Usage in auth middleware
const apiKey = c.req.header('X-API-Key');
const validKeys = Object.values(c.env).filter(v => v.startsWith('KEY_'));

const isValid = validKeys.some(validKey =>
  constantTimeCompare(apiKey || '', validKey)
);
```

---

### 5. XSS in Email Templates

**Severity**: HIGH
**CWE**: CWE-79 (Cross-Site Scripting)

**Problem**:
- No HTML sanitization mentioned for user input in email templates
- Contact form data rendered directly into HTML emails
- Malicious JavaScript could execute in email clients

**Attack Example**:
```json
{
  "channel": "email",
  "templateId": "contact-form",
  "data": {
    "name": "<img src=x onerror=alert('XSS')>",
    "message": "<script>steal_credentials()</script>"
  }
}
```

**Remediation**:
```typescript
// utils/sanitize.ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [], // Strip all HTML tags for plain text fields
    ALLOWED_ATTR: []
  });
}

// For rich text (if needed later)
export function sanitizeRichText(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
    ALLOWED_ATTR: []
  });
}

// In template rendering
export const contactFormTemplate = {
  html: (data: ContactFormData) => `
    <h2>New Contact Form Submission</h2>
    <p><strong>Name:</strong> ${sanitizeHtml(data.name)}</p>
    <p><strong>Email:</strong> ${sanitizeHtml(data.email)}</p>
    <p><strong>Message:</strong> ${sanitizeHtml(data.message)}</p>
  `
};
```

---

### 6. Information Disclosure in Health Endpoint

**Severity**: MEDIUM
**CWE**: CWE-200 (Exposure of Sensitive Information)

**Problem**:
- `/health` endpoint exposes provider names publicly
- Version number visible to attackers
- Memory usage information available without auth

**Current Response**:
```json
{
  "channels": {
    "email": { "status": "active", "provider": "Resend" },  // ← Exposes provider
    "sms": { "status": "active", "provider": "Twilio" }
  },
  "checks": {
    "memory": { "used": 45.2, "total": 512 }  // ← Exposes infrastructure details
  }
}
```

**Remediation**:
```typescript
// Two-tier health endpoint
app.get('/health', (c) => {
  // Public endpoint - minimal info
  return c.json({ status: 'healthy' });
});

app.get('/health/detailed', authMiddleware, (c) => {
  // Authenticated endpoint - full diagnostics
  return c.json({
    status: 'healthy',
    version: '1.0.0',
    channels: { /* full details */ },
    checks: { /* memory, uptime, etc */ }
  });
});
```

---

### 7. No API Key Revocation Mechanism

**Severity**: MEDIUM
**CWE**: CWE-613 (Insufficient Session Expiration)

**Problem**:
- Once an API key is created, it cannot be invalidated without server restart
- Compromised keys remain valid indefinitely
- No emergency "kill switch" for abusive clients

**Remediation**:

Option A - Redis/Database-backed key store (best):
```typescript
// Store keys in Redis with metadata
interface ApiKeyMetadata {
  name: string;
  createdAt: string;
  lastUsed: string;
  enabled: boolean;
}

async function validateApiKey(key: string): Promise<boolean> {
  const metadata = await redis.get(`apikey:${key}`);
  if (!metadata) return false;

  const parsed: ApiKeyMetadata = JSON.parse(metadata);
  return parsed.enabled;
}

// Revocation API (authenticated)
app.post('/admin/revoke-key', adminAuth, async (c) => {
  const { keyId } = await c.req.json();
  await redis.set(`apikey:${keyId}`, JSON.stringify({ enabled: false }));
  return c.json({ success: true });
});
```

Option B - Revocation list in env (simpler):
```bash
# .env
REVOKED_KEYS=KEY_OLDSITE_abc123,KEY_COMPROMISED_xyz789
```

---

## Important Security Concerns ⚠️

### 8. Missing Security Headers

**Severity**: MEDIUM
**CWE**: Multiple

**Missing Headers**:
```typescript
// Add to middleware/securityHeaders.ts
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // CSP for API responses (JSON only)
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

  await next();
});
```

---

### 9. No IP-Based Rate Limiting

**Severity**: MEDIUM

**Problem**:
- If API key is compromised, attacker can still abuse it within rate limits
- No protection against distributed attacks using same key

**Remediation**:
```typescript
// Dual rate limiting: per-key AND per-IP
const rateLimitConfig = {
  perKey: { minute: 10, hour: 100, day: 500 },
  perIP: { minute: 20, hour: 200 }  // More lenient, catches distributed abuse
};

// Check both limits
if (exceedsKeyLimit || exceedsIPLimit) {
  return c.json({ error: 'Rate limit exceeded' }, 429);
}
```

---

### 10. No Request Signing (HMAC)

**Severity**: LOW-MEDIUM

**Current**: Simple API key in header
**Better**: HMAC-signed requests with timestamp

**Benefit**:
- Prevents replay attacks
- Proves request integrity
- Timestamp validation prevents old request replay

**Implementation** (optional, for Phase 2+):
```typescript
// Client generates signature
const timestamp = Date.now();
const payload = JSON.stringify(body);
const signature = crypto
  .createHmac('sha256', API_KEY)
  .update(`${timestamp}:${payload}`)
  .digest('hex');

// Headers
{
  'X-Signature': signature,
  'X-Timestamp': timestamp,
  'X-API-Key': 'KEY_...'  // Still sent for identification
}

// Server validates
const expectedSig = crypto
  .createHmac('sha256', validKey)
  .update(`${timestamp}:${body}`)
  .digest('hex');

if (!constantTimeCompare(providedSig, expectedSig)) {
  return c.json({ error: 'Invalid signature' }, 401);
}

// Check timestamp (prevent replay)
if (Math.abs(Date.now() - timestamp) > 300000) { // 5 minutes
  return c.json({ error: 'Request expired' }, 401);
}
```

---

### 11. Missing Timeout Configuration

**Severity**: MEDIUM

**Problem**:
- No timeouts for provider API calls
- Slow/hanging requests could exhaust resources

**Remediation**:
```typescript
// config.ts
export const TIMEOUTS = {
  provider: 10000,    // 10s for Resend/Twilio/Firebase
  request: 15000,     // 15s total request timeout
  keepAlive: 5000     // 5s keep-alive timeout
};

// In channel handlers
const response = await fetch(providerUrl, {
  signal: AbortSignal.timeout(TIMEOUTS.provider)
});
```

---

### 12. No Circuit Breaker for Providers

**Severity**: MEDIUM

**Problem**:
- If Resend/Twilio goes down, Conduit keeps hammering their API
- Cascading failures waste resources

**Remediation**:
```typescript
// utils/circuitBreaker.ts
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      // Check if cooldown period passed
      if (Date.now() - this.lastFailure > 60000) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker OPEN');
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
    if (this.failures >= 5) {
      this.state = 'OPEN';
    }
  }
}

// Usage
const resendCircuit = new CircuitBreaker();

export async function sendEmail(data: EmailData) {
  return resendCircuit.call(() => resend.emails.send(data));
}
```

---

### 13. Log Storage and Retention

**Severity**: LOW-MEDIUM

**Missing**:
- Log rotation policy
- Retention limits (GDPR compliance)
- Secure log storage/encryption

**Recommendations**:
```yaml
# docker-compose.yml or Coolify config
volumes:
  - ./logs:/app/logs:rw

# Log rotation with logrotate
/app/logs/*.log {
  daily
  rotate 30  # Keep 30 days
  compress
  delaycompress
  notifempty
  create 0640 nodejs nodejs
  sharedscripts
  postrotate
    # Signal app to reopen log files
  endrotate
}
```

**GDPR Compliance**:
- Mask PII in logs (already done ✅)
- Auto-delete logs after 90 days
- Don't log full email addresses (only domain)

---

### 14. Error Message Information Leakage

**Severity**: LOW

**Problem**:
- Error messages might expose internal structure
- Stack traces could reveal file paths

**Remediation**:
```typescript
// utils/errors.ts
export function sanitizeError(error: Error): ErrorResponse {
  if (process.env.NODE_ENV === 'production') {
    // Generic message in production
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
      stack: error.stack  // Only in dev
    };
  }
}
```

---

### 15. Dependency Security

**Severity**: MEDIUM

**Recommendations**:
```bash
# Add to package.json scripts
{
  "scripts": {
    "audit": "npm audit",
    "audit:fix": "npm audit fix",
    "deps:check": "npx npm-check-updates",
    "deps:update": "npx npm-check-updates -u"
  }
}

# Run in CI/CD
npm audit --audit-level=moderate
```

**Tools**:
- Dependabot (GitHub)
- Snyk
- npm audit

---

### 16-24. Additional Concerns

- **16. No WAF**: Consider Cloudflare for DDoS protection
- **17. No Monitoring/Alerting**: Add Sentry or similar
- **18. No Backup Strategy**: For rate limit state if using Redis
- **19. Container Image Scanning**: Add Trivy or Clair
- **20. Secrets Management**: Consider HashiCorp Vault for production
- **21. PII Handling**: Document data retention policy
- **22. GDPR Compliance**: Add data processing agreement
- **23. Penetration Testing**: Schedule before v1.0 launch
- **24. Security Audit**: Third-party review recommended

---

## Implementation Checklist

### Phase 1 (MVP) - Critical Items

- [ ] **HTTPS Enforcement**: Reject HTTP requests in production
- [ ] **HSTS Header**: Add Strict-Transport-Security header
- [ ] **Request Size Limit**: 50KB max payload
- [ ] **Secure Key Generation**: Use crypto.randomBytes
- [ ] **Constant-Time Comparison**: Use timingSafeEqual
- [ ] **XSS Sanitization**: Install and use DOMPurify
- [ ] **Security Headers**: Add X-Content-Type-Options, X-Frame-Options, etc.
- [ ] **Template Field Limits**: Max lengths for all string fields
- [ ] **Health Endpoint**: Split into public/authenticated versions
- [ ] **Timeout Configuration**: 10s provider timeout, 15s request timeout

### Phase 2 - Important Hardening

- [ ] **IP-Based Rate Limiting**: Secondary rate limit by IP
- [ ] **Circuit Breaker**: Add for all provider integrations
- [ ] **Error Sanitization**: Hide internal errors in production
- [ ] **API Key Revocation**: Redis-backed key store or revocation list
- [ ] **Request Signing**: HMAC signatures with timestamp validation
- [ ] **Dependency Scanning**: Integrate npm audit into CI/CD
- [ ] **Log Rotation**: 30-day retention with compression
- [ ] **Container Scanning**: Add Trivy to build pipeline

### Phase 3 - Advanced Security

- [ ] **WAF Integration**: Cloudflare or AWS WAF
- [ ] **Secrets Management**: Vault or AWS Secrets Manager
- [ ] **Monitoring**: Sentry for errors, Prometheus for metrics
- [ ] **GDPR Compliance**: Data retention policy, DPA
- [ ] **Penetration Testing**: Before production launch
- [ ] **Security Audit**: Third-party code review
- [ ] **Incident Response Plan**: Document breach procedures
- [ ] **Backup Strategy**: For state stores (Redis)

---

## Security Testing Recommendations

### Unit Tests
```typescript
describe('Security', () => {
  it('rejects requests over 50KB', async () => {
    const largePayload = 'x'.repeat(51 * 1024);
    const res = await app.request('/api/send', {
      method: 'POST',
      body: largePayload
    });
    expect(res.status).toBe(413);
  });

  it('uses constant-time comparison for API keys', async () => {
    // Timing attack test (statistical)
    const times = [];
    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      await validateKey('wrong_key');
      times.push(performance.now() - start);
    }

    const avgTime = times.reduce((a, b) => a + b) / times.length;
    const variance = times.map(t => Math.abs(t - avgTime)).reduce((a, b) => a + b) / times.length;

    expect(variance).toBeLessThan(0.1); // Low variance = constant time
  });

  it('sanitizes XSS in email templates', async () => {
    const html = renderTemplate({
      name: '<script>alert("XSS")</script>'
    });
    expect(html).not.toContain('<script>');
  });
});
```

### Integration Tests
```typescript
describe('Rate Limiting', () => {
  it('blocks after 10 requests per minute', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await sendRequest();
      expect(res.status).toBe(200);
    }

    const res = await sendRequest();
    expect(res.status).toBe(429);
  });

  it('enforces IP-based rate limiting', async () => {
    // Test with different API keys from same IP
  });
});
```

### Security Scanning
```bash
# SAST (Static Analysis)
npm install -g @microsoft/eslint-plugin-sdl
npx eslint . --ext .ts

# Dependency vulnerabilities
npm audit

# Container scanning
docker scan conduit:latest
trivy image conduit:latest

# DAST (Dynamic Analysis) - after deployment
npm install -g owasp-zap
zap-cli quick-scan https://conduit.yourdomain.com
```

---

## Compliance Considerations

### GDPR (EU)
- **Data Collected**: Emails, names, phone numbers (PII)
- **Legal Basis**: Legitimate interest (transactional communications)
- **Retention**: Delete logs after 90 days
- **Right to Erasure**: Provide API to delete user messages
- **Data Processing Agreement**: Required with Resend/Twilio

### CCPA (California)
- **Disclosure**: Privacy policy must list data shared with providers
- **Opt-Out**: Provide mechanism to stop processing

### SOC 2 (Future)
- **Access Controls**: Implement admin authentication
- **Audit Logging**: Track all administrative actions
- **Encryption**: Encrypt logs at rest
- **Incident Response**: Document procedures

---

## References

- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **OWASP API Security Top 10**: https://owasp.org/www-project-api-security/
- **CWE Top 25**: https://cwe.mitre.org/top25/
- **Node.js Security Best Practices**: https://nodejs.org/en/docs/guides/security/
- **Hono Security**: https://hono.dev/docs/guides/security

---

**Next Steps**:
1. Review this document with development team
2. Prioritize critical items for Phase 1 implementation
3. Create GitHub issues for each security item
4. Implement security tests alongside features
5. Schedule security audit before v1.0 launch
