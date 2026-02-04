/**
 * IWebSearchTool Interface
 *
 * Part of Epic 33: Consult Search Tool
 *
 * Defines the input type for the web_search tool.
 * This lives in the application layer so that application-layer services
 * (like WebSearchToolService) can import it without violating clean architecture.
 */

/**
 * Input type for the web_search tool.
 *
 * Used by:
 * - webSearchTool definition (infrastructure layer)
 * - WebSearchToolService (application layer)
 */
export interface WebSearchInput {
  /** Search query to find relevant information */
  query: string;
  /** Maximum number of results to return (default: 5, max: 10) */
  max_results?: number;
}
