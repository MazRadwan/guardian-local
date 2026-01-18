# Story 24.5: Stream Mode Switch Preambles

## Description

Make mode switch preamble/guidance messages stream in naturally like regular assistant messages instead of appearing instantly.

**Why:** When switching to Assessment or Scoring mode, the guidance message currently "pops" in all at once, which feels jarring compared to the smooth streaming of regular Claude responses.

## Acceptance Criteria

- [ ] Mode switch guidance streams character-by-character (or chunk-by-chunk)
- [ ] Streaming speed matches regular Claude responses (~30-50 chars/sec)
- [ ] User can see text appearing progressively
- [ ] Works for all three modes (Consult has no guidance, Assessment and Scoring do)
- [ ] **Browser QA:** Switch from Consult -> Assessment mode, verify guidance streams in

## Technical Approach

### Recommended: Frontend-Only Simulated Streaming

A frontend-only solution is simpler and avoids backend complexity. The frontend simulates streaming by revealing the guidance text progressively.

**1. Create streaming text hook (`apps/web/src/hooks/useStreamingText.ts`):**

```typescript
'use client';

import { useState, useEffect, useRef } from 'react';

export interface UseStreamingTextOptions {
  text: string;
  speed?: number; // characters per second (default: 40)
  onComplete?: () => void;
}

export function useStreamingText({ text, speed = 40, onComplete }: UseStreamingTextOptions) {
  const [displayedText, setDisplayedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!text) {
      setDisplayedText('');
      setIsStreaming(false);
      return;
    }

    setIsStreaming(true);
    indexRef.current = 0;
    setDisplayedText('');

    const intervalMs = 1000 / speed;

    const timer = setInterval(() => {
      indexRef.current += 1;
      setDisplayedText(text.slice(0, indexRef.current));

      if (indexRef.current >= text.length) {
        clearInterval(timer);
        setIsStreaming(false);
        onComplete?.();
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [text, speed, onComplete]);

  return { displayedText, isStreaming, isComplete: !isStreaming && displayedText === text };
}
```

**2. Modify mode update handling (`apps/web/src/hooks/useWebSocketEvents.ts`):**

Add a flag to indicate the next assistant message should be simulated-streamed:

```typescript
// In chatStore or useWebSocketEvents
const [pendingGuidanceStream, setPendingGuidanceStream] = useState<string | null>(null);

const handleConversationModeUpdated = useCallback(
  (data: { conversationId: string; mode: ConversationMode; message?: string }) => {
    if (data.conversationId !== activeConversationId) return;

    // Store guidance message for simulated streaming
    // The message event will follow and we'll intercept it
    if (data.mode === 'assessment' || data.mode === 'scoring') {
      // Mark that next assistant message should be streamed
      useChatStore.getState().setSimulateStreamingForNext(true);
    }
  },
  [activeConversationId]
);
```

**3. Modify message rendering to support simulated streaming:**

In the chat message list component, check if simulated streaming is enabled for the message and use `useStreamingText`.

**Alternative: Backend Streaming**

If backend streaming is preferred, modify `ChatServer.ts:1854-1925`:

```typescript
// Instead of single message emit, stream tokens
if (mode === 'assessment') {
  const guidanceText = `**Assessment Mode Activated**\n\nPlease select...`;

  // Create message first (for persistence)
  const guidanceMessage = await this.conversationService.sendMessage({
    conversationId,
    role: 'assistant',
    content: { text: guidanceText },
  });

  // Stream tokens to client
  const tokens = guidanceText.split('');
  for (let i = 0; i < tokens.length; i++) {
    socket.emit('assistant_token', {
      token: tokens[i],
      conversationId,
      messageId: guidanceMessage.id,
    });
    // Delay between tokens (~40 chars/sec = 25ms)
    await new Promise(r => setTimeout(r, 25));
  }

  // Signal completion
  socket.emit('assistant_done', {
    messageId: guidanceMessage.id,
    conversationId,
    fullText: guidanceText,
  });
}
```

## Files Touched

### Frontend-Only Approach (Recommended)
- `apps/web/src/hooks/useStreamingText.ts` - NEW: Simulated streaming hook
- `apps/web/src/hooks/useWebSocketEvents.ts` - Flag guidance messages for streaming
- `apps/web/src/components/chat/ChatMessageList.tsx` - Use streaming hook for flagged messages
- `apps/web/src/stores/chatStore.ts` - Add `simulateStreamingForNext` flag

### Backend Approach (Alternative)
- `packages/backend/src/infrastructure/websocket/ChatServer.ts:1854-1925` - Stream guidance tokens

## Agent Assignment

**backend-agent** - Requires understanding of both frontend streaming patterns and backend emission logic to choose the right approach.

## Tests Required

### Unit Tests

**Frontend (`apps/web/src/hooks/__tests__/useStreamingText.test.ts`):**
```typescript
describe('useStreamingText', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should stream text progressively', () => {
    const { result } = renderHook(() =>
      useStreamingText({ text: 'Hello', speed: 10 })
    );

    expect(result.current.displayedText).toBe('');
    expect(result.current.isStreaming).toBe(true);

    jest.advanceTimersByTime(100); // 1 char
    expect(result.current.displayedText).toBe('H');

    jest.advanceTimersByTime(400); // 4 more chars
    expect(result.current.displayedText).toBe('Hello');
    expect(result.current.isStreaming).toBe(false);
  });

  it('should call onComplete when finished', () => {
    const onComplete = jest.fn();
    renderHook(() =>
      useStreamingText({ text: 'Hi', speed: 100, onComplete })
    );

    jest.advanceTimersByTime(20); // 2 chars at 100/sec

    expect(onComplete).toHaveBeenCalled();
  });
});
```

**Integration Test:**
```typescript
describe('Mode switch streaming', () => {
  it('should stream guidance message when switching to assessment mode', async () => {
    // Render chat, switch mode
    // Verify message appears progressively
    // Wait for completion
  });
});
```

## Browser QA Required

**Steps for Playwright MCP verification:**

1. Navigate to chat interface
2. Start a new conversation (Consult mode)
3. Switch to Assessment mode via mode selector
4. Observe the guidance message appearing
5. Take screenshot while text is still streaming (partial)
6. Take screenshot when complete

**Screenshot naming:**
- `24.5-guidance-streaming-partial.png` (mid-stream)
- `24.5-guidance-streaming-complete.png` (finished)

**Success criteria:** Guidance message MUST stream in progressively (NOT appear all at once).

**Video recording (optional):** If possible, record a short video showing the streaming effect for clearer verification.
