/**
 * useFileUpload - Hook for handling file uploads
 *
 * Part of Epic 16: Document Parser Infrastructure
 *
 * Architecture:
 * - HTTP POST multipart for upload (matches backend POST /api/documents/upload)
 * - WebSocket for progress events (reuses existing /chat connection)
 * - uploadId correlation to filter events for this specific upload
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { UploadProgressEvent, IntakeContextResult, ScoringParseResult } from '@/lib/websocket';

/** Backend API base URL from environment */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export type UploadMode = 'intake' | 'scoring';

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
}

/** MVP file types: PDF, DOCX, PNG, JPEG (no .doc) */
const ACCEPTED_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export function useFileUpload(options: UseFileUploadOptions) {
  const { conversationId, mode, wsAdapter, onContextReady, onScoringReady, onError } = options;
  const { token } = useAuth();

  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    uploadId: null,
    progress: 0,
    stage: 'idle',
    message: '',
  });

  // Track selected filename for UI display (Story 4.2 needs this)
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentUploadIdRef = useRef<string | null>(null);

  // Register WebSocket event listeners (filter by uploadId)
  // IMPORTANT: Gate on isConnected to avoid no-op subscriptions before WS ready
  useEffect(() => {
    // Don't subscribe until WebSocket is connected
    if (!wsAdapter.isConnected) {
      return;
    }

    // Progress events
    const unsubProgress = wsAdapter.subscribeUploadProgress((data) => {
      // Filter: only handle events for our current upload
      if (data.conversationId !== conversationId) return;
      if (currentUploadIdRef.current && data.uploadId !== currentUploadIdRef.current) return;

      setUploadProgress({
        uploadId: data.uploadId,
        progress: data.progress,
        stage: data.stage,
        message: data.message,
        error: data.error,
      });

      if (data.stage === 'error' && onError) {
        onError(data.error || 'Upload failed');
      }
    });

    // Intake context ready
    const unsubIntake = wsAdapter.subscribeIntakeContextReady((data) => {
      if (data.conversationId !== conversationId) return;
      if (currentUploadIdRef.current && data.uploadId !== currentUploadIdRef.current) return;

      if (data.success) {
        setUploadProgress({
          uploadId: data.uploadId,
          progress: 100,
          stage: 'complete',
          message: 'Document processed',
        });
        onContextReady?.(data);
      } else {
        setUploadProgress({
          uploadId: data.uploadId,
          progress: 0,
          stage: 'error',
          message: 'Failed to extract context',
          error: data.error,
        });
        onError?.(data.error || 'Failed to extract context');
      }
    });

    // Scoring parse ready
    const unsubScoring = wsAdapter.subscribeScoringParseReady((data) => {
      if (data.conversationId !== conversationId) return;
      if (currentUploadIdRef.current && data.uploadId !== currentUploadIdRef.current) return;

      if (data.success) {
        setUploadProgress({
          uploadId: data.uploadId,
          progress: 100,
          stage: 'complete',
          message: 'Questionnaire parsed',
        });
        onScoringReady?.(data);
      } else {
        setUploadProgress({
          uploadId: data.uploadId,
          progress: 0,
          stage: 'error',
          message: 'Failed to parse questionnaire',
          error: data.error,
        });
        onError?.(data.error || 'Failed to parse questionnaire');
      }
    });

    return () => {
      unsubProgress();
      unsubIntake();
      unsubScoring();
    };
  }, [wsAdapter.isConnected, wsAdapter, conversationId, onContextReady, onScoringReady, onError]);

  // Validate file
  const validateFile = useCallback((file: File): string | null => {
    if (!Object.keys(ACCEPTED_TYPES).includes(file.type)) {
      return 'Unsupported file type. Please upload PDF, DOCX, or image files.';
    }

    if (file.size > MAX_FILE_SIZE) {
      return 'File too large. Maximum size is 20MB.';
    }

    return null;
  }, []);

  // Upload file via HTTP POST multipart
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
      onError?.(validationError);
      return;
    }

    if (!token) {
      setUploadProgress({
        uploadId: null,
        progress: 0,
        stage: 'error',
        message: 'Authentication required',
        error: 'Not authenticated',
      });
      onError?.('Not authenticated');
      return;
    }

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
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || `Upload failed: ${response.status}`);
      }

      // 202 Accepted - get uploadId for event correlation
      const { uploadId } = await response.json();
      currentUploadIdRef.current = uploadId;

      setUploadProgress({
        uploadId,
        progress: 30,
        stage: 'storing',
        message: 'Processing upload...',
      });

      // Progress continues via WebSocket events (filtered by uploadId)

    } catch (error) {
      setUploadProgress({
        uploadId: null,
        progress: 0,
        stage: 'error',
        message: 'Upload failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      onError?.(error instanceof Error ? error.message : 'Upload failed');
    }
  }, [token, conversationId, mode, validateFile, onError]);

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
  const reset = useCallback(() => {
    currentUploadIdRef.current = null;
    setSelectedFilename(null);
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
