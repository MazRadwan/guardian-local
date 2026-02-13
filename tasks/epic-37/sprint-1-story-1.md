# Story 37.1.1: Extract ScoringService Helper Methods to ScoringStorageService

## Description

Extract the storage-related helper methods from `ScoringService.ts` (542 LOC) into a new `ScoringStorageService`. This is Phase 1 of the ScoringService split. The new service handles response storage, score storage, and the document type derivation helper. Zero behavioral change.

## Acceptance Criteria

- [ ] `ScoringStorageService.ts` created with 3 methods extracted from ScoringService
- [ ] `storeResponses()` is exact logic from ScoringService lines 280-301
- [ ] `storeScores()` is exact logic from ScoringService lines 425-474
- [ ] `deriveDocumentType()` is exact logic from ScoringService lines 307-313
- [ ] `determineSolutionType()` is exact logic from ScoringService lines 325-345
- [ ] Constructor accepts required repositories: `IResponseRepository`, `IDimensionScoreRepository`, `IAssessmentResultRepository`, `ITransactionRunner`, `ILLMClient`
- [ ] Under 300 LOC
- [ ] No TypeScript errors
- [ ] Compiles independently (no circular imports)

## Technical Approach

### 1. Create ScoringStorageService

**File:** `packages/backend/src/application/services/ScoringStorageService.ts`

```typescript
import { IResponseRepository } from '../interfaces/IResponseRepository.js';
import { IDimensionScoreRepository } from '../interfaces/IDimensionScoreRepository.js';
import { IAssessmentResultRepository } from '../interfaces/IAssessmentResultRepository.js';
import { ITransactionRunner } from '../interfaces/ITransactionRunner.js';
import { ILLMClient } from '../interfaces/ILLMClient.js';
import { DocumentType, MIME_TYPE_MAP } from '../interfaces/IDocumentParser.js';
import { ScoringCompletePayload } from '../../domain/scoring/types.js';
import { RUBRIC_VERSION, SolutionType } from '../../domain/scoring/rubric.js';
import { ScoringError } from '../../domain/scoring/errors.js';
import { ScoringParseResult } from '../interfaces/IScoringDocumentParser.js';

export class ScoringStorageService {
  constructor(
    private responseRepo: IResponseRepository,
    private dimensionScoreRepo: IDimensionScoreRepository,
    private assessmentResultRepo: IAssessmentResultRepository,
    private transactionRunner: ITransactionRunner,
    private llmClient: ILLMClient
  ) {}

  // storeResponses - exact copy from ScoringService lines 280-301
  async storeResponses(
    parseResult: ScoringParseResult,
    assessmentId: string,
    batchId: string,
    fileId: string
  ): Promise<void> { ... }

  // storeScores - exact copy from ScoringService lines 425-474
  async storeScores(
    assessmentId: string,
    batchId: string,
    payload: ScoringCompletePayload,
    narrativeReport: string,
    durationMs: number
  ): Promise<void> { ... }

  // deriveDocumentType - exact copy from ScoringService lines 307-313
  deriveDocumentType(mimeType: string): DocumentType { ... }

  // determineSolutionType - exact copy from ScoringService lines 325-345
  determineSolutionType(assessment: { solutionType?: string | null }): SolutionType { ... }
}
```

### 2. Key Details

- **Direct method copy**: All 4 methods are copied verbatim from ScoringService.
- **No behavior changes**: The methods retain identical logic, parameter signatures, return types, error handling, and logging.
- **Import alignment**: Uses the same interfaces ScoringService currently imports.
- **`storeScores` transaction**: Keep the try/catch wrapping `transactionRunner.run()` exactly as-is.
- **`determineSolutionType`**: This is a pure function but depends on `SolutionType` from rubric. Keep as instance method for consistency.
- **Do NOT modify ScoringService.ts yet** -- that happens in Story 37.1.3.

## Files Touched

- `packages/backend/src/application/services/ScoringStorageService.ts` - CREATE (~140 LOC)

## Tests Affected

- None -- this is a pure creation story. ScoringService.ts is not modified yet.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/application/services/ScoringStorageService.test.ts`
  - Test `storeResponses` maps parse result to repository create call
  - Test `storeScores` wraps insert in transaction
  - Test `storeScores` throws ScoringError on transaction failure
  - Test `deriveDocumentType` maps known MIME types
  - Test `deriveDocumentType` throws on unknown MIME type
  - Test `determineSolutionType` returns correct SolutionType for valid inputs
  - Test `determineSolutionType` defaults to 'clinical_ai' when null/undefined
  - Test `determineSolutionType` defaults to 'clinical_ai' for invalid string

## Definition of Done

- [ ] File created and compiles
- [ ] All 4 methods present with exact logic from ScoringService
- [ ] Unit tests written and passing
- [ ] Under 300 LOC
- [ ] No TypeScript errors
