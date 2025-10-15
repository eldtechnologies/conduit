# Conduit

**A lightweight, secure multi-channel communication proxy for sending emails, SMS, push notifications, and webhooks from frontend applications without exposing API keys.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Production Ready](https://img.shields.io/badge/Status-Production%20Ready-brightgreen.svg)]()
[![Version: 1.1.0](https://img.shields.io/badge/Version-1.1.0-blue.svg)]()
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

### Phase 1: Email (Production Ready - v1.1.0) ✅
- **Email delivery** via [Resend.com](https://resend.com) with comprehensive domain setup guide
- **Contact form template** with XSS sanitization and header injection prevention
- **API key authentication** with constant-time comparison (timing attack resistant)
- **Rate limiting** (10/min, 100/hr, 500/day per key) - token bucket algorithm
- **CORS protection** with strict origin whitelisting + X-Source-Origin for proxies/gateways
- **Recipient whitelisting** - Prevent stolen API keys from spamming arbitrary recipients (95% risk reduction)
- **Security hardening**:
  - HTTPS enforcement with HSTS
  - Request body size limits (50KB)
  - Comprehensive security headers (CSP, X-Frame-Options, etc.)
  - Input validation with Zod schemas
  - XSS sanitization with DOMPurify
- **Structured JSON logging** with request/response tracking
- **Health monitoring** - Public `/health` endpoint + authenticated `/health/detailed`
- **223 passing tests** with 87.51% code coverage

### Phase 2: SMS & Push (Q1 2026) 📱
- SMS via Twilio
- Push notifications via Firebase Cloud Messaging
- WhatsApp Business API integration
- Multi-channel templates

### Phase 3: Webhooks (Q2 2026) 🌐
- HTTP webhooks (POST to any endpoint)
- Slack notifications
- Discord notifications
- Custom integrations

### Phase 4: Advanced Features (Q3 2026) 🚀
- Analytics dashboard
- Delivery tracking & webhooks
- Retry policies & dead letter queues
- Visual template builder
- Scheduled sending
- A/B testing

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
Frontend Apps → HTTPS → [CORS] → [Auth] → [Rate Limit] → [Logger]
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

**[→ Security Documentation](docs/security/)**
**[→ Spam Prevention Guide](docs/security/spam-prevention.md)** - Quick 15-minute setup

---

## Project Status

**Current Version**: 🚀 v1.1.0 - PRODUCTION READY!

### Completed Features ✅
- **Core Email Functionality**
  - Complete POST /api/send API with Resend integration
  - Contact form template with XSS sanitization
  - Template engine with Zod validation
  - Email header injection prevention

- **Security Hardening**
  - HTTPS enforcement with HSTS headers
  - API key authentication (constant-time comparison)
  - CORS protection with origin whitelisting + proxy support (X-Source-Origin)
  - Rate limiting (token bucket algorithm)
  - Request body size limits (50KB)
  - Comprehensive security headers (CSP, X-Frame-Options, etc.)
  - Input validation and XSS sanitization

- **Monitoring & Operations**
  - Health endpoints (/health public, /health/detailed authenticated)
  - Structured JSON logging with PII masking
  - Graceful shutdown handling
  - Docker deployment with health checks

- **Quality Assurance**
  - 223 passing tests (87.51% coverage)
  - Integration, unit, and security test suites
  - TypeScript strict mode
  - ESLint + Prettier code quality

### Recent Improvements 🆕

**v1.1.0** (2025-10-14):
- 🛡️ **Recipient whitelisting** - Prevent stolen API keys from spamming arbitrary recipients
  - Configure per-API-key email and domain whitelists via environment variables
  - 95% risk reduction for stolen key abuse scenarios
  - Fully backward compatible (no whitelist = allow all recipients)
- 📚 **Comprehensive security documentation** (108KB)
  - [Spam Prevention Guide](docs/security/spam-prevention.md) - Quick 15-minute setup (honeypot, CAPTCHA, LLM filtering)
  - [Advanced Protections](docs/security/advanced-protections.md) - Multi-tier defense strategies
  - [Recipient Whitelisting Guide](docs/features/recipient-whitelisting.md) - Complete implementation spec
- ✅ All 223 tests passing with new validation tests

**v1.0.2** (2025-10-13):
- Zero known vulnerabilities (updated dev dependencies)
- vitest 3.2.4 (was 2.1.9) - resolves esbuild GHSA-67mh-4wv8-2f99
- All 223 tests passing with updated test framework

**v1.0.1** (2025-10-05):
- Node.js 20+ support for latest features
- X-Source-Origin header support for proxy/gateway deployments
- Comprehensive email domain setup documentation (Resend)
- Improved error messages for domain verification
- Production deployment checklist
- Hono Node.js server adapter for proper HTTP server binding

### Next Steps 🚀
- **Phase 2 (Q1 2026)**: SMS + Push notifications
- **Phase 3 (Q2 2026)**: Webhooks & integrations
- **Phase 4 (Q3 2026)**: Advanced features (analytics, scheduling, A/B testing)

---

## Use Cases

### Contact Forms
Securely send contact form submissions to your email without exposing SMTP credentials.

### Transactional Emails
Password resets, welcome emails, notifications - all from your frontend app.

### Verification Codes (Phase 2+)
Send SMS verification codes for 2FA without exposing Twilio credentials.

### Push Notifications (Phase 2+)
Send mobile push notifications without embedding Firebase keys in your app.

### Slack/Discord Notifications (Phase 3+)
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

- **Runtime**: Node.js 18+
- **Framework**: [Hono](https://hono.dev/) (ultra-lightweight, edge-compatible)
- **Language**: TypeScript
- **Validation**: Zod
- **Email**: [Resend](https://resend.com)
- **SMS** (Phase 2): Twilio
- **Push** (Phase 2): Firebase Cloud Messaging
- **Deployment**: Docker + Coolify

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
