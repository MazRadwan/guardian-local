# Epic 18: Upload Performance - Fast Attach

## Overview

Improve perceived upload performance by decoupling file attachment from background analysis. Users should see "Attached" within 2-3 seconds, regardless of how long Claude enrichment takes.

**Problem:** Current upload takes 60-120 seconds because Claude API call for context extraction blocks the "complete" state.

**Solution:** Unified "fast attach → background analysis" pattern with mode-specific behavior.

---

## Architecture Summary

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
| **Consult** | Instant (~2-3s) | Optional enrichment (suggested questions) | Yes - gets raw text excerpt |
| **Assessment** | Instant (~2-3s) | Light preprocessing (vendor/solution ID) | Yes - gets raw text excerpt |
| **Scoring** | Instant (~2-3s) | Mandatory parse + score (full workflow) | Draft yes, send after parse |

---

## Key Design Decisions

1. **New event `file_attached`**: Emitted after S3 storage, before parsing. Contains full metadata for UI display.
2. **Preserve backward compatibility**: Existing `upload_progress` events remain unchanged.
3. **Text excerpt storage**: Store first 10k chars during upload for immediate context injection.
4. **Graceful degradation**: If user messages before enrichment, Claude gets text excerpt instead of structured context.

---

## Event Flow

### New Event: `file_attached`

```typescript
interface FileAttachedEvent {
  conversationId: string;
  uploadId: string;
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
}
```

### Timeline

```
[0ms]     HTTP POST accepted (202)
[1-2s]    S3 store complete
[2-3s]    Text extraction complete → emit file_attached
[2-3s]    UI shows "Attached ✓"
[bg]      Claude enrichment runs
[60-120s] emit intake_context_ready / scoring_complete
[60-120s] UI updates with suggested questions (optional)
```

---

## Sprint Plan

### Sprint 0: Design Validation (Spike)

**Story 0.1: Measure text extraction latency**
- Test pdf-parse on representative files (10, 50, 100 pages)
- Test mammoth on representative DOCX files
- Define latency SLO: `file_attached` must emit within 3s P95
- Decision: If extraction >3s, emit without excerpt and fetch lazily

**Story 0.2: Decide excerpt storage strategy**
- Option A: `text_excerpt` column in files table
- Option B: Store in S3 as `{storagePath}.excerpt.txt`
- Option C: Redis cache with TTL

### Sprint 1: Backend - Fast Attach Infrastructure

**Story 1.1: Add `file_attached` WebSocket event**
- Emit after S3 storage + text extraction
- Payload: `{ conversationId, uploadId, fileId, filename, mimeType, size }`
- File: `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts`

**Story 1.2: Add text excerpt storage**
- Migration: Add storage for text excerpt (per Sprint 0 decision)
- Extract text during storage phase (pdf-parse/mammoth)
- Store first 10k chars for immediate context injection

**Story 1.3: Refactor `processUpload()` into two phases**
- Phase 1: Store + extract text + emit `file_attached` (~2-3s)
- Phase 2: Claude enrichment + emit completion events (background)
- Keep existing `upload_progress` events for backward compat

**Story 1.4: ChatServer fallback context injection**
- If `intakeContext` exists → use it (current behavior)
- Else if `textExcerpt` exists → inject raw text
- Else → re-read from S3 (fallback, log warning)

### Sprint 2: Frontend - Instant Attach UI

**Story 2.1: Update WebSocket types**
- Add `FileAttachedEvent` to `apps/web/src/lib/websocket.ts`
- Include full metadata for UI display

**Story 2.2: Update `useMultiFileUpload` hook**
- Listen for `file_attached` event
- New file state: `attached` (between `storing` and `parsing`)
- File shows as ready at `attached`, parsing continues in background
- Handle out-of-order events gracefully

**Story 2.3: Update `useFileUpload` hook**
- Same changes for single-file upload (backward compat)

**Story 2.4: Update `FileChip` component**
- Show "Attached ✓" at `attached` state
- Optional: Show "Enriching..." indicator if parsing still running
- Mode-specific styling

### Sprint 3: Mode-Specific Behavior

**Story 3.1: Consult mode - immediate messaging**
- Allow send when file is `attached`
- ChatServer injects `textExcerpt` if `intakeContext` not yet available
- Enrichment updates context when complete (non-blocking)

**Story 3.2: Assessment mode - light preprocessing**
- Same as consult
- Background enrichment focuses on vendor/solution ID
- Skip full gap analysis for faster completion

**Story 3.3: Scoring mode - mandatory parse with progress**
- File shows `attached` immediately
- UI shows "Scoring in progress..." overlay
- Send blocked until parse complete (or allow draft-only)
- Granular progress: "Extracting responses (12/111)..."

### Sprint 4: Resilience & Edge Cases

**Story 4.1: Background job resilience**
- Wrap enrichment in try/catch with logging
- If conversation deleted mid-parse: detect and abort gracefully
- If user revoked: check ownership before emitting events

**Story 4.2: Handle existing files without excerpt**
- Lazy backfill: Extract on first access if missing
- Log warning for monitoring

**Story 4.3: Retry logic for failed enrichment**
- Store enrichment status: `pending | processing | complete | failed`
- Manual retry button in UI for failed enrichment
- Don't block user on enrichment failures

**Story 4.4: Graceful degradation tests**
- Test: User sends message before enrichment complete
- Test: Enrichment fails, user continues conversation
- Test: Scoring parse fails, user can re-upload
- Test: Out-of-order WebSocket events

---

## File Changes Summary

| File | Changes |
|------|---------|
| `schema/files.ts` | Add `textExcerpt` column (or alternative per Sprint 0) |
| `DocumentUploadController.ts` | Split processUpload, emit `file_attached` |
| `DrizzleFileRepository.ts` | Store/retrieve textExcerpt |
| `ChatServer.ts` | Inject textExcerpt fallback for context |
| `websocket.ts` (frontend) | Add `FileAttachedEvent` type |
| `useMultiFileUpload.ts` | Handle `file_attached` event, new state |
| `useFileUpload.ts` | Same updates for single-file hook |
| `FileChip.tsx` | Show "Attached" state, mode indicators |
| `Composer.tsx` | Mode-specific send enablement |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Text extraction slower than expected | Medium | High | Sprint 0 spike, set timeout |
| Out-of-order WebSocket events | Medium | Medium | Frontend guards, event sequencing |
| Old files missing excerpt | Certain | Low | Lazy backfill on access |
| Scoring auto-trigger on wrong file | Medium | Medium | Consider confirmation step |

---

## Success Metrics

- `file_attached` latency: <3s P95
- User can see "Attached" status within 3s of selecting file
- Consult/Assessment: User can send message within 5s of upload start
- Scoring: Clear progress indication, no UI freeze

---

## References

- Epic 16: Document Parser Infrastructure (current implementation)
- Epic 17: Multi-File Upload
- `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts`
- `apps/web/src/hooks/useMultiFileUpload.ts`
