'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ModeSwitcher, ConversationMode } from './ModeSwitcher';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useConversationMode } from '@/hooks/useConversationMode';
import { useAuth } from '@/hooks/useAuth';
import { ChatMessage as ChatMessageType } from '@/lib/websocket';
import { AlertCircle } from 'lucide-react';

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:8000';

export function ChatInterface() {
  const { messages, isLoading, error, addMessage, setMessages, startStreaming, appendToLastMessage, finishStreaming, setLoading, setError } =
    useChatStore();
  const { mode, changeMode, isChanging } = useConversationMode('consult');
  const { token } = useAuth();
  const [savedConversationId, setSavedConversationId] = useState<string | undefined | null>(null);

  // Load saved conversationId from localStorage on mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('guardian_conversation_id');
      setSavedConversationId(saved || undefined); // undefined if no saved conversation
    }
  }, []);

  const handleMessage = useCallback(
    (message: ChatMessageType) => {
      // Add message to store (critical - this was missing!)
      addMessage(message);
      finishStreaming();
      setLoading(false); // Hide typing indicator
    },
    [addMessage, finishStreaming, setLoading]
  );

  const handleMessageStream = useCallback(
    (chunk: string) => {
      // If this is the first chunk, start a new streaming message
      if (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') {
        startStreaming();
        setLoading(false); // Hide typing indicator, show streaming message instead
      }
      appendToLastMessage(chunk);
    },
    [messages, startStreaming, appendToLastMessage, setLoading]
  );

  const handleError = useCallback(
    (errorMessage: string) => {
      setError(errorMessage);
      finishStreaming();
      setLoading(false); // Hide typing indicator on error
    },
    [setError, finishStreaming, setLoading]
  );

  const handleConnected = useCallback(
    (data: { conversationId: string; resumed: boolean }) => {
      // Save conversationId to localStorage for session persistence
      if (typeof window !== 'undefined') {
        localStorage.setItem('guardian_conversation_id', data.conversationId);
      }
    },
    []
  );

  const handleHistory = useCallback(
    (loadedMessages: ChatMessageType[]) => {
      setMessages(loadedMessages);
      setLoading(false); // Hide skeleton loaders
    },
    [setMessages, setLoading]
  );

  const { isConnected, isConnecting, sendMessage, requestHistory } = useWebSocket({
    url: WEBSOCKET_URL,
    token: token || undefined,
    conversationId: savedConversationId || undefined, // Pass saved conversationId to resume
    onMessage: handleMessage,
    onMessageStream: handleMessageStream,
    onError: handleError,
    onConnected: handleConnected,
    onHistory: handleHistory,
    autoConnect: Boolean(token) && savedConversationId !== null, // Wait for localStorage check to complete
  });

  // Request history when connected and we have a saved conversation
  useEffect(() => {
    if (isConnected && savedConversationId && requestHistory) {
      requestHistory(savedConversationId);
    }
  }, [isConnected, savedConversationId, requestHistory]);

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!isConnected) {
        setError('Not connected to server');
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

      // Send to server
      try {
        sendMessage(content);
      } catch (err) {
        setError('Failed to send message');
        setLoading(false);
        console.error('Send message error:', err);
      }
    },
    [isConnected, sendMessage, addMessage, setLoading, setError]
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

  return (
    <div className="flex h-full flex-col">
      {/* Header with mode switcher */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : isConnecting ? 'bg-yellow-500' : 'bg-red-500'}`}
            aria-label={isConnected ? 'Connected' : isConnecting ? 'Connecting' : 'Disconnected'}
          />
          <span className="text-sm text-gray-600">
            {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
          </span>
        </div>
        <ModeSwitcher currentMode={mode} onModeChange={handleModeChange} disabled={isChanging || !isConnected} />
      </div>

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

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <MessageList messages={messages} isLoading={isLoading} />
      </div>

      {/* Input */}
      <MessageInput onSendMessage={handleSendMessage} disabled={!isConnected || isLoading} />
    </div>
  );
}
