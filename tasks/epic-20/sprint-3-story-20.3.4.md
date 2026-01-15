# Story 20.3.4: Combine Assessment+Vendor Lookup

## Description
Add a `findByIdWithVendor` repository method to eliminate the second database query when loading assessment and vendor info in `ScoringService`. Currently `findById()` and `getVendor()` are called separately.

## Acceptance Criteria
- [ ] New `findByIdWithVendor(id)` method returns assessment + vendor in single query
- [ ] Uses SQL JOIN instead of two round trips
- [ ] ScoringService updated to use combined method
- [ ] ScoringExportService updated to use combined method
- [ ] Original `findById` and `getVendor` methods remain for backward compatibility
- [ ] No functional change to scoring behavior

## Technical Approach

### 1. Add Interface Method

```typescript
// IAssessmentRepository.ts
export interface IAssessmentRepository {
  // ... existing methods

  /**
   * Find assessment by ID with vendor info in single query
   * More efficient than calling findById + getVendor separately
   */
  findByIdWithVendor(id: string): Promise<{
    assessment: Assessment;
    vendor: { id: string; name: string };
  } | null>;
}
```

### 2. Implement Repository Method

```typescript
// DrizzleAssessmentRepository.ts
async findByIdWithVendor(id: string): Promise<{
  assessment: Assessment;
  vendor: { id: string; name: string };
} | null> {
  const [result] = await db
    .select({
      // Assessment fields
      id: assessments.id,
      vendorId: assessments.vendorId,
      assessmentType: assessments.assessmentType,
      solutionName: assessments.solutionName,
      solutionType: assessments.solutionType,
      status: assessments.status,
      assessmentMetadata: assessments.assessmentMetadata,
      createdAt: assessments.createdAt,
      updatedAt: assessments.updatedAt,
      createdBy: assessments.createdBy,
      // Vendor fields
      vendorIdField: vendors.id,
      vendorName: vendors.name,
    })
    .from(assessments)
    .innerJoin(vendors, eq(assessments.vendorId, vendors.id))
    .where(eq(assessments.id, id))
    .limit(1);

  if (!result) {
    return null;
  }

  return {
    assessment: Assessment.fromPersistence({
      id: result.id,
      vendorId: result.vendorId,
      assessmentType: result.assessmentType,
      solutionName: result.solutionName,
      solutionType: result.solutionType,
      status: result.status,
      assessmentMetadata: result.assessmentMetadata,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      createdBy: result.createdBy,
    }),
    vendor: {
      id: result.vendorIdField,
      name: result.vendorName,
    },
  };
}
```

### 3. Update ScoringService

Replace separate calls with combined call:

```typescript
// Before (lines 134, 179):
const assessment = await this.assessmentRepo.findById(assessmentId);
// ... later ...
const vendor = await this.assessmentRepo.getVendor(assessmentId);

// After:
const result = await this.assessmentRepo.findByIdWithVendor(assessmentId);
if (!result) {
  throw new ScoringError('ASSESSMENT_NOT_FOUND', `Assessment not found: ${assessmentId}`);
}
const { assessment, vendor } = result;
```

### 4. Update ScoringExportService

Similar refactor:

```typescript
// Before:
const assessment = await this.assessmentRepository.findById(assessmentId);
const vendor = await this.assessmentRepository.getVendor(assessmentId);

// After:
const result = await this.assessmentRepository.findByIdWithVendor(assessmentId);
if (!result) {
  throw new Error(`Assessment not found: ${assessmentId}`);
}
const { assessment, vendor } = result;
```

## Files Touched
- `packages/backend/src/application/interfaces/IAssessmentRepository.ts` - Add `findByIdWithVendor`
- `packages/backend/src/infrastructure/database/repositories/DrizzleAssessmentRepository.ts` - Implement method
- `packages/backend/src/application/services/ScoringService.ts` - Use combined method
- `packages/backend/src/application/services/ScoringExportService.ts` - Use combined method

## Agent Assignment
- [x] backend-agent

## Tests Required
- [ ] Integration test: `findByIdWithVendor` returns assessment and vendor
- [ ] Integration test: Returns null for non-existent ID
- [ ] Integration test: Single query execution (check query count)
- [ ] Unit test: ScoringService uses combined method
- [ ] Unit test: ScoringExportService uses combined method

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Database round trips reduced
