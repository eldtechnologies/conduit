# Conduit Integration Examples

This directory contains example integrations for Conduit showing how to send emails from various frontend frameworks.

## Examples

### React + TypeScript
**Location**: `react-typescript/ContactForm.tsx`

A fully-typed React component showing how to integrate Conduit with a contact form. Demonstrates:
- TypeScript type definitions for Conduit API
- Form state management with React hooks
- Loading states and error handling
- Form validation and disabled states

**Usage**:
```tsx
import { ContactForm } from './examples/react-typescript/ContactForm';

function App() {
  return <ContactForm />;
}
```

**Requirements**:
- React 18+
- TypeScript 4.9+

### Vanilla JavaScript
**Location**: `vanilla-js/contact-form.html`

A standalone HTML file with embedded JavaScript showing how to use Conduit with vanilla JS. Demonstrates:
- Form handling with native JavaScript
- Async/await with fetch API
- DOM manipulation for UI updates
- No framework dependencies

**Usage**:
Open `contact-form.html` in a browser or serve it with any static file server.

## Configuration

All examples require configuration of these values:

1. **CONDUIT_API_URL**: Your Conduit API endpoint
   ```javascript
   const CONDUIT_API_URL = 'https://your-conduit-api.com/api/send';
   ```

2. **API_KEY**: Your API key (generate with `npm run generate-key`)
   ```javascript
   const API_KEY = 'KEY_MYSITE_your_actual_key_here';
   ```

3. **DESTINATION_EMAIL**: Where contact form submissions should be sent
   ```javascript
   const DESTINATION_EMAIL = 'contact@yoursite.com';
   ```

## Security Notes

⚠️ **IMPORTANT**: Never commit your API keys to version control!

For production use:
- Store API keys in environment variables
- Use build-time replacement for API keys
- Configure CORS in Conduit to only allow your domain
- Use HTTPS for all requests

### Environment Variables (Recommended)

**React/Next.js**:
```bash
# .env.local
VITE_CONDUIT_API_URL=https://api.yoursite.com/api/send
VITE_CONDUIT_API_KEY=KEY_MYSITE_...
VITE_DESTINATION_EMAIL=contact@yoursite.com
```

**Access in code**:
```typescript
const CONDUIT_API_URL = import.meta.env.VITE_CONDUIT_API_URL;
const API_KEY = import.meta.env.VITE_CONDUIT_API_KEY;
```

## API Reference

### Request Format

```json
{
  "channel": "email",
  "templateId": "contact-form",
  "to": "recipient@example.com",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "message": "Hello, this is a test message.",
    "subject": "Optional custom subject"
  }
}
```

### Success Response (200)

```json
{
  "success": true,
  "messageId": "abc123",
  "channel": "email",
  "timestamp": "2025-10-05T12:00:00.000Z"
}
```

### Error Response (400/401/429/500)

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "retryAfter": 60
}
```

### Error Codes

- `UNAUTHORIZED`: Invalid or missing API key
- `VALIDATION_ERROR`: Invalid request data
- `RATE_LIMIT_EXCEEDED`: Too many requests (check `retryAfter` field)
- `PROVIDER_ERROR`: Email provider failure
- `INTERNAL_ERROR`: Server error

## Rate Limits

Default rate limits per API key:
- **10 requests per minute**
- **100 requests per hour**
- **500 requests per day**

When rate limited, you'll receive a 429 response with a `retryAfter` field indicating how many seconds to wait.

## Testing

For local testing, you can run Conduit locally:

```bash
# In the Conduit repository
npm run dev
```

Then update your example's API URL to:
```javascript
const CONDUIT_API_URL = 'http://localhost:3000/api/send';
```

## Support

For more information:
- [Conduit Documentation](../docs/README.md)
- [API Reference](../docs/api-reference.md)
- [User Guide](../docs/user-guide.md)
