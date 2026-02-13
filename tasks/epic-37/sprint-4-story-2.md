# Story 37.4.2: Create FrameworkControl Repository (Interface + Drizzle)

## Description

Create the repository interface and Drizzle ORM implementation for the `framework_controls` table. This repository includes the critical `findByVersionId()` method used by `ISOControlRetrievalService` (Sprint 5) to get all controls for a specific standard version.

## Acceptance Criteria

- [ ] `IFrameworkControlRepository.ts` created in `application/interfaces/`
- [ ] `DrizzleFrameworkControlRepository.ts` created in `infrastructure/database/repositories/`
- [ ] Interface has methods: `findByVersionId()`, `findByClauseRef()`, `create()`, `createBatch()`
- [ ] `createBatch()` supports batch insert (for seed script efficiency)
- [ ] `toDTO()` private mapper present
- [ ] Each file under 100 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Interface

**File:** `packages/backend/src/application/interfaces/IFrameworkControlRepository.ts`

```typescript
import { FrameworkControlDTO, CreateFrameworkControlDTO } from '../../domain/compliance/dtos.js';

export interface IFrameworkControlRepository {
  findByVersionId(versionId: string): Promise<FrameworkControlDTO[]>;
  findByClauseRef(versionId: string, clauseRef: string): Promise<FrameworkControlDTO | null>;
  create(data: CreateFrameworkControlDTO): Promise<FrameworkControlDTO>;
  createBatch(data: CreateFrameworkControlDTO[]): Promise<FrameworkControlDTO[]>;
}
```

### 2. Drizzle Implementation

**File:** `packages/backend/src/infrastructure/database/repositories/DrizzleFrameworkControlRepository.ts`

```typescript
import { eq, and } from 'drizzle-orm';
import { db } from '../client.js';
import { frameworkControls } from '../schema/frameworkControls.js';
import type { IFrameworkControlRepository } from '../../../application/interfaces/IFrameworkControlRepository.js';
import type { FrameworkControlDTO, CreateFrameworkControlDTO } from '../../../domain/compliance/dtos.js';

export class DrizzleFrameworkControlRepository implements IFrameworkControlRepository {
  async findByVersionId(versionId: string): Promise<FrameworkControlDTO[]> {
    const rows = await db.select().from(frameworkControls)
      .where(eq(frameworkControls.versionId, versionId));
    return rows.map(this.toDTO);
  }

  async findByClauseRef(versionId: string, clauseRef: string): Promise<FrameworkControlDTO | null> {
    const [row] = await db.select().from(frameworkControls)
      .where(and(
        eq(frameworkControls.versionId, versionId),
        eq(frameworkControls.clauseRef, clauseRef)
      )).limit(1);
    return row ? this.toDTO(row) : null;
  }

  async create(data: CreateFrameworkControlDTO): Promise<FrameworkControlDTO> {
    const [row] = await db.insert(frameworkControls).values({
      versionId: data.versionId,
      clauseRef: data.clauseRef,
      domain: data.domain,
      title: data.title,
    }).returning();
    return this.toDTO(row);
  }

  async createBatch(data: CreateFrameworkControlDTO[]): Promise<FrameworkControlDTO[]> {
    if (data.length === 0) return [];
    const values = data.map(d => ({
      versionId: d.versionId, clauseRef: d.clauseRef,
      domain: d.domain, title: d.title,
    }));
    const rows = await db.insert(frameworkControls).values(values).returning();
    return rows.map(this.toDTO);
  }

  private toDTO(row: typeof frameworkControls.$inferSelect): FrameworkControlDTO {
    return {
      id: row.id, versionId: row.versionId, clauseRef: row.clauseRef,
      domain: row.domain, title: row.title, createdAt: row.createdAt,
    };
  }
}
```

## Files Touched

- `packages/backend/src/application/interfaces/IFrameworkControlRepository.ts` - CREATE (~10 LOC)
- `packages/backend/src/infrastructure/database/repositories/DrizzleFrameworkControlRepository.ts` - CREATE (~60 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- None for this story (integration tests in 37.4.5)

## Definition of Done

- [ ] Interface and implementation created
- [ ] Batch insert method for seed script efficiency
- [ ] Follows existing Drizzle repository patterns
- [ ] No TypeScript errors
