import { renderHook, act } from '@testing-library/react';
import { useChatStore } from '../chatStore';
import type { ScoringCompletePayload } from '@/lib/websocket';

/**
 * Epic 22.1.2: Tests for rehydrateScoringResult action
 *
 * These tests verify that the rehydration action correctly:
 * - Populates the per-conversation cache
 * - Updates scoringResult when conversation is active
 * - Sets scoringProgress to complete when conversation is active
 * - Does not affect other conversations' state
 */
describe('chatStore rehydrateScoringResult (Epic 22.1.2)', () => {
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

  const mockScoringResult2: ScoringCompletePayload['result'] = {
    compositeScore: 85,
    recommendation: 'approve',
    overallRiskRating: 'low',
    executiveSummary: 'Another test summary',
    keyFindings: ['Different finding'],
    dimensionScores: [
      { dimension: 'Data Privacy', score: 90, riskRating: 'low' },
    ],
    batchId: 'batch-456',
    assessmentId: 'assess-456',
  };

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    // Reset store state before each test
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.setActiveConversation(null);
      result.current.resetScoring();
      // Clear all scoring results
      Object.keys(result.current.scoringResultByConversation).forEach((convId) => {
        result.current.clearScoringResultForConversation(convId);
      });
    });
  });

  it('populates scoringResultByConversation cache', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.rehydrateScoringResult('conv-123', mockScoringResult);
    });

    expect(result.current.scoringResultByConversation['conv-123']).toEqual(mockScoringResult);
  });

  it('updates current scoringResult when conversation is active', () => {
    const { result } = renderHook(() => useChatStore());

    // Set active conversation first
    act(() => {
      result.current.setActiveConversation('conv-123');
    });

    // Reset scoring after setActiveConversation clears it
    act(() => {
      result.current.resetScoring();
    });

    // Rehydrate
    act(() => {
      result.current.rehydrateScoringResult('conv-123', mockScoringResult);
    });

    expect(result.current.scoringResult).toEqual(mockScoringResult);
  });

  it('sets scoringProgress to complete when conversation is active', () => {
    const { result } = renderHook(() => useChatStore());

    // Set active conversation
    act(() => {
      result.current.setActiveConversation('conv-123');
    });

    // Rehydrate
    act(() => {
      result.current.rehydrateScoringResult('conv-123', mockScoringResult);
    });

    expect(result.current.scoringProgress.status).toBe('complete');
    expect(result.current.scoringProgress.message).toBe('Analysis complete!');
  });

  it('does not update scoringResult when conversation is not active', () => {
    const { result } = renderHook(() => useChatStore());

    // Set different active conversation
    act(() => {
      result.current.setActiveConversation('conv-different');
    });

    // Rehydrate for a different conversation
    act(() => {
      result.current.rehydrateScoringResult('conv-123', mockScoringResult);
    });

    // Cache should have the result
    expect(result.current.scoringResultByConversation['conv-123']).toEqual(mockScoringResult);
    // But current scoringResult should remain null (from setActiveConversation reset)
    expect(result.current.scoringResult).toBeNull();
  });

  it('does not update scoringProgress when conversation is not active', () => {
    const { result } = renderHook(() => useChatStore());

    // Set different active conversation
    act(() => {
      result.current.setActiveConversation('conv-different');
    });

    // Manually set scoring progress to something else
    act(() => {
      result.current.updateScoringProgress({ status: 'scoring', message: 'In progress' });
    });

    // Rehydrate for a different conversation
    act(() => {
      result.current.rehydrateScoringResult('conv-123', mockScoringResult);
    });

    // Progress should remain unchanged
    expect(result.current.scoringProgress.status).toBe('scoring');
    expect(result.current.scoringProgress.message).toBe('In progress');
  });

  it('can rehydrate multiple conversations without overwriting', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.rehydrateScoringResult('conv-123', mockScoringResult);
      result.current.rehydrateScoringResult('conv-456', mockScoringResult2);
    });

    expect(result.current.scoringResultByConversation['conv-123']).toEqual(mockScoringResult);
    expect(result.current.scoringResultByConversation['conv-456']).toEqual(mockScoringResult2);
  });

  it('overwrites existing cache entry for same conversation', () => {
    const { result } = renderHook(() => useChatStore());

    // First rehydration
    act(() => {
      result.current.rehydrateScoringResult('conv-123', mockScoringResult);
    });

    expect(result.current.scoringResultByConversation['conv-123'].compositeScore).toBe(75);

    // Second rehydration with different result
    act(() => {
      result.current.rehydrateScoringResult('conv-123', mockScoringResult2);
    });

    expect(result.current.scoringResultByConversation['conv-123'].compositeScore).toBe(85);
  });

  it('works correctly when no active conversation is set', () => {
    const { result } = renderHook(() => useChatStore());

    // Ensure no active conversation
    act(() => {
      result.current.setActiveConversation(null);
    });

    // Rehydrate
    act(() => {
      result.current.rehydrateScoringResult('conv-123', mockScoringResult);
    });

    // Cache should have the result
    expect(result.current.scoringResultByConversation['conv-123']).toEqual(mockScoringResult);
    // scoringResult should remain null (no active conversation)
    expect(result.current.scoringResult).toBeNull();
  });

  it('updates scoringResult immediately when rehydrating active conversation', () => {
    const { result } = renderHook(() => useChatStore());

    // Set active conversation (which resets scoringResult)
    act(() => {
      result.current.setActiveConversation('conv-123');
    });

    // Verify it's reset
    expect(result.current.scoringResult).toBeNull();

    // Rehydrate the active conversation
    act(() => {
      result.current.rehydrateScoringResult('conv-123', mockScoringResult);
    });

    // Should be immediately available
    expect(result.current.scoringResult).toEqual(mockScoringResult);
    expect(result.current.scoringResult?.compositeScore).toBe(75);
    expect(result.current.scoringResult?.recommendation).toBe('conditional');
  });
});

/**
 * Existing scoring persistence tests (Story 5c)
 * Ensure rehydrateScoringResult doesn't break existing functionality
 */
describe('chatStore scoring persistence (Story 5c compatibility)', () => {
  const mockScoringResult: ScoringCompletePayload['result'] = {
    compositeScore: 75,
    recommendation: 'conditional',
    overallRiskRating: 'medium',
    executiveSummary: 'Test',
    keyFindings: [],
    dimensionScores: [],
    batchId: 'batch-123',
    assessmentId: 'assess-123',
  };

  beforeEach(() => {
    localStorage.clear();
    const { result } = renderHook(() => useChatStore());
    act(() => {
      result.current.setActiveConversation(null);
      result.current.resetScoring();
      Object.keys(result.current.scoringResultByConversation).forEach((convId) => {
        result.current.clearScoringResultForConversation(convId);
      });
    });
  });

  it('setScoringResultForConversation still works alongside rehydrate', () => {
    const { result } = renderHook(() => useChatStore());

    // Use the original method
    act(() => {
      result.current.setScoringResultForConversation('conv-123', mockScoringResult);
    });

    expect(result.current.scoringResultByConversation['conv-123']).toEqual(mockScoringResult);

    // Now rehydrate a different conversation
    act(() => {
      result.current.rehydrateScoringResult('conv-456', {
        ...mockScoringResult,
        compositeScore: 90,
      });
    });

    // Both should exist
    expect(result.current.scoringResultByConversation['conv-123'].compositeScore).toBe(75);
    expect(result.current.scoringResultByConversation['conv-456'].compositeScore).toBe(90);
  });

  it('getScoringResultForConversation returns rehydrated result', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.rehydrateScoringResult('conv-123', mockScoringResult);
    });

    const retrieved = result.current.getScoringResultForConversation('conv-123');
    expect(retrieved).toEqual(mockScoringResult);
  });

  it('clearScoringResultForConversation clears rehydrated result', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.rehydrateScoringResult('conv-123', mockScoringResult);
    });

    expect(result.current.scoringResultByConversation['conv-123']).toBeDefined();

    act(() => {
      result.current.clearScoringResultForConversation('conv-123');
    });

    expect(result.current.scoringResultByConversation['conv-123']).toBeUndefined();
  });
});
