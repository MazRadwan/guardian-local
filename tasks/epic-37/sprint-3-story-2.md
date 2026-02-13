# Story 37.3.2: Create ComplianceFramework + FrameworkVersion Entities

## Description

Create domain entities for `ComplianceFramework` and `FrameworkVersion`. These follow the pattern established by `Assessment.ts`: constructor is private, with `create()` for new instances and `fromPersistence()` for hydrating from database rows. Combined into one story because they are tightly coupled (a version belongs to a framework).

## Acceptance Criteria

- [ ] `ComplianceFramework.ts` created in `domain/entities/`
- [ ] `FrameworkVersion.ts` created in `domain/entities/`
- [ ] Both have `create()` static factory for new instances
- [ ] Both have `fromPersistence()` static factory for DB hydration
- [ ] `ComplianceFramework.create()` validates `name` is non-empty
- [ ] `FrameworkVersion.create()` validates `frameworkId` and `versionLabel` are non-empty
- [ ] Both expose getters for all fields
- [ ] Both are under 100 LOC each
- [ ] No TypeScript errors

## Technical Approach

### 1. ComplianceFramework Entity

**File:** `packages/backend/src/domain/entities/ComplianceFramework.ts`

```typescript
import { ComplianceFrameworkDTO, CreateComplianceFrameworkDTO } from '../compliance/dtos.js';

export class ComplianceFramework {
  private constructor(
    public readonly id: string,
    private _name: string,
    private _description: string | null,
    public readonly createdAt: Date
  ) {}

  static create(data: CreateComplianceFrameworkDTO): ComplianceFramework {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Framework name is required');
    }
    return new ComplianceFramework(
      '', // ID assigned by DB
      data.name.trim(),
      data.description ?? null,
      new Date()
    );
  }

  static fromPersistence(dto: ComplianceFrameworkDTO): ComplianceFramework {
    return new ComplianceFramework(
      dto.id,
      dto.name,
      dto.description ?? null,
      dto.createdAt
    );
  }

  get name(): string { return this._name; }
  get description(): string | null { return this._description; }
}
```

### 2. FrameworkVersion Entity

**File:** `packages/backend/src/domain/entities/FrameworkVersion.ts`

```typescript
import { FrameworkVersionDTO, CreateFrameworkVersionDTO } from '../compliance/dtos.js';
import { FrameworkStatus } from '../compliance/types.js';

export class FrameworkVersion {
  private constructor(
    public readonly id: string,
    public readonly frameworkId: string,
    private _versionLabel: string,
    private _status: FrameworkStatus,
    private _publishedAt: Date | null,
    public readonly createdAt: Date
  ) {}

  static create(data: CreateFrameworkVersionDTO): FrameworkVersion {
    if (!data.frameworkId || data.frameworkId.trim().length === 0) {
      throw new Error('Framework ID is required');
    }
    if (!data.versionLabel || data.versionLabel.trim().length === 0) {
      throw new Error('Version label is required');
    }
    return new FrameworkVersion(
      '',
      data.frameworkId,
      data.versionLabel.trim(),
      data.status ?? 'active',
      data.publishedAt ?? null,
      new Date()
    );
  }

  static fromPersistence(dto: FrameworkVersionDTO): FrameworkVersion {
    return new FrameworkVersion(
      dto.id,
      dto.frameworkId,
      dto.versionLabel,
      dto.status,
      dto.publishedAt ?? null,
      dto.createdAt
    );
  }

  get versionLabel(): string { return this._versionLabel; }
  get status(): FrameworkStatus { return this._status; }
  get publishedAt(): Date | null { return this._publishedAt; }

  deprecate(): void {
    this._status = 'deprecated';
  }
}
```

## Files Touched

- `packages/backend/src/domain/entities/ComplianceFramework.ts` - CREATE (~50 LOC)
- `packages/backend/src/domain/entities/FrameworkVersion.ts` - CREATE (~70 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/domain/entities/ComplianceFramework.test.ts`
  - Test `create()` with valid data
  - Test `create()` throws on empty name
  - Test `fromPersistence()` hydrates correctly
  - Test getters return expected values
- [ ] `packages/backend/__tests__/unit/domain/entities/FrameworkVersion.test.ts`
  - Test `create()` with valid data (defaults status to 'active')
  - Test `create()` throws on empty frameworkId
  - Test `create()` throws on empty versionLabel
  - Test `fromPersistence()` hydrates correctly
  - Test `deprecate()` changes status to 'deprecated'

## Definition of Done

- [ ] Both entities created and compile
- [ ] Follow Assessment.ts factory method pattern
- [ ] Validation in create() methods
- [ ] Unit tests written and passing
- [ ] Under 100 LOC each
- [ ] No TypeScript errors
