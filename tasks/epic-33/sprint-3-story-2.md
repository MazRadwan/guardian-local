# Story 33.3.2: Frontend Tool Status Handler

## Description

Add frontend handling for the `tool_status` WebSocket event. This includes adding the event listener in websocket.ts, storing the status in chatStore, and creating the useWebSocketEvents handler.

## Acceptance Criteria

- [ ] `ToolStatusPayload` type defined in websocket.ts
- [ ] `onToolStatus` method added to WebSocketClient class
- [ ] `toolStatus` state added to chatStore ('idle' | 'searching' | 'reading')
- [ ] `setToolStatus` action added to chatStore
- [ ] `handleToolStatus` handler added to useWebSocketEvents
- [ ] Handler ignores events for inactive conversations
- [ ] Handler resets to 'idle' on conversation switch
- [ ] Status cleared on disconnect
- [ ] **tool_status resets to 'idle' on WebSocket disconnect**
- [ ] **tool_status resets to 'idle' on abort event**
- [ ] **tool_status resets to 'idle' on error**
- [ ] **Safety timeout: auto-clear to 'idle' after 30 seconds (prevents stuck states)**

## Technical Approach

1. Add types and handler to WebSocketClient
2. Add state to chatStore
3. Wire up in useWebSocketEvents

### State Hygiene Rules (CRITICAL)

The `toolStatus` state MUST be cleared to `'idle'` in ALL of these scenarios:

```typescript
// State clearing rules
const STATE_CLEARING_TRIGGERS = {
  // Normal completion
  ON_TOOL_STATUS_IDLE: true,     // Backend sends 'idle' when tool completes

  // Conversation changes
  ON_CONVERSATION_SWITCH: true,  // User switches to different conversation
  ON_CONVERSATION_DELETE: true,  // User deletes current conversation

  // Connection issues
  ON_DISCONNECT: true,           // WebSocket disconnects
  ON_RECONNECT: true,            // Clear stale state on reconnect

  // User actions
  ON_ABORT: true,                // User aborts current message
  ON_ERROR: true,                // Error occurs during tool execution

  // Safety net
  ON_TIMEOUT: true,              // Auto-clear after 30 seconds (prevents stuck UI)
};
```

### Safety Timeout Implementation

```typescript
// In chatStore.ts or useWebSocketEvents.ts
const TOOL_STATUS_TIMEOUT_MS = 30000; // 30 seconds

let toolStatusTimeoutId: NodeJS.Timeout | null = null;

const setToolStatusWithTimeout = (status: ToolStatus) => {
  // Clear existing timeout
  if (toolStatusTimeoutId) {
    clearTimeout(toolStatusTimeoutId);
    toolStatusTimeoutId = null;
  }

  // Set new status
  set({ toolStatus: status });

  // If not idle, start safety timeout
  if (status !== 'idle') {
    toolStatusTimeoutId = setTimeout(() => {
      console.warn('[toolStatus] Safety timeout - forcing idle');
      set({ toolStatus: 'idle' });
    }, TOOL_STATUS_TIMEOUT_MS);
  }
};
```

```typescript
// In websocket.ts
export interface ToolStatusPayload {
  conversationId: string;
  status: 'searching' | 'reading' | 'idle';
}

export class WebSocketClient {
  // ...existing methods...

  onToolStatus(callback: (data: ToolStatusPayload) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: ToolStatusPayload) => {
      console.log('[WebSocket] Tool status:', data.status);
      callback(data);
    };

    this.socket.on('tool_status', handler);
    return () => this.socket?.off('tool_status', handler);
  }
}
```

```typescript
// In chatStore.ts
export interface ChatState {
  // ...existing state...

  /**
   * Epic 33: Tool execution status for consult mode
   * 'idle' - no tool running
   * 'searching' - web search in progress
   * 'reading' - reading URLs in progress
   */
  toolStatus: 'idle' | 'searching' | 'reading';

  setToolStatus: (status: 'idle' | 'searching' | 'reading') => void;
}

// In store implementation
toolStatus: 'idle',

setToolStatus: (status) => {
  set({ toolStatus: status });
},
```

```typescript
// In useWebSocketEvents.ts
const handleToolStatus = useCallback(
  (data: ToolStatusPayload) => {
    // Only process for active conversation
    if (data.conversationId !== activeConversationId) {
      return;
    }

    useChatStore.getState().setToolStatus(data.status);
  },
  [activeConversationId]
);

// Clear on disconnect
useEffect(() => {
  const handleDisconnect = () => {
    useChatStore.getState().setToolStatus('idle');
  };

  wsClient.onDisconnect(handleDisconnect);
  return () => wsClient.offDisconnect(handleDisconnect);
}, [wsClient]);

// Clear on conversation switch
useEffect(() => {
  // Reset tool status when active conversation changes
  useChatStore.getState().setToolStatus('idle');
}, [activeConversationId]);

// Clear on abort
const handleAbort = useCallback(() => {
  useChatStore.getState().setToolStatus('idle');
}, []);
```

## Files Touched

- `apps/web/src/lib/websocket.ts` - UPDATE: Add ToolStatusPayload type, onToolStatus method
- `apps/web/src/stores/chatStore.ts` - UPDATE: Add toolStatus state, setToolStatus action
- `apps/web/src/hooks/useWebSocketEvents.ts` - UPDATE: Add handleToolStatus handler
- `apps/web/src/hooks/useWebSocket.ts` - UPDATE: Add tool_status handler types for event routing
- `apps/web/src/hooks/useWebSocketAdapter.ts` - UPDATE: Add subscription pass-through for tool_status event

## Tests Affected

- No existing tests should break (additive changes)

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] `apps/web/src/hooks/__tests__/useWebSocketEvents.toolStatus.test.ts`
  - handleToolStatus updates store when conversationId matches
  - handleToolStatus ignores events for inactive conversations
  - setToolStatus correctly updates toolStatus state
  - toolStatus resets to 'idle' on setActiveConversation
- [ ] `apps/web/src/hooks/__tests__/useWebSocketEvents.toolStatus.lifecycle.test.ts`
  - **toolStatus resets to 'idle' on WebSocket disconnect**
  - **toolStatus resets to 'idle' on abort event**
  - **toolStatus resets to 'idle' on conversation switch**
  - **Safety timeout clears toolStatus to 'idle' after 30 seconds**
  - **Safety timeout is cancelled when status becomes 'idle' normally**
  - **Disconnect during 'searching' state resets to 'idle'**
  - **Reconnect clears any stale toolStatus**

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
