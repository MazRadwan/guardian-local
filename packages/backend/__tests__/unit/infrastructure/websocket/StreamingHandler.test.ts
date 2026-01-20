import {
  StreamingHandler,
  ISocketEmitter,
} from '../../../../src/infrastructure/websocket/StreamingHandler';

describe('StreamingHandler', () => {
  let handler: StreamingHandler;
  let mockSocket: jest.Mocked<ISocketEmitter>;

  beforeEach(() => {
    handler = new StreamingHandler(80, 5); // Short delay for tests
    mockSocket = { emit: jest.fn() };
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default values when no parameters provided', () => {
      const defaultHandler = new StreamingHandler();
      // Verify defaults by chunking content
      const chunks = defaultHandler.chunkMarkdown('a'.repeat(100));
      // Default chunk size is 80, so 100 chars should produce 2 chunks
      expect(chunks.length).toBe(2);
    });

    it('should accept custom chunk size and delay', () => {
      const customHandler = new StreamingHandler(50, 10);
      const chunks = customHandler.chunkMarkdown('a'.repeat(100));
      // 50 char chunks, so 100 chars should produce 2 chunks
      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(50);
    });
  });

  describe('chunkMarkdown', () => {
    it('should split markdown into chunks', () => {
      const markdown =
        'Hello world this is a test string that should be chunked properly';
      const chunks = handler.chunkMarkdown(markdown);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toBe(markdown);
    });

    it('should handle empty string', () => {
      expect(handler.chunkMarkdown('')).toEqual([]);
    });

    it('should handle null-ish content gracefully', () => {
      // TypeScript should prevent this, but test runtime behavior
      expect(handler.chunkMarkdown(null as unknown as string)).toEqual([]);
      expect(handler.chunkMarkdown(undefined as unknown as string)).toEqual([]);
    });

    it('should handle string shorter than chunk size', () => {
      const chunks = handler.chunkMarkdown('Short');
      expect(chunks).toEqual(['Short']);
    });

    it('should prefer breaking at word boundaries', () => {
      const smallHandler = new StreamingHandler(10, 5);
      const chunks = smallHandler.chunkMarkdown('Hello world test');
      // Should break at spaces when possible
      expect(chunks.some((c) => c.endsWith(' ') || c.length <= 10)).toBe(true);
    });

    it('should break at chunk size when no word boundary in range', () => {
      const smallHandler = new StreamingHandler(10, 5);
      // No spaces, so it must break at chunk size
      const chunks = smallHandler.chunkMarkdown('abcdefghijklmnopqrstuvwxyz');
      expect(chunks[0].length).toBe(10);
      expect(chunks[1].length).toBe(10);
      expect(chunks[2].length).toBe(6);
    });

    it('should handle content exactly at chunk boundary', () => {
      const boundaryHandler = new StreamingHandler(10, 5);
      const chunks = boundaryHandler.chunkMarkdown('1234567890'); // Exactly 10 chars
      expect(chunks).toEqual(['1234567890']);
    });

    it('should handle content one char over chunk boundary', () => {
      const boundaryHandler = new StreamingHandler(10, 5);
      const chunks = boundaryHandler.chunkMarkdown('12345678901'); // 11 chars
      expect(chunks.length).toBe(2);
      expect(chunks.join('')).toBe('12345678901');
    });

    it('should handle word boundary exactly at 50% threshold', () => {
      // Chunk size 10, space at position 5 (exactly 50%)
      const smallHandler = new StreamingHandler(10, 5);
      const chunks = smallHandler.chunkMarkdown('12345 67890abc');
      // Space at position 5 is exactly 50%, should NOT be used as boundary
      // (condition is lastSpace > chunkSize * 0.5, not >=)
      expect(chunks.join('')).toBe('12345 67890abc');
    });

    it('should handle markdown with special characters', () => {
      const markdown = '**Bold** and _italic_ and `code` and [link](url)';
      const chunks = handler.chunkMarkdown(markdown);
      expect(chunks.join('')).toBe(markdown);
    });

    it('should handle markdown with newlines', () => {
      const markdown = 'Line 1\nLine 2\n\nLine 3';
      const chunks = handler.chunkMarkdown(markdown);
      expect(chunks.join('')).toBe(markdown);
    });

    it('should preserve unicode characters', () => {
      const markdown = 'Hello world with emoji and special chars';
      const chunks = handler.chunkMarkdown(markdown);
      expect(chunks.join('')).toBe(markdown);
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

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'assistant_token',
        expect.any(Object)
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_done', {
        conversationId: 'conv-123',
        fullText: 'Test content',
      });
    });

    it('should emit all chunks before done event', async () => {
      const content = 'A'.repeat(200); // Will produce multiple chunks with 80 char size
      await handler.streamToSocket(
        mockSocket,
        content,
        'conv-123',
        () => false,
        jest.fn()
      );

      const calls = mockSocket.emit.mock.calls;
      const tokenCalls = calls.filter((call) => call[0] === 'assistant_token');
      const doneCalls = calls.filter((call) => call[0] === 'assistant_done');

      expect(tokenCalls.length).toBeGreaterThan(1);
      expect(doneCalls.length).toBe(1);
      // Done call should be the last call
      expect(calls[calls.length - 1][0]).toBe('assistant_done');
    });

    it('should include correct conversationId in token events', async () => {
      await handler.streamToSocket(
        mockSocket,
        'Test',
        'my-conversation-id',
        () => false,
        jest.fn()
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_token', {
        conversationId: 'my-conversation-id',
        token: 'Test',
      });
    });

    it('should abort when isAborted returns true immediately', async () => {
      const onAborted = jest.fn();

      await handler.streamToSocket(
        mockSocket,
        'This content should not be streamed',
        'conv-123',
        () => true, // Always return true
        onAborted
      );

      expect(onAborted).toHaveBeenCalled();
      // Should not emit any tokens or done
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('should abort when isAborted returns true mid-stream', async () => {
      const onAborted = jest.fn();
      let callCount = 0;

      // Use content that produces multiple chunks (each chunk is 80 chars max)
      // 200 'A' characters will produce at least 3 chunks
      const multiChunkContent = 'A'.repeat(200);

      await handler.streamToSocket(
        mockSocket,
        multiChunkContent,
        'conv-123',
        () => {
          callCount++;
          return callCount > 1; // Abort after first chunk
        },
        onAborted
      );

      expect(onAborted).toHaveBeenCalled();
      // Should not emit assistant_done when aborted
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        'assistant_done',
        expect.any(Object)
      );
    });

    it('should emit assistant_aborted via onAborted callback (not assistant_done)', async () => {
      // This test ensures UX regression is caught - aborted streams must NOT complete normally
      mockSocket.emit = jest.fn();
      let abortTriggered = false;

      // Use content that produces multiple chunks (200 chars = 3 chunks with 80 char size)
      const multiChunkContent = 'B'.repeat(200);

      await handler.streamToSocket(
        mockSocket,
        multiChunkContent,
        'conv-456',
        () => {
          // First call returns false, subsequent calls return true
          if (!abortTriggered) {
            abortTriggered = true;
            return false;
          }
          return true;
        },
        () => mockSocket.emit('assistant_aborted', { conversationId: 'conv-456' })
      );

      // Verify assistant_aborted was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_aborted', {
        conversationId: 'conv-456',
      });
      // Verify assistant_done was NOT emitted
      const doneCall = (mockSocket.emit as jest.Mock).mock.calls.find(
        (call) => call[0] === 'assistant_done'
      );
      expect(doneCall).toBeUndefined();
    });

    it('should emit at least one token before abort callback is invoked', async () => {
      mockSocket.emit = jest.fn();
      let checkCount = 0;

      // Use content that produces multiple chunks
      const multiChunkContent = 'C'.repeat(200);

      await handler.streamToSocket(
        mockSocket,
        multiChunkContent,
        'conv-789',
        () => {
          checkCount++;
          return checkCount > 1;
        },
        jest.fn()
      );

      // First token should be emitted
      const tokenCalls = (mockSocket.emit as jest.Mock).mock.calls.filter(
        (call) => call[0] === 'assistant_token'
      );
      expect(tokenCalls.length).toBe(1);
    });

    it('should handle empty markdown gracefully', async () => {
      await handler.streamToSocket(
        mockSocket,
        '',
        'conv-123',
        () => false,
        jest.fn()
      );

      // Should emit done with empty content
      expect(mockSocket.emit).toHaveBeenCalledWith('assistant_done', {
        conversationId: 'conv-123',
        fullText: '',
      });
    });

    it('should handle very long content without hanging', async () => {
      const fastHandler = new StreamingHandler(80, 1); // 1ms delay
      const longContent = 'x'.repeat(10000);
      mockSocket.emit = jest.fn();

      const startTime = Date.now();
      await fastHandler.streamToSocket(
        mockSocket,
        longContent,
        'conv-789',
        () => false,
        jest.fn()
      );
      const duration = Date.now() - startTime;

      // Should complete and emit assistant_done
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'assistant_done',
        expect.objectContaining({
          conversationId: 'conv-789',
          fullText: longContent,
        })
      );

      // Should complete in reasonable time (10000 chars / 80 = 125 chunks * 1ms = ~125ms + overhead)
      expect(duration).toBeLessThan(5000); // Very generous limit
    });

    it('should preserve full text in done event even with chunked streaming', async () => {
      const markdown =
        '# Heading\n\nParagraph with **bold** and _italic_.\n\n- List item 1\n- List item 2';

      await handler.streamToSocket(
        mockSocket,
        markdown,
        'conv-123',
        () => false,
        jest.fn()
      );

      // Verify the fullText in done event matches original exactly
      const doneCalls = (mockSocket.emit as jest.Mock).mock.calls.filter(
        (call) => call[0] === 'assistant_done'
      );
      expect(doneCalls.length).toBe(1);
      expect(doneCalls[0][1].fullText).toBe(markdown);
    });
  });

  describe('sleep', () => {
    it('should resolve after specified delay', async () => {
      const startTime = Date.now();
      await handler.sleep(50);
      const duration = Date.now() - startTime;

      // Allow some tolerance for timing
      expect(duration).toBeGreaterThanOrEqual(45);
      expect(duration).toBeLessThan(100);
    });

    it('should resolve immediately with 0ms delay', async () => {
      const startTime = Date.now();
      await handler.sleep(0);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10);
    });
  });

  describe('integration scenarios', () => {
    it('should reconstruct original content from emitted tokens', async () => {
      const originalContent =
        'This is a test message with multiple words that should be properly chunked and reconstructed.';
      const emittedTokens: string[] = [];

      const capturingSocket: ISocketEmitter = {
        emit: (event: string, data: unknown) => {
          if (event === 'assistant_token') {
            emittedTokens.push((data as { token: string }).token);
          }
        },
      };

      await handler.streamToSocket(
        capturingSocket,
        originalContent,
        'conv-123',
        () => false,
        jest.fn()
      );

      const reconstructed = emittedTokens.join('');
      expect(reconstructed).toBe(originalContent);
    });

    it('should work with different chunk sizes for same content', async () => {
      const content = 'The quick brown fox jumps over the lazy dog.';

      const handler20 = new StreamingHandler(20, 1);
      const handler40 = new StreamingHandler(40, 1);
      const handler100 = new StreamingHandler(100, 1);

      const chunks20 = handler20.chunkMarkdown(content);
      const chunks40 = handler40.chunkMarkdown(content);
      const chunks100 = handler100.chunkMarkdown(content);

      // More chunks with smaller size
      expect(chunks20.length).toBeGreaterThan(chunks40.length);
      expect(chunks40.length).toBeGreaterThanOrEqual(chunks100.length);

      // All should reconstruct to same content
      expect(chunks20.join('')).toBe(content);
      expect(chunks40.join('')).toBe(content);
      expect(chunks100.join('')).toBe(content);
    });

    it('should handle abort at various points in the stream', async () => {
      const content = 'A'.repeat(500); // Will produce several chunks

      // Test abort at different points
      for (const abortAfter of [0, 1, 2, 3]) {
        const socket: jest.Mocked<ISocketEmitter> = { emit: jest.fn() };
        let checkCount = 0;
        const onAborted = jest.fn();

        await handler.streamToSocket(
          socket,
          content,
          'conv-test',
          () => {
            checkCount++;
            return checkCount > abortAfter;
          },
          onAborted
        );

        if (abortAfter === 0) {
          // Immediate abort - no tokens emitted
          expect(socket.emit).not.toHaveBeenCalledWith(
            'assistant_token',
            expect.any(Object)
          );
          expect(onAborted).toHaveBeenCalled();
        } else {
          // Tokens emitted before abort
          const tokenCalls = socket.emit.mock.calls.filter(
            (call) => call[0] === 'assistant_token'
          );
          expect(tokenCalls.length).toBe(abortAfter);
          expect(onAborted).toHaveBeenCalled();
        }

        // Never emit assistant_done when aborted
        expect(socket.emit).not.toHaveBeenCalledWith(
          'assistant_done',
          expect.any(Object)
        );
      }
    });
  });
});
