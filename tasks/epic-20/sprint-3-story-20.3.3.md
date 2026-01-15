# Story 20.3.3: Abort Support for Parsing

## Description
Wire the `AbortSignal` through `IScoringDocumentParser.parseForResponses()` so that canceling scoring also stops the parsing LLM call. Currently, abort only affects the scoring LLM call, leaving parsing to continue and consume tokens.

## Acceptance Criteria
- [ ] `IScoringDocumentParser.parseForResponses` accepts optional `AbortSignal`
- [ ] `DocumentParserService` propagates signal to Claude API calls
- [ ] Aborting mid-parse returns a failed result (not throws)
- [ ] Abort is checked before each major operation
- [ ] Token savings when user cancels early in workflow

## Technical Approach

### 1. Update IScoringDocumentParser Interface

```typescript
// IScoringDocumentParser.ts
export interface ScoringParseOptions extends ParseOptions {
  expectedAssessmentId?: string;
  minConfidence?: number;
  includeLowConfidence?: boolean;
  abortSignal?: AbortSignal;  // NEW
}
```

### 2. Update DocumentParserService

Pass abort signal to Claude client:

```typescript
// DocumentParserService.ts
async parseForResponses(
  file: Buffer,
  metadata: DocumentMetadata,
  options?: ScoringParseOptions
): Promise<ScoringParseResult> {
  const startTime = Date.now();

  try {
    // Check abort before extraction
    if (options?.abortSignal?.aborted) {
      return this.createFailedScoringResult(metadata, startTime, 'Parse aborted');
    }

    const { text, visionContent } = await this.extractContent(/* ... */);

    // Check abort before LLM call
    if (options?.abortSignal?.aborted) {
      return this.createFailedScoringResult(metadata, startTime, 'Parse aborted');
    }

    // Pass signal to Claude call
    if (visionContent && visionContent.length > 0) {
      const visionResponse = await this.visionClient.analyzeImages({
        images: visionContent,
        prompt: /* ... */,
        systemPrompt: SCORING_EXTRACTION_SYSTEM_PROMPT,
        maxTokens: 16384,
        abortSignal: options?.abortSignal,  // NEW
      });
      responseContent = visionResponse.content;
    } else {
      const response = await this.claudeClient.sendMessage(
        [{ role: 'user', content: /* ... */ }],
        {
          systemPrompt: SCORING_EXTRACTION_SYSTEM_PROMPT,
          maxTokens: 16384,
          abortSignal: options?.abortSignal,  // NEW
        }
      );
      responseContent = response.content;
    }

    // ... rest of method
  } catch (error) {
    if (options?.abortSignal?.aborted) {
      return this.createFailedScoringResult(metadata, startTime, 'Parse aborted');
    }
    // ... normal error handling
  }
}
```

### 3. Update IClaudeClient Interface

Add abortSignal to request options:

```typescript
// IClaudeClient.ts
export interface ClaudeRequestOptions {
  systemPrompt?: string;
  usePromptCache?: boolean;
  tools?: ClaudeTool[];
  tool_choice?: ToolChoice;
  maxTokens?: number;
  abortSignal?: AbortSignal;  // NEW
}
```

### 4. Update ClaudeClient Implementation

Handle abort in sendMessage:

```typescript
// ClaudeClient.ts
async sendMessage(
  messages: ClaudeMessage[],
  options: ClaudeRequestOptions = {}
): Promise<ClaudeResponse> {
  // ... existing code

  for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
    // Check abort before each attempt
    if (options.abortSignal?.aborted) {
      throw new ClaudeAPIError('Request aborted');
    }

    try {
      const response = await this.client.messages.create(/* ... */);
      // ...
    } catch (error) {
      // Check if aborted during request
      if (options.abortSignal?.aborted) {
        throw new ClaudeAPIError('Request aborted');
      }
      // ... retry logic
    }
  }
}
```

### 5. Update IVisionClient Interface

```typescript
// IVisionClient.ts
export interface VisionRequest {
  images: VisionContent[];
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  abortSignal?: AbortSignal;  // NEW
}
```

### 6. Update ScoringService

Pass signal to parser:

```typescript
// ScoringService.ts
const parseOptions: ScoringParseOptions = {
  expectedAssessmentId: inputAssessmentId,
  minConfidence: 0.7,
  abortSignal: abortController.signal,  // NEW
};
const parseResult = await this.documentParser.parseForResponses(
  fileBuffer,
  documentMetadata,
  parseOptions
);
```

## Files Touched
- `packages/backend/src/application/interfaces/IScoringDocumentParser.ts` - Add abortSignal to options
- `packages/backend/src/application/interfaces/IClaudeClient.ts` - Add abortSignal to request options
- `packages/backend/src/application/interfaces/IVisionClient.ts` - Add abortSignal to VisionRequest
- `packages/backend/src/infrastructure/ai/DocumentParserService.ts` - Check signal, pass to clients
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts` - Handle abort in sendMessage/analyzeImages
- `packages/backend/src/application/services/ScoringService.ts` - Pass signal to parser

## Agent Assignment
- [x] backend-agent

## Tests Required
- [ ] Unit test: Parser returns failed result when aborted before LLM call
- [ ] Unit test: Parser returns failed result when aborted during LLM call
- [ ] Unit test: ClaudeClient throws on abort
- [ ] Unit test: Signal propagated through all layers
- [ ] Integration test: Full abort flow stops both parsing and scoring

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Aborting early saves tokens
