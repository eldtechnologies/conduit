# Spam Prevention Guide

**Status**: 📋 Practical Guide
**Version**: 1.1.0+
**Last Updated**: 2025-10-14

> **⚠️ IMPORTANT**: LLM spam filtering (mentioned in Tier 3) is NOT yet implemented in Conduit.
> This is a **planned feature for v1.2.0+**. For current spam protection, use Tier 1-2 methods
> (honeypot, CAPTCHA, recipient whitelisting). See [LLM Spam Filtering Feature Plan](../features/llm-spam-filtering.md).

## Table of Contents

- [Overview](#overview)
- [Quick Start (15 Minutes)](#quick-start-15-minutes)
- [Three-Tier Protection Strategy](#three-tier-protection-strategy)
- [Common Use Cases](#common-use-cases)
- [Configuration Templates](#configuration-templates)
- [Monitoring and Alerts](#monitoring-and-alerts)
- [Incident Response](#incident-response)
- [Cost-Benefit Analysis](#cost-benefit-analysis)
- [FAQ](#faq)

---

## Overview

This guide helps you implement spam prevention for Conduit in **under 1 hour** with minimal cost.

### What This Guide Covers

✅ **Immediate Wins**: Simple protections you can deploy in 15 minutes (zero cost)
✅ **High-Impact Layers**: CAPTCHA and rate limiting (1-2 hours, free)
✅ **Advanced Protection**: LLM-based filtering as Conduit middleware (optional, low cost)
✅ **Monitoring Setup**: Detect and respond to attacks
✅ **Real-World Examples**: Copy-paste configurations for common scenarios

### Who Should Read This

- **Frontend Developers**: Adding spam protection to contact forms
- **DevOps Engineers**: Configuring Conduit with anti-spam measures
- **Security Teams**: Understanding multi-layer defense strategy
- **Product Managers**: Evaluating protection options and costs

### Threat Model

**What We're Protecting Against**:
1. **Bot Spam**: Automated form submissions (90% of spam)
2. **Human Spam**: Manual spammers (5% of spam)
3. **Stolen API Keys**: Attackers using leaked Conduit keys (5% of spam)

**Protection Layers** (in order of effectiveness):
1. Recipient whitelisting → Blocks 95% of stolen key abuse
2. Honeypot fields → Blocks 90% of bots
3. CAPTCHA → Blocks 99% of remaining bots
4. Behavioral analysis → Blocks 80% of rapid-fire abuse
5. Content filtering → Blocks 70% of keyword spam
6. LLM filtering → Blocks 95% of semantic spam (planned for v1.2.0+)

> **Note**: LLM filtering (#6) is **planned for v1.2.0+** as optional Conduit middleware, not in frontend code. This will keep LLM API keys secure on the server. See [LLM Spam Filtering Feature Plan](../features/llm-spam-filtering.md) for architecture details.

---

## Quick Start (15 Minutes)

Get basic spam protection running in **15 minutes** with **zero cost**.

### Step 1: Add Honeypot Field (5 minutes)

**What**: Hidden form field that bots fill but humans don't.
**Effectiveness**: Blocks 90% of bots.
**Cost**: $0.

#### Frontend (React/Next.js)

```tsx
// components/ContactForm.tsx
export function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
    website: '', // Honeypot field
  });

  return (
    <form>
      <input type="text" name="name" placeholder="Name" required />
      <input type="email" name="email" placeholder="Email" required />
      <textarea name="message" placeholder="Message" required />

      {/* Honeypot: hidden from humans via CSS */}
      <input
        type="text"
        name="website"
        className="honeypot"
        value={formData.website}
        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
        autoComplete="off"
        tabIndex={-1}
        aria-hidden="true"
      />

      <button type="submit">Send</button>
    </form>
  );
}
```

**CSS** (hide honeypot):

```css
/* Make honeypot invisible */
.honeypot {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  tab-index: -1;
}
```

#### Backend (Conduit)

Send honeypot value to Conduit:

```typescript
await fetch('https://conduit.yourdomain.com/api/send', {
  method: 'POST',
  headers: {
    'X-API-Key': process.env.CONDUIT_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    channel: 'email',
    templateId: 'contact-form',
    to: 'support@company.com',
    data: {
      name: formData.name,
      email: formData.email,
      message: formData.message,
      honeypot: formData.website, // Include honeypot field
    },
  }),
});
```

**Conduit Configuration**: See [advanced-protections.md](./advanced-protections.md#2-honeypot-fields) for backend middleware.

---

### Step 2: Add Form Timing Check (5 minutes)

**What**: Reject forms filled too quickly (< 3 seconds).
**Effectiveness**: Blocks 70% of bots.
**Cost**: $0.

```tsx
export function ContactForm() {
  const [formStartTime] = useState(Date.now());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const fillDuration = Date.now() - formStartTime;

    // Reject if filled too quickly (< 3 seconds)
    if (fillDuration < 3000) {
      alert('Please take your time filling out the form.');
      return;
    }

    // Send form data including timing info
    await fetch('https://conduit.yourdomain.com/api/send', {
      method: 'POST',
      body: JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'support@company.com',
        data: {
          name: formData.name,
          email: formData.email,
          message: formData.message,
          formStartTime, // Include for server-side validation
          honeypot: formData.website,
        },
      }),
    });
  };
}
```

---

### Step 3: Add Keyword Filter (5 minutes)

**What**: Block messages containing spam keywords.
**Effectiveness**: Blocks 40% of keyword spam.
**Cost**: $0.

**Frontend** (optional client-side check):

```typescript
const SPAM_KEYWORDS = [
  'viagra',
  'cialis',
  'casino',
  'lottery',
  'prize',
  'bitcoin',
  'crypto investment',
  'make money fast',
  'click here now',
];

function containsSpamKeywords(text: string): boolean {
  const lowerText = text.toLowerCase();
  return SPAM_KEYWORDS.some((keyword) => lowerText.includes(keyword));
}

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // Check for spam keywords
  const fullText = `${formData.name} ${formData.email} ${formData.message}`;
  if (containsSpamKeywords(fullText)) {
    alert('Your message appears to contain spam. Please revise and try again.');
    return;
  }

  // Send to Conduit...
};
```

**Backend**: See [advanced-protections.md](./advanced-protections.md#6-content-filtering) for server-side implementation.

---

### Quick Start Summary

**Total Time**: 15 minutes
**Total Cost**: $0
**Spam Reduction**: 70-90% (depending on bot sophistication)

**What You've Deployed**:
- ✅ Honeypot field (blocks 90% of bots)
- ✅ Form timing check (blocks rapid-fire submissions)
- ✅ Keyword filter (blocks obvious spam)

**Next Steps**:
- Add CAPTCHA for 99% bot protection (see below)
- Configure recipient whitelisting to prevent stolen key abuse
- Set up monitoring to track spam attempts

---

## Three-Tier Protection Strategy

Choose your protection tier based on spam volume and risk tolerance.

### Tier 1: Immediate Protection (Free, 15 min)

**For**: Low-traffic sites, basic protection
**Spam Reduction**: 70-90%
**Cost**: $0/month

**Includes**:
- Honeypot fields
- Form timing checks
- Basic keyword filter

**Setup**: See [Quick Start](#quick-start-15-minutes) above.

---

### Tier 2: High Protection (Free, 1-2 hours)

**For**: Medium-traffic sites, serious spam problems
**Spam Reduction**: 95-99%
**Cost**: $0/month (with free tiers)

**Includes**:
- Everything in Tier 1, plus:
- CAPTCHA (Cloudflare Turnstile)
- Recipient whitelisting
- IP-based rate limiting
- Behavioral analysis

#### Setup: Add CAPTCHA (30 min)

**1. Get Cloudflare Turnstile Keys** (5 min):
- Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → Turnstile
- Create site (choose "Invisible" mode)
- Copy Site Key and Secret Key

**2. Frontend Integration** (10 min):

```tsx
// components/ContactForm.tsx
import { useEffect, useState } from 'react';

export function ContactForm() {
  const [turnstileToken, setTurnstileToken] = useState('');

  useEffect(() => {
    // Load Turnstile script
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!turnstileToken) {
      alert('Please complete verification');
      return;
    }

    await fetch('https://conduit.yourdomain.com/api/send', {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.NEXT_PUBLIC_CONDUIT_API_KEY,
        'Content-Type': 'application/json',
        'X-Turnstile-Token': turnstileToken, // Send CAPTCHA token
      },
      body: JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'support@company.com',
        data: { name: formData.name, email: formData.email, message: formData.message },
      }),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" name="name" placeholder="Name" required />
      <input type="email" name="email" placeholder="Email" required />
      <textarea name="message" placeholder="Message" required />

      {/* Turnstile widget (invisible, auto-renders) */}
      <div
        className="cf-turnstile"
        data-sitekey="YOUR_SITE_KEY"
        data-callback={(token: string) => setTurnstileToken(token)}
        data-theme="light"
      />

      <button type="submit" disabled={!turnstileToken}>
        Send
      </button>
    </form>
  );
}
```

**3. Backend Configuration** (15 min):

See [advanced-protections.md](./advanced-protections.md#5-captcha-integration) for Conduit middleware setup.

**Environment variables**:

```bash
CAPTCHA_ENABLED=true
TURNSTILE_SECRET_KEY=0x...
```

#### Setup: Recipient Whitelisting (15 min)

**Purpose**: Prevent stolen API keys from spamming arbitrary recipients.

**Configuration**:

```bash
# Allow only specific recipients
API_KEY_WEBSITE_RECIPIENTS=support@company.com,admin@company.com

# Allow entire domain
API_KEY_WEBSITE_RECIPIENT_DOMAINS=company.com

# Allow both
API_KEY_NEWSLETTER_RECIPIENTS=newsletter@company.com
API_KEY_NEWSLETTER_RECIPIENT_DOMAINS=company.com,subsidiary.com
```

See [recipient-whitelisting.md](../features/recipient-whitelisting.md) for complete setup guide.

---

### Tier 3: Advanced Protection (Low cost, 2-4 hours)

**For**: High-traffic sites, sophisticated attacks, enterprise security
**Spam Reduction**: 99.5%+
**Cost**: $1-5/month (depending on volume)

**Includes**:
- Everything in Tier 2, plus:
- LLM-based content filtering as Conduit middleware (planned for v1.2.0+)
- Domain-based rate limiting (planned)
- Reputation-based throttling (planned)
- Advanced behavioral analysis (planned)

> **Important**: LLM filtering is **PLANNED for v1.2.0+** as Conduit server-side middleware, NOT in frontend code. This approach will keep your LLM API keys secure and provide spam detection without exposing credentials to clients. See [LLM Spam Filtering Feature Plan](../features/llm-spam-filtering.md) for complete architecture and implementation details.

#### Setup: LLM Content Filtering (2-3 hours)

**Status**: 📋 Planned for v1.2.0 (not yet implemented)

**How it works**: Conduit analyzes message content using LLM APIs (Claude, OpenAI, or local models) as middleware, before sending emails. Frontend apps get spam protection without exposing LLM API keys.

**Configuration Preview** (when v1.2.0 is released):

**Option A: Local LLM (Ollama) - Free**

**1. Install Ollama on Conduit server** (10 min):

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Start service
ollama serve

# Pull model (3.2B parameters, ~2GB)
ollama pull llama3.2:3b
```

**2. Configure Conduit server** (15 min):

```bash
# .env - Conduit server configuration (v1.2.0+)
# LLM filtering runs as middleware BEFORE sending emails

# Enable LLM spam filtering
LLM_PROVIDER=ollama
LLM_API_KEY=  # Not needed for local Ollama
LLM_MODEL=llama3.2:3b
LLM_TIMEOUT=5000
LLM_FALLBACK_MODE=allow  # allow | block - what to do if LLM fails

# Per-API-key LLM rules
API_KEY_MYSITE_LLM_ENABLED=true
API_KEY_MYSITE_LLM_RULES=spam,abuse,profanity
API_KEY_MYSITE_LLM_THRESHOLD=0.8
API_KEY_MYSITE_LLM_MAX_CALLS_PER_DAY=1000
```

**3. Deploy with Docker Compose** (30 min):

```yaml
# docker-compose.yml
version: '3.8'

services:
  conduit:
    build: .
    ports:
      - '3000:3000'
    environment:
      - CONTENT_MODERATION_ENABLED=true
      - OLLAMA_URL=http://ollama:11434
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama:latest
    ports:
      - '11434:11434'
    volumes:
      - ollama-data:/root/.ollama
    command: >
      sh -c "ollama serve & sleep 10 && ollama pull llama3.2:3b && wait"

volumes:
  ollama-data:
```

**Option B: Anthropic Claude (Recommended) - ~$0.50-2/month**

```bash
# .env - Conduit server configuration (v1.2.0+)
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-api...  # Kept secure on Conduit server
LLM_MODEL=claude-3-haiku-20240307  # Fast, cheap, accurate
LLM_TIMEOUT=5000
LLM_FALLBACK_MODE=allow

# Per-API-key configuration
API_KEY_MYSITE_LLM_ENABLED=true
API_KEY_MYSITE_LLM_RULES=spam,abuse,profanity,promptInjection
API_KEY_MYSITE_LLM_THRESHOLD=0.7
```

**Option C: OpenAI API - ~$5/month**

```bash
# .env - Conduit server configuration (v1.2.0+)
LLM_PROVIDER=openai
LLM_API_KEY=sk-...  # Kept secure on Conduit server
LLM_MODEL=gpt-4o-mini
LLM_TIMEOUT=5000
```

> **No frontend changes needed**: Conduit handles LLM analysis transparently. Frontend apps send the same requests as before, Conduit analyzes content before forwarding to email provider.

**Complete Feature Documentation**: See [LLM Spam Filtering Feature Plan](../features/llm-spam-filtering.md) for full architecture, API design, security considerations, and phased implementation details.

---

## Common Use Cases

### Use Case 1: Contact Form (Basic Protection)

**Scenario**: Simple contact form on website, < 100 submissions/day

**Recommended Tier**: Tier 1 (Immediate Protection)

**Configuration**:

```tsx
// Frontend
<form>
  <input name="name" required />
  <input name="email" required />
  <textarea name="message" required />

  {/* Honeypot */}
  <input name="website" className="honeypot" autoComplete="off" tabIndex={-1} />

  <button>Send</button>
</form>
```

```bash
# Backend (.env)
# No additional configuration needed, uses default rate limits:
# - 10 requests/minute per API key
# - 100 requests/hour per API key
# - 500 requests/day per API key
```

**Cost**: $0/month
**Setup Time**: 15 minutes
**Spam Reduction**: 70-90%

---

### Use Case 2: Support Form (High Traffic)

**Scenario**: Support form with 500+ submissions/day, needs 99% spam protection

**Recommended Tier**: Tier 2 (High Protection)

**Configuration**:

```tsx
// Frontend (with CAPTCHA)
<form>
  <input name="name" required />
  <input name="email" required />
  <textarea name="message" required />

  {/* Honeypot */}
  <input name="website" className="honeypot" autoComplete="off" tabIndex={-1} />

  {/* Turnstile CAPTCHA */}
  <div className="cf-turnstile" data-sitekey="YOUR_SITE_KEY" />

  <button>Send</button>
</form>
```

```bash
# Backend (.env)
CAPTCHA_ENABLED=true
TURNSTILE_SECRET_KEY=0x...

# Recipient whitelisting (support team only)
API_KEY_SUPPORT_RECIPIENTS=support@company.com,team@company.com
API_KEY_SUPPORT_RECIPIENT_DOMAINS=company.com

# Increased rate limits for support
RATE_LIMIT_PER_MINUTE=20
RATE_LIMIT_PER_HOUR=200
RATE_LIMIT_PER_DAY=1000
```

**Cost**: $0/month (Turnstile free for 1M requests)
**Setup Time**: 1-2 hours
**Spam Reduction**: 95-99%

---

### Use Case 3: Newsletter Signup (Multi-Domain)

**Scenario**: Newsletter signup across multiple domains, needs to prevent abuse

**Recommended Tier**: Tier 2 + Recipient Whitelisting

**Configuration**:

```bash
# Backend (.env)
# Allow newsletter service email only
API_KEY_NEWSLETTER_RECIPIENTS=newsletter@company.com

# Allow multiple company domains
API_KEY_NEWSLETTER_RECIPIENT_DOMAINS=company.com,subsidiary.com

# Strict rate limits (prevent abuse)
RATE_LIMIT_PER_MINUTE=5
RATE_LIMIT_PER_HOUR=50
RATE_LIMIT_PER_DAY=200
```

**Cost**: $0/month
**Setup Time**: 30 minutes
**Protection**: Stolen keys can't send to external addresses

---

### Use Case 4: E-commerce Order Notifications

**Scenario**: High-value order confirmations, needs maximum security

**Recommended Tier**: Tier 3 (Advanced Protection)

**Configuration**:

```bash
# Backend (.env)
# LLM content filtering (detect phishing attempts)
CONTENT_MODERATION_ENABLED=true
CONTENT_MODERATION_THRESHOLD=0.9  # Very strict
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b

# Strict recipient whitelisting (customers only)
API_KEY_ECOMMERCE_RECIPIENT_DOMAINS=customerdomain.com

# Behavioral analysis (prevent rapid-fire abuse)
# (Enabled by default in Tier 3)

# High rate limits (legitimate e-commerce traffic)
RATE_LIMIT_PER_MINUTE=50
RATE_LIMIT_PER_HOUR=500
RATE_LIMIT_PER_DAY=5000
```

**Cost**: $0/month (local LLM)
**Setup Time**: 2-4 hours
**Spam Reduction**: 99.5%+

---

### Use Case 5: Multi-Tenant SaaS

**Scenario**: Multiple customers sharing Conduit instance, each needs isolation

**Recommended Tier**: Tier 2 + Per-Customer API Keys

**Configuration**:

```bash
# Backend (.env)
# Customer 1 (startup)
API_KEY_CUSTOMER1=KEY_CUSTOMER1_abc123
API_KEY_CUSTOMER1_RECIPIENTS=support@customer1.com
API_KEY_CUSTOMER1_RECIPIENT_DOMAINS=customer1.com

# Customer 2 (enterprise)
API_KEY_CUSTOMER2=KEY_CUSTOMER2_def456
API_KEY_CUSTOMER2_RECIPIENTS=admin@customer2.com,support@customer2.com
API_KEY_CUSTOMER2_RECIPIENT_DOMAINS=customer2.com,subsidiary.customer2.com

# Per-customer rate limits
RATE_LIMIT_PER_MINUTE=10  # Default for all customers
RATE_LIMIT_PER_HOUR=100
RATE_LIMIT_PER_DAY=500
```

**Cost**: $0/month
**Setup Time**: 15 minutes per customer
**Protection**: Complete customer isolation, per-customer rate limits

---

## Configuration Templates

### Template 1: Maximum Security (Zero Trust)

```bash
# .env - Maximum security configuration

# CAPTCHA (required for all submissions)
CAPTCHA_ENABLED=true
TURNSTILE_SECRET_KEY=0x...

# Content moderation (LLM filtering)
CONTENT_MODERATION_ENABLED=true
CONTENT_MODERATION_THRESHOLD=0.7  # Lower threshold = stricter
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b

# Recipient whitelisting (REQUIRED)
API_KEY_MAIN_RECIPIENTS=admin@company.com
API_KEY_MAIN_RECIPIENT_DOMAINS=company.com

# Strict rate limits
RATE_LIMIT_PER_MINUTE=5
RATE_LIMIT_PER_HOUR=30
RATE_LIMIT_PER_DAY=100

# Security headers
ENFORCE_HTTPS=true

# Revoked keys (if API key compromised)
REVOKED_KEYS=KEY_OLD_abc123,KEY_LEAKED_def456
```

---

### Template 2: Balanced (Recommended)

```bash
# .env - Balanced security and usability

# CAPTCHA (enabled)
CAPTCHA_ENABLED=true
TURNSTILE_SECRET_KEY=0x...

# Recipient whitelisting (recommended)
API_KEY_WEBSITE_RECIPIENTS=support@company.com,sales@company.com
API_KEY_WEBSITE_RECIPIENT_DOMAINS=company.com

# Standard rate limits
RATE_LIMIT_PER_MINUTE=10
RATE_LIMIT_PER_HOUR=100
RATE_LIMIT_PER_DAY=500

# Security headers
ENFORCE_HTTPS=true
```

---

### Template 3: Development (Minimal Protection)

```bash
# .env - Development environment only

# No CAPTCHA (for testing)
CAPTCHA_ENABLED=false

# No recipient whitelisting (allow any email)
# (Omit API_KEY_*_RECIPIENTS variables)

# Generous rate limits (for testing)
RATE_LIMIT_PER_MINUTE=100
RATE_LIMIT_PER_HOUR=1000
RATE_LIMIT_PER_DAY=10000

# Disable HTTPS enforcement (localhost)
ENFORCE_HTTPS=false

# Low log level for debugging
LOG_LEVEL=debug
```

**⚠️ WARNING**: Never use this configuration in production!

---

## Monitoring and Alerts

### Metrics to Track

**1. Spam Detection Rate**:
```
spam_detected_total / total_requests
```

**Target**: < 1% (if spam rate > 5%, protection is insufficient)

**2. CAPTCHA Pass Rate**:
```
captcha_passed / captcha_attempts
```

**Target**: > 90% (if < 90%, CAPTCHA may be too strict)

**3. Honeypot Trigger Rate**:
```
honeypot_triggered / total_requests
```

**Expected**: 5-10% for bot-heavy traffic

**4. Rate Limit Hit Rate**:
```
rate_limit_exceeded / total_requests
```

**Expected**: < 0.1% (if > 1%, may need higher limits)

### Logging Setup

**Conduit** logs structured JSON by default. Example log entries:

```json
// Successful request
{
  "level": "info",
  "timestamp": "2025-10-14T12:34:56.789Z",
  "message": "Message sent successfully",
  "apiKey": "KEY_WEBSITE_***",
  "channel": "email",
  "templateId": "contact-form",
  "recipient": "support@company.com",
  "captchaVerified": true,
  "moderationScore": 0.15,
  "processingTimeMs": 245
}

// Spam detected
{
  "level": "warn",
  "timestamp": "2025-10-14T12:35:01.234Z",
  "message": "Spam detected via content moderation",
  "apiKey": "KEY_WEBSITE_***",
  "templateId": "contact-form",
  "moderationResult": {
    "isSpam": true,
    "confidence": 0.92,
    "reason": "Spam keywords detected: viagra, casino",
    "categories": ["spam", "keyword-match"]
  }
}

// Honeypot triggered
{
  "level": "warn",
  "timestamp": "2025-10-14T12:35:15.567Z",
  "message": "Honeypot triggered - bot detected",
  "apiKey": "KEY_WEBSITE_***",
  "templateId": "contact-form",
  "honeypotField": "website",
  "ip": "203.0.113.45",
  "userAgent": "Mozilla/5.0 (compatible; Bot/1.0)"
}

// Rate limit exceeded
{
  "level": "warn",
  "timestamp": "2025-10-14T12:35:30.890Z",
  "message": "Rate limit exceeded",
  "apiKey": "KEY_WEBSITE_***",
  "limit": "per_minute",
  "retryAfter": 45
}
```

### Alert Rules

**Critical Alerts** (immediate action):

```yaml
# Sudden spike in spam (> 10 spam attempts in 5 minutes)
- alert: SpamSpike
  expr: rate(spam_detected_total[5m]) > 10
  severity: critical
  annotations:
    summary: 'Spam spike detected ({{ $value }}/min)'
    action: 'Check logs, consider enabling stricter protections'

# API key compromised (> 50 requests/min from single key)
- alert: ApiKeyAbuse
  expr: rate(requests_per_key[1m]) > 50
  severity: critical
  annotations:
    summary: 'API key {{ $labels.api_key }} exceeding normal usage'
    action: 'Investigate and potentially revoke key'

# Service down (no requests in 10 minutes during business hours)
- alert: ConduitDown
  expr: rate(total_requests[10m]) == 0 AND hour() >= 9 AND hour() <= 17
  severity: critical
  annotations:
    summary: 'Conduit appears to be down'
    action: 'Check service health and logs'
```

**Warning Alerts** (investigate):

```yaml
# High CAPTCHA failure rate (> 20%)
- alert: HighCaptchaFailureRate
  expr: rate(captcha_failed[5m]) / rate(captcha_attempts[5m]) > 0.2
  severity: warning
  annotations:
    summary: 'CAPTCHA failure rate: {{ $value }}%'
    action: 'Check if CAPTCHA is too strict or bot attack in progress'

# Elevated spam rate (> 5%)
- alert: ElevatedSpamRate
  expr: rate(spam_detected[1h]) / rate(total_requests[1h]) > 0.05
  severity: warning
  annotations:
    summary: 'Spam rate: {{ $value }}%'
    action: 'Consider enabling additional protections'
```

### Simple Alert Script (No External Tools)

**File**: `scripts/monitor.sh`

```bash
#!/bin/bash

# Simple monitoring script for Conduit logs
# Run with: ./scripts/monitor.sh

LOG_FILE="/var/log/conduit/conduit.log"
ALERT_EMAIL="admin@company.com"
CHECK_INTERVAL=300  # 5 minutes

while true; do
  # Count spam attempts in last 5 minutes
  SPAM_COUNT=$(grep -c '"message":"Spam detected"' "$LOG_FILE" | tail -n 500)

  if [ "$SPAM_COUNT" -gt 10 ]; then
    echo "ALERT: Spam spike detected ($SPAM_COUNT attempts in 5 min)" | \
      mail -s "[Conduit] Spam Spike Alert" "$ALERT_EMAIL"
  fi

  # Count rate limit hits
  RATE_LIMIT_COUNT=$(grep -c '"message":"Rate limit exceeded"' "$LOG_FILE" | tail -n 500)

  if [ "$RATE_LIMIT_COUNT" -gt 20 ]; then
    echo "ALERT: Excessive rate limiting ($RATE_LIMIT_COUNT hits in 5 min)" | \
      mail -s "[Conduit] Rate Limit Alert" "$ALERT_EMAIL"
  fi

  sleep "$CHECK_INTERVAL"
done
```

---

## Incident Response

### Scenario 1: Sudden Spam Spike

**Symptoms**:
- Inbox flooded with spam messages
- Logs show high "spam detected" rate
- CAPTCHA pass rate normal (spammers bypassing CAPTCHA)

**Response**:

1. **Immediate** (< 5 min):
   ```bash
   # Enable stricter content moderation threshold
   CONTENT_MODERATION_THRESHOLD=0.6  # Was 0.8

   # Restart Conduit to apply changes
   docker restart conduit
   ```

2. **Short-term** (< 30 min):
   ```bash
   # Enable LLM filtering if not already active
   CONTENT_MODERATION_ENABLED=true
   OLLAMA_URL=http://localhost:11434

   # Reduce rate limits temporarily
   RATE_LIMIT_PER_MINUTE=5  # Was 10
   RATE_LIMIT_PER_HOUR=30   # Was 100
   ```

3. **Long-term** (< 1 day):
   - Review logs to identify attack patterns
   - Update keyword blacklist with new spam terms
   - Consider enabling IP-based rate limiting
   - If attack continues, enable domain-based rate limiting

---

### Scenario 2: API Key Compromised

**Symptoms**:
- Logs show unusual traffic from specific API key
- Requests to unexpected recipients
- Rate limit frequently exceeded

**Response**:

1. **Immediate** (< 1 min):
   ```bash
   # Revoke compromised key
   REVOKED_KEYS=KEY_LEAKED_abc123

   # Restart Conduit
   docker restart conduit
   ```

2. **Short-term** (< 10 min):
   ```bash
   # Generate new API key
   npm run generate-key -- WEBSITE

   # Update frontend to use new key
   NEXT_PUBLIC_CONDUIT_API_KEY=KEY_WEBSITE_xyz789

   # Enable recipient whitelisting (if not already)
   API_KEY_WEBSITE_RECIPIENTS=support@company.com
   API_KEY_WEBSITE_RECIPIENT_DOMAINS=company.com
   ```

3. **Long-term** (< 1 day):
   - Investigate how key was leaked (logs, source control, client-side exposure)
   - Rotate all API keys as precaution
   - Implement key rotation policy (every 90 days)
   - Review security practices with team

---

### Scenario 3: Resend API Quota Exceeded

**Symptoms**:
- Resend returns 429 (Too Many Requests)
- Conduit logs show "Provider error: rate limit"
- Legitimate users can't send messages

**Response**:

1. **Immediate** (< 1 min):
   ```bash
   # Check Resend dashboard for quota usage
   # If quota genuinely exceeded, contact Resend support

   # Temporarily reduce Conduit rate limits
   RATE_LIMIT_PER_HOUR=50   # Was 100
   RATE_LIMIT_PER_DAY=200   # Was 500
   ```

2. **Short-term** (< 1 hour):
   ```bash
   # If quota exceeded due to spam, enable stricter protections
   CAPTCHA_ENABLED=true
   CONTENT_MODERATION_ENABLED=true
   CONTENT_MODERATION_THRESHOLD=0.7

   # Review logs for spam patterns
   grep '"isSpam":true' /var/log/conduit/conduit.log | tail -n 100
   ```

3. **Long-term** (< 1 day):
   - Upgrade Resend plan if legitimate traffic
   - Implement cost monitoring/alerts (see below)
   - Consider implementing circuit breaker for provider API

---

### Scenario 4: CAPTCHA Failure Spike

**Symptoms**:
- High CAPTCHA failure rate (> 20%)
- Legitimate users complaining about CAPTCHA difficulty
- No corresponding spam spike

**Response**:

1. **Immediate** (< 5 min):
   ```bash
   # Check Turnstile dashboard for issues
   # If Cloudflare having problems, temporarily disable CAPTCHA
   CAPTCHA_ENABLED=false

   # Enable alternative protections
   # (Honeypot, behavioral analysis should still be active)

   # Restart Conduit
   docker restart conduit
   ```

2. **Short-term** (< 30 min):
   - Check Cloudflare status page
   - Review CAPTCHA configuration (invisible vs managed mode)
   - Test CAPTCHA from different browsers/locations

3. **Long-term** (< 1 day):
   - Consider switching to managed mode if invisible mode too strict
   - Implement CAPTCHA bypass for trusted users (optional)
   - Set up Cloudflare alerts for Turnstile issues

---

## Cost-Benefit Analysis

### Protection Tier Comparison

| Tier | Setup Time | Monthly Cost | Spam Reduction | Maintenance | Best For |
|------|------------|--------------|----------------|-------------|----------|
| **Tier 1** (Immediate) | 15 min | $0 | 70-90% | None | Low-traffic sites |
| **Tier 2** (High) | 1-2 hours | $0 | 95-99% | Low | Most sites |
| **Tier 3** (Advanced) | 2-4 hours | $0-5 | 99.5%+ | Medium | High-value traffic |

### Cost Breakdown (1,000 messages/day)

**Tier 1** (Free):
- Honeypot: $0
- Form timing: $0
- Keyword filter: $0
- **Total**: $0/month

**Tier 2** (Free):
- Everything in Tier 1: $0
- CAPTCHA (Turnstile): $0 (1M free/month)
- Recipient whitelisting: $0
- IP rate limiting: $0
- **Total**: $0/month

**Tier 3** (Low Cost):
- Everything in Tier 2: $0
- Local LLM (Ollama): $0 (requires 4GB RAM)
- **OR** OpenAI API: ~$4.50/month (30k messages)
- Domain rate limiting: $0
- Reputation throttling: $0
- **Total**: $0-5/month

### Hidden Costs

**Time Costs**:
- False positive investigation: ~1 hour/week (if LLM threshold too strict)
- API key rotation: ~10 min/quarter
- Monitoring setup: 1-2 hours (one-time)

**Infrastructure Costs**:
- Local LLM (Ollama): Requires 4-8GB RAM (~$10-20/month on cloud VPS)
- Redis (optional, for distributed rate limiting): ~$5-10/month

**Total Cost of Ownership** (monthly):
- Tier 1: $0
- Tier 2: $0
- Tier 3: $0-20 (depending on LLM choice and infrastructure)

### ROI Calculation

**Scenario**: Contact form receiving 100 spam messages/day without protection.

**Cost of spam without protection**:
- Manual spam deletion: 10 min/day = ~$100/month (at $20/hour)
- False leads to sales team: ~$200/month (wasted time)
- Resend costs for spam: ~$5/month (100 emails/day × 30 days × $0.001/email)
- **Total**: ~$305/month

**Cost of Tier 2 protection**:
- Setup time: 2 hours × $50/hour = $100 (one-time)
- Monthly cost: $0
- Maintenance: 30 min/month × $50/hour = $25/month
- **Total**: $25/month (after initial setup)

**Savings**: $305 - $25 = **$280/month** (~90% cost reduction)

**Payback period**: 0.4 months (setup cost recovered in 12 days)

---

## FAQ

### Q: Which protection tier should I choose?

**A**: Start with **Tier 1** (15 minutes, free). If spam persists, upgrade to **Tier 2** (1-2 hours, still free). Only go to **Tier 3** if you have sophisticated attacks or high-value traffic.

### Q: Do I need LLM filtering?

**A**: No, for most use cases. **90-99% of spam** is blocked by Tier 1-2 protections (honeypot + CAPTCHA + recipient whitelisting). LLM filtering is only needed if you're facing sophisticated semantic spam that bypasses keyword filters.

LLM filtering is an **optional Conduit feature** (v1.2.0+) that runs server-side. Unlike other protections, you don't need to implement anything in your frontend - just enable it via Conduit environment variables.

### Q: How much does LLM filtering cost?

**A** (when v1.2.0 is released):
- **Local (Ollama)**: $0/month (requires 4-8GB RAM on Conduit server)
- **Anthropic Claude Haiku**: ~$0.0005 per message (~$15 for 30k messages/month)
- **OpenAI GPT-4o-mini**: ~$0.15 per 1000 messages (~$4.50 for 30k messages/month)

For 1,000 messages/day (30k/month), expect $0-15/month depending on provider.

**Key advantage**: LLM API keys stay secure on your Conduit server. Frontend apps get spam detection without exposing credentials.

### Q: Will CAPTCHA annoy my users?

**A**: Not with **Cloudflare Turnstile** (invisible mode). It works silently in the background for 95%+ of users. Only suspicious traffic sees an interactive challenge.

### Q: How do I test honeypot without triggering it?

**A**: Honeypot is checked server-side. For testing:

```bash
# Disable honeypot check temporarily
# (Comment out middleware in src/index.ts)
# app.use('/api/send', checkHoneypot);

# Or send empty honeypot field
data: {
  name: "Test User",
  email: "test@example.com",
  message: "Test message",
  honeypot: ""  // Empty = not filled = legitimate
}
```

### Q: What if a legitimate user is rate limited?

**A**: Conduit returns HTTP 429 with `retryAfter` seconds. Frontend should:

```typescript
const response = await fetch('/api/send', { ... });

if (response.status === 429) {
  const data = await response.json();
  alert(`Please wait ${data.retryAfter} seconds before trying again.`);
}
```

Consider increasing rate limits if legitimate users frequently hit limits.

### Q: How do I monitor spam detection rate?

**A**: Check Conduit logs:

```bash
# Count spam attempts in last hour
grep '"isSpam":true' /var/log/conduit/conduit.log | grep $(date -u -d '1 hour ago' +%Y-%m-%dT%H) | wc -l

# Count total requests in last hour
grep '"message":"Message sent successfully"' /var/log/conduit/conduit.log | grep $(date -u -d '1 hour ago' +%Y-%m-%dT%H) | wc -l

# Calculate spam rate
echo "scale=2; $SPAM_COUNT / $TOTAL_REQUESTS * 100" | bc
```

### Q: Can I use multiple protection layers?

**A**: Yes! **Defense-in-depth** is recommended. Stack protections for maximum effectiveness:

```
Client → [Honeypot] → [CAPTCHA] → [Behavioral] → [Content Filter] → [LLM] → Send
```

Each layer catches different types of abuse.

### Q: What's the difference between recipient whitelisting and rate limiting?

**A**:
- **Recipient whitelisting**: Controls *who* can receive emails (prevents stolen keys from spamming arbitrary recipients)
- **Rate limiting**: Controls *how many* emails can be sent (prevents abuse regardless of recipient)

Both are complementary and should be used together.

### Q: How often should I rotate API keys?

**A**: Recommended schedule:
- **Every 90 days**: Routine rotation
- **Immediately**: If key potentially compromised
- **After staff departure**: If employee with access leaves

### Q: Can I use Conduit without CAPTCHA?

**A**: Yes. CAPTCHA is optional. For low-traffic sites, **honeypot + form timing + keyword filter** (Tier 1) provides 70-90% spam protection with zero user friction.

### Q: What if LLM marks legitimate messages as spam?

**A**: This is a **false positive**. Options:

1. **Lower threshold**:
   ```bash
   CONTENT_MODERATION_THRESHOLD=0.9  # More lenient (was 0.8)
   ```

2. **Review logs** to understand why LLM flagged it:
   ```json
   {
     "moderationResult": {
       "isSpam": true,
       "confidence": 0.85,
       "reason": "Contains promotional language",
       "categories": ["promotional"]
     }
   }
   ```

3. **Whitelist specific templates**:
   ```typescript
   // Skip moderation for certain templates
   if (body.templateId === 'newsletter') {
     await next();
     return;
   }
   ```

### Q: How do I handle multi-language spam?

**A**: LLM filtering works across languages automatically. Local keyword filters should be updated:

```typescript
const SPAM_KEYWORDS = [
  // English
  'viagra', 'casino', 'lottery',
  // Spanish
  'viagra', 'casino', 'lotería',
  // French
  'viagra', 'casino', 'loterie',
  // ... add more languages as needed
];
```

### Q: What's the performance impact of LLM filtering?

**A**:
- **Local LLM (Ollama)**: ~500ms average latency
- **OpenAI API**: ~200ms average latency
- **Keyword pre-filter**: < 5ms

Total request time: ~250-600ms (still under 1 second target).

### Q: Can I see what spam was blocked?

**A**: Yes, check Conduit logs:

```bash
# View all blocked spam in last 24 hours
grep '"isSpam":true' /var/log/conduit/conduit.log | grep $(date -u +%Y-%m-%d)

# View with reasons
grep '"isSpam":true' /var/log/conduit/conduit.log | jq '.moderationResult.reason'
```

---

## Summary

**Quick Recommendations**:

✅ **Start here** (everyone):
- Tier 1: Honeypot + form timing + keyword filter (15 min, $0)
- Recipient whitelisting (prevents stolen key abuse)

✅ **If spam persists**:
- Tier 2: Add CAPTCHA + IP rate limiting (1-2 hours, $0)

✅ **For high-security needs**:
- Tier 3: Add LLM filtering (2-4 hours, $0-5/month)

**Cost Summary**:
- Tier 1: $0/month (70-90% spam reduction)
- Tier 2: $0/month (95-99% spam reduction)
- Tier 3: $0-5/month (99.5%+ spam reduction)

**Next Steps**:
1. Implement Quick Start (15 minutes)
2. Set up monitoring (1 hour)
3. Test protections with sample spam
4. Upgrade to Tier 2 if needed

**Additional Resources**:
- [Advanced Protections](./advanced-protections.md) - Complete implementation details
- [Recipient Whitelisting](../features/recipient-whitelisting.md) - Prevent stolen key abuse
- [Security Implementation](./implementation.md) - Phase 1 security features

**Need Help?**
- Review logs: `grep '"level":"warn"' /var/log/conduit/conduit.log`
- Test CAPTCHA: https://developers.cloudflare.com/turnstile/troubleshooting/
- Contact support: support@eldtech.com
