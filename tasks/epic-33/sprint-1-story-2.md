# Story 33.1.2: Jina Client Service

## Description

Create a service to interact with Jina AI's Search and Reader APIs. Jina Search (`s.jina.ai`) provides web search results, and Jina Reader (`r.jina.ai`) extracts clean text content from URLs. This service abstracts the HTTP calls and handles error cases, timeouts, and rate limiting.

## Acceptance Criteria

- [ ] Service created at `packages/backend/src/infrastructure/ai/JinaClient.ts`
- [ ] Interface defined at `packages/backend/src/application/interfaces/IJinaClient.ts`
- [ ] `search(query: string, maxResults?: number)` method returns array of search results with title, URL, snippet
- [ ] `readUrl(url: string)` method returns cleaned text content from URL
- [ ] Environment variable `JINA_API_KEY` required (throw clear error if missing)
- [ ] Request timeout of 10 seconds per call
- [ ] Proper error handling with specific error types (AuthError, RateLimitError, TimeoutError)
- [ ] Content length limit on reader responses (truncate at 10,000 chars per URL)
- [ ] Request headers include `Authorization: Bearer {API_KEY}` and `Accept: application/json`

## Technical Approach

1. Create interface with search and read methods
2. Implement HTTP client using native fetch (Node 18+)
3. Add retry logic for transient errors (429, 503)
4. Truncate long content to prevent context overflow

### Configuration Constants (REQUIRED)

```typescript
export const JINA_CONFIG = {
  MAX_SEARCH_RESULTS: 5,      // Maximum results from search API
  MAX_URLS_TO_READ: 3,        // Maximum URLs to read content from
  MAX_READ_CONCURRENCY: 3,    // Parallel read requests
  SEARCH_TIMEOUT_MS: 10000,   // 10 seconds per search
  READ_TIMEOUT_MS: 8000,      // 8 seconds per URL read
  MAX_CONTENT_LENGTH: 10000,  // Characters per URL content
} as const;
```

These constants MUST be exported from the JinaClient module for use by WebSearchToolService.

```typescript
// IJinaClient.ts
export interface JinaSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface JinaReadResult {
  url: string;
  content: string;
  title?: string;
}

export interface IJinaClient {
  search(query: string, maxResults?: number): Promise<JinaSearchResult[]>;
  readUrl(url: string): Promise<JinaReadResult>;
  readUrls(urls: string[]): Promise<JinaReadResult[]>;
}

// JinaClient.ts
export class JinaClient implements IJinaClient {
  private readonly apiKey: string;
  private readonly searchBaseUrl = 'https://s.jina.ai';
  private readonly readerBaseUrl = 'https://r.jina.ai';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.JINA_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('JINA_API_KEY is required for web search functionality');
    }
  }

  async search(query: string, maxResults = JINA_CONFIG.MAX_SEARCH_RESULTS): Promise<JinaSearchResult[]> {
    // GET https://s.jina.ai/{query}
    // Returns JSON with results array
    // Timeout: JINA_CONFIG.SEARCH_TIMEOUT_MS
  }

  async readUrl(url: string): Promise<JinaReadResult> {
    // GET https://r.jina.ai/{url}
    // Returns JSON with content field
    // Timeout: JINA_CONFIG.READ_TIMEOUT_MS
    // Truncate at: JINA_CONFIG.MAX_CONTENT_LENGTH
  }

  async readUrls(urls: string[]): Promise<JinaReadResult[]> {
    // Parallel fetch with Promise.allSettled
    // Concurrency limit: JINA_CONFIG.MAX_READ_CONCURRENCY
    // Skip failed URLs, return successful ones
  }
}
```

## Files Touched

- `packages/backend/src/application/interfaces/IJinaClient.ts` - CREATE: Interface definition
- `packages/backend/src/infrastructure/ai/JinaClient.ts` - CREATE: Implementation (co-located with ClaudeClient)

## Tests Affected

No existing tests should break. This is a new isolated module.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/JinaClient.test.ts`
  - Constructor throws if JINA_API_KEY not provided
  - search() makes correct HTTP request to s.jina.ai
  - search() parses response into JinaSearchResult array
  - search() respects maxResults parameter (default JINA_CONFIG.MAX_SEARCH_RESULTS)
  - search() handles 401 auth error
  - search() handles 429 rate limit error
  - search() handles timeout (JINA_CONFIG.SEARCH_TIMEOUT_MS)
  - readUrl() makes correct HTTP request to r.jina.ai
  - readUrl() truncates content at JINA_CONFIG.MAX_CONTENT_LENGTH
  - readUrl() handles 404 not found
  - readUrl() respects JINA_CONFIG.READ_TIMEOUT_MS
  - readUrls() runs in parallel with JINA_CONFIG.MAX_READ_CONCURRENCY limit
  - readUrls() skips failed URLs (returns partial results)
  - readUrls() preserves order of successful results
  - **JINA_CONFIG constants are exported and accessible**

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
