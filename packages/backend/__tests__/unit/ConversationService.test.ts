import { ConversationService } from '../../src/application/services/ConversationService';
import { IConversationRepository } from '../../src/application/interfaces/IConversationRepository';
import { IMessageRepository } from '../../src/application/interfaces/IMessageRepository';
import { Conversation } from '../../src/domain/entities/Conversation';
import { Message } from '../../src/domain/entities/Message';

// Mock repositories
const mockConversationRepo: jest.Mocked<IConversationRepository> = {
  create: jest.fn(),
  findById: jest.fn(),
  findByUserId: jest.fn(),
  updateMode: jest.fn(),
  updateStatus: jest.fn(),
  linkAssessment: jest.fn(),
  updateContext: jest.fn(),
  updateActivity: jest.fn(),
  delete: jest.fn(),
};

const mockMessageRepo: jest.Mocked<IMessageRepository> = {
  create: jest.fn(),
  findById: jest.fn(),
  findByConversationId: jest.fn(),
  findFirstUserMessage: jest.fn(),
  getHistory: jest.fn(),
  count: jest.fn(),
  delete: jest.fn(),
};

describe('ConversationService', () => {
  let service: ConversationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationService(mockConversationRepo, mockMessageRepo);
  });

  describe('createConversation', () => {
    it('should create a new conversation', async () => {
      const mockConversation = Conversation.fromPersistence({
        id: 'conv-123',
        userId: 'user-123',
        mode: 'consult',
        assessmentId: null,
        status: 'active',
        context: {},
        startedAt: new Date(),
        lastActivityAt: new Date(),
        completedAt: null,
      });

      mockConversationRepo.create.mockResolvedValue(mockConversation);

      const result = await service.createConversation({
        userId: 'user-123',
        mode: 'consult',
      });

      expect(mockConversationRepo.create).toHaveBeenCalled();
      expect(result).toEqual(mockConversation);
    });
  });

  describe('switchMode', () => {
    it('should switch conversation mode', async () => {
      const mockConversation = Conversation.fromPersistence({
        id: 'conv-123',
        userId: 'user-123',
        mode: 'consult',
        assessmentId: null,
        status: 'active',
        context: {},
        startedAt: new Date(),
        lastActivityAt: new Date(),
        completedAt: null,
      });

      mockConversationRepo.findById.mockResolvedValue(mockConversation);
      mockConversationRepo.updateMode.mockResolvedValue();

      await service.switchMode('conv-123', 'assessment');

      expect(mockConversationRepo.updateMode).toHaveBeenCalledWith('conv-123', 'assessment');
    });

    it('should throw error if conversation not found', async () => {
      mockConversationRepo.findById.mockResolvedValue(null);

      await expect(service.switchMode('conv-123', 'assessment')).rejects.toThrow(
        'Conversation conv-123 not found'
      );
    });

    it('should throw error if conversation is completed', async () => {
      const mockConversation = Conversation.fromPersistence({
        id: 'conv-123',
        userId: 'user-123',
        mode: 'consult',
        assessmentId: null,
        status: 'completed',
        context: {},
        startedAt: new Date(),
        lastActivityAt: new Date(),
        completedAt: new Date(),
      });

      mockConversationRepo.findById.mockResolvedValue(mockConversation);

      await expect(service.switchMode('conv-123', 'assessment')).rejects.toThrow(
        'Cannot switch mode on completed conversation'
      );
    });
  });

  describe('sendMessage', () => {
    it('should send a message and update activity', async () => {
      const mockConversation = Conversation.fromPersistence({
        id: 'conv-123',
        userId: 'user-123',
        mode: 'consult',
        assessmentId: null,
        status: 'active',
        context: {},
        startedAt: new Date(),
        lastActivityAt: new Date(),
        completedAt: null,
      });

      const mockMessage = Message.fromPersistence({
        id: 'msg-123',
        conversationId: 'conv-123',
        role: 'user',
        content: { text: 'Hello' },
        createdAt: new Date(),
      });

      mockConversationRepo.findById.mockResolvedValue(mockConversation);
      mockMessageRepo.create.mockResolvedValue(mockMessage);
      mockConversationRepo.updateActivity.mockResolvedValue();

      const result = await service.sendMessage({
        conversationId: 'conv-123',
        role: 'user',
        content: { text: 'Hello' },
      });

      expect(mockMessageRepo.create).toHaveBeenCalled();
      expect(mockConversationRepo.updateActivity).toHaveBeenCalledWith('conv-123');
      expect(result).toEqual(mockMessage);
    });

    it('should throw error if conversation not found', async () => {
      mockConversationRepo.findById.mockResolvedValue(null);

      await expect(
        service.sendMessage({
          conversationId: 'conv-123',
          role: 'user',
          content: { text: 'Hello' },
        })
      ).rejects.toThrow('Conversation conv-123 not found');
    });

    it('should throw error if conversation is completed', async () => {
      const mockConversation = Conversation.fromPersistence({
        id: 'conv-123',
        userId: 'user-123',
        mode: 'consult',
        assessmentId: null,
        status: 'completed',
        context: {},
        startedAt: new Date(),
        lastActivityAt: new Date(),
        completedAt: new Date(),
      });

      mockConversationRepo.findById.mockResolvedValue(mockConversation);

      await expect(
        service.sendMessage({
          conversationId: 'conv-123',
          role: 'user',
          content: { text: 'Hello' },
        })
      ).rejects.toThrow('Cannot send message to completed conversation');
    });
  });

  describe('getHistory', () => {
    it('should get conversation history', async () => {
      const mockConversation = Conversation.fromPersistence({
        id: 'conv-123',
        userId: 'user-123',
        mode: 'consult',
        assessmentId: null,
        status: 'active',
        context: {},
        startedAt: new Date(),
        lastActivityAt: new Date(),
        completedAt: null,
      });

      const mockMessages = [
        Message.fromPersistence({
          id: 'msg-1',
          conversationId: 'conv-123',
          role: 'user',
          content: { text: 'Hello' },
          createdAt: new Date(),
        }),
        Message.fromPersistence({
          id: 'msg-2',
          conversationId: 'conv-123',
          role: 'assistant',
          content: { text: 'Hi there!' },
          createdAt: new Date(),
        }),
      ];

      mockConversationRepo.findById.mockResolvedValue(mockConversation);
      mockMessageRepo.getHistory.mockResolvedValue(mockMessages);

      const result = await service.getHistory('conv-123', 50, 0);

      expect(mockMessageRepo.getHistory).toHaveBeenCalledWith('conv-123', 50, 0);
      expect(result).toEqual(mockMessages);
    });

    it('should throw error if conversation not found', async () => {
      mockConversationRepo.findById.mockResolvedValue(null);

      await expect(service.getHistory('conv-123')).rejects.toThrow(
        'Conversation conv-123 not found'
      );
    });
  });
});
