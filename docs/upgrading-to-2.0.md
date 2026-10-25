# Upgrading to 2.0

Conduit 2.0 is a security hardening release. Most changes reject configuration or requests that 1.x accepted, so plan the upgrade instead of just bumping the image. The full list is in the [CHANGELOG](../CHANGELOG.md).

## 1. Check your environment (operators)

Since 2.0, Conduit **fails at startup** when its configuration is unsafe or invalid. The error names the variable, never its value. Go through your production env:

- [ ] **API keys** have the form `KEY_<NAME>_<12+ alphanumeric chars>` and are stored as `API_KEY_<NAME>`. Regenerate any that don't with `npm run generate-key -- <NAME>`.
- [ ] **No other `API_KEY_*` variables** exist besides keys and these per-key settings for a configured key: `_RECIPIENTS`, `_RECIPIENT_DOMAINS`, `_FROM_ADDRESSES`, `_LLM_ENABLED`, `_LLM_RULES`, `_LLM_THRESHOLD`, `_LLM_FAIL_MODE`, `_LLM_MAX_CALLS_PER_DAY`. Delete leftovers such as `API_KEY_*_SPAM_FILTER_*` (from the old getting-started guide) or `API_KEY_*_LLM_CUSTOM_PROMPT`. **In 1.x their values were accepted as valid API keys**; if you had any, treat those values as leaked.
- [ ] **`API_KEY_*_LLM_WHITELIST_SENDERS` is removed.** Delete it; the feature could be bypassed by any client.
- [ ] **LLM filtering:** if any key sets `API_KEY_*_LLM_ENABLED=true`, then `LLM_PROVIDER` (`anthropic` or `openai`), `LLM_API_KEY` and `LLM_MODEL` must all be set. `gemini` and `ollama` are not supported.
- [ ] **Thresholds:** `API_KEY_*_LLM_THRESHOLD` is a number from 0 to 1 (e.g. `0.7`). Values on the old 0-100 scale are ignored and the default `0.7` is used.
- [ ] **Fail modes:** `API_KEY_*_LLM_FAIL_MODE` and `LLM_FALLBACK_MODE` must be `allow` or `block`. `LLM_FALLBACK_MODE` is now the default for keys without their own fail mode, so `LLM_FALLBACK_MODE=block` makes those keys fail closed.
- [ ] **Sender addresses:** if a frontend sends a `from` address, add it to `API_KEY_<NAME>_FROM_ADDRESSES` (comma-separated). Otherwise those requests get 400 `SENDER_NOT_ALLOWED`. Without `from`, mail goes out from the first allowlisted address (or `onboarding@resend.dev` when there is no list).
- [ ] **Log queries / alerts:** response log lines now carry `"app": "<NAME>"` (from `API_KEY_<NAME>`) instead of `"apiKey": "KEY_<NAME>_****"`. Update any log filters or dashboards that use `apiKey`.
- [ ] **Proxies and gateways:** `X-Source-Origin` is only used when a request has no `Origin` header. If a proxy in front of Conduit rewrites `Origin` to its own address and passes the browser origin in `X-Source-Origin`, make it drop or pass through `Origin` instead, or those requests get 403 `ORIGIN_NOT_ALLOWED`.
- [ ] **`NODE_ENV=production`** is set in production (the code default is `development`). The Docker image and `docker-compose.yml` default to production.

To check a config before deploying, start the new image with your env file and watch it boot:

```bash
docker build -t conduit:2.0.0-rc.1 .
docker run --rm --env-file .env.production conduit:2.0.0-rc.1
# Startup errors look like: "Invalid API key configuration: - API_KEY_MYSITE_SPAM_FILTER_ENABLED ..."
```

## 2. Check your frontends (API clients)

`POST /api/send` changes that clients may notice:

| Situation | 1.x | 2.0 |
|---|---|---|
| `from` not in the key's allowlist (or key has none) | sent | **400 `SENDER_NOT_ALLOWED`** |
| `from.name` with `<`, `>`, `"`, `@` or over 100 chars | sent | **400 `VALIDATION_ERROR`** |
| Body over 50KB | 400 | **413 `PAYLOAD_TOO_LARGE`** |
| Origin not allowed | 401 | **403 `ORIGIN_NOT_ALLOWED`** |
| `Origin` not allowed but `X-Source-Origin` allowed | allowed | **403 `ORIGIN_NOT_ALLOWED`** (`X-Source-Origin` is only used when there is no `Origin`) |
| Unknown or unimplemented `channel` | `VALIDATION_ERROR` | **400 `INVALID_CHANNEL`** |
| Malformed or non-object JSON | 500 | **400 `VALIDATION_ERROR`** |
| Invalid template `data` | 500 | **400 `VALIDATION_ERROR`** with per-field messages |
| `llmAnalysis` in the response | always | **only outside production** |
| 429 / budget 503 | `retryAfter` in the body | plus a `Retry-After` header; budget 503 has top-level `retryAfter` |

New and optional: an `Idempotency-Key` header (1-200 chars of `[A-Za-z0-9._:-]`) makes retries after a timeout safe.

## 3. Roll out

1. Deploy `2.0.0-rc.1` to staging with the production env vars.
2. Confirm it starts. If it doesn't, fix each variable it names.
3. Send a real email through each frontend, with the LLM filter enabled where you use it.
4. Promote to production.

**Rolling back to 1.3.1:** first **remove every `API_KEY_*_FROM_ADDRESSES` variable**. 1.3.1 does not know that suffix and would accept its value (your sender addresses) as a valid API key. 1.3.1 also accepts the unsafe configuration that 2.0 rejects, so roll back only temporarily.
