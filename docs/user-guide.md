# Conduit User Guide

**Conduit** is a lightweight multi-channel communication proxy that lets you send emails, SMS, push notifications, and more from your frontend applications without exposing API keys.

Perfect for contact forms, verification codes, notifications, and any scenario where you need secure communication from client-side code.

## Why Conduit?

✅ **Secure** - API keys stay on the backend, never exposed to clients
✅ **Multi-Channel** - Email, SMS, Push, Webhooks - one unified API
✅ **Simple** - One endpoint, clear API, minimal setup
✅ **Shared** - Use one instance across multiple websites
✅ **Fast** - Built with Hono, optimized for speed
✅ **Protected** - Built-in rate limiting and CORS
✅ **Extensible** - Easy to add new channels
✅ **Free** - Open source, self-hosted, no vendor lock-in

## What Can Conduit Do?

### Phase 1: Email (Available Now) ✅
- Contact forms
- Password resets
- Newsletters
- Transactional emails

### Phase 2: SMS & Push (Planned, not implemented) 📱
- Verification codes
- Alerts and notifications
- WhatsApp messages
- Mobile push notifications

### Phase 3: Webhooks (Planned, not implemented) 🌐
- Slack notifications
- Discord alerts
- Custom HTTP endpoints
- Third-party integrations

## Quick Start (5 Minutes)

### Prerequisites
- A Resend.com account (free tier available) for email
- Docker or a hosting platform like Coolify, Railway, or Render

### 1. Get Your Resend API Key
1. Sign up at [resend.com](https://resend.com)
2. Go to API Keys in your dashboard
3. Create a new API key
4. Copy the key (starts with `re_`)

### 2. Deploy Conduit

#### Option A: Coolify (Recommended)
```bash
1. Create new service in Coolify
2. Connect your Conduit Git repository
3. Add environment variables:
   - NODE_ENV=production
   - RESEND_API_KEY=re_your_key_here
   - API_KEY_MYSITE=<output of: npm run generate-key -- MYSITE>
   - API_KEY_MYSITE_FROM_ADDRESSES=noreply@mail.yourdomain.com
   - ALLOWED_ORIGINS=https://yoursite.com
4. Deploy (Coolify auto-detects the Dockerfile)
5. Set custom domain: conduit.yourdomain.com
```

`NODE_ENV` defaults to `development`; production deployments must run with `NODE_ENV=production` (HTTPS enforcement with HSTS, sanitized errors). The Docker image sets it already. In production every route except `GET /health` requires `X-Forwarded-Proto: https` from your reverse proxy.

#### Option B: Docker Locally
```bash
# Clone the repository
git clone https://github.com/eldtechnologies/conduit.git
cd conduit

# Create .env file (replace the example key with your own, see step 3)
cat > .env << EOF
NODE_ENV=development
RESEND_API_KEY=re_your_key_here
API_KEY_MYSITE=<output of: npm run generate-key -- MYSITE>
ALLOWED_ORIGINS=http://localhost:8080,https://yoursite.com
PORT=3000
EOF

# Build and run
docker build -t conduit .
docker run -p 3000:3000 --env-file .env conduit

# Test it's running
curl http://localhost:3000/health
```

The image (and `docker compose`) default to `NODE_ENV=production`, which answers plain-HTTP requests to anything but `GET /health` with `403 HTTPS Required`. `NODE_ENV=development` in `.env` allows local plain-HTTP testing.

#### Option C: Node.js
```bash
npm ci
npm run build
npm start   # loads .env when present
```

### 3. Generate API Keys for Your Frontends

Each frontend needs its own API key. Generate them securely:

```bash
# Generate a cryptographically secure API key
node -e "console.log('KEY_MYSITE_' + require('crypto').randomBytes(16).toString('hex'))"

# Or use the built-in script:
npm run generate-key -- MYSITE
```

Example output: `KEY_MYSITE_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1`

Add to your Conduit environment variables:
```bash
API_KEY_MYSITE=<output of: npm run generate-key -- MYSITE>
API_KEY_PORTFOLIO=<output of: npm run generate-key -- PORTFOLIO>
```

All `API_KEY_*` variables are validated at startup. The server refuses to start if a value is not a valid key (`KEY_<NAME>_<12+ letters or digits>`), if a per-key variable has an unknown suffix, or if a per-key variable (such as `API_KEY_MYSITE_RECIPIENTS`) refers to an `API_KEY_<NAME>` that is not set.

Set the sender address for each key (the first address is used when a request omits `from`):
```bash
API_KEY_MYSITE_FROM_ADDRESSES=noreply@mail.yourdomain.com
```
Without `API_KEY_<NAME>_FROM_ADDRESSES`, a request that sets `from` is rejected with `400 SENDER_NOT_ALLOWED`, and mail without `from` is sent as `Conduit <onboarding@resend.dev>` (Resend's test sender).

### 4. Integrate with Your Frontend

#### React + TypeScript

**Step 1: Add environment variable**
```bash
# .env (DO NOT COMMIT THIS FILE)
VITE_CONDUIT_URL=https://conduit.yourdomain.com
VITE_CONDUIT_API_KEY=KEY_MYSITE_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1
```

**Step 2: Create communication service**
```typescript
// src/services/conduit.ts
const CONDUIT_URL = import.meta.env.VITE_CONDUIT_URL;
const API_KEY = import.meta.env.VITE_CONDUIT_API_KEY;

interface ContactFormData {
  name: string;
  email: string;
  message: string;
  subject?: string;
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
        to: 'hello@yourcompany.com',
        // `from` omitted: uses the first address in API_KEY_MYSITE_FROM_ADDRESSES.
        // A client-supplied `from` must be in that list, or the request fails with 400.
        replyTo: data.email,
        data,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

// Phase 2: Send SMS (planned, NOT implemented: today this returns 400 INVALID_CHANNEL)
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

**Step 3: Use in your component**
```typescript
import { sendEmail } from '@/services/conduit';

function ContactForm() {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const success = await sendEmail({
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      message: formData.get('message') as string,
    });

    if (success) {
      alert('Message sent! We\'ll get back to you soon.');
    } else {
      alert('Failed to send message. Please try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" required placeholder="Your name" />
      <input name="email" type="email" required placeholder="your@email.com" />
      <textarea name="message" required placeholder="Your message" />
      <button type="submit">Send Message</button>
    </form>
  );
}
```

#### Vue 3 + TypeScript

```typescript
// services/conduit.ts
export async function sendEmail(data: {
  name: string;
  email: string;
  message: string;
}) {
  const response = await fetch(`${import.meta.env.VITE_CONDUIT_URL}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': import.meta.env.VITE_CONDUIT_API_KEY,
      'X-Source-Origin': window.location.origin,
    },
    body: JSON.stringify({
      channel: 'email',
      templateId: 'contact-form',
      to: 'hello@yourcompany.com',
      // `from` omitted: uses the first address in API_KEY_MYSITE_FROM_ADDRESSES
      replyTo: data.email,
      data,
    }),
  });

  return response.ok;
}
```

#### Vanilla JavaScript

```html
<form id="contact-form">
  <input name="name" required placeholder="Name">
  <input name="email" type="email" required placeholder="Email">
  <textarea name="message" required placeholder="Message"></textarea>
  <button type="submit">Send</button>
</form>

<script>
const CONDUIT_URL = 'https://conduit.yourdomain.com';
const API_KEY = 'KEY_MYSITE_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1';

document.getElementById('contact-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);

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
      to: 'hello@yourcompany.com',
      // `from` omitted: uses the first address in API_KEY_MYSITE_FROM_ADDRESSES
      replyTo: formData.get('email'),
      data: {
        name: formData.get('name'),
        email: formData.get('email'),
        message: formData.get('message'),
      },
    }),
  });

  if (response.ok) {
    alert('Message sent!');
    e.target.reset();
  } else {
    alert('Failed to send message.');
  }
});
</script>
```

## Available Channels & Templates

### Phase 1: Email (Available Now) ✅

#### contact-form
Perfect for contact forms.

**Usage**:
```json
{
  "channel": "email",
  "templateId": "contact-form",
  "to": "hello@yourcompany.com",
  "from": {
    "email": "noreply@mail.yourdomain.com",
    "name": "Your Company"
  },
  "replyTo": "customer@example.com",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "message": "I'd like to learn more about your services.",
    "subject": "Inquiry about services"
  }
}
```

`from` is optional. If set, `from.email` must be listed in the key's `API_KEY_<NAME>_FROM_ADDRESSES`, otherwise the request is rejected with `400 SENDER_NOT_ALLOWED`. `from.name` (max 100 characters) may not contain `<`, `>`, `"`, `@` or line breaks.

Template fields: `name` (1-100 chars), `email` (valid email), `message` (1-5000 chars), `subject` (optional, max 200 chars). Invalid template data returns `400 VALIDATION_ERROR`.

Other fields in `data` (for example `phone`, or a honeypot field) are silently dropped: the request still succeeds, but those fields do not appear in the email. If you need a field in the email, it has to be part of the template. Conduit does not check honeypot fields for you; reject filled-in honeypots in your frontend.

### Phase 2: SMS (Planned, not implemented) 📱

#### verification-code
Send verification codes via SMS.

**Usage**:
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

### Phase 2: Push Notifications (Planned, not implemented) 🔔

#### new-message
Push notification for new messages.

**Usage**:
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

### Phase 3: Webhooks (Planned, not implemented) 🌐

#### slack-notification
Send to Slack webhooks.

**Usage**:
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

## Configuration Reference

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `RESEND_API_KEY` | Yes | Your Resend API key for email | `re_abc123...` |
| `API_KEY_<NAME>` | Yes | API keys for frontends (at least one), validated at startup | `KEY_SITE1_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1` |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed origins | `https://site1.com,https://site2.com` |
| `NODE_ENV` | No | `development`, `production` or `test` (default: `development`). **Set `production` in production**: it enforces HTTPS/HSTS and hides error details. The Docker image sets it. | `production` |
| `PORT` | No | Server port (default: 3000) | `3000` |
| `LOG_LEVEL` | No | Log level (default: `info`) | `info` |
| `RATE_LIMIT_PER_MINUTE` / `_PER_HOUR` / `_PER_DAY` | No | Rate limits per API key (defaults: 10 / 100 / 500) | `20` |
| `ENFORCE_HTTPS` | No | Also enforce HTTPS outside production (default: `false`); cannot disable it in production | `true` |
| `REVOKED_KEYS` | No | Comma-separated API keys to reject | `KEY_OLD_...` |
| `API_KEY_<NAME>_FROM_ADDRESSES` | No | Allowed `from` addresses for that key; first is the default sender | `noreply@mail.site1.com` |
| `API_KEY_<NAME>_RECIPIENTS` | No | Recipient whitelist: allowed `to` addresses | `support@site1.com` |
| `API_KEY_<NAME>_RECIPIENT_DOMAINS` | No | Recipient whitelist: allowed `to` domains | `site1.com` |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` | No | LLM spam filtering provider (`anthropic` or `openai`); see [LLM Spam Filtering](features/llm-spam-filtering.md) | `anthropic` |
| `API_KEY_<NAME>_LLM_*` | No | Per-key LLM settings: `_ENABLED`, `_RULES`, `_THRESHOLD` (0-1), `_FAIL_MODE` (`allow`/`block`), `_MAX_CALLS_PER_DAY` | `true` |

See [`.env.example`](../.env.example) for every supported variable with comments. SMS (Twilio), push (Firebase) and webhook variables are not read by the code yet.

### Rate Limits

Default rate limits per API key **across all channels**:
- **10 requests per minute**
- **100 requests per hour**
- **500 requests per day**

Customize with environment variables:
```bash
RATE_LIMIT_PER_MINUTE=20
RATE_LIMIT_PER_HOUR=200
RATE_LIMIT_PER_DAY=1000
```

### CORS Configuration

Only origins listed in `ALLOWED_ORIGINS` can make requests.

**Development**:
```bash
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
```

**Production**:
```bash
ALLOWED_ORIGINS=https://yoursite.com,https://www.yoursite.com
```

**Multiple sites**:
```bash
ALLOWED_ORIGINS=https://site1.com,https://site2.com,https://site3.com
```

### Email Domain Setup (Resend)

Before sending emails in production, you must verify your domain on Resend.

#### Why Use a Subdomain? (RECOMMENDED)

Resend strongly recommends using **subdomains** instead of your top-level domain:

✅ **Good examples:**
- `mail.yourdomain.com`
- `notifications.yourdomain.com`
- `updates.yourdomain.com`

❌ **Avoid:**
- `yourdomain.com` (can hurt your main domain's email reputation)

**Benefits of subdomains:**
- Isolates sending reputation (protects your main domain)
- Communicates intent more clearly to recipients
- Follows email industry best practices

#### Domain Verification Steps

1. **Choose your sending domain**
   - Use a subdomain (e.g., `mail.yourdomain.com`)

2. **Add domain to Resend**
   - Go to https://resend.com/domains
   - Click "Add Domain"
   - Enter your subdomain

3. **Add DNS records**

   Resend will provide two essential DNS records:

   **SPF (Sender Policy Framework):**
   - Authorizes Resend's servers to send email from your domain
   - Type: `TXT`
   - Example: `v=spf1 include:_spf.resend.com ~all`

   **DKIM (DomainKeys Identified Mail):**
   - Provides cryptographic authentication for your emails
   - Type: `TXT`
   - Resend provides the specific value

4. **Wait for verification**
   - DNS propagation typically takes 5-30 minutes
   - Resend automatically verifies once records are detected
   - Check verification status on the Resend dashboard

5. **Allow the sender address in Conduit**
   ```bash
   # Use an address on your verified domain; the first one is the default sender
   API_KEY_MYSITE_FROM_ADDRESSES=noreply@mail.yourdomain.com
   ```
   Your frontend can then omit `from`, or send `"from": { "email": "noreply@mail.yourdomain.com", "name": "Your Company Name" }`. Any address not in the list is rejected with `400 SENDER_NOT_ALLOWED`.

#### Testing Without Domain Verification

For development and testing, use Resend's test sender (no verification needed): leave `API_KEY_<NAME>_FROM_ADDRESSES` unset and omit `from` in requests. Conduit then sends as `Conduit <onboarding@resend.dev>`. (Without an allowlist, a request that sets `from` is rejected with `400 SENDER_NOT_ALLOWED`.)

**Limitations of test domain:**
- ⚠️ Only for testing/development
- ⚠️ Resend only delivers it to your own Resend account address
- ⚠️ Low sending limits
- ⚠️ May be marked as spam
- ⚠️ Cannot receive replies

#### Common Domain Errors

**Error:** `"The yourdomain.com domain is not verified"`
- **Cause:** Email address domain doesn't match verified domain on Resend
- **Fix:** Either verify the domain or use `onboarding@resend.dev` for testing

**Error:** `"DNS records not found"`
- **Cause:** DNS records not added or not propagated yet
- **Fix:** Double-check DNS records and wait up to 30 minutes

## API Reference

### POST /api/send

Send a message via any channel.

**Headers**:
```http
Content-Type: application/json
X-API-Key: your-api-key
X-Source-Origin: https://yoursite.com
Idempotency-Key: contact-7f3c2a91   (optional)
```

`Idempotency-Key` is optional: 1-200 characters of `A-Z a-z 0-9 . _ : -` (anything else returns `400 VALIDATION_ERROR`). Retrying with the same key and body (for example after a `502 PROVIDER_TIMEOUT`) does not send the email twice within Resend's idempotency window. Keys are scoped per configured API key (by its `API_KEY_<NAME>` name), so different frontends never collide.

`X-Source-Origin` is only used for the CORS check when the request has no `Origin` header (a server-side proxy or gateway calling Conduit). Browsers always send `Origin`, which must be in `ALLOWED_ORIGINS`; a disallowed `Origin` gets `403 ORIGIN_NOT_ALLOWED` whatever `X-Source-Origin` says.

**Request Body**:
```json
{
  "channel": "email",               // Only "email" is implemented
  "templateId": "contact-form",
  "to": "recipient@example.com",
  "from": { "email": "...", "name": "..." },  // Optional, must be in API_KEY_<NAME>_FROM_ADDRESSES
  "replyTo": "customer@example.com",          // Optional
  "data": { ... }                   // Template data
}
```

**Success Response (200)**:
```json
{
  "success": true,
  "messageId": "msg_abc123",
  "channel": "email",
  "timestamp": "2025-10-05T10:30:00Z"
}
```

Outside production, responses for keys with LLM filtering also include an `llmAnalysis` object; it is never returned when `NODE_ENV=production`.

**Error Response (400/401/403/413/429/502/503)**:
```json
{
  "success": false,
  "error": "Invalid channel: sms. Supported channels: email",
  "code": "INVALID_CHANNEL"
}
```

Common codes: `400 VALIDATION_ERROR` (invalid body, malformed JSON or template data), `400 INVALID_CHANNEL`, `400 SENDER_NOT_ALLOWED`, `401 UNAUTHORIZED`, `403 ORIGIN_NOT_ALLOWED`, `403 RECIPIENT_NOT_ALLOWED`, `403 CONTENT_BLOCKED_*`, `413 PAYLOAD_TOO_LARGE` (body over 50KB), `429 RATE_LIMIT_EXCEEDED`, `502 PROVIDER_ERROR` / `PROVIDER_TIMEOUT`, `503 LLM_PROVIDER_ERROR` / `LLM_BUDGET_EXCEEDED`. See the [API Reference](api-reference.md) for the full list.

### GET /health

Public health check endpoint.

**Response (200)**:
```json
{
  "status": "healthy"
}
```

**Note**: For detailed diagnostics (memory, uptime, channel status), use `GET /health/detailed` (requires authentication).

### GET /api/channels

**⚠️ Future Feature (Phase 2+)** - Not yet implemented.

List available channels and their templates.

**Response (200)**:
```json
{
  "channels": [
    {
      "id": "email",
      "name": "Email",
      "status": "active",
      "provider": "Resend",
      "templates": ["contact-form"]
    },
    {
      "id": "sms",
      "name": "SMS",
      "status": "coming_soon",
      "provider": "Twilio",
      "templates": []
    }
  ]
}
```

## Troubleshooting

### Email not sending

**Check 1: Verify API key**
```bash
curl -X POST https://conduit.yourdomain.com/api/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "X-Source-Origin: https://yoursite.com" \
  -d '{
    "channel": "email",
    "templateId": "contact-form",
    "to": "test@example.com",
    "data": {"name": "Test", "email": "test@example.com", "message": "Test"}
  }'
```

**Check 2: Verify CORS origin**
```bash
ALLOWED_ORIGINS=https://yoursite.com  # Must match exactly
```

**Check 3: Check Resend dashboard**
- Log in to [resend.com](https://resend.com)
- Go to Emails → check for failed deliveries

**Check 4: Check rate limits**

A rate-limited request returns `429 RATE_LIMIT_EXCEEDED` with a `Retry-After` header and a `retryAfter` field (seconds):
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42
```

**Check 5: Check the sender**

`400 SENDER_NOT_ALLOWED` means the request set `from` but `from.email` is not in the key's `API_KEY_<NAME>_FROM_ADDRESSES` (or the key has none). Add the address, or omit `from`.

### Invalid channel error

**Error**: `Invalid channel: sms. Supported channels: email` (`400 INVALID_CHANNEL`)

**Cause**: Trying to use a channel that is not implemented (SMS and Push are planned for Phase 2).

**Solution**: Use `"channel": "email"` for now, or wait for Phase 2.

### CORS errors

**Error**: `Access to fetch has been blocked by CORS policy`, or `403 ORIGIN_NOT_ALLOWED` from Conduit

**Solution**: Add your exact origin to `ALLOWED_ORIGINS`:
```bash
ALLOWED_ORIGINS=https://yoursite.com
```

**Note**: Must match exactly (including protocol, no trailing slash).

## Roadmap & Future Features

### Phase 1: Email (Available Now) ✅
- Email via Resend
- Contact form template
- API authentication & rate limiting

### Phase 2: SMS & Push (Planned) 📱
- SMS via Twilio
- Push notifications via Firebase
- WhatsApp Business API
- Multi-channel templates

### Phase 3: Webhooks (Planned) 🌐
- HTTP webhooks
- Slack integration
- Discord integration
- Custom integrations

### Phase 4: Advanced (Planned) 🚀
- Analytics dashboard
- Delivery tracking & webhooks
- Retry policies & DLQ
- Visual template builder
- Scheduled sending
- A/B testing

Want a feature sooner? [Open an issue](https://github.com/eldtechnologies/conduit/issues) or contribute!

## Security Best Practices

### ✅ DO

- Keep API keys in `.env` files (never commit)
- Use HTTPS for Conduit deployment
- Rotate API keys every 6 months (reject old keys immediately with `REVOKED_KEYS`)
- Set `NODE_ENV=production` in production
- Set strict CORS origins
- Monitor logs for suspicious activity
- Use different API keys per frontend

### ❌ DON'T

- Commit `.env` files to Git
- Use same API key across all sites
- Allow all origins with `*`
- Expose provider API keys (Resend, Twilio, etc.)
- Skip rate limiting
- Use HTTP in production

## Performance Tips

### Optimize Response Time
```typescript
// Show immediate feedback
const [sending, setSending] = useState(false);

const handleSubmit = async (data) => {
  setSending(true);
  const success = await sendEmail(data);
  setSending(false);

  if (success) {
    alert('Message sent!');
  }
};
```

### Handle Errors Gracefully
```typescript
const sendWithRetry = async (data, retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try {
      const success = await sendEmail(data);
      if (success) return true;
    } catch (error) {
      if (i === retries) return false;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return false;
};
```

### Retry Safely with Idempotency-Key

Send the same `Idempotency-Key` header on every retry of one submission, so a retry after a timeout does not deliver the email twice:
```typescript
const idempotencyKey = crypto.randomUUID(); // once per form submission
// ...then on every attempt:
headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY, 'Idempotency-Key': idempotencyKey }
```

### Prevent Double-Submission
```typescript
const [isSubmitting, setIsSubmitting] = useState(false);

const handleSubmit = async (data) => {
  if (isSubmitting) return;

  setIsSubmitting(true);
  await sendEmail(data);
  setIsSubmitting(false);
};

return <button disabled={isSubmitting}>Send</button>;
```

## Monitoring

### Check Health Status
```bash
curl https://conduit.yourdomain.com/health
```

### View Logs (Coolify)
1. Open Conduit service in Coolify
2. Go to "Logs" tab
3. Look for structured JSON logs

### Monitor Deliveries
- **Email**: [Resend dashboard](https://resend.com)
- **SMS**: Twilio console (Phase 2)
- **Push**: Firebase console (Phase 2)

## Upgrading

### Updating Conduit
```bash
# Pull latest changes
git pull origin main

# Rebuild
docker build -t conduit .

# Restart (or redeploy in Coolify)
```

### Breaking Changes
Check release notes on [GitHub](https://github.com/eldtechnologies/conduit/releases) before upgrading.

`channel` is required on every request (there is no default).

## Support

- **Documentation**: [API Reference](api-reference.md) | [Architecture](architecture.md) | [Security](security/)
- **Issues**: [GitHub Issues](https://github.com/eldtechnologies/conduit/issues)
- **Discussions**: [GitHub Discussions](https://github.com/eldtechnologies/conduit/discussions)

## License

MIT License - free to use, modify, and distribute.

---

**Made with ❤️ by ELD Technologies**

*One API for all your communication needs*
