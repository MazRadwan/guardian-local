# Guardian MVP - Task Breakdown

**Version:** 1.0
**Last Updated:** 2025-01-04
**Phase:** MVP (Phase 1) - Chat + Questionnaire Generation
**Status:** Planning Complete, Ready for Execution

---

## Overview

MVP broken into **7 epics, ~45 stories**. Each story is small enough for one agent to complete in 2-4 hours.

**See also:**
- **Roadmap:** `roadmap.md` - Full feature plan
- **Current status:** `task-overview.md` - Execution tracking
- **Architecture:** `docs/design/architecture/architecture-layers.md`
- **Database:** `docs/design/data/database-schema.md`

---

## Epic 1: Project Setup & Infrastructure

**Goal:** Initialize monorepo, database, and development environment.

### Story 1.1: Initialize Monorepo Structure

**Description:** Create monorepo with pnpm workspaces, setup Next.js frontend and Express backend packages.

**Acceptance Criteria:**
- [ ] Monorepo initialized with pnpm workspaces
- [ ] `apps/web` package created (Next.js 16)
- [ ] `packages/backend` package created (Node.js 22, Express 5)
- [ ] `packages/shared` package created (shared types)
- [ ] All packages have package.json with correct dependencies
- [ ] TypeScript configured (strict mode, paths)
- [ ] ESLint and Prettier configured
- [ ] Git initialized with .gitignore

**Files to Create:**
- `package.json` (root)
- `pnpm-workspace.yaml`
- `apps/web/package.json`
- `packages/backend/package.json`
- `packages/shared/package.json`
- `tsconfig.json` (root + per package)
- `.eslintrc.json`
- `.prettierrc`
- `.gitignore`

**Dependencies:** None (first task)

**Tests:** N/A (setup task)

---

### Story 1.2: Setup PostgreSQL with Drizzle

**Description:** Configure PostgreSQL connection, setup Drizzle ORM, create database client.

**Acceptance Criteria:**
- [ ] Drizzle ORM and Drizzle Kit installed
- [ ] `drizzle.config.ts` created with correct schema path
- [ ] Database client (`packages/backend/src/infrastructure/database/client.ts`) created
- [ ] Connection pooling configured (max 20 connections)
- [ ] Environment variables configured (DATABASE_URL)
- [ ] Connection test successful

**Files to Create:**
- `drizzle.config.ts`
- `packages/backend/src/infrastructure/database/client.ts`
- `packages/backend/.env.example`

**Dependencies:** Story 1.1 (monorepo structure)

**Tests:**
```typescript
// __tests__/integration/database-connection.test.ts
describe('Database Connection', () => {
  it('should connect to PostgreSQL', async () => {
    const result = await db.execute(sql`SELECT 1`)
    expect(result).toBeDefined()
  })
})
```

---

### Story 1.3: Create Database Schema & Migrations

**Description:** Implement Drizzle schema for 6 MVP tables, generate and apply initial migration.

**Acceptance Criteria:**
- [ ] All 6 tables defined in Drizzle schema (users, vendors, assessments, questions, conversations, messages)
- [ ] Relationships and foreign keys correct
- [ ] Indexes defined per database-schema.md spec
- [ ] Migration generated (`npx drizzle-kit generate`)
- [ ] Migration applied successfully
- [ ] Drizzle Studio shows all tables

**Files to Create:**
- `packages/backend/src/infrastructure/database/schema/users.ts`
- `packages/backend/src/infrastructure/database/schema/vendors.ts`
- `packages/backend/src/infrastructure/database/schema/assessments.ts`
- `packages/backend/src/infrastructure/database/schema/questions.ts`
- `packages/backend/src/infrastructure/database/schema/conversations.ts`
- `packages/backend/src/infrastructure/database/schema/messages.ts`
- `packages/backend/src/infrastructure/database/schema/index.ts`
- `packages/backend/src/infrastructure/database/migrations/0001_create_mvp_tables.sql`

**Dependencies:** Story 1.2 (Drizzle setup)

**Tests:**
```typescript
// __tests__/integration/schema.test.ts
describe('Database Schema', () => {
  it('should have all 6 MVP tables', async () => {
    const tables = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
    expect(tables.rows).toHaveLength(6)
  })
})
```

---

### Story 1.4: Setup Docker Compose for Development

**Description:** Create Docker Compose configuration for PostgreSQL and Redis (for future caching).

**Acceptance Criteria:**
- [ ] `docker-compose.yml` created with PostgreSQL 17 and Redis 7
- [ ] Environment variables configured
- [ ] Volumes configured for data persistence
- [ ] `docker-compose up` starts services successfully
- [ ] Backend can connect to PostgreSQL in Docker
- [ ] README updated with setup instructions

**Files to Create:**
- `docker-compose.yml`
- `README.md` (development setup section)

**Dependencies:** Story 1.2 (need DATABASE_URL format)

**Tests:** N/A (infrastructure setup)

---

## Epic 2: Authentication & User Management

**Goal:** Secure user authentication with JWT tokens and role-based authorization.

### Story 2.1: Implement User Entity & Repository

**Description:** Create User domain entity with validation, implement repository interface and Drizzle repository.

**Acceptance Criteria:**
- [ ] User entity created with validation (email format, password requirements)
- [ ] IUserRepository interface defined
- [ ] DrizzleUserRepository implements interface
- [ ] CRUD operations: create, findByEmail, findById, update, delete
- [ ] Password hashing with bcrypt
- [ ] All unit and integration tests pass

**Files to Create:**
- `packages/backend/src/domain/entities/User.ts`
- `packages/backend/src/domain/value-objects/Email.ts`
- `packages/backend/src/application/interfaces/IUserRepository.ts`
- `packages/backend/src/infrastructure/database/repositories/DrizzleUserRepository.ts`
- `__tests__/unit/User.test.ts`
- `__tests__/integration/DrizzleUserRepository.test.ts`

**Dependencies:** Story 1.3 (users table exists)

**Tests Required:**
```typescript
// Unit tests
- User.create() validates email format
- User.create() throws error for invalid email
- User.setPassword() hashes password with bcrypt

// Integration tests
- Repository saves user to database
- Repository finds user by email
- Repository returns null for non-existent user
```

---

### Story 2.2: Implement Authentication Service

**Description:** Create AuthService for registration, login, JWT generation/validation.

**Acceptance Criteria:**
- [ ] AuthService.register() creates new user
- [ ] AuthService.login() validates credentials and returns JWT
- [ ] AuthService.validateToken() decodes and validates JWT
- [ ] JWT contains userId, email, role
- [ ] Token expiry set to 4 hours
- [ ] All tests pass

**Files to Create:**
- `packages/backend/src/application/services/AuthService.ts`
- `packages/backend/src/infrastructure/auth/JWTProvider.ts`
- `packages/backend/src/application/interfaces/ITokenProvider.ts`
- `__tests__/unit/AuthService.test.ts`

**Dependencies:** Story 2.1 (User entity and repository)

**Tests Required:**
```typescript
// Unit tests (mock repository)
- AuthService.register() creates user with hashed password
- AuthService.login() returns JWT for valid credentials
- AuthService.login() throws error for invalid credentials
- AuthService.validateToken() returns user for valid token
- AuthService.validateToken() throws error for expired token
```

---

### Story 2.3: Implement Auth API Endpoints

**Description:** Create Express routes and controllers for registration and login.

**Acceptance Criteria:**
- [ ] POST /api/auth/register endpoint
- [ ] POST /api/auth/login endpoint
- [ ] Request validation middleware
- [ ] Error handling middleware
- [ ] Returns appropriate HTTP status codes (201, 200, 400, 401)
- [ ] E2E tests pass

**Files to Create:**
- `packages/backend/src/infrastructure/http/routes/auth.routes.ts`
- `packages/backend/src/infrastructure/http/controllers/AuthController.ts`
- `packages/backend/src/infrastructure/http/middleware/validation.middleware.ts`
- `packages/backend/src/infrastructure/http/middleware/error.middleware.ts`
- `__tests__/e2e/auth.test.ts`

**Dependencies:** Story 2.2 (AuthService)

**Tests Required:**
```typescript
// E2E tests
- POST /api/auth/register creates user and returns 201
- POST /api/auth/register returns 400 for invalid email
- POST /api/auth/login returns JWT for valid credentials
- POST /api/auth/login returns 401 for invalid credentials
```

---

### Story 2.4: Implement Auth Middleware

**Description:** Create middleware to protect routes, validate JWT, check user roles.

**Acceptance Criteria:**
- [ ] authMiddleware validates JWT from Authorization header
- [ ] Attaches user to request object
- [ ] Returns 401 for missing/invalid token
- [ ] roleMiddleware checks user role
- [ ] Returns 403 for insufficient permissions
- [ ] All tests pass

**Files to Create:**
- `packages/backend/src/infrastructure/http/middleware/auth.middleware.ts`
- `packages/backend/src/infrastructure/http/middleware/role.middleware.ts`
- `__tests__/unit/auth.middleware.test.ts`

**Dependencies:** Story 2.3 (auth endpoints exist)

**Tests Required:**
```typescript
// Unit tests
- authMiddleware attaches user for valid token
- authMiddleware returns 401 for missing token
- roleMiddleware allows admin through
- roleMiddleware blocks viewer from analyst-only route
```

---

## Epic 3: Chat Infrastructure (Backend)

**Goal:** WebSocket server, conversation management, message persistence.

### Story 3.1: Setup Express Server with WebSocket

**Description:** Create Express server with Socket.IO integration, CORS configuration, and basic health check.

**Acceptance Criteria:**
- [ ] Express server starts on port 8000
- [ ] Socket.IO attached to server
- [ ] CORS configured for frontend (localhost:3000)
- [ ] GET /health endpoint returns 200
- [ ] WebSocket connection test successful
- [ ] Server gracefully handles shutdown

**Files to Create:**
- `packages/backend/src/infrastructure/http/server.ts`
- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
- `packages/backend/src/index.ts` (entry point)
- `__tests__/e2e/server.test.ts`

**Dependencies:** Story 1.1 (backend package exists), Story 2.4 (auth middleware for protected routes)

**Tests Required:**
```typescript
// E2E tests
- Server starts and listens on port 8000
- GET /health returns 200
- WebSocket connection succeeds
- CORS allows requests from localhost:3000
```

---

### Story 3.2: Implement Conversation Entity & Repository

**Description:** Create Conversation domain entity and repository for managing chat sessions.

**Acceptance Criteria:**
- [ ] Conversation entity created with validation
- [ ] IConversationRepository interface defined
- [ ] DrizzleConversationRepository implements interface
- [ ] Methods: create, findById, findByUserId, updateMode, updateStatus, delete
- [ ] All unit and integration tests pass

**Files to Create:**
- `packages/backend/src/domain/entities/Conversation.ts`
- `packages/backend/src/application/interfaces/IConversationRepository.ts`
- `packages/backend/src/infrastructure/database/repositories/DrizzleConversationRepository.ts`
- `__tests__/unit/Conversation.test.ts`
- `__tests__/integration/DrizzleConversationRepository.test.ts`

**Dependencies:** Story 1.3 (conversations table), Story 2.1 (User entity for FK)

**Tests Required:**
```typescript
// Unit tests
- Conversation.create() validates required fields
- Conversation.switchMode() changes mode
- Conversation.complete() sets completedAt timestamp

// Integration tests
- Repository saves conversation
- Repository finds by user ID
- Repository updates mode
```

---

### Story 3.3: Implement Message Entity & Repository

**Description:** Create Message domain entity and repository for chat message persistence.

**Acceptance Criteria:**
- [ ] Message entity created with JSONB content structure
- [ ] IMessageRepository interface defined
- [ ] DrizzleMessageRepository implements interface
- [ ] Methods: create, findByConversationId, getHistory (paginated)
- [ ] JSONB content properly typed
- [ ] All tests pass

**Files to Create:**
- `packages/backend/src/domain/entities/Message.ts`
- `packages/backend/src/domain/value-objects/MessageContent.ts`
- `packages/backend/src/application/interfaces/IMessageRepository.ts`
- `packages/backend/src/infrastructure/database/repositories/DrizzleMessageRepository.ts`
- `__tests__/unit/Message.test.ts`
- `__tests__/integration/DrizzleMessageRepository.test.ts`

**Dependencies:** Story 1.3 (messages table), Story 3.2 (Conversation entity)

**Tests Required:**
```typescript
// Unit tests
- Message.create() validates role (user/assistant/system)
- Message.create() validates content structure
- MessageContent properly serializes to JSONB

// Integration tests
- Repository saves message with JSONB content
- Repository retrieves conversation history (last 50 messages)
- Repository orders messages by createdAt
```

---

### Story 3.4: Implement Conversation Service

**Description:** Create ConversationService to orchestrate conversation workflows (create, switch mode, handle messages).

**Acceptance Criteria:**
- [ ] ConversationService.createConversation(userId, mode) creates new conversation
- [ ] ConversationService.switchMode(conversationId, newMode) updates mode
- [ ] ConversationService.sendMessage(conversationId, content) saves message
- [ ] ConversationService.getHistory(conversationId) returns messages
- [ ] Service uses repository interfaces (no direct DB access)
- [ ] All unit tests pass (mocked repositories)

**Files to Create:**
- `packages/backend/src/application/services/ConversationService.ts`
- `packages/backend/src/application/dtos/CreateConversationDTO.ts`
- `packages/backend/src/application/dtos/SendMessageDTO.ts`
- `__tests__/unit/ConversationService.test.ts`

**Dependencies:** Story 3.2 (Conversation repository), Story 3.3 (Message repository)

**Tests Required:**
```typescript
// Unit tests (mock repositories)
- createConversation() calls repository.create()
- sendMessage() validates message and saves
- getHistory() retrieves last 50 messages
- switchMode() only allows valid mode transitions
```

---

### Story 3.5: Implement WebSocket Chat Endpoint

**Description:** Create WebSocket server that handles incoming messages, saves to DB, streams responses.

**Acceptance Criteria:**
- [ ] Socket.IO server listens on `/chat` namespace
- [ ] On connection: Authenticate user via JWT
- [ ] On 'send_message' event: Save message, emit to client
- [ ] On 'get_history' event: Return conversation history
- [ ] On disconnect: Log disconnect
- [ ] Error handling for failed message saves
- [ ] All E2E tests pass

**Files to Create:**
- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`
- `__tests__/e2e/websocket-chat.test.ts`

**Dependencies:** Story 3.1 (server setup), Story 3.4 (ConversationService)

**Tests Required:**
```typescript
// E2E tests
- Client connects to WebSocket with valid JWT
- Client connection rejected with invalid JWT
- send_message event saves to database
- send_message event emits to client
- get_history returns conversation messages
```

---

## Epic 4: Frontend Chat UI

**Goal:** Build Next.js chat interface with streaming, message display, mode switcher.

### Story 4.1: Setup Next.js App Structure

**Description:** Initialize Next.js 16 app with Tailwind v4, Shadcn/ui, and basic routing.

**Acceptance Criteria:**
- [ ] Next.js 16 initialized with App Router
- [ ] Tailwind CSS v4 configured (no config file, CSS-first)
- [ ] Shadcn/ui installed and configured
- [ ] Basic layout created (header, main content, footer)
- [ ] Home page routes to chat interface
- [ ] Dark mode support (optional)
- [ ] App builds successfully (`npm run build`)

**Files to Create:**
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/globals.css` (Tailwind import)
- `apps/web/tailwind.config.ts` (if needed for v4)
- `apps/web/components.json` (Shadcn config)

**Dependencies:** Story 1.1 (frontend package exists)

**Tests:** N/A (UI setup task, visual verification)

---

### Story 4.2: Build Chat Message Component

**Description:** Create reusable ChatMessage component that renders user/assistant messages with embedded components.

**Acceptance Criteria:**
- [ ] ChatMessage component renders text content
- [ ] Supports role-based styling (user vs assistant)
- [ ] Renders embedded components (buttons, links)
- [ ] Markdown support for message text
- [ ] Timestamp display
- [ ] Component is accessible (ARIA labels)
- [ ] Storybook story created (optional)

**Files to Create:**
- `apps/web/src/components/chat/ChatMessage.tsx`
- `apps/web/src/components/chat/EmbeddedButton.tsx`
- `apps/web/src/components/chat/EmbeddedLink.tsx`
- `apps/web/src/lib/markdown.ts` (markdown parser)

**Dependencies:** Story 4.1 (Next.js setup)

**Tests:**
```typescript
// Component tests (React Testing Library)
- Renders user message with correct styling
- Renders assistant message with correct styling
- Renders embedded button component
- Clicking embedded button triggers callback
```

---

### Story 4.3: Build Mode Switcher Dropdown

**Description:** Create dropdown component for switching between Consult and Assessment modes.

**Acceptance Criteria:**
- [ ] Dropdown shows current mode
- [ ] Dropdown allows switching to Consult or Assessment
- [ ] Mode change triggers API call to backend
- [ ] Visual indication of current mode
- [ ] Keyboard accessible
- [ ] Uses Shadcn/ui Select component

**Files to Create:**
- `apps/web/src/components/chat/ModeSwitcher.tsx`
- `apps/web/src/hooks/useConversationMode.ts`

**Dependencies:** Story 4.1 (Shadcn/ui setup)

**Tests:**
```typescript
// Component tests
- Displays current mode correctly
- onChange callback fires when mode selected
- Keyboard navigation works
```

---

### Story 4.4: Implement WebSocket Client Hook

**Description:** Create React hook for WebSocket connection, message sending, streaming.

**Acceptance Criteria:**
- [ ] useWebSocket hook connects to backend
- [ ] Authenticates with JWT token
- [ ] sendMessage() function emits to server
- [ ] Receives streamed messages (real-time)
- [ ] Handles reconnection on disconnect
- [ ] Cleanup on unmount
- [ ] TypeScript types for all events

**Files to Create:**
- `apps/web/src/hooks/useWebSocket.ts`
- `apps/web/src/lib/websocket.ts` (Socket.IO client wrapper)

**Dependencies:** Story 3.5 (WebSocket server running), Story 2.3 (JWT tokens)

**Tests:**
```typescript
// Hook tests
- Connects to WebSocket server
- Sends message successfully
- Receives message event
- Handles disconnect and reconnect
```

---

### Story 4.5: Build Chat Interface View

**Description:** Create main chat interface with message list, input box, mode switcher, streaming support.

**Acceptance Criteria:**
- [ ] Chat interface displays message history
- [ ] Input box for typing messages
- [ ] Send button (and Enter key) sends message
- [ ] Messages stream in real-time (append tokens)
- [ ] Mode switcher visible in header
- [ ] Auto-scroll to bottom on new message
- [ ] Loading states (connecting, sending)
- [ ] Responsive design (desktop + tablet)

**Files to Create:**
- `apps/web/src/app/(dashboard)/chat/page.tsx`
- `apps/web/src/components/chat/ChatInterface.tsx`
- `apps/web/src/components/chat/MessageList.tsx`
- `apps/web/src/components/chat/MessageInput.tsx`
- `apps/web/src/stores/chatStore.ts` (Zustand)

**Dependencies:** Story 4.2 (ChatMessage), Story 4.3 (ModeSwitcher), Story 4.4 (WebSocket hook)

**Tests:**
```typescript
// Component tests
- Renders message history
- Sends message on button click
- Sends message on Enter key
- Auto-scrolls on new message
- Mode switcher updates UI
```

---

## Epic 5: Vendor & Assessment Management

**Goal:** Create, track, and manage vendors and assessment metadata.

### Story 5.1: Implement Vendor Entity & Repository

**Description:** Create Vendor domain entity and repository for vendor profile management.

**Acceptance Criteria:**
- [ ] Vendor entity with validation (name required)
- [ ] IVendorRepository interface defined
- [ ] DrizzleVendorRepository implements interface
- [ ] Methods: create, findById, findByName, update, delete, list
- [ ] JSONB contactInfo properly typed
- [ ] All tests pass

**Files to Create:**
- `packages/backend/src/domain/entities/Vendor.ts`
- `packages/backend/src/domain/value-objects/VendorName.ts`
- `packages/backend/src/application/interfaces/IVendorRepository.ts`
- `packages/backend/src/infrastructure/database/repositories/DrizzleVendorRepository.ts`
- `__tests__/unit/Vendor.test.ts`
- `__tests__/integration/DrizzleVendorRepository.test.ts`

**Dependencies:** Story 1.3 (vendors table)

**Tests Required:**
```typescript
// Unit tests
- Vendor.create() validates name is not empty
- Vendor.updateContactInfo() updates JSONB field

// Integration tests
- Repository saves vendor with JSONB contactInfo
- Repository finds vendor by name
- Repository lists all vendors
```

---

### Story 5.2: Implement Assessment Entity & Repository

**Description:** Create Assessment domain entity and repository for assessment metadata management.

**Acceptance Criteria:**
- [ ] Assessment entity with validation
- [ ] Status enum properly typed
- [ ] IAssessmentRepository interface defined
- [ ] DrizzleAssessmentRepository implements interface
- [ ] Methods: create, findById, findByVendorId, updateStatus, delete
- [ ] JSONB metadata properly typed
- [ ] All tests pass

**Files to Create:**
- `packages/backend/src/domain/entities/Assessment.ts`
- `packages/backend/src/domain/value-objects/AssessmentType.ts`
- `packages/backend/src/domain/value-objects/AssessmentStatus.ts`
- `packages/backend/src/application/interfaces/IAssessmentRepository.ts`
- `packages/backend/src/infrastructure/database/repositories/DrizzleAssessmentRepository.ts`
- `__tests__/unit/Assessment.test.ts`
- `__tests__/integration/DrizzleAssessmentRepository.test.ts`

**Dependencies:** Story 1.3 (assessments table), Story 5.1 (Vendor entity for FK)

**Tests Required:**
```typescript
// Unit tests
- Assessment.create() requires vendor ID
- Assessment.updateStatus() only allows valid transitions
- Assessment validates assessment_type is valid

// Integration tests
- Repository saves assessment
- Repository finds assessments by vendor ID
- Repository updates status
```

---

### Story 5.3: Implement Assessment Service

**Description:** Create AssessmentService to orchestrate assessment workflows.

**Acceptance Criteria:**
- [ ] AssessmentService.createAssessment(data) creates assessment and vendor (if new)
- [ ] AssessmentService.getAssessment(id) retrieves assessment
- [ ] AssessmentService.getVendorHistory(vendorId) returns all assessments for vendor
- [ ] Service uses repository interfaces
- [ ] All unit tests pass (mocked repositories)

**Files to Create:**
- `packages/backend/src/application/services/AssessmentService.ts`
- `packages/backend/src/application/dtos/CreateAssessmentDTO.ts`
- `__tests__/unit/AssessmentService.test.ts`

**Dependencies:** Story 5.1 (Vendor repo), Story 5.2 (Assessment repo)

**Tests Required:**
```typescript
// Unit tests (mock repositories)
- createAssessment() creates vendor if doesn't exist
- createAssessment() reuses existing vendor
- createAssessment() sets status to 'draft'
- getVendorHistory() returns assessments ordered by date
```

---

### Story 5.4: Implement Vendor/Assessment API Endpoints

**Description:** Create REST endpoints for vendor and assessment operations.

**Acceptance Criteria:**
- [ ] POST /api/vendors - Create vendor
- [ ] GET /api/vendors/:id - Get vendor
- [ ] GET /api/vendors - List vendors
- [ ] POST /api/assessments - Create assessment
- [ ] GET /api/assessments/:id - Get assessment
- [ ] GET /api/vendors/:id/assessments - Get vendor assessment history
- [ ] All protected with auth middleware
- [ ] All E2E tests pass

**Files to Create:**
- `packages/backend/src/infrastructure/http/routes/vendor.routes.ts`
- `packages/backend/src/infrastructure/http/routes/assessment.routes.ts`
- `packages/backend/src/infrastructure/http/controllers/VendorController.ts`
- `packages/backend/src/infrastructure/http/controllers/AssessmentController.ts`
- `__tests__/e2e/vendors.test.ts`
- `__tests__/e2e/assessments.test.ts`

**Dependencies:** Story 5.3 (AssessmentService), Story 2.4 (auth middleware)

**Tests Required:**
```typescript
// E2E tests
- POST /api/vendors creates vendor
- GET /api/assessments/:id returns assessment
- GET /api/vendors/:id/assessments returns history
- Unauthorized requests return 401
```

---

## Epic 6: Question Generation (Core Feature)

**Goal:** Integrate Claude API to generate customized assessment questionnaires.

### Story 6.1: Implement Claude API Client

**Description:** Create Claude API client with streaming support and error handling.

**Acceptance Criteria:**
- [ ] ClaudeClient wraps Anthropic SDK
- [ ] sendMessage() method for basic Claude calls
- [ ] streamMessage() method for streaming responses
- [ ] Error handling (timeout, rate limit, API errors)
- [ ] Retry logic (3 attempts with exponential backoff)
- [ ] All unit tests pass (mocked Anthropic SDK)

**Files to Create:**
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts`
- `packages/backend/src/application/interfaces/IClaudeClient.ts`
- `packages/backend/src/infrastructure/ai/prompts/systemPrompt.ts` (Guardian system prompt)
- `__tests__/unit/ClaudeClient.test.ts`

**Dependencies:** Story 1.1 (backend setup), Anthropic SDK installed

**Tests Required:**
```typescript
// Unit tests (mock Anthropic SDK)
- sendMessage() calls Anthropic API correctly
- streamMessage() yields tokens progressively
- Retry logic triggers on timeout
- Error handling returns structured errors
```

---

### Story 6.2: Implement Question Generation Prompt

**Description:** Create prompt engineering for Claude to generate assessment questions based on vendor context.

**Acceptance Criteria:**
- [ ] Prompt template takes vendor type, solution type, assessment focus as input
- [ ] Claude returns structured JSON with questions
- [ ] Questions include: section, question_text, question_type, metadata
- [ ] Prompt guides Claude to generate 78-126 questions
- [ ] Response parser validates JSON structure
- [ ] Manual testing confirms quality questions

**Files to Create:**
- `packages/backend/src/infrastructure/ai/prompts/questionGeneration.ts`
- `packages/backend/src/infrastructure/ai/parsers/QuestionParser.ts`
- `__tests__/unit/QuestionParser.test.ts`

**Dependencies:** Story 6.1 (Claude client)

**Tests Required:**
```typescript
// Unit tests
- QuestionParser validates JSON structure
- QuestionParser handles missing fields gracefully
- QuestionParser throws error for invalid JSON
```

---

### Story 6.3: Implement Question Entity & Repository

**Description:** Create Question domain entity and repository for persisting generated questions.

**Acceptance Criteria:**
- [ ] Question entity with validation
- [ ] IQuestionRepository interface defined
- [ ] DrizzleQuestionRepository implements interface
- [ ] Methods: bulkCreate, findByAssessmentId, findById
- [ ] Enforces unique constraint (assessment_id, section_number, question_number)
- [ ] All tests pass

**Files to Create:**
- `packages/backend/src/domain/entities/Question.ts`
- `packages/backend/src/application/interfaces/IQuestionRepository.ts`
- `packages/backend/src/infrastructure/database/repositories/DrizzleQuestionRepository.ts`
- `__tests__/unit/Question.test.ts`
- `__tests__/integration/DrizzleQuestionRepository.test.ts`

**Dependencies:** Story 1.3 (questions table), Story 5.2 (Assessment entity for FK)

**Tests Required:**
```typescript
// Unit tests
- Question.create() validates required fields
- Question validates section_number is positive integer

// Integration tests
- Repository bulk inserts 87 questions
- Repository finds questions by assessment ID
- Repository enforces unique position constraint
```

---

### Story 6.4: Implement Question Generation Service

**Description:** Create service that orchestrates question generation (Claude call + persistence).

**Acceptance Criteria:**
- [ ] QuestionService.generateQuestions(assessmentId, context) calls Claude API
- [ ] Parses Claude response into Question entities
- [ ] Bulk inserts questions to database
- [ ] Updates assessment status to 'questions_generated'
- [ ] Returns question count
- [ ] All unit tests pass (mocked Claude client and repositories)

**Files to Create:**
- `packages/backend/src/application/services/QuestionService.ts`
- `packages/backend/src/application/dtos/QuestionGenerationContextDTO.ts`
- `__tests__/unit/QuestionService.test.ts`

**Dependencies:** Story 6.2 (Question prompt), Story 6.3 (Question repository), Story 5.3 (AssessmentService)

**Tests Required:**
```typescript
// Unit tests (mocked dependencies)
- generateQuestions() calls Claude client
- generateQuestions() saves questions to repository
- generateQuestions() updates assessment status
- generateQuestions() handles Claude API errors
```

---

### Story 6.5: Implement Question Generation API Endpoint

**Description:** Create API endpoint to trigger question generation and return results via WebSocket.

**Acceptance Criteria:**
- [ ] POST /api/assessments/:id/generate-questions endpoint
- [ ] Validates assessment exists and status is 'draft'
- [ ] Calls QuestionService.generateQuestions()
- [ ] Streams progress via WebSocket ('question_generation:progress' events)
- [ ] Returns question count on completion
- [ ] Error handling for Claude API failures
- [ ] All E2E tests pass

**Files to Create:**
- `packages/backend/src/infrastructure/http/routes/question.routes.ts`
- `packages/backend/src/infrastructure/http/controllers/QuestionController.ts`
- `__tests__/e2e/question-generation.test.ts`

**Dependencies:** Story 6.4 (QuestionService), Story 3.5 (WebSocket for progress streaming)

**Tests Required:**
```typescript
// E2E tests
- POST /api/assessments/:id/generate-questions returns 200
- Questions created in database (87 rows)
- Assessment status updated to 'questions_generated'
- Returns 400 if assessment already has questions
```

---

### Story 6.6: Build Question Display in Chat

**Description:** Display generated questions in chat interface with download button.

**Acceptance Criteria:**
- [ ] After generation, Guardian shows "I've generated 87 questions"
- [ ] Displays sample questions (first 5)
- [ ] Shows download button (embedded component)
- [ ] Button triggers export workflow
- [ ] Visual feedback during generation (streaming "Generating questions...")
- [ ] Error states handled (generation failed)

**Files to Create:**
- `apps/web/src/components/chat/QuestionSummary.tsx`
- `apps/web/src/components/chat/DownloadButton.tsx`

**Dependencies:** Story 4.2 (ChatMessage with components), Story 6.5 (generation endpoint)

**Tests:**
```typescript
// Component tests
- Renders question count
- Renders sample questions
- Download button is clickable
- Shows loading state during generation
```

---

## Epic 7: Export Functionality

**Goal:** Generate and download assessment questionnaires in multiple formats.

### Story 7.1: Implement PDF Export Service

**Description:** Create service that generates PDF from questions using Puppeteer.

**Acceptance Criteria:**
- [ ] ExportService.exportToPDF(assessmentId) generates PDF
- [ ] PDF includes: vendor name, assessment metadata, all questions organized by section
- [ ] Professional formatting (headers, page numbers, branding placeholder)
- [ ] Questions numbered correctly
- [ ] PDF file size reasonable (< 500KB for 87 questions)
- [ ] All unit tests pass

**Files to Create:**
- `packages/backend/src/application/services/ExportService.ts`
- `packages/backend/src/infrastructure/export/PDFExporter.ts`
- `packages/backend/src/infrastructure/export/templates/questionnaire-template.html`
- `__tests__/unit/ExportService.test.ts`
- `__tests__/integration/PDFExporter.test.ts`

**Dependencies:** Story 6.3 (Question repository), Story 5.2 (Assessment repository), Puppeteer installed

**Tests Required:**
```typescript
// Integration tests
- PDFExporter generates valid PDF file
- PDF contains all 87 questions
- PDF file is readable (no corruption)
```

---

### Story 7.2: Implement Word Export Service

**Description:** Create service that generates Word (.docx) document from questions.

**Acceptance Criteria:**
- [ ] ExportService.exportToWord(assessmentId) generates .docx
- [ ] Word doc includes all questions with fillable text boxes
- [ ] Sections properly formatted with headings
- [ ] Professional styling
- [ ] File size reasonable
- [ ] All tests pass

**Files to Create:**
- `packages/backend/src/infrastructure/export/WordExporter.ts`
- `__tests__/integration/WordExporter.test.ts`

**Dependencies:** Story 7.1 (ExportService exists), `docx` library installed

**Tests Required:**
```typescript
// Integration tests
- WordExporter generates valid .docx file
- Word doc contains all questions
- File is readable in Microsoft Word
```

---

### Story 7.3: Implement Excel Export Service

**Description:** Create service that generates Excel (.xlsx) spreadsheet from questions.

**Acceptance Criteria:**
- [ ] ExportService.exportToExcel(assessmentId) generates .xlsx
- [ ] Excel has columns: Section, Question #, Question Text, Response (empty)
- [ ] Sections color-coded
- [ ] Freeze first row (headers)
- [ ] File size reasonable
- [ ] All tests pass

**Files to Create:**
- `packages/backend/src/infrastructure/export/ExcelExporter.ts`
- `__tests__/integration/ExcelExporter.test.ts`

**Dependencies:** Story 7.1 (ExportService exists), ExcelJS installed

**Tests Required:**
```typescript
// Integration tests
- ExcelExporter generates valid .xlsx file
- Excel contains all questions in rows
- File is readable in Excel
```

---

### Story 7.4: Implement Export API Endpoints

**Description:** Create API endpoints for downloading questionnaires in all formats.

**Acceptance Criteria:**
- [ ] GET /api/assessments/:id/export/pdf returns PDF file
- [ ] GET /api/assessments/:id/export/word returns .docx file
- [ ] GET /api/assessments/:id/export/excel returns .xlsx file
- [ ] Content-Disposition header sets filename correctly
- [ ] Updates assessment status to 'exported' on first download
- [ ] Protected with auth middleware
- [ ] All E2E tests pass

**Files to Create:**
- `packages/backend/src/infrastructure/http/routes/export.routes.ts`
- `packages/backend/src/infrastructure/http/controllers/ExportController.ts`
- `__tests__/e2e/export.test.ts`

**Dependencies:** Story 7.1, 7.2, 7.3 (all exporters), Story 2.4 (auth middleware)

**Tests Required:**
```typescript
// E2E tests
- GET /export/pdf returns PDF with correct headers
- GET /export/word returns .docx file
- GET /export/excel returns .xlsx file
- Returns 404 for non-existent assessment
- Returns 401 for unauthenticated request
```

---

### Story 7.5: Build Download UI in Frontend

**Description:** Add download buttons to chat interface after question generation.

**Acceptance Criteria:**
- [ ] After questions generated, Guardian shows download options
- [ ] Three buttons: Download PDF, Download Word, Download Excel
- [ ] Clicking button triggers download
- [ ] Loading state while generating export
- [ ] Error handling (export failed)
- [ ] Success message after download

**Files to Create:**
- `apps/web/src/components/chat/ExportButtons.tsx`
- `apps/web/src/lib/api/export.ts`

**Dependencies:** Story 7.4 (export endpoints), Story 6.6 (question display)

**Tests:**
```typescript
// Component tests
- Renders all three download buttons
- Clicking PDF button triggers download
- Shows loading state during export
- Shows error if export fails
```

---

## Epic 8: Integration & Polish

**Goal:** Connect all pieces, add error handling, polish UX.

---

## 🚨 CRITICAL BLOCKERS

**Status:** BLOCKING Epic 8 completion and merge to main

### Test Failures (Must Fix Before Merge)

#### Backend Integration Tests
- **File:** `packages/backend/src/infrastructure/database/repositories/__tests__/DrizzleAssessmentRepository.test.ts`
- **Failures:** 3 tests failing
  - Foreign key constraint violations (conversations table)
  - Duplicate key violations (test cleanup issue)
- **Root cause:** Test data cleanup order incorrect
- **Impact:** Cannot merge until fixed

#### Frontend Integration Tests
- **File:** `apps/web/src/hooks/__tests__/websocket.test.ts`
- **Failures:** Connection mock failures
- **Root cause:** Mock WebSocket setup issues
- **Impact:** Cannot merge until fixed

#### Shared Package Tests
- **File:** `packages/shared/package.json`
- **Issue:** No tests defined, exits with code 1
- **Fix:** Add `--passWithNoTests` flag to jest config or create placeholder test
- **Impact:** Blocks CI/CD pipeline

### Per CLAUDE.md Requirements
All features MUST have tests. Test failures block all commits and merges.

**Command to verify:**
```bash
npm test                # All tests must pass
npm run test:coverage   # Must meet 70% coverage minimum
```

---

### Story 8.1: Implement End-to-End Assessment Workflow

**Description:** Wire together complete flow: Login → Chat → Create Assessment → Generate Questions → Download.

**Acceptance Criteria:**
- [ ] User can login
- [ ] User can start conversation in consult mode
- [ ] User can switch to assessment mode
- [ ] Guardian asks clarifying questions
- [ ] User provides vendor info
- [ ] Guardian generates questions (streams progress)
- [ ] User can download questionnaire in all 3 formats
- [ ] Workflow works end-to-end without errors

**Files to Create:**
- None (integration of existing features)
- Update documentation if gaps found

**Dependencies:** All previous stories complete

**Tests:**
```typescript
// E2E test (full workflow)
describe('Complete Assessment Workflow', () => {
  it('should complete full workflow from login to download', async () => {
    // Login
    // Start conversation
    // Switch to assessment mode
    // Create assessment
    // Generate questions
    // Download PDF
    // Verify all data persisted correctly
  })
})
```

---

### Story 8.2: Add Error Handling & Recovery

**Description:** Implement graceful error handling for Claude API failures, WebSocket disconnects, database errors.

**Acceptance Criteria:**
- [ ] Claude API timeout shows user-friendly error
- [ ] WebSocket disconnect auto-reconnects
- [ ] Database errors logged and don't crash server
- [ ] Frontend shows error messages in chat (as system messages)
- [ ] Retry buttons where appropriate
- [ ] All error states tested
- [ ] **Streaming safeguards:** Timeout (60s), max length (10k chars), abort on disconnect
- [ ] **Differentiated error messages:** Rate limit, API timeout, network error (not generic)

**Files to Create:**
- `packages/backend/src/infrastructure/http/middleware/error.middleware.ts`
- `packages/backend/src/shared/errors/index.ts`
- `apps/web/src/components/chat/ErrorMessage.tsx`

**Dependencies:** Story 8.1 (workflow complete)

**Tests:**
```typescript
// Integration tests
- Claude API timeout triggers retry logic
- WebSocket disconnect reconnects automatically
- Database error returns 500 with error message
- Streaming timeout stops after 60s
- Streaming aborts when client disconnects
```

---

### Story 8.3: Add Loading States & Progress Indicators

**Status:** ✅ Core Complete, Polish Deferred

**Description:** Add loading spinners, progress indicators, and skeleton loaders for better UX.

**Completed (MVP):**
- [x] Chat shows typing indicator (animated bouncing dots)
- [x] Skeleton loaders for chat history loading
- [x] No jarring blank states
- [x] Input auto-focus after response completes

**Deferred to Phase 2:**
- [ ] Question generation progress indicators → **Epic 9** (requires UI decisions)
- [ ] **PHI/PII log redaction** → **Production Hardening (PH-2)**
- [ ] **Config externalization** → **Production Hardening (Task: Config Management)**
- [ ] Export spinner (low priority)

**Files Created:**
- `apps/web/src/components/chat/SkeletonMessage.tsx` ✅
- `apps/web/src/components/chat/MessageList.tsx` (typing indicator inline) ✅
- `apps/web/src/components/chat/MessageInput.tsx` (auto-focus) ✅

**Dependencies:** Story 8.1 (workflow exists)

**Tests:**
- Component tests for typing indicator ✅
- Component tests for skeleton loaders ✅
- Input auto-focus tests ✅

---

### Story 8.4: Implement Conversation Resume

**Status:** ✅ Core Complete, UI Enhancements Deferred

**Description:** Allow users to resume previous conversations from database.

**Completed (MVP):**
- [x] Auto-resume last conversation on page reload
- [x] Load conversation history from database
- [x] Restore conversation mode and context
- [x] User can continue where they left off
- [x] Session persistence with ownership validation
- [x] All tests pass

**Deferred to Epic 9 (UI/UX Overhaul):**
- [ ] ConversationList component (browse past conversations) → **Epic 9**
- [ ] ResumeButton component (explicit resume UI) → **Epic 9**
- [ ] Multi-conversation selection UI → **Epic 9**

**Files Created:**
- `apps/web/src/hooks/useWebSocket.ts` (added conversationId, onConnected, onHistory) ✅
- `apps/web/src/lib/websocket.ts` (session persistence methods) ✅
- `apps/web/src/components/chat/ChatInterface.tsx` (auto-resume logic) ✅

**Dependencies:** Story 3.4 (ConversationService.getHistory), Story 4.5 (chat interface)

**Tests:**
- Session persistence integration tests ✅
- WebSocket connection with conversationId ✅
- History loading tests ✅

---

### Story 8.5: Add Basic Vendor Directory View

**Status:** ⏸️ Deferred to Phase 2 (Requires UX Decisions)

**Description:** Create simple page to list all vendors and their assessment count.

**Reason for Deferral:**
- Requires product decisions about vendor management workflow
- UX design needed for directory/search patterns
- Not blocking MVP (vendors managed via API, accessed through chat flow)
- Better suited for Phase 2 after user feedback

**Moved to:** Phase 2 roadmap

**Original Acceptance Criteria:**
- [ ] /vendors page lists all vendors
- [ ] Shows vendor name, industry, assessment count
- [ ] Click vendor to see assessment history
- [ ] Search/filter by name (basic)
- [ ] Protected route (requires auth)
- [ ] All tests pass

**Files to Create:**
- `apps/web/src/app/(dashboard)/vendors/page.tsx`
- `apps/web/src/components/vendors/VendorList.tsx`
- `apps/web/src/components/vendors/VendorCard.tsx`

**Dependencies:** Story 5.4 (vendor API endpoints)

**Tests:**
```typescript
// Component tests
- Renders list of vendors
- Displays assessment count per vendor
- Search filter works
```

---

### Story 8.6: Add Observability & Telemetry

**Description:** Track Claude API usage, costs, and performance for monitoring and optimization.

**Acceptance Criteria:**
- [ ] Capture Anthropic request ID, model, latency for each Claude call
- [ ] Track token usage (input + output tokens)
- [ ] Log costs based on token usage
- [ ] Optional: Store telemetry in database or logs
- [ ] Dashboard showing API usage metrics (optional)

**Files to Create:**
- `packages/backend/src/infrastructure/telemetry/TelemetryService.ts`
- `packages/backend/src/infrastructure/database/schema/telemetry.ts` (optional table)

**Dependencies:** Claude integration working

**Tests:**
```typescript
// Unit tests
- Telemetry service captures request metadata
- Token usage calculated correctly
```

**Note:** Deferred from Claude integration review - add after core functionality stable.

---

### Story 8.7: Optimize Conversation Context

**Description:** Implement token-aware history trimming to stay within Claude API limits and optimize costs.

**Acceptance Criteria:**
- [ ] Count tokens in conversation history (not just message count)
- [ ] Trim history to fit within model context window (e.g., 100k tokens)
- [ ] Optionally summarize long threads instead of discarding
- [ ] Maintain conversation continuity

**Files to Create:**
- `packages/backend/src/infrastructure/ai/TokenCounter.ts`
- `packages/backend/src/application/services/ContextOptimizer.ts`

**Dependencies:** Claude integration working

**Tests:**
```typescript
// Unit tests
- Token counting accurate
- History trimmed when exceeds limit
- Summary preserves key information
```

**Note:** Deferred from Claude integration review - current fixed "last 10 messages" sufficient for MVP.

---

## Task Sequencing & Dependencies

### Critical Path (Must be sequential)

```
Story 1.1 → 1.2 → 1.3 (Infrastructure setup)
    ↓
Story 2.1 → 2.2 → 2.3 → 2.4 (Auth system)
    ↓
Story 3.1 → 3.2 → 3.3 → 3.4 → 3.5 (Chat backend)
    ↓
Story 4.1 → 4.2 → 4.3 → 4.4 → 4.5 (Chat frontend)
    ↓
Story 5.1 → 5.2 → 5.3 → 5.4 (Vendor/Assessment)
    ↓
Story 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 (Question generation)
    ↓
Story 7.1 → 7.2 → 7.3 → 7.4 → 7.5 (Export)
    ↓
Epic 8 (Integration & Polish)
```

### Parallel Opportunities

**After Story 3.5 (chat backend complete):**
- Epic 4 (Frontend) can start in parallel with Epic 5 (Vendor/Assessment backend)

**After Story 5.4 (Vendor APIs complete):**
- Epic 6 (Question generation) and Epic 7 (Export) can work in parallel

**Agent allocation:**
- Agent 1: Infrastructure + Auth (Epic 1-2)
- Agent 2: Chat backend (Epic 3)
- Agent 3: Chat frontend (Epic 4)
- Agent 4: Vendor/Assessment (Epic 5)
- Agent 5: Question generation (Epic 6)
- Agent 6: Export (Epic 7)
- All agents: Epic 8 (integration testing)

---

## Total Story Count

**Epic 1:** 4 stories (setup)
**Epic 2:** 4 stories (auth)
**Epic 3:** 5 stories (chat backend)
**Epic 4:** 5 stories (chat frontend)
**Epic 5:** 4 stories (vendor/assessment)
**Epic 6:** 6 stories (question generation)
**Epic 7:** 5 stories (export)
**Epic 8:** 5 stories (polish)

**Total:** 38 stories

**Estimated effort:** 4-6 weeks with 4-6 agents working in parallel

---

## Files Modified

1. `tasks/mvp-tasks.md` - This file (complete task breakdown)
2. `tasks/task-overview.md` - Update to reference mvp-tasks.md
3. `CLAUDE.md` - Added test requirements

---

**This is the EXECUTION PLAN for MVP.** Agents should work through these stories in dependency order.

**For architecture context, see:** `docs/design/architecture/architecture-layers.md`
**For database details, see:** `docs/design/data/database-schema.md`
**For current status, see:** `task-overview.md`

---

## Epic 9: Frontend UI/UX Upgrade

**Goal:** Enhance user experience with polished UI components, animations, and responsive design.

**Status:** Planned for Phase 2 (Post-MVP)

**Scope:**

### From Epic 8 (Deferred Items)
- **Conversation browsing UI** (Story 8.4)
  - ConversationList component (browse past conversations)
  - ResumeButton component (explicit resume button)
  - Multi-conversation selection UI
- **Progress indicators** (Story 8.3)
  - Question generation progress ("3 of 11 sections complete")
  - Export progress indicators

### UI/UX Enhancements (TBD)
- Redesign chat interface with modern UI patterns
- Add animations and transitions
- Improve mobile responsiveness
- Enhance loading states and micro-interactions
- Add keyboard shortcuts
- Improve accessibility (WCAG 2.1 AA compliance)
- Dark mode refinement
- Component library standardization

**Stories:** To be defined based on user feedback after MVP launch

**Estimated Effort:** 2-3 weeks

---

## Production Hardening (Post-MVP)

**Goal:** Prepare codebase for production deployment with operational excellence.

**Status:** Deferred until MVP complete

---

### Task PH-1: Refactor ChatServer for Maintainability

**Description:** Extract 136-line `send_message` handler into separate handler classes following Single Responsibility Principle.

**Acceptance Criteria:**
- [ ] Extract `MessageHandler` class (validation, rate limiting, saving)
- [ ] Extract `StreamingOrchestrator` class (Claude streaming coordination)
- [ ] Extract `ConversationContextBuilder` class (history + context building)
- [ ] ChatServer delegates to handler classes
- [ ] All existing tests pass
- [ ] ChatServer.ts reduced to < 200 lines

**Impact:** Improves testability, maintainability, and debugging

**Effort:** 4-6 hours

---

### Task PH-2: Add Structured Logging

**Description:** Replace console.log with winston or pino for production-grade logging with log levels, structured data, and aggregation support.

**Acceptance Criteria:**
- [ ] Install winston or pino
- [ ] Create Logger service with interface
- [ ] Replace all 35 console.log/error calls
- [ ] Add contextual metadata (userId, conversationId, requestId)
- [ ] Configure log levels (debug, info, warn, error)
- [ ] Add log rotation and file transport
- [ ] Never log PHI/PII (redact sensitive data)

**Impact:** Critical for production debugging and monitoring

**Effort:** 3-4 hours

---

### Task PH-3: Add Circuit Breaker for Claude API

**Description:** Implement circuit breaker pattern to prevent cascading failures when Claude API is down.

**Acceptance Criteria:**
- [ ] Install opossum library
- [ ] Wrap ClaudeClient.sendMessage() with circuit breaker
- [ ] Configure: 5 failures → OPEN, 30s timeout, 10s reset
- [ ] Log circuit breaker state changes
- [ ] Return user-friendly error when circuit open
- [ ] Add metrics (success rate, circuit state)

**Impact:** Improves resilience and prevents retry storms

**Effort:** 2-3 hours

---

### Task PH-4: Add Zod Validation Middleware

**Description:** Replace manual validation in controllers with Zod schemas for type-safe request validation.

**Acceptance Criteria:**
- [ ] Install zod
- [ ] Create validation middleware factory
- [ ] Define Zod schemas for all REST endpoints
- [ ] Apply middleware to routes
- [ ] Return structured validation errors (400)
- [ ] WebSocket validation can remain manual (acceptable pattern)

**Impact:** Reduces boilerplate, improves error messages

**Effort:** 3-4 hours

---

### Task PH-5: Refactor Export Classes

**Description:** Extract formatting logic from PDFExporter (270 lines), WordExporter (395 lines), ExcelExporter (245 lines) to reduce complexity.

**Acceptance Criteria:**
- [ ] Extract `QuestionnaireFormatter` (shared formatting logic)
- [ ] Extract `PDFLayoutEngine` (layout calculations)
- [ ] Extract `StyleManager` (colors, fonts, spacing)
- [ ] Reduce each exporter to < 150 lines
- [ ] All export tests pass

**Impact:** Improves maintainability and testability

**Effort:** 4-6 hours

---

### Task PH-6: Add Performance Monitoring

**Description:** Add telemetry for API response times, database query performance, and Claude API latency.

**Acceptance Criteria:**
- [ ] Add middleware to track request duration
- [ ] Log slow queries (> 500ms)
- [ ] Track Claude API latency and token usage
- [ ] Optional: Add Prometheus metrics endpoint
- [ ] Set up alerts for degraded performance

**Impact:** Enables proactive performance optimization

**Effort:** 3-4 hours

---

### Task PH-7: Test Coverage Reporting

**Description:** Set up test coverage reporting and enforce minimum thresholds.

**Acceptance Criteria:**
- [ ] Configure Istanbul/nyc for coverage
- [ ] Generate coverage reports (HTML + JSON)
- [ ] Enforce 80% coverage minimum in CI
- [ ] Add coverage badge to README
- [ ] Identify and fill coverage gaps

**Impact:** Ensures code quality and test completeness

**Effort:** 2-3 hours

---

**Total Effort:** ~25-35 hours of focused work

---

## Prompt Caching Optimization

**Goal:** Reduce Claude API costs and improve response latency using Anthropic's prompt caching feature.

**Status:** Planned for Phase 2 (Post-MVP)

---

### Task PC-1: Implement Prompt Caching for System Prompts

**Description:** Cache static system prompts (Consult Mode, Assessment Mode) using Anthropic's prompt caching API to reduce costs and latency.

**Acceptance Criteria:**
- [ ] Update ClaudeClient to use `cache_control` parameter
- [ ] Mark system prompts as cacheable
- [ ] Track cache hit rate
- [ ] Log cost savings (cached vs non-cached tokens)
- [ ] Handle cache expiry gracefully

**API Reference:** https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching

**Example:**
```typescript
{
  role: "system",
  content: [
    {
      type: "text",
      text: CONSULT_MODE_PROMPT,
      cache_control: { type: "ephemeral" } // Cache for 5 minutes
    }
  ]
}
```

**Impact:** ~90% cost reduction on system prompt tokens, 60% faster first response

**Effort:** 2-3 hours

---

### Task PC-2: Implement Prompt Caching for Conversation Context

**Description:** Cache conversation history to reduce costs for long conversations.

**Acceptance Criteria:**
- [ ] Mark conversation history as cacheable
- [ ] Only cache up to N-2 messages (keep last 2 messages fresh)
- [ ] Update cache on mode switch
- [ ] Monitor cache hit rate per conversation
- [ ] Document cache strategy in code

**Cache Strategy:**
```
[System Prompt] (cached)
[Message 1-8] (cached)
[Message 9] (not cached)
[Message 10 - current] (not cached)
```

**Impact:** ~50% cost reduction on long conversations

**Effort:** 3-4 hours

---

### Task PC-3: Add Cache Telemetry

**Description:** Track prompt caching metrics to measure cost savings and optimize caching strategy.

**Acceptance Criteria:**
- [ ] Capture cache_creation_input_tokens
- [ ] Capture cache_read_input_tokens
- [ ] Calculate cost savings per request
- [ ] Log cache hit rate
- [ ] Dashboard showing caching metrics (optional)

**Anthropic Response Headers:**
```typescript
{
  usage: {
    input_tokens: 100,
    cache_creation_input_tokens: 500,  // First request
    cache_read_input_tokens: 500,      // Subsequent requests
    output_tokens: 200
  }
}
```

**Impact:** Visibility into cost optimization effectiveness

**Effort:** 2 hours

---

**Total Effort:** ~7-9 hours

**Cost Impact:** Estimated 60-70% reduction in Claude API costs for typical workflows
