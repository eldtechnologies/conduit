# Conduit

**A lightweight, secure communication proxy for sending email from frontend applications without exposing provider API keys. Built to grow into SMS, push notifications and webhooks (planned).**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Release Candidate](https://img.shields.io/badge/Status-Release%20Candidate-orange.svg)](CHANGELOG.md)
[![Version: 2.0.0-rc.1](https://img.shields.io/badge/Version-2.0.0--rc.1-orange.svg)](CHANGELOG.md)
[![CI](https://github.com/eldtechnologies/conduit/actions/workflows/ci.yml/badge.svg)](https://github.com/eldtechnologies/conduit/actions/workflows/ci.yml)
[![Security Scan](https://github.com/eldtechnologies/conduit/actions/workflows/security.yml/badge.svg)](https://github.com/eldtechnologies/conduit/actions/workflows/security.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

> 🔐 **2.0 is a security hardening release.** It closes several ways that 1.x could be abused to send mail as a configured frontend, spoof senders or bypass content filtering, and it refuses to start on unsafe configuration that 1.x quietly accepted. **Upgrading from 1.x? Read [Upgrading to 2.0](docs/upgrading-to-2.0.md) before you deploy.** Details in the [CHANGELOG](CHANGELOG.md).

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
- ✅ **Provides one unified API** - A single `/api/send` endpoint with a `channel` field; email today, SMS, push and webhooks planned
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
- 🔒 Secure communication with the email provider (Resend; Twilio and Firebase are planned)
- 🛡️ Authentication, CORS, and rate limiting
- 📝 Template rendering and validation
- 📊 Structured logging

---

## Features

### Today: Email ✅
- **Email delivery** via [Resend.com](https://resend.com) with a comprehensive domain setup guide
- **🤖 AI-powered spam filtering** (optional) — block spam, abuse, phishing, and prompt-injection attacks
  - Anthropic Claude and OpenAI GPT support
  - Configurable per API key with category rules and a 0-1 confidence threshold
  - Fail-open (`allow`) / fail-closed (`block`) modes for reliability
  - Daily call limits to control LLM costs (~$0.0005 per message)
  - Runs only after request validation, so invalid requests never cost an LLM call
  - See the [LLM Spam Filtering Guide](docs/features/llm-spam-filtering.md)
- **Contact form template** with XSS sanitization and header-injection prevention
- **API key authentication** with constant-time comparison (timing-attack resistant)
- **Rate limiting** (10/min, 100/hr, 500/day per key) — token-bucket algorithm
- **CORS protection** with strict origin whitelisting + `X-Source-Origin` for proxies/gateways
- **Recipient whitelisting** — prevent stolen API keys from spamming arbitrary recipients
- **Sender allowlist** — the operator decides which `from` addresses each key may use (`API_KEY_*_FROM_ADDRESSES`)
- **Idempotent retries** — optional `Idempotency-Key` header so a retried request is not sent twice
- **Strict startup validation** — invalid or misspelled `API_KEY_*` variables stop the server instead of being ignored
- **Security hardening**:
  - HTTPS enforcement with HSTS
  - Request body size limits (50KB, enforced on streamed/chunked bodies too; 413 when exceeded)
  - Security headers (CSP, X-Frame-Options, etc.)
  - Input validation with Zod schemas
  - XSS sanitization with DOMPurify
- **Structured JSON logging** with request/response tracking
- **Health monitoring** — public `/health` endpoint + authenticated `/health/detailed`
- **Unit, integration, and security test suites** (80% coverage threshold enforced)

### Where Conduit could go next 🌱

These are directions the architecture supports — not commitments. Channel scaffolding, routing, templating, and per-key configuration are all designed to extend beyond email.

- **More channels:** SMS (Twilio), push (Firebase Cloud Messaging), WhatsApp Business, generic HTTP webhooks, Slack and Discord integrations
- **Operational features:** delivery tracking, retry policies, dead-letter queues, scheduled sending
- **Insight & UX:** analytics dashboard, visual template builder, A/B testing
- **Auth & multi-tenancy:** scoped API keys, automated key rotation, audit logs (manual revocation via `REVOKED_KEYS` already exists)

Have a use case you'd like to see? Open a [discussion](https://github.com/eldtechnologies/conduit/discussions) or [issue](https://github.com/eldtechnologies/conduit/issues).

---

## Getting Started

### 1. Deploy Conduit

**Option A: Coolify (Recommended)**
```bash
1. Create new service in Coolify
2. Connect your Git repository
3. Add environment variables (NODE_ENV=production, RESEND_API_KEY, API_KEY_*, API_KEY_*_FROM_ADDRESSES, ALLOWED_ORIGINS)
4. Deploy
5. Set custom domain: conduit.yourdomain.com
```

**Option B: Docker**
```bash
git clone https://github.com/eldtechnologies/conduit.git
cd conduit
cp .env.example .env   # then fill in your values
docker build -t conduit .
docker run -p 3000:3000 --env-file .env conduit
```

The image (and `docker compose`) default to `NODE_ENV=production`, which rejects plain-HTTP requests to every route except `GET /health` with `403 HTTPS Required`. For a local run without a TLS proxy, set `NODE_ENV=development` in `.env`.

**Option C: Node.js**
```bash
npm ci
npm run build
node --env-file=.env dist/index.js   # npm start runs dist/index.js but does not load .env
```

`NODE_ENV` defaults to `development`. **Production must run with `NODE_ENV=production`** (HTTPS enforcement with HSTS, sanitized error responses).

### 2. Generate API Keys

```bash
# Secure generation with crypto.randomBytes
npm run generate-key -- MYSITE
# or: node -e "console.log('KEY_MYSITE_' + require('crypto').randomBytes(16).toString('hex'))"
```

Keys must look like `KEY_<NAME>_<12+ letters or digits>`. Conduit validates every `API_KEY_*` variable at startup and refuses to start on an invalid key, an unknown per-key setting, or a per-key setting for a key that is not configured.

### 3. Integrate with Your Frontend

See **[Getting Started Guide](docs/getting-started.md)** for complete integration examples.

### 4. Production Deployment Checklist

Before deploying to production, complete these steps:

**Email Setup (Resend):**
- [ ] **Verify email domain** on Resend ([guide](https://resend.com/domains))
  - ✅ Use a subdomain (e.g., `mail.yourdomain.com`) to protect your main domain reputation
  - Add DNS records (SPF, DKIM)
  - Wait for verification (5-30 minutes)
- [ ] **Allow your sender address** with `API_KEY_*_FROM_ADDRESSES` (an address on the verified domain; the first one is the default sender)
  - Without an allowlist, any request that sets `from` is rejected with `400 SENDER_NOT_ALLOWED`, and mail without `from` goes out as `onboarding@resend.dev` (Resend test sender)
- [ ] **Test email delivery** with verified domain

**Security & Configuration:**
- [ ] **Set environment variables**
  - `NODE_ENV=production` - Required in production (the default is `development`)
  - `RESEND_API_KEY` - Your Resend API key
  - `API_KEY_*` - One per frontend app (generate with `npm run generate-key -- APPNAME`)
  - `ALLOWED_ORIGINS` - Whitelist your frontend domains
  - See [`.env.example`](.env.example) for all supported variables
- [ ] **Configure CORS** - Add all production domains to `ALLOWED_ORIGINS`
- [ ] **Review rate limits** - Adjust `RATE_LIMIT_*` if needed (default: 10/min, 100/hr, 500/day)
- [ ] **Enable HTTPS** - Ensure `X-Forwarded-Proto: https` is set by your proxy/load balancer (required for every route except `/health` in production)

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
- [ ] **Enable LLM spam filtering** (optional) - `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` plus `API_KEY_*_LLM_ENABLED=true`
  - See **[LLM Spam Filtering Guide](docs/features/llm-spam-filtering.md)**
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
Frontend Apps → [HTTPS] → [CORS] → [Security Headers] → [Logger]
                                      ↓  (/api/* only)
              [Body Limit] → [Auth] → [Recipient Validation] → [Rate Limit]
                                      ↓
       Send route: request + template validation → sender check → [LLM Filter]
                                      ↓
                    Channel Router → Email Handler (Resend)
```

**Key Components**:
- **Hono**: Ultra-lightweight web framework (~12KB)
- **TypeScript**: Type-safe development
- **Zod**: Runtime validation
- **Docker**: Containerized deployment
- **Providers**: Resend (email); Twilio (SMS) and Firebase (push) are planned

See **[Architecture Documentation](docs/architecture.md)** for detailed diagrams and flows.

---

## Security

🔒 **Security is a top priority.** Conduit implements defense-in-depth with multiple security layers:

- ✅ HTTPS/TLS enforcement with HSTS
- ✅ Constant-time API key comparison (prevents timing attacks)
- ✅ XSS sanitization for email templates
- ✅ Request size limits (50KB max, including streamed bodies)
- ✅ Comprehensive security headers
- ✅ Rate limiting per API key across all channels, applied before any paid LLM call
- ✅ CORS protection with strict origin whitelisting
- ✅ API keys and sensitive headers (cookies, client IPs) masked in logs
- ✅ Strict startup validation: unrecognised `API_KEY_*` variables and incomplete LLM configuration stop the server
- ✅ Recipient whitelisting (prevents stolen key abuse)
- ✅ Per-key sender allowlist (clients cannot pick arbitrary `from` addresses)
- ✅ LLM content filter that fails closed in `block` mode (provider errors and malformed model output are never treated as "safe")
- 🛡️ Spam prevention with multi-tier protection (honeypot, CAPTCHA, LLM filtering)
- 🤖 **Automated Security**:
  - Daily vulnerability scanning (npm audit + OSV Scanner), plus CodeQL on every push and PR
  - Dependabot version and security updates
  - CI fails on any known vulnerability, and on typecheck, lint, format or test failures

**[→ Security Documentation](docs/security/)**
**[→ Spam Prevention Guide](docs/security/spam-prevention.md)** - Quick 15-minute setup

---

## Project Status

**Current version**: v2.0.0-rc.1 — security hardening release candidate. Upgrading from 1.x? Read [docs/upgrading-to-2.0.md](docs/upgrading-to-2.0.md) first; 2.0 refuses to start on unsafe configuration that 1.x accepted.

### What's in the box
- **Email pipeline**: POST `/api/send`, Resend integration, contact-form template, Zod-validated request bodies, header-injection prevention.
- **Security hardening**: HTTPS + HSTS, constant-time API key comparison, CORS allowlist with proxy support (`X-Source-Origin`), token-bucket rate limiting, 50KB request size limit, security headers (CSP, X-Frame-Options, etc.), XSS sanitization on user content.
- **Spam prevention**: optional LLM filtering (Anthropic / OpenAI, fail-open or fail-closed), recipient whitelisting, per-key sender allowlist, multi-tier defense guidance.
- **Operations**: structured JSON logs with PII masking, public `/health` + authenticated `/health/detailed`, graceful shutdown, Docker image with health checks.
- **Quality bar**: unit, integration and security tests with an 80% coverage threshold enforced in CI, TypeScript strict mode (`noUncheckedIndexedAccess`), ESLint + Prettier checked in CI, and a build + boot + Docker smoke test on every PR. CI also fails on `npm audit` / OSV findings.

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

# Install dependencies
npm install

# Configure (npm scripts do not load .env themselves)
cp .env.example .env

# Run development server with .env loaded
npx tsx watch --env-file=.env src/index.ts

# Run tests (they set their own environment in tests/setup.ts)
npm test

# Build for production and run the build
npm run build
node --env-file=.env dist/index.js   # or: npm start, with the variables exported
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
  <strong>Secure email from your frontend — one API, more channels to come</strong>
  <br>
  Made with ❤️ by <a href="https://github.com/eldtechnologies">ELD Technologies SL</a>
</p>
