# Story 20.2.2: Orphaned Response Cleanup Job

## Description
Create a scheduled cleanup job that purges orphaned response batches (responses without matching assessment_results) older than a configurable retention window (default 24h). This prevents database bloat from failed scoring attempts.

## Acceptance Criteria
- [ ] Cleanup job deletes responses where batch_id has no matching assessment_results
- [ ] Only deletes responses older than retention window (default 24h)
- [ ] Retention window configurable via `ORPHAN_CLEANUP_RETENTION_HOURS` env var
- [ ] All deletions logged with batch_id and count for audit
- [ ] Job can be invoked manually for testing
- [ ] Job handles empty result sets gracefully
- [ ] Database query is efficient (uses indexes)

## Technical Approach

### 1. Create Cleanup Service

```typescript
// packages/backend/src/application/services/OrphanCleanupService.ts
export class OrphanCleanupService {
  constructor(
    private readonly responseRepo: IResponseRepository
  ) {}

  async cleanupOrphanedResponses(): Promise<{ deletedCount: number; batchIds: string[] }> {
    const retentionHours = parseInt(process.env.ORPHAN_CLEANUP_RETENTION_HOURS || '24', 10);

    // Find orphaned batch IDs older than retention window
    const orphanedBatches = await this.responseRepo.findOrphanedBatches(retentionHours);

    if (orphanedBatches.length === 0) {
      console.log('[OrphanCleanupService] No orphaned responses found');
      return { deletedCount: 0, batchIds: [] };
    }

    // Delete orphaned responses
    let totalDeleted = 0;
    for (const batchId of orphanedBatches) {
      const deleted = await this.responseRepo.deleteByBatchIdIfOrphaned(batchId);
      totalDeleted += deleted;
      console.log(`[OrphanCleanupService] Deleted ${deleted} responses for orphaned batch ${batchId}`);
    }

    return { deletedCount: totalDeleted, batchIds: orphanedBatches };
  }
}
```

### 2. Add Repository Method

```typescript
// IResponseRepository.ts
findOrphanedBatches(olderThanHours: number): Promise<string[]>
deleteByBatchIdIfOrphaned(batchId: string): Promise<number>
```

### 3. Implement Repository Method

```typescript
// DrizzleResponseRepository.ts
async findOrphanedBatches(olderThanHours: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

  // Find batch_ids that:
  // 1. Have responses older than cutoff
  // 2. Do NOT have a matching assessment_results record
  const result = await db.execute(sql`
    SELECT DISTINCT r.batch_id
    FROM responses r
    LEFT JOIN assessment_results ar ON r.batch_id = ar.batch_id
    WHERE ar.id IS NULL
    AND r.created_at < ${cutoff}
  `);

  return result.rows.map(row => row.batch_id as string);
}

async deleteByBatchIdIfOrphaned(batchId: string): Promise<number> {
  const result = await db
    .delete(responses)
    .where(eq(responses.batchId, batchId))
    .returning({ id: responses.id });

  return result.length;
}
```

### 4. Ensure Database Index

Verify index exists on `responses.batch_id` and `responses.created_at`:

```sql
-- Migration or verify in schema
CREATE INDEX IF NOT EXISTS idx_responses_batch_id ON responses(batch_id);
CREATE INDEX IF NOT EXISTS idx_responses_created_at ON responses(created_at);
```

### 5. Create CLI Entry Point (Optional)

For manual invocation during testing:

```typescript
// packages/backend/src/scripts/cleanupOrphans.ts
import { OrphanCleanupService } from '../application/services/OrphanCleanupService';
// ... setup and invoke
```

### 6. Scheduled Invocation (Deferred)

Actual cron scheduling can be done via:
- External cron job calling the CLI script
- Node-cron package (add later if needed)

For MVP, manual invocation is sufficient.

## Files Touched
- `packages/backend/src/application/services/OrphanCleanupService.ts` - **NEW**: Cleanup service
- `packages/backend/src/application/interfaces/IResponseRepository.ts` - Add cleanup methods
- `packages/backend/src/infrastructure/database/repositories/DrizzleResponseRepository.ts` - Implement methods
- `packages/backend/src/scripts/cleanupOrphans.ts` - **NEW**: CLI entry point (optional)

## Agent Assignment
- [x] backend-agent

## Tests Required
- [ ] Integration test: Find orphaned batches correctly
- [ ] Integration test: Ignore batches with matching assessment_results
- [ ] Integration test: Respect retention window (don't delete recent)
- [ ] Integration test: Delete orphaned responses
- [ ] Unit test: Service logs deletions
- [ ] Unit test: Empty result handling

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Database indexes verified
