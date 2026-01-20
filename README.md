# Guardian App

Conversational AI assistant for healthcare organizations to assess AI vendors against 10 risk dimensions.

## Architecture

Guardian uses a **monorepo structure** with clean architecture:

- **apps/web** - Next.js 16 frontend (React 19)
- **packages/backend** - Express 5 backend (Node.js 22)
- **packages/shared** - Shared types and utilities

For detailed architecture, see `docs/design/architecture/architecture-layers.md`

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS v4, Shadcn/ui
- **Backend:** Node.js 22, Express 5, Socket.IO 4.8
- **Database:** PostgreSQL 17 + Drizzle ORM
- **AI:** Anthropic Claude API (Sonnet 4.5)
- **Package Manager:** pnpm 9+

## Prerequisites

- Node.js >= 22.11.0
- pnpm >= 9.0.0
- Docker & Docker Compose (for local database)

## Getting Started

### 1. Clone and Install

```bash
# Install dependencies
pnpm install
```

### 2. Setup Database

```bash
# Start PostgreSQL and Redis with Docker
docker-compose up -d

# Verify containers are running
docker-compose ps
```

### 3. Configure Environment Variables

```bash
# Copy backend environment template
cp packages/backend/.env.example packages/backend/.env

# Edit packages/backend/.env and set:
# - DATABASE_URL (default is correct for Docker setup)
# - JWT_SECRET (generate a secure random string)
# - ANTHROPIC_API_KEY (your Claude API key)
```

### 4. Run Database Migrations

```bash
# Generate migration from schema
pnpm --filter @guardian/backend db:generate

# Apply migration
pnpm --filter @guardian/backend db:migrate

# Optional: Open Drizzle Studio to view database
pnpm --filter @guardian/backend db:studio
```

### 5. Start Development Servers

```bash
# Start all services (frontend + backend)
pnpm dev

# Or start individually:
pnpm --filter @guardian/web dev        # Frontend: http://localhost:3000
pnpm --filter @guardian/backend dev    # Backend: http://localhost:8000
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Start all dev servers
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Lint code
pnpm lint

# Format code
pnpm format

# Clean all build artifacts and node_modules
pnpm clean
```

## Database Commands

```bash
# Generate migration from schema changes
pnpm --filter @guardian/backend db:generate

# Apply migrations
pnpm --filter @guardian/backend db:migrate

# Open Drizzle Studio (database GUI)
pnpm --filter @guardian/backend db:studio
```

## Database Schema

Guardian MVP uses 6 core tables:

1. **users** - System users (authentication)
2. **vendors** - Companies being assessed
3. **assessments** - Assessment metadata
4. **questions** - Claude-generated questionnaire
5. **conversations** - Chat sessions
6. **messages** - Chat message history

For detailed schema, see `docs/design/data/database-schema.md`

## Project Structure

```
guardian-app/
├── apps/
│   └── web/                    # Next.js frontend
│       ├── src/
│       │   ├── app/           # App Router pages
│       │   ├── components/    # React components
│       │   ├── hooks/         # Custom React hooks
│       │   └── lib/           # Utilities
│       └── package.json
├── packages/
│   ├── backend/               # Express backend
│   │   ├── src/
│   │   │   ├── domain/        # Business entities & rules
│   │   │   ├── application/   # Services & use cases
│   │   │   └── infrastructure/# Database, APIs, HTTP
│   │   └── package.json
│   └── shared/                # Shared types
│       ├── src/
│       │   ├── types/
│       │   └── errors/
│       └── package.json
├── docs/                      # Architecture & design docs
├── tasks/                     # Task tracking
├── docker-compose.yml         # Local database setup
└── package.json              # Root workspace config
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm --filter @guardian/backend test -- --watch
```

**Test Requirements:**
- All features MUST have tests
- Minimum 70% coverage (aim for 80%+)
- Integration tests for repositories
- Unit tests for domain logic

## Environment Variables

### Backend (.env)

```bash
# Database
DATABASE_URL=postgresql://guardian:guardian_password@localhost:5432/guardian_db

# Server
PORT=8000
NODE_ENV=development

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=4h

# Claude API
ANTHROPIC_API_KEY=your-anthropic-api-key

# CORS
FRONTEND_URL=http://localhost:3000
```

## Docker Services

### PostgreSQL 17
- **Port:** 5432
- **Database:** guardian_db
- **User:** guardian
- **Password:** guardian_password

### Redis 7
- **Port:** 6379
- **Used for:** Session storage (future), caching (future)

## Troubleshooting

### Docker containers not starting

```bash
# Check Docker is running
docker --version

# View logs
docker-compose logs postgres
docker-compose logs redis

# Restart containers
docker-compose restart
```

### Database connection errors

```bash
# Verify PostgreSQL is running
docker-compose ps

# Check DATABASE_URL in packages/backend/.env
# Should be: postgresql://guardian:guardian_password@localhost:5432/guardian_db

# Test connection
pnpm --filter @guardian/backend test -- database-connection
```

### Migration errors

```bash
# Drop and recreate database (WARNING: destroys all data)
docker-compose down -v
docker-compose up -d

# Wait for PostgreSQL to start
sleep 5

# Run migrations
pnpm --filter @guardian/backend db:migrate
```

## Contributing

See `CLAUDE.md` for development guidelines and architecture rules.

## Documentation

- **Architecture:** `docs/design/architecture/`
- **Database:** `docs/design/data/database-schema.md`
- **Tasks:** `tasks/mvp-tasks.md`
- **Guidelines:** `CLAUDE.md`

## License

Private - Healthcare use only

---

**Status:** MVP Development - Epic 28 ChatServer Refactoring in Progress
**Last Updated:** 2026-01-20
