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
- [ ] TypeScript types for tool input defined in application layer interface file

## Technical Approach

Follow the existing pattern from `questionnaireReadyTool.ts`:

1. Define tool with `name`, `description`, and `input_schema`
2. **Define input type in application layer** (for clean architecture - application shouldn't import from infrastructure)
3. Add to barrel file with separate export for consult tools

**IMPORTANT:** The `WebSearchInput` type must be defined in the application layer interface file, not in the tool definition file. This is because `WebSearchToolService` (application layer) needs to import this type, and application layer should not import from infrastructure layer.

```typescript
// FILE 1: packages/backend/src/application/interfaces/IWebSearchTool.ts (NEW)
// Application layer - types only
export interface WebSearchInput {
  query: string;
  max_results?: number;
}
```

```typescript
// FILE 2: packages/backend/src/infrastructure/ai/tools/webSearchTool.ts (NEW)
// Infrastructure layer - tool definition
import type { ClaudeTool } from '../types';

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

- `packages/backend/src/application/interfaces/IWebSearchTool.ts` - CREATE: WebSearchInput type definition (application layer)
- `packages/backend/src/infrastructure/ai/tools/webSearchTool.ts` - CREATE: Tool definition file (references IWebSearchTool for type)
- `packages/backend/src/infrastructure/ai/tools/index.ts` - UPDATE: Add exports for webSearchTool and consultModeTools

## Tests Affected

No existing tests should break. This is a new isolated module.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/webSearchTool.test.ts`
  - Tool has correct name ('web_search')
  - Tool has correct description (mentions citations, recent events)
  - Input schema has 'query' in required array
  - Input schema has query.type === 'string'
  - Input schema has max_results.type === 'number' with min/max bounds
  - consultModeTools array includes webSearchTool
  - consultModeTools does NOT include assessmentModeTools items

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
