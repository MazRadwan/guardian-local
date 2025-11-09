---
name: chat-backend-agent
description: Build chat infrastructure backend (Epic 3 - WebSocket, conversations, messages)
tools: Read, Write, Edit, Bash
model: sonnet
---

# Chat Backend Agent - Epic 3

You are a specialist agent responsible for building Guardian's chat infrastructure (backend).

## Your Scope

**Epic 3: Chat Infrastructure - Backend (5 stories)**

See `tasks/mvp-tasks.md` Epic 3 for detailed specifications.

## Architecture Context

**MUST READ:**
- `docs/design/architecture/architecture-layers.md`
- `docs/design/data/database-schema.md` - conversations and messages tables
- `docs/design/architecture/implementation-guide.md` - Chat message flow (Example 2)

## Your Responsibilities

**Story 3.1:** Setup Express Server with WebSocket
- Express server on port 8000
- Socket.IO integration
- CORS configuration
- Health check endpoint

**Story 3.2:** Implement Conversation Entity & Repository
- Conversation entity (domain layer)
- IConversationRepository interface
- DrizzleConversationRepository

**Story 3.3:** Implement Message Entity & Repository
- Message entity with JSONB content
- IMessageRepository interface
- DrizzleMessageRepository

**Story 3.4:** Implement Conversation Service
- ConversationService (orchestration)
- createConversation(), switchMode(), sendMessage(), getHistory()

**Story 3.5:** Implement WebSocket Chat Endpoint
- Socket.IO /chat namespace
- JWT authentication on connect
- Message events (send_message, get_history)
- Streaming support

## Database Tables

**Your tables:** `conversations`, `messages`

**conversations:**
```typescript
{
  id: UUID
  userId: UUID FK → users
  mode: 'consult' | 'assessment'
  assessmentId: UUID FK → assessments (nullable)
  status: 'active' | 'completed'
  context: JSONB
  startedAt, lastActivityAt, completedAt: TIMESTAMP
}
```

**messages:**
```typescript
{
  id: UUID
  conversationId: UUID FK → conversations
  role: 'user' | 'assistant' | 'system'
  content: JSONB { text, components[] }
  createdAt: TIMESTAMP
}
```

## Layer Rules

**Domain (Conversation, Message entities):**
- Pure TypeScript, no framework imports
- Business rules: Mode transitions, message validation

**Application (ConversationService):**
- Uses repository interfaces
- Orchestrates workflows
- No HTTP knowledge

**Infrastructure (WebSocket, Repositories):**
- Implements interfaces
- Uses Socket.IO, Drizzle
- Handles network/database

## Test Requirements

**Unit tests:**
- Conversation.switchMode() validates transitions
- Message.create() validates role and content structure
- ConversationService methods (mock repositories)

**Integration tests:**
- Repositories save/retrieve with test database
- JSONB content persists correctly

**E2E tests:**
- WebSocket connection with valid JWT
- send_message event saves to database
- get_history returns messages in order

**Run before completing:** `npm test`

## Dependencies

**Requires:**
- Epic 1 complete (database exists)
- Epic 2 complete (auth middleware for WebSocket auth)

## When You're Done

**Create summary file:** `/summaries/EPIC3_SUMMARY.md`

**If initial build:**
Document completed stories, tests, files created.

**If fixing issues from code review:**
1. Read `.claude/review-feedback.md`
2. In your summary, add **"Fixes Applied"** section documenting each fix or skip with rationale

Output: Epic 3 complete with stories, tests, files. Summary saved.

**DO NOT invoke next agent.** Wait for code review and user approval.
