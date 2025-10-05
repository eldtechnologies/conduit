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

### Phase 2: SMS & Push (Coming Soon) 📱
- Verification codes
- Alerts and notifications
- WhatsApp messages
- Mobile push notifications

### Phase 3: Webhooks (Coming Soon) 🌐
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
   - RESEND_API_KEY=re_your_key_here
   - API_KEY_MYSITE=KEY_MYSITE_generate_random_string
   - ALLOWED_ORIGINS=https://yoursite.com
4. Deploy (Coolify auto-detects the Dockerfile)
5. Set custom domain: conduit.yourdomain.com
```

#### Option B: Docker Locally
```bash
# Clone the repository
git clone https://github.com/yourusername/conduit.git
cd conduit

# Create .env file
cat > .env << EOF
RESEND_API_KEY=re_your_key_here
API_KEY_MYSITE=KEY_MYSITE_abc123xyz
ALLOWED_ORIGINS=http://localhost:8080,https://yoursite.com
PORT=3000
EOF

# Build and run
docker build -t conduit .
docker run -p 3000:3000 --env-file .env conduit

# Test it's running
curl http://localhost:3000/health
```

### 3. Generate API Keys for Your Frontends

Each frontend needs its own API key. Generate them securely:

```bash
# Generate a random API key
node -e "console.log('KEY_MYSITE_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15))"
```

Example output: `KEY_MYSITE_a8f9d2c1b4e6x7h3`

Add to your Conduit environment variables:
```bash
API_KEY_MYSITE=KEY_MYSITE_a8f9d2c1b4e6x7h3
API_KEY_PORTFOLIO=KEY_PORTFOLIO_j9k2m5n8p4q8
```

### 4. Integrate with Your Frontend

#### React + TypeScript

**Step 1: Add environment variable**
```bash
# .env (DO NOT COMMIT THIS FILE)
VITE_CONDUIT_URL=https://conduit.yourdomain.com
VITE_CONDUIT_API_KEY=KEY_MYSITE_a8f9d2c1b4e6x7h3
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
        to: 'hello@yourcompany.com',
        from: {
          email: 'noreply@yourcompany.com',
          name: 'Your Company',
        },
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

// Phase 2: Send SMS (coming soon)
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
      phone: formData.get('phone') as string,
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
      <input name="phone" placeholder="Phone (optional)" />
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
      from: { email: 'noreply@yourcompany.com', name: 'Your Company' },
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
const API_KEY = 'KEY_MYSITE_a8f9d2c1b4e6x7h3';

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
      from: { email: 'noreply@yourcompany.com', name: 'Your Company' },
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
    "email": "noreply@yourcompany.com",
    "name": "Your Company"
  },
  "replyTo": "customer@example.com",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "message": "I'd like to learn more about your services.",
    "phone": "+1 (555) 123-4567"
  }
}
```

### Phase 2: SMS (Coming Q2 2025) 📱

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

### Phase 2: Push Notifications (Coming Q2 2025) 🔔

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

### Phase 3: Webhooks (Coming Q3 2025) 🌐

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
| `RESEND_API_KEY` | Yes (Phase 1) | Your Resend API key for email | `re_abc123...` |
| `TWILIO_ACCOUNT_SID` | Yes (Phase 2) | Twilio Account SID for SMS | `ACxxx...` |
| `TWILIO_AUTH_TOKEN` | Yes (Phase 2) | Twilio Auth Token | `xxx...` |
| `FIREBASE_SERVER_KEY` | Yes (Phase 2) | Firebase Server Key for push | `AAAAxxx...` |
| `API_KEY_*` | Yes | API keys for frontends (at least one) | `KEY_SITE1_xyz789` |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed origins | `https://site1.com,https://site2.com` |
| `PORT` | No | Server port (default: 3000) | `3000` |
| `NODE_ENV` | No | Environment (default: production) | `production` |

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

## API Reference

### POST /api/send

Send a message via any channel.

**Headers**:
```http
Content-Type: application/json
X-API-Key: your-api-key
X-Source-Origin: https://yoursite.com
```

**Request Body**:
```json
{
  "channel": "email|sms|push|webhook",
  "templateId": "template-name",
  "to": "recipient",
  "from": { ... },  // Optional, channel-specific
  "data": { ... }   // Template data
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

**Error Response (400/401/429)**:
```json
{
  "success": false,
  "error": "Invalid channel",
  "code": "INVALID_CHANNEL"
}
```

### GET /health

Health check with channel status.

**Response (200)**:
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

### GET /api/channels

List available channels (Phase 2+).

**Response (200)**:
```json
{
  "channels": [
    {
      "id": "email",
      "name": "Email",
      "status": "active",
      "provider": "Resend",
      "templates": ["contact-form", "newsletter"]
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
    "from": {"email": "noreply@yourcompany.com", "name": "Test"},
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
```http
X-RateLimit-Remaining: 0  ← Hit the limit
X-RateLimit-Reset: 1642154460
```

### Invalid channel error

**Error**: `Invalid channel. Supported: email`

**Cause**: Trying to use a channel not yet available (SMS, Push coming in Phase 2).

**Solution**: Use `"channel": "email"` for now, or wait for Phase 2.

### CORS errors

**Error**: `Access to fetch has been blocked by CORS policy`

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

### Phase 2: SMS & Push (Q1 2026) 📱
- SMS via Twilio
- Push notifications via Firebase
- WhatsApp Business API
- Multi-channel templates

### Phase 3: Webhooks (Q2 2026) 🌐
- HTTP webhooks
- Slack integration
- Discord integration
- Custom integrations

### Phase 4: Advanced (Q3 2026) 🚀
- Analytics dashboard
- Delivery tracking & webhooks
- Retry policies & DLQ
- Visual template builder
- Scheduled sending
- A/B testing

Want a feature sooner? [Open an issue](https://github.com/yourusername/conduit/issues) or contribute!

## Security Best Practices

### ✅ DO

- Keep API keys in `.env` files (never commit)
- Use HTTPS for Conduit deployment
- Rotate API keys every 6 months
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
Check [CHANGELOG](CHANGELOG.md) before upgrading.

**v1.0 → v2.0**: `channel` parameter becomes required (no default).

## Support

- **Documentation**: [CONDUIT_SPEC.md](CONDUIT_SPEC.md)
- **Issues**: [GitHub Issues](https://github.com/yourusername/conduit/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/conduit/discussions)

## License

MIT License - free to use, modify, and distribute.

---

**Made with ❤️ by ELD Technologies**

*One API for all your communication needs*
