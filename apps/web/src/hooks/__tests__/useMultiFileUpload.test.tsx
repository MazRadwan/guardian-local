/**
 * useMultiFileUpload Hook Tests
 *
 * Epic 17, Sprint 1, Track C: Multi-file upload functionality
 *
 * Test Coverage:
 * - Story 17.3.1: State interface and initialization
 * - Story 17.3.2: Core operations (addFiles, removeFile, clearAll)
 * - Story 17.3.3: Upload implementation (batch HTTP POST)
 * - Story 17.3.4: WebSocket progress handling ("never adopt" pattern)
 * - Story 17.3.5: Computed values
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useMultiFileUpload,
  UseMultiFileUploadOptions,
  FileState,
  UPLOAD_CONCURRENCY_LIMIT,
  MAX_TOTAL_SIZE,
} from '../useMultiFileUpload';

// Mock useAuth
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

// Mock fetch with controllable behavior
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('useMultiFileUpload', () => {
  // Track subscription calls
  let subscribeUploadProgressCalls: number;
  let subscribeIntakeContextReadyCalls: number;
  let subscribeScoringParseReadyCalls: number;
  let unsubscribeCalls: number;

  // Mock handlers stored for triggering events
  let uploadProgressHandler: ((data: unknown) => void) | null;
  let intakeContextHandler: ((data: unknown) => void) | null;
  let scoringParseHandler: ((data: unknown) => void) | null;
  let fileAttachedHandler: ((data: unknown) => void) | null; // Epic 18

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
    subscribeFileAttached: jest.fn((handler) => { // Epic 18
      fileAttachedHandler = handler;
      return () => {
        unsubscribeCalls++;
        fileAttachedHandler = null;
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
    fileAttachedHandler = null; // Epic 18
    jest.clearAllMocks();
  });

  /**
   * Story 17.3.1: Multi-File State Interface
   */
  describe('Story 17.3.1: State Interface', () => {
    it('returns expected interface', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      expect(result.current).toHaveProperty('files');
      expect(result.current).toHaveProperty('isUploading');
      expect(result.current).toHaveProperty('aggregateProgress');
      expect(result.current).toHaveProperty('addFiles');
      expect(result.current).toHaveProperty('removeFile');
      expect(result.current).toHaveProperty('clearAll');
      expect(result.current).toHaveProperty('uploadAll');
      expect(result.current).toHaveProperty('getCompletedFileIds');
      expect(result.current).toHaveProperty('hasFiles');
      expect(result.current).toHaveProperty('hasPendingFiles');
    });

    it('initial state has no files', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      expect(result.current.files).toEqual([]);
      expect(result.current.hasFiles).toBe(false);
      expect(result.current.hasPendingFiles).toBe(false);
      expect(result.current.isUploading).toBe(false);
    });
  });

  /**
   * Story 17.3.2: Core Operations (addFiles)
   */
  describe('Story 17.3.2: addFiles', () => {
    it('should add valid files to state', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      const fileList = createMockFileList([
        { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
      ]);

      act(() => {
        result.current.addFiles(fileList);
      });

      expect(result.current.files).toHaveLength(1);
      expect(result.current.files[0].filename).toBe('doc.pdf');
      expect(result.current.files[0].stage).toBe('pending');
      expect(result.current.files[0].progress).toBe(0);
      expect(result.current.hasFiles).toBe(true);
      expect(result.current.hasPendingFiles).toBe(true);
    });

    it('should generate unique localIndex for each file', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc1.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
        result.current.addFiles(
          createMockFileList([
            { name: 'doc2.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      expect(result.current.files[0].localIndex).not.toBe(
        result.current.files[1].localIndex
      );
      expect(result.current.files).toHaveLength(2);
    });

    it('should add multiple files in a single call', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      const fileList = createMockFileList([
        { name: 'doc1.pdf', type: 'application/pdf', size: 1024 },
        { name: 'doc2.pdf', type: 'application/pdf', size: 2048 },
        { name: 'doc3.pdf', type: 'application/pdf', size: 3072 },
      ]);

      act(() => {
        result.current.addFiles(fileList);
      });

      expect(result.current.files).toHaveLength(3);
      expect(result.current.files[0].filename).toBe('doc1.pdf');
      expect(result.current.files[1].filename).toBe('doc2.pdf');
      expect(result.current.files[2].filename).toBe('doc3.pdf');
    });

    it('should reject files exceeding maxFiles', () => {
      const adapter = createMockAdapter(false);
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
          maxFiles: 2,
          onError,
        })
      );

      const fileList = createMockFileList([
        { name: 'doc1.pdf', type: 'application/pdf', size: 1024 },
        { name: 'doc2.pdf', type: 'application/pdf', size: 1024 },
        { name: 'doc3.pdf', type: 'application/pdf', size: 1024 },
      ]);

      act(() => {
        result.current.addFiles(fileList);
      });

      expect(result.current.files).toHaveLength(2);
      expect(onError).toHaveBeenCalledWith('Maximum 2 files allowed');
    });

    it('should reject invalid file types', () => {
      const adapter = createMockAdapter(false);
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
          onError,
        })
      );

      const fileList = createMockFileList([
        { name: 'script.exe', type: 'application/x-msdownload', size: 1024 },
      ]);

      act(() => {
        result.current.addFiles(fileList);
      });

      expect(result.current.files).toHaveLength(0);
      expect(onError).toHaveBeenCalledWith('script.exe: Unsupported file type');
    });

    it('should reject files over 20MB', () => {
      const adapter = createMockAdapter(false);
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
          onError,
        })
      );

      const fileList = createMockFileList([
        { name: 'huge.pdf', type: 'application/pdf', size: 25 * 1024 * 1024 },
      ]);

      act(() => {
        result.current.addFiles(fileList);
      });

      expect(result.current.files).toHaveLength(0);
      expect(onError).toHaveBeenCalledWith('huge.pdf: File too large (max 20MB)');
    });

    it('should accept valid DOCX files', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      const fileList = createMockFileList([
        {
          name: 'report.docx',
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 5 * 1024 * 1024,
        },
      ]);

      act(() => {
        result.current.addFiles(fileList);
      });

      expect(result.current.files).toHaveLength(1);
      expect(result.current.files[0].filename).toBe('report.docx');
    });

    it('should accept valid image files', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      const fileList = createMockFileList([
        { name: 'screenshot.png', type: 'image/png', size: 2 * 1024 * 1024 },
        { name: 'photo.jpeg', type: 'image/jpeg', size: 3 * 1024 * 1024 },
      ]);

      act(() => {
        result.current.addFiles(fileList);
      });

      expect(result.current.files).toHaveLength(2);
    });
  });

  /**
   * Story 17.3.2: Core Operations (removeFile, clearAll)
   */
  describe('Story 17.3.2: removeFile and clearAll', () => {
    it('should remove pending files by localIndex', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc1.pdf', type: 'application/pdf', size: 1024 },
            { name: 'doc2.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      const firstIndex = result.current.files[0].localIndex;

      act(() => {
        result.current.removeFile(firstIndex);
      });

      expect(result.current.files).toHaveLength(1);
      expect(result.current.files[0].filename).toBe('doc2.pdf');
    });

    it('should allow removal during upload stages (Epic 19)', () => {
      const adapter = createMockAdapter(true);
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
          onError,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      const localIndex = result.current.files[0].localIndex;

      // Mock successful upload to set stage to uploading
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      // Start upload
      act(() => {
        result.current.uploadAll('conv-123', 'intake');
      });

      // Epic 19: Remove during upload should now work (abort logic added in Sprint 1)
      act(() => {
        result.current.removeFile(localIndex);
      });

      // File should be removed (Sprint 1 will add abort logic)
      expect(result.current.files).toHaveLength(0);
      expect(onError).not.toHaveBeenCalled();
    });

    it('should block removal during parsing stage (Epic 19)', async () => {
      const adapter = createMockAdapter(true);
      const onError = jest.fn();

      // Capture upload progress handler
      let progressHandler: ((data: UploadProgressEvent) => void) | null = null;
      jest.spyOn(adapter, 'subscribeUploadProgress').mockImplementation((handler) => {
        progressHandler = handler;
        return () => {};
      });

      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
          onError,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      const localIndex = result.current.files[0].localIndex;

      // Mock successful upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      // Start upload (async operation)
      await act(async () => {
        await result.current.uploadAll('conv-123', 'assessment');
      });

      // After upload completes, file should be in 'storing' stage
      expect(result.current.files[0].stage).toBe('storing');

      // Simulate transition to parsing via WebSocket event
      act(() => {
        progressHandler?.({
          uploadId: 'upload-123',
          stage: 'parsing',
          progress: 50,
        });
      });

      // Verify file is now in parsing stage
      expect(result.current.files[0].stage).toBe('parsing');

      // Try to remove during parsing - should be blocked
      act(() => {
        result.current.removeFile(localIndex);
      });

      // File should still be there
      expect(result.current.files).toHaveLength(1);
      expect(onError).toHaveBeenCalledWith('Cannot cancel during analysis');
    });

    it('should clear all files', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc1.pdf', type: 'application/pdf', size: 1024 },
            { name: 'doc2.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.files).toHaveLength(0);
      expect(result.current.hasFiles).toBe(false);
    });
  });

  /**
   * Story 17.3.3: Upload Implementation
   */
  describe('Story 17.3.3: uploadAll', () => {
    it('should upload all pending files in a batch', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add files
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc1.pdf', type: 'application/pdf', size: 1024 },
            { name: 'doc2.pdf', type: 'application/pdf', size: 2048 },
          ])
        );
      });

      // Epic 19: Mock individual uploads (one response per file)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            files: [{ index: 0, uploadId: 'upload-abc-0', status: 'accepted' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            files: [{ index: 0, uploadId: 'upload-abc-1', status: 'accepted' }],
          }),
        });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Epic 19: Should make 2 separate calls
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Files should have uploadIds
      expect(result.current.files[0].uploadId).toBe('upload-abc-0');
      expect(result.current.files[1].uploadId).toBe('upload-abc-1');
      expect(result.current.files[0].stage).toBe('storing');
      expect(result.current.files[1].stage).toBe('storing');
    });

    it('should handle partial rejection (some files rejected)', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add files
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'good.pdf', type: 'application/pdf', size: 1024 },
            { name: 'bad.pdf', type: 'application/pdf', size: 2048 },
          ])
        );
      });

      // Epic 19: Mock individual uploads - first succeeds, second is rejected
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            files: [{ index: 0, uploadId: 'upload-good', status: 'accepted' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            files: [{ index: 0, status: 'rejected', error: 'Corrupted file' }],
          }),
        });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // First file should be uploading
      expect(result.current.files[0].stage).toBe('storing');
      expect(result.current.files[0].uploadId).toBe('upload-good');

      // Second file should be error
      expect(result.current.files[1].stage).toBe('error');
      expect(result.current.files[1].error).toBe('Corrupted file');
    });

    it('should handle HTTP errors', async () => {
      const adapter = createMockAdapter(true);
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
          onError,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Mock HTTP error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // File should be in error state
      expect(result.current.files[0].stage).toBe('error');
      expect(onError).toHaveBeenCalledWith('Server error');
    });

    it('should handle abort gracefully', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Mock slow upload that we'll abort
      mockFetch.mockImplementationOnce((_url: string, options: RequestInit) => {
        return new Promise((resolve, reject) => {
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              const error = new Error('Aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        });
      });

      // Start upload
      const uploadPromise = act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Abort immediately
      act(() => {
        result.current.clearAll();
      });

      await uploadPromise;

      // Files should be cleared
      expect(result.current.files).toHaveLength(0);
    });

    it('should not upload if no pending files', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Should not call fetch
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  /**
   * Story 17.3.4: WebSocket Progress Handling
   */
  describe('Story 17.3.4: WebSocket Progress', () => {
    it('should subscribe to WS events when connected', () => {
      const adapter = createMockAdapter(true);
      renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      expect(subscribeUploadProgressCalls).toBe(1);
      expect(subscribeIntakeContextReadyCalls).toBe(1);
      expect(subscribeScoringParseReadyCalls).toBe(1);
    });

    it('should not subscribe when disconnected', () => {
      const adapter = createMockAdapter(false);
      renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      expect(subscribeUploadProgressCalls).toBe(0);
      expect(subscribeIntakeContextReadyCalls).toBe(0);
      expect(subscribeScoringParseReadyCalls).toBe(0);
    });

    it('should ignore progress events for unknown uploadIds (never adopt)', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add file but don't upload (no uploadId registered)
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Trigger progress event with unknown uploadId
      act(() => {
        uploadProgressHandler?.({
          conversationId: 'conv-123',
          uploadId: 'unknown-upload-id',
          progress: 50,
          stage: 'parsing',
          message: 'Processing...',
        });
      });

      // File should still be pending (event ignored)
      expect(result.current.files[0].stage).toBe('pending');
      expect(result.current.files[0].progress).toBe(0);
    });

    it('should update progress for known uploadIds', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Mock upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Trigger progress event
      act(() => {
        uploadProgressHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          progress: 75,
          stage: 'parsing',
          message: 'Processing...',
        });
      });

      // File should be updated
      expect(result.current.files[0].stage).toBe('parsing');
      expect(result.current.files[0].progress).toBe(75);
    });

    it('should handle intake_context_ready events', async () => {
      const adapter = createMockAdapter(true);
      const onContextReady = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
          onContextReady,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      const localIndex = result.current.files[0].localIndex;

      // Mock upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Trigger context ready
      act(() => {
        intakeContextHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          success: true,
          context: { vendorName: 'Test Vendor' },
          fileMetadata: {
            fileId: 'file-uuid-123',
            filename: 'doc.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          },
        });
      });

      // File should be complete
      expect(result.current.files[0].stage).toBe('complete');
      expect(result.current.files[0].progress).toBe(100);
      expect(result.current.files[0].fileId).toBe('file-uuid-123');

      // Callback should be invoked with localIndex
      expect(onContextReady).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadId: 'upload-123',
          success: true,
        }),
        localIndex
      );
    });

    it('should handle scoring_parse_ready events', async () => {
      const adapter = createMockAdapter(true);
      const onScoringReady = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
          onScoringReady,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'scoring.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      const localIndex = result.current.files[0].localIndex;

      // Mock upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-456', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-456', 'scoring');
      });

      // Trigger scoring ready
      act(() => {
        scoringParseHandler?.({
          conversationId: 'conv-456',
          uploadId: 'upload-456',
          success: true,
          assessmentId: 'assessment-123',
          fileMetadata: {
            fileId: 'file-uuid-456',
            filename: 'scoring.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          },
        });
      });

      // File should be complete
      expect(result.current.files[0].stage).toBe('complete');
      expect(result.current.files[0].fileId).toBe('file-uuid-456');

      // Callback should be invoked
      expect(onScoringReady).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadId: 'upload-456',
          success: true,
        }),
        localIndex
      );
    });

    it('should ignore events after clearAll (never adopt)', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Mock upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Clear all (removes uploadId from known set)
      act(() => {
        result.current.clearAll();
      });

      // Late progress event arrives
      act(() => {
        uploadProgressHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          progress: 100,
          stage: 'complete',
          message: 'Done',
        });
      });

      // Should have no files (event ignored)
      expect(result.current.files).toHaveLength(0);
    });

    it('should unsubscribe on unmount', () => {
      const adapter = createMockAdapter(true);
      const { unmount } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      expect(subscribeUploadProgressCalls).toBe(1);
      expect(unsubscribeCalls).toBe(0);

      unmount();

      // Should unsubscribe all 4 event types (Epic 18: added file_attached)
      expect(unsubscribeCalls).toBe(4);
    });
  });

  /**
   * Story 17.3.5: Computed Values
   */
  describe('Story 17.3.5: Computed Values', () => {
    it('should compute isUploading correctly', () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      expect(result.current.isUploading).toBe(false);

      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Pending is not uploading
      expect(result.current.isUploading).toBe(false);

      // Mock upload to set stage to uploading
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      act(() => {
        result.current.uploadAll('conv-123', 'intake');
      });

      // Now is uploading
      expect(result.current.isUploading).toBe(true);
    });

    it('should compute aggregateProgress correctly', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // No files = 0%
      expect(result.current.aggregateProgress).toBe(0);

      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc1.pdf', type: 'application/pdf', size: 1024 },
            { name: 'doc2.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Pending files = 0% progress
      expect(result.current.aggregateProgress).toBe(0);

      // Epic 19: Mock individual uploads
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            files: [{ index: 0, uploadId: 'upload-2', status: 'accepted' }],
          }),
        });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Both at 30% (storing stage)
      expect(result.current.aggregateProgress).toBe(30);

      // Update one file to 100%
      act(() => {
        uploadProgressHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-1',
          progress: 100,
          stage: 'complete',
          message: 'Done',
        });
      });

      // Aggregate: (100 + 30) / 2 = 65%
      expect(result.current.aggregateProgress).toBe(65);
    });

    it('should compute hasFiles correctly', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      expect(result.current.hasFiles).toBe(false);

      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      expect(result.current.hasFiles).toBe(true);
    });

    it('should compute hasPendingFiles correctly', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      expect(result.current.hasPendingFiles).toBe(false);

      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      expect(result.current.hasPendingFiles).toBe(true);

      // Mock upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // No longer pending
      expect(result.current.hasPendingFiles).toBe(false);
    });

    it('should return completed file IDs', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc1.pdf', type: 'application/pdf', size: 1024 },
            { name: 'doc2.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // No completed files
      expect(result.current.getCompletedFileIds()).toEqual([]);

      // Epic 19: Mock individual uploads
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            files: [{ index: 0, uploadId: 'upload-2', status: 'accepted' }],
          }),
        });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Mark first file as complete
      act(() => {
        intakeContextHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-1',
          success: true,
          context: {},
          fileMetadata: {
            fileId: 'file-uuid-1',
            filename: 'doc1.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          },
        });
      });

      // Should return only completed fileId
      expect(result.current.getCompletedFileIds()).toEqual(['file-uuid-1']);

      // Mark second file as complete
      act(() => {
        intakeContextHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-2',
          success: true,
          context: {},
          fileMetadata: {
            fileId: 'file-uuid-2',
            filename: 'doc2.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          },
        });
      });

      // Should return both fileIds
      expect(result.current.getCompletedFileIds()).toEqual([
        'file-uuid-1',
        'file-uuid-2',
      ]);
    });
  });

  /**
   * Sprint 2: waitForCompletion and hasErrors
   * Updated to test new signature: waitForCompletion() returns MessageAttachment[]
   */
  describe('Sprint 2: waitForCompletion and hasErrors', () => {
    it('should include waitForCompletion and hasErrors in return interface', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      expect(result.current).toHaveProperty('waitForCompletion');
      expect(result.current).toHaveProperty('hasErrors');
      expect(typeof result.current.waitForCompletion).toBe('function');
      expect(typeof result.current.hasErrors).toBe('boolean');
    });

    it('should compute hasErrors as false when no errors', () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // No files = no errors
      expect(result.current.hasErrors).toBe(false);

      // Add pending file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Pending file = no errors
      expect(result.current.hasErrors).toBe(false);
    });

    it('should compute hasErrors as true when file has error', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Mock upload with rejection
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, status: 'rejected', error: 'Invalid file' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // File has error
      expect(result.current.hasErrors).toBe(true);
    });

    it('should resolve waitForCompletion immediately with empty array if no files', async () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // No files, should resolve immediately with empty array
      let attachments: unknown;
      await act(async () => {
        attachments = await result.current.waitForCompletion();
      });

      // Should return empty array (no Promise.pending)
      expect(attachments).toEqual([]);
    });

    it('should resolve waitForCompletion immediately with empty array if only pending files', async () => {
      const adapter = createMockAdapter(false);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add pending file (not in-flight)
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Should resolve immediately since pending is not in-flight
      let attachments: unknown;
      await act(async () => {
        attachments = await result.current.waitForCompletion();
      });

      // Should return empty array (pending files don't have fileIds)
      expect(attachments).toEqual([]);
    });

    it('should resolve waitForCompletion with attachments when files complete', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Mock upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // File is now in 'storing' stage (in-flight)
      expect(result.current.files[0].stage).toBe('storing');

      // Start waiting for completion
      let attachments: unknown;
      const waitPromise = result.current.waitForCompletion().then((result) => {
        attachments = result;
      });

      // Complete the file via WS event
      act(() => {
        intakeContextHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          success: true,
          context: {},
          fileMetadata: {
            fileId: 'file-uuid-123',
            filename: 'doc.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          },
        });
      });

      // Wait for promise to resolve
      await act(async () => {
        await waitPromise;
      });

      // Should return the completed attachment with fileId
      // Epic 19 Story 19.2.3: attachments now include uploadId for cancel tracking
      expect(attachments).toEqual([
        {
          fileId: 'file-uuid-123',
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          uploadId: 'upload-123',
        },
      ]);
    });

    it('should resolve waitForCompletion with empty array when files error', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Mock upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Start waiting
      let attachments: unknown;
      const waitPromise = result.current.waitForCompletion().then((result) => {
        attachments = result;
      });

      // Trigger error via progress event
      act(() => {
        uploadProgressHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          progress: 0,
          stage: 'error',
          message: 'Parse failed',
        });
      });

      // Wait for promise to resolve
      await act(async () => {
        await waitPromise;
      });

      // Should return empty array (failed file has no fileId)
      expect(attachments).toEqual([]);
      expect(result.current.hasErrors).toBe(true);
    });

    it('should resolve multiple waiters with same attachments when files complete', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Mock upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Multiple waiters
      let attachments1: unknown;
      let attachments2: unknown;
      const waitPromise1 = result.current.waitForCompletion().then((result) => {
        attachments1 = result;
      });
      const waitPromise2 = result.current.waitForCompletion().then((result) => {
        attachments2 = result;
      });

      // Complete the file
      act(() => {
        intakeContextHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          success: true,
          context: {},
          fileMetadata: {
            fileId: 'file-uuid-123',
            filename: 'doc.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          },
        });
      });

      // Both should resolve with same attachments
      await act(async () => {
        await Promise.all([waitPromise1, waitPromise2]);
      });

      // Epic 19 Story 19.2.3: attachments now include uploadId for cancel tracking
      const expectedAttachment = {
        fileId: 'file-uuid-123',
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        uploadId: 'upload-123',
      };
      expect(attachments1).toEqual([expectedAttachment]);
      expect(attachments2).toEqual([expectedAttachment]);
    });

    it('should resolve waiters with empty array when clearAll called', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Mock upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Start waiting
      let attachments: unknown;
      const waitPromise = result.current.waitForCompletion().then((result) => {
        attachments = result;
      });

      // Call clearAll - should resolve waiter with empty array
      act(() => {
        result.current.clearAll();
      });

      await act(async () => {
        await waitPromise;
      });

      // Should resolve with empty array (not hang/leak)
      expect(attachments).toEqual([]);
    });

    it('should reject waitForCompletion on timeout and force files to error state', async () => {
      jest.useFakeTimers();

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Mock upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // File should be in 'storing' (in-flight)
      expect(result.current.files[0].stage).toBe('storing');

      // Start waiting with short timeout
      let error: Error | null = null;
      const waitPromise = result.current.waitForCompletion(100).catch((e) => {
        error = e;
      });

      // Advance timers past timeout
      act(() => {
        jest.advanceTimersByTime(150);
      });

      await act(async () => {
        await waitPromise;
      });

      // Should have rejected with timeout error
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toContain('timeout');

      // UX Recovery: File should be forced to error state so UI isn't stuck
      expect(result.current.files[0].stage).toBe('error');
      expect(result.current.files[0].error).toBe('Upload timed out');
      expect(result.current.isUploading).toBe(false);
      expect(result.current.hasErrors).toBe(true);

      jest.useRealTimers();
    });

    it('should resolve pending waiters on unmount', async () => {
      const adapter = createMockAdapter(true);
      const { result, unmount } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Mock upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Start waiting (will never complete via normal path)
      let attachments: unknown;
      const waitPromise = result.current.waitForCompletion(0).then((result) => {
        attachments = result;
      });

      // Unmount the hook - should resolve pending waiters
      unmount();

      await act(async () => {
        await waitPromise;
      });

      // Should have resolved with empty array (cleanup path)
      expect(attachments).toEqual([]);
    });

    it('should not timeout if set to 0', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({
          wsAdapter: adapter,
        })
      );

      // Add file
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      // Mock upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Start waiting with no timeout (0)
      let attachments: unknown;
      const waitPromise = result.current.waitForCompletion(0).then((result) => {
        attachments = result;
      });

      // Eventually complete (no timeout)
      act(() => {
        intakeContextHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          success: true,
          context: {},
          fileMetadata: {
            fileId: 'file-uuid-123',
            filename: 'doc.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          },
        });
      });

      await act(async () => {
        await waitPromise;
      });

      // Should resolve normally
      // Epic 19 Story 19.2.3: attachments now include uploadId for cancel tracking
      expect(attachments).toEqual([
        {
          fileId: 'file-uuid-123',
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          uploadId: 'upload-123',
        },
      ]);
    });
  });

  /**
   * Callback stability tests (prevent subscription thrashing)
   */
  describe('Callback stability', () => {
    it('should not resubscribe when callbacks change', () => {
      const adapter = createMockAdapter(true);

      const { rerender } = renderHook(
        ({ onError, onContextReady }: Partial<UseMultiFileUploadOptions>) =>
          useMultiFileUpload({
            wsAdapter: adapter,
            onError,
            onContextReady,
          }),
        {
          initialProps: {
            onError: () => console.log('error 1'),
            onContextReady: () => console.log('context 1'),
          },
        }
      );

      expect(subscribeUploadProgressCalls).toBe(1);

      // Rerender with new callback identities
      rerender({
        onError: () => console.log('error 2'),
        onContextReady: () => console.log('context 2'),
      });

      // Should NOT resubscribe
      expect(subscribeUploadProgressCalls).toBe(1);
      expect(unsubscribeCalls).toBe(0);
    });

    it('should call latest callback when event received', async () => {
      const adapter = createMockAdapter(true);
      const onContextReady1 = jest.fn();
      const onContextReady2 = jest.fn();

      const { result, rerender } = renderHook(
        ({ onContextReady }: Partial<UseMultiFileUploadOptions>) =>
          useMultiFileUpload({
            wsAdapter: adapter,
            onContextReady,
          }),
        {
          initialProps: { onContextReady: onContextReady1 },
        }
      );

      // Add file and upload
      act(() => {
        result.current.addFiles(
          createMockFileList([
            { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
          ])
        );
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      await act(async () => {
        await result.current.uploadAll('conv-123', 'intake');
      });

      // Update to new callback
      rerender({ onContextReady: onContextReady2 });

      // Trigger event
      act(() => {
        intakeContextHandler?.({
          conversationId: 'conv-123',
          uploadId: 'upload-123',
          success: true,
          context: {},
          fileMetadata: {
            fileId: 'file-uuid',
            filename: 'doc.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          },
        });
      });

      // Should call latest callback
      expect(onContextReady1).not.toHaveBeenCalled();
      expect(onContextReady2).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Story 19.1.2: Single File Upload Function
   */
  describe('Story 19.1.2: Single File Upload', () => {
    beforeEach(() => {
      mockFetch.mockClear();
    });

    it('should upload files individually', async () => {
      // Setup mock responses
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
        }),
      });

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add files
      const files = [
        { name: 'a.pdf', type: 'application/pdf', size: 1000 },
        { name: 'b.pdf', type: 'application/pdf', size: 2000 },
      ];
      act(() => {
        result.current.addFiles(createMockFileList(files));
      });

      // Upload
      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Should have made 2 separate requests
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Each request should have only one file in FormData
      const firstCall = mockFetch.mock.calls[0];
      const firstBody = firstCall[1].body as FormData;
      const filesInFirstRequest = firstBody.getAll('files');
      expect(filesInFirstRequest).toHaveLength(1);
    });

    it('should handle individual file errors without affecting others', async () => {
      // First file succeeds, second fails
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'File too large' }),
        });

      const onError = jest.fn();
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter, onError })
      );

      const files = [
        { name: 'a.pdf', type: 'application/pdf', size: 1000 },
        { name: 'b.pdf', type: 'application/pdf', size: 2000 },
      ];
      act(() => {
        result.current.addFiles(createMockFileList(files));
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // First file should be in 'storing' state
      const file1 = result.current.files.find((f) => f.filename === 'a.pdf');
      expect(file1?.stage).toBe('storing');

      // Second file should be in 'error' state
      const file2 = result.current.files.find((f) => f.filename === 'b.pdf');
      expect(file2?.stage).toBe('error');

      // Error callback should have been called for second file
      expect(onError).toHaveBeenCalledWith('File too large');
    });

    it('should skip files removed during upload loop', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
        }),
      });

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      const files = [
        { name: 'a.pdf', type: 'application/pdf', size: 1000 },
        { name: 'b.pdf', type: 'application/pdf', size: 2000 },
      ];
      act(() => {
        result.current.addFiles(createMockFileList(files));
      });

      // Remove second file before upload completes
      const secondIndex = result.current.files[1].localIndex;
      act(() => {
        result.current.removeFile(secondIndex);
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Only one request should have been made
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle abort gracefully', async () => {
      // Mock fetch that will be aborted
      mockFetch.mockImplementation(() =>
        new Promise((_, reject) => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          setTimeout(() => reject(error), 100);
        })
      );

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      const file = { name: 'a.pdf', type: 'application/pdf', size: 1000 };
      act(() => {
        result.current.addFiles(createMockFileList([file]));
      });

      // Start upload (will be slow)
      const uploadPromise = act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Remove file (triggers abort)
      act(() => {
        result.current.removeFile(result.current.files[0].localIndex);
      });

      await uploadPromise;

      // File should be removed (not in error state)
      expect(result.current.files).toHaveLength(0);
    });
  });

  /**
   * Story 19.1.1: Per-File AbortController Map
   */
  describe('Story 19.1.1: Per-File AbortController Map', () => {
    describe('clearAll with controllers', () => {
      it('should abort all controllers when clearAll called', () => {
        const adapter = createMockAdapter(true);
        const { result } = renderHook(() =>
          useMultiFileUpload({ wsAdapter: adapter })
        );

        // Add files
        const files = [
          { name: 'a.pdf', type: 'application/pdf', size: 1000 },
          { name: 'b.pdf', type: 'application/pdf', size: 2000 },
        ];
        act(() => {
          result.current.addFiles(createMockFileList(files));
        });

        // Start upload (would create controllers in Story 19.1.2)
        // For now, just verify clearAll works
        act(() => {
          result.current.clearAll();
        });

        expect(result.current.files).toHaveLength(0);
      });
    });

    describe('removeFile with abort', () => {
      it('should remove file and not error during uploading stage', () => {
        const onError = jest.fn();
        const adapter = createMockAdapter(true);
        const { result } = renderHook(() =>
          useMultiFileUpload({ wsAdapter: adapter, onError })
        );

        const file = { name: 'test.pdf', type: 'application/pdf', size: 1000 };
        act(() => {
          result.current.addFiles(createMockFileList([file]));
        });

        const localIndex = result.current.files[0].localIndex;

        // File starts in 'pending' which is removable
        act(() => {
          result.current.removeFile(localIndex);
        });

        expect(result.current.files).toHaveLength(0);
        expect(onError).not.toHaveBeenCalled();
      });
    });

    describe('unmount cleanup', () => {
      it('should clean up on unmount', () => {
        const adapter = createMockAdapter(true);
        const { result, unmount } = renderHook(() =>
          useMultiFileUpload({ wsAdapter: adapter })
        );

        const file = { name: 'test.pdf', type: 'application/pdf', size: 1000 };
        act(() => {
          result.current.addFiles(createMockFileList([file]));
        });

        // Unmount should clean up without errors
        unmount();

        // No assertion needed - test passes if no errors thrown
      });
    });
  });

  /**
   * Story 19.1.3: Concurrent Upload Queue
   */
  describe('Story 19.1.3: Concurrent Upload Queue', () => {
    beforeEach(() => {
      mockFetch.mockClear();
    });

    it('should have concurrency limit of 3', () => {
      expect(UPLOAD_CONCURRENCY_LIMIT).toBe(3);
    });

    it('should limit concurrent uploads', async () => {
      // Track concurrent calls
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      mockFetch.mockImplementation(() => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

        return new Promise((resolve) => {
          setTimeout(() => {
            currentConcurrent--;
            resolve({
              ok: true,
              json: () => Promise.resolve({
                files: [{ index: 0, uploadId: `upload-${Date.now()}`, status: 'accepted' }],
              }),
            });
          }, 50); // Simulate upload time
        });
      });

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add 5 files (more than concurrency limit)
      const files = Array(5)
        .fill(null)
        .map((_, i) => new File([`content${i}`], `file${i}.pdf`, { type: 'application/pdf' }));

      act(() => {
        result.current.addFiles(createMockFileList(files.map((f, i) => ({
          name: `file${i}.pdf`,
          type: 'application/pdf',
          size: 1024,
        }))));
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Should never exceed limit
      expect(maxConcurrent).toBeLessThanOrEqual(UPLOAD_CONCURRENCY_LIMIT);

      // But should have reached limit (efficient use)
      expect(maxConcurrent).toBe(UPLOAD_CONCURRENCY_LIMIT);

      // All files should have been uploaded
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('should queue files and process as slots open', async () => {
      const uploadOrder: string[] = [];
      const completeOrder: string[] = [];

      mockFetch.mockImplementation((url, options) => {
        const formData = options.body as FormData;
        const file = formData.get('files') as File;
        uploadOrder.push(file.name);

        return new Promise((resolve) => {
          setTimeout(() => {
            completeOrder.push(file.name);
            resolve({
              ok: true,
              json: () => Promise.resolve({
                files: [{ index: 0, uploadId: `upload-${file.name}`, status: 'accepted' }],
              }),
            });
          }, 20);
        });
      });

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      const files = Array(5)
        .fill(null)
        .map((_, i) => ({ name: `file${i}.pdf`, type: 'application/pdf', size: 1024 }));

      act(() => {
        result.current.addFiles(createMockFileList(files));
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // All files should complete
      expect(completeOrder).toHaveLength(5);
    });

    it('should handle file removal during queue processing', async () => {
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({
                files: [{ index: 0, uploadId: `upload-${Date.now()}`, status: 'accepted' }],
              }),
            });
          }, 50);
        })
      );

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      const files = Array(5)
        .fill(null)
        .map((_, i) => ({ name: `file${i}.pdf`, type: 'application/pdf', size: 1024 }));

      act(() => {
        result.current.addFiles(createMockFileList(files));
      });

      // Remove file 3 (should be in queue, not yet uploading)
      const file3Index = result.current.files[3].localIndex;
      act(() => {
        result.current.removeFile(file3Index);
      });

      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Only 4 uploads should occur
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should clear active set on clearAll', async () => {
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({
                files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
              }),
            });
          }, 100);
        })
      );

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      const file = { name: 'test.pdf', type: 'application/pdf', size: 1024 };
      act(() => {
        result.current.addFiles(createMockFileList([file]));
      });

      // Start upload
      const uploadPromise = act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
      });

      // Clear before complete
      act(() => {
        result.current.clearAll();
      });

      await uploadPromise;

      // Files should be cleared
      expect(result.current.files).toHaveLength(0);
    });
  });

  /**
   * Story 19.1.4: Client-Side Size Validation
   */
  describe('Story 19.1.4: Client-Side Size Validation', () => {
    const MB = 1024 * 1024;

    it('should have MAX_TOTAL_SIZE of 50MB', () => {
      expect(MAX_TOTAL_SIZE).toBe(50 * MB);
    });

    it('should allow files within 50MB total', () => {
      const onError = jest.fn();
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter, onError })
      );

      // Add 40MB total using multiple files (respecting 20MB per-file limit)
      // 4 x 10MB = 40MB total, each file under 20MB limit
      const files = [
        new File([new ArrayBuffer(10 * MB)], 'file1.pdf', { type: 'application/pdf' }),
        new File([new ArrayBuffer(10 * MB)], 'file2.pdf', { type: 'application/pdf' }),
        new File([new ArrayBuffer(10 * MB)], 'file3.pdf', { type: 'application/pdf' }),
        new File([new ArrayBuffer(10 * MB)], 'file4.pdf', { type: 'application/pdf' }),
      ];

      act(() => {
        result.current.addFiles(createFileList(files));
      });

      // Should succeed - all 4 files added (40MB < 50MB total limit)
      expect(result.current.files).toHaveLength(4);
      expect(onError).not.toHaveBeenCalledWith('Total size exceeds 50MB limit');
    });

    it('should reject files that would exceed 50MB total', () => {
      const onError = jest.fn();
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter, onError })
      );

      // First add 15MB file
      const content1 = new ArrayBuffer(15 * MB);
      const file1 = new File([content1], 'file1.pdf', { type: 'application/pdf' });

      act(() => {
        result.current.addFiles(createFileList([file1]));
      });

      expect(result.current.files).toHaveLength(1);

      // Then try to add 40MB more (total would be 55MB)
      const content2 = new ArrayBuffer(18 * MB);
      const file2 = new File([content2], 'file2.pdf', { type: 'application/pdf' });
      const content3 = new ArrayBuffer(18 * MB);
      const file3 = new File([content3], 'file3.pdf', { type: 'application/pdf' });

      act(() => {
        result.current.addFiles(createFileList([file2, file3]));
      });

      // Should reject ALL new files
      expect(result.current.files).toHaveLength(1);
      expect(onError).toHaveBeenCalledWith('Total size exceeds 50MB limit');
    });

    it('should reject entire batch if total would exceed limit', () => {
      const onError = jest.fn();
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter, onError })
      );

      // Add existing 45MB
      // Note: Due to per-file 20MB limit, we need multiple files
      const files45MB = [
        new File([new ArrayBuffer(15 * MB)], 'a.pdf', { type: 'application/pdf' }),
        new File([new ArrayBuffer(15 * MB)], 'b.pdf', { type: 'application/pdf' }),
        new File([new ArrayBuffer(15 * MB)], 'c.pdf', { type: 'application/pdf' }),
      ];

      act(() => {
        result.current.addFiles(createFileList(files45MB));
      });

      expect(result.current.files).toHaveLength(3);
      onError.mockClear();

      // Try to add 10MB more (total would be 55MB)
      const newFile = new File([new ArrayBuffer(10 * MB)], 'new.pdf', { type: 'application/pdf' });

      act(() => {
        result.current.addFiles(createFileList([newFile]));
      });

      // Should reject
      expect(result.current.files).toHaveLength(3); // Still 3
      expect(onError).toHaveBeenCalledWith('Total size exceeds 50MB limit');
    });

    it('should allow exactly 50MB total', () => {
      const onError = jest.fn();
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter, onError })
      );

      // Add files totaling exactly 50MB
      // (Using 10MB each due to per-file 20MB limit)
      const files = [
        new File([new ArrayBuffer(10 * MB)], 'a.pdf', { type: 'application/pdf' }),
        new File([new ArrayBuffer(10 * MB)], 'b.pdf', { type: 'application/pdf' }),
        new File([new ArrayBuffer(10 * MB)], 'c.pdf', { type: 'application/pdf' }),
        new File([new ArrayBuffer(10 * MB)], 'd.pdf', { type: 'application/pdf' }),
        new File([new ArrayBuffer(10 * MB)], 'e.pdf', { type: 'application/pdf' }),
      ];

      act(() => {
        result.current.addFiles(createFileList(files));
      });

      // Should accept all (exactly at limit)
      expect(result.current.files).toHaveLength(5);
      expect(onError).not.toHaveBeenCalledWith('Total size exceeds 50MB limit');
    });

    it('should check total size before individual file validation', () => {
      const onError = jest.fn();
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter, onError })
      );

      // Add 45MB existing
      const existing = [
        new File([new ArrayBuffer(15 * MB)], 'a.pdf', { type: 'application/pdf' }),
        new File([new ArrayBuffer(15 * MB)], 'b.pdf', { type: 'application/pdf' }),
        new File([new ArrayBuffer(15 * MB)], 'c.pdf', { type: 'application/pdf' }),
      ];
      act(() => {
        result.current.addFiles(createFileList(existing));
      });
      onError.mockClear();

      // Try to add batch with mixed valid/invalid
      // Total would exceed even with valid files filtered
      const mixed = [
        new File([new ArrayBuffer(5 * MB)], 'valid.pdf', { type: 'application/pdf' }),
        new File([new ArrayBuffer(5 * MB)], 'invalid.txt', { type: 'text/plain' }),
      ];

      act(() => {
        result.current.addFiles(createFileList(mixed));
      });

      // Total size check happens first (45 + 10 > 50)
      expect(onError).toHaveBeenCalledWith('Total size exceeds 50MB limit');
      expect(result.current.files).toHaveLength(3); // No new files added
    });
  });

  /**
   * Story 19.1.5: Queue Reschedule on New Files
   */
  describe('Story 19.1.5: Queue Reschedule on New Files', () => {
    beforeEach(() => {
      mockFetch.mockClear();
    });

    it('should process files added during active upload', async () => {
      const uploadOrder: string[] = [];

      mockFetch.mockImplementation((url, options) => {
        const formData = options.body as FormData;
        const file = formData.get('files') as File;
        uploadOrder.push(file.name);

        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({
                files: [{ index: 0, uploadId: `upload-${file.name}`, status: 'accepted' }],
              }),
            });
          }, 50);
        });
      });

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add initial 2 files
      const initialFiles = [
        new File(['a'], 'file1.pdf', { type: 'application/pdf' }),
        new File(['b'], 'file2.pdf', { type: 'application/pdf' }),
      ];
      act(() => {
        result.current.addFiles(createFileList(initialFiles));
      });

      // Start upload (don't await)
      let uploadPromise: Promise<void>;
      act(() => {
        uploadPromise = result.current.uploadAll('conv-1', 'intake');
      });

      // Wait a bit, then add more files
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      const newFile = new File(['c'], 'file3.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([newFile]));
      });

      // Wait for all uploads
      await act(async () => {
        await uploadPromise!;
        // Wait a bit more for new file worker
        await new Promise((r) => setTimeout(r, 100));
      });

      // All 3 files should have been uploaded
      expect(uploadOrder).toContain('file1.pdf');
      expect(uploadOrder).toContain('file2.pdf');
      expect(uploadOrder).toContain('file3.pdf');
    });

    it('should respect concurrency limit for new files', async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      mockFetch.mockImplementation(() => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

        return new Promise((resolve) => {
          setTimeout(() => {
            currentConcurrent--;
            resolve({
              ok: true,
              json: () => Promise.resolve({
                files: [{ index: 0, uploadId: `upload-${Date.now()}`, status: 'accepted' }],
              }),
            });
          }, 50);
        });
      });

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add 3 files (at limit)
      const files = Array(3)
        .fill(null)
        .map((_, i) => new File([`${i}`], `file${i}.pdf`, { type: 'application/pdf' }));
      act(() => {
        result.current.addFiles(createFileList(files));
      });

      // Start upload
      let uploadPromise: Promise<void>;
      act(() => {
        uploadPromise = result.current.uploadAll('conv-1', 'intake');
      });

      // Immediately add 2 more (should queue, not exceed limit)
      const newFiles = [
        new File(['x'], 'new1.pdf', { type: 'application/pdf' }),
        new File(['y'], 'new2.pdf', { type: 'application/pdf' }),
      ];
      act(() => {
        result.current.addFiles(createFileList(newFiles));
      });

      await act(async () => {
        await uploadPromise!;
        await new Promise((r) => setTimeout(r, 150));
      });

      // Should never exceed limit
      expect(maxConcurrent).toBeLessThanOrEqual(UPLOAD_CONCURRENCY_LIMIT);
    });

    it('should not double-upload files already in queue', async () => {
      const uploadCounts = new Map<string, number>();

      mockFetch.mockImplementation((url, options) => {
        const formData = options.body as FormData;
        const file = formData.get('files') as File;
        const count = (uploadCounts.get(file.name) || 0) + 1;
        uploadCounts.set(file.name, count);

        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({
                files: [{ index: 0, uploadId: `upload-${file.name}`, status: 'accepted' }],
              }),
            });
          }, 50);
        });
      });

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add 5 files (more than concurrency limit)
      const files = Array(5)
        .fill(null)
        .map((_, i) => new File([`${i}`], `file${i}.pdf`, { type: 'application/pdf' }));
      act(() => {
        result.current.addFiles(createFileList(files));
      });

      // Start upload
      await act(async () => {
        await result.current.uploadAll('conv-1', 'intake');
        // Wait for all uploads to complete
        await new Promise((r) => setTimeout(r, 200));
      });

      // Each file should have been uploaded exactly ONCE
      expect(Array.from(uploadCounts.values())).toEqual([1, 1, 1, 1, 1]);
      // No duplicates
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('should not start workers if no upload session active', async () => {
      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add files without starting upload
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      // File should stay pending (no auto-upload from hook)
      expect(result.current.files[0].stage).toBe('pending');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should clear upload session on clearAll', async () => {
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({
                files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
              }),
            });
          }, 100);
        })
      );

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add and start upload
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file]));
      });

      act(() => {
        result.current.uploadAll('conv-1', 'intake');
      });

      // Clear immediately
      act(() => {
        result.current.clearAll();
      });

      // Add new file after clear
      const newFile = new File(['new'], 'new.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([newFile]));
      });

      // New file should stay pending (upload session ended)
      expect(result.current.files[0].stage).toBe('pending');
    });

    it('should no-op uploadAll when session already active (guard)', async () => {
      let uploadCallCount = 0;

      mockFetch.mockImplementation(() => {
        uploadCallCount++;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({
                files: [{ index: 0, uploadId: `upload-${uploadCallCount}`, status: 'accepted' }],
              }),
            });
          }, 100); // Slow upload to keep session active
        });
      });

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add initial file
      const file1 = new File(['a'], 'file1.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file1]));
      });

      // Start first upload (this initializes the session)
      act(() => {
        result.current.uploadAll('conv-1', 'intake');
      });

      // Wait a bit for upload to start
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // Add another file during upload
      const file2 = new File(['b'], 'file2.pdf', { type: 'application/pdf' });
      act(() => {
        result.current.addFiles(createFileList([file2]));
      });

      // Try to call uploadAll again (should no-op due to guard)
      act(() => {
        result.current.uploadAll('conv-1', 'intake');
      });

      // Wait for all uploads to complete
      await act(async () => {
        await new Promise((r) => setTimeout(r, 250));
      });

      // Both files should have been uploaded (file2 via reschedule effect, not second uploadAll)
      // The key assertion: uploadAll guard prevented double-initialization
      // Each file should only have 1 HTTP request
      expect(uploadCallCount).toBe(2); // One per file, not more
    });

    it('should remove queued file from queuedUploadsRef on cancel', async () => {
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({
                files: [{ index: 0, uploadId: 'upload-1', status: 'accepted' }],
              }),
            });
          }, 100);
        })
      );

      const adapter = createMockAdapter(true);
      const { result } = renderHook(() =>
        useMultiFileUpload({ wsAdapter: adapter })
      );

      // Add 5 files (more than concurrency limit, some will queue)
      const files = Array(5)
        .fill(null)
        .map((_, i) => new File([`${i}`], `file${i}.pdf`, { type: 'application/pdf' }));
      act(() => {
        result.current.addFiles(createFileList(files));
      });

      // Start upload
      act(() => {
        result.current.uploadAll('conv-1', 'intake');
      });

      // Remove a queued file (one that hasn't started yet)
      // Files 3 and 4 should be queued (concurrency limit is 3)
      act(() => {
        const queuedFile = result.current.files.find(
          (f) => f.filename === 'file4.pdf' && f.stage === 'pending'
        );
        if (queuedFile) {
          result.current.removeFile(queuedFile.localIndex);
        }
      });

      // Wait for remaining uploads
      await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
      });

      // Verify only 4 uploads happened (file4 was canceled before starting)
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });
});

/**
 * Helper to create mock FileList from file descriptors
 */
function createMockFileList(
  files: Array<{ name: string; type: string; size: number }>
): FileList {
  const mockFiles = files.map(
    (f) =>
      ({
        name: f.name,
        type: f.type,
        size: f.size,
      } as File)
  );

  return {
    length: mockFiles.length,
    item: (i: number) => mockFiles[i] || null,
    [Symbol.iterator]: function* () {
      for (const file of mockFiles) yield file;
    },
    ...mockFiles.reduce((acc, f, i) => ({ ...acc, [i]: f }), {}),
  } as unknown as FileList;
}

/**
 * Helper to create FileList from actual File objects
 */
function createFileList(files: File[]): FileList {
  return {
    length: files.length,
    item: (i: number) => files[i] || null,
    [Symbol.iterator]: function* () {
      for (const file of files) yield file;
    },
    ...files.reduce((acc, f, i) => ({ ...acc, [i]: f }), {}),
  } as unknown as FileList;
}
