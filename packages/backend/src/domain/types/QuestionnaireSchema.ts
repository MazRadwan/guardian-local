/**
 * QuestionnaireSchema - Canonical types for questionnaire generation
 *
 * Part of Epic 12.5: Hybrid Questionnaire Generation Architecture
 *
 * These types define the single source of truth for questionnaire structure.
 * All downstream artifacts (chat display, exports) derive from this schema.
 *
 * @see sprint-5-overview.md for architectural context
 */

/**
 * 10 Risk Dimensions per GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md
 */
export type RiskDimension =
  | 'clinical_risk'
  | 'privacy_risk'
  | 'security_risk'
  | 'technical_credibility'
  | 'vendor_capability'
  | 'ai_transparency'
  | 'ethical_considerations'
  | 'regulatory_compliance'
  | 'operational_excellence'
  | 'sustainability';

/**
 * Human-readable labels for risk dimensions
 */
export const RISK_DIMENSION_LABELS: Record<RiskDimension, string> = {
  clinical_risk: 'Clinical Risk',
  privacy_risk: 'Privacy Risk',
  security_risk: 'Security Risk',
  technical_credibility: 'Technical Credibility',
  vendor_capability: 'Vendor Capability',
  ai_transparency: 'AI Transparency',
  ethical_considerations: 'Ethical Considerations',
  regulatory_compliance: 'Regulatory Compliance',
  operational_excellence: 'Operational Excellence',
  sustainability: 'Sustainability',
};

/**
 * All valid risk dimensions (for validation)
 */
export const ALL_RISK_DIMENSIONS: RiskDimension[] = [
  'clinical_risk',
  'privacy_risk',
  'security_risk',
  'technical_credibility',
  'vendor_capability',
  'ai_transparency',
  'ethical_considerations',
  'regulatory_compliance',
  'operational_excellence',
  'sustainability',
];

/**
 * Assessment types supported by the system
 */
export type AssessmentType = 'quick' | 'comprehensive' | 'category_focused';

/**
 * Question types for questionnaire items
 */
export type QuestionType = 'text' | 'yes_no' | 'scale' | 'multiple_choice';

/**
 * Individual question within a questionnaire section
 */
export interface QuestionnaireQuestion {
  /** Unique identifier (e.g., "privacy_1", "security_2") */
  id: string;

  /** The question text */
  text: string;

  /** Category within the risk dimension */
  category: string;

  /** Which risk dimension this question belongs to */
  riskDimension: RiskDimension;

  /** Type of response expected */
  questionType: QuestionType;

  /** Whether this question is required */
  required: boolean;

  /** Optional guidance text for answering */
  guidance?: string;

  /** Options for multiple_choice questions */
  options?: string[];
}

/**
 * Section of questions grouped by risk dimension
 */
export interface QuestionnaireSection {
  /** Unique identifier (e.g., "privacy_risk") */
  id: string;

  /** Display title (e.g., "Privacy Risk") */
  title: string;

  /** Which risk dimension this section covers */
  riskDimension: RiskDimension;

  /** Section description/introduction */
  description: string;

  /** Questions in this section */
  questions: QuestionnaireQuestion[];
}

/**
 * Metadata about the generated questionnaire
 */
export interface QuestionnaireMetadata {
  /** Assessment ID - required for scoring workflow to link back to assessment */
  assessmentId: string;

  /** Type of assessment */
  assessmentType: AssessmentType;

  /** Vendor being assessed (if known) */
  vendorName: string | null;

  /** Solution/product being assessed (if known) */
  solutionName: string | null;

  /** ISO timestamp of generation */
  generatedAt: string;

  /** Total number of questions */
  questionCount: number;

  /** Focus categories for category_focused assessments */
  focusCategories?: string[];
}

/**
 * Complete questionnaire schema - the single source of truth
 *
 * All downstream artifacts (markdown for chat, PDF/Word/Excel exports)
 * are derived deterministically from this schema.
 */
export interface QuestionnaireSchema {
  /** Schema version for future compatibility */
  version: '1.0';

  /** Questionnaire metadata */
  metadata: QuestionnaireMetadata;

  /** Ordered list of sections */
  sections: QuestionnaireSection[];
}

/**
 * Expected question count ranges by assessment type
 */
export const QUESTION_COUNT_RANGES: Record<AssessmentType, { min: number; max: number }> = {
  quick: { min: 30, max: 40 },
  comprehensive: { min: 85, max: 95 },
  category_focused: { min: 50, max: 70 },
};

/**
 * Valid question types for schema validation
 */
const VALID_QUESTION_TYPES: QuestionType[] = ['text', 'yes_no', 'scale', 'multiple_choice'];

/**
 * Validate that a schema has the expected structure
 *
 * Performs both structural and semantic validation including:
 * - Version check
 * - Metadata validation
 * - Section-level validation
 * - Question-level validation (id, text, type, required, options)
 */
export interface QuestionnaireSchemaValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateQuestionnaireSchemaDetailed(
  schema: unknown
): QuestionnaireSchemaValidationResult {
  if (!schema || typeof schema !== 'object') {
    return { isValid: false, error: 'Schema must be an object' };
  }

  const s = schema as QuestionnaireSchema;

  if (s.version !== '1.0') {
    return { isValid: false, error: `Unsupported schema version: ${String(s.version)}` };
  }

  if (!s.metadata || typeof s.metadata !== 'object') {
    return { isValid: false, error: 'Metadata missing or invalid' };
  }

  // Note: assessmentId may be empty during initial generation (set after validation)
  // Exports and scoring workflow will verify it's non-empty
  if (s.metadata.assessmentId !== undefined && typeof s.metadata.assessmentId !== 'string') {
    return { isValid: false, error: 'Metadata assessmentId must be a string' };
  }

  if (!['quick', 'comprehensive', 'category_focused'].includes(s.metadata.assessmentType)) {
    return {
      isValid: false,
      error: `Invalid assessment type: ${String(s.metadata.assessmentType)}`,
    };
  }

  if (!Array.isArray(s.sections) || s.sections.length === 0) {
    return { isValid: false, error: 'Sections must be a non-empty array' };
  }

  for (const [sectionIndex, section] of s.sections.entries()) {
    if (!section || typeof section !== 'object') {
      return { isValid: false, error: `Section ${sectionIndex} is not an object` };
    }

    if (!section.id || !section.title || !section.riskDimension) {
      return { isValid: false, error: `Section ${sectionIndex} missing id/title/riskDimension` };
    }

    if (!ALL_RISK_DIMENSIONS.includes(section.riskDimension)) {
      return { isValid: false, error: `Section ${sectionIndex} has invalid risk dimension` };
    }

    if (!Array.isArray(section.questions)) {
      return { isValid: false, error: `Section ${sectionIndex} questions must be an array` };
    }

    if (section.questions.length === 0) {
      return { isValid: false, error: `Section ${sectionIndex} has no questions` };
    }

    for (const [questionIndex, q] of section.questions.entries()) {
      if (!q || typeof q !== 'object') {
        return {
          isValid: false,
          error: `Question ${questionIndex} in section ${sectionIndex} is not an object`,
        };
      }

      if (!q.id || typeof q.id !== 'string') {
        return {
          isValid: false,
          error: `Question ${questionIndex} in section ${sectionIndex} missing id`,
        };
      }

      if (!q.text || typeof q.text !== 'string' || q.text.trim().length < 5) {
        return {
          isValid: false,
          error: `Question ${questionIndex} in section ${sectionIndex} has invalid text`,
        };
      }

      if (!q.category || typeof q.category !== 'string') {
        return {
          isValid: false,
          error: `Question ${questionIndex} in section ${sectionIndex} missing category`,
        };
      }

      if (!ALL_RISK_DIMENSIONS.includes(q.riskDimension)) {
        return {
          isValid: false,
          error: `Question ${questionIndex} in section ${sectionIndex} has invalid risk dimension`,
        };
      }

      if (!VALID_QUESTION_TYPES.includes(q.questionType)) {
        return {
          isValid: false,
          error: `Question ${questionIndex} in section ${sectionIndex} has invalid question type`,
        };
      }

      if (typeof q.required !== 'boolean') {
        return {
          isValid: false,
          error: `Question ${questionIndex} in section ${sectionIndex} missing required flag`,
        };
      }

      if (q.questionType === 'multiple_choice') {
        if (!Array.isArray(q.options) || q.options.length < 2) {
          return {
            isValid: false,
            error: `Question ${questionIndex} in section ${sectionIndex} has invalid options`,
          };
        }
      }
    }
  }

  return { isValid: true };
}

export function validateQuestionnaireSchema(schema: unknown): schema is QuestionnaireSchema {
  return validateQuestionnaireSchemaDetailed(schema).isValid;
}

/**
 * Epic 18.4: Vendor information for multi-vendor clarification
 *
 * Used by VendorValidationService to report when uploaded files
 * belong to multiple different vendors.
 */
export interface VendorInfo {
  /** Vendor name (from detectedVendorName) */
  name: string;
  /** Number of files belonging to this vendor */
  fileCount: number;
  /** IDs of files belonging to this vendor */
  fileIds: string[];
}
