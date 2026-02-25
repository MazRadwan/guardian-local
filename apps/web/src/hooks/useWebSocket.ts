'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { WebSocketClient, ChatMessage, StreamEvent, Conversation, ExportReadyPayload, ExtractionFailedPayload, QuestionnaireReadyPayload, GenerateQuestionnairePayload, ExportStatusNotFoundPayload, ExportStatusErrorPayload, UploadProgressEvent, IntakeContextResult, ScoringParseResult, ScoringStartedPayload, ScoringProgressPayload, ScoringCompletePayload, ScoringErrorPayload, VendorClarificationNeededPayload, FileProcessingErrorPayload, QuestionnaireProgressPayload, ToolStatusPayload } from '@/lib/websocket';
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
  // Epic 33.3.2: Tool status callback
  onToolStatus?: (data: ToolStatusPayload) => void;
  // Auth error callback (session expired, invalid token)
  onAuthError?: () => void;
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
  onToolStatus,
  onAuthError,
  autoConnect = true,
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const clientRef = useRef<WebSocketClient | null>(null);

  // Ref to store latest onConnectionReady callback to avoid stale closures
  const onConnectionReadyRef = useRef(onConnectionReady);
  onConnectionReadyRef.current = onConnectionReady;

  // Ref to store latest onAuthError callback to avoid stale closures
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;

  // Refs for ALL remaining callback handlers to prevent re-subscription during streaming.
  // This is the load-bearing invariant: the event listener useEffect (below) depends ONLY
  // on [isConnected] and dispatches through refs. Handlers are always registered unconditionally
  // via ref.current?.() so late callback prop changes still work without re-subscribing.
  // DO NOT reintroduce conditional registration or add callbacks to the useEffect deps —
  // that would cause "Maximum update depth exceeded" during high-frequency streaming.
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onMessageStreamRef = useRef(onMessageStream);
  onMessageStreamRef.current = onMessageStream;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onHistoryRef = useRef(onHistory);
  onHistoryRef.current = onHistory;
  const onStreamCompleteRef = useRef(onStreamComplete);
  onStreamCompleteRef.current = onStreamComplete;
  const onConversationsListRef = useRef(onConversationsList);
  onConversationsListRef.current = onConversationsList;
  const onConversationCreatedRef = useRef(onConversationCreated);
  onConversationCreatedRef.current = onConversationCreated;
  const onConversationTitleUpdatedRef = useRef(onConversationTitleUpdated);
  onConversationTitleUpdatedRef.current = onConversationTitleUpdated;
  const onStreamAbortedRef = useRef(onStreamAborted);
  onStreamAbortedRef.current = onStreamAborted;
  const onConversationDeletedRef = useRef(onConversationDeleted);
  onConversationDeletedRef.current = onConversationDeleted;
  const onConversationModeUpdatedRef = useRef(onConversationModeUpdated);
  onConversationModeUpdatedRef.current = onConversationModeUpdated;
  const onExportReadyRef = useRef(onExportReady);
  onExportReadyRef.current = onExportReady;
  const onExtractionFailedRef = useRef(onExtractionFailed);
  onExtractionFailedRef.current = onExtractionFailed;
  const onQuestionnaireReadyRef = useRef(onQuestionnaireReady);
  onQuestionnaireReadyRef.current = onQuestionnaireReady;
  const onGenerationPhaseRef = useRef(onGenerationPhase);
  onGenerationPhaseRef.current = onGenerationPhase;
  const onExportStatusNotFoundRef = useRef(onExportStatusNotFound);
  onExportStatusNotFoundRef.current = onExportStatusNotFound;
  const onExportStatusErrorRef = useRef(onExportStatusError);
  onExportStatusErrorRef.current = onExportStatusError;
  const onScoringStartedRef = useRef(onScoringStarted);
  onScoringStartedRef.current = onScoringStarted;
  const onScoringProgressRef = useRef(onScoringProgress);
  onScoringProgressRef.current = onScoringProgress;
  const onScoringCompleteRef = useRef(onScoringComplete);
  onScoringCompleteRef.current = onScoringComplete;
  const onScoringErrorRef = useRef(onScoringError);
  onScoringErrorRef.current = onScoringError;
  const onVendorClarificationNeededRef = useRef(onVendorClarificationNeeded);
  onVendorClarificationNeededRef.current = onVendorClarificationNeeded;
  const onFileProcessingErrorRef = useRef(onFileProcessingError);
  onFileProcessingErrorRef.current = onFileProcessingError;
  const onQuestionnaireProgressRef = useRef(onQuestionnaireProgress);
  onQuestionnaireProgressRef.current = onQuestionnaireProgress;
  const onToolStatusRef = useRef(onToolStatus);
  onToolStatusRef.current = onToolStatus;

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
      // Also pass onAuthError to handle expired/invalid tokens.
      await client.connect({
        onConnectionReady: onConnectionReadyRef.current
          ? (data) => onConnectionReadyRef.current?.(data)
          : undefined,
        onAuthError: onAuthErrorRef.current
          ? () => onAuthErrorRef.current?.()
          : undefined,
      });
      clientRef.current = client;
      setIsConnected(true);
    } catch (error) {
      console.error('[useWebSocket] Connection failed:', error);
      onErrorRef.current?.('Failed to connect to server');
    } finally {
      setIsConnecting(false);
    }
  }, [url, token, conversationId, isConnecting, isConnected]);

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

  // Setup event listeners — ALL dispatched through refs to prevent re-subscription.
  // INVARIANT: This effect depends ONLY on [isConnected]. All handlers are registered
  // unconditionally and dispatch via ref.current?.() so callback prop changes propagate
  // without re-subscribing. DO NOT add callback props to the dep array — that causes
  // "Maximum update depth exceeded" during high-frequency streaming (token events).
  useEffect(() => {
    if (!clientRef.current || !isConnected) return;

    const client = clientRef.current;
    const unsubscribers: Array<() => void> = [];

    unsubscribers.push(client.onMessage((message: ChatMessage) => {
      onMessageRef.current?.(message);
    }));

    unsubscribers.push(client.onMessageStream((event: StreamEvent) => {
      onMessageStreamRef.current?.(event.chunk, event.conversationId, event.messageId);
    }));

    unsubscribers.push(client.onError((error: string) => {
      onErrorRef.current?.(error);
    }));

    unsubscribers.push(client.onHistory((messages) => {
      onHistoryRef.current?.(messages);
    }));

    unsubscribers.push(client.onStreamComplete((data) => {
      onStreamCompleteRef.current?.(data);
    }));

    unsubscribers.push(client.onConversationsList((conversations) => {
      onConversationsListRef.current?.(conversations);
    }));

    unsubscribers.push(client.onConversationCreated((conversation) => {
      onConversationCreatedRef.current?.(conversation);
    }));

    unsubscribers.push(client.onConversationTitleUpdated((conversationId, title) => {
      onConversationTitleUpdatedRef.current?.(conversationId, title);
    }));

    unsubscribers.push(client.onStreamAborted((conversationId) => {
      onStreamAbortedRef.current?.(conversationId);
    }));

    unsubscribers.push(client.onConversationDeleted((conversationId) => {
      onConversationDeletedRef.current?.(conversationId);
    }));

    unsubscribers.push(client.onConversationModeUpdated((data) => {
      onConversationModeUpdatedRef.current?.(data);
    }));

    unsubscribers.push(client.onExportReady((data) => {
      onExportReadyRef.current?.(data);
    }));

    unsubscribers.push(client.onExtractionFailed((data) => {
      onExtractionFailedRef.current?.(data);
    }));

    unsubscribers.push(client.onQuestionnaireReady((data) => {
      onQuestionnaireReadyRef.current?.(data);
    }));

    unsubscribers.push(client.onGenerationPhase((data) => {
      onGenerationPhaseRef.current?.(data);
    }));

    // NOTE: onConnectionReady is registered in connect() BEFORE the socket connects
    // to ensure we don't miss the server's immediate connection_ready event.

    unsubscribers.push(client.onExportStatusNotFound((data) => {
      onExportStatusNotFoundRef.current?.(data);
    }));

    unsubscribers.push(client.onExportStatusError((data) => {
      onExportStatusErrorRef.current?.(data);
    }));

    unsubscribers.push(client.onScoringStarted((data) => {
      onScoringStartedRef.current?.(data);
    }));

    unsubscribers.push(client.onScoringProgress((data) => {
      onScoringProgressRef.current?.(data);
    }));

    unsubscribers.push(client.onScoringComplete((data) => {
      onScoringCompleteRef.current?.(data);
    }));

    unsubscribers.push(client.onScoringError((data) => {
      onScoringErrorRef.current?.(data);
    }));

    unsubscribers.push(client.onVendorClarificationNeeded((data) => {
      onVendorClarificationNeededRef.current?.(data);
    }));

    unsubscribers.push(client.onFileProcessingError((data) => {
      onFileProcessingErrorRef.current?.(data);
    }));

    unsubscribers.push(client.onQuestionnaireProgress((data) => {
      onQuestionnaireProgressRef.current?.(data);
    }));

    unsubscribers.push(client.onToolStatus((data) => {
      onToolStatusRef.current?.(data);
    }));

    // Epic 32.2.3: Wire reconnection state to chatStore
    unsubscribers.push(client.onDisconnect((reason) => {
      console.log('[useWebSocket] Disconnect detected, setting reconnecting=true, reason:', reason);
      useChatStore.getState().setReconnecting(true);
      useChatStore.getState().setToolStatus('idle');
    }));

    unsubscribers.push(client.onReconnect((attemptNumber) => {
      console.log('[useWebSocket] Reconnect successful after', attemptNumber, 'attempts, setting reconnecting=false');
      useChatStore.getState().setReconnecting(false);
      useChatStore.getState().setToolStatus('idle');
    }));

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [isConnected]);

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

  // Epic 33.3.2: Subscribe to tool status events
  const subscribeToolStatus = useCallback(
    (handler: (data: ToolStatusPayload) => void) => {
      return clientRef.current?.onToolStatus(handler) ?? (() => {});
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
    // Epic 33.3.2: Tool status subscription
    subscribeToolStatus,
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
    subscribeToolStatus,
  ]);
}
