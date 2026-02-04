/**
 * Web Search Tool Definition
 *
 * Part of Epic 33: Consult Search Tool
 *
 * This tool definition is passed to Claude API when operating in consult mode.
 * When Claude determines that a user query requires up-to-date information
 * or citations, it calls this tool to request a web search.
 *
 * The tool is only available in consult mode, not assessment or scoring modes.
 */

import type { ClaudeTool } from '../../../application/interfaces/IClaudeClient.js';

/**
 * Tool definition for web_search
 *
 * Claude calls this tool when:
 * - User asks about recent events, updates, or changes
 * - User needs citations or sources for claims
 * - Information may be outdated in training data
 * - Factual verification is needed
 */
export const webSearchTool: ClaudeTool = {
  name: 'web_search',
  description: `Search the web for current information. Use this tool when:
- User asks about recent events, updates, or changes
- User needs citations or sources for claims
- Information may be outdated in your training data
- Factual verification is needed

Return search results that can be cited in your response.`,
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to find relevant information',
        minLength: 1,
        maxLength: 500,
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 10)',
        minimum: 1,
        maximum: 10,
      },
    },
    required: ['query'],
  },
};

/**
 * Array of tools available in consult mode.
 * Kept separate from assessmentModeTools to maintain mode-specific tool availability.
 */
export const consultModeTools: ClaudeTool[] = [webSearchTool];

/**
 * Re-export the input type from application layer (single source of truth)
 * This maintains clean architecture: infrastructure imports from application
 */
export type { WebSearchInput } from '../../../application/interfaces/IWebSearchTool.js';
