# Sender Allowlist

**Status:** ✅ Implemented (unreleased, on `main` after v1.3.1)
**Priority:** 🔴 CRITICAL
**Security Value:** Stops a leaked frontend key from sending mail as arbitrary addresses on your verified domain

---

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
- [Request Behavior](#request-behavior)
- [Where It Runs](#where-it-runs)
- [Implementation](#implementation)
- [Troubleshooting](#troubleshooting)

---

## Overview

The sender allowlist controls which `from` addresses an API key may send as. The sender address is decided by the operator, not the client:

- A client-supplied `from.email` is accepted only if it is in the key's allowlist
- A key without an allowlist rejects every client-supplied `from`
- When the client omits `from`, Conduit uses the key's first allowlisted address

Without this, anyone holding a frontend key (which is visible in the browser) could send mail as `ceo@yourcompany.com` through your verified Resend domain.

It complements [recipient whitelisting](./recipient-whitelisting.md), which controls who a key may send **to**.

---

## Configuration

```bash
# Format:
API_KEY_{NAME}_FROM_ADDRESSES=address1@domain.com,address2@domain.com
```

Example:

```bash
API_KEY_WEBSITE=KEY_WEBSITE_657582934edbf009f73afb38c38111f6
API_KEY_WEBSITE_FROM_ADDRESSES=noreply@yourcompany.com,support@yourcompany.com
```

These keys are examples. Generate your own with `npm run generate-key -- <name>`.

Rules (enforced at startup in `src/config.ts`):

- Addresses are comma-separated, trimmed and lowercased. Empty entries are dropped and duplicates removed; the order is kept
- **The first address is the key's default sender**
- `API_KEY_{NAME}` must be configured, otherwise startup fails with `configures API key "{NAME}" but API_KEY_{NAME} is not set`
- Startup fails if the list is empty (`must list at least one email address`) or contains an invalid email address (`invalid email address at position N`). The error names the variable and position but not the value

The addresses must belong to a domain verified in your Resend account. Otherwise Resend rejects the send and Conduit returns 502 `PROVIDER_ERROR`.

---

## Request Behavior

Applies to the `email` channel (`POST /api/send`).

| Request `from` | Key has allowlist | Result |
|----------------|-------------------|--------|
| omitted | yes | Sent from the first allowlisted address, as `Conduit <address>` |
| omitted | no | Sent from `Conduit <onboarding@resend.dev>` (Resend's test sender) |
| `from.email` in allowlist (case-insensitive) | yes | Sent from `from.email` (lowercased), with `from.name` as display name (default `Conduit`) |
| `from.email` not in allowlist | yes | 400 `SENDER_NOT_ALLOWED` |
| any `from` | no | 400 `SENDER_NOT_ALLOWED` |

Error messages:

- Key without allowlist: "Sender not allowed: this API key does not accept a custom from address. Omit \`from\` to use the default sender."
- Address not allowlisted: "Sender not allowed: from.email is not in the sender allowlist for this API key."

`from.name` restrictions (400 `VALIDATION_ERROR` if violated):

- at most 100 characters
- no newline characters (`\r`, `\n`), which could inject email headers
- no `<`, `>`, `"` or `@`, so an address-like display name (`ceo@company.com` or `x <ceo@company.com>`) cannot spoof or override the allowlisted address

`from.email` must be a valid email address (400 `VALIDATION_ERROR` otherwise).

`replyTo` is not covered by the sender allowlist. Any valid email address is accepted.

Example request:

```json
{
  "channel": "email",
  "templateId": "contact-form",
  "to": "support@yourcompany.com",
  "from": { "email": "Support@YourCompany.com", "name": "Support Team" },
  "data": { "name": "Jane", "email": "jane@example.com", "message": "Hello" }
}
```

With the configuration above, this is sent with `From: Support Team <support@yourcompany.com>`.

---

## Where It Runs

The sender is checked in the send route (`src/routes/send.ts`) after request schema validation and **before the LLM content filter**, so a disallowed sender never triggers an LLM call. It runs after rate limiting, so a rejected request consumes a rate-limit token.

```
Body Limit → Auth → Recipient Validation → Rate Limit
  → Request Validation → Sender Allowlist → LLM Filter → Send
```

The email channel handler checks the sender again before calling Resend (defense in depth).

---

## Implementation

- `src/config.ts`: `loadSenderAllowlists()` builds `config.senderAllowlists` (`Map` from API key value to its allowed addresses)
- `src/channels/email.ts`: `resolveSender()` decides the `From` header or throws `SENDER_NOT_ALLOWED`
- `src/routes/send.ts`: request schema (`from.name` restrictions) and the early sender check
- `src/types/api.ts`: `SENDER_NOT_ALLOWED` error code (HTTP 400)

Tests: `tests/unit/channels.test.ts`, `tests/unit/config.test.ts`, `tests/integration/send.test.ts`.

---

## Troubleshooting

### 400 `SENDER_NOT_ALLOWED` for every request with `from`

**Cause:** The key has no `API_KEY_{NAME}_FROM_ADDRESSES`. Either omit `from`, or add the addresses the frontend may use and restart Conduit (configuration is loaded once at startup).

### 400 `SENDER_NOT_ALLOWED` for one address

**Cause:** That address is not in the key's list. Matching is exact on the full address (case-insensitive); there is no domain-level wildcard.

### Mail is sent from `onboarding@resend.dev`

**Cause:** The key has no sender allowlist and the request omitted `from`. Add `API_KEY_{NAME}_FROM_ADDRESSES` with an address on your verified domain; its first entry becomes the default sender.

### Startup fails with `invalid email address at position N`

**Cause:** Entry N (1-based) of the list is not a valid email address. Fix or remove it.
