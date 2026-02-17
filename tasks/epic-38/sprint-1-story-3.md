# Story 38.1.3: Split exportNarrativePrompt into System and User Prompt Files

## Description

Split `exportNarrativePrompt.ts` (393 LOC) into two focused files: one for the system prompt and one for the user prompt builder. The current file contains `buildExportNarrativeSystemPrompt()` (lines 53-198, ~145 LOC) and `buildExportNarrativeUserPrompt()` (lines 266-393, ~127 LOC) plus helper functions. After the split, the original file becomes a thin barrel re-export for backward compatibility. Zero behavioral change.

## Acceptance Criteria

- [ ] `exportNarrativeSystemPrompt.ts` created with `buildExportNarrativeSystemPrompt()` function
- [ ] `exportNarrativeUserPrompt.ts` created with `buildExportNarrativeUserPrompt()`, `formatDimensionScore()`, `truncateText()`, and constants
- [ ] `exportNarrativePrompt.ts` becomes a barrel re-export file (~30 LOC)
- [ ] All existing imports of `exportNarrativePrompt.ts` continue to work (barrel re-exports)
- [ ] `ExportNarrativePromptBuilder.ts` continues to work without changes
- [ ] All existing `ExportNarrativeGenerator.test.ts` tests pass unchanged
- [ ] No TypeScript errors
- [ ] Each new file under 300 LOC

## Technical Approach

### 1. Create exportNarrativeSystemPrompt.ts

**File:** `packages/backend/src/infrastructure/ai/prompts/exportNarrativeSystemPrompt.ts` (CREATE)

```typescript
/**
 * Export Narrative System Prompt
 * Static prompt for Claude narrative generation (cacheable).
 */
import {
  RUBRIC_VERSION,
  DIMENSION_CONFIG,
  ALL_DIMENSIONS,
} from '../../../domain/scoring/rubric.js';

/**
 * Build the export narrative system prompt.
 * Static prompt suitable for prompt caching.
 */
export function buildExportNarrativeSystemPrompt(): string {
  // Exact logic from exportNarrativePrompt.ts lines 53-198
}
```

### 2. Create exportNarrativeUserPrompt.ts

**File:** `packages/backend/src/infrastructure/ai/prompts/exportNarrativeUserPrompt.ts` (CREATE)

```typescript
/**
 * Export Narrative User Prompt
 * Dynamic prompt with scoring data and evidence.
 */
import { RiskDimension } from '../../../domain/types/QuestionnaireSchema.js';
import {
  DIMENSION_CONFIG,
  DIMENSION_WEIGHTS,
  SolutionType,
} from '../../../domain/scoring/rubric.js';
import {
  RiskRating,
  Recommendation,
  DimensionScoreData,
} from '../../../domain/scoring/types.js';

export const MAX_RESPONSE_LENGTH = 500;
export const MAX_TOP_RESPONSES = 30;

export function truncateText(text: string, maxLength: number): string {
  // Exact logic from lines 203-208
}

function formatDimensionScore(dimScore: DimensionScoreData): string {
  // Exact logic from lines 213-258 (stays private to this module)
}

export function buildExportNarrativeUserPrompt(params: {
  vendorName: string;
  solutionName: string;
  solutionType: SolutionType;
  compositeScore: number;
  overallRiskRating: RiskRating;
  recommendation: Recommendation;
  dimensionScores: DimensionScoreData[];
  keyFindings: string[];
  executiveSummary: string;
  topResponses: Array<{
    sectionNumber: number;
    questionNumber: number;
    questionText: string;
    responseText: string;
  }>;
}): string {
  // Exact logic from lines 266-393
}
```

### 3. Update exportNarrativePrompt.ts to barrel re-export

**File:** `packages/backend/src/infrastructure/ai/prompts/exportNarrativePrompt.ts` (MODIFY)

Replace entire file with barrel re-exports for backward compatibility:

```typescript
/**
 * Export Narrative Prompt - Barrel Re-export
 *
 * Original file split into:
 * - exportNarrativeSystemPrompt.ts (system prompt, cacheable)
 * - exportNarrativeUserPrompt.ts (user prompt with scoring data)
 *
 * This file preserves backward compatibility for existing imports.
 */
export { buildExportNarrativeSystemPrompt } from './exportNarrativeSystemPrompt.js';
export {
  buildExportNarrativeUserPrompt,
  truncateText,
  MAX_RESPONSE_LENGTH,
  MAX_TOP_RESPONSES,
} from './exportNarrativeUserPrompt.js';
```

### 4. Key Rules

- **Barrel re-export preserves backward compatibility**: `ExportNarrativePromptBuilder.ts` imports from `./prompts/exportNarrativePrompt.js` and will continue to work.
- **`formatDimensionScore` stays private**: It is only called within the user prompt builder (not exported from original file). Keep it as a module-private function in `exportNarrativeUserPrompt.ts`.
- **Constants (`MAX_RESPONSE_LENGTH`, `MAX_TOP_RESPONSES`)**: Move to user prompt file since they are only used by the user prompt builder and `truncateText`.

## Files Touched

- `packages/backend/src/infrastructure/ai/prompts/exportNarrativeSystemPrompt.ts` - CREATE (~160 LOC)
- `packages/backend/src/infrastructure/ai/prompts/exportNarrativeUserPrompt.ts` - CREATE (~200 LOC)
- `packages/backend/src/infrastructure/ai/prompts/exportNarrativePrompt.ts` - MODIFY (replace with ~15 LOC barrel re-export)

## Tests Affected

- `packages/backend/__tests__/unit/infrastructure/ai/ExportNarrativeGenerator.test.ts` - Should pass without changes (imports through builder interface)
- Any tests importing directly from `exportNarrativePrompt.ts` - Should pass (barrel re-export)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/ai/prompts/exportNarrativeSystemPrompt.test.ts`
  - Test `buildExportNarrativeSystemPrompt` returns string containing "Guardian"
  - Test system prompt mentions all 10 dimensions
  - Test system prompt includes rubric version
  - Test system prompt includes formatting requirements section
  - Test system prompt includes "DO NOT GENERATE" section
- [ ] `packages/backend/__tests__/unit/infrastructure/ai/prompts/exportNarrativeUserPrompt.test.ts`
  - Test `buildExportNarrativeUserPrompt` includes vendor name
  - Test user prompt includes composite score
  - Test user prompt includes dimension scores for all provided dimensions
  - Test user prompt includes formatted top responses
  - Test user prompt truncates long responses
  - Test `truncateText` with text under limit returns unchanged
  - Test `truncateText` with text over limit truncates with ellipsis

## Definition of Done

- [ ] Two new prompt files created and compile
- [ ] `exportNarrativePrompt.ts` is a barrel re-export (~15 LOC)
- [ ] All existing tests pass (zero regressions)
- [ ] New prompt tests written and passing
- [ ] No TypeScript errors
- [ ] No behavioral changes
