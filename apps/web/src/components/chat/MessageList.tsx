'use client';

import React, { useEffect, useRef, forwardRef, useState, useCallback } from 'react';
import { ChatMessage, MessageAttachment } from './ChatMessage';
import { SkeletonMessage } from './SkeletonMessage';
import { QuestionnaireMessage } from './QuestionnaireMessage';
import { ScoringResultCard } from './ScoringResultCard';
import { ProgressMessage } from './ProgressMessage';
import { VendorClarificationCard } from './VendorClarificationCard';
import { ChatMessage as ChatMessageType, QuestionnaireReadyPayload, VendorClarificationNeededPayload } from '@/lib/websocket';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import type { Step } from '@/types/stepper';
import type { QuestionnaireUIState } from './QuestionnairePromptCard';
import type { ScoringResultData, ScoringStatus } from '@/types/scoring';

export interface MessageListProps {
  messages: ChatMessageType[];
  isLoading?: boolean;
  isStreaming?: boolean;
  onRegenerate?: (messageIndex: number) => void;
  regeneratingMessageIndex?: number | null;
  /** Epic 16.6.8: Handler for downloading file attachments */
  onDownloadAttachment?: (attachment: MessageAttachment) => void;
  /** Story 14.1.2: Inline questionnaire rendering props */
  questionnaire?: {
    payload: QuestionnaireReadyPayload;
    uiState: QuestionnaireUIState;
    error?: string | null;
    exportData?: { formats: string[]; assessmentId: string } | null;
    onGenerate: () => void;
    onDownload: (format: string) => void;
    onRetry: () => void;
    steps?: Step[];
    currentStep?: number;
    isRunning?: boolean;
    /** Position in message list (-1 = append at end) */
    insertIndex: number;
  };
  /** Epic 15 Story 5c: Scoring result to display at end of messages */
  scoringResult?: ScoringResultData | null;
  /** Epic 15 Story 5b: Scoring progress indicator */
  scoringProgress?: {
    status: ScoringStatus;
    message: string;
    progress?: number;
    error?: string;
  };
  /** Epic 18.4.2b: Vendor clarification card props */
  vendorClarification?: {
    payload: VendorClarificationNeededPayload;
    onSelectVendor: (vendorName: string) => void;
  };
}

export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
  function MessageList({ messages, isLoading, isStreaming, onRegenerate, regeneratingMessageIndex, onDownloadAttachment, questionnaire, scoringResult, scoringProgress, vendorClarification }, ref) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [isNearBottom, setIsNearBottom] = useState(true);

    // Story 14.1.3: Track previous questionnaire visibility to detect appearance
    const prevQuestionnaireVisibleRef = useRef<boolean>(false);
    // Track previous isLoading state to detect when typing indicator appears
    const prevIsLoadingRef = useRef<boolean>(false);
    // Epic 15 Story 5b: Track previous scoring progress visibility to scroll when it appears
    const prevScoringProgressActiveRef = useRef<boolean>(false);
    // Epic 18.4.2b: Track previous vendor clarification visibility to scroll when it appears
    const prevVendorClarificationVisibleRef = useRef<boolean>(false);
    // Epic 18: Track message count to detect when new messages arrive
    const prevMessageCountRef = useRef<number>(0);

    // Merged ref callback to ensure both parent ref and local ref point to same DOM node
    const mergedRef = useCallback((node: HTMLDivElement | null) => {
      scrollContainerRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    }, [ref]);

    // IntersectionObserver to track if user is near bottom
    useEffect(() => {
      const container = scrollContainerRef.current;
      const sentinel = bottomRef.current;

      if (!container || !sentinel) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          const nearBottom = entry.isIntersecting;
          setIsNearBottom(nearBottom);

          // Show button only if: NOT near bottom AND has overflow content
          const hasOverflow = container.scrollHeight > container.clientHeight;
          setShowScrollButton(!nearBottom && hasOverflow);
        },
        {
          root: container,  // Observe within the scroll container
          threshold: 0.1,   // Trigger when 10% of sentinel is visible
        }
      );

      observer.observe(sentinel);

      return () => observer.disconnect();
    }, [messages.length]); // Re-observe when messages change

    // Use useLayoutEffect for synchronous scroll updates to prevent visual lag (text going behind composer)
    // Story 14.1.3: Include questionnaire in deps so scroll fires when bubble appears (not just messages)
    // Fix: Also scroll when typing indicator (isLoading) appears to prevent it from hiding behind composer
    React.useLayoutEffect(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      // Story 14.1.3: Detect when questionnaire transitions from hidden/undefined to visible
      const isQuestionnaireVisible = !!(questionnaire?.uiState && questionnaire.uiState !== 'hidden');
      const questionnaireJustAppeared = isQuestionnaireVisible && !prevQuestionnaireVisibleRef.current;
      prevQuestionnaireVisibleRef.current = isQuestionnaireVisible;

      // Detect when typing indicator appears (isLoading transitions false → true)
      const typingIndicatorJustAppeared = !!isLoading && !prevIsLoadingRef.current;
      prevIsLoadingRef.current = !!isLoading;

      // Epic 15 Story 5b: Detect when scoring progress becomes active
      const isScoringActive = !!(scoringProgress && scoringProgress.status !== 'idle' && scoringProgress.status !== 'complete');
      const scoringProgressJustAppeared = isScoringActive && !prevScoringProgressActiveRef.current;
      prevScoringProgressActiveRef.current = isScoringActive;

      // Epic 18.4.2b: Detect when vendor clarification card appears
      const isVendorClarificationVisible = !!vendorClarification;
      const vendorClarificationJustAppeared = isVendorClarificationVisible && !prevVendorClarificationVisibleRef.current;
      prevVendorClarificationVisibleRef.current = isVendorClarificationVisible;

      // Epic 18: Detect when new messages arrive (especially assistant responses)
      // This ensures responses scroll into view even when isNearBottom is false
      const currentMessageCount = messages.length;
      const newMessageArrived = currentMessageCount > prevMessageCountRef.current;
      prevMessageCountRef.current = currentMessageCount;

      // If streaming OR near bottom OR new content just appeared, force scroll to bottom
      // This ensures new content scrolls into view
      if (isStreaming || isNearBottom || questionnaireJustAppeared || typingIndicatorJustAppeared || scoringProgressJustAppeared || vendorClarificationJustAppeared || newMessageArrived) {
        container.scrollTop = container.scrollHeight;
      }
    }, [messages, isStreaming, isNearBottom, isLoading, questionnaire?.uiState, questionnaire?.insertIndex, scoringProgress?.status, vendorClarification]);

    // Scroll to bottom when button clicked
    const handleScrollToBottom = () => {
      const sentinel = bottomRef.current;
      const container = scrollContainerRef.current;

      // Use scrollIntoView for smooth scroll
      if (sentinel) {
        sentinel.scrollIntoView({ behavior: 'smooth' });
      } else if (container) {
        container.scrollTop = container.scrollHeight;
      }

      // Immediately hide button (don't wait for scroll event)
      setShowScrollButton(false);
      setIsNearBottom(true);
    };

    if (messages.length === 0 && !isLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold bg-gradient-to-r from-sky-700 via-sky-500 to-sky-700 bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer">Welcome to Guardian</h2>
            <p className="mt-2 bg-gradient-to-r from-sky-600 via-sky-400 to-sky-600 bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer">
              Start a conversation to assess AI vendors or get guidance.
            </p>
          </div>
        </div>
      );
    }

    // Show skeleton loaders while loading history
    if (messages.length === 0 && isLoading) {
      return (
        <div className="flex h-full flex-col overflow-y-auto px-4 py-6">
          <SkeletonMessage />
          <SkeletonMessage />
          <SkeletonMessage />
        </div>
      );
    }

    // Epic 22 Story 22.1.3: Find the LAST message index that has a scoring_result component
    // Used for latest-only rule: only the last scoring_result should render as fallback
    const lastScoringMessageIndex = messages.reduceRight(
      (found, msg, idx) => {
        if (found !== -1) return found;
        const hasScoringResult = msg.components?.some(
          (c) => c.type === 'scoring_result'
        );
        return hasScoringResult ? idx : -1;
      },
      -1
    );

    return (
      <div className="relative flex h-full min-h-0 flex-col">
        {/* Inner scroll container */}
        <div
          ref={mergedRef}
          className="flex-1 overflow-y-auto"
        >
          {/* Centered content container (max-w-3xl = 768px) */}
          <div className="max-w-3xl mx-auto w-full px-4 py-6 pb-6">
            {messages.map((message, index) => (
              <React.Fragment key={message.id || `msg-${index}`}>
                {/* Story 14.1.2: Render questionnaire before this message if it's the insertion point */}
                {questionnaire && questionnaire.insertIndex === index && (
                  <QuestionnaireMessage
                    payload={questionnaire.payload}
                    uiState={questionnaire.uiState}
                    error={questionnaire.error}
                    exportData={questionnaire.exportData}
                    onGenerate={questionnaire.onGenerate}
                    onDownload={questionnaire.onDownload}
                    onRetry={questionnaire.onRetry}
                    steps={questionnaire.steps}
                    currentStep={questionnaire.currentStep}
                    isRunning={questionnaire.isRunning}
                    timestamp={new Date()}
                  />
                )}
                <ChatMessage
                  role={message.role}
                  content={message.content}
                  components={message.components}
                  timestamp={message.timestamp}
                  messageIndex={index}
                  onRegenerate={onRegenerate}
                  isRegenerating={regeneratingMessageIndex === index}
                  attachments={message.attachments as MessageAttachment[] | undefined}
                  onDownloadAttachment={onDownloadAttachment}
                  isLastScoringMessage={index === lastScoringMessageIndex}
                  simulateStreaming={message.simulateStreaming}
                />
              </React.Fragment>
            ))}

            {/* Story 14.1.2: Render questionnaire at end if insertIndex >= messages.length */}
            {questionnaire && questionnaire.insertIndex >= messages.length && (
              <QuestionnaireMessage
                payload={questionnaire.payload}
                uiState={questionnaire.uiState}
                error={questionnaire.error}
                exportData={questionnaire.exportData}
                onGenerate={questionnaire.onGenerate}
                onDownload={questionnaire.onDownload}
                onRetry={questionnaire.onRetry}
                steps={questionnaire.steps}
                currentStep={questionnaire.currentStep}
                isRunning={questionnaire.isRunning}
                timestamp={new Date()}
              />
            )}

            {isLoading && (
              <div data-testid="typing-indicator" className="flex items-center gap-3 py-6">
                {/* Pulsing Avatar */}
                <div className="w-10 h-10 rounded-full bg-sky-500 flex items-center justify-center animate-pulse-shield">
                  <ShieldCheck className="h-5 w-5 text-white" />
                </div>

                {/* Shimmer Text */}
                <span
                  className="text-sm font-medium bg-gradient-to-r from-slate-500 via-sky-400 to-slate-500 bg-clip-text text-transparent animate-shimmer"
                  style={{ backgroundSize: '200% 100%' }}
                >
                  Guardian is thinking...
                </span>
              </div>
            )}

            {/* Epic 18.4.2b: Vendor clarification card - shows when multiple vendors detected */}
            {vendorClarification && (
              <div className="py-4" data-testid="vendor-clarification-container">
                <div className="flex gap-3">
                  <div className="flex w-10 h-10 shrink-0 items-center justify-center rounded-full bg-sky-500">
                    <ShieldCheck className="h-5 w-5 text-white" />
                  </div>
                  <VendorClarificationCard
                    payload={vendorClarification.payload}
                    onSelectVendor={vendorClarification.onSelectVendor}
                  />
                </div>
              </div>
            )}

            {/* Epic 18 Story 18.2.5: Progress-in-chat UX - shows during parsing/scoring */}
            {scoringProgress && (scoringProgress.status === 'parsing' || scoringProgress.status === 'scoring') && (
              <div className="py-4" data-testid="scoring-progress">
                <ProgressMessage
                  status={scoringProgress.status}
                  progress={scoringProgress.progress}
                  message={scoringProgress.message}
                />
              </div>
            )}

            {/* Epic 15 Story 5c: Scoring Result Card - inside scrollable area */}
            {scoringResult && scoringResult.assessmentId && (
              <div className="py-4">
                <ScoringResultCard result={scoringResult} />
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Scroll-to-bottom button - ChatGPT Style (Centered, Floating) */}
        {showScrollButton && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center z-20 pointer-events-none">
            <button
              onClick={handleScrollToBottom}
              className="h-8 w-8 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-md text-gray-600 hover:bg-gray-50 transition-all cursor-pointer pointer-events-auto"
              aria-label="Scroll to bottom"
              title="Scroll to latest message"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  }
);
