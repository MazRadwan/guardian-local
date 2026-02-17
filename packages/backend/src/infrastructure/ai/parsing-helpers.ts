/**
 * Parsing helper functions for DocumentParserService
 *
 * Extracted from DocumentParserService.ts to comply with 300 LOC limit.
 * Pure validation and defaults logic for AI JSON responses.
 */

// =============================================================================
// Types for AI JSON responses
// =============================================================================

/**
 * Shape of Claude's intake extraction response
 */
export interface IntakeExtractionResponse {
  vendorName: string | null;
  solutionName: string | null;
  solutionType: string | null;
  industry: string | null;
  features: string[];
  claims: string[];
  integrations: string[];
  complianceMentions: string[];
  architectureNotes: string[];
  securityMentions: string[];
  confidence: number;
  suggestedQuestions: string[];
  coveredCategories: string[];
  gapCategories: string[];
}

/**
 * Shape of Claude's scoring extraction response
 */
export interface ScoringExtractionResponse {
  assessmentId: string | null;
  vendorName: string | null;
  solutionName: string | null;
  responses: Array<{
    sectionNumber: number;
    sectionTitle: string | null;
    questionNumber: number;
    questionText: string;
    responseText: string;
    confidence: number;
    hasVisualContent: boolean;
    visualContentDescription: string | null;
  }>;
  expectedQuestionCount: number | null;
  parsedQuestionCount: number;
  unparsedQuestions: string[];
  isComplete: boolean;
  overallConfidence: number;
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Filter array to only include strings (hygiene for AI responses)
 */
function filterStrings(arr: unknown[]): string[] {
  return arr.filter((x): x is string => typeof x === 'string');
}

/**
 * Check if value is a non-null object (safe for property access)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Apply safe defaults to intake extraction response
 */
export function applyIntakeDefaults(raw: Record<string, unknown>): IntakeExtractionResponse {
  return {
    vendorName: typeof raw.vendorName === 'string' ? raw.vendorName : null,
    solutionName: typeof raw.solutionName === 'string' ? raw.solutionName : null,
    solutionType: typeof raw.solutionType === 'string' ? raw.solutionType : null,
    industry: typeof raw.industry === 'string' ? raw.industry : null,
    features: Array.isArray(raw.features) ? filterStrings(raw.features) : [],
    claims: Array.isArray(raw.claims) ? filterStrings(raw.claims) : [],
    integrations: Array.isArray(raw.integrations) ? filterStrings(raw.integrations) : [],
    complianceMentions: Array.isArray(raw.complianceMentions) ? filterStrings(raw.complianceMentions) : [],
    architectureNotes: Array.isArray(raw.architectureNotes) ? filterStrings(raw.architectureNotes) : [],
    securityMentions: Array.isArray(raw.securityMentions) ? filterStrings(raw.securityMentions) : [],
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.5,
    suggestedQuestions: Array.isArray(raw.suggestedQuestions) ? filterStrings(raw.suggestedQuestions) : [],
    coveredCategories: Array.isArray(raw.coveredCategories) ? filterStrings(raw.coveredCategories) : [],
    gapCategories: Array.isArray(raw.gapCategories) ? filterStrings(raw.gapCategories) : [],
  };
}

/**
 * Apply safe defaults to scoring extraction response
 */
export function applyScoringDefaults(raw: Record<string, unknown>): ScoringExtractionResponse {
  const rawResponses = Array.isArray(raw.responses) ? raw.responses : [];

  return {
    assessmentId: typeof raw.assessmentId === 'string' ? raw.assessmentId : null,
    vendorName: typeof raw.vendorName === 'string' ? raw.vendorName : null,
    solutionName: typeof raw.solutionName === 'string' ? raw.solutionName : null,
    responses: rawResponses
      .filter(isObject)
      .map((r) => ({
        sectionNumber: typeof r.sectionNumber === 'number' ? r.sectionNumber : 0,
        sectionTitle: typeof r.sectionTitle === 'string' ? r.sectionTitle : null,
        questionNumber: typeof r.questionNumber === 'number' ? r.questionNumber : 0,
        questionText: typeof r.questionText === 'string' ? r.questionText : '',
        responseText: typeof r.responseText === 'string' ? r.responseText : '',
        confidence: typeof r.confidence === 'number' ? r.confidence : 0.5,
        hasVisualContent: r.hasVisualContent === true,
        visualContentDescription: typeof r.visualContentDescription === 'string' ? r.visualContentDescription : null,
      })),
    expectedQuestionCount: typeof raw.expectedQuestionCount === 'number' ? raw.expectedQuestionCount : null,
    parsedQuestionCount: typeof raw.parsedQuestionCount === 'number' ? raw.parsedQuestionCount : 0,
    unparsedQuestions: Array.isArray(raw.unparsedQuestions) ? filterStrings(raw.unparsedQuestions) : [],
    isComplete: raw.isComplete === true,
    overallConfidence: typeof raw.overallConfidence === 'number' ? raw.overallConfidence : 0.5,
  };
}

// =============================================================================
// Guardian Document Signature Pre-Check (Story 20.4.1)
// =============================================================================

/**
 * Regex patterns to identify Guardian questionnaire documents.
 */
const GUARDIAN_MARKERS = [
  /Assessment\s+ID:\s*[a-f0-9-]{36}/i,
  /GUARDIAN.*Assessment/i,
  /Section\s+\d+:/i,
  /Question\s+\d+\.\d+/i,
  /\d+\.\d+\s+[-\u2013\u2014]\s+/i,
];

/**
 * Minimum markers required to pass pre-check.
 */
const MIN_MARKERS_REQUIRED = 2;

export interface GuardianPreCheckResult {
  likely: boolean;
  foundMarkers: string[];
}

/**
 * Quick pre-check to detect if document is likely a Guardian questionnaire.
 */
export function isLikelyGuardianDocument(text: string): GuardianPreCheckResult {
  if (!text || text.length < 100) {
    return { likely: false, foundMarkers: [] };
  }

  const foundMarkers: string[] = [];

  for (const marker of GUARDIAN_MARKERS) {
    if (marker.test(text)) {
      foundMarkers.push(marker.source);
    }
  }

  return {
    likely: foundMarkers.length >= MIN_MARKERS_REQUIRED,
    foundMarkers,
  };
}
