'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { WebSocketClient, ChatMessage, StreamEvent, Conversation, ExportReadyPayload, ExtractionFailedPayload, QuestionnaireReadyPayload, GenerateQuestionnairePayload } from '@/lib/websocket';

export interface UseWebSocketOptions {
  url: string;
  token?: string;
  conversationId?: string;
  onMessage?: (message: ChatMessage) => void;
  onMessageStream?: (chunk: string, conversationId: string, messageId?: string) => void;
  onError?: (error: string) => void;
  onConnected?: (data: { conversationId: string; resumed: boolean }) => void;
  onConnectionReady?: (data: { conversationId?: string; resumed: boolean; hasActiveConversation: boolean }) => void;
  onHistory?: (messages: ChatMessage[]) => void;
  onStreamComplete?: (data: { messageId: string; conversationId: string; fullText: string }) => void;
  onConversationsList?: (conversations: Conversation[]) => void;
  onConversationCreated?: (conversation: Conversation) => void;
  onConversationTitleUpdated?: (conversationId: string, title: string) => void;
  onStreamAborted?: (conversationId: string) => void;
  onConversationDeleted?: (conversationId: string) => void;
  onConversationModeUpdated?: (data: { conversationId: string; mode: 'consult' | 'assessment' }) => void;
  onExportReady?: (data: ExportReadyPayload) => void;
  onExtractionFailed?: (data: ExtractionFailedPayload) => void;
  onQuestionnaireReady?: (data: QuestionnaireReadyPayload) => void;
  autoConnect?: boolean;
}

export function useWebSocket({
  url,
  token,
  conversationId,
  onMessage,
  onMessageStream,
  onError,
  onConnected,
  onConnectionReady,
  onHistory,
  onStreamComplete,
  onConversationsList,
  onConversationCreated,
  onConversationTitleUpdated,
  onStreamAborted,
  onConversationDeleted,
  onConversationModeUpdated,
  onExportReady,
  onExtractionFailed,
  onQuestionnaireReady,
  autoConnect = true,
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const clientRef = useRef<WebSocketClient | null>(null);

  const connect = useCallback(async () => {
    // Guard: Don't connect if already connected or connecting
    if (isConnecting || isConnected) return;
    if (clientRef.current?.isConnected()) return;

    setIsConnecting(true);
    try {
      const client = new WebSocketClient({
        url,
        token,
        conversationId,
        // Note: Event callbacks registered dynamically in effect, not via config
      });
      await client.connect();
      clientRef.current = client;
      setIsConnected(true);
    } catch (error) {
      console.error('[useWebSocket] Connection failed:', error);
      onError?.('Failed to connect to server');
    } finally {
      setIsConnecting(false);
    }
  }, [url, token, conversationId, isConnecting, isConnected, onError]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const sendMessage = useCallback(
    (content: string, conversationId: string) => {
      if (!clientRef.current || !isConnected) {
        throw new Error('WebSocket not connected');
      }
      clientRef.current.sendMessage(content, conversationId);
    },
    [isConnected]
  );

  const requestHistory = useCallback(
    (conversationId: string, limit?: number) => {
      if (!clientRef.current || !isConnected) {
        throw new Error('WebSocket not connected');
      }
      clientRef.current.requestHistory(conversationId, limit);
    },
    [isConnected]
  );

  const fetchConversations = useCallback(() => {
    if (!clientRef.current || !isConnected) {
      console.warn('[useWebSocket] Cannot fetch conversations - not connected');
      return;
    }
    clientRef.current.fetchConversations();
  }, [isConnected]);

  const startNewConversation = useCallback((mode: 'consult' | 'assessment' = 'consult') => {
    if (!clientRef.current || !isConnected) {
      console.warn('[useWebSocket] Cannot start new conversation - not connected');
      return;
    }
    clientRef.current.startNewConversation(mode);
  }, [isConnected]);

  const abortStream = useCallback(() => {
    clientRef.current?.abortStream();
  }, []);

  const deleteConversation = useCallback((conversationId: string) => {
    if (!clientRef.current || !isConnected) {
      console.warn('[useWebSocket] Cannot delete conversation - not connected');
      return;
    }
    clientRef.current.deleteConversation(conversationId);
  }, [isConnected]);

  const updateConversationMode = useCallback((conversationId: string, mode: 'consult' | 'assessment') => {
    if (!clientRef.current || !isConnected) {
      console.warn('[useWebSocket] Cannot switch mode - not connected');
      return;
    }
    clientRef.current.switchMode(conversationId, mode);
  }, [isConnected]);

  const generateQuestionnaire = useCallback((payload: GenerateQuestionnairePayload) => {
    if (!clientRef.current || !isConnected) {
      console.warn('[useWebSocket] Cannot generate questionnaire - not connected');
      return;
    }
    clientRef.current.generateQuestionnaire(payload);
  }, [isConnected]);

  // Setup event listeners
  useEffect(() => {
    if (!clientRef.current || !isConnected) return;

    const client = clientRef.current;
    const unsubscribers: Array<() => void> = [];

    if (onMessage) {
      const unsub = client.onMessage((message: ChatMessage) => {
        // Message already normalized by WebSocketClient
        onMessage(message);
      });
      unsubscribers.push(unsub);
    }

    if (onMessageStream) {
      const unsub = client.onMessageStream((event: StreamEvent) => {
        onMessageStream(event.chunk, event.conversationId, event.messageId);
      });
      unsubscribers.push(unsub);
    }

    if (onError) {
      const unsub = client.onError((error: string) => {
        // Error already normalized by WebSocketClient (just the error string)
        onError(error);
      });
      unsubscribers.push(unsub);
    }

    if (onHistory) {
      const unsub = client.onHistory((messages) => {
        onHistory(messages);
      });
      unsubscribers.push(unsub);
    }

    if (onStreamComplete) {
      const unsub = client.onStreamComplete((data) => {
        onStreamComplete(data);
      });
      unsubscribers.push(unsub);
    }

    // CRITICAL FIX: Register conversation callbacks dynamically to prevent stale closures
    if (onConversationsList) {
      const unsub = client.onConversationsList((conversations) => {
        onConversationsList(conversations);
      });
      unsubscribers.push(unsub);
    }

    if (onConversationCreated) {
      const unsub = client.onConversationCreated((conversation) => {
        onConversationCreated(conversation);
      });
      unsubscribers.push(unsub);
    }

    if (onConversationTitleUpdated) {
      const unsub = client.onConversationTitleUpdated((conversationId, title) => {
        onConversationTitleUpdated(conversationId, title);
      });
      unsubscribers.push(unsub);
    }

    if (onStreamAborted) {
      const unsub = client.onStreamAborted((conversationId) => {
        onStreamAborted(conversationId);
      });
      unsubscribers.push(unsub);
    }

    if (onConversationDeleted) {
      const unsub = client.onConversationDeleted((conversationId) => {
        onConversationDeleted(conversationId);
      });
      unsubscribers.push(unsub);
    }

    if (onConversationModeUpdated) {
      const unsub = client.onConversationModeUpdated((data) => {
        onConversationModeUpdated(data);
      });
      unsubscribers.push(unsub);
    }

    if (onExportReady) {
      const unsub = client.onExportReady((data) => {
        onExportReady(data);
      });
      unsubscribers.push(unsub);
    }

    if (onExtractionFailed) {
      const unsub = client.onExtractionFailed((data) => {
        onExtractionFailed(data);
      });
      unsubscribers.push(unsub);
    }

    if (onQuestionnaireReady) {
      const unsub = client.onQuestionnaireReady((data) => {
        onQuestionnaireReady(data);
      });
      unsubscribers.push(unsub);
    }

    if (onConnectionReady) {
      const unsub = client.onConnectionReady((data) => {
        onConnectionReady(data);
      });
      unsubscribers.push(unsub);
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [isConnected, onMessage, onMessageStream, onError, onHistory, onStreamComplete, onConversationsList, onConversationCreated, onConversationTitleUpdated, onStreamAborted, onConversationDeleted, onConversationModeUpdated, onExportReady, onExtractionFailed, onQuestionnaireReady, onConnectionReady]);

  // Effect 1: Auto-connect when token becomes available
  useEffect(() => {
    if (autoConnect && token && !isConnected && !isConnecting) {
      connect();
    }
  }, [autoConnect, token, isConnected, isConnecting, connect]);

  // Effect 2: Cleanup on unmount only (not on re-renders)
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []); // Empty deps = only runs on mount/unmount

  return useMemo(() => ({
    isConnected,
    isConnecting,
    connect,
    disconnect,
    sendMessage,
    requestHistory,
    fetchConversations,
    startNewConversation,
    abortStream,
    deleteConversation,
    updateConversationMode,
    generateQuestionnaire,
  }), [
    isConnected,
    isConnecting,
    connect,
    disconnect,
    sendMessage,
    requestHistory,
    fetchConversations,
    startNewConversation,
    abortStream,
    deleteConversation,
    updateConversationMode,
    generateQuestionnaire,
  ]);
}
