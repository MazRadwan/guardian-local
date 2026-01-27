# Story 31.1.4: Update Unit Tests for New Flow

**Sprint:** 1 - Decouple file_attached from Extraction
**Agent:** backend-agent
**Estimation:** Small

---

## Description

Update existing DocumentUploadController tests to reflect the new flow where file_attached emits before extraction completes.

---

## Acceptance Criteria

- [ ] Existing tests updated to mock BackgroundExtractor
- [ ] Tests verify file_attached timing (before extraction)
- [ ] Tests verify hasExcerpt: false in initial file_attached
- [ ] All tests pass

---

## Technical Approach

Update test setup to inject mock BackgroundExtractor:

```typescript
const mockBackgroundExtractor = {
  queueExtraction: jest.fn(),
};

const controller = new DocumentUploadController(
  mockFileRepository,
  mockFileStorage,
  mockTextExtractionService,
  mockBackgroundExtractor, // NEW
  // ... other deps
);
```

Update assertions that previously expected:
- `hasExcerpt: true` to expect `hasExcerpt: false`
- Extraction to complete before file_attached

---

## Files Touched

- `packages/backend/__tests__/unit/DocumentUploadController.test.ts` - MODIFY existing tests
- `packages/backend/__tests__/unit/infrastructure/http/controllers/DocumentUploadController.test.ts` - MODIFY if exists

---

## Agent Assignment

- [x] backend-agent

---

## Tests Required

This story IS the test update. Specific changes:

1. **Setup changes:**
   - Add mockBackgroundExtractor to test setup
   - Pass mockBackgroundExtractor to controller constructor

2. **Assertion changes:**
   - Update expectations for `hasExcerpt` from `true` to `false`
   - Verify queueExtraction is called (not direct extraction)
   - Remove assertions that waited for extraction before file_attached

3. **New test cases:**
   - Verify file_attached emits before extraction completes
   - Verify BackgroundExtractor receives correct parameters

---

## Definition of Done

- [ ] All existing tests updated
- [ ] All tests pass
- [ ] Test coverage maintained or improved
