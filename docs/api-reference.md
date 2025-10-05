# Conduit Specification

A lightweight, secure multi-channel communication proxy for sending emails, SMS, push notifications, and more from frontend applications without exposing API keys.

## Overview

**Purpose**: Centralized communication service that handles multiple channels (email, SMS, push, webhooks) while keeping API keys secure on the backend.

**Vision**: Start with email, expand to all communication channels - one unified API for everything.

**Key Benefits**:
- Single service shared across multiple frontend applications
- API keys never exposed to client-side code
- Unified API for all communication channels
- Centralized rate limiting and abuse prevention
- Standardized message templates
- Simple REST API interface
- Minimal infrastructure footprint

## Architecture

### Tech Stack
- **Runtime**: Node.js 18+
- **Framework**: Hono (ultra-lightweight web framework)
- **Language**: TypeScript
- **Email Provider**: Resend.com (Phase 1)
- **Future Providers**: Twilio (SMS), Firebase (Push), etc.
- **Deployment**: Docker + Coolify

### Why Hono?
- Extremely lightweight (~12KB)
- Fast startup and execution
- Built-in CORS, middleware support
- TypeScript-first
- Edge-compatible (can run on Cloudflare Workers if needed)
- Minimal dependencies

## Product Roadmap

### Phase 1: Email (v1.0) - **MVP**
- ✅ Email sending via Resend
- ✅ Contact form template
- ✅ API key authentication
- ✅ Rate limiting
- ✅ CORS protection
- ✅ Template system

**Target**: Q4 2025 (Oct-Dec)

### Phase 2: SMS & Push (v1.1)
- 📱 SMS via Twilio
- 🔔 Push notifications via Firebase Cloud Messaging
- 📨 WhatsApp Business API integration
- 🎯 Multi-channel templates (email + SMS for same event)

**Target**: Q1 2026 (Jan-Mar)

### Phase 3: Webhooks & Integrations (v1.2)
- 🌐 HTTP webhooks (POST to any endpoint)
- 💬 Slack notifications
- 📢 Discord notifications
- 🔗 Custom integrations

**Target**: Q2 2026 (Apr-Jun)

### Phase 4: Advanced Features (v2.0)
- 📊 Analytics dashboard
- 📈 Delivery tracking & webhooks
- 🔄 Retry policies & dead letter queues
- 🎨 Visual template builder
- 📅 Scheduled sending
- 🧪 A/B testing

**Target**: Q3 2026 (Jul-Sep)

## API Specification

### Base URL
```
https://conduit.yourdomain.com
```

### Authentication
All requests require an API key in the `X-API-Key` header.

```http
X-API-Key: your-api-key-here
```

### Endpoints

#### POST /api/send
Sends a message via the specified channel.

**Request Headers**:
```http
Content-Type: application/json
X-API-Key: your-api-key-here
X-Source-Origin: https://yourdomain.com
```

**Request Body (Email - Phase 1)**:
```json
{
  "channel": "email",
  "templateId": "contact-form",
  "to": "recipient@example.com",
  "from": {
    "email": "onboarding@resend.dev",
    "name": "Your Company"
  },
  "replyTo": "customer@example.com",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "message": "Your message here",
    "subject": "Contact Form Submission"
  }
}
```

**Request Body (SMS - Phase 2)**:
```json
{
  "channel": "sms",
  "templateId": "verification-code",
  "to": "+1234567890",
  "data": {
    "code": "123456",
    "appName": "Your App"
  }
}
```

**Request Body (Push - Phase 2)**:
```json
{
  "channel": "push",
  "templateId": "new-message",
  "to": "device-token-here",
  "data": {
    "title": "New Message",
    "body": "You have a new message from John",
    "action": "/messages/123"
  }
}
```

**Request Body (Webhook - Phase 3)**:
```json
{
  "channel": "webhook",
  "templateId": "slack-notification",
  "to": "https://hooks.slack.com/services/...",
  "data": {
    "text": "New user registration: john@example.com"
  }
}
```

**Success Response (200 OK)**:
```json
{
  "success": true,
  "messageId": "msg_abc123",
  "channel": "email",
  "timestamp": "2025-10-05T10:30:00Z"
}
```

**Error Responses**:
```json
// 400 Bad Request
{
  "success": false,
  "error": "Invalid channel. Supported: email, sms, push, webhook",
  "code": "INVALID_CHANNEL"
}

// 401 Unauthorized
{
  "success": false,
  "error": "Invalid API key",
  "code": "UNAUTHORIZED"
}

// 429 Too Many Requests
{
  "success": false,
  "error": "Rate limit exceeded. Try again in 60 seconds.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60
}
```

#### GET /health
Health check endpoint.

**Response (200 OK)**:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-05T10:30:00Z",
  "version": "1.0.0",
  "channels": {
    "email": "active",
    "sms": "coming_soon",
    "push": "coming_soon",
    "webhook": "coming_soon"
  }
}
```

#### GET /api/channels (Phase 2+)
List available channels and their status.

**Response (200 OK)**:
```json
{
  "channels": [
    {
      "id": "email",
      "name": "Email",
      "status": "active",
      "provider": "Resend",
      "templates": ["contact-form", "newsletter", "reset-password"]
    },
    {
      "id": "sms",
      "name": "SMS",
      "status": "active",
      "provider": "Twilio",
      "templates": ["verification-code", "alert"]
    }
  ]
}
```

## Templates

### Phase 1: Email Templates

#### contact-form
Contact form submissions.

**Required Data Fields**:
- `name` (string) - Sender's name
- `email` (string) - Sender's email
- `message` (string) - Message content
- `phone` (optional string) - Phone number

**Subject**: `New Contact Form Submission from {name}`

**Email Body**: HTML email with sender details and message.

### Phase 2: SMS Templates

#### verification-code
Send verification codes.

**Required Data Fields**:
- `code` (string) - Verification code
- `appName` (string) - Application name

**SMS Body**: `Your {appName} verification code is: {code}. Valid for 10 minutes.`

#### alert
Generic alert messages.

**Required Data Fields**:
- `message` (string) - Alert message
- `appName` (string) - Application name

**SMS Body**: `{appName}: {message}`

### Phase 3: Push Notification Templates

#### new-message
New message notification.

**Required Data Fields**:
- `title` (string) - Notification title
- `body` (string) - Notification body
- `action` (string) - Deep link/URL to open

### Template Structure

Templates are defined in `src/templates/` directory organized by channel:
```
src/templates/
├── email/
│   ├── contact-form.ts
│   ├── newsletter.ts
│   └── index.ts
├── sms/
│   ├── verification-code.ts
│   └── index.ts
├── push/
│   ├── new-message.ts
│   └── index.ts
└── index.ts (exports all)
```

Each template exports:
```typescript
export interface ContactFormData {
  name: string;
  email: string;
  message: string;
  phone?: string;
}

export const contactFormTemplate = {
  id: 'contact-form',
  channel: 'email',
  subject: (data: ContactFormData) => `New Contact Form Submission from ${data.name}`,
  html: (data: ContactFormData) => `<!-- template HTML -->`,
  validate: (data: unknown): data is ContactFormData => {
    // Zod validation schema
  }
};
```

## Security Model

### API Key Management
1. **Generation**: Random 32-character alphanumeric strings
2. **Storage**: Environment variables (never in database)
3. **Format**: `KEY_<frontend-name>_<random-suffix>`
4. **Example**: `KEY_ELDTECH_a8f9d2c1b4e6`

**Environment Variables**:
```bash
API_KEY_ELDTECH=KEY_ELDTECH_a8f9d2c1b4e6
API_KEY_PROJECTB=KEY_PROJECTB_x7h3j9k2m5n8
API_KEY_PORTFOLIO=KEY_PORTFOLIO_p4q8r2s6t9u3
```

### CORS Configuration
Strict origin whitelisting:

```typescript
const ALLOWED_ORIGINS = [
  'https://eldtechnologies.com',
  'https://projectb.com',
  'https://myportfolio.dev',
  'http://localhost:8080', // Development only
];
```

### Rate Limiting
Per-API-key rate limits across ALL channels:

**Limits**:
- 10 requests per minute per API key
- 100 requests per hour per API key
- 500 requests per day per API key

**Strategy**: Token bucket algorithm with sliding window

**Note**: Rate limits apply to total requests across all channels, not per-channel.

### Channel-Specific Security

**Email**:
- SPF/DKIM verification
- Bounce handling
- Spam prevention

**SMS** (Phase 2):
- Phone number validation
- Carrier lookup
- SMS fraud detection

**Push** (Phase 2):
- Device token validation
- Platform verification (iOS/Android)

**Webhooks** (Phase 3):
- URL validation
- SSL/TLS enforcement
- Signature verification

## Security

🔒 **Security is critical for Conduit.** All security requirements, implementation guides, and best practices have been moved to dedicated security documentation.

### Security Documentation

- **[Security Overview](security/README.md)** - Security checklist, philosophy, and quick reference
- **[Security Review](security/review.md)** - Comprehensive threat analysis and vulnerabilities
- **[Security Implementation](security/implementation.md)** - Step-by-step hardening guide with code examples

### Critical Security Requirements (Phase 1)

Before deploying to production, you **MUST** implement these security measures:

- [ ] **HTTPS Enforcement** - Reject HTTP, add HSTS header
- [ ] **Request Size Limits** - Max 50KB payload
- [ ] **Cryptographically Secure API Keys** - Use `crypto.randomBytes`, not `Math.random()`
- [ ] **Constant-Time Comparison** - Prevent timing attacks with `timingSafeEqual`
- [ ] **XSS Sanitization** - Sanitize all user input with DOMPurify
- [ ] **Security Headers** - X-Content-Type-Options, X-Frame-Options, CSP, etc.
- [ ] **Template Field Limits** - Max lengths on all fields
- [ ] **Provider API Timeouts** - 10-second timeout
- [ ] **Split Health Endpoint** - Public `/health` vs authenticated `/health/detailed`
- [ ] **Error Sanitization** - Hide stack traces in production

See **[security/implementation.md](security/implementation.md)** for complete implementation details with copy-paste ready code examples.

### Quick Security Reference

**Generate secure API keys**:
```bash
node -e "console.log('KEY_APP_' + require('crypto').randomBytes(16).toString('hex'))"
```

**⚠️ DO NOT use Math.random()** - it's not cryptographically secure.

For full security guidance, start with **[security/README.md](security/README.md)**.

## Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Phase 1: Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Phase 2: SMS (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890

# Phase 2: Push Notifications (Firebase)
FIREBASE_SERVER_KEY=AAAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FIREBASE_PROJECT_ID=your-project-id

# Phase 3: Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz

# API Keys (one per frontend)
API_KEY_ELDTECH=KEY_ELDTECH_a8f9d2c1b4e6
API_KEY_PROJECTB=KEY_PROJECTB_x7h3j9k2m5n8

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=https://eldtechnologies.com,https://projectb.com

# Rate Limiting
RATE_LIMIT_PER_MINUTE=10
RATE_LIMIT_PER_HOUR=100
RATE_LIMIT_PER_DAY=500

# Default Settings
DEFAULT_FROM_EMAIL=noreply@yourdomain.com
DEFAULT_FROM_NAME=Your Company
DEFAULT_FROM_PHONE=+1234567890
```

## Project Structure

```
conduit/
├── src/
│   ├── index.ts              # Hono app entry point
│   ├── routes/
│   │   ├── send.ts          # POST /api/send handler
│   │   ├── health.ts        # GET /health handler
│   │   └── channels.ts      # GET /api/channels (Phase 2+)
│   ├── middleware/
│   │   ├── auth.ts          # API key validation
│   │   ├── cors.ts          # CORS handling
│   │   ├── rateLimit.ts     # Rate limiting
│   │   └── logger.ts        # Request logging
│   ├── channels/            # Channel implementations
│   │   ├── email.ts         # Resend integration (Phase 1)
│   │   ├── sms.ts           # Twilio integration (Phase 2)
│   │   ├── push.ts          # Firebase integration (Phase 2)
│   │   ├── webhook.ts       # HTTP webhooks (Phase 3)
│   │   └── index.ts         # Channel registry
│   ├── templates/
│   │   ├── email/           # Email templates
│   │   ├── sms/             # SMS templates (Phase 2)
│   │   ├── push/            # Push templates (Phase 2)
│   │   └── index.ts         # Template registry
│   ├── utils/
│   │   ├── validation.ts    # Input validators
│   │   └── errors.ts        # Custom error types
│   └── config.ts            # Environment config
├── Dockerfile               # Multi-stage Docker build
├── .dockerignore
├── package.json
├── tsconfig.json
└── README.md
```

## Deployment (Coolify)

### Dockerfile
```dockerfile
# Multi-stage build
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy built assets and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/index.js"]
```

### Coolify Setup
1. Create new service in Coolify
2. Connect Git repository
3. Set environment variables in Coolify UI
4. Coolify auto-detects Dockerfile
5. Deploy

### Custom Domain
Set up subdomain in Coolify:
- `conduit.yourdomain.com` → Conduit Service
- Enable automatic SSL certificate

## Frontend Integration

### React Example (TypeScript)

**Email Service (Phase 1)**:
```typescript
// src/services/conduit.ts
const CONDUIT_URL = import.meta.env.VITE_CONDUIT_URL;
const API_KEY = import.meta.env.VITE_CONDUIT_API_KEY;

interface ContactFormData {
  name: string;
  email: string;
  message: string;
  phone?: string;
}

export async function sendEmail(data: ContactFormData): Promise<boolean> {
  try {
    const response = await fetch(`${CONDUIT_URL}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-Source-Origin': window.location.origin,
      },
      body: JSON.stringify({
        channel: 'email',
        templateId: 'contact-form',
        to: 'contact@yourdomain.com',
        from: {
          email: 'noreply@yourdomain.com',
          name: 'Your Company',
        },
        replyTo: data.email,
        data,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Conduit error:', error);
    return false;
  }
}
```

**SMS Service (Phase 2)**:
```typescript
export async function sendSMS(phone: string, code: string): Promise<boolean> {
  const response = await fetch(`${CONDUIT_URL}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      'X-Source-Origin': window.location.origin,
    },
    body: JSON.stringify({
      channel: 'sms',
      templateId: 'verification-code',
      to: phone,
      data: { code, appName: 'Your App' },
    }),
  });

  return response.ok;
}
```

**Push Notification (Phase 2)**:
```typescript
export async function sendPushNotification(
  deviceToken: string,
  title: string,
  body: string
): Promise<boolean> {
  const response = await fetch(`${CONDUIT_URL}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      'X-Source-Origin': window.location.origin,
    },
    body: JSON.stringify({
      channel: 'push',
      templateId: 'new-message',
      to: deviceToken,
      data: { title, body, action: '/messages' },
    }),
  });

  return response.ok;
}
```

## Monitoring & Logging

### Logging Format
Structured JSON logs for easy parsing:

```json
{
  "timestamp": "2025-10-05T10:30:00Z",
  "level": "info",
  "event": "message_sent",
  "channel": "email",
  "apiKey": "KEY_ELDTECH_***",
  "templateId": "contact-form",
  "to": "contact@***",
  "messageId": "msg_abc123",
  "duration": 245,
  "origin": "https://eldtechnologies.com"
}
```

### Metrics to Track
- Total messages sent per channel per day/hour
- Success rate per channel and template
- Average response time per channel
- Rate limit hits per API key
- Failed authentication attempts
- Provider API errors (Resend, Twilio, Firebase, etc.)

### Health Check Details
```typescript
GET /health
{
  "status": "healthy",
  "timestamp": "2025-10-05T10:30:00Z",
  "version": "1.0.0",
  "channels": {
    "email": { "status": "active", "provider": "Resend" },
    "sms": { "status": "active", "provider": "Twilio" },
    "push": { "status": "active", "provider": "Firebase" },
    "webhook": { "status": "active" }
  },
  "checks": {
    "memory": { "used": 45.2, "total": 512, "percentage": 8.8 },
    "uptime": 86400
  }
}
```

## Error Handling

### Error Codes
| Code | Description | HTTP Status |
|------|-------------|-------------|
| UNAUTHORIZED | Invalid or missing API key | 401 |
| INVALID_CHANNEL | Channel not supported or disabled | 400 |
| INVALID_TEMPLATE | Template ID not found | 400 |
| VALIDATION_ERROR | Invalid input data | 400 |
| RATE_LIMIT_EXCEEDED | Too many requests | 429 |
| PROVIDER_ERROR | Third-party provider failure (Resend, Twilio, etc.) | 502 |
| INTERNAL_ERROR | Unexpected server error | 500 |

## Performance Considerations

### Response Times
- Target: < 500ms for /api/send (all channels)
- Health check: < 50ms

### Optimization Strategies
1. **Connection Pooling**: Reuse HTTP connections to providers
2. **Template Caching**: Pre-compile templates in memory
3. **Rate Limit Store**: In-memory with periodic cleanup
4. **Minimal Dependencies**: Keep bundle size < 10MB
5. **Async Processing**: Queue long-running tasks (Phase 4)

## API Versioning

Start with v1 in URL path:
```
POST /api/v1/send
```

Breaking changes require new version:
```
POST /api/v2/send
```

Maintain backwards compatibility for 6 months minimum.

## Migration Guide

### From Email-Only to Multi-Channel

**Old API (v0.x - Email Only)**:
```json
POST /api/send
{
  "templateId": "contact-form",
  "to": "user@example.com",
  "data": { ... }
}
```

**New API (v1.0+ - Multi-Channel)**:
```json
POST /api/send
{
  "channel": "email",  // REQUIRED
  "templateId": "contact-form",
  "to": "user@example.com",
  "data": { ... }
}
```

**Backwards Compatibility**:
- If `channel` is omitted, defaults to `"email"`
- v1.0 supports both formats
- Deprecation notice added to responses
- Remove default in v2.0 (2026)

## Support & Maintenance

### Adding New Channel
1. Implement channel handler in `src/channels/`
2. Add templates to `src/templates/{channel}/`
3. Update environment variables
4. Update health check response
5. Deploy with zero downtime

### Adding New Frontend
1. Generate new API key
2. Add to Coolify environment
3. Add origin to `ALLOWED_ORIGINS`
4. Restart service
5. Provide API key to frontend team (secure channel)

## License & Usage

Open source under MIT License. Free to use, modify, and distribute.

---

**Version**: 1.0.0 (Multi-Channel Architecture)
**Last Updated**: 2025-10-05
**Maintainer**: ELD Technologies

**Tagline**: *One API for all your communication needs*
