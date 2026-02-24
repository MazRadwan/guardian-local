import type { WebSocketAdapterInterface } from '@/hooks/useWebSocketAdapter';
import type { ChatMessage, MessageAttachment } from '@/lib/websocket';

/**
 * Store actions required by ChatService
 * This interface allows the service to update chat state without direct Zustand coupling
 */
export interface ChatStoreActions {
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  startStreaming: () => void;
  appendToLastMessage: (chunk: string) => void;
}

/**
 * ChatService - Business logic for chat messaging operations
 *
 * This service coordinates message sending, regeneration, and stream control
 * by orchestrating the WebSocket adapter and chat store mutations.
 *
 * Architecture:
 * - Plain TypeScript class (no React dependencies)
 * - Accepts WebSocketAdapterInterface for operations
 * - Accepts store actions for state mutations
 * - Fully testable with mocks
 *
 * Responsibilities:
 * 1. Send messages - Add to UI, set loading, send via adapter
 * 2. Regenerate messages - Validate, remove old response, resend user message
 * 3. Abort stream - Delegate to adapter
 *
 * @example
 * ```ts
 * const chatService = new ChatService(adapter, storeActions);
 * chatService.sendMessage('Hello', 'conv-123');
 * chatService.regenerateMessage(5, messages);
 * chatService.abortStream();
 * ```
 */
export class ChatService {
  constructor(
    private adapter: WebSocketAdapterInterface,
    private store: ChatStoreActions
  ) {}

  /**
   * Send a user message
   *
   * Flow:
   * 1. Validate connection and conversation ID
   * 2. Add user message to store immediately (optimistic UI)
   * 3. Set loading state (show typing indicator)
   * 4. Send message via WebSocket adapter
   * 5. Handle errors by setting error state
   *
   * Epic 16.6.8: Now accepts optional attachments for file uploads
   *
   * @param content - Message content
   * @param conversationId - Active conversation ID
   * @param attachments - Optional file attachments
   * @throws Error if not connected or no active conversation
   */
  sendMessage(content: string, conversationId: string | null, attachments?: MessageAttachment[]): void {
    // Guard: Connection check
    if (!this.adapter.isConnected) {
      this.store.setError('Not connected to server');
      return;
    }

    // Guard: Conversation check
    if (!conversationId) {
      this.store.setError('No active conversation');
      return;
    }

    // Epic 16.6.8: Add user message to UI immediately (optimistic update)
    // Include attachments if provided
    this.store.addMessage({
      role: 'user',
      content,
      timestamp: new Date(),
      attachments,
    });

    // Set loading state (show typing indicator)
    this.store.setLoading(true);

    // Send to server with conversationId and attachments
    try {
      this.adapter.sendMessage(content, conversationId, attachments);
    } catch (err) {
      this.store.setError('Failed to send message');
      this.store.setLoading(false);
      console.error('[ChatService] Send message error:', err);
    }
  }

  /**
   * Regenerate an assistant message
   *
   * Flow:
   * 1. Validate connection, conversation ID, and message index
   * 2. Find previous user message
   * 3. Remove old assistant message from store
   * 4. Resend previous user message via adapter
   * 5. Handle errors by setting error state
   *
   * @param messageIndex - Index of assistant message to regenerate
   * @param conversationId - Active conversation ID
   * @param messages - Current messages array
   * @param setRegeneratingIndex - Callback to mark regenerating state (optional)
   * @returns void
   */
  regenerateMessage(
    messageIndex: number,
    conversationId: string | null,
    messages?: ChatMessage[],
    setRegeneratingIndex?: (index: number | null) => void
  ): void {
    // Default messages to empty array if not provided (allows service to be self-contained)
    const messageArray = messages || [];
    // Guard: Connection check
    if (!this.adapter.isConnected || !conversationId) {
      this.store.setError('Not connected to server');
      return;
    }

    // Guard: Validate messageIndex
    if (messageIndex < 0 || messageIndex >= messageArray.length) {
      this.store.setError('Invalid message index');
      return;
    }

    // Find previous user message
    const previousMessage = messageArray[messageIndex - 1];
    if (!previousMessage || previousMessage.role !== 'user') {
      this.store.setError('Cannot regenerate: previous user message not found');
      return;
    }

    // Mark as regenerating (optional callback)
    setRegeneratingIndex?.(messageIndex);

    // Remove old assistant message
    const updatedMessages = messageArray.filter((_, idx) => idx !== messageIndex);
    this.store.setMessages(updatedMessages);

    // Resend the previous user message
    // Note: User message already exists in UI at messageIndex-1, don't add it again
    this.store.setLoading(true);
    try {
      // Story 24.1: Pass isRegenerate: true to get different response from LLM
      // Bug fix: Pass attachments from previous message to avoid empty payload rejection
      // on file-only messages (backend requires text OR attachments)
      this.adapter.sendMessage(previousMessage.content, conversationId, previousMessage.attachments, true);
    } catch (err) {
      this.store.setError('Failed to regenerate response');
      this.store.setLoading(false);
      setRegeneratingIndex?.(null);
      console.error('[ChatService] Regenerate error:', err);
    }
  }

  /**
   * Abort active message stream
   *
   * Delegates to adapter's abortStream method.
   * No state updates needed here - handled by WebSocket event callbacks.
   */
  abortStream(): void {
    this.adapter.abortStream();
  }
}
