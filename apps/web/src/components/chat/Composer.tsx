'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent, forwardRef, useImperativeHandle } from 'react';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Square, Loader2 } from 'lucide-react';
import { ModeSelector, ConversationMode } from './ModeSelector';
import { FileChip } from './FileChip';
import { useMultiFileUpload, UploadMode } from '@/hooks/useMultiFileUpload';
import type { WebSocketAdapterInterface } from '@/hooks/useWebSocketAdapter';
import type { MessageAttachment } from '@/lib/websocket';
import { isXButtonVisible, isBlocking, isSendable, isUploadingAriaLabel } from '@/lib/uploadStageHelpers';
import { cn } from '@/lib/utils';

// Stable fallback adapter for when wsAdapter is not provided
// Module-level constant prevents new object identity on each render
const DISCONNECTED_UPLOAD_ADAPTER = {
  isConnected: false as boolean,
  subscribeUploadProgress: () => () => {},
  subscribeIntakeContextReady: () => () => {},
  subscribeScoringParseReady: () => () => {},
  subscribeFileAttached: () => () => {}, // Epic 18
};

export interface ComposerProps {
  /**
   * Epic 16.6.8: Send message with optional attachments
   * If attachments provided, they will be saved with the message
   */
  onSendMessage: (message: string, attachments?: MessageAttachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
  currentMode?: ConversationMode;
  onModeChange?: (mode: ConversationMode) => void;
  modeChangeDisabled?: boolean;
  isStreaming?: boolean;
  isLoading?: boolean;
  onStopStream?: () => void;
  // Epic 16: Upload support
  wsAdapter?: WebSocketAdapterInterface;
  conversationId?: string;
}

export interface ComposerRef {
  focus: () => void;
  /** Clear all uploaded files from composer (used when scoring auto-completes) */
  clearFiles: () => void;
}

export const Composer = forwardRef<ComposerRef, ComposerProps>(
  (
    {
      onSendMessage,
      disabled = false,
      placeholder = 'Type a message...',
      currentMode = 'consult',
      onModeChange,
      modeChangeDisabled = false,
      isStreaming = false,
      isLoading = false,
      onStopStream,
      // Epic 16 props
      wsAdapter,
      conversationId,
    },
    ref
  ) => {
    const [message, setMessage] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Epic 16: File upload (only enabled when wsAdapter and conversationId are provided)
    const uploadEnabled = !!wsAdapter && !!conversationId;

    // Epic 15 Story 5a.4: Dynamic upload mode based on conversation mode
    // - 'scoring' mode: Parse completed questionnaires for risk analysis
    // - All other modes: Extract vendor context for intake
    const uploadMode: UploadMode = currentMode === 'scoring' ? 'scoring' : 'intake';

    // Use stable fallback adapter when wsAdapter not provided
    // Module-level constant prevents subscription thrashing from object identity changes
    const uploadAdapter = wsAdapter ?? DISCONNECTED_UPLOAD_ADAPTER;

    // Epic 17: Multi-file upload hook
    const {
      files,
      isUploading,
      // aggregateProgress removed from UI - per-file chips provide progress
      addFiles,
      removeFile,
      clearAll,
      uploadAll,
      // waitForCompletion removed - no longer used after Epic 19 review cleanup
      hasFiles,
      hasPendingFiles,
      isCanceled, // Epic 19 Story 19.2.3: Check if uploadId was canceled
    } = useMultiFileUpload({
      maxFiles: 10,
      wsAdapter: uploadAdapter,
      onError: (error: string) => {
        toast.error(error, { duration: 5000 });
      },
      onContextReady: (context) => {
        // Show success toast when document is processed
        const vendorName = context.context?.vendorName;
        toast.success(
          vendorName
            ? `Document processed: ${vendorName}`
            : 'Document processed successfully',
          { duration: 3000 }
        );
      },
    });

    // Epic 19 Story 19.5.2: Drag-and-drop file upload via react-dropzone
    // Compute disabled state (mirrors paperclip behavior)
    const isBusy = isStreaming || isLoading;
    const dropzoneDisabled = disabled || !uploadEnabled || files.length >= 10 || isBusy;

    const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
      accept: {
        'application/pdf': ['.pdf'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
        'image/png': ['.png'],
        'image/jpeg': ['.jpg', '.jpeg'],
      },
      maxSize: 20 * 1024 * 1024, // 20MB per file (matches server)
      maxFiles: Math.max(0, 10 - files.length),
      disabled: dropzoneDisabled,
      noClick: true, // Paperclip handles click
      noKeyboard: true, // Don't hijack textarea shortcuts
      onDrop: (acceptedFiles) => {
        addFiles(acceptedFiles);
      },
      onDropRejected: (fileRejections) => {
        fileRejections.forEach(({ errors }) => {
          errors.forEach((e) => toast.error(e.message));
        });
      },
    });

    // Expose focus and clearFiles methods to parent
    useImperativeHandle(ref, () => ({
      focus: () => {
        textareaRef.current?.focus();
      },
      clearFiles: () => {
        clearAll();
      },
    }));

    // Auto-resize textarea based on content
    useEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // Reset height to auto to get correct scrollHeight
      textarea.style.height = 'auto';

      // Calculate new height (min 60px, max 200px)
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 60), 200);
      textarea.style.height = `${newHeight}px`;
    }, [message]);

    // Epic 17 UX Fix: Auto-upload when pending files exist and conversationId is available
    // This useEffect is necessary because React batches state updates - calling uploadAll()
    // immediately after addFiles() in the same handler would read stale state.
    // The effect runs after state is committed, ensuring latest files state is used.
    useEffect(() => {
      if (hasPendingFiles && conversationId && uploadEnabled) {
        uploadAll(conversationId, uploadMode);
      }
    }, [hasPendingFiles, conversationId, uploadEnabled, uploadAll, uploadMode]);

    const handleSend = async () => {
      const trimmedMessage = message.trim();

      // Need either text or files to send
      if (!trimmedMessage && !hasFiles) return;

      // Epic 18 Sprint 3: Allow send when files are ready (attached/parsing/complete)
      // Only block send if files are in early upload stages (pending/uploading/storing)
      // Epic 19 Review: Use isBlocking() helper for single source of truth
      const hasBlockingFiles = files.some(f => isBlocking(f.stage));
      if (disabled || hasBlockingFiles) return; // Prevent send during early upload

      // Epic 19 Review Fix: Simplified attachment building
      // At this point, all files are in sendable states (attached/parsing/complete/error)
      // because hasEarlyStageFiles check above already returned if any early-stage files exist.
      // The hasPendingFiles branch was unreachable dead code and has been removed.
      let attachments: MessageAttachment[] | undefined;

      if (hasFiles) {
        // Epic 18 Sprint 3: Trigger-on-send flow
        // Send with files that have fileId (attached, parsing, or complete)
        // Don't wait - parsing/scoring will continue in background after send
        // Epic 19 Review Fix: Include uploadId for cancel filtering
        attachments = files
          .filter(f => f.fileId != null && f.stage !== 'error') // Has fileId and not errored
          .map(f => ({
            fileId: f.fileId!,
            filename: f.filename,
            mimeType: f.mimeType,
            size: f.size,
            uploadId: f.uploadId ?? undefined, // Required for cancel filter below
          }));

        // If no files have fileId yet (still in early stages), send without attachments
        if (attachments.length === 0) {
          attachments = undefined;
        }
      }

      // Epic 19 Story 19.2.3: Final check - filter any late-completed canceled files
      // Uses uploadId directly from attachment (added by buildAttachmentsFromRef)
      // This handles race where file was removed from state but completed late
      if (attachments && attachments.length > 0) {
        const validAttachments = attachments.filter((att) => {
          if (att.uploadId && isCanceled(att.uploadId)) {
            console.debug(
              '[Composer] Filtering canceled attachment from send:',
              att.uploadId
            );
            return false;
          }
          return true;
        });
        attachments = validAttachments;
      }

      // Sprint 2 Fix: Don't send empty message if all files failed
      const hasCompletedFiles = attachments && attachments.length > 0;
      if (!trimmedMessage && !hasCompletedFiles) {
        // All files failed, no text - nothing to send
        toast.error('All files failed to upload. Please try again.', { duration: 5000 });
        return;
      }

      // Epic 19 Story 19.2.3: Strip uploadId before sending - it's client-only for cancel tracking
      // Backend does not expect uploadId in MessageAttachment and should not receive it
      const attachmentsForSend = hasCompletedFiles
        ? attachments!.map(({ uploadId, ...rest }) => rest)
        : undefined;

      // Send message with attachments (only if we have some)
      onSendMessage(trimmedMessage || '', attachmentsForSend);
      setMessage('');

      // Epic 17: Clear all files after sending
      clearAll();

      // Reset textarea height after sending
      if (textareaRef.current) {
        textareaRef.current.style.height = '60px';
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter without Shift sends message
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      // Shift+Enter creates new line (default behavior, no action needed)
    };

    // Epic 17: Handle file selection
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(e.target.files);
      }
      // Reset input to allow re-selecting same files
      e.target.value = '';
    };

    // Open file picker (used for keyboard accessibility on the label)
    const openFilePicker = () => {
      fileInputRef.current?.click();
    };

    // Epic 17: Determine layout variant based on file count
    const useCompactChips = files.length > 3;

    // Epic 18 Story 18.3.1: Mode-aware send enablement (trigger-on-send)
    // ALL modes allow send when files are 'attached' (not waiting for enrichment)
    // Uses 'stage' field per Sprint 1B
    // Epic 19 Review Fix: Error files should NOT block send (per behavior-matrix.md)
    // Epic 19 Review: Use isSendable() helper for single source of truth
    const canSendWithAttachments = useMemo(() => {
      // Filter out error files - they should not block send
      // User can still send with other files that succeeded
      const nonErrorFiles = files.filter(f => f.stage !== 'error');

      if (nonErrorFiles.length === 0) return true; // No non-error files = allow text-only send

      // ALL non-error files must be in sendable state (attached/parsing/complete)
      // User can send message with files that are attached/parsing/complete
      // (parsing may continue in background after send)
      return nonErrorFiles.every(f => isSendable(f.stage));
    }, [files]);

    // NOTE: hasIncompleteFiles removed in Epic 19 Story 19.0.2
    // Per behavior-matrix.md, users can freely switch modes without warnings

    // Enable send if we have text OR files that are ready for sending
    // Epic 18: Changed from hasFiles to canSendWithAttachments
    const isSendEnabled = (message.trim().length > 0 || (hasFiles && canSendWithAttachments)) && !disabled;
    // Note: isBusy is defined earlier for dropzone disabled state

    return (
      <div className="bg-white p-2">
        {/* Hidden file input with id for label-based activation
            Using label htmlFor is more reliable than programmatic click() */}
        <input
          ref={fileInputRef}
          id="composer-file-input"
          type="file"
          accept=".pdf,.docx,.png,.jpg,.jpeg"
          multiple
          onChange={handleFileChange}
          className="hidden"
          tabIndex={-1}
        />

        {/* Centered composer container */}
        <div className="max-w-3xl mx-auto">
          {/* Elevated composer box - Epic 19 Story 19.5.2: Wrapped with dropzone */}
          <div
            {...getRootProps()}
            className={cn(
              'border border-gray-200 rounded-2xl shadow-lg bg-white overflow-hidden transition-all duration-200 relative',
              isDragActive && !isDragReject && 'border-blue-400 border-2 bg-blue-50/30',
              isDragReject && 'border-red-500 border-2 bg-red-50/30'
            )}
          >
            {/* Epic 19 Story 19.5.2: Drag overlay */}
            {isDragActive && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-blue-500/10 rounded-2xl pointer-events-none z-10"
                role="status"
                aria-live="polite"
              >
                <span
                  className={cn(
                    'font-medium',
                    isDragReject ? 'text-red-600' : 'text-blue-600'
                  )}
                >
                  {isDragReject ? 'Invalid file type' : 'Drop files here'}
                </span>
              </div>
            )}

            {/* Hidden dropzone input - separate from paperclip input */}
            <input {...getInputProps()} className="hidden" />

            {/* Epic 17: File chips - INSIDE composer, above textarea */}
            {hasFiles && (
              <div className="px-4 pt-3">
                <div className="flex flex-wrap gap-2">
                  {files.map((file) => {
                    // Epic 19 Story 19.0.5: X button visible during uploading/storing, hidden only during parsing
                    // Uses isXButtonVisible from 19.0.1 - single source of truth
                    // Reference: behavior-matrix.md lines 166-179
                    const isRemoveDisabled = !isXButtonVisible(file.stage);
                    return (
                      <FileChip
                        key={file.localIndex}
                        filename={file.filename}
                        stage={file.stage}
                        progress={file.progress}
                        error={file.error}
                        onRemove={() => removeFile(file.localIndex)}
                        disabled={isRemoveDisabled}
                        variant={useCompactChips ? 'compact' : 'default'}
                        // Epic 18: Pass document type for wrong-mode warnings
                        detectedDocType={file.metadata?.detectedDocType}
                        mode={currentMode}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Textarea section */}
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isBusy}
              rows={1}
              className={`w-full resize-none border-0 px-4 pt-4 pb-2 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 disabled:bg-gray-50 disabled:text-gray-500 ${
                isBusy ? 'hidden' : 'block'
              }`}
              style={{ minHeight: isBusy ? '0px' : '60px', maxHeight: '200px' }}
              aria-label="Message input"
            />

            {/* Toolbar section (bottom) */}
            <div className={`flex items-center justify-between px-4 ${isBusy ? 'py-3' : 'pb-3 pt-1'}`}>
              {/* Left group: Mode selector + File upload button */}
              <div className="flex items-center gap-2">
                {/* Hide tools when streaming */}
                {!isBusy && (
                  <>
                    {/* Mode Selector */}
                    {onModeChange && (
                      <ModeSelector
                        selectedMode={currentMode}
                        onModeChange={onModeChange}
                        disabled={disabled || modeChangeDisabled}
                      />
                    )}

                    {/* File upload label - uses native label->input association
                        This is more reliable than programmatic click() across browsers
                        Epic 19 Story 19.1.5: File picker enabled during upload (removed isUploading gate) */}
                    <label
                      htmlFor="composer-file-input"
                      className={`inline-flex items-center justify-center h-9 w-9 rounded-lg cursor-pointer transition-colors ${
                        disabled || !uploadEnabled || files.length >= 10
                          ? 'text-gray-300 cursor-not-allowed pointer-events-none'
                          : 'text-gray-500 hover:bg-gray-100'
                      }`}
                      aria-label="Attach file"
                      role="button"
                      tabIndex={disabled || !uploadEnabled || files.length >= 10 ? -1 : 0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                    >
                      <Paperclip className="h-5 w-5" />
                    </label>
                  </>
                )}
              </div>

              {/* Right group: Send button or Stop button */}
              {isStreaming && onStopStream ? (
                <Button
                  type="button"
                  onClick={onStopStream}
                  className="h-8 w-8 rounded-full p-0 bg-red-500 hover:bg-red-600 text-white"
                  aria-label="Stop generating"
                  title="Stop generating"
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={!isSendEnabled}
                  className="h-8 w-8 rounded-full p-0 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-700 text-white"
                  aria-label={isUploadingAriaLabel(files) ? 'Uploading files...' : 'Send message'}
                >
                  {/* Sprint 2 Fix: Show loader during upload (includes pending stage per behavior-matrix) */}
                  {isUploadingAriaLabel(files) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
            {/* Epic 17 UX Fix: Removed aggregate progress bar (redundant with per-file chips) */}
          </div>
        </div>
      </div>
    );
  }
);

Composer.displayName = 'Composer';
