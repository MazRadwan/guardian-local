'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { QuestionnairePromptCard } from './QuestionnairePromptCard';
import { AlertCircle } from 'lucide-react';
import { useChatController } from '@/hooks/useChatController';
import { useChatStore } from '@/stores/chatStore';
import { useAuth } from '@/hooks/useAuth';
import { useQuestionnairePersistence } from '@/hooks/useQuestionnairePersistence';
import type { QuestionnaireReadyPayload } from '@/lib/websocket';

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

  // Get export data for active conversation
  const exportData = activeConversationId
    ? exportReadyByConversation[activeConversationId]
    : null;

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

  return (
    <div className="flex h-full flex-col relative">
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

      {/* Conditional Layout: Centered vs Active State */}
      {messages.length === 0 && !showDelayedLoading ? (
        // Empty state: Centered composer (only when truly empty, not loading)
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center px-4">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Welcome to Guardian</h1>
            <p className="text-gray-600">Start a conversation to assess AI vendors or get guidance.</p>
          </div>
          <div className="w-full max-w-3xl">
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
            />
          </div>
        </div>
      ) : (
        // Active state: Messages + composer at bottom (includes loading state)
        <>
          <div className="flex-1 min-h-0 overflow-hidden">
            <MessageList
              ref={messageListRef}
              messages={messages}
              isLoading={showDelayedLoading}
              isStreaming={isStreaming}
              onRegenerate={handleRegenerate}
              regeneratingMessageIndex={regeneratingMessageIndex}
              questionnaireSlot={
                pendingQuestionnaire &&
                pendingQuestionnaire.conversationId === activeConversationId &&
                questionnaireUIState !== 'hidden' ? (
                  <QuestionnairePromptCard
                    payload={pendingQuestionnaire}
                    uiState={questionnaireUIState}
                    error={questionnaireError}
                    exportData={exportData}
                    onGenerate={handleGenerateQuestionnaire}
                    onDownload={handleDownload}
                    onRetry={handleGenerateQuestionnaire}
                    className="mx-4 mb-4"
                    steps={generationSteps}
                    currentStep={currentGenerationStep}
                    isRunning={isGeneratingQuestionnaire}
                  />
                ) : undefined
              }
            />
          </div>
          <div className="flex-shrink-0 bg-white z-10">
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
              />
            </div>
            <div className="text-center text-xs text-gray-400 py-2 pb-4">
              Guardian can make mistakes. Review generated assessments.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
