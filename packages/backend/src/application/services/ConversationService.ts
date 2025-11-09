import { IConversationRepository } from '../interfaces/IConversationRepository.js';
import { IMessageRepository } from '../interfaces/IMessageRepository.js';
import { Conversation, ConversationMode } from '../../domain/entities/Conversation.js';
import { Message } from '../../domain/entities/Message.js';
import { CreateConversationDTO } from '../dtos/CreateConversationDTO.js';
import { SendMessageDTO } from '../dtos/SendMessageDTO.js';

export class ConversationService {
  constructor(
    private conversationRepo: IConversationRepository,
    private messageRepo: IMessageRepository
  ) {}

  /**
   * Create a new conversation
   */
  async createConversation(dto: CreateConversationDTO): Promise<Conversation> {
    const conversationData = Conversation.create({
      userId: dto.userId,
      mode: dto.mode,
    });

    const conversation = await this.conversationRepo.create(conversationData);

    return conversation;
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    return await this.conversationRepo.findById(conversationId);
  }

  /**
   * Get all conversations for a user
   */
  async getUserConversations(userId: string, activeOnly = false): Promise<Conversation[]> {
    return await this.conversationRepo.findByUserId(
      userId,
      activeOnly ? 'active' : undefined
    );
  }

  /**
   * Switch conversation mode
   */
  async switchMode(conversationId: string, newMode: ConversationMode): Promise<void> {
    const conversation = await this.conversationRepo.findById(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    if (!conversation.isActive()) {
      throw new Error('Cannot switch mode on completed conversation');
    }

    await this.conversationRepo.updateMode(conversationId, newMode);
  }

  /**
   * Link assessment to conversation
   */
  async linkAssessment(conversationId: string, assessmentId: string): Promise<void> {
    const conversation = await this.conversationRepo.findById(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    await this.conversationRepo.linkAssessment(conversationId, assessmentId);
  }

  /**
   * Send a message in a conversation
   */
  async sendMessage(dto: SendMessageDTO): Promise<Message> {
    // Verify conversation exists and is active
    const conversation = await this.conversationRepo.findById(dto.conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${dto.conversationId} not found`);
    }

    if (!conversation.isActive()) {
      throw new Error('Cannot send message to completed conversation');
    }

    // Create message
    const messageData = Message.create({
      conversationId: dto.conversationId,
      role: dto.role,
      content: dto.content,
    });

    const message = await this.messageRepo.create(messageData);

    // Update conversation activity
    await this.conversationRepo.updateActivity(dto.conversationId);

    return message;
  }

  /**
   * Get conversation history
   */
  async getHistory(
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Message[]> {
    const conversation = await this.conversationRepo.findById(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    return await this.messageRepo.getHistory(conversationId, limit, offset);
  }

  /**
   * Complete a conversation
   */
  async completeConversation(conversationId: string): Promise<void> {
    const conversation = await this.conversationRepo.findById(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    await this.conversationRepo.updateStatus(conversationId, 'completed');
  }

  /**
   * Update conversation context
   */
  async updateContext(
    conversationId: string,
    context: Record<string, unknown>
  ): Promise<void> {
    const conversation = await this.conversationRepo.findById(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    await this.conversationRepo.updateContext(conversationId, context);
  }
}
