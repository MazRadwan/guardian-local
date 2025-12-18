# Sprint 17.3: Multi-Document Context Support

## Problem Statement

When multiple documents are uploaded, only the last-processed document's context is visible to Claude. This is caused by:

1. **Single context storage**: `conversation.context.intakeContext` is a single object
2. **Parallel processing race**: `processUpload()` runs concurrently, last-to-finish wins
3. **Single injection**: ChatServer only injects one context into Claude's message history

## Solution: Per-File Context Storage

Store extracted context on each file's row in the database, then aggregate at read time in ChatServer. This is concurrency-safe by design (each file writes to its own row).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CURRENT (BROKEN)                              │
├─────────────────────────────────────────────────────────────────────┤
│  Upload Doc1 ──► Parse ──► conversation.context.intakeContext = ctx1│
│  Upload Doc2 ──► Parse ──► conversation.context.intakeContext = ctx2│
│                                                    ↑ OVERWRITES!    │
│  ChatServer reads conversation.context.intakeContext → only ctx2    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         NEW (FIXED)                                  │
├─────────────────────────────────────────────────────────────────────┤
│  Upload Doc1 ──► Parse ──► files[doc1].intake_context = ctx1        │
│  Upload Doc2 ──► Parse ──► files[doc2].intake_context = ctx2        │
│                            (each file owns its row - no race)       │
│  ChatServer aggregates: SELECT intake_context FROM files            │
│                         WHERE conversation_id = ? → [ctx1, ctx2]    │
└─────────────────────────────────────────────────────────────────────┘
```

## Code Review Corrections Applied

| Issue | Correction |
|-------|------------|
| Schema description | `files` table has: `id`, `userId`, `conversationId`, `filename`, `mimeType`, `size`, `storagePath`, `createdAt` (NOT `status`, `updated_at`) |
| ChatServer constructor | `fileRepository` **already injected** - no constructor/index.ts changes needed |
| Test file paths | Use `packages/backend/__tests__/integration/repositories/` for repo tests |
| Schema file path | Use `packages/backend/src/infrastructure/database/schema/files.ts` |
| Backward compat | Include legacy context **in addition to** file contexts (not ignore it) |
| DB performance | Add index on `files.conversation_id` (Postgres doesn't auto-index FKs) |
| Security | Sanitize strings in multi-doc format (strip control chars, cap lengths) |
| E2E testing | Assert on **Claude client input**, NOT Claude's NL response (use MockClaudeClient) |

## Execution Tracks (Parallel)

```
Track A (Database)     Track B (Upload)       Track C (Retrieval)    Track D (Tests)
      │                      │                       │                     │
   17.3.1                    │                       │                     │
   (migration)               │                       │                     │
      │                      │                       │                     │
   17.3.2                    │                       │                     │
   (repository)              │                       │                     │
      │                      │                       │                     │
      ├──────────────────────┼───────────────────────┤                     │
      │                      │                       │                     │
      │                   17.3.3                  17.3.4                   │
      │                   (controller)           (chatserver)              │
      │                      │                       │                     │
      │                      ├───────────────────────┤                     │
      │                      │                       │                     │
      │                      │                    17.3.5                   │
      │                      │                    (integration)            │
      │                      │                       │                     │
      └──────────────────────┴───────────────────────┴─────────────────────┤
                                                                           │
                                                                        17.3.6
                                                                        (e2e)
```

---

## Story 17.3.1: Database Migration - Add Intake Context to Files Table

**Track:** A (Database)
**Dependencies:** None
**Can Run In Parallel With:** Nothing (must complete first)

### Context for Agent

The `files` table currently exists with these columns only:
- `id` (UUID, PK)
- `userId` (UUID, FK)
- `conversationId` (UUID, FK)
- `filename` (TEXT)
- `mimeType` (TEXT)
- `size` (INTEGER)
- `storagePath` (TEXT)
- `createdAt` (TIMESTAMPTZ)

**Note:** There is NO `status` or `updated_at` column currently.

We need to add columns to store the parsed intake context directly on each file row.

### Task

Create a Drizzle migration to add intake context columns to the `files` table.

### Files to Modify

- `packages/backend/src/infrastructure/database/schema/files.ts` - Add new columns to schema
- `packages/backend/src/infrastructure/database/migrations/` - New migration file (run `pnpm db:generate`)

### Implementation

```sql
-- Migration: Add intake context columns to files table
ALTER TABLE files ADD COLUMN intake_context JSONB;
ALTER TABLE files ADD COLUMN intake_gap_categories TEXT[];
ALTER TABLE files ADD COLUMN intake_parsed_at TIMESTAMPTZ;

-- IMPORTANT: Add index for ChatServer query performance
CREATE INDEX idx_files_conversation_id ON files(conversation_id);
```

### Schema Update (Drizzle)

```typescript
// In schema/files.ts - add these columns:
import { jsonb, text, timestamp, index } from 'drizzle-orm/pg-core';

// Add to files table definition:
intakeContext: jsonb('intake_context'),
intakeGapCategories: text('intake_gap_categories').array(),
intakeParsedAt: timestamp('intake_parsed_at', { withTimezone: true }),

// Add index (in table definition or separate):
// (indexes) => ({ conversationIdx: index('idx_files_conversation_id').on(files.conversationId) })
```

### Schema Reference

The `intake_context` JSONB should store this shape (from `IntakeDocumentContext`):

```typescript
interface IntakeDocumentContext {
  vendorName: string | null;
  solutionName: string | null;
  solutionType: string | null;
  industry: string | null;
  features: string[];
  claims: string[];
  complianceMentions: string[];
}
```

### Acceptance Criteria

- [ ] Schema file updated: `packages/backend/src/infrastructure/database/schema/files.ts`
- [ ] Migration generated: `pnpm --filter @guardian/backend db:generate`
- [ ] Migration runs successfully: `pnpm --filter @guardian/backend db:migrate`
- [ ] Columns added: `intake_context` (JSONB), `intake_gap_categories` (TEXT[]), `intake_parsed_at` (TIMESTAMPTZ)
- [ ] Index added: `idx_files_conversation_id` on `conversation_id`
- [ ] All columns nullable (backward compatible with existing files)

---

## Story 17.3.2: FileRepository - Add Context Storage Methods

**Track:** A (Database)
**Dependencies:** 17.3.1 (migration)
**Can Run In Parallel With:** Nothing (must complete before B/C)

### Context for Agent

The `IFileRepository` interface is at `packages/backend/src/application/interfaces/IFileRepository.ts`. The Drizzle implementation is at `packages/backend/src/infrastructure/database/repositories/DrizzleFileRepository.ts`.

After Story 17.3.1, the `files` table has new columns for intake context.

### Task

1. Add method to interface: `updateIntakeContext(fileId, context, gapCategories)`
2. Add method to interface: `findByConversationWithContext(conversationId)` - returns files with their intake context
3. Implement both methods in DrizzleFileRepository
4. Add integration tests

### Files to Modify

- `packages/backend/src/application/interfaces/IFileRepository.ts`
- `packages/backend/src/infrastructure/database/repositories/DrizzleFileRepository.ts`
- `packages/backend/__tests__/integration/repositories/DrizzleFileRepository.test.ts` (create or update)

### Interface Addition

```typescript
// In IFileRepository.ts
import type { IntakeDocumentContext } from '../../domain/entities/Conversation.js';

export interface FileWithIntakeContext {
  id: string;
  conversationId: string;
  filename: string;
  mimeType: string;
  size: number;
  intakeContext: IntakeDocumentContext | null;
  intakeGapCategories: string[] | null;
  intakeParsedAt: Date | null;
}

export interface IFileRepository {
  // ... existing methods ...

  /**
   * Store parsed intake context on a file record
   * Called after DocumentParserService.parseForContext completes
   */
  updateIntakeContext(
    fileId: string,
    context: IntakeDocumentContext,
    gapCategories?: string[]
  ): Promise<void>;

  /**
   * Get all files for a conversation with their intake contexts
   * Used by ChatServer to aggregate multi-doc context for Claude
   * Returns files sorted by intake_parsed_at ASC (deterministic order)
   */
  findByConversationWithContext(conversationId: string): Promise<FileWithIntakeContext[]>;
}
```

### Acceptance Criteria

- [ ] Interface updated with new methods and types
- [ ] DrizzleFileRepository implements both methods
- [ ] `updateIntakeContext` writes context + gap categories + timestamp to file row
- [ ] `findByConversationWithContext` returns files sorted by `intake_parsed_at` ASC
- [ ] Integration tests in `packages/backend/__tests__/integration/repositories/DrizzleFileRepository.test.ts`
- [ ] Handles null context gracefully (files without parsed context)

---

## Story 17.3.3: DocumentUploadController - Write Context to File Row

**Track:** B (Upload)
**Dependencies:** 17.3.2 (repository methods)
**Can Run In Parallel With:** 17.3.4 (ChatServer)

### Context for Agent

`DocumentUploadController` is at `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts`.

Currently, after parsing completes, it:
1. Emits `intake_context_ready` WebSocket event
2. Updates `conversation.context.intakeContext` (the broken single-context approach)

We need to change step 2 to write to the file's row instead.

### Task

1. After successful parse, call `fileRepository.updateIntakeContext(fileId, context, gapCategories)`
2. Remove the `conversationService.updateContext({ intakeContext: ... })` call
3. Keep the WebSocket emit (frontend still needs it for toasts)
4. Update unit tests

### Files to Modify

- `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts`
- `packages/backend/__tests__/unit/DocumentUploadController.test.ts`

### Current Code to Change

Find code similar to:
```typescript
// REMOVE THIS (or comment out for now):
await this.conversationService.updateContext(conversationId, {
  intakeContext: parseResult.context,
  intakeGapCategories: parseResult.gapCategories,
  intakeParsedAt: new Date().toISOString(),
});

// ADD THIS:
await this.fileRepository.updateIntakeContext(
  fileId,
  parseResult.context,
  parseResult.gapCategories
);
```

### Acceptance Criteria

- [ ] Context written to file row via `fileRepository.updateIntakeContext`
- [ ] Removed `conversationService.updateContext` call for intake context
- [ ] WebSocket `intake_context_ready` event still emitted (unchanged)
- [ ] Unit tests updated and passing
- [ ] Multiple concurrent uploads each write to their own file row (no race)

---

## Story 17.3.4: ChatServer - Aggregate Multi-Document Context

**Track:** C (Retrieval)
**Dependencies:** 17.3.2 (repository methods)
**Can Run In Parallel With:** 17.3.3 (Controller)

### Context for Agent

`ChatServer` is at `packages/backend/src/infrastructure/websocket/ChatServer.ts`.

**IMPORTANT:** `fileRepository` is **already injected** into ChatServer constructor (check `src/index.ts`). No constructor or index.ts changes are needed - just use `this.fileRepository`.

The `buildConversationContext` method currently:
1. Loads conversation
2. Checks `conversation.context?.intakeContext` (single context)
3. Calls `formatIntakeContextForClaude` to create synthetic message
4. Prepends to message history

We need to change this to:
1. Query all files for this conversation with their contexts
2. Filter to files that have intake context
3. Sort by parse time
4. Create combined synthetic message with all contexts
5. **ALSO include legacy context if present** (backward compat for mixed conversations)

### Task

1. In `buildConversationContext`, call `this.fileRepository.findByConversationWithContext`
2. Create new method `formatMultiDocContextForClaude` that handles multiple contexts
3. **Include legacy context in addition to file contexts** (not instead of)
4. Add sanitization for prompt-injection safety
5. Add unit tests

### Files to Modify

- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
- `packages/backend/__tests__/unit/ChatServer.contextInjection.test.ts`

### New Method with Security Sanitization

```typescript
/**
 * Sanitize string for safe inclusion in Claude prompt
 * Prevents prompt injection via extracted document strings
 */
private sanitizeForPrompt(str: string | null, maxLength: number = 200): string {
  if (!str) return '';
  // Remove control characters and normalize whitespace
  const cleaned = str
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control chars
    .replace(/\s+/g, ' ')            // Normalize whitespace
    .trim();
  return cleaned.slice(0, maxLength);
}

/**
 * Format multiple document contexts as synthetic assistant message
 * Deduplicates features/claims across documents for concise output
 *
 * SECURITY: All strings sanitized to prevent prompt injection
 */
private formatMultiDocContextForClaude(
  files: FileWithIntakeContext[],
  legacyContext?: IntakeDocumentContext | null,
  legacyGapCategories?: string[] | null
): string {
  const parts: string[] = [
    `I have analyzed ${files.length} uploaded document(s) and extracted the following context:`,
  ];

  // Per-document summary (from new per-file storage)
  files.forEach((file, i) => {
    const ctx = file.intakeContext!;
    parts.push(`\n**Document ${i + 1}: ${this.sanitizeForPrompt(file.filename, 100)}**`);
    if (ctx.vendorName) parts.push(`- Vendor: ${this.sanitizeForPrompt(ctx.vendorName)}`);
    if (ctx.solutionName) parts.push(`- Solution: ${this.sanitizeForPrompt(ctx.solutionName)}`);
    if (ctx.solutionType) parts.push(`- Type: ${this.sanitizeForPrompt(ctx.solutionType)}`);
    if (ctx.industry) parts.push(`- Industry: ${this.sanitizeForPrompt(ctx.industry)}`);
  });

  // Include legacy context if present (backward compat for mixed conversations)
  if (legacyContext && !files.some(f =>
    f.intakeContext?.vendorName === legacyContext.vendorName &&
    f.intakeContext?.solutionName === legacyContext.solutionName
  )) {
    parts.push(`\n**Prior Document (legacy):**`);
    if (legacyContext.vendorName) parts.push(`- Vendor: ${this.sanitizeForPrompt(legacyContext.vendorName)}`);
    if (legacyContext.solutionName) parts.push(`- Solution: ${this.sanitizeForPrompt(legacyContext.solutionName)}`);
  }

  // Combined & deduplicated features/claims (sanitized, capped)
  const allFeatures = [...new Set([
    ...files.flatMap(f => f.intakeContext?.features || []),
    ...(legacyContext?.features || []),
  ])].map(f => this.sanitizeForPrompt(f, 100)).filter(Boolean);

  const allClaims = [...new Set([
    ...files.flatMap(f => f.intakeContext?.claims || []),
    ...(legacyContext?.claims || []),
  ])].map(c => this.sanitizeForPrompt(c, 100)).filter(Boolean);

  const allCompliance = [...new Set([
    ...files.flatMap(f => f.intakeContext?.complianceMentions || []),
    ...(legacyContext?.complianceMentions || []),
  ])].map(c => this.sanitizeForPrompt(c, 50)).filter(Boolean);

  const allGaps = [...new Set([
    ...files.flatMap(f => f.intakeGapCategories || []),
    ...(legacyGapCategories || []),
  ])].map(g => this.sanitizeForPrompt(g, 50)).filter(Boolean);

  if (allFeatures.length > 0) {
    parts.push(`\n**Combined Features:** ${allFeatures.slice(0, 10).join(', ')}`);
  }
  if (allClaims.length > 0) {
    parts.push(`**Combined Claims:** ${allClaims.slice(0, 5).join(', ')}`);
  }
  if (allCompliance.length > 0) {
    parts.push(`**Compliance Mentions:** ${allCompliance.join(', ')}`);
  }
  if (allGaps.length > 0) {
    parts.push(`**Areas Needing Clarification:** ${allGaps.join(', ')}`);
  }

  parts.push('', 'I will use this combined context to assist with the assessment.');
  return parts.join('\n');
}
```

### Updated buildConversationContext Logic

```typescript
// In buildConversationContext, replace existing intake context injection with:

// Query per-file contexts (new multi-doc storage)
const filesWithContext = await this.fileRepository.findByConversationWithContext(conversationId);
const contextsFromFiles = filesWithContext.filter(f => f.intakeContext);

// Get legacy context (backward compat)
const legacyContext = conversation.context?.intakeContext;
const legacyGapCategories = conversation.context?.intakeGapCategories;

// Inject combined context if we have any sources
if (contextsFromFiles.length > 0 || legacyContext) {
  const contextMessage = contextsFromFiles.length > 0
    ? this.formatMultiDocContextForClaude(contextsFromFiles, legacyContext, legacyGapCategories)
    : this.formatIntakeContextForClaude(legacyContext!, legacyGapCategories);

  messages.unshift({ role: 'assistant', content: contextMessage });
}
```

### Acceptance Criteria

- [ ] Uses existing `this.fileRepository` (no constructor changes)
- [ ] `buildConversationContext` queries files for contexts
- [ ] New `formatMultiDocContextForClaude` method implemented
- [ ] `sanitizeForPrompt` helper for security
- [ ] Backward compatible: includes legacy context **in addition to** file contexts
- [ ] Contexts sorted by parse time (deterministic order)
- [ ] Features/claims deduplicated across documents
- [ ] Unit tests for multi-doc injection
- [ ] Unit tests for backward compatibility (legacy + new mixed)
- [ ] Unit tests for sanitization (control chars, long strings)

---

## Story 17.3.5: Integration Test - Multi-Document Context Flow

**Track:** D (Tests)
**Dependencies:** 17.3.3 + 17.3.4
**Can Run In Parallel With:** Nothing (needs B+C complete)

### Context for Agent

We need an integration test that verifies the full flow:
1. Upload two documents to same conversation
2. Both documents get parsed (intake context extracted)
3. Both contexts are stored on their respective file rows
4. ChatServer aggregates both contexts for Claude
5. Claude receives combined context in message history

**IMPORTANT:** Do NOT assert on Claude's natural-language response. Assert on the **input sent to Claude** (the messages array passed to claudeClient).

### Task

Create integration test that:
1. Creates a conversation
2. Creates two file records via repository
3. Updates both with intake context (simulates parse completion)
4. Uses MockClaudeClient to capture the messages sent to Claude
5. Verifies both contexts present in the messages array

### Files to Create/Modify

- `packages/backend/__tests__/integration/multi-doc-context.test.ts` (new)

### Test Outline

```typescript
import { MockClaudeClient } from '../mocks/MockClaudeClient';

describe('Multi-Document Context Integration', () => {
  let mockClaudeClient: MockClaudeClient;
  let chatServer: ChatServer;
  // ... other setup

  beforeEach(() => {
    mockClaudeClient = new MockClaudeClient();
    // ... wire up chatServer with mockClaudeClient
  });

  it('should aggregate contexts from multiple uploaded documents', async () => {
    // 1. Create conversation
    const conversation = await conversationService.createConversation({ userId: 'test-user' });

    // 2. Create two file records
    const file1 = await fileRepository.create({
      conversationId: conversation.id,
      userId: 'test-user',
      filename: 'vendor-brochure.pdf',
      mimeType: 'application/pdf',
      size: 1000,
      storagePath: '/tmp/test1.pdf',
    });
    const file2 = await fileRepository.create({
      conversationId: conversation.id,
      userId: 'test-user',
      filename: 'security-whitepaper.pdf',
      mimeType: 'application/pdf',
      size: 2000,
      storagePath: '/tmp/test2.pdf',
    });

    // 3. Simulate parsed contexts
    await fileRepository.updateIntakeContext(file1.id, {
      vendorName: 'Acme Corp',
      solutionName: 'AI Platform',
      solutionType: 'SaaS',
      industry: 'Healthcare',
      features: ['Feature A', 'Feature B'],
      claims: ['Claim 1'],
      complianceMentions: [],
    });
    await fileRepository.updateIntakeContext(file2.id, {
      vendorName: 'Acme Corp',
      solutionName: 'AI Platform',
      solutionType: null,
      industry: null,
      features: ['Feature B', 'Feature C'], // B overlaps
      claims: [],
      complianceMentions: ['SOC2', 'HIPAA'],
    });

    // 4. Send a message (triggers buildConversationContext → Claude call)
    // ... trigger send_message flow ...

    // 5. Assert on Claude client INPUT (not response)
    const capturedMessages = mockClaudeClient.getLastMessages();
    const contextMessage = capturedMessages.find(m =>
      m.role === 'assistant' && m.content.includes('analyzed')
    );

    expect(contextMessage).toBeDefined();
    expect(contextMessage!.content).toContain('Document 1: vendor-brochure.pdf');
    expect(contextMessage!.content).toContain('Document 2: security-whitepaper.pdf');
    expect(contextMessage!.content).toContain('Acme Corp');
    // Features deduplicated: A, B, C (not A, B, B, C)
    expect(contextMessage!.content).toContain('Feature A');
    expect(contextMessage!.content).toContain('Feature B');
    expect(contextMessage!.content).toContain('Feature C');
    expect(contextMessage!.content).toContain('SOC2');
  });

  it('should handle concurrent uploads without losing context', async () => {
    // Test that parallel updateIntakeContext calls don't race
    const conversation = await conversationService.createConversation({ userId: 'test-user' });

    // Create 5 files
    const files = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        fileRepository.create({
          conversationId: conversation.id,
          userId: 'test-user',
          filename: `doc-${i}.pdf`,
          mimeType: 'application/pdf',
          size: 1000,
          storagePath: `/tmp/doc-${i}.pdf`,
        })
      )
    );

    // Update all contexts in parallel (simulates concurrent parse completion)
    await Promise.all(
      files.map((file, i) =>
        fileRepository.updateIntakeContext(file.id, {
          vendorName: `Vendor ${i}`,
          solutionName: null,
          solutionType: null,
          industry: null,
          features: [`Feature-${i}`],
          claims: [],
          complianceMentions: [],
        })
      )
    );

    // Verify all 5 contexts stored
    const filesWithContext = await fileRepository.findByConversationWithContext(conversation.id);
    expect(filesWithContext.filter(f => f.intakeContext)).toHaveLength(5);
  });

  it('should include legacy context alongside new file contexts', async () => {
    // Test backward compat: conversation has legacy intakeContext + new file contexts
    const conversation = await conversationService.createConversation({
      userId: 'test-user',
      context: {
        intakeContext: {
          vendorName: 'Legacy Vendor',
          solutionName: 'Old Product',
          solutionType: null,
          industry: null,
          features: ['Legacy Feature'],
          claims: [],
          complianceMentions: [],
        },
      },
    });

    // Add new file with different vendor
    const file = await fileRepository.create({
      conversationId: conversation.id,
      userId: 'test-user',
      filename: 'new-doc.pdf',
      mimeType: 'application/pdf',
      size: 1000,
      storagePath: '/tmp/new.pdf',
    });

    await fileRepository.updateIntakeContext(file.id, {
      vendorName: 'New Vendor',
      solutionName: 'New Product',
      solutionType: null,
      industry: null,
      features: ['New Feature'],
      claims: [],
      complianceMentions: [],
    });

    // Trigger message and capture
    // ...

    // Both vendors should be present
    const capturedMessages = mockClaudeClient.getLastMessages();
    const contextMessage = capturedMessages.find(m => m.role === 'assistant');

    expect(contextMessage!.content).toContain('New Vendor');
    expect(contextMessage!.content).toContain('Legacy Vendor'); // Not dropped!
    expect(contextMessage!.content).toContain('New Feature');
    expect(contextMessage!.content).toContain('Legacy Feature');
  });
});
```

### Acceptance Criteria

- [ ] Integration test for multi-doc aggregation
- [ ] Integration test for concurrent uploads (no lost updates)
- [ ] Integration test for legacy + new context coexistence
- [ ] Tests assert on **Claude client input** (not Claude response)
- [ ] Tests use real database (not mocks for DB)
- [ ] All tests passing

---

## Story 17.3.6: E2E Test - Full Upload to Chat Flow

**Track:** D (Tests)
**Dependencies:** 17.3.5
**Can Run In Parallel With:** Nothing (final validation)

### Context for Agent

End-to-end test that exercises the complete flow via WebSocket and HTTP endpoints.

**IMPORTANT:** Use MockClaudeClient to capture input. Do NOT assert on Claude's natural-language response (non-deterministic, flaky).

### Task

Create E2E test that:
1. Connects via WebSocket, creates conversation
2. Uploads two documents via HTTP endpoint
3. Waits for `intake_context_ready` events for both
4. Sends a chat message
5. Verifies the **messages sent to Claude** contain both document contexts

### Files to Create/Modify

- `packages/backend/__tests__/e2e-external/multi-doc-upload.test.ts` (new)

### Test Pattern (follows existing `websocket-chat.test.ts`)

```typescript
describe('E2E: Multi-Document Upload to Chat', () => {
  let mockClaudeClient: MockClaudeClient;
  // ... setup with real HTTP/WS but mock Claude

  it('should send both document contexts to Claude when user sends message', async () => {
    // 1. Connect WS, create conversation
    // 2. Upload doc1 via HTTP, wait for intake_context_ready
    // 3. Upload doc2 via HTTP, wait for intake_context_ready
    // 4. Send chat message via WS
    // 5. Assert mockClaudeClient received messages with BOTH contexts

    const messagesPassedToClaude = mockClaudeClient.getLastMessages();
    const syntheticContext = messagesPassedToClaude[0]; // First message is injected context

    expect(syntheticContext.content).toContain('doc1.pdf');
    expect(syntheticContext.content).toContain('doc2.pdf');
  });
});
```

### Acceptance Criteria

- [ ] E2E test exercises full HTTP + WebSocket flow
- [ ] Both documents' contexts reach Claude (verified via mock capture)
- [ ] Test is deterministic (asserts on input to Claude, not response)
- [ ] Test is not flaky (proper waits, no race conditions)

---

## Summary: Parallel Execution Plan

```
Phase 1 (Sequential - Foundation):
  └── 17.3.1: Database Migration + Index
  └── 17.3.2: FileRepository Methods

Phase 2 (Parallel - Core Implementation):
  ├── 17.3.3: DocumentUploadController (Track B)
  └── 17.3.4: ChatServer Aggregation (Track C)

Phase 3 (Sequential - Validation):
  └── 17.3.5: Integration Tests
  └── 17.3.6: E2E Tests
```

## Agent Assignment Recommendation

| Story | Agent Type | Notes |
|-------|-----------|-------|
| 17.3.1 | setup-agent or general | Migration + index |
| 17.3.2 | chat-backend-agent | Repository pattern |
| 17.3.3 | chat-backend-agent | Controller update |
| 17.3.4 | chat-backend-agent | ChatServer (no constructor change needed) |
| 17.3.5 | chat-backend-agent | Integration tests (MockClaudeClient pattern) |
| 17.3.6 | chat-backend-agent | E2E tests (MockClaudeClient pattern) |

**Optimal parallelization:** Run 17.3.3 and 17.3.4 simultaneously after 17.3.2 completes.
