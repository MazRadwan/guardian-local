import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3FileStorage } from '../../src/infrastructure/storage/S3FileStorage';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn(),
}));

describe('S3FileStorage', () => {
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend = jest.fn().mockResolvedValue({});
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  describe('constructor', () => {
    it('should create client with default region', () => {
      new S3FileStorage({ bucket: 'test-bucket' });
      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'us-east-1' })
      );
    });

    it('should create client with custom region', () => {
      new S3FileStorage({ bucket: 'test-bucket', region: 'eu-west-1' });
      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'eu-west-1' })
      );
    });

    it('should configure endpoint for LocalStack/MinIO', () => {
      new S3FileStorage({
        bucket: 'test-bucket',
        endpoint: 'http://localhost:4566',
        forcePathStyle: true,
      });
      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'http://localhost:4566',
          forcePathStyle: true,
        })
      );
    });

    it('should throw if KMS mode without key ID', () => {
      expect(() => {
        new S3FileStorage({
          bucket: 'test-bucket',
          sseMode: 'kms',
          // Missing sseKmsKeyId
        });
      }).toThrow('S3_SSE_KMS_KEY_ID required when S3_SSE_MODE=kms');
    });
  });

  describe('store - encryption modes', () => {
    const storeOptions = {
      filename: 'test.pdf',
      mimeType: 'application/pdf',
      userId: 'user-123',
      conversationId: 'conv-456',
    };

    it('should use AES256 encryption by default', async () => {
      const storage = new S3FileStorage({ bucket: 'test-bucket' });
      await storage.store(Buffer.from('test'), storeOptions);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          ServerSideEncryption: 'AES256',
        })
      );
      // Should NOT have KMS params
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.not.objectContaining({ SSEKMSKeyId: expect.anything() })
      );
    });

    it('should use AES256 encryption when sseMode=aes256', async () => {
      const storage = new S3FileStorage({
        bucket: 'test-bucket',
        sseMode: 'aes256',
      });
      await storage.store(Buffer.from('test'), storeOptions);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ServerSideEncryption: 'AES256',
        })
      );
    });

    it('should use KMS encryption when sseMode=kms', async () => {
      const storage = new S3FileStorage({
        bucket: 'test-bucket',
        sseMode: 'kms',
        sseKmsKeyId: 'alias/guardian-documents',
      });
      await storage.store(Buffer.from('test'), storeOptions);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ServerSideEncryption: 'aws:kms',
          SSEKMSKeyId: 'alias/guardian-documents',
        })
      );
    });

    it('should skip encryption when sseMode=none', async () => {
      const storage = new S3FileStorage({
        bucket: 'test-bucket',
        sseMode: 'none',
      });
      await storage.store(Buffer.from('test'), storeOptions);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.not.objectContaining({
          ServerSideEncryption: expect.anything(),
        })
      );
    });
  });

  describe('store - key generation', () => {
    it('should generate key with userId prefix', async () => {
      const storage = new S3FileStorage({ bucket: 'test-bucket' });
      await storage.store(Buffer.from('test'), {
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        userId: 'user-abc',
        conversationId: 'conv-1',
      });

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: expect.stringMatching(/^user-abc\//),
        })
      );
    });

    it('should reject userId with path traversal attempt', async () => {
      const storage = new S3FileStorage({ bucket: 'test-bucket' });

      await expect(
        storage.store(Buffer.from('test'), {
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          userId: '../../../etc',
          conversationId: 'conv-1',
        })
      ).rejects.toThrow('Invalid userId');
    });

    it('should sanitize filename in key', async () => {
      const storage = new S3FileStorage({ bucket: 'test-bucket' });
      await storage.store(Buffer.from('test'), {
        filename: 'my document (draft).pdf',
        mimeType: 'application/pdf',
        userId: 'user-1',
        conversationId: 'conv-1',
      });

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: expect.stringMatching(/my_document__draft_\.pdf$/),
        })
      );
    });
  });
});
