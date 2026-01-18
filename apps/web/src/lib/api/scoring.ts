import type { ScoringCompletePayload } from '@/lib/websocket';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Epic 22.1.2: Fetch scoring result for a conversation
 *
 * Returns the scoring result if it exists, or null if no scoring
 * has been completed for this conversation (404 response).
 *
 * @param conversationId - The conversation ID to fetch scoring for
 * @param token - JWT auth token
 * @returns Scoring result or null if not found
 * @throws Error on non-404 HTTP errors
 */
export async function fetchScoringResult(
  conversationId: string,
  token: string
): Promise<ScoringCompletePayload['result'] | null> {
  const response = await fetch(
    `${API_BASE_URL}/api/scoring/conversation/${conversationId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  // 404 = No scoring results for this conversation (expected case)
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch scoring result: ${response.statusText}`);
  }

  return response.json();
}
