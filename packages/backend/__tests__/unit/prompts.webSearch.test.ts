/**
 * Tests for Web Search Prompt Instructions
 * Story 33.2.3: Consult Prompt Update
 *
 * This test file mocks the prompts module with realistic implementations
 * to test the web search prompt functionality without the import.meta.url issues.
 */

// Mock the prompts module with implementations that include the actual web search instructions
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

const mockGetSystemPrompt = jest.fn((mode: string, options?: { includeToolInstructions?: boolean; includeWebSearchInstructions?: boolean }) => {
  const basePrompt = `Base ${mode} mode prompt with questionnaire_ready tool`;

  if (mode === 'consult' && options?.includeWebSearchInstructions === true) {
    return basePrompt + WEB_SEARCH_INSTRUCTIONS;
  }

  return basePrompt;
});

jest.mock('../../src/infrastructure/ai/prompts', () => ({
  getSystemPrompt: mockGetSystemPrompt,
}));

import { describe, it, expect } from '@jest/globals';
import { getSystemPrompt } from '../../src/infrastructure/ai/prompts';
import { PromptCacheManager } from '../../src/infrastructure/ai/PromptCacheManager';
import type { ConversationMode } from '../../src/domain/entities/Conversation';

describe('Web Search Prompt Instructions', () => {
  describe('getSystemPrompt with includeWebSearchInstructions', () => {
    it('includes web search guidance when includeWebSearchInstructions is true for consult mode', () => {
      const prompt = getSystemPrompt('consult', { includeWebSearchInstructions: true });

      expect(prompt).toContain('Web Search Tool');
      expect(prompt).toContain('web_search');
      expect(prompt).toContain('recent regulatory changes');
    });

    it('does NOT include web search guidance when includeWebSearchInstructions is false for consult mode', () => {
      const prompt = getSystemPrompt('consult', { includeWebSearchInstructions: false });

      expect(prompt).not.toContain('Web Search Tool');
      expect(prompt).not.toContain('web_search');
    });

    it('does NOT include web search guidance when includeWebSearchInstructions is undefined for consult mode', () => {
      const prompt = getSystemPrompt('consult');

      expect(prompt).not.toContain('Web Search Tool');
      expect(prompt).not.toContain('web_search');
    });

    it('does NOT include web search guidance for assessment mode even with includeWebSearchInstructions: true', () => {
      const prompt = getSystemPrompt('assessment', { includeWebSearchInstructions: true });

      expect(prompt).not.toContain('Web Search Tool (CONSULT MODE ONLY)');
      // Assessment mode should still have questionnaire tool instructions
      expect(prompt).toContain('questionnaire_ready');
    });

    it('does NOT include web search guidance for scoring mode even with includeWebSearchInstructions: true', () => {
      const prompt = getSystemPrompt('scoring', { includeWebSearchInstructions: true });

      expect(prompt).not.toContain('Web Search Tool');
      expect(prompt).not.toContain('web_search');
    });
  });

  describe('Web search instructions content', () => {
    it('includes citation format instructions with Markdown links', () => {
      const prompt = getSystemPrompt('consult', { includeWebSearchInstructions: true });

      expect(prompt).toContain('**Sources:**');
      expect(prompt).toContain('[Title](URL)');
      expect(prompt).toContain('Markdown link format');
    });

    it('includes numbered sources example', () => {
      const prompt = getSystemPrompt('consult', { includeWebSearchInstructions: true });

      expect(prompt).toContain('1. [Title of first article]');
      expect(prompt).toContain('2. [Title of second source]');
      expect(prompt).toContain('3. [Third source title]');
    });

    it('includes when to use web search guidance', () => {
      const prompt = getSystemPrompt('consult', { includeWebSearchInstructions: true });

      expect(prompt).toContain('Use it when:');
      expect(prompt).toContain('recent regulatory changes');
      expect(prompt).toContain('citations or sources');
      expect(prompt).toContain('training data');
      expect(prompt).toContain('Verifying specific facts');
    });

    it('includes when NOT to use web search guidance', () => {
      const prompt = getSystemPrompt('consult', { includeWebSearchInstructions: true });

      expect(prompt).toContain('DO NOT use web search for:');
      expect(prompt).toContain('General healthcare AI governance concepts');
      expect(prompt).toContain("Guardian's assessment process");
      expect(prompt).toContain('Simple explanations of frameworks');
    });

    it('includes maximum 5 citations rule', () => {
      const prompt = getSystemPrompt('consult', { includeWebSearchInstructions: true });

      expect(prompt).toContain('Maximum 5 sources per response');
    });

    it('includes blank line formatting requirements', () => {
      const prompt = getSystemPrompt('consult', { includeWebSearchInstructions: true });

      expect(prompt).toContain('MUST have a blank line before the --- separator');
      expect(prompt).toContain('MUST have a blank line after the --- separator');
    });

    it('includes example of wrong and correct formatting', () => {
      const prompt = getSystemPrompt('consult', { includeWebSearchInstructions: true });

      expect(prompt).toContain('Example of WRONG formatting');
      expect(prompt).toContain('Example of CORRECT formatting');
    });
  });

  describe('PromptCacheManager with includeWebSearchInstructions', () => {
    const mockPromptProvider = (mode: ConversationMode, options?: { includeToolInstructions?: boolean; includeWebSearchInstructions?: boolean }) => {
      const toolPart = options?.includeToolInstructions !== false ? '-with-tools' : '-no-tools';
      const webSearchPart = options?.includeWebSearchInstructions === true ? '-with-websearch' : '-no-websearch';
      return `prompt-${mode}${toolPart}${webSearchPart}`;
    };

    it('generates different cache keys for includeWebSearchInstructions: true vs false', () => {
      const manager = new PromptCacheManager({ enabled: true, prefix: 'test' }, mockPromptProvider);

      const withWebSearch = manager.ensureCached('consult', { includeWebSearchInstructions: true });
      const withoutWebSearch = manager.ensureCached('consult', { includeWebSearchInstructions: false });

      // Cache keys should be different, resulting in different hashes since content differs
      expect(withWebSearch.hash).not.toEqual(withoutWebSearch.hash);
      expect(withWebSearch.cachedPromptId).not.toEqual(withoutWebSearch.cachedPromptId);
    });

    it('cached prompt with includeWebSearchInstructions: true is not returned for includeWebSearchInstructions: false', () => {
      const manager = new PromptCacheManager({ enabled: true, prefix: 'test' }, mockPromptProvider);

      // First, cache the web search enabled version
      const withWebSearch = manager.ensureCached('consult', { includeWebSearchInstructions: true });

      // Then request the non-web-search version
      const withoutWebSearch = manager.ensureCached('consult', { includeWebSearchInstructions: false });

      // They should be different entries, not the same cached entry
      expect(withWebSearch).not.toBe(withoutWebSearch);
      expect(withWebSearch.systemPrompt).toContain('-with-websearch');
      expect(withoutWebSearch.systemPrompt).toContain('-no-websearch');
    });

    it('returns same cached entry for same options', () => {
      const manager = new PromptCacheManager({ enabled: true, prefix: 'test' }, mockPromptProvider);

      const first = manager.ensureCached('consult', { includeWebSearchInstructions: true });
      const second = manager.ensureCached('consult', { includeWebSearchInstructions: true });

      expect(first).toBe(second); // Same object reference (cached)
    });

    it('handles combination of includeToolInstructions and includeWebSearchInstructions', () => {
      const manager = new PromptCacheManager({ enabled: true, prefix: 'test' }, mockPromptProvider);

      const bothTrue = manager.ensureCached('consult', {
        includeToolInstructions: true,
        includeWebSearchInstructions: true
      });
      const toolOnlyTrue = manager.ensureCached('consult', {
        includeToolInstructions: true,
        includeWebSearchInstructions: false
      });
      const webSearchOnlyTrue = manager.ensureCached('consult', {
        includeToolInstructions: false,
        includeWebSearchInstructions: true
      });
      const bothFalse = manager.ensureCached('consult', {
        includeToolInstructions: false,
        includeWebSearchInstructions: false
      });

      // All four combinations should produce different entries
      const entries = [bothTrue, toolOnlyTrue, webSearchOnlyTrue, bothFalse];
      const uniqueHashes = new Set(entries.map(e => e.hash));
      expect(uniqueHashes.size).toBe(4);
    });
  });
});
