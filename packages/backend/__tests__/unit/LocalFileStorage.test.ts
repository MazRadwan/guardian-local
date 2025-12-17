import { promises as fs } from 'fs';
import path from 'path';
import { LocalFileStorage } from '../../src/infrastructure/storage/LocalFileStorage';

describe('LocalFileStorage', () => {
  const testDir = './test-uploads-' + Date.now();
  let storage: LocalFileStorage;

  beforeEach(async () => {
    storage = new LocalFileStorage(testDir);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('store', () => {
    it('should store file and return path', async () => {
      const buffer = Buffer.from('test content');
      const storagePath = await storage.store(buffer, {
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        userId: 'user-123',
        conversationId: 'conv-456',
      });

      expect(storagePath).toContain('user-123');
      expect(storagePath).toContain('.pdf');
      expect(await storage.exists(storagePath)).toBe(true);
    });

    it('should create user directory', async () => {
      const buffer = Buffer.from('test');
      await storage.store(buffer, {
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        userId: 'new-user',
        conversationId: 'conv-1',
      });

      const userDir = path.join(testDir, 'new-user');
      const stat = await fs.stat(userDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should sanitize filename', async () => {
      const buffer = Buffer.from('test');
      const storagePath = await storage.store(buffer, {
        filename: 'my document (1).pdf',
        mimeType: 'application/pdf',
        userId: 'user-1',
        conversationId: 'conv-1',
      });

      // Filename should have special chars replaced
      expect(storagePath).not.toContain(' ');
      expect(storagePath).not.toContain('(');
      expect(storagePath).toContain('.pdf');
    });

    it('should reject invalid userId (path traversal attempt)', async () => {
      const buffer = Buffer.from('test');

      await expect(
        storage.store(buffer, {
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          userId: '../../../etc',
          conversationId: 'conv-1',
        })
      ).rejects.toThrow('Invalid userId');
    });
  });

  describe('retrieve', () => {
    it('should retrieve stored file', async () => {
      const content = 'hello world';
      const buffer = Buffer.from(content);
      const storagePath = await storage.store(buffer, {
        filename: 'hello.pdf',
        mimeType: 'application/pdf',
        userId: 'user-1',
        conversationId: 'conv-1',
      });

      const retrieved = await storage.retrieve(storagePath);
      expect(retrieved.toString()).toBe(content);
    });

    it('should throw for non-existent file', async () => {
      await expect(
        storage.retrieve('/non/existent/file.pdf')
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should delete stored file', async () => {
      const buffer = Buffer.from('delete me');
      const storagePath = await storage.store(buffer, {
        filename: 'temp.pdf',
        mimeType: 'application/pdf',
        userId: 'user-1',
        conversationId: 'conv-1',
      });

      expect(await storage.exists(storagePath)).toBe(true);
      await storage.delete(storagePath);
      expect(await storage.exists(storagePath)).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return false for non-existent file', async () => {
      const exists = await storage.exists('/does/not/exist.pdf');
      expect(exists).toBe(false);
    });
  });
});
