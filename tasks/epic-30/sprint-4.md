# Sprint 4: Testing & Polish

## Goal

Comprehensive testing, edge case handling, and documentation.

## Dependencies

- Sprints 1-3 complete

## Stories

### 30.4.1: Integration Tests

**Description:** End-to-end integration tests for the Vision pipeline.

**Acceptance Criteria:**
- [ ] Test: Upload PNG → Claude receives Vision block → responds about image
- [ ] Test: Upload JPG → same flow works
- [ ] Test: Upload PDF + image → both processed correctly
- [ ] Test: Large image (4-5MB) → warning logged, still works
- [ ] Test: Oversized image (>5MB) → graceful rejection (API limit)

**Technical Approach:**
- Create test fixtures with sample images
- Mock Claude API responses
- Verify request payload contains image blocks

**Files Touched:**
- `packages/backend/__tests__/integration/vision-pipeline.test.ts` - NEW: Integration tests

**Agent:** backend-agent

**Tests Required:**
- This story IS the tests

---

### 30.4.2: Error Handling & Logging

**Description:** Add comprehensive error handling and logging throughout Vision pipeline.

**Acceptance Criteria:**
- [ ] S3 retrieval failures logged and handled gracefully
- [ ] Base64 encoding failures don't crash the request
- [ ] Clear log messages for debugging: `[VisionContentBuilder]`, `[FileContextBuilder]`
- [ ] Fallback message to user if image can't be processed

**Technical Approach:**
```typescript
try {
  const buffer = await this.fileStorage.retrieve(file.storagePath);
  // ...
} catch (error) {
  // SECURITY: Log only fileId, NOT filename (may contain PHI)
  console.error(`[VisionContentBuilder] Failed to retrieve image: fileId=${file.id}`, error);
  return null; // Graceful fallback
}
```

**Files Touched:**
- `packages/backend/src/infrastructure/ai/VisionContentBuilder.ts` - Error handling
- `packages/backend/src/infrastructure/websocket/context/FileContextBuilder.ts` - Error handling

**Agent:** backend-agent

**Tests Required:**
- `VisionContentBuilder.test.ts` - S3 error → null returned
- `FileContextBuilder.test.ts` - VisionContentBuilder error → continues with text

---

### 30.4.3: Mode-Specific Behavior (Consult Only)

**Description:** Verify Vision support works in Consult mode only. Assessment mode is out of scope for Epic 30.

**Acceptance Criteria:**
- [ ] Consult mode: Images analyzed by Claude ✓
- [ ] Assessment mode: Images NOT processed via Vision (out of scope)
- [ ] Scoring mode: Images NOT processed via this path (uses DocumentParser)
- [ ] Mode check enforced in pipeline

**Technical Approach:**
- Add mode check in FileContextBuilder or ConversationContextBuilder
- Only process images for Vision API when `mode === 'consult'`
- Other modes fall back to existing text-only behavior

**Files Touched:**
- `packages/backend/src/infrastructure/websocket/context/FileContextBuilder.ts` - Add mode check
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - Pass mode to context builders

**Agent:** backend-agent

**Tests Required:**
- `FileContextBuilder.test.ts` - Consult mode with image → Vision blocks
- `FileContextBuilder.test.ts` - Assessment mode with image → text only (no Vision)
- `FileContextBuilder.test.ts` - Scoring mode → existing path unchanged

---

### 30.4.4: DocumentParserService Regression Test (REQUIRED)

**Description:** Ensure ClaudeClient changes do not break the existing Vision path used by DocumentParserService.

**Acceptance Criteria:**
- [ ] DocumentParserService.parseForContext() still works with images
- [ ] DocumentParserService.parseForResponses() still works with scanned questionnaires
- [ ] ClaudeClient.analyzeImages() unchanged in behavior
- [ ] Existing intake/scoring flows unaffected

**Technical Approach:**
- Add dedicated regression test file
- Test both parseForContext and parseForResponses with image fixtures
- Verify ClaudeClient mock receives expected Vision API format

**Files Touched:**
- `packages/backend/__tests__/integration/document-parser-regression.test.ts` - NEW: Regression tests

**Agent:** backend-agent

**Tests Required:**
- `document-parser-regression.test.ts` - parseForContext with PNG → structured output
- `document-parser-regression.test.ts` - parseForResponses with scanned PDF → responses extracted
- `document-parser-regression.test.ts` - ClaudeClient.analyzeImages called with correct params

---

### 30.4.5: Documentation

**Description:** Document the Vision pipeline for future developers.

**Acceptance Criteria:**
- [ ] Update architecture docs with Vision flow
- [ ] Add inline code comments explaining the pipeline
- [ ] Update CLAUDE.md if relevant rules apply

**Technical Approach:**
- Add flow diagram to architecture docs
- Document supported image formats and size limits
- Note the separation between chat Vision (this epic) and DocumentParser Vision

**Files Touched:**
- `docs/design/architecture/implementation-guide.md` - Add Vision section
- `packages/backend/src/infrastructure/ai/VisionContentBuilder.ts` - Add JSDoc
- `packages/backend/CLAUDE.md` - Add learnings if applicable

**Agent:** backend-agent

**Tests Required:**
- N/A (documentation only)

---

## Definition of Done

- [ ] All integration tests pass
- [ ] Error handling covers edge cases
- [ ] All three modes behave correctly
- [ ] Documentation updated
- [ ] Manual QA in production-like environment
- [ ] No regressions in existing functionality

---

## QA Checklist

### Manual Testing (Consult Mode - In Scope)

- [ ] Fresh conversation in Consult mode
- [ ] Upload PNG screenshot → Claude describes what's in it
- [ ] Upload JPG photo → Claude analyzes it
- [ ] Upload PDF + image in same conversation → both work
- [ ] Upload GIF → first frame analyzed
- [ ] Upload WebP → works correctly

### Mode Boundary Testing (Out of Scope Verification)

- [ ] Assessment mode: Images upload but are NOT sent to Vision API (out of scope for Epic 30)
- [ ] Scoring mode: File upload uses existing DocumentParser flow (unchanged)

### Regression Testing

- [ ] Text file uploads still work (PDF, DOCX)
- [ ] Questionnaire generation still works
- [ ] Scoring report export still works
- [ ] DocumentParserService image analysis unchanged
- [ ] No memory issues under normal usage
