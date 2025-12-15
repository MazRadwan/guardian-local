/**
 * LocalFileStorage - Local filesystem storage for development
 *
 * Part of Epic 16: Document Parser Infrastructure
 */

import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { IFileStorage, StoreOptions } from '../../application/interfaces/IFileStorage.js';

export class LocalFileStorage implements IFileStorage {
  private readonly baseDir: string;

  constructor(baseDir: string = './uploads') {
    this.baseDir = baseDir;
  }

  async store(buffer: Buffer, options: StoreOptions): Promise<string> {
    const { filename, userId } = options;

    // SECURITY: Sanitize userId to prevent path traversal
    // Even though userId comes from JWT, treat as untrusted
    const safeUserId = this.sanitizePathSegment(userId);
    if (!safeUserId) {
      throw new Error('Invalid userId for storage path');
    }

    // Create directory structure: uploads/{userId}/
    const userDir = path.join(this.baseDir, safeUserId);
    await fs.mkdir(userDir, { recursive: true });

    // Generate unique filename: {timestamp}-{uuid}-{originalname}
    const timestamp = Date.now();
    const uniqueId = uuidv4().slice(0, 8);
    const ext = path.extname(filename);
    const safeName = path.basename(filename, ext).replace(/[^a-zA-Z0-9]/g, '_');
    const storedFilename = `${timestamp}-${uniqueId}-${safeName}${ext}`;

    const filePath = path.join(userDir, storedFilename);
    await fs.writeFile(filePath, buffer);

    console.log(`[LocalFileStorage] Stored file: ${filePath}`);
    return filePath;
  }

  async retrieve(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  async delete(filePath: string): Promise<void> {
    await fs.unlink(filePath);
    console.log(`[LocalFileStorage] Deleted file: ${filePath}`);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitize path segment to prevent path traversal attacks
   * Only allows alphanumeric, hyphens, and underscores (UUID format)
   */
  private sanitizePathSegment(segment: string): string | null {
    // Must match UUID format or simple alphanumeric with hyphens
    const safePattern = /^[a-zA-Z0-9_-]+$/;
    if (!safePattern.test(segment)) {
      console.warn(`[LocalFileStorage] SECURITY: Invalid path segment rejected: ${segment}`);
      return null;
    }
    // Additional check: no '..' sequences even if pattern passed
    if (segment.includes('..')) {
      return null;
    }
    return segment;
  }
}
