# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Conduit** is a lightweight, secure multi-channel communication proxy for sending emails, SMS, push notifications, and webhooks from frontend applications without exposing API keys.

**Current Status**: Phase 0 Complete - Project setup finished, ready for core implementation.

**Tech Stack** (planned):
- Runtime: Node.js 18+
- Framework: Hono (ultra-lightweight web framework)
- Language: TypeScript
- Email Provider: Resend.com (Phase 1)
- Deployment: Docker + Coolify

## Core Architecture

**For detailed architecture diagrams and component interactions, see [docs/architecture.md](docs/architecture.md).**

### Multi-Channel System Design

Conduit uses a unified API endpoint (`POST /api/send`) for all communication channels. Channel selection is determined by the `channel` field in the request body:

```typescript
// Unified request structure
{
  "channel": "email|sms|push|webhook",
  "templateId": "template-name",
  "to": "recipient",
  "data": { /* template-specific data */ }
}
```

### System Architecture Overview

```
Client Apps → HTTPS → [CORS] → [Auth] → [Rate Limit] → [Logger]
                         ↓
              Channel Router → Template Validator
                         ↓
    [Email|SMS|Push|Webhook] Handler → Provider API
```

See [docs/architecture.md](docs/architecture.md) for complete request flow diagrams and middleware pipeline details.

### Key Architectural Patterns

1. **Template System**: Templates are organized by channel in `src/templates/{channel}/`. Each template exports:
   - Template ID
   - Channel type
   - Validation schema (Zod)
   - Template rendering function (subject/html for email, body for SMS, etc.)

2. **Channel Handlers**: Channel implementations in `src/channels/` handle provider-specific logic:
   - `email.ts` - Resend integration
   - `sms.ts` - Twilio integration (Phase 2)
   - `push.ts` - Firebase Cloud Messaging (Phase 2)
   - `webhook.ts` - HTTP webhooks (Phase 3)

3. **Security Layers**:
   - API key authentication via `X-API-Key` header
   - CORS protection with strict origin whitelisting
   - Rate limiting per API key across ALL channels (token bucket algorithm)
   - Provider API keys stored in environment variables only

4. **Middleware Stack** (in order):
   - CORS validation (`middleware/cors.ts`)
   - API key authentication (`middleware/auth.ts`)
   - Rate limiting (`middleware/rateLimit.ts`)
   - Request logging (`middleware/logger.ts`)

## Security

**⚠️ CRITICAL: Review [docs/security/](docs/security/) before implementing any code.**

### Security Checklist for Implementation

**MANDATORY for Phase 1 (MVP)**:
- [ ] HTTPS enforcement with HSTS header
- [ ] Request size limit (50KB max body size)
- [ ] Cryptographically secure API key generation (`crypto.randomBytes`, NOT `Math.random()`)
- [ ] Constant-time API key comparison (`timingSafeEqual`)
- [ ] XSS sanitization for all user input (`isomorphic-dompurify`)
- [ ] Security headers (X-Content-Type-Options, X-Frame-Options, CSP, etc.)
- [ ] Template field length limits (Zod schema validation)
- [ ] Provider API timeouts (10s timeout, AbortSignal)
- [ ] Split health endpoint (public `/health` vs authenticated `/health/detailed`)
- [ ] Error sanitization in production (hide stack traces)

**RECOMMENDED for Phase 2**:
- [ ] IP-based rate limiting (secondary protection)
- [ ] Circuit breaker for provider APIs (prevent cascading failures)
- [ ] API key revocation mechanism (env var or Redis)
- [ ] Dependency scanning in CI/CD (`npm audit`)
- [ ] Container security scanning (`trivy` or `docker scan`)

### Critical Security Patterns

**API Key Validation** (middleware/auth.ts):
```typescript
import { timingSafeEqual } from 'crypto';

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

**XSS Sanitization** (utils/sanitize.ts):
```typescript
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
}
```

**Template Rendering** (always sanitize):
```typescript
html: (data) => `<p>Name: ${sanitizeHtml(data.name)}</p>`
```

See [docs/security/implementation.md](docs/security/implementation.md) for complete implementation details and copy-paste ready code examples.

## Development Workflow

### Project Structure (planned)

```
src/
├── index.ts              # Hono app entry point
├── routes/
│   ├── send.ts          # POST /api/send handler
│   ├── health.ts        # GET /health handler
│   └── channels.ts      # GET /api/channels (Phase 2+)
├── middleware/
│   ├── auth.ts          # API key validation
│   ├── cors.ts          # CORS handling
│   ├── rateLimit.ts     # Rate limiting
│   └── logger.ts        # Request logging
├── channels/            # Channel implementations
│   ├── email.ts         # Resend integration
│   ├── sms.ts           # Twilio (Phase 2)
│   ├── push.ts          # Firebase (Phase 2)
│   ├── webhook.ts       # HTTP webhooks (Phase 3)
│   └── index.ts         # Channel registry
├── templates/
│   ├── email/           # Email templates
│   ├── sms/             # SMS templates (Phase 2)
│   ├── push/            # Push templates (Phase 2)
│   └── index.ts         # Template registry
├── utils/
│   ├── validation.ts    # Input validators
│   └── errors.ts        # Custom error types
└── config.ts            # Environment config
```

### Commands (once implemented)

**Development**:
```bash
npm install          # Install dependencies
npm run dev          # Start dev server with hot reload
npm run build        # Build TypeScript to dist/
npm start            # Run production build
```

**Testing** (to be set up):
```bash
npm test                    # Run all tests
npm run test:watch          # Run tests in watch mode
npm run test -- <file>      # Run specific test file
```

**Docker**:
```bash
docker build -t conduit .                          # Build image
docker run -p 3000:3000 --env-file .env conduit   # Run container
```

**Deployment**:
```bash
# Coolify auto-deploys from Git on push to main
# Manual deploy: push to main branch
```

## Implementation Guidelines

### Adding New Email Templates

Templates must follow this structure:

```typescript
export interface YourTemplateData {
  field1: string;
  field2: string;
  optionalField?: string;
}

export const yourTemplate = {
  id: 'template-id',
  channel: 'email',
  subject: (data: YourTemplateData) => `Subject with ${data.field1}`,
  html: (data: YourTemplateData) => `HTML template using ${data.field2}`,
  validate: (data: unknown): data is YourTemplateData => {
    // Use Zod schema for validation
  }
};
```

### Adding New Channels (Phase 2+)

1. Create handler in `src/channels/{channel}.ts`
2. Implement provider-specific sending logic
3. Add templates in `src/templates/{channel}/`
4. Register channel in `src/channels/index.ts`
5. Update health check response in `src/routes/health.ts`
6. Add environment variables for provider credentials

### Security Requirements

**API Key Format**: `KEY_<frontend-name>_<random-suffix>`
- Example: `KEY_ELDTECH_a8f9d2c1b4e6`
- Stored in environment variables: `API_KEY_ELDTECH=KEY_ELDTECH_...`

**Rate Limits** (per API key across all channels):
- 10 requests per minute
- 100 requests per hour
- 500 requests per day

**CORS**: Strict whitelisting only - no wildcards in production.

### Error Handling

Standard error codes (see CONDUIT_SPEC.md:660):
- `UNAUTHORIZED` (401) - Invalid/missing API key
- `INVALID_CHANNEL` (400) - Unsupported channel
- `INVALID_TEMPLATE` (400) - Template not found
- `VALIDATION_ERROR` (400) - Invalid input data
- `RATE_LIMIT_EXCEEDED` (429) - Too many requests
- `PROVIDER_ERROR` (502) - Third-party provider failure
- `INTERNAL_ERROR` (500) - Unexpected error

All error responses follow this structure:
```json
{
  "success": false,
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "retryAfter": 60  // Optional, for rate limits
}
```

## Environment Configuration

Required environment variables are documented in CONDUIT_SPEC.md:384. Key variables:

- `RESEND_API_KEY` - Email provider (Phase 1)
- `API_KEY_*` - One per frontend application
- `ALLOWED_ORIGINS` - Comma-separated list of allowed origins
- `PORT` - Server port (default: 3000)
- Rate limit overrides: `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_HOUR`, `RATE_LIMIT_PER_DAY`

## Phased Development

**Phase 1 (MVP)**: Email only via Resend
- Contact form template
- Basic authentication & rate limiting
- CORS protection

**Phase 2**: SMS (Twilio) + Push (Firebase)
**Phase 3**: Webhooks + integrations (Slack, Discord)
**Phase 4**: Advanced features (analytics, scheduled sending, A/B testing)

## Reference Documentation

### Primary Documentation
- **[docs/README.md](docs/README.md)**: Documentation hub - start here for navigation
- **[docs/getting-started.md](docs/getting-started.md)**: 5-minute quick start guide
- **[docs/architecture.md](docs/architecture.md)**: System architecture diagrams, request flows, component interactions
- **[docs/api-reference.md](docs/api-reference.md)**: Complete technical specification, API design, configuration
- **[docs/user-guide.md](docs/user-guide.md)**: User-facing documentation, integration examples
- **[docs/security/](docs/security/)**: Security documentation (overview, review, implementation)

### Quick Reference

**Architecture** ([docs/architecture.md](docs/architecture.md)):
- High-level system architecture with visual diagrams
- Complete request flow (client → middleware → channel → provider)
- Security boundary layers
- Middleware pipeline execution order
- Channel system and template engine details
- Rate limiting algorithm (token bucket)
- Scalability considerations

**Security** ([docs/security/](docs/security/)):
- **[README.md](docs/security/README.md)**: Overview, checklist, philosophy
- **[review.md](docs/security/review.md)**: 7 critical gaps, 10+ enhancements, threat model, compliance
- **[implementation.md](docs/security/implementation.md)**: Step-by-step guide with code examples

**Implementation Order**:
1. Read [docs/architecture.md](docs/architecture.md) to understand system design
2. Read [docs/security/README.md](docs/security/README.md) for security checklist
3. Follow Security Checklist in CLAUDE.md (this file) during implementation
4. Reference [docs/api-reference.md](docs/api-reference.md) for detailed API specifications
5. Use [docs/security/implementation.md](docs/security/implementation.md) for security code examples
6. Reference [docs/user-guide.md](docs/user-guide.md) for integration examples

## Coding Standards & Conventions

### TypeScript Configuration
- **Strict Mode**: ALL strict TypeScript flags enabled (noImplicitAny, strictNullChecks, etc.)
- **Target**: ES2022
- **Module**: ESNext with bundler resolution
- **Path Aliases**: `@/*` → `src/*` for cleaner imports
- **Files**: Include src/, tests/, scripts/ in tsconfig.json

### Code Style
- **Format**: Prettier with these rules:
  - Semicolons: required
  - Single quotes: yes
  - Trailing commas: ES5
  - Print width: 100 characters
  - Tab width: 2 spaces
  - Arrow parens: always
  - Line endings: LF

- **Linting**: ESLint 9 (flat config) with TypeScript integration
  - No `any` types allowed (`@typescript-eslint/no-explicit-any: error`)
  - No floating promises (`@typescript-eslint/no-floating-promises: error`)
  - No unused vars (except prefixed with `_`)
  - Console.log allowed only: `console.warn`, `console.error`, `console.info`
  - Always use `const` over `let`, never use `var`

### File Organization
```
src/
├── index.ts          # Main app, exports { port, fetch }
├── config.ts         # Environment config, loaded once at module level
├── middleware/       # One file per middleware
├── routes/           # One file per route group
├── channels/         # One file per channel (email, sms, etc.)
├── templates/        # Organized by channel: templates/{channel}/
├── utils/            # Shared utilities
└── types/            # TypeScript type definitions

tests/
├── setup.ts          # Test environment setup (vitest setupFiles)
├── unit/             # Unit tests (*.test.ts)
├── integration/      # Integration tests
└── security/         # Security-specific tests
```

### Naming Conventions
- **Files**: kebab-case (e.g., `api-key-generator.ts`, `rate-limit.ts`)
- **Functions**: camelCase (e.g., `generateApiKey`, `sanitizeHtml`)
- **Classes/Types**: PascalCase (e.g., `Config`, `CircuitBreaker`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `TIMEOUTS`, `MAX_RETRIES`)
- **Environment Variables**: UPPER_SNAKE_CASE with prefixes:
  - `API_KEY_*` for frontend API keys
  - `RESEND_API_KEY`, `TWILIO_*` for provider credentials
  - `ALLOWED_ORIGINS` for CORS
  - `RATE_LIMIT_*` for rate limiting config

### Testing Standards
- **Framework**: Vitest with globals enabled
- **Setup**: Environment variables in `tests/setup.ts` (loaded before all tests)
- **Structure**: Describe blocks for grouping, descriptive `it()` statements
- **Coverage Target**: 80%+ (enforced in vitest.config.ts)
- **Test Files**: `*.test.ts` in appropriate directory
- **Assertions**: Use Vitest's `expect()` API

**Example Test**:
```typescript
import { describe, it, expect } from 'vitest';

describe('FeatureName', () => {
  it('should do something specific', async () => {
    const result = await someFunction();
    expect(result).toBe(expected);
  });
});
```

### Security Patterns (MANDATORY)
- **API Key Generation**: ALWAYS use `crypto.randomBytes(16)`, NEVER `Math.random()`
- **API Key Comparison**: ALWAYS use `timingSafeEqual` from Node crypto (constant-time)
- **HTML Sanitization**: ALWAYS use `DOMPurify.sanitize()` before rendering user input
- **Input Validation**: ALWAYS use Zod schemas with explicit length limits
- **Error Handling**: ALWAYS sanitize errors in production (hide stack traces)

**Example Security Code**:
```typescript
import { randomBytes, timingSafeEqual } from 'crypto';
import DOMPurify from 'isomorphic-dompurify';

// API key generation (scripts/generate-api-key.ts)
const key = `KEY_${appName}_${randomBytes(16).toString('hex')}`;

// Constant-time comparison (middleware/auth.ts)
if (a.length !== b.length) return false;
return timingSafeEqual(Buffer.from(a), Buffer.from(b));

// XSS sanitization (templates/email/*)
const safe = DOMPurify.sanitize(userInput, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
```

### Module Imports
- **ES Modules**: Use `.js` extension in imports (TypeScript requires this for ESM)
  ```typescript
  import { config } from './config.js';  // ✓ Correct
  import { config } from './config';     // ✗ Wrong
  ```
- **Path Aliases**: Use `@/` for src imports in tests:
  ```typescript
  import app from '@/index.js';          // ✓ From tests
  import { auth } from '../middleware/auth.js';  // ✓ Relative within src
  ```

### Environment Configuration
- **Loading**: All config in `src/config.ts`, loaded once at module level
- **Validation**: Throw errors for missing required variables
- **Defaults**: Provide sensible defaults for optional variables
- **Types**: Export strongly-typed `Config` interface
- **Access**: Import `config` object, never access `process.env` directly in application code

**Example Config**:
```typescript
export const config: Config = {
  port: parseInt(getEnvVar('PORT', '3000'), 10),
  nodeEnv: getEnvVar('NODE_ENV', 'development') as Config['nodeEnv'],
  resendApiKey: getEnvVar('RESEND_API_KEY'), // Required, no default
};
```

### Error Handling
- **Custom Errors**: Create error classes extending `Error`
- **Error Codes**: Use enum for standardized error codes (see docs/api-reference.md)
- **Sanitization**: Hide internal errors in production (use `sanitizeError()` utility)
- **Logging**: Always log full error with stack trace, return sanitized version to client

### Middleware Order (CRITICAL)
Apply middleware in this exact order:
1. Security Headers (enforceHttps, securityHeaders)
2. CORS (validate origin)
3. Body Limit (for /api/* routes)
4. Authentication (for /api/* routes)
5. Rate Limiting (for /api/* routes)
6. Request Logger (structured JSON logging)

### Git Workflow
- **Commits**: Small, atomic commits with clear messages
- **Branches**: Feature branches off `main`
- **Messages**: Descriptive commit messages (present tense, imperative mood)
- **Pre-commit**: Run `npm run lint && npm run format:check` before committing

### Scripts Available
```bash
npm run dev           # Development server with hot reload (tsx watch)
npm run build         # Compile TypeScript to dist/
npm start             # Run production build from dist/
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Generate coverage report (80% required)
npm run lint          # Run ESLint on src/ and tests/
npm run lint:fix      # Auto-fix ESLint issues
npm run format        # Auto-format with Prettier
npm run format:check  # Check formatting without fixing
npm run generate-key  # Generate secure API key: npm run generate-key -- APPNAME
```

### Documentation
- **JSDoc**: Add JSDoc comments for public functions and complex logic
- **Inline Comments**: Explain "why" not "what" (code should be self-documenting)
- **README Updates**: Update docs when adding features
- **CLAUDE.md**: Update this file when establishing new conventions
