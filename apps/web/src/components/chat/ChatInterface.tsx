'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { QuestionnairePromptCard } from './QuestionnairePromptCard';
import { StickyQuestionnaireIndicator } from './StickyQuestionnaireIndicator';
import { AlertCircle } from 'lucide-react';
import { useChatController } from '@/hooks/useChatController';
import { useChatStore } from '@/stores/chatStore';
import { useAuth } from '@/hooks/useAuth';
import { useQuestionnairePersistence } from '@/hooks/useQuestionnairePersistence';
import { useQuestionnaireCardVisibility } from '@/hooks/useQuestionnaireCardVisibility';

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

  // Refs for questionnaire card visibility tracking
  const questionnaireCardRef = useRef<HTMLDivElement>(null);

  // Questionnaire generation state from store
  const pendingQuestionnaire = useChatStore((state) => state.pendingQuestionnaire);
  const questionnaireUIState = useChatStore((state) => state.questionnaireUIState);
  const questionnaireError = useChatStore((state) => state.questionnaireError);
  const exportReadyByConversation = useChatStore((state) => state.exportReadyByConversation);
  const setGenerating = useChatStore((state) => state.setGenerating);
  const clearPendingQuestionnaire = useChatStore((state) => state.clearPendingQuestionnaire);
  const setQuestionnaireUIState = useChatStore((state) => state.setQuestionnaireUIState);

  // Get export data for active conversation
  const exportData = activeConversationId
    ? exportReadyByConversation[activeConversationId]
    : null;

  // Track card visibility for sticky indicator
  const isCardVisible = useQuestionnaireCardVisibility(questionnaireCardRef, messageListRef);

  // Track previous conversation ID to detect actual changes
  const prevConversationIdRef = useRef<string | null>(null);

  // Rehydrate questionnaire state from localStorage on conversation switch
  useEffect(() => {
    if (!activeConversationId || !user?.id) return;

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

    // Always clear previous conversation's state first
    useChatStore.getState().clearPendingQuestionnaire();
    useChatStore.getState().setQuestionnaireUIState('hidden');

    // If dismissed for this conversation, don't restore
    if (persistence.isDismissed(activeConversationId)) {
      return;
    }

    // Try to load persisted payload
    const savedPayload = persistence.loadPayload(activeConversationId);
    if (savedPayload) {
      useChatStore.getState().setPendingQuestionnaire(savedPayload);
      useChatStore.getState().setQuestionnaireUIState('ready');
    }
  }, [activeConversationId, user?.id]); // Remove persistence from deps - it's stable (memoized by userId)

  const handleGenerateQuestionnaire = useCallback(() => {
    if (!pendingQuestionnaire || !adapter) return;

    // Transition to generating state
    setQuestionnaireUIState('generating');
    setGenerating(true);

    adapter.generateQuestionnaire({
      conversationId: pendingQuestionnaire.conversationId,
      assessmentType: pendingQuestionnaire.assessmentType,
      vendorName: pendingQuestionnaire.vendorName,
      solutionName: pendingQuestionnaire.solutionName,
      contextSummary: pendingQuestionnaire.contextSummary,
      selectedCategories: pendingQuestionnaire.selectedCategories,
    });

    // IMPORTANT: State transitions happen in event handlers:
    // - export_ready event -> 'download' state
    // - extraction_failed event -> 'error' state
  }, [pendingQuestionnaire, adapter, setGenerating, setQuestionnaireUIState]);

  const handleDismiss = useCallback(() => {
    if (!activeConversationId || !pendingQuestionnaire) return;

    // Mark as dismissed in localStorage
    persistence.dismiss(activeConversationId);

    // Clear from store (transitions to 'hidden')
    clearPendingQuestionnaire();
    setQuestionnaireUIState('hidden');
  }, [activeConversationId, pendingQuestionnaire, persistence, clearPendingQuestionnaire, setQuestionnaireUIState]);

  const handleScrollToCard = useCallback(() => {
    questionnaireCardRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, []);

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

      // After successful download, clear state and persist
      if (activeConversationId) {
        persistence.clearPayload(activeConversationId);
      }
      clearPendingQuestionnaire();
      setQuestionnaireUIState('hidden');
    } catch (err) {
      console.error('[ChatInterface] Download error:', err);
      // Don't change state on download error - user can retry
    }
  }, [exportData, token, activeConversationId, persistence, clearPendingQuestionnaire, setQuestionnaireUIState]);

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
                    ref={questionnaireCardRef}
                    payload={pendingQuestionnaire}
                    uiState={questionnaireUIState}
                    error={questionnaireError}
                    exportData={exportData}
                    onGenerate={handleGenerateQuestionnaire}
                    onDismiss={handleDismiss}
                    onDownload={handleDownload}
                    onRetry={handleGenerateQuestionnaire}
                    className="mx-4 mb-4"
                  />
                ) : undefined
              }
            />
          </div>
          <div className="flex-shrink-0 bg-white z-10">
            {/* Sticky Questionnaire Indicator - appears above Composer when card scrolled out */}
            {pendingQuestionnaire &&
              pendingQuestionnaire.conversationId === activeConversationId &&
              questionnaireUIState !== 'hidden' && (
                <StickyQuestionnaireIndicator
                  uiState={questionnaireUIState}
                  isVisible={isCardVisible}
                  onScrollToCard={handleScrollToCard}
                />
              )}
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
