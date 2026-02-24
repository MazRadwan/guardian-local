# Story 39.4.1: Split DocumentParserService -- Extract Intake Parser

## Description

Extract the `IIntakeDocumentParser` implementation from `DocumentParserService.ts` (784 LOC) into a new `IntakeDocumentParser.ts`. The original file implements BOTH `IIntakeDocumentParser` and `IScoringDocumentParser`. After this split, `DocumentParserService` only implements `IScoringDocumentParser` (the active scoring path), and `IntakeDocumentParser` handles intake parsing.

This is a pure refactor with zero behavioral change.

## Acceptance Criteria

- [ ] `IntakeDocumentParser.ts` created implementing `IIntakeDocumentParser`
- [ ] `parseForContext()` method moved verbatim from DocumentParserService
- [ ] `createFailedIntakeResult()` helper moved to new file
- [ ] `DocumentParserService.ts` no longer implements `IIntakeDocumentParser`
- [ ] `DocumentParserService.ts` LOC reduced (target: under 500 after this story, under 300 after 39.4.2)
- [ ] Container wiring updated: `IntakeDocumentParser` injected where `IIntakeDocumentParser` is needed
- [ ] All existing intake parsing tests pass without modification (or minimal mock updates)
- [ ] IntakeDocumentParser.ts under 300 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Create IntakeDocumentParser

**File:** `packages/backend/src/infrastructure/ai/IntakeDocumentParser.ts`

Move from DocumentParserService:
- `parseForContext()` method (lines 224-310) -- the full IIntakeDocumentParser implementation
- `createFailedIntakeResult()` helper (lines 745-761)
- Shared private methods needed: `extractContent()`, `truncateText()`, `parseJsonResponse()`, `attemptJsonRepair()`

**Note:** The shared methods (`extractContent`, `truncateText`, `parseJsonResponse`, `attemptJsonRepair`) are used by BOTH intake and scoring paths. For this story, duplicate them into IntakeDocumentParser. Story 39.4.2 will extract them into `DocumentParserHelpers.ts` to remove the duplication.

### 2. Update DocumentParserService

**File:** `packages/backend/src/infrastructure/ai/DocumentParserService.ts`

- Remove `IIntakeDocumentParser` from `implements` clause
- Remove `parseForContext()` method
- Remove `createFailedIntakeResult()` helper
- Keep `IScoringDocumentParser` implementation (active scoring path)
- Keep shared helpers (will be extracted in 39.4.2)

### 3. Update Container Wiring

**File:** `packages/backend/src/container.ts`

```typescript
// Before (after Sprint 1 Story 39.1.4 added questionRepo parameter):
export const documentParserService = new DocumentParserService(claudeClient, claudeClient, questionRepo);
// documentParserService used as both IIntakeDocumentParser and IScoringDocumentParser

// After:
export const intakeDocumentParser = new IntakeDocumentParser(claudeClient, claudeClient);
export const documentParserService = new DocumentParserService(claudeClient, claudeClient, questionRepo);
// Inject intakeDocumentParser where IIntakeDocumentParser is needed
// Inject documentParserService where IScoringDocumentParser is needed (keeps questionRepo for regex extraction)
```

**NOTE (spec review finding):** Sprint 1 Story 39.1.4 adds `IQuestionRepository` as a third constructor parameter to `DocumentParserService`. The container wiring above reflects the actual constructor signature at Sprint 4 execution time, not the pre-Sprint-1 signature. `IntakeDocumentParser` does NOT need `questionRepo` (intake parsing doesn't use regex extraction).

### 4. Type Imports

Move `IntakeExtractionResponse`, `applyIntakeDefaults`, and `filterStrings` to `IntakeDocumentParser.ts` (or a shared helpers file). The `ScoringExtractionResponse` and `applyScoringDefaults` stay in DocumentParserService.

## Files Touched

- `packages/backend/src/infrastructure/ai/IntakeDocumentParser.ts` - CREATE (~250 LOC)
- `packages/backend/src/infrastructure/ai/DocumentParserService.ts` - MODIFY (remove intake methods, ~120 lines removed)
- `packages/backend/src/container.ts` - MODIFY (add IntakeDocumentParser instantiation)

## Tests Affected

Existing tests that may need updates:
- `packages/backend/__tests__/unit/DocumentParserService.test.ts` - Tests for intake parsing (parseForContext) need to target `IntakeDocumentParser` instead. Scoring tests (parseForResponses) remain on DocumentParserService.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/ai/IntakeDocumentParser.test.ts`
  - Move/copy intake-specific tests from DocumentParserService.test.ts
  - Test parseForContext returns IntakeParseResult with correct shape
  - Test parseForContext handles Vision API path for images
  - Test parseForContext handles text path for PDF/DOCX
  - Test createFailedIntakeResult returns correct error shape

## Definition of Done

- [ ] IntakeDocumentParser created with parseForContext method
- [ ] DocumentParserService no longer implements IIntakeDocumentParser
- [ ] Container wiring updated
- [ ] All existing tests pass (intake tests may need mock target updates)
- [ ] IntakeDocumentParser under 300 LOC
- [ ] No TypeScript errors
- [ ] No lint errors
