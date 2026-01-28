'use client';

import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ShieldCheck } from 'lucide-react';
import { QuestionnairePromptCard, QuestionnaireUIState } from './QuestionnairePromptCard';
import { QuestionnaireReadyPayload } from '@/lib/websocket';
import type { Step } from '@/types/stepper';
import type { ProgressInfo } from './VerticalStepper';

export interface QuestionnaireMessageProps {
  /** Payload from questionnaire_ready event */
  payload: QuestionnaireReadyPayload;
  /** Current UI state */
  uiState: QuestionnaireUIState;
  /** Error message (when uiState === 'error') */
  error?: string | null;
  /** Export data (when uiState === 'download') */
  exportData?: { formats: string[]; assessmentId: string } | null;
  /** Called when user clicks Generate */
  onGenerate: () => void;
  /** Called when user clicks a download format button */
  onDownload: (format: string) => void;
  /** Called when user clicks Retry (from error state) */
  onRetry: () => void;
  /** Stepper props */
  steps?: Step[];
  /** Current step index */
  currentStep?: number;
  /** Whether generation is actively running */
  isRunning?: boolean;
  /** Optional timestamp */
  timestamp?: Date;
  /** Optional className */
  className?: string;
  /** Epic 32.2.2: Questionnaire progress (dimension-level feedback) */
  progress?: ProgressInfo | null;
  /** Epic 32.2.3: Whether reconnection is in progress */
  isReconnecting?: boolean;
}

/**
 * QuestionnaireMessage
 *
 * Wraps QuestionnairePromptCard in standard ChatMessage layout
 * to appear as a normal assistant message in the conversation.
 */
export function QuestionnaireMessage({
  payload,
  uiState,
  error,
  exportData,
  onGenerate,
  onDownload,
  onRetry,
  steps = [],
  currentStep = -1,
  isRunning = false,
  timestamp,
  className,
  progress,
  isReconnecting = false,
}: QuestionnaireMessageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Story 14.1.5: Auto-scroll download bubble into view when it mounts
  useEffect(() => {
    if (uiState === 'download' && exportData && containerRef.current) {
      // Small delay to ensure DOM is rendered
      requestAnimationFrame(() => {
        containerRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'end', // Align to bottom of viewport
        });
      });
    }
  }, [uiState, exportData]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex w-full gap-4 px-4 py-6 md:px-8 md:py-8',
        'bg-gray-50', // Assistant message background
        className
      )}
      role="article"
      aria-label="assistant message"
      data-testid="questionnaire-message"
    >
      {/* Avatar - matches ChatMessage assistant avatar, hidden on mobile */}
      <div className="hidden md:flex w-10 h-10 shrink-0 items-center justify-center rounded-full bg-sky-500">
        <ShieldCheck className="h-5 w-5 text-white" aria-hidden="true" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-3 overflow-hidden">
        {/* Role label - always visible, provides context on mobile where avatar is hidden */}
        <div className="text-sm font-semibold text-sky-600">Guardian</div>

        {/* Questionnaire Card - rendered inline, no extra card styling */}
        <QuestionnairePromptCard
          payload={payload}
          uiState={uiState}
          error={error}
          exportData={exportData}
          onGenerate={onGenerate}
          onDownload={onDownload}
          onRetry={onRetry}
          steps={steps}
          currentStep={currentStep}
          isRunning={isRunning}
          className="" // Clear default max-w-md via empty className
          inline={true} // Signal inline rendering
          progress={progress}
          isReconnecting={isReconnecting}
        />

        {/* Timestamp */}
        {timestamp && (
          <div className="text-xs text-gray-500" aria-label="Message timestamp">
            {new Date(timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default QuestionnaireMessage;
