# Sprint 1: Scoring Card Persistence

**Epic:** 22 - Scoring Card Persistence
**Focus:** Fix scoring card disappearing after session reload via backend rehydration
**Stories:** 22.1.1 - 22.1.4 (4 stories)
**Dependencies:** None (new functionality)
**Agents:** `backend-agent` | `frontend-agent`

---

## Key Context (Updated after external review)

### Dual Backend Persistence Paths

**Important:** The backend has TWO code paths with INCONSISTENT persistence:

| Code Path | File | Persists `scoring_result`? | Links Assessment? |
|-----------|------|---------------------------|-------------------|
| HTTP upload → scoring | `DocumentUploadController.ts:706-726` | **YES** | **NO** (must fix) |
| WebSocket scoring | `ChatServer.ts:807-823` | **NO** | **NO** (must fix) |
| Questionnaire generation | `QuestionnaireGenerationService.ts:372` | N/A | YES (only path that links) |

This means:
1. Historical messages MAY contain `scoring_result` components
2. **CRITICAL:** BOTH `DocumentUploadController` AND `ChatServer` must call `linkAssessment` after scoring for rehydration to work
3. Only conversations that went through questionnaire generation currently have `assessmentId` linked
4. Story 22.1.3 uses fallback strategy (store primary, message fallback) to handle legacy data

### Response Type (MUST match existing)

All API responses must match `ScoringCompletePayload['result']` from `apps/web/src/lib/websocket.ts:227-240`:
```typescript
{
  compositeScore: number;
  recommendation: 'approve' | 'conditional' | 'decline' | 'more_info';
  overallRiskRating: 'low' | 'medium' | 'high' | 'critical';
  executiveSummary: string;
  keyFindings: string[];
  dimensionScores: Array<{ dimension: string; score: number; riskRating: string; }>;
  batchId: string;
  assessmentId: string;
}
```

### E2E Fixture Format

The upload API accepts: **PDF, DOCX, PNG, JPEG** (NOT YAML).
E2E test fixtures must use PDF or DOCX format.

---

## Stories

| Story | Name | Focus | Dependencies | Agent |
|-------|------|-------|--------------|-------|
| **22.1.1** | Backend Scoring Rehydration Endpoint | New API + fix `linkAssessment` gap in upload flow | None | backend-agent |
| **22.1.2** | Frontend Scoring Rehydration | Fetch and populate scoring results on conversation load (with in-flight guard) | 22.1.1 | frontend-agent |
| **22.1.3** | Prevent Duplicate Card Rendering | Fallback strategy: store primary, message fallback (no regression) | None | frontend-agent |
| **22.1.4** | E2E Test - Scoring Persistence | End-to-end + DB verification with PDF fixture | 22.1.1, 22.1.2 | frontend-agent |

---

## Dependency Graph

```
    File Overlap Analysis:
    +---------+--------------------------------------------------+-------------------+
    | Story   | Files Touched                                    | Conflicts         |
    +---------+--------------------------------------------------+-------------------+
    | 22.1.1  | scoring.routes.ts (NEW)                          | None              |
    |         | ScoringRehydrationController.ts (NEW)            |                   |
    |         | ScoringService.ts                                |                   |
    |         | DocumentUploadController.ts (add linkAssessment) |                   |
    |         | ChatServer.ts (add linkAssessment)               |                   |
    |         | index.ts (route registration)                    |                   |
    +---------+--------------------------------------------------+-------------------+
    | 22.1.2  | chatStore.ts                                     | None              |
    |         | ChatInterface.tsx                                |                   |
    |         | lib/api/scoring.ts (NEW)                         |                   |
    +---------+--------------------------------------------------+-------------------+
    | 22.1.3  | ChatMessage.tsx (add isLastScoringMessage prop)  | None (22.1.2 is  |
    |         | MessageList.tsx (latest-only logic)              | different file)  |
    |         | ChatInterface.tsx (add comment)                  |                   |
    +---------+--------------------------------------------------+-------------------+
    | 22.1.4  | e2e/scoring-persistence.spec.ts (NEW)            | None              |
    |         | e2e/fixtures/completed-questionnaire.pdf (NEW)   |                   |
    |         | ScoringResultCard.tsx (add data-testid)          |                   |
    +---------+--------------------------------------------------+-------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Independent Stories (2 stories in parallel)

```
+----------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                              |
|                  (No file overlap between these stories)                   |
+-----------------------------------+----------------------------------------+
|   22.1.1                          |   22.1.3                               |
|   Backend Rehydration Endpoint    |   Prevent Duplicate Rendering          |
|                                   |                                        |
|   FILES:                          |   FILES:                               |
|   - scoring.routes.ts (NEW)       |   - ChatMessage.tsx (add filter)       |
|   - ScoringRehydrationController  |   - MessageList.tsx (verify)           |
|   - ScoringService.ts             |   - ChatInterface.tsx (add comment)    |
|   - DocumentUploadController.ts   |                                        |
|   - ChatServer.ts                 |                                        |
|   - index.ts                      |                                        |
|                                   |                                        |
|   backend-agent                   |   frontend-agent                       |
+-----------------------------------+----------------------------------------+
```

**Stories:** 22.1.1, 22.1.3
**Agents needed:** 2 (backend-agent, frontend-agent)
**File overlap:** None - 22.1.1 is backend, 22.1.3 is verification/read-only
**Review:** After both complete

---

### Phase 2: Frontend Integration (sequential - depends on 22.1.1)

```
+----------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                                   |
|              (Depends on backend endpoint from Phase 1)                    |
+----------------------------------------------------------------------------+
|   22.1.2                                                                   |
|   Frontend Scoring Rehydration                                             |
|                                                                            |
|   FILES:                                                                   |
|   - apps/web/src/stores/chatStore.ts                                       |
|   - apps/web/src/components/chat/ChatInterface.tsx                         |
|   - apps/web/src/lib/api/scoring.ts (NEW)                                  |
|                                                                            |
|   MUST wait for 22.1.1 (backend endpoint required)                         |
|                                                                            |
|   frontend-agent                                                           |
+----------------------------------------------------------------------------+
```

**Stories:** 22.1.2
**Agents needed:** 1 (frontend-agent)
**Dependencies:** Requires 22.1.1 complete (API endpoint)
**Review:** After complete

---

### Phase 3: E2E Verification (sequential - depends on Phases 1 + 2)

```
+----------------------------------------------------------------------------+
|                     PHASE 3 - SEQUENTIAL                                   |
|              (Depends on full flow from Phases 1 + 2)                      |
+----------------------------------------------------------------------------+
|   22.1.4                                                                   |
|   E2E Test - Scoring Persistence                                           |
|                                                                            |
|   FILES:                                                                   |
|   - apps/web/e2e/scoring-persistence.spec.ts (NEW)                         |
|                                                                            |
|   MUST wait for 22.1.1 + 22.1.2 (full rehydration flow required)           |
|                                                                            |
|   frontend-agent                                                           |
+----------------------------------------------------------------------------+
```

**Stories:** 22.1.4
**Agents needed:** 1 (frontend-agent)
**Dependencies:** Requires Phase 1 + Phase 2 complete
**Review:** After complete (Sprint done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 22.1.1 | `sprint-1-story-1.md` | backend-agent |
| 22.1.2 | `sprint-1-story-2.md` | frontend-agent |
| 22.1.3 | `sprint-1-story-3.md` | frontend-agent |
| 22.1.4 | `sprint-1-story-4.md` | frontend-agent |

---

## Exit Criteria

Sprint 1 is complete when:
- [ ] `DocumentUploadController.runScoring()` calls `linkAssessment` after scoring success
- [ ] `ChatServer.ts` WebSocket scoring calls `linkAssessment` after scoring success
- [ ] GET /api/scoring/conversation/:conversationId endpoint returns scoring data
- [ ] Frontend fetches and populates store on conversation load (with in-flight guard)
- [ ] No duplicate scoring cards rendered (fallback strategy working)
- [ ] E2E test verifies card persists across page reload
- [ ] E2E test verifies UI matches database values (source of truth)
- [ ] All unit and integration tests passing
- [ ] Chrome DevTools MCP QA validation passes (no console errors, correct network calls, visual consistency)
- [ ] Code reviewed and approved
