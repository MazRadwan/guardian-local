/**
 * Unit tests for ClaudeClient tool support
 *
 * Part of Epic 12: Tool-Based Questionnaire Generation Trigger
 *
 * Tests verify that ClaudeClient correctly:
 * 1. Passes tools to Anthropic API
 * 2. Extracts tool_use blocks from responses
 */

import { ClaudeTool } from '../../src/application/interfaces/IClaudeClient.js';

// Mock the entire module before importing
const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
      stream: jest.fn(), // Not tested here to avoid memory issues
    },
  }));
});

// Import after mock
import { ClaudeClient } from '../../src/infrastructure/ai/ClaudeClient.js';

describe('ClaudeClient - tool support', () => {
  let client: ClaudeClient;

  const testTool: ClaudeTool = {
    name: 'test_tool',
    description: 'A test tool',
    input_schema: {
      type: 'object',
      properties: {
        test_param: { type: 'string' },
      },
      required: ['test_param'],
    },
  };

  const testMessages = [
    { role: 'user' as const, content: 'Test message' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    client = new ClaudeClient('test-api-key');
  });

  describe('sendMessage with tools', () => {
    it('should pass tools to Anthropic API when provided', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-5-20250929',
      });

      await client.sendMessage(testMessages, { tools: [testTool] });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [testTool],
        }),
        undefined
      );
    });

    it('should not include tools when not provided', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-5-20250929',
      });

      await client.sendMessage(testMessages, {});

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.tools).toBeUndefined();
    });

    it('should extract toolUse from response when tool_use blocks present', async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            id: 'tool-use-123',
            name: 'questionnaire_ready',
            input: { assessment_type: 'comprehensive' },
          },
        ],
        stop_reason: 'tool_use',
        model: 'claude-sonnet-4-5-20250929',
      });

      const response = await client.sendMessage(testMessages, { tools: [testTool] });

      expect(response.toolUse).toBeDefined();
      expect(response.toolUse).toHaveLength(1);
      expect(response.toolUse![0]).toEqual({
        type: 'tool_use',
        id: 'tool-use-123',
        name: 'questionnaire_ready',
        input: { assessment_type: 'comprehensive' },
      });
    });

    it('should handle mixed content (text and tool_use)', async () => {
      mockCreate.mockResolvedValue({
        content: [
          { type: 'text', text: 'I will generate a questionnaire.' },
          {
            type: 'tool_use',
            id: 'tool-use-456',
            name: 'questionnaire_ready',
            input: {
              assessment_type: 'quick',
              vendor_name: 'TestVendor',
            },
          },
        ],
        stop_reason: 'tool_use',
        model: 'claude-sonnet-4-5-20250929',
      });

      const response = await client.sendMessage(testMessages, { tools: [testTool] });

      expect(response.content).toBe('I will generate a questionnaire.');
      expect(response.toolUse).toBeDefined();
      expect(response.toolUse![0].name).toBe('questionnaire_ready');
      expect(response.toolUse![0].input).toEqual({
        assessment_type: 'quick',
        vendor_name: 'TestVendor',
      });
    });

    it('should return undefined toolUse when no tool_use blocks', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Just text response' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-5-20250929',
      });

      const response = await client.sendMessage(testMessages, { tools: [testTool] });

      expect(response.toolUse).toBeUndefined();
    });
  });

  describe('sendMessage without tools (backward compatibility)', () => {
    it('should work without any options', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-5-20250929',
      });

      const response = await client.sendMessage(testMessages);

      expect(response.content).toBe('Response');
      expect(response.toolUse).toBeUndefined();
    });
  });
});
