/**
 * ScoringRetryService - Retry-on-structural-fail logic for scoring
 *
 * When ScoringPayloadValidator detects structural violations (sub-score values
 * not in allowed set, sub-score sum mismatch, composite arithmetic mismatch),
 * this service retries Claude ONCE with a correction prompt, re-validates,
 * and either returns the corrected result or fails closed.
 *
 * Extracted from ScoringService to respect the 300 LOC limit.
 */

import { ScoringPayloadValidator, ValidationResult } from '../../domain/scoring/ScoringPayloadValidator.js';
import { ScoringError } from '../../domain/scoring/errors.js';
import { SolutionType } from '../../domain/scoring/rubric.js';
import { ScoringLLMService, ScoreWithClaudeResult, ISOScoringOptions } from './ScoringLLMService.js';
import { ScoringParseResult } from '../interfaces/IScoringDocumentParser.js';

/** Parameters needed to retry scoring with Claude */
export interface ScoringRetryParams {
  parseResult: ScoringParseResult;
  vendorName: string;
  solutionName: string;
  solutionType: SolutionType;
  abortSignal: AbortSignal;
  onMessage: (message: string) => void;
  isoOptions?: ISOScoringOptions;
}

/**
 * Handles structural violation retry logic.
 *
 * Flow:
 * 1. Build correction prompt listing specific violations
 * 2. Re-invoke Claude via ScoringLLMService
 * 3. Re-validate the retry response
 * 4. If still failing, throw STRUCTURAL_VALIDATION_FAILED
 */
export class ScoringRetryService {
  constructor(
    private validator: ScoringPayloadValidator,
    private llmService: ScoringLLMService
  ) {}

  /**
   * Attempt one retry with a correction prompt.
   * Returns the validated retry result, or throws on second failure.
   */
  async retryWithCorrection(
    violations: string[],
    params: ScoringRetryParams
  ): Promise<{ validationResult: ValidationResult; llmResult: ScoreWithClaudeResult }> {
    const { abortSignal, solutionType } = params;

    console.warn(
      `[ScoringRetryService] Structural violations detected (${violations.length}), retrying once:`,
      violations
    );

    // Check abort before retry
    if (abortSignal.aborted) {
      throw new ScoringError('SCORING_FAILED', 'Scoring aborted before retry');
    }

    // Re-invoke Claude with the same scoring params plus correction context
    const correctionPrompt = this.buildCorrectionPrompt(violations);
    const retryResult = await this.llmService.scoreWithClaude(
      params.parseResult,
      params.vendorName,
      params.solutionName,
      params.solutionType,
      params.abortSignal,
      params.onMessage,
      params.isoOptions,
      correctionPrompt
    );

    // Re-validate
    const retryValidation = this.validator.validate(retryResult.payload, solutionType);

    if (!retryValidation.valid) {
      throw new ScoringError(
        'STRUCTURAL_VALIDATION_FAILED',
        `Retry also failed schema validation: ${retryValidation.errors.join(', ')}`
      );
    }

    if (retryValidation.structuralViolations.length > 0) {
      console.error(
        '[ScoringRetryService] Retry still has structural violations:',
        retryValidation.structuralViolations
      );
      throw new ScoringError(
        'STRUCTURAL_VALIDATION_FAILED',
        `Structural violations persist after retry: ${retryValidation.structuralViolations.join('; ')}`
      );
    }

    console.info('[ScoringRetryService] Retry succeeded - structural violations resolved');
    return { validationResult: retryValidation, llmResult: retryResult };
  }

  /**
   * Build a correction prompt listing the specific violations.
   */
  private buildCorrectionPrompt(violations: string[]): string {
    const violationList = violations.map(v => `- ${v}`).join('\n');
    return [
      'Your previous scoring response had structural violations that must be corrected:',
      '',
      violationList,
      '',
      'RULES:',
      '1. Each dimension score MUST equal the sum of its sub-scores',
      '2. Each sub-score MUST use only the defined point values from the rubric',
      '3. The composite score must match the weighted average formula',
      '',
      'Please re-analyze and provide corrected scores via the scoring_complete tool.',
      'Keep your narrative assessment unchanged -- only correct the numeric scores.',
    ].join('\n');
  }
}
