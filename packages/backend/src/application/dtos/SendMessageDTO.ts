import { MessageRole, MessageContent } from '../../domain/entities/Message.js';

export interface SendMessageDTO {
  conversationId: string;
  role: MessageRole;
  content: MessageContent;
}
