# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] — 2026-05-14

### Security

- **Hardened API key loader in `src/config.ts`** to no longer treat `API_KEY_*_LLM_*` and `API_KEY_*_RECIPIENT*` configuration env vars as candidate API keys. The previous loader accepted any env var starting with `API_KEY_` as a literal key value, which on deployments using LLM-filter configuration could widen the set of accepted `X-API-Key` header values beyond the operator's intent. Loader now matches against an explicit allowlist of suffixes for configuration variables.
- **Restored LLM spam filter rule loading**, which was silently inactive in v1.2.0 through v1.2.2 due to an off-by-one in the env-var-name parser. `config.llmFilterRules` was always empty, so the LLM-filter middleware short-circuited and forwarded every request. Filtering now functions as documented in [docs/features/llm-spam-filtering.md](docs/features/llm-spam-filtering.md). Deployments that configured `API_KEY_*_LLM_ENABLED=true` will begin actually invoking the configured LLM provider — review LLM budget limits before upgrading.
- **45 dependency advisories resolved** via OSV/npm-audit:
  - `hono` 4.10.3 → 4.12.18 (12 advisories)
  - `@hono/node-server` 1.19.5 → 1.19.13 (2 advisories)
  - `isomorphic-dompurify` 2.16.0 → 3.12.0 (8 dompurify advisories incl. mXSS bypasses)
  - `vite` removed from production dependencies (was unused; vitest now provides it as devDep at the patched version)
  - Dev-only chain: `ajv`, `brace-expansion`, `flatted`, `minimatch`, `picomatch`, `postcss`, `rollup` patched via `npm audit fix`
  - Post-release: `osv-scanner scan .` → No issues found; `npm audit` → 0 vulnerabilities

### Changed

- **`LLM_RULES` env var parsing is now case-insensitive.** Category names in `API_KEY_*_LLM_RULES` are matched against the canonical camelCase keys via a lowercase lookup map, so `promptinjection`, `PROMPTINJECTION`, and `promptInjection` all enable the `promptInjection` category. Previously the parser lowercased the input then performed a case-sensitive membership check against camelCase keys, so any camelCase category in env config was silently ignored.
- **Node runtime requirement bumped to `>=20.19.0`** (was `>=20.0.0`) to satisfy `isomorphic-dompurify@3`'s engine constraint. Node 20.0–20.18 is no longer supported.
- **Docker base image bumped to `node:22-alpine`** (was `node:20-alpine`) in both builder and runtime stages.
- **CI `npm-audit` job upgraded to Node 22** (was 18) for engine compatibility.

### Fixed

- **`npm run build` exits 0** for the first time in several releases. Pre-existing test-file TypeScript errors that were leaking into the production `tsc` invocation have been resolved by adding Hono `Variables` typing to test fixtures and narrowing untrusted request-body access in `src/middleware/recipientValidation.ts` and `src/routes/send.ts`.
- **All 13 pre-existing test failures resolved.** Suite now reports 263/263 passing across 18 files (was 245/258).
- TypeScript errors in `src/llm/providers/{anthropic,openai}.ts` JSON-extraction paths (regex capture groups under `noUncheckedIndexedAccess`).

### Added

- `tests/helpers/response.ts` — typed JSON helper (`readJson<T>`) and shared response types (`SuccessResponse`, `ErrorResponse`, `AppVariables`) for use across the test suite.
- `SendRequestBody` type in `src/types/api.ts` to type untrusted request bodies pre-Zod-validation.
- Five new unit tests in `tests/unit/config.test.ts` covering `LLM_RULES` case-insensitivity and unknown-category resilience.

### Internal

- Lint baseline reduced from 77 problems to 0 across `src/` and `tests/`.
- TypeScript error count reduced from 133 to 0.
- Docs: Node version references in `CLAUDE.md`, `README.md`, `TODO.md`, `docs/architecture.md`, `docs/api-reference.md`, and `docs/security/implementation.md` updated to match the new runtime.
- Resend SDK now mocked at the `global.fetch` boundary in tests that exercise the send pipeline; this unblocks integration tests that previously failed with 502 PROVIDER_ERROR.

### Upgrade notes

- **Hosts on Node 20.0–20.18 must upgrade to 20.19+ or 22+ before installing.** `npm install` will surface `EBADENGINE` on older 20.x.
- **Deployments using LLM filtering**: filtering will now actually run. Verify `API_KEY_*_LLM_MAX_CALLS_PER_DAY` budgets match expected traffic. If a key had `LLM_ENABLED=true` set "for future use" but no provider credentials configured, that key will now hit the configured `LLM_FALLBACK_MODE` (default `allow`) for every request, consuming whatever budget the LLM provider charges for a failed call.
- **Deployments with mixed-case `LLM_RULES` env values**: behavior is now correct (categories are actually enabled). Audit your `API_KEY_*_LLM_RULES` env vars and confirm the set of enabled categories matches intent.

[Full changelog](https://github.com/eldtechnologies/conduit/compare/v1.2.2...v1.3.0)

## [1.2.2] — 2026-02-25

### Security

Updated Hono 4.10.3 → 4.12.2, resolving 6 known CVEs (JWT/JWK algorithm confusion, JWT HS256 default, path traversal in serveStatic, cache control bypass, IPv4 validation bypass, ErrorBoundary JSX XSS, timing attack in basicAuth/bearerAuth). None were exploitable in Conduit's architecture — all affected Hono middleware (JWT, cache, serveStatic, IP restriction, basicAuth/bearerAuth, JSX) is unused; Conduit uses custom middleware throughout. Preventative hygiene update.

### Maintenance

- Fixed GitHub branch ruleset that was blocking all PR merges.
- Closed 9 stale Dependabot PRs and cleaned up branches.

## [1.2.1] — 2025-10-28

### Security

- Patched `hono` 4.10.2 → 4.10.3 (GHSA-q7jf-gf43-6x6p, CVSS 6.5 medium).
- 0 known vulnerabilities (`npm audit` + `osv-scanner`).

### Notes

- No breaking changes; backward compatible with v1.2.0.
- Maintenance release; all v1.2.0 features unchanged.

## [1.2.0] — 2025-10-22

### Added

- **LLM-powered spam filtering** as a major new feature.
  - AI content moderation via Anthropic Claude or OpenAI GPT.
  - Configurable per API key with custom rules and thresholds.
  - Detects spam, abuse, profanity, phishing, scams, and prompt injection.
  - Fail-open / fail-closed modes for reliability.
  - Budget limits to control LLM costs (~$0.0005 per message).
  - Sender whitelisting to skip trusted senders.
  - See `docs/features/llm-spam-filtering.md` for the complete guide.
- Comprehensive LLM spam filtering guide (13KB) and feature planning framework under `docs/features/`.

### Security

- Patched `hono` 4.9.9 → 4.10.2 (CVSS 8.1 high).
- Patched `vite` 7.1.9 → 7.1.11 (CVSS 6.0 medium).
- 0 known vulnerabilities.

### Notes

- Backward compatible with v1.1.0. LLM filtering is optional and disabled by default.

## [1.1.0] — 2025-10-15

### Added

- **Recipient whitelisting** to prevent stolen API keys from sending to arbitrary recipients.
  - Per-API-key email and domain whitelists via environment variables.
  - ~95% risk reduction for stolen-key abuse scenarios.
  - Fully backward compatible (no whitelist = allow all recipients).
- Security documentation (~108KB): Spam Prevention Guide, Advanced Protections, Recipient Whitelisting Guide.
- Feature planning framework with the LLM-spam-filtering proposal that landed in v1.2.0.

### Quality

- 237 tests passing.

## [1.0.2] — 2025-10-12

### Security

- Updated vitest ecosystem to 3.2.4; resolved esbuild advisory GHSA-67mh-4wv8-2f99.
- `npm audit`: 0 vulnerabilities. `osv-scanner`: no issues.
- 223 tests passing.

## [1.0.1] — 2025-10-05

### Added — Phase 1: Email channel (production-ready)

- Email delivery via [Resend](https://resend.com).
- Contact form template with XSS sanitization and header-injection prevention.
- API key authentication with constant-time comparison.
- Rate limiting (10/min, 100/hr, 500/day per key) via token-bucket algorithm.
- CORS protection with strict origin whitelisting + `X-Source-Origin` for proxies.
- HTTPS enforcement with HSTS, request body size limits (50KB), security headers (CSP, X-Frame-Options, etc.), Zod input validation, DOMPurify XSS sanitization.
- Structured JSON logging with request/response tracking.
- Public `/health` endpoint + authenticated `/health/detailed`.
- 223 passing tests at 87.51% coverage.

## [1.0.0]

Initial release. (No release notes published; superseded by v1.0.1.)

[1.3.0]: https://github.com/eldtechnologies/conduit/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/eldtechnologies/conduit/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/eldtechnologies/conduit/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/eldtechnologies/conduit/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/eldtechnologies/conduit/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/eldtechnologies/conduit/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/eldtechnologies/conduit/releases/tag/v1.0.1
