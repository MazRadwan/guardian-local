'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { WebSocketClient, ChatMessage, StreamEvent, Conversation, ExportReadyPayload, ExtractionFailedPayload, QuestionnaireReadyPayload, GenerateQuestionnairePayload, ExportStatusNotFoundPayload, ExportStatusErrorPayload, UploadProgressEvent, IntakeContextResult, ScoringParseResult, ScoringStartedPayload, ScoringProgressPayload, ScoringCompletePayload, ScoringErrorPayload, VendorClarificationNeededPayload, FileProcessingErrorPayload, QuestionnaireProgressPayload } from '@/lib/websocket';
import type { GenerationPhasePayload } from '@guardian/shared';
import { useChatStore } from '@/stores/chatStore';

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
  onGenerationPhase?: (data: GenerationPhasePayload) => void;
  // Story 13.9.2: Export status resume callbacks
  onExportStatusNotFound?: (data: ExportStatusNotFoundPayload) => void;
  onExportStatusError?: (data: ExportStatusErrorPayload) => void;
  // Epic 15 Story 5a.7: Scoring event callbacks
  onScoringStarted?: (data: ScoringStartedPayload) => void;
  onScoringProgress?: (data: ScoringProgressPayload) => void;
  onScoringComplete?: (data: ScoringCompletePayload) => void;
  onScoringError?: (data: ScoringErrorPayload) => void;
  // Epic 18.4.2b: Vendor clarification callback
  onVendorClarificationNeeded?: (data: VendorClarificationNeededPayload) => void;
  // Epic 31.2.2: File processing error callback
  onFileProcessingError?: (data: FileProcessingErrorPayload) => void;
  // Epic 32.2.1: Questionnaire progress callback
  onQuestionnaireProgress?: (data: QuestionnaireProgressPayload) => void;
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
  onGenerationPhase,
  onExportStatusNotFound,
  onExportStatusError,
  onScoringStarted,
  onScoringProgress,
  onScoringComplete,
  onScoringError,
  onVendorClarificationNeeded,
  onFileProcessingError,
  onQuestionnaireProgress,
  autoConnect = true,
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const clientRef = useRef<WebSocketClient | null>(null);

  // Ref to store latest onConnectionReady callback to avoid stale closures
  const onConnectionReadyRef = useRef(onConnectionReady);
  onConnectionReadyRef.current = onConnectionReady;

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
        // Note: Most event callbacks registered dynamically in effect, not via config
      });

      // CRITICAL: Pass onConnectionReady to connect() so it's registered BEFORE
      // the socket actually connects. The server emits connection_ready immediately
      // after connect, so we must register this listener before connect completes.
      await client.connect({
        onConnectionReady: onConnectionReadyRef.current
          ? (data) => onConnectionReadyRef.current?.(data)
          : undefined,
      });
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

      // Story 26.3: Clear all title loading states on disconnect
      // This prevents stuck shimmer states when connection drops
      useChatStore.getState().clearAllTitleLoadingStates();
    }
  }, []);

  // Epic 16.6.8: Import MessageAttachment type for attachments
  // Story 24.1: Add isRegenerate parameter for retry context
  const sendMessage = useCallback(
    (content: string, conversationId: string, attachments?: import('@/lib/websocket').MessageAttachment[], isRegenerate?: boolean) => {
      if (!clientRef.current || !isConnected) {
        throw new Error('WebSocket not connected');
      }
      clientRef.current.sendMessage(content, conversationId, attachments, isRegenerate);
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

  const startNewConversation = useCallback((mode: 'consult' | 'assessment' | 'scoring' = 'consult') => {
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

  const updateConversationMode = useCallback((conversationId: string, mode: 'consult' | 'assessment' | 'scoring') => {
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

  // Story 13.9.2: Request export status for a conversation
  const requestExportStatus = useCallback((conversationId: string) => {
    if (!clientRef.current || !isConnected) {
      console.warn('[useWebSocket] Cannot request export status - not connected');
      return;
    }
    clientRef.current.requestExportStatus(conversationId);
  }, [isConnected]);

  // Epic 18.4.2b: Select vendor for scoring when multiple vendors detected
  const selectVendor = useCallback((conversationId: string, vendorName: string) => {
    if (!clientRef.current || !isConnected) {
      console.warn('[useWebSocket] Cannot select vendor - not connected');
      return;
    }
    clientRef.current.selectVendor(conversationId, vendorName);
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

    if (onGenerationPhase) {
      const unsub = client.onGenerationPhase((data) => {
        onGenerationPhase(data);
      });
      unsubscribers.push(unsub);
    }

    // NOTE: onConnectionReady is registered in connect() BEFORE the socket connects
    // to ensure we don't miss the server's immediate connection_ready event.
    // It's not registered here to avoid double-registration.

    // Story 13.9.2: Export status resume subscriptions
    if (onExportStatusNotFound) {
      const unsub = client.onExportStatusNotFound((data) => {
        onExportStatusNotFound(data);
      });
      unsubscribers.push(unsub);
    }

    if (onExportStatusError) {
      const unsub = client.onExportStatusError((data) => {
        onExportStatusError(data);
      });
      unsubscribers.push(unsub);
    }

    // Epic 15 Story 5a.7: Scoring event subscriptions
    if (onScoringStarted) {
      const unsub = client.onScoringStarted((data) => {
        onScoringStarted(data);
      });
      unsubscribers.push(unsub);
    }

    if (onScoringProgress) {
      const unsub = client.onScoringProgress((data) => {
        onScoringProgress(data);
      });
      unsubscribers.push(unsub);
    }

    if (onScoringComplete) {
      const unsub = client.onScoringComplete((data) => {
        onScoringComplete(data);
      });
      unsubscribers.push(unsub);
    }

    if (onScoringError) {
      const unsub = client.onScoringError((data) => {
        onScoringError(data);
      });
      unsubscribers.push(unsub);
    }

    // Epic 18.4.2b: Vendor clarification subscription
    if (onVendorClarificationNeeded) {
      const unsub = client.onVendorClarificationNeeded((data) => {
        onVendorClarificationNeeded(data);
      });
      unsubscribers.push(unsub);
    }

    // Epic 31.2.2: File processing error subscription
    if (onFileProcessingError) {
      const unsub = client.onFileProcessingError((data) => {
        onFileProcessingError(data);
      });
      unsubscribers.push(unsub);
    }

    // Epic 32.2.1: Questionnaire progress subscription
    if (onQuestionnaireProgress) {
      const unsub = client.onQuestionnaireProgress((data) => {
        onQuestionnaireProgress(data);
      });
      unsubscribers.push(unsub);
    }

    // Epic 32.2.3: Wire reconnection state to chatStore
    // Always register these to track reconnection state
    const disconnectUnsub = client.onDisconnect((reason) => {
      console.log('[useWebSocket] Disconnect detected, setting reconnecting=true, reason:', reason);
      useChatStore.getState().setReconnecting(true);
    });
    unsubscribers.push(disconnectUnsub);

    const reconnectUnsub = client.onReconnect((attemptNumber) => {
      console.log('[useWebSocket] Reconnect successful after', attemptNumber, 'attempts, setting reconnecting=false');
      useChatStore.getState().setReconnecting(false);
    });
    unsubscribers.push(reconnectUnsub);

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  // NOTE: onConnectionReady is NOT in deps - it's registered in connect() before the socket connects
  }, [isConnected, onMessage, onMessageStream, onError, onHistory, onStreamComplete, onConversationsList, onConversationCreated, onConversationTitleUpdated, onStreamAborted, onConversationDeleted, onConversationModeUpdated, onExportReady, onExtractionFailed, onQuestionnaireReady, onGenerationPhase, onExportStatusNotFound, onExportStatusError, onScoringStarted, onScoringProgress, onScoringComplete, onScoringError, onVendorClarificationNeeded, onFileProcessingError, onQuestionnaireProgress]);

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

  // Epic 16: Dynamic subscribe methods for upload events
  // These allow components to subscribe/unsubscribe during their lifecycle
  const subscribeUploadProgress = useCallback(
    (handler: (data: UploadProgressEvent) => void) => {
      return clientRef.current?.onUploadProgress(handler) ?? (() => {});
    },
    []
  );

  const subscribeIntakeContextReady = useCallback(
    (handler: (data: IntakeContextResult) => void) => {
      return clientRef.current?.onIntakeContextReady(handler) ?? (() => {});
    },
    []
  );

  const subscribeScoringParseReady = useCallback(
    (handler: (data: ScoringParseResult) => void) => {
      return clientRef.current?.onScoringParseReady(handler) ?? (() => {});
    },
    []
  );

  // Epic 18: Subscribe to file_attached events
  const subscribeFileAttached = useCallback(
    (handler: (data: import('@/lib/websocket').FileAttachedEvent) => void) => {
      return clientRef.current?.onFileAttached(handler) ?? (() => {});
    },
    []
  );

  // Epic 32.2.1: Subscribe to questionnaire progress events
  const subscribeQuestionnaireProgress = useCallback(
    (handler: (data: QuestionnaireProgressPayload) => void) => {
      return clientRef.current?.onQuestionnaireProgress(handler) ?? (() => {});
    },
    []
  );

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
    requestExportStatus,
    // Epic 16: Upload event subscriptions
    subscribeUploadProgress,
    subscribeIntakeContextReady,
    subscribeScoringParseReady,
    // Epic 18: File attached subscription
    subscribeFileAttached,
    // Epic 18.4.2b: Vendor clarification selection
    selectVendor,
    // Epic 32.2.1: Questionnaire progress subscription
    subscribeQuestionnaireProgress,
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
    requestExportStatus,
    subscribeUploadProgress,
    subscribeIntakeContextReady,
    subscribeScoringParseReady,
    subscribeFileAttached,
    selectVendor,
    subscribeQuestionnaireProgress,
  ]);
}
