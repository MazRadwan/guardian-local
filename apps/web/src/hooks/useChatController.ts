'use client';

import { useCallback, useEffect, useState, useRef, useMemo, useLayoutEffect } from 'react';
import { ComposerRef } from '@/components/chat/Composer';
import { ConversationMode } from '@/components/chat/ModeSelector';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocketAdapter, WebSocketAdapterInterface } from '@/hooks/useWebSocketAdapter';
import { ChatService } from '@/services/ChatService';
import { ConversationService } from '@/services/ConversationService';
import { useConversationMode } from '@/hooks/useConversationMode';
import { useAuth } from '@/hooks/useAuth';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { useHistoryManager } from '@/hooks/useHistoryManager';
import { useConversationSync } from '@/hooks/useConversationSync';
import { useWebSocketEvents } from '@/hooks/useWebSocketEvents';
import { useQuestionnairePersistence } from '@/hooks/useQuestionnairePersistence';
import { ChatMessage as ChatMessageType, ExportStatusNotFoundPayload, ExportStatusErrorPayload, MessageAttachment } from '@/lib/websocket';

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:8000';

// Story 13.9.2: Track pending export status requests to avoid duplicates
const pendingExportStatusRequests = new Set<string>();

export interface UseChatControllerReturn {
  // State
  messages: ChatMessageType[];
  isLoading: boolean;
  error: string | null;
  isStreaming: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  mode: ConversationMode;
  isChanging: boolean;
  showDelayedLoading: boolean;
  regeneratingMessageIndex: number | null;
  activeConversationId: string | null;

  // Refs (exposed for external access)
  composerRef: React.RefObject<ComposerRef | null>;
  messageListRef: React.RefObject<HTMLDivElement | null>;

  // Handlers
  /** Epic 16.6.8: Send message with optional attachments */
  handleSendMessage: (content: string, attachments?: MessageAttachment[]) => void;
  handleModeChange: (newMode: ConversationMode) => Promise<void>;
  handleRegenerate: (messageIndex: number) => void;
  abortStream: () => void;
  setError: (error: string | null) => void;

  // Adapter (for direct WebSocket operations)
  adapter: WebSocketAdapterInterface;
}

export function useChatController(): UseChatControllerReturn {
  const {
    messages,
    isLoading,
    error,
    addMessage,
    setMessages,
    startStreaming,
    appendToLastMessage,
    appendComponentToLastAssistantMessage,
    finishStreaming,
    setLoading,
    setError,
    clearMessages,
    activeConversationId,
    setActiveConversation,
    setConversations,
    addConversation,
    updateConversationTitle,
    isStreaming,
    conversations,
    newChatRequested,
    clearNewChatRequest,
    requestNewChat,
    deleteConversationRequested,
    clearDeleteConversationRequest,
    removeConversationFromList,
    setExportReady,
    clearExportReady,
    getExportReady,
  } = useChatStore();
  const { mode, changeMode, isChanging, setModeFromConversation } = useConversationMode('consult');
  const { token, user } = useAuth();
  const composerRef = useRef<ComposerRef>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // Pending message ref - stores message to send after auto-creating conversation
  const pendingMessageRef = useRef<{ content: string; attachments?: MessageAttachment[] } | null>(null);

  // Questionnaire persistence (Story 4.3.5)
  const persistence = useQuestionnairePersistence(user?.id);

  // Delay showing skeleton to prevent flash on quick loads (300ms threshold)
  const showDelayedLoading = useDelayedLoading(isLoading, 300);

  // Track which message is being regenerated
  const [regeneratingMessageIndex, setRegeneratingMessageIndex] = useState<number | null>(null);

  // Centralized focus helper - uses requestAnimationFrame to ensure focus after React re-renders
  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  }, []);

  // Conversation sync (URL, localStorage, guard flags)
  const {
    savedConversationId,
    isJustCreatedConversation,
    markConversationAsJustCreated,
    handleConversationChange,
  } = useConversationSync({
    activeConversationId,
    setActiveConversation,
  });

  // WebSocket connection state (will be set by effect after useWebSocket call)
  const [wsIsConnected, setWsIsConnected] = useState(false);

  // Ref to break circular dependency between useHistoryManager and adapter
  const adapterRef = useRef<WebSocketAdapterInterface | null>(null);

  // Proxy for requestHistory to pass to useHistoryManager before adapter is defined
  const requestHistoryProxy = useCallback((conversationId: string) => {
    // Use the ref directly to avoid dependency loops
    if (adapterRef.current) {
      adapterRef.current.requestHistory(conversationId);
    } else {
      console.warn('[useChatController] Adapter not ready for history request');
    }
  }, []);

  // History manager - handles history loading, timeout, and scroll restoration
  const {
    shouldLoadHistory,
    setShouldLoadHistory,
    handleHistory,
  } = useHistoryManager({
    conversationId: savedConversationId,
    isConnected: wsIsConnected,
    requestHistory: requestHistoryProxy,
    messageListRef,
    setMessages,
    setLoading,
    setError,
    messages,
    isLoading,
    getExportReady,
    appendComponentToLastAssistantMessage,
  });

  // WebSocket events - all event handlers with stable references
  const {
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
    handleGenerationPhase,
    handleScoringStarted,
    handleScoringProgress,
    handleScoringComplete,
    handleScoringError,
    handleVendorClarificationNeeded,
  } = useWebSocketEvents({
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
    userId: user?.id,
    persistence,
  });

  // Story 13.9.2: Handler for export_status_not_found
  const handleExportStatusNotFound = useCallback((data: ExportStatusNotFoundPayload) => {
    pendingExportStatusRequests.delete(data.conversationId);
    console.log('[useChatController] No export found for conversation, user can generate:', data.conversationId);
    // UI remains in ready state - no action needed
  }, []);

  // Story 13.9.2: Handler for export_status_error
  const handleExportStatusError = useCallback((data: ExportStatusErrorPayload) => {
    pendingExportStatusRequests.delete(data.conversationId);
    // "Conversation not found" is expected when user deletes a conversation
    // while an export status request is in flight - don't log as error
    if (data.error === 'Conversation not found') {
      console.log('[useChatController] Export status: conversation was deleted');
    } else {
      console.error('[useChatController] Export status error:', data.error);
    }
    // Don't disrupt UX - user can still generate if needed
  }, []);

  // Memoize handlers to prevent adapter recreation on every render
  const handlers = useMemo(() => ({
    onMessage: handleMessage,
    onMessageStream: handleMessageStream,
    onError: handleError,
    onConnectionReady: handleConnectionReady,
    onHistory: handleHistory,
    onStreamComplete: handleStreamComplete,
    onConversationsList: handleConversationsList,
    onConversationCreated: handleConversationCreated,
    onConversationTitleUpdated: handleConversationTitleUpdated,
    onStreamAborted: handleStreamAborted,
    onConversationDeleted: handleConversationDeleted,
    onConversationModeUpdated: handleConversationModeUpdated,
    onExportReady: handleExportReady,
    onExtractionFailed: handleExtractionFailed,
    onQuestionnaireReady: handleQuestionnaireReady,
    onGenerationPhase: handleGenerationPhase,
    onExportStatusNotFound: handleExportStatusNotFound,
    onExportStatusError: handleExportStatusError,
    onScoringStarted: handleScoringStarted,
    onScoringProgress: handleScoringProgress,
    onScoringComplete: handleScoringComplete,
    onScoringError: handleScoringError,
    onVendorClarificationNeeded: handleVendorClarificationNeeded,
  }), [
    handleMessage,
    handleMessageStream,
    handleError,
    handleConnectionReady,
    handleHistory,
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
    handleGenerationPhase,
    handleExportStatusNotFound,
    handleExportStatusError,
    handleScoringStarted,
    handleScoringProgress,
    handleScoringComplete,
    handleScoringError,
    handleVendorClarificationNeeded,
  ]);

  // WebSocket adapter - provides clean interface over raw socket
  const adapter = useWebSocketAdapter({
    url: WEBSOCKET_URL,
    token: token || undefined,
    conversationId: savedConversationId || undefined, // Pass saved conversationId to resume
    handlers,
    autoConnect: Boolean(token), // Connect whenever user is authenticated
  });

  // Update adapter ref whenever adapter changes (useLayoutEffect ensures it's available for effects)
  useLayoutEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  // Destructure connection state for backward compatibility
  const { isConnected, isConnecting } = adapter;

  // ChatService and ConversationService are clean business logic containers
  // They depend on the Adapter Interface, not the implementation (Clean Architecture)
  
  // Chat service - business logic for messaging operations
  const chatService = useMemo(() => new ChatService(
    adapter,
    {
      addMessage,
      setMessages,
      setLoading,
      setError,
      startStreaming,
      appendToLastMessage,
    }
  ), [adapter]);

  // Conversation service - business logic for conversation lifecycle
  const conversationService = useMemo(() => new ConversationService(
    adapter,
    {
      clearMessages,
      finishStreaming,
      setError,
      setLoading,
    }
  ), [adapter]);

  // Sync WebSocket state to history manager
  useEffect(() => {
    setWsIsConnected(isConnected);
  }, [isConnected]);

  // Hydrate mode from active conversation whenever selection or list updates
  useEffect(() => {
    if (!activeConversationId) {
      // No active conversation selected; default to consult locally
      setModeFromConversation('consult');
      return;
    }

    const activeConv = conversations.find((conv) => conv.id === activeConversationId);
    if (activeConv && activeConv.mode) {
      setModeFromConversation(activeConv.mode);
    }
  }, [activeConversationId, conversations, setModeFromConversation]);

  // Fetch conversations list on connect
  useEffect(() => {
    console.log('[ChatInterface] Fetch conversations effect triggered - isConnected:', isConnected);
    if (isConnected) {
      console.log('[ChatInterface] Calling fetchConversations NOW');
      // Mark that we're fetching conversations
      hasInitialized.current = false;
      // Delegate to conversation service
      conversationService.fetchConversations();
    }
  }, [isConnected, conversationService]);

  // Handle conversation switching (load history when switching between existing conversations)
  // Note: Dependencies intentionally limited to avoid infinite loops.
  // - Zustand actions (clearMessages, setLoading, setError) are stable and do not need to be deps.
  // - isJustCreatedConversation is a stable ref-based check; including it as a dep would
  //   recreate the effect every render and can cause repeated clearMessages() calls.
  useEffect(() => {
    console.log('[ChatInterface] Conversation switching effect - activeConversationId:', activeConversationId, 'isConnected:', isConnected);

    // Only handle switching to EXISTING conversations (not null)
    if (activeConversationId && isConnected) {
      // Skip history loading if this is a newly created conversation
      if (isJustCreatedConversation(activeConversationId)) {
        console.log('[ChatInterface] Skipping history load for newly created conversation:', activeConversationId);
        // URL + localStorage updates handled by useConversationSync
        return;
      }

      console.log('[ChatInterface] Switching to conversation:', activeConversationId);

      // Clear current messages
      clearMessages();
      console.log('[ChatInterface] Messages cleared');

      // Show loading state
      setLoading(true);

      // Request history for the selected conversation
      try {
        console.log('[ChatInterface] Requesting history for conversation:', activeConversationId);
        // Use adapterRef to avoid dependency loop
        adapterRef.current?.requestHistory(activeConversationId);
      } catch (err) {
        console.error('Failed to load conversation history:', err);
        setError('Failed to load conversation');
        setLoading(false);
      }

      // URL + localStorage updates handled by useConversationSync
    }
    // REMOVED: Auto-create logic when activeConversationId === null
    // New conversations are now created ONLY via explicit user action (New Chat button)
  }, [activeConversationId, isConnected]);

  // Story 13.9.2: Request export status on conversation resume
  // This restores download buttons when user returns to a conversation that has already generated a questionnaire
  useEffect(() => {
    if (!isConnected || !activeConversationId) return;

    // Check if we already have export data in memory
    const existingExport = getExportReady(activeConversationId);
    if (existingExport) {
      console.log('[useChatController] Export data cached in memory, skipping server request');
      return;
    }

    // Story 13.3.2: Rehydrate export from localStorage using shared key pattern
    const storedExport = persistence.loadExport
      ? persistence.loadExport(activeConversationId)
      : null;

    if (storedExport) {
      console.log('[useChatController] Export data found in localStorage, restoring');
      setExportReady(activeConversationId, storedExport);
      useChatStore.getState().setQuestionnaireUIState('download');
      return;
    }

    // Avoid duplicate requests for same conversation
    if (pendingExportStatusRequests.has(activeConversationId)) {
      console.log('[useChatController] Export status request already pending for:', activeConversationId);
      return;
    }

    // Request from server (server controls spam via 404)
    console.log('[useChatController] Requesting export status from server for:', activeConversationId);
    pendingExportStatusRequests.add(activeConversationId);
    adapter.requestExportStatus(activeConversationId);

  }, [isConnected, activeConversationId, getExportReady, setExportReady, adapter, persistence]);

  // Handle explicit new chat requests (from "New Chat" button)
  useEffect(() => {
    if (newChatRequested && isConnected) {
      console.log('[ChatInterface] Processing new chat request');

      // Abort any active streaming first
      if (isStreaming) {
        console.log('[ChatInterface] Aborting active stream for new chat');
        finishStreaming();
        chatService.abortStream();
      }

      // Delegate to conversation service
      try {
        conversationService.createConversation(mode);
        // Flag will be reset when conversation_created event sets activeConversationId
      } catch (err) {
        console.error('Failed to start new conversation:', err);
      }

      // Clear the request flag
      clearNewChatRequest();

      // Focus composer for new chat
      setTimeout(() => {
        focusComposer();
      }, 100);
    }
  }, [newChatRequested, isConnected, isStreaming, finishStreaming, chatService, conversationService, mode, clearNewChatRequest, focusComposer]);

  // Handle explicit conversation delete requests (from delete button)
  useEffect(() => {
    if (deleteConversationRequested && isConnected) {
      console.log('[ChatInterface] Processing delete conversation request:', deleteConversationRequested);

      // Clean up any pending export status request for this conversation
      // (prevents "Conversation not found" error when server responds after deletion)
      pendingExportStatusRequests.delete(deleteConversationRequested);

      try {
        // Delegate to conversation service
        conversationService.deleteConversation(deleteConversationRequested);

        // Note: actual removal from store happens in handleConversationDeleted callback
        // which is triggered when backend confirms deletion via conversation_deleted event
      } catch (error) {
        console.error('[ChatInterface] Error deleting conversation:', error);
        clearDeleteConversationRequest();
      }
    }
  }, [deleteConversationRequested, isConnected, conversationService, clearDeleteConversationRequest]);

  // Send pending message after conversation is auto-created
  useEffect(() => {
    if (activeConversationId && pendingMessageRef.current && isConnected) {
      console.log('[useChatController] Sending pending message to new conversation:', activeConversationId);
      const { content, attachments } = pendingMessageRef.current;
      pendingMessageRef.current = null;

      // Small delay to ensure conversation is fully set up
      setTimeout(() => {
        chatService.sendMessage(content, activeConversationId, attachments);
      }, 100);
    }
  }, [activeConversationId, isConnected, chatService]);

  const handleSendMessage = useCallback(
    (content: string, attachments?: MessageAttachment[]) => {
      // If no active conversation, auto-create one and queue the message
      if (!activeConversationId && isConnected) {
        console.log('[useChatController] No active conversation, auto-creating and queuing message');
        pendingMessageRef.current = { content, attachments };
        conversationService.createConversation(mode);
        return;
      }

      // Epic 16.6.8: Delegate to chat service with optional attachments
      chatService.sendMessage(content, activeConversationId, attachments);
    },
    [chatService, activeConversationId, isConnected, conversationService, mode]
  );

  const handleModeChange = useCallback(
    async (newMode: ConversationMode) => {
      try {
        if (!activeConversationId) {
          setError('No active conversation');
          return;
        }

        // Notify backend of mode change
        conversationService.updateMode(activeConversationId, newMode);

        // Update local mode state
        await changeMode(newMode);

        // Update conversation list to reflect new mode
        const updatedConversations = conversations.map((conv) =>
          conv.id === activeConversationId ? { ...conv, mode: newMode } : conv
        );
        setConversations(updatedConversations);

        // Optionally add a system message about mode change
        addMessage({
          role: 'system',
          content: `Switched to ${newMode} mode`,
          timestamp: new Date(),
        });
      } catch (err) {
        setError('Failed to change mode');
      }
    },
    [activeConversationId, conversationService, changeMode, addMessage, setError, conversations, setConversations]
  );

  const handleRegenerate = useCallback(
    (messageIndex: number) => {
      // Delegate to chat service
      chatService.regenerateMessage(
        messageIndex,
        activeConversationId,
        messages,
        setRegeneratingMessageIndex
      );
    },
    [chatService, activeConversationId, messages, setRegeneratingMessageIndex]
  );

  // Create abortStream wrapper that delegates to chatService
  const abortStream = useCallback(() => {
    chatService.abortStream();
  }, [chatService]);

  return {
    // State
    messages,
    isLoading,
    error,
    isStreaming,
    isConnected,
    isConnecting,
    mode,
    isChanging,
    showDelayedLoading,
    regeneratingMessageIndex,
    activeConversationId,

    // Refs
    composerRef,
    messageListRef,

    // Handlers
    handleSendMessage,
    handleModeChange,
    handleRegenerate,
    abortStream,
    setError,

    // Adapter (for direct WebSocket operations)
    adapter,
  };
}
