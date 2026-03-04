# Story 40.1.4: Split scoringPrompt.helpers.ts

## Description

**This story executes FIRST in the sprint** to prevent `scoringPrompt.helpers.ts` from
ever exceeding 300 LOC. The file is currently 296 LOC — adding 5 new rubric criteria
sections (Story 40.1.1) would inflate it to ~590 LOC. By splitting first, Story 40.1.1
adds new criteria directly to `rubricCriteriaNew.ts` and helpers.ts never balloons.

This is a pure refactor of existing code with zero behavioral change.

## Acceptance Criteria

- [ ] Rubric criteria extracted from `scoringPrompt.helpers.ts`
- [ ] All source files under 300 LOC (HARD RULE — no exceptions)
- [ ] `scoringPrompt.helpers.ts` re-exports `buildRubricCriteria`
- [ ] `buildScoringSystemPrompt()` still works (imports unchanged from its perspective)
- [ ] No TypeScript errors

## Technical Approach

### 1. Mandatory File Split (300 LOC Limit)

**[Architect review finding]:** The split is MANDATORY, not optional. A single
`rubricCriteria.ts` at ~520 LOC violates the 300 LOC hard rule in CLAUDE.md. Rubric
criteria is a source file with logic (function + template string), not a type definition
or generated file.

**Concrete split plan:**

```
packages/backend/src/infrastructure/ai/prompts/
├── scoringPrompt.ts            (~216 LOC, unchanged)
├── scoringPrompt.helpers.ts    (~70 LOC after extraction)
├── scoringPrompt.iso.ts        (existing, unchanged)
├── rubricCriteria.ts           (~30 LOC, orchestrator)
├── rubricCriteriaExisting.ts   (~250 LOC, 5 existing dimensions)
└── rubricCriteriaNew.ts        (~270 LOC, 5 new dimensions)
```

### 2. Orchestrator: rubricCriteria.ts (~30 LOC)

```typescript
/**
 * Rubric Criteria Orchestrator
 *
 * Assembles rubric criteria text from dimension-specific builders.
 * Split into existing (v1.0) and new (v1.1) dimensions for 300 LOC compliance.
 */
import { buildExistingDimensionCriteria } from './rubricCriteriaExisting.js';
import { buildNewDimensionCriteria } from './rubricCriteriaNew.js';

export function buildRubricCriteria(): string {
  return `## SCORING RULES (MANDATORY)

1. **Dimension score = sum of sub-scores.** ...
2. **Use only defined point values.** ...
3. **Show your arithmetic.** ...

${buildExistingDimensionCriteria()}

${buildNewDimensionCriteria()}`;
}
```

### 3. rubricCriteriaExisting.ts (~250 LOC)

Contains the 5 existing dimension rubric text: Clinical Risk, Privacy Risk, Security Risk,
Technical Credibility, Operational Excellence. Verbatim move from current `buildRubricCriteria()`.

### 4. rubricCriteriaNew.ts (~270 LOC)

Contains the 5 new dimension rubric text from Story 40.1.1: Vendor Capability, AI Transparency,
Ethical Considerations, Regulatory Compliance, Sustainability.

### 5. Update Imports in scoringPrompt.helpers.ts

```typescript
// Before:
export function buildRubricCriteria(): string { ... }

// After:
export { buildRubricCriteria } from './rubricCriteria.js';
```

This preserves the existing import path for `scoringPrompt.ts`.

## Files Touched

- `packages/backend/src/infrastructure/ai/prompts/rubricCriteria.ts` - CREATE (~30 LOC)
- `packages/backend/src/infrastructure/ai/prompts/rubricCriteriaExisting.ts` - CREATE (~250 LOC)
- `packages/backend/src/infrastructure/ai/prompts/rubricCriteriaNew.ts` - CREATE (~270 LOC)
- `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.helpers.ts` - MODIFY (remove buildRubricCriteria, add re-export, ~70 LOC)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Verify `buildRubricCriteria()` returns string containing all 10 dimension names
- [ ] Verify `buildScoringSystemPrompt()` still includes rubric criteria (integration check)
- [ ] (Detailed prompt assertions in Story 40.1.5)

## Definition of Done

- [ ] 3 rubric criteria files created (orchestrator + existing + new)
- [ ] scoringPrompt.helpers.ts re-exports buildRubricCriteria
- [ ] ALL source files under 300 LOC
- [ ] All existing imports of buildRubricCriteria still work
- [ ] No circular imports
- [ ] No TypeScript errors
- [ ] No lint errors
