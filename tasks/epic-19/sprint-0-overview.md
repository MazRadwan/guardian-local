# Sprint 0: Foundation - Stage Helpers + Warning Removal

**Epic:** 19 - File Upload Chip Cancel/Remove Refactor
**Focus:** Foundation work enabling cancel/remove behavior
**Stories:** 19.0.1 - 19.0.5 (5 stories)
**Estimated Effort:** 4-6 hours
**Dependencies:** None (first sprint)
**Agents:** `frontend-agent`

---

## Context

Sprint 0 establishes the foundation for the cancel/remove refactor by:
1. Creating centralized stage helper functions (single source of truth)
2. Removing UI warning indicators that cause confusion
3. Fixing the immediate `removeFile()` bug for `attached` stage

**Why this comes first:**
- Helper functions must exist before Sprint 1 refactors upload logic
- Warning removal is independent and reduces UI clutter immediately
- `attached` removal fix provides quick user value

---

## Prerequisites

### Reference Document

**CRITICAL:** All implementations must reference `behavior-matrix.md` sections:
- Stage Definitions (lines 25-68)
- Action Matrix by Stage (lines 166-206)
- UI Affordances (lines 385-424)
- Central Helper Functions (lines 591-743)

### Files to Read Before Implementation

| File | Why |
|------|-----|
| `behavior-matrix.md` | AUTHORITATIVE source for all behavior |
| `useMultiFileUpload.ts` | Current removeFile() implementation |
| `Composer.tsx` | hasIncompleteFiles usage |
| `FileChip.tsx` | Current warning logic |
| `ModeSelector.tsx` | Warning triangle rendering |

---

## Stories

| Story | Name | Focus | Lines | Dependencies |
|-------|------|-------|-------|--------------|
| **19.0.1** | Stage Helper Functions | Create uploadStageHelpers.ts | ~300 | None |
| **19.0.2** | ModeSelector Warning Removal | Remove hasIncompleteFiles prop | ~200 | None |
| **19.0.3** | FileChip Warning Removal | Remove amber doc type warning | ~250 | None |
| **19.0.4** | Attached Stage Removal Fix | Allow removeFile at attached | ~200 | 19.0.1 |
| **19.0.5** | Enable Cancel During Upload | Enable X button during uploading/storing | ~250 | None |

**Total: 5 stories, ~1,200 lines of planning documentation**

---

## Dependency Graph

```
                    SPRINT 0 DEPENDENCIES

    ⚠️  FILE OVERLAP CONSTRAINTS - Limited parallelism possible

    File Overlap Analysis:
    ┌─────────────────────────────────────────────────────────────────┐
    │ Story   │ Files Touched                    │ Conflicts          │
    ├─────────┼──────────────────────────────────┼────────────────────┤
    │ 19.0.1  │ uploadStageHelpers.ts (NEW)      │ 19.0.5             │
    │ 19.0.2  │ ModeSelector.tsx, Composer.tsx   │ 19.0.5             │
    │ 19.0.3  │ FileChip.tsx                     │ None ✅            │
    │ 19.0.4  │ useMultiFileUpload.ts            │ Sprint 1           │
    │ 19.0.5  │ Composer.tsx, uploadStageHelpers │ 19.0.1, 19.0.2     │
    └─────────────────────────────────────────────────────────────────┘

    Execution Order:
    ┌─────────────────────────────────────────────────────────────────┐
    │   PHASE 1: Run in parallel (no file overlap)                    │
    │   ├── 19.0.1 (uploadStageHelpers.ts)                            │
    │   ├── 19.0.2 (ModeSelector.tsx, Composer.tsx)                   │
    │   ├── 19.0.3 (FileChip.tsx)                                     │
    │   └── 19.0.4 (useMultiFileUpload.ts)                            │
    └─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │   PHASE 2: Sequential (depends on 19.0.1 + 19.0.2 files)        │
    │   └── 19.0.5 (Enable Cancel During Upload)                      │
    │       - Uses uploadStageHelpers.ts from 19.0.1                  │
    │       - Modifies Composer.tsx (also modified by 19.0.2)         │
    └─────────────────────────────────────────────────────────────────┘
```

---

## Parallel Execution Strategy

### ⚠️ File Conflict Warning

**Sub-agents editing the same file simultaneously will fail.** When two agents read → modify → write the same file, the second write fails with "File modified since read."

**Rule:** One agent per file. Check file overlap before parallelizing.

---

### Phase 1: Foundation (4 stories in parallel)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                          PHASE 1 - RUN IN PARALLEL                                  │
│                     (No file overlap between these stories)                         │
├────────────────────┬────────────────────┬────────────────────┬─────────────────────┤
│   19.0.1           │   19.0.2           │   19.0.3           │   19.0.4            │
│   Stage Helpers    │   ModeSelector     │   FileChip         │   Attached Removal  │
│                    │   Warning Removal  │   Warning Removal  │                     │
│   FILES:           │   FILES:           │   FILES:           │   FILES:            │
│   uploadStage-     │   ModeSelector.tsx │   FileChip.tsx     │   useMultiFile-     │
│   Helpers.ts (NEW) │   Composer.tsx     │                    │   Upload.ts         │
│                    │                    │                    │                     │
│   frontend-agent   │   frontend-agent   │   frontend-agent   │   frontend-agent    │
└────────────────────┴────────────────────┴────────────────────┴─────────────────────┘
```

**Stories:** 19.0.1, 19.0.2, 19.0.3, 19.0.4
**Agents needed:** Up to 4 (or sequential if limited)
**File overlap:** None - each story touches unique files
**Review:** After all 4 complete

---

### Phase 2: Enable Cancel (1 story - MUST be sequential)

```
┌────────────────────────────────────────────────────────────────────┐
│                   PHASE 2 - SEQUENTIAL                             │
│           (Depends on files modified in Phase 1)                   │
├────────────────────────────────────────────────────────────────────┤
│   19.0.5                                                           │
│   Enable Cancel During Upload                                      │
│                                                                    │
│   FILES:                                                           │
│   - uploadStageHelpers.ts (created by 19.0.1)                      │
│   - Composer.tsx (modified by 19.0.2)                              │
│                                                                    │
│   ⚠️  MUST wait for 19.0.1 and 19.0.2 to complete                  │
│                                                                    │
│   frontend-agent                                                   │
└────────────────────────────────────────────────────────────────────┘
```

**Stories:** 19.0.5
**Agents needed:** 1
**Dependencies:** Requires 19.0.1 AND 19.0.2 complete (file overlap)
**Review:** After complete (Sprint 0 complete)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 19.0.1 | `sprint-0-story-19.0.1-stage-helpers.md` | frontend-agent |
| 19.0.2 | `sprint-0-story-19.0.2-modeselector-warning.md` | frontend-agent |
| 19.0.3 | `sprint-0-story-19.0.3-filechip-warning.md` | frontend-agent |
| 19.0.4 | `sprint-0-story-19.0.4-attached-removal.md` | frontend-agent |
| 19.0.5 | `sprint-0-story-19.0.5-enable-cancel-during-upload.md` | frontend-agent |

---

## Key Design Decisions

### Helper Functions as Single Source of Truth

Per behavior-matrix.md Section 11 (Central Helper Functions):

```typescript
// File: apps/web/src/lib/uploadStageHelpers.ts

// Stage categories (from behavior-matrix.md lines 42-61)
REMOVABLE_STAGES    = ['pending', 'uploading', 'storing', 'attached', 'complete', 'error']
CANCELABLE_STAGES   = ['uploading', 'storing']
SENDABLE_STAGES     = ['attached', 'parsing', 'complete']
BLOCKING_STAGES     = ['pending', 'uploading', 'storing']
TERMINAL_STAGES     = ['complete', 'error']
POST_UPLOAD_STAGES  = ['attached', 'parsing']
```

All components MUST use these helpers instead of inline stage checks.

### Warning Removal Rationale

Per behavior-matrix.md Section 6 (Mode-Specific Behaviors):

> **Document Type Handling (Chat-Based)**
> Document type issues are communicated via chat messages from the backend, not UI indicators on FileChip or ModeSelector.

The `scoring_error` event at `ChatServer.ts:703-708` already handles this via chat.

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/uploadStageHelpers.ts` | Central stage helper functions |
| `apps/web/src/lib/__tests__/uploadStageHelpers.test.ts` | Helper function tests |

### Modified Files

| File | Changes |
|------|---------|
| `ModeSelector.tsx` | Remove `hasIncompleteFiles` prop and warning triangle |
| `FileChip.tsx` | Remove `hasDocTypeMismatch` logic and amber styling |
| `Composer.tsx` | Remove `hasIncompleteFiles` computation and prop |
| `useMultiFileUpload.ts` | Use `isRemovable()` helper in removeFile() |

---

## Behavior Matrix References

Each story MUST reference these specific sections:

| Story | Behavior Matrix Sections |
|-------|-------------------------|
| 19.0.1 | Stage Definitions (25-68), Central Helper Functions (591-743) |
| 19.0.2 | Mode Switch Action (207-218) |
| 19.0.3 | Document Type Handling (295-317), UI Affordances (385-424) |
| 19.0.4 | Action Matrix - Remove/Cancel (166-179), Stage Categories (39-68) |

---

## Success Metrics

- [ ] `uploadStageHelpers.ts` created with all helper functions
- [ ] All helper functions have unit tests
- [ ] ModeSelector has no warning triangle (any file, any mode)
- [ ] FileChip has no amber warning for document type
- [ ] `attached` files can be removed without toast
- [ ] X button visible during `uploading` and `storing` stages
- [ ] X button hidden only during `parsing` stage
- [ ] All existing tests pass
- [ ] No regressions in upload/send flow

---

## Exit Criteria

Sprint 0 is complete when:

- [ ] Story 19.0.1: uploadStageHelpers.ts exists with tests
- [ ] Story 19.0.2: ModeSelector warning triangle removed
- [ ] Story 19.0.3: FileChip amber warning removed
- [ ] Story 19.0.4: `attached` stage removal works (no toast)
- [ ] Story 19.0.5: X button visible during uploading/storing stages
- [ ] All unit tests passing
- [ ] Code reviewed and approved
- [ ] Behavior matrix compliance verified
