/**
 * useFileUpload Hook Tests
 *
 * Tests for Epic 16 document upload functionality.
 * Includes regression tests for subscription stability (prevents thrashing).
 * Epic 16.6.1: Added race condition tests for "never adopt" pattern
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFileUpload, UseFileUploadOptions } from '../useFileUpload';

// Mock useAuth
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

// Mock fetch with controllable behavior
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('useFileUpload', () => {
  // Track subscription calls
  let subscribeUploadProgressCalls: number;
  let subscribeIntakeContextReadyCalls: number;
  let subscribeScoringParseReadyCalls: number;
  let unsubscribeCalls: number;

  // Mock handlers stored for triggering events
  let uploadProgressHandler: ((data: unknown) => void) | null;
  let intakeContextHandler: ((data: unknown) => void) | null;
  let scoringParseHandler: ((data: unknown) => void) | null;

  const createMockAdapter = (isConnected: boolean) => ({
    isConnected,
    subscribeUploadProgress: jest.fn((handler) => {
      subscribeUploadProgressCalls++;
      uploadProgressHandler = handler;
      return () => {
        unsubscribeCalls++;
        uploadProgressHandler = null;
      };
    }),
    subscribeIntakeContextReady: jest.fn((handler) => {
      subscribeIntakeContextReadyCalls++;
      intakeContextHandler = handler;
      return () => {
        unsubscribeCalls++;
        intakeContextHandler = null;
      };
    }),
    subscribeScoringParseReady: jest.fn((handler) => {
      subscribeScoringParseReadyCalls++;
      scoringParseHandler = handler;
      return () => {
        unsubscribeCalls++;
        scoringParseHandler = null;
      };
    }),
  });

  beforeEach(() => {
    subscribeUploadProgressCalls = 0;
    subscribeIntakeContextReadyCalls = 0;
    subscribeScoringParseReadyCalls = 0;
    unsubscribeCalls = 0;
    uploadProgressHandler = null;
    intakeContextHandler = null;
    scoringParseHandler = null;
    jest.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('returns expected interface', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
        })
      );

      expect(result.current).toHaveProperty('uploadProgress');
      expect(result.current).toHaveProperty('openFilePicker');
      expect(result.current).toHaveProperty('handleFileChange');
      expect(result.current).toHaveProperty('uploadFile');
      expect(result.current).toHaveProperty('reset');
      expect(result.current).toHaveProperty('isUploading');
      expect(result.current).toHaveProperty('acceptedTypes');
    });

    it('initial state is idle', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
        })
      );

      expect(result.current.uploadProgress.stage).toBe('idle');
      expect(result.current.uploadProgress.progress).toBe(0);
      expect(result.current.isUploading).toBe(false);
    });
  });

  describe('Subscription stability (regression tests)', () => {
    it('does not subscribe when disconnected', () => {
      const adapter = createMockAdapter(false);
      renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
        })
      );

      // Should not subscribe when not connected
      expect(subscribeUploadProgressCalls).toBe(0);
      expect(subscribeIntakeContextReadyCalls).toBe(0);
      expect(subscribeScoringParseReadyCalls).toBe(0);
    });

    it('subscribes once when connected', () => {
      const adapter = createMockAdapter(true);
      renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
        })
      );

      // Should subscribe exactly once per event type
      expect(subscribeUploadProgressCalls).toBe(1);
      expect(subscribeIntakeContextReadyCalls).toBe(1);
      expect(subscribeScoringParseReadyCalls).toBe(1);
    });

    it('does NOT resubscribe when callbacks change (stability test)', () => {
      const adapter = createMockAdapter(true);

      // Initial render with callbacks
      const { rerender } = renderHook(
        ({ onContextReady, onError }: Partial<UseFileUploadOptions>) =>
          useFileUpload({
            conversationId: 'conv-123',
            mode: 'intake',
            wsAdapter: adapter,
            onContextReady,
            onError,
          }),
        {
          initialProps: {
            onContextReady: () => console.log('callback 1'),
            onError: () => console.log('error 1'),
          },
        }
      );

      // Initial subscription count
      expect(subscribeUploadProgressCalls).toBe(1);
      expect(subscribeIntakeContextReadyCalls).toBe(1);
      expect(subscribeScoringParseReadyCalls).toBe(1);

      // Rerender with NEW callback identities (simulates what happens on each render with inline lambdas)
      rerender({
        onContextReady: () => console.log('callback 2'),
        onError: () => console.log('error 2'),
      });

      // Should NOT have resubscribed - callbacks are stored in refs
      expect(subscribeUploadProgressCalls).toBe(1);
      expect(subscribeIntakeContextReadyCalls).toBe(1);
      expect(subscribeScoringParseReadyCalls).toBe(1);
      expect(unsubscribeCalls).toBe(0);

      // Rerender again with more new callbacks
      rerender({
        onContextReady: () => console.log('callback 3'),
        onError: () => console.log('error 3'),
      });

      // Still should not have resubscribed
      expect(subscribeUploadProgressCalls).toBe(1);
      expect(subscribeIntakeContextReadyCalls).toBe(1);
      expect(subscribeScoringParseReadyCalls).toBe(1);
      expect(unsubscribeCalls).toBe(0);
    });

    it('resubscribes when conversationId changes', () => {
      const adapter = createMockAdapter(true);

      const { rerender } = renderHook(
        ({ conversationId }: { conversationId: string }) =>
          useFileUpload({
            conversationId,
            mode: 'intake',
            wsAdapter: adapter,
          }),
        {
          initialProps: { conversationId: 'conv-123' },
        }
      );

      expect(subscribeUploadProgressCalls).toBe(1);

      // Change conversationId - should resubscribe
      rerender({ conversationId: 'conv-456' });

      // Should have unsubscribed from old and subscribed to new
      expect(unsubscribeCalls).toBe(3); // 3 unsubscribes (one per event type)
      expect(subscribeUploadProgressCalls).toBe(2);
      expect(subscribeIntakeContextReadyCalls).toBe(2);
      expect(subscribeScoringParseReadyCalls).toBe(2);
    });

    it('resubscribes when connection state changes', () => {
      let adapter = createMockAdapter(false);

      const { rerender } = renderHook(
        ({ wsAdapter }: { wsAdapter: ReturnType<typeof createMockAdapter> }) =>
          useFileUpload({
            conversationId: 'conv-123',
            mode: 'intake',
            wsAdapter,
          }),
        {
          initialProps: { wsAdapter: adapter },
        }
      );

      // Not connected - no subscriptions
      expect(subscribeUploadProgressCalls).toBe(0);

      // Connect
      adapter = createMockAdapter(true);
      rerender({ wsAdapter: adapter });

      // Now subscribed
      expect(subscribeUploadProgressCalls).toBe(1);
      expect(subscribeIntakeContextReadyCalls).toBe(1);
      expect(subscribeScoringParseReadyCalls).toBe(1);
    });

    it('calls latest callback when event received (ref behavior)', async () => {
      const adapter = createMockAdapter(true);
      const onContextReady1 = jest.fn();
      const onContextReady2 = jest.fn();

      // Mock successful upload to set uploadId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uploadId: 'upload-123' }),
      });

      const { result, rerender } = renderHook(
        ({ onContextReady }: Partial<UseFileUploadOptions>) =>
          useFileUpload({
            conversationId: 'conv-123',
            mode: 'intake',
            wsAdapter: adapter,
            onContextReady,
          }),
        {
          initialProps: { onContextReady: onContextReady1 },
        }
      );

      // Start upload to set the uploadId
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      await act(async () => {
        await result.current.uploadFile(file);
      });

      // Update to new callback
      rerender({ onContextReady: onContextReady2 });

      // Trigger event with matching uploadId
      act(() => {
        intakeContextHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          success: true,
          context: { vendorName: 'Test Vendor' },
        });
      });

      // Should call the LATEST callback (callback2), not the original
      expect(onContextReady1).not.toHaveBeenCalled();
      expect(onContextReady2).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes on unmount', () => {
      const adapter = createMockAdapter(true);

      const { unmount } = renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
        })
      );

      expect(subscribeUploadProgressCalls).toBe(1);
      expect(unsubscribeCalls).toBe(0);

      unmount();

      // Should unsubscribe all 3 event types
      expect(unsubscribeCalls).toBe(3);
    });
  });

  describe('Event filtering', () => {
    it('filters events by conversationId', async () => {
      const adapter = createMockAdapter(true);
      const onContextReady = jest.fn();

      // Mock successful upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uploadId: 'upload-123' }),
      });

      const { result } = renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
          onContextReady,
        })
      );

      // Start upload to set uploadId
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      await act(async () => {
        await result.current.uploadFile(file);
      });

      // Event for different conversation - should be ignored
      act(() => {
        intakeContextHandler?.({
          conversationId: 'conv-OTHER',
          uploadId: 'upload-123',
          success: true,
          context: {},
        });
      });

      expect(onContextReady).not.toHaveBeenCalled();

      // Event for our conversation with correct uploadId - should be processed
      act(() => {
        intakeContextHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          success: true,
          context: {},
        });
      });

      expect(onContextReady).toHaveBeenCalledTimes(1);
    });
  });

  describe('Reset functionality', () => {
    it('reset clears upload state', async () => {
      const adapter = createMockAdapter(true);

      // Mock successful upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uploadId: 'upload-123' }),
      });

      const { result } = renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
        })
      );

      // Start upload to set uploadId
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      await act(async () => {
        await result.current.uploadFile(file);
      });

      // Simulate progress event
      act(() => {
        uploadProgressHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          progress: 50,
          stage: 'parsing',
          message: 'Processing...',
        });
      });

      expect(result.current.uploadProgress.stage).toBe('parsing');
      expect(result.current.uploadProgress.progress).toBe(50);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.uploadProgress.stage).toBe('idle');
      expect(result.current.uploadProgress.progress).toBe(0);
      expect(result.current.selectedFilename).toBeNull();
    });
  });

  /**
   * Epic 16.6.1: Race condition protection tests
   *
   * The "never adopt" pattern ensures WS events are only processed for
   * the uploadId returned by the most recent HTTP response.
   */
  describe('Race condition protection (Epic 16.6.1)', () => {
    it('ignores upload_progress events when no uploadId is set', () => {
      const adapter = createMockAdapter(true);

      const { result } = renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
        })
      );

      // uploadId is null (no upload started or HTTP hasn't returned)
      // Trigger upload_progress event - should be ignored
      act(() => {
        uploadProgressHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          progress: 50,
          stage: 'parsing',
          message: 'Processing...',
        });
      });

      // State should remain idle (event ignored due to null uploadId)
      expect(result.current.uploadProgress.stage).toBe('idle');
      expect(result.current.uploadProgress.progress).toBe(0);
    });

    it('ignores intake_context_ready events when no uploadId is set', () => {
      const adapter = createMockAdapter(true);
      const onContextReady = jest.fn();

      renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
          onContextReady,
        })
      );

      // Trigger intake_context_ready event with no uploadId set
      act(() => {
        intakeContextHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          success: true,
          context: { vendorName: 'Test Vendor' },
        });
      });

      // Callback should NOT be called - event ignored
      expect(onContextReady).not.toHaveBeenCalled();
    });

    it('ignores upload_progress events after cancel', async () => {
      const adapter = createMockAdapter(true);

      // Mock successful upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uploadId: 'upload-123' }),
      });

      const { result } = renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
        })
      );

      // Start upload to set uploadId
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      await act(async () => {
        await result.current.uploadFile(file);
      });

      // Cancel (clears uploadId)
      act(() => {
        result.current.reset();
      });

      expect(result.current.uploadProgress.stage).toBe('idle');

      // Late WS event arrives for old uploadId - should be ignored
      act(() => {
        uploadProgressHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          progress: 80,
          stage: 'parsing',
          message: 'Still processing...',
        });
      });

      // State should remain idle (event ignored)
      expect(result.current.uploadProgress.stage).toBe('idle');
    });

    it('ignores intake_context_ready events after cancel', async () => {
      const adapter = createMockAdapter(true);
      const onContextReady = jest.fn();

      // Mock successful upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uploadId: 'upload-123' }),
      });

      const { result } = renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
          onContextReady,
        })
      );

      // Start upload to set uploadId
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      await act(async () => {
        await result.current.uploadFile(file);
      });

      // Cancel (clears uploadId)
      act(() => {
        result.current.reset();
      });

      // Late intake_context_ready arrives - should NOT resurrect chip
      act(() => {
        intakeContextHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          success: true,
          context: { vendorName: 'Test Vendor' },
        });
      });

      // Callback should NOT be called
      expect(onContextReady).not.toHaveBeenCalled();
      // State should remain idle
      expect(result.current.uploadProgress.stage).toBe('idle');
    });

    it('ignores WS events from previous upload during new upload', async () => {
      const adapter = createMockAdapter(true);

      // Mock two uploads
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ uploadId: 'upload-A' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ uploadId: 'upload-B' }),
        });

      const { result } = renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
        })
      );

      // Complete upload A
      const fileA = new File(['a'], 'a.pdf', { type: 'application/pdf' });
      await act(async () => {
        await result.current.uploadFile(fileA);
      });

      // Start upload B (HTTP in flight, then completes)
      const fileB = new File(['b'], 'b.pdf', { type: 'application/pdf' });
      await act(async () => {
        await result.current.uploadFile(fileB);
      });

      // Late event from upload A arrives - should be ignored
      act(() => {
        uploadProgressHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-A', // Old uploadId
          progress: 100,
          stage: 'complete',
          message: 'Done',
        });
      });

      // Should still be in upload B's storing state (not complete from A)
      expect(result.current.uploadProgress.stage).toBe('storing');
      expect(result.current.uploadProgress.uploadId).toBe('upload-B');
    });

    it('ignores *_ready events from previous upload during new upload', async () => {
      const adapter = createMockAdapter(true);
      const onContextReady = jest.fn();

      // Mock two uploads
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ uploadId: 'upload-A' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ uploadId: 'upload-B' }),
        });

      const { result } = renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
          onContextReady,
        })
      );

      // Complete upload A
      const fileA = new File(['a'], 'a.pdf', { type: 'application/pdf' });
      await act(async () => {
        await result.current.uploadFile(fileA);
      });

      // Start upload B
      const fileB = new File(['b'], 'b.pdf', { type: 'application/pdf' });
      await act(async () => {
        await result.current.uploadFile(fileB);
      });

      // Late intake_context_ready from upload A - should NOT hijack B
      act(() => {
        intakeContextHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-A', // Old uploadId
          success: true,
          context: { vendorName: 'Vendor from A' },
        });
      });

      // Callback should NOT be called (wrong uploadId)
      expect(onContextReady).not.toHaveBeenCalled();
      // Upload B should still be in progress
      expect(result.current.uploadProgress.stage).toBe('storing');
    });

    it('aborts HTTP request on cancel', async () => {
      const adapter = createMockAdapter(true);

      // Mock a slow upload that we'll abort
      let fetchAborted = false;
      mockFetch.mockImplementationOnce((_url: string, options: RequestInit) => {
        return new Promise((resolve, reject) => {
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              fetchAborted = true;
              const error = new Error('Aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
          // Never resolves naturally - will be aborted
        });
      });

      const { result } = renderHook(() =>
        useFileUpload({
          conversationId: 'conv-123',
          mode: 'intake',
          wsAdapter: adapter,
        })
      );

      // Start upload
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.uploadFile(file);
      });

      // Upload should be in progress
      expect(result.current.uploadProgress.stage).toBe('uploading');

      // Cancel immediately
      act(() => {
        result.current.reset();
      });

      // Wait for abort to be processed
      await waitFor(() => {
        expect(fetchAborted).toBe(true);
      });

      // Should be idle, NOT error state
      expect(result.current.uploadProgress.stage).toBe('idle');
    });
  });
});
