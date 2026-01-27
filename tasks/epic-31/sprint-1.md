# Sprint 1: Decouple file_attached from Extraction

**Goal:** Emit file_attached immediately after S3 + DB, before text extraction

## Dependencies & Parallelization

```
Phase 1 (Parallel - no file overlap):
┌─────────────────────────────────────────────────────────┐
│ 31.1.1 (Types/Interface) │ 31.1.2 (Background Extractor) │
└─────────────────────────────────────────────────────────┘
                    ↓
Phase 2 (Sequential - depends on Phase 1):
┌─────────────────────────────────────────────────────────┐
│ 31.1.3 (Refactor processUpload)                         │
└─────────────────────────────────────────────────────────┘
                    ↓
Phase 3 (Sequential - depends on Phase 2):
┌─────────────────────────────────────────────────────────┐
│ 31.1.4 (Update Tests)                                   │
└─────────────────────────────────────────────────────────┘
```

## Parallelization Matrix

| Story | Files Touched | Can Parallel With | Notes |
|-------|---------------|-------------------|-------|
| 31.1.1 | `application/interfaces/IBackgroundExtractor.ts` | 31.1.2 | Optional - for testability |
| 31.1.2 | `infrastructure/extraction/BackgroundExtractor.ts` | 31.1.1 | Core service |
| 31.1.3 | `infrastructure/http/controllers/DocumentUploadController.ts` | None (needs 31.1.2) | Main refactor |
| 31.1.4 | `__tests__/unit/DocumentUploadController.test.ts` | None (needs 31.1.3) | Test updates |

## Stories (4 total, 31.1.1 optional for testability)

- [31.1.1](sprint-1-story-1.md): Define IBackgroundExtractor interface (optional - for testability/DI)
- [31.1.2](sprint-1-story-2.md): Implement BackgroundExtractor service
- [31.1.3](sprint-1-story-3.md): Refactor processUpload to emit early
- [31.1.4](sprint-1-story-4.md): Update unit tests for new flow

## Definition of Done

- [ ] All stories complete
- [ ] Unit tests pass
- [ ] Integration tests pass (if DB changes)
- [ ] file_attached emits before extraction completes
- [ ] No regression in existing upload functionality
