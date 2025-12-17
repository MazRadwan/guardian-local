/**
 * S3FileStorage - AWS S3 storage for production
 *
 * Part of Epic 16: Document Parser Infrastructure
 *
 * Supports configurable server-side encryption:
 * - none: No encryption (not recommended for production)
 * - aes256: SSE-S3 (Amazon S3-managed keys)
 * - kms: SSE-KMS (AWS KMS-managed keys, requires key ID)
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { IFileStorage, StoreOptions } from '../../application/interfaces/IFileStorage.js';

export type S3SSEMode = 'none' | 'aes256' | 'kms';

export interface S3StorageConfig {
  bucket: string;
  region?: string;
  sseMode?: S3SSEMode;
  sseKmsKeyId?: string;
  /** Custom endpoint for LocalStack/MinIO (e.g., 'http://localhost:4566') */
  endpoint?: string;
  /** Force path-style URLs (required for LocalStack/MinIO) */
  forcePathStyle?: boolean;
}

export class S3FileStorage implements IFileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly sseMode: S3SSEMode;
  private readonly sseKmsKeyId?: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.sseMode = config.sseMode ?? 'aes256'; // Default to AES256
    this.sseKmsKeyId = config.sseKmsKeyId;

    // Validate KMS configuration
    if (this.sseMode === 'kms' && !this.sseKmsKeyId) {
      throw new Error('S3_SSE_KMS_KEY_ID required when S3_SSE_MODE=kms');
    }

    const clientConfig: S3ClientConfig = {
      region: config.region ?? 'us-east-1',
    };

    // Support LocalStack/MinIO for local S3 testing
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = config.forcePathStyle ?? true;
    }

    this.client = new S3Client(clientConfig);
  }

  async store(buffer: Buffer, options: StoreOptions): Promise<string> {
    const { filename, mimeType, userId } = options;

    // SECURITY: Sanitize userId to prevent key manipulation
    const safeUserId = this.sanitizeKeySegment(userId);
    if (!safeUserId) {
      throw new Error('Invalid userId for S3 key');
    }

    // Generate S3 key: {userId}/{timestamp}-{uuid}-{filename}
    const timestamp = Date.now();
    const uniqueId = uuidv4().slice(0, 8);
    const ext = path.extname(filename);
    const safeName = path.basename(filename, ext).replace(/[^a-zA-Z0-9]/g, '_');
    const key = `${safeUserId}/${timestamp}-${uniqueId}-${safeName}${ext}`;

    // Build PutObjectCommand with encryption settings
    const putCommand = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ...this.getEncryptionParams(),
    });

    await this.client.send(putCommand);

    const s3Path = `s3://${this.bucket}/${key}`;
    console.log(`[S3FileStorage] Stored file: ${s3Path} (SSE: ${this.sseMode})`);
    return s3Path;
  }

  /**
   * Get encryption parameters based on configured SSE mode
   */
  private getEncryptionParams(): Record<string, string> {
    switch (this.sseMode) {
      case 'aes256':
        return { ServerSideEncryption: 'AES256' };
      case 'kms':
        return {
          ServerSideEncryption: 'aws:kms',
          SSEKMSKeyId: this.sseKmsKeyId!,
        };
      case 'none':
      default:
        return {};
    }
  }

  async retrieve(s3Path: string): Promise<Buffer> {
    const key = this.extractKey(s3Path);

    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    const stream = response.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  async delete(s3Path: string): Promise<void> {
    const key = this.extractKey(s3Path);

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    console.log(`[S3FileStorage] Deleted file: ${s3Path}`);
  }

  async exists(s3Path: string): Promise<boolean> {
    const key = this.extractKey(s3Path);

    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  private extractKey(s3Path: string): string {
    // s3://bucket/key -> key
    return s3Path.replace(`s3://${this.bucket}/`, '');
  }

  /**
   * Sanitize key segment to prevent S3 key manipulation
   */
  private sanitizeKeySegment(segment: string): string | null {
    const safePattern = /^[a-zA-Z0-9_-]+$/;
    if (!safePattern.test(segment)) {
      console.warn(`[S3FileStorage] SECURITY: Invalid key segment rejected: ${segment}`);
      return null;
    }
    return segment;
  }
}
