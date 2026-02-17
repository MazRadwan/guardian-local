/**
 * ExtractionConfidenceCalculator
 *
 * Evaluates regex extraction quality using 4 composite checks.
 * If any check fails, the pipeline falls through to Claude extraction.
 *
 * Epic 39, Story 39.1.2
 */

import type { IQuestionRepository } from '../../application/interfaces/IQuestionRepository.js';
import type { Question } from '../../domain/entities/Question.js';
import type { RegexExtractionResult } from './RegexResponseExtractor.js';

// ---------- Types ----------

export type { RegexExtractionResult };

export interface ConfidenceCheck {
  name: string;
  passed: boolean;
  score: number; // 0-1
  detail: string;
}

export interface ConfidenceResult {
  confident: boolean; // true only if ALL checks pass
  overallScore: number; // weighted average for logging
  checks: ConfidenceCheck[];
  /** DB questions fetched during evaluation — reuse to avoid duplicate queries */
  dbQuestionCount: number;
}

// ---------- UUID validation ----------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

// ---------- Calculator ----------

export class ExtractionConfidenceCalculator {
  constructor(private readonly questionRepo: IQuestionRepository) {}

  /**
   * Run all 4 confidence checks against an extraction result.
   *
   * SECURITY: `expectedAssessmentId` comes from the auth layer and is the
   * only ID used for DB lookups. `extraction.assessmentId` is untrusted
   * user-controlled data from the parsed document.
   */
  async evaluate(
    extraction: RegexExtractionResult,
    expectedAssessmentId?: string,
  ): Promise<ConfidenceResult> {
    const checks: ConfidenceCheck[] = [];

    // Check 1: AssessmentId validity
    checks.push(
      this.checkAssessmentId(extraction.assessmentId, expectedAssessmentId),
    );

    // Check 2: No duplicate markers
    checks.push(this.checkDuplicates(extraction.responses));

    // Check 3 & 4: Require DB questions
    // SECURITY: Use expectedAssessmentId (authorized) for DB query, NOT extraction.assessmentId
    const dbQuestions = expectedAssessmentId
      ? await this.questionRepo.findByAssessmentId(expectedAssessmentId)
      : [];

    // Check 3: Count ratio
    checks.push(
      this.checkCountRatio(extraction.responses.length, dbQuestions.length),
    );

    // Check 4: DB key mapping
    checks.push(this.checkDBKeyMapping(extraction.responses, dbQuestions));

    const confident = checks.every((c) => c.passed);
    const overallScore =
      checks.length > 0
        ? checks.reduce((sum, c) => sum + c.score, 0) / checks.length
        : 0;

    return { confident, overallScore, checks, dbQuestionCount: dbQuestions.length };
  }

  // ---- Individual checks ----

  private checkAssessmentId(
    extractedId: string | null,
    expectedId?: string,
  ): ConfidenceCheck {
    const name = 'assessmentId';

    if (!extractedId) {
      return { name, passed: false, score: 0, detail: 'No assessment ID extracted' };
    }

    if (!isValidUUID(extractedId)) {
      return { name, passed: false, score: 0, detail: `Invalid UUID format: ${extractedId}` };
    }

    if (expectedId && extractedId !== expectedId) {
      return {
        name,
        passed: false,
        score: 0,
        detail: `ID mismatch: extracted ${extractedId} !== expected ${expectedId}`,
      };
    }

    return { name, passed: true, score: 1, detail: 'Assessment ID valid' };
  }

  private checkDuplicates(
    responses: RegexExtractionResult['responses'],
  ): ConfidenceCheck {
    const name = 'duplicates';
    const keys = responses.map(
      (r) => `${r.sectionNumber}.${r.questionNumber}`,
    );
    const unique = new Set(keys);

    if (unique.size !== keys.length) {
      const dupeCount = keys.length - unique.size;
      return {
        name,
        passed: false,
        score: 0,
        detail: `Found ${dupeCount} duplicate question marker(s)`,
      };
    }

    return { name, passed: true, score: 1, detail: 'No duplicate markers' };
  }

  private checkCountRatio(
    parsedCount: number,
    expectedCount: number,
  ): ConfidenceCheck {
    const name = 'countRatio';

    if (expectedCount === 0) {
      return {
        name,
        passed: false,
        score: 0,
        detail: 'No expected questions found in database',
      };
    }

    const ratio = parsedCount / expectedCount;

    if (ratio < 0.9) {
      return {
        name,
        passed: false,
        score: Math.min(ratio, 1),
        detail: `Count ratio ${ratio.toFixed(2)} below 0.9 threshold (${parsedCount}/${expectedCount})`,
      };
    }

    return {
      name,
      passed: true,
      score: Math.min(ratio, 1),
      detail: `Count ratio ${ratio.toFixed(2)} (${parsedCount}/${expectedCount})`,
    };
  }

  private checkDBKeyMapping(
    responses: RegexExtractionResult['responses'],
    dbQuestions: Question[],
  ): ConfidenceCheck {
    const name = 'dbKeyMapping';

    if (responses.length === 0) {
      return {
        name,
        passed: false,
        score: 0,
        detail: 'No responses to validate against DB',
      };
    }

    const dbKeySet = new Set(
      dbQuestions.map((q) => `${q.sectionNumber}.${q.questionNumber}`),
    );

    let matched = 0;
    const unmatchedKeys: string[] = [];

    for (const r of responses) {
      const key = `${r.sectionNumber}.${r.questionNumber}`;
      if (dbKeySet.has(key)) {
        matched++;
      } else {
        unmatchedKeys.push(key);
      }
    }

    const score = responses.length > 0 ? matched / responses.length : 0;
    const passed = score === 1;

    if (!passed) {
      return {
        name,
        passed,
        score,
        detail: `${matched}/${responses.length} keys matched DB; unmatched: ${unmatchedKeys.slice(0, 5).join(', ')}`,
      };
    }

    return {
      name,
      passed: true,
      score: 1,
      detail: `All ${matched} keys matched DB questions`,
    };
  }
}
