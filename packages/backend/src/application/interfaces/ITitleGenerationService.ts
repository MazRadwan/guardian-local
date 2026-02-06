/**
 * Interface for Title Generation Service
 *
 * Story 28.11.1: Extracted interface for TitleGenerationService dependency injection.
 * Allows ChatServer to depend on an abstraction rather than concrete implementation.
 */

import type { TitleContext, TitleGenerationResult } from '../services/TitleGenerationService.js';

export interface ITitleGenerationService {
  /**
   * Generate mode-aware title based on conversation context
   *
   * @param context - Title generation context including mode, messages, and metadata
   * @returns Promise with title string and source indicator
   */
  generateModeAwareTitle(context: TitleContext): Promise<TitleGenerationResult>;

  /**
   * Format scoring title from filename
   * Truncates long filenames while preserving extension
   *
   * Story 35.1.1: Exposed on interface for TitleUpdateService delegation
   *
   * @param filename - Uploaded filename to format
   * @returns Formatted title string (e.g., "Scoring: vendor_report.pdf")
   */
  formatScoringTitle(filename: string): string;
}
