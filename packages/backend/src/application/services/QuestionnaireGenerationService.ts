/**
 * QuestionnaireGenerationService - Orchestrates questionnaire generation
 *
 * Part of Epic 12.5: Hybrid Questionnaire Generation Architecture
 *
 * This service:
 * 1. Builds the generation prompt
 * 2. Makes a single Claude call
 * 3. Parses and validates the JSON response
 * 4. Persists questions to the assessment
 * 5. Renders markdown for chat display
 *
 * Single source of truth: The JSON schema drives everything.
 */

import {
  IQuestionnaireGenerationService,
  GenerationContext,
  GenerationResult,
} from '../interfaces/IQuestionnaireGenerationService.js';
import {
  QuestionnaireSchema,
  QuestionnaireSection,
  QuestionnaireQuestion,
  QuestionnaireMetadata,
  RiskDimension,
  QuestionType,
  validateQuestionnaireSchemaDetailed,
  QUESTION_COUNT_RANGES,
  ALL_RISK_DIMENSIONS,
  RISK_DIMENSION_LABELS,
} from '../../domain/types/QuestionnaireSchema.js';
import { IClaudeClient } from '../interfaces/IClaudeClient.js';
import { IQuestionRepository } from '../interfaces/IQuestionRepository.js';
import { AssessmentService } from './AssessmentService.js';
import { VendorService } from './VendorService.js';
import { ConversationService } from './ConversationService.js';
import { buildQuestionGenerationPrompt } from '../../infrastructure/ai/prompts/questionGeneration.js';
import { questionnaireToMarkdown } from '../../infrastructure/rendering/questionnaireToMarkdown.js';
import { schemaToQuestions } from '../adapters/QuestionnaireSchemaAdapter.js';
import {
  questionnaireOutputTool,
  QUESTIONNAIRE_OUTPUT_TOOL_NAME,
} from '../../infrastructure/ai/tools/questionnaireOutputTool.js';

export class QuestionnaireGenerationService implements IQuestionnaireGenerationService {
  constructor(
    private readonly claudeClient: IClaudeClient,
    private readonly questionRepository: IQuestionRepository,
    private readonly assessmentService: AssessmentService,
    private readonly vendorService: VendorService,
    private readonly conversationService: ConversationService
  ) {}

  async generate(context: GenerationContext): Promise<GenerationResult> {
    console.log('[QuestionnaireGenerationService] Starting generation:', {
      conversationId: context.conversationId,
      assessmentType: context.assessmentType,
    });

    // Dev testing fast path - skip Claude, return fixture
    // This significantly speeds up testing of the generate button and export functionality
    // Excluded in 'test' environment so unit tests can verify Claude integration
    if (
      process.env.GUARDIAN_FAST_GENERATION === 'true' &&
      process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'test'
    ) {
      console.log(
        '[QuestionnaireGenerationService] FAST_GENERATION enabled - using fixture (skipping Claude)'
      );
      return this.generateFastFixture(context);
    }

    // 1. Build the generation prompt
    const prompt = buildQuestionGenerationPrompt({
      vendorType: context.vendorName || 'AI Vendor',
      solutionType: context.solutionName || 'AI Solution',
      vendorName: context.vendorName,
      solutionName: context.solutionName,
      assessmentFocus: context.contextSummary,
      assessmentType: context.assessmentType,
      category: context.selectedCategories?.[0],
    });

    // 2. Call Claude with tool_use for structured output
    // Use higher max_tokens (16384) because questionnaires are large JSON objects
    // Default 4096 causes Claude to truncate output before generating sections
    const response = await this.claudeClient.sendMessage(
      [{ role: 'user', content: prompt }],
      {
        systemPrompt:
          'You are a healthcare AI governance expert. Generate comprehensive vendor assessment questionnaires. ' +
          'Use the output_questionnaire tool to return your questionnaire in structured JSON format.',
        tools: [questionnaireOutputTool],
        tool_choice: { type: 'tool', name: QUESTIONNAIRE_OUTPUT_TOOL_NAME },
        maxTokens: 32768, // Comprehensive questionnaires (100 questions) need ~20K tokens
      }
    );

    // 3. Extract schema from tool_use response
    const rawSchema = this.extractSchemaFromToolUse(response);

    // DEBUG: Log raw schema from Claude BEFORE normalization
    const fullRawJson = JSON.stringify(rawSchema, null, 2) || 'undefined';
    console.log('[QuestionnaireGenerationService] Raw schema from Claude (full):', fullRawJson.slice(0, 5000));

    const schema = this.normalizeSchema(rawSchema);

    // 4. Validate schema (log reason if invalid)
    const validationResult = validateQuestionnaireSchemaDetailed(schema);
    if (!validationResult.isValid) {
      console.error('[QuestionnaireGenerationService] Invalid schema received from Claude:', {
        reason: validationResult.error,
        schemaPreview: JSON.stringify(schema).slice(0, 2000),
      });
      throw new Error('Claude returned invalid questionnaire schema');
    }

    // 5. Validate question count (warning only)
    const range = QUESTION_COUNT_RANGES[context.assessmentType];
    const actualQuestionCount = schema.sections.reduce(
      (total, section) => total + section.questions.length,
      0
    );
    if (actualQuestionCount < range.min * 0.8 || actualQuestionCount > range.max * 1.2) {
      console.warn(
        `[QuestionnaireGenerationService] Question count ${actualQuestionCount} outside expected range [${range.min}, ${range.max}]`
      );
      // Don't throw - just warn. Claude may have good reasons.
    }

    // 6. Correct metadata to match actual count (Claude may claim wrong count)
    schema.metadata.questionCount = actualQuestionCount;

    // 7. Get or create assessment
    const assessmentId = await this.ensureAssessment(context, schema);

    // 7.5. Add assessmentId to schema metadata (required for scoring workflow)
    schema.metadata.assessmentId = assessmentId;

    // 8. Persist questions to assessment (replaces existing if re-generating)
    await this.persistQuestions(assessmentId, schema);

    // 9. Render markdown
    const markdown = questionnaireToMarkdown(schema);

    console.log('[QuestionnaireGenerationService] Generation complete:', {
      assessmentId,
      questionCount: actualQuestionCount,
      sectionCount: schema.sections.length,
    });

    return {
      schema,
      assessmentId,
      markdown,
    };
  }

  /**
   * Normalize schema from Claude by filling missing fields, trimming text,
   * defaulting invalid values, and dropping empty sections/questions.
   * This makes the schema validation more tolerant without sacrificing
   * correctness.
   */
  private normalizeSchema(schema: QuestionnaireSchema): QuestionnaireSchema {
    const sectionsInput = Array.isArray(schema.sections) ? schema.sections : [];

    if (!Array.isArray(schema.sections)) {
      console.warn('[QuestionnaireGenerationService] Schema sections missing or invalid, defaulting to empty array');
    }

    const normalizedSections: QuestionnaireSection[] = sectionsInput
      .map((section, sectionIndex) => {
        const riskDimension = this.coerceRiskDimension(section.riskDimension);
        if (!riskDimension) {
          console.warn(
            `[QuestionnaireGenerationService] Dropping section ${sectionIndex} due to invalid risk dimension`
          );
          return null;
        }

        const title =
          typeof section.title === 'string' && section.title.trim().length > 0
            ? section.title.trim()
            : RISK_DIMENSION_LABELS[riskDimension];

        const description =
          typeof section.description === 'string' ? section.description : '';

        const questions: QuestionnaireQuestion[] = (section.questions || [])
          .map((question, questionIndex) => {
            if (!question || typeof question !== 'object') {
              return null;
            }

            const text =
              typeof question.text === 'string' ? question.text.trim() : '';
            if (text.length < 5) {
              console.warn(
                `[QuestionnaireGenerationService] Dropping question ${questionIndex} in section ${sectionIndex} due to short text`
              );
              return null;
            }

            const category =
              typeof question.category === 'string' && question.category.trim().length > 0
                ? question.category.trim()
                : title;

            const riskDim = this.coerceRiskDimension(question.riskDimension) || riskDimension;
            const questionType = this.normalizeQuestionType(question.questionType);
            const required = typeof question.required === 'boolean' ? question.required : true;

            const options =
              questionType === 'multiple_choice'
                ? Array.isArray(question.options) && question.options.length >= 2
                  ? question.options
                  : ['Yes', 'No']
                : undefined;

            const id =
              typeof question.id === 'string' && question.id.trim().length > 0
                ? question.id
                : `${riskDim}_${questionIndex + 1}`;

            return {
              ...question,
              id,
              text,
              category,
              riskDimension: riskDim,
              questionType,
              required,
              ...(options ? { options } : {}),
            } satisfies QuestionnaireQuestion;
          })
          .filter((q): q is QuestionnaireQuestion => Boolean(q));

        if (questions.length === 0) {
          console.warn(
            `[QuestionnaireGenerationService] Dropping section ${sectionIndex} because no valid questions remain`
          );
          return null;
        }

        return {
          ...section,
          id: section.id || `${riskDimension}_${sectionIndex + 1}`,
          title,
          description,
          riskDimension,
          questions,
        } satisfies QuestionnaireSection;
      })
      .filter((section): section is QuestionnaireSection => Boolean(section));

    if (normalizedSections.length === 0) {
      console.error('[QuestionnaireGenerationService] All sections were dropped during normalization');
    }

    const metadata: QuestionnaireMetadata =
      schema.metadata && typeof schema.metadata === 'object'
        ? schema.metadata
        : ({} as QuestionnaireMetadata);

    return {
      ...schema,
      version: '1.0',
      metadata: {
        ...metadata,
        assessmentId: metadata.assessmentId ?? '', // Placeholder - set after ensureAssessment()
        assessmentType: metadata.assessmentType ?? schema.metadata?.assessmentType ?? 'comprehensive',
        generatedAt: metadata.generatedAt ?? schema.metadata?.generatedAt ?? new Date().toISOString(),
        questionCount: metadata.questionCount ?? schema.metadata?.questionCount ?? 0,
        vendorName: metadata.vendorName || null,
        solutionName: metadata.solutionName || null,
      },
      sections: normalizedSections,
    };
  }

  private coerceRiskDimension(value: unknown): RiskDimension | null {
    if (typeof value === 'string' && ALL_RISK_DIMENSIONS.includes(value as RiskDimension)) {
      return value as RiskDimension;
    }
    return null;
  }

  private normalizeQuestionType(value: unknown): QuestionType {
    if (typeof value === 'string') {
      const lower = value.toLowerCase() as QuestionType;
      if (['text', 'yes_no', 'scale', 'multiple_choice'].includes(lower)) {
        return lower;
      }
    }
    return 'text';
  }

  /**
   * Extract QuestionnaireSchema from Claude's tool_use response
   *
   * Story 5.3.1: Using tool_use provides built-in schema validation and
   * eliminates the need for regex extraction of JSON from responses.
   */
  private extractSchemaFromToolUse(
    response: Awaited<ReturnType<typeof this.claudeClient.sendMessage>>
  ): QuestionnaireSchema {
    // Check for tool_use response
    if (!response.toolUse || response.toolUse.length === 0) {
      console.error('[QuestionnaireGenerationService] No tool_use in response:', {
        content: response.content.substring(0, 500),
        stop_reason: response.stop_reason,
      });
      throw new Error(
        'Claude did not return tool_use response. This may indicate a prompt issue or API error.'
      );
    }

    // Find the output_questionnaire tool call
    const toolBlock = response.toolUse.find(
      (t) => t.name === QUESTIONNAIRE_OUTPUT_TOOL_NAME
    );

    if (!toolBlock) {
      const toolNames = response.toolUse.map((t) => t.name).join(', ');
      console.error('[QuestionnaireGenerationService] Wrong tool called:', {
        expectedTool: QUESTIONNAIRE_OUTPUT_TOOL_NAME,
        actualTools: toolNames,
      });
      throw new Error(
        `Claude called unexpected tool: ${toolNames}. Expected: ${QUESTIONNAIRE_OUTPUT_TOOL_NAME}`
      );
    }

    // Log the raw tool input to see what Claude actually returned
    console.log('[QuestionnaireGenerationService] Raw tool input from Claude:', JSON.stringify(toolBlock.input, null, 2));

    // Tool input is already parsed JSON matching our schema structure
    // Cast through unknown since tool input is typed as Record<string, unknown>
    return toolBlock.input as unknown as QuestionnaireSchema;
  }

  /**
   * Ensure assessment exists, create if needed
   */
  private async ensureAssessment(
    context: GenerationContext,
    schema: QuestionnaireSchema
  ): Promise<string> {
    // Check if conversation already has an assessment
    const conversation = await this.conversationService.getConversation(context.conversationId);

    if (conversation?.assessmentId) {
      return conversation.assessmentId;
    }

    // Get or create vendor
    const vendor = await this.vendorService.findOrCreateDefault(context.userId);

    // Create new assessment
    // Priority: user-provided context > Claude's schema > default
    const assessmentResult = await this.assessmentService.createAssessment({
      vendorName: context.vendorName || schema.metadata.vendorName || vendor.name,
      assessmentType: context.assessmentType,
      solutionName: context.solutionName || schema.metadata.solutionName || 'Assessment from Chat',
      createdBy: context.userId,
    });

    // Link to conversation
    await this.conversationService.linkAssessment(context.conversationId, assessmentResult.assessmentId);

    return assessmentResult.assessmentId;
  }

  /**
   * Persist questions from schema to assessment
   *
   * Uses the QuestionnaireSchemaAdapter from Story 5.1 to map:
   * - Schema question types (text, yes_no, scale, multiple_choice)
   *   -> Entity question types (text, boolean, enum)
   * - Risk dimensions -> Section numbers (1-10)
   *
   * Uses replaceAllForAssessment to atomically clear existing questions
   * and insert the new set. This handles re-generation scenarios where
   * the conversation already has an assessment with questions.
   */
  private async persistQuestions(
    assessmentId: string,
    schema: QuestionnaireSchema
  ): Promise<void> {
    // Use adapter to convert schema to Question entities
    // This handles type mapping (yes_no -> boolean, scale -> enum, etc.)
    const questions = schemaToQuestions(schema, assessmentId);

    // Atomically replace questions (handles re-generation without duplicate key errors)
    await this.questionRepository.replaceAllForAssessment(assessmentId, questions);
  }

  /**
   * Fast fixture generation for dev testing
   *
   * Skips Claude API call and returns a minimal 3-question questionnaire.
   * This allows rapid testing of the generate button, streaming, and export
   * functionality without waiting 10-15 seconds for Claude to generate 40+ questions.
   *
   * Enabled by: GUARDIAN_FAST_GENERATION=true (only in non-production)
   */
  private async generateFastFixture(context: GenerationContext): Promise<GenerationResult> {
    // Create minimal schema with 3 questions
    const schema = this.createMinimalFixtureSchema(context);

    // Get or create assessment (same as normal flow)
    const assessmentId = await this.ensureAssessment(context, schema);

    // Add assessmentId to schema metadata (required for scoring workflow)
    schema.metadata.assessmentId = assessmentId;

    // Persist questions (same as normal flow)
    await this.persistQuestions(assessmentId, schema);

    // Render markdown (same as normal flow)
    const markdown = questionnaireToMarkdown(schema);

    console.log('[QuestionnaireGenerationService] Fast fixture generated:', {
      assessmentId,
      questionCount: schema.metadata.questionCount,
    });

    return {
      schema,
      assessmentId,
      markdown,
    };
  }

  /**
   * Create a minimal questionnaire schema for fast testing
   *
   * Returns a fixture with 3 questions across 2 sections.
   * Exercises enough variety to test all question types and export formats.
   */
  private createMinimalFixtureSchema(context: GenerationContext): QuestionnaireSchema {
    return {
      version: '1.0',
      metadata: {
        assessmentId: '', // Placeholder - will be set after ensureAssessment()
        assessmentType: context.assessmentType,
        vendorName: context.vendorName || 'Test Vendor',
        solutionName: context.solutionName || 'Test Solution',
        generatedAt: new Date().toISOString(),
        questionCount: 3,
      },
      sections: [
        {
          id: 'privacy_risk',
          title: 'Privacy Risk Assessment',
          riskDimension: 'privacy_risk',
          description: 'Data privacy and protection practices',
          questions: [
            {
              id: 'privacy_1',
              text: 'How does the solution handle PHI data storage and encryption?',
              category: 'Data Handling',
              riskDimension: 'privacy_risk',
              questionType: 'text',
              required: true,
            },
            {
              id: 'privacy_2',
              text: 'Is consent obtained before collecting patient data?',
              category: 'Consent',
              riskDimension: 'privacy_risk',
              questionType: 'yes_no',
              required: true,
            },
          ],
        },
        {
          id: 'security_risk',
          title: 'Security Risk Assessment',
          riskDimension: 'security_risk',
          description: 'Security controls and practices',
          questions: [
            {
              id: 'security_1',
              text: 'What encryption standards are used for data in transit?',
              category: 'Encryption',
              riskDimension: 'security_risk',
              questionType: 'text',
              required: true,
            },
          ],
        },
      ],
    };
  }
}
