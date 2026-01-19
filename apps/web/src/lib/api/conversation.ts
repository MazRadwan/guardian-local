const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export class ConversationAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ConversationAPIError';
  }
}

/**
 * Update conversation title via REST API
 * Story 25.6: Manual rename from dropdown menu
 *
 * @param conversationId - ID of the conversation to update
 * @param title - New title for the conversation
 * @param token - JWT auth token
 * @returns Updated conversation data
 */
export async function updateConversationTitle(
  conversationId: string,
  title: string,
  token: string
): Promise<{ conversationId: string; title: string }> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/conversations/${conversationId}/title`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title }),
      }
    );

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      let errorMsg = 'Failed to update title';

      try {
        if (contentType.includes('application/json')) {
          const errJson = await response.json();
          errorMsg = errJson?.error || errJson?.message || errorMsg;
        } else {
          const errText = await response.text();
          if (errText) errorMsg = errText;
        }
      } catch {
        // Keep default errorMsg if parse fails
      }

      throw new ConversationAPIError(errorMsg, response.status, 'HTTP_ERROR');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof ConversationAPIError) {
      throw error;
    }
    throw new ConversationAPIError(
      'Network error. Please try again.',
      500,
      'NETWORK_ERROR'
    );
  }
}
