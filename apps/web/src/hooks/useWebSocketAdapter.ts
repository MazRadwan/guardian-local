'use client';

import { useMemo } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ChatMessage, ExportReadyPayload, ExtractionFailedPayload, QuestionnaireReadyPayload, GenerateQuestionnairePayload, ExportStatusNotFoundPayload, ExportStatusErrorPayload, UploadProgressEvent, IntakeContextResult, ScoringParseResult, MessageAttachment, ScoringStartedPayload, ScoringProgressPayload, ScoringCompletePayload, ScoringErrorPayload, VendorClarificationNeededPayload, FileProcessingErrorPayload } from '@/lib/websocket';
import type { GenerationPhasePayload } from '@guardian/shared';
import type { Conversation } from '@/stores/chatStore';

export type ConversationMode = 'consult' | 'assessment' | 'scoring';

/**
 * Event handlers for WebSocket adapter
 * All handlers are optional and will be passed to underlying useWebSocket
 */
export interface WebSocketEventHandlers {
  onMessage?: (message: ChatMessage) => void;
  onMessageStream?: (chunk: string, conversationId: string, messageId?: string) => void;
  onError?: (errorMessage: string) => void;
  onConnectionReady?: (data: { conversationId?: string; resumed: boolean; hasActiveConversation: boolean }) => void;
  onHistory?: (messages: ChatMessage[]) => void;
  onStreamComplete?: (data: { messageId: string; conversationId: string; fullText: string }) => void;
  onConversationsList?: (conversations: Conversation[]) => void;
  onConversationCreated?: (conversation: Conversation) => void;
  onConversationTitleUpdated?: (conversationId: string, title: string) => void;
  onStreamAborted?: (conversationId: string) => void;
  onConversationDeleted?: (conversationId: string) => void;
  onConversationModeUpdated?: (data: { conversationId: string; mode: ConversationMode }) => void;
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
}

/**
 * Configuration for WebSocket adapter
 */
export interface WebSocketAdapterConfig {
  url: string;
  token?: string;
  conversationId?: string;
  handlers: WebSocketEventHandlers;
  autoConnect?: boolean;
}

/**
 * Adapter interface returned by useWebSocketAdapter
 * Provides a stable, testable API over the underlying useWebSocket hook
 */
export interface WebSocketAdapterInterface {
  // Connection state (read-only)
  readonly isConnected: boolean;
  readonly isConnecting: boolean;

  // Connection operations
  connect: () => Promise<void>;
  disconnect: () => void;

  // Messaging operations
  /** Epic 16.6.8: Send message with optional attachments
   *  Story 24.1: Add isRegenerate flag for retry context */
  sendMessage: (content: string, conversationId: string, attachments?: MessageAttachment[], isRegenerate?: boolean) => void;
  requestHistory: (conversationId: string, limit?: number) => void;

  // Conversation operations
  fetchConversations: () => void;
  startNewConversation: (mode: ConversationMode) => void;
  deleteConversation: (conversationId: string) => void;
  updateConversationMode: (conversationId: string, mode: ConversationMode) => void;

  // Stream control
  abortStream: () => void;

  // Questionnaire generation
  generateQuestionnaire: (payload: GenerateQuestionnairePayload) => void;

  // Story 13.9.2: Export status resume
  requestExportStatus: (conversationId: string) => void;

  // Epic 16: Upload event subscriptions (return unsubscribe functions)
  subscribeUploadProgress: (handler: (data: UploadProgressEvent) => void) => () => void;
  subscribeIntakeContextReady: (handler: (data: IntakeContextResult) => void) => () => void;
  subscribeScoringParseReady: (handler: (data: ScoringParseResult) => void) => () => void;
  // Epic 18: File attached subscription
  subscribeFileAttached: (handler: (data: import('@/lib/websocket').FileAttachedEvent) => void) => () => void;

  // Epic 18.4.2b: Vendor clarification selection
  selectVendor: (conversationId: string, vendorName: string) => void;
}

/**
 * useWebSocketAdapter - Hook-based adapter over useWebSocket
 *
 * This hook provides a clean, stable interface over the existing useWebSocket hook,
 * making it easier to use in controllers and testable with mocks.
 *
 * Architecture:
 * - Infrastructure Layer: useWebSocket (existing) - raw Socket.IO client
 * - Service Adapter Layer: useWebSocketAdapter (this hook) - clean interface
 * - Business Logic Layer: ChatService + ConversationService (plain TS classes)
 * - Controller Layer: useChatController - orchestrates services + hooks
 *
 * Why a hook instead of a class?
 * - useWebSocket is a React hook and MUST be called in a hook context
 * - This adapter wraps it and provides a stable, memoized interface
 * - Business logic classes can accept WebSocketAdapterInterface for testing
 *
 * @param config - Configuration including URL, token, handlers, and options
 * @returns Stable adapter interface with connection state and operations
 *
 * @example
 * ```ts
 * const adapter = useWebSocketAdapter({
 *   url: '/api/ws',
 *   token: userToken,
 *   handlers: {
 *     onMessage: handleMessage,
 *     onError: handleError,
 *   },
 *   autoConnect: true,
 * });
 *
 * // Use in component/controller
 * adapter.sendMessage('Hello', conversationId);
 * ```
 */
export function useWebSocketAdapter({
  url,
  token,
  conversationId,
  handlers,
  autoConnect = true,
}: WebSocketAdapterConfig): WebSocketAdapterInterface {

  // Wrap useWebSocket hook with all event handlers
  const wsHook = useWebSocket({
    url,
    token,
    conversationId,
    onMessage: handlers.onMessage,
    onMessageStream: handlers.onMessageStream,
    onError: handlers.onError,
    onConnectionReady: handlers.onConnectionReady,
    onHistory: handlers.onHistory,
    onStreamComplete: handlers.onStreamComplete,
    onConversationsList: handlers.onConversationsList,
    onConversationCreated: handlers.onConversationCreated,
    onConversationTitleUpdated: handlers.onConversationTitleUpdated,
    onStreamAborted: handlers.onStreamAborted,
    onConversationDeleted: handlers.onConversationDeleted,
    onConversationModeUpdated: handlers.onConversationModeUpdated,
    onExportReady: handlers.onExportReady,
    onExtractionFailed: handlers.onExtractionFailed,
    onQuestionnaireReady: handlers.onQuestionnaireReady,
    onGenerationPhase: handlers.onGenerationPhase,
    onExportStatusNotFound: handlers.onExportStatusNotFound,
    onExportStatusError: handlers.onExportStatusError,
    onScoringStarted: handlers.onScoringStarted,
    onScoringProgress: handlers.onScoringProgress,
    onScoringComplete: handlers.onScoringComplete,
    onScoringError: handlers.onScoringError,
    onVendorClarificationNeeded: handlers.onVendorClarificationNeeded,
    onFileProcessingError: handlers.onFileProcessingError,
    autoConnect,
  });

  // Return stable adapter interface (memoized to prevent unnecessary re-renders)
  return useMemo(() => ({
    // Connection state
    isConnected: wsHook.isConnected,
    isConnecting: wsHook.isConnecting,

    // Connection operations
    connect: wsHook.connect,
    disconnect: wsHook.disconnect,

    // Messaging operations
    // Epic 16.6.8: Pass attachments to underlying hook
    // Story 24.1: Pass isRegenerate flag for retry context
    sendMessage: (content: string, conversationId: string, attachments?: MessageAttachment[], isRegenerate?: boolean) => {
      wsHook.sendMessage(content, conversationId, attachments, isRegenerate);
    },

    requestHistory: (conversationId: string, limit?: number) => {
      wsHook.requestHistory(conversationId, limit);
    },

    // Conversation operations
    fetchConversations: () => {
      wsHook.fetchConversations();
    },

    startNewConversation: (mode: ConversationMode = 'consult') => {
      wsHook.startNewConversation(mode);
    },

    deleteConversation: (conversationId: string) => {
      wsHook.deleteConversation(conversationId);
    },

    updateConversationMode: (conversationId: string, mode: ConversationMode) => {
      wsHook.updateConversationMode(conversationId, mode);
    },

    // Stream control
    abortStream: () => {
      wsHook.abortStream();
    },

    // Questionnaire generation
    generateQuestionnaire: (payload: GenerateQuestionnairePayload) => {
      wsHook.generateQuestionnaire(payload);
    },

    // Story 13.9.2: Export status resume
    requestExportStatus: (conversationId: string) => {
      wsHook.requestExportStatus(conversationId);
    },

    // Epic 16: Upload event subscriptions (delegate to wsHook)
    subscribeUploadProgress: wsHook.subscribeUploadProgress,
    subscribeIntakeContextReady: wsHook.subscribeIntakeContextReady,
    subscribeScoringParseReady: wsHook.subscribeScoringParseReady,
    // Epic 18: File attached subscription
    subscribeFileAttached: wsHook.subscribeFileAttached,

    // Epic 18.4.2b: Vendor clarification selection
    selectVendor: (conversationId: string, vendorName: string) => {
      wsHook.selectVendor(conversationId, vendorName);
    },
  }), [
    wsHook.isConnected,
    wsHook.isConnecting,
    wsHook.sendMessage,
    wsHook.requestHistory,
    wsHook.fetchConversations,
    wsHook.startNewConversation,
    wsHook.deleteConversation,
    wsHook.updateConversationMode,
    wsHook.abortStream,
    wsHook.generateQuestionnaire,
    wsHook.requestExportStatus,
    wsHook.connect,
    wsHook.disconnect,
    wsHook.subscribeUploadProgress,
    wsHook.subscribeIntakeContextReady,
    wsHook.subscribeScoringParseReady,
    wsHook.subscribeFileAttached,
    wsHook.selectVendor,
  ]);
}
