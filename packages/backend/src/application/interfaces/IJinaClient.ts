/**
 * IJinaClient Interface
 *
 * Defines the contract for Jina AI Search and Reader APIs
 * Used by WebSearchToolService for web search functionality in Consult mode
 *
 * Part of Epic 33: Consult Search Tool
 */

/**
 * A single search result from Jina Search API
 */
export interface JinaSearchResult {
  /** Title of the search result */
  title: string;
  /** URL of the search result */
  url: string;
  /** Snippet/description of the search result */
  snippet: string;
}

/**
 * Result from reading a URL via Jina Reader API
 */
export interface JinaReadResult {
  /** The URL that was read */
  url: string;
  /** Extracted text content (truncated to configured limit) */
  content: string;
  /** Optional title extracted from the page */
  title?: string;
}

/**
 * Error types for Jina API calls
 */
export type JinaErrorType = 'auth' | 'rate_limit' | 'timeout' | 'not_found' | 'network' | 'unknown';

/**
 * Custom error class for Jina API failures
 */
export class JinaError extends Error {
  constructor(
    message: string,
    public readonly type: JinaErrorType,
    public readonly statusCode?: number,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'JinaError';
  }
}

/**
 * Interface for Jina AI client
 * Abstracts HTTP calls to Jina Search and Reader APIs
 */
export interface IJinaClient {
  /**
   * Search the web using Jina Search API
   *
   * @param query - Search query string
   * @param maxResults - Maximum number of results to return (default: JINA_CONFIG.MAX_SEARCH_RESULTS)
   * @returns Array of search results with title, URL, and snippet
   * @throws JinaError on API errors (auth, rate limit, timeout, etc.)
   */
  search(query: string, maxResults?: number): Promise<JinaSearchResult[]>;

  /**
   * Read and extract clean text content from a URL using Jina Reader API
   *
   * @param url - The URL to read
   * @returns Extracted content with URL and optional title
   * @throws JinaError on API errors (auth, rate limit, timeout, not found, etc.)
   */
  readUrl(url: string): Promise<JinaReadResult>;

  /**
   * Read multiple URLs in parallel with concurrency limit
   *
   * @param urls - Array of URLs to read
   * @returns Array of successfully read results (failed URLs are skipped)
   */
  readUrls(urls: string[]): Promise<JinaReadResult[]>;
}
