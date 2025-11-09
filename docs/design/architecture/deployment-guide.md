# Guardian Deployment Guide

**Version:** 1.0 (Extracted from system-design.md v1.5)
**Last Updated:** 2025-01-04
**Status:** Planning (Infrastructure TBD)

---

## Part of Guardian System Architecture

**Related Documents:**
- **Overview:** `overview.md` - High-level vision and goals
- **Architecture:** `architecture-layers.md` - Layers, modules, foundational patterns
- **Implementation:** `implementation-guide.md` - Build instructions, data flows, testing
- **Tasks:** `tasks/task-overview.md` - Current work and priorities
- **Quick Reference:** `CLAUDE.md` - Guardrails for Claude sessions

---

## Deployment Architecture (MVP)

### Development Environment

**Local Development Setup:**

```
Frontend:  localhost:3000 (Next.js dev server)
Backend:   localhost:8000 (Node.js Express server)
Database:  localhost:5432 (PostgreSQL 17)
Redis:     localhost:6379 (Redis cache)
```

**Docker Compose Configuration:**

```yaml
# docker-compose.yml (placeholder - to be created)
version: '3.8'

services:
  postgres:
    image: postgres:17
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: guardian_dev
      POSTGRES_USER: guardian
      POSTGRES_PASSWORD: dev_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

**Development Workflow:**
```bash
# Terminal 1: Start database and Redis
docker-compose up

# Terminal 2: Start backend
cd packages/backend
npm run dev

# Terminal 3: Start frontend
cd apps/web
npm run dev

# Access app at http://localhost:3000
```

---

### Demo/Staging Environment

**Hosting:** Vercel (frontend) + Railway/Render (backend + database)

**Frontend (Vercel):**
- Automatic deployment from `main` branch
- Environment: `staging.guardian-app.vercel.app`
- Build command: `npm run build`
- Environment variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`

**Backend (Railway/Render):**
- Automatic deployment from `main` branch
- Service: Node.js 22, Express server
- Health check: `GET /health`
- Environment variables:
  - `DATABASE_URL` (provided by Railway/Render)
  - `REDIS_URL` (provided by Railway/Render)
  - `ANTHROPIC_API_KEY` (secret)
  - `JWT_SECRET` (secret)
  - `SMTP_*` (for email delivery)

**Database (Railway/Render PostgreSQL):**
- PostgreSQL 17 managed instance
- Automatic backups (daily)
- Connection string injected as `DATABASE_URL`

**Redis (Railway/Render Redis):**
- Redis 7 managed instance
- Connection string injected as `REDIS_URL`

**Deployment Trigger:** Push to `main` branch → Auto-deploy frontend + backend

---

### Production Environment (Future)

**Hosting:** AWS (multi-region, high availability)

**Architecture:**
```
┌─────────────────────────────────────────────┐
│  Users (HTTPS)                              │
└──────────────┬──────────────────────────────┘
               ↓
┌──────────────────────────────────────────────┐
│  CloudFront CDN                              │
│  - Static assets (Next.js frontend)         │
│  - Edge caching                              │
└──────────────┬───────────────────────────────┘
               ↓
┌──────────────────────────────────────────────┐
│  Application Load Balancer                   │
│  - SSL termination                           │
│  - Health checks                             │
└──────────────┬───────────────────────────────┘
               ↓
┌──────────────────────────────────────────────┐
│  ECS/EC2 Cluster (Backend)                   │
│  - Express API servers (auto-scaling 2-10)   │
│  - WebSocket servers (sticky sessions)       │
└──────────────┬───────────────────────────────┘
               ↓
┌──────────────────────────────────────────────┐
│  RDS PostgreSQL (Multi-AZ)                   │
│  - Primary + Read Replica                    │
│  - Automated backups (7-day retention)       │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  ElastiCache Redis (Cluster Mode)            │
│  - Session storage                           │
│  - Application cache                         │
└──────────────────────────────────────────────┘
```

**Components:**

**Frontend:**
- S3 bucket for static files (Next.js build output)
- CloudFront distribution (CDN, global edge locations)
- Custom domain with Route 53 DNS
- SSL certificate via ACM

**Backend:**
- ECS Fargate or EC2 Auto Scaling Group
- Docker containers running Express server
- Target group behind ALB
- Auto-scaling: 2-10 instances based on CPU/memory

**Database:**
- RDS PostgreSQL 17 (Multi-AZ for high availability)
- Instance class: db.t4g.large (or larger based on load)
- Storage: GP3 SSD with auto-scaling
- Automated backups: Daily, 7-day retention
- Read replica for analytics queries (optional)

**Cache:**
- ElastiCache Redis (Cluster mode)
- Node type: cache.t4g.micro (or larger)
- Multi-AZ replication

**Monitoring:**
- CloudWatch for logs and metrics
- Alerts for: API errors, high latency, CPU > 80%, memory > 80%
- Custom metrics: Claude API cost, assessment completion rate

**Security:**
- VPC with private subnets (database, cache)
- Security groups restricting access
- Secrets Manager for API keys and secrets
- WAF for DDoS protection (optional)

---

## Environment Variables

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

### Backend (.env)
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/guardian_dev

# Redis
REDIS_URL=redis://localhost:6379

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Auth
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRY=4h

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@guardian-app.com
SMTP_PASSWORD=...

# Application
NODE_ENV=development
PORT=8000
CORS_ORIGIN=http://localhost:3000
```

---

## CI/CD Pipeline (Placeholder)

**GitHub Actions Workflow (future):**

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - Checkout
      - Setup Node.js 22
      - Install dependencies
      - Run tests
      - Run linter

  deploy-frontend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - Deploy to Vercel

  deploy-backend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - Deploy to Railway/Render
```

**Deployment Gates:**
- ✅ All tests pass
- ✅ Linter passes
- ✅ Build succeeds
- ✅ No security vulnerabilities (npm audit)

---

## Monitoring & Observability (Future)

**Metrics to Track:**
- Assessment completion rate
- Average analysis time
- Claude API latency and costs
- Error rates by endpoint
- WebSocket connection stability
- Cache hit rates

**Logging Strategy:**
- Structured JSON logs
- Log levels: ERROR, WARN, INFO, DEBUG
- Request correlation IDs
- Sensitive data redaction (API keys, PII)

**Alerting:**
- Claude API failures > 5% (page on-call)
- Database connection errors
- High memory usage > 80%
- Slow queries > 5 seconds

---

## Security Considerations

**Secrets Management:**
- Development: `.env` files (git ignored)
- Staging/Production: AWS Secrets Manager or Railway/Render env vars

**API Key Protection:**
- Never expose Anthropic API key to frontend
- Backend-only API calls to Claude
- Rotate keys quarterly

**Database Security:**
- No public access (private subnet)
- SSL/TLS connections required
- Least-privilege database user
- Encrypted at rest (RDS encryption)

**Authentication:**
- JWT tokens with 4-hour expiry
- Refresh token rotation
- HTTP-only cookies for tokens
- CSRF protection

---

## Scaling Considerations (Future)

**Horizontal Scaling:**
- Backend: Add more ECS tasks/EC2 instances
- Database: Read replicas for analytics queries
- Redis: Cluster mode for distributed cache

**Vertical Scaling:**
- Database: Increase instance size if needed
- Redis: Increase node size for larger cache

**Cost Optimization:**
- Use spot instances for non-critical workloads
- S3 lifecycle policies for old reports
- CloudFront caching reduces origin load
- Redis eviction policies for cache size management

---

## Backup & Disaster Recovery

**Database Backups:**
- Automated daily backups (RDS)
- 7-day retention minimum
- Point-in-time recovery available
- Test restore quarterly

**Application State:**
- Conversation history in PostgreSQL (backed up)
- Reports cached in Redis (ephemeral, can be regenerated)
- Assessments in PostgreSQL (backed up)

**Recovery Time Objectives:**
- RTO: 4 hours (maximum downtime)
- RPO: 24 hours (maximum data loss)

**Disaster Recovery Plan:**
- Multi-region RDS failover (optional for production)
- Backup restore procedure documented
- Runbook for common failure scenarios

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-04 | Extracted from system-design.md v1.5 - Contains deployment environments (dev/staging/prod), Docker Compose setup, CI/CD placeholder, monitoring strategy, security considerations, scaling plans |

---

**This document defines DEPLOYMENT AND INFRASTRUCTURE for Guardian.** DevOps engineers and infrastructure agents reference this when setting up environments.

**For architecture principles, see:** `architecture-layers.md`
**For implementation details, see:** `implementation-guide.md`
