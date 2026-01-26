/**
 * useFileUpload - Hook for handling file uploads
 *
 * Part of Epic 16: Document Parser Infrastructure
 *
 * Architecture:
 * - HTTP POST multipart for upload (matches backend POST /api/documents/upload)
 * - WebSocket for progress events (reuses existing /chat connection)
 * - uploadId correlation to filter events for this specific upload
 *
 * Epic 16.6.1: Race condition protection
 * - "Never adopt" pattern: Only process WS events for uploadId returned by HTTP response
 * - AbortController for cancelling in-flight uploads
 * - Prevents chip resurrection after cancel
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { UploadProgressEvent, IntakeContextResult, ScoringParseResult } from '@/lib/websocket';

/** Backend API base URL from environment */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export type UploadMode = 'intake' | 'scoring';

/**
 * Epic 16.6.8: File metadata for attachments
 * Epic 16.6.9: storagePath removed - never exposed to client
 */
export interface FileMetadata {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface UploadProgress {
  uploadId: string | null;
  progress: number;
  stage: 'idle' | 'selecting' | 'uploading' | 'storing' | 'parsing' | 'complete' | 'error';
  message: string;
  error?: string;
}

export interface UseFileUploadOptions {
  conversationId: string;
  mode: UploadMode;
  /** WebSocket adapter for receiving progress events */
  wsAdapter: {
    /** Connection state - subscriptions only work when true */
    isConnected: boolean;
    subscribeUploadProgress: (handler: (data: UploadProgressEvent) => void) => () => void;
    subscribeIntakeContextReady: (handler: (data: IntakeContextResult) => void) => () => void;
    subscribeScoringParseReady: (handler: (data: ScoringParseResult) => void) => () => void;
  };
  onContextReady?: (context: IntakeContextResult) => void;
  onScoringReady?: (result: ScoringParseResult) => void;
  onError?: (error: string) => void;
  /** Epic 30 Sprint 2: Warning callback for large images (4-5MB) */
  onWarning?: (warning: string) => void;
}

/** MVP file types: PDF, DOCX, PNG, JPEG, GIF, WebP (no .doc) */
const ACCEPTED_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
};

/** Size limits aligned with backend (packages/backend/src/application/interfaces/IDocumentParser.ts) */
const MAX_FILE_SIZES: Record<string, number> = {
  'application/pdf': 20 * 1024 * 1024,           // 20MB
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 20 * 1024 * 1024, // 20MB
  'image/png': 5 * 1024 * 1024,                  // 5MB - Anthropic Vision API limit
  'image/jpeg': 5 * 1024 * 1024,                 // 5MB - Anthropic Vision API limit
  'image/gif': 5 * 1024 * 1024,                  // 5MB - Anthropic Vision API limit
  'image/webp': 5 * 1024 * 1024,                 // 5MB - Anthropic Vision API limit
};

const DEFAULT_MAX_SIZE = 20 * 1024 * 1024; // 20MB fallback

/**
 * Epic 30 Sprint 2: Warning threshold for large images
 * Images between 4-5MB proceed but show a warning toast.
 * Provides user feedback about file size while still allowing the upload.
 */
const WARN_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB - warning threshold

/** Image MIME types subject to warning threshold */
const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export function useFileUpload(options: UseFileUploadOptions) {
  const { conversationId, mode, wsAdapter, onContextReady, onScoringReady, onError, onWarning } = options;
  const { token } = useAuth();

  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    uploadId: null,
    progress: 0,
    stage: 'idle',
    message: '',
  });

  // Track selected filename for UI display (Story 4.2 needs this)
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);

  // Epic 16.6.8: Track file metadata for attachments (populated on context ready)
  const [fileMetadata, setFileMetadata] = useState<FileMetadata | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentUploadIdRef = useRef<string | null>(null);

  // Epic 16.6.1: AbortController for cancelling in-flight uploads
  const abortControllerRef = useRef<AbortController | null>(null);

  // Store callbacks in refs to decouple subscription lifecycle from callback identity
  // This prevents subscription thrashing when callbacks change (e.g., on every render)
  const onContextReadyRef = useRef(onContextReady);
  const onScoringReadyRef = useRef(onScoringReady);
  const onErrorRef = useRef(onError);
  const onWarningRef = useRef(onWarning);

  // Keep refs updated with latest callbacks
  onContextReadyRef.current = onContextReady;
  onScoringReadyRef.current = onScoringReady;
  onErrorRef.current = onError;
  onWarningRef.current = onWarning;

  // Register WebSocket event listeners (filter by uploadId)
  // IMPORTANT: Gate on isConnected to avoid no-op subscriptions before WS ready
  // IMPORTANT: Callbacks are accessed via refs to prevent subscription thrashing
  // when callback identity changes (e.g., inline lambdas that change every render)
  //
  // Epic 16.6.1: "Never adopt" pattern - all handlers MUST require uploadId match
  // This prevents race conditions where cancel is followed by late WS events
  useEffect(() => {
    // Don't subscribe until WebSocket is connected
    if (!wsAdapter.isConnected) {
      return;
    }

    // Progress events
    const unsubProgress = wsAdapter.subscribeUploadProgress((data) => {
      // Filter: only handle events for our current upload
      if (data.conversationId !== conversationId) return;

      // Epic 16.6.1: "Never adopt" - only accept events for known uploadId
      // If uploadId is null (HTTP in flight or cancelled), ignore all events
      if (!currentUploadIdRef.current) return;
      if (data.uploadId !== currentUploadIdRef.current) return;

      setUploadProgress({
        uploadId: data.uploadId,
        progress: data.progress,
        stage: data.stage,
        message: data.message,
        error: data.error,
      });

      if (data.stage === 'error') {
        onErrorRef.current?.(data.error || 'Upload failed');
      }
    });

    // Intake context ready
    const unsubIntake = wsAdapter.subscribeIntakeContextReady((data) => {
      if (data.conversationId !== conversationId) return;

      // Epic 16.6.1: "Never adopt" - only accept events for known uploadId
      // This prevents chip resurrection after cancel
      if (!currentUploadIdRef.current) return;
      if (data.uploadId !== currentUploadIdRef.current) return;

      if (data.success) {
        setUploadProgress({
          uploadId: data.uploadId,
          progress: 100,
          stage: 'complete',
          message: 'Document processed',
        });
        // Epic 16.6.8: Capture file metadata for attachment
        // Epic 16.6.9: storagePath no longer sent by backend
        if (data.fileMetadata) {
          setFileMetadata({
            fileId: data.fileMetadata.fileId,
            filename: data.fileMetadata.filename,
            mimeType: data.fileMetadata.mimeType,
            size: data.fileMetadata.size,
          });
        }
        onContextReadyRef.current?.(data);
      } else {
        setUploadProgress({
          uploadId: data.uploadId,
          progress: 0,
          stage: 'error',
          message: 'Failed to extract context',
          error: data.error,
        });
        onErrorRef.current?.(data.error || 'Failed to extract context');
      }
    });

    // Scoring parse ready
    const unsubScoring = wsAdapter.subscribeScoringParseReady((data) => {
      if (data.conversationId !== conversationId) return;

      // Epic 16.6.1: "Never adopt" - only accept events for known uploadId
      // This prevents chip resurrection after cancel
      if (!currentUploadIdRef.current) return;
      if (data.uploadId !== currentUploadIdRef.current) return;

      if (data.success) {
        setUploadProgress({
          uploadId: data.uploadId,
          progress: 100,
          stage: 'complete',
          message: 'Questionnaire parsed',
        });
        // Epic 16.6.8: Capture file metadata for attachment
        // Epic 16.6.9: storagePath no longer sent by backend
        if (data.fileMetadata) {
          setFileMetadata({
            fileId: data.fileMetadata.fileId,
            filename: data.fileMetadata.filename,
            mimeType: data.fileMetadata.mimeType,
            size: data.fileMetadata.size,
          });
        }
        onScoringReadyRef.current?.(data);
      } else {
        setUploadProgress({
          uploadId: data.uploadId,
          progress: 0,
          stage: 'error',
          message: 'Failed to parse questionnaire',
          error: data.error,
        });
        onErrorRef.current?.(data.error || 'Failed to parse questionnaire');
      }
    });

    return () => {
      unsubProgress();
      unsubIntake();
      unsubScoring();
    };
    // Dependencies: Only resubscribe on connection state or conversationId change
    // Callbacks are accessed via refs to prevent thrashing on callback identity changes
  }, [wsAdapter.isConnected, wsAdapter.subscribeUploadProgress, wsAdapter.subscribeIntakeContextReady, wsAdapter.subscribeScoringParseReady, conversationId]);

  // Validate file (type + size limits aligned with backend)
  const validateFile = useCallback((file: File): string | null => {
    if (!Object.keys(ACCEPTED_TYPES).includes(file.type)) {
      return 'Unsupported file type. Please upload PDF, DOCX, or image files.';
    }

    const maxSize = MAX_FILE_SIZES[file.type] ?? DEFAULT_MAX_SIZE;
    if (file.size > maxSize) {
      const maxMB = maxSize / (1024 * 1024);
      return `File too large. Maximum size for this file type is ${maxMB}MB.`;
    }

    return null;
  }, []);

  /**
   * Epic 30 Sprint 2: Check if file should trigger a warning (non-blocking)
   * Returns warning message for images between 4-5MB, null otherwise.
   */
  const checkFileSizeWarning = useCallback((file: File): string | null => {
    if (IMAGE_MIME_TYPES.includes(file.type) && file.size >= WARN_IMAGE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return `Large image (${sizeMB}MB). Consider compressing for faster upload.`;
    }
    return null;
  }, []);

  // Upload file via HTTP POST multipart
  // Epic 16.6.1: Uses AbortController for cancellation + race condition protection
  const uploadFile = useCallback(async (file: File) => {
    // Track filename for UI display
    setSelectedFilename(file.name);

    const validationError = validateFile(file);
    if (validationError) {
      setUploadProgress({
        uploadId: null,
        progress: 0,
        stage: 'error',
        message: 'Validation failed',
        error: validationError,
      });
      onErrorRef.current?.(validationError);
      return;
    }

    // Epic 30 Sprint 2: Check for warning (non-blocking) after validation passes
    const warning = checkFileSizeWarning(file);
    if (warning) {
      onWarningRef.current?.(warning);
    }

    if (!token) {
      setUploadProgress({
        uploadId: null,
        progress: 0,
        stage: 'error',
        message: 'Authentication required',
        error: 'Not authenticated',
      });
      onErrorRef.current?.('Not authenticated');
      return;
    }

    // Epic 16.6.1: Clear any previous upload state
    // This ensures WS events from previous uploads are ignored
    currentUploadIdRef.current = null;

    // Epic 16.6.1: Create AbortController for cancellation
    abortControllerRef.current = new AbortController();

    setUploadProgress({
      uploadId: null,
      progress: 10,
      stage: 'uploading',
      message: 'Uploading file...',
    });

    try {
      // Build multipart form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversationId', conversationId);
      formData.append('mode', mode);

      // HTTP POST to backend /api/documents/upload
      // Note: Use full URL since backend runs on different port (8000 vs 3000)
      const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Note: Don't set Content-Type for FormData - browser sets multipart boundary
        },
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || `Upload failed: ${response.status}`);
      }

      // Check if aborted during response parsing
      if (abortControllerRef.current?.signal.aborted) {
        return; // Cancelled, don't set uploadId
      }

      // 202 Accepted - get uploadId for event correlation
      const { uploadId } = await response.json();

      // Epic 16.6.1: Set uploadId - now WS events for this ID will be accepted
      currentUploadIdRef.current = uploadId;

      setUploadProgress({
        uploadId,
        progress: 30,
        stage: 'storing',
        message: 'Processing upload...',
      });

      // Progress continues via WebSocket events (filtered by uploadId)

    } catch (error) {
      // Epic 16.6.1: Handle abort gracefully (user cancelled)
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled - reset quietly, don't set error state
        setUploadProgress({
          uploadId: null,
          progress: 0,
          stage: 'idle',
          message: '',
        });
        return;
      }

      setUploadProgress({
        uploadId: null,
        progress: 0,
        stage: 'error',
        message: 'Upload failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      onErrorRef.current?.(error instanceof Error ? error.message : 'Upload failed');
    }
  }, [token, conversationId, mode, validateFile, checkFileSizeWarning]);

  // Open file picker
  const openFilePicker = useCallback(() => {
    setUploadProgress({
      uploadId: null,
      progress: 0,
      stage: 'selecting',
      message: 'Select a file...',
    });
    fileInputRef.current?.click();
  }, []);

  // Handle file selection
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
    // Reset input for re-selection
    e.target.value = '';
  }, [uploadFile]);

  // Reset state (named 'reset' to match Story 4.2 usage)
  // Epic 16.6.1: Also aborts in-flight upload and clears uploadId to prevent race conditions
  // Epic 16.6.8: Also clears fileMetadata
  const reset = useCallback(() => {
    // Cancel in-progress HTTP request
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    // Clear uploadId - any incoming WS events will be ignored
    currentUploadIdRef.current = null;

    setSelectedFilename(null);
    setFileMetadata(null);
    setUploadProgress({
      uploadId: null,
      progress: 0,
      stage: 'idle',
      message: '',
    });
  }, []);

  return {
    uploadProgress,
    selectedFilename,  // For UploadProgress component (Story 4.2)
    fileMetadata,      // Epic 16.6.8: For attaching file to message
    fileInputRef,
    openFilePicker,
    handleFileChange,
    uploadFile,
    reset,  // Named 'reset' to match Story 4.2 UploadProgress onDismiss
    isUploading: ['uploading', 'storing', 'parsing'].includes(uploadProgress.stage),
    acceptedTypes: Object.entries(ACCEPTED_TYPES)
      .flatMap(([, exts]) => exts)
      .join(','),
  };
}

// Re-export types for consumers
export type { UploadProgressEvent, IntakeContextResult, ScoringParseResult };
