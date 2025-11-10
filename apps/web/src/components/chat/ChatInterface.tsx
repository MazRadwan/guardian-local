'use client';

import React, { useCallback } from 'react';
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
  const { messages, isLoading, error, addMessage, startStreaming, appendToLastMessage, finishStreaming, setError } =
    useChatStore();
  const { mode, changeMode, isChanging } = useConversationMode('consult');
  const { token } = useAuth();

  const handleMessage = useCallback(
    (message: ChatMessageType) => {
      // Add message to store (critical - this was missing!)
      addMessage(message);
      finishStreaming();
    },
    [addMessage, finishStreaming]
  );

  const handleMessageStream = useCallback(
    (chunk: string) => {
      // If this is the first chunk, start a new streaming message
      if (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') {
        startStreaming();
      }
      appendToLastMessage(chunk);
    },
    [messages, startStreaming, appendToLastMessage]
  );

  const handleError = useCallback(
    (errorMessage: string) => {
      setError(errorMessage);
      finishStreaming();
    },
    [setError, finishStreaming]
  );

  const { isConnected, isConnecting, sendMessage } = useWebSocket({
    url: WEBSOCKET_URL,
    token: token || undefined, // Pass JWT token to WebSocket
    onMessage: handleMessage,
    onMessageStream: handleMessageStream,
    onError: handleError,
    autoConnect: Boolean(token), // Only connect when token is available
  });

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

      // Send to server
      try {
        sendMessage(content);
      } catch (err) {
        setError('Failed to send message');
        console.error('Send message error:', err);
      }
    },
    [isConnected, sendMessage, addMessage, setError]
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
