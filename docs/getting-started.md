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
   NODE_ENV=production
   RESEND_API_KEY=re_your_key_here
   # Paste the output of: npm run generate-key -- MYSITE (see Step 3)
   API_KEY_MYSITE=<output of: npm run generate-key -- MYSITE>
   API_KEY_MYSITE_FROM_ADDRESSES=noreply@mail.yourdomain.com
   ALLOWED_ORIGINS=https://yoursite.com
   ```
4. Deploy (Coolify auto-detects the Dockerfile)
5. Set custom domain: `conduit.yourdomain.com`

**`NODE_ENV` defaults to `development`.** Production deployments must run with `NODE_ENV=production`: it enables HTTPS enforcement with HSTS and hides internal error details. The Docker image already sets it; set it yourself on any platform that does not build from the Dockerfile. With `NODE_ENV=production`, every route except `GET /health` requires `X-Forwarded-Proto: https`, so Conduit must run behind a reverse proxy that sets that header (Coolify's proxy does).

### Option B: Docker (Local Development)

```bash
# Clone the repository
git clone https://github.com/eldtechnologies/conduit.git
cd conduit

# Create .env file (replace the example key with your own, see Step 3)
cat > .env << 'EOF'
NODE_ENV=development
RESEND_API_KEY=re_your_key_here
API_KEY_MYSITE=KEY_MYSITE_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1
ALLOWED_ORIGINS=http://localhost:8080,https://yoursite.com
PORT=3000
EOF

# Build and run
docker build -t conduit .
docker run -p 3000:3000 --env-file .env conduit

# Test it's running
curl http://localhost:3000/health
```

**Why `NODE_ENV=development`?** The Docker image (and `docker compose`) default to `NODE_ENV=production`, which rejects every plain-HTTP request except `GET /health` with `403 HTTPS Required`. For a local run without a TLS proxy, set `NODE_ENV=development` in `.env`. Keep comments in `.env` on their own lines: `docker run --env-file` does not strip trailing `# comments` from values.

The server validates every `API_KEY_*` variable at startup and refuses to start if a variable is neither a known per-key setting nor a valid key (for example a typo like `API_KEY_MYSITE_RECIPIENT=support@yoursite.com`), or if a per-key variable's `API_KEY_<NAME>` is not set. Check the container logs if it exits immediately.

### Option C: Node.js (without Docker)

```bash
npm ci
npm run build                      # compiles to dist/
npm start                          # runs dist/index.js, loading .env when present
```

`npm start` and `npm run dev` (hot reload) load `.env` from the current directory when it exists (Node's `--env-file-if-exists`); variables already set in the shell take precedence. Without a `.env` file Node prints `.env not found. Continuing without it.` and uses the shell environment. Set `NODE_ENV=production` when running this way in production.

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
npm run generate-key -- MYSITE

# or, without cloning the repository:
node -e "console.log('KEY_MYSITE_' + require('crypto').randomBytes(16).toString('hex'))"
```

Example output: `KEY_MYSITE_a8f9d2c1b4e6f7a9b8c7d6e5f4a3b2c1`

Keys must have the form `KEY_<NAME>_<random>` (uppercase name, at least 12 random letters or digits). Any other value in an `API_KEY_*` variable stops the server at startup.

**Add to Conduit environment:**

```bash
API_KEY_MYSITE=<output of: npm run generate-key -- MYSITE>
API_KEY_PORTFOLIO=<output of: npm run generate-key -- PORTFOLIO>
```

**⚠️ Security Note:** Never use `Math.random()` for API keys - it's not cryptographically secure.

### Allow a Sender Address (`from`)

The sender address is controlled by the operator, not the client. List the addresses each key may send from:

```bash
# First address is the default sender when a request omits `from`
API_KEY_MYSITE_FROM_ADDRESSES=noreply@mail.yourdomain.com,support@mail.yourdomain.com
```

- A request whose `from.email` is not in the list is rejected with HTTP 400 `SENDER_NOT_ALLOWED`.
- **Without this variable, any request that sets `from` is rejected with 400 `SENDER_NOT_ALLOWED`**, and requests without `from` are sent as `Conduit <onboarding@resend.dev>` (Resend's test sender, for testing only).
- Addresses must be on a domain you have verified in Resend.
- `from.name` may not contain `<`, `>`, `"`, `@` or line breaks.

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
API_KEY_WEBSITE=<output of: npm run generate-key -- WEBSITE>
API_KEY_NEWSLETTER=<output of: npm run generate-key -- NEWSLETTER>

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
- `API_KEY_WEBSITE_RECIPIENTS` etc. require `API_KEY_WEBSITE` to be set, otherwise startup fails
- An empty list or an invalid address/domain (e.g. `@company.com` or `*.company.com`) also fails startup; to allow all recipients, remove the variables

**See full guide**: **[Recipient Whitelisting Documentation](features/recipient-whitelisting.md)**

## Step 5: Configure LLM Spam Filtering (Optional but Recommended)

**What it does**: Uses AI to analyze message content and block spam, phishing, abuse, and prompt injection attacks before they reach your inbox.

**Providers**: Claude Haiku 5.5 (recommended, via OpenRouter or Anthropic), Claude Haiku 4.5, or OpenAI GPT
**Latency and cost**: one LLM call per filtered message, made while the request waits. Choose a fast model and keep `LLM_TIMEOUT` tight; cost depends on your model's pricing. See [Performance & Cost](features/llm-spam-filtering.md#performance--cost).

### Quick Setup

**1. Get an LLM API key:**
- **OpenRouter (Recommended, tested with Claude Haiku 5.5)**: [openrouter.ai](https://openrouter.ai) - one key for many providers
- **Anthropic**: [console.anthropic.com](https://console.anthropic.com)
- **OpenAI**: [platform.openai.com](https://platform.openai.com)

**2. Add to Conduit environment:**

```bash
# Global provider settings (all three are required to turn filtering on)
# Recommended: Claude Haiku 5.5 through OpenRouter (OpenAI-compatible)
LLM_PROVIDER=openai
LLM_ENDPOINT=https://openrouter.ai/api/v1/chat/completions
LLM_API_KEY=sk-or-v1-...
LLM_MODEL=anthropic/claude-haiku-5.5
# or direct Anthropic: LLM_PROVIDER=anthropic, LLM_API_KEY=sk-ant-..., LLM_MODEL=claude-haiku-4-5-20251001
# or OpenAI: LLM_PROVIDER=openai, LLM_API_KEY=sk-..., LLM_MODEL=<an OpenAI model>

# Enable per API key
API_KEY_MYSITE_LLM_ENABLED=true
# Block when model confidence >= threshold (0-1, default 0.7)
API_KEY_MYSITE_LLM_THRESHOLD=0.7
# On provider errors or exhausted budget: allow (fail open) or block (fail closed)
API_KEY_MYSITE_LLM_FAIL_MODE=block
# Daily cap on LLM calls for this key (default 1000)
API_KEY_MYSITE_LLM_MAX_CALLS_PER_DAY=1000
# Optional: categories to check (default: all except profanity)
API_KEY_MYSITE_LLM_RULES=spam,abuse,phishing,scam,promptInjection
```

Only `anthropic` and `openai` are supported. If a key sets `_LLM_ENABLED=true` but `LLM_PROVIDER`, `LLM_API_KEY` or `LLM_MODEL` is missing, the server refuses to start. `_LLM_FAIL_MODE` defaults to `LLM_FALLBACK_MODE` (default `allow`); any value other than `allow` or `block` fails startup. Threshold values outside 0-1 are ignored and the default 0.7 is used.

**3. What gets checked** (enable or disable with `_LLM_RULES`):
- `spam` - marketing spam and bulk email
- `phishing` - credential harvesting attempts
- `abuse` - hate speech and harassment
- `profanity` - offensive language (off by default)
- `promptInjection` - prompt injection attacks
- `scam` - social engineering and scams

Blocked messages return HTTP 403 with a `CONTENT_BLOCKED_*` error code. Content is checked only after the request and template data pass validation and the sender check, so invalid requests never cost an LLM call.

**4. Budget and failure handling:**
Set `_LLM_MAX_CALLS_PER_DAY` to control costs (the count resets at midnight UTC). When the daily limit is reached, or the provider fails or times out:
- `_LLM_FAIL_MODE=allow`: Messages pass through without LLM analysis (fail open)
- `_LLM_FAIL_MODE=block`: Messages are rejected with HTTP 503 (`LLM_BUDGET_EXCEEDED` or `LLM_PROVIDER_ERROR`) to prevent unfiltered spam (fail closed)

**See full guide**: **[LLM Spam Filtering Documentation](features/llm-spam-filtering.md)**

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
        // `from` omitted: Conduit uses the first address in API_KEY_MYSITE_FROM_ADDRESSES.
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
      subject: (formData.get('subject') as string) || undefined,
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
      <input name="subject" placeholder="Subject (optional)" />
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

## Next Steps

✅ **You're all set!** Conduit is now handling secure email delivery for your frontend.

### Learn More

- **[User Guide](user-guide.md)** - Complete integration guide with more examples (Vue, advanced patterns)
- **[API Reference](api-reference.md)** - Full API specification and available templates
- **[Architecture](architecture.md)** - Understand how Conduit works under the hood
- **[Security](security/)** - Security best practices and hardening
- **[Spam Prevention](security/spam-prevention.md)** - Protect against bots and form abuse (quick 15-min setup)
- **[Recipient Whitelisting](features/recipient-whitelisting.md)** - Prevent stolen key abuse (95% risk reduction)

### Common Issues

**"CORS error" / 403 `ORIGIN_NOT_ALLOWED`**
- Ensure your origin is in `ALLOWED_ORIGINS` exactly (including protocol, no trailing slash)
- Example: `ALLOWED_ORIGINS=https://yoursite.com,https://www.yoursite.com`

**"HTTPS Required" (403)**
- `NODE_ENV=production` (the Docker default) requires `X-Forwarded-Proto: https` on every route except `GET /health`
- Run behind a TLS-terminating proxy, or set `NODE_ENV=development` for local plain-HTTP testing

**"Invalid API key" (401 `UNAUTHORIZED`)**
- Verify the key in Conduit's environment matches the key in your frontend
- Check for extra spaces or line breaks

**400 `SENDER_NOT_ALLOWED`**
- The request set `from`, but `from.email` is not in `API_KEY_<NAME>_FROM_ADDRESSES` (or the key has no sender allowlist)
- Add the address to the allowlist, or omit `from` to use the key's default sender

**Server exits at startup**
- Read the error: it names the offending variable (for example an invalid `API_KEY_*` value, a per-key variable without its `API_KEY_<NAME>`, or a missing `LLM_*` setting)

**"Email not sending"**
- Check Resend dashboard for delivery status
- Verify `RESEND_API_KEY` is set correctly
- Check Conduit logs for errors

### Need Help?

- [GitHub Issues](https://github.com/eldtechnologies/conduit/issues)
- [Documentation](README.md)
