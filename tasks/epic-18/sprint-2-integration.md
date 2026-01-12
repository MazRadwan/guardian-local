# Sprint 2: Integration & Wiring

**Track:** Integration
**Stories:** 18.2.1 - 18.2.5
**Estimated Effort:** 4-5 hours
**Parallel With:** None
**Dependencies:** Sprint 1A (Backend), Sprint 1B (Frontend)
**Agent:** `frontend-agent` or `backend-agent`

---

## Context

This sprint connects Sprint 1A backend changes with Sprint 1B frontend changes:
1. Wire up socket listeners in Composer/hooks
2. Implement context injection fallback in ChatServer
3. Add event contract for trigger-on-send
4. Add progress-in-chat UX
5. End-to-end testing

**Key goal:** User sees "Attached" within 3 seconds of file selection.

**Critical Decision (from Sprint 0 D4):** Processing triggers on user Send, NOT on upload completion. This decouples upload latency from parsing/scoring latency.

---

## Trigger-on-Send Event Contract

**CRITICAL:** With trigger-on-send, the event timeline changes significantly:

### ~~Old Flow (Auto-Trigger)~~ — NOT IMPLEMENTED
```
❌ This pattern is NOT implemented. Shown for historical context only.
Upload → Store → Auto-parse → upload_progress:complete → Auto-score
(User blocked for ~4 minutes - bad UX)
```

### New Flow (Trigger-on-Send) — IMPLEMENTED
```
Upload → Store + excerpt (~3s) → file_attached → "Attached" (chip ready, composer clear)
User types optional message → clicks Send → composer clears immediately
Message handler → Triggers parse → Progress in CHAT → Results in chat
```

### Event Emission Points (Changed)

**DECISION:** For trigger-on-send, use `scoring_progress` event (existing type) for all parsing/scoring progress. Do NOT use `upload_progress` after `file_attached`.

| Event | When | Location | Notes |
|-------|------|----------|-------|
| `file_attached` | After S3 store + excerpt | Upload handler | Unchanged |
| `upload_progress` | During upload only | Upload handler | Stages: `storing` only |
| `scoring_progress` | Parsing/scoring phases | **Message handler** | Triggered on Send |
| `scoring_complete` | Final results | **Message handler** | Existing event |

**Why `scoring_progress` instead of `upload_progress`:**
- `scoring_progress` already exists with correct fields (`status`, `message`, `progress`)
- Frontend already handles it via `updateScoringProgress()` in chatStore
- `upload_progress` is for upload phase only (correlates by `uploadId`)
- After `file_attached`, frontend tracks by `fileId`, not `uploadId`

### Message Handler Must Emit

**CRITICAL:** Since the frontend tracks files by `uploadId` until attachment, but message handler only has `fileId`, we need to use `fileId`-based correlation for post-attachment events.

By the time the message handler fires:
1. Frontend received `file_attached` or `intake_context_ready` which contains `fileId`
2. Frontend has mapped `uploadId → fileId` for all attached files
3. Progress events from message handler should use `fileId`, not `uploadId`

```typescript
// In ChatServer.handleMessage()
if (attachedFiles.length > 0 && mode === 'scoring') {
  // attachedFiles contains fileIds from the message payload
  for (const fileId of attachedFileIds) {
    const file = await fileRepository.findById(fileId);
    if (!file) continue;

    // Check if file needs parsing (parseStatus === 'pending')
    if (file.parseStatus === 'pending') {
      // Use scoring_progress for parsing phase (existing event type)
      socket.emit('scoring_progress', {
        conversationId,
        status: 'parsing',
        message: 'Analyzing questionnaire responses...',
        progress: 0,
      });

      // Trigger parsing (uses idempotency from Sprint 1A)
      const started = await fileRepository.tryStartParsing(file.id);
      if (started) {
        await this.parseAndScore(file, socket, conversationId);
      }
    }
  }
}
```

**Event Type Decision:**
- **Parsing progress** → Use `scoring_progress` (existing type with `status`, `message`, `progress`)
- **Scoring progress** → Use `scoring_progress` (already supports dimension-level progress)

**Single-File Constraint for Scoring:**

`scoring_progress` has no `fileId` field. For MVP, we constrain scoring mode to **one file per message**:

```typescript
// In ChatServer.handleMessage()
if (mode === 'scoring' && attachments && attachments.length > 1) {
  socket.emit('error', {
    message: 'Scoring mode supports one questionnaire file per message',
    code: 'SCORING_SINGLE_FILE',
  });
  return;
}
```

**Why this constraint:**
- Scoring is a sequential process (parse → score each dimension)
- Progress makes sense for one file at a time
- Multi-file scoring would need parallel progress indicators (complex UX)
- Users typically score one questionnaire at a time

**Future extension:** To support multi-file scoring, extend `ScoringProgressPayload`:
```typescript
interface ScoringProgressPayload {
  conversationId: string;
  status: 'parsing' | 'scoring' | 'validating' | 'complete' | 'error';
  message: string;
  progress?: number;
  error?: string;
  fileId?: string;  // FUTURE: Add for multi-file support
}
```

---

## Prerequisites

Before starting:

- [ ] Sprint 1A complete (backend `file_attached` event working)
- [ ] Sprint 1B complete (frontend types and state machine ready)
- [ ] Both sprints merged to feature branch

---

## Story 18.2.1: Wire Frontend Socket Listeners

**Goal:** Connect frontend hooks to backend `file_attached` event.

**Files:**
- `apps/web/src/hooks/useMultiFileUpload.ts`
- `apps/web/src/hooks/useFileUpload.ts`
- `apps/web/src/hooks/useWebSocket.ts` (adapter)
- `apps/web/src/components/chat/Composer.tsx`

### Implementation

**IMPORTANT:** Use the WebSocket adapter pattern (not raw socket) and `stage` field (not `state`).

Ensure socket listeners use the adapter from Sprint 1B:

```typescript
// In useMultiFileUpload.ts
// Use the WebSocket adapter's subscribeFileAttached method (from Sprint 1B)

useEffect(() => {
  // Use adapter method, NOT raw socket.on()
  const unsubscribe = wsAdapter.subscribeFileAttached((event: FileAttachedEvent) => {
    if (!knownUploadIds.current.has(event.uploadId)) {
      console.debug('[useMultiFileUpload] Ignoring file_attached for unknown uploadId:', event.uploadId);
      return;
    }

    console.debug('[useMultiFileUpload] Received file_attached:', event.uploadId, event.fileId);

    setFiles(prev => prev.map(f => {
      if (f.uploadId !== event.uploadId) return f;

      // Use canTransitionTo from Sprint 1B (stage, not state)
      if (!canTransitionTo(f.stage, 'attached')) {
        // Still capture fileId and metadata even if stage doesn't change
        return {
          ...f,
          fileId: event.fileId,
          metadata: {
            fileId: event.fileId,
            filename: event.filename,
            mimeType: event.mimeType,
            size: event.size,
            hasExcerpt: event.hasExcerpt,
          },
        };
      }

      return {
        ...f,
        fileId: event.fileId,
        stage: 'attached',  // Use 'stage' not 'state'
        metadata: {
          fileId: event.fileId,
          filename: event.filename,
          mimeType: event.mimeType,
          size: event.size,
          hasExcerpt: event.hasExcerpt,
        },
      };
    }));
  });

  return unsubscribe;
}, [wsAdapter]);
```

**NOTE:** The `wsAdapter` comes from `useWebSocket()` hook which exposes `subscribeFileAttached`. See Sprint 1B for adapter implementation.

### Composer Integration

Update Composer to pass enrichment state to FileChip:

**IMPORTANT:** Use existing field names from current Composer implementation:
- Use `filename` (not `file`)
- Use `stage` (not `state`)
- Use `removeFile(fileState.localIndex)` (not index-based removal)

```typescript
// In Composer.tsx
// Current component expects filename/stage and removal by localIndex
{files.map((fileState) => (
  <FileChip
    key={fileState.localIndex}
    filename={fileState.filename}  // Use filename, not file
    stage={fileState.stage}        // Use stage, not state
    progress={fileState.progress}
    error={fileState.error}
    metadata={fileState.metadata}
    // Show "Enriching..." when attached but not complete
    isEnriching={fileState.stage === 'attached'}
    onRemove={() => removeFile(fileState.localIndex)}  // Use localIndex, not array index
    variant={files.length > 3 ? 'compact' : 'default'}
  />
))}
```

**Why localIndex matters:** Using array index for removal can delete the wrong file if files are reordered or removed mid-upload. `localIndex` is a stable identifier assigned at file selection time.

### Acceptance Criteria

- [ ] `file_attached` listener connected in both hooks
- [ ] **Uses WebSocket adapter** (subscribeFileAttached, not raw socket.on)
- [ ] **Uses `stage` field** (not `state`)
- [ ] **Removal uses `localIndex`** (not array index)
- [ ] Events properly filtered by uploadId
- [ ] Stage transitions use canTransitionTo guard
- [ ] Composer passes isEnriching prop

---

## Story 18.2.2: Implement Context Injection Fallback

**Goal:** ChatServer uses text excerpt when intakeContext not yet available.

**Files:**
- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
- `packages/backend/src/application/interfaces/IFileRepository.ts`
- `packages/backend/src/infrastructure/database/repositories/DrizzleFileRepository.ts`
- `packages/backend/src/index.ts` (composition root wiring)

### Step 1: Add Repository Method for Files with Excerpt

**CRITICAL:** The existing `findByConversationWithContext()` only returns rows WHERE intakeContext IS NOT NULL. The fallback to textExcerpt will never execute because those files aren't returned.

**Add new method:** `packages/backend/src/application/interfaces/IFileRepository.ts`

```typescript
// ADD to IFileRepository interface (keep all existing methods)
export interface IFileRepository {
  // ... existing methods ...

  // NEW: Epic 18 - Get all files in conversation (with or without context)
  // Returns files with textExcerpt even if intakeContext is null
  findByConversationWithExcerpt(conversationId: string): Promise<FileWithExcerpt[]>;
}

// NEW type for files that may have excerpt but no intakeContext
export interface FileWithExcerpt {
  id: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  textExcerpt: string | null;
  intakeContext: IntakeContext | null;  // May be null during enrichment
}
```

**Implement:** `packages/backend/src/infrastructure/database/repositories/DrizzleFileRepository.ts`

```typescript
// Add method to get all files with excerpts (not just those with intakeContext)
async findByConversationWithExcerpt(conversationId: string): Promise<FileWithExcerpt[]> {
  return await this.db
    .select({
      id: files.id,
      filename: files.filename,
      mimeType: files.mimeType,
      storagePath: files.storagePath,
      textExcerpt: files.textExcerpt,
      intakeContext: files.intakeContext,
    })
    .from(files)
    .where(eq(files.conversationId, conversationId));
}
```

### Step 2: Update ChatServer Constructor (Dependency Injection)

**CRITICAL:** ChatServer currently doesn't have `fileStorage` or `textExtractionService` injected. Add them.

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

```typescript
import { IFileStorage } from '../../application/interfaces/IFileStorage';
import { ITextExtractionService, ValidatedDocumentType } from '../../application/interfaces/ITextExtractionService';
import { sanitizeForPrompt } from '../../utils/sanitize';

// MIME type to validated document type mapping
const MIME_TYPE_MAP: Record<string, ValidatedDocumentType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
};

export class ChatServer {
  constructor(
    private readonly io: Server,
    private readonly conversationService: ConversationService,
    private readonly fileRepository: IFileRepository,
    private readonly claudeService: IClaudeService,
    // NEW: Epic 18 - Add these dependencies
    private readonly fileStorage: IFileStorage,
    private readonly textExtractionService: ITextExtractionService
  ) {}
  // ...
}
```

**Update composition root:** `packages/backend/src/index.ts`

```typescript
// Update ChatServer instantiation
const chatServer = new ChatServer(
  io,
  conversationService,
  fileRepository,
  claudeService,
  fileStorage,              // NEW: Epic 18
  textExtractionService     // NEW: Epic 18
);
```

### Step 3: Implement Context Injection with Fallback

```typescript
/**
 * Build context for Claude from attached files
 *
 * Epic 18: Fallback hierarchy:
 * 1. intakeContext (structured, from Claude enrichment)
 * 2. textExcerpt (raw text, from upload extraction)
 * 3. Re-read from S3 (slow fallback for missing excerpt / extraction failure)
 */
private async buildFileContext(conversationId: string): Promise<string> {
  // Use new method that returns ALL files (not just those with intakeContext)
  const files = await this.fileRepository.findByConversationWithExcerpt(conversationId);

  if (files.length === 0) {
    return '';
  }

  const contextParts: string[] = [];

  for (const file of files) {
    // Priority 1: Structured intake context (best)
    if (file.intakeContext) {
      contextParts.push(this.formatIntakeContext(file));
      continue;
    }

    // Priority 2: Text excerpt (good, fast)
    if (file.textExcerpt) {
      contextParts.push(this.formatTextExcerpt(file));
      continue;
    }

    // Priority 3: Re-read from S3 (slow fallback for missing excerpt)
    console.warn(`[ChatServer] File ${file.id} has no excerpt, falling back to S3 read`);
    try {
      const excerpt = await this.extractExcerptFromStorage(file);
      if (excerpt) {
        contextParts.push(this.formatTextExcerpt({ ...file, textExcerpt: excerpt }));

        // Lazy backfill: Store for next time (fire-and-forget)
        this.fileRepository.updateTextExcerpt(file.id, excerpt).catch(err => {
          console.error(`[ChatServer] Failed to backfill excerpt for ${file.id}:`, err);
        });
      }
    } catch (err) {
      console.error(`[ChatServer] Failed to extract excerpt for ${file.id}:`, err);
      // Continue without this file's context
    }
  }

  if (contextParts.length === 0) {
    return '';
  }

  return `\n\n--- Attached Documents ---\n${contextParts.join('\n\n')}`;
}

/**
 * Format structured intake context for Claude
 */
private formatIntakeContext(file: FileWithContext): string {
  const ctx = file.intakeContext;
  return `
[Document: ${file.filename}]
Vendor: ${ctx.vendorName || 'Unknown'}
Solution: ${ctx.solutionName || 'Unknown'}
Type: ${ctx.solutionType || 'Unknown'}
Features: ${ctx.features?.join(', ') || 'None identified'}
Claims: ${ctx.claims?.join(', ') || 'None identified'}
Compliance: ${ctx.complianceMentions?.join(', ') || 'None identified'}
`.trim();
}

/**
 * Format raw text excerpt for Claude
 *
 * SECURITY: Use sanitizeForPrompt to avoid injecting raw/malicious text
 */
private formatTextExcerpt(file: FileWithExcerpt): string {
  // Sanitize excerpt before injecting into Claude prompt
  const sanitizedExcerpt = sanitizeForPrompt(file.textExcerpt || '', {
    maxLength: 10000,
    stripControlChars: true,
    escapePromptInjection: true,
  });

  return `
[Document: ${file.filename}]
(Raw text excerpt - enrichment pending)

${sanitizedExcerpt}
`.trim();
}

/**
 * Extract excerpt from S3 storage (slow fallback)
 *
 * IMPORTANT: Use validated documentType, NOT raw mimeType
 * to handle DOCX-as-ZIP edge case correctly.
 */
private async extractExcerptFromStorage(file: FileRecord): Promise<string | null> {
  const buffer = await this.fileStorage.retrieve(file.storagePath);

  // Map MIME type to validated document type (handles DOCX-as-ZIP)
  const documentType = MIME_TYPE_MAP[file.mimeType];
  if (!documentType) {
    console.warn(`[ChatServer] Unknown MIME type for extraction: ${file.mimeType}`);
    return null;
  }

  const result = await this.textExtractionService.extract(buffer, documentType);

  if (!result.success) {
    return null;
  }

  return result.excerpt;
}
```

### Step 4: Add sanitizeForPrompt Utility (if not exists)

**File:** `packages/backend/src/utils/sanitize.ts`

```typescript
export interface SanitizeOptions {
  maxLength?: number;
  stripControlChars?: boolean;
  escapePromptInjection?: boolean;
}

/**
 * Sanitize text before injecting into Claude prompts
 *
 * Prevents:
 * - Excessively long text
 * - Control characters that could confuse the model
 * - Basic prompt injection patterns
 */
export function sanitizeForPrompt(text: string, options: SanitizeOptions = {}): string {
  const {
    maxLength = 10000,
    stripControlChars = true,
    escapePromptInjection = true,
  } = options;

  let result = text;

  // Truncate to max length
  if (result.length > maxLength) {
    result = result.slice(0, maxLength) + '\n[...truncated]';
  }

  // Strip control characters (except newlines, tabs)
  if (stripControlChars) {
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  // Escape common prompt injection patterns
  if (escapePromptInjection) {
    // Escape sequences that might look like system prompts
    result = result.replace(/^(Human:|Assistant:|System:)/gm, '[escaped] $1');
  }

  return result;
}
```

### Acceptance Criteria

- [ ] **New repository method** `findByConversationWithExcerpt` returns all files (not just those with intakeContext)
- [ ] **ChatServer DI updated** (fileStorage, textExtractionService added to constructor)
- [ ] **Composition root updated** (`index.ts` passes new dependencies)
- [ ] Fallback hierarchy implemented (intakeContext → textExcerpt → S3)
- [ ] **documentType mapping** (MIME_TYPE_MAP, not raw mimeType)
- [ ] **sanitizeForPrompt** applied to excerpts before Claude injection
- [ ] Lazy backfill for files with missing excerpts (extraction failure recovery)
- [ ] Graceful error handling
- [ ] Logging for monitoring
- [ ] Integration test for fallback path
- [ ] Unit tests for sanitizeForPrompt

---

## Story 18.2.3: Verify Event Ordering Integration

**Goal:** Verify Sprint 1B monotonic guards work correctly with Sprint 1A backend events.

**NOTE:** The monotonic state guards (STATE_PRECEDENCE, canTransitionTo, early event buffer) were **moved to Sprint 1B** per code review feedback. Sprint 2 verifies the integration works end-to-end.

**Files:**
- `apps/web/src/hooks/useMultiFileUpload.ts` (verify, not implement)
- `apps/web/src/hooks/useFileUpload.ts` (verify, not implement)

### What Was Moved to Sprint 1B

The following are now **first-class acceptance criteria in Sprint 1B**:
- `STATE_PRECEDENCE` constant
- `canTransitionTo()` function
- `earlyFileAttachedEvents` buffer
- `isInFlight` including 'attached' state

### Sprint 2 Verification

This story verifies the integration works:

```typescript
describe('Event ordering integration', () => {
  it('should handle backend events in expected order', () => {
    // upload_progress:storing → file_attached (end of upload phase)
    // scoring_progress emits later when user sends message
  });

  it('should handle fast backend (file_attached before storing progress)', () => {
    // file_attached → upload_progress:storing (ignored by monotonic guard)
  });

  it('should handle very fast backend (early event buffer)', () => {
    // file_attached arrives before uploadId registered
    // Event buffered, processed when uploadId known
  });
});
```

### Acceptance Criteria

- [ ] Sprint 1B monotonic guards verified working with Sprint 1A events
- [ ] Integration test covers all event orderings
- [ ] No state regressions observed in manual testing
- [ ] Debug logs confirm guards are working as expected

---

## Story 18.2.4: End-to-End Integration Test

**Goal:** Verify complete flow works with timing assertions.

**File:** `packages/backend/__tests__/e2e/fast-attach.e2e.test.ts`

### Test Setup

**IMPORTANT:** Follow existing E2E patterns from `packages/backend/__tests__/e2e/websocket-chat.test.ts`:
- Use `Server.getApp()` from `packages/backend/src/infrastructure/http/server.ts`
- Use existing test database helpers
- Use synthetic PDF/DOCX buffers (not `Buffer.from('text')` which fails magic-byte validation)

```typescript
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { Server } from '../../src/infrastructure/http/server';
import { TestDatabase } from '../setup/test-db';
import { createMinimalPdf, createMinimalDocx } from '../fixtures/synthetic-documents';

describe('Epic 18: Fast Attach E2E', () => {
  let app: Express.Application;
  let socket: Socket;
  let authToken: string;
  let userId: string;
  let conversationId: string;
  let testDb: TestDatabase;

  beforeAll(async () => {
    // Use existing test patterns
    testDb = await TestDatabase.create();
    app = Server.getApp();

    // Setup test user and conversation (follow existing pattern)
    const { user, token } = await testDb.createAuthenticatedUser();
    userId = user.id;
    authToken = token;

    const conversation = await testDb.createConversation(userId);
    conversationId = conversation.id;

    // Connect WebSocket
    socket = io(`http://localhost:${process.env.PORT || 3001}/chat`, {
      auth: { token: authToken },
    });
    await new Promise(resolve => socket.on('connect', resolve));

    // Join conversation room
    socket.emit('join', { conversationId });
  });

  afterAll(async () => {
    socket.disconnect();
    await testDb.cleanup();
  });

  describe('file_attached timing', () => {
    it('should emit file_attached within 3 seconds of upload', async () => {
      // Use synthetic PDF that passes FileValidationService magic-byte checks
      const pdfBuffer = createMinimalPdf('Test content for timing assertion');

      const fileAttachedPromise = new Promise<{ event: any; elapsed: number }>((resolve, reject) => {
        const start = Date.now();
        const timeout = setTimeout(() => {
          reject(new Error('file_attached not received within 5s'));
        }, 5000);

        socket.once('file_attached', (event) => {
          clearTimeout(timeout);
          resolve({ event, elapsed: Date.now() - start });
        });
      });

      // Upload file with valid PDF buffer
      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', pdfBuffer, 'test.pdf')
        .field('conversationId', conversationId)
        .field('mode', 'intake');

      expect(response.status).toBe(202);

      // Wait for file_attached
      const { event, elapsed } = await fileAttachedPromise;

      // Assert timing
      expect(elapsed).toBeLessThan(3000); // SLO: 3 seconds
      console.log(`file_attached received in ${elapsed}ms`);

      // Assert event payload
      expect(event.uploadId).toBe(response.body.uploadId);
      expect(event.fileId).toBeDefined();
      expect(event.filename).toBe('test.pdf');
    });

    /**
     * Trigger-on-send event flow test
     *
     * With trigger-on-send:
     * - Upload phase: `file_attached` only (no `upload_progress:complete`)
     * - Message phase: `scoring_progress` events (triggered by user Send)
     *
     * This test verifies the upload phase completes with just `file_attached`.
     */
    it('should emit file_attached without upload_progress:complete (trigger-on-send)', async () => {
      const pdfBuffer = createMinimalPdf('Test content for trigger-on-send');
      const events: { type: string; timestamp: number }[] = [];

      // Listen for both event types to verify behavior
      socket.on('file_attached', () => {
        events.push({ type: 'file_attached', timestamp: Date.now() });
      });

      socket.on('upload_progress', (event) => {
        events.push({ type: `upload_progress:${event.stage}`, timestamp: Date.now() });
      });

      // Upload with valid PDF
      await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', pdfBuffer, 'test2.pdf')
        .field('conversationId', conversationId)
        .field('mode', 'scoring');  // Scoring mode uses trigger-on-send

      // Wait for file_attached
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('file_attached timeout')), 5000);
        const checkEvents = setInterval(() => {
          if (events.some(e => e.type === 'file_attached')) {
            clearTimeout(timeout);
            clearInterval(checkEvents);
            resolve();
          }
        }, 100);
      });

      // Verify file_attached received
      const fileAttached = events.find(e => e.type === 'file_attached');
      expect(fileAttached).toBeDefined();

      // With trigger-on-send, upload_progress:complete should NOT be emitted
      // (parsing happens when user sends message, not during upload)
      const complete = events.find(e => e.type === 'upload_progress:complete');
      expect(complete).toBeUndefined();

      console.log('Events received during upload:', events.map(e => e.type));
    });

    /**
     * Full trigger-on-send flow test (upload + send)
     *
     * Tests the complete flow:
     * 1. Upload → file_attached
     * 2. Send message → scoring_progress events → scoring_complete
     */
    it('should emit scoring_progress on send (trigger-on-send flow)', async () => {
      const pdfBuffer = createMinimalPdf('Test questionnaire responses');

      // Upload file first
      const uploadResponse = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', pdfBuffer, 'questionnaire.pdf')
        .field('conversationId', conversationId)
        .field('mode', 'scoring');

      expect(uploadResponse.status).toBe(202);
      const { uploadId } = uploadResponse.body;

      // Wait for file_attached to get fileId
      const fileId = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('file_attached timeout')), 5000);
        socket.once('file_attached', (event) => {
          clearTimeout(timeout);
          resolve(event.fileId);
        });
      });

      // Track scoring_progress events
      const progressEvents: any[] = [];
      socket.on('scoring_progress', (event) => {
        progressEvents.push(event);
      });

      // Send message with attached file (triggers parsing/scoring)
      socket.emit('send_message', {
        conversationId,
        content: 'Score this questionnaire',
        attachments: [{ fileId }],
      });

      // Wait for scoring_progress events
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('scoring_progress timeout')), 30000);
        socket.once('scoring_complete', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Verify scoring_progress events were received
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents.some(e => e.status === 'parsing')).toBe(true);
      expect(progressEvents.some(e => e.status === 'scoring')).toBe(true);

      console.log('Scoring progress events:', progressEvents.map(e => e.status));
    });
  });

  describe('context injection fallback', () => {
    it('should use text excerpt when intakeContext not ready', async () => {
      // Use synthetic DOCX for variety
      const docxBuffer = await createMinimalDocx('Test vendor document content for context injection');

      // Upload file
      await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', docxBuffer, 'vendor.docx')
        .field('conversationId', conversationId)
        .field('mode', 'intake');

      // Wait for file_attached (not complete)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('file_attached timeout')), 5000);
        socket.once('file_attached', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Send message immediately (before enrichment completes)
      socket.emit('send_message', {
        conversationId,
        content: 'What is in the attached document?',
      });

      // Verify message was accepted (context injection worked)
      const messageResponse = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('message timeout')), 30000);
        socket.once('message', (msg) => {
          clearTimeout(timeout);
          resolve(msg);
        });
      });

      expect(messageResponse.role).toBe('assistant');
      // Claude should have seen the text excerpt
    });
  });
});
```

### Why These Changes Matter

| Issue | Fix |
|-------|-----|
| **Non-existent helpers** | Use `Server.getApp()` and `TestDatabase` from existing E2E patterns |
| **Magic-byte failure** | Use `createMinimalPdf`/`createMinimalDocx` from Sprint 1A fixtures |
| **Ordering flakiness** | Loosened to verify both events arrive, not strict order (frontend guards handle reorder) |

### Acceptance Criteria

- [ ] `file_attached` arrives within 3s SLO
- [ ] **Upload phase ends at `file_attached`** (no `upload_progress:complete`)
- [ ] **Synthetic documents used** (pass FileValidationService magic-byte checks)
- [ ] **Existing test patterns followed** (Server.getApp(), TestDatabase)
- [ ] Context injection fallback works
- [ ] Tests pass consistently (no flaky ordering failures)
- [ ] Trigger-on-send flow tested (`scoring_progress` on Send)

---

## Story 18.2.5: Progress-in-Chat UX

**Goal:** Show parsing/scoring progress in the chat stream, not stuck in composer.

**Files:**
- `apps/web/src/components/chat/ProgressMessage.tsx` (new component)
- `apps/web/src/components/chat/ChatInterface.tsx` (render ProgressMessage when scoring)
- `apps/web/src/stores/chatStore.ts` (existing - has `scoringProgress` state)
- `apps/web/src/hooks/useWebSocketEvents.ts` (existing - handles `scoring_progress` events)
- `packages/backend/src/infrastructure/websocket/ChatServer.ts` (emit `scoring_progress` events)

### Why Progress in Chat?

**Old UX (auto-trigger):**
- Progress shown as chip state in composer
- Composer blocked for ~4 minutes
- User stares at loading spinner
- No visibility into what's happening

**New UX (trigger-on-send):**
- User sends message, composer clears immediately
- Progress appears as chat messages
- User sees "Analyzing document...", "Extracting responses...", "Scoring dimension 3/10..."
- Results appear as final assistant message

### Progress Message Component

```typescript
// apps/web/src/components/chat/ProgressMessage.tsx
import { CheckCircle } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import type { ScoringStatus } from '@/types/scoring';

interface ProgressMessageProps {
  status: ScoringStatus;  // Use existing ScoringStatus type
  progress?: number;      // 0-100
  message: string;
}

export function ProgressMessage({ status, progress, message }: ProgressMessageProps) {
  const isComplete = status === 'complete';

  return (
    <div className="flex items-start gap-3 py-3 px-4 bg-muted/50 rounded-lg animate-pulse-subtle">
      <div className="flex-shrink-0">
        {isComplete ? (
          <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{message}</p>
        {!isComplete && progress !== undefined && (
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

### State Management (useChatStore)

**IMPORTANT:** Chat state is in `useChatStore` (Zustand), NOT `useChatMessages.ts` (which doesn't exist).

The store already has `scoringProgress` state:
```typescript
// From chatStore.ts (existing)
scoringProgress: {
  status: ScoringStatus;  // 'idle' | 'parsing' | 'scoring' | 'validating' | 'complete' | 'error'
  message: string;
  progress?: number;
  error?: string;
};

updateScoringProgress: (progress: Partial<ScoringProgressEvent>) => void;
```

**For Epic 18:** Use existing `scoringProgress` state for trigger-on-send progress:

```typescript
// In useWebSocketEvents.ts (or similar event handler)
// Use existing ScoringProgressPayload event type

const handleScoringProgress = useCallback((event: ScoringProgressPayload) => {
  // Update existing scoringProgress state in chatStore
  useChatStore.getState().updateScoringProgress({
    status: event.status,
    message: event.message,
    progress: event.progress,
    error: event.error,
  });
}, []);
```

### ChatInterface Integration

```typescript
// In ChatInterface.tsx or ChatMessages.tsx
// Use existing scoringProgress from store

function ChatMessages() {
  const { messages, scoringProgress } = useChatStore();

  return (
    <div className="flex flex-col gap-4">
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}

      {/* Show progress when scoring/parsing in progress */}
      {(scoringProgress.status === 'parsing' || scoringProgress.status === 'scoring') && (
        <ProgressMessage
          status={scoringProgress.status}
          progress={scoringProgress.progress}
          message={scoringProgress.message}
        />
      )}
    </div>
  );
}
```

### Backend Progress Emission

**Use existing `scoring_progress` event type** (ScoringProgressPayload):

```typescript
// In ChatServer.ts message handler
// Use scoring_progress events (existing type, already handled by frontend)

private async handleScoringMessage(
  socket: Socket,
  conversationId: string,
  fileIds: string[],
  userMessage: string
): Promise<void> {
  // Emit user message first
  socket.emit('message', {
    role: 'user',
    content: userMessage,
    attachments: fileIds.map(id => ({ fileId: id })),  // Use attachments field
  });

  // Emit parsing progress (use scoring_progress, not upload_progress)
  socket.emit('scoring_progress', {
    conversationId,
    status: 'parsing',
    progress: 0,
    message: 'Analyzing questionnaire responses...',
  });

  // ... parsing logic with progress updates ...

  // Emit scoring progress per dimension
  const DIMENSION_NAMES = [
    'Data Privacy & Protection',
    'Security Architecture',
    'AI Ethics & Bias',
    // ... all 10 dimensions
  ];

  for (let dimension = 0; dimension < DIMENSION_NAMES.length; dimension++) {
    socket.emit('scoring_progress', {
      conversationId,
      status: 'scoring',
      progress: Math.round(((dimension + 1) / DIMENSION_NAMES.length) * 100),
      message: `Scoring ${DIMENSION_NAMES[dimension]}...`,
    });

    await this.scoreDimension(DIMENSION_NAMES[dimension], ...);
  }

  // Emit complete (frontend clears progress UI)
  socket.emit('scoring_progress', {
    conversationId,
    status: 'complete',
    progress: 100,
    message: 'Scoring complete',
  });

  // Emit scoring_complete with full results (existing event)
  socket.emit('scoring_complete', {
    conversationId,
    result: scoringResults,
    narrativeReport: report,
  });
}
```

**Event Type Reference (existing in websocket.ts):**
```typescript
export interface ScoringProgressPayload {
  conversationId: string;
  status: 'parsing' | 'scoring' | 'validating' | 'complete' | 'error';
  message: string;
  progress?: number;
  error?: string;
}
```

### Visual Flow

```
[User sends message with file]
    ↓
┌─────────────────────────────────────────┐
│ 📎 vendor-questionnaire.pdf            │
│ "Please score this questionnaire"       │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ ⏳ Analyzing questionnaire responses... │
│ ▓▓▓▓▓▓▓░░░░░░░░░░░░░ 35%              │
└─────────────────────────────────────────┘
    ↓ (updates in place)
┌─────────────────────────────────────────┐
│ ⏳ Scoring AI Ethics & Bias...          │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░ 70%              │
└─────────────────────────────────────────┘
    ↓ (progress message removed)
┌─────────────────────────────────────────┐
│ ✅ Scoring Complete                      │
│                                         │
│ ## Overall Score: 7.2/10                │
│ ### Dimension Scores:                   │
│ - Data Privacy: 8/10                    │
│ - AI Ethics: 6/10                       │
│ ...                                     │
└─────────────────────────────────────────┘
```

### Acceptance Criteria

- [ ] Progress messages appear in chat stream (not composer)
- [ ] Progress bar updates in real-time
- [ ] Ephemeral progress message removed on complete
- [ ] Final results appear as assistant message
- [ ] Works for both parsing and scoring phases
- [ ] Smooth animation (no flickering)
- [ ] Accessible (screen reader announces progress)

---

## Rollback Plan

If integration issues:

1. **Code revert:** Revert upload handler and message handler changes via git
2. **Migration rollback:** Drop new columns if needed
3. **Revert context fallback:** Use only intakeContext (no excerpt fallback)

---

## Exit Criteria

Sprint 2 is complete when:

- [ ] All 5 stories implemented (18.2.1 - 18.2.5)
- [ ] Frontend-backend integration working
- [ ] **Sprint 1B monotonic guards verified** (implementation was in 1B)
- [ ] **Event contract implemented** (events emit from message handler, not upload handler)
- [ ] **Progress-in-chat working** (ephemeral progress messages in chat stream)
- [ ] Context injection fallback tested
- [ ] E2E tests passing
- [ ] SLO met (<3s for file_attached)
- [ ] Code reviewed and approved

**Note:** Event ordering guards were moved to Sprint 1B per code review. Sprint 2 verifies integration only.
