# Story 37.6.5: Wire ISO Services into ScoringService + DI Container

## Description

The final integration story: wire the ISO services into the scoring pipeline. `ScoringService.score()` fetches ISO controls via `ScoringLLMService` proxy methods (which delegate to `IPromptBuilder`), then passes them to `scoreWithClaude()`. The `ScoringService` constructor is unchanged from 37.1.3 (9 params) -- ISO data flows through `ScoringLLMService` -> `IPromptBuilder` interface, preserving clean architecture. Also increase `maxTokens` from 8000 to 10000 to accommodate the larger ISO-enriched output.

## Acceptance Criteria

- [ ] `ScoringService.score()` fetches ISO catalog and applicable controls before scoring
- [ ] ISO controls passed to `ScoringLLMService.scoreWithClaude()` which passes them to prompt builder
- [ ] `ScoringLLMService` `maxTokens` increased from 8000 to 10000
- [ ] `ScoringPromptBuilder` receives `ISOControlRetrievalService` via DI (configured in 37.6.4)
- [ ] `ScoringLLMService` exposes `fetchISOCatalog()` and `fetchApplicableControls()` proxy methods (delegating to its `IPromptBuilder`)
- [ ] DI container in `index.ts` constructs and injects ISO repositories + services
- [ ] `ScoringService` constructor unchanged from 37.1.3 (9 params, no new deps)
- [ ] All existing tests pass
- [ ] No TypeScript errors

## Technical Approach

### 1. Update ScoringLLMService

**File:** `packages/backend/src/application/services/ScoringLLMService.ts`

Update `scoreWithClaude()` to accept and pass ISO controls. Also add `fetchISOCatalog()` and `fetchApplicableControls()` proxy methods so `ScoringService` can fetch ISO data through `ScoringLLMService` without needing a direct dependency on `ScoringPromptBuilder`:

```typescript
// Proxy methods: ScoringService calls these to fetch ISO data.
// Uses optional IPromptBuilder interface methods (added in 37.6.4).
// This keeps ISO data flowing through ScoringLLMService -> IPromptBuilder (interface)
// rather than injecting ScoringPromptBuilder (infrastructure) directly into ScoringService.
async fetchISOCatalog(): Promise<ISOControlForPrompt[]> {
  return this.promptBuilder.fetchISOCatalog?.() ?? Promise.resolve([]);
}

async fetchApplicableControls(dimensions: string[]): Promise<ISOControlForPrompt[]> {
  return this.promptBuilder.fetchApplicableControls?.(dimensions) ?? Promise.resolve([]);
}

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

Add ISO control fetching before the scoring call. The `ScoringLLMService` already holds `IPromptBuilder` (which has `fetchISOCatalog()` and `fetchApplicableControls()` after 37.6.4). No new constructor params needed on `ScoringService` -- ISO data flows through the existing `ScoringLLMService`:

```typescript
// ScoringService constructor is UNCHANGED from 37.1.3 (9 params):
constructor(
  private assessmentResultRepo: IAssessmentResultRepository,
  private assessmentRepo: IAssessmentRepository,
  private fileRepo: IFileRepository,
  private fileStorage: IFileStorage,
  private documentParser: IScoringDocumentParser,
  private validator: ScoringPayloadValidator,
  private storageService: ScoringStorageService,
  private llmService: ScoringLLMService,
  private queryService: ScoringQueryService
)

async score(...) {
  // ... existing auth, parsing, validation gates ...

  // NEW: Fetch ISO controls via ScoringLLMService (which delegates to IPromptBuilder)
  const [catalogControls, applicableControls] = await Promise.all([
    this.llmService.fetchISOCatalog(),
    this.llmService.fetchApplicableControls(ALL_DIMENSIONS as string[]),
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

Add ISO repository + service construction. The `ScoringService` constructor is **unchanged** from 37.1.3 (9 params). ISO data flows through `ScoringPromptBuilder` -> `ScoringLLMService`, not through `ScoringService` directly:

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

// ScoringLLMService (already created in Sprint 1, now with ISO-aware prompt builder)
const scoringLLMService = new ScoringLLMService(claudeClient, scoringPromptBuilder);

// ScoringService constructor unchanged from 37.1.3 (9 params)
// ISO data flows through ScoringLLMService -> ScoringPromptBuilder, NOT through ScoringService
const scoringService = new ScoringService(
  assessmentResultRepo, assessmentRepo,
  fileRepo, fileStorage, documentParserService, scoringPayloadValidator,
  scoringStorageService, scoringLLMService, scoringQueryService
);
```

### 4. Key Details

- **maxTokens increase**: 8000 -> 10000. Per audit: "increase to 10000 for ISO headroom"
- **ISO is optional**: If no ISO data seeded (empty DB), controls arrays are empty, prompts are unchanged. This ensures backwards compatibility.
- **Prompt caching**: The system prompt (with ISO catalog) is still cacheable via PromptCacheManager. The ISO catalog is static per criteria version.
- **ALL_DIMENSIONS**: All 10 dimensions are passed to `getApplicableControls()`. The service returns empty for clinical_risk, vendor_capability, ethical_considerations, and sustainability (no mappings in DB).

## Files Touched

- `packages/backend/src/application/services/ScoringService.ts` - MODIFY (add ISO fetching via llmService, NO constructor change)
- `packages/backend/src/application/services/ScoringLLMService.ts` - MODIFY (accept ISO data, add fetchISO proxy methods, change maxTokens to 10000)
- `packages/backend/src/index.ts` - MODIFY (construct ISO repos + services, update DI wiring)

## Tests Affected

- `packages/backend/__tests__/unit/application/services/ScoringService.test.ts` - No constructor change. Add tests for ISO fetching via `llmService.fetchISOCatalog()` / `fetchApplicableControls()`.
- `packages/backend/__tests__/unit/application/services/ScoringLLMService.test.ts` - `scoreWithClaude` signature change (optional isoOptions). Existing tests should pass since param is optional. Add tests for `fetchISOCatalog()` / `fetchApplicableControls()` proxy methods.
- `packages/backend/__tests__/integration/scoring-trigger.test.ts` - No constructor change needed. ScoringService constructor is unchanged from 37.1.3.

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
