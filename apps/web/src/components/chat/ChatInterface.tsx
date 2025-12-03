'use client';

import React, { useCallback } from 'react';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { GenerateQuestionnaireButton } from './GenerateQuestionnaireButton';
import { AlertCircle } from 'lucide-react';
import { useChatController } from '@/hooks/useChatController';
import { useChatStore } from '@/stores/chatStore';

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

  // Questionnaire generation state from store
  const pendingQuestionnaire = useChatStore((state) => state.pendingQuestionnaire);
  const isGeneratingQuestionnaire = useChatStore((state) => state.isGeneratingQuestionnaire);
  const setGenerating = useChatStore((state) => state.setGenerating);
  const clearPendingQuestionnaire = useChatStore((state) => state.clearPendingQuestionnaire);

  const handleGenerateQuestionnaire = useCallback(() => {
    if (!pendingQuestionnaire || !adapter) return;

    // Set generating flag in store - DON'T clear pendingQuestionnaire yet!
    // Keep card visible with spinner in case emit fails (user can retry)
    setGenerating(true);
    adapter.generateQuestionnaire({
      conversationId: pendingQuestionnaire.conversationId,
      assessmentType: pendingQuestionnaire.assessmentType,
      vendorName: pendingQuestionnaire.vendorName,
      solutionName: pendingQuestionnaire.solutionName,
      contextSummary: pendingQuestionnaire.contextSummary,
      selectedCategories: pendingQuestionnaire.selectedCategories,
    });

    // IMPORTANT: Clear happens when:
    // - assistant_done event is received (success)
    // - This allows retry if WebSocket emit fails
  }, [pendingQuestionnaire, adapter, setGenerating]);

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
            />
          </div>
          <div className="flex-shrink-0 bg-white z-10">
            {/* Generate Questionnaire Button - Card stays visible during generation */}
            {pendingQuestionnaire &&
              pendingQuestionnaire.conversationId === activeConversationId && (
                <div className="max-w-3xl mx-auto w-full px-4 pt-4">
                  <GenerateQuestionnaireButton
                    payload={pendingQuestionnaire}
                    onGenerate={handleGenerateQuestionnaire}
                    isGenerating={isGeneratingQuestionnaire}
                  />
                </div>
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
