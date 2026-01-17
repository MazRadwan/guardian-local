# solutionType Field Semantics

## Overview

The `solutionType` field exists in multiple locations within Guardian with different meanings and usage patterns. This document clarifies the relationships and correct usage.

## Location 1: Rubric SolutionType (Authoritative for Scoring)

**File:** `packages/backend/src/domain/scoring/rubric.ts`

**Type:**
```typescript
type SolutionType = 'clinical_ai' | 'administrative_ai' | 'patient_facing';
```

**Purpose:**
- Determines dimension weight multipliers for composite score calculation
- Each solution type has different weights for the 10 risk dimensions
- Example: `clinical_ai` weights clinical_risk highest, `administrative_ai` weights operational_excellence higher

**Usage:**
- Used by `ScoringService.determineSolutionType()` to select correct weights
- Affects the final composite score calculation

## Location 2: Assessment.solutionType (Database Field)

**File:** `packages/backend/src/domain/entities/Assessment.ts`
**Schema:** `packages/backend/src/infrastructure/database/schema/assessments.ts`

**Type:** `string | null`

**Purpose:**
- Stores the solution category for filtering, display, and scoring weights
- User-entered during assessment creation or derived from document intake

**Correct Usage:**
- Should be one of the rubric SolutionType values: `'clinical_ai'`, `'administrative_ai'`, `'patient_facing'`
- If not set or invalid, `ScoringService` defaults to `'clinical_ai'`

**Recommendation:**
- Validate against rubric types during assessment creation/update
- Display a warning in UI if value doesn't match rubric types
- Consider a dropdown with the three valid options

## Location 3: Intake Context solutionType (Derived from Documents)

**File:** `DocumentParserService.parseForContext()` output

**Type:** Free-form string extracted from documents

**Purpose:**
- Provides context during document intake
- Used for progressive reveal in chat interface
- Helps Guardian understand the vendor's solution category

**Example Values:**
- "Clinical Decision Support System"
- "Patient Engagement Platform"
- "Administrative Workflow Tool"
- "Revenue Cycle Management"

**Note:**
- This is **informational only** - not directly mapped to rubric
- Does NOT automatically set `assessment.solutionType`
- Future enhancement: Could prompt user to confirm/map to rubric type

## Mapping Logic

The `ScoringService.determineSolutionType()` method handles mapping:

```typescript
// packages/backend/src/application/services/ScoringService.ts
private determineSolutionType(assessment: { solutionType?: string | null }): SolutionType {
  const validTypes: SolutionType[] = ['clinical_ai', 'administrative_ai', 'patient_facing'];

  if (!assessment.solutionType) {
    return 'clinical_ai';  // Default for healthcare assessments
  }

  const lower = assessment.solutionType.toLowerCase();
  if (validTypes.includes(lower as SolutionType)) {
    return lower as SolutionType;
  }

  console.warn(`Invalid solutionType "${assessment.solutionType}", defaulting to clinical_ai`);
  return 'clinical_ai';
}
```

## Decision: Keep assessment.solutionType

**Recommendation:** Keep the field with clear semantics.

**Rationale:**
1. Removing would require migration and API changes
2. The field has valid purposes: filtering, display, scoring weights
3. Just needs correct usage (fixed in Story 20.1.4)
4. UI can enforce valid values via dropdown

## Future Considerations

1. **Auto-populate from intake:** Could prompt user to confirm derived solutionType
2. **Validation:** Add API validation to reject invalid solutionType values
3. **UI dropdown:** Replace free-text input with rubric type dropdown
4. **Historical data:** Consider migration to normalize existing invalid values

---

*Created: 2026-01-15 (Epic 20, Story 20.4.3)*
