import { fetchScoringResult } from '../scoring';
import type { ScoringCompletePayload } from '@/lib/websocket';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('fetchScoringResult', () => {
  const mockToken = 'test-jwt-token';
  const mockConversationId = 'conv-123';

  const mockScoringResult: ScoringCompletePayload['result'] = {
    compositeScore: 75,
    recommendation: 'conditional',
    overallRiskRating: 'medium',
    executiveSummary: 'Test executive summary',
    keyFindings: ['Finding 1', 'Finding 2'],
    dimensionScores: [
      { dimension: 'Data Privacy', score: 80, riskRating: 'low' },
      { dimension: 'Security', score: 70, riskRating: 'medium' },
    ],
    batchId: 'batch-123',
    assessmentId: 'assess-123',
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns parsed JSON on successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockScoringResult,
    });

    const result = await fetchScoringResult(mockConversationId, mockToken);

    expect(result).toEqual(mockScoringResult);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/scoring/conversation/${mockConversationId}`),
      expect.objectContaining({
        headers: {
          Authorization: `Bearer ${mockToken}`,
        },
      })
    );
  });

  it('returns null when response is 404 (no scoring for conversation)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await fetchScoringResult(mockConversationId, mockToken);

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws error on non-404 HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(fetchScoringResult(mockConversationId, mockToken)).rejects.toThrow(
      'Failed to fetch scoring result: Internal Server Error'
    );
  });

  it('throws error on 401 Unauthorized', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(fetchScoringResult(mockConversationId, mockToken)).rejects.toThrow(
      'Failed to fetch scoring result: Unauthorized'
    );
  });

  it('throws error on 403 Forbidden', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(fetchScoringResult(mockConversationId, mockToken)).rejects.toThrow(
      'Failed to fetch scoring result: Forbidden'
    );
  });

  it('sets Authorization header correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockScoringResult,
    });

    await fetchScoringResult(mockConversationId, mockToken);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-jwt-token',
        },
      })
    );
  });

  it('constructs URL with correct API base and path', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockScoringResult,
    });

    await fetchScoringResult(mockConversationId, mockToken);

    // Default API base is http://localhost:8000
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/scoring/conversation/conv-123',
      expect.any(Object)
    );
  });

  it('handles different conversation IDs correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockScoringResult,
    });

    const differentConvId = 'conv-abc-xyz-456';
    await fetchScoringResult(differentConvId, mockToken);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/scoring/conversation/${differentConvId}`),
      expect.any(Object)
    );
  });

  it('propagates network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    await expect(fetchScoringResult(mockConversationId, mockToken)).rejects.toThrow(
      'Network failure'
    );
  });
});
