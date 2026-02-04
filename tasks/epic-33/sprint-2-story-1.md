# Story 33.2.1: Register WebSearchToolService

## Description

Add `WebSearchToolService` to the ChatServer's dependency injection and register it with the `ToolUseRegistry`. This enables the tool to be dispatched when Claude returns a `web_search` tool_use block in consult mode. Additionally, ensure consult mode receives `consultModeTools` (not `assessmentModeTools`).

## Acceptance Criteria

- [ ] `JinaClient` instantiated in server bootstrap (index.ts or ChatServer constructor)
- [ ] `WebSearchToolService` instantiated with JinaClient dependency
- [ ] Service registered with `ToolUseRegistry` via `registry.register(webSearchToolService)`
- [ ] Service only invoked in consult mode (mode check in dispatch)
- [ ] `JINA_API_KEY` environment variable required (graceful error if missing)
- [ ] Feature flag `ENABLE_WEB_SEARCH` (default: true) to disable if needed
- [ ] **Consult mode receives `consultModeTools` array (not `assessmentModeTools`)**
- [ ] Assessment mode continues to receive `assessmentModeTools`

## Technical Approach

1. Add JinaClient initialization in ChatServer constructor
2. Create WebSearchToolService with JinaClient and status callback
3. Register with ToolUseRegistry
4. Modify ToolUseRegistry dispatch to pass mode context
5. **Create `consultModeTools` array in tools/index.ts containing web_search tool**
6. **Modify ChatServer to use `consultModeTools` when mode is 'consult'**

```typescript
// In tools/index.ts - add new export
export const consultModeTools: ClaudeTool[] = [webSearchTool];

// In ChatServer - modify tool selection
const tools = modeConfig.enableTools
  ? (mode === 'consult' ? consultModeTools : assessmentModeTools)
  : undefined;
```

```typescript
// In ChatServer constructor
constructor(...deps) {
  // ... existing setup ...

  // Initialize web search service (consult mode only)
  if (process.env.ENABLE_WEB_SEARCH !== 'false') {
    try {
      const jinaClient = new JinaClient();
      const webSearchService = new WebSearchToolService(
        jinaClient,
        (status) => this.emitToolStatus(status)
      );
      this.toolRegistry.register(webSearchService);
      console.log('[ChatServer] Web search tool registered');
    } catch (error) {
      console.warn('[ChatServer] Web search disabled:', error.message);
    }
  }
}

// Helper to emit tool_status event
private emitToolStatus(status: 'searching' | 'reading' | 'idle'): void {
  // Will be used by frontend for typing indicator swap
  // Implemented in Sprint 3
}
```

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - UPDATE: Add JinaClient and WebSearchToolService initialization, register with ToolUseRegistry, use mode-specific tool arrays
- `packages/backend/src/infrastructure/websocket/ToolUseRegistry.ts` - UPDATE: Ensure dispatch passes mode in context
- `packages/backend/src/infrastructure/ai/tools/index.ts` - UPDATE: Export `consultModeTools` array

## Tests Affected

- `packages/backend/__tests__/unit/infrastructure/websocket/ToolUseRegistry.test.ts` - May need mode context updates
- `packages/backend/__tests__/unit/ChatServer.*.test.ts` - May need mock JinaClient setup
- `packages/backend/__tests__/unit/ChatServer.modeSpecificBehavior.test.ts` - **Tests asserting "consult has no tools" will need updates**
- `packages/backend/__tests__/unit/questionnaireReadyTool.test.ts` - Verify assessmentModeTools still correct

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/ChatServer.webSearch.test.ts`
  - WebSearchToolService registered when JINA_API_KEY present
  - Service NOT registered when JINA_API_KEY missing (graceful degradation)
  - Service NOT registered when ENABLE_WEB_SEARCH=false
  - ToolUseRegistry receives mode in dispatch context
  - **Consult mode uses `consultModeTools` (not `assessmentModeTools`)**
  - **Assessment mode still uses `assessmentModeTools`**
  - **consultModeTools contains web_search tool definition**

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
