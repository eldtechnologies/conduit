# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **CORS uses `X-Source-Origin` only when `Origin` is absent.** A request whose `Origin` is present but not in `ALLOWED_ORIGINS` now gets 403 `ORIGIN_NOT_ALLOWED`, even if `X-Source-Origin` holds an allowed origin. Before, the header could override any disallowed `Origin`. Server-side proxies that send no `Origin` (or an empty one) and pass `X-Source-Origin` keep working.
- **Idempotency keys are scoped per configured key.** The key forwarded to Resend is prefixed with the authenticated app name (`<NAME>` from `API_KEY_<NAME>`, unique per key) instead of the `KEY_<NAME>` prefix of the key value, so two keys whose values share a prefix no longer share a namespace. The prefix changes from e.g. `KEY_MYSITE:` to `MYSITE:`, so a retry that spans the upgrade is not deduplicated.

### Breaking changes

**Operators** (startup):

- **More per-key settings fail startup instead of being ignored** ([#140](https://github.com/eldtechnologies/conduit/issues/140)). `API_KEY_*_LLM_THRESHOLD` must be a plain decimal from 0 to 1, e.g. `0.7` (a value such as `70` from the old 0-100 docs was ignored and `0.7` used) and `API_KEY_*_LLM_MAX_CALLS_PER_DAY` a positive integer (`0`, negative, fractional or non-numeric values were ignored and `1000` used). An empty `API_KEY_*_RECIPIENTS` or `_RECIPIENT_DOMAINS` (which silently blocked every recipient) and invalid entries (not an email address; not a plain domain such as `example.com`, e.g. `@example.com` or `*.example.com`, which could never match) fail startup too, like `_FROM_ADDRESSES` and `_LLM_FAIL_MODE` already did. All invalid LLM settings are reported at once. Errors name the variable, never its value.
- **`LOG_LEVEL` is validated** ([#140](https://github.com/eldtechnologies/conduit/issues/140)). It must be `debug`, `info`, `warn` or `error` (case-insensitive; empty or unset means `info`); any other value fails startup.

**API clients**:

- A disallowed `Origin` with an allowed `X-Source-Origin` returns **403 `ORIGIN_NOT_ALLOWED`** (it was allowed). Proxies that rewrite `Origin` to their own address must drop or pass through `Origin` instead.
- An unavailable channel provider returns **503 `PROVIDER_UNAVAILABLE`** instead of 400. It cannot happen for email, since `RESEND_API_KEY` is required at startup.
- Removed the `ErrorCode` members that were never returned: `INVALID_API_KEY`, `REVOKED_API_KEY`, `INVALID_REQUEST`, `MISSING_REQUIRED_FIELD`, `CORS_ERROR` and `LLM_TIMEOUT`. Responses are unchanged (a revoked key returns `UNAUTHORIZED`, an LLM timeout `LLM_PROVIDER_ERROR`); only code that imported these enum members is affected.

### Fixed

- **Anthropic provider reads the first `text` block** of the response instead of assuming `content[0]` is text. If a model ever puts another block (e.g. `thinking`) first, the verdict is still found. Before, such a response would have counted as a provider failure on every call: unfiltered sends in `allow` mode, refused sends in `block` mode.
- **`LOG_LEVEL` is applied** ([#140](https://github.com/eldtechnologies/conduit/issues/140)). It was parsed but never used. Messages below the configured level are now dropped: request/response lines and startup messages log at `info`, warnings (blocked content, fail-open fallbacks, rejected recipients) at `warn`, and errors at `error`. `debug` currently logs the same as `info`.
- **HTTPS and CORS rejections are logged** ([#140](https://github.com/eldtechnologies/conduit/issues/140)). The request logger now runs first, before HTTPS enforcement and CORS, so 403 `HTTPS Required` and 403 `ORIGIN_NOT_ALLOWED` responses get request and response lines (without `app`, since authentication never ran).
- Corrected the rate limiter's header comment: there is no automatic cleanup; memory is bounded by the number of configured API keys.
- **CORS responses send `Vary: Origin, X-Source-Origin`** ([#140](https://github.com/eldtechnologies/conduit/issues/140)). `Access-Control-Allow-Origin` echoes the request origin, but there was no `Vary` header, so a shared cache could serve one origin's CORS headers (or a response without them) to another. It is now set on every response the CORS middleware handles.

### Changed

- **LLM model guidance: latency first, Claude Haiku 5.5 recommended.** The LLM call runs inside `POST /api/send` while the client waits. In a measurement through OpenRouter with Conduit's own prompt, Haiku 5.5 answered in about 300 ms versus about 1 s for Haiku 4.5, at roughly a seventh of the cost per call. **OpenRouter is documented and tested** with the existing `openai` provider (`LLM_ENDPOINT=https://openrouter.ai/api/v1/chat/completions`, `LLM_MODEL=anthropic/claude-haiku-5.5`), end-to-end through a Conduit container. Stale price and latency figures (Claude 3 Haiku pricing, GPT-3.5/GPT-4, Ollama) were removed. A first-class OpenRouter provider is planned for 2.1 ([#147](https://github.com/eldtechnologies/conduit/issues/147)).
- **Readable startup errors for invalid environment variables.** Errors from the environment schema (e.g. `LOG_LEVEL`, `PORT`, `LLM_FALLBACK_MODE`) are reported as `Invalid configuration:` with one line per variable, instead of a raw validation dump.
- `npm start` and `npm run dev` load `.env` when it exists (`node --env-file-if-exists=.env`, supported from Node 20.19). Variables set in the shell take precedence. The Docker image runs `node dist/index.js` directly and is unchanged.

## [2.0.0-rc.1] — 2026-10-24

**Security hardening release.** A full security review of Conduit found ways to send mail as any configured frontend, or with spoofed senders, and to bypass content filtering. This release closes them:

- Misconfigured or undocumented `API_KEY_*` env vars could become valid API keys. The getting-started guide's own LLM example created the key `true`.
- Clients could send mail from any address on the verified domain.
- The LLM content filter failed open when the provider failed, even for keys set to `block`, and could be bypassed with a spoofable sender whitelist.
- Rate limiting ran after paid LLM calls.
- Chunked request bodies skipped the 50KB body limit.

Most fixes reject input or configuration that used to be accepted, which is why this is a major version. **Operators must review their environment before upgrading:** startup now fails on invalid configuration rather than running in an unsafe state. See [docs/upgrading-to-2.0.md](docs/upgrading-to-2.0.md) for a checklist.

This is a release candidate. It has been verified with the test suite (540 tests), CI and Docker smoke tests using fake provider keys, but not yet against live Resend or LLM providers. Deploy it to staging before 2.0.0.

### Security

- **Strict API key loading** ([#130](https://github.com/eldtechnologies/conduit/pull/130)). An `API_KEY_*` env var is now either an API key `API_KEY_<NAME>` whose value matches `KEY_<NAME>_<12+ alphanumeric chars>`, or a recognised per-key config var (`_RECIPIENTS`, `_RECIPIENT_DOMAINS`, `_FROM_ADDRESSES`, `_LLM_ENABLED`, `_LLM_RULES`, `_LLM_THRESHOLD`, `_LLM_FAIL_MODE`, `_LLM_MAX_CALLS_PER_DAY`) for a configured key. Anything else fails startup. Before, any unrecognised `API_KEY_*` value (e.g. `API_KEY_MYSITE_SPAM_FILTER_ENABLED=true`) was accepted as a valid key with no recipient whitelist or LLM rules, so `X-API-Key: true` worked. Error messages name the variable and never print its value.
- **Per-key sender allowlist** ([#132](https://github.com/eldtechnologies/conduit/pull/132)). A client could set `from.email` to any address on the Resend-verified domain. The `from` address is now checked against the new `API_KEY_<NAME>_FROM_ADDRESSES` (comma-separated, case-insensitive). The send route uses the authenticated key, so a client cannot borrow another key's allowlist through the body. `from.name` is also restricted so an address-like display name cannot spoof or override the allowlisted address in the `From` header: at most 100 characters, no `<`, `>`, `"` or `@`.
- **LLM content filter fails closed** ([#135](https://github.com/eldtechnologies/conduit/pull/135)). Providers now throw on every failure (timeout, HTTP or network error, non-JSON body, malformed or inconsistent model output) instead of returning a "fallback" verdict, and the key's fail mode decides: `block` returns 503 `LLM_PROVIDER_ERROR`, `allow` sends the message.
- **LLM sender whitelist removed** ([#135](https://github.com/eldtechnologies/conduit/pull/135)). It trusted client-supplied sender fields, so anyone could skip content filtering.
- **Prompt injection hardening** ([#135](https://github.com/eldtechnologies/conduit/pull/135)). Content sent to the LLM is JSON-encoded inside a per-request random `<untrusted_content_…>` boundary, and only the validated template fields are analysed.
- **Rate limiting runs before LLM filtering** ([#131](https://github.com/eldtechnologies/conduit/pull/131)), so a 429 never makes a paid LLM call.
- **Body limit counts streamed bodies** ([#131](https://github.com/eldtechnologies/conduit/pull/131)). The 50KB limit now uses `hono/body-limit`, so chunked bodies without `Content-Length` are capped too (they were unlimited).
- **HTTPS exemption is exact** ([#131](https://github.com/eldtechnologies/conduit/pull/131)). Only `/health` is exempt in production. `/health/detailed` and paths such as `/healthz` now require HTTPS.
- **Log masking** ([#131](https://github.com/eldtechnologies/conduit/pull/131), [#135](https://github.com/eldtechnologies/conduit/pull/135)). Response log lines identify the caller by app name (`"app": "MYSITE"`, taken from the `API_KEY_<NAME>` variable name, never derived from the key value), and the LLM filter and recipient validation logs carry no key at all. `X-API-Key` headers in request lines are logged as `KEY_<APP>_****` (anything else as `****`). This also resolves CodeQL `js/clear-text-logging` alerts #1 and #3. `Cookie`, `Set-Cookie` and client-IP headers (`X-Forwarded-For`, `X-Real-IP`, `CF-Connecting-IP`, `True-Client-IP`, `Forwarded`) are masked.
- **Dependency advisories**: zod 4 resolves GHSA-mrhx-c7xc-m3w5 ([#112](https://github.com/eldtechnologies/conduit/pull/112)), vitest 4 resolves dev-only GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8 and the tinypool advisories ([#111](https://github.com/eldtechnologies/conduit/pull/111)), and further semver-compatible updates fix the remaining osv-scanner findings ([#107](https://github.com/eldtechnologies/conduit/pull/107)).

### Breaking changes

**Operators** — startup now fails (with the variable named, value not printed) on:

- unrecognised or invalid `API_KEY_*` vars: misspelled suffixes (e.g. `API_KEY_SITE_RECIPIENT`), unsupported ones (`API_KEY_*_SPAM_FILTER_*`, `API_KEY_*_LLM_CUSTOM_PROMPT`), empty values, lowercase names (`API_KEY_mysite`), and key values not in `KEY_<NAME>_<12+ alphanumeric chars>` form. Generate valid keys with `npm run generate-key -- <NAME>`.
- a per-key config var for a key name that has no `API_KEY_<NAME>`.
- `API_KEY_*_LLM_WHITELIST_SENDERS` (feature removed; delete the variable).
- `API_KEY_*_LLM_ENABLED=true` while `LLM_PROVIDER`, `LLM_API_KEY` or `LLM_MODEL` is missing. Before, such keys silently sent unfiltered mail.
- an empty or invalid `API_KEY_*_FROM_ADDRESSES`.
- an invalid `API_KEY_*_LLM_FAIL_MODE` or `LLM_FALLBACK_MODE` (both now accept `allow`/`block` in any case).
- `LLM_PROVIDER=gemini` or `LLM_PROVIDER=ollama` (never implemented; only `anthropic` and `openai` are supported).

Other operator-facing changes:

- `LLM_FALLBACK_MODE` (default `allow`) is now the default per-key fail mode when `API_KEY_*_LLM_FAIL_MODE` is not set. Before, it was parsed and ignored, so `LLM_FALLBACK_MODE=block` now makes those keys fail closed.
- Keys in `block` mode now get 503 `LLM_PROVIDER_ERROR` when the LLM provider fails or returns malformed output (they were sent unfiltered).
- API key values are trimmed.
- `npm run build` now emits `dist/index.js` via `tsconfig.build.json` (was `dist/src/index.js` plus compiled `tests/` and `scripts/`), so `npm start` works after a local build. The Docker image layout is unchanged.
- `docker-compose.yml` still defaults to `NODE_ENV=production`, but now reads `NODE_ENV` and `PORT` from `.env` or the shell (`${NODE_ENV:-production}`, `${PORT:-3000}`); both used to be hard-coded. The port mapping and healthcheck follow `PORT`. For a local plain-HTTP run set `NODE_ENV=development`; in production every `/api` request without `X-Forwarded-Proto: https` gets 403.
- The Dockerfile `HEALTHCHECK` uses `${PORT:-3000}`, so containers with a non-3000 `PORT` are no longer marked unhealthy.

**API clients** (`POST /api/send` unless noted):

- Sending `from` when the key has no `API_KEY_<NAME>_FROM_ADDRESSES`, or a `from.email` not in that list, returns **400 `SENDER_NOT_ALLOWED`** (the mail used to go out from the given address). Omit `from`, or have the operator allowlist it.
- `from.name` longer than 100 characters or containing `<`, `>`, `"` or `@` (e.g. `Support @ Acme`, `Boss <ceo@company.com>`) returns **400 `VALIDATION_ERROR`** (`Name must be at most 100 characters` / `Name cannot contain <, >, " or @ characters`); such names used to be accepted. This applies whether or not the key has a sender allowlist.
- Oversized bodies: 400 → **413 `PAYLOAD_TOO_LARGE`**. The message no longer includes the received size, and `details.actualSize` is present only when `Content-Length` was sent.
- Disallowed CORS origin: 401 → **403 `ORIGIN_NOT_ALLOWED`**.
- Unknown `channel` (e.g. `"fax"`, or the unimplemented `sms`/`push`/`webhook`): `VALIDATION_ERROR` → **400 `INVALID_CHANNEL`**, even when other fields are also invalid. A missing or non-string `channel` is still `VALIDATION_ERROR`.
- Malformed, empty or non-object JSON: 500 `INTERNAL_ERROR` → **400 `VALIDATION_ERROR`** (`Invalid JSON body` / `Request body must be a JSON object`).
- Invalid template `data`: 500 `INTERNAL_ERROR` → **400 `VALIDATION_ERROR`** with per-field messages, e.g. `Invalid template data: name: Name is required, ...` ([#114](https://github.com/eldtechnologies/conduit/pull/114)).
- `llmAnalysis` is **no longer returned in production** responses (still returned outside production). The fail-open `fallbackReason` is always `LLM analysis failed`.
- The content-blocked 403 message is now `Content blocked by content filter` (it used to include the model's reasoning); reasoning, confidence and categories are only in dev-only `details`.
- `LLM_BUDGET_EXCEEDED` (503) carries `retryAfter` as a top-level field plus a `Retry-After` header, instead of `details.retryAfter`. The block-mode `LLM_PROVIDER_ERROR` no longer has `details.reason`.
- Requests that fail schema, channel, template, template-data or sender checks get their 400 before any LLM call, so they no longer use LLM budget. LLM-blocked (403) requests now consume a rate-limit token.
- `GET /health/detailed` requires HTTPS in production (403 `HTTPS Required` over plain HTTP).
- Email subject and text body are plain text: no HTML entities (`R&D` arrives as typed, `Tom &amp; Jerry` becomes `Tom & Jerry`), and CR/LF in the subject become a space. The HTML body is still escaped.
- Default zod error messages changed for fields without a custom message (zod 4); all send-schema fields have custom messages.

### Added

- `API_KEY_<NAME>_FROM_ADDRESSES` per-key sender allowlist. When `from` is omitted, the default sender is `Conduit <first-allowlisted-address>`, or `Conduit <onboarding@resend.dev>` when the key has no allowlist. Allowlisted addresses are sent lowercased ([#132](https://github.com/eldtechnologies/conduit/pull/132)).
- `SENDER_NOT_ALLOWED` (400) error code ([#132](https://github.com/eldtechnologies/conduit/pull/132)).
- Optional `Idempotency-Key` request header on `POST /api/send`: 1-200 characters of `[A-Za-z0-9._:-]`, otherwise 400 `VALIDATION_ERROR`. It is prefixed with the caller's public `KEY_<NAME>` part and forwarded to Resend as `idempotencyKey`; CORS allows the header ([#134](https://github.com/eldtechnologies/conduit/pull/134)).
- `Retry-After` HTTP header on 429 responses and on 503s with a retry hint ([#131](https://github.com/eldtechnologies/conduit/pull/131)).
- `.dockerignore`, keeping `.env`, `.git`, tests and docs out of the build context ([#129](https://github.com/eldtechnologies/conduit/pull/129)).
- Network guard in `tests/setup.ts`: an unmocked `fetch` to a non-localhost host fails the test ([#133](https://github.com/eldtechnologies/conduit/pull/133)).

### Fixed

- **`replyTo` was never sent to Resend.** The email channel passed `reply_to`, which the SDK ignores; it now passes `replyTo` and is typed against `CreateEmailOptions` ([#120](https://github.com/eldtechnologies/conduit/pull/120)).
- **Provider timeout aborts the request.** The 10s timeout now uses `AbortSignal.timeout`, so a timed-out send is not delivered after the client already got 502 `PROVIDER_TIMEOUT`, and no timer is left pending ([#134](https://github.com/eldtechnologies/conduit/pull/134)).
- **Rate limiter checks all buckets before consuming.** Rejected requests no longer drain the hour/day buckets, and `retryAfter` reports the longest wait across the empty buckets ([#131](https://github.com/eldtechnologies/conduit/pull/131)).
- **`/health/detailed`** reports email `active`/`configured` from the email handler (was always `inactive`), and `version` comes from `package.json` at startup (was `0.1.0` in Docker; `unknown` if it cannot be read) ([#134](https://github.com/eldtechnologies/conduit/pull/134)).
- Per-key `API_KEY_*_LLM_FAIL_MODE` is trimmed and case-insensitive; invalid values used to be ignored, leaving the key fail-open ([#130](https://github.com/eldtechnologies/conduit/pull/130)).
- Response log entries now identify the caller (the key was read before authentication ran, so it was always missing) ([#131](https://github.com/eldtechnologies/conduit/pull/131)). **Log format change:** the response line field `apiKey: "KEY_<APP>_****"` is replaced by `app: "<APP>"`; update log queries that filter on `apiKey`.
- Tests are hermetic and deterministic: Resend is mocked, timing tests no longer depend on wall-clock time, the rate-limit refill test uses fake timers, and the revoked-key test can fail ([#133](https://github.com/eldtechnologies/conduit/pull/133)).
- Branch coverage restored above the 80% threshold after the vitest 4 upgrade ([#119](https://github.com/eldtechnologies/conduit/pull/119)).

### Changed

- Dependency upgrades (versions from `package-lock.json`):
  - `zod` 3.25.76 → 4.6.7 ([#112](https://github.com/eldtechnologies/conduit/pull/112))
  - `resend` 4.8.0 → 6.34.1 ([#120](https://github.com/eldtechnologies/conduit/pull/120))
  - `@hono/node-server` 1.19.14 → 2.1.5 ([#117](https://github.com/eldtechnologies/conduit/pull/117))
  - `hono` 4.12.25 → 4.13.13, `isomorphic-dompurify` 3.17.0 → 3.19.0 ([#107](https://github.com/eldtechnologies/conduit/pull/107))
  - Dev: `vitest`, `@vitest/coverage-v8`, `@vitest/ui` 3.2.6 → 4.1.12 ([#111](https://github.com/eldtechnologies/conduit/pull/111))
  - Dev: `eslint` 9 → 10.13.0, `@eslint/js` 9 → 10.0.1, `typescript-eslint` / `@typescript-eslint/*` → 8.71.2 ([#118](https://github.com/eldtechnologies/conduit/pull/118))
- Removed the temporary `overrides.esbuild` pin added in 1.3.1; the tree now resolves esbuild 0.28.2 without it ([#116](https://github.com/eldtechnologies/conduit/pull/116)).
- LLM filtering is no longer mounted as middleware. The send route calls it after request schema, channel, template, template-data and sender checks; the middleware order is documented in `src/index.ts` ([#135](https://github.com/eldtechnologies/conduit/pull/135)).
- Dead Gemini/Ollama provider code removed; shared prompt building, response parsing and the timed POST live in `src/llm/providers/base.ts` ([#135](https://github.com/eldtechnologies/conduit/pull/135)).
- Every LLM call attempt counts against `API_KEY_*_LLM_MAX_CALLS_PER_DAY`, including failed ones (unchanged behaviour, now tested).
- `src/**`, `tests/**` and `scripts/**` are Prettier-formatted.

### CI

- New `CI` workflow on pull requests and pushes to `main`: `npx tsc --noEmit`, lint, `format:check`, `test:coverage` (80% thresholds), build, a `dist/index.js` check, a boot smoke test against `/health`, and a `docker build` job ([#129](https://github.com/eldtechnologies/conduit/pull/129)).
- Security Scan fails when OSV reports vulnerabilities (`fail-on-vuln: true`; it was advisory) ([#129](https://github.com/eldtechnologies/conduit/pull/129)).
- GitHub Actions upgraded: `actions/checkout` v7, `actions/setup-node` v7, `actions/dependency-review-action` v5, `google/osv-scanner-action` v2.5.0 ([#115](https://github.com/eldtechnologies/conduit/pull/115)).

## [1.3.1] — 2026-06-25

### Security

- **29 dependency advisories resolved** (1 Critical, 5 High, 17 Medium, 5 Low, 1 Unknown) reported by `osv-scanner`, fixed via `npm update` within existing semver ranges:
  - `hono` 4.12.18 → 4.12.25 (9 advisories incl. high-severity GHSA-88fw-hqm2-52qc)
  - `isomorphic-dompurify` / `dompurify` 3.4.3 → patched (8 advisories)
  - `undici` 7.25.0 → 7.28.0 (7 advisories)
  - Dev-only: `vitest` (critical GHSA-5xrq-8626-4rwp), `vite`, `esbuild`, `js-yaml`
  - **`overrides.esbuild` `^0.28.1`** added to force the nested `vite → esbuild@0.27.7` transitive dep to the patched version, which was not reachable via the normal version range (dev-only, low severity GHSA-g7r4-m6w7-qqqr). This is a temporary workaround tracked in [#87](https://github.com/eldtechnologies/conduit/issues/87); it can be removed once `vite` ships an esbuild range that includes ≥0.28.1.
  - Post-release: `osv-scanner scan .` → No issues found; CI OSV Scanner, `npm audit`, CodeQL, and Dependency Review all green.

### Changed

- No source-code or runtime-behavior changes. This is a dependency-maintenance release; the full test suite (263/263) remains green and `npm run build` exits 0.

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

[Unreleased]: https://github.com/eldtechnologies/conduit/compare/v2.0.0-rc.1...HEAD
[2.0.0-rc.1]: https://github.com/eldtechnologies/conduit/compare/v1.3.1...v2.0.0-rc.1
[1.3.1]: https://github.com/eldtechnologies/conduit/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/eldtechnologies/conduit/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/eldtechnologies/conduit/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/eldtechnologies/conduit/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/eldtechnologies/conduit/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/eldtechnologies/conduit/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/eldtechnologies/conduit/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/eldtechnologies/conduit/releases/tag/v1.0.1
