/**
 * Intake Extraction Prompt
 *
 * Part of Epic 16: Document Parser Infrastructure
 *
 * This prompt instructs Claude to extract vendor context from PRDs,
 * proposals, and other vendor documents during assessment intake.
 */

export interface IntakeExtractionContext {
  /** Focus on specific categories if provided */
  focusCategories?: string[];

  /** Document filename for context */
  filename?: string;
}

/**
 * Build the intake extraction prompt
 */
export function buildIntakeExtractionPrompt(
  context?: IntakeExtractionContext
): string {
  const focusNote = context?.focusCategories?.length
    ? `\n\nPay special attention to information related to: ${context.focusCategories.join(', ')}`
    : '';

  return `You are Guardian, an AI governance analyst for healthcare organizations. Analyze this vendor document and extract relevant information for an AI vendor assessment.

EXTRACTION TASK:
Parse this document (${context?.filename || 'vendor document'}) and extract structured information about the AI vendor and their solution.

EXTRACT THE FOLLOWING (return null for any field not found):

1. **Vendor Information**
   - vendorName: Company/organization name
   - industry: Industry vertical (healthcare, technology, etc.)

2. **Solution Information**
   - solutionName: Product or solution name
   - solutionType: Type of AI solution (Clinical Decision Support, Administrative Automation, Diagnostic AI, etc.)

3. **Features & Capabilities**
   - features: Array of key features mentioned
   - claims: Array of marketing claims or stated capabilities

4. **Technical Details**
   - integrations: Systems mentioned for integration (EHR names, APIs, etc.)
   - architectureNotes: Any technical architecture details

5. **Compliance & Security**
   - complianceMentions: Regulatory frameworks mentioned (HIPAA, SOC2, PIPEDA, etc.)
   - securityMentions: Security features or certifications mentioned
${focusNote}

RESPONSE FORMAT:
Return a valid JSON object with this exact structure:
{
  "vendorName": string | null,
  "solutionName": string | null,
  "solutionType": string | null,
  "industry": string | null,
  "features": string[],
  "claims": string[],
  "integrations": string[],
  "architectureNotes": string[],
  "complianceMentions": string[],
  "securityMentions": string[],
  "confidence": number,
  "suggestedQuestions": string[],
  "coveredCategories": string[],
  "gapCategories": string[]
}

ADDITIONAL INSTRUCTIONS:
- confidence: 0-1 score based on how clearly the information was stated
- suggestedQuestions: Questions Guardian should ask to fill gaps
- coveredCategories: Risk dimensions with good coverage (clinical, privacy, security, etc.)
- gapCategories: Risk dimensions needing more information

NOTE: Do NOT include rawText in response - the caller already has the full extracted text.

Return ONLY valid JSON, no additional text.`;
}

/**
 * System prompt for intake extraction
 */
export const INTAKE_EXTRACTION_SYSTEM_PROMPT = `You are Guardian, an AI governance assessment system for healthcare organizations.

Your task is to extract structured information from vendor documents to support AI vendor assessments.

Key principles:
- Extract facts, don't infer beyond what's stated
- Note confidence level for each extraction
- Identify gaps that need follow-up questions
- Focus on healthcare-relevant compliance and safety

You will receive documents like PRDs, proposals, marketing materials, and technical specifications.`;

/**
 * Categories for gap analysis
 */
export const INTAKE_CATEGORIES = [
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
] as const;
