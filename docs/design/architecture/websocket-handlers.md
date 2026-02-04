# Guardian WebSocket Handler Architecture

**Version:** 1.0
**Last Updated:** 2026-02-04
**Status:** Pre-Refactor Documentation (Epic 34 Baseline)
**Purpose:** Document current MessageHandler.ts structure BEFORE decomposition

---

## Overview

Guardian's WebSocket layer handles real-time chat functionality through a handler-based architecture. The main orchestrator (`ChatServer.ts`) delegates to specialized handlers for different concerns.

**Current Handler Structure:**
```
packages/backend/src/infrastructure/websocket/
  ChatServer.ts           (~320 lines) - Slim orchestrator
  handlers/
    ConnectionHandler.ts  - Auth middleware, connect/disconnect
    ConversationHandler.ts - CRUD operations for conversations
    ModeSwitchHandler.ts  - Mode switching logic
    ScoringHandler.ts     - Scoring operations
    QuestionnaireHandler.ts - Questionnaire generation/export
    MessageHandler.ts     (1656 lines) - GOD MODULE - needs decomposition
  context/
    FileContextBuilder.ts - File context for Claude prompts
    ConversationContextBuilder.ts - Conversation history builder
  ToolUseRegistry.ts      - Strategy pattern for tool dispatch
```

---

## Part 1: MessageHandler.ts - Current State (Pre-Refactor)

### File Metrics

| Metric | Value |
|--------|-------|
| Total Lines | 1656 |
| Public Methods | 15 |
| Private Methods | 4 |
| Dependencies | 10+ injected services |
| Concerns | 8+ distinct responsibilities |

### Critical Behaviors Header

The file begins with a comprehensive header (lines 1-35) documenting critical behaviors that MUST be preserved during any refactoring:

```typescript
/**
 * CRITICAL BEHAVIORS TO PRESERVE:
 * 1. Support both `text` and `content` fields (payload.text || payload.content)
 * 2. Rate limiter uses isRateLimited(userId) and getResetTime(userId)
 * 3. conversationId MUST be from payload - NO fallback to socket.conversationId
 * 4. Must have text OR attachments (file-only messages allowed)
 * 5. Attachment validation via findByIdAndConversation
 * 6. Attachment ownership check (file.userId === socket.userId)
 * 7. Placeholder text generation for file-only messages
 * 8. File context building accepts pre-validated enrichedAttachments
 * 9. Tools ONLY enabled in assessment mode (shouldUseTool = mode === 'assessment')
 * 10. Scoring mode bypasses Claude entirely - triggers triggerScoringOnSend instead
 * 11. Consult mode auto-summarizes empty file-only messages
 * 12. Assessment mode does background enrichment for files
 * 13. message_sent event MUST be emitted after saving user message
 * 14. assistant_done suppressed on abort (socket.data.abortRequested === true)
 * 15. Partial response saved to DB even on abort
 */
```

---

### Concern #1: Message Validation

**Lines:** 251-363
**Method:** `validateSendMessage()`

**Responsibilities:**
- Payload object validation
- User authentication check (`socket.userId`)
- ConversationId presence (CRITICAL: no fallback to `socket.conversationId`)
- Text OR attachment requirement (file-only messages allowed)
- Conversation ownership validation
- Rate limit enforcement
- Attachment validation and enrichment

**Key Behavior - Dual Field Support:**
```typescript
// Support both text and content fields (prefer text for new clients)
const messageText = payload.text || payload.content;
```

**Key Behavior - Rate Limiting:**
```typescript
if (this.rateLimiter.isRateLimited(socket.userId)) {
  const resetTime = this.rateLimiter.getResetTime(socket.userId);
  return {
    valid: false,
    error: {
      event: 'send_message',
      message: `Rate limit exceeded. Please wait ${resetTime} seconds...`,
      code: 'RATE_LIMIT_EXCEEDED',
    },
  };
}
```

**TIMING Instrumentation (Lines 256, 354-355):**
```typescript
console.log(`[TIMING] MessageHandler validateSendMessage START: ${validateStartTime} ...`);
console.log(`[TIMING] MessageHandler validateSendMessage END: ${validateEndTime} (duration: ${...}ms, valid: true)`);
```

---

### Concern #2: Attachment Validation & Race Condition Handling

**Lines:** 381-530
**Methods:** `validateAndEnrichAttachments()`, `waitForFileRecords()`

**Responsibilities:**
- Wait for file records to exist in DB (race condition with `file_attached` event)
- Validate file exists in conversation via `findByIdAndConversation`
- Verify file ownership (`file.userId === socket.userId`)
- Enrich attachments with server-side metadata (never trust client)
- Emit `file_processing_error` for missing files after retry

**Race Condition Handling (Story 31.2):**
```typescript
async waitForFileRecords(
  fileIds: string[],
  maxWaitMs: number = 2000,   // Max wait time
  intervalMs: number = 100    // Polling interval
): Promise<{ found: string[]; missing: string[] }>
```

This uses heuristic polling because `send_message` can arrive before `file_attached` completes DB insert.

**Optimization to Preserve:**
- Polling with configurable timeout prevents indefinite waits
- Returns both `found` and `missing` arrays for granular error handling
- Emits `file_processing_error` event (not generic error) for better UX

---

### Concern #3: File Context Building

**Lines:** 561-592
**Method:** `buildFileContext()`

**Responsibilities:**
- Build text context from uploaded files for Claude prompts
- Support Vision API (returns `imageBlocks` for image files)
- Mode-specific behavior (Vision enabled for consult/assessment, not scoring)
- Scope to specific files or all conversation files

**Returns:**
```typescript
interface FileContextResult {
  textContext: string;           // Text extracted from documents
  imageBlocks: ImageContentBlock[]; // Vision API content blocks
}
```

**TIMING Instrumentation (Lines 567, 588-589):**
```typescript
console.log(`[TIMING] MessageHandler buildFileContext START: ${buildContextStartTime} ...`);
console.log(`[TIMING] MessageHandler buildFileContext END: ${buildContextEndTime} (duration: ${...}ms, textContextLength: ${...}, imageBlocksCount: ${...})`);
```

---

### Concern #4: Mode-Specific Routing

**Lines:** 608-685
**Methods:** `getModeConfig()`, `shouldBypassClaude()`, `shouldAutoSummarize()`

**Mode Configuration:**

| Mode | Tools | Auto-Summarize | Background Enrich | Bypass Claude |
|------|-------|----------------|-------------------|---------------|
| **consult** | Yes (web_search) | Yes | No | No |
| **assessment** | Yes (questionnaire_ready) | No | Yes | No |
| **scoring** | No | No | No | Yes (trigger scoring) |

**Key Behavior - Tool Enablement (Epic 33):**
```typescript
getModeConfig(mode: string): ModeConfig {
  switch (mode) {
    case 'assessment':
      return { enableTools: true, ... };  // questionnaire_ready tool
    case 'scoring':
      return { enableTools: false, bypassClaude: true, ... };
    case 'consult':
    default:
      return { enableTools: true, ... };  // web_search tool (Epic 33)
  }
}
```

**Scoring Mode Bypass:**
When `bypassClaude: true` AND message has attachments, MessageHandler does NOT call Claude. Instead, ChatServer routes directly to `ScoringHandler.triggerScoringOnSend()`.

---

### Concern #5: Claude Streaming

**Lines:** 714-891
**Method:** `streamClaudeResponse()`

**Responsibilities:**
- Reset abort flag before streaming
- Emit `assistant_stream_start` event
- Stream chunks via async iterator
- Check abort inside loop (`socket.data.abortRequested`)
- Capture tool use blocks from final chunk
- Capture `stopReason` from Claude API
- Save message to DB (even partial on abort)
- Emit `assistant_done` (suppressed on abort)
- Handle tool loop for consult mode

**Key Streaming Pattern:**
```typescript
for await (const chunk of this.claudeClient.streamMessage(messages, claudeOptions, imageBlocks)) {
  // CRITICAL: Check if stream was aborted by user
  if (socket.data.abortRequested) {
    wasAborted = true;
    break;
  }

  if (!chunk.isComplete && chunk.content) {
    fullResponse += chunk.content;
    socket.emit('assistant_token', { conversationId, token: chunk.content });
  }

  // Capture tool use and stop reason from final chunk
  if (chunk.isComplete) {
    if (chunk.toolUse) toolUseBlocks = chunk.toolUse;
    if (chunk.stopReason) stopReason = chunk.stopReason;
  }
}
```

**Abort Handling Critical Behavior:**
```typescript
// CRITICAL: Only emit assistant_done if NOT aborted
if (!wasAborted) {
  socket.emit('assistant_done', { messageId: savedMessageId, ... });
} else {
  console.log(`[MessageHandler] Stream aborted - partial response saved (${fullResponse.length} chars)`);
}
```

---

### Concern #6: Consult Mode Tool Loop (Epic 33 V2)

**Lines:** 917-1222
**Methods:** `executeConsultToolLoop()`, `buildAugmentedMessages()`

**This is the most complex logic in the file.**

**Constants:**
```typescript
const MAX_TOOL_ITERATIONS = 3;  // Maximum tool loops per user query
```

**Flow:**
1. Claude responds with `stopReason: 'tool_use'`
2. Emit `tool_status: 'searching'` for UI feedback
3. Execute tools via `ToolUseRegistry.dispatch()`
4. Build `tool_result` blocks
5. Call `claudeClient.continueWithToolResult()` for second stream
6. If Claude wants more tools AND iteration < MAX, loop
7. If iteration > MAX, send `is_error: true` to force conclusion
8. Save ONLY the final message to database
9. Emit `tool_status: 'idle'`

**Graceful Degradation Pattern (is_error):**
```typescript
if (iteration > MAX_TOOL_ITERATIONS) {
  // Build error results for all pending tool calls
  const errorResults: ToolResultBlock[] = currentToolUseBlocks.map(tu => ({
    type: 'tool_result' as const,
    tool_use_id: tu.id,
    content: 'Search limit reached for this query. Please provide your best answer based on the information gathered so far.',
    is_error: true,  // CRITICAL: Forces Claude to conclude gracefully
  }));

  // Final continuation WITHOUT tools - forces Claude to conclude
  ...
}
```

**Multi-Iteration Context Building:**
```typescript
private buildAugmentedMessages(
  originalMessages: ClaudeMessage[],
  accumulatedResponses: string[],
  accumulatedToolSummaries: string[]
): ClaudeMessage[]
```

This appends context from previous iterations so Claude knows what it already searched.

**Tool Loop Gating (5 conditions must ALL be true):**
```typescript
const shouldExecuteToolLoop =
  options.mode === 'consult' &&           // Only consult mode
  options.source === 'user_input' &&      // Not auto_summarize
  stopReason === 'tool_use' &&            // Claude wants tools
  toolUseBlocks.length > 0 &&             // Has tool calls
  this.toolRegistry &&                     // Registry configured
  !wasAborted;                            // Not aborted
```

---

### Concern #7: User Message Saving

**Lines:** 1238-1264
**Method:** `saveUserMessageAndEmit()`

**Responsibilities:**
- Save user message to database
- Emit `message_sent` event (CRITICAL - must happen after save)

```typescript
async saveUserMessageAndEmit(...): Promise<{ messageId: string }> {
  const message = await this.conversationService.sendMessage({
    conversationId,
    role: 'user',
    content: { text: messageText, components },
    attachments,
  });

  // CRITICAL: Emit message_sent event
  socket.emit('message_sent', {
    messageId: message.id,
    conversationId: message.conversationId,
    timestamp: message.createdAt,
    attachments,
  });

  return { messageId: message.id };
}
```

---

### Concern #8: Background Enrichment (Assessment Mode)

**Lines:** 1275-1352
**Method:** `enrichInBackground()`

**Responsibilities:**
- Run after immediate response (fire-and-forget)
- Use `tryStartParsing()` for idempotency (prevents duplicate processing)
- Retrieve file from storage
- Parse with intake document parser
- Store enriched context (vendorName, solutionName, claims, etc.)
- Update `parseStatus` column

**Idempotency Pattern:**
```typescript
const started = await this.fileRepository.tryStartParsing(fileId);
if (!started) {
  console.log(`[MessageHandler] File ${fileId} already being processed, skipping`);
  continue;
}
```

**MIME Type Mapping:**
```typescript
const MIME_TYPE_MAP: Record<string, ValidatedDocumentType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
};
```

---

### Concern #9: Title Generation

**Lines:** 1377-1478
**Method:** `generateTitleIfNeeded()`

**Responsibilities:**
- LLM-based title generation after Q&A exchanges
- Mode-aware triggers (different message counts per mode)
- Guard against manually edited titles
- Guard against non-placeholder titles
- Vendor info update at message 5 (assessment mode)

**Title Generation Triggers:**

| Mode | Trigger | Message Count |
|------|---------|---------------|
| Consult | First exchange | 2 (user + assistant) |
| Assessment | First exchange | 3 (preamble + user + assistant) |
| Assessment | Vendor info | 5 (after vendor details) |
| Scoring | Never | Titles come from filename |

**Guards (6 total):**
1. TitleGenerationService not configured - skip
2. Scoring mode - skip (titles from filename)
3. Invalid message count for mode - skip
4. Conversation not found - skip
5. Title manually edited - skip
6. Title already set (not placeholder) - skip (except vendor update)

---

### Concern #10: Auto-Summarize (Consult Mode)

**Lines:** 1491-1583
**Method:** `autoSummarizeDocuments()`

**Responsibilities:**
- Generate summary for file-only messages in consult mode
- Build file context scoped to specific files
- Stream Claude response with summarization prompt
- Save assistant response

**Summarization Prompt Pattern (lines 1594-1607):**
```typescript
private buildAutoSummarizePrompt(fileLabel: string): string {
  return `You are Guardian, an AI assistant helping healthcare organizations assess AI vendors.

The user has uploaded ${fileLabel} and wants to understand its contents.

Please provide a helpful summary that:
1. Identifies what type of document this is (security whitepaper, compliance cert, product doc, questionnaire, etc.)
2. Highlights key points relevant to AI governance and vendor assessment
3. Notes any security, privacy, or compliance information mentioned
4. Ends with an invitation to ask follow-up questions

Keep the summary concise (3-5 paragraphs) and focus on information relevant to vendor assessment.
If the document appears to be a completed questionnaire, mention that it can be scored in Scoring mode.`;
}
```

---

### Concern #11: Scoring Title Update

**Lines:** 1619-1655
**Method:** `updateScoringTitle()`

**Responsibilities:**
- Set title from uploaded filename in scoring mode
- Truncate while preserving file extension
- Respect manually edited titles

```typescript
async updateScoringTitle(
  socket: IAuthenticatedSocket,
  conversationId: string,
  filename: string
): Promise<void>
```

**Truncation Logic:**
```typescript
const maxTitleLength = 50;
const prefix = 'Scoring: ';
const maxFilenameLength = maxTitleLength - prefix.length;

// Truncate while preserving extension
const lastDot = filename.lastIndexOf('.');
const extension = lastDot > 0 ? filename.slice(lastDot) : '';
const baseName = lastDot > 0 ? filename.slice(0, lastDot) : filename;
```

---

## Part 2: ChatServer.ts Integration

**Lines:** 322 total (slim orchestrator)

### Dependency Injection (Constructor)

MessageHandler receives 10 injected dependencies:
```typescript
this.messageHandler = new MessageHandler(
  conversationService,    // Conversation CRUD
  fileRepository,         // File database operations
  rateLimiter,           // Rate limit enforcement
  fileContextBuilder,    // File context for Claude
  claudeClient,          // Claude API client
  fileStorage,           // S3/storage backend
  intakeParser,          // Document parsing
  titleGenerationService, // LLM title generation
  this.toolRegistry      // Tool dispatch registry
);
```

### Event Routing (setupNamespace)

ChatServer routes `send_message` to a private orchestration method:
```typescript
socket.on('send_message', async (payload: SendMessagePayload) => {
  try {
    await this.handleSendMessage(socket, payload);
  } catch (error) {
    socket.emit('error', { event: 'send_message', message: sanitizeErrorForClient(error, '...') });
  }
});
```

### handleSendMessage Orchestration Flow (Lines 216-309)

```
Step 1: Validate (messageHandler.validateSendMessage)
Step 2: Save user message (messageHandler.saveUserMessageAndEmit)
        - Skip for regenerate requests
Step 3: Get context (contextBuilder.build)
Step 4: Check scoring mode bypass
        - If scoring + attachments -> scoringHandler.triggerScoringOnSend()
Step 5: Check auto-summarize
        - If consult + no text + attachments -> messageHandler.autoSummarizeDocuments()
Step 6: Build enhanced prompt with file context
        - Pass mode for Vision API gating
Step 7: Stream Claude response
        - Pass mode-specific tools
        - Pass mode and source for tool loop gating
Step 8: Post-streaming operations (if not aborted)
        - Dispatch any tool_use blocks via ToolUseRegistry
        - Background enrichment (assessment mode)
        - Title generation
```

### Tool Configuration in ChatServer

```typescript
// Epic 33: Use mode-specific tool arrays
const tools = modeConfig.enableTools
  ? (mode === 'consult'
      ? (this.webSearchEnabled ? consultModeTools : undefined)
      : assessmentModeTools)
  : undefined;
```

**Important:** `consultModeTools` only passed if `webSearchEnabled` (Jina client configured).

---

## Part 3: Optimizations to Preserve

### 1. TIMING Instrumentation

Found in multiple methods for performance monitoring:
- `validateSendMessage()` - START/END timing
- `buildFileContext()` - START/END timing with context metrics

**Pattern:**
```typescript
const startTime = Date.now();
console.log(`[TIMING] MessageHandler methodName START: ${startTime} (...)`);
// ... work ...
const endTime = Date.now();
console.log(`[TIMING] MessageHandler methodName END: ${endTime} (duration: ${endTime - startTime}ms, ...)`);
```

### 2. Race Condition Polling (waitForFileRecords)

**Purpose:** Handle race between `send_message` and `file_attached` events.
**Implementation:** Heuristic polling with configurable timeout (2000ms) and interval (100ms).
**Must Preserve:** Prevents message rejection when file DB insert is slightly delayed.

### 3. Idempotency Check (tryStartParsing)

**Purpose:** Prevent duplicate file processing in background enrichment.
**Implementation:** Uses `parseStatus` column state machine (pending -> in_progress).
**Must Preserve:** Prevents wasted compute on concurrent enrichment attempts.

### 4. Tool Loop Max Iterations

**Purpose:** Prevent infinite tool loops in consult mode.
**Implementation:** `MAX_TOOL_ITERATIONS = 3` with `is_error: true` graceful degradation.
**Must Preserve:** Forces Claude to conclude with available information.

### 5. Abort Handling in Streaming

**Purpose:** Clean abort without losing partial work.
**Implementation:** Check `socket.data.abortRequested` inside async iterator loop.
**Must Preserve:** Partial response saved, `assistant_done` suppressed.

### 6. Context Accumulation in Multi-Search

**Purpose:** Give Claude awareness of previous search iterations.
**Implementation:** `buildAugmentedMessages()` appends iteration summaries.
**Must Preserve:** Enables coherent multi-search without repeating queries.

---

## Part 4: Proposed Decomposition (Epic 34)

Based on the 11 concerns identified, MessageHandler should be decomposed into:

| New Handler/Service | Concerns | Estimated Lines |
|---------------------|----------|-----------------|
| `MessageValidationService` | #1, #2 | ~280 |
| `FileContextService` | #3 | ~60 |
| `ModeRoutingService` | #4 | ~80 |
| `ClaudeStreamingHandler` | #5 | ~180 |
| `ConsultToolLoopHandler` | #6 | ~310 |
| `UserMessageService` | #7 | ~30 |
| `BackgroundEnrichmentService` | #8 | ~80 |
| `TitleGenerationHandler` | #9 | ~105 |
| `AutoSummarizeHandler` | #10 | ~95 |
| `ScoringTitleHandler` | #11 | ~40 |

**Total:** ~1260 lines distributed across 10 focused modules.

**Remaining in MessageHandler:** Orchestration facade (~100 lines) that coordinates the above.

---

## Part 5: Testing Considerations

### Current Test Coverage (Estimate)

The MessageHandler likely has tests in:
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts`

### Critical Test Scenarios to Preserve

1. **Dual field support:** Both `text` and `content` fields accepted
2. **Rate limiting:** Returns correct error with reset time
3. **No conversationId fallback:** Must fail if not in payload
4. **File-only messages:** Text OR attachments required, not both
5. **Attachment ownership:** Cross-user file access blocked
6. **Race condition handling:** waitForFileRecords polling works
7. **Abort handling:** Partial response saved, assistant_done suppressed
8. **Tool loop max iterations:** is_error sent at iteration 4
9. **Mode-specific tools:** consult gets web_search, assessment gets questionnaire_ready
10. **Scoring bypass:** No Claude call when scoring + attachments

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-04 | Initial documentation of MessageHandler.ts pre-refactor state for Epic 34 baseline |

---

**This document serves as the baseline for Epic 34 refactoring.** All 15 critical behaviors in the header comment MUST be preserved. All optimizations (timing, polling, idempotency, abort handling) MUST be carried forward.
