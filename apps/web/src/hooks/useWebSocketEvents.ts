'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChatMessage } from '@/lib/websocket';
import type { Conversation } from '@/stores/chatStore';
import type { ComposerRef } from '@/components/chat/Composer';

export interface UseWebSocketEventsParams {
  // Store actions
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  finishStreaming: () => void;
  startStreaming: () => void;
  appendToLastMessage: (chunk: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversationTitle: (id: string, title: string) => void;
  removeConversationFromList: (id: string) => void;
  clearDeleteConversationRequest: () => void;
  requestNewChat: () => void;

  // State
  messages: ChatMessage[];
  isLoading: boolean;
  activeConversationId: string | null;
  conversations: Conversation[];
  newChatRequested: boolean;

  // Refs
  composerRef: React.RefObject<ComposerRef | null>;

  // Other hooks
  handleHistory: (messages: ChatMessage[]) => void;
  setShouldLoadHistory: (should: boolean) => void;
  markConversationAsJustCreated: (id: string) => void;
  setActiveConversation: (id: string | null) => void;

  // Flags
  setRegeneratingMessageIndex: (index: number | null) => void;
  focusComposer: () => void;
}

export interface UseWebSocketEventsReturn {
  // All event handlers as stable callbacks
  handleMessage: (message: ChatMessage) => void;
  handleMessageStream: (chunk: string, conversationId: string) => void;
  handleError: (errorMessage: string) => void;
  handleConnectionReady: (data: { conversationId?: string; resumed: boolean; hasActiveConversation: boolean }) => void;
  handleStreamComplete: () => void;
  handleConversationsList: (conversations: Conversation[]) => void;
  handleConversationCreated: (conversation: Conversation) => void;
  handleConversationTitleUpdated: (conversationId: string, title: string) => void;
  handleStreamAborted: (conversationId: string) => void;
  handleConversationDeleted: (conversationId: string) => void;
}

/**
 * useWebSocketEvents - Extracts WebSocket event handler logic from useChatController
 *
 * This hook encapsulates all WebSocket event callbacks (11 total) with stable references
 * to prevent unnecessary re-registration. All handlers are wrapped in useCallback with
 * proper dependency tracking to avoid stale closures.
 *
 * Event Handlers:
 * 1. handleMessage - Process complete assistant messages
 * 2. handleMessageStream - Process streaming message chunks
 * 3. handleError - Handle WebSocket errors
 * 4. handleConnectionReady - Handle connection initialization/resume
 * 5. handleStreamComplete - Clean up after streaming completes
 * 6. handleConversationsList - Update conversations list
 * 7. handleConversationCreated - Handle new conversation creation
 * 8. handleConversationTitleUpdated - Update conversation title
 * 9. handleStreamAborted - Handle stream abortion
 * 10. handleConversationDeleted - Handle conversation deletion
 * 11. (handleHistory delegated to useHistoryManager)
 *
 * @param params - All necessary store actions, state, refs, and callbacks
 * @returns Object containing all stable event handler callbacks
 */
export function useWebSocketEvents({
  addMessage,
  setMessages,
  finishStreaming,
  startStreaming,
  appendToLastMessage,
  setLoading,
  setError,
  setConversations,
  addConversation,
  updateConversationTitle,
  removeConversationFromList,
  clearDeleteConversationRequest,
  requestNewChat,
  messages,
  isLoading,
  activeConversationId,
  conversations,
  newChatRequested,
  composerRef,
  handleHistory,
  setShouldLoadHistory,
  markConversationAsJustCreated,
  setActiveConversation,
  setRegeneratingMessageIndex,
  focusComposer,
}: UseWebSocketEventsParams): UseWebSocketEventsReturn {

  // Handler 1: Process complete assistant messages
  const handleMessage = useCallback(
    (message: ChatMessage) => {
      // Add message to store (critical - this was missing!)
      addMessage(message);
      finishStreaming();
      setLoading(false); // Hide typing indicator

      // Auto-focus input after assistant response completes
      focusComposer();
    },
    [addMessage, finishStreaming, setLoading, focusComposer]
  );

  // Handler 2: Process streaming message chunks
  const handleMessageStream = useCallback(
    (chunk: string, conversationId: string) => {
      // CRITICAL: Ignore chunks for inactive conversations (Story 9.0c)
      // This prevents streaming responses from bleeding across conversation switches
      if (conversationId !== activeConversationId) {
        console.warn(
          `[useWebSocketEvents] Ignoring streaming chunk for inactive conversation. ` +
          `Chunk belongs to: ${conversationId}, active conversation: ${activeConversationId}`
        );
        return;
      }

      // If this is the first chunk, start a new streaming message
      if (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') {
        startStreaming();
        setLoading(false); // Hide typing indicator, show streaming message instead
      }
      appendToLastMessage(chunk);
    },
    [activeConversationId, messages, startStreaming, appendToLastMessage, setLoading]
  );

  // Handler 3: Handle WebSocket errors
  const handleError = useCallback(
    (errorMessage: string) => {
      setError(errorMessage);
      finishStreaming();
      setLoading(false); // Hide typing indicator on error
      setRegeneratingMessageIndex(null); // Reset regenerating state
    },
    [setError, finishStreaming, setLoading, setRegeneratingMessageIndex]
  );

  // Handler 4: Handle connection initialization/resume
  const handleConnectionReady = useCallback(
    (data: { conversationId?: string; resumed: boolean; hasActiveConversation: boolean }) => {
      console.log('[useWebSocketEvents] Connection ready:', data);

      if (data.hasActiveConversation && data.conversationId) {
        // SCENARIO 1: Backend successfully resumed existing conversation
        console.log('[useWebSocketEvents] Resuming conversation:', data.conversationId);

        // Set flag to load history for this conversation
        setShouldLoadHistory(true);

        // Set as active (URL + localStorage updates handled by useConversationSync)
        setActiveConversation(data.conversationId);
      } else {
        // SCENARIO 2: No active conversation (deleted/missing) - auto-create new chat
        // Use sessionStorage guard to survive React Strict Mode double-mount
        const hasAutoCreated = sessionStorage.getItem('guardian_auto_created_chat');

        if (!hasAutoCreated && !newChatRequested) {
          console.log('[useWebSocketEvents] No active conversation - auto-creating new chat');
          sessionStorage.setItem('guardian_auto_created_chat', 'true');
          requestNewChat();
        }
      }

      // CRITICAL: Always clear loading state to prevent skeleton hang
      setLoading(false);
    },
    [requestNewChat, newChatRequested, setShouldLoadHistory, setActiveConversation, setLoading]
  );

  // Handler 5: Clean up after streaming completes
  const handleStreamComplete = useCallback(() => {
    // Stream is complete, finish streaming and auto-focus input
    finishStreaming();
    setLoading(false);
    setRegeneratingMessageIndex(null); // Reset regenerating state
    focusComposer();
  }, [finishStreaming, setLoading, setRegeneratingMessageIndex, focusComposer]);

  // Handler 6: Update conversations list
  const handleConversationsList = useCallback(
    (conversations: Conversation[]) => {
      console.log('[useWebSocketEvents] handleConversationsList called with:', conversations.length, 'conversations');
      console.log('[useWebSocketEvents] Conversations data:', conversations);
      setConversations(conversations);
      console.log('[useWebSocketEvents] setConversations called - chatStore should be updated');
    },
    [setConversations]
  );

  // Handler 7: Handle new conversation creation
  const handleConversationCreated = useCallback(
    (conversation: Conversation) => {
      console.log('[useWebSocketEvents] New conversation created:', conversation.id);
      addConversation(conversation);

      // Mark this conversation as just created (to prevent loading history for it)
      markConversationAsJustCreated(conversation.id);

      // Set as active (URL + localStorage updates handled by useConversationSync)
      setActiveConversation(conversation.id);
    },
    [addConversation, setActiveConversation, markConversationAsJustCreated]
  );

  // Handler 8: Update conversation title
  const handleConversationTitleUpdated = useCallback(
    (conversationId: string, title: string) => {
      console.log('[useWebSocketEvents] Conversation title updated:', conversationId, title);
      updateConversationTitle(conversationId, title);
    },
    [updateConversationTitle]
  );

  // Handler 9: Handle stream abortion
  const handleStreamAborted = useCallback(
    (conversationId: string) => {
      console.log('[useWebSocketEvents] Stream aborted for conversation:', conversationId);
      // Finish streaming and re-enable composer
      finishStreaming();
      setLoading(false);
      setRegeneratingMessageIndex(null); // Reset regenerating state
      // Auto-focus composer after abort
      focusComposer();
    },
    [finishStreaming, setLoading, setRegeneratingMessageIndex, focusComposer]
  );

  // Handler 10: Handle conversation deletion
  const handleConversationDeleted = useCallback(
    (conversationId: string) => {
      console.log('[useWebSocketEvents] Conversation deleted:', conversationId);
      // Remove from local store
      removeConversationFromList(conversationId);
      // Clear the request flag
      clearDeleteConversationRequest();

      // CRITICAL FIX: Clear localStorage if deleted conversation was the saved one
      if (typeof window !== 'undefined') {
        const savedId = localStorage.getItem('guardian_conversation_id');
        if (savedId === conversationId) {
          console.log('[useWebSocketEvents] Clearing localStorage for deleted conversation');
          localStorage.removeItem('guardian_conversation_id');
          // Note: savedConversationId is now managed by useConversationSync
        }
      }

      // CRITICAL FIX: Also clear Zustand persisted activeConversationId if it matches
      if (activeConversationId === conversationId) {
        console.log('[useWebSocketEvents] Clearing active conversation ID for deleted conversation');
        setActiveConversation(null);
      }

      // CRITICAL FIX: If no conversations left after deletion, auto-create new one
      // conversations.length will be the count before removal, so check if it will be 0
      const remainingCount = conversations.filter(c => c.id !== conversationId).length;
      if (remainingCount === 0) {
        console.log('[useWebSocketEvents] Last conversation deleted - auto-creating new chat');
        requestNewChat();
      }
    },
    [removeConversationFromList, clearDeleteConversationRequest, activeConversationId, setActiveConversation, conversations, requestNewChat]
  );

  return {
    handleMessage,
    handleMessageStream,
    handleError,
    handleConnectionReady,
    handleStreamComplete,
    handleConversationsList,
    handleConversationCreated,
    handleConversationTitleUpdated,
    handleStreamAborted,
    handleConversationDeleted,
  };
}
