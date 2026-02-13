# Story 37.3.3: Create FrameworkControl Domain Model

## Description

Create the `FrameworkControl` domain model. Controls are immutable per standard version -- once created, they do not change. This is a domain model with identity (id, createdAt) but no mutable state beyond creation.

## Acceptance Criteria

- [ ] `FrameworkControl.ts` created in `domain/compliance/`
- [ ] Has `create()` static factory with validation
- [ ] Has `fromPersistence()` static factory for DB hydration
- [ ] Validates `clauseRef`, `domain`, `title` are non-empty
- [ ] All properties are readonly (immutable domain model)
- [ ] Under 60 LOC
- [ ] No TypeScript errors

## Technical Approach

**File:** `packages/backend/src/domain/compliance/FrameworkControl.ts`

```typescript
import { FrameworkControlDTO, CreateFrameworkControlDTO } from './dtos.js';

/**
 * FrameworkControl Domain Model
 *
 * Represents a single ISO control (e.g., "A.6.2.6 - Data quality management").
 * Immutable per standard version -- controls do not change once seeded.
 */
export class FrameworkControl {
  private constructor(
    public readonly id: string,
    public readonly versionId: string,
    public readonly clauseRef: string,
    public readonly domain: string,
    public readonly title: string,
    public readonly createdAt: Date
  ) {}

  static create(data: CreateFrameworkControlDTO): FrameworkControl {
    if (!data.versionId || data.versionId.trim().length === 0) {
      throw new Error('Version ID is required');
    }
    if (!data.clauseRef || data.clauseRef.trim().length === 0) {
      throw new Error('Clause reference is required');
    }
    if (!data.domain || data.domain.trim().length === 0) {
      throw new Error('Domain is required');
    }
    if (!data.title || data.title.trim().length === 0) {
      throw new Error('Title is required');
    }
    return new FrameworkControl(
      '',
      data.versionId,
      data.clauseRef.trim(),
      data.domain.trim(),
      data.title.trim(),
      new Date()
    );
  }

  static fromPersistence(dto: FrameworkControlDTO): FrameworkControl {
    return new FrameworkControl(
      dto.id,
      dto.versionId,
      dto.clauseRef,
      dto.domain,
      dto.title,
      dto.createdAt
    );
  }
}
```

## Files Touched

- `packages/backend/src/domain/compliance/FrameworkControl.ts` - CREATE (~55 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/domain/compliance/FrameworkControl.test.ts`
  - Test `create()` with valid data
  - Test `create()` throws on empty clauseRef
  - Test `create()` throws on empty domain
  - Test `create()` throws on empty title
  - Test `create()` throws on empty versionId
  - Test `fromPersistence()` hydrates correctly
  - Test all properties are accessible

## Definition of Done

- [ ] Domain model created and compiles
- [ ] Immutable (all readonly properties)
- [ ] Validation in create() method
- [ ] Unit tests written and passing
- [ ] Under 60 LOC
- [ ] No TypeScript errors
