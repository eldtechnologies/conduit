# Automated Security & Dependency Management

This guide explains Conduit's automated security scanning and dependency update system.

## Overview

Conduit uses a multi-layered approach to automated security:

1. **Dependabot** - Automated dependency updates and security patches
2. **GitHub Actions** - Continuous security scanning (daily + on every PR)
3. **GitHub Security Features** - Built-in vulnerability detection
4. **OSV Scanner** - Google's open-source vulnerability scanner

**Zero Known Vulnerabilities Policy**: All security vulnerabilities are patched within 24 hours of disclosure.

---

## Automated Systems

### 1. Dependabot (Dependency Updates)

**Configuration**: `.github/dependabot.yml`

**What it does:**
- Checks for npm dependency updates every Monday at 9 AM UTC
- Automatically creates PRs for updates
- Groups related updates to reduce PR noise:
  - Development dependencies (minor + patch)
  - Production dependencies (patch only)
  - Major/minor production updates (separate PRs for careful review)
- Security updates are prioritized and created immediately (not weekly)

**PR Labels:**
- `dependencies` - All dependency PRs
- `automated` - Auto-generated PRs
- `security` - Security-related updates (auto-added by GitHub)

**How to use:**
1. Review Dependabot PRs in GitHub
2. Check CI passes (tests + security scans)
3. Review changelog if major/minor update
4. Merge when ready (security patches should be merged ASAP)

**Configuration highlights:**
```yaml
schedule:
  interval: "weekly"      # Weekly for version updates
  day: "monday"
  time: "09:00"

groups:
  production-dependencies:
    update-types: ["patch"]  # Only patch updates grouped
```

---

### 2. GitHub Actions Security Workflow

**Configuration**: `.github/workflows/security.yml`

**Runs on:**
- Every push to `main` branch
- Every pull request
- Daily at 2 AM UTC
- Manual trigger (workflow_dispatch)

**Jobs:**

#### a. npm audit
- Runs `npm audit --audit-level=moderate`
- Fails build if moderate+ severity vulnerabilities found
- Checks against npm's vulnerability database

#### b. OSV Scanner
- Uses Google's OSV Scanner
- Checks package-lock.json against OSV database
- Covers vulnerabilities from multiple sources (not just npm)

#### c. Dependency Review (PR only)
- Analyzes dependency changes in PRs
- Comments on PR with vulnerability analysis
- Fails PR if moderate+ severity vulnerabilities introduced

#### d. Security Summary
- Aggregates results from all scans
- Provides pass/fail status

**Status Badge:**
```markdown
[![Security Scan](https://github.com/eldtechnologies/conduit/actions/workflows/security.yml/badge.svg)](https://github.com/eldtechnologies/conduit/actions/workflows/security.yml)
```

**How to view results:**
1. Go to GitHub Actions tab
2. Click "Security Scan" workflow
3. View results for each job

---

### 3. GitHub Security Features

These features are built into GitHub and require manual enablement.

#### How to Enable:

1. **Navigate to Settings**:
   ```
   Repository → Settings → Security & analysis
   ```

2. **Enable these features**:

   ✅ **Dependency graph** (usually enabled by default)
   - Shows all dependencies and dependents
   - Required for other features

   ✅ **Dependabot alerts**
   - Notifies you of vulnerable dependencies
   - Shows in Security tab

   ✅ **Dependabot security updates**
   - Auto-creates PRs for security vulnerabilities
   - Prioritized over regular version updates

   ✅ **Code scanning (CodeQL)**
   - Static analysis for code vulnerabilities
   - Scans JavaScript/TypeScript code
   - Runs on every PR

   ✅ **Secret scanning**
   - Detects accidentally committed secrets
   - Scans for API keys, tokens, passwords
   - Auto-enabled for public repos

#### Viewing Security Alerts:

1. **Security Tab** (top of repo)
2. **Dependabot alerts** - Vulnerable dependencies
3. **Code scanning alerts** - Code vulnerabilities
4. **Secret scanning alerts** - Leaked secrets

---

## Vulnerability Response Process

### When Dependabot Creates a Security PR:

1. **Immediate Notification** (within hours of CVE disclosure)
   - GitHub sends email/notification
   - Dependabot creates PR with vulnerability details

2. **Review** (within 2 hours)
   - Check CVE severity and impact
   - Review changelog for breaking changes
   - Verify tests pass

3. **Merge** (within 4 hours for Critical/High)
   - Security patches should be merged ASAP
   - Tag new patch version (e.g., v1.2.1 → v1.2.2)
   - Deploy to production

4. **Verify** (within 1 hour of merge)
   - Run `npm audit` - should show 0 vulnerabilities
   - Run `osv-scanner scan .` - should show "No issues found"
   - Check Security tab - no active alerts

### Manual Security Checks:

```bash
# Check for vulnerabilities
npm audit

# Fix automatically if possible
npm audit fix

# Check with OSV Scanner
osv-scanner scan .

# Check specific package
npm audit --package=hono
```

---

## Security Scan Status

**Current Status**: ✅ **Zero Known Vulnerabilities**

**Last Scanned**: Automatically daily at 2 AM UTC

**View Latest Results**:
- [Security Scan Workflow](https://github.com/eldtechnologies/conduit/actions/workflows/security.yml)
- [Dependabot Alerts](https://github.com/eldtechnologies/conduit/security/dependabot)
- [Security Advisories](https://github.com/eldtechnologies/conduit/security/advisories)

---

## Troubleshooting

### Dependabot PRs not being created

**Check:**
1. `.github/dependabot.yml` is valid YAML
2. Dependabot is enabled in Settings → Security & analysis
3. Repository has admin access for Dependabot

**Solution:**
```bash
# Validate dependabot.yml
npx @github/dependabot-config-validator .github/dependabot.yml
```

### Security workflow failing

**Common issues:**
1. `npm audit` fails - Update dependencies to fix
2. `osv-scanner` fails - Check package-lock.json is committed
3. Timeout - Increase timeout in workflow file

**Debug:**
```bash
# Run locally
npm audit --audit-level=moderate
osv-scanner scan .
```

### False positives

**If a vulnerability doesn't apply:**
1. Document why it's a false positive
2. Add to `.npmrc` or workflow ignore list
3. File issue with vulnerability database

---

## Maintenance

### Weekly Tasks
- ✅ Review Dependabot PRs (automated every Monday)
- ✅ Check Security tab for alerts (automated scanning)

### Monthly Tasks
- Review automated security processes
- Update this documentation if processes change

### Quarterly Tasks
- Review security configuration files
- Update security scanning tools
- Audit dependency trust

---

## Additional Security Tools

### Optional Enhancements:

1. **Snyk** (Free for open source)
   - Deeper vulnerability analysis
   - License compliance checking
   - Container scanning

2. **Socket Security** (Free for open source)
   - Supply chain attack detection
   - Malicious package prevention
   - Typosquatting protection

3. **Renovate Bot** (Alternative to Dependabot)
   - More configuration options
   - Better grouping
   - Auto-merge capabilities

---

## Contact

For security issues, contact: security@eldtechnologies.com

**Do NOT** open public GitHub issues for security vulnerabilities.
Use GitHub Security Advisories for private disclosure.

---

**Last Updated**: 2025-10-28
**Maintained by**: ELD Technologies
