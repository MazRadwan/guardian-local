# Story 20.4.3: Clarify solutionType Semantics

## Description
Document and clarify the `solutionType` field semantics across the codebase. Currently the field exists in multiple places with different meanings and usage patterns, causing confusion.

## Acceptance Criteria
- [ ] Clear documentation of solutionType usage in each location
- [ ] Decision on whether `assessment.solutionType` should remain in schema
- [ ] If kept, document its purpose vs intake context solutionType
- [ ] If removed, migration plan documented (deferred to future epic)
- [ ] Code comments added where solutionType is used
- [ ] Architecture decision recorded

## Technical Approach

### 1. Current State Analysis

**Location 1: Assessment Entity/Table**
- Field: `assessment.solutionType`
- Values: User-entered or null
- Usage: Returned in API responses, NOT used in scoring (Sprint 1 Story 20.1.4 fixes this)
- Location: `packages/backend/src/domain/entities/Assessment.ts`, database schema

**Location 2: File Intake Context**
- Field: Extracted from document during intake parsing
- Values: Derived from document content (e.g., "clinical decision support", "patient portal")
- Usage: Progressive reveal, context injection
- Location: `DocumentParserService.parseForContext()` output

**Location 3: Rubric Weights**
- Type: `SolutionType` = `'clinical_ai' | 'administrative_ai' | 'patient_facing'`
- Usage: Determines dimension weight multipliers for composite score
- Location: `packages/backend/src/domain/scoring/rubric.ts`

### 2. Document the Relationships

Create a decision document that clarifies:

```markdown
## solutionType Field Semantics

### Rubric SolutionType (Authoritative for Scoring)
- Type: `clinical_ai | administrative_ai | patient_facing`
- Purpose: Determines dimension weights for composite score calculation
- Source: Should come from `assessment.solutionType` (after Story 20.1.4 fix)

### assessment.solutionType (Database Field)
- Type: String (nullable)
- Purpose: Stores the solution category for filtering/display
- **Recommendation:** Map to rubric SolutionType for scoring

### Intake Context solutionType (Derived)
- Type: Free-form string extracted from documents
- Purpose: Context injection, progressive reveal during chat
- **Note:** Not directly mapped to rubric - informational only
```

### 3. Add Code Comments

Where solutionType is used, add clarifying comments:

```typescript
// ScoringService.ts
/**
 * Determine solution type from assessment for correct dimension weighting.
 *
 * Uses assessment.solutionType which should be set by the user or derived
 * from document intake. Maps to rubric SolutionType for weight selection.
 *
 * @see rubric.ts for weight definitions per SolutionType
 */
private determineSolutionType(assessment: { solutionType?: string | null }): SolutionType
```

### 4. Decision: Keep or Remove assessment.solutionType?

**Recommendation: Keep** with clear semantics:
- `assessment.solutionType` stores the canonical solution category
- Should be set during assessment creation or updated from intake
- Maps to rubric `SolutionType` for scoring weights

**Rationale:**
- Removing would require migration and API changes
- The field has a valid purpose (filtering, display, scoring)
- Just needs correct usage (fixed in Story 20.1.4)

### 5. Future Consideration (Out of Scope)

If intake parsing extracts a solutionType, should it auto-populate `assessment.solutionType`?
- Currently: No (intake context is separate)
- Future: Could add a prompt asking user to confirm/override

## Files Touched
- `docs/design/architecture/scoring-data-model.md` - **NEW or UPDATE**: Document solutionType semantics
- `packages/backend/src/application/services/ScoringService.ts` - Add clarifying comments
- `packages/backend/src/domain/scoring/rubric.ts` - Add JSDoc comments
- `packages/backend/src/domain/entities/Assessment.ts` - Add field documentation

## Agent Assignment
- [x] backend-agent

## Tests Required
- [ ] No code tests (documentation story)
- [ ] Review: Verify comments are accurate after Story 20.1.4 merge

## Definition of Done
- [ ] Architecture decision documented
- [ ] Code comments added to key files
- [ ] solutionType semantics clear to future developers
- [ ] No TypeScript errors
- [ ] No lint errors
