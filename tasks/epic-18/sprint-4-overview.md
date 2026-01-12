# Sprint 4: Scoring UX Enhancements

**Epic:** 18 - Upload Performance
**Track:** Features
**Stories:** 18.4.2a - 18.4.5 (5 stories remaining, 3 complete)
**Estimated Effort:** 6-8 hours
**Dependencies:** Sprint 3 complete, DocumentClassifier implemented
**Agents:** `backend-agent` + `frontend-agent`

---

## Context

Sprint 4 enhances scoring mode UX by leveraging the document classification system
implemented earlier. The goal is to prevent wasted compute on wrong documents,
enforce single-vendor scoring, and address user queries after scoring.

**Problem Statement:**
1. **Wrong document uploaded** - Scoring runs on non-questionnaires, wasting 60-120s compute
2. **User query ignored** - Messages sent with files are never addressed by Claude
3. **Multi-vendor ambiguity** - No handling when files from different vendors are uploaded
4. **No escape hatch** - Can't cancel or correct before scoring starts

**Design Decision: Single-Vendor Scoring**

Multi-vendor parallel scoring was considered but rejected to reduce complexity.
Instead, when multiple vendors are detected:
- User is prompted to choose which vendor to score
- Non-selected files remain attached but are not scored
- Follow-up prompt offers to score the other vendor

---

## Prerequisites

### Already Complete (from earlier work)

| Story | Name | Status | Location |
|-------|------|--------|----------|
| 18.4.1a | Document Classifier Function | ✅ DONE | `packages/backend/src/infrastructure/extraction/DocumentClassifier.ts` |
| 18.4.1b | Database Schema Extension | ✅ DONE | `packages/backend/src/infrastructure/database/schema/files.ts` |
| 18.4.1c | Detection Integration | ✅ DONE | `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts` |

### What's Working Now

- Files are classified on upload (`detectedDocType`: 'questionnaire' | 'document' | 'unknown')
- Vendor name is extracted when possible (`detectedVendorName`)
- Classification happens in <100ms (pure regex/string operations)
- Results are stored in files table and emitted in `file_attached` event

---

## Remaining Stories (5)

| Story | Name | Focus | Lines | Dependencies |
|-------|------|-------|-------|--------------|
| **18.4.2a** | Clarification Event Types | WebSocket events, handlers, vendor validation | ~500 | 18.4.1c (done) |
| **18.4.2b** | Clarification UI Component | Frontend inline buttons, vendor selection | ~450 | 18.4.2a |
| **18.4.3** | User Query Post-Scoring | Address user message after scoring | ~350 | None (independent) |
| **18.4.4** | Vendor Validation | Detect vendor conflicts, enforce single-vendor | ~250 | None (independent) |
| **18.4.5** | Consult Auto-Summarize | Auto-summarize file when no message | ~300 | None (independent) |

**Total: 5 stories, ~1,850 lines of planning documentation**

---

## Dependency Graph

```
                    SPRINT 4 REMAINING WORK

Track A: Clarification Prompts + Vendor Validation
  [18.4.1c DONE] ──► 18.4.2a ──► 18.4.2b
                        ▲
  18.4.4 (validation) ──┘

Track B: Post-Scoring Query
  18.4.3 (standalone)

Track C: Auto-Summarize
  18.4.5 (standalone)
```

---

## Parallel Execution Strategy

### Phase 1: Foundation (3 stories in parallel)

```
┌────────────────────────────────────────────────────────────────────┐
│                   PHASE 1 - RUN IN PARALLEL                        │
├────────────────────┬────────────────────┬──────────────────────────┤
│   18.4.3           │   18.4.4           │   18.4.5                 │
│   Post-Query       │   Vendor Valid.    │   Auto-Summarize         │
│   (backend)        │   (backend)        │   (backend)              │
│                    │                    │                          │
│   Agent 1          │   Agent 2          │   Agent 3                │
└────────────────────┴────────────────────┴──────────────────────────┘
```

**Stories:** 18.4.3, 18.4.4, 18.4.5
**Agents needed:** Up to 3
**Dependencies:** None - all independent
**GPT 5.2 Review:** After all 3 complete

---

### Phase 2: Clarification Events (1 story)

```
┌────────────────────────────────────────────────────────────────────┐
│                   PHASE 2 - SEQUENTIAL                             │
├────────────────────────────────────────────────────────────────────┤
│   18.4.2a                                                          │
│   Clarification Events + Vendor Conflict Handling                  │
│   (backend + WebSocket)                                            │
│                                                                    │
│   Uses vendor validation from 18.4.4                               │
│   Agent 1                                                          │
└────────────────────────────────────────────────────────────────────┘
```

**Stories:** 18.4.2a
**Agents needed:** 1
**Dependencies:**
- 18.4.2a depends on 18.4.1c (done) and uses 18.4.4 validation
**GPT 5.2 Review:** After complete

---

### Phase 3: Frontend UI (1 story)

```
┌────────────────────────────────────────────────────────────────────┐
│                   PHASE 3 - SEQUENTIAL                             │
├────────────────────────────────────────────────────────────────────┤
│   18.4.2b                                                          │
│   Clarification UI + Vendor Selection                              │
│   (frontend)                                                       │
│                                                                    │
│   Agent 1                                                          │
└────────────────────────────────────────────────────────────────────┘
```

**Stories:** 18.4.2b
**Agents needed:** 1
**Dependencies:**
- 18.4.2b depends on 18.4.2a
**GPT 5.2 Review:** After complete (Sprint 4 complete)

---

## GPT 5.2 Review Checkpoints

| Checkpoint | After Phase | Stories to Review | Focus |
|------------|-------------|-------------------|-------|
| **Review 1** | Phase 1 | 18.4.3, 18.4.4, 18.4.5 | Core logic, validation patterns |
| **Review 2** | Phase 2 | 18.4.2a | Events, state handling, vendor conflict flow |
| **Review 3** | Phase 3 | 18.4.2b | UI components, UX, event handling |

Each review can iterate (fix → re-review) before proceeding to next phase.

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 18.4.2a | `sprint-4-story-18.4.2a-events.md` | backend-agent |
| 18.4.2b | `sprint-4-story-18.4.2b-ui.md` | frontend-agent |
| 18.4.3 | `sprint-4-story-18.4.3-query.md` | backend-agent |
| 18.4.4 | `sprint-4-story-18.4.4-vendor-validation.md` | backend-agent |
| 18.4.5 | `sprint-4-story-18.4.5-summarize.md` | backend-agent |

---

## Clarification Flow Design

### Check Ordering (Explicit)

```
Scoring Mode + Files Attached
         │
         ▼
  ┌──────────────────┐
  │ 1. Document Type │ ──► Non-questionnaire? ──► clarification_prompt
  │    Check         │                            (wrong_document_type)
  └────────┬─────────┘
           │ pass
           ▼
  ┌──────────────────┐
  │ 2. Vendor        │ ──► Multiple vendors? ──► clarification_prompt
  │    Validation    │                           (multiple_vendors)
  └────────┬─────────┘
           │ pass
           ▼
  ┌──────────────────┐
  │ 3. Trigger       │
  │    Scoring       │
  └──────────────────┘
```

### Clarification Types

| Type | Trigger | Options |
|------|---------|---------|
| `wrong_document_type` | Non-questionnaire in Scoring mode | Switch to Consult, Switch to Assessment, Score Anyway |
| `confirm_scoring` | Unknown document type | Yes Score It, Cancel |
| `multiple_vendors` | Files from different vendors | Choose vendor (stable IDs), Remove & Re-upload |
| `offer_next_vendor` | After scoring one vendor, other files remain | Score next vendor, No thanks |

### Vendor Selection Flow

```
User uploads: Acme.pdf, Acme2.pdf, CloudSec.pdf
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠️ Multiple vendors detected                                        │
│                                                                     │
│ Your files appear to be from different vendors. Scoring works best │
│ with one vendor at a time for accurate assessment.                 │
│                                                                     │
│ Detected vendors:                                                   │
│   • Acme Corp (2 files)                                            │
│   • CloudSec Inc (1 file)                                          │
│                                                                     │
│ Which vendor would you like to score first?                        │
│                                                                     │
│  [Score Acme Corp]  [Score CloudSec Inc]  [Remove & Re-upload]     │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼ User selects "Score Acme Corp"
         │
┌─────────────────────────────────────────────────────────────────────┐
│ Scoring complete for Acme Corp.                                     │
│                                                                     │
│ Note: CloudSec Inc files were not scored: CloudSec.pdf             │
│                                                                     │
│ Would you like to score CloudSec Inc (1 file)?                     │
│                                                                     │
│  [Score CloudSec Inc]  [No thanks]                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Stable Vendor IDs

Option IDs use stable indexed values, not derived from vendor names:

```typescript
// ✅ Good: Stable IDs
options: [
  { id: 'vendor_0', label: 'Score Acme Corp', ... },
  { id: 'vendor_1', label: 'Score CloudSec Inc', ... },
]

// ❌ Bad: Derived from vendor names (unsafe)
options: [
  { id: 'score_acme_corp', ... },  // What if vendor name has unicode?
]
```

Server maintains `vendorMap` in pending state: `{ vendor_0: 'Acme Corp', vendor_1: 'CloudSec Inc' }`

### 2. Remove & Re-upload Behavior

When user selects "Remove & Re-upload":
- **Client:** Emit `clear_composer_files` event to clear composer UI
- **Server:** Files remain in storage (already uploaded), just orphaned
- **Result:** Non-destructive; user can upload new files

### 3. "Not Scored" Indicator

After scoring selected vendor, acknowledge skipped files via **plain assistant message**:
```
Scoring complete for Acme Corp.

Note: CloudSec Inc files were not scored: CloudSec.pdf
```

No new component types—just text in chat history.

### 4. Unknown Vendors

Files with null/unknown `detectedVendorName` are treated as one compatible group.
Only different *explicit* vendor names trigger the multiple_vendors clarification.

---

## Key Files Reference

### Backend Files (to modify)

```
packages/backend/src/
├── infrastructure/
│   ├── websocket/
│   │   └── ChatServer.ts           # Clarification events, check ordering
│   ├── extraction/
│   │   └── DocumentClassifier.ts   # Already done (18.4.1a)
│   ├── http/controllers/
│   │   └── DocumentUploadController.ts  # Already done (18.4.1c)
│   └── database/
│       ├── schema/files.ts         # Already done (18.4.1b)
│       └── repositories/
│           └── DrizzleFileRepository.ts  # Vendor lookup queries
├── application/
│   ├── services/
│   │   └── VendorValidationService.ts   # NEW: Vendor conflict detection
│   └── interfaces/
│       └── IFileRepository.ts      # findByIds method
└── domain/
    └── events/
        └── clarification.ts        # NEW: Event types
```

### Frontend Files (to modify)

```
apps/web/src/
├── components/
│   └── chat/
│       ├── MessageList.tsx         # Clarification UI integration
│       └── ClarificationPrompt.tsx # NEW: Inline buttons component
├── hooks/
│   └── useChat.ts                  # Handle clarification events
└── lib/
    └── websocket.ts                # Event type definitions
```

---

## Success Metrics

- [ ] Wrong document type shows clarification prompt (not auto-scoring)
- [ ] User can switch mode or force score from clarification
- [ ] Multiple vendors detected triggers vendor selection prompt
- [ ] User can choose which vendor to score
- [ ] Non-selected files acknowledged as "not scored" in plain message
- [ ] Follow-up prompt offers to score other vendor
- [ ] User query is addressed after scoring completes
- [ ] Consult mode auto-summarizes when no message provided
- [ ] All tests passing
- [ ] No regression in single-file scoring flow

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Clarification blocks scoring | "Score anyway" escape hatch (for doc type only) |
| Vendor selection confusing | Clear message explaining why, stable IDs |
| User query adds latency | Expected (+10-30s), but UX is better |
| Frontend event handling | Use existing patterns from Sprint 2 |

**Note:** "Score anyway" is NOT available for vendor conflicts—single-vendor is enforced.

---

## Exit Criteria

Sprint 4 is complete when:

- [ ] All 5 remaining stories implemented
- [ ] Clarification prompt shows for wrong document type
- [ ] Clarification prompt shows for multiple vendors
- [ ] User can respond to clarification (switch mode, score anyway, choose vendor)
- [ ] Non-selected vendor files acknowledged in plain message
- [ ] Follow-up offers to score next vendor
- [ ] User queries are addressed after scoring
- [ ] Consult auto-summarizes files with no message
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Code reviewed and approved by GPT 5.2
