/**
 * Test fixtures for QuestionnaireSchema
 *
 * Provides reusable test data for schema validation and adapter tests.
 */

import type { QuestionnaireSchema, QuestionnaireSection, RiskDimension, QuestionType } from '../../src/domain/types/QuestionnaireSchema.js';

interface FixtureOptions {
  assessmentId?: string;
  assessmentType?: 'quick' | 'comprehensive' | 'category_focused';
  vendorName?: string;
  solutionName?: string;
  focusedDimensions?: RiskDimension[];
}

// Helper to create sections - returns fresh mutable objects each time
function createAllSections(): QuestionnaireSection[] {
  return [
    {
      id: 'privacy_risk',
      title: 'Privacy Risk',
      riskDimension: 'privacy_risk' as RiskDimension,
      description: 'Assess data privacy and protection practices',
      questions: [
        {
          id: 'privacy_1',
          text: 'How does the solution handle PHI data?',
          category: 'Data Handling',
          riskDimension: 'privacy_risk' as RiskDimension,
          questionType: 'text' as QuestionType,
          required: true,
        },
      ],
    },
    {
      id: 'security_risk',
      title: 'Security Risk',
      riskDimension: 'security_risk' as RiskDimension,
      description: 'Assess security controls and practices',
      questions: [
        {
          id: 'security_1',
          text: 'What encryption standards are used?',
          category: 'Encryption',
          riskDimension: 'security_risk' as RiskDimension,
          questionType: 'text' as QuestionType,
          required: true,
        },
      ],
    },
    {
      id: 'clinical_risk',
      title: 'Clinical Risk',
      riskDimension: 'clinical_risk' as RiskDimension,
      description: 'Assess clinical safety and effectiveness',
      questions: [
        {
          id: 'clinical_1',
          text: 'How is clinical validation performed?',
          category: 'Validation',
          riskDimension: 'clinical_risk' as RiskDimension,
          questionType: 'text' as QuestionType,
          required: true,
        },
      ],
    },
  ];
}

export function fixtureQuestionnaireSchema(
  options: FixtureOptions = {}
): QuestionnaireSchema {
  const {
    assessmentId = 'test-assessment-id',
    assessmentType = 'comprehensive',
    vendorName = 'Test Vendor',
    solutionName = 'Test Solution',
    focusedDimensions,
  } = options;

  // Get fresh mutable sections
  const allSections = createAllSections();

  // Filter sections if focusedDimensions provided (for category_focused)
  const sections = focusedDimensions
    ? allSections.filter((s) => focusedDimensions.includes(s.riskDimension))
    : allSections.slice(0, 2); // Default to first 2 sections

  const questionCount = sections.reduce((sum, s) => sum + s.questions.length, 0);

  return {
    version: '1.0',
    metadata: {
      assessmentId,
      assessmentType,
      vendorName,
      solutionName,
      generatedAt: new Date().toISOString(),
      questionCount,
    },
    sections,
  };
}
