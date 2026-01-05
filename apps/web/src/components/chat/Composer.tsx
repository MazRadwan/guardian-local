'use client';

import React, { useState, useRef, useEffect, useCallback, KeyboardEvent, forwardRef, useImperativeHandle } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Square, Loader2 } from 'lucide-react';
import { ModeSelector, ConversationMode } from './ModeSelector';
import { FileChip } from './FileChip';
import { useMultiFileUpload, UploadMode } from '@/hooks/useMultiFileUpload';
import type { WebSocketAdapterInterface } from '@/hooks/useWebSocketAdapter';
import type { MessageAttachment } from '@/lib/websocket';

// Stable fallback adapter for when wsAdapter is not provided
// Module-level constant prevents new object identity on each render
const DISCONNECTED_UPLOAD_ADAPTER = {
  isConnected: false as boolean,
  subscribeUploadProgress: () => () => {},
  subscribeIntakeContextReady: () => () => {},
  subscribeScoringParseReady: () => () => {},
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
  // Epic 15: Scoring mode visibility
  showScoringMode?: boolean;
}

export interface ComposerRef {
  focus: () => void;
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
      // Epic 15 props
      showScoringMode = false,
    },
    ref
  ) => {
    const [message, setMessage] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Epic 16: File upload (only enabled when wsAdapter and conversationId are provided)
    const uploadEnabled = !!wsAdapter && !!conversationId;

    // MVP: Always use 'intake' mode for document parsing (extracts vendor context)
    // Future: Wire 'scoring' mode when assessment mode needs to parse completed questionnaires
    // See: packages/backend/src/application/interfaces/IScoringDocumentParser.ts
    const uploadMode: UploadMode = 'intake';

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
      waitForCompletion,
      hasFiles,
      hasPendingFiles,
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

    // Expose focus method to parent
    useImperativeHandle(ref, () => ({
      focus: () => {
        textareaRef.current?.focus();
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
      if (disabled || isUploading) return; // Prevent send during upload

      // Sprint 2 Fix: Use attachments returned directly from waitForCompletion()
      // This avoids stale closure - the returned value is read from latest state
      let attachments: MessageAttachment[] | undefined;

      // Epic 17: Upload pending files first, then wait for WS completion
      if (hasPendingFiles && conversationId) {
        try {
          await uploadAll(conversationId, uploadMode);
          // CRITICAL: waitForCompletion() returns attachments from LATEST state
          // This avoids the stale closure issue - we don't read from captured `files`
          attachments = await waitForCompletion();
        } catch (error) {
          // Timeout or other error - show toast and abort send
          const errorMsg = error instanceof Error ? error.message : 'Upload failed';
          toast.error(errorMsg, { duration: 5000 });
          return;
        }
      } else if (hasFiles) {
        // Files already uploaded, get attachments from current state
        // Still use waitForCompletion() to get latest state (returns immediately if nothing in-flight)
        attachments = await waitForCompletion();
      }

      // Sprint 2 Fix: Don't send empty message if all files failed
      const hasCompletedFiles = attachments && attachments.length > 0;
      if (!trimmedMessage && !hasCompletedFiles) {
        // All files failed, no text - nothing to send
        toast.error('All files failed to upload. Please try again.', { duration: 5000 });
        return;
      }

      // Send message with attachments (only if we have some)
      onSendMessage(trimmedMessage || '', hasCompletedFiles ? attachments : undefined);
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

    // Open file picker
    const openFilePicker = () => {
      fileInputRef.current?.click();
    };

    // Epic 17: Determine layout variant based on file count
    const useCompactChips = files.length > 3;

    // Epic 17: Enable send if we have text OR files (including pending)
    // Sprint 2 Fix: Disable send during upload to prevent double-click
    const isSendEnabled = (message.trim().length > 0 || hasFiles) && !disabled && !isUploading;
    const isBusy = isStreaming || isLoading;

    return (
      <div className="bg-white p-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.png,.jpg,.jpeg"
          multiple
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />

        {/* Centered composer container */}
        <div className="max-w-3xl mx-auto">
          {/* Elevated composer box */}
          <div className="border border-gray-200 rounded-2xl shadow-lg bg-white overflow-hidden">
            {/* Epic 17: File chips - INSIDE composer, above textarea */}
            {hasFiles && (
              <div className="px-4 pt-3">
                <div className="flex flex-wrap gap-2">
                  {files.map((file) => {
                    // Epic 17 UX Fix: Per-file disable for remove button
                    // Only disable on files currently in-flight, not globally
                    const isFileInFlight = ['uploading', 'storing', 'parsing'].includes(file.stage);
                    return (
                      <FileChip
                        key={file.localIndex}
                        filename={file.filename}
                        stage={file.stage}
                        progress={file.progress}
                        error={file.error}
                        onRemove={() => removeFile(file.localIndex)}
                        disabled={isFileInFlight}
                        variant={useCompactChips ? 'compact' : 'default'}
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
                        showScoringMode={showScoringMode}
                      />
                    )}

                    {/* File upload button - only enabled when upload is available */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-gray-500 hover:bg-gray-100 rounded-lg"
                      disabled={disabled || !uploadEnabled || isUploading || files.length >= 10}
                      aria-label="Attach file"
                      onClick={openFilePicker}
                    >
                      <Paperclip className="h-5 w-5" />
                    </Button>
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
                  aria-label={isUploading ? 'Uploading files...' : 'Send message'}
                >
                  {/* Sprint 2 Fix: Show loader during upload */}
                  {isUploading ? (
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
