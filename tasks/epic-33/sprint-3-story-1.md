# Story 33.3.1: Tool Status WebSocket Event

## Description

Implement the `tool_status` WebSocket event emission from ChatServer during web search operations. This event allows the frontend to show contextual feedback ("Searching the web...") instead of the generic typing indicator.

## Acceptance Criteria

- [ ] `tool_status` event emitted when search starts: `{ status: 'searching', conversationId }`
- [ ] `tool_status` event emitted when reading URLs: `{ status: 'reading', conversationId }`
- [ ] `tool_status` event emitted when complete: `{ status: 'idle', conversationId }`
- [ ] Event emitted via broadcast, frontend filters by conversationId (consistent with existing event patterns)
- [ ] WebSearchToolService receives status callback from ChatServer
- [ ] Status callback wired up during service registration (33.2.1)

## Technical Approach

1. Define tool_status event payload type
2. Wire up status callback in ChatServer when registering WebSearchToolService
3. Emit events to the conversation room

```typescript
// In ChatServer.ts
interface ToolStatusPayload {
  conversationId: string;
  status: 'searching' | 'reading' | 'idle';
}

// In ChatServer constructor (extend from 33.2.1)
if (process.env.ENABLE_WEB_SEARCH !== 'false') {
  try {
    const jinaClient = new JinaClient();

    // Create status callback that emits to conversation
    const createStatusCallback = (conversationId: string) => {
      return (status: 'searching' | 'reading' | 'idle') => {
        this.io.of('/chat').emit('tool_status', {
          conversationId,
          status,
        });
      };
    };

    // Pass callback factory to service
    const webSearchService = new WebSearchToolService(
      jinaClient,
      createStatusCallback
    );
    this.toolRegistry.register(webSearchService);
  } catch (error) {
    console.warn('[ChatServer] Web search disabled:', error.message);
  }
}
```

Update WebSearchToolService to accept callback factory:

```typescript
// In WebSearchToolService
constructor(
  private readonly jinaClient: IJinaClient,
  private readonly createStatusCallback?: (conversationId: string) => (status: 'searching' | 'reading' | 'idle') => void
) {}

async handle(input: ToolUseInput, context: ToolUseContext): Promise<ToolUseResult> {
  const onStatus = this.createStatusCallback?.(context.conversationId);

  onStatus?.('searching');
  // ... search logic ...

  onStatus?.('reading');
  // ... read logic ...

  onStatus?.('idle');
  // ... return result ...
}
```

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - UPDATE: Add tool_status emit logic, wire up status callback
- `packages/backend/src/application/services/WebSearchToolService.ts` - UPDATE: Accept callback factory, emit status during execution

## Tests Affected

- `packages/backend/__tests__/unit/WebSearchToolService.test.ts` - Update for new callback pattern

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/ChatServer.toolStatus.test.ts`
  - Emits tool_status 'searching' at search start
  - Emits tool_status 'reading' before reading URLs
  - Emits tool_status 'idle' on completion
  - Emits tool_status 'idle' on error
  - Event includes correct conversationId
  - Callback factory receives conversationId from context

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
