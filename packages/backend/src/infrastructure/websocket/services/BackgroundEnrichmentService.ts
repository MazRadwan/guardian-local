/**
 * BackgroundEnrichmentService - Background file enrichment for assessment mode
 *
 * Extracted from MessageHandler (Story 28.11.2).
 * Runs in background (fire-and-forget) after immediate response is sent.
 * Uses tryStartParsing() for idempotency - prevents duplicate processing.
 */

import type { ValidatedDocumentType } from '../../../application/interfaces/ITextExtractionService.js';
import type { IFileRepository } from '../../../application/interfaces/IFileRepository.js';
import type { IFileStorage } from '../../../application/interfaces/IFileStorage.js';
import type { IIntakeDocumentParser } from '../../../application/interfaces/IIntakeDocumentParser.js';

/**
 * MIME type to validated document type mapping
 * Used for context injection fallback when re-reading from S3.
 * Handles DOCX-as-ZIP edge case by mapping to correct type.
 */
const MIME_TYPE_MAP: Record<string, ValidatedDocumentType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
};

export class BackgroundEnrichmentService {
  constructor(
    private readonly fileRepository: IFileRepository,
    private readonly fileStorage: IFileStorage,
    private readonly intakeParser: IIntakeDocumentParser
  ) {}

  async enrichInBackground(
    conversationId: string,
    fileIds: string[]
  ): Promise<void> {
    for (const fileId of fileIds) {
      try {
        // Use idempotency check (parseStatus column)
        // Only proceeds if status was 'pending' -> 'in_progress'
        const started = await this.fileRepository.tryStartParsing(fileId);
        if (!started) {
          console.log(`[BackgroundEnrichment] File ${fileId} already being processed, skipping`);
          continue;
        }

        // Get file record for storage path
        const file = await this.fileRepository.findById(fileId);
        if (!file) {
          console.warn(`[BackgroundEnrichment] File ${fileId} not found for enrichment`);
          await this.fileRepository.updateParseStatus(fileId, 'failed');
          continue;
        }

        // Retrieve file from storage
        const buffer = await this.fileStorage.retrieve(file.storagePath);

        // Map MIME type to document type
        const documentType = MIME_TYPE_MAP[file.mimeType];
        if (!documentType) {
          console.warn(`[BackgroundEnrichment] Unsupported MIME type for enrichment: ${file.mimeType}`);
          await this.fileRepository.updateParseStatus(fileId, 'failed');
          continue;
        }

        // Parse for context (assessment mode uses standard enrichment)
        const result = await this.intakeParser.parseForContext(buffer, {
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.size,
          documentType,
          storagePath: file.storagePath,
          uploadedAt: file.createdAt,
          uploadedBy: file.userId,
        });

        if (result.success && result.context) {
          // Store enriched context
          await this.fileRepository.updateIntakeContext(
            fileId,
            {
              vendorName: result.context.vendorName,
              solutionName: result.context.solutionName,
              solutionType: result.context.solutionType,
              industry: result.context.industry,
              features: result.context.features,
              claims: result.context.claims,
              complianceMentions: result.context.complianceMentions,
            },
            result.gapCategories
          );
          await this.fileRepository.updateParseStatus(fileId, 'completed');
          console.log(`[BackgroundEnrichment] Background enrichment completed for file ${fileId}`);
        } else {
          console.warn(`[BackgroundEnrichment] Background enrichment failed for file ${fileId}: ${result.error}`);
          await this.fileRepository.updateParseStatus(fileId, 'failed');
        }
      } catch (err) {
        console.error(`[BackgroundEnrichment] Error during background enrichment for file ${fileId}:`, err);
        // Mark as failed but continue with other files
        await this.fileRepository.updateParseStatus(fileId, 'failed').catch(() => {});
      }
    }
  }
}
