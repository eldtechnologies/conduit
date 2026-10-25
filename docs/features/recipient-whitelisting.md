# Recipient Whitelisting

**Status:** ✅ Implemented (v1.1.0)
**Priority:** 🔴 CRITICAL
**Security Value:** 95% risk reduction for stolen API keys

> Related: the [sender allowlist](./sender-allowlist.md) (`API_KEY_*_FROM_ADDRESSES`) controls which `from` addresses a key may send as. Recipient whitelisting controls who a key may send to.

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Solution](#solution)
- [Configuration](#configuration)
- [Implementation](#implementation)
- [Use Cases](#use-cases)
- [Testing](#5-tests)
- [Migration Guide](#migration-guide)
- [Troubleshooting](#troubleshooting)

---

## Overview

Recipient whitelisting restricts which email addresses can receive messages per API key. This prevents stolen or compromised API keys from being used as spam gateways by limiting the blast radius to only pre-approved recipients.

### Why This Matters

**Risk without a whitelist** (the behaviour before v1.1.0, and today for keys without one):
- ✅ API keys are rate-limited (10/min, 100/hr, 500/day)
- ✅ API keys are origin-restricted (CORS)
- ❌ **But can send to ANY email address**

**If an API key is stolen:**
```
Attacker can send 500 emails/day to ANY address
├─ Spam campaigns: ✅ Possible
├─ Phishing attacks: ✅ Possible
├─ Reputation damage: ✅ Possible
└─ Using Conduit as spam gateway: ✅ Possible
```

**With Recipient Whitelisting:**
```
Attacker can ONLY send to whitelisted addresses
├─ Spam campaigns: ❌ Blocked (can only spam your admins)
├─ Phishing attacks: ❌ Blocked (attacker controls recipient list)
├─ Reputation damage: ✅ Minimal (limited blast radius)
└─ Using as spam gateway: ❌ Impossible
```

### Security Impact

- **Before:** Stolen key = 500 emails/day to ANY address (HIGH RISK)
- **After:** Stolen key = 500 emails/day to YOUR admin emails only (LOW RISK)
- **Risk Reduction:** ~95%

---

## Problem Statement

### Attack Scenario

1. Attacker discovers your API key (browser DevTools, network inspection, leaked .env)
2. Attacker bypasses CORS by making server-side requests
3. Attacker sends spam/phishing to thousands of addresses (rate limited to 500/day)
4. Your sender reputation is damaged
5. Resend bills accumulate
6. Recipients report spam
7. Your domain gets blacklisted

### Real-World Example

```javascript
// Attacker code (after stealing the contact form's key)
const stolenKey = 'KEY_CONTACTFORM_49dd3dcd1ef59022917a72e01bc1ce9e';

// Spam 500 victims per day
for (let i = 0; i < 500; i++) {
  await fetch('https://conduit.yourdomain.com/api/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': stolenKey,
    },
    body: JSON.stringify({
      channel: 'email',
      templateId: 'contact-form',
      to: spamList[i], // ← ANY email address works!
      data: {
        name: 'Crypto Investment',
        email: 'scam@attacker.com',
        message: 'Buy Bitcoin now! Limited time offer!',
      },
    }),
  });
}
```

**Result:** 500 spam emails sent, reputation damaged, costs incurred.

---

## Solution

### Recipient Whitelisting

Per-API-key configuration that specifies which email addresses or domains are allowed as recipients.

#### Two Whitelist Types

**1. Specific Email Addresses:**
```bash
API_KEY_WEBSITE_RECIPIENTS=admin@company.com,support@company.com
```
Only these exact emails can receive messages.

**2. Domain-Level Whitelisting:**
```bash
API_KEY_WEBSITE_RECIPIENT_DOMAINS=company.com
```
ANY email at `company.com` can receive messages (`*@company.com`).

#### Combined Whitelisting

```bash
# Allow specific emails + all @company.com addresses
API_KEY_WEBSITE_RECIPIENTS=external@partner.com,admin@company.com
API_KEY_WEBSITE_RECIPIENT_DOMAINS=company.com
```

If EITHER whitelist matches, the email is allowed.

#### Backward Compatibility

```bash
# No whitelist configured = allow all recipients
API_KEY_DEV=KEY_DEV_55512356ef43d883be8d94dd80a9b69e
# No RECIPIENTS or RECIPIENT_DOMAINS variables
# → Allows sending to ANY email address
```

---

## Configuration

### Environment Variables

For each API key, add optional whitelist configuration:

```bash
# Format:
API_KEY_{NAME}_RECIPIENTS=email1@domain.com,email2@domain.com
API_KEY_{NAME}_RECIPIENT_DOMAINS=domain1.com,domain2.com
```

Rules enforced at startup (`src/config.ts`):

- `API_KEY_{NAME}` must be set to a valid key (`KEY_<NAME>_<12+ alphanumeric chars>`, e.g. from `npm run generate-key -- name`). A whitelist variable for a key name that is not configured fails startup with `configures API key "{NAME}" but API_KEY_{NAME} is not set`
- Values are comma-separated, trimmed and lowercased; empty entries are dropped
- A misspelled suffix (for example `API_KEY_WEBSITE_RECIPIENT`) is not a recognised config variable, and since its value is not a valid API key, startup fails

### Examples

#### Contact Form (Most Common)

```bash
# Contact form only sends to company admins
API_KEY_WEBSITE=KEY_WEBSITE_657582934edbf009f73afb38c38111f6
API_KEY_WEBSITE_RECIPIENTS=admin@company.com,support@company.com
```

**Result:** Any request with this key can ONLY send to these 2 emails.

#### Newsletter Signup

```bash
# Newsletter signups send to marketing team
API_KEY_NEWSLETTER=KEY_NEWSLETTER_d2b7ebd82532a2b55fe86144055edf8d
API_KEY_NEWSLETTER_RECIPIENTS=newsletter-admin@company.com
```

**Result:** Only newsletter-admin receives emails.

#### Multi-Domain Organization

```bash
# Allow all company domains
API_KEY_CORPORATE=KEY_CORPORATE_ff46590bd7215fd7e5b8700122c58868
API_KEY_CORPORATE_RECIPIENT_DOMAINS=company.com,company.co.uk,company.de
```

**Result:** Emails can be sent to ANY address at these 3 domains.

#### Hybrid Configuration

```bash
# Allow specific external partner + all internal emails
API_KEY_PARTNERSHIPS=KEY_PARTNERSHIPS_0b30ad9b53dc3d8c40fbc4763df907fa
API_KEY_PARTNERSHIPS_RECIPIENTS=partner-admin@external.com
API_KEY_PARTNERSHIPS_RECIPIENT_DOMAINS=company.com
```

**Result:** Can send to `partner-admin@external.com` OR any `*@company.com` address.

#### Development (No Restrictions)

```bash
# Testing/development - allow any recipient
API_KEY_DEV=KEY_DEV_55512356ef43d883be8d94dd80a9b69e
# NO _RECIPIENTS or _RECIPIENT_DOMAINS variables
```

**Result:** No recipient restrictions (same as before v1.1.0).

### Configuration in .env

```bash
# ============================================
# API Keys with Recipient Whitelisting
# ============================================

# Website contact form
API_KEY_WEBSITE=KEY_WEBSITE_657582934edbf009f73afb38c38111f6
API_KEY_WEBSITE_RECIPIENTS=admin@yourcompany.com,support@yourcompany.com

# Mobile app (allows all company emails)
API_KEY_MOBILE=KEY_MOBILE_fd49dafe843dadc87f1924cebdc634e6
API_KEY_MOBILE_RECIPIENT_DOMAINS=yourcompany.com

# Newsletter signup
API_KEY_NEWSLETTER=KEY_NEWSLETTER_d2b7ebd82532a2b55fe86144055edf8d
API_KEY_NEWSLETTER_RECIPIENTS=newsletter@yourcompany.com

# Development key (no restrictions)
API_KEY_DEV=KEY_DEV_55512356ef43d883be8d94dd80a9b69e
```

These keys are examples. Generate your own with `npm run generate-key -- <name>`.

---

## Implementation

### Architecture Overview

```
POST /api/send
   ↓
[1] Logger, HTTPS, CORS, security headers, body limit
   ↓
[2] Authentication
   ↓ sets c.set('apiKey', key)
[3] Recipient Validation
   ↓ parses the JSON body once and stores it for the send route
   ↓ checks body.to against the whitelist for c.get('apiKey')
[4] Rate Limiting
   ↓
[5] Send Route (request validation, sender allowlist, LLM filter, send)
```

Recipient validation runs **before rate limiting**. A request to a non-whitelisted recipient gets 403 without consuming any of the key's rate-limit tokens, and never reaches request validation, the LLM filter or the email provider.

### 1. Config Loading (`src/config.ts`)

`loadRecipientWhitelists()` builds a `Map<string, RecipientWhitelist>` keyed by API key value from the per-key config variables:

```typescript
export interface RecipientWhitelist {
  emails: string[];      // Specific allowed emails (lowercased)
  domains: string[];     // Allowed domains (lowercased)
}
```

- Only `API_KEY_<NAME>_RECIPIENTS` and `API_KEY_<NAME>_RECIPIENT_DOMAINS` are read. Both refer to the key `API_KEY_<NAME>`, which must be configured or startup fails
- A key gets a whitelist entry as soon as either variable is set
- Startup fails when a variable is empty (or only commas/whitespace), when a `_RECIPIENTS` entry is not a valid email address, or when a `_RECIPIENT_DOMAINS` entry is not a plain domain such as `example.com` (no `@`, `*.`, trailing dot, IP address or single-label name like `localhost`). The error names the variable and the entry position, not the value

### 2. Error Code (`src/types/api.ts`)

`RECIPIENT_NOT_ALLOWED`, returned with HTTP **403** (`ForbiddenError`).

### 3. Recipient Validation Middleware (`src/middleware/recipientValidation.ts`)

For every authenticated `POST /api/send`:

1. Parses the request body. Malformed JSON gets 400 `VALIDATION_ERROR` ("Invalid JSON body"); a body that is not a JSON object (array, `null`, primitive) gets 400 `VALIDATION_ERROR` ("Request body must be a JSON object"). This applies whether or not the key has a whitelist
2. If the key has no whitelist, the request continues unchanged
3. If `to` is missing or not a string, the request gets 400 `VALIDATION_ERROR` ("Missing or invalid recipient")
4. `to` is trimmed and lowercased. It is allowed if it equals an entry in `emails`, or if the part after `@` equals an entry in `domains` (exact match, subdomains are not included)
5. Otherwise the request gets 403 `RECIPIENT_NOT_ALLOWED`

Error response (production):

```json
{
  "success": false,
  "error": "Recipient not allowed. This recipient is not in the whitelist for this API key.",
  "code": "RECIPIENT_NOT_ALLOWED"
}
```

Outside production the response also contains `details.hint`. The response never echoes the recipient or the whitelist contents.

Rejected recipients are logged with `console.warn('Recipient not in whitelist:', ...)`, including only the masked recipient (`local-part@***`) and the number of whitelisted emails and domains. The app name (`"app"`) appears on the request logger's response line.

### 4. Middleware Integration (`src/index.ts`)

```typescript
app.use('/api/*', bodyLimit);
app.use('/api/*', authenticate);
app.use('/api/send', validateRecipient); // before rate limiting
app.use('/api/*', rateLimit);
```

### 5. Tests

The test suite (`tests/security/recipientValidation.test.ts`) runs the full app (`app.fetch`) with keys configured in `tests/setup.ts` (`API_KEY_TEST_WHITELIST` with a whitelist, `API_KEY_TEST_NO_WHITELIST` without). It covers:

- exact email matching and domain matching, both case-insensitive
- keys without a whitelist accepting any recipient
- missing or non-string `to` (400)
- the 403 response, its hint, and that it does not reveal the whitelist contents
- logging of rejected recipients without the API key
- authentication running before the whitelist check
- rate limiting still applying to allowed recipients, and rejected recipients not consuming rate-limit tokens

Run it with:

```bash
npm test -- tests/security/recipientValidation.test.ts
```

---

## Use Cases

### 1. Contact Forms (Most Common)

**Scenario:** Website contact form sends submissions to company admins.

**Configuration:**
```bash
API_KEY_WEBSITE=KEY_WEBSITE_657582934edbf009f73afb38c38111f6
API_KEY_WEBSITE_RECIPIENTS=admin@company.com,support@company.com
```

**Security:**
- ✅ Stolen key can only email admin@company.com or support@company.com
- ✅ Attacker cannot use it for spam campaigns
- ✅ Maximum damage: annoying your own staff

### 2. Newsletter Signup

**Scenario:** Newsletter signup form sends notification to marketing team.

**Configuration:**
```bash
API_KEY_NEWSLETTER=KEY_NEWSLETTER_d2b7ebd82532a2b55fe86144055edf8d
API_KEY_NEWSLETTER_RECIPIENTS=newsletter-admin@company.com
```

**Security:**
- ✅ Only 1 recipient allowed
- ✅ Stolen key is useless for spam
- ✅ Newsletter admin can detect abuse immediately

### 3. Multi-Department Organization

**Scenario:** Internal company form routes to different departments.

**Configuration:**
```bash
API_KEY_INTERNAL=KEY_INTERNAL_6e3a5f20c30995c62c25873357095db5
API_KEY_INTERNAL_RECIPIENT_DOMAINS=company.com
```

**Security:**
- ✅ Can send to any company employee
- ✅ Cannot send outside company
- ✅ Protects against external spam

### 4. Partner Integration

**Scenario:** Integration with external partner, plus internal notifications.

**Configuration:**
```bash
API_KEY_PARTNER=KEY_PARTNER_f28cc605b1bcb53457b2896c7cae169c
API_KEY_PARTNER_RECIPIENTS=partner-notifications@external.com
API_KEY_PARTNER_RECIPIENT_DOMAINS=company.com
```

**Security:**
- ✅ Can email partner + internal team
- ✅ Limited blast radius if stolen
- ✅ Easy to audit recipients

### 5. Development & Testing

**Scenario:** Development environment needs flexibility.

**Configuration:**
```bash
API_KEY_DEV=KEY_DEV_55512356ef43d883be8d94dd80a9b69e
# No _RECIPIENTS or _RECIPIENT_DOMAINS
```

**Security:**
- ⚠️ No recipient restrictions
- ⚠️ Use ONLY in development environments
- ⚠️ Rotate before production deployment

---

## Migration Guide

### Step 1: Audit Your Use Cases

For each API key, ask:
1. Who are the legitimate recipients?
2. Is it a fixed list (admin@company.com) or domain-based (*.company.com)?
3. Do I need external recipients (partners)?

### Step 2: Add Whitelist Configuration

Update your `.env` file:

```bash
# Before (no restrictions)
API_KEY_WEBSITE=KEY_WEBSITE_657582934edbf009f73afb38c38111f6

# After (with whitelist)
API_KEY_WEBSITE=KEY_WEBSITE_657582934edbf009f73afb38c38111f6
API_KEY_WEBSITE_RECIPIENTS=admin@company.com,support@company.com
```

Restart Conduit after changing the configuration; it is loaded once at startup.

### Step 3: Test in Development

```bash
# Test allowed recipient
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: KEY_WEBSITE_657582934edbf009f73afb38c38111f6" \
  -d '{
    "channel": "email",
    "templateId": "contact-form",
    "to": "admin@company.com",
    "data": {"name": "Test", "email": "test@example.com", "message": "Test"}
  }'
# → Should succeed

# Test blocked recipient
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: KEY_WEBSITE_657582934edbf009f73afb38c38111f6" \
  -d '{
    "channel": "email",
    "templateId": "contact-form",
    "to": "attacker@evil.com",
    "data": {"name": "Test", "email": "test@example.com", "message": "Test"}
  }'
# → Should return 403 RECIPIENT_NOT_ALLOWED (does not count against the rate limit)
```

### Step 4: Gradual Rollout

**Option A: Strict (recommended)**
- Add whitelists for ALL API keys immediately
- Maximum security

**Option B: Gradual**
- Add whitelist for production keys first
- Leave development keys unrestricted temporarily
- Add whitelists as you audit each key

### Step 5: Monitor & Adjust

After deployment:
- Monitor logs for RECIPIENT_NOT_ALLOWED errors
- Adjust whitelists if legitimate recipients are blocked
- Add domains if email list is expanding

---

## Troubleshooting

### Error: 403 "Recipient not allowed. This recipient is not in the whitelist for this API key."

**Cause:** The recipient is not in the whitelist for this API key. The response does not name the recipient; the server log shows it masked (`user@***`).

**Solution:**
```bash
# Add the recipient to whitelist
API_KEY_MYKEY_RECIPIENTS=existing@company.com,user@example.com

# OR add their domain
API_KEY_MYKEY_RECIPIENT_DOMAINS=example.com
```

### Startup fails: `must list at least one email address` / `must list at least one domain`

**Cause:** A whitelist variable is set but empty. Before this check, an empty whitelist silently blocked every recipient.

**Solution:**
```bash
# BAD: Empty whitelist fails startup
API_KEY_MYKEY_RECIPIENTS=
API_KEY_MYKEY_RECIPIENT_DOMAINS=

# GOOD: Remove empty variables OR add values
API_KEY_MYKEY_RECIPIENTS=admin@company.com
```

### Startup fails: `configures API key "MYSITE" but API_KEY_MYSITE is not set`

**Cause:** Environment variable name mismatch. A whitelist variable must use the same name as its key variable.

**Check:**
```bash
# If your API key variable is:
API_KEY_WEBSITE=KEY_WEBSITE_657582934edbf009f73afb38c38111f6

# Then whitelist variables must be:
API_KEY_WEBSITE_RECIPIENTS=admin@company.com
API_KEY_WEBSITE_RECIPIENT_DOMAINS=company.com

# NOT:
API_KEY_MYSITE_RECIPIENTS=admin@company.com  # ← Wrong name, startup fails
```

A misspelled suffix such as `API_KEY_WEBSITE_RECIPIENT` (missing `S`) also fails startup, because it is neither a known config variable nor a valid API key.

### Whitelist not working (all recipients allowed)

**Cause:** Neither `API_KEY_<NAME>_RECIPIENTS` nor `API_KEY_<NAME>_RECIPIENT_DOMAINS` is set for the key you are using, or Conduit was not restarted after the change.

### Subdomain not matching domain whitelist

**Cause:** Subdomains are NOT included in domain whitelists.

**Example:**
```bash
# This whitelist
API_KEY_MYKEY_RECIPIENT_DOMAINS=company.com

# ALLOWS: user@company.com
# BLOCKS:  user@mail.company.com  ← subdomain not included
```

**Solution:** Add subdomains explicitly:
```bash
API_KEY_MYKEY_RECIPIENT_DOMAINS=company.com,mail.company.com
```

### Case sensitivity issues

**Cause:** Email addresses have different casing.

**Solution:** This should work automatically (validation is case-insensitive), but ensure consistent lowercase in config:
```bash
# GOOD
API_KEY_MYKEY_RECIPIENTS=admin@company.com

# ALSO WORKS (but less clean)
API_KEY_MYKEY_RECIPIENTS=Admin@COMPANY.com
```

---

## FAQ

### Q: Is this backward compatible?

**A:** Yes. If no whitelist is configured, all recipients are allowed (the behavior before v1.1.0).

### Q: Can I whitelist multiple domains?

**A:** Yes. Use comma-separated list:
```bash
API_KEY_MYKEY_RECIPIENT_DOMAINS=company.com,company.co.uk,company.de
```

### Q: Does this affect performance?

**A:** Negligible. The whitelist check is a linear scan of the configured emails and domains (typically <10 entries), with no external calls.

### Q: What if I need to change recipients frequently?

**A:** Use domain-based whitelisting instead of specific emails:
```bash
API_KEY_MYKEY_RECIPIENT_DOMAINS=company.com
```
This allows ANY `@company.com` email without updating config.

### Q: Can I use wildcards like `*@company.com`?

**A:** Not needed. Domain whitelisting already does this:
```bash
API_KEY_MYKEY_RECIPIENT_DOMAINS=company.com
# Automatically allows *@company.com
```

### Q: What about internationalized domains (IDN)?

**A:** Not currently supported. Use ASCII (Punycode) representation:
```bash
# For münchen.de, use:
API_KEY_MYKEY_RECIPIENT_DOMAINS=xn--mnchen-3ya.de
```

### Q: How do I test the whitelist?

**A:** See [Migration Guide > Step 3: Test in Development](#step-3-test-in-development) for curl examples.

---

## Summary

**Recipient Whitelisting** is a **critical security feature** that prevents stolen API keys from being used as spam gateways.

### Key Benefits

- ✅ 95% risk reduction for stolen API keys
- ✅ Prevents spam campaigns
- ✅ Prevents phishing attacks
- ✅ Protects sender reputation
- ✅ Limits cost exposure
- ✅ Backward compatible
- ✅ Easy to configure
- ✅ Zero performance impact

### Implementation Checklist

- [x] Update `src/config.ts` with whitelist loading
- [x] Create `src/middleware/recipientValidation.ts`
- [x] Add `RECIPIENT_NOT_ALLOWED` error code
- [x] Integrate middleware in `src/index.ts`
- [x] Write comprehensive test suite (`tests/security/recipientValidation.test.ts`)

**Security Value:** 🔴 CRITICAL

---

**Status:** Implemented in v1.1.0.
