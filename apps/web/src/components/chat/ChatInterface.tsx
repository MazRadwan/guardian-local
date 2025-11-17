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
  } = useChatStore();
  const { mode, changeMode, isChanging } = useConversationMode('consult');
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [savedConversationId, setSavedConversationId] = useState<string | undefined | null>(null);
  const composerRef = useRef<ComposerRef>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const isCreatingNewConversation = useRef(false);

  // Delay showing skeleton to prevent flash on quick loads (300ms threshold)
  const showDelayedLoading = useDelayedLoading(isLoading, 300);

  // Track which message is being regenerated
  const [regeneratingMessageIndex, setRegeneratingMessageIndex] = useState<number | null>(null);

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
      composerRef.current?.focus();
    },
    [addMessage, finishStreaming, setLoading]
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

  const handleConnected = useCallback(
    (data: { conversationId: string; resumed: boolean }) => {
      console.log('[ChatInterface] Connected to WebSocket, conversationId:', data.conversationId, 'resumed:', data.resumed);

      // Save conversationId to localStorage for session persistence
      if (typeof window !== 'undefined') {
        localStorage.setItem('guardian_conversation_id', data.conversationId);
      }

      // Mark that we should load history if resumed
      if (data.resumed) {
        setShouldLoadHistory(true);
      }

      // Note: fetchConversations is called by separate useEffect (lines 188-194)
      // when isConnected becomes true
    },
    []
  );

  const handleHistory = useCallback(
    (loadedMessages: ChatMessageType[]) => {
      console.log('[ChatInterface] handleHistory called with:', loadedMessages.length, 'messages');
      console.log('[ChatInterface] Messages:', loadedMessages);
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
    composerRef.current?.focus();
  }, [finishStreaming, setLoading]);

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

      // Set as active AND update localStorage
      setActiveConversation(conversation.id);

      if (typeof window !== 'undefined') {
        localStorage.setItem('guardian_conversation_id', conversation.id);
      }

      // Reset guard flag now that conversation is created
      isCreatingNewConversation.current = false;
    },
    [addConversation, setActiveConversation]
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
      composerRef.current?.focus();
    },
    [finishStreaming, setLoading]
  );

  const { isConnected, isConnecting, sendMessage, requestHistory, fetchConversations, startNewConversation, abortStream } = useWebSocket({
    url: WEBSOCKET_URL,
    token: token || undefined,
    conversationId: savedConversationId || undefined, // Pass saved conversationId to resume
    onMessage: handleMessage,
    onMessageStream: handleMessageStream,
    onError: handleError,
    onConnected: handleConnected,
    onHistory: handleHistory,
    onStreamComplete: handleStreamComplete,
    onConversationsList: handleConversationsList,
    onConversationCreated: handleConversationCreated,
    onConversationTitleUpdated: handleConversationTitleUpdated,
    onStreamAborted: handleStreamAborted,
    autoConnect: Boolean(token), // Connect whenever user is authenticated
  });

  // Fetch conversations list on connect
  useEffect(() => {
    console.log('[ChatInterface] Fetch conversations effect triggered - isConnected:', isConnected, 'fetchConversations:', !!fetchConversations);
    if (isConnected && fetchConversations) {
      console.log('[ChatInterface] Calling fetchConversations NOW');
      // Small delay to ensure WebSocket is fully ready
      setTimeout(() => {
        fetchConversations();
      }, 100);
    }
  }, [isConnected, fetchConversations]);

  // Request history after connection when needed
  useEffect(() => {
    if (shouldLoadHistory && isConnected && savedConversationId && requestHistory) {
      requestHistory(savedConversationId);
    }
  }, [shouldLoadHistory, isConnected, savedConversationId, requestHistory]);

  // Handle conversation switching
  useEffect(() => {
    console.log('[ChatInterface] Conversation switching effect - activeConversationId:', activeConversationId, 'isConnected:', isConnected);
    if (activeConversationId && isConnected && requestHistory) {
      console.log('[ChatInterface] Switching to conversation:', activeConversationId);
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

      // Update URL with conversation ID
      router.push(`/chat?conversation=${activeConversationId}`);

      // Update localStorage for session persistence
      if (typeof window !== 'undefined') {
        localStorage.setItem('guardian_conversation_id', activeConversationId);
      }
    } else if (activeConversationId === null && isConnected && startNewConversation && !isCreatingNewConversation.current) {
      // Guard: Prevent infinite loop by tracking if we're already creating a conversation
      isCreatingNewConversation.current = true;

      // New chat state - abort any active streaming first
      if (messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content === '') {
        console.log('[ChatInterface] Aborting active stream for new chat');
        finishStreaming();
        if (abortStream) {
          abortStream();
        }
      }

      // Clear messages, localStorage
      clearMessages();

      if (typeof window !== 'undefined') {
        localStorage.removeItem('guardian_conversation_id');
      }

      // Request backend to create new conversation and update socket state
      try {
        console.log('[ChatInterface] Requesting new conversation from backend');
        startNewConversation(mode);
        // Flag will be reset when conversation_created event sets activeConversationId
      } catch (err) {
        console.error('Failed to start new conversation:', err);
        setError('Failed to start new conversation');
        isCreatingNewConversation.current = false; // Reset on error
      }

      // Focus composer for new chat
      setTimeout(() => {
        composerRef.current?.focus();
      }, 100);
    }
  }, [activeConversationId, isConnected, requestHistory, startNewConversation, clearMessages, setLoading, setError, router, mode, finishStreaming, abortStream]);

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
    <div className="flex h-full flex-col">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 px-6 py-3 text-sm text-red-800">
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
          <div className="flex-shrink-0 relative z-10">
            <Composer
              ref={composerRef}
              onSendMessage={handleSendMessage}
              disabled={!isConnected || isLoading || isStreaming}
              currentMode={mode}
              onModeChange={handleModeChange}
              modeChangeDisabled={isChanging || !isConnected}
              isStreaming={isStreaming}
              onStopStream={abortStream}
            />
          </div>
        </>
      )}
    </div>
  );
}
