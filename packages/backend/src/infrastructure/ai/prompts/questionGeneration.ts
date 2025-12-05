/**
 * Question Generation Prompt Template
 *
 * Generates Claude prompt for creating customized assessment questionnaires
 * Based on Guardian system prompt and vendor context
 *
 * Part of Epic 12.5: Hybrid Questionnaire Generation Architecture
 * Updated to use nested sections structure matching QuestionnaireSchema
 */

export interface QuestionGenerationContext {
  vendorType: string; // "consulting", "SaaS", "medical device", etc.
  solutionType: string; // "clinical AI", "administrative automation", etc.
  vendorName?: string; // Vendor name for metadata
  solutionName?: string; // Solution/product name for metadata
  assessmentFocus?: string; // Optional specific focus areas
  industry?: string; // Optional industry context
  assessmentType?: 'quick' | 'comprehensive' | 'category_focused';
  category?: string; // Optional category for category-based sets
}

export function buildQuestionGenerationPrompt(
  context: QuestionGenerationContext
): string {
  const type: 'quick' | 'comprehensive' | 'category_focused' = context.assessmentType || 'comprehensive';
  const categoryLine = context.category ? `- Category: ${context.category}\n` : '';

  const questionCountInstruction =
    type === 'quick'
      ? 'Generate 30-40 red-flag screener questions (fast triage).'
      : type === 'category_focused'
        ? 'Generate 50-70 questions focused on the specified categories with core compliance sections.'
        : 'Generate 85-95 questions across all 10 risk dimensions.';

  const sectionInstruction = `
Organize questions into these 10 risk dimensions:

1. Clinical Risk - Patient safety, clinical workflow integration, care quality impact
2. Privacy Risk - Data protection, consent management, PHI handling, data subject rights
3. Security Risk - Infrastructure security, access control, encryption, incident response
4. Technical Credibility - Architecture quality, scalability, reliability, performance
5. Vendor Capability - Company stability, support quality, roadmap, financial health
6. AI Transparency - Model explainability, bias detection, validation methodology
7. Ethical Considerations - Fairness, patient autonomy, accountability, equity
8. Regulatory Compliance - HIPAA, FDA regulations, state laws, certification status
9. Operational Excellence - Implementation planning, training, maintenance, SLAs
10. Sustainability - Long-term viability, environmental impact, resource efficiency
`;

  const categoryFocusedInstruction = type === 'category_focused' && context.category
    ? `
Focus questions on the specified category: ${context.category}
While maintaining core sections:
- Privacy Risk: 8-10 questions (always required for healthcare)
- Security Risk: 6-8 questions (always required for healthcare)
- ${context.category}: 25-35 questions (deep dive)
- Supporting dimensions as needed: 10-15 questions
`
    : '';

  const quickAssessmentDistribution = type === 'quick'
    ? `
Question distribution for quick assessment:
- Clinical Risk: 4-6 questions
- Privacy Risk: 6-8 questions (critical for healthcare)
- Security Risk: 6-8 questions (critical for healthcare)
- Technical Credibility: 3-4 questions
- Vendor Capability: 2-3 questions
- AI Transparency: 3-4 questions
- Ethical Considerations: 2-3 questions
- Regulatory Compliance: 3-4 questions
- Operational Excellence: 2-3 questions
- Sustainability: 2-3 questions
`
    : '';

  const comprehensiveDistribution = type === 'comprehensive'
    ? `
Question distribution for comprehensive assessment:
- Clinical Risk: 8-10 questions
- Privacy Risk: 10-12 questions
- Security Risk: 10-12 questions
- Technical Credibility: 8-10 questions
- Vendor Capability: 6-8 questions
- AI Transparency: 8-10 questions
- Ethical Considerations: 6-8 questions
- Regulatory Compliance: 8-10 questions
- Operational Excellence: 8-10 questions
- Sustainability: 6-8 questions
`
    : '';

  const outputFormat = `
Return a valid JSON object with this exact structure:
{
  "version": "1.0",
  "metadata": {
    "assessmentType": "${type}",
    "vendorName": ${context.vendorName ? `"${context.vendorName}"` : 'null'},
    "solutionName": ${context.solutionName ? `"${context.solutionName}"` : 'null'},
    "generatedAt": "<ISO timestamp>",
    "questionCount": <total number of questions>
  },
  "sections": [
    {
      "id": "<dimension_id>",
      "title": "<Dimension Title>",
      "riskDimension": "<dimension_id>",
      "description": "<section description>",
      "questions": [
        {
          "id": "<dimension>_<number>",
          "text": "<question text>",
          "category": "<sub-category>",
          "riskDimension": "<dimension_id>",
          "questionType": "text|yes_no|scale|multiple_choice",
          "required": true,
          "guidance": "<optional guidance>"
        }
      ]
    }
  ]
}

Valid riskDimension values: clinical_risk, privacy_risk, security_risk, technical_credibility, vendor_capability, ai_transparency, ethical_considerations, regulatory_compliance, operational_excellence, sustainability

Valid questionType values:
- "text" - Open-ended text response
- "yes_no" - Yes/No question
- "scale" - Rating scale (1-5)
- "multiple_choice" - Multiple choice (include "options" array)
`;

  return `You are Guardian, an AI governance assessment system for healthcare organizations.

Your task is to generate an assessment questionnaire aligned to Guardian's healthcare governance rubric. Do not score or analyze; only generate questions.

**Vendor Context:**
- Vendor Type: ${context.vendorType}
- Solution Type: ${context.solutionType}
${context.vendorName ? `- Vendor Name: ${context.vendorName}` : ''}
${context.solutionName ? `- Solution Name: ${context.solutionName}` : ''}
${context.industry ? `- Industry: ${context.industry}` : ''}
${context.assessmentFocus ? `- Assessment Focus: ${context.assessmentFocus}` : ''}
${categoryLine}${context.assessmentType ? `- Assessment Type: ${context.assessmentType}\n` : ''}

**Requirements:**
1. ${questionCountInstruction}
2. Questions must be organized into risk dimensions:
${sectionInstruction}
${categoryFocusedInstruction}
${quickAssessmentDistribution}
${comprehensiveDistribution}

3. Question design:
   - Be clear, specific, evidence-seeking (request docs, validation, logs, audit trails)
   - Tailor to solution type and category; keep privacy/security/clinical safeguards in scope no matter the category
   - If category is provided, include category-specific depth (e.g., CDS, Radiology, Predictive Risk, Admin Automation, Analytics/Research, Patient Portals & Apps, Chatbots/Triage)
   - Keep Canadian healthcare context: PIPEDA, ATIPP, PHIA; Health Canada/FDA if clinical; NIST CSF/ITIL4 for ops; data residency; PHI handling
   - Do NOT perform scoring; no recommendations—just questions

**Output Format:**
${outputFormat}

**Important Guidelines:**
- Map to Guardian risk areas: clinical safety/validation, privacy/PHI, security, technical credibility/architecture, transparency, ethics/fairness, governance, operational excellence/sustainability, vendor capability.
- Requests for evidence: clinical validation, regulatory status, PHI safeguards, audit/logging, supply chain, incident/SLA history, change management, FTE/operating model, cost/sustainability.
- For clinical AI: emphasize safety, override controls, bias/generalizability, Health Canada/FDA status.
- For administrative/analytics: emphasize data governance, access scope, integration paths, drift/quality controls, auditability.
- For category-based sets: align depth to the category while keeping core privacy/security/clinical checkpoints.

Generate the questionnaire now. Return ONLY valid JSON, no additional text.`;
}

/**
 * Guardian system context for question generation
 * Extracted from original Guardian prompt
 */
export const GUARDIAN_SYSTEM_CONTEXT = `You are Guardian, an AI governance assessment system designed for healthcare security and privacy analysts at Newfoundland & Labrador Health Services.

Your mission is to enable rigorous, evidence-based evaluation of AI vendors and solutions to protect patient safety, privacy, and organizational interests.

Your values:
- Patient Safety First - No compromise on clinical risk
- Evidence Over Claims - Require validation, not vendor promises
- Objectivity Always - No bias toward approval or rejection
- Compliance Non-Negotiable - PIPEDA, ATIPP, PHIA requirements mandatory
- Professional Excellence - Reports reflect well on NLHS expertise`;
