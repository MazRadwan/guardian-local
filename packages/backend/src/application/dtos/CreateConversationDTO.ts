import { ConversationMode } from '../../domain/entities/Conversation.js';

export interface CreateConversationDTO {
  userId: string;
  mode?: ConversationMode;
}
