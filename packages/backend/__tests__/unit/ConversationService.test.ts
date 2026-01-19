import { ConversationService } from '../../src/application/services/ConversationService';
import { IConversationRepository } from '../../src/application/interfaces/IConversationRepository';
import { IMessageRepository } from '../../src/application/interfaces/IMessageRepository';
import { IFileRepository } from '../../src/application/interfaces/IFileRepository';
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
  updateTitle: jest.fn(),
};

const mockMessageRepo: jest.Mocked<IMessageRepository> = {
  create: jest.fn(),
  findById: jest.fn(),
  findByConversationId: jest.fn(),
  findFirstUserMessage: jest.fn(),
  getHistory: jest.fn(),
  count: jest.fn(),
  delete: jest.fn(),
  deleteByConversationId: jest.fn(),
};

const mockFileRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  findByIds: jest.fn(),
  findByIdAndUser: jest.fn(),
  findByIdAndConversation: jest.fn(),
  updateIntakeContext: jest.fn(),
  findByConversationWithContext: jest.fn(),
  updateTextExcerpt: jest.fn(),
  updateParseStatus: jest.fn(),
  tryStartParsing: jest.fn(),
  findByConversationWithExcerpt: jest.fn(),
  deleteByConversationId: jest.fn(),
} as jest.Mocked<IFileRepository>;

describe('ConversationService', () => {
  let service: ConversationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationService(mockConversationRepo, mockMessageRepo, mockFileRepo);
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

  describe('deleteConversation', () => {
    it('should delete messages and conversation when it exists', async () => {
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
      mockFileRepo.deleteByConversationId.mockResolvedValue();
      mockMessageRepo.deleteByConversationId.mockResolvedValue();
      mockConversationRepo.delete.mockResolvedValue();

      await service.deleteConversation('conv-123');

      expect(mockFileRepo.deleteByConversationId).toHaveBeenCalledWith('conv-123');
      expect(mockMessageRepo.deleteByConversationId).toHaveBeenCalledWith('conv-123');
      expect(mockConversationRepo.delete).toHaveBeenCalledWith('conv-123');
    });

    it('should be idempotent when conversation does not exist', async () => {
      mockConversationRepo.findById.mockResolvedValue(null);

      await service.deleteConversation('conv-missing');

      expect(mockFileRepo.deleteByConversationId).not.toHaveBeenCalled();
      expect(mockMessageRepo.deleteByConversationId).not.toHaveBeenCalled();
      expect(mockConversationRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('updateTitle (Epic 25)', () => {
    it('should update conversation title', async () => {
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
        title: null,
        titleManuallyEdited: false,
      });

      mockConversationRepo.findById.mockResolvedValue(mockConversation);
      mockConversationRepo.updateTitle.mockResolvedValue();

      await service.updateTitle('conv-123', 'New Title', false);

      expect(mockConversationRepo.updateTitle).toHaveBeenCalledWith('conv-123', 'New Title', false);
    });

    it('should update title with manuallyEdited flag', async () => {
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
        title: null,
        titleManuallyEdited: false,
      });

      mockConversationRepo.findById.mockResolvedValue(mockConversation);
      mockConversationRepo.updateTitle.mockResolvedValue();

      await service.updateTitle('conv-123', 'User Edited Title', true);

      expect(mockConversationRepo.updateTitle).toHaveBeenCalledWith('conv-123', 'User Edited Title', true);
    });

    it('should throw error if conversation not found', async () => {
      mockConversationRepo.findById.mockResolvedValue(null);

      await expect(service.updateTitle('conv-123', 'New Title')).rejects.toThrow(
        'Conversation conv-123 not found'
      );
    });
  });

  describe('updateTitleIfNotManuallyEdited (Epic 25)', () => {
    it('should update title if not manually edited', async () => {
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
        title: 'Old Title',
        titleManuallyEdited: false,
      });

      mockConversationRepo.findById.mockResolvedValue(mockConversation);
      mockConversationRepo.updateTitle.mockResolvedValue();

      const result = await service.updateTitleIfNotManuallyEdited('conv-123', 'Auto Generated Title');

      expect(result).toBe(true);
      expect(mockConversationRepo.updateTitle).toHaveBeenCalledWith('conv-123', 'Auto Generated Title', false);
    });

    it('should skip update if title was manually edited', async () => {
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
        title: 'User Custom Title',
        titleManuallyEdited: true,
      });

      mockConversationRepo.findById.mockResolvedValue(mockConversation);

      const result = await service.updateTitleIfNotManuallyEdited('conv-123', 'Auto Generated Title');

      expect(result).toBe(false);
      expect(mockConversationRepo.updateTitle).not.toHaveBeenCalled();
    });

    it('should throw error if conversation not found', async () => {
      mockConversationRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateTitleIfNotManuallyEdited('conv-123', 'New Title')
      ).rejects.toThrow('Conversation conv-123 not found');
    });
  });
});
