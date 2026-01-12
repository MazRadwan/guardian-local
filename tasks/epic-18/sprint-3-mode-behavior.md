# Sprint 3: Mode-Specific Behavior

**Track:** Features
**Stories:** 18.3.1 - 18.3.4
**Estimated Effort:** 3-4 hours
**Parallel With:** None
**Dependencies:** Sprint 2 (Integration complete)
**Agent:** `frontend-agent` + `backend-agent`

---

## Context

This sprint implements mode-specific behavior for the fast attach + trigger-on-send pattern:
1. **Consult mode:** Immediate messaging with text excerpt (Q&A about documents)
2. **Assessment mode:** Excerpt-first response with background enrichment
3. **Scoring mode:** Trigger parse+score on send, progress shown in chat

**Key decisions from Sprint 0:**
- **D4:** Processing triggers on user Send, NOT on upload (trigger-on-send)
- **Mode behavior:** Assessment/Consult respond immediately using excerpt; Scoring shows progress in chat

### Mode-Specific Behavior Summary

| Mode | On Attach | On Send | Response Timing |
|------|-----------|---------|-----------------|
| **Consult** | Fast (~3s) | Inject excerpt → respond | Immediate |
| **Assessment** | Fast (~3s) | Inject excerpt → respond → background enrichment | Immediate |
| **Scoring** | Fast (~3s) | Trigger parse → score → emit progress | ~2min (visible progress in chat) |

---

## Prerequisites

Before starting:

- [ ] Sprint 2 complete (fast attach + trigger-on-send working end-to-end)
- [ ] Progress-in-chat UX implemented (Story 18.2.5)

---

## Feature Flag Strategy

**Goal:** Allow gradual rollout and safe rollback to auto-trigger behavior.

### Feature Flags (Optional - For Gradual Rollout)

```typescript
// packages/backend/src/config/features.ts
// NOTE: Feature flags are OPTIONAL for gradual rollout during development.
// After full rollout, these can be removed - trigger-on-send is the only behavior.

export const FEATURE_FLAGS = {
  // Master switch for trigger-on-send behavior (default: true after rollout)
  TRIGGER_ON_SEND: process.env.FEATURE_TRIGGER_ON_SEND !== 'false',

  // Per-mode overrides (for gradual rollout, all default to true)
  TRIGGER_ON_SEND_ASSESSMENT: process.env.FEATURE_TRIGGER_ON_SEND_ASSESSMENT !== 'false',
  TRIGGER_ON_SEND_CONSULT: process.env.FEATURE_TRIGGER_ON_SEND_CONSULT !== 'false',
  TRIGGER_ON_SEND_SCORING: process.env.FEATURE_TRIGGER_ON_SEND_SCORING !== 'false',
};

export function shouldTriggerOnSend(mode: ConversationMode): boolean {
  if (!FEATURE_FLAGS.TRIGGER_ON_SEND) {
    return false;  // Escape hatch only - not expected to be used
  }

  switch (mode) {
    case 'assessment':
      return FEATURE_FLAGS.TRIGGER_ON_SEND_ASSESSMENT;
    case 'consult':
      return FEATURE_FLAGS.TRIGGER_ON_SEND_CONSULT;
    case 'scoring':
      return FEATURE_FLAGS.TRIGGER_ON_SEND_SCORING;
    default:
      return true;  // Default to trigger-on-send
  }
}
```

### Rollout Strategy

Trigger-on-send is the only behavior. No backwards compatibility with auto-trigger.

| Phase | Config | Behavior |
|-------|--------|----------|
| **Development** | All flags default to `true` | Trigger-on-send for all modes |
| **Production** | Remove flags entirely | Trigger-on-send hardcoded |

### Backend Usage

```typescript
// In DocumentUploadController.processUpload()
// Trigger-on-send is the ONLY behavior - no legacy path

// Store file + excerpt, emit file_attached, STOP
// Parsing/scoring happens when user sends message (ChatServer.handleMessage)
await this.storeAndExtract(file, conversationId);
socket.emit('file_attached', { uploadId, fileId, hasExcerpt: true });
// END - no parsing here
```

### Frontend Compatibility

```typescript
// In useMultiFileUpload.ts
// Frontend expects file_attached event from backend

// No legacy fallback needed - trigger-on-send is the only behavior
// If file_attached doesn't arrive, it's an error (not legacy)

useEffect(() => {
  const unsubscribe = wsAdapter.subscribeFileAttached((event: FileAttachedEvent) => {
    if (event.uploadId === uploadId) {
      setFiles(prev => prev.map(f =>
        f.uploadId === uploadId
          ? { ...f, stage: 'attached', fileId: event.fileId }
          : f
      ));
    }
  });

  return unsubscribe;
}, [uploadId, wsAdapter]);
```

### Acceptance Criteria

- [ ] Trigger-on-send is the only behavior (no auto-trigger)
- [ ] Upload handler ends at `file_attached` (no parsing)
- [ ] Frontend expects `file_attached` event (no legacy fallback)
- [ ] Feature flags optional for dev testing only

---

## Story 18.3.1: Consult Mode - Immediate Messaging

**Goal:** Allow users to ask questions about attached documents immediately after file attaches.

**Clarification:** Consult mode DOES support file uploads. Users can attach documents and ask questions about them (Q&A style), similar to ChatGPT's file attachment feature.

**Files:**
- `apps/web/src/components/chat/Composer.tsx`
- `apps/web/src/hooks/useMultiFileUpload.ts`

### Current Behavior (Problem)

```typescript
// Current: Send blocked until all files are 'complete' (~2+ minutes)
// User cannot ask questions about the document until enrichment finishes
const canSend = files.every(f => f.state === 'complete' || f.state === 'error');
```

### New Behavior (Consult Mode)

```typescript
/**
 * Epic 18: Mode-aware send enablement
 *
 * Consult mode: Can send when files are 'attached' (don't wait for enrichment)
 * Uses text excerpt for immediate context injection
 */

const canSendWithAttachments = useMemo(() => {
  if (files.length === 0) return true;

  const mode = currentMode; // From context or props

  if (mode === 'consult' || mode === 'assessment') {
    // Can send when all files are at least 'attached'
    // Uses stage field (not state) per Sprint 1B
    return files.every(f =>
      f.stage === 'attached' ||
      f.stage === 'parsing' ||
      f.stage === 'complete'
    );
  }

  // Scoring mode: handled in Story 18.3.3
  if (mode === 'scoring') {
    // For scoring, send triggers parse+score (files can be 'attached')
    return files.every(f =>
      f.stage === 'attached' ||
      f.stage === 'complete'
    );
  }

  return files.every(f => f.stage === 'complete');
}, [files, currentMode]);
```

### User Experience

```
Consult Mode Flow (Q&A about documents):
1. User selects file (vendor documentation, security policy, etc.)
2. [0s] File stage: 'uploading'
3. [~3s] File stage: 'attached' → Send button ENABLED, chip shows "Attached ✓"
4. User types question: "What encryption standards does this vendor support?"
5. User clicks Send → Composer clears immediately
6. ChatServer injects text excerpt → Claude responds with answer

No waiting for enrichment. User gets immediate response.
```

### Backend Context Injection

When user sends message in Consult mode:
```typescript
// In ChatServer.handleMessage()
if (mode === 'consult' && attachedFiles.length > 0) {
  // Inject text excerpt (from Sprint 2 buildFileContext)
  const fileContext = await this.buildFileContext(conversationId);

  // Claude sees: user question + text excerpt
  const response = await this.claudeService.chat({
    messages: [...history, { role: 'user', content: message }],
    systemPrompt: `${basePrompt}\n\n${fileContext}`,  // Excerpt injected
  });

  // Emit response immediately
  socket.emit('message', { role: 'assistant', content: response });
}
```

### Graceful Degradation

When user sends message before enrichment:
- ChatServer uses `textExcerpt` for context (from Sprint 2)
- Claude sees raw text, not structured analysis
- Response quality is still good for Q&A (just not as structured)

### Acceptance Criteria

- [ ] Send enabled when files are 'attached' in consult mode
- [ ] **Uses `stage` field** (not `state`)
- [ ] Context injection uses excerpt (from Sprint 2)
- [ ] Response returns immediately (no waiting for enrichment)
- [ ] Send works correctly (message delivered)
- [ ] Unit tests for send enablement logic

---

## Story 18.3.2: Assessment Mode - Excerpt-First with Background Enrichment

**Goal:** Assessment mode responds immediately using text excerpt, then enriches in background for follow-up questions.

**Files:**
- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
- `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts`
- `packages/backend/src/infrastructure/ai/DocumentParserService.ts`

### Assessment Mode Flow

```
User uploads vendor documentation
    ↓
[~3s] file_attached → "Attached ✓"
    ↓
User clicks Send (with or without message)
    ↓
ChatServer responds IMMEDIATELY using text excerpt:
  "I've received the vendor documentation for [VendorX].
   From the document, I can see it's a cloud-based solution
   focusing on patient data management..."
    ↓
Background enrichment starts (non-blocking):
  - Extract vendor name, solution type, features
  - Generate suggested questions
  - Store intakeContext for follow-up
    ↓
Follow-up questions use enriched context (if ready)
```

### Backend Implementation

```typescript
// In ChatServer.handleMessage()
if (mode === 'assessment' && attachedFiles.length > 0) {
  // IMMEDIATE: Respond using text excerpt
  const fileContext = await this.buildFileContext(conversationId);

  // Generate immediate response
  const immediateResponse = await this.claudeService.chat({
    messages: [...history, { role: 'user', content: message }],
    systemPrompt: `${assessmentPrompt}\n\n${fileContext}`,
  });

  // Emit response FIRST (user sees immediate feedback)
  socket.emit('message', { role: 'assistant', content: immediateResponse });

  // BACKGROUND: Start enrichment (non-blocking)
  this.enrichInBackground(conversationId, attachedFiles).catch(err => {
    console.error('[ChatServer] Background enrichment failed:', err);
    // Non-fatal - follow-up questions still work with excerpt
  });
}

private async enrichInBackground(
  conversationId: string,
  fileIds: string[]
): Promise<void> {
  for (const fileId of fileIds) {
    try {
      // Check if file already has intake context
      const existingContext = await this.fileRepository.findByConversationWithContext(conversationId);
      const alreadyEnriched = existingContext.some(f => f.id === fileId && f.intakeContext !== null);
      if (alreadyEnriched) continue;

      // Use idempotency check (parseStatus column from Sprint 1A)
      const started = await this.fileRepository.tryStartParsing(fileId);
      if (!started) continue;  // Already being processed

      // Get file record for storage path
      const file = await this.fileRepository.findById(fileId);
      if (!file) continue;

      // Parse with lighter prompt for assessment mode
      // NOTE: IntakeParseOptions interface may need extension for 'lightMode'
      // Alternative: Use a separate lighter prompt inline
      const result = await this.intakeParser.parseForContext(
        await this.fileStorage.retrieve(file.storagePath),
        { filename: file.filename, mimeType: file.mimeType },
        { conversationId }
        // NOTE: lightMode not yet in interface - either extend IntakeParseOptions
        // or use conditional prompt selection in DocumentParserService
      );

      await this.fileRepository.updateIntakeContext(file.id, result.context, result.gapCategories);
      await this.fileRepository.updateParseStatus(file.id, 'completed');
    } catch (err) {
      await this.fileRepository.updateParseStatus(fileId, 'failed');
      // Continue with other files
    }
  }
}

/**
 * NOTE: To implement lightMode, extend IntakeParseOptions in IIntakeDocumentParser:
 *
 * interface IntakeParseOptions {
 *   conversationId?: string;
 *   focusCategories?: string[];
 *   lightMode?: boolean;  // NEW: Skip suggested questions, gap analysis
 * }
 *
 * Then in DocumentParserService, select prompt based on lightMode.
 */
```

### Light Enrichment (Background)

Assessment mode uses lighter enrichment than Consult:

| Aspect | Consult | Assessment |
|--------|---------|------------|
| Immediate response | Yes (excerpt) | Yes (excerpt) |
| Background enrichment | Full | Light |
| Suggested questions | Yes | Optional |
| Gap analysis | Yes | No |

```typescript
// Light mode for assessment enrichment
const LIGHT_INTAKE_PROMPT = `
Extract basic information from this document:
- Vendor name
- Solution/product name
- Solution type (e.g., SaaS, on-premise, hybrid)
- Industry focus
- Key features mentioned

Return JSON. Do not generate suggested questions or perform gap analysis.
`;
```

### User Experience

```
Assessment Mode - Immediate Response:

[User attaches vendor-security-whitepaper.pdf]
[User clicks Send: "Tell me about this vendor"]

Guardian (immediately, ~3s):
  "I've received the vendor security documentation. Based on the document,
   this appears to be from CloudSec Solutions, offering a cloud-native
   security platform. Key highlights I found:

   - SOC 2 Type II certified
   - AES-256 encryption at rest
   - Multi-tenant architecture with data isolation

   Would you like me to walk through the Guardian assessment framework,
   or do you have specific questions about this vendor?"

[Background: enrichment runs silently, stores intakeContext]

[Follow-up question uses enriched context if ready, or excerpt if not]
```

### Acceptance Criteria

- [ ] Assessment mode responds immediately using excerpt
- [ ] Background enrichment runs non-blocking
- [ ] **Uses parseStatus idempotency** (from Sprint 1A)
- [ ] Light enrichment prompt (skip suggested questions, gap analysis)
- [ ] Follow-up questions work (uses enriched context or fallback to excerpt)
- [ ] Enrichment failures don't break conversation
- [ ] Unit tests for background enrichment

---

## Story 18.3.3: Scoring Mode - Trigger-on-Send with Progress in Chat

**Goal:** Scoring mode uses fast attach + trigger-on-send. User sends to trigger parsing and scoring, with progress shown in chat stream.

**Decision (D4):** Processing triggers on user Send, NOT on upload completion.

### Scoring Mode Flow

```
User uploads completed questionnaire
    ↓
[~3s] file_attached → "Attached ✓", chip ready, composer enabled
    ↓
User optionally types message: "Please score this questionnaire"
User clicks Send → Composer clears immediately
    ↓
Message handler triggers parse + score
Progress shown in CHAT (not composer):
  ⏳ Analyzing questionnaire responses... [███░░░░░░░] 30%
  ⏳ Scoring Data Privacy... [███████░░░] 70%
    ↓
[~2min] Scoring complete → Results appear as assistant message
```

### Frontend Implementation

```typescript
// In Composer - Scoring mode allows send at 'attached'
const canSendWithAttachments = useMemo(() => {
  if (files.length === 0) return true;

  if (mode === 'scoring') {
    // Can send when files are 'attached' (triggers parse+score on send)
    return files.every(f =>
      f.stage === 'attached' ||
      f.stage === 'complete'
    );
  }

  // ... other modes
}, [files, mode]);
```

### Backend Implementation

**IMPORTANT:** Use `scoring_progress` event (existing type) for all parsing/scoring phases. Use `attachments` field on messages (existing schema).

```typescript
// In ChatServer.handleMessage()
if (mode === 'scoring' && attachments && attachments.length > 0) {
  // attachments: MessageAttachment[] from existing message schema
  const fileIds = attachments.map(a => a.fileId);

  // Emit user message first (composer already cleared)
  socket.emit('message', {
    role: 'user',
    content: userMessage,
    attachments,  // Use existing attachments field (MessageAttachment[])
  });

  // Trigger parse + score (with idempotency)
  for (const fileId of fileIds) {
    const file = await this.fileRepository.findById(fileId);
    if (!file) continue;

    // Check if already parsed
    if (file.parseStatus === 'completed') {
      // Already parsed, go straight to scoring
      await this.triggerScoring(file, socket, conversationId);
      continue;
    }

    // Try to start parsing (idempotent)
    const started = await this.fileRepository.tryStartParsing(file.id);
    if (!started) {
      console.log(`[ChatServer] File ${file.id} already being processed`);
      continue;
    }

    // Emit parsing progress (use scoring_progress, not upload_progress)
    socket.emit('scoring_progress', {
      conversationId,
      status: 'parsing',
      progress: 0,
      message: 'Analyzing questionnaire responses...',
    });

    // Parse questionnaire responses
    const parseResult = await this.parseForScoring(file, socket);

    // Emit scoring progress
    await this.scoreWithProgress(parseResult, socket, conversationId);
  }

  // Emit complete (frontend clears progress UI)
  socket.emit('scoring_progress', {
    conversationId,
    status: 'complete',
    progress: 100,
    message: 'Scoring complete',
  });
}

private async scoreWithProgress(
  parseResult: ParseResult,
  socket: Socket,
  conversationId: string
): Promise<void> {
  const dimensions = [
    'Data Privacy & Protection',
    'Security Architecture',
    'AI Ethics & Bias',
    // ... all 10 dimensions
  ];

  for (let i = 0; i < dimensions.length; i++) {
    // Emit progress using scoring_progress (existing event type)
    socket.emit('scoring_progress', {
      conversationId,
      status: 'scoring',
      progress: Math.round(((i + 1) / dimensions.length) * 100),
      message: `Scoring ${dimensions[i]}...`,
      // NOTE: No currentDimension - not in ScoringProgressPayload
    });

    // Score dimension
    await this.scoreDimension(dimensions[i], parseResult, conversationId);
  }

  // Emit scoring_complete with full results (existing event)
  const scoringResults = await this.formatScoringResults(conversationId);
  socket.emit('scoring_complete', {
    conversationId,
    result: scoringResults,
    narrativeReport: this.formatNarrativeReport(scoringResults),
  });
}
```

### User Experience

```
[User attaches questionnaire-responses.xlsx]
[~3s later]
Chip: "📎 questionnaire-responses.xlsx ✓ Attached"
Send button: ENABLED

[User types: "Score this for assessment ABC-123"]
[User clicks Send → Composer clears]

Chat shows:
┌─────────────────────────────────────────────────────────┐
│ 📎 questionnaire-responses.xlsx                         │
│ "Score this for assessment ABC-123"                     │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ ⏳ Analyzing questionnaire responses...                 │
│ ▓▓▓▓▓▓░░░░░░░░░░░░░░ 30%                               │
└─────────────────────────────────────────────────────────┘
                        ↓ (updates in place)
┌─────────────────────────────────────────────────────────┐
│ ⏳ Scoring Security Architecture...                     │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░ 70%                               │
└─────────────────────────────────────────────────────────┘
                        ↓ (progress removed, results appear)
┌─────────────────────────────────────────────────────────┐
│ 🏆 Scoring Complete                                     │
│                                                         │
│ ## Overall Score: 7.2/10                                │
│                                                         │
│ ### Dimension Scores:                                   │
│ - Data Privacy & Protection: 8/10                       │
│ - Security Architecture: 7/10                           │
│ - AI Ethics & Bias: 6/10                                │
│ ...                                                     │
│                                                         │
│ ### Key Strengths:                                      │
│ - Strong encryption practices                           │
│ - SOC 2 compliance                                      │
│                                                         │
│ ### Areas for Improvement:                              │
│ - Limited AI bias documentation                         │
│ - Incident response unclear                             │
└─────────────────────────────────────────────────────────┘
```

### Key Differences from Old Behavior

| Aspect | Old (Auto-Trigger) | New (Trigger-on-Send) |
|--------|-------------------|----------------------|
| Attach speed | ~3s | ~3s (unchanged) |
| Composer block | ~4 minutes | ~3s (clears on attach) |
| User message | Cannot add | Can add with file |
| Progress location | Composer chip | Chat stream |
| Processing trigger | Auto on upload | On user Send |
| User control | None | Full control |

### Acceptance Criteria

- [ ] Scoring mode allows send at 'attached' stage
- [ ] Parse + score triggers on Send (not upload)
- [ ] **Uses parseStatus idempotency** (from Sprint 1A)
- [ ] Progress shown in chat stream (from Sprint 2)
- [ ] User can add optional message with file
- [ ] Composer clears immediately on Send
- [ ] Results appear as assistant message
- [ ] No regression in scoring accuracy

---

## Story 18.3.4: Mode Transition Handling

**Goal:** Handle file state when user switches modes mid-upload.

**Scenario:** User uploads file in consult mode, then switches to scoring mode.

### Edge Cases

| Scenario | Current Stage | User Action | Expected Behavior |
|----------|---------------|-------------|-------------------|
| File uploading | 'uploading' | Switch to scoring | Continue upload, apply scoring rules |
| File attached | 'attached' | Switch to scoring | **Allow send** (trigger-on-send) |
| File complete | 'complete' | Switch to scoring | Allow send (already complete) |
| File attached | 'attached' | Switch to consult | Allow send (consult rules) |

**NOTE:** With trigger-on-send, ALL modes allow send at 'attached' stage. Scoring mode no longer gates until 'complete'.

### Implementation

```typescript
// In Composer.tsx or parent component
const handleModeChange = useCallback((newMode: ConversationMode) => {
  // Update mode context
  setCurrentMode(newMode);

  // Files in flight continue with new mode rules
  // No need to restart uploads - just apply new send rules
}, []);

// Send enablement recalculates when mode changes
const canSend = useMemo(() => {
  // ... existing logic, now uses currentMode
}, [files, currentMode, message]);
```

### Mode Change Warning

```typescript
// Warn user if switching modes with incomplete files
// NOTE: Use 'stage' field (not 'state') per FileState interface
const showModeChangeWarning = useMemo(() => {
  const hasIncompleteFiles = files.some(f =>
    f.stage !== 'complete' && f.stage !== 'error'
  );

  return hasIncompleteFiles;
}, [files]);

// In mode selector
{showModeChangeWarning && (
  <Tooltip content="Files are still processing. Switching modes may affect analysis.">
    <AlertIcon className="text-yellow-500" />
  </Tooltip>
)}
```

### Acceptance Criteria

- [ ] Mode switch during upload doesn't break flow
- [ ] Send rules update immediately on mode change
- [ ] Warning shown for incomplete files
- [ ] No state corruption on mode switch

---

## Testing Strategy

### Unit Tests

| Test | Coverage |
|------|----------|
| Send enablement per mode | **All modes allow send at 'attached'** (trigger-on-send) |
| Light enrichment | Assessment mode uses lighter prompt |
| Mode transition | Stage preserved, rules update |
| `scoring_progress` events | Events have correct `status`, `message`, `progress` |

### Integration Tests

| Test | Coverage |
|------|----------|
| Consult immediate send | Upload → attach → send → excerpt-based response |
| Assessment immediate send | Upload → attach → send → excerpt response + background enrichment |
| **Scoring trigger-on-send** | Upload → attach → send → `scoring_progress` events → results |
| Mode switch mid-upload | Switch consult→scoring, verify rules apply |

### E2E Tests

| Test | Coverage |
|------|----------|
| Full consult flow | Upload → immediate send → Claude responds with excerpt context |
| Full assessment flow | Upload → immediate send → Claude responds → enrichment completes |
| **Full scoring flow** | Upload → attach → send → `scoring_progress` in chat → `scoring_complete` |

**NOTE:** With trigger-on-send, scoring mode NO LONGER gates send until parse complete. User sends at 'attached' stage, then progress appears in chat.

---

## Rollback Plan

If mode-specific issues:

1. **Code revert:** Revert mode-specific changes via git
2. **Simplify:** All modes behave identically (trigger-on-send, no differentiation)

---

## Exit Criteria

Sprint 3 is complete when:

- [ ] All 4 stories implemented (18.3.1 - 18.3.4)
- [ ] **Consult mode:** Immediate Q&A using text excerpt
- [ ] **Assessment mode:** Excerpt-first response + background enrichment
- [ ] **Scoring mode:** Trigger-on-send with progress in chat
- [ ] Mode transitions handled gracefully
- [ ] All modes allow send at 'attached' stage
- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] **Epic 18 feature complete**

### Epic 18 Complete Checklist

- [ ] Sprint 0: Decisions documented (D1-D4)
- [ ] Sprint 1A: Backend events (`file_attached`, `parseStatus`, excerpts)
- [ ] Sprint 1B: Frontend types and state machine (`stage`, monotonic guards)
- [ ] Sprint 2: Integration + trigger-on-send event contract + progress-in-chat
- [ ] Sprint 3: Mode-specific behavior (all modes: trigger-on-send)
- [ ] E2E: Full flow tested for all modes
- [ ] SLO: file_attached < 3s verified
