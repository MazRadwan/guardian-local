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
});
