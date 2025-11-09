export type ConversationMode = 'consult' | 'assessment';
export type ConversationStatus = 'active' | 'completed';

export interface ConversationContext {
  lastIntent?: string;
  currentStep?: string;
}

export interface CreateConversationData {
  userId: string;
  mode?: ConversationMode;
  assessmentId?: string;
  context?: ConversationContext;
}

export class Conversation {
  private constructor(
    public readonly id: string,
    public readonly userId: string,
    public mode: ConversationMode,
    public assessmentId: string | null,
    public status: ConversationStatus,
    public context: ConversationContext,
    public readonly startedAt: Date,
    public lastActivityAt: Date,
    public completedAt: Date | null
  ) {}

  /**
   * Create a new conversation
   */
  static create(data: CreateConversationData): Omit<Conversation, 'id' | 'startedAt'> {
    if (!data.userId) {
      throw new Error('User ID is required');
    }

    const now = new Date();

    return {
      userId: data.userId,
      mode: data.mode || 'consult',
      assessmentId: data.assessmentId || null,
      status: 'active',
      context: data.context || {},
      lastActivityAt: now,
      completedAt: null,
    } as Omit<Conversation, 'id' | 'startedAt'>;
  }

  /**
   * Reconstitute conversation from persistence
   */
  static fromPersistence(data: {
    id: string;
    userId: string;
    mode: ConversationMode;
    assessmentId: string | null;
    status: ConversationStatus;
    context: ConversationContext;
    startedAt: Date;
    lastActivityAt: Date;
    completedAt: Date | null;
  }): Conversation {
    return new Conversation(
      data.id,
      data.userId,
      data.mode,
      data.assessmentId,
      data.status,
      data.context,
      data.startedAt,
      data.lastActivityAt,
      data.completedAt
    );
  }

  /**
   * Switch conversation mode
   */
  switchMode(newMode: ConversationMode): void {
    if (this.mode === newMode) {
      return;
    }

    this.mode = newMode;
    this.updateActivity();
  }

  /**
   * Link assessment to conversation
   */
  linkAssessment(assessmentId: string): void {
    if (!assessmentId) {
      throw new Error('Assessment ID is required');
    }

    this.assessmentId = assessmentId;
    this.updateActivity();
  }

  /**
   * Update conversation context
   */
  updateContext(context: Partial<ConversationContext>): void {
    this.context = { ...this.context, ...context };
    this.updateActivity();
  }

  /**
   * Mark conversation as completed
   */
  complete(): void {
    if (this.status === 'completed') {
      return;
    }

    this.status = 'completed';
    this.completedAt = new Date();
    this.updateActivity();
  }

  /**
   * Check if conversation is active
   */
  isActive(): boolean {
    return this.status === 'active';
  }

  /**
   * Update last activity timestamp
   */
  private updateActivity(): void {
    this.lastActivityAt = new Date();
  }
}
