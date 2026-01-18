'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { ScoringResultCard } from './ScoringResultCard';
import { AlertCircle, Shield } from 'lucide-react';
import { useChatController } from '@/hooks/useChatController';
import { useChatStore } from '@/stores/chatStore';
import { useAuth } from '@/hooks/useAuth';
import { useQuestionnairePersistence } from '@/hooks/useQuestionnairePersistence';
import type { QuestionnaireReadyPayload, MessageAttachment } from '@/lib/websocket';

export function ChatInterface() {
  const {
    messages,
    isLoading,
    error,
    isStreaming,
    isConnected,
    mode,
    isChanging,
    showDelayedLoading,
    regeneratingMessageIndex,
    composerRef,
    messageListRef,
    handleSendMessage,
    handleModeChange,
    handleRegenerate,
    abortStream,
    setError,
    activeConversationId,
    adapter,
  } = useChatController();

  // Get user and token from auth context
  const { user, token } = useAuth();

  // Persistence hook - MUST be at top level
  const persistence = useQuestionnairePersistence(user?.id);

  // Questionnaire generation state from store
  const pendingQuestionnaire = useChatStore((state) => state.pendingQuestionnaire);
  const questionnaireUIState = useChatStore((state) => state.questionnaireUIState);
  const questionnaireError = useChatStore((state) => state.questionnaireError);
  const exportReadyByConversation = useChatStore((state) => state.exportReadyByConversation);
  const setGenerating = useChatStore((state) => state.setGenerating);
  const clearPendingQuestionnaire = useChatStore((state) => state.clearPendingQuestionnaire);
  const setQuestionnaireUIState = useChatStore((state) => state.setQuestionnaireUIState);

  // Stepper state from store (Story 13.4.3)
  const generationSteps = useChatStore((state) => state.generationSteps);
  const currentGenerationStep = useChatStore((state) => state.currentGenerationStep);
  const isGeneratingQuestionnaire = useChatStore((state) => state.isGeneratingQuestionnaire);
  const setCurrentGenerationStep = useChatStore((state) => state.setCurrentGenerationStep);
  const resetGenerationStep = useChatStore((state) => state.resetGenerationStep);

  // Story 14.1.2: Position for inline questionnaire rendering
  const questionnaireMessageIndex = useChatStore((state) => state.questionnaireMessageIndex);

  // Story 14.1.5: Gate download visibility until stream completes
  const isQuestionnaireStreamComplete = useChatStore((state) => state.isQuestionnaireStreamComplete);

  // Scoring state (Stories 5b, 5c)
  const scoringResult = useChatStore((state) => state.scoringResult);
  const scoringProgress = useChatStore((state) => state.scoringProgress);
  const resetScoring = useChatStore((state) => state.resetScoring);
  const scoringResultByConversation = useChatStore((state) => state.scoringResultByConversation);
  const setScoringResult = useChatStore((state) => state.setScoringResult);

  // Epic 18.4.2b: Vendor clarification state
  const vendorClarification = useChatStore((state) => state.vendorClarification);
  const clearVendorClarification = useChatStore((state) => state.clearVendorClarification);

  // Epic 21 Story 21.7: Sidebar minimized state for canvas logo
  const sidebarMinimized = useChatStore((state) => state.sidebarMinimized);

  // Get export data for active conversation
  const exportData = activeConversationId
    ? exportReadyByConversation[activeConversationId]
    : null;

  // Story 14.1.5: Gate both exportData AND uiState until stream is complete
  // This ensures download bubble renders AFTER the streamed questionnaire content
  // AND prevents UI state mismatch (showing 'download' state without export data)
  const gatedExportData = isQuestionnaireStreamComplete ? exportData : null;
  const gatedUIState = (questionnaireUIState === 'download' && !isQuestionnaireStreamComplete)
    ? 'generating' // Show generating state while waiting for stream to complete
    : questionnaireUIState;

  // Track previous conversation ID to detect actual changes
  const prevConversationIdRef = useRef<string | null>(null);

  // Rehydrate questionnaire state from localStorage on conversation switch
  useEffect(() => {
    if (!activeConversationId || !user?.id) return;

    const applyPayloadIfValid = (payload: QuestionnaireReadyPayload | null) => {
      if (!payload) return false;

      const isValid =
        payload.conversationId === activeConversationId &&
        Boolean(payload.assessmentType);

      if (isValid) {
        useChatStore.getState().setPendingQuestionnaire(payload);
        return true;
      }

      // Malformed or mismatched payload - clear to prevent stale state
      persistence.clearPayload(activeConversationId);
      return false;
    };

    // GUARD 1: Only rehydrate if conversation actually changed
    if (prevConversationIdRef.current === activeConversationId) {
      return;
    }
    prevConversationIdRef.current = activeConversationId;

    // GUARD 2: Don't clear if generation is in progress
    const { isGeneratingQuestionnaire } = useChatStore.getState();
    if (isGeneratingQuestionnaire) {
      console.log('[ChatInterface] Skipping rehydration - generation in progress');
      return;
    }

    // Always clear previous conversation's UI state first
    useChatStore.getState().clearPendingQuestionnaire();
    useChatStore.getState().setQuestionnaireUIState('hidden');

    // Priority 1: Check in-memory export state (survives conversation switch)
    const exportData = useChatStore.getState().exportReadyByConversation?.[activeConversationId];
    if (exportData && exportData.conversationId === activeConversationId) {
      // BUGFIX: Still need payload for QuestionnairePromptCard to render
      const savedPayload = persistence.loadPayload(activeConversationId);
      applyPayloadIfValid(savedPayload);
      useChatStore.getState().setQuestionnaireUIState('download');
      // Story 14.1.5: No active stream on rehydration, enable download visibility
      useChatStore.getState().setQuestionnaireStreamComplete(true);
      return;
    }

    // Story 13.3.2: Priority 1.5 - Check localStorage export (page reload case)
    const savedExport = persistence.loadExport(activeConversationId);
    if (savedExport && savedExport.conversationId === activeConversationId) {
      // Restore to in-memory cache
      useChatStore.getState().setExportReady(activeConversationId, savedExport);
      // Also restore payload for card rendering
      const savedPayload = persistence.loadPayload(activeConversationId);
      applyPayloadIfValid(savedPayload);
      useChatStore.getState().setQuestionnaireUIState('download');
      // Story 14.1.5: No active stream on rehydration, enable download visibility
      useChatStore.getState().setQuestionnaireStreamComplete(true);
      return;
    }

    // Priority 2: Check localStorage payload with shape validation
    const savedPayload = persistence.loadPayload(activeConversationId);
    if (applyPayloadIfValid(savedPayload)) {
      useChatStore.getState().setQuestionnaireUIState('ready');
    }
  }, [activeConversationId, user?.id, persistence]);

  // Reset stepper when conversation changes (Story 13.5.4)
  useEffect(() => {
    resetGenerationStep();
  }, [activeConversationId, resetGenerationStep]);

  // Story 5c: Restore/reset scoring state when conversation changes
  useEffect(() => {
    if (!activeConversationId) {
      resetScoring();
      return;
    }

    // Check cache for existing scoring result for this conversation
    const cachedResult = scoringResultByConversation[activeConversationId];
    if (cachedResult) {
      // Restore from cache
      console.log('[ChatInterface] Restoring scoring result from cache for conversation:', activeConversationId);
      setScoringResult(cachedResult);
      // Set progress to complete since we have results
      useChatStore.getState().updateScoringProgress({
        status: 'complete',
        message: 'Analysis complete!',
      });
    } else {
      // No cached result - reset to idle
      resetScoring();
    }
  }, [activeConversationId, resetScoring, scoringResultByConversation, setScoringResult]);

  // Story 5b: Clear Composer files when scoring completes
  const prevScoringStatusRef = useRef<string>('idle');
  useEffect(() => {
    const currentStatus = scoringProgress.status;
    const previousStatus = prevScoringStatusRef.current;
    prevScoringStatusRef.current = currentStatus;

    // When status transitions TO 'complete' (not just IS complete)
    if (currentStatus === 'complete' && previousStatus !== 'complete' && previousStatus !== 'idle') {
      console.log('[ChatInterface] Scoring complete - clearing Composer files');
      composerRef.current?.clearFiles();
    }
  }, [scoringProgress.status, composerRef]);

  const handleGenerateQuestionnaire = useCallback(() => {
    if (!pendingQuestionnaire || !adapter) return;

    // Reset stepper and start at step 0 (immediate feedback before backend response)
    resetGenerationStep();
    setCurrentGenerationStep(0);

    // Transition to generating state
    setQuestionnaireUIState('generating');
    setGenerating(true);

    // Emit generation request - backend handles phase progression (Story 13.5.4)
    adapter.generateQuestionnaire({
      conversationId: pendingQuestionnaire.conversationId,
      assessmentType: pendingQuestionnaire.assessmentType,
      vendorName: pendingQuestionnaire.vendorName,
      solutionName: pendingQuestionnaire.solutionName,
      contextSummary: pendingQuestionnaire.contextSummary,
      selectedCategories: pendingQuestionnaire.selectedCategories,
    });

    // State transitions happen via WebSocket event handlers:
    // - generation_phase events -> step progression (handled in useWebSocketEvents)
    // - export_ready event -> 'download' state, step complete
    // - extraction_failed event -> 'error' state, stepper reset
  }, [
    pendingQuestionnaire,
    adapter,
    setGenerating,
    setQuestionnaireUIState,
    setCurrentGenerationStep,
    resetGenerationStep,
  ]);

  const handleDownload = useCallback(async (format: string) => {
    if (!exportData || !token) return;

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(
        `${apiUrl}/api/assessments/${exportData.assessmentId}/export/${format}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Set filename based on format with timestamp
      const extension = format === 'word' ? 'docx' : format === 'excel' ? 'xlsx' : 'pdf';
      const timestamp = new Date().toISOString().split('T')[0];
      a.download = `questionnaire-${timestamp}.${extension}`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log(`[ChatInterface] Successfully downloaded ${format.toUpperCase()} file`);

      // Story 13.3.1: Keep download state visible for re-downloads
      // State only clears on: conversation delete, new questionnaire_ready, or extraction error
    } catch (err) {
      console.error('[ChatInterface] Download error:', err);
      // Don't change state on download error - user can retry
    }
  }, [exportData, token]);

  /**
   * Epic 16.6.9: Download file attachment from chat message
   * Uses fileId-based endpoint (no storagePath exposure)
   */
  const handleDownloadAttachment = useCallback(async (attachment: MessageAttachment) => {
    if (!token) {
      console.error('[ChatInterface] Cannot download attachment: not authenticated');
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // Epic 16.6.9: Use fileId-based endpoint (no storagePath exposure)
      const downloadUrl = `${apiUrl}/api/documents/${attachment.fileId}/download`;

      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log(`[ChatInterface] Successfully downloaded attachment: ${attachment.filename}`);
    } catch (err) {
      console.error('[ChatInterface] Attachment download error:', err);
      setError(`Failed to download ${attachment.filename}`);
    }
  }, [token, setError]);

  /**
   * Epic 18.4.2b: Handle vendor selection from clarification card
   * Sends vendor_selected event to backend.
   * State is NOT cleared here - it's cleared in handleScoringStarted when
   * scoring begins, ensuring users can re-select if there's an error.
   */
  const handleSelectVendor = useCallback((vendorName: string) => {
    if (!adapter || !vendorClarification) return;

    console.log('[ChatInterface] User selected vendor:', vendorName);

    // Emit vendor_selected event to backend
    // Note: State cleared when scoring_started received (confirms success)
    adapter.selectVendor(vendorClarification.conversationId, vendorName);
  }, [adapter, vendorClarification]);

  return (
    <div className="flex h-full flex-col relative">
      {/* Epic 21 Story 21.7: Guardian logo - visible when sidebar minimized */}
      {sidebarMinimized && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          <Shield className="h-6 w-6 text-sky-500" />
          <span className="text-lg font-semibold text-gray-900">Guardian</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 px-6 py-3 text-sm text-red-800 shrink-0">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-800">
            Dismiss
          </button>
        </div>
      )}

      {/*
        Layout Architecture:
        - CRITICAL FIX: Single Composer instance to preserve file upload state across layout changes
        - When messages are empty (empty state), center the welcome message and composer
        - When messages exist (active state), show MessageList above the composer
        - The Composer MUST remain mounted through both states to preserve upload progress
      */}

      {/* Empty state content (centered) - shown only when no messages */}
      {messages.length === 0 && !showDelayedLoading && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center px-4">
          {/* Welcome message - hidden when scoring result is present */}
          {!(scoringResult && scoringResult.assessmentId) && (
            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">Welcome to Guardian</h1>
              <p className="text-gray-600">Start a conversation to assess AI vendors or get guidance.</p>
            </div>
          )}

          {/* Scoring Result Card - also in empty state (Story 5c fix) */}
          {scoringResult && scoringResult.assessmentId && (
            <div className="w-full max-w-3xl mb-4 overflow-y-auto max-h-[60vh]">
              <ScoringResultCard result={scoringResult} />
            </div>
          )}
        </div>
      )}

      {/* Active state content (MessageList) - shown when messages exist */}
      {(messages.length > 0 || showDelayedLoading) && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <MessageList
            ref={messageListRef}
            messages={messages}
            isLoading={showDelayedLoading}
            isStreaming={isStreaming}
            onRegenerate={handleRegenerate}
            regeneratingMessageIndex={regeneratingMessageIndex}
            onDownloadAttachment={handleDownloadAttachment}
            questionnaire={
              pendingQuestionnaire &&
              pendingQuestionnaire.conversationId === activeConversationId &&
              gatedUIState !== 'hidden'
                ? {
                    payload: pendingQuestionnaire,
                    uiState: gatedUIState, // Story 14.1.5: Gated to 'generating' until stream completes
                    error: questionnaireError,
                    exportData: gatedExportData, // Story 14.1.5: Gated until stream completes
                    onGenerate: handleGenerateQuestionnaire,
                    onDownload: handleDownload,
                    onRetry: handleGenerateQuestionnaire,
                    steps: generationSteps,
                    currentStep: currentGenerationStep,
                    isRunning: isGeneratingQuestionnaire,
                    insertIndex: questionnaireMessageIndex,
                  }
                : undefined
            }
            scoringResult={scoringResult}
            scoringProgress={scoringProgress}
            vendorClarification={
              vendorClarification &&
              vendorClarification.conversationId === activeConversationId
                ? {
                    payload: vendorClarification,
                    onSelectVendor: handleSelectVendor,
                  }
                : undefined
            }
          />
        </div>
      )}

      {/*
        Single Composer instance - ALWAYS rendered (never unmounts)
        This preserves file upload state when switching between empty/active states
      */}
      <div className={`flex-shrink-0 bg-white z-10 ${
        messages.length === 0 && !showDelayedLoading
          ? 'w-full max-w-3xl mx-auto px-4'
          : ''
      }`}>
        <div className="max-w-3xl mx-auto w-full">
          <Composer
            ref={composerRef}
            onSendMessage={handleSendMessage}
            disabled={!isConnected || isLoading || isStreaming}
            currentMode={mode}
            onModeChange={handleModeChange}
            modeChangeDisabled={isChanging || !isConnected}
            isStreaming={isStreaming}
            isLoading={isLoading}
            onStopStream={abortStream}
            wsAdapter={adapter}
            conversationId={activeConversationId ?? undefined}
          />
        </div>
        <div className="text-center text-xs text-gray-400 py-2 pb-4">
          Guardian can make mistakes. Review generated assessments.
        </div>
      </div>
    </div>
  );
}
