import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  const mockSocket = {
    connected: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };

  return {
    io: jest.fn(() => mockSocket),
    __mockSocket: mockSocket,
  };
});

interface MockSocket {
  connected: boolean;
  connect: jest.Mock;
  disconnect: jest.Mock;
  emit: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
}

describe('useWebSocket', () => {
  const mockUrl = 'http://localhost:8000';
  let mockSocket: MockSocket;

  beforeEach(() => {
    const { io } = require('socket.io-client');
    mockSocket = io();
    jest.clearAllMocks();
  });

  it('connects to WebSocket on mount when autoConnect is true', async () => {
    renderHook(() =>
      useWebSocket({
        url: mockUrl,
        token: 'test-token',
        autoConnect: true,
      })
    );

    await waitFor(() => {
      expect(require('socket.io-client').io).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({
          transports: ['websocket', 'polling'],
        })
      );
    });
  });

  it('does not connect on mount when autoConnect is false', () => {
    renderHook(() =>
      useWebSocket({
        url: mockUrl,
        autoConnect: false,
      })
    );

    expect(require('socket.io-client').io).not.toHaveBeenCalled();
  });

  it('exposes sendMessage function', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: mockUrl,
        autoConnect: false,
      })
    );

    expect(result.current.sendMessage).toBeDefined();
    expect(typeof result.current.sendMessage).toBe('function');
  });

  it('exposes connect and disconnect functions', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: mockUrl,
        autoConnect: false,
      })
    );

    expect(result.current.connect).toBeDefined();
    expect(result.current.disconnect).toBeDefined();
    expect(typeof result.current.connect).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
  });

  it('provides connection status', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: mockUrl,
        autoConnect: false,
      })
    );

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);
  });
});
