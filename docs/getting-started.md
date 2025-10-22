# Getting Started with Conduit

Get Conduit up and running in 5 minutes.

## What You'll Need

- A [Resend.com](https://resend.com) account (free tier available)
- Docker or a hosting platform (Coolify, Railway, Render, etc.)
- A frontend application to integrate with

## Step 1: Get Your Resend API Key

1. Sign up at [resend.com](https://resend.com)
2. Go to **API Keys** in your dashboard
3. Click **Create API Key**
4. Copy the key (starts with `re_`)

## Step 2: Deploy Conduit

### Option A: Coolify (Recommended)

1. Create a new service in Coolify
2. Connect your Conduit Git repository
3. Add environment variables:
   ```bash
   RESEND_API_KEY=re_your_key_here
   API_KEY_MYSITE=KEY_MYSITE_generate_random_string
   ALLOWED_ORIGINS=https://yoursite.com
   ```
4. Deploy (Coolify auto-detects the Dockerfile)
5. Set custom domain: `conduit.yourdomain.com`

### Option B: Docker (Local Development)

```bash
# Clone the repository
git clone https://github.com/eldtechnologies/conduit.git
cd conduit

# Create .env file
cat > .env << 'EOF'
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

Expected response:
```json
{
  "status": "healthy"
}
```

## Step 3: Generate API Keys

Each frontend application needs its own API key.

**Generate securely with crypto.randomBytes:**

```bash
node -e "console.log('KEY_MYSITE_' + require('crypto').randomBytes(16).toString('hex'))"
```

Example output: `KEY_MYSITE_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1`

**Add to Conduit environment:**

```bash
API_KEY_MYSITE=KEY_MYSITE_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1
API_KEY_PORTFOLIO=KEY_PORTFOLIO_j9k2m5n8p4q8r2s6t9u3v7w1x5y9z3a7
```

**⚠️ Security Note:** Never use `Math.random()` for API keys - it's not cryptographically secure.

## Step 4: Configure Recipient Whitelisting (Optional but Recommended)

**What it does**: Prevents stolen API keys from being used to spam arbitrary recipients. Even if someone steals your Conduit API key, they can only send emails to addresses you've explicitly whitelisted.

**Risk reduction**: 95% - Stolen keys become nearly useless for spammers.

### Configuration Options

**Option A: Specific Email Addresses**

```bash
# Only allow emails to these specific addresses
API_KEY_MYSITE_RECIPIENTS=support@company.com,admin@company.com,sales@company.com
```

**Option B: Entire Domains**

```bash
# Allow emails to anyone at these domains
API_KEY_MYSITE_RECIPIENT_DOMAINS=company.com,subsidiary.com
```

**Option C: Both (Recommended)**

```bash
# Allow specific addresses AND all addresses at certain domains
API_KEY_MYSITE_RECIPIENTS=external@partner.com
API_KEY_MYSITE_RECIPIENT_DOMAINS=company.com
```

### Example Configuration

```bash
# .env file for Conduit

# Provider API keys
RESEND_API_KEY=re_your_key_here

# Frontend API keys
API_KEY_WEBSITE=KEY_WEBSITE_abc123xyz
API_KEY_NEWSLETTER=KEY_NEWSLETTER_def456xyz

# Recipient whitelisting (optional)
API_KEY_WEBSITE_RECIPIENTS=support@company.com,admin@company.com
API_KEY_WEBSITE_RECIPIENT_DOMAINS=company.com

API_KEY_NEWSLETTER_RECIPIENTS=newsletter@company.com
API_KEY_NEWSLETTER_RECIPIENT_DOMAINS=company.com

# CORS
ALLOWED_ORIGINS=https://yoursite.com,https://www.yoursite.com
```

**How it works:**
- If `API_KEY_*_RECIPIENTS` or `API_KEY_*_RECIPIENT_DOMAINS` is set, only whitelisted recipients are allowed
- If neither is set, all recipients are allowed (backward compatible)
- Requests to non-whitelisted recipients return HTTP 403 with error code `RECIPIENT_NOT_ALLOWED`

**See full guide**: **[Recipient Whitelisting Documentation](../features/recipient-whitelisting.md)**

## Step 5: Configure LLM Spam Filtering (Optional but Recommended)

**What it does**: Uses AI to analyze message content and block spam, phishing, abuse, and prompt injection attacks before they reach your inbox.

**Providers**: Anthropic Claude Haiku 4.5 (recommended) or OpenAI GPT
**Cost**: ~$0.0005 per message (~$0.50 per 1,000 messages)

### Quick Setup

**1. Get an LLM API key:**
- **Anthropic (Recommended)**: [console.anthropic.com](https://console.anthropic.com) - Claude Haiku 4.5 is fastest and cheapest
- **OpenAI (Alternative)**: [platform.openai.com](https://platform.openai.com)

**2. Add to Conduit environment:**

```bash
# LLM Provider API Keys (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
# or
OPENAI_API_KEY=sk-...

# Enable per API key
API_KEY_MYSITE_SPAM_FILTER_ENABLED=true
API_KEY_MYSITE_SPAM_FILTER_PROVIDER=anthropic  # or "openai"
API_KEY_MYSITE_SPAM_FILTER_THRESHOLD=70        # 0-100, higher = stricter
API_KEY_MYSITE_SPAM_FILTER_FAIL_MODE=open      # "open" or "closed"
API_KEY_MYSITE_SPAM_FILTER_BUDGET_DAILY=500    # USD cents (e.g., 500 = $5.00/day)

# Optional: Skip trusted senders
API_KEY_MYSITE_SPAM_FILTER_WHITELISTED_SENDERS=trusted@company.com,*@partner.com
```

**3. What gets blocked:**
- Marketing spam and bulk email
- Phishing and credential harvesting attempts
- Hate speech and harassment
- Prompt injection attacks
- Social engineering and scams
- Suspicious patterns and anomalies

**4. Budget protection:**
Set `SPAM_FILTER_BUDGET_DAILY` to control costs. Once the daily budget is reached:
- `fail_mode=open`: Messages pass through without LLM analysis (fail safe)
- `fail_mode=closed`: Messages are rejected to prevent unfiltered spam (fail secure)

**See full guide**: **[LLM Spam Filtering Documentation](../features/llm-spam-filtering.md)**

## Step 6: Integrate with Your Frontend

### React + TypeScript

**1. Add environment variables (.env):**

```bash
VITE_CONDUIT_URL=https://conduit.yourdomain.com
VITE_CONDUIT_API_KEY=KEY_MYSITE_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1
```

**⚠️ Do not commit .env to git!**

**2. Create a service (src/services/conduit.ts):**

```typescript
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
```

**3. Use in your component:**

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

### Vanilla JavaScript

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

## Next Steps

✅ **You're all set!** Conduit is now handling secure email delivery for your frontend.

### Learn More

- **[User Guide](user-guide.md)** - Complete integration guide with more examples (Vue, advanced patterns)
- **[API Reference](api-reference.md)** - Full API specification and available templates
- **[Architecture](architecture.md)** - Understand how Conduit works under the hood
- **[Security](security/)** - Security best practices and hardening
- **[Spam Prevention](security/spam-prevention.md)** - Protect against bots and form abuse (quick 15-min setup)
- **[Recipient Whitelisting](../features/recipient-whitelisting.md)** - Prevent stolen key abuse (95% risk reduction)

### Common Issues

**"CORS error"**
- Ensure your origin is in `ALLOWED_ORIGINS` exactly (including protocol, no trailing slash)
- Example: `ALLOWED_ORIGINS=https://yoursite.com,https://www.yoursite.com`

**"Invalid API key"**
- Verify the key in Conduit's environment matches the key in your frontend
- Check for extra spaces or line breaks

**"Email not sending"**
- Check Resend dashboard for delivery status
- Verify `RESEND_API_KEY` is set correctly
- Check Conduit logs for errors

### Need Help?

- [GitHub Issues](https://github.com/eldtechnologies/conduit/issues)
- [Documentation](README.md)
