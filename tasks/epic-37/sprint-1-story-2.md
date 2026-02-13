# Story 37.1.2: Extract ScoringService scoreWithClaude to ScoringLLMService

## Description

Extract the LLM orchestration method `scoreWithClaude()` from `ScoringService.ts` (542 LOC) into a new `ScoringLLMService`. This method (lines 352-418, ~66 LOC) handles prompt building, LLM streaming, and tool payload extraction. Zero behavioral change.

## Acceptance Criteria

- [ ] `ScoringLLMService.ts` created with `scoreWithClaude()` method
- [ ] Method is exact logic from ScoringService lines 352-418
- [ ] Constructor accepts: `ILLMClient`, `IPromptBuilder`
- [ ] `scoringCompleteTool` imported from same location as ScoringService uses
- [ ] `tool_choice: { type: 'any' }` preserved exactly
- [ ] `usePromptCache: true` preserved
- [ ] `maxTokens: 8000` preserved (will be updated in Sprint 6)
- [ ] `temperature: 0` preserved
- [ ] Abort signal handling preserved
- [ ] Under 300 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Create ScoringLLMService

**File:** `packages/backend/src/application/services/ScoringLLMService.ts`

```typescript
import { ILLMClient } from '../interfaces/ILLMClient.js';
import { IPromptBuilder } from '../interfaces/IPromptBuilder.js';
import { scoringCompleteTool } from '../../domain/scoring/tools/scoringComplete.js';
import { SolutionType } from '../../domain/scoring/rubric.js';
import { ScoringParseResult } from '../interfaces/IScoringDocumentParser.js';

export interface ScoreWithClaudeResult {
  narrativeReport: string;
  payload: unknown;
}

export class ScoringLLMService {
  constructor(
    private llmClient: ILLMClient,
    private promptBuilder: IPromptBuilder
  ) {}

  async scoreWithClaude(
    parseResult: ScoringParseResult,
    vendorName: string,
    solutionName: string,
    solutionType: SolutionType,
    abortSignal: AbortSignal,
    onMessage: (message: string) => void
  ): Promise<ScoreWithClaudeResult> {
    // EXACT logic from ScoringService lines 352-418
    // Build prompts using port
    const systemPrompt = this.promptBuilder.buildScoringSystemPrompt();
    const userPrompt = this.promptBuilder.buildScoringUserPrompt({
      vendorName,
      solutionName,
      solutionType,
      responses: parseResult.responses.map(r => ({
        sectionNumber: r.sectionNumber,
        questionNumber: r.questionNumber,
        questionText: r.questionText,
        responseText: r.responseText,
      })),
    });

    let narrativeReport = '';
    let toolPayload: unknown = null;

    await this.llmClient.streamWithTool({
      systemPrompt,
      userPrompt,
      tools: [scoringCompleteTool],
      tool_choice: { type: 'any' },
      usePromptCache: true,
      maxTokens: 8000,
      temperature: 0,
      abortSignal,
      onTextDelta: (delta) => {
        narrativeReport += delta;
        if (narrativeReport.length % 500 === 0) {
          onMessage('Generating risk assessment...');
        }
      },
      onToolUse: (toolName, input) => {
        if (toolName === 'scoring_complete') {
          toolPayload = input;
        }
      },
    });

    if (!toolPayload) {
      if (abortSignal.aborted) {
        throw new Error('Scoring aborted');
      }
      throw new Error('Claude did not call scoring_complete tool');
    }

    return { narrativeReport, payload: toolPayload };
  }
}
```

### 2. Key Details

- **Return type**: Define `ScoreWithClaudeResult` interface in the same file (simple, 2 fields).
- **No behavior changes**: Exact copy of `scoreWithClaude()` from ScoringService.
- **Comments preserved**: Keep the inline comments about tool_choice forcing, prompt caching, etc.
- **Do NOT modify ScoringService.ts yet** -- that happens in Story 37.1.3.

## Files Touched

- `packages/backend/src/application/services/ScoringLLMService.ts` - CREATE (~80 LOC)

## Tests Affected

- None -- this is a pure creation story. ScoringService.ts is not modified yet.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/application/services/ScoringLLMService.test.ts`
  - Test `scoreWithClaude` calls promptBuilder.buildScoringSystemPrompt()
  - Test `scoreWithClaude` calls promptBuilder.buildScoringUserPrompt() with correct params
  - Test `scoreWithClaude` calls llmClient.streamWithTool() with correct config (maxTokens=8000, temperature=0, tool_choice)
  - Test `scoreWithClaude` returns narrative + payload on success
  - Test `scoreWithClaude` throws 'Claude did not call scoring_complete tool' when no tool payload
  - Test `scoreWithClaude` throws 'Scoring aborted' when abort signal fires and no payload
  - Test `scoreWithClaude` maps parseResult.responses correctly (only 4 fields)

## Definition of Done

- [ ] File created and compiles
- [ ] `scoreWithClaude()` method present with exact logic from ScoringService
- [ ] `ScoreWithClaudeResult` interface exported
- [ ] Unit tests written and passing
- [ ] Under 300 LOC
- [ ] No TypeScript errors
