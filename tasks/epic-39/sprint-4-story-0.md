# Story 39.4.0: Delete Deprecated Methods from DocumentUploadController

## Description

Remove three dead private methods from `DocumentUploadController.ts` (920 LOC):
- `parseForIntake()` (lines 561-629, 68 LOC) -- deprecated in Epic 18, zero callers
- `parseForScoring()` (lines 642-708, 66 LOC) -- deprecated in Epic 18, zero callers
- `runScoring()` (lines 714-920, ~206 LOC) -- only caller is `parseForScoring()` (line 680), which is itself deprecated with zero callers

Active scoring path moved to WebSocket (`ScoringHandler` via `ChatServer.handleScoringModeMessage()`) in Epic 18.
All three methods are `private` with zero external callers. This is a dev project with no backwards compatibility requirement.

**Re-audit completed (2026-02-17):** `runScoring()` has exactly one caller: `parseForScoring():680`. Since `parseForScoring()` itself has zero callers and is being deleted, `runScoring()` becomes dead code. Delete all three.

This is a prerequisite cleanup before the Sprint 4 file splits.

## Acceptance Criteria

- [ ] `parseForIntake()` method deleted (lines 561-629, 68 LOC)
- [ ] `parseForScoring()` method deleted (lines 642-708, 66 LOC)
- [ ] `runScoring()` method deleted (lines 714-920, ~206 LOC)
- [ ] All `@deprecated` doc comments for these methods deleted
- [ ] `DocumentUploadController.ts` reduced from 920 to ~580 LOC (~340 LOC removed)
- [ ] All existing tests pass (no tests reference deleted methods — see Tests Affected)
- [ ] No TypeScript errors
- [ ] No unused imports after deletion

## Technical Approach

### 1. Verify Zero Callers (MANDATORY pre-delete check)

**Run these greps and record results before any deletion:**
```bash
# All three methods — must show zero production callers outside their own definitions
grep -rn "parseForIntake" packages/backend/src/
grep -rn "parseForScoring" packages/backend/src/
grep -rn "runScoring" packages/backend/src/
```

**Expected results:**
- `parseForIntake` — only its own definition (line ~561). Zero callers. Private method.
- `parseForScoring` — only its own definition (line ~642). Zero callers. Private method.
- `runScoring` — definition (line ~714) + one call at line ~680 INSIDE `parseForScoring()`. Since `parseForScoring()` has zero callers, `runScoring()` is transitively dead.

**If ANY unexpected caller is found:** STOP. Do not delete that method. Document the caller and escalate.

### 2. Delete Methods

Remove the two method blocks and their JSDoc comments. Clean up any imports that become
unused after deletion (e.g., types only used by these methods).

### 3. Verify (deletion + regression)

**Post-deletion verification:**
- `pnpm --filter @guardian/backend tsc --noEmit` passes (no type errors)
- `pnpm test:unit` passes
- No references to deleted methods remain in source files

**Regression check for still-active paths in DocumentUploadController:**
The upload and download endpoints are NOT being deleted. Verify they still work:
```bash
# Active endpoints that must still function after deletion:
grep -n "async upload\|async download\|async handleUpload" packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts
```
- `upload()` / `handleUpload()` — active HTTP upload path
- `download()` — active file download path
- These methods must compile and their existing tests must pass unchanged

## Files Touched

- `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts` -- DELETE 2 private methods (~134 LOC removed)

## Agent Assignment

`backend-agent`

## Tests Required

No new tests needed -- this is pure deletion of dead code with zero callers.

## Tests Affected

- `packages/backend/__tests__/unit/DocumentUploadController.test.ts` -- should pass unchanged (no tests for deprecated methods)
- `packages/backend/__tests__/unit/infrastructure/http/controllers/DocumentUploadController.runScoring.test.ts` -- **DELETE this test file.** It tests `runScoring()` which is being deleted. The test accesses it via `(controller as any).runScoring()` — it was testing dead code.
- `packages/backend/__tests__/integration/auto-trigger-scoring.test.ts` -- **VERIFY.** Contains a `runScoringHarness()` helper that replicates `runScoring()` event emission. This is a standalone test harness, NOT a caller of the actual method. Should still pass but verify it doesn't import `DocumentUploadController.runScoring` directly.

## Estimated Size

Small (1 file, deletion only)
