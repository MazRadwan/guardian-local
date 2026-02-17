# Story 37.4.5: Repository Integration Tests

## Description

Create integration tests for all 4 ISO compliance repositories against the real test database. Tests verify CRUD operations, unique constraints, cascade deletes, and join queries. Follows the pattern from existing integration tests in `__tests__/integration/`.

## Acceptance Criteria

- [ ] Integration test file created for ISO repositories
- [ ] Tests cover: create, findAll, findByName (framework), findByVersionId (controls), findByDimension (mappings), findApprovedByVersion (criteria)
- [ ] Tests verify unique constraint enforcement (duplicate name, duplicate clause_ref)
- [ ] Tests verify cascade delete (delete framework cascades to versions, controls, etc.)
- [ ] Tests verify join queries (mapping + control details)
- [ ] All tests use `truncateAllTables()` for cleanup
- [ ] All tests pass against real test database
- [ ] Test file can exceed 300 LOC (test files are exempt from limit)

## Technical Approach

**File:** `packages/backend/__tests__/integration/iso-repositories.test.ts`

```typescript
import { truncateAllTables, closeTestDb, testDb } from '../setup/test-db';
import { DrizzleComplianceFrameworkRepository } from '../../src/infrastructure/database/repositories/DrizzleComplianceFrameworkRepository';
import { DrizzleFrameworkControlRepository } from '../../src/infrastructure/database/repositories/DrizzleFrameworkControlRepository';
import { DrizzleInterpretiveCriteriaRepository } from '../../src/infrastructure/database/repositories/DrizzleInterpretiveCriteriaRepository';
import { DrizzleDimensionControlMappingRepository } from '../../src/infrastructure/database/repositories/DrizzleDimensionControlMappingRepository';

describe('ISO Compliance Repositories (Integration)', () => {
  const frameworkRepo = new DrizzleComplianceFrameworkRepository();
  const controlRepo = new DrizzleFrameworkControlRepository();
  const criteriaRepo = new DrizzleInterpretiveCriteriaRepository();
  const mappingRepo = new DrizzleDimensionControlMappingRepository();

  beforeEach(async () => {
    await truncateAllTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  // Test groups:
  // 1. ComplianceFramework + Version CRUD
  // 2. FrameworkControl CRUD + batch insert
  // 3. InterpretiveCriteria CRUD + approval workflow
  // 4. DimensionControlMapping CRUD + join queries
  // 5. Cascade delete verification
  // 6. Unique constraint enforcement
});
```

### Test Scenarios

**Group 1: Framework + Version**
- Create framework, verify returned DTO
- Find framework by name (exists, not exists)
- Create version for framework
- Find latest version
- Find all versions ordered by createdAt

**Group 2: Controls**
- Create batch of controls for a version
- Find controls by version ID
- Find control by clause ref
- Verify unique constraint on (version_id, clause_ref)

**Group 3: Criteria**
- Create criteria for a control (defaults to 'draft')
- Batch create criteria
- Find approved criteria by version (empty when all draft)
- Update review status to approved
- Find approved criteria (now returns results)

**Group 4: Mappings**
- Create mapping (control -> dimension)
- Find mappings by dimension (includes control details)
- Find all mappings (includes control details)
- Verify join returns correct control clauseRef and title

**Group 5: Cascade**
- Delete framework -> versions, controls, criteria, mappings all cascade

**Group 6: Constraints**
- Duplicate framework name -> constraint error
- Duplicate (version_id, clause_ref) -> constraint error
- Duplicate (control_id, criteria_version) -> constraint error

## Files Touched

- `packages/backend/__tests__/integration/iso-repositories.test.ts` - CREATE (~300+ LOC, test files exempt from limit)

## Tests Affected

- No existing tests affected. This is a new test file.

## Agent Assignment

- [x] backend-agent

## Tests Required

This IS the test story. Tests described above.

## Definition of Done

- [ ] Integration test file created
- [ ] All test scenarios covered
- [ ] `pnpm test:integration` passes
- [ ] Tests clean up properly (truncateAllTables)
- [ ] No connection leaks (closeTestDb in afterAll)
