# Sprint 2: Cancel Behavior + Edge Cases

**Epic:** 19 - File Upload Chip Cancel/Remove Refactor
**Focus:** Handle edge cases when files are canceled mid-flight
**Stories:** 19.2.1 - 19.2.4 (4 stories)
**Estimated Effort:** 6-10 hours
**Dependencies:** Sprint 1 complete
**Agents:** `frontend-agent`

---

## Context

Sprint 2 handles the edge cases that arise when files are canceled during upload. The core infrastructure (per-file uploads, AbortControllers) is in place from Sprint 1. Now we need to handle:

1. **Late WebSocket events** arriving for canceled uploads
2. **Race conditions** between Send and Cancel
3. **WebSocket reconnection** leaving orphaned states
4. **Multi-tab conflicts** (same conversation in multiple tabs)

**Reference:** behavior-matrix.md Section 12 (Edge Cases)

---

## Prerequisites

### Sprint 1 Complete

| Story | Status | Provides |
|-------|--------|----------|
| 19.1.1 | Complete | `abortControllerMapRef` for per-file abort |
| 19.1.2 | Complete | `uploadSingleFile()` for individual uploads |
| 19.1.3 | Complete | Concurrent queue with limit |
| 19.1.4 | Complete | Client-side 50MB validation |

### Reference Documents

- `behavior-matrix.md` Section 12 (Edge Cases)
- `behavior-matrix.md` Section 3 (Stage Transitions on Cancel)

---

## Stories

| Story | Name | Focus | Lines | Dependencies |
|-------|------|-------|-------|--------------|
| **19.2.1** | Canceled UploadIds Tracking | Track canceled uploads to filter late events | ~200 | None |
| **19.2.2** | Late WS Event Filtering | Ignore events for canceled uploadIds | ~250 | 19.2.1 |
| **19.2.3** | Send + Cancel Race Handling | Prevent canceled files from being sent | ~200 | None |
| **19.2.4** | WebSocket Reconnect Handling | Handle orphaned states on disconnect | ~250 | None |

**Total: 4 stories, ~900 lines of planning documentation**

---

## Dependency Graph

```
                    SPRINT 2 DEPENDENCIES

    ⚠️  ALL STORIES TOUCH useMultiFileUpload.ts - SEQUENTIAL ONLY

    File Overlap Analysis:
    ┌─────────────────────────────────────────────────────────────────┐
    │ Story   │ Files Touched                     │ Conflicts         │
    ├─────────┼───────────────────────────────────┼───────────────────┤
    │ 19.2.1  │ useMultiFileUpload.ts             │ ALL Sprint 2      │
    │ 19.2.2  │ useMultiFileUpload.ts             │ ALL Sprint 2      │
    │ 19.2.3  │ useMultiFileUpload.ts, Composer   │ ALL Sprint 2      │
    │ 19.2.4  │ useMultiFileUpload.ts             │ ALL Sprint 2      │
    └─────────────────────────────────────────────────────────────────┘

    Execution Order (STRICT SEQUENTIAL):
    19.2.1 ──► 19.2.2 ──► 19.2.3 ──► 19.2.4
       │          │          │          │
       └──────────┴──────────┴──────────┘
            All modify useMultiFileUpload.ts
```

---

## Parallel Execution Strategy

### ⚠️ NO PARALLELISM POSSIBLE

**All 4 stories modify `useMultiFileUpload.ts`.** Sub-agents editing the same file simultaneously will fail with "File modified since read."

**Sprint 2 must be executed sequentially.** One agent, one story at a time.

---

### Sequential Execution Order

```
┌────────────────────────────────────────────────────────────────────┐
│                   SPRINT 2 - SEQUENTIAL ONLY                       │
│           (All stories modify useMultiFileUpload.ts)               │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│   19.2.1: Canceled UploadIds Tracking                              │
│       └─► Adds canceledUploadIdsRef Set                            │
│           │                                                        │
│           ▼                                                        │
│   19.2.2: Late WS Event Filtering                                  │
│       └─► Filters WS handlers using canceledUploadIdsRef           │
│           │                                                        │
│           ▼                                                        │
│   19.2.3: Send + Cancel Race Handling                              │
│       └─► Excludes canceled files from send payload                │
│           (also modifies Composer.tsx)                             │
│           │                                                        │
│           ▼                                                        │
│   19.2.4: WebSocket Reconnect Handling                             │
│       └─► Handles orphaned states on disconnect                    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Agents needed:** 1 (sequential)
**Review:** After each story complete (incremental review recommended)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 19.2.1 | `sprint-2-story-19.2.1-canceled-tracking.md` | frontend-agent |
| 19.2.2 | `sprint-2-story-19.2.2-late-event-filter.md` | frontend-agent |
| 19.2.3 | `sprint-2-story-19.2.3-send-race.md` | frontend-agent |
| 19.2.4 | `sprint-2-story-19.2.4-reconnect.md` | frontend-agent |

---

## Key Design Decisions

### Canceled UploadId Tracking

**Current:** No tracking of which uploadIds were canceled
**Target:** `canceledUploadIdsRef` Set<string> to track canceled uploads

```typescript
// When file is canceled (in removeFile)
if (file.uploadId) {
  canceledUploadIdsRef.current.add(file.uploadId);
}

// When WS event arrives (in handlers)
if (canceledUploadIdsRef.current.has(uploadId)) {
  return; // Ignore - file was canceled
}
```

### Late Event Handling

Per behavior-matrix.md:
> `file_attached` / `upload_progress` may arrive after cancel; UI must drop updates for canceled uploadIds.

**Events to filter:**
- `file_attached` - Sets stage to 'attached', assigns fileId
- `upload_progress` - Updates progress percentage
- `enrichment_progress` - Updates parsing progress

### Send + Cancel Race Condition

Per behavior-matrix.md:
> If user clicks Send then X quickly, ensure canceled file is not parsed/scored and not included in chat attachments.

**Solution:**
1. Check canceled set when building send payload
2. Exclude canceled uploadIds from attachment list
3. Clear pending clarification if file canceled

### WebSocket Reconnect

Per behavior-matrix.md:
> Reconnect / WS drop: Ensure in-flight uploads resolve to `error` or `complete` after timeout; avoid stuck `uploading/storing` chips.

**Solution:**
- Track last activity timestamp per upload
- On reconnect, check for stale uploads
- Transition stale uploads to `error` state with timeout message

---

## Files to Modify

### Primary Changes

| File | Changes |
|------|---------|
| `useMultiFileUpload.ts` | Add canceledUploadIdsRef, filter WS handlers |
| `Composer.tsx` | Check canceled set before send |

### No Changes Required

| File | Reason |
|------|--------|
| FileChip | UI rendering unchanged |
| ModeSelector | Already fixed in Sprint 0 |
| Backend | No server-side changes |

---

## Behavior Matrix References

| Story | Behavior Matrix Sections |
|-------|-------------------------|
| 19.2.1 | Stage Transitions (150-163) - cancel design decision |
| 19.2.2 | Edge Cases (566-573) - late events after cancel |
| 19.2.3 | Edge Cases (573-574) - send + cancel race |
| 19.2.4 | Edge Cases (579) - reconnect / WS drop |

---

## Success Metrics

- [ ] Canceled uploadIds tracked in Set
- [ ] Late WS events ignored for canceled uploads
- [ ] Send excludes canceled files from payload
- [ ] Reconnect transitions stale uploads to error
- [ ] No file resurrection after cancel
- [ ] All existing tests pass
- [ ] New tests for all edge case scenarios

---

## Exit Criteria

Sprint 2 is complete when:

- [ ] Story 19.2.1: canceledUploadIdsRef implemented
- [ ] Story 19.2.2: WS handlers filter canceled uploads
- [ ] Story 19.2.3: Send payload excludes canceled files
- [ ] Story 19.2.4: Reconnect handles orphaned states
- [ ] Cancel file → late file_attached → file stays gone
- [ ] Click Send then X → file not in message
- [ ] Disconnect during upload → error state after timeout
- [ ] All unit tests passing
- [ ] Code reviewed and approved

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Race between cancel and WS event | Synchronous check of canceledUploadIds before state update |
| Memory leak from canceled Set growing | Clear on clearAll(), new conversation, 5-minute expiry |
| False positives filtering valid events | Only track uploadIds that were explicitly canceled |
| Complex async timing | Use refs for synchronous access, comprehensive tests |
