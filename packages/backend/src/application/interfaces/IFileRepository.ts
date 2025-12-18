import type { IntakeDocumentContext } from '../../domain/entities/Conversation.js'

export interface FileRecord {
  id: string
  userId: string
  conversationId: string
  filename: string
  mimeType: string
  size: number
  storagePath: string
  createdAt: Date
}

export interface FileWithIntakeContext {
  id: string
  conversationId: string
  filename: string
  mimeType: string
  size: number
  intakeContext: IntakeDocumentContext | null
  intakeGapCategories: string[] | null
  intakeParsedAt: Date | null
}

export interface IFileRepository {
  /**
   * Create a new file record
   */
  create(file: Omit<FileRecord, 'id' | 'createdAt'>): Promise<FileRecord>

  /**
   * Find file by ID
   */
  findById(fileId: string): Promise<FileRecord | null>

  /**
   * Find file by ID and user (for authorization)
   */
  findByIdAndUser(fileId: string, userId: string): Promise<FileRecord | null>

  /**
   * Find file by ID and conversation (for authorization)
   */
  findByIdAndConversation(fileId: string, conversationId: string): Promise<FileRecord | null>

  /**
   * Update intake context for a file after parsing
   */
  updateIntakeContext(
    fileId: string,
    context: IntakeDocumentContext,
    gapCategories?: string[]
  ): Promise<void>

  /**
   * Find all files in a conversation that have intake context
   */
  findByConversationWithContext(conversationId: string): Promise<FileWithIntakeContext[]>
}
