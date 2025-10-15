# Conduit Features

This directory contains **feature planning and implementation guides** for Conduit features beyond the core MVP.

---

## Purpose

The `/docs/features/` directory serves as:

1. **Feature Proposals**: Detailed plans for new features before implementation
2. **Implementation Guides**: Step-by-step instructions for building features
3. **Design Documents**: Architecture decisions and technical specifications
4. **Product Roadmap**: Planned features organized by version/phase

---

## Directory Structure

```
docs/features/
├── README.md                      # This file
├── llm-spam-filtering.md          # v1.2.0 - AI-powered spam detection
└── [future-feature].md            # Future feature plans
```

---

## Feature Documentation Template

Each feature document should include:

1. **Status** - Planned | In Progress | Implemented | Deprecated
2. **Version** - Target release version (e.g., v1.2.0)
3. **Priority** - Low | Medium | High | Critical
4. **Complexity** - Low | Medium | High
5. **Value Proposition** - Why this feature matters
6. **Architecture** - How it works (diagrams, code examples)
7. **Configuration** - Environment variables and setup
8. **Implementation Plan** - Phased development approach
9. **Testing Strategy** - How to verify it works
10. **Performance & Cost** - Resource impact and pricing

---

## Current Features

### v1.1.0 (Implemented)

**Recipient Whitelisting** - Prevent stolen API keys from spamming arbitrary recipients
- **Status**: ✅ Implemented
- **Documentation**: See [getting-started.md](../getting-started.md#step-4-configure-recipient-whitelisting-optional-but-recommended)
- **Security Impact**: 95% risk reduction for stolen key abuse

### v1.2.0 (Planned)

**LLM-Based Spam Filtering** - AI-powered content analysis as optional Conduit middleware
- **Status**: 📋 Planned
- **Documentation**: [llm-spam-filtering.md](./llm-spam-filtering.md)
- **Value Proposition**: Spam detection without exposing LLM API keys to frontend
- **Estimated Timeline**: 2-3 weeks after v1.1.0

---

## How to Propose a New Feature

1. **Create a feature document**:
   ```bash
   touch docs/features/your-feature-name.md
   ```

2. **Use the template** (see [llm-spam-filtering.md](./llm-spam-filtering.md) as reference):
   - Overview and value proposition
   - Architecture and design
   - Implementation plan (phased approach)
   - Testing and validation strategy
   - Cost/performance analysis

3. **Link from relevant documentation**:
   - Add to product roadmap (if applicable)
   - Reference from security docs (if security-related)
   - Link from getting-started guide (if user-facing)

4. **Get feedback**:
   - Share with team for review
   - Discuss tradeoffs and alternatives
   - Refine based on feedback

5. **Implementation**:
   - Follow the phased approach in your plan
   - Update status as you progress
   - Document any changes from original plan

---

## Feature Prioritization Criteria

Features are prioritized based on:

1. **Security Impact** (highest priority)
   - Does it prevent abuse or attacks?
   - Does it protect user data?
   - Does it reduce risk?

2. **User Value** (high priority)
   - Does it solve a common pain point?
   - Does it differentiate from competitors?
   - Does it reduce friction?

3. **Technical Feasibility** (medium priority)
   - Can it be implemented in current architecture?
   - Does it require external dependencies?
   - What's the maintenance burden?

4. **Cost/Benefit Ratio** (medium priority)
   - Development time vs impact
   - Ongoing maintenance cost
   - Operational costs (API fees, infrastructure)

5. **Strategic Alignment** (medium priority)
   - Does it fit the product vision?
   - Does it enable future features?
   - Does it create vendor lock-in risks?

---

## Feature Lifecycle

```
Proposed → Planned → In Progress → Implemented → Maintained → Deprecated
    ↓          ↓           ↓             ↓            ↓            ↓
 Feature    Updated     Progress      Released    Bug fixes    Removed
   doc      plan        tracking      notes       & updates    (if needed)
```

### Proposed
- Feature idea documented
- No commitment to implement
- Open for discussion

### Planned
- Feature approved for development
- Target version assigned
- Implementation plan finalized

### In Progress
- Active development
- Regular progress updates
- Code reviews and testing

### Implemented
- Feature released
- Documentation updated
- Announced in release notes

### Maintained
- Bug fixes as needed
- Performance optimizations
- Security updates

### Deprecated (if needed)
- Feature marked for removal
- Migration guide provided
- Sunset timeline announced

---

## Examples of Good Feature Docs

### ✅ Good: LLM Spam Filtering

**Why it's good**:
- Clear value proposition (solves LLM key exposure problem)
- Phased implementation (v1.2.0 → v1.3.0 → v1.4.0)
- Detailed architecture with code examples
- Cost/performance analysis
- Multiple provider options
- Security considerations addressed
- Testing strategy included

**Location**: [llm-spam-filtering.md](./llm-spam-filtering.md)

---

## Related Documentation

- **[Architecture](../architecture.md)** - Overall system design
- **[Security](../security/)** - Security guides and reviews
- **[API Reference](../api-reference.md)** - Complete API specification
- **[User Guide](../user-guide.md)** - User-facing documentation

---

## Questions?

- **New feature idea?** Create a proposal document using the template above
- **Implementation questions?** Review existing feature docs for patterns
- **Need feedback?** Share your feature doc with the team

---

## Change Log

- **2025-10-15**: Created features directory structure
- **2025-10-15**: Added LLM spam filtering proposal (v1.2.0)
