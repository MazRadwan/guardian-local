# Story 39.4.4: Split ClaudeClient -- Extract Stream Client

## Description

Extract `streamWithTool()` (the `ILLMClient` implementation) from `ClaudeClient.ts` into `ClaudeStreamClient.ts`. The `streamWithTool` method is the most complex method in ClaudeClient (~145 lines) and serves a different purpose (scoring-specific streaming with tool extraction) from the general-purpose `streamMessage` and `sendMessage` methods.

After this split plus Story 39.4.3, `ClaudeClient.ts` should be a thin facade under 300 LOC.

This is a pure refactor with zero behavioral change.

## Acceptance Criteria

- [ ] `ClaudeStreamClient.ts` created with `streamWithTool` and `getModelId` methods
- [ ] Implements `ILLMClient` interface
- [ ] `ClaudeClient.ts` delegates `streamWithTool` and `getModelId` to `ClaudeStreamClient`
- [ ] `ClaudeClient.ts` under 300 LOC (after both 39.4.3 and 39.4.4)
- [ ] `ClaudeStreamClient.ts` under 300 LOC
- [ ] All existing tests pass
- [ ] No TypeScript errors

## Technical Approach

### 1. Create ClaudeStreamClient

**File:** `packages/backend/src/infrastructure/ai/ClaudeStreamClient.ts`

Move the `streamWithTool()` method and `getModelId()`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { ILLMClient, StreamWithToolOptions } from '../../application/interfaces/ILLMClient.js';

export class ClaudeStreamClient implements ILLMClient {
  private client: Anthropic;
  private readonly model = 'claude-sonnet-4-5-20250929';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  getModelId(): string {
    return this.model;
  }

  async streamWithTool(options: StreamWithToolOptions): Promise<void> {
    // Exact copy of current ClaudeClient.streamWithTool
    // Including buildSystemPrompt helper (can be shared or duplicated)
  }

  // Shared helpers needed:
  private buildSystemPrompt(systemPrompt?: string, usePromptCache?: boolean): ...
}
```

### 2. Update ClaudeClient Facade

**File:** `packages/backend/src/infrastructure/ai/ClaudeClient.ts`

After both 39.4.3 and 39.4.4, ClaudeClient becomes:

```typescript
export class ClaudeClient implements IClaudeClient, IVisionClient, ILLMClient {
  private textClient: ClaudeTextClient;
  private visionClient: ClaudeVisionClient;
  private streamClient: ClaudeStreamClient;

  constructor(apiKey: string) {
    this.textClient = new ClaudeTextClient(apiKey);
    this.visionClient = new ClaudeVisionClient(apiKey);
    this.streamClient = new ClaudeStreamClient(apiKey);
  }

  // IClaudeClient delegation
  sendMessage = (...) => this.textClient.sendMessage(...);
  streamMessage = (...) => this.textClient.streamMessage(...);
  continueWithToolResult = (...) => this.textClient.continueWithToolResult(...);

  // IVisionClient delegation
  analyzeImages = (...) => this.visionClient.analyzeImages(...);
  prepareDocument = (...) => this.visionClient.prepareDocument(...);

  // ILLMClient delegation
  getModelId = () => this.streamClient.getModelId();
  streamWithTool = (...) => this.streamClient.streamWithTool(...);
}
```

### 3. Shared `buildSystemPrompt` Helper

The `buildSystemPrompt` method is used by both `streamMessage` (via ClaudeTextClient) and `streamWithTool` (via ClaudeStreamClient). Options:
- (a) Duplicate it in both files (~25 lines, acceptable for independence)
- (b) Extract to a shared `claudeHelpers.ts` utility

Recommend (a) for simplicity -- 25 lines of duplication is acceptable.

## Files Touched

- `packages/backend/src/infrastructure/ai/ClaudeStreamClient.ts` - CREATE (~180 LOC)
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts` - MODIFY (delegate streamWithTool, should be under 300 LOC after this + 39.4.3)

## Tests Affected

Existing tests that may need updates:
- `packages/backend/__tests__/unit/application/services/ScoringLLMService.test.ts` - Mocks `ILLMClient.streamWithTool`. Interface unchanged, no test changes needed.
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ScoringHandler.test.ts` - Indirect dependency, should not need changes.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/ai/ClaudeStreamClient.test.ts`
  - Test streamWithTool calls Anthropic stream API with correct parameters
  - Test onTextDelta callback fires for text deltas
  - Test onToolUse callback fires with parsed tool input
  - Test abort signal cancels streaming
  - Test incomplete tool call logged as error
  - Test getModelId returns model string

## Sprint 3 Compatibility Note

**IMPORTANT (spec review finding):** If Sprint 3 Story 39.3.4 (multi-block user prompt spike) was implemented, `ClaudeClient.streamWithTool()` may accept `string | ContentBlockForPrompt[]` for the `userPrompt` parameter instead of just `string`. When extracting to `ClaudeStreamClient`, preserve this type signature. Check the actual `ILLMClient.StreamWithToolOptions` interface at extraction time — do not assume string-only.

## Definition of Done

- [ ] ClaudeStreamClient created with streamWithTool and getModelId
- [ ] If Sprint 3 Story 39.3.4 landed: `userPrompt` type preserved as `string | ContentBlockForPrompt[]`
- [ ] ClaudeClient.ts is a thin facade under 300 LOC
- [ ] All existing tests pass
- [ ] Each file under 300 LOC
- [ ] No TypeScript errors
- [ ] No lint errors
