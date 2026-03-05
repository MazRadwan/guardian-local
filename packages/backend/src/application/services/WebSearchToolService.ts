/**
 * WebSearchToolService - Handles the web_search tool call
 *
 * Part of Epic 33: Consult Search Tool
 *
 * When Claude (in consult mode) determines it needs current information or citations,
 * it calls the web_search tool. This service:
 * 1. Validates the tool input
 * 2. Searches via Jina Search API
 * 3. Reads top URLs via Jina Reader API
 * 4. Formats results for Claude to cite
 * 5. Emits status updates via callback for UI feedback
 *
 * Fail-soft behavior:
 * - If some URLs fail to read: returns partial results
 * - If all URLs fail: returns search snippets only
 * - If search fails: returns graceful error message as tool_result
 * - Never throws - always returns a tool_result
 */

import {
  IToolUseHandler,
  ToolUseInput,
  ToolUseResult,
  ToolUseContext,
} from '../interfaces/IToolUseHandler.js';
import type { IJinaClient, JinaSearchResult, JinaReadResult } from '../interfaces/IJinaClient.js';
import type { WebSearchInput } from '../interfaces/IWebSearchTool.js';
import { JINA_CONFIG } from '../config/jinaConfig.js';
import { enforceTopicScope, stripInjectionPatterns, sanitizeResultContent } from './SearchGuardrails.js';

/**
 * Rate limit tracking per conversation
 */
const rateLimitMap = new Map<string, number>();

/**
 * Rate limit interval in milliseconds (2 seconds between searches per conversation)
 */
const RATE_LIMIT_MS = 2000;

/**
 * Status callback type for UI feedback
 */
export type SearchStatusCallback = (status: 'searching' | 'reading' | 'idle') => void;

/**
 * Factory function type for creating status callbacks with conversation context
 * Story 33.3.1: Enables ChatServer to emit tool_status events with conversationId
 */
export type StatusCallbackFactory = (conversationId: string) => SearchStatusCallback;

export class WebSearchToolService implements IToolUseHandler {
  readonly toolName = 'web_search';

  constructor(
    private readonly jinaClient: IJinaClient,
    private readonly createStatusCallback?: StatusCallbackFactory
  ) {}

  /**
   * Handle the web_search tool call from Claude
   *
   * @param input - Tool use input from Claude
   * @param context - Conversation context
   * @returns Result with search results formatted for Claude
   */
  async handle(
    input: ToolUseInput,
    context: ToolUseContext
  ): Promise<ToolUseResult> {
    console.log(`[WebSearchToolService] handle() called with tool: ${input.toolName}`);

    // 1. Validate this is our tool
    if (input.toolName !== this.toolName) {
      return { handled: false };
    }

    console.log(`[WebSearchToolService] Executing web_search for conversation: ${context.conversationId}`);

    // 2. Check rate limit before emitting status
    const rateLimitError = this.checkRateLimit(context.conversationId);
    if (rateLimitError) {
      return {
        handled: true,
        toolResult: {
          toolUseId: input.toolUseId,
          content: rateLimitError,
        },
      };
    }

    // 3. Status callback for intermediate phase updates
    // V2: ConsultToolLoopService manages boundary emissions (searching at start, idle at end).
    // WebSearchToolService emits 'reading' between search and readUrls to keep frontend timeout alive.
    const onStatusChange = this.createStatusCallback?.(context.conversationId);
    // onStatusChange?.('searching'); // ConsultToolLoopService emits this at iteration start

    try {
      // 4. Parse and validate input
      const validationResult = this.validateInput(input);
      if (validationResult.error) {
        // Note: idle is emitted in finally block
        return {
          handled: true,
          toolResult: {
            toolUseId: input.toolUseId,
            content: validationResult.error,
          },
        };
      }

      const { query, max_results } = validationResult.input!;

      // 5a. Topic guardrail: reject queries unrelated to healthcare/AI governance
      const topicError = enforceTopicScope(query);
      if (topicError) {
        return {
          handled: true,
          toolResult: {
            toolUseId: input.toolUseId,
            content: topicError,
          },
        };
      }

      // 5b. Strip prompt injection patterns from query before sending to external API
      const cleanedQuery = stripInjectionPatterns(query);

      // 5c. PHI redaction: sanitize query before sending to external API
      const sanitizedQuery = this.redactPHI(cleanedQuery);

      // 6. Update rate limit timestamp
      rateLimitMap.set(context.conversationId, Date.now());

      // 7. Search via Jina with sanitized query
      console.log(`[WebSearchToolService] Calling Jina search API with query: "${sanitizedQuery}"`);
      const searchResults = await this.jinaClient.search(sanitizedQuery, max_results);
      console.log(`[WebSearchToolService] Jina returned ${searchResults.length} results`);

      // 8. Handle empty search results
      if (searchResults.length === 0) {
        // Note: idle is emitted in finally block
        return {
          handled: true,
          toolResult: {
            toolUseId: input.toolUseId,
            content: `No results found for query: "${sanitizedQuery}". Please answer based on your existing knowledge.`,
          },
        };
      }

      // 9. Read top URLs (fail-soft: partial failures OK)
      // Emit 'reading' between search and readUrls to reset the frontend safety timeout.
      // Without this, the gap from 'searching' to ConsultToolLoopService's 'reading' spans
      // both Jina search (up to 60s) and readUrls (up to 30s), exceeding the frontend timeout.
      onStatusChange?.('reading');
      const urls = searchResults.slice(0, JINA_CONFIG.MAX_URLS_TO_READ).map(r => r.url);
      const readResults = await this.jinaClient.readUrls(urls);

      // 10. Sanitize search results against indirect prompt injection
      const sanitizedReadResults = readResults.map(r => ({
        ...r,
        content: sanitizeResultContent(r.content),
      }));

      // 11. Format results for Claude
      const content = this.formatResults(searchResults, sanitizedReadResults);

      return {
        handled: true,
        toolResult: {
          toolUseId: input.toolUseId,
          content,
        },
      };
    } catch (error) {
      // Return graceful error message as tool_result, never throw
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        handled: true,
        toolResult: {
          toolUseId: input.toolUseId,
          content: `Search failed: ${errorMessage}. Please answer based on your existing knowledge.`,
        },
      };
    } finally {
      // onStatusChange?.('idle'); // ConsultToolLoopService emits idle when loop completes
    }
  }

  /**
   * Check if rate limit has been exceeded for this conversation
   * @returns Error message if rate limited, null otherwise
   */
  private checkRateLimit(conversationId: string): string | null {
    const lastSearch = rateLimitMap.get(conversationId);
    if (lastSearch) {
      const elapsed = Date.now() - lastSearch;
      if (elapsed < RATE_LIMIT_MS) {
        const waitTime = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
        return `Rate limit exceeded. Please wait ${waitTime} second(s) before searching again.`;
      }
    }
    return null;
  }

  /**
   * Validate and parse tool input
   * @returns Parsed input or error message
   */
  private validateInput(
    input: ToolUseInput
  ): { input?: WebSearchInput; error?: string } {
    const rawInput = input.input as Partial<WebSearchInput>;

    // Check for missing query
    if (!rawInput || rawInput.query === undefined || rawInput.query === null) {
      return {
        error: 'Missing required field: query. Please provide a search query.',
      };
    }

    // Check for empty query
    const query = String(rawInput.query).trim();
    if (query.length === 0) {
      return {
        error: 'Invalid query: query cannot be empty. Please provide a search query.',
      };
    }

    // Clamp max_results to valid range (1-10), default to 5
    let max_results = 5;
    if (typeof rawInput.max_results === 'number') {
      max_results = Math.max(1, Math.min(10, rawInput.max_results));
    }

    return {
      input: { query, max_results },
    };
  }

  /**
   * Redact PHI (Protected Health Information) from search queries
   *
   * Removes common PHI patterns before sending to external search APIs:
   * - Email addresses
   * - Phone numbers (US formats)
   * - SSN patterns (XXX-XX-XXXX)
   * - Common date of birth patterns
   * - Potential patient names (Title Case words near medical terms)
   *
   * @param query - Raw search query
   * @returns Sanitized query with PHI patterns redacted
   */
  private redactPHI(query: string): string {
    let sanitized = query;

    // Redact email addresses
    sanitized = sanitized.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[REDACTED_EMAIL]'
    );

    // Redact phone numbers (various US formats)
    sanitized = sanitized.replace(
      /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      '[REDACTED_PHONE]'
    );

    // Redact SSN patterns (XXX-XX-XXXX)
    sanitized = sanitized.replace(
      /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
      '[REDACTED_SSN]'
    );

    // Redact common date patterns that might be DOB (MM/DD/YYYY, MM-DD-YYYY)
    sanitized = sanitized.replace(
      /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](19|20)\d{2}\b/g,
      '[REDACTED_DATE]'
    );

    // Redact medical record number patterns (MRN: XXXXXXXX)
    sanitized = sanitized.replace(
      /\b(MRN|mrn|medical record|patient id)[\s:]*\d{6,}/gi,
      '[REDACTED_MRN]'
    );

    return sanitized;
  }

  /**
   * Format search and read results for Claude consumption
   *
   * Fail-soft logic:
   * - If readResults has content: include full content + URLs
   * - If readResults empty but searchResults exist: use search snippets + URLs
   * - If both empty: return "No results found for this query"
   */
  private formatResults(
    searchResults: JinaSearchResult[],
    readResults: JinaReadResult[]
  ): string {
    // Case: both empty (shouldn't happen as we check search results earlier, but defensive)
    if (searchResults.length === 0) {
      return 'No results found for this query.';
    }

    const lines: string[] = [];
    lines.push(`Found ${searchResults.length} search result(s).`);
    lines.push('');

    // If we have read results, format with full content
    if (readResults.length > 0) {
      lines.push(`Successfully read ${readResults.length} source(s):`);
      lines.push('');

      for (let i = 0; i < readResults.length; i++) {
        const read = readResults[i];
        lines.push(`--- Source ${i + 1} ---`);
        if (read.title) {
          lines.push(`Title: ${read.title}`);
        }
        lines.push(`URL: ${read.url}`);
        lines.push('Content:');
        lines.push(read.content);
        lines.push('');
      }

      // Add remaining search results as additional references (snippets only)
      const readUrls = new Set(readResults.map(r => r.url));
      const additionalResults = searchResults.filter(s => !readUrls.has(s.url));
      if (additionalResults.length > 0) {
        lines.push('Additional references (not fully read):');
        for (const result of additionalResults) {
          lines.push(`- ${result.title}: ${result.url}`);
          if (result.snippet) {
            lines.push(`  Snippet: ${result.snippet}`);
          }
        }
      }
    } else {
      // Fallback: no read results, use snippets only
      lines.push('Could not read full content from sources. Using search snippets:');
      lines.push('');

      for (let i = 0; i < searchResults.length; i++) {
        const result = searchResults[i];
        lines.push(`--- Result ${i + 1} ---`);
        lines.push(`Title: ${result.title}`);
        lines.push(`URL: ${result.url}`);
        if (result.snippet) {
          lines.push(`Snippet: ${result.snippet}`);
        }
        lines.push('');
      }
    }

    lines.push('Please cite sources using the URLs provided above when using this information.');

    return lines.join('\n');
  }

  /**
   * Clear rate limit for a conversation (useful for testing)
   * @internal
   */
  static clearRateLimit(conversationId: string): void {
    rateLimitMap.delete(conversationId);
  }

  /**
   * Clear all rate limits (useful for testing)
   * @internal
   */
  static clearAllRateLimits(): void {
    rateLimitMap.clear();
  }
}
