/**
 * StreamingHandler - Simulated streaming for markdown content
 *
 * Extracted from ChatServer.ts as part of Epic 28 modularization.
 * Used to stream pre-rendered markdown to clients with typing effect.
 *
 * @see docs/design/architecture/implementation-guide.md
 */

/**
 * Socket emitter interface - abstracts Socket.IO
 * Allows for easier testing and decoupling from Socket.IO implementation
 */
export interface ISocketEmitter {
  emit(event: string, data: unknown): void;
}

/**
 * StreamingHandler class
 *
 * Handles simulated streaming of markdown content to clients.
 * Chunks content and emits with small delays for natural UX.
 */
export class StreamingHandler {
  /**
   * Create a new StreamingHandler
   *
   * @param chunkSize - Maximum characters per chunk (default 80)
   * @param delayMs - Delay between chunks in milliseconds (default 20)
   */
  constructor(
    private readonly chunkSize: number = 80,
    private readonly delayMs: number = 20
  ) {}

  /**
   * Split markdown into chunks for simulated streaming
   *
   * Tries to break at word boundaries for natural reading.
   * If no word boundary found within the last 50% of chunk,
   * breaks at the chunk size limit.
   *
   * @param markdown - Full markdown content to chunk
   * @returns Array of string chunks
   */
  chunkMarkdown(markdown: string): string[] {
    if (!markdown) {
      return [];
    }

    const chunks: string[] = [];
    let remaining = markdown;

    while (remaining.length > 0) {
      // Try to break at word boundary
      let end = Math.min(this.chunkSize, remaining.length);
      if (end < remaining.length) {
        const lastSpace = remaining.lastIndexOf(' ', end);
        // Only use word boundary if it's in the last 50% of chunk
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
   * Chunks the markdown and emits with small delays for familiar UX.
   * This replaces Claude streaming with deterministic content.
   *
   * IMPORTANT: Abort handling preserves `assistant_aborted` vs `assistant_done` semantics:
   * - When isAborted() returns true, onAborted() callback is invoked
   * - The onAborted callback should emit 'assistant_aborted' (NOT 'assistant_done')
   * - Completed streams emit 'assistant_done' with full text
   *
   * @param socket - Socket emitter to send chunks to
   * @param markdown - Full markdown content to stream
   * @param conversationId - Conversation identifier for event payload
   * @param isAborted - Callback to check if stream should abort
   * @param onAborted - Callback invoked when stream is aborted (should emit assistant_aborted)
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
      // Check abort flag between chunks
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

    // Stream completed successfully - emit done event
    socket.emit('assistant_done', {
      conversationId,
      fullText: markdown,
    });
  }

  /**
   * Simple sleep helper for delays between chunks
   *
   * @param ms - Milliseconds to sleep
   */
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
