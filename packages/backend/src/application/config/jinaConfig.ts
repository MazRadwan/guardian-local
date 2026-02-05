/**
 * Jina API Configuration Constants
 *
 * Part of Epic 33: Consult Search Tool
 *
 * Application-layer configuration for Jina API integration.
 * Moved from infrastructure layer to maintain clean architecture boundaries.
 */

/**
 * Configuration constants for Jina API
 * Used by WebSearchToolService and JinaClient
 */
export const JINA_CONFIG = {
  /** Maximum results from search API */
  MAX_SEARCH_RESULTS: 5,
  /** Maximum URLs to read content from */
  MAX_URLS_TO_READ: 3,
  /** Parallel read requests */
  MAX_READ_CONCURRENCY: 3,
  /** 60 seconds per search (complex queries can take longer) */
  SEARCH_TIMEOUT_MS: 60000,
  /** 30 seconds per URL read */
  READ_TIMEOUT_MS: 30000,
  /** Characters per URL content */
  MAX_CONTENT_LENGTH: 10000,
} as const;

export type JinaConfig = typeof JINA_CONFIG;
