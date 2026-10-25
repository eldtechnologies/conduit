# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Conduit** is a lightweight, secure multi-channel communication proxy for sending emails, SMS, push notifications, and webhooks from frontend applications without exposing API keys.

**Current Status**: Phase 1 (email) complete and production ready - v2.0.0-rc.1 (security hardening release candidate). Implemented: email via Resend, recipient whitelisting (v1.1.0), optional LLM spam filtering (v1.2.0), per-key sender allowlist. SMS, push and webhook channels are planned and not implemented.

**Tech Stack**:
- Runtime: Node.js 20.19+ (Docker image and CI use Node 22)
- Framework: Hono 4 (ultra-lightweight web framework) with `@hono/node-server` 2
- Language: TypeScript 5 (strict)
- Validation: Zod 4
- Email Provider: Resend.com via the `resend` SDK 6 (Phase 1)
- Optional LLM spam filtering: Anthropic or OpenAI
- Tooling: Vitest 4, ESLint 10, Prettier 3
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
Client Apps → [Logger] → [HTTPS] → [CORS] → [Security Headers] → [Body Limit]
            → [Auth] → [Recipient Validation] → [Rate Limit]
                         ↓
   Send Route: channel → schema → sender allowlist → [LLM Filter, optional]
                         ↓
              Channel Router → Template Validator
                         ↓
    Email Handler → Resend API   (SMS/Push/Webhook: planned, not implemented)
```

See [docs/architecture.md](docs/architecture.md) for complete request flow diagrams and middleware pipeline details.

### Key Architectural Patterns

1. **Template System**: Templates are organized by channel in `src/templates/{channel}/`. Each template exports:
   - Template ID
   - Channel type
   - Validation schema (Zod)
   - Template rendering function (subject/html for email, body for SMS, etc.)

2. **Channel Handlers**: Channel implementations in `src/channels/` handle provider-specific logic:
   - `email.ts` - Resend integration (implemented)
   - `sms.ts` - Twilio integration (Phase 2, not implemented)
   - `push.ts` - Firebase Cloud Messaging (Phase 2, not implemented)
   - `webhook.ts` - HTTP webhooks (Phase 3, not implemented)

3. **Security Layers**:
   - API key authentication via `X-API-Key` header
   - CORS protection with strict origin whitelisting
   - Rate limiting per API key across ALL channels (token bucket algorithm)
   - Recipient whitelist and sender allowlist per API key
   - Optional LLM content filtering per API key
   - Provider API keys stored in environment variables only

4. **Middleware Stack**: see [Middleware Order (CRITICAL)](#middleware-order-critical) below and `src/index.ts`. LLM filtering is not middleware; `src/routes/send.ts` calls `filterContent()` after request validation.

## Security

**⚠️ CRITICAL: Review [docs/security/](docs/security/) before implementing any code.**

### Security Checklist for Implementation

**MANDATORY for Phase 1 (MVP)**:
- [x] HTTPS enforcement with HSTS header
- [x] Request size limit (50KB max body size) - `bodyLimit` middleware on `hono/body-limit`, also for chunked bodies, 413 `PAYLOAD_TOO_LARGE`
- [x] Cryptographically secure API key generation (`crypto.randomBytes`, NOT `Math.random()`)
- [x] Constant-time API key comparison (`timingSafeEqual`)
- [x] XSS sanitization for all user input (`escapeHtml` in the HTML body; `isomorphic-dompurify`-based `toPlainText`/`toHeaderText` for text body and subject)
- [x] Security headers (X-Content-Type-Options, X-Frame-Options, CSP, etc.)
- [x] Template field length limits (Zod schema validation)
- [x] Provider API timeouts (10s, aborts the Resend request via `AbortSignal.timeout`, 502 `PROVIDER_TIMEOUT`)
- [x] Split health endpoint (public `/health` vs authenticated `/health/detailed`)
- [x] Error sanitization in production (hide stack traces)

**RECOMMENDED for Phase 2**:
- [ ] IP-based rate limiting (secondary protection)
- [ ] Circuit breaker for provider APIs (prevent cascading failures)
- [x] API key revocation mechanism (`REVOKED_KEYS` env var; Redis-based revocation not implemented)
- [x] Dependency scanning in CI/CD (`npm audit`, OSV Scanner, Dependency Review in `.github/workflows/security.yml`)
- [ ] Container security scanning (`trivy` or `docker scan`)

### Critical Security Patterns

**API Key Validation** (middleware/auth.ts, abridged):
```typescript
import { timingSafeEqual } from 'crypto';

// Compare against EVERY configured key, never break early
let isValid = false;
for (const validKey of config.apiKeys) {
  if (apiKey.length === validKey.length) {
    if (timingSafeEqual(Buffer.from(apiKey), Buffer.from(validKey))) {
      isValid = true;
    }
  }
}
```

**XSS Sanitization** (utils/sanitize.ts): `escapeHtml()` for values inserted into HTML, `toPlainText()` for text/plain bodies, `toHeaderText()` for header values such as the subject (strips tags and CR/LF), `sanitizeHtml()` (DOMPurify, no tags/attributes) for stripping markup.

**Template Rendering** (always escape/sanitize):
```typescript
html: (data) => `<p>Name: ${escapeHtml(data.name)}</p>`,
text: (data) => `Name: ${toPlainText(data.name)}`,
subject: (data) => `Contact Form: ${toHeaderText(data.name)}`,
```

See [docs/security/implementation.md](docs/security/implementation.md) for complete implementation details and copy-paste ready code examples.

## Development Workflow

### Project Structure

```
src/
├── index.ts              # Hono app entry point, middleware order, server startup
├── config.ts             # Environment config (Zod), strict API_KEY_* loading
├── routes/
│   ├── send.ts          # POST /api/send handler (calls the LLM filter)
│   └── health.ts        # GET /health and GET /health/detailed
├── middleware/
│   ├── errorHandler.ts  # Global error handler
│   ├── securityHeaders.ts # HTTPS enforcement + security headers
│   ├── cors.ts          # CORS handling
│   ├── logger.ts        # Request logging (masked)
│   ├── bodyLimit.ts     # 50KB body limit
│   ├── auth.ts          # API key validation
│   ├── recipientValidation.ts # JSON parse + recipient whitelist
│   ├── rateLimit.ts     # Rate limiting
│   └── llmFilter.ts     # LLM content filter (filterContent, not mounted as middleware)
├── channels/
│   ├── email.ts         # Resend integration + sender allowlist
│   └── index.ts         # Channel registry
├── templates/
│   ├── email/contact-form.ts # Only template so far
│   └── index.ts         # Template registry
├── llm/                 # LLM providers (anthropic, openai)
├── types/               # api.ts, channels.ts, templates.ts
└── utils/
    ├── errors.ts        # Custom error types
    ├── log.ts           # Leveled console logging (LOG_LEVEL)
    ├── sanitize.ts      # HTML escaping / plain-text helpers
    └── version.ts       # App version from package.json
```

Planned, not implemented: `routes/channels.ts` (`GET /api/channels`), `channels/{sms,push,webhook}.ts`, `templates/{sms,push}/`.

### Commands

**Development**:
```bash
npm install          # Install dependencies
npm run dev          # Start dev server with hot reload (loads .env when present)
npm run build        # Build TypeScript to dist/
npm start            # Run production build (loads .env when present)
```

**Testing**:
```bash
npm test                    # Run all tests
npm run test:watch          # Run tests in watch mode
npm run test -- <file>      # Run specific test file
```

**Docker**:
```bash
docker build -t conduit .                          # Build image
docker run -p 3000:3000 --env-file .env conduit   # Run container (NODE_ENV=production: HTTPS required)
docker run -p 3000:3000 --env-file .env -e NODE_ENV=development conduit  # Local plain HTTP
```

`docker-compose.yml` also defaults `NODE_ENV` to `production`.

**Deployment**:
```bash
# Coolify auto-deploys from Git on push to main
# Manual deploy: push to main branch
```

## Implementation Guidelines

### Adding New Email Templates

Templates implement `EmailTemplate<TData>` from `src/types/templates.ts` (see `src/templates/email/contact-form.ts`) and are registered in `src/templates/index.ts` as `email:<template-id>`:

```typescript
const yourSchema = z.object({
  field1: z.string().min(1).max(100),
  field2: z.string().min(1).max(5000),
  optionalField: z.string().max(200).optional(),
});
export type YourTemplateData = z.infer<typeof yourSchema>;

export const yourTemplate: EmailTemplate<YourTemplateData> = {
  id: 'template-id',
  channel: 'email',
  schema: yourSchema,
  validate: (data) => yourSchema.parse(data), // throws ZodError -> 400 VALIDATION_ERROR
  subject: (data) => `Subject with ${toHeaderText(data.field1)}`,
  html: (data) => `<p>${escapeHtml(data.field2)}</p>`,
  text: (data) => toPlainText(data.field2),
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
- Enforced at startup (`src/config.ts`): every `API_KEY_*` var must be either a recognised per-key config var (`API_KEY_<NAME>_RECIPIENTS`, `_LLM_ENABLED`, ...) for a configured key, or a key whose value matches `KEY_<NAME>_<12+ alphanumeric chars>`. Anything else fails startup.

**Rate Limits** (per API key across all channels):
- 10 requests per minute
- 100 requests per hour
- 500 requests per day

**CORS**: Strict whitelisting only - no wildcards in production.

### Error Handling

Error codes are defined in `ErrorCode` (`src/types/api.ts`); the full table with HTTP statuses is in [docs/api-reference.md](docs/api-reference.md#error-codes). Main codes:
- `UNAUTHORIZED` (401) - Missing, invalid or revoked API key
- `INVALID_CHANNEL` (400) - Unsupported channel
- `INVALID_TEMPLATE` (400) - Template not found
- `VALIDATION_ERROR` (400) - Invalid input data, malformed JSON
- `SENDER_NOT_ALLOWED` (400) - `from` not in the key's sender allowlist
- `ORIGIN_NOT_ALLOWED` (403) - Origin not in `ALLOWED_ORIGINS`
- `RECIPIENT_NOT_ALLOWED` (403) - Recipient not in the key's whitelist
- `CONTENT_BLOCKED_*` (403) - Blocked by the LLM filter
- `PAYLOAD_TOO_LARGE` (413) - Body over 50KB
- `RATE_LIMIT_EXCEEDED` (429) - Too many requests
- `PROVIDER_ERROR` / `PROVIDER_TIMEOUT` (502) - Resend failure / 10s timeout
- `LLM_PROVIDER_ERROR` / `LLM_BUDGET_EXCEEDED` (503) - LLM failure or budget used up, in `block` fail mode
- `PROVIDER_UNAVAILABLE` (503) - Channel provider not configured
- `INTERNAL_ERROR` (500) - Unexpected error

All error responses follow this structure:
```json
{
  "success": false,
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "details": {},    // Optional, omitted in production
  "retryAfter": 60  // Optional, for 429 and 503 with a retry hint (also sent as the Retry-After header)
}
```

## Environment Configuration

All environment variables are documented in [docs/api-reference.md](docs/api-reference.md#environment-variables) (source of truth: `envSchema` and `API_KEY_CONFIG_SUFFIXES` in `src/config.ts`). Key variables:

- `RESEND_API_KEY` - Email provider (required)
- `API_KEY_*` - One per frontend application (at least one required)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed origins (required)
- `PORT` - Server port (default: 3000)
- `LOG_LEVEL` - `debug`|`info`|`warn`|`error` (case-insensitive, default `info`; invalid values fail startup)
- `NODE_ENV` - default `development`; set `production` in production (HTTPS enforcement, HSTS, error sanitization)
- `ENFORCE_HTTPS` - `true` also enforces HTTPS outside production; `REVOKED_KEYS` - comma-separated revoked keys
- Rate limit overrides: `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_HOUR`, `RATE_LIMIT_PER_DAY`
- LLM filtering (optional): `LLM_PROVIDER` (`anthropic`|`openai`), `LLM_API_KEY`, `LLM_MODEL`, `LLM_TIMEOUT` (default 5000), `LLM_FALLBACK_MODE` (default `allow`), `LLM_ENDPOINT`; per key `API_KEY_*_LLM_ENABLED`, `_LLM_RULES`, `_LLM_THRESHOLD`, `_LLM_FAIL_MODE`, `_LLM_MAX_CALLS_PER_DAY`. Startup fails if a key enables LLM filtering while `LLM_PROVIDER`/`LLM_API_KEY`/`LLM_MODEL` are incomplete, if `_LLM_THRESHOLD` is not a number in 0-1, `_LLM_MAX_CALLS_PER_DAY` is not a positive integer or `_LLM_FAIL_MODE` is not `allow`/`block`, and if `API_KEY_*_LLM_WHITELIST_SENDERS` (removed) is set.
- Recipient whitelisting (v1.1.0, optional):
  - `API_KEY_*_RECIPIENTS` - Comma-separated list of allowed email addresses
  - `API_KEY_*_RECIPIENT_DOMAINS` - Comma-separated list of allowed domains
  - An empty list or an invalid entry fails startup
- Sender allowlist (optional): `API_KEY_*_FROM_ADDRESSES` - Comma-separated allowed `from` addresses (validated at startup; first is the default sender). Without it, any client `from` is rejected with 400 `SENDER_NOT_ALLOWED`.

## Phased Development

**Phase 1 (MVP)**: Email only via Resend - **complete**
- Contact form template
- Authentication (with revocation) & rate limiting
- CORS protection
- Recipient whitelisting, sender allowlist, optional LLM spam filtering

**Phase 2**: SMS (Twilio) + Push (Firebase) - planned, not implemented
**Phase 3**: Webhooks + integrations (Slack, Discord) - planned, not implemented
**Phase 4**: Advanced features (analytics, scheduled sending, A/B testing) - planned, not implemented

## Reference Documentation

### Primary Documentation
- **[docs/README.md](docs/README.md)**: Documentation hub - start here for navigation
- **[docs/getting-started.md](docs/getting-started.md)**: 5-minute quick start guide
- **[docs/architecture.md](docs/architecture.md)**: System architecture diagrams, request flows, component interactions
- **[docs/api-reference.md](docs/api-reference.md)**: Complete technical specification, API design, configuration
- **[docs/user-guide.md](docs/user-guide.md)**: User-facing documentation, integration examples
- **[docs/security/](docs/security/)**: Security documentation (overview, implementation, spam prevention; historical reviews in `archive/`)

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
- **[archive/review-pre-v1.0.0.md](docs/security/archive/review-pre-v1.0.0.md)**: Archived pre-v1.0.0 review (7 critical gaps, 10+ enhancements, threat model, compliance); historical, not current status
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
- **Files**: `tsconfig.json` includes src/, tests/, scripts/ (typecheck with `npx tsc --noEmit`); `tsconfig.build.json` compiles only src/ to dist/ (`npm run build`)

### Code Style
- **Format**: Prettier with these rules:
  - Semicolons: required
  - Single quotes: yes
  - Trailing commas: ES5
  - Print width: 100 characters
  - Tab width: 2 spaces
  - Arrow parens: always
  - Line endings: LF

- **Linting**: ESLint 10 (flat config) with typescript-eslint (`recommendedTypeChecked`)
  - No `any` types allowed (`@typescript-eslint/no-explicit-any: error`)
  - No floating promises (`@typescript-eslint/no-floating-promises: error`)
  - No unused vars (except prefixed with `_`)
  - Console: only `console.warn`, `console.error`, `console.info` (`no-console` warns on others). Application code logs through `log.info`/`log.warn`/`log.error` from `src/utils/log.ts`, which applies `LOG_LEVEL`
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
- **Files**: follow the existing directory: camelCase in `src/middleware/` (e.g., `rateLimit.ts`, `bodyLimit.ts`), kebab-case for templates and scripts (e.g., `contact-form.ts`, `generate-api-key.ts`)
- **Functions**: camelCase (e.g., `generateApiKey`, `sanitizeHtml`)
- **Classes/Types**: PascalCase (e.g., `Config`, `CircuitBreaker`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `TIMEOUTS`, `MAX_RETRIES`)
- **Environment Variables**: UPPER_SNAKE_CASE with prefixes:
  - `API_KEY_*` for frontend API keys
  - `RESEND_API_KEY`, `LLM_*` for provider credentials (`TWILIO_*` planned)
  - `ALLOWED_ORIGINS` for CORS
  - `RATE_LIMIT_*` for rate limiting config

### Testing Standards
- **Framework**: Vitest with globals enabled
- **Setup**: Environment variables in `tests/setup.ts` (loaded before all tests). It also installs a network guard: any unmocked `fetch` to a non-local host fails the test (mock with `tests/helpers/fetch.ts`)
- **Structure**: Describe blocks for grouping, descriptive `it()` statements
- **Coverage Target**: 80%+ lines/functions/branches/statements (thresholds in vitest.config.ts, enforced in CI via `npm run test:coverage`)
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
- **HTML Sanitization**: ALWAYS escape user input before rendering it into HTML (`escapeHtml`), and use `toPlainText`/`toHeaderText` (DOMPurify-based) for plain-text bodies and headers
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
const safeHtml = escapeHtml(userInput);   // HTML body
const safeText = toPlainText(userInput);  // text/plain body (DOMPurify strips tags)
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
- **Access**: Import `config` object, never access `process.env` directly in application code (existing exceptions: `NODE_ENV` checks in `index.ts`, `errorHandler.ts`, `securityHeaders.ts` and `logger.ts`)

**Example Config** (abridged from `src/config.ts`):
```typescript
const envSchema = z.object({
  PORT: z.string().default('3000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'), // Required, no default
});

export const config: Config = loadConfig(process.env);
```

### Error Handling
- **Custom Errors**: Create error classes extending `Error`
- **Error Codes**: Use enum for standardized error codes (see docs/api-reference.md)
- **Sanitization**: Hide internal errors in production (use `sanitizeError()` utility)
- **Logging**: Always log full error with stack trace, return sanitized version to client

### Middleware Order (CRITICAL)
Apply middleware in this exact order (see `src/index.ts`):
1. Request Logger (structured JSON logging) - first, so requests rejected by HTTPS enforcement or CORS (403) are logged too
2. HTTPS enforcement (`enforceHttps`)
3. CORS (validate origin, 403 on disallowed origins)
4. Security Headers (`securityHeaders`)
5. Body Limit (for /api/* routes, 413 on oversized bodies)
6. Authentication (for /api/* routes)
7. Recipient Validation (for /api/send route) - v1.1.0 - before rate limiting so 403'd recipients don't consume tokens
8. Rate Limiting (for /api/* routes) - MUST run before LLM filtering so 429'd requests never reach the LLM
9. LLM Filtering (for /api/send) - v1.2.0 - not a middleware: the send route calls `filterContent()` after validating the request schema and template data, so invalid requests never reach the LLM

### CI
- **`.github/workflows/ci.yml`** (push/PR to main): `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm run test:coverage` (80% thresholds), `npm run build`, check that `dist/index.js` exists, smoke test of the built server (`/health` with `NODE_ENV=production`), and a separate `docker build` job. All steps must pass.
- **`.github/workflows/security.yml`** (push/PR to main, daily at 02:00 UTC): `npm audit --audit-level=moderate`, OSV Scanner (`fail-on-vuln: true`), Dependency Review on PRs (fails on moderate+).

### Git Workflow
- **Commits**: Small, atomic commits with clear messages
- **Branches**: Feature branches off `main`
- **Messages**: Descriptive commit messages (present tense, imperative mood)
- **Pre-commit**: Run `npm run lint && npm run format:check` before committing

### Scripts Available
```bash
npm run dev           # Development server with hot reload (tsx watch, loads .env if present)
npm run build         # Compile TypeScript to dist/
npm start             # Run production build from dist/ (loads .env if present)
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
