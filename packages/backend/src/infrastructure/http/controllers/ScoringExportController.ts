/**
 * Scoring Export Controller
 *
 * Handles HTTP requests for exporting scoring reports
 * in multiple formats (PDF, Word)
 */

import { Request, Response, NextFunction } from 'express';
import { ScoringExportService } from '../../../application/services/ScoringExportService';
import { IAssessmentRepository } from '../../../application/interfaces/IAssessmentRepository';
import { buildContentDisposition } from './DocumentUploadController.js';

export class ScoringExportController {
  constructor(
    private readonly exportService: ScoringExportService,
    private readonly assessmentRepository: IAssessmentRepository
  ) {}

  /**
   * Exports scoring report to PDF
   * GET /api/export/scoring/:assessmentId/pdf
   */
  exportToPDF = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { assessmentId } = req.params;
      const { batchId } = req.query;
      const userId = req.user?.id;

      // Verify ownership
      const assessment = await this.assessmentRepository.findById(assessmentId);
      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }
      if (assessment.createdBy !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Generate PDF
      const buffer = await this.exportService.exportToPDF(
        assessmentId,
        batchId as string | undefined
      );

      // Set headers for file download (sanitized to prevent header injection)
      const filename = this.generateFilename(assessmentId, 'pdf');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', buildContentDisposition(filename));
      res.setHeader('Content-Length', buffer.length);

      // Send file
      res.send(buffer);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('not found') ||
          error.message.includes('results found') ||
          error.message.includes('scores found'))
      ) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  };

  /**
   * Exports scoring report to Word
   * GET /api/export/scoring/:assessmentId/word
   */
  exportToWord = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { assessmentId } = req.params;
      const { batchId } = req.query;
      const userId = req.user?.id;

      // Verify ownership
      const assessment = await this.assessmentRepository.findById(assessmentId);
      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }
      if (assessment.createdBy !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Generate Word document
      const buffer = await this.exportService.exportToWord(
        assessmentId,
        batchId as string | undefined
      );

      // Set headers for file download (sanitized to prevent header injection)
      const filename = this.generateFilename(assessmentId, 'docx');
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', buildContentDisposition(filename));
      res.setHeader('Content-Length', buffer.length);

      // Send file
      res.send(buffer);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('not found') ||
          error.message.includes('results found') ||
          error.message.includes('scores found'))
      ) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  };

  /**
   * Generates sanitized filename for scoring report download
   */
  private generateFilename(assessmentId: string, extension: string): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const shortId = assessmentId.slice(0, 8);
    return `scoring-report-${shortId}-${timestamp}.${extension}`;
  }
}
