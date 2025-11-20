'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '@/lib/websocket';

export interface UseHistoryManagerParams {
  conversationId: string | null | undefined;
  isConnected: boolean;
  requestHistory: ((conversationId: string) => void) | undefined;
  messageListRef: React.RefObject<HTMLDivElement | null>;
  setMessages: (messages: ChatMessage[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  messages: ChatMessage[];
  isLoading: boolean;
}

export interface UseHistoryManagerReturn {
  shouldLoadHistory: boolean;
  setShouldLoadHistory: (should: boolean) => void;
  handleHistory: (loadedMessages: ChatMessage[]) => void;
}

export function useHistoryManager({
  conversationId,
  isConnected,
  requestHistory,
  messageListRef,
  setMessages,
  setLoading,
  setError,
  messages,
  isLoading,
}: UseHistoryManagerParams): UseHistoryManagerReturn {
  const [shouldLoadHistory, setShouldLoadHistory] = useState(false);
  const historyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle history loaded callback
  const handleHistory = (loadedMessages: ChatMessage[]) => {
    console.log('[useHistoryManager] handleHistory called with:', loadedMessages.length, 'messages');
    console.log('[useHistoryManager] Messages:', loadedMessages);

    // CRITICAL FIX: Clear history timeout to prevent error showing after successful load
    if (historyTimeoutRef.current) {
      console.log('[useHistoryManager] Clearing history timeout');
      clearTimeout(historyTimeoutRef.current);
      historyTimeoutRef.current = null;
    }

    setMessages(loadedMessages);
    console.log('[useHistoryManager] setMessages called');
    setLoading(false); // Hide skeleton loaders
    setShouldLoadHistory(false);

    // Scroll to bottom after history loads
    setTimeout(() => {
      if (messageListRef.current) {
        messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
      }
    }, 50);
  };

  // Request history when conditions are met
  useEffect(() => {
    if (shouldLoadHistory && isConnected && conversationId && requestHistory) {
      console.log('[useHistoryManager] Requesting history for conversation:', conversationId);
      requestHistory(conversationId);

      // CRITICAL FIX: Store timeout in ref so handleHistory can clear it
      historyTimeoutRef.current = setTimeout(() => {
        if (isLoading && messages.length === 0) {
          console.warn('[useHistoryManager] History request timeout - clearing loading state');
          setLoading(false);
          setError('Failed to load conversation. Please try again.');
          historyTimeoutRef.current = null;
        }
      }, 5000); // 5 second timeout

      // CRITICAL: Clean up timeout on unmount or when dependencies change
      return () => {
        console.log('[useHistoryManager] Cleaning up history timeout');
        if (historyTimeoutRef.current) {
          clearTimeout(historyTimeoutRef.current);
          historyTimeoutRef.current = null;
        }
      };
    }
  }, [shouldLoadHistory, isConnected, conversationId, requestHistory, isLoading, messages.length, setLoading, setError]);

  return {
    shouldLoadHistory,
    setShouldLoadHistory,
    handleHistory,
  };
}
