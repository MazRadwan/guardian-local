import { renderHook, act } from '@testing-library/react';
import { useChatStore } from '../chatStore';
import { ChatMessage, EmbeddedComponent, ExportReadyPayload } from '@/lib/websocket';

describe('chatStore', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    // Reset store state before each test
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.clearMessages();
      result.current.setConversations([]);
      result.current.setActiveConversation(null);
      result.current.setSidebarMinimized(false);
      // Clear export ready state for all conversations
      Object.keys(result.current.exportReadyByConversation).forEach((convId) => {
        result.current.clearExportReady(convId);
      });
      // Reset questionnaire UI state (Story 4.3.1)
      result.current.setQuestionnaireUIState('hidden');
      result.current.setQuestionnaireError(null);
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

  it('appends streaming chunks and creates assistant placeholder when needed', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.appendStreamingChunk('Hello');
      result.current.appendStreamingChunk(' world');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('assistant');
    expect(result.current.messages[0].content).toBe('Hello world');
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.currentStreamingMessage).toBe('Hello world');
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
    expect(result.current.isStreaming).toBe(true);
  });

  it('finishes streaming', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.startStreaming();
      result.current.finishStreaming();
    });

    expect(result.current.currentStreamingMessage).toBeNull();
    expect(result.current.isStreaming).toBe(false);
  });

  it('isStreaming initializes to false', () => {
    const { result } = renderHook(() => useChatStore());
    expect(result.current.isStreaming).toBe(false);
  });

  it('isStreaming set to true when startStreaming called', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.startStreaming();
    });

    expect(result.current.isStreaming).toBe(true);
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

    it('persisted state includes only sidebar and active conversation ID (not conversations)', () => {
      const { result } = renderHook(() => useChatStore());

      const mockConversation = {
        id: 'conv-123',
        title: 'Test Conversation',
        createdAt: new Date('2025-01-13T10:00:00Z'),
        updatedAt: new Date('2025-01-13T10:00:00Z'),
        mode: 'consult' as const,
      };

      act(() => {
        result.current.setSidebarMinimized(true);
        result.current.setActiveConversation('conv-123');
        result.current.addConversation(mockConversation);
      });

      // Check localStorage contains only sidebar and active conversation ID
      const stored = localStorage.getItem('guardian-chat-store');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);

      // Verify only two keys are persisted (NOT conversations)
      expect(parsed.state).toHaveProperty('sidebarMinimized');
      expect(parsed.state).toHaveProperty('activeConversationId');
      expect(parsed.state).not.toHaveProperty('conversations');

      // Verify correct values
      expect(parsed.state.sidebarMinimized).toBe(true);
      expect(parsed.state.activeConversationId).toBe('conv-123');
    });

    it('persists active conversation ID to localStorage', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setActiveConversation('conv-123');
      });

      // Check localStorage
      const stored = localStorage.getItem('guardian-chat-store');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.state.activeConversationId).toBe('conv-123');
    });

    it('does not persist conversations array (fetched from backend)', () => {
      const { result } = renderHook(() => useChatStore());

      const mockConversation = {
        id: 'conv-123',
        title: 'Test Conversation',
        createdAt: new Date('2025-01-13T10:00:00Z'),
        updatedAt: new Date('2025-01-13T10:00:00Z'),
        mode: 'consult' as const,
      };

      const mockConversation2 = {
        id: 'conv-456',
        title: 'Another Conversation',
        createdAt: new Date('2025-01-13T11:00:00Z'),
        updatedAt: new Date('2025-01-13T11:00:00Z'),
        mode: 'assessment' as const,
      };

      act(() => {
        result.current.addConversation(mockConversation);
        result.current.addConversation(mockConversation2);
      });

      // Check localStorage - conversations should NOT be persisted
      const stored = localStorage.getItem('guardian-chat-store');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);

      // Conversations should NOT be in persisted state
      expect(parsed.state.conversations).toBeUndefined();
    });
  });

  // Conversation management
  describe('Conversation Management', () => {
    const mockConversation = {
      id: 'conv-123',
      title: 'Test Conversation',
      createdAt: new Date('2025-01-13T10:00:00Z'),
      updatedAt: new Date('2025-01-13T10:00:00Z'),
      mode: 'consult' as const,
      messageCount: 5,
    };

    const mockConversation2 = {
      id: 'conv-456',
      title: 'Another Conversation',
      createdAt: new Date('2025-01-13T11:00:00Z'),
      updatedAt: new Date('2025-01-13T11:00:00Z'),
      mode: 'assessment' as const,
      messageCount: 3,
    };

    it('initializes with empty conversations array', () => {
      const { result } = renderHook(() => useChatStore());

      expect(result.current.conversations).toEqual([]);
      expect(result.current.activeConversationId).toBeNull();
    });

    it('adds a conversation', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.addConversation(mockConversation);
      });

      expect(result.current.conversations).toHaveLength(1);
      expect(result.current.conversations[0]).toEqual(mockConversation);
    });

    it('adds multiple conversations', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.addConversation(mockConversation);
        result.current.addConversation(mockConversation2);
      });

      expect(result.current.conversations).toHaveLength(2);
      expect(result.current.conversations[0]).toEqual(mockConversation);
      expect(result.current.conversations[1]).toEqual(mockConversation2);
    });

    it('sets active conversation ID', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setActiveConversation('conv-123');
      });

      expect(result.current.activeConversationId).toBe('conv-123');
    });

    it('deletes a conversation', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.addConversation(mockConversation);
        result.current.addConversation(mockConversation2);
      });

      expect(result.current.conversations).toHaveLength(2);

      act(() => {
        result.current.deleteConversation('conv-123');
      });

      expect(result.current.conversations).toHaveLength(1);
      expect(result.current.conversations[0].id).toBe('conv-456');
    });

    it('clears active conversation ID when deleting active conversation', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.addConversation(mockConversation);
        result.current.setActiveConversation('conv-123');
      });

      expect(result.current.activeConversationId).toBe('conv-123');

      act(() => {
        result.current.deleteConversation('conv-123');
      });

      expect(result.current.activeConversationId).toBeNull();
      expect(result.current.conversations).toHaveLength(0);
    });

    it('preserves active conversation ID when deleting different conversation', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.addConversation(mockConversation);
        result.current.addConversation(mockConversation2);
        result.current.setActiveConversation('conv-123');
      });

      expect(result.current.activeConversationId).toBe('conv-123');

      act(() => {
        result.current.deleteConversation('conv-456');
      });

      expect(result.current.activeConversationId).toBe('conv-123');
      expect(result.current.conversations).toHaveLength(1);
    });

    it('updates conversation title', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.addConversation(mockConversation);
      });

      const originalUpdatedAt = result.current.conversations[0].updatedAt;

      act(() => {
        result.current.updateConversationTitle('conv-123', 'New Title');
      });

      expect(result.current.conversations[0].title).toBe('New Title');
      expect(result.current.conversations[0].updatedAt).not.toEqual(originalUpdatedAt);
    });

    it('does not update title of non-existent conversation', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.addConversation(mockConversation);
      });

      act(() => {
        result.current.updateConversationTitle('non-existent', 'New Title');
      });

      expect(result.current.conversations[0].title).toBe('Test Conversation');
    });

    it('sets conversations array (replaces all)', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.addConversation(mockConversation);
      });

      expect(result.current.conversations).toHaveLength(1);

      const newConversations = [mockConversation2];

      act(() => {
        result.current.setConversations(newConversations);
      });

      expect(result.current.conversations).toHaveLength(1);
      expect(result.current.conversations[0]).toEqual(mockConversation2);
    });
  });

  describe('appendComponentToLastAssistantMessage', () => {
    it('appends component to last assistant message', () => {
      const { result } = renderHook(() => useChatStore());

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: 'Here is a questionnaire',
        timestamp: new Date(),
      };

      const component: EmbeddedComponent = {
        type: 'download',
        data: {
          assessmentId: 'assess-123',
          formats: ['pdf', 'word'],
          questionCount: 10,
        },
      };

      act(() => {
        result.current.addMessage(assistantMessage);
        result.current.appendComponentToLastAssistantMessage(component);
      });

      expect(result.current.messages[0].components).toHaveLength(1);
      expect(result.current.messages[0].components![0]).toEqual(component);
    });

    it('finds the last assistant message when user message is last', () => {
      const { result } = renderHook(() => useChatStore());

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: 'Here is a questionnaire',
        timestamp: new Date(),
      };

      const userMessage: ChatMessage = {
        role: 'user',
        content: 'Thanks!',
        timestamp: new Date(),
      };

      const component: EmbeddedComponent = {
        type: 'download',
        data: {
          assessmentId: 'assess-123',
          formats: ['pdf'],
          questionCount: 5,
        },
      };

      act(() => {
        result.current.addMessage(assistantMessage);
        result.current.addMessage(userMessage);
        result.current.appendComponentToLastAssistantMessage(component);
      });

      // Component should be added to the assistant message, not user message
      expect(result.current.messages[0].components).toHaveLength(1);
      expect(result.current.messages[1].components).toBeUndefined();
    });

    it('deduplicates components with same type and assessmentId', () => {
      const { result } = renderHook(() => useChatStore());

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: 'Here is a questionnaire',
        timestamp: new Date(),
      };

      const component: EmbeddedComponent = {
        type: 'download',
        data: {
          assessmentId: 'assess-123',
          formats: ['pdf', 'word'],
          questionCount: 10,
        },
      };

      act(() => {
        result.current.addMessage(assistantMessage);
        result.current.appendComponentToLastAssistantMessage(component);
        // Try to add the same component again
        result.current.appendComponentToLastAssistantMessage(component);
      });

      // Should only have one component (duplicate rejected)
      expect(result.current.messages[0].components).toHaveLength(1);
    });

    it('handles empty messages array gracefully', () => {
      const { result } = renderHook(() => useChatStore());

      const component: EmbeddedComponent = {
        type: 'download',
        data: {
          assessmentId: 'assess-123',
          formats: ['pdf'],
          questionCount: 5,
        },
      };

      // Should not crash
      act(() => {
        result.current.appendComponentToLastAssistantMessage(component);
      });

      expect(result.current.messages).toEqual([]);
    });

    it('handles messages with no assistant messages gracefully', () => {
      const { result } = renderHook(() => useChatStore());

      const userMessage: ChatMessage = {
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      };

      const component: EmbeddedComponent = {
        type: 'download',
        data: {
          assessmentId: 'assess-123',
          formats: ['pdf'],
          questionCount: 5,
        },
      };

      act(() => {
        result.current.addMessage(userMessage);
        result.current.appendComponentToLastAssistantMessage(component);
      });

      // User message should not have components added
      expect(result.current.messages[0].components).toBeUndefined();
    });
  });

  describe('Export Ready State Management', () => {
    const mockExportPayload: ExportReadyPayload = {
      conversationId: 'conv-123',
      assessmentId: 'assess-456',
      formats: ['pdf', 'word', 'excel'],
      questionCount: 25,
    };

    it('initializes with empty exportReadyByConversation', () => {
      const { result } = renderHook(() => useChatStore());

      expect(result.current.exportReadyByConversation).toEqual({});
    });

    it('sets export ready for a conversation', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setExportReady('conv-123', mockExportPayload);
      });

      expect(result.current.exportReadyByConversation['conv-123']).toEqual(mockExportPayload);
    });

    it('sets export ready for multiple conversations', () => {
      const { result } = renderHook(() => useChatStore());

      const mockExportPayload2: ExportReadyPayload = {
        conversationId: 'conv-456',
        assessmentId: 'assess-789',
        formats: ['pdf'],
        questionCount: 10,
      };

      act(() => {
        result.current.setExportReady('conv-123', mockExportPayload);
        result.current.setExportReady('conv-456', mockExportPayload2);
      });

      expect(Object.keys(result.current.exportReadyByConversation)).toHaveLength(2);
      expect(result.current.exportReadyByConversation['conv-123']).toEqual(mockExportPayload);
      expect(result.current.exportReadyByConversation['conv-456']).toEqual(mockExportPayload2);
    });

    it('clears export ready for a conversation', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setExportReady('conv-123', mockExportPayload);
        result.current.clearExportReady('conv-123');
      });

      expect(result.current.exportReadyByConversation['conv-123']).toBeUndefined();
    });

    it('clears export ready for one conversation without affecting others', () => {
      const { result } = renderHook(() => useChatStore());

      const mockExportPayload2: ExportReadyPayload = {
        conversationId: 'conv-456',
        assessmentId: 'assess-789',
        formats: ['pdf'],
        questionCount: 10,
      };

      act(() => {
        result.current.setExportReady('conv-123', mockExportPayload);
        result.current.setExportReady('conv-456', mockExportPayload2);
        result.current.clearExportReady('conv-123');
      });

      expect(result.current.exportReadyByConversation['conv-123']).toBeUndefined();
      expect(result.current.exportReadyByConversation['conv-456']).toEqual(mockExportPayload2);
    });

    it('getExportReady returns payload for existing conversation', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setExportReady('conv-123', mockExportPayload);
      });

      const payload = result.current.getExportReady('conv-123');
      expect(payload).toEqual(mockExportPayload);
    });

    it('getExportReady returns undefined for non-existent conversation', () => {
      const { result } = renderHook(() => useChatStore());

      const payload = result.current.getExportReady('non-existent');
      expect(payload).toBeUndefined();
    });

    it('clearing non-existent conversation does not throw', () => {
      const { result } = renderHook(() => useChatStore());

      // Should not throw
      act(() => {
        result.current.clearExportReady('non-existent');
      });

      expect(result.current.exportReadyByConversation).toEqual({});
    });
  });

  describe('Questionnaire UI State Management (Story 4.3.1)', () => {
    it('initializes with hidden state and no error', () => {
      const { result } = renderHook(() => useChatStore());

      expect(result.current.questionnaireUIState).toBe('hidden');
      expect(result.current.questionnaireError).toBeNull();
    });

    it('setQuestionnaireUIState updates state correctly', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setQuestionnaireUIState('ready');
      });

      expect(result.current.questionnaireUIState).toBe('ready');

      act(() => {
        result.current.setQuestionnaireUIState('generating');
      });

      expect(result.current.questionnaireUIState).toBe('generating');

      act(() => {
        result.current.setQuestionnaireUIState('download');
      });

      expect(result.current.questionnaireUIState).toBe('download');
    });

    it('setQuestionnaireError stores error message', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setQuestionnaireError('Generation failed');
      });

      expect(result.current.questionnaireError).toBe('Generation failed');

      act(() => {
        result.current.setQuestionnaireError(null);
      });

      expect(result.current.questionnaireError).toBeNull();
    });

    it('state transitions: hidden → ready → generating → download', () => {
      const { result } = renderHook(() => useChatStore());

      // Initial state
      expect(result.current.questionnaireUIState).toBe('hidden');

      // Questionnaire ready
      act(() => {
        result.current.setQuestionnaireUIState('ready');
      });
      expect(result.current.questionnaireUIState).toBe('ready');

      // User clicks generate
      act(() => {
        result.current.setQuestionnaireUIState('generating');
      });
      expect(result.current.questionnaireUIState).toBe('generating');

      // Generation complete
      act(() => {
        result.current.setQuestionnaireUIState('download');
      });
      expect(result.current.questionnaireUIState).toBe('download');
    });

    it('state transitions: generating → error → ready (retry)', () => {
      const { result } = renderHook(() => useChatStore());

      // Start generation
      act(() => {
        result.current.setQuestionnaireUIState('generating');
      });
      expect(result.current.questionnaireUIState).toBe('generating');

      // Generation fails
      act(() => {
        result.current.setQuestionnaireUIState('error');
        result.current.setQuestionnaireError('API timeout');
      });
      expect(result.current.questionnaireUIState).toBe('error');
      expect(result.current.questionnaireError).toBe('API timeout');

      // User retries
      act(() => {
        result.current.setQuestionnaireUIState('ready');
        result.current.setQuestionnaireError(null);
      });
      expect(result.current.questionnaireUIState).toBe('ready');
      expect(result.current.questionnaireError).toBeNull();
    });

    it('error state clears when returning to ready', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setQuestionnaireUIState('error');
        result.current.setQuestionnaireError('Something went wrong');
      });

      expect(result.current.questionnaireError).toBe('Something went wrong');

      act(() => {
        result.current.setQuestionnaireUIState('ready');
        result.current.setQuestionnaireError(null);
      });

      expect(result.current.questionnaireError).toBeNull();
    });
  });

  // Story 13.4.2: Stepper State Tests
  describe('Stepper State (Story 13.4.2)', () => {
    it('initializes with default generation steps', () => {
      const { result } = renderHook(() => useChatStore());

      expect(result.current.generationSteps).toEqual([
        { id: 'context', label: 'Context gathered' },
        { id: 'generating', label: 'Generating questions' },
        { id: 'validating', label: 'Validating structure' },
        { id: 'saving', label: 'Saving assessment' },
      ]);
    });

    it('initializes with currentGenerationStep at -1 (idle)', () => {
      const { result } = renderHook(() => useChatStore());

      expect(result.current.currentGenerationStep).toBe(-1);
    });

    it('setCurrentGenerationStep updates the step index', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setCurrentGenerationStep(0);
      });
      expect(result.current.currentGenerationStep).toBe(0);

      act(() => {
        result.current.setCurrentGenerationStep(1);
      });
      expect(result.current.currentGenerationStep).toBe(1);

      act(() => {
        result.current.setCurrentGenerationStep(2);
      });
      expect(result.current.currentGenerationStep).toBe(2);

      act(() => {
        result.current.setCurrentGenerationStep(3);
      });
      expect(result.current.currentGenerationStep).toBe(3);
    });

    it('setCurrentGenerationStep can go beyond steps length (completion)', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setCurrentGenerationStep(4);
      });
      expect(result.current.currentGenerationStep).toBe(4);
      expect(result.current.currentGenerationStep).toBeGreaterThanOrEqual(
        result.current.generationSteps.length
      );
    });

    it('resetGenerationStep resets to -1', () => {
      const { result } = renderHook(() => useChatStore());

      // Set to some value first
      act(() => {
        result.current.setCurrentGenerationStep(2);
      });
      expect(result.current.currentGenerationStep).toBe(2);

      // Reset
      act(() => {
        result.current.resetGenerationStep();
      });
      expect(result.current.currentGenerationStep).toBe(-1);
    });

    it('setActiveConversation resets generation step to -1', () => {
      const { result } = renderHook(() => useChatStore());

      // Set generation step
      act(() => {
        result.current.setCurrentGenerationStep(2);
      });
      expect(result.current.currentGenerationStep).toBe(2);

      // Switch conversation
      act(() => {
        result.current.setActiveConversation('new-conv-123');
      });

      // Step should be reset
      expect(result.current.currentGenerationStep).toBe(-1);
    });

    it('stepper can progress through all steps', () => {
      const { result } = renderHook(() => useChatStore());

      // Simulate generation progress
      const steps = result.current.generationSteps;

      steps.forEach((_, index) => {
        act(() => {
          result.current.setCurrentGenerationStep(index);
        });
        expect(result.current.currentGenerationStep).toBe(index);
      });

      // Mark as complete (beyond last step)
      act(() => {
        result.current.setCurrentGenerationStep(steps.length);
      });
      expect(result.current.currentGenerationStep).toBe(steps.length);
    });

    it('stepper state persists across renders', () => {
      const { result, rerender } = renderHook(() => useChatStore());

      act(() => {
        result.current.setCurrentGenerationStep(2);
      });

      rerender();

      expect(result.current.currentGenerationStep).toBe(2);
    });

    it('conversation change clears pending questionnaire and resets stepper', () => {
      const { result } = renderHook(() => useChatStore());

      // Set up questionnaire state
      act(() => {
        result.current.setPendingQuestionnaire({
          conversationId: 'old-conv',
          assessmentType: 'comprehensive',
          vendorName: 'Test',
          solutionName: 'Test',
          contextSummary: 'Test',
          selectedCategories: [],
          estimatedQuestions: 90,
        });
        result.current.setCurrentGenerationStep(2);
        result.current.setGenerating(true);
      });

      expect(result.current.pendingQuestionnaire).not.toBeNull();
      expect(result.current.currentGenerationStep).toBe(2);
      expect(result.current.isGeneratingQuestionnaire).toBe(true);

      // Switch conversation
      act(() => {
        result.current.setActiveConversation('new-conv');
      });

      // All should be cleared/reset
      expect(result.current.pendingQuestionnaire).toBeNull();
      expect(result.current.currentGenerationStep).toBe(-1);
      expect(result.current.isGeneratingQuestionnaire).toBe(false);
    });
  });

  // Story 14.1.2: Questionnaire Message Index Tests
  describe('questionnaireMessageIndex (Story 14.1.2)', () => {
    it('defaults to -1', () => {
      const { result } = renderHook(() => useChatStore());
      expect(result.current.questionnaireMessageIndex).toBe(-1);
    });

    it('setQuestionnaireMessageIndex updates the index', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setQuestionnaireMessageIndex(5);
      });

      expect(result.current.questionnaireMessageIndex).toBe(5);
    });

    it('setPendingQuestionnaire captures current message count', () => {
      const { result } = renderHook(() => useChatStore());

      // Add some messages first
      act(() => {
        result.current.addMessage({ role: 'user', content: 'Test 1', timestamp: new Date() });
        result.current.addMessage({ role: 'assistant', content: 'Test 2', timestamp: new Date() });
      });

      // Set pending questionnaire
      act(() => {
        result.current.setPendingQuestionnaire({
          conversationId: 'conv-123',
          assessmentType: 'comprehensive',
          vendorName: 'Test',
          solutionName: null,
          contextSummary: null,
          estimatedQuestions: 85,
          selectedCategories: null,
        });
      });

      // Should capture position at time of setting (2 messages exist)
      expect(result.current.questionnaireMessageIndex).toBe(2);
    });

    it('clearPendingQuestionnaire resets index to -1', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setQuestionnaireMessageIndex(5);
        result.current.clearPendingQuestionnaire();
      });

      expect(result.current.questionnaireMessageIndex).toBe(-1);
    });

    it('setActiveConversation resets index to -1 (via clearPendingQuestionnaire)', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setQuestionnaireMessageIndex(3);
      });

      expect(result.current.questionnaireMessageIndex).toBe(3);

      act(() => {
        result.current.setActiveConversation('new-conv');
      });

      expect(result.current.questionnaireMessageIndex).toBe(-1);
    });

    it('index is captured at questionnaire creation, not affected by subsequent messages', () => {
      const { result } = renderHook(() => useChatStore());

      // Add initial messages
      act(() => {
        result.current.addMessage({ role: 'user', content: 'Test 1', timestamp: new Date() });
        result.current.addMessage({ role: 'assistant', content: 'Test 2', timestamp: new Date() });
      });

      // Set pending questionnaire (captures index = 2)
      act(() => {
        result.current.setPendingQuestionnaire({
          conversationId: 'conv-123',
          assessmentType: 'comprehensive',
          vendorName: 'Test',
          solutionName: null,
          contextSummary: null,
          estimatedQuestions: 85,
          selectedCategories: null,
        });
      });

      expect(result.current.questionnaireMessageIndex).toBe(2);

      // Add more messages
      act(() => {
        result.current.addMessage({ role: 'user', content: 'Test 3', timestamp: new Date() });
        result.current.addMessage({ role: 'assistant', content: 'Test 4', timestamp: new Date() });
      });

      // Index should NOT change - it was captured at creation time
      expect(result.current.questionnaireMessageIndex).toBe(2);
    });

    it('questionnaireMessageIndex is NOT persisted to localStorage', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setQuestionnaireMessageIndex(5);
      });

      // Check localStorage - index should NOT be persisted
      const stored = localStorage.getItem('guardian-chat-store');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);

      // Verify index is NOT in persisted state
      expect(parsed.state.questionnaireMessageIndex).toBeUndefined();
    });
  });

  // Epic 32.2.1: Questionnaire Progress State Tests
  describe('questionnaireProgress (Epic 32.2.1)', () => {
    it('initializes with null progress', () => {
      const { result } = renderHook(() => useChatStore());

      expect(result.current.questionnaireProgress).toBeNull();
    });

    it('setQuestionnaireProgress sets progress state', () => {
      const { result } = renderHook(() => useChatStore());

      const progress = {
        message: 'Generating questions for Data Security...',
        step: 3,
        totalSteps: 10,
        timestamp: Date.now(),
        seq: 1,
      };

      act(() => {
        result.current.setQuestionnaireProgress(progress);
      });

      expect(result.current.questionnaireProgress).toEqual(progress);
    });

    it('setQuestionnaireProgress clears with null', () => {
      const { result } = renderHook(() => useChatStore());

      const progress = {
        message: 'Generating...',
        step: 1,
        totalSteps: 5,
        timestamp: Date.now(),
        seq: 1,
      };

      act(() => {
        result.current.setQuestionnaireProgress(progress);
      });

      expect(result.current.questionnaireProgress).not.toBeNull();

      act(() => {
        result.current.setQuestionnaireProgress(null);
      });

      expect(result.current.questionnaireProgress).toBeNull();
    });

    it('ordering protection rejects events with old seq', () => {
      const { result } = renderHook(() => useChatStore());

      const progress1 = {
        message: 'Step 1',
        step: 1,
        totalSteps: 10,
        timestamp: Date.now(),
        seq: 5,
      };

      const progress2 = {
        message: 'Step 2 (old)',
        step: 2,
        totalSteps: 10,
        timestamp: Date.now(),
        seq: 3, // Old seq
      };

      act(() => {
        result.current.setQuestionnaireProgress(progress1);
      });

      expect(result.current.questionnaireProgress?.seq).toBe(5);

      act(() => {
        result.current.setQuestionnaireProgress(progress2);
      });

      // Should still be the first progress (old seq rejected)
      expect(result.current.questionnaireProgress?.seq).toBe(5);
      expect(result.current.questionnaireProgress?.message).toBe('Step 1');
    });

    it('ordering protection accepts events with newer seq', () => {
      const { result } = renderHook(() => useChatStore());

      const progress1 = {
        message: 'Step 1',
        step: 1,
        totalSteps: 10,
        timestamp: Date.now(),
        seq: 5,
      };

      const progress2 = {
        message: 'Step 2',
        step: 2,
        totalSteps: 10,
        timestamp: Date.now(),
        seq: 6, // Newer seq
      };

      act(() => {
        result.current.setQuestionnaireProgress(progress1);
      });

      act(() => {
        result.current.setQuestionnaireProgress(progress2);
      });

      // Should be updated to second progress
      expect(result.current.questionnaireProgress?.seq).toBe(6);
      expect(result.current.questionnaireProgress?.message).toBe('Step 2');
    });

    it('progress resets on conversation switch', () => {
      const { result } = renderHook(() => useChatStore());

      const progress = {
        message: 'Generating...',
        step: 3,
        totalSteps: 10,
        timestamp: Date.now(),
        seq: 1,
      };

      act(() => {
        result.current.setQuestionnaireProgress(progress);
      });

      expect(result.current.questionnaireProgress).not.toBeNull();

      act(() => {
        result.current.setActiveConversation('new-conv');
      });

      expect(result.current.questionnaireProgress).toBeNull();
    });

    it('questionnaireProgress is NOT persisted to localStorage', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setQuestionnaireProgress({
          message: 'Test',
          step: 1,
          totalSteps: 5,
          timestamp: Date.now(),
          seq: 1,
        });
      });

      // Check localStorage
      const stored = localStorage.getItem('guardian-chat-store');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);

      // questionnaireProgress should NOT be in persisted state
      expect(parsed.state.questionnaireProgress).toBeUndefined();
    });
  });

  // Epic 32.2.3: Reconnection State Tests
  describe('isReconnecting (Epic 32.2.3)', () => {
    it('initializes with false', () => {
      const { result } = renderHook(() => useChatStore());

      expect(result.current.isReconnecting).toBe(false);
    });

    it('setReconnecting updates state', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setReconnecting(true);
      });

      expect(result.current.isReconnecting).toBe(true);

      act(() => {
        result.current.setReconnecting(false);
      });

      expect(result.current.isReconnecting).toBe(false);
    });

    it('progress not cleared during reconnection', () => {
      const { result } = renderHook(() => useChatStore());

      const progress = {
        message: 'Progress during reconnect',
        step: 3,
        totalSteps: 10,
        timestamp: Date.now(),
        seq: 100, // High seq to ensure it's accepted regardless of prior state
      };

      // First ensure reconnection is off
      act(() => {
        result.current.setReconnecting(false);
      });

      // Set the progress
      act(() => {
        result.current.setQuestionnaireProgress(progress);
      });

      // Verify it was set
      expect(result.current.questionnaireProgress?.message).toBe('Progress during reconnect');

      // Now enable reconnection protection
      act(() => {
        result.current.setReconnecting(true);
      });

      // Try to clear progress during reconnection
      act(() => {
        result.current.setQuestionnaireProgress(null);
      });

      // Progress should NOT be cleared
      expect(result.current.questionnaireProgress).not.toBeNull();
      expect(result.current.questionnaireProgress?.message).toBe('Progress during reconnect');
    });

    it('progress cleared when not reconnecting', () => {
      const { result } = renderHook(() => useChatStore());

      const progress = {
        message: 'Progress to clear',
        step: 3,
        totalSteps: 10,
        timestamp: Date.now(),
        seq: 200, // High seq to ensure acceptance
      };

      // Ensure reconnecting is false first
      act(() => {
        result.current.setReconnecting(false);
      });

      act(() => {
        result.current.setQuestionnaireProgress(progress);
      });

      expect(result.current.questionnaireProgress).not.toBeNull();

      // Clear when not reconnecting
      act(() => {
        result.current.setReconnecting(false);
        result.current.setQuestionnaireProgress(null);
      });

      expect(result.current.questionnaireProgress).toBeNull();
    });

    it('isReconnecting is NOT persisted to localStorage', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setReconnecting(true);
      });

      // Check localStorage
      const stored = localStorage.getItem('guardian-chat-store');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);

      // isReconnecting should NOT be in persisted state
      expect(parsed.state.isReconnecting).toBeUndefined();
    });
  });
});
