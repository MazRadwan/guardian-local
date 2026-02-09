
# Story 33.1.1: Web Search Tool Definition

## Description

Create the `web_search` tool definition for Claude API. This tool enables consult mode to request web searches when answering questions that require up-to-date information or citations. The tool schema follows Claude's tool definition format with proper input validation.

## Acceptance Criteria

- [ ] Tool definition file created at `packages/backend/src/infrastructure/ai/tools/webSearchTool.ts`
- [ ] Tool name is `web_search`
- [ ] Tool description clearly explains when/how Claude should use it (factual queries needing citations)
- [ ] Input schema includes `query` (required string) and `max_results` (optional number, default 5, max 10)
- [ ] Tool exported from `tools/index.ts` barrel file
- [ ] Separate export for consult-mode tools (don't add to assessmentModeTools)
- [ ] TypeScript types for tool input exported for service consumption

## Technical Approach

Follow the existing pattern from `questionnaireReadyTool.ts`:

1. Define tool with `name`, `description`, and `input_schema`
2. Export typed interface for input parameters
3. Add to barrel file with separate export for consult tools

```typescript
// webSearchTool.ts
export interface WebSearchInput {
  query: string;
  max_results?: number;
}

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

export const consultModeTools: ClaudeTool[] = [webSearchTool];
```

## Files Touched

- `packages/backend/src/infrastructure/ai/tools/webSearchTool.ts` - CREATE: New tool definition file
- `packages/backend/src/infrastructure/ai/tools/index.ts` - UPDATE: Add exports for webSearchTool and consultModeTools

## Tests Affected

No existing tests should break. This is a new isolated module.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/webSearchTool.test.ts`
  - Tool has correct name
  - Tool has correct description
  - Input schema validates query as required string
  - Input schema validates max_results as optional number within bounds
  - consultModeTools array includes webSearchTool
  - WebSearchInput type matches schema

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
