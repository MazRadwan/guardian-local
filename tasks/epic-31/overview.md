# Epic 31: Parallel File Upload Processing

**Status:** Planning
**Created:** 2026-01-27
**Goal:** Fix file upload performance - emit file_attached before extraction to prevent event loop starvation

## Problem Statement

Multi-file uploads appear sequential (47s for 6MB PDF + 23KB DOCX instead of ~17s) because:
1. CPU-bound text extraction (pdf-parse, mammoth) blocks Node event loop
2. Even though promises start concurrently, one heavy extraction starves others
3. 3s timeout can't fire while event loop is blocked

**Root Cause:** NOT the for...of loop (it doesn't await). It's event loop starvation from CPU-bound extraction.

## Solution

Decouple `file_attached` emission from text extraction:
1. Store file to S3
2. Create DB record
3. Emit `file_attached` immediately
4. Run text extraction as background task (fire-and-forget)
5. Update `textExcerpt` when extraction completes

This works because FileContextBuilder already has S3 fallback for missing excerpts.

**Rollout Safety:** Add `UPLOAD_EXTRACT_ASYNC` environment variable (default: false in production, true in staging) to enable/disable async extraction for safe rollout and A/B testing.

## Sprints

| Sprint | Focus | Stories | Estimated |
|--------|-------|---------|-----------|
| Sprint 1 | Core fix - decouple file_attached from extraction | 4 | Interface, service, refactor, tests |
| Sprint 2 | Race condition mitigation (heuristic wait) | 2 | MessageHandler retry, user feedback |
| Sprint 3 | Optional enhancements (bounded queue, metrics) | 2 | Concurrency queue, metrics |

**Total Stories:** 8

## Execution Order

```
Sprint 1 (Core Fix)
    ┌─────────────────────────────────────────────────────┐
    │ Phase 1 (Parallel - no file overlap):               │
    │   31.1.1 (Types/Interface) ║ 31.1.2 (Background Ext)│
    │                            ↓                        │
    │ Phase 2 (Sequential):                               │
    │   31.1.3 (Refactor processUpload)                   │
    │                            ↓                        │
    │ Phase 3 (Sequential):                               │
    │   31.1.4 (Update Tests)                             │
    └─────────────────────────────────────────────────────┘
                    ↓
Sprint 2 (Race Condition) - Sequential, depends on Sprint 1
                    ↓
Sprint 3 (Optional) - Only if Sprint 1 doesn't fully resolve
```

## Files Created/Modified

### New Files
- `packages/backend/src/application/interfaces/IBackgroundExtractor.ts` - Background extraction interface
- `packages/backend/src/infrastructure/extraction/BackgroundExtractor.ts` - Implementation
- `packages/backend/src/infrastructure/extraction/index.ts` - Barrel export
- `packages/backend/__tests__/unit/infrastructure/extraction/BackgroundExtractor.test.ts` - Unit tests

### Modified Files
- `packages/backend/src/application/interfaces/index.ts` - Export new interface
- `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts` - Refactor processUpload
- `packages/backend/__tests__/unit/DocumentUploadController.test.ts` - Update tests

## Success Criteria

- [ ] 6MB PDF + 23KB DOCX uploads complete in ~17s (not 47s)
- [ ] E2E timing tests (Scenario D) pass
- [ ] No regression in existing upload functionality
- [ ] Race condition window reduced

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Extraction completes after message sent | Medium | Sprint 2 heuristic wait |
| Background extraction errors lost | Low | Comprehensive logging |
| Memory pressure from queued buffers | Low | Sprint 3 bounded queue (if needed) |

## Definition of Done

- [ ] Sprint 1 complete (minimum viable fix)
- [ ] All tests pass (unit + integration)
- [ ] E2E timing test passes
- [ ] No regressions in existing functionality
