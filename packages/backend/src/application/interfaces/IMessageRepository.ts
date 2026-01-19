import { Message } from '../../domain/entities/Message.js';

export interface IMessageRepository {
  /**
   * Create a new message
   */
  create(message: Omit<Message, 'id' | 'createdAt'>): Promise<Message>;

  /**
   * Find message by ID
   */
  findById(id: string): Promise<Message | null>;

  /**
   * Find all messages for a conversation
   */
  findByConversationId(conversationId: string): Promise<Message[]>;

  /**
   * Get paginated conversation history
   */
  getHistory(conversationId: string, limit?: number, offset?: number): Promise<Message[]>;

  /**
   * Count messages in a conversation
   */
  count(conversationId: string): Promise<number>;

  /**
   * Find the first user message in a conversation (chronologically)
   * Used for generating conversation titles
   */
  findFirstUserMessage(conversationId: string): Promise<Message | null>;

  /**
   * Find the first assistant message in a conversation (chronologically)
   * Epic 25/Story 26.1: Used for LLM title generation context
   */
  findFirstAssistantMessage(conversationId: string): Promise<Message | null>;

  /**
   * Delete message
   */
  delete(id: string): Promise<void>;

  /**
   * Delete all messages for a conversation
   */
  deleteByConversationId(conversationId: string): Promise<void>;
}
