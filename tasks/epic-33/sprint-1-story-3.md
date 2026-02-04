# Story 33.1.3: WebSearchToolService

## Description

Create the `WebSearchToolService` that implements `IToolUseHandler` to process `web_search` tool calls from Claude. This service coordinates between the Jina client (search + read) and formats results for Claude's tool_result response. It also emits `tool_status` WebSocket events for UI feedback.

## Acceptance Criteria

- [ ] Service created at `packages/backend/src/application/services/WebSearchToolService.ts`
- [ ] Implements `IToolUseHandler` interface (handle method)
- [ ] Accepts `JinaClient` via constructor injection
- [ ] Validates input against `WebSearchInput` schema
- [ ] Calls Jina Search API with query
- [ ] Calls Jina Reader API for top N URLs (default 3)
- [ ] Formats results as tool_result content with citations
- [ ] Emits `tool_status` event via callback during search (for UI feedback)
- [ ] Handles errors gracefully (returns error message as tool_result, not throw)
- [ ] Rate limits requests (max 1 search per 2 seconds per conversation)
- [ ] **Fail-soft behavior:** If some URLs fail to read, returns partial results
- [ ] **Fail-soft behavior:** If all URLs fail, returns search snippets only
- [ ] **Never fails entire tool call due to individual read failures**

## Technical Approach

1. Implement IToolUseHandler interface
2. Parse and validate tool input
3. Orchestrate search -> read workflow
4. Format results for Claude consumption

**IMPORTANT - ToolUseResult Shape Compatibility:**

The existing `IToolUseHandler.ToolUseResult.toolResult` has the shape `{ toolUseId, content }` (NOT Claude's API format `{ type, tool_use_id, content }`). This is used by `QuestionnaireReadyService` and must NOT be changed.

The conversion to Claude's `tool_result` format happens in `MessageHandler` or the caller that invokes `continueWithToolResult`. This service returns the simplified shape; the caller converts.

```typescript
export class WebSearchToolService implements IToolUseHandler {
  readonly toolName = 'web_search';

  constructor(
    private readonly jinaClient: IJinaClient,
    private readonly onStatusChange?: (status: 'searching' | 'reading' | 'idle') => void
  ) {}

  // Uses JINA_CONFIG constants from JinaClient module:
  // - MAX_URLS_TO_READ: 3 (how many URLs to read from search results)
  // - Other timeouts/limits handled by JinaClient itself

  async handle(
    input: ToolUseInput,
    context: ToolUseContext
  ): Promise<ToolUseResult> {
    // 1. Validate this is our tool
    if (input.toolName !== this.toolName) {
      return { handled: false };
    }

    // 2. Emit searching status
    this.onStatusChange?.('searching');

    try {
      // 3. Parse input
      const { query, max_results = 5 } = input.input as WebSearchInput;

      // 4. Search
      const searchResults = await this.jinaClient.search(query, max_results);

      // 5. Read top URLs (fail-soft: partial failures OK)
      this.onStatusChange?.('reading');
      const urls = searchResults.slice(0, JINA_CONFIG.MAX_URLS_TO_READ).map(r => r.url);
      const readResults = await this.jinaClient.readUrls(urls);
      // readUrls returns only successful reads (may be empty if all fail)

      // 6. Format as tool_result (using existing ToolUseResult.toolResult shape)
      // If readResults is empty but searchResults exist, format with snippets only
      const content = this.formatResults(searchResults, readResults);

      // NOTE: This returns { toolUseId, content } shape per IToolUseHandler interface.
      // The MessageHandler converts this to Claude API format { type: 'tool_result', tool_use_id, content }
      // when calling ClaudeClient.continueWithToolResult().
      return {
        handled: true,
        toolResult: {
          toolUseId: input.toolUseId,  // Existing shape: toolUseId (camelCase)
          content,
        },
      };
    } catch (error) {
      return {
        handled: true,
        toolResult: {
          toolUseId: input.toolUseId,
          content: `Search failed: ${error.message}. Please answer based on your existing knowledge.`,
        },
      };
    } finally {
      this.onStatusChange?.('idle');
    }
  }

  private formatResults(
    searchResults: JinaSearchResult[],
    readResults: JinaReadResult[]
  ): string {
    // Format as structured text Claude can cite
    // Include source URLs for citations
    //
    // FAIL-SOFT LOGIC:
    // - If readResults has content: include full content + URLs
    // - If readResults empty but searchResults exist: use search snippets + URLs
    // - If both empty: return "No results found for this query"
    //
    // This ensures the tool NEVER fails due to read failures - it degrades gracefully
  }
}
```

**Conversion Responsibility:**
- `WebSearchToolService.handle()` returns `ToolUseResult.toolResult` with `{ toolUseId, content }`
- `MessageHandler` (or consult message handler) converts to Claude API format when calling `continueWithToolResult`
- Conversion: `{ toolUseId, content }` -> `{ type: 'tool_result', tool_use_id: toolUseId, content }`

---

**NOTE - Scope Boundary:**

This story implements the `WebSearchToolService` class only. It does NOT wire the tool into the message handling flow.

| Responsibility | This Story (33.1.3) | Sprint 2 (33.2.1, 33.2.2) |
|----------------|---------------------|---------------------------|
| Service class | YES - Creates `WebSearchToolService` | N/A |
| `IToolUseHandler` interface | YES - Implements `handle()` | N/A |
| DI registration | NO | 33.2.1 registers service in container |
| JinaClient instantiation | NO (receives via constructor) | 33.2.1 instantiates and injects |
| Tool loop wiring | NO | 33.2.2 wires MessageHandler to call service |
| `enableTools: true` for consult | NO | 33.2.2 enables tools for consult mode |

The current codebase has `enableTools: false` for consult mode in the MessageHandler configuration. This story does not change that. Sprint 2 story 33.2.2 enables tools and wires the complete tool loop.

## Files Touched

- `packages/backend/src/application/services/WebSearchToolService.ts` - CREATE: Service implementation
- `packages/backend/src/application/interfaces/IToolUseHandler.ts` - NO CHANGES NEEDED (toolResult field already exists with correct shape)

**NOTE:** The existing `ToolUseResult.toolResult` shape `{ toolUseId, content }` is preserved. No interface changes needed.

## Tests Affected

- None - existing `IToolUseHandler` interface is not modified

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/WebSearchToolService.test.ts`
  - Returns { handled: false } for non-matching tool name
  - Calls jinaClient.search with correct query and max_results
  - Calls jinaClient.readUrls with top JINA_CONFIG.MAX_URLS_TO_READ URLs
  - Emits 'searching' status before search
  - Emits 'reading' status before reading URLs
  - Emits 'idle' status on completion
  - Formats results with source URLs for citation
  - Returns graceful error message as tool_result on Jina failure
  - Handles empty search results
  - **Fail-soft tests (CRITICAL):**
    - Handles partial read failures (some URLs fail) - returns partial results
    - Handles all read failures - returns search snippets only
    - Never throws/fails entire tool call due to read failures
    - Returns "No results found" when search returns empty
  - **Input validation tests:**
    - Returns error tool_result when query is missing
    - Returns error tool_result when query is empty string
    - Clamps max_results to valid range (1-10)
  - **Rate limiting tests:**
    - Enforces 2-second minimum between searches per conversation
    - Returns rate limit error as tool_result when called too quickly
    - Allows search after rate limit window expires

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
