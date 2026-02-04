# Story 33.2.3: Consult Prompt Update

## Description

Update the consult mode system prompt to instruct Claude on when/how to use the `web_search` tool and how to format citations in responses. The prompt should encourage tool use for factual queries while maintaining Guardian's healthcare AI governance focus.

## Acceptance Criteria

- [ ] Prompt includes tool usage guidance (when to search)
- [ ] Prompt includes citation format instructions (numbered Sources section)
- [ ] Sources section uses Markdown links: `[1] Title - URL`
- [ ] Prompt emphasizes NOT searching for general knowledge questions
- [ ] Prompt maintains existing consult mode behavior for non-search queries
- [ ] Citation format includes blank line before Sources section
- [ ] Maximum 5 citations per response (to avoid clutter)
- [ ] **PromptCacheManager cache key includes `includeWebSearchInstructions` option**

## Technical Approach

### 1. Add Web Search Instructions

Add tool usage section to CONSULT_MODE_PREAMBLE in prompts.ts:

```typescript
// Add to CONSULT_MODE_PREAMBLE
const WEB_SEARCH_INSTRUCTIONS = `

## Web Search Tool (CONSULT MODE ONLY)

You have access to a \`web_search\` tool for finding current information. Use it when:
- User asks about recent regulatory changes, news, or updates
- User needs citations or sources to back up claims
- Information may have changed since your training data
- Verifying specific facts, dates, or statistics

DO NOT use web search for:
- General healthcare AI governance concepts you know well
- Questions about Guardian's assessment process
- Simple explanations of frameworks like PIPEDA, HIPAA, NIST

When you use web search, ALWAYS include a **Sources** section at the end.

**EXACT FORMAT REQUIRED (copy this structure):**

\`\`\`
[Your answer text here. This can be multiple paragraphs
with detailed information from the sources.]

---

**Sources:**
1. [Title of first article](https://example.com/url1)
2. [Title of second source](https://example.com/url2)
3. [Third source title](https://example.com/url3)
\`\`\`

**CRITICAL FORMATTING RULES:**
- MUST have a blank line before the --- separator (Markdown requires this)
- MUST have exactly three dashes: --- (not more, not less)
- MUST have a blank line after the --- separator
- Number each source sequentially (1, 2, 3...)
- Use Markdown link format: [Title](URL)
- Maximum 5 sources per response (even if more were found)
- Only cite sources that directly informed your answer
- Do NOT cite sources you didn't actually use

**Example of WRONG formatting (will break Markdown):**
\`\`\`
Here is the answer.
---
Sources:
\`\`\`

**Example of CORRECT formatting:**
\`\`\`
Here is the answer.

---

**Sources:**
1. [Source](url)
\`\`\`
`;
```

### 2. Update getSystemPrompt

```typescript
export function getSystemPrompt(mode: ConversationMode, options?: {
  includeToolInstructions?: boolean;
  includeWebSearchInstructions?: boolean;  // NEW
}): string {
  // ...existing code...

  if (mode === 'consult' && options?.includeWebSearchInstructions) {
    return `${modePreamble}${WEB_SEARCH_INSTRUCTIONS}${CUSTOM_PROMPT || fallbackPrompt}`;
  }

  // ...rest of function...
}
```

### 3. Update PromptCacheManager Cache Key

The cache key must include the new option to prevent stale cached prompts:

```typescript
// In PromptCacheManager.ts
private getCacheKey(mode: ConversationMode, options?: SystemPromptOptions): string {
  const optionsKey = options
    ? `-tool:${options.includeToolInstructions ?? false}-websearch:${options.includeWebSearchInstructions ?? false}`
    : '';
  return `prompt-${mode}${optionsKey}`;
}
```

## Files Touched

- `packages/backend/src/infrastructure/ai/prompts.ts` - UPDATE: Add WEB_SEARCH_INSTRUCTIONS constant, update getSystemPrompt function
- `packages/backend/src/infrastructure/ai/PromptCacheManager.ts` - UPDATE: Add `includeWebSearchInstructions` to cache key

## Tests Affected

- `packages/backend/__tests__/unit/infrastructure/ai/PromptCacheManager.test.ts` - Cache key generation tests need updates

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/prompts.webSearch.test.ts`
  - getSystemPrompt('consult', { includeWebSearchInstructions: true }) includes web search guidance
  - getSystemPrompt('consult', { includeWebSearchInstructions: false }) does NOT include web search guidance
  - getSystemPrompt('assessment') never includes web search guidance
  - getSystemPrompt('scoring') never includes web search guidance
  - Web search instructions include citation format example
  - Web search instructions include "do not use" guidance
  - **PromptCacheManager cache key differs for includeWebSearchInstructions: true vs false**
  - **Cached prompt with includeWebSearchInstructions: true is not returned for includeWebSearchInstructions: false**

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
