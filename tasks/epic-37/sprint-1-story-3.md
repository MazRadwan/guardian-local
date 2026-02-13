# Story 37.1.3: Wire Split Services into ScoringService + Update DI

## Description

Now that `ScoringStorageService` (37.1.1) and `ScoringLLMService` (37.1.2) exist, update `ScoringService.ts` to delegate to them instead of containing the logic inline. Remove the extracted methods, update the constructor, and update the DI container in `index.ts`. Target: ScoringService drops from 542 LOC to ~220 LOC.

## Acceptance Criteria

- [ ] `ScoringService.ts` delegates `storeResponses` to `ScoringStorageService`
- [ ] `ScoringService.ts` delegates `storeScores` to `ScoringStorageService`
- [ ] `ScoringService.ts` delegates `deriveDocumentType` to `ScoringStorageService`
- [ ] `ScoringService.ts` delegates `determineSolutionType` to `ScoringStorageService`
- [ ] `ScoringService.ts` delegates `scoreWithClaude` to `ScoringLLMService`
- [ ] 5 private methods removed from ScoringService
- [ ] Constructor updated: add `ScoringStorageService`, `ScoringLLMService`; remove `ITransactionRunner` (moved to storage service)
- [ ] `ScoringService.ts` is under 300 LOC (target: ~220)
- [ ] `index.ts` DI container updated to construct and inject new services
- [ ] All existing tests pass (zero regressions)
- [ ] No behavioral change (pure refactor)

## Technical Approach

### 1. Update ScoringService Constructor

**File:** `packages/backend/src/application/services/ScoringService.ts`

Current constructor (12 params):
```typescript
constructor(
  private responseRepo: IResponseRepository,        // REMOVE (moved to storage)
  private dimensionScoreRepo: IDimensionScoreRepository,  // REMOVE
  private assessmentResultRepo: IAssessmentResultRepository, // KEEP (for todayCount)
  private assessmentRepo: IAssessmentRepository,     // KEEP
  private fileRepo: IFileRepository,                 // KEEP
  private fileStorage: IFileStorage,                 // KEEP
  private documentParser: IScoringDocumentParser,     // KEEP
  private llmClient: ILLMClient,                     // REMOVE (moved to LLM service)
  private promptBuilder: IPromptBuilder,             // REMOVE (moved to LLM service)
  private validator: ScoringPayloadValidator,        // KEEP
  private transactionRunner: ITransactionRunner,     // REMOVE (moved to storage)
  private conversationRepo?: IConversationRepository // KEEP
)
```

New constructor (9 params):
```typescript
constructor(
  private assessmentResultRepo: IAssessmentResultRepository,
  private assessmentRepo: IAssessmentRepository,
  private fileRepo: IFileRepository,
  private fileStorage: IFileStorage,
  private documentParser: IScoringDocumentParser,
  private validator: ScoringPayloadValidator,
  private storageService: ScoringStorageService,
  private llmService: ScoringLLMService,
  private conversationRepo?: IConversationRepository
)
```

### 2. Update `score()` Method Calls

Replace internal method calls with service delegation:

```typescript
// BEFORE:
const docType = this.deriveDocumentType(fileRecord.mimeType);
// AFTER:
const docType = this.storageService.deriveDocumentType(fileRecord.mimeType);

// BEFORE:
const solutionType = this.determineSolutionType(assessment);
// AFTER:
const solutionType = this.storageService.determineSolutionType(assessment);

// BEFORE:
await this.storeResponses(parseResult, assessmentId, batchId, fileId);
// AFTER:
await this.storageService.storeResponses(parseResult, assessmentId, batchId, fileId);

// BEFORE:
const { narrativeReport, payload } = await this.scoreWithClaude(...);
// AFTER:
const { narrativeReport, payload } = await this.llmService.scoreWithClaude(...);

// BEFORE:
await this.storeScores(assessmentId, batchId, ...);
// AFTER:
await this.storageService.storeScores(assessmentId, batchId, ...);
```

### 3. Remove Extracted Methods

Delete these methods from ScoringService:
- `storeResponses()` (lines 280-301)
- `deriveDocumentType()` (lines 307-313)
- `determineSolutionType()` (lines 325-345)
- `scoreWithClaude()` (lines 352-418)
- `storeScores()` (lines 425-474)

### 4. Keep `getResultForConversation()`

This method (lines 488-541) stays in ScoringService because it uses `conversationRepo`, `assessmentResultRepo`, and `dimensionScoreRepo` directly. However, `dimensionScoreRepo` needs to remain accessible. Two options:

**Option A (preferred)**: Keep `dimensionScoreRepo` in constructor for `getResultForConversation()`.
**Option B**: Move `getResultForConversation` to a separate service.

Choose Option A for minimal change. Updated constructor becomes 10 params:
```typescript
constructor(
  private assessmentResultRepo: IAssessmentResultRepository,
  private assessmentRepo: IAssessmentRepository,
  private dimensionScoreRepo: IDimensionScoreRepository,  // KEEP for getResultForConversation
  private fileRepo: IFileRepository,
  private fileStorage: IFileStorage,
  private documentParser: IScoringDocumentParser,
  private validator: ScoringPayloadValidator,
  private storageService: ScoringStorageService,
  private llmService: ScoringLLMService,
  private conversationRepo?: IConversationRepository
)
```

### 5. Update DI Container

**File:** `packages/backend/src/index.ts` (around line 214-230)

```typescript
// BEFORE:
const scoringService = new ScoringService(
  responseRepo, dimensionScoreRepo, assessmentResultRepo, assessmentRepo,
  fileRepo, fileStorage, documentParserService, claudeClient,
  scoringPromptBuilder, scoringPayloadValidator, transactionRunner, conversationRepo
);

// AFTER:
const scoringStorageService = new ScoringStorageService(
  responseRepo, dimensionScoreRepo, assessmentResultRepo, transactionRunner, claudeClient
);
const scoringLLMService = new ScoringLLMService(claudeClient, scoringPromptBuilder);
const scoringService = new ScoringService(
  assessmentResultRepo, assessmentRepo, dimensionScoreRepo,
  fileRepo, fileStorage, documentParserService, scoringPayloadValidator,
  scoringStorageService, scoringLLMService, conversationRepo
);
```

### 6. Update Imports

Remove unused imports from ScoringService:
- `IResponseRepository`
- `ITransactionRunner`
- `ILLMClient` (partially - still needed for `getModelId()` in report)
- `IPromptBuilder`
- `scoringCompleteTool`
- `DocumentMetadata`, `DocumentType`, `MIME_TYPE_MAP` (moved to storage)

**WAIT**: `ScoringService.score()` still references `this.llmClient.getModelId()` on line 247/454 for the report and storeScores. Since `storeScores` is now in `ScoringStorageService` which already has `llmClient`, this is handled. But `ScoringReportData` on line 247 also needs `modelId`. Solution: `ScoringLLMService` should expose `getModelId()`.

Add to `ScoringLLMService`:
```typescript
getModelId(): string {
  return this.llmClient.getModelId();
}
```

Then in ScoringService, use `this.llmService.getModelId()` for the report data.

## Files Touched

- `packages/backend/src/application/services/ScoringService.ts` - MODIFY (remove 5 methods, update constructor, update delegation calls)
- `packages/backend/src/application/services/ScoringLLMService.ts` - MODIFY (add `getModelId()` proxy method)
- `packages/backend/src/index.ts` - MODIFY (update DI wiring, ~lines 214-230)
- `packages/backend/__tests__/integration/scoring-trigger.test.ts` - MODIFY (update ScoringService constructor call from 12 to 10 params)
- `packages/backend/__tests__/integration/scoring-rehydration.test.ts` - MODIFY (update ScoringService constructor call from 12 to 10 params)

## Tests Affected

- `packages/backend/__tests__/unit/application/services/ScoringService.test.ts` - Constructor signature changed. Must update mock setup to provide `ScoringStorageService` and `ScoringLLMService` instead of individual repos/services. All test assertions should still pass since behavior is unchanged.
- `packages/backend/__tests__/integration/scoring-trigger.test.ts` - Constructs `new ScoringService(...)` directly. Constructor signature change from 12→10 params WILL break this test. MUST update.
- `packages/backend/__tests__/integration/scoring-rehydration.test.ts` - Constructs `new ScoringService(...)` directly. Constructor signature change WILL break this test. MUST update.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Update `ScoringService.test.ts` to use new constructor with mocked `ScoringStorageService` and `ScoringLLMService`
- [ ] Verify all existing test cases pass without modification to assertions
- [ ] Add test: `score()` delegates to `storageService.storeResponses()`
- [ ] Add test: `score()` delegates to `llmService.scoreWithClaude()`
- [ ] Add test: `score()` delegates to `storageService.storeScores()`
- [ ] Add test: report data uses `llmService.getModelId()`
- [ ] Update constructor calls in `scoring-trigger.test.ts` and `scoring-rehydration.test.ts`
- [ ] Verify all integration tests pass with updated constructor

## Definition of Done

- [ ] ScoringService.ts is under 300 LOC
- [ ] Constructor reduced from 12 to 10 params
- [ ] 5 methods removed, replaced with service delegation
- [ ] DI container updated in index.ts
- [ ] All existing tests pass
- [ ] No TypeScript errors
- [ ] No behavioral change
