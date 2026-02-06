# Backend Rules (packages/backend)

This file contains backend-specific rules and learnings. Updated automatically when GPT-5.2 catches issues during code review.

## Tech Stack

- Express 5.1
- PostgreSQL 17 + Drizzle ORM
- Socket.IO 4.8
- TypeScript (strict mode)

## Architecture

Clean Architecture layers:
1. **Domain** - Entities, value objects, domain services
2. **Application** - Use cases, DTOs, interfaces
3. **Infrastructure** - Database, external APIs, WebSocket
4. **Presentation** - HTTP routes, controllers

## Hard Rules

### File Size Limit
**Max 300 LOC per source file.** No exceptions for source files.
Exceptions: Test files (`*.test.ts`), type definitions (`types.ts`, `*.d.ts`), generated files.
If a file exceeds 300 LOC → split into focused modules by concern.

### Controller Purity
**Controllers delegate. They do NOT contain inline logic.**
- Controllers (ChatServer, MessageHandler, etc.) should ONLY receive input and delegate to services/handlers
- If you're writing business logic inside a controller → extract to a dedicated service
- If a method grows beyond simple delegation → it belongs in its own module

## Conventions

### Services
- One service per domain concern
- Services in `src/application/services/`
- Inject repositories via constructor

### Repositories
- Interface in `src/application/interfaces/`
- Implementation in `src/infrastructure/database/repositories/`
- Use Drizzle ORM for all database operations

### Controllers
- Thin controllers - delegate to services
- Validate input at controller level
- Return consistent response format

### Error Handling
- Use domain-specific error classes
- Map to HTTP status codes in controllers
- Never expose internal errors to clients

### Testing
- Unit tests for services (mock repositories)
- Integration tests for repositories (real test DB)
- E2E tests for critical paths only

---

## Learnings from GPT Reviews

<!-- Auto-appended by orchestrator when GPT catches issues -->
