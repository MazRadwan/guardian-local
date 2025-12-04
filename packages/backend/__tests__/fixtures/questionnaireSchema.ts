/**
 * Test fixtures for QuestionnaireSchema
 *
 * Provides reusable test data for schema validation and adapter tests.
 */

import type { QuestionnaireSchema } from '../../src/domain/types/QuestionnaireSchema.js';

interface FixtureOptions {
  assessmentType?: 'quick' | 'comprehensive' | 'category_focused';
  vendorName?: string;
  solutionName?: string;
  focusedDimensions?: string[];
}

// Helper to create sections - returns fresh mutable objects each time
function createAllSections() {
  return [
    {
      id: 'privacy_risk',
      title: 'Privacy Risk',
      riskDimension: 'privacy_risk',
      description: 'Assess data privacy and protection practices',
      questions: [
        {
          id: 'privacy_1',
          text: 'How does the solution handle PHI data?',
          category: 'Data Handling',
          riskDimension: 'privacy_risk',
          questionType: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'security_risk',
      title: 'Security Risk',
      riskDimension: 'security_risk',
      description: 'Assess security controls and practices',
      questions: [
        {
          id: 'security_1',
          text: 'What encryption standards are used?',
          category: 'Encryption',
          riskDimension: 'security_risk',
          questionType: 'text',
          required: true,
        },
      ],
    },
    {
      id: 'clinical_risk',
      title: 'Clinical Risk',
      riskDimension: 'clinical_risk',
      description: 'Assess clinical safety and effectiveness',
      questions: [
        {
          id: 'clinical_1',
          text: 'How is clinical validation performed?',
          category: 'Validation',
          riskDimension: 'clinical_risk',
          questionType: 'text',
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
      assessmentType,
      vendorName,
      solutionName,
      generatedAt: new Date().toISOString(),
      questionCount,
    },
    sections,
  };
}
