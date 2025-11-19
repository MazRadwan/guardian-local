'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageList } from './MessageList';
import { Composer, ComposerRef } from './Composer';
import { ConversationMode } from './ModeSelector';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useConversationMode } from '@/hooks/useConversationMode';
import { useAuth } from '@/hooks/useAuth';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { ChatMessage as ChatMessageType } from '@/lib/websocket';
import { AlertCircle } from 'lucide-react';

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:8000';

export function ChatInterface() {
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
  const { mode, changeMode, isChanging } = useConversationMode('consult');
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [savedConversationId, setSavedConversationId] = useState<string | undefined | null>(null);
  const composerRef = useRef<ComposerRef>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const isCreatingNewConversation = useRef(false);
  const justCreatedConversationId = useRef<string | null>(null);
  const lastCreationTime = useRef<number>(0);
  const hasInitialized = useRef(false);
  const explicitNewChatRequest = useRef(false);
  const historyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Load saved conversationId from localStorage on mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('guardian_conversation_id');
      setSavedConversationId(saved || undefined); // undefined if no saved conversation
    }
  }, []);

  // Sync activeConversationId from URL on mount
  useEffect(() => {
    const urlConversationId = searchParams.get('conversation');
    if (urlConversationId && !activeConversationId) {
      setActiveConversation(urlConversationId);
    }
  }, [searchParams, activeConversationId, setActiveConversation]);

  const handleMessage = useCallback(
    (message: ChatMessageType) => {
      // Add message to store (critical - this was missing!)
      addMessage(message);
      finishStreaming();
      setLoading(false); // Hide typing indicator

      // Auto-focus input after assistant response completes
      focusComposer();
    },
    [addMessage, finishStreaming, setLoading, focusComposer]
  );

  const handleMessageStream = useCallback(
    (chunk: string, conversationId: string) => {
      // CRITICAL: Ignore chunks for inactive conversations (Story 9.0c)
      // This prevents streaming responses from bleeding across conversation switches
      if (conversationId !== activeConversationId) {
        console.warn(
          `[ChatInterface] Ignoring streaming chunk for inactive conversation. ` +
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

  const handleError = useCallback(
    (errorMessage: string) => {
      setError(errorMessage);
      finishStreaming();
      setLoading(false); // Hide typing indicator on error
      setRegeneratingMessageIndex(null); // Reset regenerating state
    },
    [setError, finishStreaming, setLoading]
  );

  const [shouldLoadHistory, setShouldLoadHistory] = useState(false);

  const handleHistory = useCallback(
    (loadedMessages: ChatMessageType[]) => {
      console.log('[ChatInterface] handleHistory called with:', loadedMessages.length, 'messages');
      console.log('[ChatInterface] Messages:', loadedMessages);

      // CRITICAL FIX: Clear history timeout to prevent error showing after successful load
      if (historyTimeoutRef.current) {
        console.log('[ChatInterface] Clearing history timeout');
        clearTimeout(historyTimeoutRef.current);
        historyTimeoutRef.current = null;
      }

      setMessages(loadedMessages);
      console.log('[ChatInterface] setMessages called');
      setLoading(false); // Hide skeleton loaders
      setShouldLoadHistory(false);

      // Scroll to bottom after history loads
      setTimeout(() => {
        if (messageListRef.current) {
          messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
        }
      }, 50);
    },
    [setMessages, setLoading]
  );

  const handleStreamComplete = useCallback(() => {
    // Stream is complete, finish streaming and auto-focus input
    finishStreaming();
    setLoading(false);
    setRegeneratingMessageIndex(null); // Reset regenerating state
    focusComposer();
  }, [finishStreaming, setLoading, focusComposer]);

  const handleConversationsList = useCallback(
    (conversations: any[]) => {
      console.log('[ChatInterface] handleConversationsList called with:', conversations.length, 'conversations');
      console.log('[ChatInterface] Conversations data:', conversations);
      setConversations(conversations);
      console.log('[ChatInterface] setConversations called - chatStore should be updated');
    },
    [setConversations]
  );

  const handleConversationCreated = useCallback(
    (conversation: any) => {
      console.log('[ChatInterface] New conversation created:', conversation.id);
      addConversation(conversation);

      // Mark this conversation as just created (to prevent loading history for it)
      justCreatedConversationId.current = conversation.id;

      // Set as active AND update localStorage
      setActiveConversation(conversation.id);

      if (typeof window !== 'undefined') {
        localStorage.setItem('guardian_conversation_id', conversation.id);
      }

      // Update URL immediately (don't let the effect do it)
      router.replace(`/chat?conversation=${conversation.id}`, { scroll: false });

      // Reset guard flag now that conversation is created
      isCreatingNewConversation.current = false;

      // Clear the flag after a short delay (to allow effect to skip history loading)
      setTimeout(() => {
        justCreatedConversationId.current = null;
      }, 100);
    },
    [addConversation, setActiveConversation, router]
  );

  const handleConversationTitleUpdated = useCallback(
    (conversationId: string, title: string) => {
      console.log('[ChatInterface] Conversation title updated:', conversationId, title);
      updateConversationTitle(conversationId, title);
    },
    [updateConversationTitle]
  );

  const handleStreamAborted = useCallback(
    (conversationId: string) => {
      console.log('[ChatInterface] Stream aborted for conversation:', conversationId);
      // Finish streaming and re-enable composer
      finishStreaming();
      setLoading(false);
      setRegeneratingMessageIndex(null); // Reset regenerating state
      // Auto-focus composer after abort
      focusComposer();
    },
    [finishStreaming, setLoading, focusComposer]
  );

  const handleConversationDeleted = useCallback(
    (conversationId: string) => {
      console.log('[ChatInterface] Conversation deleted:', conversationId);
      // Remove from local store
      removeConversationFromList(conversationId);
      // Clear the request flag
      clearDeleteConversationRequest();

      // CRITICAL FIX: Clear localStorage if deleted conversation was the saved one
      if (typeof window !== 'undefined') {
        const savedId = localStorage.getItem('guardian_conversation_id');
        if (savedId === conversationId) {
          console.log('[ChatInterface] Clearing localStorage for deleted conversation');
          localStorage.removeItem('guardian_conversation_id');
          setSavedConversationId(undefined);
        }
      }

      // CRITICAL FIX: Also clear Zustand persisted activeConversationId if it matches
      if (activeConversationId === conversationId) {
        console.log('[ChatInterface] Clearing active conversation ID for deleted conversation');
        setActiveConversation(null);
      }

      // CRITICAL FIX: If no conversations left after deletion, auto-create new one
      // conversations.length will be the count before removal, so check if it will be 0
      const remainingCount = conversations.filter(c => c.id !== conversationId).length;
      if (remainingCount === 0) {
        console.log('[ChatInterface] Last conversation deleted - auto-creating new chat');
        requestNewChat();
      }
    },
    [removeConversationFromList, clearDeleteConversationRequest, activeConversationId, setActiveConversation, conversations, requestNewChat]
  );

  const handleConnectionReady = useCallback(
    (data: { conversationId?: string; resumed: boolean; hasActiveConversation: boolean }) => {
      console.log('[ChatInterface] Connection ready:', data);

      if (data.hasActiveConversation && data.conversationId) {
        // SCENARIO 1: Backend successfully resumed existing conversation
        console.log('[ChatInterface] Resuming conversation:', data.conversationId);

        // Set flag to load history for this conversation
        setShouldLoadHistory(true);

        // Sync all conversation state
        setSavedConversationId(data.conversationId);
        setActiveConversation(data.conversationId);

        // Save to localStorage for session persistence
        if (typeof window !== 'undefined') {
          localStorage.setItem('guardian_conversation_id', data.conversationId);
        }
      } else {
        // SCENARIO 2: No active conversation (deleted/missing) - auto-create new chat
        // Use sessionStorage guard to survive React Strict Mode double-mount
        const hasAutoCreated = sessionStorage.getItem('guardian_auto_created_chat');

        if (!hasAutoCreated && !newChatRequested) {
          console.log('[ChatInterface] No active conversation - auto-creating new chat');
          sessionStorage.setItem('guardian_auto_created_chat', 'true');
          requestNewChat();
        }
      }

      // CRITICAL: Always clear loading state to prevent skeleton hang
      setLoading(false);
    },
    [requestNewChat, newChatRequested, setShouldLoadHistory, setSavedConversationId, setActiveConversation, setLoading]
  );

  const { isConnected, isConnecting, sendMessage, requestHistory, fetchConversations, startNewConversation, abortStream, deleteConversation: wsDeleteConversation } = useWebSocket({
    url: WEBSOCKET_URL,
    token: token || undefined,
    conversationId: savedConversationId || undefined, // Pass saved conversationId to resume
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
    autoConnect: Boolean(token), // Connect whenever user is authenticated
  });

  // Fetch conversations list on connect
  useEffect(() => {
    console.log('[ChatInterface] Fetch conversations effect triggered - isConnected:', isConnected, 'fetchConversations:', !!fetchConversations);
    if (isConnected && fetchConversations) {
      console.log('[ChatInterface] Calling fetchConversations NOW');
      // Mark that we're fetching conversations
      hasInitialized.current = false;
      // Small delay to ensure WebSocket is fully ready
      setTimeout(() => {
        fetchConversations();
      }, 100);
    }
  }, [isConnected, fetchConversations]);

  // Request history after connection when needed
  useEffect(() => {
    if (shouldLoadHistory && isConnected && savedConversationId && requestHistory) {
      console.log('[ChatInterface] Requesting history for conversation:', savedConversationId);
      requestHistory(savedConversationId);

      // CRITICAL FIX: Store timeout in ref so handleHistory can clear it
      historyTimeoutRef.current = setTimeout(() => {
        if (isLoading && messages.length === 0) {
          console.warn('[ChatInterface] History request timeout - clearing loading state');
          setLoading(false);
          setError('Failed to load conversation. Please try again.');
          historyTimeoutRef.current = null;
        }
      }, 5000); // 5 second timeout

      // CRITICAL: Clean up timeout on unmount or when dependencies change
      return () => {
        console.log('[ChatInterface] Cleaning up history timeout');
        if (historyTimeoutRef.current) {
          clearTimeout(historyTimeoutRef.current);
          historyTimeoutRef.current = null;
        }
      };
    }
  }, [shouldLoadHistory, isConnected, savedConversationId, requestHistory, isLoading, messages.length, setLoading, setError]);

  // Handle conversation switching (load history when switching between existing conversations)
  useEffect(() => {
    console.log('[ChatInterface] Conversation switching effect - activeConversationId:', activeConversationId, 'isConnected:', isConnected);

    // Only handle switching to EXISTING conversations (not null)
    if (activeConversationId && isConnected && requestHistory) {
      // Skip history loading if this is a newly created conversation
      if (justCreatedConversationId.current === activeConversationId) {
        console.log('[ChatInterface] Skipping history load for newly created conversation:', activeConversationId);
        // Just update localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('guardian_conversation_id', activeConversationId);
        }
        return;
      }

      console.log('[ChatInterface] Switching to conversation:', activeConversationId);

      // Only update URL if it's different from current URL (prevent navigation loop)
      const currentConversationId = searchParams.get('conversation');
      if (currentConversationId !== activeConversationId) {
        console.log('[ChatInterface] Updating URL to conversation:', activeConversationId);
        router.replace(`/chat?conversation=${activeConversationId}`, { scroll: false });
      }

      // Clear current messages
      clearMessages();
      console.log('[ChatInterface] Messages cleared');

      // Show loading state
      setLoading(true);

      // Request history for the selected conversation
      try {
        console.log('[ChatInterface] Requesting history for conversation:', activeConversationId);
        requestHistory(activeConversationId);
      } catch (err) {
        console.error('Failed to load conversation history:', err);
        setError('Failed to load conversation');
        setLoading(false);
      }

      // Update localStorage for session persistence
      if (typeof window !== 'undefined') {
        localStorage.setItem('guardian_conversation_id', activeConversationId);
      }
    }
    // REMOVED: Auto-create logic when activeConversationId === null
    // New conversations are now created ONLY via explicit user action (New Chat button)
  }, [activeConversationId, isConnected, requestHistory, clearMessages, setLoading, setError, router, searchParams]);

  // Handle explicit new chat requests (from "New Chat" button)
  useEffect(() => {
    if (newChatRequested && isConnected && startNewConversation && !isCreatingNewConversation.current) {
      console.log('[ChatInterface] Processing new chat request');

      // Guard: Prevent creating multiple conversations if already creating one
      isCreatingNewConversation.current = true;

      // Abort any active streaming first
      if (isStreaming) {
        console.log('[ChatInterface] Aborting active stream for new chat');
        finishStreaming();
        if (abortStream) {
          abortStream();
        }
      }

      // Clear messages and localStorage
      clearMessages();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('guardian_conversation_id');
      }

      // Request backend to create new conversation
      try {
        console.log('[ChatInterface] Requesting new conversation from backend');
        startNewConversation(mode);
        // Flag will be reset when conversation_created event sets activeConversationId
      } catch (err) {
        console.error('Failed to start new conversation:', err);
        setError('Failed to start new conversation');
        isCreatingNewConversation.current = false; // Reset on error
      }

      // Clear the request flag
      clearNewChatRequest();

      // Focus composer for new chat
      setTimeout(() => {
        focusComposer();
      }, 100);
    }
  }, [newChatRequested, isConnected, startNewConversation, isStreaming, finishStreaming, abortStream, clearMessages, setError, mode, clearNewChatRequest, focusComposer]);

  // Handle explicit conversation delete requests (from delete button)
  useEffect(() => {
    if (deleteConversationRequested && isConnected && wsDeleteConversation) {
      console.log('[ChatInterface] Processing delete conversation request:', deleteConversationRequested);

      try {
        // Call WebSocket to delete from backend
        wsDeleteConversation(deleteConversationRequested);

        // Note: actual removal from store happens in handleConversationDeleted callback
        // which is triggered when backend confirms deletion via conversation_deleted event
      } catch (error) {
        console.error('[ChatInterface] Error deleting conversation:', error);
        setError('Failed to delete conversation');
        clearDeleteConversationRequest();
      }
    }
  }, [deleteConversationRequested, isConnected, wsDeleteConversation, setError, clearDeleteConversationRequest]);

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!isConnected) {
        setError('Not connected to server');
        return;
      }

      if (!activeConversationId) {
        setError('No active conversation');
        return;
      }

      // Add user message to UI immediately
      addMessage({
        role: 'user',
        content,
        timestamp: new Date(),
      });

      // Set loading state (show typing indicator)
      setLoading(true);

      // Send to server with conversationId
      try {
        sendMessage(content, activeConversationId);
      } catch (err) {
        setError('Failed to send message');
        setLoading(false);
        console.error('Send message error:', err);
      }
    },
    [isConnected, activeConversationId, sendMessage, addMessage, setLoading, setError]
  );

  const handleModeChange = useCallback(
    async (newMode: ConversationMode) => {
      try {
        await changeMode(newMode);
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
    [changeMode, addMessage, setError]
  );

  const handleRegenerate = useCallback(
    (messageIndex: number) => {
      if (!isConnected || !activeConversationId) {
        setError('Not connected to server');
        return;
      }

      // Validate messageIndex
      if (messageIndex < 0 || messageIndex >= messages.length) {
        setError('Invalid message index');
        return;
      }

      // Find previous user message
      const previousMessage = messages[messageIndex - 1];
      if (!previousMessage || previousMessage.role !== 'user') {
        setError('Cannot regenerate: previous user message not found');
        return;
      }

      // Mark as regenerating
      setRegeneratingMessageIndex(messageIndex);

      // Remove old assistant message
      const updatedMessages = messages.filter((_, idx) => idx !== messageIndex);
      setMessages(updatedMessages);

      // Resend the previous user message (use sendMessage directly, NOT handleSendMessage)
      // User message already exists in UI at messageIndex-1, don't add it again
      setLoading(true);
      try {
        sendMessage(previousMessage.content, activeConversationId);
      } catch (err) {
        setError('Failed to regenerate response');
        setLoading(false);
        setRegeneratingMessageIndex(null);
        console.error('Regenerate error:', err);
      }
    },
    [isConnected, activeConversationId, messages, setError, setMessages, sendMessage, setLoading]
  );

  return (
    <div className="flex h-full flex-col relative">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 px-6 py-3 text-sm text-red-800 shrink-0">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-800">
            Dismiss
          </button>
        </div>
      )}

      {/* Conditional Layout: Centered vs Active State */}
      {messages.length === 0 && !showDelayedLoading ? (
        // Empty state: Centered composer (only when truly empty, not loading)
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center px-4">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Welcome to Guardian</h1>
            <p className="text-gray-600">Start a conversation to assess AI vendors or get guidance.</p>
          </div>
          <div className="w-full max-w-3xl">
            <Composer
              ref={composerRef}
              onSendMessage={handleSendMessage}
              disabled={!isConnected || isLoading || isStreaming}
              currentMode={mode}
              onModeChange={handleModeChange}
              modeChangeDisabled={isChanging || !isConnected}
              isStreaming={isStreaming}
              isLoading={isLoading}
              onStopStream={abortStream}
            />
          </div>
        </div>
      ) : (
        // Active state: Messages + composer at bottom (includes loading state)
        <>
          <div className="flex-1 min-h-0 overflow-hidden">
            <MessageList
              ref={messageListRef}
              messages={messages}
              isLoading={showDelayedLoading}
              isStreaming={isStreaming}
              onRegenerate={handleRegenerate}
              regeneratingMessageIndex={regeneratingMessageIndex}
            />
          </div>
          <div className="flex-shrink-0 bg-white z-10">
             <div className="max-w-3xl mx-auto w-full">
              <Composer
                ref={composerRef}
                onSendMessage={handleSendMessage}
                disabled={!isConnected || isLoading || isStreaming}
                currentMode={mode}
                onModeChange={handleModeChange}
                modeChangeDisabled={isChanging || !isConnected}
                isStreaming={isStreaming}
              isLoading={isLoading}
                onStopStream={abortStream}
              />
            </div>
             <div className="text-center text-xs text-gray-400 py-2 pb-4">
               Guardian can make mistakes. Review generated assessments.
             </div>
          </div>
        </>
      )}
    </div>
  );
}
