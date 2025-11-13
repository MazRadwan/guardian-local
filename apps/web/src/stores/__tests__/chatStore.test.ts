import { renderHook, act } from '@testing-library/react';
import { useChatStore } from '../chatStore';
import { ChatMessage } from '@/lib/websocket';

describe('chatStore', () => {
  beforeEach(() => {
    // Reset store before each test
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.clearMessages();
    });
  });

  it('initializes with empty state', () => {
    const { result } = renderHook(() => useChatStore());

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.currentStreamingMessage).toBeNull();
  });

  it('adds a message', () => {
    const { result } = renderHook(() => useChatStore());

    const message: ChatMessage = {
      role: 'user',
      content: 'Hello',
      timestamp: new Date(),
    };

    act(() => {
      result.current.addMessage(message);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toEqual(message);
  });

  it('adds multiple messages', () => {
    const { result } = renderHook(() => useChatStore());

    const message1: ChatMessage = {
      role: 'user',
      content: 'Hello',
      timestamp: new Date(),
    };

    const message2: ChatMessage = {
      role: 'assistant',
      content: 'Hi there!',
      timestamp: new Date(),
    };

    act(() => {
      result.current.addMessage(message1);
      result.current.addMessage(message2);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toEqual(message1);
    expect(result.current.messages[1]).toEqual(message2);
  });

  it('updates last message content', () => {
    const { result } = renderHook(() => useChatStore());

    const message: ChatMessage = {
      role: 'assistant',
      content: 'Initial content',
      timestamp: new Date(),
    };

    act(() => {
      result.current.addMessage(message);
      result.current.updateLastMessage('Updated content');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Updated content');
  });

  it('appends to last message', () => {
    const { result } = renderHook(() => useChatStore());

    const message: ChatMessage = {
      role: 'assistant',
      content: 'Hello',
      timestamp: new Date(),
    };

    act(() => {
      result.current.addMessage(message);
      result.current.appendToLastMessage(' world');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Hello world');
  });

  it('appends multiple chunks to last message', () => {
    const { result } = renderHook(() => useChatStore());

    const message: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    act(() => {
      result.current.addMessage(message);
      result.current.appendToLastMessage('Hello');
      result.current.appendToLastMessage(' ');
      result.current.appendToLastMessage('world');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Hello world');
  });

  it('starts streaming by adding empty assistant message', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.startStreaming();
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('assistant');
    expect(result.current.messages[0].content).toBe('');
    expect(result.current.currentStreamingMessage).toBe('');
  });

  it('finishes streaming', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.startStreaming();
      result.current.finishStreaming();
    });

    expect(result.current.currentStreamingMessage).toBeNull();
  });

  it('sets loading state', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.setLoading(true);
    });

    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.setLoading(false);
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('sets error message', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.setError('Connection failed');
    });

    expect(result.current.error).toBe('Connection failed');
  });

  it('clears error message', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.setError('Connection failed');
      result.current.setError(null);
    });

    expect(result.current.error).toBeNull();
  });

  it('clears all messages', () => {
    const { result } = renderHook(() => useChatStore());

    const message1: ChatMessage = {
      role: 'user',
      content: 'Hello',
      timestamp: new Date(),
    };

    const message2: ChatMessage = {
      role: 'assistant',
      content: 'Hi there!',
      timestamp: new Date(),
    };

    act(() => {
      result.current.addMessage(message1);
      result.current.addMessage(message2);
      result.current.setError('Some error');
      result.current.clearMessages();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('handles empty messages array when updating last message', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.updateLastMessage('New content');
    });

    // Should not crash, messages should still be empty
    expect(result.current.messages).toEqual([]);
  });

  it('handles empty messages array when appending to last message', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.appendToLastMessage('chunk');
    });

    // Should not crash, messages should still be empty
    expect(result.current.messages).toEqual([]);
  });

  it('preserves message properties when updating', () => {
    const { result } = renderHook(() => useChatStore());

    const message: ChatMessage = {
      id: 'test-id',
      role: 'assistant',
      content: 'Original',
      timestamp: new Date('2024-01-01'),
      components: [{ type: 'button', data: { label: 'Test' } }],
    };

    act(() => {
      result.current.addMessage(message);
      result.current.updateLastMessage('Updated');
    });

    const updatedMessage = result.current.messages[0];
    expect(updatedMessage.id).toBe('test-id');
    expect(updatedMessage.role).toBe('assistant');
    expect(updatedMessage.content).toBe('Updated');
    expect(updatedMessage.timestamp).toEqual(new Date('2024-01-01'));
    expect(updatedMessage.components).toEqual([{ type: 'button', data: { label: 'Test' } }]);
  });

  it('preserves message properties when appending', () => {
    const { result } = renderHook(() => useChatStore());

    const message: ChatMessage = {
      id: 'test-id',
      role: 'assistant',
      content: 'Hello',
      timestamp: new Date('2024-01-01'),
    };

    act(() => {
      result.current.addMessage(message);
      result.current.appendToLastMessage(' world');
    });

    const updatedMessage = result.current.messages[0];
    expect(updatedMessage.id).toBe('test-id');
    expect(updatedMessage.role).toBe('assistant');
    expect(updatedMessage.content).toBe('Hello world');
    expect(updatedMessage.timestamp).toEqual(new Date('2024-01-01'));
  });

  describe('Sidebar State Management', () => {
    it('initializes with correct sidebar defaults', () => {
      const { result } = renderHook(() => useChatStore());

      // sidebarOpen defaults based on viewport (tested in separate test)
      expect(typeof result.current.sidebarOpen).toBe('boolean');
      expect(result.current.sidebarMinimized).toBe(false);
    });

    it('toggles sidebar open/closed state', () => {
      const { result } = renderHook(() => useChatStore());

      const initialState = result.current.sidebarOpen;

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.sidebarOpen).toBe(!initialState);

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.sidebarOpen).toBe(initialState);
    });

    it('sets sidebar open state explicitly', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setSidebarOpen(true);
      });

      expect(result.current.sidebarOpen).toBe(true);

      act(() => {
        result.current.setSidebarOpen(false);
      });

      expect(result.current.sidebarOpen).toBe(false);
    });

    it('toggles sidebar minimized state', () => {
      const { result } = renderHook(() => useChatStore());

      // Initially not minimized
      expect(result.current.sidebarMinimized).toBe(false);

      act(() => {
        result.current.toggleSidebarMinimized();
      });

      expect(result.current.sidebarMinimized).toBe(true);

      act(() => {
        result.current.toggleSidebarMinimized();
      });

      expect(result.current.sidebarMinimized).toBe(false);
    });

    it('sets sidebar minimized state explicitly', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setSidebarMinimized(true);
      });

      expect(result.current.sidebarMinimized).toBe(true);

      act(() => {
        result.current.setSidebarMinimized(false);
      });

      expect(result.current.sidebarMinimized).toBe(false);
    });
  });

  describe('Persistence', () => {
    beforeEach(() => {
      // Clear localStorage before each test
      localStorage.clear();
    });

    it('persists sidebar minimized state to localStorage', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setSidebarMinimized(true);
      });

      // Check localStorage
      const storedData = localStorage.getItem('guardian-chat-store');
      expect(storedData).toBeTruthy();

      if (storedData) {
        const parsed = JSON.parse(storedData);
        expect(parsed.state.sidebarMinimized).toBe(true);
      }
    });

    it('does not persist sidebar open state (by design)', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setSidebarOpen(true);
      });

      // Check localStorage
      const storedData = localStorage.getItem('guardian-chat-store');

      if (storedData) {
        const parsed = JSON.parse(storedData);
        // sidebarOpen should not be in persisted state
        expect(parsed.state.sidebarOpen).toBeUndefined();
      }
    });

    it('does not persist messages (by design)', () => {
      const { result } = renderHook(() => useChatStore());

      const message: ChatMessage = {
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
      };

      act(() => {
        result.current.addMessage(message);
      });

      // Check localStorage
      const storedData = localStorage.getItem('guardian-chat-store');

      if (storedData) {
        const parsed = JSON.parse(storedData);
        // messages should not be in persisted state
        expect(parsed.state.messages).toBeUndefined();
      }
    });

    it('loads persisted sidebar minimized state on mount', () => {
      // Set up localStorage with persisted state
      const persistedState = {
        state: {
          sidebarMinimized: true,
        },
        version: 0,
      };
      localStorage.setItem('guardian-chat-store', JSON.stringify(persistedState));

      // Create new store instance
      const { result } = renderHook(() => useChatStore());

      // Should load persisted state
      expect(result.current.sidebarMinimized).toBe(true);
    });
  });
});
