/**
 * useMultiFileUpload - Hook for handling multiple file uploads
 *
 * Epic 17, Sprint 1, Track C: Multi-file upload functionality
 *
 * Architecture:
 * - HTTP POST batch multipart upload (single request for all files)
 * - WebSocket for per-file progress events (correlated by uploadId)
 * - "Never adopt" pattern to prevent race conditions
 * - AbortController for cancelling in-flight batch upload
 *
 * ID Lifecycle:
 * 1. localIndex (array position) - stable client-side identifier
 * 2. uploadId (server-generated) - correlation ID for WebSocket events
 * 3. fileId (database UUID) - final ID for message attachments
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type {
  UploadProgressEvent,
  IntakeContextResult,
  ScoringParseResult,
  MessageAttachment,
} from '@/lib/websocket';

/** Backend API base URL from environment */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** Upload mode - intake or scoring */
export type UploadMode = 'intake' | 'scoring';

/** Valid file types (matches backend) */
const VALID_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file

/**
 * Per-file state tracking
 * Story 17.3.1: Multi-File State Interface
 */
export interface FileState {
  /** Local array index (stable identifier for this session) */
  localIndex: number;
  /** Original File object (for upload) */
  file: File;
  /** Original filename */
  filename: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Server-generated correlation ID (set after HTTP 202) */
  uploadId: string | null;
  /** Database UUID (set on complete) */
  fileId: string | null;
  /** Current stage */
  stage: 'pending' | 'uploading' | 'storing' | 'parsing' | 'complete' | 'error';
  /** Progress 0-100 */
  progress: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Hook options
 * Story 17.3.1: Multi-File State Interface
 */
export interface UseMultiFileUploadOptions {
  /** Max files allowed (default: 10) */
  maxFiles?: number;
  /** WebSocket adapter for progress events */
  wsAdapter: {
    isConnected: boolean;
    subscribeUploadProgress: (
      handler: (data: UploadProgressEvent) => void
    ) => () => void;
    subscribeIntakeContextReady: (
      handler: (data: IntakeContextResult) => void
    ) => () => void;
    subscribeScoringParseReady: (
      handler: (data: ScoringParseResult) => void
    ) => () => void;
  };
  /** Called on validation/upload errors */
  onError?: (message: string) => void;
  /** Called when intake context ready */
  onContextReady?: (data: IntakeContextResult, localIndex: number) => void;
  /** Called when scoring parse ready */
  onScoringReady?: (data: ScoringParseResult, localIndex: number) => void;
}

/**
 * Hook return value
 * Story 17.3.1: Multi-File State Interface
 */
export interface UseMultiFileUploadReturn {
  /** Array of file states */
  files: FileState[];
  /** True if any file is uploading/storing/parsing */
  isUploading: boolean;
  /** Aggregate progress (0-100) across all files */
  aggregateProgress: number;
  /** Add files to queue (validates, doesn't upload yet) */
  addFiles: (fileList: FileList) => void;
  /** Remove file by localIndex */
  removeFile: (localIndex: number) => void;
  /** Clear all files */
  clearAll: () => void;
  /** Upload all pending files */
  uploadAll: (conversationId: string, mode: UploadMode) => Promise<void>;
  /**
   * Wait for all in-flight files to complete or error, then return attachments.
   * CRITICAL: Returns attachments directly to avoid stale closure issues.
   * The returned attachments are read from latest state at resolution time.
   * @param timeoutMs - Timeout in milliseconds (default: 30000, 0 = no timeout)
   * @returns Promise resolving to completed attachments (reads latest state)
   */
  waitForCompletion: (timeoutMs?: number) => Promise<MessageAttachment[]>;
  /** Get completed file IDs for message attachments */
  getCompletedFileIds: () => string[];
  /** True if any files added */
  hasFiles: boolean;
  /** True if any files pending upload */
  hasPendingFiles: boolean;
  /** True if any files have errors */
  hasErrors: boolean;
}

/**
 * Multi-file upload hook
 * Stories 17.3.1 - 17.3.5
 */
export function useMultiFileUpload(
  options: UseMultiFileUploadOptions
): UseMultiFileUploadReturn {
  const {
    maxFiles = 10,
    wsAdapter,
    onError,
    onContextReady,
    onScoringReady,
  } = options;

  const { token } = useAuth();

  // File state array
  const [files, setFiles] = useState<FileState[]>([]);

  // CRITICAL: Ref to always access latest files state (avoids stale closure)
  // This is read by waitForCompletion() resolver to return current attachments
  const filesRef = useRef<FileState[]>([]);
  filesRef.current = files;

  // Counter for generating stable localIndex
  const nextIndexRef = useRef(0);

  // Refs for callback stability (prevents subscription thrashing)
  const onErrorRef = useRef(onError);
  const onContextReadyRef = useRef(onContextReady);
  const onScoringReadyRef = useRef(onScoringReady);
  onErrorRef.current = onError;
  onContextReadyRef.current = onContextReady;
  onScoringReadyRef.current = onScoringReady;

  // Track known uploadIds for "never adopt" pattern
  // Only process WS events for uploadIds in this set
  const knownUploadIdsRef = useRef<Set<string>>(new Set());

  // AbortController for batch upload
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Add files to queue (validates but doesn't upload)
   * Story 17.3.2: Core Operations
   */
  const addFiles = useCallback(
    (fileList: FileList) => {
      const newFiles: FileState[] = [];
      const currentCount = files.length;

      for (let i = 0; i < fileList.length; i++) {
        // Check max files limit
        if (currentCount + newFiles.length >= maxFiles) {
          onErrorRef.current?.(`Maximum ${maxFiles} files allowed`);
          break;
        }

        const file = fileList[i];

        // Validate file type
        if (!VALID_TYPES.includes(file.type)) {
          onErrorRef.current?.(`${file.name}: Unsupported file type`);
          continue;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          onErrorRef.current?.(`${file.name}: File too large (max 20MB)`);
          continue;
        }

        const localIndex = nextIndexRef.current++;

        newFiles.push({
          localIndex,
          file,
          filename: file.name,
          size: file.size,
          mimeType: file.type,
          uploadId: null,
          fileId: null,
          stage: 'pending',
          progress: 0,
        });
      }

      if (newFiles.length > 0) {
        setFiles((prev) => [...prev, ...newFiles]);
      }
    },
    [files.length, maxFiles]
  );

  /**
   * Remove file by localIndex
   * Only allowed for pending/error/complete files (not during upload)
   * Story 17.3.2: Core Operations
   */
  const removeFile = useCallback((localIndex: number) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.localIndex === localIndex);
      if (!file) return prev;

      // Can't remove during active upload
      if (['uploading', 'storing', 'parsing'].includes(file.stage)) {
        onErrorRef.current?.('Cannot remove file during upload');
        return prev;
      }

      // Clear uploadId from known set
      if (file.uploadId) {
        knownUploadIdsRef.current.delete(file.uploadId);
      }

      return prev.filter((f) => f.localIndex !== localIndex);
    });
  }, []);

  /**
   * Clear all files
   * Story 17.3.2: Core Operations
   */
  const clearAll = useCallback(() => {
    // Abort any in-progress upload
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    // Clear known uploadIds
    knownUploadIdsRef.current.clear();

    // Sprint 2 Fix: Resolve any pending waiters with empty array
    // This prevents waitForCompletion() from hanging/leaking
    if (waitForCompletionResolversRef.current.length > 0) {
      const resolvers = [...waitForCompletionResolversRef.current];
      waitForCompletionResolversRef.current = [];
      resolvers.forEach((resolver) => resolver([]));
    }

    // Reset state
    setFiles([]);
    nextIndexRef.current = 0;
  }, []);

  /**
   * Upload all pending files
   * Story 17.3.3: Upload Implementation
   */
  const uploadAll = useCallback(
    async (conversationId: string, mode: UploadMode) => {
      if (!token) {
        onErrorRef.current?.('Not authenticated');
        return;
      }

      const pendingFiles = files.filter((f) => f.stage === 'pending');
      if (pendingFiles.length === 0) return;

      // Create AbortController for this batch
      abortControllerRef.current = new AbortController();

      // Mark as uploading
      setFiles((prev) =>
        prev.map((f) =>
          f.stage === 'pending'
            ? { ...f, stage: 'uploading' as const, progress: 10 }
            : f
        )
      );

      try {
        // Build FormData
        const formData = new FormData();
        formData.append('conversationId', conversationId);
        formData.append('mode', mode);

        // Add files in order (server returns uploadIds in same order)
        const pendingIndices = pendingFiles.map((f) => f.localIndex);
        pendingFiles.forEach((fileState) => {
          formData.append('files', fileState.file); // Field name is 'files' (plural)
        });

        // POST upload
        const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Upload failed' }));
          throw new Error(errorData.error || `Upload failed: ${response.status}`);
        }

        // Parse response to get uploadIds
        const result = await response.json();
        // result.files: [{ index, filename, uploadId, status, error? }]

        // Map uploadIds to our files by index
        setFiles((prev) => {
          const updated = [...prev];

          result.files.forEach((serverFile: any) => {
            // serverFile.index corresponds to position in FormData
            const localIndex = pendingIndices[serverFile.index];
            const fileIndex = updated.findIndex(
              (f) => f.localIndex === localIndex
            );

            if (fileIndex !== -1) {
              if (serverFile.status === 'accepted') {
                // Store uploadId and register for WS tracking
                updated[fileIndex] = {
                  ...updated[fileIndex],
                  uploadId: serverFile.uploadId,
                  stage: 'storing',
                  progress: 30,
                };
                knownUploadIdsRef.current.add(serverFile.uploadId);
              } else {
                // Server rejected file during validation
                updated[fileIndex] = {
                  ...updated[fileIndex],
                  stage: 'error',
                  progress: 0,
                  error: serverFile.error || 'Rejected by server',
                };
              }
            }
          });

          return updated;
        });

        // Progress continues via WebSocket
      } catch (error) {
        // Handle abort gracefully
        if (error instanceof Error && error.name === 'AbortError') {
          setFiles((prev) =>
            prev.map((f) =>
              f.stage === 'uploading'
                ? { ...f, stage: 'pending' as const, progress: 0, uploadId: null }
                : f
            )
          );
          return;
        }

        // Mark all uploading as error
        const errorMsg = error instanceof Error ? error.message : 'Upload failed';
        setFiles((prev) =>
          prev.map((f) =>
            f.stage === 'uploading'
              ? { ...f, stage: 'error' as const, progress: 0, error: errorMsg }
              : f
          )
        );
        onErrorRef.current?.(errorMsg);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [files, token]
  );

  /**
   * WebSocket event subscriptions
   * Story 17.3.4: WebSocket Progress Handling
   */
  useEffect(() => {
    if (!wsAdapter.isConnected) return;

    // Upload progress events
    const unsubProgress = wsAdapter.subscribeUploadProgress((data) => {
      // "Never adopt" - only accept events for known uploadIds
      if (!knownUploadIdsRef.current.has(data.uploadId)) return;

      setFiles((prev) =>
        prev.map((f) => {
          if (f.uploadId !== data.uploadId) return f;

          return {
            ...f,
            stage: data.stage as FileState['stage'],
            progress: data.progress,
            error: data.error,
          };
        })
      );

      if (data.stage === 'error') {
        onErrorRef.current?.(data.error || 'Upload failed');
      }
    });

    // Intake context ready
    const unsubIntake = wsAdapter.subscribeIntakeContextReady((data) => {
      if (!knownUploadIdsRef.current.has(data.uploadId)) return;

      setFiles((prev) => {
        const updated = prev.map((f) => {
          if (f.uploadId !== data.uploadId) return f;

          if (data.success && data.fileMetadata) {
            return {
              ...f,
              stage: 'complete' as const,
              progress: 100,
              fileId: data.fileMetadata.fileId,
            };
          } else {
            return {
              ...f,
              stage: 'error' as const,
              progress: 0,
              error: data.error || 'Failed to process',
            };
          }
        });

        // Find the file that was updated for callback
        const updatedFile = updated.find((f) => f.uploadId === data.uploadId);
        if (updatedFile && data.success) {
          onContextReadyRef.current?.(data, updatedFile.localIndex);
        }

        return updated;
      });
    });

    // Scoring parse ready (similar pattern)
    const unsubScoring = wsAdapter.subscribeScoringParseReady((data) => {
      if (!knownUploadIdsRef.current.has(data.uploadId)) return;

      setFiles((prev) => {
        const updated = prev.map((f) => {
          if (f.uploadId !== data.uploadId) return f;

          if (data.success && data.fileMetadata) {
            return {
              ...f,
              stage: 'complete' as const,
              progress: 100,
              fileId: data.fileMetadata.fileId,
            };
          } else {
            return {
              ...f,
              stage: 'error' as const,
              progress: 0,
              error: data.error || 'Failed to parse',
            };
          }
        });

        const updatedFile = updated.find((f) => f.uploadId === data.uploadId);
        if (updatedFile && data.success) {
          onScoringReadyRef.current?.(data, updatedFile.localIndex);
        }

        return updated;
      });
    });

    return () => {
      unsubProgress();
      unsubIntake();
      unsubScoring();
    };
  }, [
    wsAdapter.isConnected,
    wsAdapter.subscribeUploadProgress,
    wsAdapter.subscribeIntakeContextReady,
    wsAdapter.subscribeScoringParseReady,
  ]);

  /**
   * Computed values
   * Story 17.3.5: Computed Values and Tests
   */
  const isUploading = files.some((f) =>
    ['uploading', 'storing', 'parsing'].includes(f.stage)
  );

  const aggregateProgress =
    files.length === 0
      ? 0
      : Math.round(files.reduce((sum, f) => sum + f.progress, 0) / files.length);

  const hasFiles = files.length > 0;

  const hasPendingFiles = files.some((f) => f.stage === 'pending');

  const hasErrors = files.some((f) => f.stage === 'error');

  const getCompletedFileIds = useCallback(() => {
    return files
      .filter((f) => f.stage === 'complete' && f.fileId)
      .map((f) => f.fileId!);
  }, [files]);

  /**
   * Helper: Build MessageAttachment[] from current files state
   * Reads from filesRef to get latest state (avoids stale closure)
   */
  const buildAttachmentsFromRef = useCallback((): MessageAttachment[] => {
    return filesRef.current
      .filter((f) => f.stage === 'complete' && f.fileId)
      .map((f) => ({
        fileId: f.fileId!,
        filename: f.filename,
        mimeType: f.mimeType,
        size: f.size,
      }));
  }, []);

  /**
   * Wait for all in-flight files to reach complete or error state
   * CRITICAL: Returns MessageAttachment[] to avoid stale closure issues
   *
   * Sprint 2 Fix: Resolvers read from filesRef when resolving, not from
   * the closure at call time. This ensures Composer gets latest state.
   */
  const waitForCompletionResolversRef = useRef<Array<(attachments: MessageAttachment[]) => void>>([]);

  // Check and resolve pending waiters when files state changes
  useEffect(() => {
    const hasInFlight = files.some((f) =>
      ['uploading', 'storing', 'parsing'].includes(f.stage)
    );

    // Resolve waiters when nothing in-flight (all done or all pending/error/complete)
    if (!hasInFlight && waitForCompletionResolversRef.current.length > 0) {
      // Read from ref to get absolute latest state
      const attachments = buildAttachmentsFromRef();
      const resolvers = [...waitForCompletionResolversRef.current];
      waitForCompletionResolversRef.current = [];
      resolvers.forEach((resolve) => resolve(attachments));
    }
  }, [files, buildAttachmentsFromRef]);

  // Cleanup on unmount: resolve any pending waiters
  useEffect(() => {
    return () => {
      if (waitForCompletionResolversRef.current.length > 0) {
        const resolvers = [...waitForCompletionResolversRef.current];
        waitForCompletionResolversRef.current = [];
        resolvers.forEach((resolve) => resolve([]));
      }
    };
  }, []);

  /**
   * Wait for all in-flight files to complete, then return attachments
   * @param timeoutMs - Timeout in ms (default 30000, 0 = no timeout)
   * @returns Promise<MessageAttachment[]> - completed attachments (latest state)
   */
  const waitForCompletion = useCallback((timeoutMs: number = 30000): Promise<MessageAttachment[]> => {
    // If nothing in flight, resolve immediately with current attachments
    const hasInFlight = filesRef.current.some((f) =>
      ['uploading', 'storing', 'parsing'].includes(f.stage)
    );
    if (!hasInFlight) {
      return Promise.resolve(buildAttachmentsFromRef());
    }

    // Otherwise, register a resolver to be called when all complete
    return new Promise((resolve, reject) => {
      // Timeout handling (0 = no timeout)
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const wrappedResolver = (attachments: MessageAttachment[]) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(attachments);
      };

      waitForCompletionResolversRef.current.push(wrappedResolver);

      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          // Remove this resolver from the queue
          const idx = waitForCompletionResolversRef.current.indexOf(wrappedResolver);
          if (idx !== -1) {
            waitForCompletionResolversRef.current.splice(idx, 1);
          }

          // UX Recovery: Force in-flight files to error so UI isn't stuck
          // This allows the user to remove failed files and try again
          setFiles((prev) =>
            prev.map((f) =>
              ['uploading', 'storing', 'parsing'].includes(f.stage)
                ? { ...f, stage: 'error' as const, error: 'Upload timed out' }
                : f
            )
          );

          reject(new Error(`Upload completion timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }
    });
  }, [buildAttachmentsFromRef]);

  return {
    files,
    isUploading,
    aggregateProgress,
    addFiles,
    removeFile,
    clearAll,
    uploadAll,
    waitForCompletion,
    getCompletedFileIds,
    hasFiles,
    hasPendingFiles,
    hasErrors,
  };
}
