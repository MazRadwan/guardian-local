/**
 * ExportNarrativeGenerator Unit Tests
 *
 * Part of Epic 20: Scoring Optimisation
 * Story 20.1.2: Export Service Narrative Generation Integration
 */

import { ExportNarrativeGenerator } from '../../../../src/infrastructure/ai/ExportNarrativeGenerator'
import { IExportNarrativePromptBuilder } from '../../../../src/application/interfaces/IExportNarrativePromptBuilder'
import { IClaudeClient } from '../../../../src/application/interfaces/IClaudeClient'
import { NarrativeGenerationParams } from '../../../../src/application/interfaces/IExportNarrativeGenerator'
import { AssessmentResultDTO, ResponseDTO } from '../../../../src/domain/scoring/dtos'

describe('ExportNarrativeGenerator', () => {
  let generator: ExportNarrativeGenerator
  let mockPromptBuilder: jest.Mocked<IExportNarrativePromptBuilder>
  let mockClaudeClient: jest.Mocked<IClaudeClient>

  // Test fixtures
  const mockResult: AssessmentResultDTO = {
    id: 'result-1',
    assessmentId: 'assess-1',
    batchId: 'batch-1',
    compositeScore: 85,
    recommendation: 'approve',
    overallRiskRating: 'low',
    executiveSummary: 'Strong vendor',
    keyFindings: ['Finding 1'],
    disqualifyingFactors: [],
    rubricVersion: 'v1.0',
    modelId: 'claude-sonnet-4.5',
    scoredAt: new Date(),
  }

  const mockResponses: ResponseDTO[] = [
    {
      id: 'resp-1',
      assessmentId: 'assess-1',
      batchId: 'batch-1',
      sectionNumber: 3,
      questionNumber: 1,
      questionText: 'Privacy question',
      responseText: 'Privacy response',
      hasVisualContent: false,
      createdAt: new Date(),
    },
  ]

  const mockParams: NarrativeGenerationParams = {
    vendorName: 'Test Vendor',
    solutionName: 'Test Solution',
    solutionType: 'clinical_ai',
    result: mockResult,
    dimensionScores: [
      {
        dimension: 'privacy_risk',
        score: 90,
        riskRating: 'low',
      },
    ],
    responses: mockResponses,
  }

  beforeEach(() => {
    mockPromptBuilder = {
      buildNarrativeSystemPrompt: jest.fn().mockReturnValue('System prompt'),
      buildNarrativeUserPrompt: jest.fn().mockReturnValue('User prompt'),
    } as jest.Mocked<IExportNarrativePromptBuilder>

    mockClaudeClient = {
      sendMessage: jest.fn(),
      streamMessage: jest.fn(),
      analyzeImages: jest.fn(),
      prepareDocument: jest.fn(),
      streamWithTool: jest.fn(),
      getModelId: jest.fn(),
    } as jest.Mocked<IClaudeClient>

    generator = new ExportNarrativeGenerator(mockPromptBuilder, mockClaudeClient)
  })

  describe('generateNarrative', () => {
    it('should build prompts using prompt builder', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '# Narrative Report\n\nAnalysis...',
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4.5',
      })

      await generator.generateNarrative(mockParams)

      expect(mockPromptBuilder.buildNarrativeSystemPrompt).toHaveBeenCalled()
      expect(mockPromptBuilder.buildNarrativeUserPrompt).toHaveBeenCalledWith({
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        solutionType: 'clinical_ai',
        compositeScore: 85,
        overallRiskRating: 'low',
        recommendation: 'approve',
        dimensionScores: mockParams.dimensionScores,
        keyFindings: ['Finding 1'],
        executiveSummary: 'Strong vendor',
        topResponses: [
          {
            sectionNumber: 3,
            questionNumber: 1,
            questionText: 'Privacy question',
            responseText: 'Privacy response',
          },
        ],
      })
    })

    it('should call Claude with built prompts', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '# Narrative Report\n\nAnalysis...',
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4.5',
      })

      await generator.generateNarrative(mockParams)

      expect(mockClaudeClient.sendMessage).toHaveBeenCalledWith(
        [{ role: 'user', content: 'User prompt' }],
        {
          systemPrompt: 'System prompt',
          maxTokens: 4096,
        }
      )
    })

    it('should return raw markdown from Claude response', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '# Narrative Report\n\nDetailed analysis of the vendor...',
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4.5',
      })

      const result = await generator.generateNarrative(mockParams)

      expect(result).toBe('# Narrative Report\n\nDetailed analysis of the vendor...')
    })

    it('should extract markdown from code block wrapper', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '```markdown\n# Narrative Report\n\nAnalysis...\n```',
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4.5',
      })

      const result = await generator.generateNarrative(mockParams)

      expect(result).toBe('# Narrative Report\n\nAnalysis...')
    })

    it('should extract markdown from md code block wrapper', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '```md\n# Report\n\nContent\n```',
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4.5',
      })

      const result = await generator.generateNarrative(mockParams)

      expect(result).toBe('# Report\n\nContent')
    })

    it('should throw error if Claude returns empty response', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '',
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4.5',
      })

      await expect(generator.generateNarrative(mockParams)).rejects.toThrow(
        'LLM returned empty narrative'
      )
    })

    it('should throw error if Claude returns whitespace-only response', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '   \n\n  ',
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4.5',
      })

      await expect(generator.generateNarrative(mockParams)).rejects.toThrow(
        'LLM returned empty narrative'
      )
    })

    it('should propagate Claude API errors', async () => {
      mockClaudeClient.sendMessage.mockRejectedValue(new Error('API rate limit exceeded'))

      await expect(generator.generateNarrative(mockParams)).rejects.toThrow(
        'API rate limit exceeded'
      )
    })

    it('should handle result with empty executiveSummary and keyFindings', async () => {
      const resultWithEmpty: AssessmentResultDTO = {
        ...mockResult,
        executiveSummary: undefined,
        keyFindings: undefined,
      }

      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '# Narrative',
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4.5',
      })

      await generator.generateNarrative({
        ...mockParams,
        result: resultWithEmpty,
      })

      expect(mockPromptBuilder.buildNarrativeUserPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          executiveSummary: '',
          keyFindings: [],
        })
      )
    })
  })
})
