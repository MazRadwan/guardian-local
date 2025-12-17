import { MessageRole, MessageContent, MessageAttachment } from '../../domain/entities/Message.js';

export interface SendMessageDTO {
  conversationId: string;
  role: MessageRole;
  content: MessageContent;
  // Epic 16.6.8: File attachments
  attachments?: MessageAttachment[];
}
