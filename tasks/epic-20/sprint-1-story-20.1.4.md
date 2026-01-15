# Story 20.1.4: Fix Solution-Type Weighting Bug

## Description
Fix the `determineSolutionType` method in `ScoringService` which incorrectly maps `assessment.assessmentType` (quick/comprehensive/category_focused) to rubric weights. The fix should use `assessment.solutionType` (clinical_ai/administrative_ai/patient_facing) which properly maps to the rubric's `SolutionType`.

## Acceptance Criteria
- [ ] Scoring uses `assessment.solutionType` for rubric weight selection
- [ ] Fallback to `clinical_ai` when solutionType is null/undefined
- [ ] Mapping handles case-insensitive input
- [ ] Valid solutionType values: `clinical_ai`, `administrative_ai`, `patient_facing`
- [ ] Invalid values fall back to `clinical_ai` with warning log
- [ ] Existing tests updated to reflect correct behavior

## Technical Approach

### 1. Current Broken Code (ScoringService.ts lines 300-314)

```typescript
// BROKEN: Uses assessmentType which has values like 'quick', 'comprehensive'
private determineSolutionType(assessment: { assessmentType?: string }): SolutionType {
  const typeMap: Record<string, SolutionType> = {
    'clinical': 'clinical_ai',
    'clinical_ai': 'clinical_ai',
    'administrative': 'administrative_ai',
    // ...
  };
  const assessmentType = assessment.assessmentType?.toLowerCase() || 'clinical';
  return typeMap[assessmentType] || 'clinical_ai';
}
```

### 2. Fixed Code

```typescript
/**
 * Determine solution type from assessment for correct dimension weighting
 * Uses assessment.solutionType which maps directly to rubric SolutionType
 */
private determineSolutionType(assessment: { solutionType?: string | null }): SolutionType {
  // Valid rubric solution types
  const validTypes: SolutionType[] = ['clinical_ai', 'administrative_ai', 'patient_facing'];

  const solutionType = assessment.solutionType?.toLowerCase();

  if (!solutionType) {
    // Default to clinical_ai for healthcare assessments
    return 'clinical_ai';
  }

  if (validTypes.includes(solutionType as SolutionType)) {
    return solutionType as SolutionType;
  }

  // Log warning for invalid values
  console.warn(
    `[ScoringService] Invalid solutionType "${assessment.solutionType}", defaulting to clinical_ai`
  );
  return 'clinical_ai';
}
```

### 3. Update Call Site

The call site on line 182 passes the full assessment object, which includes `solutionType`:
```typescript
const solutionType = this.determineSolutionType(assessment);
```

No change needed here since the Assessment entity already has `solutionType`.

### 4. Verify Assessment Entity

Confirm `Assessment` entity exposes `solutionType`:
```typescript
// Assessment entity (domain/entities/Assessment.ts)
interface AssessmentProps {
  solutionType?: string | null;
  // ...
}
```

## Files Touched
- `packages/backend/src/application/services/ScoringService.ts` - Fix `determineSolutionType` method

## Agent Assignment
- [x] backend-agent

## Tests Required
- [ ] Unit test: `clinical_ai` input returns `clinical_ai`
- [ ] Unit test: `administrative_ai` input returns `administrative_ai`
- [ ] Unit test: `patient_facing` input returns `patient_facing`
- [ ] Unit test: Null solutionType defaults to `clinical_ai`
- [ ] Unit test: Undefined solutionType defaults to `clinical_ai`
- [ ] Unit test: Case-insensitive (e.g., `Clinical_AI` works)
- [ ] Unit test: Invalid value logs warning and defaults to `clinical_ai`
- [ ] Unit test: Old `assessmentType` values no longer affect weighting

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Scoring weights now correctly vary by solution type
