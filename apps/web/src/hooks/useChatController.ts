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
import { ChatMessage as ChatMessageType } from '@/lib/websocket';

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:8000';

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
  handleSendMessage: (content: string) => void;
  handleModeChange: (newMode: ConversationMode) => Promise<void>;
  handleRegenerate: (messageIndex: number) => void;
  abortStream: () => void;
  setError: (error: string | null) => void;
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
  } = useChatStore();
  const { mode, changeMode, isChanging, setModeFromConversation } = useConversationMode('consult');
  const { token } = useAuth();
  const composerRef = useRef<ComposerRef>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

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
  } = useWebSocketEvents({
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
    setModeFromConversation,
    setRegeneratingMessageIndex,
    focusComposer,
  });

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

  const handleSendMessage = useCallback(
    (content: string) => {
      // Delegate to chat service
      chatService.sendMessage(content, activeConversationId);
    },
    [chatService, activeConversationId]
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
  };
}
