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
}
