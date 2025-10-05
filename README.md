# Conduit

**A lightweight, secure multi-channel communication proxy for sending emails, SMS, push notifications, and webhooks from frontend applications without exposing API keys.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: In Development](https://img.shields.io/badge/Status-In%20Development-orange.svg)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

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

### Phase 1: Email (Available Now) ✅
- Email via [Resend.com](https://resend.com)
- Contact form template
- API key authentication
- Rate limiting (10/min, 100/hr, 500/day per key)
- CORS protection with origin whitelisting
- Structured JSON logging

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

---

## Documentation

📚 **[Documentation Hub](docs/README.md)** - Start here for all documentation

### Quick Links

- **[Getting Started](docs/getting-started.md)** - Deploy and integrate in 5 minutes
- **[User Guide](docs/user-guide.md)** - Complete integration guide for frontend developers
- **[API Reference](docs/api-reference.md)** - Full API specification
- **[Architecture](docs/architecture.md)** - System design and technical architecture
- **[Security](docs/security/)** - Security analysis, checklist, and implementation guide

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

**[→ Security Documentation](docs/security/)**

---

## Project Status

**Current Phase**: 🚧 Phase 5 Complete - Send Endpoint (MVP) Next

- ✅ Complete API specification
- ✅ Architecture design
- ✅ Security review and implementation guide
- ✅ Documentation
- ✅ Project setup (Phase 0)
- ✅ Core infrastructure (Phase 1)
- ✅ Security layer (Phase 2)
  - ✅ HTTPS enforcement with HSTS
  - ✅ Security headers (CSP, X-Frame-Options, etc.)
  - ✅ API key authentication with timing attack resistance
  - ✅ CORS protection with origin whitelisting
  - ✅ Rate limiting (token bucket algorithm)
  - ✅ Request logging with PII masking
  - ✅ 144 tests passing (including security tests)
- ✅ Health & basic routes (Phase 3)
  - ✅ Public health endpoint (/health)
  - ✅ Authenticated detailed health endpoint (/health/detailed)
  - ✅ Full middleware stack wired up
  - ✅ Graceful shutdown handling
  - ✅ 154 tests passing (10 new integration tests)
- ✅ Email channel (Phase 4)
  - ✅ Channel infrastructure with registry
  - ✅ Resend integration with timeout handling
  - ✅ Error mapping and provider availability checks
  - ✅ 10 channel tests
- ✅ Email templates (Phase 5)
  - ✅ Template infrastructure with Zod validation
  - ✅ Contact form template (HTML + plain text)
  - ✅ XSS sanitization in all templates
  - ✅ 26 template tests
  - ✅ **190 tests passing total**
- ⏳ Send endpoint (Phase 6 - next to complete MVP)

**Roadmap**:
- **Phase 1 (Q4 2025)**: Email via Resend - **MVP**
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
