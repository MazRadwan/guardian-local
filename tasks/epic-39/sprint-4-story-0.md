# Story 39.4.0: Delete Deprecated Methods from DocumentUploadController

## Description

Remove the two deprecated private methods from `DocumentUploadController.ts` (920 LOC):
- `parseForIntake()` (lines 561-629, 68 LOC) -- deprecated in Epic 18
- `parseForScoring()` (lines 642-708, 66 LOC) -- deprecated in Epic 18

Active scoring path moved to WebSocket (`ChatServer.handleScoringModeMessage()`) in Epic 18.
These methods have zero callers, zero tests, and are both `private`. This is a dev project
with no backwards compatibility requirement.

`runScoring()` MUST be kept -- it is still actively used by the WebSocket auto-trigger scoring path.

This is a prerequisite cleanup before the Sprint 4 file splits.

## Acceptance Criteria

- [ ] `parseForIntake()` method deleted (lines 561-629)
- [ ] `parseForScoring()` method deleted (lines 642-708)
- [ ] All `@deprecated` doc comments for these methods deleted
- [ ] `runScoring()` method preserved (actively used)
- [ ] `DocumentUploadController.ts` reduced from 920 to ~786 LOC
- [ ] All existing tests pass (no tests reference deleted methods)
- [ ] No TypeScript errors
- [ ] No unused imports after deletion

## Technical Approach

### 1. Verify Zero Callers

Before deleting, confirm:
- `parseForIntake()` is not called anywhere in the codebase (grep for method name)
- `parseForScoring()` is not called anywhere in the codebase (grep for method name)
- Both are `private` -- no external imports possible

### 2. Delete Methods

Remove the two method blocks and their JSDoc comments. Clean up any imports that become
unused after deletion (e.g., types only used by these methods).

### 3. Verify

- `pnpm test:unit` passes
- `pnpm --filter @guardian/backend tsc --noEmit` passes
- No references to deleted methods remain

## Files Touched

- `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts` -- DELETE 2 private methods (~134 LOC removed)

## Agent Assignment

`backend-agent`

## Tests Required

No new tests needed -- this is pure deletion of dead code with zero callers.

## Tests Affected

- `packages/backend/__tests__/unit/DocumentUploadController.test.ts` -- should pass unchanged (no tests for deprecated methods)
- `packages/backend/__tests__/unit/infrastructure/http/controllers/DocumentUploadController.runScoring.test.ts` -- should pass unchanged (tests `runScoring()` which is kept)

## Estimated Size

Small (1 file, deletion only)
