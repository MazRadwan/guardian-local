# Story 39.4.3: Split ClaudeClient -- Extract Text and Vision Clients

## Description

Extract the `IClaudeClient` text methods and `IVisionClient` vision methods from `ClaudeClient.ts` (844 LOC) into focused modules. `ClaudeClient` currently implements 3 interfaces (`IClaudeClient`, `IVisionClient`, `ILLMClient`). After this split:
- `ClaudeTextClient.ts` -- `sendMessage()`, `streamMessage()`, `continueWithToolResult()` (IClaudeClient)
- `ClaudeVisionClient.ts` -- `analyzeImages()`, `prepareDocument()` (IVisionClient)
- `ClaudeClient.ts` -- shared infrastructure (constructor, Anthropic SDK, retry logic, `buildSystemPrompt`, `toApiMessages`) + `ILLMClient` (`getModelId`, `streamWithTool`)

This is a pure refactor with zero behavioral change.

## Acceptance Criteria

- [ ] `ClaudeTextClient.ts` created with `sendMessage`, `streamMessage`, `continueWithToolResult`
- [ ] `ClaudeVisionClient.ts` created with `analyzeImages`, `prepareDocument`, `preparePdfDocument`, `prepareImageDocument`
- [ ] `ClaudeClient.ts` retains shared infrastructure + `ILLMClient` implementation
- [ ] `ClaudeClient.ts` delegates to text/vision clients OR text/vision clients extend base
- [ ] All existing tests pass without modification (or minimal mock updates)
- [ ] Each file under 300 LOC
- [ ] No TypeScript errors

## Technical Approach

### Strategy: Composition with Shared Base

Create a `ClaudeClientBase` class with shared infrastructure, then compose:

```typescript
// ClaudeClientBase.ts (~120 LOC):
export class ClaudeClientBase {
  protected client: Anthropic;
  protected readonly model = 'claude-sonnet-4-5-20250929';
  protected readonly maxTokens = 4096;
  protected readonly retryAttempts = 3;
  protected readonly retryDelays = [2000, 4000, 8000];

  constructor(apiKey: string) { ... }
  protected sleep(ms: number): Promise<void> { ... }
  protected buildSystemPrompt(...): ... { ... }
  protected toApiMessages(...): ... { ... }
}

// ClaudeTextClient.ts (~250 LOC):
export class ClaudeTextClient extends ClaudeClientBase implements IClaudeClient {
  async sendMessage(...): Promise<ClaudeResponse> { ... }
  async *streamMessage(...): AsyncGenerator<StreamChunk> { ... }
  async *continueWithToolResult(...): AsyncGenerator<StreamChunk> { ... }
}

// ClaudeVisionClient.ts (~120 LOC):
export class ClaudeVisionClient extends ClaudeClientBase implements IVisionClient {
  async analyzeImages(...): Promise<VisionResponse> { ... }
  async prepareDocument(...): Promise<VisionContent[]> { ... }
  private async preparePdfDocument(...): Promise<VisionContent[]> { ... }
  private prepareImageDocument(...): VisionContent[] { ... }
}
```

### Alternative: Keep ClaudeClient as Facade

If the inheritance approach is too complex for DI, keep `ClaudeClient` as a facade that delegates:

```typescript
export class ClaudeClient implements IClaudeClient, IVisionClient, ILLMClient {
  private textClient: ClaudeTextClient;
  private visionClient: ClaudeVisionClient;

  constructor(apiKey: string) {
    this.textClient = new ClaudeTextClient(apiKey);
    this.visionClient = new ClaudeVisionClient(apiKey);
  }

  // Delegate IClaudeClient
  sendMessage = (...args) => this.textClient.sendMessage(...args);
  streamMessage = (...args) => this.textClient.streamMessage(...args);

  // Delegate IVisionClient
  analyzeImages = (...args) => this.visionClient.analyzeImages(...args);
  // ...
}
```

This approach requires zero changes to container wiring (ClaudeClient still implements all interfaces). Recommend this approach for simplicity.

### Container Impact

If using the facade approach, `container.ts` requires NO changes -- `ClaudeClient` still satisfies all 3 interfaces. If using inheritance, container needs to instantiate separate clients.

## Files Touched

- `packages/backend/src/infrastructure/ai/ClaudeTextClient.ts` - CREATE (~250 LOC)
- `packages/backend/src/infrastructure/ai/ClaudeVisionClient.ts` - CREATE (~120 LOC)
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts` - MODIFY (remove methods, add delegation, ~300 LOC target)

## Tests Affected

**IMPORTANT (Codex finding): Existing ClaudeClient tests must be migrated to split clients.**

Before implementing, grep for ALL test files that reference `ClaudeClient`:
- `packages/backend/__tests__/unit/infrastructure/ai/ClaudeClient.test.ts` — If this exists, split tests into `ClaudeTextClient.test.ts` and `ClaudeVisionClient.test.ts` matching the new file structure
- Any test that directly imports or mocks `ClaudeClient` must be updated to import/mock the correct split client
- Tests that mock at the interface level (`IClaudeClient`, `IVisionClient`, `ILLMClient`) should work unchanged — verify this

**Migration checklist:**
- [ ] Grep: `grep -r "ClaudeClient" packages/backend/__tests__/` to find ALL test references
- [ ] Move text-related test cases (sendMessage, streamMessage, continueWithToolResult) to `ClaudeTextClient.test.ts`
- [ ] Move vision-related test cases (analyzeImages, prepareDocument) to `ClaudeVisionClient.test.ts`
- [ ] Keep facade-level tests in `ClaudeClient.test.ts` if facade pattern is used (delegation verification)
- [ ] Verify all tests that mock at interface level still pass without changes

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/ai/ClaudeTextClient.test.ts`
  - Test sendMessage with retry logic (mock Anthropic SDK)
  - Test streamMessage yields chunks correctly
  - Test continueWithToolResult handles tool results

- [ ] `packages/backend/__tests__/unit/infrastructure/ai/ClaudeVisionClient.test.ts`
  - Test analyzeImages calls Anthropic API with image content
  - Test prepareDocument handles PDF, image, and DOCX MIME types
  - Test prepareImageDocument returns base64-encoded content

## Definition of Done

- [ ] ClaudeTextClient and ClaudeVisionClient created
- [ ] ClaudeClient.ts under 300 LOC (facade or shared base + ILLMClient only)
- [ ] All existing tests pass
- [ ] Each file under 300 LOC
- [ ] No circular imports
- [ ] No TypeScript errors
- [ ] No lint errors
