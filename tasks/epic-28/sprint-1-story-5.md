# Story 28.1.5: Extract StreamingHandler.ts

**Sprint:** 1 - Foundation
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Extract streaming utilities (`chunkMarkdown`, `streamMarkdownToSocket`, `sleep`) from ChatServer.ts into a dedicated `StreamingHandler.ts` class. This name aligns with `docs/design/architecture/implementation-guide.md`.

---

## Acceptance Criteria

- [ ] `StreamingHandler.ts` created at `infrastructure/websocket/StreamingHandler.ts`
- [ ] Contains `chunkMarkdown()`, `streamToSocket()`, `sleep()` methods
- [ ] Uses `ISocketEmitter` interface (not concrete Socket.IO type)
- [ ] Supports abort handling via callback
- [ ] Unit tests achieve >90% coverage
- [ ] ChatServer.ts continues to compile (will integrate in later story)

---

## Technical Approach

```typescript
// infrastructure/websocket/StreamingHandler.ts

/**
 * Socket emitter interface - abstracts Socket.IO
 */
export interface ISocketEmitter {
  emit(event: string, data: unknown): void;
}

/**
 * StreamingHandler - Simulated streaming for markdown content
 *
 * Used to stream pre-rendered markdown to clients with typing effect.
 * Part of Epic 28 ChatServer modularization.
 */
export class StreamingHandler {
  constructor(
    private readonly chunkSize: number = 80,
    private readonly delayMs: number = 20
  ) {}

  /**
   * Split markdown into chunks for simulated streaming
   * Tries to break at word boundaries for natural reading.
   */
  chunkMarkdown(markdown: string): string[] {
    const chunks: string[] = [];
    let remaining = markdown;

    while (remaining.length > 0) {
      let end = Math.min(this.chunkSize, remaining.length);
      if (end < remaining.length) {
        const lastSpace = remaining.lastIndexOf(' ', end);
        if (lastSpace > this.chunkSize * 0.5) {
          end = lastSpace + 1;
        }
      }
      chunks.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }

    return chunks;
  }

  /**
   * Stream markdown to socket with simulated typing effect
   *
   * @param socket - Socket emitter to send chunks to
   * @param markdown - Full markdown content
   * @param conversationId - Conversation identifier
   * @param isAborted - Callback to check if stream should abort
   * @param onAborted - Callback when stream is aborted
   */
  async streamToSocket(
    socket: ISocketEmitter,
    markdown: string,
    conversationId: string,
    isAborted: () => boolean,
    onAborted: () => void
  ): Promise<void> {
    const chunks = this.chunkMarkdown(markdown);

    for (const chunk of chunks) {
      if (isAborted()) {
        onAborted();
        return;
      }

      socket.emit('assistant_token', {
        conversationId,
        token: chunk,
      });

      await this.sleep(this.delayMs);
    }

    socket.emit('assistant_done', {
      conversationId,
      fullText: markdown,
    });
  }

  /**
   * Simple sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/StreamingHandler.ts` - Create new file
- `packages/backend/__tests__/unit/infrastructure/websocket/StreamingHandler.test.ts` - Create unit tests

---

## Tests Required

```typescript
// __tests__/unit/infrastructure/websocket/StreamingHandler.test.ts

describe('StreamingHandler', () => {
  let handler: StreamingHandler;
  let mockSocket: jest.Mocked<ISocketEmitter>;

  beforeEach(() => {
    handler = new StreamingHandler(80, 5); // Short delay for tests
    mockSocket = { emit: jest.fn() };
  });

  describe('chunkMarkdown', () => {
    it('should split markdown into chunks', () => {
      const markdown = 'Hello world this is a test string that should be chunked properly';
      const chunks = handler.chunkMarkdown(markdown);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toBe(markdown);
    });

    it('should handle empty string', () => {
      expect(handler.chunkMarkdown('')).toEqual([]);
    });

    it('should handle string shorter than chunk size', () => {
      const chunks = handler.chunkMarkdown('Short');
      expect(chunks).toEqual(['Short']);
    });

    it('should prefer breaking at word boundaries', () => {
      const handler = new StreamingHandler(10, 5);
      const chunks = handler.chunkMarkdown('Hello world test');
      // Should break at spaces when possible
      expect(chunks.some(c => c.endsWith(' ') || c.length <= 10)).toBe(true);
    });
  });

  describe('streamToSocket', () => {
    it('should emit chunks to socket', async () => {
      await handler.streamToSocket(
        mockSocket,
        'Test content',
        'conv-123',
        () => false,
        jest.fn()
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_token', expect.any(Object));
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_done', {
        conversationId: 'conv-123',
        fullText: 'Test content',
      });
    });

    it('should abort when isAborted returns true', async () => {
      const onAborted = jest.fn();
      let callCount = 0;

      await handler.streamToSocket(
        mockSocket,
        'This is a longer test content that needs multiple chunks',
        'conv-123',
        () => {
          callCount++;
          return callCount > 1; // Abort after first chunk
        },
        onAborted
      );

      expect(onAborted).toHaveBeenCalled();
      // Should not emit assistant_done when aborted
      expect(mockSocket.emit).not.toHaveBeenCalledWith('assistant_done', expect.any(Object));
    });
  });
});
```

---

## Definition of Done

- [ ] StreamingHandler.ts created
- [ ] Unit tests written and passing (>90% coverage)
- [ ] TypeScript compiles without errors
- [ ] No changes to ChatServer behavior yet
