'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketClient, ChatMessage, StreamEvent } from '@/lib/websocket';

export interface UseWebSocketOptions {
  url: string;
  token?: string;
  onMessage?: (message: ChatMessage) => void;
  onMessageStream?: (chunk: string, messageId?: string) => void;
  onError?: (error: string) => void;
  autoConnect?: boolean;
}

export function useWebSocket({
  url,
  token,
  onMessage,
  onMessageStream,
  onError,
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
      const client = new WebSocketClient({ url, token });
      await client.connect();
      clientRef.current = client;
      setIsConnected(true);
    } catch (error) {
      console.error('[useWebSocket] Connection failed:', error);
      onError?.('Failed to connect to server');
    } finally {
      setIsConnecting(false);
    }
  }, [url, token, isConnecting, isConnected, onError]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      if (!clientRef.current || !isConnected) {
        throw new Error('WebSocket not connected');
      }
      clientRef.current.sendMessage(content);
    },
    [isConnected]
  );

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
        onMessageStream(event.chunk, event.messageId);
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

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [isConnected, onMessage, onMessageStream, onError]);

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

  return {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    sendMessage,
  };
}
