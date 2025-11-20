'use client';

import React from 'react';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { AlertCircle } from 'lucide-react';
import { useChatController } from '@/hooks/useChatController';

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
  } = useChatController();

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
