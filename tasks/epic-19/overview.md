# Epic 19: File Upload Chip Cancel/Remove Refactor

## Overview

Enable users to cancel or remove file uploads at any time, including mid-upload, matching GPT/Claude behavior. Currently, clicking X triggers a toast "Cannot remove file during upload" for most stages.

**Problem:** Third refactor of this feature - previous attempts caused major regressions. This epic uses the behavior matrix (`behavior-matrix.md`) as the single source of truth to prevent regressions.

**Solution:** Per-file uploads with per-file AbortControllers, unified stage semantics, and cancel-removes-file pattern.

---

## Critical Reference Document

**IMPORTANT:** All implementation must reference `behavior-matrix.md` as the authoritative source for:
- Stage definitions and transitions
- Remove/cancel behavior per stage
- Send button enablement rules
- UI affordances

Any conflict between code and behavior-matrix.md should be resolved in favor of behavior-matrix.md.

---

## Architecture

### Current State (Broken)

```
User selects 3 files
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BATCH UPLOAD (Single Request)                     │
│                                                                     │
│  files[0] ────┐                                                     │
│  files[1] ────┼──► POST /api/documents/upload ──► Single Response   │
│  files[2] ────┘           │                                         │
│                           │                                         │
│  ONE AbortController ─────┘  (canceling aborts ALL files)          │
│                                                                     │
│  removeFile() blocks: ['uploading', 'storing', 'attached', 'parsing']│
│                         ↑                                           │
│                    Shows toast "Cannot remove file during upload"   │
└─────────────────────────────────────────────────────────────────────┘
```

**Problems:**
1. Cannot cancel individual file mid-upload
2. `attached` stage blocks removal even though it shows checkmark
3. Single AbortController means all-or-nothing cancel
4. ModeSelector shows warning triangle for ANY incomplete file
5. FileChip shows amber warning for document type (duplicates chat messages)

### Target State (Epic 19)

```
User selects 3 files
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  PER-FILE UPLOAD (Parallel Requests)                 │
│                                                                     │
│  file[0] ──► POST ──► AbortController[0] ──► Can cancel individually│
│  file[1] ──► POST ──► AbortController[1] ──► Can cancel individually│
│  file[2] ──► POST ──► AbortController[2] ──► Can cancel individually│
│                                                                     │
│  Concurrency limit: 2-3 simultaneous uploads                        │
│                                                                     │
│  removeFile() allows: ALL stages except 'parsing'                   │
│  - pending: Remove from queue                                       │
│  - uploading: Abort HTTP + remove                                   │
│  - storing: Remove (server may continue)                            │
│  - attached: Remove from UI                                         │
│  - complete: Remove from UI                                         │
│  - error: Remove from UI                                            │
│                                                                     │
│  Cancel REMOVES file (never transitions to error state)             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Sprint Dependency Chart

```
┌─────────────────────────────────────────────────────────────────────┐
│                       SPRINT 0 (Foundation)                          │
│                   Stage Helpers + Warning Removal                    │
│                                                                     │
│  - Create uploadStageHelpers.ts (single source of truth)            │
│  - Remove ModeSelector warning triangle (hasIncompleteFiles)        │
│  - Remove FileChip amber warning (hasDocTypeMismatch)               │
│  - Update removeFile() to allow 'attached' removal                  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       SPRINT 1 (Per-File Upload)                     │
│                   Upload Infrastructure Refactor                     │
│                                                                     │
│  - Refactor uploadAll to per-file uploads                           │
│  - Per-file AbortController management                              │
│  - Concurrency limit (2-3 simultaneous)                             │
│  - Client-side total size enforcement                               │
│  - Index mapping removal (batch → per-file)                         │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SPRINT 2 (Cancel Behavior)                      │
│                   Abort Integration + Edge Cases                     │
│                                                                     │
│  - Abort HTTP on cancel during uploading                            │
│  - Ignore late WS events for canceled uploadIds                     │
│  - Multi-tab conflict handling                                      │
│  - Send + cancel race condition handling                            │
│  - Tests for all cancel scenarios                                   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SPRINT 3 (Backend - DEFERRED)                     │
│                   Server Cleanup Infrastructure                      │
│                                                                     │
│  - FK cascade migration (responses.file_id → SET NULL)              │
│  - IFileRepository.delete() method                                  │
│  - Backend cancel/cleanup endpoint                                  │
│  - S3 orphan cleanup integration                                    │
│                                                                     │
│  NOTE: Deferred to future epic - UI-only removal acceptable for MVP │
└─────────────────────────────────────────────────────────────────────┘
```

### Parallel Execution Summary

| Phase | Sprint | Can Run In Parallel | Notes |
|-------|--------|---------------------|-------|
| 1 | Sprint 0 | No - Foundation | Must complete before Sprint 1 |
| 2 | Sprint 1 | No - Requires Sprint 0 | Core refactor |
| 3 | Sprint 2 | No - Requires Sprint 1 | Edge case handling |
| 4 | Sprint 3 | DEFERRED | Backend work for future epic |

**Within each sprint**, stories may run in parallel where dependencies allow.

---

## Scope Boundaries

### In Scope (Epic 19)

| Area | Change |
|------|--------|
| `useMultiFileUpload.ts` | Per-file uploads, per-file AbortControllers, removeFile fix |
| `Composer.tsx` | Remove `hasIncompleteFiles` prop, update disable logic |
| `FileChip.tsx` | Remove amber warning, verify X visibility by stage |
| `ModeSelector.tsx` | Remove `hasIncompleteFiles` prop and warning triangle |
| `uploadStageHelpers.ts` | NEW: Central stage helper functions |
| Tests | Unit + integration for all cancel scenarios |

### Out of Scope (Deferred to Sprint 3 / Future Epic)

| Area | Reason |
|------|--------|
| FK cascade migration | Database change - separate deploy risk |
| Backend cancel endpoint | Server-side complexity - UI removal acceptable for MVP |
| S3 orphan cleanup | Background job infrastructure not ready |
| IFileRepository.delete() | Requires FK migration first |

### Explicitly Unchanged

| Area | Why |
|------|-----|
| Upload endpoint | Keep existing `POST /api/documents/upload`, call per-file |
| WebSocket events | All existing events unchanged, same handling |
| Scoring flow | No changes to scoring trigger/complete behavior |
| Document classification | Already implemented, working correctly |

---

## Sprint Files

| Sprint | File | Focus | Dependencies |
|--------|------|-------|--------------|
| 0 | `sprint-0-overview.md` | Foundation + warning removal | None |
| 1 | `sprint-1-overview.md` | Per-file upload infrastructure | Sprint 0 |
| 2 | `sprint-2-overview.md` | Cancel behavior + edge cases | Sprint 1 |
| 3 | `sprint-3-overview.md` | Backend cleanup (DEFERRED) | Sprint 2 |

---

## Key Design Decisions

### D1: Cancel Removes File (Not Error)

**Decision:** Cancel always removes the file from UI entirely. We do NOT transition to `error` state.

**Rationale:**
- User explicitly chose to cancel - they don't want to see an error
- Matches GPT/Claude behavior (cancel = gone)
- Cleaner UX - no lingering error chips for intentional cancellations
- Per behavior-matrix.md: "Cancel REMOVES file (does not transition to error)"

### D2: Per-File Uploads with Concurrency Limit

**Decision:** Each file is its own HTTP request with its own AbortController. Limit concurrent uploads to 2-3.

**Rationale:**
- Enables individual file cancellation
- Matches GPT/Claude behavior
- Concurrency limit prevents server overload
- Per behavior-matrix.md: "Max concurrent uploads: 2-3"

### D3: Client-Side Total Size Enforcement

**Decision:** Client must enforce 50MB total limit since per-file uploads bypass server batch validation.

**Rationale:**
- Server's `validateTotalSize` middleware only sees one file per request
- Client already tracks all files in state
- Per behavior-matrix.md: `wouldExceedTotalSize()` helper function

### D4: Parsing Stage is Non-Cancelable

**Decision:** X button is hidden during `parsing` stage. Users cannot cancel enrichment.

**Rationale:**
- Enrichment is a background server process
- No reliable way to abort Claude API call mid-flight
- Per behavior-matrix.md: "X Button Visibility: parsing = Hidden"

### D5: UI-Only Removal for MVP

**Decision:** Cancel/remove only updates client state. Backend cleanup deferred.

**Rationale:**
- Reduces implementation risk
- Allows faster delivery
- Server files may become orphaned (acceptable tech debt)
- Cleanup job can be added later

---

## Files Reference

### Frontend (Primary Changes)

```
apps/web/src/
├── lib/
│   ├── websocket.ts                 # FileUploadStage type (no changes)
│   └── uploadStageHelpers.ts        # NEW: Central stage helpers
├── hooks/
│   └── useMultiFileUpload.ts        # MAJOR: Per-file uploads, removeFile fix
├── components/chat/
│   ├── Composer.tsx                 # Remove hasIncompleteFiles prop
│   ├── FileChip.tsx                 # Remove amber warning, verify X visibility
│   └── ModeSelector.tsx             # Remove hasIncompleteFiles + warning triangle
└── components/chat/__tests__/
    ├── FileChip.test.tsx            # Add attached stage coverage
    └── uploadStageHelpers.test.ts   # NEW: Helper function tests
```

### Backend (Deferred - Sprint 3)

```
packages/backend/src/
├── infrastructure/
│   ├── database/
│   │   └── schema/responses.ts      # FK cascade change (DEFERRED)
│   ├── http/
│   │   ├── routes/document.routes.ts    # Cancel endpoint (DEFERRED)
│   │   └── controllers/DocumentUploadController.ts  # Cleanup (DEFERRED)
│   └── storage/
│       └── S3FileStorage.ts         # delete() already exists, add callers (DEFERRED)
└── application/
    └── interfaces/IFileRepository.ts  # Add delete() method (DEFERRED)
```

---

## Success Metrics

- [ ] X button removes file at any stage (except parsing)
- [ ] No "Cannot remove file during upload" toast for normal use
- [ ] Cancel mid-upload aborts only that file (others continue)
- [ ] No warning triangle on ModeSelector
- [ ] No amber warning on FileChip for document type
- [ ] Send button follows behavior-matrix.md rules
- [ ] All existing tests pass (no regressions)
- [ ] New tests cover all cancel scenarios

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Per-file uploads change throughput | Medium | Concurrency limit (2-3) |
| Stale closure bugs in async handlers | High | Use refs pattern, test carefully |
| Late WS events resurrect canceled files | High | Maintain canceledUploadIds set |
| Backend orphaned files | Low | Acceptable tech debt, cleanup job later |
| Regression in existing upload flow | High | Comprehensive tests, reference behavior-matrix.md |

---

## References

- **Behavior Matrix:** `tasks/epic-19/behavior-matrix.md` (AUTHORITATIVE)
- **Goals Document:** `tasks/epic-19/epic-19-goals.md`
- **Epic 17:** Multi-file upload (current batch implementation)
- **Epic 18:** Upload performance (attached stage, document classification)
