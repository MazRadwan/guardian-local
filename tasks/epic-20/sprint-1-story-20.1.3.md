# Story 20.1.3: Repository Update Method & Schema Migration for Narrative Persistence

## Description
Implement the repository methods for narrative persistence with concurrency-safe claim pattern. Includes schema migration to add `narrative_status`, `narrative_claimed_at`, and related columns.

**GPT Review Requirement:** Must implement atomic claim-before-LLM pattern to prevent double generation. Schema must support status tracking and stuck claim recovery.

## Acceptance Criteria
- [ ] Schema migration adds `narrative_status`, `narrative_claimed_at`, `narrative_completed_at`, `narrative_error` columns
- [ ] `claimNarrativeGeneration()` atomically claims if status is null/failed or claim is stale
- [ ] `finalizeNarrativeGeneration()` updates narrative + status to 'complete'
- [ ] `failNarrativeGeneration()` marks status as 'failed' with error
- [ ] Methods handle non-existent records gracefully
- [ ] Claim pattern prevents double LLM calls under concurrent requests

## Technical Approach

### 1. Schema Migration

```sql
-- Migration: add_narrative_status_columns.sql
ALTER TABLE assessment_results
ADD COLUMN narrative_status VARCHAR(20)
  CHECK (narrative_status IN ('generating', 'complete', 'failed')),
ADD COLUMN narrative_claimed_at TIMESTAMPTZ,
ADD COLUMN narrative_completed_at TIMESTAMPTZ,
ADD COLUMN narrative_error TEXT;

-- Index for efficient status queries
CREATE INDEX idx_assessment_results_narrative_status
ON assessment_results(narrative_status)
WHERE narrative_status IS NOT NULL;
```

### 2. Update Drizzle Schema

```typescript
// packages/backend/src/infrastructure/database/schema/assessmentResults.ts
export const assessmentResults = pgTable('assessment_results', {
  // ... existing columns ...
  narrativeStatus: varchar('narrative_status', { length: 20 }),
  narrativeClaimedAt: timestamp('narrative_claimed_at', { withTimezone: true }),
  narrativeCompletedAt: timestamp('narrative_completed_at', { withTimezone: true }),
  narrativeError: text('narrative_error'),
});
```

### 3. Interface Updates

```typescript
// packages/backend/src/application/interfaces/IAssessmentResultRepository.ts
export interface IAssessmentResultRepository {
  // ... existing methods ...

  /**
   * Atomically claim narrative generation if not already claimed/complete.
   * @param ttlMs - Time-to-live for stuck claims (default 5 min)
   * @returns true if claim succeeded, false if another process has it
   */
  claimNarrativeGeneration(
    assessmentId: string,
    batchId: string,
    ttlMs?: number
  ): Promise<boolean>;

  /**
   * Finalize successful narrative generation.
   * Sets status to 'complete' and stores narrative.
   */
  finalizeNarrativeGeneration(
    assessmentId: string,
    batchId: string,
    narrativeReport: string
  ): Promise<void>;

  /**
   * Mark narrative generation as failed.
   * Sets status to 'failed' and stores error message.
   */
  failNarrativeGeneration(
    assessmentId: string,
    batchId: string,
    error: string
  ): Promise<void>;
}
```

### 4. Repository Implementation

```typescript
// packages/backend/src/infrastructure/database/repositories/DrizzleAssessmentResultRepository.ts

async claimNarrativeGeneration(
  assessmentId: string,
  batchId: string,
  ttlMs: number = 300000 // 5 minutes
): Promise<boolean> {
  const staleThreshold = new Date(Date.now() - ttlMs);

  // Atomic claim: only succeeds if status is null/failed OR claim is stale
  const result = await db
    .update(assessmentResults)
    .set({
      narrativeStatus: 'generating',
      narrativeClaimedAt: new Date(),
    })
    .where(
      and(
        eq(assessmentResults.assessmentId, assessmentId),
        eq(assessmentResults.batchId, batchId),
        or(
          isNull(assessmentResults.narrativeStatus),
          eq(assessmentResults.narrativeStatus, 'failed'),
          and(
            eq(assessmentResults.narrativeStatus, 'generating'),
            lt(assessmentResults.narrativeClaimedAt, staleThreshold)
          )
        )
      )
    )
    .returning({ id: assessmentResults.id });

  return result.length > 0;
}

async finalizeNarrativeGeneration(
  assessmentId: string,
  batchId: string,
  narrativeReport: string
): Promise<void> {
  await db
    .update(assessmentResults)
    .set({
      narrativeReport,
      narrativeStatus: 'complete',
      narrativeCompletedAt: new Date(),
      narrativeError: null,
    })
    .where(
      and(
        eq(assessmentResults.assessmentId, assessmentId),
        eq(assessmentResults.batchId, batchId),
        eq(assessmentResults.narrativeStatus, 'generating') // Guard on claim
      )
    );
}

async failNarrativeGeneration(
  assessmentId: string,
  batchId: string,
  error: string
): Promise<void> {
  await db
    .update(assessmentResults)
    .set({
      narrativeStatus: 'failed',
      narrativeError: error,
    })
    .where(
      and(
        eq(assessmentResults.assessmentId, assessmentId),
        eq(assessmentResults.batchId, batchId)
      )
    );
}
```

## Files Touched
- `packages/backend/src/infrastructure/database/schema/assessmentResults.ts` - Add new columns
- `packages/backend/src/infrastructure/database/migrations/` - New migration file
- `packages/backend/src/application/interfaces/IAssessmentResultRepository.ts` - Add claim/finalize/fail methods
- `packages/backend/src/infrastructure/database/repositories/DrizzleAssessmentResultRepository.ts` - Implement methods

## Agent Assignment
- [x] backend-agent

## Tests Required
- [ ] Integration test: Claim succeeds when status is null
- [ ] Integration test: Claim succeeds when status is 'failed'
- [ ] Integration test: Claim succeeds when existing claim is stale (> TTL)
- [ ] Integration test: Claim fails when status is 'generating' and not stale
- [ ] Integration test: Claim fails when status is 'complete'
- [ ] Integration test: Finalize updates narrative and status
- [ ] Integration test: Finalize only works if status is 'generating' (guard)
- [ ] Integration test: Fail marks status and stores error
- [ ] Integration test: Concurrent claims - only one succeeds

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Migration runs successfully
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Claim pattern verified under simulated concurrency
