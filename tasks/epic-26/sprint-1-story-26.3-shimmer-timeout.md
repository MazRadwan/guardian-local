# Story 26.3: Shimmer Timeout & Cleanup

## Description

Implement a 5-second hard timeout for the `titleLoading` shimmer effect and add comprehensive cleanup handlers to prevent stuck loading states. Currently, if title generation fails silently or the connection drops, the shimmer can persist indefinitely.

**Problem:** The `titleLoading` shimmer has no timeout mechanism. If:
- Title generation fails silently (no WebSocket event)
- WebSocket disconnects mid-generation
- User deletes conversation while loading
- Error occurs during generation

...the shimmer persists indefinitely, creating poor UX.

**Solution:** Add timeout tracking with automatic cleanup:
1. 5-second hard timeout per conversation
2. Clear on WebSocket disconnect
3. Clear on conversation delete
4. Clear on error events
5. Clear stale loading states on app initialization (> 10s old)

## Acceptance Criteria

- [ ] `titleLoading` shimmer clears within 5 seconds via hard timeout
- [ ] Timeout fires only once per conversation (idempotency)
- [ ] `titleLoading` clears on WebSocket disconnect event
- [ ] `titleLoading` clears when conversation is deleted
- [ ] `titleLoading` clears on error events
- [ ] Stale `titleLoading` states (> 10s old) cleared on app initialization
- [ ] No memory leaks from orphaned timeouts
- [ ] Timeout cleanup on component unmount
- [ ] Fallback title set when timeout fires (use existing title or "New Chat")

## Technical Approach

### 1. Add Timeout Tracking to chatStore

Add a Map to track timeout state per conversation:

```typescript
// In ChatState interface
interface TitleLoadingState {
  timeout: ReturnType<typeof setTimeout>;
  startTime: number;
}

// Add to state
titleLoadingTimeouts: Map<string, TitleLoadingState>;

// Add cleanup action
clearTitleLoadingTimeout: (conversationId: string) => void;
startTitleLoadingTimeout: (conversationId: string) => void;
cleanupStaleTitleLoadingStates: () => void;
```

### 2. Implement Timeout Logic

```typescript
startTitleLoadingTimeout: (conversationId: string) => {
  const state = get();

  // Idempotency: Don't start multiple timeouts for same conversation
  if (state.titleLoadingTimeouts.has(conversationId)) {
    return;
  }

  const startTime = Date.now();
  const timeout = setTimeout(() => {
    // Timeout fired - clear loading state
    console.log('[chatStore] Title loading timeout for:', conversationId);
    get().setConversationTitleLoading(conversationId, false);
    get().clearTitleLoadingTimeout(conversationId);

    // Optional: Set fallback title if still placeholder
    const conv = state.conversations.find(c => c.id === conversationId);
    if (conv && !conv.title) {
      get().updateConversationTitle(conversationId, 'New Chat');
    }
  }, 5000); // 5 second timeout

  set((state) => {
    const newTimeouts = new Map(state.titleLoadingTimeouts);
    newTimeouts.set(conversationId, { timeout, startTime });
    return { titleLoadingTimeouts: newTimeouts };
  });
},

clearTitleLoadingTimeout: (conversationId: string) => {
  const state = get();
  const existing = state.titleLoadingTimeouts.get(conversationId);

  if (existing) {
    clearTimeout(existing.timeout);
    set((state) => {
      const newTimeouts = new Map(state.titleLoadingTimeouts);
      newTimeouts.delete(conversationId);
      return { titleLoadingTimeouts: newTimeouts };
    });
  }
},
```

### 3. Update setConversationTitleLoading

When setting `titleLoading: true`, start the timeout. When setting `titleLoading: false`, clear it:

```typescript
setConversationTitleLoading: (id, loading) => {
  console.log('[chatStore] Setting title loading for conversation:', id, loading);

  if (loading) {
    get().startTitleLoadingTimeout(id);
  } else {
    get().clearTitleLoadingTimeout(id);
  }

  set((state) => ({
    conversations: state.conversations.map((conv) =>
      conv.id === id ? { ...conv, titleLoading: loading } : conv
    ),
  }));
},
```

### 4. Add Stale State Cleanup on App Initialization

```typescript
cleanupStaleTitleLoadingStates: () => {
  const STALE_THRESHOLD = 10000; // 10 seconds (2x timeout)
  const now = Date.now();

  set((state) => {
    // Clear any conversations with stale titleLoading
    const updatedConversations = state.conversations.map((conv) => {
      if (conv.titleLoading) {
        // If we have a tracked timeout, check its age
        const loadingState = state.titleLoadingTimeouts.get(conv.id);
        if (loadingState && now - loadingState.startTime > STALE_THRESHOLD) {
          console.log('[chatStore] Clearing stale titleLoading for:', conv.id);
          return { ...conv, titleLoading: false };
        }
        // If no tracked timeout but titleLoading is true, clear it (orphaned state)
        if (!loadingState) {
          console.log('[chatStore] Clearing orphaned titleLoading for:', conv.id);
          return { ...conv, titleLoading: false };
        }
      }
      return conv;
    });

    // Clear all stale timeout entries
    const newTimeouts = new Map<string, TitleLoadingState>();
    for (const [id, loadingState] of state.titleLoadingTimeouts) {
      if (now - loadingState.startTime <= STALE_THRESHOLD) {
        newTimeouts.set(id, loadingState);
      } else {
        clearTimeout(loadingState.timeout);
      }
    }

    return {
      conversations: updatedConversations,
      titleLoadingTimeouts: newTimeouts,
    };
  });
},
```

### 5. Hook Cleanup into Existing Events

**On WebSocket disconnect:** Add listener in ChatInterface or useWebSocket hook:
```typescript
socket.on('disconnect', () => {
  // Clear all title loading states
  const state = useChatStore.getState();
  state.conversations.forEach((conv) => {
    if (conv.titleLoading) {
      state.setConversationTitleLoading(conv.id, false);
    }
  });
});
```

**On conversation delete:** Update `deleteConversation` action:
```typescript
deleteConversation: (id) => {
  // Clear any pending timeout
  get().clearTitleLoadingTimeout(id);

  set((state) => ({
    conversations: state.conversations.filter((conv) => conv.id !== id),
    activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
  }));
},
```

**On error events:** Add listener for error events:
```typescript
socket.on('error', (data) => {
  if (data.conversationId) {
    useChatStore.getState().setConversationTitleLoading(data.conversationId, false);
  }
});
```

### 6. Call Cleanup on App Load

**NOTE:** `layout.tsx` is a Server Component (no 'use client' directive). We need a client component wrapper.

Create `apps/web/src/components/TitleLoadingCleanup.tsx`:
```typescript
'use client';

import { useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';

/**
 * Story 26.3: Client component to clean up stale title loading states on app load
 * Mounted in layout.tsx since that's a Server Component
 */
export function TitleLoadingCleanup() {
  useEffect(() => {
    // Clean up any stale title loading states from previous session
    useChatStore.getState().cleanupStaleTitleLoadingStates();
  }, []);

  return null; // This component renders nothing
}
```

Import in `layout.tsx`:
```typescript
import { TitleLoadingCleanup } from '@/components/TitleLoadingCleanup';

// In the layout's return:
<body>
  <TitleLoadingCleanup />
  {children}
</body>
```

## Files Touched

- `apps/web/src/stores/chatStore.ts` - Add timeout tracking, cleanup actions
- `apps/web/src/components/chat/ChatInterface.tsx` - Hook disconnect/error handlers
- `apps/web/src/components/TitleLoadingCleanup.tsx` - NEW: Client component for app load cleanup (layout.tsx is Server Component)
- `apps/web/src/app/layout.tsx` - Import TitleLoadingCleanup client component

## Tests Affected

Existing tests that may need updates:
- `apps/web/src/stores/__tests__/chatStore.test.ts`
  - Tests for `setConversationTitleLoading` behavior
  - Tests for `deleteConversation` behavior

New test file:
- `apps/web/src/stores/__tests__/chatStore.titleLoading.test.ts` - NEW: Focused tests for timeout/cleanup logic

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] Unit test: Timeout fires after 5 seconds and clears `titleLoading`
- [ ] Unit test: Timeout only fires once per conversation (idempotency)
- [ ] Unit test: Clearing `titleLoading: false` cancels timeout
- [ ] Unit test: `deleteConversation` clears pending timeout
- [ ] Unit test: `cleanupStaleTitleLoadingStates` clears states older than 10s
- [ ] Unit test: No memory leaks (timeout properly cleared on cleanup)
- [ ] Integration test: Disconnect event clears all `titleLoading` states

### Test Cases

```typescript
describe('Title loading timeout (Story 26.3)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useChatStore.setState({
      conversations: [
        { id: 'conv-1', title: 'Test', titleLoading: false, createdAt: new Date(), updatedAt: new Date(), mode: 'consult' },
      ],
      titleLoadingTimeouts: new Map(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should clear titleLoading after 5 seconds', () => {
    const { setConversationTitleLoading } = useChatStore.getState();

    // Start loading
    setConversationTitleLoading('conv-1', true);

    // Verify loading is true
    expect(useChatStore.getState().conversations[0].titleLoading).toBe(true);

    // Fast-forward 5 seconds
    jest.advanceTimersByTime(5000);

    // Verify loading is cleared
    expect(useChatStore.getState().conversations[0].titleLoading).toBe(false);
  });

  it('should only start one timeout per conversation (idempotency)', () => {
    const { setConversationTitleLoading } = useChatStore.getState();

    // Start loading twice
    setConversationTitleLoading('conv-1', true);
    setConversationTitleLoading('conv-1', true);

    // Should only have one timeout entry
    expect(useChatStore.getState().titleLoadingTimeouts.size).toBe(1);
  });

  it('should cancel timeout when titleLoading set to false', () => {
    const { setConversationTitleLoading } = useChatStore.getState();

    // Start loading
    setConversationTitleLoading('conv-1', true);
    expect(useChatStore.getState().titleLoadingTimeouts.size).toBe(1);

    // Stop loading before timeout
    setConversationTitleLoading('conv-1', false);

    // Timeout should be cleared
    expect(useChatStore.getState().titleLoadingTimeouts.size).toBe(0);
  });

  it('should clear timeout when conversation deleted', () => {
    const { setConversationTitleLoading, deleteConversation } = useChatStore.getState();

    // Start loading
    setConversationTitleLoading('conv-1', true);

    // Delete conversation
    deleteConversation('conv-1');

    // Timeout should be cleared
    expect(useChatStore.getState().titleLoadingTimeouts.size).toBe(0);
  });

  it('should cleanup stale states older than 10 seconds', () => {
    const { cleanupStaleTitleLoadingStates } = useChatStore.getState();

    // Manually set a stale state (simulate app restart)
    useChatStore.setState({
      conversations: [
        { id: 'conv-1', title: 'Test', titleLoading: true, createdAt: new Date(), updatedAt: new Date(), mode: 'consult' },
      ],
      titleLoadingTimeouts: new Map([
        ['conv-1', { timeout: setTimeout(() => {}, 5000), startTime: Date.now() - 15000 }], // 15s old
      ]),
    });

    // Run cleanup
    cleanupStaleTitleLoadingStates();

    // Stale state should be cleared
    expect(useChatStore.getState().conversations[0].titleLoading).toBe(false);
    expect(useChatStore.getState().titleLoadingTimeouts.size).toBe(0);
  });

  it('should cleanup orphaned titleLoading without tracked timeout', () => {
    const { cleanupStaleTitleLoadingStates } = useChatStore.getState();

    // Set titleLoading without a tracked timeout (orphaned state)
    useChatStore.setState({
      conversations: [
        { id: 'conv-1', title: 'Test', titleLoading: true, createdAt: new Date(), updatedAt: new Date(), mode: 'consult' },
      ],
      titleLoadingTimeouts: new Map(), // No tracked timeout
    });

    // Run cleanup
    cleanupStaleTitleLoadingStates();

    // Orphaned state should be cleared
    expect(useChatStore.getState().conversations[0].titleLoading).toBe(false);
  });
});

describe('Disconnect cleanup (Story 26.3)', () => {
  it('should clear all titleLoading states on disconnect', () => {
    // Setup: Multiple conversations with titleLoading
    useChatStore.setState({
      conversations: [
        { id: 'conv-1', title: 'Test 1', titleLoading: true, createdAt: new Date(), updatedAt: new Date(), mode: 'consult' },
        { id: 'conv-2', title: 'Test 2', titleLoading: true, createdAt: new Date(), updatedAt: new Date(), mode: 'assessment' },
        { id: 'conv-3', title: 'Test 3', titleLoading: false, createdAt: new Date(), updatedAt: new Date(), mode: 'consult' },
      ],
    });

    // Simulate disconnect handler
    const state = useChatStore.getState();
    state.conversations.forEach((conv) => {
      if (conv.titleLoading) {
        state.setConversationTitleLoading(conv.id, false);
      }
    });

    // All titleLoading should be false
    const updated = useChatStore.getState().conversations;
    expect(updated[0].titleLoading).toBe(false);
    expect(updated[1].titleLoading).toBe(false);
    expect(updated[2].titleLoading).toBe(false);
  });
});
```

## Definition of Done

- [ ] Timeout tracking added to chatStore state
- [ ] `startTitleLoadingTimeout` and `clearTitleLoadingTimeout` actions implemented
- [ ] `setConversationTitleLoading` triggers timeout start/stop
- [ ] `deleteConversation` clears pending timeout
- [ ] `cleanupStaleTitleLoadingStates` implemented and called on app load
- [ ] Disconnect handler clears all `titleLoading` states
- [ ] Error handler clears relevant `titleLoading` state
- [ ] All tests passing
- [ ] No memory leaks verified
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Code reviewed and approved

## Notes

**Persistence Warning:** The `titleLoadingTimeouts` Map should NOT be persisted to localStorage. The `partialize` function in chatStore already excludes non-essential state. Verify that `titleLoadingTimeouts` is excluded:

```typescript
partialize: (state) => ({
  sidebarMinimized: state.sidebarMinimized,
  activeConversationId: state.activeConversationId,
  // titleLoadingTimeouts NOT persisted
  // conversations NOT persisted
}),
```

**Race Condition:** If a title update event arrives just after the timeout fires, the title will update correctly (no conflict). The timeout only clears `titleLoading`, it doesn't prevent subsequent title updates.
