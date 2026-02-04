/**
 * JinaClient Implementation
 *
 * Wraps Jina AI Search and Reader APIs with retry logic, error handling,
 * and content truncation.
 *
 * Part of Epic 33: Consult Search Tool
 *
 * APIs:
 * - Search: https://s.jina.ai/{query} - Web search results
 * - Reader: https://r.jina.ai/{url} - Clean text extraction from URLs
 */

import type {
  IJinaClient,
  JinaSearchResult,
  JinaReadResult,
} from '../../application/interfaces/IJinaClient.js';
import { JinaError, JinaErrorType } from '../../application/interfaces/IJinaClient.js';
import { JINA_CONFIG } from '../../application/config/jinaConfig.js';

// Re-export for backward compatibility (deprecated - import from application/config instead)
export { JINA_CONFIG };

/**
 * Response structure from Jina Search API
 */
interface JinaSearchApiResponse {
  code: number;
  status: number;
  data: Array<{
    title: string;
    url: string;
    description: string;
    content?: string;
  }>;
}

/**
 * Response structure from Jina Reader API
 */
interface JinaReaderApiResponse {
  code: number;
  status: number;
  data: {
    title?: string;
    url: string;
    content: string;
  };
}

export class JinaClient implements IJinaClient {
  private readonly apiKey: string;
  private readonly searchBaseUrl = 'https://s.jina.ai';
  private readonly readerBaseUrl = 'https://r.jina.ai';
  private readonly retryAttempts = 3;
  private readonly retryDelays = [1000, 2000, 4000]; // Exponential backoff

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.JINA_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('JINA_API_KEY is required for web search functionality');
    }
  }

  /**
   * Search the web using Jina Search API
   */
  async search(query: string, maxResults: number = JINA_CONFIG.MAX_SEARCH_RESULTS): Promise<JinaSearchResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const url = `${this.searchBaseUrl}/${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), JINA_CONFIG.SEARCH_TIMEOUT_MS);

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      const data = await response.json() as JinaSearchApiResponse;

      // Parse and limit results
      const results: JinaSearchResult[] = (data.data || [])
        .slice(0, maxResults)
        .map((item) => ({
          title: item.title || '',
          url: item.url || '',
          snippet: item.description || item.content || '',
        }));

      return results;
    } catch (error) {
      throw this.handleError(error, 'search');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Read and extract clean text content from a URL
   */
  async readUrl(url: string): Promise<JinaReadResult> {
    if (!url || url.trim().length === 0) {
      throw new JinaError('URL is required', 'unknown');
    }

    // Jina Reader expects raw URL appended after r.jina.ai/ (not URL-encoded)
    const requestUrl = `${this.readerBaseUrl}/${url}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), JINA_CONFIG.READ_TIMEOUT_MS);

    try {
      const response = await this.fetchWithRetry(requestUrl, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      const data = await response.json() as JinaReaderApiResponse;

      // Truncate content to configured limit
      const content = (data.data?.content || '').slice(0, JINA_CONFIG.MAX_CONTENT_LENGTH);

      return {
        url: data.data?.url || url,
        content,
        title: data.data?.title,
      };
    } catch (error) {
      throw this.handleError(error, 'readUrl');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Read multiple URLs in parallel with concurrency limit
   * Skips failed URLs and returns partial results
   */
  async readUrls(urls: string[]): Promise<JinaReadResult[]> {
    if (!urls || urls.length === 0) {
      return [];
    }

    // Limit to max URLs to read
    const urlsToRead = urls.slice(0, JINA_CONFIG.MAX_URLS_TO_READ);
    const results: JinaReadResult[] = [];

    // Process in batches respecting concurrency limit
    for (let i = 0; i < urlsToRead.length; i += JINA_CONFIG.MAX_READ_CONCURRENCY) {
      const batch = urlsToRead.slice(i, i + JINA_CONFIG.MAX_READ_CONCURRENCY);

      const batchResults = await Promise.allSettled(
        batch.map((url) => this.readUrl(url))
      );

      // Collect successful results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
        // Skip failed URLs silently - they're logged in handleError
      }
    }

    return results;
  }

  /**
   * Get authorization headers for Jina API
   */
  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json',
    };
  }

  /**
   * Fetch with retry logic for transient errors
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, options);

        // Check for specific error status codes
        if (response.status === 401) {
          throw new JinaError('Invalid API key', 'auth', 401);
        }
        if (response.status === 429) {
          // Rate limited - retry with backoff
          if (attempt < this.retryAttempts - 1) {
            await this.sleep(this.retryDelays[attempt]);
            continue;
          }
          throw new JinaError('Rate limit exceeded', 'rate_limit', 429);
        }
        if (response.status === 404) {
          throw new JinaError('Resource not found', 'not_found', 404);
        }
        if (response.status === 503) {
          // Service unavailable - retry with backoff
          if (attempt < this.retryAttempts - 1) {
            await this.sleep(this.retryDelays[attempt]);
            continue;
          }
          throw new JinaError('Service unavailable', 'network', 503);
        }
        if (!response.ok) {
          throw new JinaError(
            `HTTP error: ${response.status} ${response.statusText}`,
            'unknown',
            response.status
          );
        }

        return response;
      } catch (error) {
        lastError = error as Error;

        // Check for abort/timeout
        if ((error as Error).name === 'AbortError') {
          throw new JinaError('Request timed out', 'timeout');
        }

        // Check if error is already a JinaError (from status code handling)
        if (error instanceof JinaError) {
          // Only retry on rate_limit or network errors
          if (error.type !== 'rate_limit' && error.type !== 'network') {
            throw error;
          }
        }

        // Check for network errors that should be retried
        if ((error as Error).message?.includes('fetch')) {
          if (attempt < this.retryAttempts - 1) {
            await this.sleep(this.retryDelays[attempt]);
            continue;
          }
        }

        // If not retryable or last attempt, throw
        if (attempt === this.retryAttempts - 1) {
          break;
        }
      }
    }

    throw lastError || new JinaError('Unknown error', 'unknown');
  }

  /**
   * Handle and wrap errors with appropriate type
   */
  private handleError(error: unknown, operation: string): JinaError {
    if (error instanceof JinaError) {
      console.error(`[JinaClient] ${operation} failed:`, error.message);
      return error;
    }

    const err = error as Error;
    console.error(`[JinaClient] ${operation} failed:`, err.message);

    // Determine error type
    let type: JinaErrorType = 'unknown';
    if (err.name === 'AbortError') {
      type = 'timeout';
    } else if (err.message?.includes('fetch') || err.message?.includes('network')) {
      type = 'network';
    }

    return new JinaError(
      `${operation} failed: ${err.message}`,
      type,
      undefined,
      err
    );
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
