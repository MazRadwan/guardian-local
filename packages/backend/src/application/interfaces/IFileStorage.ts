/**
 * IFileStorage - Interface for file storage operations
 *
 * Part of Epic 16: Document Parser Infrastructure
 */

export interface StoreOptions {
  filename: string;
  mimeType: string;
  userId: string;
  conversationId: string;
}

export interface IFileStorage {
  /**
   * Store a file and return its storage path
   */
  store(buffer: Buffer, options: StoreOptions): Promise<string>;

  /**
   * Retrieve a file by path
   */
  retrieve(path: string): Promise<Buffer>;

  /**
   * Delete a file by path
   */
  delete(path: string): Promise<void>;

  /**
   * Check if a file exists
   */
  exists(path: string): Promise<boolean>;
}
