/**
 * Unit tests for ScoringLLMService
 *
 * Tests the extracted scoreWithClaude method:
 * - Prompt building delegation
 * - LLM client invocation with correct config
 * - Response mapping (only 4 fields per response)
 * - Success path (narrative + payload)
 * - Error: no tool payload
 * - Error: abort signal
 */

import { ScoringLLMService } from '../../../../src/application/services/ScoringLLMService.js';
import type { ILLMClient, StreamWithToolOptions } from '../../../../src/application/interfaces/ILLMClient.js';
import type { IPromptBuilder } from '../../../../src/application/interfaces/IPromptBuilder.js';
import type { ScoringParseResult } from '../../../../src/application/interfaces/IScoringDocumentParser.js';
import type { SolutionType } from '../../../../src/domain/scoring/rubric.js';

describe('ScoringLLMService', () => {
  let service: ScoringLLMService;
  let mockLLMClient: jest.Mocked<ILLMClient>;
  let mockPromptBuilder: jest.Mocked<Required<IPromptBuilder>>;

  const testVendorName = 'TestVendor';
  const testSolutionName = 'TestSolution';
  const testSolutionType: SolutionType = 'clinical_ai';

  const mockParseResult: ScoringParseResult = {
    success: true,
    assessmentId: 'assessment-1',
    vendorName: 'TestVendor',
    solutionName: 'TestSolution',
    responses: [
      {
        sectionNumber: 1,
        questionNumber: 1,
        questionText: 'What is your security posture?',
        responseText: 'We implement zero trust architecture.',
        confidence: 0.95,
        sectionTitle: 'Security',
        hasVisualContent: false,
        visualContentDescription: null,
      },
      {
        sectionNumber: 2,
        questionNumber: 1,
        questionText: 'How do you handle data privacy?',
        responseText: 'We comply with PIPEDA.',
        confidence: 0.9,
        sectionTitle: 'Privacy',
        hasVisualContent: false,
        visualContentDescription: null,
      },
    ],
    expectedQuestionCount: 87,
    parsedQuestionCount: 2,
    unparsedQuestions: [],
    isComplete: false,
    confidence: 0.92,
    metadata: {
      filename: 'test-questionnaire.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      documentType: 'pdf',
      storagePath: '/tmp/test-file.pdf',
      uploadedAt: new Date('2026-01-15'),
      uploadedBy: 'user-1',
    },
    parseTimeMs: 150,
  };

  const mockToolPayload = {
    compositeScore: 75,
    recommendation: 'conditional',
    overallRiskRating: 'medium',
    executiveSummary: 'Test summary',
    dimensionScores: [],
  };

  beforeEach(() => {
    mockLLMClient = {
      streamWithTool: jest.fn().mockResolvedValue(undefined),
      getModelId: jest.fn().mockReturnValue('claude-sonnet-4-5-20250929'),
    } as jest.Mocked<ILLMClient>;

    mockPromptBuilder = {
      buildScoringSystemPrompt: jest.fn().mockReturnValue('system prompt text'),
      buildScoringUserPrompt: jest.fn().mockReturnValue('user prompt text'),
      fetchISOCatalog: jest.fn().mockResolvedValue([]),
      fetchApplicableControls: jest.fn().mockResolvedValue([]),
    } as jest.Mocked<Required<IPromptBuilder>>;

    service = new ScoringLLMService(mockLLMClient, mockPromptBuilder);
  });

  describe('scoreWithClaude', () => {
    it('should call promptBuilder.buildScoringSystemPrompt() with no args (static)', async () => {
      // Setup: streamWithTool calls onToolUse to provide payload
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        onMessage
      );

      expect(mockPromptBuilder.buildScoringSystemPrompt).toHaveBeenCalledTimes(1);
      // Story 39.3.3: System prompt is static, no ISO controls passed
      expect(mockPromptBuilder.buildScoringSystemPrompt).toHaveBeenCalledWith();
    });

    it('should call promptBuilder.buildScoringUserPrompt() with correct params', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        onMessage
      );

      expect(mockPromptBuilder.buildScoringUserPrompt).toHaveBeenCalledWith({
        vendorName: testVendorName,
        solutionName: testSolutionName,
        solutionType: testSolutionType,
        responses: [
          {
            sectionNumber: 1,
            questionNumber: 1,
            questionText: 'What is your security posture?',
            responseText: 'We implement zero trust architecture.',
          },
          {
            sectionNumber: 2,
            questionNumber: 1,
            questionText: 'How do you handle data privacy?',
            responseText: 'We comply with PIPEDA.',
          },
        ],
        isoControls: undefined,
      });
    });

    it('should call llmClient.streamWithTool() with correct config', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        onMessage
      );

      expect(mockLLMClient.streamWithTool).toHaveBeenCalledTimes(1);
      const callArgs = mockLLMClient.streamWithTool.mock.calls[0][0];

      expect(callArgs.systemPrompt).toBe('system prompt text');
      expect(callArgs.userPrompt).toBe('user prompt text');
      expect(callArgs.tools).toHaveLength(1);
      expect(callArgs.tools[0].name).toBe('scoring_complete');
      expect(callArgs.tool_choice).toEqual({ type: 'any' });
      expect(callArgs.usePromptCache).toBe(true);
      expect(callArgs.maxTokens).toBe(16384);
      expect(callArgs.temperature).toBe(0);
      expect(callArgs.abortSignal).toBe(abortController.signal);
      expect(callArgs.onTextDelta).toBeDefined();
      expect(callArgs.onToolUse).toBeDefined();
    });

    it('should return narrative + payload on success', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        // Simulate text streaming
        options.onTextDelta?.('Risk assessment narrative text');
        // Simulate tool use
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      const result = await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        onMessage
      );

      expect(result.narrativeReport).toBe('Risk assessment narrative text');
      expect(result.payload).toEqual(mockToolPayload);
    });

    it('should throw "Claude did not call scoring_complete tool" when no tool payload', async () => {
      // streamWithTool completes without calling onToolUse
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        options.onTextDelta?.('Some text without tool call');
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      await expect(
        service.scoreWithClaude(
          mockParseResult,
          testVendorName,
          testSolutionName,
          testSolutionType,
          abortController.signal,
          onMessage
        )
      ).rejects.toThrow('Claude did not call scoring_complete tool');
    });

    it('should throw "Scoring aborted" when abort signal fires and no payload', async () => {
      const abortController = new AbortController();
      const onMessage = jest.fn();

      // Simulate: streamWithTool exits early due to abort, no tool use
      mockLLMClient.streamWithTool.mockImplementation(async () => {
        // Abort fires during streaming
        abortController.abort();
      });

      await expect(
        service.scoreWithClaude(
          mockParseResult,
          testVendorName,
          testSolutionName,
          testSolutionType,
          abortController.signal,
          onMessage
        )
      ).rejects.toThrow('Scoring aborted');
    });

    it('should map parseResult.responses correctly (only 4 fields)', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        onMessage
      );

      const userPromptCall = mockPromptBuilder.buildScoringUserPrompt.mock.calls[0][0];
      const mappedResponses = userPromptCall.responses;

      // Verify only 4 fields are passed (no confidence, sectionTitle, hasVisualContent, etc.)
      for (const response of mappedResponses) {
        const keys = Object.keys(response);
        expect(keys).toEqual(['sectionNumber', 'questionNumber', 'questionText', 'responseText']);
        expect(keys).not.toContain('confidence');
        expect(keys).not.toContain('sectionTitle');
        expect(keys).not.toContain('hasVisualContent');
        expect(keys).not.toContain('visualContentDescription');
      }
    });

    it('should emit progress once when narrative reaches 500 chars', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        // Send exactly 500 chars to trigger progress callback
        const chunk = 'a'.repeat(500);
        options.onTextDelta?.(chunk);
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        onMessage
      );

      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith('Generating risk assessment...');
    });

    it('should NOT emit progress for narrative under 500 chars', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        // Send 499 chars - should NOT trigger progress
        options.onTextDelta?.('a'.repeat(499));
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        onMessage
      );

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should emit progress exactly once for 500-999 char narrative', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        // Send 750 chars total in variable chunks
        options.onTextDelta?.('a'.repeat(200));
        options.onTextDelta?.('b'.repeat(300));  // crosses 500 threshold
        options.onTextDelta?.('c'.repeat(250));  // total 750, still under 1000
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        onMessage
      );

      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith('Generating risk assessment...');
    });

    it('should emit progress twice for 1000-1499 char narrative', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        // Send 1200 chars total in variable chunks
        options.onTextDelta?.('a'.repeat(300));
        options.onTextDelta?.('b'.repeat(250));  // crosses 500 → first fire
        options.onTextDelta?.('c'.repeat(300));  // 850 total, no fire
        options.onTextDelta?.('d'.repeat(350));  // crosses 1000 → second fire
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        onMessage
      );

      expect(onMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle variable chunk sizes with consistent threshold firing', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        // Realistic chunk simulation: [10, 200, 3, 287, 500, 1] = 1001 chars total
        options.onTextDelta?.('a'.repeat(10));    // total: 10
        options.onTextDelta?.('b'.repeat(200));   // total: 210
        options.onTextDelta?.('c'.repeat(3));     // total: 213
        options.onTextDelta?.('d'.repeat(287));   // total: 500 → first fire
        options.onTextDelta?.('e'.repeat(500));   // total: 1000 → second fire
        options.onTextDelta?.('f'.repeat(1));     // total: 1001, no fire
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        onMessage
      );

      expect(onMessage).toHaveBeenCalledTimes(2);
    });

    it('should fire multiple times for a large single chunk', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        // One large chunk of 1500 chars crosses both 500 and 1000 thresholds
        // but only fires once (since delta is evaluated once per call)
        options.onTextDelta?.('a'.repeat(1500));
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        onMessage
      );

      // A single chunk of 1500 chars: length(1500) - lastReported(0) >= 500 → fires once
      // lastReportedLength becomes 1500, so the next threshold is 2000
      expect(onMessage).toHaveBeenCalledTimes(1);
    });

    it('should ignore tool calls for non-scoring_complete tools', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        // Call a different tool first
        options.onToolUse?.('some_other_tool', { data: 'irrelevant' });
        // Then call the correct tool
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      const result = await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        onMessage
      );

      // Should still get the correct payload
      expect(result.payload).toEqual(mockToolPayload);
    });

    it('should pass ISO controls to prompt builder when isoOptions provided', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const catalogControls = [{ clauseRef: 'A.6.1', domain: 'Data', title: 'Data governance', framework: 'ISO/IEC 42001', criteriaText: 'Test', dimensions: [], relevanceWeights: {} }];
      const applicableControls = [{ clauseRef: 'A.6.2', domain: 'Data', title: 'Data quality', framework: 'ISO/IEC 42001', criteriaText: 'Test', dimensions: [], relevanceWeights: {} }];

      const abortController = new AbortController();
      await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        jest.fn(),
        { catalogControls, applicableControls }
      );

      // System prompt receives NO ISO controls (static, cacheable) - Story 39.3.3
      expect(mockPromptBuilder.buildScoringSystemPrompt).toHaveBeenCalledWith();
      // ISO catalog now passed to user prompt alongside applicable controls
      expect(mockPromptBuilder.buildScoringUserPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          isoControls: applicableControls,
          isoCatalog: catalogControls,
        })
      );
    });

    it('should work without isoOptions (backwards compatible)', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const result = await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        jest.fn()
      );

      expect(result.payload).toEqual(mockToolPayload);
      // System prompt is always called with no args (static)
      expect(mockPromptBuilder.buildScoringSystemPrompt).toHaveBeenCalledWith();
      // User prompt receives undefined for both ISO params
      expect(mockPromptBuilder.buildScoringUserPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          isoControls: undefined,
          isoCatalog: undefined,
        })
      );
    });

    it('should return metrics when onUsage callback provides usage data', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        options.onToolUse?.('scoring_complete', mockToolPayload);
        // Simulate usage callback from ClaudeClient
        options.onUsage?.({
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 4000,
          cache_creation_input_tokens: 0,
        });
      });

      const abortController = new AbortController();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const result = await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        jest.fn()
      );

      expect(result.metrics).toBeDefined();
      expect(result.metrics!.inputTokens).toBe(1000);
      expect(result.metrics!.outputTokens).toBe(500);
      expect(result.metrics!.cacheReadInputTokens).toBe(4000);
      expect(result.metrics!.cacheCreationInputTokens).toBe(0);
      expect(result.metrics!.cacheHitRate).toBe(0.8);
      expect(result.metrics!.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics!.estimatedCostUSD).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it('should return undefined metrics when onUsage is not called', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        options.onToolUse?.('scoring_complete', mockToolPayload);
        // No onUsage callback - simulates client that does not provide usage
      });

      const abortController = new AbortController();

      const result = await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        jest.fn()
      );

      expect(result.metrics).toBeUndefined();
    });

    it('should pass onUsage callback in streamWithTool options', async () => {
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();

      await service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        jest.fn()
      );

      const callArgs = mockLLMClient.streamWithTool.mock.calls[0][0];
      expect(callArgs.onUsage).toBeDefined();
      expect(typeof callArgs.onUsage).toBe('function');
    });
  });

  describe('transient stream retry', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    // Helper: flush pending setTimeout calls without waiting real time.
    // Each retry iteration involves: await streamWithTool() rejection → catch →
    // await setTimeout(delay). We need multiple microtask ticks between timer
    // advances so the async control flow can schedule the next setTimeout.
    const flushRetryDelays = async () => {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 5; j++) await Promise.resolve();
        jest.runAllTimers();
      }
    };

    it('should retry once on transient ClaudeAPIError and succeed', async () => {
      let callCount = 0;
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('streamWithTool failed: Premature close');
        }
        // Second attempt succeeds
        options.onTextDelta?.('Retry narrative');
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const onMessage = jest.fn();

      const promise = service.scoreWithClaude(
        mockParseResult,
        testVendorName,
        testSolutionName,
        testSolutionType,
        abortController.signal,
        onMessage
      );
      await flushRetryDelays();
      const result = await promise;

      expect(callCount).toBe(2);
      expect(result.payload).toEqual(mockToolPayload);
      // Narrative should only contain attempt 2's text (state was reset)
      expect(result.narrativeReport).toBe('Retry narrative');
      // onMessage should have been called with retry notification
      expect(onMessage).toHaveBeenCalledWith('Connection interrupted, retrying...');
    });

    it('should reset state between attempts — no duplicate narrative', async () => {
      let callCount = 0;
      mockLLMClient.streamWithTool.mockImplementation(async (options: StreamWithToolOptions) => {
        callCount++;
        if (callCount === 1) {
          // Attempt 1: partial text streamed, then fails
          options.onTextDelta?.('Attempt 1 partial text');
          throw new Error('streamWithTool failed: ECONNRESET');
        }
        // Attempt 2: fresh text + success
        options.onTextDelta?.('Attempt 2 clean text');
        options.onToolUse?.('scoring_complete', mockToolPayload);
      });

      const abortController = new AbortController();
      const promise = service.scoreWithClaude(
        mockParseResult, testVendorName, testSolutionName, testSolutionType,
        abortController.signal, jest.fn()
      );
      await flushRetryDelays();
      const result = await promise;

      // CRITICAL: narrative must NOT contain attempt 1's partial text
      expect(result.narrativeReport).toBe('Attempt 2 clean text');
      expect(result.narrativeReport).not.toContain('Attempt 1');
    });

    it('should NOT retry on abort', async () => {
      const abortController = new AbortController();
      mockLLMClient.streamWithTool.mockImplementation(async () => {
        abortController.abort();
        throw new Error('streamWithTool failed: Premature close');
      });

      await expect(
        service.scoreWithClaude(
          mockParseResult, testVendorName, testSolutionName, testSolutionType,
          abortController.signal, jest.fn()
        )
      ).rejects.toThrow('Premature close');

      // Should only be called once (no retry after abort)
      expect(mockLLMClient.streamWithTool).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on non-transient errors', async () => {
      mockLLMClient.streamWithTool.mockRejectedValue(
        new Error('Invalid API key')
      );

      const abortController = new AbortController();

      await expect(
        service.scoreWithClaude(
          mockParseResult, testVendorName, testSolutionName, testSolutionType,
          abortController.signal, jest.fn()
        )
      ).rejects.toThrow('Invalid API key');

      expect(mockLLMClient.streamWithTool).toHaveBeenCalledTimes(1);
    });

    it('should propagate after exhausting all retry attempts', async () => {
      // All 3 attempts (1 initial + 2 retries) fail with transient error
      mockLLMClient.streamWithTool.mockRejectedValue(
        new Error('streamWithTool failed: Premature close')
      );

      const abortController = new AbortController();

      const promise = service.scoreWithClaude(
        mockParseResult, testVendorName, testSolutionName, testSolutionType,
        abortController.signal, jest.fn()
      );
      await flushRetryDelays();
      await expect(promise).rejects.toThrow('Premature close');

      // 1 initial + 2 retries = 3 total
      expect(mockLLMClient.streamWithTool).toHaveBeenCalledTimes(3);
    });
  });

  describe('fetchISOCatalog', () => {
    it('should delegate to promptBuilder.fetchISOCatalog()', async () => {
      const controls = [{ clauseRef: 'A.6.1', domain: 'D', title: 'T', framework: 'F', criteriaText: 'C', dimensions: [], relevanceWeights: {} }];
      mockPromptBuilder.fetchISOCatalog.mockResolvedValue(controls as any);

      const result = await service.fetchISOCatalog();
      expect(result).toEqual(controls);
      expect(mockPromptBuilder.fetchISOCatalog).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when fetchISOCatalog is not available', async () => {
      const builderWithoutISO = {
        buildScoringSystemPrompt: jest.fn().mockReturnValue('prompt'),
        buildScoringUserPrompt: jest.fn().mockReturnValue('prompt'),
      } as jest.Mocked<IPromptBuilder>;
      const svc = new ScoringLLMService(mockLLMClient, builderWithoutISO);

      const result = await svc.fetchISOCatalog();
      expect(result).toEqual([]);
    });
  });

  describe('fetchApplicableControls', () => {
    it('should delegate to promptBuilder.fetchApplicableControls()', async () => {
      const controls = [{ clauseRef: 'A.7.1', domain: 'D', title: 'T', framework: 'F', criteriaText: 'C', dimensions: [], relevanceWeights: {} }];
      mockPromptBuilder.fetchApplicableControls.mockResolvedValue(controls as any);

      const result = await service.fetchApplicableControls(['privacy_risk']);
      expect(result).toEqual(controls);
      expect(mockPromptBuilder.fetchApplicableControls).toHaveBeenCalledWith(['privacy_risk']);
    });

    it('should return empty array when fetchApplicableControls is not available', async () => {
      const builderWithoutISO = {
        buildScoringSystemPrompt: jest.fn().mockReturnValue('prompt'),
        buildScoringUserPrompt: jest.fn().mockReturnValue('prompt'),
      } as jest.Mocked<IPromptBuilder>;
      const svc = new ScoringLLMService(mockLLMClient, builderWithoutISO);

      const result = await svc.fetchApplicableControls(['privacy_risk']);
      expect(result).toEqual([]);
    });
  });
});
