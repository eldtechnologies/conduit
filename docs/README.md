# Conduit Documentation

Welcome to the Conduit documentation! This guide will help you find the right documentation for your needs.

## 📚 Documentation Overview

```
docs/
├── getting-started.md      # Start here! 5-minute setup guide
├── user-guide.md           # Complete integration guide for frontend developers
├── api-reference.md        # Full API specification and reference
├── architecture.md         # System design and technical architecture
└── security/
    ├── README.md           # Security overview and checklist
    ├── review.md           # Comprehensive security analysis
    └── implementation.md   # Step-by-step security hardening guide
```

## 🚀 Quick Links by Role

### Frontend Developers
**Goal**: Integrate Conduit into your application

1. **[Getting Started](getting-started.md)** - Deploy and integrate in 5 minutes
2. **[User Guide](user-guide.md)** - Complete integration examples (React, Vue, Vanilla JS)
3. **[API Reference](api-reference.md)** - API endpoints, request/response formats, templates

### Backend Developers / DevOps
**Goal**: Deploy, configure, and maintain Conduit

1. **[Getting Started](getting-started.md)** - Deployment options (Coolify, Docker)
2. **[Architecture](architecture.md)** - System design, components, data flows
3. **[Security](security/)** - Security implementation and hardening
4. **[API Reference](api-reference.md)** - Configuration, environment variables

### Security Engineers
**Goal**: Review and harden Conduit's security

1. **[Security Overview](security/README.md)** - Security checklist and status
2. **[Security Review](security/review.md)** - Threat model, vulnerabilities, compliance
3. **[Security Implementation](security/implementation.md)** - Step-by-step hardening guide

## 📖 Documentation Guide

### [Getting Started](getting-started.md)
**Time**: 5 minutes
**Audience**: Everyone

Quick start guide to deploy Conduit and send your first email.

**What you'll learn**:
- How to deploy Conduit (Coolify or Docker)
- How to generate secure API keys
- How to integrate with React or Vanilla JS
- Basic troubleshooting

**Start here if**: You want to get Conduit running quickly.

---

### [User Guide](user-guide.md)
**Time**: 15-30 minutes
**Audience**: Frontend developers

Complete integration guide with examples for multiple frameworks and use cases.

**What you'll learn**:
- Integration examples (React, Vue, Vanilla JS)
- Available channels and templates
- Advanced patterns (retry logic, error handling, loading states)
- API reference for frontend developers
- Troubleshooting common issues

**Start here if**: You need to integrate Conduit into your frontend application.

---

### [API Reference](api-reference.md)
**Time**: Reference document
**Audience**: All developers

Complete API specification, configuration guide, and technical reference.

**What you'll learn**:
- Full API specification (endpoints, request/response formats)
- Available templates and data schemas
- Environment configuration
- Rate limiting details
- Error codes and responses
- Multi-phase roadmap

**Start here if**: You need technical details about the API or configuration.

---

### [Architecture](architecture.md)
**Time**: 30-60 minutes
**Audience**: Backend developers, system architects

Deep dive into Conduit's system design and architecture.

**What you'll learn**:
- High-level system architecture diagrams
- Complete request flow (client → provider)
- Component details (Hono, middleware, channels, templates)
- Security architecture and boundary layers
- Middleware pipeline execution order
- Rate limiting algorithm (token bucket)
- Deployment architecture
- Scalability considerations

**Start here if**: You want to understand how Conduit works internally or need to extend it.

---

### [Security](security/)
**Time**: 1-2 hours
**Audience**: Security engineers, backend developers

Comprehensive security documentation, analysis, and implementation guide.

#### [Security Overview](security/README.md)
- Security philosophy and principles
- Current security status and roadmap
- **Critical security checklist** (Phase 1-3)
- Threat model summary
- Best practices for deployment and development
- GDPR/compliance overview
- Incident response overview

#### [Security Review](security/review.md)
- Executive summary and risk assessment
- Detailed threat model and attack surface
- **7 critical security gaps** with impact analysis
- **10+ important security concerns**
- Attack scenarios and mitigations
- Compliance considerations (GDPR, CCPA, SOC 2)
- Security testing recommendations
- Implementation checklist

#### [Security Implementation](security/implementation.md)
- **Step-by-step implementation guide** with code examples
- All 12 critical/important security measures
- Complete code examples (copy-paste ready)
- Testing patterns and examples
- Compliance implementation (GDPR log rotation, PII masking)
- Incident response procedures

**Start here if**: You need to implement or audit Conduit's security.

---

## 🎯 Common Tasks

### "I want to send emails from my React app"
1. Read [Getting Started](getting-started.md) → Steps 1-4
2. Copy the React integration code
3. Done!

### "I need to deploy Conduit to production"
1. Read [Getting Started](getting-started.md) → Deployment options
2. Review **[Security Checklist](security/README.md#critical-security-checklist)**
3. Implement critical security measures from [Security Implementation](security/implementation.md)
4. Deploy and test

### "I want to add a new email template"
1. Read [API Reference](api-reference.md) → Templates section
2. See template structure in [Architecture](architecture.md) → Template Engine
3. Create template following the pattern
4. Test with validation

### "I need to understand the security requirements"
1. Start with [Security Overview](security/README.md)
2. Review [Security Checklist](security/README.md#critical-security-checklist)
3. Implement items from [Security Implementation](security/implementation.md)
4. Read [Security Review](security/review.md) for deep analysis

### "How do I add SMS support?"
1. SMS is planned for Phase 2 (Q1 2026)
2. See roadmap in [API Reference](api-reference.md) → Product Roadmap
3. Review architecture in [Architecture](architecture.md) → Channel System
4. Watch [GitHub releases](https://github.com/eldtechnologies/conduit/releases) for updates

## 📋 Documentation Roadmap

### Current Status: Specification Phase ✅
- ✅ Complete API specification
- ✅ Architecture documentation
- ✅ Security review and implementation guide
- ✅ User integration guide
- ✅ Getting started guide

### Phase 1: Implementation (Next)
- ⏳ Implementation of core features
- ⏳ Unit and integration tests
- ⏳ Deployment guides (specific to Coolify, Railway, Render)
- ⏳ API client libraries (TypeScript, Python)

### Phase 2: Expansion
- ⏳ SMS and Push documentation
- ⏳ Webhook integration guides
- ⏳ Migration guides
- ⏳ Performance tuning guide

### Phase 3: Maturity
- ⏳ Video tutorials
- ⏳ Interactive examples
- ⏳ Community recipes and patterns
- ⏳ Advanced use cases

## 🤝 Contributing to Documentation

Found an issue or want to improve the docs?

1. **For errors**: [Open an issue](https://github.com/eldtechnologies/conduit/issues)
2. **For improvements**: Submit a pull request
3. **For questions**: [Start a discussion](https://github.com/eldtechnologies/conduit/discussions)

## 📞 Need Help?

- **GitHub Issues**: [Report bugs or request features](https://github.com/eldtechnologies/conduit/issues)
- **GitHub Discussions**: [Ask questions or share ideas](https://github.com/eldtechnologies/conduit/discussions)
- **Email**: security@eldtechnologies.com (for security issues)

---

**Last Updated**: 2025-10-05
**Documentation Version**: 1.0.0
**Project Status**: Specification Phase
