# Story 37.6.5: Wire ISO Services into ScoringService + DI Container

## Description

The final integration story: wire the ISO services into the scoring pipeline. `ScoringService.score()` now fetches ISO controls before scoring, passes them to the prompt builder, and the LLM service uses the enriched prompts. Also increase `maxTokens` from 8000 to 10000 to accommodate the larger ISO-enriched output.

## Acceptance Criteria

- [ ] `ScoringService.score()` fetches ISO catalog and applicable controls before scoring
- [ ] ISO controls passed to `ScoringLLMService.scoreWithClaude()` which passes them to prompt builder
- [ ] `ScoringLLMService` `maxTokens` increased from 8000 to 10000
- [ ] `ScoringPromptBuilder` receives `ISOControlRetrievalService` via DI
- [ ] DI container in `index.ts` constructs and injects ISO repositories + services
- [ ] All existing tests pass
- [ ] No TypeScript errors

## Technical Approach

### 1. Update ScoringLLMService

**File:** `packages/backend/src/application/services/ScoringLLMService.ts`

Update `scoreWithClaude()` to accept and pass ISO controls:

```typescript
async scoreWithClaude(
  parseResult: ScoringParseResult,
  vendorName: string,
  solutionName: string,
  solutionType: SolutionType,
  abortSignal: AbortSignal,
  onMessage: (message: string) => void,
  isoOptions?: {
    catalogControls: ISOControlForPrompt[];
    applicableControls: ISOControlForPrompt[];
  }
): Promise<ScoreWithClaudeResult> {
  // Build prompts with ISO data
  const systemPrompt = this.promptBuilder.buildScoringSystemPrompt(
    isoOptions?.catalogControls
  );
  const userPrompt = this.promptBuilder.buildScoringUserPrompt({
    vendorName,
    solutionName,
    solutionType,
    responses: parseResult.responses.map(r => ({...})),
    isoControls: isoOptions?.applicableControls,
  });

  // ... rest of method unchanged except maxTokens
  await this.llmClient.streamWithTool({
    // ...
    maxTokens: 10000, // Increased from 8000 for ISO enrichment headroom
    // ...
  });
}
```

### 2. Update ScoringService.score()

**File:** `packages/backend/src/application/services/ScoringService.ts`

Add ISO control fetching before the scoring call. Add `ScoringPromptBuilder` (typed for ISO methods) to constructor:

```typescript
constructor(
  // ... existing params ...
  private promptBuilder: ScoringPromptBuilder,  // Add for ISO data fetching
) {}

async score(...) {
  // ... existing auth, parsing, validation gates ...

  // NEW: Fetch ISO controls for prompt enrichment
  const [catalogControls, applicableControls] = await Promise.all([
    this.promptBuilder.fetchISOCatalog(),
    this.promptBuilder.fetchApplicableControls(ALL_DIMENSIONS as string[]),
  ]);

  // Score with Claude (now with ISO context)
  const { narrativeReport, payload } = await this.llmService.scoreWithClaude(
    parseResult,
    vendor.name,
    assessment.solutionName || 'Unknown Solution',
    solutionType,
    abortController.signal,
    (message) => onProgress({ status: 'scoring', message }),
    {
      catalogControls,
      applicableControls,
    }
  );

  // ... rest unchanged ...
}
```

### 3. Update DI Container

**File:** `packages/backend/src/index.ts`

Add ISO repository + service construction:

```typescript
import { DrizzleComplianceFrameworkRepository } from './infrastructure/database/repositories/DrizzleComplianceFrameworkRepository.js';
import { DrizzleFrameworkControlRepository } from './infrastructure/database/repositories/DrizzleFrameworkControlRepository.js';
import { DrizzleInterpretiveCriteriaRepository } from './infrastructure/database/repositories/DrizzleInterpretiveCriteriaRepository.js';
import { DrizzleDimensionControlMappingRepository } from './infrastructure/database/repositories/DrizzleDimensionControlMappingRepository.js';
import { ISOControlRetrievalService } from './application/services/ISOControlRetrievalService.js';

// ISO compliance repositories (Epic 37)
const complianceFrameworkRepo = new DrizzleComplianceFrameworkRepository();
const frameworkControlRepo = new DrizzleFrameworkControlRepository();
const interpretiveCriteriaRepo = new DrizzleInterpretiveCriteriaRepository();
const dimensionControlMappingRepo = new DrizzleDimensionControlMappingRepository();

// ISO control retrieval service
const isoControlRetrievalService = new ISOControlRetrievalService(
  dimensionControlMappingRepo,
  interpretiveCriteriaRepo
);

// Update ScoringPromptBuilder to include ISO service
const scoringPromptBuilder = new ScoringPromptBuilder(isoControlRetrievalService);

// ScoringLLMService (already created in Sprint 1)
const scoringLLMService = new ScoringLLMService(claudeClient, scoringPromptBuilder);

// Update ScoringService constructor (add promptBuilder for ISO fetching)
const scoringService = new ScoringService(
  assessmentResultRepo, assessmentRepo, dimensionScoreRepo,
  fileRepo, fileStorage, documentParserService, scoringPayloadValidator,
  scoringStorageService, scoringLLMService,
  scoringPromptBuilder,  // NEW: for ISO data fetching
  conversationRepo
);
```

### 4. Key Details

- **maxTokens increase**: 8000 -> 10000. Per audit: "increase to 10000 for ISO headroom"
- **ISO is optional**: If no ISO data seeded (empty DB), controls arrays are empty, prompts are unchanged. This ensures backwards compatibility.
- **Prompt caching**: The system prompt (with ISO catalog) is still cacheable via PromptCacheManager. The ISO catalog is static per criteria version.
- **ALL_DIMENSIONS**: All 10 dimensions are passed to `getApplicableControls()`. The service returns empty for clinical_risk and vendor_capability (no mappings in DB).

## Files Touched

- `packages/backend/src/application/services/ScoringService.ts` - MODIFY (add ISO fetching, add promptBuilder param)
- `packages/backend/src/application/services/ScoringLLMService.ts` - MODIFY (accept ISO data, change maxTokens to 10000)
- `packages/backend/src/index.ts` - MODIFY (construct ISO repos + services, update DI wiring)

## Tests Affected

- `packages/backend/__tests__/unit/application/services/ScoringService.test.ts` - Constructor change (add promptBuilder). Must update mock setup.
- `packages/backend/__tests__/unit/application/services/ScoringLLMService.test.ts` - `scoreWithClaude` signature change (optional isoOptions). Existing tests should pass since param is optional.
- `packages/backend/__tests__/integration/scoring-trigger.test.ts` - If constructs ScoringService directly, needs constructor update.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Update `ScoringService.test.ts`:
  - Test: `score()` fetches ISO catalog and applicable controls
  - Test: `score()` passes ISO controls to LLM service
  - Test: `score()` works when ISO service returns empty arrays (no data seeded)
- [ ] Update `ScoringLLMService.test.ts`:
  - Test: `scoreWithClaude()` passes ISO controls to prompt builder
  - Test: `scoreWithClaude()` uses maxTokens 10000
  - Test: `scoreWithClaude()` works without isoOptions (backwards compatible)
- [ ] Verify all existing tests pass with updated constructors

## Definition of Done

- [ ] ISO services wired into scoring pipeline
- [ ] maxTokens increased to 10000
- [ ] DI container updated
- [ ] Backwards compatible (works with empty ISO data)
- [ ] All existing tests pass
- [ ] New tests for ISO integration
- [ ] No TypeScript errors
