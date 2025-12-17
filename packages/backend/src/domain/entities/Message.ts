export type MessageRole = 'user' | 'assistant' | 'system';

export interface MessageComponent {
  type: 'button' | 'link' | 'code' | 'form';
  data: unknown;
}

/**
 * Epic 16.6.8: File attachment metadata stored with messages
 * Epic 16.6.9: storagePath intentionally excluded - never persisted in messages
 *              (stored only in files table, resolved via fileId for downloads)
 */
export interface MessageAttachment {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface MessageContent {
  text: string;
  components?: MessageComponent[];
}

export interface CreateMessageData {
  conversationId: string;
  role: MessageRole;
  content: MessageContent;
  attachments?: MessageAttachment[];
}

export class Message {
  private constructor(
    public readonly id: string,
    public readonly conversationId: string,
    public readonly role: MessageRole,
    public readonly content: MessageContent,
    public readonly createdAt: Date,
    public readonly attachments?: MessageAttachment[]
  ) {}

  /**
   * Create a new message
   */
  static create(data: CreateMessageData): Omit<Message, 'id' | 'createdAt'> {
    // Validate required fields
    if (!data.conversationId) {
      throw new Error('Conversation ID is required');
    }

    if (!data.role) {
      throw new Error('Message role is required');
    }

    if (!['user', 'assistant', 'system'].includes(data.role)) {
      throw new Error(`Invalid message role: ${data.role}`);
    }

    // Epic 16.6.8: Allow empty text if attachments are present (file-only messages)
    const hasAttachments = data.attachments && data.attachments.length > 0;
    if (!data.content || (!data.content.text && !hasAttachments)) {
      throw new Error('Message content text is required (unless attachments are provided)');
    }

    return {
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      attachments: data.attachments,
    } as Omit<Message, 'id' | 'createdAt'>;
  }

  /**
   * Reconstitute message from persistence
   */
  static fromPersistence(data: {
    id: string;
    conversationId: string;
    role: MessageRole;
    content: MessageContent;
    createdAt: Date;
    attachments?: MessageAttachment[];
  }): Message {
    return new Message(data.id, data.conversationId, data.role, data.content, data.createdAt, data.attachments);
  }

  /**
   * Check if message has embedded components
   */
  hasComponents(): boolean {
    return !!this.content.components && this.content.components.length > 0;
  }

  /**
   * Get message text
   */
  getText(): string {
    return this.content.text;
  }

  /**
   * Get message components
   */
  getComponents(): MessageComponent[] {
    return this.content.components || [];
  }

  /**
   * Epic 16.6.8: Check if message has file attachments
   */
  hasAttachments(): boolean {
    return !!this.attachments && this.attachments.length > 0;
  }

  /**
   * Epic 16.6.8: Get message attachments
   */
  getAttachments(): MessageAttachment[] {
    return this.attachments || [];
  }
}
