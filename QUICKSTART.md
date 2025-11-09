# Guardian App - Quick Start Guide

Get Guardian running in 5 minutes.

## Prerequisites

- Node.js >= 22.11.0 (or 20.x will work with warnings)
- pnpm >= 9.0.0
- Docker Desktop (for database)

## 1. Install Dependencies

```bash
pnpm install
```

## 2. Start Database

```bash
docker-compose up -d
```

Wait 5-10 seconds for PostgreSQL to initialize.

## 3. Configure Environment

```bash
cp packages/backend/.env.example packages/backend/.env
```

Edit `packages/backend/.env` if needed (defaults work for local development).

## 4. Run Database Migration

```bash
pnpm db:migrate
```

You should see:
```
Running database migrations...
Migrations completed successfully!
```

## 5. Verify Setup

```bash
./verify-epic1.sh
```

All items should show ✓

## 6. Run Tests (Optional)

```bash
pnpm --filter @guardian/backend test
```

Expected output:
```
PASS  __tests__/integration/database-connection.test.ts
PASS  __tests__/integration/schema.test.ts

Test Suites: 2 passed, 2 total
Tests:       8 passed, 8 total
```

## 7. Start Development Servers

```bash
# Terminal 1: Start backend
pnpm --filter @guardian/backend dev

# Terminal 2: Start frontend (when ready)
pnpm --filter @guardian/web dev
```

Backend will run on http://localhost:8000
Frontend will run on http://localhost:3000

## Troubleshooting

### Docker not running
```bash
# Start Docker Desktop
# Then retry: docker-compose up -d
```

### Migration fails
```bash
# Reset database
docker-compose down -v
docker-compose up -d
sleep 5
pnpm db:migrate
```

### Tests fail
```bash
# Ensure Docker is running
docker-compose ps

# Should show postgres and redis as "Up"
```

## What's Next?

Epic 1 (Infrastructure) is complete. Next steps:

1. Epic 2: Authentication & User Management
2. Epic 3: Chat Infrastructure (Backend)
3. Epic 4: Frontend Chat UI

See `tasks/mvp-tasks.md` for full roadmap.

## Useful Commands

```bash
# Database
pnpm db:generate     # Generate new migration
pnpm db:migrate      # Apply migrations
pnpm db:studio       # Open Drizzle Studio (GUI)

# Development
pnpm dev             # Start all services
pnpm build           # Build all packages
pnpm test            # Run all tests
pnpm lint            # Lint code

# Docker
docker-compose up -d        # Start services
docker-compose down         # Stop services
docker-compose logs -f      # View logs
docker-compose down -v      # Reset (destroys data!)
```

## Architecture Overview

```
guardian-app/
├── apps/web/              # Next.js 16 frontend
├── packages/backend/      # Express 5 backend
│   └── src/
│       ├── domain/           # (Epic 2+) Business entities
│       ├── application/      # (Epic 2+) Services & use cases
│       └── infrastructure/   # Database, APIs, HTTP
│           └── database/
│               ├── client.ts
│               ├── schema/   # 6 MVP tables
│               └── migrations/
└── packages/shared/       # Shared types
```

Clean architecture with 4 layers:
- **Presentation** (Next.js frontend)
- **Application** (Services)
- **Domain** (Business logic)
- **Infrastructure** (Database, APIs)

See `docs/design/architecture/architecture-layers.md` for details.

---

**Status:** Epic 1 Complete ✅
**Last Updated:** 2025-01-06
