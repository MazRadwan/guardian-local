import type { WebSocketAdapterInterface, ConversationMode } from '@/hooks/useWebSocketAdapter';
import type { ChatMessage } from '@/lib/websocket';

/**
 * Store actions required by ConversationService
 * This interface allows the service to update conversation state without direct Zustand coupling
 */
export interface ConversationStoreActions {
  clearMessages: () => void;
  finishStreaming: () => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}

/**
 * ConversationService - Business logic for conversation lifecycle operations
 *
 * This service coordinates conversation creation, deletion, and switching
 * by orchestrating the WebSocket adapter and conversation store mutations.
 *
 * Architecture:
 * - Plain TypeScript class (no React dependencies)
 * - Accepts WebSocketAdapterInterface for operations
 * - Accepts store actions for state mutations
 * - Fully testable with mocks
 *
 * Responsibilities:
 * 1. Create new conversation - Abort streaming, clear messages, request from backend
 * 2. Delete conversation - Request deletion from backend
 * 3. Switch conversation - Clear messages, request history (delegated to controller)
 *
 * @example
 * ```ts
 * const conversationService = new ConversationService(adapter, storeActions);
 * conversationService.createConversation('consult', clearNewChatRequest, focusComposer);
 * conversationService.deleteConversation('conv-123', clearDeleteRequest);
 * ```
 */
export class ConversationService {
  constructor(
    private adapter: WebSocketAdapterInterface,
    private store: ConversationStoreActions
  ) {}

  /**
   * Create a new conversation
   *
   * Flow:
   * 1. Validate connection
   * 2. Abort any active streaming
   * 3. Clear messages and localStorage
   * 4. Request backend to create conversation
   * 5. Clear request flag and focus composer
   *
   * Note: Actual conversation ID assignment happens via conversation_created WebSocket event
   *
   * @param mode - Conversation mode ('consult' or 'assessment')
   * @throws Error if not connected or creation fails
   */
  createConversation(mode: ConversationMode): void {
    // Guard: Connection check
    if (!this.adapter.isConnected) {
      this.store.setError('Not connected to server');
      return;
    }

    console.log('[ConversationService] Creating new conversation');

    // Clear messages and localStorage
    this.store.clearMessages();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('guardian_conversation_id');
    }

    // Request backend to create new conversation
    try {
      console.log('[ConversationService] Requesting new conversation from backend');
      this.adapter.startNewConversation(mode);
      // Flag will be reset when conversation_created event sets activeConversationId
    } catch (err) {
      console.error('[ConversationService] Failed to start new conversation:', err);
      this.store.setError('Failed to start new conversation');
      throw err; // Re-throw for caller to handle
    }
  }

  /**
   * Delete a conversation
   *
   * Flow:
   * 1. Validate connection
   * 2. Request deletion from backend
   *
   * Note: Actual removal from store happens in handleConversationDeleted callback
   * when backend confirms deletion via conversation_deleted event.
   *
   * @param conversationId - ID of conversation to delete
   * @throws Error if not connected or deletion fails
   */
  deleteConversation(conversationId: string): void {
    // Guard: Connection check
    if (!this.adapter.isConnected) {
      this.store.setError('Not connected to server');
      return;
    }

    console.log('[ConversationService] Deleting conversation:', conversationId);

    try {
      // Call WebSocket to delete from backend
      this.adapter.deleteConversation(conversationId);

      // Note: actual removal from store happens in handleConversationDeleted callback
      // which is triggered when backend confirms deletion via conversation_deleted event
    } catch (error) {
      console.error('[ConversationService] Error deleting conversation:', error);
      this.store.setError('Failed to delete conversation');
      throw error; // Re-throw for caller to handle
    }
  }

  /**
   * Switch to a different conversation
   *
   * Flow:
   * 1. Validate connection
   * 2. Clear current messages
   * 3. Set loading state
   *
   * Note: History loading is handled externally by useHistoryManager
   * This method only prepares the UI state for switching.
   *
   * @param conversationId - ID of conversation to switch to
   */
  switchConversation(conversationId: string): void {
    // Guard: Connection check
    if (!this.adapter.isConnected) {
      this.store.setError('Not connected to server');
      return;
    }

    console.log('[ConversationService] Switching to conversation:', conversationId);

    // Clear current messages
    this.store.clearMessages();

    // Show loading state (will be cleared when history loads)
    this.store.setLoading(true);

    // Note: URL + localStorage updates handled by useConversationSync
    // Note: History loading handled by useHistoryManager
  }

  /**
   * Fetch conversations list from backend
   *
   * Delegates to adapter's fetchConversations method.
   * Results are handled by onConversationsList WebSocket event callback.
   */
  fetchConversations(): void {
    if (!this.adapter.isConnected) {
      console.warn('[ConversationService] Cannot fetch conversations - not connected');
      return;
    }

    console.log('[ConversationService] Fetching conversations list');

    // Small delay to ensure WebSocket is fully ready
    setTimeout(() => {
      this.adapter.fetchConversations();
    }, 100);
  }
}
