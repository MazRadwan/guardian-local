# Sprint 4: Performance & Tech Debt (P3-P4)

## Goal
Improve parsing performance, reduce unnecessary LLM calls, and clarify data model semantics.

## Stories
- [ ] 20.4.1 - Pre-check Guardian document signature
- [ ] 20.4.2 - Per-response truncation for token budgeting
- [ ] 20.4.3 - Clarify solutionType semantics

## Optional (P4)
- [ ] 20.4.4 - File buffer caching (deferred)

## Dependencies
- All stories are independent and can run in parallel
- No dependency on Sprint 1-3 completion (though Sprint 1 Story 20.1.4 provides context for 20.4.3)

## Parallelization Matrix

| Story | Files | Can Parallel With |
|-------|-------|-------------------|
| 20.4.1 | DocumentParserService.ts | 20.4.2, 20.4.3 |
| 20.4.2 | DocumentParserService.ts | 20.4.1, 20.4.3 |
| 20.4.3 | Docs, possibly schema | 20.4.1, 20.4.2 |

**Note:** Stories 20.4.1 and 20.4.2 both touch `DocumentParserService.ts` but different methods/sections, so can be parallel with careful merging.

## Acceptance Criteria
- [ ] Non-Guardian documents detected early (before LLM call) when possible
- [ ] Individual responses truncated to prevent token explosion
- [ ] solutionType semantics documented and potentially cleaned up
- [ ] All changes are backward compatible
- [ ] All existing tests continue to pass

## Technical Context

### R12: Pre-check Guardian Signature
Non-Guardian documents (random PDFs) trigger expensive LLM extraction. A quick regex check for Guardian markers (e.g., `Assessment ID:`, `GUARDIAN`) can fail fast for obvious non-matches. This is a best-effort optimization (not a gate) to avoid false negatives.

### R13: Per-Response Truncation
The current `DEFAULT_MAX_EXTRACTED_TEXT_CHARS` (100k) is document-level. Large documents can still explode token usage. Truncating individual responses (e.g., 2,000 chars each) bounds worst-case while preserving evidence across all responses.

### R2: Clarify solutionType
The `solutionType` field exists in multiple places with different meanings:
- `assessment.solutionType` - stored in DB, not used by scoring
- File intake context - extracted from document, used for progressive reveal
- Rubric weights require `SolutionType` (clinical_ai/administrative_ai/patient_facing)

This story documents and potentially cleans up this confusion.
