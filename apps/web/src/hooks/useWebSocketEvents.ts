'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChatMessage, EmbeddedComponent, ExportReadyPayload, ExtractionFailedPayload, QuestionnaireReadyPayload } from '@/lib/websocket';
import { useChatStore } from '@/stores/chatStore';
import type { Conversation } from '@/stores/chatStore';
import type { ComposerRef } from '@/components/chat/Composer';
import type { ConversationMode } from '@/components/chat/ModeSelector';

export interface UseWebSocketEventsParams {
  // Store actions
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  finishStreaming: () => void;
  startStreaming: () => void;
  appendToLastMessage: (chunk: string) => void;
  appendComponentToLastAssistantMessage: (component: EmbeddedComponent) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversationTitle: (id: string, title: string) => void;
  removeConversationFromList: (id: string) => void;
  clearDeleteConversationRequest: () => void;
  requestNewChat: () => void;
  setExportReady: (conversationId: string, payload: ExportReadyPayload) => void;
  clearExportReady: (conversationId: string) => void;

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
  setModeFromConversation: (mode: ConversationMode) => void;

  // Flags
  setRegeneratingMessageIndex: (index: number | null) => void;
  focusComposer: () => void;

  // Persistence (Story 4.3.5)
  userId?: string;
  persistence?: {
    clearDismiss: (conversationId: string) => void;
    savePayload: (conversationId: string, payload: QuestionnaireReadyPayload) => void;
  };
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
  handleConversationModeUpdated: (data: { conversationId: string; mode: ConversationMode }) => void;
  handleExportReady: (data: ExportReadyPayload) => void;
  handleExtractionFailed: (data: ExtractionFailedPayload) => void;
  handleQuestionnaireReady: (data: QuestionnaireReadyPayload) => void;
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
  appendComponentToLastAssistantMessage,
  setLoading,
  setError,
  setConversations,
  addConversation,
  updateConversationTitle,
  removeConversationFromList,
  clearDeleteConversationRequest,
  requestNewChat,
  setExportReady,
  clearExportReady,
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
  setModeFromConversation,
  setRegeneratingMessageIndex,
  focusComposer,
  userId,
  persistence,
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
      console.error('[useWebSocketEvents] Error received:', errorMessage);
      setError(errorMessage);
      finishStreaming();
      setLoading(false); // Hide typing indicator on error
      setRegeneratingMessageIndex(null); // Reset regenerating state

      // Reset generating state on error (allows retry - don't clear pendingQuestionnaire)
      useChatStore.getState().setGenerating(false);
      // Transition to error state for questionnaire card to show retry
      useChatStore.getState().setQuestionnaireUIState('error');
      useChatStore.getState().setQuestionnaireError(errorMessage);
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

    // CRITICAL FIX (Story 4.3.5): DO NOT clear pendingQuestionnaire here!
    // Only clear generation flag. Payload clears on:
    // - User clicks Dismiss
    // - User downloads successfully
    // - New questionnaire_ready event received
    useChatStore.getState().setGenerating(false);
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
      // Hydrate mode from server payload
      setModeFromConversation(conversation.mode);
    },
    [addConversation, setActiveConversation, markConversationAsJustCreated, setModeFromConversation]
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
      // Clear export cache for this conversation before removal
      clearExportReady(conversationId);
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
    [removeConversationFromList, clearDeleteConversationRequest, clearExportReady, activeConversationId, setActiveConversation, conversations, requestNewChat]
  );

  // Handler 11: Conversation mode updated (server→client)
  const handleConversationModeUpdated = useCallback(
    (data: { conversationId: string; mode: ConversationMode }) => {
      // Update conversations list entry
      const updatedConversations = conversations.map((conv) =>
        conv.id === data.conversationId ? { ...conv, mode: data.mode } : conv
      );
      setConversations(updatedConversations);

      // If this is the active conversation, hydrate local mode
      if (activeConversationId === data.conversationId) {
        setModeFromConversation(data.mode);
      }
    },
    [conversations, setConversations, activeConversationId, setModeFromConversation]
  );

  // Handler 12: Export ready (questionnaire extracted)
  const handleExportReady = useCallback(
    (data: ExportReadyPayload) => {
      // Ignore if for different conversation
      if (data.conversationId !== activeConversationId) {
        console.warn('[useWebSocketEvents] Ignoring export_ready for inactive conversation');
        return;
      }

      console.log('[useWebSocketEvents] Export ready:', data);

      // Cache the export ready payload for this conversation
      setExportReady(data.conversationId, data);

      // Story 4.3.5: Transition questionnaire UI to 'download' state
      // NOTE: Legacy injection removed - QuestionnairePromptCard handles download UI
      useChatStore.getState().setQuestionnaireUIState('download');
      useChatStore.getState().setGenerating(false);
    },
    [activeConversationId, setExportReady]
  );

  // Handler 13: Extraction failed (questionnaire extraction error)
  const handleExtractionFailed = useCallback(
    (data: ExtractionFailedPayload) => {
      // Ignore if for different conversation
      if (data.conversationId !== activeConversationId) {
        console.warn('[useWebSocketEvents] Ignoring extraction_failed for inactive conversation');
        return;
      }

      console.log('[useWebSocketEvents] Extraction failed:', data);

      // Clear any previous export state for this conversation (in case of retry)
      clearExportReady(data.conversationId);

      // Story 4.3.5: Transition questionnaire UI to 'error' state
      // NOTE: Legacy injection removed - QuestionnairePromptCard handles error UI
      useChatStore.getState().setQuestionnaireUIState('error');
      useChatStore.getState().setQuestionnaireError(data.error);
      useChatStore.getState().setGenerating(false);
    },
    [activeConversationId, clearExportReady]
  );

  // Handler 14: Questionnaire ready (Claude indicates readiness to generate)
  const handleQuestionnaireReady = useCallback(
    (data: QuestionnaireReadyPayload) => {
      // Guard: Skip if generation already in progress (prevents replay issues)
      if (useChatStore.getState().isGeneratingQuestionnaire) {
        console.log('[useWebSocketEvents] Ignoring questionnaire_ready - generation in progress');
        return;
      }

      // Only process if for the active conversation
      if (data.conversationId !== activeConversationId) {
        console.warn(
          `[useWebSocketEvents] Ignoring questionnaire_ready for inactive conversation. ` +
          `Event belongs to: ${data.conversationId}, active conversation: ${activeConversationId}`
        );
        return;
      }

      console.log('[useWebSocketEvents] Questionnaire ready:', {
        conversationId: data.conversationId,
        assessmentType: data.assessmentType,
      });

      // Save questionnaire payload to localStorage for rehydration
      if (persistence) {
        persistence.savePayload(data.conversationId, data);
      }

      // Update store with pending questionnaire and set to 'ready' state
      useChatStore.getState().setPendingQuestionnaire(data);
      useChatStore.getState().setQuestionnaireUIState('ready');
      useChatStore.getState().setQuestionnaireError(null); // Clear any previous error
    },
    [activeConversationId, persistence]
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
    handleConversationModeUpdated,
    handleExportReady,
    handleExtractionFailed,
    handleQuestionnaireReady,
  };
}
