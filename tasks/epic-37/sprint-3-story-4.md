# Story 37.3.4: Create InterpretiveCriteria Value Object

## Description

Create the `InterpretiveCriteria` domain value object. This implements Level 2 of two-level versioning: Guardian's own interpretive criteria for each ISO control. Criteria have a `reviewStatus` that tracks the human approval workflow (`draft` -> `approved` -> `deprecated`).

## Acceptance Criteria

- [ ] `InterpretiveCriteria.ts` created in `domain/compliance/`
- [ ] Has `create()` static factory with validation (defaults `reviewStatus` to `'draft'`)
- [ ] Has `fromPersistence()` static factory for DB hydration
- [ ] Validates `controlId`, `criteriaVersion`, `criteriaText` are non-empty
- [ ] Has `approve()` method that sets status to `'approved'` with approver and timestamp
- [ ] Has `deprecate()` method that sets status to `'deprecated'`
- [ ] Under 80 LOC
- [ ] No TypeScript errors

## Technical Approach

**File:** `packages/backend/src/domain/compliance/InterpretiveCriteria.ts`

```typescript
import { InterpretiveCriteriaDTO, CreateInterpretiveCriteriaDTO } from './dtos.js';
import { ReviewStatus } from './types.js';

/**
 * InterpretiveCriteria Value Object
 *
 * Guardian's own assessment criteria for an ISO control.
 * Written in Guardian's language (not verbatim ISO text -- copyright compliance).
 * Versioned independently of the ISO standard version.
 */
export class InterpretiveCriteria {
  private constructor(
    public readonly id: string,
    public readonly controlId: string,
    public readonly criteriaVersion: string,
    public readonly criteriaText: string,
    public readonly assessmentGuidance: string | null,
    private _reviewStatus: ReviewStatus,
    private _approvedAt: Date | null,
    private _approvedBy: string | null,
    public readonly createdAt: Date
  ) {}

  static create(data: CreateInterpretiveCriteriaDTO): InterpretiveCriteria {
    if (!data.controlId || data.controlId.trim().length === 0) {
      throw new Error('Control ID is required');
    }
    if (!data.criteriaVersion || data.criteriaVersion.trim().length === 0) {
      throw new Error('Criteria version is required');
    }
    if (!data.criteriaText || data.criteriaText.trim().length === 0) {
      throw new Error('Criteria text is required');
    }
    return new InterpretiveCriteria(
      '',
      data.controlId,
      data.criteriaVersion.trim(),
      data.criteriaText.trim(),
      data.assessmentGuidance ?? null,
      data.reviewStatus ?? 'draft',
      null,
      null,
      new Date()
    );
  }

  static fromPersistence(dto: InterpretiveCriteriaDTO): InterpretiveCriteria {
    return new InterpretiveCriteria(
      dto.id,
      dto.controlId,
      dto.criteriaVersion,
      dto.criteriaText,
      dto.assessmentGuidance ?? null,
      dto.reviewStatus,
      dto.approvedAt ?? null,
      dto.approvedBy ?? null,
      dto.createdAt
    );
  }

  get reviewStatus(): ReviewStatus { return this._reviewStatus; }
  get approvedAt(): Date | null { return this._approvedAt; }
  get approvedBy(): string | null { return this._approvedBy; }

  approve(approvedBy: string): void {
    this._reviewStatus = 'approved';
    this._approvedAt = new Date();
    this._approvedBy = approvedBy;
  }

  deprecate(): void {
    this._reviewStatus = 'deprecated';
  }
}
```

## Files Touched

- `packages/backend/src/domain/compliance/InterpretiveCriteria.ts` - CREATE (~75 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/domain/compliance/InterpretiveCriteria.test.ts`
  - Test `create()` with valid data (defaults reviewStatus to 'draft')
  - Test `create()` throws on empty controlId
  - Test `create()` throws on empty criteriaVersion
  - Test `create()` throws on empty criteriaText
  - Test `fromPersistence()` hydrates correctly
  - Test `approve()` sets status, approvedAt, approvedBy
  - Test `deprecate()` sets status to 'deprecated'

## Definition of Done

- [ ] Value object created and compiles
- [ ] Review workflow methods (`approve`, `deprecate`) work correctly
- [ ] Defaults to 'draft' status on creation
- [ ] Unit tests written and passing
- [ ] Under 80 LOC
- [ ] No TypeScript errors
