# Conduit Security

Security is a **top priority** for Conduit. This document provides an overview of security measures, requirements, and best practices.

## Security Philosophy

Conduit's core security principles:

1. **Defense in Depth**: Multiple layers of security (TLS, CORS, auth, rate limiting, validation, sanitization)
2. **Least Privilege**: Minimal permissions, non-root containers, isolated credentials
3. **Secure by Default**: HTTPS enforcement, strict CORS, automatic security headers
4. **Fail Securely**: Errors don't leak information, constant-time operations prevent timing attacks
5. **Zero Trust**: All input is untrusted and must be validated and sanitized

## Quick Security Status

### Current Status: **PRODUCTION READY v1.3.1** ✅

🎉 **All critical security measures implemented and tested!**

**Security Audit**: [View v1.0.1 audit report](archive/security-audit-v1.0.1.md) (archived)
- **Verdict**: APPROVED FOR PRODUCTION DEPLOYMENT
- **Confidence Level**: HIGH (9/10)
- **Vulnerabilities**: Zero critical or high-severity issues
- **Test Coverage**: CI enforces 80% coverage thresholds (`npm run test:coverage`)

### Security Maturity Status

**Phase 1 (MVP)**: ✅ **COMPLETE**
- ✅ Specification complete
- ✅ All critical security measures implemented
- ✅ Comprehensive security testing (`tests/security/`)
- ✅ **v1.1.0**: Recipient whitelisting to prevent stolen key abuse
- ✅ **v1.2.0**: LLM-powered spam and abuse detection

**Phase 2 (Hardening)**: ⏳ **IN PROGRESS**
- ✅ LLM spam filtering (v1.2.0 - optional, configurable per API key, can fail closed)
- ✅ Strict startup validation of all `API_KEY_*` variables
- ✅ Sender allowlist per API key (`API_KEY_*_FROM_ADDRESSES`)
- ✅ API key revocation via `REVOKED_KEYS` (requires restart)
- ✅ Dependency scanning in CI/CD (`npm audit`, OSV Scanner, Dependency Review)
- ⏳ IP-based rate limiting (recommended for Phase 2, not implemented)
- ⏳ Circuit breakers (recommended for Phase 2, not implemented)
- ⏳ Distributed rate limiting with Redis (when scaling, not implemented)
- ⏳ Container scanning in CI/CD (not implemented)

**Phase 3 (Advanced)**: ⏳ **FUTURE**
- ⏳ WAF integration
- ⏳ Penetration testing
- ⏳ Third-party security audit (v1.0.1 audit complete internally)
- ⏳ GDPR compliance documentation

## Critical Security Checklist

**✅ All Phase 1 items COMPLETED** (first in v1.0.1, hardened since)

### Phase 1: Critical (MANDATORY) - ✅ COMPLETE

- ✅ **HTTPS Enforcement**
  - Reject HTTP requests with 403 `HTTPS Required` when `NODE_ENV=production` or `ENFORCE_HTTPS=true` (`src/middleware/securityHeaders.ts`)
  - HTTPS is detected via `X-Forwarded-Proto`, so run behind a trusted reverse proxy that sets it
  - Only the public `/health` is exempt (container health checks); `/health/detailed` and every other path require HTTPS
  - Add HSTS header (`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`)
  - See: [implementation.md#https-enforcement](implementation.md#1-httpstls-enforcement)

- ✅ **Request Size Limits**
  - Max 50KB body size on `/api/*` (`src/middleware/bodyLimit.ts`, built on `hono/body-limit`)
  - An oversized `Content-Length` is rejected before the body is read; bodies without `Content-Length` (chunked or streamed) are counted as they are read, so they cannot bypass the limit
  - Return 413 `PAYLOAD_TOO_LARGE` if exceeded; a non-numeric `Content-Length` gets 400 `VALIDATION_ERROR`
  - See: [implementation.md#request-size-limits](implementation.md#2-request-size-limits)

- ✅ **Cryptographically Secure API Keys**
  - Use `crypto.randomBytes(16).toString('hex')` (`scripts/generate-api-key.ts`)
  - **NEVER** use `Math.random()`
  - See: [implementation.md#api-key-generation](implementation.md#3-cryptographically-secure-api-key-generation)

- ✅ **Startup Validation of API Key Variables** (`src/config.ts`)
  - Every `API_KEY_*` variable must be either a known per-key config variable (`_RECIPIENTS`, `_RECIPIENT_DOMAINS`, `_FROM_ADDRESSES`, `_LLM_ENABLED`, `_LLM_RULES`, `_LLM_THRESHOLD`, `_LLM_FAIL_MODE`, `_LLM_MAX_CALLS_PER_DAY`) for a configured key, or an API key whose value matches `KEY_<NAME>_<12+ alphanumeric chars>`
  - Anything else (typos, unknown suffixes, the removed `_LLM_WHITELIST_SENDERS`, config values such as `true`) fails startup, so it can never become an accepted API key
  - Error messages name the variable but never print its value

- ✅ **Constant-Time API Key Comparison**
  - Use `timingSafeEqual` from Node.js crypto (`src/middleware/auth.ts`)
  - Every same-length configured key is compared, with no early exit (covered in `tests/security/auth.test.ts`)
  - See: [implementation.md#constant-time-comparison](implementation.md#4-constant-time-api-key-comparison)

- ✅ **XSS Sanitization**
  - Sanitize ALL user input in email templates (`src/utils/sanitize.ts`)
  - HTML body: entity-escaped with `escapeHtml()`; subject and plain-text body: converted to plain text with `isomorphic-dompurify` (`toHeaderText()`, `toPlainText()`)
  - See: [implementation.md#xss-sanitization](implementation.md#5-xss-sanitization)

- ✅ **Security Headers**
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
  - See: [implementation.md#security-headers](implementation.md#6-security-headers)

- ✅ **Template Field Limits**
  - Max lengths on string fields (Zod validation in `src/templates/email/contact-form.ts` and `src/routes/send.ts`)
  - Example: name (100), message (5000), subject (200); recipient `to` (320); `from.name` (100)
  - See: [implementation.md#request-size-limits](implementation.md#2-request-size-limits)

- ✅ **Provider API Timeouts**
  - 10-second timeout for Resend calls (`TIMEOUTS.provider` in `src/config.ts`, used in `src/channels/email.ts`)
  - `AbortSignal.timeout` aborts the HTTP request itself, so a timed-out send is not delivered later; the client gets 502 `PROVIDER_TIMEOUT` and can retry safely with an `Idempotency-Key` header
  - See: [implementation.md#provider-timeouts](implementation.md#7-provider-api-timeouts)

- ✅ **Rate Limiting** (`src/middleware/rateLimit.ts`)
  - Token bucket per API key, in memory, with three windows (defaults: 10/minute, 100/hour, 500/day)
  - All three buckets are checked before any token is taken, so a rejected request never drains the hour or day budget
  - Over the limit: 429 `RATE_LIMIT_EXCEEDED` with `retryAfter` in the body and a `Retry-After` header (the longest wait among the empty buckets)
  - Runs after recipient validation (rejected recipients do not use tokens) and before the LLM filter (rate-limited requests never cause LLM calls)

- ✅ **CORS**
  - Requests from an origin not in `ALLOWED_ORIGINS` get 403 `ORIGIN_NOT_ALLOWED`
  - Requests without an `Origin` (or `X-Source-Origin`) header are not CORS-checked; API key auth still applies

- ✅ **Log Masking** (`src/middleware/logger.ts`)
  - `X-API-Key` and `Authorization` header values are logged as `KEY_<APP>_****`; values in any other format are logged as `****`
  - Cookies, client IP headers (`X-Forwarded-For`, `X-Real-IP`, `CF-Connecting-IP`, `True-Client-IP`, `Forwarded`) and any header whose name contains `token` or `secret` are logged as `****`
  - Request bodies are not logged

- ✅ **Health Endpoint Separation**
  - Public `/health` (minimal info - `src/routes/health.ts`)
  - Authenticated `/health/detailed` (full diagnostics)
  - See: [implementation.md#health-endpoint](implementation.md#8-health-endpoint-information-disclosure)

- ✅ **Error Sanitization**
  - Hide stack traces in production (`src/middleware/errorHandler.ts`)
  - Generic error messages for users
  - See: [implementation.md#error-sanitization](implementation.md#13-error-sanitization)

### Phase 2: Hardening (RECOMMENDED)

- [ ] **IP-Based Rate Limiting** (not implemented)
  - Secondary rate limit by IP address
  - Protection if API key is compromised
  - See: [implementation.md#ip-rate-limiting](implementation.md#10-ip-based-rate-limiting-secondary)

- [ ] **Circuit Breaker** (not implemented)
  - Prevent cascading failures
  - Auto-recovery after provider downtime
  - See: [implementation.md#circuit-breaker](implementation.md#11-circuit-breaker-for-provider-apis)

- [x] **API Key Revocation** (environment-based)
  - `REVOKED_KEYS` (comma-separated) rejects listed keys with 401 `API key has been revoked`, even if they are still configured
  - Configuration is loaded at startup, so a restart is required; runtime (Redis-backed) revocation is not implemented
  - See: [implementation.md#key-revocation](implementation.md#12-api-key-revocation-mechanism)

- [x] **Dependency Scanning**
  - `npm audit --audit-level=moderate`, OSV Scanner (fails on any vulnerability) and Dependency Review (PRs) in `.github/workflows/security.yml`
  - Dependabot for npm, GitHub Actions and Docker updates (`.github/dependabot.yml`)
  - See: [automated-security.md](automated-security.md)

- [ ] **Container Scanning** (not implemented)
  - Trivy or Docker scan in CI/CD
  - Regular base image updates (Dependabot already proposes Docker base image updates)
  - See: [archive/review-pre-v1.0.0.md#security-scanning](archive/review-pre-v1.0.0.md#security-scanning)

### Phase 3: Advanced (OPTIONAL)

- [ ] **WAF Integration** (Cloudflare/AWS WAF)
- [ ] **Secrets Management** (Vault/AWS Secrets Manager)
- [ ] **Monitoring & Alerting** (Sentry for errors)
- [ ] **GDPR Compliance** (data retention, DPA)
- [ ] **Penetration Testing** (before v1.0)
- [ ] **Third-Party Security Audit**

## Threat Model Summary

### Primary Threats

1. **API Key Exposure** (HIGH)
   - Keys visible in client-side code (by design, mitigated by CORS)
   - Keys transmitted over network (mitigated by HTTPS)

2. **Abuse via Compromised Keys** (HIGH)
   - Spam campaigns, sender spoofing, cost escalation
   - Mitigated by recipient whitelisting, sender allowlist, rate limiting, revocation (IP limiting is planned)

3. **Cross-Site Scripting (XSS)** (HIGH)
   - Malicious scripts in email templates
   - Mitigated by HTML escaping and DOMPurify-based plain-text conversion

4. **Denial of Service** (MEDIUM)
   - Large payloads, rapid requests
   - Mitigated by size limits, rate limiting

5. **Information Disclosure** (MEDIUM)
   - Error messages, health endpoints, logs
   - Mitigated by sanitization, access controls

### Attack Surface

```
┌─────────────────────────────────────────────┐
│  UNTRUSTED: Internet, Client Apps          │
├─────────────────────────────────────────────┤
│  EXPOSED: /api/send, /health,               │
│           /health/detailed (API key)        │
├─────────────────────────────────────────────┤
│  PROTECTED: Provider credentials (env vars) │
└─────────────────────────────────────────────┘
```

See [archive/review-pre-v1.0.0.md](archive/review-pre-v1.0.0.md#threat-model) for the original (pre-v1.0.0) threat model and attack scenarios.

## Security Best Practices

### For Deployment

**DO:**
- ✅ Use HTTPS exclusively in production
- ✅ Store secrets in environment variables (never commit)
- ✅ Use different API keys per frontend application
- ✅ Set strict `ALLOWED_ORIGINS` (no wildcards)
- ✅ Monitor logs for suspicious activity
- ✅ Rotate API keys every 6 months
- ✅ Keep dependencies updated (`npm audit`)

**DON'T:**
- ❌ Commit `.env` files to git
- ❌ Use the same API key across multiple sites
- ❌ Allow all origins with `*`
- ❌ Expose provider API keys (Resend, Twilio) to clients
- ❌ Skip security headers
- ❌ Use HTTP in production

### For Development

- Generate API keys with `crypto.randomBytes`, not `Math.random()`
- Test with HTTPS locally (use mkcert or ngrok)
- Review security checklist before each release
- Run `npm audit` regularly
- Test rate limiting behavior
- Validate error messages don't leak information

## Compliance

### GDPR (EU General Data Protection Regulation)

**Data Collected:**
- Email addresses, names, phone numbers (PII)
- Source origins (for CORS)
- API usage metrics

**Legal Basis:**
- Legitimate interest (transactional communications)

**Requirements:**
- Auto-delete logs after 90 days
- Provide data deletion mechanism (right to erasure)
- Data processing agreement with providers (Resend, and your LLM provider if LLM filtering is enabled)

**Implementation:**
- Log rotation: not handled by Conduit. It logs to stdout/stderr (request and response lines as JSON), so configure 90-day retention in your container or log platform
- PII masking in logs: API keys (`KEY_<APP>_****`), cookies and client IP headers are masked; request bodies are not logged; rejected recipients are logged as `local-part@***`
- A data deletion mechanism is not implemented in Conduit (it stores no messages)

See [archive/review-pre-v1.0.0.md#compliance-considerations](archive/review-pre-v1.0.0.md#compliance-considerations) for full details.

## Testing Security

### Required Security Tests

```typescript
// Critical security tests to implement
describe('Security', () => {
  it('enforces HTTPS in production');
  it('rejects payloads over 50KB');
  it('uses constant-time API key comparison');
  it('sanitizes XSS in templates');
  it('includes all security headers');
  it('masks sensitive data in logs');
  it('enforces rate limits');
});
```

See [implementation.md#security-testing](implementation.md#security-testing) for complete test examples.

## Incident Response

### If a Security Breach Occurs

1. **Immediate**: Revoke compromised API keys (update `REVOKED_KEYS` env var, restart)
2. **Investigate**: Review logs, identify scope, document timeline
3. **Notify**: Alert affected frontend owners, comply with GDPR (72-hour notification)
4. **Recover**: Generate new keys, distribute securely
5. **Post-Mortem**: Document root cause, update security measures

See [implementation.md#incident-response](implementation.md#incident-response) for detailed procedures.

## Security Documentation

### Documents in This Folder

- **[README.md](README.md)** (this file) - Security overview and checklist
- **[automated-security.md](automated-security.md)** - Dependabot and CI security scanning
- **[implementation.md](implementation.md)** - Step-by-step security hardening guide with code
- **[advanced-protections.md](advanced-protections.md)** - Advanced protection techniques (experimental)
- **[spam-prevention.md](spam-prevention.md)** - Practical spam prevention guide

**Archived Documents:**
- **[archive/security-audit-v1.0.1.md](archive/security-audit-v1.0.1.md)** - Production security audit (2025-10-05)
- **[archive/review-pre-v1.0.0.md](archive/review-pre-v1.0.0.md)** - Pre-implementation security review (historical)

### External References

- **[OWASP API Security Top 10](https://owasp.org/www-project-api-security/)**
- **[Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)**
- **[CWE Top 25](https://cwe.mitre.org/top25/)**
- **[GDPR Guidelines](https://gdpr.eu/)**

## Security Achievements 🎉

**Production-ready security implementation achieved:**

1. ✅ **HTTPS**: Enforced at application level with HSTS preload
2. ✅ **Secrets**: Environment variables with Zod validation; every `API_KEY_*` variable is validated at startup
3. ✅ **Monitoring**: Structured JSON logging with PII masking
4. ✅ **Rate Limiting**: Token bucket algorithm across 3 time windows
5. ✅ **Recipient Whitelisting**: Per-API-key email restrictions (v1.1.0)
6. ✅ **LLM Spam Filtering**: AI-powered content analysis (v1.2.0)
   - Providers: Anthropic Claude and OpenAI GPT
   - Per-API-key configuration (rules, threshold, fail mode, budget)
   - Detects spam, abuse, profanity, phishing, scams, prompt injection
   - Fail-closed mode: provider errors and malformed model output give 503 instead of sending unfiltered
   - Runs after validation and rate limiting, and only sees validated template fields
   - Daily budget limits to control costs
   - The former sender whitelist bypass was removed (sender fields are spoofable); setting it fails startup
7. ✅ **Sender Allowlist**: Per-API-key `from` address restrictions (`API_KEY_*_FROM_ADDRESSES`)
8. ✅ **Testing**: Dedicated security tests in `tests/security/`, 80% coverage enforced in CI
9. ✅ **OWASP Coverage**: 9/10 categories with EXCELLENT implementation (per the archived v1.0.1 audit)

**Next Steps for Enhanced Security:**
- Monitor LLM spam detection metrics and optimize thresholds
- Add support for Gemini and Ollama providers (not implemented; setting them fails startup)
- Add container scanning to CI/CD
- Plan Redis-based distributed rate limiting for Phase 2

---

**Remember**: Security is not a one-time task. It's an ongoing process of review, testing, and improvement.
