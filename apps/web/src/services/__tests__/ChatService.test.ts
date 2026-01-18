import { ChatService, type ChatStoreActions } from '../ChatService';
import type { WebSocketAdapterInterface } from '@/hooks/useWebSocketAdapter';
import type { ChatMessage } from '@/lib/websocket';

describe('ChatService', () => {
  // Mock adapter
  const createMockAdapter = (overrides?: Partial<WebSocketAdapterInterface>): WebSocketAdapterInterface => ({
    isConnected: true,
    isConnecting: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    sendMessage: jest.fn(),
    requestHistory: jest.fn(),
    fetchConversations: jest.fn(),
    startNewConversation: jest.fn(),
    deleteConversation: jest.fn(),
    abortStream: jest.fn(),
    ...overrides,
  });

  // Mock store actions
  const createMockStore = (): ChatStoreActions => ({
    addMessage: jest.fn(),
    setMessages: jest.fn(),
    setLoading: jest.fn(),
    setError: jest.fn(),
  });

  // Helper to create mock messages
  const createMessage = (role: 'user' | 'assistant', content: string): ChatMessage => ({
    role,
    content,
    timestamp: new Date(),
  });

  describe('sendMessage', () => {
    it('should send message when connected', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      service.sendMessage('Hello!', 'conv-123');

      // Should add user message to store
      expect(store.addMessage).toHaveBeenCalledWith({
        role: 'user',
        content: 'Hello!',
        timestamp: expect.any(Date),
      });

      // Should set loading state
      expect(store.setLoading).toHaveBeenCalledWith(true);

      // Should send via adapter (third arg is optional attachments)
      expect(adapter.sendMessage).toHaveBeenCalledWith('Hello!', 'conv-123', undefined);

      // Should not set error
      expect(store.setError).not.toHaveBeenCalled();
    });

    it('should handle disconnected state', () => {
      const adapter = createMockAdapter({ isConnected: false });
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      service.sendMessage('Hello!', 'conv-123');

      // Should set error
      expect(store.setError).toHaveBeenCalledWith('Not connected to server');

      // Should not send message
      expect(adapter.sendMessage).not.toHaveBeenCalled();
      expect(store.addMessage).not.toHaveBeenCalled();
      expect(store.setLoading).not.toHaveBeenCalled();
    });

    it('should handle missing conversation ID', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      service.sendMessage('Hello!', null);

      // Should set error
      expect(store.setError).toHaveBeenCalledWith('No active conversation');

      // Should not send message
      expect(adapter.sendMessage).not.toHaveBeenCalled();
      expect(store.addMessage).not.toHaveBeenCalled();
      expect(store.setLoading).not.toHaveBeenCalled();
    });

    it('should handle adapter errors', () => {
      const adapter = createMockAdapter();
      (adapter.sendMessage as jest.Mock).mockImplementation(() => {
        throw new Error('Network error');
      });
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      service.sendMessage('Hello!', 'conv-123');

      // Should still add message and set loading
      expect(store.addMessage).toHaveBeenCalled();
      expect(store.setLoading).toHaveBeenCalledWith(true);

      // Should set error and reset loading
      expect(store.setError).toHaveBeenCalledWith('Failed to send message');
      expect(store.setLoading).toHaveBeenCalledWith(false);

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should send multiple messages', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      service.sendMessage('First message', 'conv-123');
      service.sendMessage('Second message', 'conv-123');

      expect(adapter.sendMessage).toHaveBeenCalledTimes(2);
      expect(store.addMessage).toHaveBeenCalledTimes(2);
      expect(store.setLoading).toHaveBeenCalledTimes(2);
    });
  });

  describe('regenerateMessage', () => {
    it('should regenerate message when valid', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);
      const setRegeneratingIndex = jest.fn();

      const messages: ChatMessage[] = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi there!'),
        createMessage('user', 'How are you?'),
        createMessage('assistant', 'I am good'),
      ];

      // Regenerate message at index 3 (last assistant message)
      service.regenerateMessage(3, 'conv-123', messages, setRegeneratingIndex);

      // Should mark as regenerating
      expect(setRegeneratingIndex).toHaveBeenCalledWith(3);

      // Should remove old assistant message (filter out index 3)
      expect(store.setMessages).toHaveBeenCalledWith([
        messages[0],
        messages[1],
        messages[2],
      ]);

      // Should set loading
      expect(store.setLoading).toHaveBeenCalledWith(true);

      // Story 24.1: Should resend previous user message with isRegenerate: true
      expect(adapter.sendMessage).toHaveBeenCalledWith('How are you?', 'conv-123', undefined, true);

      // Should not set error
      expect(store.setError).not.toHaveBeenCalled();
    });

    it('should pass isRegenerate: true to adapter.sendMessage (Story 24.1)', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      const messages: ChatMessage[] = [
        createMessage('user', 'Explain photosynthesis'),
        createMessage('assistant', 'Photosynthesis is...'),
      ];

      service.regenerateMessage(1, 'conv-123', messages);

      // Story 24.1: Verify isRegenerate flag is passed
      expect(adapter.sendMessage).toHaveBeenCalledWith(
        'Explain photosynthesis',
        'conv-123',
        undefined,
        true  // isRegenerate flag
      );
    });

    it('should handle disconnected state', () => {
      const adapter = createMockAdapter({ isConnected: false });
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      const messages: ChatMessage[] = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi there!'),
      ];

      service.regenerateMessage(1, 'conv-123', messages);

      // Should set error
      expect(store.setError).toHaveBeenCalledWith('Not connected to server');

      // Should not regenerate
      expect(adapter.sendMessage).not.toHaveBeenCalled();
      expect(store.setMessages).not.toHaveBeenCalled();
    });

    it('should handle missing conversation ID', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      const messages: ChatMessage[] = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi there!'),
      ];

      service.regenerateMessage(1, null, messages);

      // Should set error
      expect(store.setError).toHaveBeenCalledWith('Not connected to server');

      // Should not regenerate
      expect(adapter.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle invalid message index (negative)', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      const messages: ChatMessage[] = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi there!'),
      ];

      service.regenerateMessage(-1, 'conv-123', messages);

      // Should set error
      expect(store.setError).toHaveBeenCalledWith('Invalid message index');

      // Should not regenerate
      expect(adapter.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle invalid message index (out of bounds)', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      const messages: ChatMessage[] = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi there!'),
      ];

      service.regenerateMessage(5, 'conv-123', messages);

      // Should set error
      expect(store.setError).toHaveBeenCalledWith('Invalid message index');

      // Should not regenerate
      expect(adapter.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle missing previous user message', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      const messages: ChatMessage[] = [
        createMessage('assistant', 'Hi there!'), // No user message before this
      ];

      service.regenerateMessage(0, 'conv-123', messages);

      // Should set error
      expect(store.setError).toHaveBeenCalledWith('Cannot regenerate: previous user message not found');

      // Should not regenerate
      expect(adapter.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle previous message not being user message', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      const messages: ChatMessage[] = [
        createMessage('assistant', 'First'),
        createMessage('assistant', 'Second'), // Previous is also assistant
      ];

      service.regenerateMessage(1, 'conv-123', messages);

      // Should set error
      expect(store.setError).toHaveBeenCalledWith('Cannot regenerate: previous user message not found');

      // Should not regenerate
      expect(adapter.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle adapter errors', () => {
      const adapter = createMockAdapter();
      (adapter.sendMessage as jest.Mock).mockImplementation(() => {
        throw new Error('Network error');
      });
      const store = createMockStore();
      const service = new ChatService(adapter, store);
      const setRegeneratingIndex = jest.fn();

      const messages: ChatMessage[] = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi there!'),
      ];

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      service.regenerateMessage(1, 'conv-123', messages, setRegeneratingIndex);

      // Should mark as regenerating
      expect(setRegeneratingIndex).toHaveBeenCalledWith(1);

      // Should set error and reset state
      expect(store.setError).toHaveBeenCalledWith('Failed to regenerate response');
      expect(store.setLoading).toHaveBeenCalledWith(false);
      expect(setRegeneratingIndex).toHaveBeenCalledWith(null);

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should work without setRegeneratingIndex callback', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      const messages: ChatMessage[] = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi there!'),
      ];

      // Should not throw when callback is undefined
      expect(() => {
        service.regenerateMessage(1, 'conv-123', messages);
      }).not.toThrow();

      // Story 24.1: Should still regenerate with isRegenerate: true
      expect(adapter.sendMessage).toHaveBeenCalledWith('Hello', 'conv-123', undefined, true);
    });

    it('should regenerate middle message correctly', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      const messages: ChatMessage[] = [
        createMessage('user', 'First'),
        createMessage('assistant', 'Response 1'),
        createMessage('user', 'Second'),
        createMessage('assistant', 'Response 2'),
        createMessage('user', 'Third'),
        createMessage('assistant', 'Response 3'),
      ];

      // Regenerate message at index 3 (second assistant message)
      service.regenerateMessage(3, 'conv-123', messages);

      // Should remove only message at index 3
      expect(store.setMessages).toHaveBeenCalledWith([
        messages[0],
        messages[1],
        messages[2],
        messages[4],
        messages[5],
      ]);

      // Story 24.1: Should resend user message with isRegenerate: true
      expect(adapter.sendMessage).toHaveBeenCalledWith('Second', 'conv-123', undefined, true);
    });
  });

  describe('abortStream', () => {
    it('should call adapter abortStream', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      service.abortStream();

      expect(adapter.abortStream).toHaveBeenCalledTimes(1);
    });

    it('should work when disconnected', () => {
      const adapter = createMockAdapter({ isConnected: false });
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      // Should not throw (adapter handles state)
      expect(() => {
        service.abortStream();
      }).not.toThrow();

      expect(adapter.abortStream).toHaveBeenCalledTimes(1);
    });

    it('should not modify store state', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      service.abortStream();

      // Store methods should not be called (handled by WebSocket event callbacks)
      expect(store.setLoading).not.toHaveBeenCalled();
      expect(store.setError).not.toHaveBeenCalled();
      expect(store.setMessages).not.toHaveBeenCalled();
      expect(store.addMessage).not.toHaveBeenCalled();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle send + abort workflow', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      // Send message
      service.sendMessage('Hello', 'conv-123');
      expect(adapter.sendMessage).toHaveBeenCalledWith('Hello', 'conv-123', undefined);

      // Abort stream
      service.abortStream();
      expect(adapter.abortStream).toHaveBeenCalledTimes(1);
    });

    it('should handle send + regenerate workflow', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      // Send initial message
      service.sendMessage('Hello', 'conv-123');

      // Simulate messages after response
      const messages: ChatMessage[] = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi there!'),
      ];

      // Regenerate response
      service.regenerateMessage(1, 'conv-123', messages);

      // Should have sent twice (initial + regenerate)
      expect(adapter.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple regenerations', () => {
      const adapter = createMockAdapter();
      const store = createMockStore();
      const service = new ChatService(adapter, store);

      const messages: ChatMessage[] = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Response 1'),
      ];

      // First regeneration
      service.regenerateMessage(1, 'conv-123', messages);

      // Second regeneration (simulate same scenario)
      service.regenerateMessage(1, 'conv-123', messages);

      expect(adapter.sendMessage).toHaveBeenCalledTimes(2);
      expect(store.setMessages).toHaveBeenCalledTimes(2);
    });
  });
});
