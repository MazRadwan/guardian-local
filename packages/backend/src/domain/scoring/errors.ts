/**
 * Scoring Error Types
 *
 * Domain-level error codes for the scoring workflow.
 * Epic 15 Story 5a.4: Structured error codes for WebSocket events
 */

/**
 * Scoring error codes for structured error handling
 */
export type ScoringErrorCode =
  | 'ASSESSMENT_NOT_FOUND'
  | 'UNAUTHORIZED_ASSESSMENT'
  | 'ASSESSMENT_NOT_EXPORTED'
  | 'PARSE_FAILED'
  | 'PARSE_CONFIDENCE_TOO_LOW'
  | 'RATE_LIMITED'
  | 'DUPLICATE_FILE'
  | 'SCORING_FAILED'
  | 'STRUCTURAL_VALIDATION_FAILED' // Retry-on-structural-fail: scores violate rubric arithmetic
  | 'STORAGE_FAILED'; // Epic 20.2.1: Transaction failure during score storage

/**
 * Error thrown during scoring workflow with structured code
 */
export class ScoringError extends Error {
  constructor(
    public code: ScoringErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ScoringError';
  }
}

/**
 * Error thrown when user doesn't have access
 */
export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
