# Sprint 2: Data Integrity (P1)

## Goal
Ensure scoring data is stored atomically and orphaned data is cleaned up, preventing partial writes and database bloat.

## Stories
- [ ] 20.2.1 - Transactional score storage
- [ ] 20.2.2 - Orphaned response cleanup job

## Dependencies
- Stories are independent and can run in parallel
- No dependency on Sprint 1 completion

## Parallelization Matrix

| Story | Files | Can Parallel With |
|-------|-------|-------------------|
| 20.2.1 | ScoringService.ts, client.ts | 20.2.2 |
| 20.2.2 | DrizzleResponseRepository.ts, cleanup job | 20.2.1 |

## Acceptance Criteria
- [ ] `dimension_scores` and `assessment_results` inserts are atomic
- [ ] Partial failures roll back both tables
- [ ] Orphaned responses (without matching assessment_results) are purged after 24h
- [ ] Cleanup job logs all deletions for audit
- [ ] Cleanup is configurable via environment variable
- [ ] All existing tests continue to pass

## Technical Context

### R4: Transactional Score Storage
Currently `ScoringService.storeScores()` uses `Promise.all` to insert dimension scores and assessment results. If one fails, the other may succeed, leaving orphaned data. Wrapping in a transaction ensures atomicity.

### R8: Orphaned Response Cleanup
Responses are stored before scoring (for audit). If scoring fails, these response batches become orphaned. A cleanup job should purge batches older than 24h that have no matching `assessment_results` record.
