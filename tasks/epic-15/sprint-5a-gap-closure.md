# Sprint 5a: Gap Closure & Scoring Flow Completion

## Status: Draft (Pending Approval)

**Created:** 2025-01-05
**Last Updated:** 2025-01-05
**Depends On:** Sprint 5 (ChatServer Integration) - IN PROGRESS
**Blocks:** Sprint 6 (E2E Tests)

---

## Context Summary

Sprint 5a addresses critical gaps identified during implementation review that prevent the scoring workflow from functioning end-to-end. These gaps were discovered after Sprint 5 planning but must be resolved before E2E testing in Sprint 6.

### Gap Items Addressed

| # | Gap | Impact | Story |
|---|-----|--------|-------|
| 1 | PDF exports missing assessmentId | BLOCKER | 5a.1 |
| 2 | Word exports missing assessmentId | BLOCKER | 5a.2 |
| 3 | Excel exports missing assessmentId | BLOCKER | 5a.3 |
| 4 | Export tests don't verify assessmentId | Test Gap | 5a.1/2/3 |
| 5 | Upload mode hardcoded to 'intake' | BLOCKER | 5a.4 |
| 6 | No scoring_started event emitted | Contract | 5a.4 |
| 7 | scoring_error lacks error codes | Contract | 5a.4 |
| 8 | Assessment status not checked (not exported) | Security | 5a.4 |
| 9 | No ownership validation | Security | 5a.4 |
| 10 | No confidence floor for parsing | Quality | 5a.4 |
| 11 | No rate-limit/de-dup for re-scoring | Cost | 5a.4 |
| 12 | No welcome message on scoring mode | UX | 5a.5 |
| 13 | showScoringMode tied to session only | UX | 5a.6 |
| 14 | No backend endpoint for assessment status | API | 5a.6 |

### Key Decisions

| Decision | Resolution |
|----------|------------|
| Assessment ID location | Header/footer of all exports (PDF, Word, Excel) |
| Welcome message source | Backend sends via WebSocket on mode switch |
| Scoring trigger | **Auto-trigger** on upload in scoring mode (no manual approval) |
| Scoring mode visibility | Based on user having ANY assessment with status >= 'exported' |
| Hard failures | Short-circuit with clear error codes (see WebSocket Events) |
| Soft issues | Proceed with warnings surfaced in results |
| Re-scoring | Creates new batch (no overwrite), rate-limited |

---

## Optimized Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: PARALLEL KICKOFF (5 agents simultaneously)                            │
│                                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────────┐
│  │ Story 5a.0   │ │ Story 5a.1   │ │ Story 5a.2   │ │ Story 5a.3   │ │ Story 5a.6     │
│  │ Research     │ │ PDF Export   │ │ Word Export  │ │ Excel Export │ │ showScoringMode│
│  │ (Explore)    │ │ AssessmentId │ │ AssessmentId │ │ AssessmentId │ │ Persistence    │
│  │              │ │              │ │              │ │              │ │ (Frontend)     │
│  └──────┬───────┘ └──────────────┘ └──────────────┘ └──────────────┘ └────────────────┘
│         │
└─────────┼───────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: SCORING TRIGGER (Sequential - after 5a.0 completes)                   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Story 5a.4: Scoring Mode Trigger Implementation                        │   │
│  │  - Wire upload mode to scoring flow                                     │   │
│  │  - Assessment status + ownership validation                             │   │
│  │  - Confidence floor + rate limiting                                     │   │
│  │  - WebSocket events with error codes (backend emits)                    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: PARALLEL COMPLETION (2 agents - no file conflicts)                    │
│                                                                                 │
│  ┌───────────────────────────────────┐  ┌───────────────────────────────────┐  │
│  │  Story 5a.5: Welcome Message      │  │  Story 5a.7: Frontend Events      │  │
│  │  (Backend - ChatServer.ts)        │  │  (Frontend - hooks, store, UI)    │  │
│  │  - Send welcome on mode switch    │  │  - Subscribe to scoring events    │  │
│  │                                   │  │  - Show progress/results/errors   │  │
│  └───────────────────────────────────┘  └───────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Optimization Notes:**
- Phase 1 runs **5 agents in parallel** (was 1 sequential + 3 parallel)
- 5a.6 moved to Phase 1 (no dependency on scoring flow)
- 5a.1/2/3 don't need 5a.0 research (simple template changes)
- Phase 3 now runs **2 agents in parallel** (5a.5 backend + 5a.7 frontend)
- 5a.5 and 5a.7 have no file conflicts (different layers)

---

## Story Summary Table

| Story | Name | Phase | Parallel? | ~Lines | Tests? | Agent Type |
|-------|------|-------|-----------|--------|--------|------------|
| **5a.0** | Clarify Scoring Trigger Flow | 1 | **Yes** | 200 | No | `Explore` agent |
| **5a.1** | PDF Export AssessmentId | 1 | **Yes** | 300 | Yes | `chat-backend-agent` |
| **5a.2** | Word Export AssessmentId | 1 | **Yes** | 300 | Yes | `chat-backend-agent` |
| **5a.3** | Excel Export AssessmentId | 1 | **Yes** | 300 | Yes | `chat-backend-agent` |
| **5a.6** | showScoringMode Persistence | 1 | **Yes** | 400 | Yes | `frontend-agent` |
| **5a.4** | Scoring Mode Trigger | 2 | No | 600 | Yes | `chat-backend-agent` |
| **5a.5** | Scoring Mode Welcome Message | 3 | **Yes** | 350 | Yes | `chat-backend-agent` |
| **5a.7** | Frontend Scoring Event Handling | 3 | **Yes** | 400 | Yes | `frontend-agent` |

**Total:** 8 stories, ~2,850 lines
**Phase 1:** 5 parallel agents
**Phase 2:** Sequential (5a.4)
**Phase 3:** 2 parallel agents (5a.5 backend + 5a.7 frontend)

---

## Execution Phases

### Phase 1: Parallel Kickoff (5 Agents)

```
┌─────────────────────────────────────────────────────────────────┐
│  Launch: 5 Task tool calls in ONE message                       │
│                                                                 │
│  Agent 1: Explore agent                                         │
│  → Story 5a.0: Research scoring trigger flow                    │
│                                                                 │
│  Agent 2: chat-backend-agent                                    │
│  → Story 5a.1: PDF Export AssessmentId                          │
│                                                                 │
│  Agent 3: chat-backend-agent                                    │
│  → Story 5a.2: Word Export AssessmentId                         │
│                                                                 │
│  Agent 4: chat-backend-agent                                    │
│  → Story 5a.3: Excel Export AssessmentId                        │
│                                                                 │
│  Agent 5: frontend-agent                                        │
│  → Story 5a.6: showScoringMode Persistence                      │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 2: Scoring Trigger (Sequential)

```
Depends on: 5a.0 research complete
Agent: chat-backend-agent
Story: 5a.4

Note: Can start as soon as 5a.0 completes, doesn't need to wait
for 5a.1/2/3/5a.6. The integration TEST will need exports done,
but the implementation doesn't.
```

### Phase 3: Parallel Completion (2 Agents)

```
┌─────────────────────────────────────────────────────────────────┐
│  Launch: 2 Task tool calls in ONE message                       │
│  Depends on: 5a.4 complete                                      │
│                                                                 │
│  Agent 1: chat-backend-agent                                    │
│  → Story 5a.5: Welcome message on scoring mode switch           │
│                                                                 │
│  Agent 2: frontend-agent                                        │
│  → Story 5a.7: Frontend scoring event handling                  │
│                                                                 │
│  Note: No file conflicts - 5a.5 is backend, 5a.7 is frontend    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Story Details

### Story 5a.0: Clarify Scoring Trigger Flow

**Phase:** 1 | **Parallel:** Yes | **Agent:** `Explore`

#### Overview
Research and document how the scoring flow should work when a user uploads a completed questionnaire in scoring mode. This is a READ-ONLY investigation to produce specs for Story 5a.4.

#### Questions to Answer
1. What happens when user selects 'scoring' mode in ModeSelector?
2. What happens when user uploads a file while in scoring mode?
3. Where does `DocumentParserService.parseForResponses()` get called?
4. How does the parsed assessmentId get matched to an assessment in DB?
5. Where should `ScoringService.score()` be invoked?
6. What WebSocket events should be emitted during scoring?

#### Files to Investigate
- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
- `packages/backend/src/infrastructure/http/DocumentUploadController.ts`
- `packages/backend/src/application/services/ScoringService.ts`
- `packages/backend/src/application/services/DocumentParserService.ts`
- `apps/web/src/hooks/useWebSocket.ts`
- `apps/web/src/components/chat/Composer.tsx` (uploadMode hardcoding)

#### Output
Create `tasks/epic-15/5a.0-scoring-trigger-spec.md` with:
- Current flow diagram
- Identified gaps
- Recommended implementation approach
- WebSocket event sequence

#### Acceptance Criteria
- [ ] Current flow documented
- [ ] Gap analysis complete
- [ ] Implementation spec ready for 5a.4

---

### Story 5a.1: PDF Export AssessmentId

**Phase:** 1 | **Parallel:** Yes | **Agent:** `chat-backend-agent`

#### Overview
Add assessmentId to PDF questionnaire exports so scoring can match uploaded documents to assessments.

#### Files to Modify
| File | Action | Description |
|------|--------|-------------|
| `packages/backend/src/infrastructure/export/templates/questionnaire.html` | MODIFY | Add assessmentId to header |
| `packages/backend/src/infrastructure/export/PDFExporter.ts` | MODIFY | Pass assessmentId to template |
| `packages/backend/__tests__/infrastructure/export/PDFExporter.test.ts` | MODIFY | Add assessmentId tests |

#### Implementation
```html
<!-- In questionnaire.html header -->
<div class="assessment-id-banner">
  <span class="label">GUARDIAN Assessment ID:</span>
  <span class="value">{{assessmentId}}</span>
</div>
```

```typescript
// In PDFExporter.ts
const html = template
  .replace(/{{assessmentId}}/g, escapeHtml(data.assessmentId))
  // ... existing replacements
```

#### Acceptance Criteria
- [ ] PDF header displays "GUARDIAN Assessment ID: {uuid}"
- [ ] AssessmentId styled distinctly (monospace, background)
- [ ] Existing PDF tests pass
- [ ] **NEW:** Test explicitly verifies assessmentId is in output

---

### Story 5a.2: Word Export AssessmentId

**Phase:** 1 | **Parallel:** Yes | **Agent:** `chat-backend-agent`

#### Overview
Add assessmentId to Word questionnaire exports.

#### Files to Modify
| File | Action | Description |
|------|--------|-------------|
| `packages/backend/src/infrastructure/export/WordExporter.ts` | MODIFY | Add assessmentId paragraph to header |
| `packages/backend/__tests__/infrastructure/export/WordExporter.test.ts` | MODIFY | Add assessmentId tests |

#### Implementation
```typescript
// In WordExporter.ts header section
new Paragraph({
  children: [
    new TextRun({ text: 'GUARDIAN Assessment ID: ', bold: true }),
    new TextRun({ text: assessmentId, font: 'Courier New' }),
  ],
  shading: { fill: 'F3F4F6' },
}),
```

#### Acceptance Criteria
- [ ] Word doc header displays Assessment ID
- [ ] Monospace font for ID value
- [ ] Existing Word tests pass
- [ ] **NEW:** Test explicitly verifies assessmentId is in output

---

### Story 5a.3: Excel Export AssessmentId

**Phase:** 1 | **Parallel:** Yes | **Agent:** `chat-backend-agent`

#### Overview
Add assessmentId to Excel questionnaire exports in the metadata sheet.

#### Files to Modify
| File | Action | Description |
|------|--------|-------------|
| `packages/backend/src/infrastructure/export/ExcelExporter.ts` | MODIFY | Add assessmentId row to metadata |
| `packages/backend/__tests__/infrastructure/export/ExcelExporter.test.ts` | MODIFY | Add assessmentId tests |

#### Implementation
```typescript
// In ExcelExporter.ts metadata sheet
const metadataRows = [
  ['GUARDIAN Assessment ID', assessmentId], // FIRST ROW
  ['Vendor', vendorName],
  // ... existing rows
];
```

#### Acceptance Criteria
- [ ] Excel metadata sheet includes Assessment ID as first data row
- [ ] Cell formatted with monospace font
- [ ] Existing Excel tests pass
- [ ] **NEW:** Test explicitly verifies assessmentId is in output

---

### Story 5a.4: Scoring Mode Trigger Implementation

**Phase:** 2 | **Parallel:** No | **Agent:** `chat-backend-agent`

#### Overview
Wire file upload in scoring mode to automatically trigger the ScoringService with proper validation and error handling.

#### Dependencies
- **Depends on:** 5a.0 (research spec)
- **Blocks:** 5a.5

#### Files to Modify
| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/components/chat/Composer.tsx` | MODIFY | Pass mode to upload |
| `packages/backend/src/infrastructure/websocket/ChatServer.ts` | MODIFY | Handle scoring mode uploads |
| `packages/backend/src/infrastructure/http/DocumentUploadController.ts` | MODIFY | Route scoring uploads correctly |
| `packages/backend/__tests__/integration/scoring-trigger.test.ts` | CREATE | Integration test |

#### Validation Gates (Security + Quality)

```typescript
// All validations performed BEFORE calling ScoringService

interface ScoringValidation {
  // 1. Assessment exists
  assessmentExists: boolean;

  // 2. Assessment owned by requesting user
  isOwner: boolean;

  // 3. Assessment has been exported (status >= 'exported')
  isExported: boolean;

  // 4. Parse confidence above floor (0.7)
  parseConfidence: number;
  confidenceAcceptable: boolean;

  // 5. Rate limit check (max 5 per assessment per day)
  rateLimitOk: boolean;

  // 6. File hash de-dup (same file not scored within 1 hour)
  notDuplicate: boolean;
}
```

#### Flow
```
1. User in scoring mode uploads completed questionnaire
2. Composer passes mode='scoring' to upload
3. DocumentUploadController receives file with mode='scoring'
4. DocumentParserService.parseForResponses() extracts Q&A + assessmentId + confidence
5. Validation gate:
   a. Check assessmentId exists in DB → ASSESSMENT_NOT_FOUND
   b. Check assessment.userId === user.id → UNAUTHORIZED_ASSESSMENT
   c. Check assessment.status >= 'exported' → ASSESSMENT_NOT_EXPORTED
   d. Check parseConfidence >= 0.7 → PARSE_CONFIDENCE_TOO_LOW
   e. Check rate limit (5/day per assessment) → RATE_LIMITED
   f. Check file hash not duplicate (1hr window) → DUPLICATE_FILE
6. If all pass: Call ScoringService.score({ assessmentId, fileId, responses })
7. Emit WebSocket events: scoring_started → scoring_progress → scoring_complete
8. If any fail: Emit scoring_error with appropriate code
```

#### WebSocket Events

```typescript
// === SUCCESS EVENTS ===

interface ScoringStartedEvent {
  event: 'scoring_started';
  assessmentId: string;
  fileId: string;
  parseConfidence: number;  // 0.0 - 1.0
}

interface ScoringProgressEvent {
  event: 'scoring_progress';
  status: 'parsing' | 'validating' | 'scoring' | 'storing';
  message: string;
  progress: number; // 0-100
}

interface ScoringCompleteEvent {
  event: 'scoring_complete';
  assessmentId: string;
  batchId: string;
  result: ScoringResultSummary;
}

// === ERROR EVENTS ===

interface ScoringErrorEvent {
  event: 'scoring_error';
  error: string;  // Human-readable message
  code: ScoringErrorCode;
  details?: Record<string, unknown>;  // Additional context
}

type ScoringErrorCode =
  | 'ASSESSMENT_NOT_FOUND'       // Assessment ID not in DB
  | 'UNAUTHORIZED_ASSESSMENT'    // User doesn't own this assessment
  | 'ASSESSMENT_NOT_EXPORTED'    // Assessment not yet sent to vendor
  | 'PARSE_FAILED'               // Could not parse document at all
  | 'PARSE_CONFIDENCE_TOO_LOW'   // Confidence below 0.7 floor
  | 'RATE_LIMITED'               // Too many scoring attempts
  | 'DUPLICATE_FILE'             // Same file scored recently
  | 'SCORING_FAILED';            // ScoringService internal error
```

#### Composer.tsx Change

```typescript
// Current (hardcoded):
const uploadMode: UploadMode = 'intake';

// New (dynamic):
const uploadMode: UploadMode = currentMode === 'scoring' ? 'scoring' : 'intake';
```

#### Acceptance Criteria
- [ ] Composer passes mode to upload (not hardcoded)
- [ ] File upload in scoring mode triggers ScoringService
- [ ] AssessmentId extracted and matched to DB record
- [ ] **Security:** Assessment existence validated
- [ ] **Security:** Ownership validated (user.id match)
- [ ] **Security:** Status validated (>= 'exported')
- [ ] **Quality:** Confidence floor (0.7) enforced
- [ ] **Cost:** Rate limiting enforced (5/day/assessment)
- [ ] **Cost:** File hash de-dup enforced (1hr window)
- [ ] WebSocket events emitted with proper error codes
- [ ] Integration test validates full flow + error cases

---

### Story 5a.5: Scoring Mode Welcome Message

**Phase:** 3 | **Parallel:** No | **Agent:** `chat-backend-agent`

#### Overview
When user switches to scoring mode, send a welcome message explaining how to use it.

#### Dependencies
- **Depends on:** 5a.4 (both modify ChatServer.ts)

#### Files to Modify
| File | Action | Description |
|------|--------|-------------|
| `packages/backend/src/infrastructure/websocket/ChatServer.ts` | MODIFY | Send welcome on mode switch |
| `packages/backend/__tests__/unit/ChatServer.test.ts` | MODIFY | Test welcome message |

#### Welcome Message Content
```markdown
## Scoring Mode

You're now in **Scoring Mode**. Here's how to score a completed questionnaire:

1. **Upload** the completed questionnaire file (PDF recommended, Word accepted)
2. Ensure the document has the **GUARDIAN Assessment ID** in the header
3. I'll analyze vendor responses against the 10 risk dimensions
4. You'll receive a detailed risk assessment report with recommendations

**Ready when you are** - just upload the completed questionnaire document.

> **Note:** The questionnaire must have been generated by Guardian and contain the Assessment ID for matching.
```

#### Implementation
```typescript
// In ChatServer.ts mode switch handler
if (newMode === 'scoring') {
  this.emitAssistantMessage(socket, conversationId, SCORING_WELCOME_MESSAGE);
}
```

#### Acceptance Criteria
- [ ] Welcome message sent when switching to scoring mode
- [ ] Message appears as assistant message in chat
- [ ] Message explains upload process clearly
- [ ] Test verifies welcome message emission

---

### Story 5a.6: showScoringMode Persistence Logic

**Phase:** 1 | **Parallel:** Yes | **Agent:** `frontend-agent`

#### Overview
Change `showScoringMode` from session-based (`exportData` exists) to persistence-based (user has any assessment with status >= 'exported').

#### Current Problem
```typescript
// Current: Tied to session state
showScoringMode={!!exportData}  // Lost when browser closes
```

#### Solution
```typescript
// New: Based on persisted assessment state
const { hasExportedAssessments } = useUserAssessments();
showScoringMode={hasExportedAssessments}  // Survives session
```

#### Files to Modify
| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/hooks/useUserAssessments.ts` | CREATE | Hook to check user's assessments |
| `apps/web/src/components/chat/ChatInterface.tsx` | MODIFY | Use new hook for showScoringMode |
| `packages/backend/src/infrastructure/http/routes/assessment.routes.ts` | MODIFY | Add status endpoint |
| `packages/backend/src/infrastructure/http/AssessmentController.ts` | MODIFY | Implement status check |
| `apps/web/__tests__/hooks/useUserAssessments.test.ts` | CREATE | Test hook |

#### Backend Endpoint
```typescript
// GET /api/assessments/status
// Returns: { hasExportedAssessments: boolean }
router.get('/status', authMiddleware, async (req, res) => {
  const count = await assessmentRepo.countByUserAndStatus(
    req.user.id,
    ['exported', 'questions_generated', 'scored']
  );
  res.json({ hasExportedAssessments: count > 0 });
});
```

#### Frontend Hook
```typescript
// useUserAssessments.ts
export function useUserAssessments() {
  const [hasExportedAssessments, setHasExportedAssessments] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/assessments/status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setHasExportedAssessments(data.hasExportedAssessments);
      } finally {
        setIsLoading(false);
      }
    }
    check();
  }, [token]);

  return { hasExportedAssessments, isLoading };
}
```

#### ChatInterface Update
```typescript
// In ChatInterface.tsx
const { hasExportedAssessments } = useUserAssessments();

// Replace both Composer instances
<Composer
  // ... other props
  showScoringMode={hasExportedAssessments}
/>
```

#### Acceptance Criteria
- [ ] Scoring mode visible if user has ANY exported assessment
- [ ] State survives browser refresh/close
- [ ] Backend endpoint returns correct status
- [ ] Hook fetches status on mount
- [ ] Tests verify persistence behavior

---

### Story 5a.7: Frontend Scoring Event Handling

**Phase:** 4 | **Parallel:** No | **Agent:** `frontend-agent`

#### Overview
Subscribe to backend scoring WebSocket events and update UI to show progress, results, and errors. This completes the frontend side of the scoring flow initiated by Story 5a.4.

#### Dependencies
- **Depends on:** 5a.4 (backend emits the events this story consumes)
- **Can run parallel with:** 5a.5 (no file conflicts)

#### Files to Modify
| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/hooks/useWebSocketAdapter.ts` | MODIFY | Add scoring event subscription methods |
| `apps/web/src/hooks/useWebSocketEvents.ts` | MODIFY | Handle scoring events, update store |
| `apps/web/src/stores/chatStore.ts` | MODIFY | Add scoring state (isScoring, scoringProgress, scoringError, scoringResult) |
| `apps/web/src/components/chat/ChatInterface.tsx` | MODIFY | Subscribe to scoring events, show UI |
| `apps/web/src/hooks/__tests__/useWebSocketAdapter.test.ts` | MODIFY | Test new subscription methods |

#### WebSocket Adapter Methods
```typescript
// Add to useWebSocketAdapter.ts

subscribeScoringStarted(callback: (data: ScoringStartedEvent) => void): () => void {
  this.socket.on('scoring_started', callback);
  return () => this.socket.off('scoring_started', callback);
}

subscribeScoringProgress(callback: (data: ScoringProgressEvent) => void): () => void {
  this.socket.on('scoring_progress', callback);
  return () => this.socket.off('scoring_progress', callback);
}

subscribeScoringComplete(callback: (data: ScoringCompleteEvent) => void): () => void {
  this.socket.on('scoring_complete', callback);
  return () => this.socket.off('scoring_complete', callback);
}

subscribeScoringError(callback: (data: ScoringErrorEvent) => void): () => void {
  this.socket.on('scoring_error', callback);
  return () => this.socket.off('scoring_error', callback);
}
```

#### Chat Store State
```typescript
// Add to chatStore.ts

interface ScoringState {
  isScoring: boolean;
  scoringProgress: number;  // 0-100
  scoringStatus: 'idle' | 'parsing' | 'validating' | 'scoring' | 'storing' | 'complete' | 'error';
  scoringError: string | null;
  scoringErrorCode: ScoringErrorCode | null;
  scoringResult: ScoringResultSummary | null;
}

// Actions
setScoringStarted: (assessmentId: string, fileId: string) => void;
setScoringProgress: (progress: number, status: string) => void;
setScoringComplete: (result: ScoringResultSummary) => void;
setScoringError: (error: string, code: ScoringErrorCode) => void;
resetScoringState: () => void;
```

#### Event Handling in useWebSocketEvents
```typescript
// Add to useWebSocketEvents.ts

useEffect(() => {
  if (!adapter) return;

  const unsubStart = adapter.subscribeScoringStarted((data) => {
    useChatStore.getState().setScoringStarted(data.assessmentId, data.fileId);
    // Optionally show toast: "Scoring started..."
  });

  const unsubProgress = adapter.subscribeScoringProgress((data) => {
    useChatStore.getState().setScoringProgress(data.progress, data.status);
  });

  const unsubComplete = adapter.subscribeScoringComplete((data) => {
    useChatStore.getState().setScoringComplete(data.result);
    toast.success('Scoring complete! View your risk assessment.');
  });

  const unsubError = adapter.subscribeScoringError((data) => {
    useChatStore.getState().setScoringError(data.error, data.code);
    toast.error(`Scoring failed: ${data.error}`);
  });

  return () => {
    unsubStart();
    unsubProgress();
    unsubComplete();
    unsubError();
  };
}, [adapter]);
```

#### UI Updates
```typescript
// In ChatInterface.tsx or new ScoringProgress component

const { isScoring, scoringProgress, scoringStatus, scoringError, scoringResult } =
  useChatStore((state) => ({
    isScoring: state.isScoring,
    scoringProgress: state.scoringProgress,
    scoringStatus: state.scoringStatus,
    scoringError: state.scoringError,
    scoringResult: state.scoringResult,
  }));

// Show progress indicator during scoring
{isScoring && (
  <ScoringProgressIndicator
    progress={scoringProgress}
    status={scoringStatus}
  />
)}

// Show error if scoring failed
{scoringError && (
  <ScoringErrorBanner error={scoringError} onDismiss={resetScoringState} />
)}

// Show results when complete
{scoringResult && (
  <ScoringResultCard result={scoringResult} />
)}
```

#### Acceptance Criteria
- [ ] WebSocket adapter has 4 new subscription methods (started, progress, complete, error)
- [ ] Chat store has scoring state and actions
- [ ] useWebSocketEvents subscribes to all 4 scoring events
- [ ] Progress indicator shows during scoring with status text
- [ ] Toast notification on scoring complete
- [ ] Error banner with human-readable message on failure
- [ ] Error codes from 5a.4 mapped to user-friendly messages
- [ ] Tests for adapter subscription methods
- [ ] Tests for store actions
- [ ] Manual test: upload in scoring mode shows progress → result

---

## File Conflict Analysis

| Story | Files Modified | Conflicts With |
|-------|----------------|----------------|
| 5a.0 | (read-only) | None |
| 5a.1 | PDFExporter.ts, questionnaire.html | None |
| 5a.2 | WordExporter.ts | None |
| 5a.3 | ExcelExporter.ts | None |
| 5a.6 | ChatInterface.tsx, new hook, AssessmentController | None |
| 5a.4 | ChatServer.ts, DocumentUploadController, Composer | **5a.5** (ChatServer) |
| 5a.5 | ChatServer.ts | **5a.4** - Run after 5a.4 |
| 5a.7 | useWebSocketAdapter.ts, useWebSocketEvents.ts, chatStore.ts, ChatInterface.tsx | **5a.6** (ChatInterface) - but different sections |

**Notes:**
- Phase 1 stories touch completely different files - safe for parallel
- 5a.4 and 5a.5 both touch ChatServer.ts - 5a.4 must complete first
- 5a.5 and 5a.7 have no conflicts (backend vs frontend) - safe for parallel
- 5a.6 and 5a.7 both touch ChatInterface.tsx but different sections (5a.6 is showScoringMode prop, 5a.7 is scoring state display) - safe as Phase 1 completes before Phase 3

---

## Test Impact Analysis

**IMPORTANT:** Each story MUST fix any tests broken by its changes. Do not leave broken tests for later.

### Actual Test File Paths (Verified)

**Backend Exporter Tests:**
- `packages/backend/__tests__/integration/PDFExporter.test.ts`
- `packages/backend/__tests__/integration/WordExporter.test.ts`
- `packages/backend/__tests__/integration/ExcelExporter.test.ts`

**Backend ChatServer Tests (split by feature):**
- `packages/backend/__tests__/unit/ChatServer.extraction.test.ts`
- `packages/backend/__tests__/unit/ChatServer.attachmentValidation.test.ts`
- `packages/backend/__tests__/unit/ChatServer.contextInjection.test.ts`
- `packages/backend/__tests__/unit/ChatServer.handleGetExportStatus.test.ts`
- `packages/backend/__tests__/unit/ChatServer.handleGenerateQuestionnaire.test.ts`

**Backend Other:**
- `packages/backend/__tests__/unit/DocumentUploadController.test.ts`
- `packages/backend/__tests__/e2e-external/assessments.test.ts`

**Frontend ChatInterface Tests (ALL need hook mock):**
- `apps/web/src/components/chat/__tests__/ChatInterface.core.test.tsx`
- `apps/web/src/components/chat/__tests__/ChatInterface.conversation.test.tsx`
- `apps/web/src/components/chat/__tests__/ChatInterface.downloads.test.tsx`
- `apps/web/src/components/chat/__tests__/ChatInterface.questionnaire.test.tsx`

**Frontend Other:**
- `apps/web/src/components/chat/__tests__/Composer.test.tsx`

**New Test Files to Create (5a.6 + 5a.7):**
- `apps/web/src/hooks/__tests__/useUserAssessments.test.ts` (5a.6)
- `apps/web/src/hooks/__tests__/useWebSocketAdapter.test.ts` (5a.7 - may exist, extend if so)
- `apps/web/src/stores/__tests__/chatStore.scoring.test.ts` (5a.7)

### Test Impact Table

| Story | Change | Actual Test Files | Required Action |
|-------|--------|-------------------|-----------------|
| **5a.1** | AssessmentId in PDF | `__tests__/integration/PDFExporter.test.ts` | Update content assertions to expect assessmentId |
| **5a.2** | AssessmentId in Word | `__tests__/integration/WordExporter.test.ts` | Update content assertions to expect assessmentId |
| **5a.3** | AssessmentId in Excel | `__tests__/integration/ExcelExporter.test.ts` | Update row assertions to expect assessmentId |
| **5a.4** | Validation gates | `__tests__/unit/DocumentUploadController.test.ts` | Add tests for all 8 error codes |
| **5a.4** | Scoring WS events | **CREATE NEW:** `__tests__/unit/ChatServer.scoring.test.ts` | New file for scoring_started, scoring_error events |
| **5a.5** | Welcome message | **EXTEND:** `__tests__/unit/ChatServer.*.test.ts` or create new | Add test for welcome message on mode switch |
| **5a.6** | useUserAssessments hook | **ALL 4 ChatInterface test files** | Add mock in test setup for all files |
| **5a.6** | New /api/assessments/status | **ADD TO:** `__tests__/e2e-external/assessments.test.ts` | Add test for new status endpoint |
| **5a.6** | useUserAssessments hook | **CREATE:** `apps/web/src/hooks/__tests__/useUserAssessments.test.ts` | New test file for hook |
| **5a.4** | Dynamic uploadMode | `Composer.test.tsx` | **ADD NEW TEST** (existing unlikely to break) |
| **5a.7** | WS adapter methods | `apps/web/src/hooks/__tests__/useWebSocketAdapter.test.ts` | Add tests for 4 new subscribe methods |
| **5a.7** | Chat store actions | **CREATE:** `apps/web/src/stores/__tests__/chatStore.scoring.test.ts` | Test scoring state and actions |
| **5a.7** | Event handling | `apps/web/src/hooks/__tests__/useWebSocketEvents.test.ts` | Add tests for scoring event subscriptions |

### Test Fix Protocol

Each agent executing a story MUST:

1. **Before coding:** Run existing tests for affected files
   ```bash
   pnpm test:unit --testPathPattern="PDFExporter|WordExporter|ExcelExporter"
   pnpm test:unit --testPathPattern="Composer|ChatInterface|ChatServer"
   ```

2. **After coding:** Run full test suite
   ```bash
   pnpm test:unit
   pnpm test:integration
   ```

3. **If tests fail:**
   - Determine if test is checking OLD behavior (update test)
   - Determine if test caught a bug in new code (fix code)
   - Never skip or delete tests without justification

4. **Acceptance criteria include:**
   - All pre-existing tests pass (updated if needed)
   - New tests added for new functionality
   - No test coverage regression

---

## Success Criteria for Sprint 5a

After all stories complete:

### Functional Requirements
- [ ] All questionnaire exports (PDF, Word, Excel) contain Assessment ID
- [ ] Scoring mode shows welcome message on activation
- [ ] File upload in scoring mode triggers ScoringService
- [ ] Uploaded documents matched to assessments via extracted ID
- [ ] **Security:** Assessment ownership enforced
- [ ] **Security:** Assessment status checked (must be exported)
- [ ] **Quality:** Low-confidence parses rejected (< 0.7)
- [ ] **Cost:** Rate limiting prevents abuse
- [ ] Scoring mode visible based on persisted assessment state (not session)
- [ ] Full upload → score → display flow works end-to-end

### Test Requirements (MANDATORY)
- [ ] `pnpm test:unit` passes with 0 failures
- [ ] `pnpm test:integration` passes with 0 failures
- [ ] All broken tests from Test Impact Analysis are fixed
- [ ] New tests added for:
  - AssessmentId presence in each export format (5a.1-5a.3)
  - Validation gate error codes - all 8 types (5a.4)
  - Backend scoring WebSocket events (5a.4)
  - Welcome message emission (5a.5)
  - useUserAssessments hook behavior (5a.6)
  - /api/assessments/status endpoint (5a.6)
  - Frontend scoring event subscriptions (5a.7)
  - Chat store scoring state/actions (5a.7)
- [ ] No test coverage regression (maintain current % or improve)

---

## Agent Execution Commands

### Phase 1: Parallel Kickoff (5 Agents in ONE Message)

```typescript
// Launch ALL 5 in a single message for maximum parallelism

Task(subagent_type: "Explore", prompt: `
Read tasks/epic-15/sprint-5a-gap-closure.md Story 5a.0.
Investigate the scoring trigger flow and create spec document.
Output to tasks/epic-15/5a.0-scoring-trigger-spec.md
`)

Task(subagent_type: "chat-backend-agent", prompt: `
Execute Story 5a.1 from tasks/epic-15/sprint-5a-gap-closure.md
- Add assessmentId to PDF export
- Update template and exporter
- Add test that explicitly verifies assessmentId in output
`)

Task(subagent_type: "chat-backend-agent", prompt: `
Execute Story 5a.2 from tasks/epic-15/sprint-5a-gap-closure.md
- Add assessmentId to Word export
- Add test that explicitly verifies assessmentId in output
`)

Task(subagent_type: "chat-backend-agent", prompt: `
Execute Story 5a.3 from tasks/epic-15/sprint-5a-gap-closure.md
- Add assessmentId to Excel export
- Add test that explicitly verifies assessmentId in output
`)

Task(subagent_type: "frontend-agent", prompt: `
Execute Story 5a.6 from tasks/epic-15/sprint-5a-gap-closure.md
- Create useUserAssessments hook
- Add backend GET /api/assessments/status endpoint
- Update ChatInterface to use persisted state
- Add tests for hook
`)
```

### Phase 2: Scoring Trigger (After 5a.0 Completes)

```typescript
// Wait for 5a.0 to complete, then launch 5a.4
// Can proceed even if 5a.1-3 and 5a.6 still running

Task(subagent_type: "chat-backend-agent", prompt: `
Execute Story 5a.4 from tasks/epic-15/sprint-5a-gap-closure.md

IMPORTANT: Read 5a.0-scoring-trigger-spec.md first for implementation guidance.

Key requirements:
1. Update Composer.tsx to pass mode dynamically (not hardcoded 'intake')
2. Implement ALL validation gates:
   - Assessment exists
   - User owns assessment
   - Assessment status >= 'exported'
   - Parse confidence >= 0.7
   - Rate limit (5/day/assessment)
   - File hash de-dup (1hr window)
3. Emit all WebSocket events with proper error codes
4. Create integration test for full flow + error cases
`)
```

### Phase 3: Parallel Completion (After 5a.4 Completes)

```typescript
// Wait for 5a.4 to complete, then launch BOTH in ONE message
// 5a.5 (backend) and 5a.7 (frontend) have no file conflicts

Task(subagent_type: "chat-backend-agent", prompt: `
Execute Story 5a.5 from tasks/epic-15/sprint-5a-gap-closure.md
- Add welcome message when switching to scoring mode
- Use the exact message format from the story spec
- Add test for welcome message emission
`)

Task(subagent_type: "frontend-agent", prompt: `
Execute Story 5a.7 from tasks/epic-15/sprint-5a-gap-closure.md
- Add 4 subscription methods to useWebSocketAdapter
- Add scoring state to chatStore
- Handle events in useWebSocketEvents
- Show progress indicator, error banner, and result card in UI
- Add tests for adapter, store, and event handling
`)
```

---

## Async Execution Strategy

For maximum efficiency with background agents:

```typescript
// Step 1: Launch Phase 1 (all 5 in background)
const phase1Agents = [
  Task(subagent_type: "Explore", run_in_background: true, /* 5a.0 */),
  Task(subagent_type: "chat-backend-agent", run_in_background: true, /* 5a.1 */),
  Task(subagent_type: "chat-backend-agent", run_in_background: true, /* 5a.2 */),
  Task(subagent_type: "chat-backend-agent", run_in_background: true, /* 5a.3 */),
  Task(subagent_type: "frontend-agent", run_in_background: true, /* 5a.6 */),
];

// Step 2: Wait ONLY for 5a.0 (Explore) to complete
TaskOutput(task_id: phase1Agents[0].id, block: true);

// Step 3: Launch Phase 2 (5a.4) immediately
// Don't wait for 5a.1-3 or 5a.6 - they can finish in parallel
const phase2Agent = Task(subagent_type: "chat-backend-agent", run_in_background: true, /* 5a.4 */);

// Step 4: Wait for Phase 2 to complete
TaskOutput(task_id: phase2Agent.id, block: true);

// Step 5: Launch Phase 3 (5a.5 + 5a.7 in parallel)
const phase3Agents = [
  Task(subagent_type: "chat-backend-agent", run_in_background: true, /* 5a.5 */),
  Task(subagent_type: "frontend-agent", run_in_background: true, /* 5a.7 */),
];

// Step 6: Wait for Phase 3 to complete
for (const agent of phase3Agents) {
  TaskOutput(task_id: agent.id, block: true);
}

// Step 7: Collect any remaining Phase 1 results
// (5a.1-3 and 5a.6 may have finished during Phase 2/3)
for (const agent of phase1Agents.slice(1)) {
  TaskOutput(task_id: agent.id, block: false); // Non-blocking check
}
```

**Optimization Result:**
- 8 stories across 3 phases
- Phase 1: 5 parallel agents
- Phase 2: 1 agent (sequential, blocks on 5a.0)
- Phase 3: 2 parallel agents (backend + frontend)
- Maximum parallelism: 5 agents at once
- Total wall-clock time: ~3 sequential phases instead of 8 sequential stories

---

## Handoff to Sprint 6

After Sprint 5a completes, Sprint 6 (E2E Tests) should include:
- E2E test for full scoring flow: upload → parse → match → score → display → export
- E2E test for error cases (bad assessment ID, unauthorized, not exported)
- Component tests for welcome message display
- Integration tests for showScoringMode persistence
- Regression tests for questionnaire exports with Assessment ID
