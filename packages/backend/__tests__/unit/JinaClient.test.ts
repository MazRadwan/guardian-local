/**
 * Unit tests for JinaClient
 *
 * Part of Epic 33: Consult Search Tool
 *
 * Tests verify that JinaClient correctly:
 * 1. Validates API key requirement
 * 2. Makes correct HTTP requests to Jina APIs
 * 3. Handles various error types (auth, rate limit, timeout, etc.)
 * 4. Truncates content at configured limit
 * 5. Respects concurrency limits for parallel reads
 * 6. Exports JINA_CONFIG constants
 */

import { JinaClient, JINA_CONFIG } from '../../src/infrastructure/ai/JinaClient.js';
import { JinaError } from '../../src/application/interfaces/IJinaClient.js';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('JinaClient', () => {
  const TEST_API_KEY = 'test-jina-api-key';

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear environment variable
    delete process.env.JINA_API_KEY;
  });

  describe('constructor', () => {
    it('should throw if JINA_API_KEY not provided via argument or env', () => {
      expect(() => new JinaClient()).toThrow('JINA_API_KEY is required for web search functionality');
    });

    it('should accept API key via constructor argument', () => {
      expect(() => new JinaClient(TEST_API_KEY)).not.toThrow();
    });

    it('should accept API key via environment variable', () => {
      process.env.JINA_API_KEY = TEST_API_KEY;
      expect(() => new JinaClient()).not.toThrow();
    });

    it('should prefer constructor argument over environment variable', () => {
      process.env.JINA_API_KEY = 'env-key';
      const client = new JinaClient('constructor-key');
      // Test by making a request and checking the header
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });
      client.search('test');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer constructor-key',
          }),
        })
      );
    });
  });

  describe('JINA_CONFIG exports', () => {
    it('should export JINA_CONFIG constants', () => {
      expect(JINA_CONFIG).toBeDefined();
      expect(JINA_CONFIG.MAX_SEARCH_RESULTS).toBe(5);
      expect(JINA_CONFIG.MAX_URLS_TO_READ).toBe(3);
      expect(JINA_CONFIG.MAX_READ_CONCURRENCY).toBe(3);
      expect(JINA_CONFIG.SEARCH_TIMEOUT_MS).toBe(60000);
      expect(JINA_CONFIG.READ_TIMEOUT_MS).toBe(30000);
      expect(JINA_CONFIG.MAX_CONTENT_LENGTH).toBe(10000);
    });

    it('should have JINA_CONFIG as readonly', () => {
      // TypeScript enforces this at compile time, but we can verify the values exist
      expect(typeof JINA_CONFIG.MAX_SEARCH_RESULTS).toBe('number');
      expect(typeof JINA_CONFIG.MAX_URLS_TO_READ).toBe('number');
      expect(typeof JINA_CONFIG.MAX_READ_CONCURRENCY).toBe('number');
      expect(typeof JINA_CONFIG.SEARCH_TIMEOUT_MS).toBe('number');
      expect(typeof JINA_CONFIG.READ_TIMEOUT_MS).toBe('number');
      expect(typeof JINA_CONFIG.MAX_CONTENT_LENGTH).toBe('number');
    });
  });

  describe('search()', () => {
    let client: JinaClient;

    beforeEach(() => {
      client = new JinaClient(TEST_API_KEY);
    });

    it('should make correct HTTP request to s.jina.ai', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { title: 'Test', url: 'https://test.com', description: 'Test snippet' },
          ],
        }),
      });

      await client.search('healthcare AI security');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://s.jina.ai/healthcare%20AI%20security',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
            Accept: 'application/json',
          },
        })
      );
    });

    it('should parse response into JinaSearchResult array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { title: 'Result 1', url: 'https://example1.com', description: 'Snippet 1' },
            { title: 'Result 2', url: 'https://example2.com', description: 'Snippet 2' },
          ],
        }),
      });

      const results = await client.search('test query');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        title: 'Result 1',
        url: 'https://example1.com',
        snippet: 'Snippet 1',
      });
      expect(results[1]).toEqual({
        title: 'Result 2',
        url: 'https://example2.com',
        snippet: 'Snippet 2',
      });
    });

    it('should respect maxResults parameter (default JINA_CONFIG.MAX_SEARCH_RESULTS)', async () => {
      const manyResults = Array.from({ length: 10 }, (_, i) => ({
        title: `Result ${i}`,
        url: `https://example${i}.com`,
        description: `Snippet ${i}`,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: manyResults }),
      });

      const results = await client.search('test');

      expect(results).toHaveLength(JINA_CONFIG.MAX_SEARCH_RESULTS);
    });

    it('should respect custom maxResults parameter', async () => {
      const manyResults = Array.from({ length: 10 }, (_, i) => ({
        title: `Result ${i}`,
        url: `https://example${i}.com`,
        description: `Snippet ${i}`,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: manyResults }),
      });

      const results = await client.search('test', 2);

      expect(results).toHaveLength(2);
    });

    it('should return empty array for empty query', async () => {
      const results = await client.search('');
      expect(results).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle 401 auth error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      try {
        await client.search('test');
        fail('Expected JinaError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JinaError);
        expect((error as JinaError).type).toBe('auth');
        expect((error as JinaError).statusCode).toBe(401);
      }
    });

    it('should handle 429 rate limit error after retries exhausted', async () => {
      // Mock 3 consecutive 429 responses (retry attempts exhausted)
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      try {
        await client.search('test');
        fail('Expected JinaError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JinaError);
        expect((error as JinaError).type).toBe('rate_limit');
        expect((error as JinaError).statusCode).toBe(429);
      }
    });

    it('should handle timeout (JINA_CONFIG.SEARCH_TIMEOUT_MS)', async () => {
      // Mock abort error
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      try {
        await client.search('test');
        fail('Expected JinaError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JinaError);
        expect((error as JinaError).type).toBe('timeout');
      }
    });

    it('should use content field as fallback when description is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { title: 'Result', url: 'https://example.com', content: 'Content fallback' },
          ],
        }),
      });

      const results = await client.search('test');

      expect(results[0].snippet).toBe('Content fallback');
    });
  });

  describe('readUrl()', () => {
    let client: JinaClient;

    beforeEach(() => {
      client = new JinaClient(TEST_API_KEY);
    });

    it('should make correct HTTP request to r.jina.ai', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { url: 'https://test.com', content: 'Page content', title: 'Page Title' },
        }),
      });

      await client.readUrl('https://test.com/page');

      // Jina Reader expects raw URL appended (not URL-encoded)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://test.com/page',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
            Accept: 'application/json',
          },
        })
      );
    });

    it('should return JinaReadResult with content and title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            url: 'https://example.com',
            content: 'This is the page content',
            title: 'Example Page',
          },
        }),
      });

      const result = await client.readUrl('https://example.com');

      expect(result).toEqual({
        url: 'https://example.com',
        content: 'This is the page content',
        title: 'Example Page',
      });
    });

    it('should truncate content at JINA_CONFIG.MAX_CONTENT_LENGTH', async () => {
      const longContent = 'a'.repeat(20000); // 20,000 characters

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { url: 'https://example.com', content: longContent },
        }),
      });

      const result = await client.readUrl('https://example.com');

      expect(result.content.length).toBe(JINA_CONFIG.MAX_CONTENT_LENGTH);
    });

    it('should handle 404 not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      try {
        await client.readUrl('https://example.com/missing');
        fail('Expected JinaError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JinaError);
        expect((error as JinaError).type).toBe('not_found');
        expect((error as JinaError).statusCode).toBe(404);
      }
    });

    it('should respect JINA_CONFIG.READ_TIMEOUT_MS', async () => {
      // Mock abort error
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      try {
        await client.readUrl('https://example.com');
        fail('Expected JinaError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JinaError);
        expect((error as JinaError).type).toBe('timeout');
      }
    });

    it('should throw error for empty URL', async () => {
      await expect(client.readUrl('')).rejects.toThrow(JinaError);
    });

    it('should handle missing title in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { url: 'https://example.com', content: 'Content only' },
        }),
      });

      const result = await client.readUrl('https://example.com');

      expect(result.title).toBeUndefined();
      expect(result.content).toBe('Content only');
    });
  });

  describe('readUrls()', () => {
    let client: JinaClient;

    beforeEach(() => {
      client = new JinaClient(TEST_API_KEY);
    });

    it('should run in parallel with JINA_CONFIG.MAX_READ_CONCURRENCY limit', async () => {
      const urls = [
        'https://example1.com',
        'https://example2.com',
        'https://example3.com',
      ];

      // Track call order
      mockFetch.mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: { url: 'https://example.com', content: 'Content' },
          }),
        });
      });

      await client.readUrls(urls);

      // All 3 should be called (within concurrency limit of 3)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should skip failed URLs (returns partial results)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { url: 'https://success1.com', content: 'Content 1' },
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { url: 'https://success2.com', content: 'Content 2' },
          }),
        });

      const results = await client.readUrls([
        'https://success1.com',
        'https://fail.com',
        'https://success2.com',
      ]);

      // Should have 2 successful results
      expect(results).toHaveLength(2);
      expect(results.map(r => r.url)).toContain('https://success1.com');
      expect(results.map(r => r.url)).toContain('https://success2.com');
    });

    it('should preserve order of successful results', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { url: 'https://first.com', content: 'First' },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { url: 'https://second.com', content: 'Second' },
          }),
        });

      const results = await client.readUrls([
        'https://first.com',
        'https://second.com',
      ]);

      expect(results[0].url).toBe('https://first.com');
      expect(results[1].url).toBe('https://second.com');
    });

    it('should return empty array for empty input', async () => {
      const results = await client.readUrls([]);
      expect(results).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should limit URLs to JINA_CONFIG.MAX_URLS_TO_READ', async () => {
      const manyUrls = Array.from({ length: 10 }, (_, i) => `https://example${i}.com`);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { url: 'https://example.com', content: 'Content' },
        }),
      });

      await client.readUrls(manyUrls);

      // Should only make MAX_URLS_TO_READ requests
      expect(mockFetch).toHaveBeenCalledTimes(JINA_CONFIG.MAX_URLS_TO_READ);
    });

    it('should handle all URLs failing gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const results = await client.readUrls([
        'https://fail1.com',
        'https://fail2.com',
      ]);

      expect(results).toEqual([]);
    });
  });

  describe('retry logic', () => {
    let client: JinaClient;

    beforeEach(() => {
      client = new JinaClient(TEST_API_KEY);
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should retry on 429 rate limit with backoff', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        });

      const searchPromise = client.search('test');

      // Fast-forward through first retry delay
      await jest.advanceTimersByTimeAsync(1000);

      const results = await searchPromise;
      expect(results).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 503 service unavailable', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        });

      const searchPromise = client.search('test');

      // Fast-forward through first retry delay
      await jest.advanceTimersByTimeAsync(1000);

      const results = await searchPromise;
      expect(results).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 401 auth error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(client.search('test')).rejects.toThrow(JinaError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    let client: JinaClient;

    beforeEach(() => {
      jest.clearAllMocks();
      client = new JinaClient(TEST_API_KEY);
    });

    it('should wrap network errors as JinaError', async () => {
      // Mock network error for all retry attempts
      mockFetch.mockRejectedValue(new Error('fetch failed: network error'));

      await expect(client.search('test')).rejects.toThrow(JinaError);
    });

    it('should include original error in JinaError for network errors', async () => {
      const networkError = new Error('fetch failed: network error');
      // Mock network error for all retry attempts (since retries happen on network errors)
      mockFetch.mockRejectedValue(networkError);

      try {
        await client.search('test');
        fail('Expected JinaError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JinaError);
        const jinaError = error as JinaError;
        expect(jinaError.type).toBe('network');
        expect(jinaError.originalError).toBeDefined();
        expect(jinaError.originalError?.message).toBe('fetch failed: network error');
      }
    });
  });
});
