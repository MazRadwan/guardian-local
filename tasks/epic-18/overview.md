# Epic 18: Upload Performance - Fast Attach

## Overview

Improve perceived upload performance by decoupling file attachment from background analysis. Users should see "Attached" within 2-3 seconds, regardless of how long Claude enrichment takes.

**Problem:** Current upload takes 60-120 seconds because Claude API call for context extraction blocks the "complete" state.

**Solution:** Unified "fast attach → background analysis" pattern with mode-specific behavior.

---

## Architecture

### Current State
```
Upload → Store (2s) → Claude Parse (60-120s) → Complete
                                    ↑
                            User waits here
```

### Target State
```
Upload → Store (2s) → file_attached → User sees "Attached" ✓
                           ↓
                    [Background: Claude enrichment]
                           ↓
                    context_ready (later, non-blocking)
```

---

## Mode-Specific Behavior

| Mode | Attach | Background Work | Can Message Before Complete? |
|------|--------|-----------------|------------------------------|
| **Consult** | Instant (~2-3s) | Optional enrichment | Yes - gets text excerpt |
| **Assessment** | Instant (~2-3s) | Light preprocessing | Yes - gets text excerpt |
| **Scoring** | Instant (~2-3s) | Mandatory parse + score | Draft yes, send gated |

---

## Sprint Dependency Chart

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SPRINT 0 (Blocking)                         │
│                      Discovery Spike & Decisions                    │
│         Decisions: SLO, storage strategy, event contract,           │
│                   legacy files, scoring UX                          │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
        ┌──────────────────────────┴──────────────────────────┐
        │                                                      │
        ▼                                                      ▼
┌───────────────────┐                              ┌───────────────────┐
│    SPRINT 1A      │                              │    SPRINT 1B      │
│  Backend: Events  │                              │ Frontend: Types   │
│  & Storage Layer  │                              │   & Hook Shell    │
│                   │                              │                   │
│ - file_attached   │                              │ - WS types        │
│ - excerpt storage │                              │ - State machine   │
│ - two-phase flow  │                              │ - FileChip states │
└───────────────────┘                              └───────────────────┘
        │                                                      │
        └──────────────────────────┬──────────────────────────┘
                                   │
                                   ▼
                    ┌───────────────────────────────┐
                    │          SPRINT 2             │
                    │     Integration & Wiring      │
                    │                               │
                    │ - Connect frontend to backend │
                    │ - Context injection fallback  │
                    │ - Event ordering guards       │
                    └───────────────────────────────┘
                                   │
                                   ▼
                    ┌───────────────────────────────┐
                    │          SPRINT 3             │
                    │    Mode-Specific Behavior     │
                    │                               │
                    │ - Consult: immediate send     │
                    │ - Assessment: light enrich    │
                    │ - Scoring: gated + progress   │
                    └───────────────────────────────┘
```

### Parallel Execution Summary

| Phase | Sprints | Can Run In Parallel |
|-------|---------|---------------------|
| 1 | Sprint 0 | No - blocking decisions |
| 2 | Sprint 1A, Sprint 1B | Yes - independent tracks |
| 3 | Sprint 2 | No - requires 1A + 1B |
| 4 | Sprint 3 | No - requires Sprint 2 |

---

## Open Decisions (Sprint 0)

These must be resolved before implementation sprints begin:

### D1: Text Extraction SLO
- **Question:** What is the P95 latency target for `file_attached`?
- **Proposed:** 3 seconds
- **If exceeded:** Emit `file_attached` without excerpt, fetch lazily

### D2: Excerpt Storage Strategy
- **Option A:** `text_excerpt TEXT` column in files table (simple, risk of bloat)
- **Option B:** S3 sidecar file `{storagePath}.excerpt.txt` (clean separation)
- **Option C:** Redis cache with 24h TTL (ephemeral, regenerate if missing)
- **Recommendation:** TBD after Sprint 0 measurements

### D3: Event Ordering Contract
- **Question:** How should frontend handle `file_attached` arriving before/after `upload_progress`?
- **Options:**
  - A) Backend guarantees ordering (sequence numbers)
  - B) Frontend handles any order (state machine guards)
- **Recommendation:** Option B (simpler backend, robust frontend)

### D4: Legacy Files (No Excerpt)
- **Question:** How to handle files uploaded before Epic 18?
- **Options:**
  - A) Lazy backfill: Extract on first message
  - B) Accept fallback: Re-read from S3 (slower)
  - C) Batch migration job
- **Recommendation:** Option A with Option B as fallback

### D5: Scoring UX - Auto-Trigger vs Gate
- **Question:** Should scoring start automatically after parse, or require user confirmation?
- **Current:** Auto-trigger (Epic 15)
- **Concern:** Wasted compute if wrong file uploaded
- **Options:**
  - A) Keep auto-trigger (current behavior)
  - B) Add "Start Scoring" confirmation button
  - C) Auto-trigger with 5s cancel window
- **Recommendation:** TBD based on product input

---

## Design Constraints (Non-Negotiable)

### C1: Backward Compatibility
- Existing `upload_progress` events MUST continue working
- Existing clients that don't handle `file_attached` MUST NOT break
- `file_attached` is additive, not replacing existing events

### C2: Resilience Requirements
- Background enrichment MUST NOT block user interaction
- Conversation deletion mid-parse: abort gracefully, no orphan jobs
- User session expiry: check ownership before emitting events
- Enrichment failure: user can still send messages (degraded mode)

### C3: Security Invariants
- `fileId` (database UUID) exposed to client, NOT `storagePath`
- Conversation ownership validated before any operation
- Text excerpt subject to same access controls as full file

### C4: No Regression in Scoring
- Scoring persistence unchanged (exports depend on stored results)
- Dimension scores and assessment results MUST still be written
- Progress events MUST still be emitted for scoring workflow

---

## Sprint Files

| Sprint | File | Focus | Dependencies |
|--------|------|-------|--------------|
| 0 | `sprint-0-discovery-spike.md` | Decisions & measurements | None |
| 1A | `sprint-1a-backend-events.md` | Backend event + storage | Sprint 0 |
| 1B | `sprint-1b-frontend-types.md` | Frontend types + states | Sprint 0 |
| 2 | `sprint-2-integration.md` | Wiring + fallbacks | Sprint 1A, 1B |
| 3 | `sprint-3-mode-behavior.md` | Mode-specific UX | Sprint 2 |

---

## Success Metrics

- `file_attached` latency: <3s P95
- User sees "Attached" status within 3s of selecting file
- Consult/Assessment: User can send message within 5s of upload start
- Scoring: Clear progress indication, no perceived freeze
- Zero regressions in existing upload functionality

---

## Key Files Reference

**Backend:**
- `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts`
- `packages/backend/src/infrastructure/http/routes/document.routes.ts`
- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
- `packages/backend/src/infrastructure/database/schema/files.ts`
- `packages/backend/src/infrastructure/database/repositories/DrizzleFileRepository.ts`

**Frontend:**
- `apps/web/src/hooks/useMultiFileUpload.ts`
- `apps/web/src/hooks/useFileUpload.ts`
- `apps/web/src/components/chat/FileChip.tsx`
- `apps/web/src/components/chat/Composer.tsx`
- `apps/web/src/lib/websocket.ts`

---

## References

- Epic 16: Document Parser Infrastructure
- Epic 17: Multi-File Upload
- Epic 15: Scoring Analysis (auto-trigger behavior)
