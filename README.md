# Conduit

**A lightweight, secure multi-channel communication proxy for sending emails, SMS, push notifications, and webhooks from frontend applications without exposing API keys.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Production Ready](https://img.shields.io/badge/Status-Production%20Ready-brightgreen.svg)]()
[![Version: 1.3.1](https://img.shields.io/badge/Version-1.3.1-blue.svg)]()
[![Security Scan](https://github.com/eldtechnologies/conduit/actions/workflows/security.yml/badge.svg)](https://github.com/eldtechnologies/conduit/actions/workflows/security.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 🤖 AI-Powered Development Experiment

> **Note**: This project is an experiment in Agentic AI Development using [Claude Code](https://claude.com/claude-code). The entire codebase was built by Claude Code (Sonnet 4.5) with only instruction and orchestration by a human developer. The goal is to showcase not only a functional service, but exceptional code quality, security, and documentation.
>
> **Total development time**: 5 hours
> **Built with**: Claude Code 2.0 + Claude Sonnet 4.5
>
> 📖 **[Read the full story](docs/conduit-ai-article.md)** - "When Claude Code Built Production Software in 5 Hours (And Why I Still Had to Save It)"

---

## Why Conduit?

Frontend applications often need to send emails, SMS, or push notifications, but **exposing provider API keys in client-side code is dangerous**. Conduit solves this by providing a secure backend proxy that:

- ✅ **Keeps API keys secure** - Provider credentials stay on the backend, never exposed to clients
- ✅ **Provides one unified API** - Send email, SMS, push, and webhooks through a single endpoint
- ✅ **Prevents abuse** - Built-in rate limiting and CORS protection
- ✅ **Scales effortlessly** - Share one Conduit instance across multiple frontend apps
- ✅ **Stays lightweight** - Built with Hono, minimal dependencies, fast startup

---

## Quick Example

```typescript
// Frontend (React, Vue, etc.)
const response = await fetch('https://conduit.yourdomain.com/api/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'KEY_MYSITE_...',  // Safe to expose (rate-limited, CORS-protected)
  },
  body: JSON.stringify({
    channel: 'email',
    templateId: 'contact-form',
    to: 'hello@yourcompany.com',
    data: {
      name: 'John Doe',
      email: 'john@example.com',
      message: 'I have a question...'
    }
  })
});
```

**That's it!** Conduit handles:
- 🔒 Secure communication with providers (Resend, Twilio, Firebase)
- 🛡️ Authentication, CORS, and rate limiting
- 📝 Template rendering and validation
- 📊 Structured logging

---

## Features

### Today: Email (production-ready) ✅
- **Email delivery** via [Resend.com](https://resend.com) with a comprehensive domain setup guide
- **🤖 AI-powered spam filtering** (optional) — block spam, abuse, phishing, and prompt-injection attacks
  - Anthropic Claude and OpenAI GPT support
  - Configurable per API key with custom rules and thresholds
  - Fail-open / fail-closed modes for reliability
  - Budget limits to control LLM costs (~$0.0005 per message)
  - Sender whitelisting to skip trusted emails
  - See the [LLM Spam Filtering Guide](docs/features/llm-spam-filtering.md)
- **Contact form template** with XSS sanitization and header-injection prevention
- **API key authentication** with constant-time comparison (timing-attack resistant)
- **Rate limiting** (10/min, 100/hr, 500/day per key) — token-bucket algorithm
- **CORS protection** with strict origin whitelisting + `X-Source-Origin` for proxies/gateways
- **Recipient whitelisting** — prevent stolen API keys from spamming arbitrary recipients
- **Security hardening**:
  - HTTPS enforcement with HSTS
  - Request body size limits (50KB)
  - Security headers (CSP, X-Frame-Options, etc.)
  - Input validation with Zod schemas
  - XSS sanitization with DOMPurify
- **Structured JSON logging** with request/response tracking
- **Health monitoring** — public `/health` endpoint + authenticated `/health/detailed`
- **263 tests** across unit, integration, and security suites

### Where Conduit could go next 🌱

These are directions the architecture supports — not commitments. Channel scaffolding, routing, templating, and per-key configuration are all designed to extend beyond email.

- **More channels:** SMS (Twilio), push (Firebase Cloud Messaging), WhatsApp Business, generic HTTP webhooks, Slack and Discord integrations
- **Operational features:** delivery tracking, retry policies, dead-letter queues, scheduled sending
- **Insight & UX:** analytics dashboard, visual template builder, A/B testing
- **Auth & multi-tenancy:** scoped API keys, key revocation/rotation, audit logs

Have a use case you'd like to see? Open a [discussion](https://github.com/eldtechnologies/conduit/discussions) or [issue](https://github.com/eldtechnologies/conduit/issues).

---

## Getting Started

### 1. Deploy Conduit

**Option A: Coolify (Recommended)**
```bash
1. Create new service in Coolify
2. Connect your Git repository
3. Add environment variables (RESEND_API_KEY, API_KEY_*, ALLOWED_ORIGINS)
4. Deploy
5. Set custom domain: conduit.yourdomain.com
```

**Option B: Docker**
```bash
git clone https://github.com/eldtechnologies/conduit.git
cd conduit
docker build -t conduit .
docker run -p 3000:3000 --env-file .env conduit
```

### 2. Generate API Keys

```bash
# Secure generation with crypto.randomBytes
node -e "console.log('KEY_MYSITE_' + require('crypto').randomBytes(16).toString('hex'))"
```

### 3. Integrate with Your Frontend

See **[Getting Started Guide](docs/getting-started.md)** for complete integration examples.

### 4. Production Deployment Checklist

Before deploying to production, complete these steps:

**Email Setup (Resend):**
- [ ] **Verify email domain** on Resend ([guide](https://resend.com/domains))
  - ✅ Use a subdomain (e.g., `mail.yourdomain.com`) to protect your main domain reputation
  - Add DNS records (SPF, DKIM)
  - Wait for verification (5-30 minutes)
- [ ] **Update frontend** to use verified domain in `from.email` field
- [ ] **Test email delivery** with verified domain

**Security & Configuration:**
- [ ] **Set environment variables**
  - `RESEND_API_KEY` - Your Resend API key
  - `API_KEY_*` - One per frontend app (generate with crypto.randomBytes)
  - `ALLOWED_ORIGINS` - Whitelist your frontend domains
- [ ] **Configure CORS** - Add all production domains to `ALLOWED_ORIGINS`
- [ ] **Review rate limits** - Adjust `RATE_LIMIT_*` if needed (default: 10/min, 100/hr, 500/day)
- [ ] **Enable HTTPS** - Ensure `x-forwarded-proto` header is set by your proxy/load balancer

**Testing:**
- [ ] **Test API endpoint** - `curl https://conduit.yourdomain.com/health`
- [ ] **Verify CORS** - Test requests from your frontend domain
- [ ] **Test email sending** - Send test email with verified domain
- [ ] **Check rate limits** - Verify rate limiting works as expected

**Monitoring:**
- [ ] **Set up logging** - Review structured JSON logs
- [ ] **Monitor health endpoint** - `/health` for basic status, `/health/detailed` for diagnostics
- [ ] **Track error rates** - Watch for provider errors (domain verification, rate limits)

**Spam Prevention (Optional but Recommended):**
- [ ] **Enable recipient whitelisting** - Prevent stolen keys from spamming arbitrary recipients
  - Set `API_KEY_*_RECIPIENTS` or `API_KEY_*_RECIPIENT_DOMAINS` environment variables
  - See **[Recipient Whitelisting Guide](docs/features/recipient-whitelisting.md)**
- [ ] **Add honeypot fields** to forms (90% bot reduction, 15 minutes)
- [ ] **Configure CAPTCHA** if needed (Cloudflare Turnstile free tier)
- [ ] See **[Spam Prevention Guide](docs/security/spam-prevention.md)** for complete setup

---

## Documentation

📚 **[Documentation Hub](docs/README.md)** - Start here for all documentation

### Quick Links

- **[Getting Started](docs/getting-started.md)** - Deploy and integrate in 5 minutes
- **[User Guide](docs/user-guide.md)** - Complete integration guide for frontend developers
- **[API Reference](docs/api-reference.md)** - Full API specification
- **[Architecture](docs/architecture.md)** - System design and technical architecture
- **[Security](docs/security/)** - Security analysis, checklist, and implementation guide
- **[Spam Prevention](docs/security/spam-prevention.md)** - Protect against bots and abuse (15-min setup)
- **[Recipient Whitelisting](docs/features/recipient-whitelisting.md)** - Prevent stolen key abuse

---

## Architecture

```
Frontend Apps → HTTPS → [CORS] → [Auth] → [Recipient Validation] → [Rate Limit] → [Logger]
                                      ↓
                           Channel Router → Template Validator
                                      ↓
                 [Email|SMS|Push|Webhook] Handler → Provider API
```

**Key Components**:
- **Hono**: Ultra-lightweight web framework (~12KB)
- **TypeScript**: Type-safe development
- **Zod**: Runtime validation
- **Docker**: Containerized deployment
- **Providers**: Resend (email), Twilio (SMS), Firebase (push)

See **[Architecture Documentation](docs/architecture.md)** for detailed diagrams and flows.

---

## Security

🔒 **Security is a top priority.** Conduit implements defense-in-depth with multiple security layers:

- ✅ HTTPS/TLS enforcement with HSTS
- ✅ Constant-time API key comparison (prevents timing attacks)
- ✅ XSS sanitization for email templates
- ✅ Request size limits (50KB max)
- ✅ Comprehensive security headers
- ✅ Rate limiting per API key across all channels
- ✅ CORS protection with strict origin whitelisting
- ✅ PII masking in logs (GDPR compliant)
- ✅ Recipient whitelisting (prevents stolen key abuse)
- 🛡️ Spam prevention with multi-tier protection (honeypot, CAPTCHA, LLM filtering)
- 🤖 **Automated Security**:
  - Daily vulnerability scanning (npm audit + OSV Scanner)
  - Automated dependency updates via Dependabot
  - Immediate security patches (auto-PR within hours of CVE disclosure)
  - GitHub Security Advisories enabled
  - Zero known vulnerabilities policy

**[→ Security Documentation](docs/security/)**
**[→ Spam Prevention Guide](docs/security/spam-prevention.md)** - Quick 15-minute setup

---

## Project Status

**Current version**: v1.3.1 — production-ready

### What's in the box
- **Email pipeline**: POST `/api/send`, Resend integration, contact-form template, Zod-validated request bodies, header-injection prevention.
- **Security hardening**: HTTPS + HSTS, constant-time API key comparison, CORS allowlist with proxy support (`X-Source-Origin`), token-bucket rate limiting, 50KB request size limit, security headers (CSP, X-Frame-Options, etc.), XSS sanitization on user content.
- **Spam prevention**: optional LLM filtering (Anthropic / OpenAI), recipient whitelisting, sender whitelisting, multi-tier defense guidance.
- **Operations**: structured JSON logs with PII masking, public `/health` + authenticated `/health/detailed`, graceful shutdown, Docker image with health checks.
- **Quality bar**: 263 tests (unit, integration, security), TypeScript strict mode (`noUncheckedIndexedAccess`), ESLint + Prettier, zero `npm audit` / OSV findings.

For a full version history, see [CHANGELOG.md](CHANGELOG.md).

---

## Use Cases

### Contact Forms
Securely send contact form submissions to your email without exposing SMTP credentials.

### Transactional Emails
Password resets, welcome emails, notifications - all from your frontend app.

### Verification Codes (planned)
Send SMS verification codes for 2FA without exposing Twilio credentials.

### Push Notifications (planned)
Send mobile push notifications without embedding Firebase keys in your app.

### Slack / Discord Notifications (planned)
Trigger webhooks for team notifications from your frontend.

---

## Contributing

Conduit is open source and welcomes contributions!

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Setup

```bash
# Clone the repository
git clone https://github.com/eldtechnologies/conduit.git
cd conduit

# Install dependencies (once implemented)
npm install

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

See **[CLAUDE.md](CLAUDE.md)** for detailed development guidance.

---

## Tech Stack

- **Runtime**: Node.js 20.19+
- **Framework**: [Hono](https://hono.dev/) (ultra-lightweight, edge-compatible)
- **Language**: TypeScript
- **Validation**: Zod
- **Email**: [Resend](https://resend.com)
- **Deployment**: Docker + Coolify

Planned providers: Twilio (SMS), Firebase Cloud Messaging (push), and generic HTTP webhooks. See [Where Conduit could go next](#where-conduit-could-go-next-) above.

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Support

- **Documentation**: [docs/README.md](docs/README.md)
- **Issues**: [GitHub Issues](https://github.com/eldtechnologies/conduit/issues)
- **Discussions**: [GitHub Discussions](https://github.com/eldtechnologies/conduit/discussions)
- **Security**: Report security issues to security@eldtechnologies.com

---

## Acknowledgments

Built with:
- [Hono](https://hono.dev/) - Ultra-lightweight web framework
- [Resend](https://resend.com) - Modern email API
- [Zod](https://zod.dev/) - TypeScript-first validation

Inspired by the need for secure, simple communication from frontend applications.

---

<p align="center">
  <strong>One API for all your communication needs</strong>
  <br>
  Made with ❤️ by <a href="https://github.com/eldtechnologies">ELD Technologies SL</a>
</p>
