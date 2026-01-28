import { WebSocketClient } from '../websocket';
import { io, Socket } from 'socket.io-client';

// Mock socket.io-client
jest.mock('socket.io-client');

describe('WebSocketClient', () => {
  let mockSocket: Partial<Socket>;
  const mockIo = io as jest.MockedFunction<typeof io>;

  beforeEach(() => {
    mockSocket = {
      connected: false,
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    mockIo.mockReturnValue(mockSocket as Socket);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates a client with config', () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
        token: 'test-token',
      });

      expect(client).toBeDefined();
    });
  });

  describe('connect', () => {
    it('establishes connection with correct config', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
        token: 'test-token',
      });

      // Trigger connect event immediately
      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await client.connect();

      expect(mockIo).toHaveBeenCalledWith(
        'http://localhost:8000/chat',
        expect.objectContaining({
          auth: { token: 'test-token', conversationId: undefined },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        })
      );
    });

    it('resolves when connection is successful', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await expect(client.connect()).resolves.toBeUndefined();
    });

    it('rejects when max reconnection attempts reached', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect_error') {
          // Simulate 5 failed connection attempts
          for (let i = 0; i < 5; i++) {
            setTimeout(() => (handler as (error: Error) => void)(new Error('Connection failed')), 0);
          }
        }
        return mockSocket as Socket;
      });

      await expect(client.connect()).rejects.toThrow('Max reconnection attempts reached');
    });

    it('rejects when reconnection fails', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'reconnect_failed') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await expect(client.connect()).rejects.toThrow('Failed to reconnect');
    });

    it('registers disconnect event handler', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      const onSpy = jest.fn();
      mockSocket.on = onSpy.mockReturnValue(mockSocket as Socket);

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await client.connect();

      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('registers reconnect event handler', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await client.connect();

      expect(mockSocket.on).toHaveBeenCalledWith('reconnect', expect.any(Function));
    });
  });

  describe('disconnect', () => {
    it('disconnects the socket', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await client.connect();
      client.disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('does nothing if socket is not connected', () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      expect(() => client.disconnect()).not.toThrow();
    });
  });

  describe('sendMessage', () => {
    it('sends message through socket', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      mockSocket.connected = true;

      await client.connect();
      client.sendMessage('Hello, world!', 'conv-123');

      expect(mockSocket.emit).toHaveBeenCalledWith('send_message', {
        conversationId: 'conv-123',
        content: 'Hello, world!',
      });
    });

    it('throws error if not connected', () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      expect(() => client.sendMessage('Hello', 'conv-123')).toThrow('WebSocket not connected');
    });
  });

  describe('onMessage', () => {
    it('registers message event listener', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await client.connect();

      const callback = jest.fn();
      client.onMessage(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('returns unsubscribe function', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await client.connect();

      const callback = jest.fn();
      const unsubscribe = client.onMessage(callback);

      unsubscribe();

      expect(mockSocket.off).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('throws error if socket not initialized', () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      expect(() => client.onMessage(jest.fn())).toThrow('WebSocket not initialized');
    });
  });

  describe('onMessageStream', () => {
    it('registers stream event listener', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await client.connect();

      const callback = jest.fn();
      client.onMessageStream(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('assistant_token', expect.any(Function));
    });

    it('returns unsubscribe function', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await client.connect();

      const callback = jest.fn();
      const unsubscribe = client.onMessageStream(callback);

      unsubscribe();

      expect(mockSocket.off).toHaveBeenCalledWith('assistant_token', expect.any(Function));
    });

    it('throws error if socket not initialized', () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      expect(() => client.onMessageStream(jest.fn())).toThrow('WebSocket not initialized');
    });
  });

  describe('onError', () => {
    it('registers error event listener', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await client.connect();

      const callback = jest.fn();
      client.onError(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('returns unsubscribe function', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await client.connect();

      const callback = jest.fn();
      const unsubscribe = client.onError(callback);

      unsubscribe();

      expect(mockSocket.off).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('throws error if socket not initialized', () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      expect(() => client.onError(jest.fn())).toThrow('WebSocket not initialized');
    });
  });

  describe('isConnected', () => {
    it('returns true when socket is connected', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      mockSocket.connected = true;

      await client.connect();

      expect(client.isConnected()).toBe(true);
    });

    it('returns false when socket is disconnected', () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      expect(client.isConnected()).toBe(false);
    });

    it('returns false after disconnect', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await client.connect();
      client.disconnect();

      expect(client.isConnected()).toBe(false);
    });
  });

  // Epic 32.2.1: Questionnaire progress subscription tests
  describe('onQuestionnaireProgress', () => {
    it('registers questionnaire_progress event listener', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await client.connect();

      const callback = jest.fn();
      client.onQuestionnaireProgress(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('questionnaire_progress', expect.any(Function));
    });

    it('returns unsubscribe function', async () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'connect') {
          setTimeout(() => (handler as () => void)(), 0);
        }
        return mockSocket as Socket;
      });

      await client.connect();

      const callback = jest.fn();
      const unsubscribe = client.onQuestionnaireProgress(callback);

      unsubscribe();

      expect(mockSocket.off).toHaveBeenCalledWith('questionnaire_progress', expect.any(Function));
    });

    it('throws error if socket not initialized', () => {
      const client = new WebSocketClient({
        url: 'http://localhost:8000',
      });

      expect(() => client.onQuestionnaireProgress(jest.fn())).toThrow('WebSocket not initialized');
    });
  });
});
