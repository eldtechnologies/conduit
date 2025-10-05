# Conduit Implementation TODO

**Status**: Phase 2 Complete - Health & Basic Routes Next
**Last Updated**: 2025-10-05

---

## Phase 0: Project Setup ✅ COMPLETE

### 0.1 Initialize Node.js Project
- [x] Create `package.json` with project metadata
- [x] Install dependencies:
  - Core: `hono`, `zod`
  - Security: `isomorphic-dompurify`
  - Providers: `resend`
  - Dev: `typescript`, `tsx`, `@types/node`
  - Testing: `vitest`, `@vitest/ui`
  - Linting: `eslint`, `@typescript-eslint/*`, `prettier`

### 0.2 TypeScript Configuration
- [x] Create `tsconfig.json` with strict mode
- [x] Configure paths for imports
- [x] Set output directory to `dist/`

### 0.3 Project Structure
- [x] Create `src/` directory structure:
  ```
  src/
  ├── index.ts
  ├── config.ts
  ├── middleware/
  ├── routes/
  ├── channels/
  ├── templates/
  ├── utils/
  └── types/
  ```
- [x] Create `tests/` directory structure:
  ```
  tests/
  ├── setup.ts
  ├── unit/
  ├── integration/
  └── security/
  ```
- [x] Create `scripts/` directory for utilities

### 0.4 Development Configuration
- [x] Create `.env.example` with all required variables
- [x] Set up ESLint configuration (ESLint 9 flat config)
- [x] Set up Prettier configuration
- [x] Create `vitest.config.ts`
- [x] Add npm scripts to `package.json`:
  - `dev`: Development server with hot reload
  - `build`: Production build
  - `test`: Run tests
  - `test:watch`: Watch mode
  - `test:coverage`: Coverage report
  - `lint`: ESLint
  - `format`: Prettier
  - `generate-key`: API key generator

### 0.5 Initial Verification
- [x] Create minimal Hono app in `src/index.ts`
- [x] Add simple health check endpoint
- [x] Write first test to verify setup
- [x] Run `npm run build` successfully
- [x] Run `npm test` successfully
- [x] Update CLAUDE.md with coding standards and conventions

---

## Phase 1: Core Infrastructure ✅ COMPLETE

### 1.1 Configuration Management
- [x] Implement `src/config.ts`:
  - Environment variable loading
  - Validation for required env vars
  - Parse API keys (API_KEY_* pattern)
  - Parse ALLOWED_ORIGINS
  - Export TIMEOUTS constants
- [x] Write tests for config validation
- [x] Test missing required env vars throw errors

### 1.2 Type Definitions
- [x] Create `src/types/api.ts`:
  - `SendMessageRequest`
  - `SendMessageResponse`
  - `ErrorResponse`
  - `ErrorCode` enum
- [x] Create `src/types/channels.ts`:
  - `ChannelHandler` interface
  - Channel-specific request/response types
- [x] Create `src/types/templates.ts`:
  - `Template` interface
  - `RenderedTemplate` types

### 1.3 Error Handling
- [x] Implement `src/utils/errors.ts`:
  - Custom error classes (ConduitError, AuthError, ValidationError, RateLimitError, ProviderError, InternalError)
  - `sanitizeError()` function (hides details in production)
  - Error code mappings (ErrorCode enum)
  - `createErrorResponse()` helper
- [x] Write tests for error sanitization (16 tests)

### 1.4 Utility Functions
- [x] Implement `src/utils/sanitize.ts`:
  - `sanitizeHtml()` with DOMPurify (strips all HTML)
  - `sanitizeRichText()` (allows safe formatting tags)
  - `sanitizeEmail()`, `sanitizeUrl()`, `escapeHtml()`, `truncate()`
- [x] Write XSS sanitization tests (38 tests including attack vectors)

---

## Phase 2: Security Layer ✅ COMPLETE

**Priority**: CRITICAL - Implement before any routes

### 2.1 HTTPS Enforcement ✅
- [x] Implement `src/middleware/securityHeaders.ts`:
  - `enforceHttps()` middleware
  - HSTS header
  - Production vs development mode (checks process.env.NODE_ENV dynamically)
- [x] Write tests for HTTP rejection in production (12 tests total)
- [x] Test HSTS header presence

### 2.2 Security Headers ✅
- [x] Add `securityHeaders()` middleware:
  - X-Content-Type-Options
  - X-Frame-Options
  - X-XSS-Protection
  - Referrer-Policy
  - Permissions-Policy
  - Content-Security-Policy
- [x] Write tests for all headers

### 2.3 Error Handler ✅
- [x] Implement `src/middleware/errorHandler.ts`:
  - Global error handler for Hono
  - Catches ConduitError instances
  - Sanitizes errors in production
  - Returns proper JSON error responses

### 2.4 Authentication ✅
- [x] Implement `src/middleware/auth.ts`:
  - Extract X-API-Key header
  - Load valid keys from config
  - **Constant-time comparison** with timingSafeEqual
  - Attach API key to context
  - Return 401 for invalid keys
- [x] Implement revocation check (REVOKED_KEYS env var)
- [x] Write tests (11 tests total):
  - Valid key acceptance
  - Invalid key rejection
  - Missing key rejection
  - Revoked key rejection
  - **Timing attack resistance** (statistical test with 50% threshold)

### 2.5 CORS Protection ✅
- [x] Implement `src/middleware/cors.ts`:
  - Check Origin header against ALLOWED_ORIGINS
  - Set CORS headers for allowed origins
  - Handle preflight requests (OPTIONS with 204)
  - Return 401 for unauthorized origins
- [x] Write tests for CORS validation (15 tests total)

### 2.6 Rate Limiting ✅
- [x] Implement `src/middleware/rateLimit.ts`:
  - Token bucket algorithm
  - Per-API-key limits (minute/hour/day)
  - In-memory storage (Map)
  - Bucket refill logic
  - Return 429 with Retry-After header
- [x] Write tests (11 tests total):
  - Rate limit enforcement
  - Bucket refill behavior (7-second test)
  - Multiple API keys isolation
  - Rate limit headers

### 2.7 Request Logging ✅
- [x] Implement `src/middleware/logger.ts`:
  - Structured JSON logging
  - Mask sensitive data (PII, API keys, passwords, emails, phones)
  - Request/response logging with request ID
  - Duration tracking
- [x] Write tests for log masking (24 tests total)
- [x] Export masking functions for testing

**Implementation Notes**:
- All middleware uses Hono's Context/Next pattern
- Constant-time comparison prevents timing attacks
- PII masking ensures GDPR compliance
- Token bucket algorithm provides smooth rate limiting
- All tests passing: 144 total (including timing resistance tests)

---

## Phase 3: Health & Basic Routes 🏥

### 3.1 Health Endpoint
- [ ] Implement `src/routes/health.ts`:
  - Public `GET /health` (minimal info)
  - Authenticated `GET /health/detailed` (full diagnostics)
  - Channel status
  - Memory usage
  - Uptime
- [ ] Write tests for both endpoints

### 3.2 Main Application
- [ ] Update `src/index.ts`:
  - Initialize Hono app
  - Apply middleware in correct order:
    1. Security headers
    2. CORS
    3. Body limit (for /api/* routes)
    4. Auth (for /api/* routes)
    5. Rate limit (for /api/* routes)
    6. Logger
  - Mount health routes
  - Start server
- [ ] Add graceful shutdown handling

---

## Phase 4: Email Channel (MVP) 📧

### 4.1 Channel Infrastructure
- [ ] Create `src/channels/index.ts`:
  - Channel registry
  - `routeToChannel()` function
  - Template loading
  - Template validation
- [ ] Write tests for channel routing

### 4.2 Email Channel Implementation
- [ ] Implement `src/channels/email.ts`:
  - Resend SDK integration
  - `emailHandler` with send function
  - Timeout handling (10s)
  - Error handling
- [ ] Write tests:
  - Successful email send
  - Timeout handling
  - Provider error handling

### 4.3 Circuit Breaker (Optional for MVP)
- [ ] Implement `src/utils/circuitBreaker.ts`:
  - Circuit breaker class
  - OPEN/CLOSED/HALF_OPEN states
  - Failure threshold (5 failures)
  - Cooldown period (60s)
- [ ] Wrap email sending in circuit breaker
- [ ] Write tests for circuit breaker states

---

## Phase 5: Email Templates 📝

### 5.1 Template Infrastructure
- [ ] Create `src/templates/index.ts`:
  - Template registry
  - Template loader by ID
  - Template validator

### 5.2 Contact Form Template
- [ ] Implement `src/templates/email/contact-form.ts`:
  - Define `ContactFormData` interface
  - Zod schema with field limits
  - `validate()` function
  - `render()` function with:
    - Subject generation
    - HTML body with sanitization
    - Plain text version
- [ ] Write tests:
  - Validation (valid/invalid data)
  - XSS sanitization in rendered output
  - Subject generation

### 5.3 Template System Tests
- [ ] Integration tests for template loading
- [ ] Test template not found error

---

## Phase 6: Send Endpoint 🚀

### 6.1 Send Route Implementation
- [ ] Implement `src/routes/send.ts`:
  - Parse request body
  - Validate structure (channel, templateId, to, data)
  - Call `routeToChannel()`
  - Handle errors
  - Return success/error response
- [ ] Apply to main app

### 6.2 Integration Tests
- [ ] End-to-end test: Send valid email
- [ ] Test invalid channel
- [ ] Test invalid template
- [ ] Test invalid data
- [ ] Test rate limiting
- [ ] Test authentication
- [ ] Test CORS

---

## Phase 7: Docker & Deployment 🐳

### 7.1 Dockerfile
- [ ] Create multi-stage Dockerfile:
  - Builder stage (dependencies + build)
  - Production stage (Node.js 18 Alpine)
  - Non-root user
  - Health check
- [ ] Test Docker build
- [ ] Test Docker run with .env

### 7.2 Docker Compose (Development)
- [ ] Create `docker-compose.yml`:
  - Conduit service
  - Environment variables
  - Volume mounts for development
  - Port mapping
- [ ] Test docker-compose up

### 7.3 Deployment Documentation
- [ ] Update docs/getting-started.md with actual deployment steps
- [ ] Add Coolify deployment guide
- [ ] Add environment variable template

---

## Phase 8: Testing & Quality 🧪

### 8.1 Security Tests
- [ ] Implement all security tests from docs/security/implementation.md:
  - HTTPS enforcement
  - Payload size limits
  - Constant-time comparison
  - XSS sanitization
  - Security headers
  - Rate limiting
- [ ] Run security test suite

### 8.2 Code Coverage
- [ ] Set coverage target: 80%+
- [ ] Identify untested code paths
- [ ] Add missing tests
- [ ] Generate coverage report

### 8.3 Linting & Formatting
- [ ] Run ESLint, fix all issues
- [ ] Run Prettier, format all files
- [ ] Add pre-commit hooks (optional)

### 8.4 Load Testing (Optional)
- [ ] Create load test script
- [ ] Test rate limiting under load
- [ ] Test concurrent requests
- [ ] Measure response times

---

## Phase 9: Documentation & Examples 📚

### 9.1 API Key Generator Script
- [ ] Implement `scripts/generate-api-key.ts`
- [ ] Add to npm scripts
- [ ] Test key generation

### 9.2 Example Integration
- [ ] Create `examples/` directory
- [ ] Add React example
- [ ] Add Vanilla JS example
- [ ] Test examples against running server

### 9.3 README Updates
- [ ] Update root README with installation instructions
- [ ] Add badges (build status, coverage)
- [ ] Add example code that actually works

---

## Phase 10: Pre-Launch Checklist ✅

### 10.1 Security Audit
- [ ] Review all Phase 1 security checklist items
- [ ] Run `npm audit`
- [ ] Run container scan (Trivy)
- [ ] Verify all secrets in .env, not code

### 10.2 Production Readiness
- [ ] All tests passing
- [ ] No ESLint errors
- [ ] Code coverage > 80%
- [ ] Docker image builds successfully
- [ ] Health check works
- [ ] Graceful shutdown works
- [ ] Error responses are sanitized
- [ ] Logs don't contain secrets

### 10.3 Documentation
- [ ] All documentation up to date
- [ ] API examples tested
- [ ] Deployment guide verified
- [ ] Security documentation reviewed

### 10.4 Release
- [ ] Tag v1.0.0
- [ ] Create GitHub release
- [ ] Publish to npm (optional)
- [ ] Announce launch

---

## Future Phases (Post-MVP)

### Phase 11: SMS Channel (Phase 2 - Q1 2026)
- [ ] Twilio integration
- [ ] SMS templates
- [ ] Phone number validation
- [ ] SMS-specific rate limiting

### Phase 12: Push Notifications (Phase 2 - Q1 2026)
- [ ] Firebase Cloud Messaging integration
- [ ] Push templates
- [ ] Device token validation
- [ ] Platform detection (iOS/Android)

### Phase 13: Webhooks (Phase 3 - Q2 2026)
- [ ] HTTP webhook handler
- [ ] Slack integration
- [ ] Discord integration
- [ ] Signature verification

### Phase 14: Advanced Features (Phase 4 - Q3 2026)
- [ ] Analytics dashboard
- [ ] Delivery tracking
- [ ] Retry policies
- [ ] Scheduled sending
- [ ] A/B testing

---

## Notes

- **Security First**: All Phase 2 items MUST be completed before Phase 6 (send endpoint)
- **Test Coverage**: Maintain >80% coverage throughout development
- **Documentation**: Update docs as features are implemented
- **Git Commits**: Small, atomic commits with clear messages
- **Code Review**: Self-review each section before moving to next phase

---

**Next Step**: Complete Phase 0 (Project Setup)
