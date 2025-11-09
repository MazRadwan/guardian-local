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
   * Delete message
   */
  delete(id: string): Promise<void>;
}
