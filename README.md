# Guardian App

Conversational AI assistant for healthcare organizations to assess AI vendors against 10 risk dimensions. Built as a chat-first application where structured assessment workflows are embedded within natural conversation.

## Architecture

Guardian is a **pnpm monorepo** with clean architecture (Domain, Application, Infrastructure, Presentation):

- **apps/web** -- Next.js 16 frontend (React 19, Tailwind v4, Shadcn/ui)
- **packages/backend** -- Express 5 backend (Node.js 22, Socket.IO 4, Drizzle ORM)
- **packages/shared** -- Shared types, DTOs, and validation schemas (Zod)

For detailed architecture, see `docs/design/architecture/architecture-layers.md`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS v4, Shadcn/ui, Zustand |
| **Backend** | Node.js 22, Express 5, Socket.IO 4.8, TypeScript 5.6+ |
| **Database** | PostgreSQL 17 + Drizzle ORM |
| **AI** | Anthropic Claude API (Sonnet 4.5) via `@anthropic-ai/sdk` |
| **Testing** | Jest (unit/integration), Playwright (E2E) |
| **Package Manager** | pnpm 9+ |

## Key Features

- **Conversational assessment** -- Chat-based vendor evaluation with dynamic question generation
- **10-dimension risk scoring** -- Rubric v1.1 with sub-score rules and weighted composite scores per solution type (clinical, administrative, patient-facing)
- **Scoring pipeline** -- Normalize, reconcile (ScoringPayloadReconciler auto-corrects arithmetic), validate, store
- **Document intake** -- PDF and Word upload with background text extraction and AI-powered parsing
- **ISO compliance mapping** -- Framework controls mapped to risk dimensions
- **Multi-format export** -- PDF, Word, and Excel for both questionnaires and scoring results
- **Streaming responses** -- Real-time chat via WebSocket with Claude API streaming
- **Mode switching** -- Consult (free-form Q&A), Assessment (structured evaluation), Portfolio (analytics)

## Prerequisites

- Node.js >= 22.11.0
- pnpm >= 9.0.0
- Docker & Docker Compose (for PostgreSQL and Redis)
- Anthropic API key

## Getting Started

### 1. Clone and Install

```bash
git clone <repo-url>
cd guardian-app
pnpm install
```

### 2. Start Database

```bash
docker-compose up -d

# Verify containers are running
docker-compose ps
```

This starts PostgreSQL 17 on port **5433** and Redis 7 on port 6379.

### 3. Configure Environment

```bash
cp packages/backend/.env.example packages/backend/.env
```

Edit `packages/backend/.env`:

```bash
# Database (note port 5433 per docker-compose)
DATABASE_URL=postgresql://guardian:guardian_password@localhost:5433/guardian_db

# Server
PORT=8000
CORS_ORIGIN=http://localhost:3000

# Authentication
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=4h

# Claude API
ANTHROPIC_API_KEY=your-anthropic-api-key

# Dev-only: skip Claude API for questionnaire generation (returns 3-question fixture)
GUARDIAN_FAST_GENERATION=false
```

### 4. Run Migrations

```bash
pnpm --filter @guardian/backend db:migrate
```

### 5. Start Development Servers

```bash
# Start both frontend and backend
pnpm dev

# Or individually:
pnpm --filter @guardian/backend dev    # Backend: http://localhost:8000  (tsx watch)
pnpm --filter @guardian/web dev        # Frontend: http://localhost:3000
```

**Note:** Use `pnpm dev` (tsx watch), not `pnpm start` (production build has known import issues).

## Development Commands

### General

```bash
pnpm dev              # Start all dev servers (parallel)
pnpm build            # Build all packages
pnpm lint             # Lint all packages
pnpm format           # Format with Prettier
pnpm clean            # Remove build artifacts and node_modules
```

### Testing

```bash
# All tests
pnpm test             # Unit + integration (all packages)
pnpm test:unit        # Unit tests only
pnpm test:coverage    # With coverage report

# Backend-specific
pnpm --filter @guardian/backend test:watch        # Watch mode (recommended during dev)
pnpm --filter @guardian/backend test:watch:unit   # Watch unit tests only
pnpm --filter @guardian/backend test:unit         # Unit tests
pnpm --filter @guardian/backend test:integration  # Integration tests (requires test DB)
pnpm --filter @guardian/backend test:e2e          # E2E tests

# Frontend-specific
pnpm --filter @guardian/web test:unit             # Unit tests
pnpm --filter @guardian/web test:watch            # Watch mode
pnpm --filter @guardian/web test:e2e              # Playwright E2E
```

### Database

```bash
pnpm --filter @guardian/backend db:generate       # Generate migration from schema changes
pnpm --filter @guardian/backend db:migrate        # Apply migrations
pnpm --filter @guardian/backend db:studio         # Open Drizzle Studio (database GUI)
```

### Test Database Setup

Integration tests require a separate test database to avoid wiping dev data:

```bash
# Create test database (one-time)
docker exec guardian-postgres psql -U guardian -d postgres -c "CREATE DATABASE guardian_test"

# Add to packages/backend/.env
# TEST_DATABASE_URL=postgresql://guardian:guardian_password@localhost:5433/guardian_test

# Run migrations on test database
pnpm --filter @guardian/backend db:migrate:test
```

## Project Structure

```
guardian-app/
├── apps/
│   └── web/                          # Next.js 16 frontend
│       └── src/
│           ├── app/                   # App Router (dashboard, login, register)
│           ├── components/            # React components (auth, chat, ui)
│           ├── hooks/                 # Custom React hooks
│           ├── stores/                # Zustand state stores
│           └── lib/                   # Utilities
├── packages/
│   ├── backend/                       # Express 5 backend
│   │   └── src/
│   │       ├── domain/                # Business entities and rules
│   │       │   ├── entities/          # Core entities (User, Vendor, Assessment, ...)
│   │       │   ├── scoring/           # Scoring rubric, validators, reconciler
│   │       │   ├── compliance/        # ISO compliance framework entities
│   │       │   ├── value-objects/     # Value objects
│   │       │   └── types/             # Domain types
│   │       ├── application/           # Services and use cases
│   │       │   ├── services/          # Business logic (Scoring*, Assessment, Auth, ...)
│   │       │   └── interfaces/        # Repository contracts
│   │       ├── infrastructure/        # External integrations
│   │       │   ├── ai/               # Claude API clients (Stream, Text, Vision)
│   │       │   ├── database/          # Drizzle schema, migrations, repositories
│   │       │   ├── extraction/        # Document text extraction pipeline
│   │       │   ├── export/            # PDF, Word, Excel exporters
│   │       │   ├── http/              # Express routes
│   │       │   ├── websocket/         # Socket.IO handlers
│   │       │   ├── rendering/         # HTML/Markdown rendering
│   │       │   └── storage/           # File storage (S3-compatible)
│   │       └── types/                 # Infrastructure types
│   └── shared/                        # Shared types and validation (Zod)
├── docs/design/                       # Architecture and data design docs
├── tasks/                             # Task tracking (single source of truth)
├── docker-compose.yml                 # PostgreSQL 17 + Redis 7
└── package.json                       # Root workspace config
```

## Database

PostgreSQL 17 with 17 tables managed by Drizzle ORM:

**Core tables:** users, vendors, assessments, conversations, messages, questions, responses, files

**Scoring tables:** assessment_results, dimension_scores

**Compliance tables:** compliance_frameworks, framework_versions, framework_controls, interpretive_criteria, dimension_control_mappings, assessment_compliance_results

### Docker Services

| Service | Port | Database | Credentials |
|---------|------|----------|-------------|
| PostgreSQL 17 | 5433 (host) -> 5432 (container) | guardian_db | guardian / guardian_password |
| Redis 7 | 6379 | -- | -- |

## Backend Architecture Highlights

### Scoring Pipeline (Rubric v1.1)

The scoring system uses a hybrid approach: Claude interprets qualitative vendor responses against the rubric, then TypeScript validates and stores the structured output.

1. **Claude scores** vendor responses per dimension (10 dimensions, each with sub-score rules)
2. **ScoringPayloadReconciler** auto-corrects arithmetic (dimension totals from sub-scores, composite from weighted average, recommendation coherence with disqualifiers)
3. **ScoringPayloadValidator** validates structural integrity
4. **ScoringStorageService** persists results

Scoring services are decomposed into: ScoringLLMService, ScoringStorageService, ScoringQueryService, ScoringRetryService, ScoringMetricsCollector.

### Claude API Clients

Decomposed by concern: ClaudeClientBase (shared config), ClaudeStreamClient (streaming chat), ClaudeTextClient (single-turn), ClaudeVisionClient (image analysis).

### Document Extraction Pipeline

ExtractionRoutingService -> TextExtractionService (PDF/Word) -> RegexResponseExtractor -> ExtractionConfidenceCalculator.

## Troubleshooting

### Docker containers not starting

```bash
docker --version                       # Verify Docker is installed
docker-compose logs postgres           # Check PostgreSQL logs
docker-compose restart                 # Restart containers
```

### Database connection errors

```bash
docker-compose ps                      # Verify PostgreSQL is running

# Ensure DATABASE_URL uses port 5433 (not 5432)
# postgresql://guardian:guardian_password@localhost:5433/guardian_db
```

### Migration errors

```bash
# Nuclear option: drop and recreate (WARNING: destroys all data)
docker-compose down -v
docker-compose up -d
sleep 5
pnpm --filter @guardian/backend db:migrate
```

### Backend won't start with `pnpm start`

Use `pnpm --filter @guardian/backend dev` instead. The production build has known .js extension issues in route imports. The `dev` script uses tsx watch and works correctly.

## Documentation

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Development guidelines and architecture rules |
| `docs/design/architecture/overview.md` | Project vision and goals |
| `docs/design/architecture/architecture-layers.md` | 4-layer clean architecture details |
| `docs/design/architecture/implementation-guide.md` | Data flows, caching, testing strategy |
| `docs/design/data/database-schema.md` | Database schema reference |
| `tasks/task-overview.md` | Current task status and roadmap |

## License

Private -- Healthcare use only

---

**Status:** Active Development -- Rubric v1.1 with full 10-dimension weighted scoring
**Last Updated:** 2026-02-26
