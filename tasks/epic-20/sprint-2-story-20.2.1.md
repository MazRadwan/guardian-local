# Story 20.2.1: Transactional Score Storage

## Description
Wrap the `storeScores` method in `ScoringService` in a database transaction to ensure `dimension_scores` and `assessment_results` are inserted atomically. If either fails, both should roll back.

## Acceptance Criteria
- [ ] `dimensionScoreRepo.createBatch` and `assessmentResultRepo.create` run in same transaction
- [ ] If dimension score insert fails, assessment result is not created
- [ ] If assessment result insert fails, dimension scores are rolled back
- [ ] Transaction uses Drizzle's transaction API
- [ ] Repository methods accept optional transaction context
- [ ] Error messages indicate transaction failure clearly

## Technical Approach

### 1. Add Transaction Support to Database Client

Drizzle ORM supports transactions via `db.transaction()`:

```typescript
// packages/backend/src/infrastructure/database/client.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

export type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
```

### 2. Update Repository Interfaces

Add optional transaction parameter to relevant methods:

```typescript
// IAssessmentResultRepository.ts
create(result: CreateAssessmentResultDTO, tx?: unknown): Promise<AssessmentResultDTO>

// IDimensionScoreRepository.ts
createBatch(scores: CreateDimensionScoreDTO[], tx?: unknown): Promise<DimensionScoreDTO[]>
```

### 3. Update Repository Implementations

```typescript
// DrizzleAssessmentResultRepository.ts
async create(
  newResult: CreateAssessmentResultDTO,
  tx?: DrizzleTransaction
): Promise<AssessmentResultDTO> {
  const executor = tx ?? db;
  const [created] = await executor.insert(assessmentResults).values(value).returning();
  return this.toDTO(created);
}
```

### 4. Update ScoringService.storeScores()

```typescript
private async storeScores(
  assessmentId: string,
  batchId: string,
  payload: ScoringCompletePayload,
  narrativeReport: string,
  durationMs: number
): Promise<void> {
  const dimensionScores = payload.dimensionScores.map(ds => ({
    assessmentId,
    batchId,
    dimension: ds.dimension,
    score: ds.score,
    riskRating: ds.riskRating,
    findings: ds.findings,
  }));

  // Wrap in transaction for atomicity
  await db.transaction(async (tx) => {
    await this.dimensionScoreRepo.createBatch(dimensionScores, tx);
    await this.assessmentResultRepo.create({
      assessmentId,
      batchId,
      compositeScore: payload.compositeScore,
      // ... other fields
    }, tx);
  });
}
```

### 5. Handle Transaction Context Injection

Option A: Pass transaction through repository methods (cleaner)
Option B: Create TransactionScope service (more complex)

Recommend Option A for simplicity.

## Files Touched
- `packages/backend/src/infrastructure/database/client.ts` - Export transaction type
- `packages/backend/src/application/interfaces/IAssessmentResultRepository.ts` - Add tx param
- `packages/backend/src/application/interfaces/IDimensionScoreRepository.ts` - Add tx param
- `packages/backend/src/infrastructure/database/repositories/DrizzleAssessmentResultRepository.ts` - Accept tx
- `packages/backend/src/infrastructure/database/repositories/DrizzleDimensionScoreRepository.ts` - Accept tx
- `packages/backend/src/application/services/ScoringService.ts` - Wrap in transaction

## Agent Assignment
- [x] backend-agent

## Tests Required
- [ ] Integration test: Both inserts succeed in transaction
- [ ] Integration test: Dimension score failure rolls back (no assessment result)
- [ ] Integration test: Assessment result failure rolls back dimension scores
- [ ] Unit test: Transaction passed to repository methods
- [ ] Unit test: Without transaction, uses default db

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Partial writes are no longer possible
