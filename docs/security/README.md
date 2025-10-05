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

### Current Status (Specification Phase)

⚠️ **Implementation Not Started** - Security measures documented but not yet implemented.

### Security Maturity Target

**Phase 1 (MVP)**:
- ✅ Specification complete
- ⏳ Critical security measures (see checklist below)
- ⏳ Basic security testing

**Phase 2 (Hardening)**:
- ⏳ IP-based rate limiting
- ⏳ Circuit breakers
- ⏳ API key revocation
- ⏳ Dependency scanning in CI/CD

**Phase 3 (Production-Ready)**:
- ⏳ WAF integration
- ⏳ Penetration testing
- ⏳ Third-party security audit
- ⏳ GDPR compliance documentation

## Critical Security Checklist

Use this checklist during implementation. **All Phase 1 items are MANDATORY before production deployment.**

### Phase 1: Critical (MANDATORY)

- [ ] **HTTPS Enforcement**
  - Reject HTTP requests in production
  - Add HSTS header (`Strict-Transport-Security: max-age=31536000`)
  - See: [implementation.md#https-enforcement](implementation.md#1-httpstls-enforcement)

- [ ] **Request Size Limits**
  - Max 50KB body size
  - Return 413 if exceeded
  - See: [implementation.md#request-size-limits](implementation.md#2-request-size-limits)

- [ ] **Cryptographically Secure API Keys**
  - Use `crypto.randomBytes(16).toString('hex')`
  - **NEVER** use `Math.random()`
  - See: [implementation.md#api-key-generation](implementation.md#3-cryptographically-secure-api-key-generation)

- [ ] **Constant-Time API Key Comparison**
  - Use `timingSafeEqual` from Node.js crypto
  - Prevent timing attack vulnerabilities
  - See: [implementation.md#constant-time-comparison](implementation.md#4-constant-time-api-key-comparison)

- [ ] **XSS Sanitization**
  - Sanitize ALL user input in email templates
  - Use `isomorphic-dompurify`
  - See: [implementation.md#xss-sanitization](implementation.md#5-xss-sanitization)

- [ ] **Security Headers**
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Content-Security-Policy`
  - See: [implementation.md#security-headers](implementation.md#6-security-headers)

- [ ] **Template Field Limits**
  - Max lengths on all string fields (Zod validation)
  - Example: name (100), email (255), message (5000)
  - See: [implementation.md#request-size-limits](implementation.md#2-request-size-limits)

- [ ] **Provider API Timeouts**
  - 10-second timeout for all provider calls
  - Use `AbortSignal.timeout()`
  - See: [implementation.md#provider-timeouts](implementation.md#7-provider-api-timeouts)

- [ ] **Health Endpoint Separation**
  - Public `/health` (minimal info)
  - Authenticated `/health/detailed` (full diagnostics)
  - See: [implementation.md#health-endpoint](implementation.md#8-health-endpoint-information-disclosure)

- [ ] **Error Sanitization**
  - Hide stack traces in production
  - Generic error messages for users
  - See: [implementation.md#error-sanitization](implementation.md#12-error-sanitization)

### Phase 2: Hardening (RECOMMENDED)

- [ ] **IP-Based Rate Limiting**
  - Secondary rate limit by IP address
  - Protection if API key is compromised
  - See: [implementation.md#ip-rate-limiting](implementation.md#9-ip-based-rate-limiting-secondary)

- [ ] **Circuit Breaker**
  - Prevent cascading failures
  - Auto-recovery after provider downtime
  - See: [implementation.md#circuit-breaker](implementation.md#10-circuit-breaker-for-provider-apis)

- [ ] **API Key Revocation**
  - Invalidate compromised keys without restart
  - Environment-based or Redis-backed
  - See: [implementation.md#key-revocation](implementation.md#11-api-key-revocation-mechanism)

- [ ] **Dependency Scanning**
  - `npm audit` in CI/CD pipeline
  - Automated security updates
  - See: [review.md#dependency-security](review.md#15-dependency-security)

- [ ] **Container Scanning**
  - Trivy or Docker scan in CI/CD
  - Regular base image updates
  - See: [review.md#container-scanning](review.md)

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
   - Spam campaigns, cost escalation
   - Mitigated by rate limiting, IP limiting, revocation

3. **Cross-Site Scripting (XSS)** (HIGH)
   - Malicious scripts in email templates
   - Mitigated by input sanitization (DOMPurify)

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
│  EXPOSED: /api/send, /health                │
├─────────────────────────────────────────────┤
│  PROTECTED: Provider credentials (env vars) │
└─────────────────────────────────────────────┘
```

See [review.md](review.md) for complete threat model and attack scenarios.

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
- Data processing agreement with providers (Resend, Twilio, Firebase)

**Implementation:**
- Log rotation: 90-day retention
- PII masking in logs (email domains, API key suffixes)

See [review.md#compliance-considerations](review.md) for full details.

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

See [review.md#incident-response](review.md#incident-response) for detailed procedures.

## Security Documentation

### Documents in This Folder

- **[README.md](README.md)** (this file) - Security overview and checklist
- **[review.md](review.md)** - Comprehensive security analysis, threat model, vulnerabilities
- **[implementation.md](implementation.md)** - Step-by-step security hardening guide with code

### External References

- **[OWASP API Security Top 10](https://owasp.org/www-project-api-security/)**
- **[Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)**
- **[CWE Top 25](https://cwe.mitre.org/top25/)**
- **[GDPR Guidelines](https://gdpr.eu/)**

## Questions Before Implementation?

Before starting implementation, ensure you can answer:

1. **HTTPS**: How will you enforce HTTPS? (Reverse proxy, application-level, both?)
2. **Secrets**: Where will you store provider API keys? (Environment variables, Vault?)
3. **Monitoring**: How will you detect security incidents? (Logs, Sentry, alerts?)
4. **Rotation**: What's your API key rotation policy? (6 months, manual, automated?)
5. **Testing**: How will you test security measures? (Unit tests, integration tests, scanning?)

If you need help with any of these, see the implementation guide or open an issue.

---

**Remember**: Security is not a one-time task. It's an ongoing process of review, testing, and improvement.
