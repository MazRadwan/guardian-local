# Epic 17: Multi-File Upload

## Overview

Enable users to upload multiple files in a single message. This epic extends the existing single-file upload infrastructure (Epic 16) to support batched uploads with per-file progress tracking.

**Scope:** Intake mode only. Scoring mode remains single-file until Epic 15 decisions are finalized.

---

## Architecture Summary

### Current State (Epic 16)
```
User selects file → Upload → Parse → Single FileChip in Composer → Send
```

### Target State (Epic 17)
```
User selects files → Upload batch → Parse each → Multiple FileChips → Send
```

### Key Design Decisions

1. **New Hook vs Refactor:** Create `useMultiFileUpload` hook (safer migration path)
2. **Upload Strategy:** Single batch HTTP request (simpler), parallel parsing per file
3. **ID Lifecycle:** `localIndex` (client array position) → `uploadId` (server-generated) → `fileId` (database UUID)
4. **State Management:** Array-based state with index correlation, NOT Map with client-generated IDs
5. **Backward Compatibility:** Single-file flow still works (batch of 1)
6. **Preserve Epic 16 Patterns:** "Never adopt" for WS events, AbortController, async parsing

---

## What's Already Multi-Ready (No Changes Needed)

| Layer | Status | Reason |
|-------|--------|--------|
| Database `files` table | ✅ Ready | One row per file, no limit |
| `messages.attachments` | ✅ Ready | JSONB array |
| ChatServer validation | ✅ Ready | Already loops over `attachments[]` |
| Frontend types | ✅ Ready | `attachments?: { fileId }[]` |
| FileChipInChat | ✅ Ready | Already maps over array |
| Download endpoint | ✅ Ready | Per-file download by fileId |

---

## Sprint Structure

### Sprint 1: Foundation (Parallel Execution)

Three independent tracks that can run simultaneously:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPRINT 1 (Parallel)                          │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Track A       │   Track B       │   Track C                   │
│   Backend       │   FileChip      │   Hook                      │
│                 │                 │                             │
│   17.1.1-17.1.4 │   17.2.1-17.2.3 │   17.3.1-17.3.5             │
│                 │                 │                             │
│   ~2 hours      │   ~1 hour       │   ~4 hours                  │
└─────────────────┴─────────────────┴─────────────────────────────┘
                              │
                              ▼
                    [Code Review Gate]
```

### Sprint 2: Integration (Sequential)

Depends on all Sprint 1 tracks completing:

```
┌─────────────────────────────────────────────────────────────────┐
│                  SPRINT 2 (Sequential)                          │
├─────────────────────────────────────────────────────────────────┤
│   17.4: Composer Integration                                    │
│         └── depends on: Track B (FileChip) + Track C (Hook)     │
├─────────────────────────────────────────────────────────────────┤
│   17.5: E2E Testing                                             │
│         └── depends on: 17.4 + Track A (Backend)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    [Code Review Gate]
```

---

## File Map

### Sprint 1 - Track A (Backend)
| File | Action |
|------|--------|
| `packages/backend/src/infrastructure/http/routes/document.routes.ts` | Modify |
| `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts` | Modify |
| `packages/backend/__tests__/unit/DocumentUploadController.test.ts` | Modify |

### Sprint 1 - Track B (FileChip)
| File | Action |
|------|--------|
| `apps/web/src/components/chat/FileChip.tsx` | Modify |
| `apps/web/src/components/chat/__tests__/FileChip.test.tsx` | Modify |

### Sprint 1 - Track C (Hook)
| File | Action |
|------|--------|
| `apps/web/src/hooks/useMultiFileUpload.ts` | Create |
| `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx` | Create |

### Sprint 2 (Integration)
| File | Action |
|------|--------|
| `apps/web/src/components/chat/Composer.tsx` | Modify |
| `apps/web/src/components/chat/__tests__/Composer.test.tsx` | Modify |
| `apps/web/src/hooks/useFileUpload.ts` | Deprecate (optional) |

---

## Agent Instructions

### For Implementation Agents

1. **Read your sprint doc first** - Contains all context needed
2. **Don't cross tracks** - Stay within your assigned files
3. **Run tests before completing** - All tests must pass
4. **Request code review** - After completing all stories in your track

### For Code Reviewer

Review criteria for each track:

**Track A (Backend):**
- [ ] multer configured with MAX_COUNT = 10
- [ ] 202 immediate response (preserves Epic 16 async pattern)
- [ ] Per-file uploadId returned in response array
- [ ] Per-file progress events emitted via WebSocket
- [ ] Partial failure doesn't block successful files
- [ ] Unit tests cover multi-file scenarios

**Track B (FileChip):**
- [ ] disabled prop hides X button when true
- [ ] Compact variant doesn't break existing usage
- [ ] Accessibility preserved (keyboard, screen reader)
- [ ] Backward compatible (existing Composer usage unchanged)

**Track C (Hook):**
- [ ] Clean state management (no stale references)
- [ ] Memory cleanup on unmount
- [ ] Progress aggregation is accurate
- [ ] ID lifecycle correct (localIndex → uploadId → fileId)
- [ ] "Never adopt" pattern for WS events (knownUploadIdsRef)
- [ ] NO filename-based correlation anywhere

**Sprint 2:**
- [ ] Composer layout handles 1-10 files gracefully
- [ ] E2E flow works end-to-end
- [ ] No regressions in single-file flow

---

## Constants & Limits (Authoritative)

```typescript
// AUTHORITATIVE - Single source of truth
const MAX_FILES_PER_MESSAGE = 10;
const MAX_FILE_SIZE_MB = 20;      // Per file (existing Epic 16 limit)
const MAX_TOTAL_BATCH_SIZE_MB = 50; // Total for all files combined

// Validation order:
// 1. Check file count (max 10)
// 2. Check each file size (max 20MB)
// 3. Check total batch size (max 50MB)
```

**Note:** These limits are defined in `sprint-1-backend.md` and must be consistent across all sprint docs.

---

## Story Index

| Story | Track | Description | Doc |
|-------|-------|-------------|-----|
| 17.1.1 | A | Multer array config | `sprint-1-backend.md` |
| 17.1.2 | A | Controller batch processing | `sprint-1-backend.md` |
| 17.1.3 | A | Per-file progress events | `sprint-1-backend.md` |
| 17.1.4 | A | Backend unit tests | `sprint-1-backend.md` |
| 17.2.1 | B | FileChip disabled prop | `sprint-1-filechip.md` |
| 17.2.2 | B | FileChip compact variant | `sprint-1-filechip.md` |
| 17.2.3 | B | FileChip tests | `sprint-1-filechip.md` |
| 17.3.1 | C | Multi-file state interface | `sprint-1-hook.md` |
| 17.3.2 | C | Core operations | `sprint-1-hook.md` |
| 17.3.3 | C | Progress tracking | `sprint-1-hook.md` |
| 17.3.4 | C | WebSocket integration | `sprint-1-hook.md` |
| 17.3.5 | C | Hook unit tests | `sprint-1-hook.md` |
| 17.4.1 | - | Composer multi-chip layout | `sprint-2-integration.md` |
| 17.4.2 | - | Composer file removal UX | `sprint-2-integration.md` |
| 17.4.3 | - | Composer tests | `sprint-2-integration.md` |
| 17.5.1 | - | E2E multi-file flow | `sprint-2-integration.md` |
| 17.5.2 | - | Error handling polish | `sprint-2-integration.md` |

---

## Success Criteria

- [ ] User can select and upload up to 10 files at once
- [ ] Each file shows individual progress
- [ ] User can remove individual files before sending
- [ ] Partial failures show clear error state per file
- [ ] Single-file flow unchanged (backward compatible)
- [ ] All existing tests pass
- [ ] New tests cover multi-file scenarios
- [ ] Code review approved for each sprint

---

## Out of Scope

- Drag-and-drop (future enhancement)
- Inline file preview (future enhancement)
- Scoring mode multi-file (depends on Epic 15)
- File reordering
- Duplicate file detection
