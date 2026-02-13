# Story 37.6.4: Update ScoringPromptBuilder + IPromptBuilder Interface

## Description

Update the `ScoringPromptBuilder` and `IPromptBuilder` interface to support ISO prompt injection. The system prompt now includes the static ISO catalog, and the user prompt now includes per-assessment ISO applicability. The builder needs access to `ISOControlRetrievalService` to fetch control data before formatting.

## Acceptance Criteria

- [ ] `IPromptBuilder` interface updated: `buildScoringSystemPrompt()` can accept optional ISO catalog data
- [ ] `ScoringPromptBuilder` constructor updated to accept `ISOControlRetrievalService`
- [ ] System prompt includes ISO catalog section (from `buildISOCatalogSection()`)
- [ ] User prompt includes ISO applicability section (from `buildISOApplicabilitySection()`)
- [ ] `scoringPrompt.ts` `buildScoringSystemPrompt()` accepts and appends ISO catalog
- [ ] `scoringPrompt.ts` `buildScoringUserPrompt()` accepts and appends ISO applicability
- [ ] ISO messaging guidelines embedded in system prompt instructions
- [ ] All files under 300 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Update IPromptBuilder Interface

**File:** `packages/backend/src/application/interfaces/IPromptBuilder.ts`

The interface methods stay synchronous for the basic case, but the builder can pre-fetch ISO data before building. Add optional ISO data parameters:

```typescript
import { ISOControlForPrompt } from '../../domain/compliance/types.js';

export interface IPromptBuilder {
  buildScoringSystemPrompt(isoControls?: ISOControlForPrompt[]): string;
  buildScoringUserPrompt(params: {
    vendorName: string;
    solutionName: string;
    solutionType: SolutionType;
    responses: Array<{...}>;
    isoControls?: ISOControlForPrompt[];  // Per-assessment applicable controls
  }): string;
}
```

### 2. Update scoringPrompt.ts Functions

**File:** `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.ts`

Update `buildScoringSystemPrompt()` to accept and append ISO catalog:
```typescript
import { ISOControlForPrompt } from '../../../domain/compliance/types.js';
import { buildISOCatalogSection } from './scoringPrompt.iso.js';

export function buildScoringSystemPrompt(isoControls?: ISOControlForPrompt[]): string {
  // ... existing prompt building ...

  // Append ISO catalog if controls provided
  const isoCatalog = isoControls ? buildISOCatalogSection(isoControls) : '';

  return `...existing prompt...${isoCatalog ? `\n\n${isoCatalog}` : ''}`;
}
```

Update `buildScoringUserPrompt()` to accept and append ISO applicability:
```typescript
import { buildISOApplicabilitySection } from './scoringPrompt.iso.js';

export function buildScoringUserPrompt(params: {
  vendorName: string;
  solutionName: string;
  solutionType: SolutionType;
  responses: Array<{...}>;
  isoControls?: ISOControlForPrompt[];
}): string {
  // ... existing prompt building ...

  // Append ISO applicability if controls provided
  const isoSection = params.isoControls
    ? buildISOApplicabilitySection(params.isoControls)
    : '';

  return `...existing prompt...${isoSection ? `\n\n${isoSection}` : ''}

Please analyze these responses and provide your risk assessment.`;
}
```

### 3. Add Confidence Instructions to System Prompt

In the system prompt (after the Output Format section), add:

```
## Assessment Confidence

For EACH dimension, provide an assessmentConfidence in your findings:
- level: "high" (specific verifiable evidence), "medium" (partial evidence), or "low" (vague claims)
- rationale: Explain WHY this confidence level, citing specific evidence and ISO references

A bare confidence level without rationale is NOT acceptable.

## ISO Clause References

For EACH ISO-mapped dimension, include isoClauseReferences listing relevant clauses and their alignment status:
- "aligned": Vendor evidence directly supports this control
- "partial": Some evidence but gaps remain
- "not_evidenced": No evidence provided for this control
- "not_applicable": Control is not relevant to this assessment

For Clinical Risk, Vendor Viability, Ethical Considerations, and Sustainability: these are Guardian-native dimensions with no ISO mapping. Set isoClauseReferences to an empty array [] for these dimensions.

## ISO Messaging Rules
- Use "ISO-traceable" or "ISO-informed" language
- Do NOT use "ISO-compliant", "ISO-certified", or "meets ISO requirements"
```

### 4. Update ScoringPromptBuilder

**File:** `packages/backend/src/infrastructure/ai/ScoringPromptBuilder.ts`

```typescript
import { ISOControlRetrievalService } from '../../application/services/ISOControlRetrievalService.js';

export class ScoringPromptBuilder implements IPromptBuilder {
  private isoService?: ISOControlRetrievalService;

  constructor(isoService?: ISOControlRetrievalService) {
    this.isoService = isoService;
  }

  buildScoringSystemPrompt(isoControls?: ISOControlForPrompt[]): string {
    return buildScoringSystemPrompt(isoControls);
  }

  buildScoringUserPrompt(params: { ...; isoControls?: ISOControlForPrompt[] }): string {
    return buildScoringUserPrompt(params);
  }

  /**
   * Pre-fetch ISO controls for prompt building.
   * Called by ScoringService before building prompts.
   */
  async fetchISOCatalog(): Promise<ISOControlForPrompt[]> {
    if (!this.isoService) return [];
    return this.isoService.getFullCatalog();
  }

  async fetchApplicableControls(dimensions: string[]): Promise<ISOControlForPrompt[]> {
    if (!this.isoService) return [];
    return this.isoService.getApplicableControls(dimensions);
  }
}
```

## Files Touched

- `packages/backend/src/application/interfaces/IPromptBuilder.ts` - MODIFY (add optional ISO params)
- `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.ts` - MODIFY (accept + append ISO sections, add confidence + ISO instructions)
- `packages/backend/src/infrastructure/ai/ScoringPromptBuilder.ts` - MODIFY (add ISO service, fetchISO methods)

## Tests Affected

- `packages/backend/__tests__/unit/domain/scoring/scoringContract.test.ts` - Tests validator/schema alignment. Should still pass with optional params.
- Any test that mocks `IPromptBuilder` will need optional params added to mock. Check: `ScoringService.test.ts`, `ScoringLLMService.test.ts`.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Update `ScoringPromptBuilder` tests:
  - Test: `buildScoringSystemPrompt()` without ISO returns existing prompt
  - Test: `buildScoringSystemPrompt(controls)` appends ISO catalog section
  - Test: `buildScoringUserPrompt()` without ISO returns existing prompt
  - Test: `buildScoringUserPrompt({..., isoControls})` appends ISO applicability
  - Test: system prompt includes confidence instructions
  - Test: system prompt includes ISO messaging rules
  - Test: system prompt does NOT contain prohibited terms
- [ ] Verify existing `scoringContract.test.ts` still passes

## Definition of Done

- [ ] Interface updated with optional ISO params
- [ ] Prompt functions accept and append ISO sections
- [ ] Confidence + ISO instructions added to system prompt
- [ ] Messaging guidelines embedded
- [ ] All existing tests pass
- [ ] New tests for ISO prompt injection
- [ ] All files under 300 LOC
- [ ] No TypeScript errors
