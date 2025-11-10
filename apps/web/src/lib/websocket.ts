import { io, Socket } from 'socket.io-client';

export interface WebSocketConfig {
  url: string;
  token?: string;
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

  sendMessage(content: string): void {
    if (!this.socket || !this.socket.connected) {
      throw new Error('WebSocket not connected');
    }
    this.socket.emit('send_message', { content });
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

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}
