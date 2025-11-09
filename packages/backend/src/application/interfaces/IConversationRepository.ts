import { Conversation, ConversationMode, ConversationStatus } from '../../domain/entities/Conversation.js';

export interface IConversationRepository {
  /**
   * Create a new conversation
   */
  create(conversation: Omit<Conversation, 'id' | 'startedAt'>): Promise<Conversation>;

  /**
   * Find conversation by ID
   */
  findById(id: string): Promise<Conversation | null>;

  /**
   * Find all conversations for a user
   */
  findByUserId(userId: string, status?: ConversationStatus): Promise<Conversation[]>;

  /**
   * Update conversation mode
   */
  updateMode(id: string, mode: ConversationMode): Promise<void>;

  /**
   * Update conversation status
   */
  updateStatus(id: string, status: ConversationStatus): Promise<void>;

  /**
   * Link assessment to conversation
   */
  linkAssessment(id: string, assessmentId: string): Promise<void>;

  /**
   * Update conversation context
   */
  updateContext(id: string, context: Record<string, unknown>): Promise<void>;

  /**
   * Update last activity timestamp
   */
  updateActivity(id: string): Promise<void>;

  /**
   * Delete conversation
   */
  delete(id: string): Promise<void>;
}
