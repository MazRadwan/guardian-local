import { IConversationRepository } from '../interfaces/IConversationRepository.js';
import { IMessageRepository } from '../interfaces/IMessageRepository.js';
import type { IFileRepository } from '../interfaces/IFileRepository.js';
import { Conversation, ConversationMode } from '../../domain/entities/Conversation.js';
import { Message } from '../../domain/entities/Message.js';
import { CreateConversationDTO } from '../dtos/CreateConversationDTO.js';
import { SendMessageDTO } from '../dtos/SendMessageDTO.js';

export class ConversationService {
  constructor(
    private conversationRepo: IConversationRepository,
    private messageRepo: IMessageRepository,
    private fileRepo?: IFileRepository
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

    // Create message (Epic 16.6.8: include attachments)
    const messageData = Message.create({
      conversationId: dto.conversationId,
      role: dto.role,
      content: dto.content,
      attachments: dto.attachments,
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
   * Delete a conversation and all its messages
   * Idempotent: If conversation doesn't exist, deletion is considered successful
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const conversation = await this.conversationRepo.findById(conversationId);

    // CRITICAL FIX: Idempotent DELETE - already deleted = success
    if (!conversation) {
      console.log(`[ConversationService] Conversation ${conversationId} already deleted - returning success`);
      return; // Silent success - conversation is already gone, deletion goal achieved
    }

    if (this.fileRepo) {
      await this.fileRepo.deleteByConversationId(conversationId);
    }

    // Delete all messages first (avoid FK issues and partial deletes)
    await this.messageRepo.deleteByConversationId(conversationId);

    // Delete the conversation
    await this.conversationRepo.delete(conversationId);
    console.log(`[ConversationService] Successfully deleted conversation ${conversationId}`);
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

  /**
   * Generate title for conversation from first user message
   * Returns 'New Chat' if no user messages exist
   */
  async getConversationTitle(conversationId: string): Promise<string> {
    const firstUserMessage = await this.messageRepo.findFirstUserMessage(conversationId);

    if (!firstUserMessage || !firstUserMessage.content.text) {
      return 'New Chat';
    }

    const messageText = firstUserMessage.content.text.trim();
    if (messageText.length === 0) {
      return 'New Chat';
    }

    // Take first 60 characters
    let title = messageText.slice(0, 60).trim();
    if (messageText.length > 60) {
      title += '...';
    }

    return title;
  }

  /**
   * Get message count for conversation
   */
  async getMessageCount(conversationId: string): Promise<number> {
    return await this.messageRepo.count(conversationId);
  }

  /**
   * Update conversation title
   * Epic 25: Chat Title Intelligence
   *
   * @param conversationId - Conversation to update
   * @param title - New title
   * @param manuallyEdited - If true, marks title as user-edited (prevents auto-updates)
   */
  async updateTitle(
    conversationId: string,
    title: string,
    manuallyEdited: boolean = false
  ): Promise<void> {
    const conversation = await this.conversationRepo.findById(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    await this.conversationRepo.updateTitle(conversationId, title, manuallyEdited);
  }

  /**
   * Update conversation title only if not manually edited
   * Epic 25: Chat Title Intelligence
   *
   * @param conversationId - Conversation to update
   * @param title - New title
   * @returns true if title was updated, false if skipped (manually edited)
   */
  async updateTitleIfNotManuallyEdited(
    conversationId: string,
    title: string
  ): Promise<boolean> {
    const conversation = await this.conversationRepo.findById(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    if (conversation.titleManuallyEdited) {
      console.log(`[ConversationService] Skipping title update for ${conversationId} - manually edited`);
      return false;
    }

    await this.conversationRepo.updateTitle(conversationId, title, false);
    return true;
  }
}
