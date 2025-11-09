export type MessageRole = 'user' | 'assistant' | 'system';

export interface MessageComponent {
  type: 'button' | 'link' | 'code' | 'form';
  data: unknown;
}

export interface MessageContent {
  text: string;
  components?: MessageComponent[];
}

export interface CreateMessageData {
  conversationId: string;
  role: MessageRole;
  content: MessageContent;
}

export class Message {
  private constructor(
    public readonly id: string,
    public readonly conversationId: string,
    public readonly role: MessageRole,
    public readonly content: MessageContent,
    public readonly createdAt: Date
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

    if (!data.content || !data.content.text) {
      throw new Error('Message content text is required');
    }

    return {
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
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
  }): Message {
    return new Message(data.id, data.conversationId, data.role, data.content, data.createdAt);
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
}
