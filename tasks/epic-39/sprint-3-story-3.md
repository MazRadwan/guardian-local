# Story 39.3.3: Prompt Restructure -- ISO to User Prompt

## Description

Move the ISO control catalog from the system prompt to the user prompt. Currently, `buildScoringSystemPrompt(isoControls)` includes ISO controls in the system prompt, which breaks prompt caching when different assessments have different ISO control sets. By making the system prompt static (rubric only) and moving ISO data to the user prompt, the system prompt becomes fully cacheable across all scoring calls.

This is the key optimization for prompt caching: a static ~2,650 token system prompt gets cached once and reused for every scoring call, saving ~$0.008 per call in input token costs and potentially reducing latency.

## Acceptance Criteria

- [ ] `buildScoringSystemPrompt()` no longer accepts or includes ISO controls -- produces static rubric-only prompt
- [ ] `buildScoringUserPrompt()` accepts ISO catalog controls as a separate section (in addition to applicable controls)
- [ ] System prompt content is identical across all scoring calls (no per-assessment variation)
- [ ] ISO catalog appears in user prompt as a reference section (before vendor responses)
- [ ] Scoring quality unchanged -- Claude receives the same information, just in different prompt positions
- [ ] Metrics from Story 39.3.2 show improved cache hit rate (system prompt cached)
- [ ] Under 300 LOC per file
- [ ] No TypeScript errors

## Technical Approach

### 1. Update scoringPrompt.ts

**File:** `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.ts`

```typescript
// Current:
export function buildScoringSystemPrompt(isoControls?: ISOControlForPrompt[]): string {
  let prompt = STATIC_RUBRIC_PROMPT;
  if (isoControls?.length) {
    prompt += buildISOCatalogSection(isoControls);
  }
  return prompt;
}

// New:
export function buildScoringSystemPrompt(): string {
  return STATIC_RUBRIC_PROMPT;  // Always static, always cacheable
}

export function buildScoringUserPrompt(params: {
  vendorName: string;
  solutionName: string;
  solutionType: SolutionType;
  responses: Array<{ ... }>;
  isoControls?: ISOControlForPrompt[];      // Applicable controls (per-dimension)
  isoCatalog?: ISOControlForPrompt[];       // Full catalog (reference)
}): string {
  let prompt = '';

  // ISO catalog reference section (if provided)
  if (params.isoCatalog?.length) {
    prompt += buildISOCatalogSection(params.isoCatalog);
    prompt += '\n\n---\n\n';
  }

  // Applicable controls for this assessment
  if (params.isoControls?.length) {
    prompt += buildISOApplicableSection(params.isoControls);
    prompt += '\n\n---\n\n';
  }

  // Vendor responses (always present)
  prompt += buildVendorResponseSection(params);

  return prompt;
}
```

### 2. Update ScoringPromptBuilder

**File:** `packages/backend/src/infrastructure/ai/ScoringPromptBuilder.ts`

Remove the `isoControls` parameter from `buildScoringSystemPrompt()`:

```typescript
buildScoringSystemPrompt(): string {
  return buildScoringSystemPrompt();  // No ISO controls -- static
}

buildScoringUserPrompt(params: {
  // ... existing params ...
  isoCatalog?: ISOControlForPrompt[];  // NEW -- full catalog for reference
}): string {
  return buildScoringUserPrompt(params);
}
```

### 3. Update IPromptBuilder Interface

**File:** `packages/backend/src/application/interfaces/IPromptBuilder.ts`

```typescript
buildScoringSystemPrompt(): string;  // Remove optional isoControls parameter
```

### 4. Update ScoringLLMService Call Site

**File:** `packages/backend/src/application/services/ScoringLLMService.ts`

```typescript
// Current:
const systemPrompt = this.promptBuilder.buildScoringSystemPrompt(isoOptions?.catalogControls);
const userPrompt = this.promptBuilder.buildScoringUserPrompt({
  ...params,
  isoControls: isoOptions?.applicableControls,
});

// New:
const systemPrompt = this.promptBuilder.buildScoringSystemPrompt();  // Static, cacheable
const userPrompt = this.promptBuilder.buildScoringUserPrompt({
  ...params,
  isoControls: isoOptions?.applicableControls,
  isoCatalog: isoOptions?.catalogControls,  // Moved to user prompt
});
```

## Files Touched

- `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.ts` - MODIFY (move ISO from system to user prompt)
- `packages/backend/src/infrastructure/ai/ScoringPromptBuilder.ts` - MODIFY (update method signatures)
- `packages/backend/src/application/interfaces/IPromptBuilder.ts` - MODIFY (remove isoControls from buildScoringSystemPrompt)
- `packages/backend/src/application/services/ScoringLLMService.ts` - MODIFY (update call site)

## Tests Affected

Existing tests that may need updates:
- `packages/backend/__tests__/unit/application/services/ScoringLLMService.test.ts` - Assertions on `buildScoringSystemPrompt` call will need updating (no longer receives ISO controls).
- Any tests that assert system prompt content contains ISO data will need updating (ISO now in user prompt).

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Test buildScoringSystemPrompt returns identical content regardless of assessment
- [ ] Test buildScoringUserPrompt includes ISO catalog when provided
- [ ] Test buildScoringUserPrompt includes applicable controls when provided
- [ ] Test buildScoringUserPrompt works without ISO data (backward compatible)
- [ ] Test ScoringLLMService calls buildScoringSystemPrompt without ISO parameter
- [ ] Test ScoringLLMService passes ISO catalog to buildScoringUserPrompt
- [ ] Test system prompt is identical across multiple scoring calls (cache-friendly)

## Definition of Done

- [ ] System prompt is static (no ISO controls)
- [ ] ISO catalog moved to user prompt
- [ ] All existing tests updated and passing
- [ ] Scoring quality unchanged (same information, different position)
- [ ] Under 300 LOC per file
- [ ] No TypeScript errors
- [ ] No lint errors
