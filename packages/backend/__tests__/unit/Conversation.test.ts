import { Conversation } from '../../src/domain/entities/Conversation';

describe('Conversation Entity', () => {
  describe('create', () => {
    it('should create a conversation with required fields', () => {
      const data = {
        userId: 'user-123',
      };

      const conversation = Conversation.create(data);

      expect(conversation.userId).toBe('user-123');
      expect(conversation.mode).toBe('consult');
      expect(conversation.status).toBe('active');
      expect(conversation.assessmentId).toBeNull();
      expect(conversation.context).toEqual({});
      expect(conversation.completedAt).toBeNull();
    });

    it('should create a conversation with specified mode', () => {
      const data = {
        userId: 'user-123',
        mode: 'assessment' as const,
      };

      const conversation = Conversation.create(data);

      expect(conversation.mode).toBe('assessment');
    });

    it('should throw error if userId is missing', () => {
      expect(() => {
        Conversation.create({ userId: '' });
      }).toThrow('User ID is required');
    });
  });

  describe('switchMode', () => {
    it('should switch mode from consult to assessment', () => {
      const conversation = Conversation.fromPersistence({
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

      conversation.switchMode('assessment');

      expect(conversation.mode).toBe('assessment');
    });

    it('should not change mode if already set', () => {
      const conversation = Conversation.fromPersistence({
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

      conversation.switchMode('consult');

      expect(conversation.mode).toBe('consult');
    });
  });

  describe('complete', () => {
    it('should mark conversation as completed', () => {
      const conversation = Conversation.fromPersistence({
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

      conversation.complete();

      expect(conversation.status).toBe('completed');
      expect(conversation.completedAt).toBeInstanceOf(Date);
    });

    it('should not change if already completed', () => {
      const completedAt = new Date('2024-01-01');
      const conversation = Conversation.fromPersistence({
        id: 'conv-123',
        userId: 'user-123',
        mode: 'consult',
        assessmentId: null,
        status: 'completed',
        context: {},
        startedAt: new Date(),
        lastActivityAt: new Date(),
        completedAt,
      });

      conversation.complete();

      expect(conversation.status).toBe('completed');
      expect(conversation.completedAt).toBe(completedAt);
    });
  });

  describe('isActive', () => {
    it('should return true for active conversation', () => {
      const conversation = Conversation.fromPersistence({
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

      expect(conversation.isActive()).toBe(true);
    });

    it('should return false for completed conversation', () => {
      const conversation = Conversation.fromPersistence({
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

      expect(conversation.isActive()).toBe(false);
    });
  });

  describe('linkAssessment', () => {
    it('should link assessment to conversation', () => {
      const conversation = Conversation.fromPersistence({
        id: 'conv-123',
        userId: 'user-123',
        mode: 'assessment',
        assessmentId: null,
        status: 'active',
        context: {},
        startedAt: new Date(),
        lastActivityAt: new Date(),
        completedAt: null,
      });

      conversation.linkAssessment('assessment-123');

      expect(conversation.assessmentId).toBe('assessment-123');
    });

    it('should throw error if assessment ID is empty', () => {
      const conversation = Conversation.fromPersistence({
        id: 'conv-123',
        userId: 'user-123',
        mode: 'assessment',
        assessmentId: null,
        status: 'active',
        context: {},
        startedAt: new Date(),
        lastActivityAt: new Date(),
        completedAt: null,
      });

      expect(() => {
        conversation.linkAssessment('');
      }).toThrow('Assessment ID is required');
    });
  });
});
