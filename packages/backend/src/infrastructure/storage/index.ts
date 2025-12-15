/**
 * File Storage Factory
 *
 * Environment-driven configuration for seamless dev/prod switching:
 *
 * Development (default):
 *   FILE_STORAGE_TYPE=local (or unset)
 *   UPLOAD_DIR=./uploads
 *
 * Production (S3 with AES256):
 *   FILE_STORAGE_TYPE=s3
 *   S3_BUCKET=guardian-uploads
 *   AWS_REGION=us-east-1
 *   S3_SSE_MODE=aes256 (or unset, aes256 is default)
 *
 * Production (S3 with KMS):
 *   FILE_STORAGE_TYPE=s3
 *   S3_BUCKET=guardian-uploads
 *   AWS_REGION=us-east-1
 *   S3_SSE_MODE=kms
 *   S3_SSE_KMS_KEY_ID=alias/guardian-documents
 *
 * LocalStack/MinIO (optional local S3 testing):
 *   FILE_STORAGE_TYPE=s3
 *   S3_BUCKET=guardian-test
 *   AWS_REGION=us-east-1
 *   AWS_ENDPOINT_URL=http://localhost:4566
 *   S3_FORCE_PATH_STYLE=true
 *   S3_SSE_MODE=none (LocalStack doesn't support encryption)
 */

import { IFileStorage } from '../../application/interfaces/IFileStorage.js';
import { LocalFileStorage } from './LocalFileStorage.js';
import { S3FileStorage, S3SSEMode } from './S3FileStorage.js';

export { LocalFileStorage } from './LocalFileStorage.js';
export { S3FileStorage } from './S3FileStorage.js';
export type { S3StorageConfig, S3SSEMode } from './S3FileStorage.js';

export function createFileStorage(): IFileStorage {
  const storageType = process.env.FILE_STORAGE_TYPE || 'local';

  if (storageType === 's3') {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new Error('S3_BUCKET environment variable required for S3 storage');
    }

    const sseMode = (process.env.S3_SSE_MODE || 'aes256') as S3SSEMode;
    const sseKmsKeyId = process.env.S3_SSE_KMS_KEY_ID;

    // Validate KMS config at startup
    if (sseMode === 'kms' && !sseKmsKeyId) {
      throw new Error('S3_SSE_KMS_KEY_ID required when S3_SSE_MODE=kms');
    }

    return new S3FileStorage({
      bucket,
      region: process.env.AWS_REGION || 'us-east-1',
      sseMode,
      sseKmsKeyId,
      endpoint: process.env.AWS_ENDPOINT_URL,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    });
  }

  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  return new LocalFileStorage(uploadDir);
}
