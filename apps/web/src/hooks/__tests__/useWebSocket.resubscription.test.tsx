/**
 * Regression test: useWebSocket must NOT re-subscribe event listeners when
 * callback props change identity. This was the root cause of "Maximum update
 * depth exceeded" during streaming — appendToLastMessage triggered re-renders,
 * which changed handler identities, which re-ran the useEffect that subscribes
 * all 25+ socket listeners, causing a cascading loop.
 *
 * The fix: all callbacks are dispatched through refs, and the useEffect depends
 * only on [isConnected].
 */
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';

// Track how many times each on* method is called on the mock client
const subscriptionCounts: Record<string, number> = {};
const mockUnsubscribe = jest.fn();

// Build a mock WebSocketClient that tracks subscription calls
function createMockClient() {
  const handler = (methodName: string) => {
    return (_cb: (...args: any[]) => void) => {
      subscriptionCounts[methodName] = (subscriptionCounts[methodName] || 0) + 1;
      return mockUnsubscribe;
    };
  };

  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    sendMessage: jest.fn(),
    requestHistory: jest.fn(),
    fetchConversations: jest.fn(),
    startNewConversation: jest.fn(),
    abortStream: jest.fn(),
    deleteConversation: jest.fn(),
    switchMode: jest.fn(),
    generateQuestionnaire: jest.fn(),
    requestExportStatus: jest.fn(),
    selectVendor: jest.fn(),
    onMessage: handler('onMessage'),
    onMessageStream: handler('onMessageStream'),
    onError: handler('onError'),
    onHistory: handler('onHistory'),
    onStreamComplete: handler('onStreamComplete'),
    onConversationsList: handler('onConversationsList'),
    onConversationCreated: handler('onConversationCreated'),
    onConversationTitleUpdated: handler('onConversationTitleUpdated'),
    onStreamAborted: handler('onStreamAborted'),
    onConversationDeleted: handler('onConversationDeleted'),
    onConversationModeUpdated: handler('onConversationModeUpdated'),
    onExportReady: handler('onExportReady'),
    onExtractionFailed: handler('onExtractionFailed'),
    onQuestionnaireReady: handler('onQuestionnaireReady'),
    onGenerationPhase: handler('onGenerationPhase'),
    onExportStatusNotFound: handler('onExportStatusNotFound'),
    onExportStatusError: handler('onExportStatusError'),
    onScoringStarted: handler('onScoringStarted'),
    onScoringProgress: handler('onScoringProgress'),
    onScoringComplete: handler('onScoringComplete'),
    onScoringError: handler('onScoringError'),
    onVendorClarificationNeeded: handler('onVendorClarificationNeeded'),
    onFileProcessingError: handler('onFileProcessingError'),
    onQuestionnaireProgress: handler('onQuestionnaireProgress'),
    onToolStatus: handler('onToolStatus'),
    onDisconnect: handler('onDisconnect'),
    onReconnect: handler('onReconnect'),
    onUploadProgress: handler('onUploadProgress'),
    onIntakeContextReady: handler('onIntakeContextReady'),
    onScoringParseReady: handler('onScoringParseReady'),
    onFileAttached: handler('onFileAttached'),
  };
}

let mockClient: ReturnType<typeof createMockClient>;

// Mock the WebSocketClient constructor
jest.mock('@/lib/websocket', () => ({
  WebSocketClient: jest.fn().mockImplementation(() => mockClient),
}));

// Mock chatStore to avoid import issues
jest.mock('@/stores/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      setReconnecting: jest.fn(),
      setToolStatus: jest.fn(),
      clearAllTitleLoadingStates: jest.fn(),
    }),
  },
}));

describe('useWebSocket — re-subscription regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(subscriptionCounts).forEach((k) => delete subscriptionCounts[k]);
    mockClient = createMockClient();
  });

  it('does NOT re-subscribe listeners when callback props change identity', async () => {
    let callbackVersion = 0;

    // Initial render with callback v0
    const { rerender } = renderHook(
      ({ version }: { version: number }) =>
        useWebSocket({
          url: 'http://localhost:8000',
          token: 'test-token',
          // Create new function identity every render (simulates what happens during streaming)
          onMessageStream: () => { callbackVersion = version; },
          onMessage: () => { callbackVersion = version; },
          onError: () => { callbackVersion = version; },
          autoConnect: true,
        }),
      { initialProps: { version: 0 } }
    );

    // Wait for connect to complete and effect to run
    await act(async () => {
      await Promise.resolve();
    });

    // Record subscription counts after initial setup
    const initialCounts = { ...subscriptionCounts };

    // Verify listeners were registered at least once (the initial subscription)
    expect(initialCounts.onMessageStream).toBe(1);
    expect(initialCounts.onMessage).toBe(1);
    expect(initialCounts.onError).toBe(1);

    // Now simulate 10 rapid re-renders with NEW callback identities each time
    // (this is what happens during streaming: appendToLastMessage -> re-render -> new handlers)
    for (let i = 1; i <= 10; i++) {
      rerender({ version: i });
    }

    // Subscription counts should NOT have increased — the useEffect should NOT re-run
    // because its only dependency is isConnected (which hasn't changed)
    expect(subscriptionCounts.onMessageStream).toBe(initialCounts.onMessageStream);
    expect(subscriptionCounts.onMessage).toBe(initialCounts.onMessage);
    expect(subscriptionCounts.onError).toBe(initialCounts.onError);
    expect(subscriptionCounts.onStreamComplete).toBe(initialCounts.onStreamComplete);
    expect(subscriptionCounts.onConversationsList).toBe(initialCounts.onConversationsList);

    // Verify the ref still points to the latest callback
    expect(callbackVersion).toBe(0); // Not called yet, just assigned
  });

  it('dispatches through latest callback ref even after re-renders', async () => {
    const calls: number[] = [];

    // We need to capture the callback that was registered with onMessageStream
    let capturedStreamCallback: ((event: any) => void) | null = null;
    mockClient.onMessageStream = (cb: any) => {
      capturedStreamCallback = cb;
      subscriptionCounts.onMessageStream = (subscriptionCounts.onMessageStream || 0) + 1;
      return mockUnsubscribe;
    };

    const { rerender } = renderHook(
      ({ version }: { version: number }) =>
        useWebSocket({
          url: 'http://localhost:8000',
          token: 'test-token',
          onMessageStream: (_chunk: string) => { calls.push(version); },
          autoConnect: true,
        }),
      { initialProps: { version: 1 } }
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Re-render with new callback (version 2)
    rerender({ version: 2 });

    // Simulate a streaming event arriving — should dispatch through the LATEST ref
    if (capturedStreamCallback) {
      act(() => {
        capturedStreamCallback!({ chunk: 'hello', conversationId: 'c1' });
      });
    }

    // The call should have used version 2 (latest), not version 1 (stale)
    expect(calls).toEqual([2]);

    // And the listener was only registered ONCE (no re-subscription)
    expect(subscriptionCounts.onMessageStream).toBe(1);
  });
});
