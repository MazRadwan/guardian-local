# Story 37.3.5: Create DimensionControlMapping Domain Model

## Description

Create the `DimensionControlMapping` domain model. Maps ISO controls to Guardian's 10 risk dimensions with a relevance weight. Simple, immutable domain model.

## Acceptance Criteria

- [ ] `DimensionControlMapping.ts` created in `domain/compliance/`
- [ ] Has `create()` static factory with validation
- [ ] Has `fromPersistence()` static factory for DB hydration
- [ ] Validates `controlId` and `dimension` are non-empty
- [ ] Validates `relevanceWeight` is between 0.0 and 1.0
- [ ] Defaults `relevanceWeight` to 1.0 if not provided
- [ ] All properties are readonly
- [ ] Under 50 LOC
- [ ] No TypeScript errors

## Technical Approach

**File:** `packages/backend/src/domain/compliance/DimensionControlMapping.ts`

```typescript
import { DimensionControlMappingDTO, CreateDimensionControlMappingDTO } from './dtos.js';
import { RiskDimension } from '../types/QuestionnaireSchema.js';

/**
 * DimensionControlMapping Domain Model
 *
 * Maps an ISO control to a Guardian risk dimension.
 * One control can map to multiple dimensions (via separate mapping rows).
 * relevanceWeight indicates how strongly the control relates to the dimension.
 */
export class DimensionControlMapping {
  private constructor(
    public readonly id: string,
    public readonly controlId: string,
    public readonly dimension: RiskDimension,
    public readonly relevanceWeight: number,
    public readonly createdAt: Date
  ) {}

  static create(data: CreateDimensionControlMappingDTO): DimensionControlMapping {
    if (!data.controlId || data.controlId.trim().length === 0) {
      throw new Error('Control ID is required');
    }
    if (!data.dimension || data.dimension.trim().length === 0) {
      throw new Error('Dimension is required');
    }
    const weight = data.relevanceWeight ?? 1.0;
    if (weight < 0 || weight > 1) {
      throw new Error('Relevance weight must be between 0.0 and 1.0');
    }
    return new DimensionControlMapping(
      '',
      data.controlId,
      data.dimension.trim(),
      weight,
      new Date()
    );
  }

  static fromPersistence(dto: DimensionControlMappingDTO): DimensionControlMapping {
    return new DimensionControlMapping(
      dto.id,
      dto.controlId,
      dto.dimension,
      dto.relevanceWeight,
      dto.createdAt
    );
  }
}
```

## Files Touched

- `packages/backend/src/domain/compliance/DimensionControlMapping.ts` - CREATE (~50 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/domain/compliance/DimensionControlMapping.test.ts`
  - Test `create()` with valid data (defaults weight to 1.0)
  - Test `create()` with explicit weight (0.5)
  - Test `create()` throws on empty controlId
  - Test `create()` throws on empty dimension
  - Test `create()` throws on weight < 0
  - Test `create()` throws on weight > 1
  - Test `fromPersistence()` hydrates correctly

## Definition of Done

- [ ] Domain model created and compiles
- [ ] Immutable (all readonly properties)
- [ ] Weight validation (0.0-1.0 range)
- [ ] Unit tests written and passing
- [ ] Under 50 LOC
- [ ] No TypeScript errors
