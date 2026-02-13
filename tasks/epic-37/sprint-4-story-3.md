# Story 37.4.3: Create InterpretiveCriteria Repository (Interface + Drizzle)

## Description

Create the repository interface and Drizzle ORM implementation for the `interpretive_criteria` table. This repository supports the human review workflow by filtering criteria by review status and version.

## Acceptance Criteria

- [ ] `IInterpretiveCriteriaRepository.ts` created in `application/interfaces/`
- [ ] `DrizzleInterpretiveCriteriaRepository.ts` created in `infrastructure/database/repositories/`
- [ ] Interface has methods: `findByControlId()`, `findApprovedByVersion()`, `create()`, `createBatch()`, `updateReviewStatus()`
- [ ] `findApprovedByVersion()` returns only criteria with `reviewStatus = 'approved'` for a given criteria version
- [ ] `updateReviewStatus()` supports the approval workflow
- [ ] Each file under 120 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Interface

**File:** `packages/backend/src/application/interfaces/IInterpretiveCriteriaRepository.ts`

```typescript
import { InterpretiveCriteriaDTO, CreateInterpretiveCriteriaDTO } from '../../domain/compliance/dtos.js';
import { ReviewStatus } from '../../domain/compliance/types.js';

export interface IInterpretiveCriteriaRepository {
  findByControlId(controlId: string): Promise<InterpretiveCriteriaDTO[]>;
  findApprovedByVersion(criteriaVersion: string): Promise<InterpretiveCriteriaDTO[]>;
  create(data: CreateInterpretiveCriteriaDTO): Promise<InterpretiveCriteriaDTO>;
  createBatch(data: CreateInterpretiveCriteriaDTO[]): Promise<InterpretiveCriteriaDTO[]>;
  updateReviewStatus(id: string, status: ReviewStatus, approvedBy?: string): Promise<void>;
}
```

### 2. Drizzle Implementation

**File:** `packages/backend/src/infrastructure/database/repositories/DrizzleInterpretiveCriteriaRepository.ts`

```typescript
import { eq, and } from 'drizzle-orm';
import { db } from '../client.js';
import { interpretiveCriteria } from '../schema/interpretiveCriteria.js';
import type { IInterpretiveCriteriaRepository } from '../../../application/interfaces/IInterpretiveCriteriaRepository.js';
import type { InterpretiveCriteriaDTO, CreateInterpretiveCriteriaDTO } from '../../../domain/compliance/dtos.js';
import type { ReviewStatus } from '../../../domain/compliance/types.js';

export class DrizzleInterpretiveCriteriaRepository implements IInterpretiveCriteriaRepository {
  async findByControlId(controlId: string): Promise<InterpretiveCriteriaDTO[]> {
    const rows = await db.select().from(interpretiveCriteria)
      .where(eq(interpretiveCriteria.controlId, controlId));
    return rows.map(this.toDTO);
  }

  async findApprovedByVersion(criteriaVersion: string): Promise<InterpretiveCriteriaDTO[]> {
    const rows = await db.select().from(interpretiveCriteria)
      .where(and(
        eq(interpretiveCriteria.criteriaVersion, criteriaVersion),
        eq(interpretiveCriteria.reviewStatus, 'approved')
      ));
    return rows.map(this.toDTO);
  }

  async create(data: CreateInterpretiveCriteriaDTO): Promise<InterpretiveCriteriaDTO> {
    const [row] = await db.insert(interpretiveCriteria).values({
      controlId: data.controlId,
      criteriaVersion: data.criteriaVersion,
      criteriaText: data.criteriaText,
      assessmentGuidance: data.assessmentGuidance,
      reviewStatus: data.reviewStatus ?? 'draft',
    }).returning();
    return this.toDTO(row);
  }

  async createBatch(data: CreateInterpretiveCriteriaDTO[]): Promise<InterpretiveCriteriaDTO[]> {
    if (data.length === 0) return [];
    const values = data.map(d => ({
      controlId: d.controlId, criteriaVersion: d.criteriaVersion,
      criteriaText: d.criteriaText, assessmentGuidance: d.assessmentGuidance,
      reviewStatus: d.reviewStatus ?? 'draft',
    }));
    const rows = await db.insert(interpretiveCriteria).values(values).returning();
    return rows.map(this.toDTO);
  }

  async updateReviewStatus(id: string, status: ReviewStatus, approvedBy?: string): Promise<void> {
    const updateData: Record<string, unknown> = { reviewStatus: status };
    if (status === 'approved' && approvedBy) {
      updateData.approvedAt = new Date();
      updateData.approvedBy = approvedBy;
    }
    await db.update(interpretiveCriteria)
      .set(updateData)
      .where(eq(interpretiveCriteria.id, id));
  }

  private toDTO(row: typeof interpretiveCriteria.$inferSelect): InterpretiveCriteriaDTO {
    return {
      id: row.id, controlId: row.controlId, criteriaVersion: row.criteriaVersion,
      criteriaText: row.criteriaText, assessmentGuidance: row.assessmentGuidance ?? undefined,
      reviewStatus: row.reviewStatus as ReviewStatus,
      approvedAt: row.approvedAt ?? undefined, approvedBy: row.approvedBy ?? undefined,
      createdAt: row.createdAt,
    };
  }
}
```

## Files Touched

- `packages/backend/src/application/interfaces/IInterpretiveCriteriaRepository.ts` - CREATE (~12 LOC)
- `packages/backend/src/infrastructure/database/repositories/DrizzleInterpretiveCriteriaRepository.ts` - CREATE (~75 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- None for this story (integration tests in 37.4.5)

## Definition of Done

- [ ] Interface and implementation created
- [ ] Approval workflow method (`updateReviewStatus`) implemented
- [ ] `findApprovedByVersion()` filters by status + version
- [ ] No TypeScript errors
