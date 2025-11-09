import { Message } from '../../src/domain/entities/Message';

describe('Message Entity', () => {
  describe('create', () => {
    it('should create a message with required fields', () => {
      const data = {
        conversationId: 'conv-123',
        role: 'user' as const,
        content: {
          text: 'Hello, Guardian!',
        },
      };

      const message = Message.create(data);

      expect(message.conversationId).toBe('conv-123');
      expect(message.role).toBe('user');
      expect(message.content.text).toBe('Hello, Guardian!');
      expect(message.content.components).toBeUndefined();
    });

    it('should create a message with components', () => {
      const data = {
        conversationId: 'conv-123',
        role: 'assistant' as const,
        content: {
          text: 'Click the button below',
          components: [
            {
              type: 'button' as const,
              data: { label: 'Start Assessment', action: 'create_assessment' },
            },
          ],
        },
      };

      const message = Message.create(data);

      expect(message.content.components).toHaveLength(1);
      expect(message.content.components![0].type).toBe('button');
    });

    it('should throw error if conversationId is missing', () => {
      expect(() => {
        Message.create({
          conversationId: '',
          role: 'user',
          content: { text: 'Hello' },
        });
      }).toThrow('Conversation ID is required');
    });

    it('should throw error if role is missing', () => {
      expect(() => {
        Message.create({
          conversationId: 'conv-123',
          role: '' as any,
          content: { text: 'Hello' },
        });
      }).toThrow('Message role is required');
    });

    it('should throw error if role is invalid', () => {
      expect(() => {
        Message.create({
          conversationId: 'conv-123',
          role: 'invalid' as any,
          content: { text: 'Hello' },
        });
      }).toThrow('Invalid message role');
    });

    it('should throw error if content text is missing', () => {
      expect(() => {
        Message.create({
          conversationId: 'conv-123',
          role: 'user',
          content: { text: '' },
        });
      }).toThrow('Message content text is required');
    });
  });

  describe('hasComponents', () => {
    it('should return true when message has components', () => {
      const message = Message.fromPersistence({
        id: 'msg-123',
        conversationId: 'conv-123',
        role: 'assistant',
        content: {
          text: 'Here are your options',
          components: [{ type: 'button', data: { label: 'Click me' } }],
        },
        createdAt: new Date(),
      });

      expect(message.hasComponents()).toBe(true);
    });

    it('should return false when message has no components', () => {
      const message = Message.fromPersistence({
        id: 'msg-123',
        conversationId: 'conv-123',
        role: 'user',
        content: {
          text: 'Hello',
        },
        createdAt: new Date(),
      });

      expect(message.hasComponents()).toBe(false);
    });

    it('should return false when components array is empty', () => {
      const message = Message.fromPersistence({
        id: 'msg-123',
        conversationId: 'conv-123',
        role: 'assistant',
        content: {
          text: 'Hello',
          components: [],
        },
        createdAt: new Date(),
      });

      expect(message.hasComponents()).toBe(false);
    });
  });

  describe('getText', () => {
    it('should return message text', () => {
      const message = Message.fromPersistence({
        id: 'msg-123',
        conversationId: 'conv-123',
        role: 'user',
        content: {
          text: 'What is the weather today?',
        },
        createdAt: new Date(),
      });

      expect(message.getText()).toBe('What is the weather today?');
    });
  });

  describe('getComponents', () => {
    it('should return message components', () => {
      const components = [
        { type: 'button' as const, data: { label: 'Yes' } },
        { type: 'button' as const, data: { label: 'No' } },
      ];

      const message = Message.fromPersistence({
        id: 'msg-123',
        conversationId: 'conv-123',
        role: 'assistant',
        content: {
          text: 'Do you want to continue?',
          components,
        },
        createdAt: new Date(),
      });

      expect(message.getComponents()).toEqual(components);
    });

    it('should return empty array when no components', () => {
      const message = Message.fromPersistence({
        id: 'msg-123',
        conversationId: 'conv-123',
        role: 'user',
        content: {
          text: 'Hello',
        },
        createdAt: new Date(),
      });

      expect(message.getComponents()).toEqual([]);
    });
  });
});
