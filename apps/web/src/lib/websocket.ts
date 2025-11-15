import { io, Socket } from 'socket.io-client';

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
  onConversationsList?: (conversations: Conversation[]) => void;
  onConversationCreated?: (conversation: Conversation) => void;
  onConversationTitleUpdated?: (conversationId: string, title: string) => void;
}

export interface EmbeddedComponent {
  type: 'button' | 'link' | 'form';
  data: {
    label?: string;
    action?: string;
    url?: string;
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
    .filter((c) => c && ['button', 'link', 'form'].includes(c.type))
    .map((c) => ({
      type: c.type as 'button' | 'link' | 'form',
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

        // Listen for conversations_list events
        this.socket.on('conversations_list', (data: { conversations: any[] }) => {
          console.log('[WebSocket] Received conversations list:', data.conversations.length);
          const normalized = data.conversations.map((conv) => ({
            id: conv.id,
            title: conv.title,
            createdAt: new Date(conv.createdAt),
            updatedAt: new Date(conv.updatedAt),
            mode: conv.mode as 'consult' | 'assessment',
          }));
          this.config.onConversationsList?.(normalized);
        });

        // Listen for conversation_created events
        this.socket.on('conversation_created', (data: { conversation: any }) => {
          console.log('[WebSocket] New conversation created:', data.conversation.id);
          const normalized = {
            id: data.conversation.id,
            title: data.conversation.title,
            createdAt: new Date(data.conversation.createdAt),
            updatedAt: new Date(data.conversation.updatedAt),
            mode: data.conversation.mode as 'consult' | 'assessment',
          };
          this.config.onConversationCreated?.(normalized);
        });

        // Listen for conversation_title_updated events
        this.socket.on('conversation_title_updated', (data: { conversationId: string; title: string }) => {
          console.log('[WebSocket] Conversation title updated:', data.conversationId, data.title);
          this.config.onConversationTitleUpdated?.(data.conversationId, data.title);
        });
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

  onConnected(callback: (data: { conversationId: string; resumed: boolean; message: string }) => void): () => void {
    if (!this.socket) throw new Error('WebSocket not initialized');

    this.socket.on('connected', callback);
    return () => {
      this.socket?.off('connected', callback);
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
}
