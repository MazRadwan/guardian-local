# Story 37.4.4: Create DimensionControlMapping Repository (Interface + Drizzle)

## Description

Create the repository interface and Drizzle ORM implementation for the `dimension_control_mappings` table. This repository is critical for the `ISOControlRetrievalService` (Sprint 5) -- it answers the query "which ISO controls apply to a given Guardian dimension?"

## Acceptance Criteria

- [ ] `IDimensionControlMappingRepository.ts` created in `application/interfaces/`
- [ ] `DrizzleDimensionControlMappingRepository.ts` created in `infrastructure/database/repositories/`
- [ ] Interface has methods: `findByDimension()`, `findAllMappings()`, `create()`, `createBatch()`
- [ ] `findByDimension()` returns all mappings for a given dimension (with join to get control details)
- [ ] `findAllMappings()` returns all mappings (for building the full ISO catalog)
- [ ] Each file under 120 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Interface

**File:** `packages/backend/src/application/interfaces/IDimensionControlMappingRepository.ts`

```typescript
import { DimensionControlMappingDTO, CreateDimensionControlMappingDTO } from '../../domain/compliance/dtos.js';
import { FrameworkControlDTO } from '../../domain/compliance/dtos.js';

/**
 * Extended mapping that includes the control details (joined)
 */
export interface MappingWithControlDTO extends DimensionControlMappingDTO {
  control: FrameworkControlDTO;
}

export interface IDimensionControlMappingRepository {
  findByDimension(dimension: string): Promise<MappingWithControlDTO[]>;
  findAllMappings(): Promise<MappingWithControlDTO[]>;
  create(data: CreateDimensionControlMappingDTO): Promise<DimensionControlMappingDTO>;
  createBatch(data: CreateDimensionControlMappingDTO[]): Promise<DimensionControlMappingDTO[]>;
}
```

### 2. Drizzle Implementation

**File:** `packages/backend/src/infrastructure/database/repositories/DrizzleDimensionControlMappingRepository.ts`

```typescript
import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { dimensionControlMappings } from '../schema/dimensionControlMappings.js';
import { frameworkControls } from '../schema/frameworkControls.js';
import type { IDimensionControlMappingRepository, MappingWithControlDTO }
  from '../../../application/interfaces/IDimensionControlMappingRepository.js';
import type { DimensionControlMappingDTO, CreateDimensionControlMappingDTO,
              FrameworkControlDTO } from '../../../domain/compliance/dtos.js';

export class DrizzleDimensionControlMappingRepository implements IDimensionControlMappingRepository {
  async findByDimension(dimension: string): Promise<MappingWithControlDTO[]> {
    const rows = await db
      .select()
      .from(dimensionControlMappings)
      .innerJoin(frameworkControls, eq(dimensionControlMappings.controlId, frameworkControls.id))
      .where(eq(dimensionControlMappings.dimension, dimension));

    return rows.map(row => this.toMappingWithControl(row));
  }

  async findAllMappings(): Promise<MappingWithControlDTO[]> {
    const rows = await db
      .select()
      .from(dimensionControlMappings)
      .innerJoin(frameworkControls, eq(dimensionControlMappings.controlId, frameworkControls.id));

    return rows.map(row => this.toMappingWithControl(row));
  }

  async create(data: CreateDimensionControlMappingDTO): Promise<DimensionControlMappingDTO> {
    const [row] = await db.insert(dimensionControlMappings).values({
      controlId: data.controlId, dimension: data.dimension,
      relevanceWeight: data.relevanceWeight ?? 1.0,
    }).returning();
    return this.toDTO(row);
  }

  async createBatch(data: CreateDimensionControlMappingDTO[]): Promise<DimensionControlMappingDTO[]> {
    if (data.length === 0) return [];
    const values = data.map(d => ({
      controlId: d.controlId, dimension: d.dimension,
      relevanceWeight: d.relevanceWeight ?? 1.0,
    }));
    const rows = await db.insert(dimensionControlMappings).values(values).returning();
    return rows.map(this.toDTO);
  }

  private toDTO(row: typeof dimensionControlMappings.$inferSelect): DimensionControlMappingDTO {
    return {
      id: row.id, controlId: row.controlId, dimension: row.dimension,
      relevanceWeight: row.relevanceWeight, createdAt: row.createdAt,
    };
  }

  private toMappingWithControl(row: {
    dimension_control_mappings: typeof dimensionControlMappings.$inferSelect;
    framework_controls: typeof frameworkControls.$inferSelect;
  }): MappingWithControlDTO {
    const mapping = row.dimension_control_mappings;
    const control = row.framework_controls;
    return {
      ...this.toDTO(mapping),
      control: {
        id: control.id, versionId: control.versionId,
        clauseRef: control.clauseRef, domain: control.domain,
        title: control.title, createdAt: control.createdAt,
      },
    };
  }
}
```

## Files Touched

- `packages/backend/src/application/interfaces/IDimensionControlMappingRepository.ts` - CREATE (~15 LOC)
- `packages/backend/src/infrastructure/database/repositories/DrizzleDimensionControlMappingRepository.ts` - CREATE (~80 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- None for this story (integration tests in 37.4.5)

## Definition of Done

- [ ] Interface and implementation created
- [ ] `findByDimension()` joins with `framework_controls` to return control details
- [ ] `findAllMappings()` joins with `framework_controls` for full catalog
- [ ] No TypeScript errors
