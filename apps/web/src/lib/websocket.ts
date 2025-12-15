import { io, Socket } from 'socket.io-client';
import type { GenerationPhasePayload } from '@guardian/shared';

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  mode: 'consult' | 'assessment';
}

export interface WebSocketConfig {
  url: string;
  token?: string;
  conversationId?: string; // Optional - resume existing conversation
  // Note: Event callbacks are now registered dynamically via methods (not config)
  // to prevent stale closure issues on component re-renders
}

export interface EmbeddedComponent {
  type: 'button' | 'link' | 'form' | 'download' | 'error';
  data: {
    label?: string;
    action?: string;
    url?: string;
    assessmentId?: string;
    formats?: Array<'pdf' | 'word' | 'excel'>;
    questionCount?: number;
    [key: string]: any;  // Allow additional properties for flexibility
  };
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  components?: EmbeddedComponent[];
  timestamp?: Date;
}

export interface StreamEvent {
  chunk: string;
  conversationId: string;
  messageId?: string;
}

export interface ErrorEvent {
  error: string;
  code?: string;
}

export interface ExportReadyPayload {
  conversationId: string;
  assessmentId: string;
  formats: Array<'pdf' | 'word' | 'excel'>;
  questionCount: number;
}

export interface ExtractionFailedPayload {
  conversationId: string;
  assessmentId: string;
  error: string;
}

// Story 13.9.2: Export status resume types
export interface ExportStatusNotFoundPayload {
  conversationId: string;
}

export interface ExportStatusErrorPayload {
  conversationId: string;
  error: string;
}

// Epic 16: Document upload event payloads
export interface UploadProgressEvent {
  conversationId: string;
  uploadId: string;
  progress: number;
  stage: 'storing' | 'parsing' | 'complete' | 'error';
  message: string;
  error?: string;
}

export interface IntakeContextResult {
  conversationId: string;
  uploadId: string;
  success: boolean;
  context: {
    vendorName: string | null;
    solutionName: string | null;
    solutionType: string | null;
    industry: string | null;
    features: string[];
    claims: string[];
    complianceMentions: string[];
  } | null;
  suggestedQuestions: string[];
  coveredCategories: string[];
  gapCategories: string[];
  confidence: number;
  error?: string;
}

export interface ScoringParseResult {
  conversationId: string;
  uploadId: string;
  success: boolean;
  assessmentId: string | null;
  vendorName: string | null;
  responseCount: number;
  expectedCount: number | null;
  isComplete: boolean;
  confidence: number;
  error?: string;
}

/**
 * Payload for questionnaire_ready event from backend
 */
export interface QuestionnaireReadyPayload {
  conversationId: string;
  assessmentType: 'quick' | 'comprehensive' | 'category_focused';
  vendorName: string | null;
  solutionName: string | null;
  contextSummary: string | null;
  estimatedQuestions: number | null;
  selectedCategories: string[] | null;
}

/**
 * Payload for generate_questionnaire event to backend
 */
export interface GenerateQuestionnairePayload {
  conversationId: string;
  assessmentType?: 'quick' | 'comprehensive' | 'category_focused';
  vendorName?: string | null;
  solutionName?: string | null;
  contextSummary?: string | null;
  selectedCategories?: string[] | null;
}

// Backend message format (what server sends)
interface BackendMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string | { text: string; components?: any[] };
  createdAt: string;
  components?: any[];
}

// Backend error format
interface BackendError {
  event: string;
  message: string;
}

/**
 * Normalize components from backend to UI format
 */
function normalizeComponents(components?: any[]): EmbeddedComponent[] | undefined {
  if (!components || !Array.isArray(components)) return undefined;

  return components
    .filter((c) => c && ['button', 'link', 'form', 'download', 'error'].includes(c.type))
    .map((c) => ({
      type: c.type as 'button' | 'link' | 'form' | 'download' | 'error',
      data: c.data && typeof c.data === 'object' ? c.data : {}, // Safe default
    }));
}

/**
 * Normalize message from backend format to UI format
 */
function normalizeMessage(backendMessage: BackendMessage): ChatMessage {
  // Handle content as string OR { text, components }
  let contentText: string;
  let components: EmbeddedComponent[] | undefined;

  if (typeof backendMessage.content === 'string') {
    contentText = backendMessage.content;
    components = normalizeComponents(backendMessage.components);
  } else if (backendMessage.content && typeof backendMessage.content === 'object') {
    contentText = backendMessage.content.text || '';
    components = normalizeComponents(backendMessage.content.components || backendMessage.components);
  } else {
    contentText = ''; // Fallback
  }

  return {
    id: backendMessage.id,
    role: backendMessage.role,
    content: contentText,
    components,
    timestamp: new Date(backendMessage.createdAt),
  };
}

/**
 * Normalize error from backend format to UI format
 */
function normalizeError(backendError: BackendError): ErrorEvent {
  return {
    error: backendError.message || 'Unknown error',
    code: backendError.event,
  };
}

export class WebSocketClient {
  private socket: Socket | null = null;
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(config: WebSocketConfig) {
    this.config = config;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.config.url, {
          auth: {
            token: this.config.token,
            conversationId: this.config.conversationId, // Pass conversationId to resume session
          },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: this.reconnectDelay,
          reconnectionAttempts: this.maxReconnectAttempts,
        });

        this.socket.on('connect', () => {
          console.log('[WebSocket] Connected');
          this.reconnectAttempts = 0;
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('[WebSocket] Connection error:', error);
          this.reconnectAttempts++;
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            reject(new Error('Max reconnection attempts reached'));
          }
        });

        this.socket.on('disconnect', (reason) => {
          console.log('[WebSocket] Disconnected:', reason);
        });

        this.socket.on('reconnect', (attemptNumber) => {
          console.log('[WebSocket] Reconnected after', attemptNumber, 'attempts');
          this.reconnectAttempts = 0;
        });

        this.socket.on('reconnect_failed', () => {
          console.error('[WebSocket] Reconnection failed');
          reject(new Error('Failed to reconnect'));
        });

        // Note: Conversation event listeners (conversations_list, conversation_created, etc.)
        // are now registered dynamically via methods in useWebSocket effect to prevent stale closures
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  sendMessage(content: string, conversationId: string): void {
    if (!this.socket || !this.socket.connected) {
      throw new Error('WebSocket not connected');
    }
    if (!conversationId) {
      throw new Error('conversationId is required');
    }
    this.socket.emit('send_message', {
      conversationId,
      content
    });
  }

  onMessage(callback: (message: ChatMessage) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (backendMessage: any) => {
      // Normalize backend message to UI format
      const normalized = normalizeMessage(backendMessage as BackendMessage);
      callback(normalized);
    };

    this.socket.on('message', handler);
    return () => {
      this.socket?.off('message', handler);
    };
  }

  onMessageStream(callback: (event: StreamEvent) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    // Listen to assistant_token events (backend emits these during streaming)
    const tokenHandler = (data: { token: string; conversationId: string; messageId?: string }) => {
      callback({
        chunk: data.token,
        conversationId: data.conversationId, // PASS conversationId to callback
        messageId: data.messageId,
      });
    };

    this.socket.on('assistant_token', tokenHandler);

    return () => {
      this.socket?.off('assistant_token', tokenHandler);
    };
  }

  onError(callback: (error: string) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (backendError: any) => {
      // Normalize backend error to UI format, then pass just the error string
      const normalized = normalizeError(backendError as BackendError);
      callback(normalized.error);
    };

    this.socket.on('error', handler);
    return () => {
      this.socket?.off('error', handler);
    };
  }

  onHistory(callback: (messages: ChatMessage[]) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: { conversationId: string; messages: any[] }) => {
      console.log('[WebSocket] history event received - conversationId:', data.conversationId, 'messages:', data.messages.length);
      const normalized = data.messages.map((msg: any) => normalizeMessage(msg as BackendMessage));
      console.log('[WebSocket] Normalized messages:', normalized.length);
      callback(normalized);
    };

    this.socket.on('history', handler);
    return () => {
      this.socket?.off('history', handler);
    };
  }

  onStreamComplete(callback: (data: { messageId: string; conversationId: string; fullText: string }) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    this.socket.on('assistant_done', callback);
    return () => {
      this.socket?.off('assistant_done', callback);
    };
  }

  requestHistory(conversationId: string, limit: number = 50): void {
    if (!this.socket || !this.socket.connected) {
      throw new Error('WebSocket not connected');
    }
    console.log('[WebSocket] Emitting get_history for conversation:', conversationId, 'limit:', limit);
    this.socket.emit('get_history', { conversationId, limit });
  }

  fetchConversations(): void {
    if (!this.socket || !this.socket.connected) {
      throw new Error('WebSocket not connected');
    }
    console.log('[WebSocket] Requesting conversations list');
    this.socket.emit('get_conversations');
  }

  startNewConversation(mode: 'consult' | 'assessment' = 'consult'): void {
    if (!this.socket || !this.socket.connected) {
      throw new Error('WebSocket not connected');
    }
    console.log('[WebSocket] Requesting new conversation');
    this.socket.emit('start_new_conversation', { mode });
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  abortStream(): void {
    if (!this.socket) {
      return;
    }
    console.log('[WebSocketClient] Aborting stream');
    this.socket.emit('abort_stream');
  }

  deleteConversation(conversationId: string): void {
    if (!this.socket || !this.socket.connected) {
      throw new Error('WebSocket not connected');
    }
    console.log('[WebSocketClient] Deleting conversation:', conversationId);
    this.socket.emit('delete_conversation', { conversationId });
  }

  switchMode(conversationId: string, mode: 'consult' | 'assessment'): void {
    if (!this.socket || !this.socket.connected) {
      throw new Error('WebSocket not connected');
    }
    console.log('[WebSocketClient] Switching mode for conversation:', conversationId, '→', mode);
    this.socket.emit('switch_mode', { conversationId, mode });
  }

  // Dynamic event subscription methods (follow onMessage/onHistory pattern)
  // These keep callbacks fresh on component re-renders

  onConversationsList(callback: (conversations: Conversation[]) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: { conversations: any[] }) => {
      console.log('[WebSocket] Received conversations list:', data.conversations.length);
      const normalized = data.conversations.map((conv) => ({
        id: conv.id,
        title: conv.title,
        createdAt: new Date(conv.createdAt),
        updatedAt: new Date(conv.updatedAt),
        mode: conv.mode as 'consult' | 'assessment',
      }));
      callback(normalized);
    };

    this.socket.on('conversations_list', handler);
    return () => {
      this.socket?.off('conversations_list', handler);
    };
  }

  onConversationCreated(callback: (conversation: Conversation) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: { conversation: any }) => {
      console.log('[WebSocket] New conversation created:', data.conversation.id);
      const normalized = {
        id: data.conversation.id,
        title: data.conversation.title,
        createdAt: new Date(data.conversation.createdAt),
        updatedAt: new Date(data.conversation.updatedAt),
        mode: data.conversation.mode as 'consult' | 'assessment',
      };
      callback(normalized);
    };

    this.socket.on('conversation_created', handler);
    return () => {
      this.socket?.off('conversation_created', handler);
    };
  }

  onConversationTitleUpdated(callback: (conversationId: string, title: string) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: { conversationId: string; title: string }) => {
      console.log('[WebSocket] Conversation title updated:', data.conversationId, data.title);
      callback(data.conversationId, data.title);
    };

    this.socket.on('conversation_title_updated', handler);
    return () => {
      this.socket?.off('conversation_title_updated', handler);
    };
  }

  onStreamAborted(callback: (conversationId: string) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: { conversationId: string }) => {
      console.log('[WebSocket] Stream aborted for conversation:', data.conversationId);
      callback(data.conversationId);
    };

    this.socket.on('stream_aborted', handler);
    return () => {
      this.socket?.off('stream_aborted', handler);
    };
  }

  onConversationDeleted(callback: (conversationId: string) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: { conversationId: string }) => {
      console.log('[WebSocket] Conversation deleted:', data.conversationId);
      callback(data.conversationId);
    };

    this.socket.on('conversation_deleted', handler);
    return () => {
      this.socket?.off('conversation_deleted', handler);
    };
  }

  onConnectionReady(callback: (data: { conversationId?: string; resumed: boolean; hasActiveConversation: boolean }) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: { conversationId?: string; resumed: boolean; hasActiveConversation: boolean }) => {
      console.log('[WebSocket] Connection ready:', {
        hasActiveConversation: data.hasActiveConversation,
        conversationId: data.conversationId,
        resumed: data.resumed
      });
      callback(data);
    };

    this.socket.on('connection_ready', handler);
    return () => {
      this.socket?.off('connection_ready', handler);
    };
  }

  onConversationModeUpdated(callback: (data: { conversationId: string; mode: 'consult' | 'assessment' }) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: { conversationId: string; mode: 'consult' | 'assessment' }) => {
      console.log('[WebSocket] Conversation mode updated:', data.conversationId, data.mode);
      callback(data);
    };

    this.socket.on('conversation_mode_updated', handler);
    return () => {
      this.socket?.off('conversation_mode_updated', handler);
    };
  }

  onExportReady(callback: (data: ExportReadyPayload) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: ExportReadyPayload) => {
      console.log('[WebSocket] Export ready:', data.assessmentId, data.questionCount, 'questions');
      callback(data);
    };

    this.socket.on('export_ready', handler);
    return () => {
      this.socket?.off('export_ready', handler);
    };
  }

  onExtractionFailed(callback: (data: ExtractionFailedPayload) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: ExtractionFailedPayload) => {
      console.log('[WebSocket] Extraction failed:', data.assessmentId, data.error);
      callback(data);
    };

    this.socket.on('extraction_failed', handler);
    return () => {
      this.socket?.off('extraction_failed', handler);
    };
  }

  /**
   * Listen for questionnaire_ready event
   * Called when Claude determines it's ready to generate
   *
   * @param callback - Function to call with payload
   * @returns Unsubscribe function
   */
  onQuestionnaireReady(
    callback: (data: QuestionnaireReadyPayload) => void
  ): () => void {
    if (!this.socket) {
      throw new Error('WebSocket not initialized');
    }

    const handler = (data: QuestionnaireReadyPayload) => {
      console.log('[WebSocket] Questionnaire ready:', data.conversationId);
      callback(data);
    };

    this.socket.on('questionnaire_ready', handler);

    // Return unsubscribe function
    return () => {
      this.socket?.off('questionnaire_ready', handler);
    };
  }

  /**
   * Emit generate_questionnaire event to trigger generation
   * Called when user clicks the "Generate" button
   *
   * @param payload - Full questionnaire generation payload with context
   */
  generateQuestionnaire(payload: GenerateQuestionnairePayload): void {
    if (!this.socket || !this.socket.connected) {
      throw new Error('WebSocket not connected');
    }

    console.log('[WebSocket] Requesting questionnaire generation:', payload.conversationId);

    this.socket.emit('generate_questionnaire', payload);
  }

  /**
   * Listen for generation_phase events (Story 13.5.3)
   * Emitted by backend at each phase boundary during questionnaire generation.
   *
   * @param callback - Function to call with phase payload
   * @returns Unsubscribe function
   */
  onGenerationPhase(callback: (data: GenerationPhasePayload) => void): () => void {
    if (!this.socket) {
      throw new Error('WebSocket not initialized');
    }

    const handler = (data: GenerationPhasePayload) => {
      console.log('[WebSocket] Generation phase:', data.phaseId, '(', data.phase, ')');
      callback(data);
    };

    this.socket.on('generation_phase', handler);

    return () => {
      this.socket?.off('generation_phase', handler);
    };
  }

  // Story 13.9.2: Export status resume methods

  /**
   * Request export status for a conversation (13.9.2)
   * Used to restore download buttons on session resume.
   */
  requestExportStatus(conversationId: string): void {
    if (!this.socket?.connected) {
      console.warn('[WebSocket] Cannot request export status: not connected');
      return;
    }
    console.log('[WebSocket] Requesting export status for:', conversationId);
    this.socket.emit('get_export_status', { conversationId });
  }

  /**
   * Subscribe to export_status_not_found events (13.9.2)
   * Called when server confirms no export exists for the conversation.
   */
  onExportStatusNotFound(
    callback: (data: ExportStatusNotFoundPayload) => void
  ): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: ExportStatusNotFoundPayload) => {
      console.log('[WebSocket] Export status not found:', data.conversationId);
      callback(data);
    };

    this.socket.on('export_status_not_found', handler);
    return () => this.socket?.off('export_status_not_found', handler);
  }

  /**
   * Subscribe to export_status_error events (13.9.2)
   * Called when server returns an error (auth, invalid input, etc.)
   */
  onExportStatusError(
    callback: (data: ExportStatusErrorPayload) => void
  ): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: ExportStatusErrorPayload) => {
      console.error('[WebSocket] Export status error:', data);
      callback(data);
    };

    this.socket.on('export_status_error', handler);
    return () => this.socket?.off('export_status_error', handler);
  }

  // Epic 16: Document upload event handlers

  /**
   * Subscribe to upload_progress events
   * Emitted by backend during document upload processing
   */
  onUploadProgress(callback: (data: UploadProgressEvent) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: UploadProgressEvent) => {
      console.log('[WebSocket] Upload progress:', data.stage, data.progress + '%');
      callback(data);
    };

    this.socket.on('upload_progress', handler);
    return () => this.socket?.off('upload_progress', handler);
  }

  /**
   * Subscribe to intake_context_ready events
   * Emitted when intake document parsing completes
   */
  onIntakeContextReady(callback: (data: IntakeContextResult) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: IntakeContextResult) => {
      console.log('[WebSocket] Intake context ready:', data.success ? 'success' : 'failed');
      callback(data);
    };

    this.socket.on('intake_context_ready', handler);
    return () => this.socket?.off('intake_context_ready', handler);
  }

  /**
   * Subscribe to scoring_parse_ready events
   * Emitted when scoring document parsing completes
   */
  onScoringParseReady(callback: (data: ScoringParseResult) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    const handler = (data: ScoringParseResult) => {
      console.log('[WebSocket] Scoring parse ready:', data.success ? 'success' : 'failed');
      callback(data);
    };

    this.socket.on('scoring_parse_ready', handler);
    return () => this.socket?.off('scoring_parse_ready', handler);
  }

}
