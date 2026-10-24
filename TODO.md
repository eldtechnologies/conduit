# Conduit Implementation TODO

**Status**: Phase 1 (email) complete - v1.3.1 plus unreleased changes on `main`
**Last Updated**: 2026-10-24

Completed work (project setup, security layer, email channel, templates, send endpoint, Docker, tests, docs, recipient whitelisting, LLM spam filtering, sender allowlist, CI) has been removed from this list. See [CHANGELOG.md](CHANGELOG.md) and the git history for what was done. Only open items remain below.

---

## Hardening & Operations

### Resilience
- [ ] Circuit breaker for provider APIs (skipped for MVP; the 10s provider timeout and error mapping are the current resilience)
- [ ] IP-based rate limiting (secondary protection next to the per-key limits)
- [ ] Shared state (e.g. Redis) for rate limits and the LLM daily budget, so several instances can run behind a load balancer (both are in-memory per process today)

### Security Tooling
- [ ] Container image scanning in CI (e.g. Trivy)

### Testing & Quality
- [ ] Load testing (optional):
  - [ ] Create load test script
  - [ ] Test rate limiting under load
  - [ ] Test concurrent requests
  - [ ] Measure response times
- [ ] Pre-commit hooks (optional)

### Documentation & Release
- [ ] Add CI status and coverage badges to the root README
- [ ] Publish to npm (optional)

### Code Follow-ups (found while updating the docs)
- [ ] `PROVIDER_UNAVAILABLE` is thrown as a `ValidationError` and returns 400; a 5xx status would fit a missing provider better
- [ ] `ErrorCode` values that are never returned: `INVALID_API_KEY`, `REVOKED_API_KEY`, `INVALID_REQUEST`, `MISSING_REQUIRED_FIELD`, `CORS_ERROR`, `LLM_TIMEOUT` (use or remove)
- [ ] `LOG_LEVEL` is parsed in `src/config.ts` but not used by the logger

---

## Future Phases (planned, not implemented)

### Phase 2: SMS Channel
- [ ] Twilio integration
- [ ] SMS templates
- [ ] Phone number validation
- [ ] SMS-specific rate limiting

### Phase 2: Push Notifications
- [ ] Firebase Cloud Messaging integration
- [ ] Push templates
- [ ] Device token validation
- [ ] Platform detection (iOS/Android)

### Phase 2+: API
- [ ] `GET /api/channels` endpoint (list channels and templates)

### Phase 3: Webhooks
- [ ] HTTP webhook handler
- [ ] Slack integration
- [ ] Discord integration
- [ ] Signature verification

### Phase 4: Advanced Features
- [ ] Analytics dashboard
- [ ] Delivery tracking
- [ ] Retry policies
- [ ] Scheduled sending
- [ ] A/B testing

### LLM Spam Filtering
- [ ] Additional LLM providers (e.g. Gemini, Ollama); `LLM_PROVIDER` currently accepts only `anthropic` and `openai`

---

## Notes

- **Test Coverage**: Maintain >80% coverage (enforced in CI)
- **Documentation**: Update docs as features are implemented
- **Git Commits**: Small, atomic commits with clear messages
- **Code Review**: Changes go through PRs against `main`
