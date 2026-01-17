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
  FileAttachedEvent,
  AttachedFileMetadata,
  FileUploadStage,
} from '@/lib/websocket';
import { isRemovable, requiresAbort, wouldExceedTotalSize } from '@/lib/uploadStageHelpers';

/** Backend API base URL from environment */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Epic 19: Maximum concurrent uploads
 * Reference: behavior-matrix.md Section 5 (Concurrency Limits)
 */
const UPLOAD_CONCURRENCY_LIMIT = 3;

/**
 * Epic 19: Maximum total size for all files combined
 * Reference: behavior-matrix.md Section 5 (Concurrency Limits)
 */
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Epic 19 Story 19.2.4: Orphan detection timeouts
 * Reference: behavior-matrix.md Section 12 (Edge Cases)
 *
 * ORPHAN_TIMEOUT_RECONNECT_MS - Timeout for reconnect check (aggressive)
 * ORPHAN_TIMEOUT_PERIODIC_MS - Timeout for periodic check (conservative)
 * ORPHAN_CHECK_INTERVAL_MS - How often to run periodic check
 */
const ORPHAN_TIMEOUT_RECONNECT_MS = 30000; // 30 seconds
const ORPHAN_TIMEOUT_PERIODIC_MS = 60000; // 60 seconds
const ORPHAN_CHECK_INTERVAL_MS = 15000; // Check every 15 seconds

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
 * Epic 18: Stage precedence for monotonic transitions
 *
 * Guards prevent backward stage transitions due to out-of-order events.
 * Higher number = more progressed stage.
 *
 * IMPORTANT: Includes existing 'idle'/'selecting' stages to avoid breaking UI
 */
const STAGE_PRECEDENCE: Record<FileUploadStage, number> = {
  idle: -1,       // EXISTING: Not in upload flow
  selecting: -1,  // EXISTING: Not in upload flow
  pending: 0,
  uploading: 1,
  storing: 2,
  attached: 3,    // NEW: After storing, before parsing
  parsing: 4,
  complete: 5,
  error: 5,       // Terminal stage (same level as complete)
};

/**
 * Epic 18: Check if transition is allowed (forward only, except error)
 */
function canTransitionTo(currentStage: FileUploadStage, newStage: FileUploadStage): boolean {
  // Error can always be set (to report failures)
  if (newStage === 'error') return true;

  // idle/selecting are outside upload flow, always allow transition from them
  if (currentStage === 'idle' || currentStage === 'selecting') return true;

  // Only allow forward transitions
  return STAGE_PRECEDENCE[newStage] > STAGE_PRECEDENCE[currentStage];
}

/**
 * Per-file state tracking
 * Story 17.3.1: Multi-File State Interface
 * Epic 18: Extended with 'attached' stage and metadata
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
  /** Database UUID (set when file_attached received) - Epic 18 */
  fileId: string | null;
  /** Current stage - Epic 18: Now includes 'attached' */
  stage: FileUploadStage;
  /** Progress 0-100 */
  progress: number;
  /** Error message if failed */
  error?: string;
  /** File metadata from file_attached event - Epic 18 */
  metadata?: AttachedFileMetadata;
}

/**
 * Hook options
 * Story 17.3.1: Multi-File State Interface
 * Epic 18: Extended with subscribeFileAttached
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
    /** Epic 18: Subscribe to file_attached events */
    subscribeFileAttached: (
      handler: (data: FileAttachedEvent) => void
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
  addFiles: (files: FileList | File[]) => void;
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
  /** Epic 19 Story 19.2.1: Check if an uploadId was canceled */
  isCanceled: (uploadId: string) => boolean;
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

  // Epic 18: Buffer for early file_attached events
  // If file_attached arrives before addFiles() completes (race condition),
  // buffer the event and process when uploadId is registered.
  const earlyFileAttachedEventsRef = useRef<Map<string, FileAttachedEvent>>(new Map());

  // Epic 19: Per-file AbortController map
  // Maps localIndex → AbortController for individual file cancellation
  // Reference: behavior-matrix.md Section 4 (Cancel/Remove Action)
  const abortControllerMapRef = useRef<Map<number, AbortController>>(new Map());

  // Epic 19: Track currently uploading file indices for concurrency control
  const activeUploadsRef = useRef<Set<number>>(new Set());

  // Epic 19 Story 19.1.5: Track if upload session is active
  const isUploadingRef = useRef<boolean>(false);

  // Store current upload params for new file workers
  const uploadParamsRef = useRef<{ conversationId: string; mode: UploadMode } | null>(null);

  // CRITICAL: Track files that are QUEUED (in uploadQueue but not yet in activeUploads)
  // This prevents the useEffect from starting the same file that a queue worker is about to start
  const queuedUploadsRef = useRef<Set<number>>(new Set());

  // Epic 19 Story 19.2.1: Track canceled uploadIds to filter late WS events
  // When a file is canceled, its uploadId is added here to prevent
  // late file_attached/upload_progress from resurrecting the file.
  // Reference: behavior-matrix.md Section 12 (Edge Cases)
  const canceledUploadIdsRef = useRef<Set<string>>(new Set());

  // Epic 19 Story 19.2.4: Track when uploads started for orphan detection
  // Maps localIndex → timestamp when upload entered 'uploading' stage
  const uploadStartTimesRef = useRef<Map<number, number>>(new Map());

  /**
   * Epic 19 Story 19.2.1: Check if uploadId was canceled
   * Used by WS handlers to filter late events
   */
  const isCanceled = useCallback((uploadId: string): boolean => {
    return canceledUploadIdsRef.current.has(uploadId);
  }, []);

  /**
   * Epic 19: Create and store AbortController for a file
   * @param localIndex - File's local index
   * @returns The created AbortController
   */
  const createAbortController = useCallback((localIndex: number): AbortController => {
    const controller = new AbortController();
    abortControllerMapRef.current.set(localIndex, controller);
    return controller;
  }, []);

  /**
   * Epic 19: Get AbortController for a file
   * @param localIndex - File's local index
   * @returns The AbortController or undefined if not found
   */
  const getAbortController = useCallback((localIndex: number): AbortController | undefined => {
    return abortControllerMapRef.current.get(localIndex);
  }, []);

  /**
   * Epic 19: Abort and remove controller for a file
   * @param localIndex - File's local index
   * @returns true if controller existed and was aborted
   */
  const abortAndRemoveController = useCallback((localIndex: number): boolean => {
    const controller = abortControllerMapRef.current.get(localIndex);
    if (controller) {
      controller.abort();
      abortControllerMapRef.current.delete(localIndex);
      return true;
    }
    return false;
  }, []);

  /**
   * Epic 19: Clean up all AbortControllers
   * Called by clearAll() and on unmount
   */
  const abortAllControllers = useCallback(() => {
    abortControllerMapRef.current.forEach((controller) => {
      controller.abort();
    });
    abortControllerMapRef.current.clear();
  }, []);

  /**
   * Add files to queue (validates but doesn't upload)
   * Story 17.3.2: Core Operations
   * Epic 19 Story 19.1.4: Client-side total size validation
   * Epic 19 Story 19.5.2: Accept FileList or File[] (for react-dropzone)
   */
  const addFiles = useCallback(
    (newFileInput: FileList | File[]) => {
      // Convert to array (works for both FileList and File[])
      const filesToAdd = Array.from(newFileInput);

      // Epic 19 Story 19.1.4: Check total size limit FIRST (before any individual validation)
      // This prevents partially adding files when total would exceed limit
      const newFileSizes = filesToAdd.map((f) => ({ size: f.size }));
      if (wouldExceedTotalSize(filesRef.current, newFileSizes, MAX_TOTAL_SIZE)) {
        onErrorRef.current?.('Total size exceeds 50MB limit');
        return; // Reject ALL new files
      }

      const newFiles: FileState[] = [];
      // Use current state length, not parameter length (was shadowing bug)
      const currentCount = filesRef.current.length;

      for (let i = 0; i < filesToAdd.length; i++) {
        // Check max files limit
        if (currentCount + newFiles.length >= maxFiles) {
          onErrorRef.current?.(`Maximum ${maxFiles} files allowed`);
          break;
        }

        const file = filesToAdd[i];

        // Validate file type
        if (!VALID_TYPES.includes(file.type)) {
          onErrorRef.current?.(`${file.name}: Unsupported file type`);
          continue;
        }

        // Validate individual file size (20MB per file)
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
   * Allowed at all stages except 'parsing' (cannot cancel enrichment)
   *
   * Story 17.3.2: Core Operations
   * Epic 18: Clean up buffered events
   * Epic 19 Story 19.1.1: Abort HTTP request if in cancelable stage
   *
   * Reference: behavior-matrix.md Section 4 (Action Matrix - Remove/Cancel)
   */
  const removeFile = useCallback((localIndex: number) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.localIndex === localIndex);
      if (!file) return prev;

      // Check if stage allows removal (all except parsing)
      if (!isRemovable(file.stage)) {
        onErrorRef.current?.('Cannot cancel during analysis');
        return prev;
      }

      // Epic 19: Abort HTTP request if in cancelable stage
      if (requiresAbort(file.stage)) {
        abortAndRemoveController(localIndex);
      } else {
        // Clean up controller even if not aborting (may exist from earlier stage)
        abortControllerMapRef.current.delete(localIndex);
      }

      // Epic 19 Story 19.2.4: Clear timestamp on removal
      uploadStartTimesRef.current.delete(localIndex);

      // Clear uploadId from known set and clean up buffered events
      if (file.uploadId) {
        knownUploadIdsRef.current.delete(file.uploadId);
        earlyFileAttachedEventsRef.current.delete(file.uploadId);

        // Epic 19 Story 19.2.1: Track canceled uploadId for late event filtering
        // This prevents late WS events from resurrecting the file
        canceledUploadIdsRef.current.add(file.uploadId);
      }

      // Epic 19 Story 19.1.5: Remove from queued set if present
      // This handles the case where file was added to uploadQueue but worker hasn't
      // started it yet. Without this, session cleanup can get stuck.
      queuedUploadsRef.current.delete(localIndex);

      return prev.filter((f) => f.localIndex !== localIndex);
    });
  }, [abortAndRemoveController]);

  /**
   * Clear all files
   * Story 17.3.2: Core Operations
   * Epic 18: Clean up buffered events
   * Epic 19 Story 19.1.1: Abort all per-file controllers
   * Epic 19 Story 19.1.3: Clear active uploads tracking
   */
  const clearAll = useCallback(() => {
    // Epic 19: Abort all per-file controllers
    abortAllControllers();

    // Epic 19: Clear active uploads tracking
    activeUploadsRef.current.clear();

    // Epic 19 Story 19.1.5: Reset upload session state
    isUploadingRef.current = false;
    uploadParamsRef.current = null;
    queuedUploadsRef.current.clear();

    // Clear known uploadIds and buffered events
    knownUploadIdsRef.current.clear();
    earlyFileAttachedEventsRef.current.clear();

    // Epic 19 Story 19.2.1: Clear canceled tracking (new conversation = fresh state)
    canceledUploadIdsRef.current.clear();

    // Epic 19 Story 19.2.4: Clear timestamp tracking
    uploadStartTimesRef.current.clear();

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
  }, [abortAllControllers]);

  /**
   * Epic 18: Handle file_attached event with monotonic guards
   * Epic 19 Story 19.2.2: Filter late events for canceled uploads
   */
  const handleFileAttached = useCallback((event: FileAttachedEvent) => {
    // Check if uploadId is known
    if (!knownUploadIdsRef.current.has(event.uploadId)) {
      // Epic 19 Story 19.2.2: Don't buffer events for canceled uploads
      if (canceledUploadIdsRef.current.has(event.uploadId)) {
        console.debug(
          '[useMultiFileUpload] Ignoring file_attached for canceled:',
          event.uploadId
        );
        return;
      }

      // Buffer event for later processing (race condition)
      console.debug('[useMultiFileUpload] Buffering early file_attached:', event.uploadId);
      earlyFileAttachedEventsRef.current.set(event.uploadId, event);
      return;
    }

    // Epic 19 Story 19.2.2: Filter late events for canceled uploads
    if (canceledUploadIdsRef.current.has(event.uploadId)) {
      console.debug(
        '[useMultiFileUpload] Ignoring file_attached for canceled:',
        event.uploadId
      );
      return;
    }

    setFiles((prev) =>
      prev.map((f) => {
        if (f.uploadId !== event.uploadId) return f;

        // Use monotonic guard - only transition if allowed
        const shouldTransition = canTransitionTo(f.stage, 'attached');

        if (!shouldTransition) {
          console.debug(
            `[useMultiFileUpload] Ignoring file_attached: ${f.stage} → attached (backward)`
          );
        }

        return {
          ...f,
          // Always capture fileId and metadata (even if stage doesn't change)
          fileId: event.fileId,
          metadata: {
            fileId: event.fileId,
            filename: event.filename,
            mimeType: event.mimeType,
            size: event.size,
            hasExcerpt: event.hasExcerpt,
            // Epic 18: Document classification for wrong-mode warnings
            detectedDocType: event.detectedDocType,
            detectedVendorName: event.detectedVendorName,
          },
          // Only update stage if transition is allowed
          stage: shouldTransition ? 'attached' : f.stage,
        };
      })
    );
  }, []);

  /**
   * Epic 18: Process early buffered events when uploadId is registered
   */
  const processEarlyEvents = useCallback(
    (uploadId: string) => {
      const bufferedEvent = earlyFileAttachedEventsRef.current.get(uploadId);
      if (bufferedEvent) {
        earlyFileAttachedEventsRef.current.delete(uploadId);
        handleFileAttached(bufferedEvent);
      }
    },
    [handleFileAttached]
  );

  /**
   * Epic 19: Upload a single file
   *
   * Uploads one file via HTTP POST, handling its complete lifecycle:
   * - Creates AbortController for this file
   * - Sets stage to 'uploading'
   * - Makes HTTP request
   * - Updates stage based on response
   * - Cleans up AbortController
   *
   * @param file - FileState to upload
   * @param conversationId - Target conversation
   * @param mode - Upload mode (intake or scoring)
   *
   * Reference: behavior-matrix.md Section 3 (Stage Transitions)
   */
  const uploadSingleFile = useCallback(
    async (file: FileState, conversationId: string, mode: UploadMode): Promise<void> => {
      if (!token) {
        throw new Error('Not authenticated');
      }

      const { localIndex } = file;

      // Create AbortController for this file
      const controller = createAbortController(localIndex);

      // Epic 19 Story 19.2.4: Track upload start time
      // IMPORTANT: Timestamp persists until file reaches terminal state (complete/error)
      // Do NOT clear when HTTP resolves - file may still be in 'storing' awaiting WS events
      uploadStartTimesRef.current.set(localIndex, Date.now());

      // Mark this file as uploading
      setFiles((prev) =>
        prev.map((f) =>
          f.localIndex === localIndex
            ? { ...f, stage: 'uploading' as const, progress: 10 }
            : f
        )
      );

      try {
        // Build FormData for single file
        const formData = new FormData();
        formData.append('conversationId', conversationId);
        formData.append('mode', mode);
        formData.append('files', file.file); // Single file

        // POST upload
        const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
          throw new Error(errorData.error || `Upload failed: ${response.status}`);
        }

        // Parse response
        const result = await response.json();

        // Response should have exactly one file (index 0)
        const serverFile = result.files?.[0];

        if (!serverFile) {
          throw new Error('Invalid server response');
        }

        // Update file state based on response
        setFiles((prev) =>
          prev.map((f) => {
            if (f.localIndex !== localIndex) return f;

            if (serverFile.status === 'accepted') {
              // Register uploadId for WebSocket event tracking
              knownUploadIdsRef.current.add(serverFile.uploadId);

              // Process any buffered file_attached events
              processEarlyEvents(serverFile.uploadId);

              return {
                ...f,
                uploadId: serverFile.uploadId,
                stage: 'storing' as const,
                progress: 30,
              };
            } else {
              // Epic 19 Story 19.2.4: Clear timestamp on rejection (terminal state)
              uploadStartTimesRef.current.delete(f.localIndex);

              return {
                ...f,
                stage: 'error' as const,
                progress: 0,
                error: serverFile.error || 'Rejected by server',
              };
            }
          })
        );
      } catch (error) {
        // Handle abort gracefully - file was canceled by user
        if (error instanceof Error && error.name === 'AbortError') {
          // File already removed by removeFile() - nothing to do
          // The setFiles filter in removeFile already removed this file
          // Timestamp already cleared by removeFile()
          return;
        }

        // Epic 19 Story 19.2.4: Clear timestamp on error (terminal state)
        uploadStartTimesRef.current.delete(localIndex);

        // Mark this file as error
        const errorMsg = error instanceof Error ? error.message : 'Upload failed';
        setFiles((prev) =>
          prev.map((f) =>
            f.localIndex === localIndex
              ? { ...f, stage: 'error' as const, progress: 0, error: errorMsg }
              : f
          )
        );

        // Report error via callback
        onErrorRef.current?.(errorMsg);
      } finally {
        // Clean up AbortController
        abortControllerMapRef.current.delete(localIndex);
      }
    },
    [token, createAbortController, processEarlyEvents]
  );

  /**
   * Upload all pending files with concurrency limit
   *
   * Epic 19 Story 19.1.3: Implements concurrent queue pattern.
   * Epic 19 Story 19.1.5: Session guard and queue tracking.
   *
   * - Maximum UPLOAD_CONCURRENCY_LIMIT simultaneous uploads
   * - Remaining files queue and start as slots open
   * - Each file uses independent AbortController
   * - Session guard: Bails if upload session already active
   *
   * @param conversationId - Target conversation
   * @param mode - Upload mode
   *
   * Reference: behavior-matrix.md Section 5 (Concurrency Limits)
   */
  const uploadAll = useCallback(
    async (conversationId: string, mode: UploadMode) => {
      if (!token) {
        onErrorRef.current?.('Not authenticated');
        return;
      }

      // Epic 19 Story 19.1.5: GUARD - Bail if session already active
      // The reschedule useEffect handles new files during active upload.
      // This prevents re-entrant uploadAll calls from Composer's auto-upload effect.
      if (isUploadingRef.current) {
        console.debug('[uploadAll] Session already active, deferring to reschedule effect');
        return;
      }

      // Get pending files (snapshot at call time)
      const pendingFiles = filesRef.current.filter((f) => f.stage === 'pending');
      if (pendingFiles.length === 0) return;

      // Epic 19 Story 19.1.5: Mark upload session as active
      // NOTE: Session is cleared by useEffect when all uploads complete
      isUploadingRef.current = true;
      uploadParamsRef.current = { conversationId, mode };

      // CRITICAL: Mark all pending files as QUEUED before creating the queue
      // This prevents the useEffect from double-starting these files
      pendingFiles.forEach((f) => queuedUploadsRef.current.add(f.localIndex));

      // Create queue from pending files (copy to avoid mutation issues)
      const uploadQueue = [...pendingFiles];

      /**
       * Start next upload if slots available
       * Returns a promise that resolves when this upload chain completes
       */
      const processQueue = async (): Promise<void> => {
        while (uploadQueue.length > 0) {
          // Check if we have capacity
          if (activeUploadsRef.current.size >= UPLOAD_CONCURRENCY_LIMIT) {
            // No capacity - this worker will exit, another will continue
            return;
          }

          // Get next file from queue
          const file = uploadQueue.shift();
          if (!file) return;

          // CRITICAL: Move from queued → active (atomically)
          queuedUploadsRef.current.delete(file.localIndex);

          // Check if file still exists and is still pending
          const currentFile = filesRef.current.find((f) => f.localIndex === file.localIndex);
          if (!currentFile || currentFile.stage !== 'pending') {
            // File was removed or stage changed - continue to next
            continue;
          }

          // Mark as active
          activeUploadsRef.current.add(file.localIndex);

          try {
            // Upload this file
            await uploadSingleFile(currentFile, conversationId, mode);
          } catch (error) {
            // Individual errors handled in uploadSingleFile
            console.error(`Upload failed for ${file.filename}:`, error);
          } finally {
            // Release slot
            activeUploadsRef.current.delete(file.localIndex);
          }
        }
      };

      // Start up to LIMIT concurrent workers
      const workerCount = Math.min(UPLOAD_CONCURRENCY_LIMIT, pendingFiles.length);
      const workers = Array(workerCount)
        .fill(null)
        .map(() => processQueue());

      // Wait for all workers to complete
      await Promise.all(workers);

      // NOTE: Do NOT clear session state here!
      // The useEffect may have started new workers for newly added files.
      // Session state is cleared by the cleanup useEffect when all done.
    },
    [token, uploadSingleFile]
  );

  /**
   * WebSocket event subscriptions
   * Story 17.3.4: WebSocket Progress Handling
   * Epic 18: Added file_attached subscription and monotonic guards
   */
  useEffect(() => {
    if (!wsAdapter.isConnected) return;

    // Upload progress events with monotonic guards
    const unsubProgress = wsAdapter.subscribeUploadProgress((data) => {
      // "Never adopt" - only accept events for known uploadIds
      if (!knownUploadIdsRef.current.has(data.uploadId)) return;

      // Epic 19 Story 19.2.2: Filter late events for canceled uploads
      if (canceledUploadIdsRef.current.has(data.uploadId)) {
        console.debug(
          '[useMultiFileUpload] Ignoring upload_progress for canceled:',
          data.uploadId
        );
        return;
      }

      // Epic 19 Story 19.2.4: Reset timestamp on progress (upload is alive)
      // This prevents orphan detection from marking active uploads as timed out
      const file = filesRef.current.find((f) => f.uploadId === data.uploadId);
      if (file) {
        uploadStartTimesRef.current.set(file.localIndex, Date.now());
      }

      setFiles((prev) =>
        prev.map((f) => {
          if (f.uploadId !== data.uploadId) return f;

          const targetStage = data.stage as FileState['stage'];

          // Use monotonic guard
          const shouldTransition = canTransitionTo(f.stage, targetStage);

          if (!shouldTransition && targetStage !== 'error') {
            console.debug(
              `[useMultiFileUpload] Ignoring progress: ${f.stage} → ${targetStage} (backward)`
            );
          }

          return {
            ...f,
            stage: shouldTransition ? targetStage : f.stage,
            progress: data.progress,
            error: data.error ?? f.error,
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

      // Epic 19 Story 19.2.2: Filter late events for canceled uploads
      if (canceledUploadIdsRef.current.has(data.uploadId)) {
        console.debug(
          '[useMultiFileUpload] Ignoring intake_context_ready for canceled:',
          data.uploadId
        );
        return;
      }

      // Epic 19 Story 19.2.4: Clear timestamp on terminal state
      const file = filesRef.current.find((f) => f.uploadId === data.uploadId);
      if (file) {
        uploadStartTimesRef.current.delete(file.localIndex);
      }

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

      // Epic 19 Story 19.2.2: Filter late events for canceled uploads
      if (canceledUploadIdsRef.current.has(data.uploadId)) {
        console.debug(
          '[useMultiFileUpload] Ignoring scoring_parse_ready for canceled:',
          data.uploadId
        );
        return;
      }

      // Epic 19 Story 19.2.4: Clear timestamp on terminal state
      const file = filesRef.current.find((f) => f.uploadId === data.uploadId);
      if (file) {
        uploadStartTimesRef.current.delete(file.localIndex);
      }

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

    // Epic 18: File attached subscription
    const unsubAttached = wsAdapter.subscribeFileAttached(handleFileAttached);

    return () => {
      unsubProgress();
      unsubIntake();
      unsubScoring();
      unsubAttached();
    };
  }, [
    wsAdapter.isConnected,
    wsAdapter.subscribeUploadProgress,
    wsAdapter.subscribeIntakeContextReady,
    wsAdapter.subscribeScoringParseReady,
    wsAdapter.subscribeFileAttached,
    handleFileAttached,
  ]);

  /**
   * Epic 19 Story 19.1.5: Watch for new pending files during upload
   * When new files are added while upload is active, start workers to process them
   *
   * CRITICAL: Checks both activeUploadsRef (processing) and queuedUploadsRef (waiting in queue)
   * to prevent starting a file that's already queued by uploadAll.
   */
  useEffect(() => {
    // Only act if upload session is active
    if (!isUploadingRef.current || !uploadParamsRef.current) {
      return;
    }

    // Check if we have capacity
    // Note: queuedUploads don't count against capacity - they're waiting for a worker
    const availableSlots = UPLOAD_CONCURRENCY_LIMIT - activeUploadsRef.current.size;
    if (availableSlots <= 0) {
      return; // No capacity, existing workers will pick up when slots free
    }

    // Find pending files that aren't already being processed OR queued
    const pendingFiles = files.filter((f) => {
      if (f.stage !== 'pending') return false;
      // CRITICAL: Check BOTH refs to prevent double-upload
      if (activeUploadsRef.current.has(f.localIndex)) return false;
      if (queuedUploadsRef.current.has(f.localIndex)) return false;
      return true;
    });

    if (pendingFiles.length === 0) {
      return; // No new pending files
    }

    // Start new workers for new pending files (up to available slots)
    const { conversationId, mode } = uploadParamsRef.current;
    const filesToStart = pendingFiles.slice(0, availableSlots);

    console.debug(
      '[useMultiFileUpload] Starting workers for new files:',
      filesToStart.map((f) => f.filename)
    );

    // Process each new file (async, don't await)
    filesToStart.forEach(async (file) => {
      // CRITICAL: Mark as active BEFORE any async work to prevent race
      // Note: We don't use queuedUploadsRef here because we're starting immediately
      if (activeUploadsRef.current.has(file.localIndex)) {
        return; // Another effect iteration got here first
      }
      if (activeUploadsRef.current.size >= UPLOAD_CONCURRENCY_LIMIT) {
        return; // No more capacity
      }

      activeUploadsRef.current.add(file.localIndex);

      // Double-check file is still pending
      const currentFile = filesRef.current.find((f) => f.localIndex === file.localIndex);
      if (!currentFile || currentFile.stage !== 'pending') {
        activeUploadsRef.current.delete(file.localIndex);
        return;
      }

      try {
        await uploadSingleFile(currentFile, conversationId, mode);
      } catch (error) {
        console.error(`Upload failed for ${file.filename}:`, error);
      } finally {
        activeUploadsRef.current.delete(file.localIndex);
      }
    });
  }, [files, uploadSingleFile]);

  /**
   * Epic 19 Story 19.1.5: Clear session state when all uploads complete
   * Triggers when: activeUploadsRef.size === 0 AND queuedUploadsRef.size === 0
   *                AND no pending files AND session was active
   */
  useEffect(() => {
    // Only check if we think we're in an upload session
    if (!isUploadingRef.current) {
      return;
    }

    // Check if any uploads still in flight
    if (activeUploadsRef.current.size > 0) {
      return; // Still have active uploads
    }

    // Check if any files still queued (waiting in uploadQueue)
    if (queuedUploadsRef.current.size > 0) {
      return; // Still have files in queue
    }

    // Check if any files still pending
    const hasPending = files.some((f) => f.stage === 'pending');
    if (hasPending) {
      return; // Still have files waiting to upload
    }

    // All done - clear session state
    console.debug('[useMultiFileUpload] All uploads complete, clearing session state');
    isUploadingRef.current = false;
    uploadParamsRef.current = null;
    queuedUploadsRef.current.clear(); // Defensive clear
  }, [files]); // Triggers on files state change

  /**
   * Computed values
   * Story 17.3.5: Computed Values and Tests
   * Epic 18: Only uploading/storing are upload-in-flight stages
   * 'attached' = upload complete (ready to send)
   * 'parsing' = enrichment after send (not upload)
   */
  const isUploading = files.some((f) =>
    ['uploading', 'storing'].includes(f.stage)
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
      .filter((f) => {
        // Must be complete with fileId
        if (f.stage !== 'complete' || !f.fileId) return false;

        // Epic 19 Story 19.2.3: Exclude canceled files
        if (f.uploadId && canceledUploadIdsRef.current.has(f.uploadId)) {
          return false;
        }

        return true;
      })
      .map((f) => f.fileId!);
  }, [files]);

  /**
   * Helper: Build MessageAttachment[] from current files state
   * Reads from filesRef to get latest state (avoids stale closure)
   * Epic 19 Story 19.2.3: Excludes files whose uploadId is in canceled set
   * Epic 19 Story 19.2.3: Carries uploadId in attachment for downstream cancel checking
   */
  const buildAttachmentsFromRef = useCallback((): MessageAttachment[] => {
    return filesRef.current
      .filter((f) => {
        // Must be complete with fileId
        if (f.stage !== 'complete' || !f.fileId) return false;

        // Epic 19 Story 19.2.3: Exclude canceled files
        // This handles race where file completes after cancel was requested
        if (f.uploadId && canceledUploadIdsRef.current.has(f.uploadId)) {
          console.debug(
            '[useMultiFileUpload] Excluding canceled file from attachments:',
            f.uploadId
          );
          return false;
        }

        return true;
      })
      .map((f) => ({
        fileId: f.fileId!,
        filename: f.filename,
        mimeType: f.mimeType,
        size: f.size,
        uploadId: f.uploadId ?? undefined, // Epic 19: Carry uploadId for downstream cancel checking
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
  // Epic 19 Review Note: waitForCompletion waiter resolution
  // NOTE: With trigger-on-send (Epic 18), 'attached' = ready to send, so including
  // 'attached' as in-flight is conservative but harmless since Composer.tsx no longer
  // uses waitForCompletion (dead code removed in Epic 19 review fix).
  // Keeping 'attached' in the list for backward compatibility with existing tests.
  useEffect(() => {
    // Epic 19 Story 19.2.3: Filter out canceled files when checking in-flight status
    // This ensures waiters resolve when all non-canceled files are done
    const inFlightFiles = files.filter((f) =>
      ['uploading', 'storing', 'attached', 'parsing'].includes(f.stage)
    ).filter((f) => {
      // Don't count canceled files as in-flight
      if (f.uploadId && canceledUploadIdsRef.current.has(f.uploadId)) {
        return false;
      }
      return true;
    });

    const hasInFlight = inFlightFiles.length > 0;

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

  // Epic 19: Cleanup AbortControllers on unmount
  useEffect(() => {
    return () => {
      abortAllControllers();
    };
  }, [abortAllControllers]);

  /**
   * Epic 19 Story 19.2.4: Handle orphaned uploads on WebSocket reconnect
   *
   * When WebSocket reconnects, check for uploads that have been in uploading/storing
   * stage for too long. These are likely orphaned due to missed WS events.
   *
   * Uses aggressive timeout (30s) since we know WS was down.
   */
  useEffect(() => {
    if (!wsAdapter.isConnected) {
      // Disconnected - nothing to do
      return;
    }

    // On reconnect, check for orphaned uploads after delay
    // (gives legitimate WS events time to arrive)
    const checkOrphans = () => {
      const now = Date.now();
      const orphanedIndices: number[] = [];

      // Find files that have been uploading/storing for too long
      filesRef.current.forEach((file) => {
        if (!['uploading', 'storing'].includes(file.stage)) return;

        const startTime = uploadStartTimesRef.current.get(file.localIndex);
        if (startTime && now - startTime > ORPHAN_TIMEOUT_RECONNECT_MS) {
          orphanedIndices.push(file.localIndex);
        }
      });

      if (orphanedIndices.length > 0) {
        console.warn(
          '[useMultiFileUpload] Marking orphaned uploads as error (reconnect):',
          orphanedIndices
        );

        setFiles((prev) =>
          prev.map((f) => {
            if (orphanedIndices.includes(f.localIndex)) {
              // Clean up tracking
              uploadStartTimesRef.current.delete(f.localIndex);
              abortControllerMapRef.current.delete(f.localIndex);

              return {
                ...f,
                stage: 'error' as const,
                progress: 0,
                error: 'Upload interrupted - please try again',
              };
            }
            return f;
          })
        );
      }
    };

    // Run check on reconnect (small delay to let WS events catch up)
    const timeoutId = setTimeout(checkOrphans, 2000);

    return () => clearTimeout(timeoutId);
  }, [wsAdapter.isConnected]);

  /**
   * Epic 19 Story 19.2.4: Periodic orphan check as fallback
   *
   * Even without disconnect detection, check for uploads stuck in
   * uploading/storing for too long. Uses conservative timeout (60s).
   */
  useEffect(() => {
    const checkOrphans = () => {
      const now = Date.now();

      filesRef.current.forEach((file) => {
        // Only check uploading/storing stages
        if (!['uploading', 'storing'].includes(file.stage)) return;

        const startTime = uploadStartTimesRef.current.get(file.localIndex);
        if (startTime && now - startTime > ORPHAN_TIMEOUT_PERIODIC_MS) {
          console.warn(
            '[useMultiFileUpload] Orphan detected (periodic timeout):',
            file.localIndex,
            file.filename
          );

          // Clean up tracking
          uploadStartTimesRef.current.delete(file.localIndex);

          // Abort if controller exists
          const controller = abortControllerMapRef.current.get(file.localIndex);
          if (controller) {
            controller.abort();
            abortControllerMapRef.current.delete(file.localIndex);
          }

          // Transition to error
          setFiles((prev) =>
            prev.map((f) =>
              f.localIndex === file.localIndex
                ? {
                    ...f,
                    stage: 'error' as const,
                    progress: 0,
                    error: 'Upload timed out - please try again',
                  }
                : f
            )
          );
        }
      });
    };

    const intervalId = setInterval(checkOrphans, ORPHAN_CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);

  /**
   * Wait for all in-flight files to complete, then return attachments
   * Epic 18: Updated to include 'attached' as in-flight
   * @param timeoutMs - Timeout in ms (default 30000, 0 = no timeout)
   * @returns Promise<MessageAttachment[]> - completed attachments (latest state)
   */
  const waitForCompletion = useCallback((timeoutMs: number = 30000): Promise<MessageAttachment[]> => {
    // If nothing in flight, resolve immediately with current attachments
    const hasInFlight = filesRef.current.some((f) =>
      ['uploading', 'storing', 'attached', 'parsing'].includes(f.stage)
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
          // Epic 18: Include 'attached' as in-flight
          setFiles((prev) =>
            prev.map((f) =>
              ['uploading', 'storing', 'attached', 'parsing'].includes(f.stage)
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
    isCanceled, // Epic 19 Story 19.2.1: Check if uploadId was canceled
  };
}

// Export for testing
export { UPLOAD_CONCURRENCY_LIMIT, MAX_TOTAL_SIZE };
