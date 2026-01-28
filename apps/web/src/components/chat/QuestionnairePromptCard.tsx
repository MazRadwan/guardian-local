'use client';

import React, { forwardRef, useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Download, AlertCircle, RefreshCw, ChevronDown } from 'lucide-react';
import { QuestionnaireReadyPayload } from '@/lib/websocket';
import { cn } from '@/lib/utils';
import { VerticalStepper, type ProgressInfo } from './VerticalStepper';
import type { Step } from '@/types/stepper';
import { useChatStore } from '@/stores/chatStore';

// Re-export ProgressInfo for consumers
export type { ProgressInfo };

export type QuestionnaireUIState = 'hidden' | 'ready' | 'generating' | 'download' | 'error';

interface QuestionnairePromptCardProps {
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
  /** Optional className */
  className?: string;
  /** Stepper props (Story 13.4.3) */
  steps?: Step[];
  /** Current step index (-1 = idle, 0-N = in progress, >= length = complete) */
  currentStep?: number;
  /** Whether generation is actively running */
  isRunning?: boolean;
  /** Whether rendered inline in chat message (no card styling) */
  inline?: boolean;
  /** Epic 32.2.2: Questionnaire generation progress (dimension-level feedback) */
  progress?: ProgressInfo | null;
  /** Epic 32.2.3: Whether reconnection is in progress */
  isReconnecting?: boolean;
}

/**
 * Assessment type display configs
 */
const assessmentTypeConfig = {
  quick: {
    label: 'Quick Assessment',
    description: '~30-40 questions',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  comprehensive: {
    label: 'Comprehensive Assessment',
    description: '~85-95 questions',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  category_focused: {
    label: 'Category-Focused Assessment',
    description: '~50-70 questions',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
};

/**
 * QuestionnairePromptCard
 *
 * Assistant-style bubble for questionnaire generation flow.
 * Handles 4 states: Ready, Generating, Download, Error.
 * Styled to match chat assistant messages.
 */
export const QuestionnairePromptCard = forwardRef<HTMLDivElement, QuestionnairePromptCardProps>(
  (
    { payload, uiState, error, exportData, onGenerate, onDownload, onRetry, className, steps = [], currentStep = -1, isRunning = false, inline = false, progress, isReconnecting = false },
    ref
  ) => {
    const config = assessmentTypeConfig[payload.assessmentType] || assessmentTypeConfig.comprehensive;

    // Story 13.4.4: Collapse/expand state
    const [isExpanded, setIsExpanded] = useState(true);

    // Alternating status message state (like ProgressMessage)
    const [showWaitMessage, setShowWaitMessage] = useState(false);
    const [isAlternating, setIsAlternating] = useState(false);
    const lastGeneratingState = useRef(false);

    // Story 13.6.1: Timer ref for collapse (enables manual clearing in 13.6.2)
    const collapseTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Derive complete state from stepper
    const isComplete = currentStep >= steps.length && steps.length > 0;
    const hasStartedGeneration = currentStep >= 0;

    // Story 13.6.1: Guard - only collapse on successful completion
    const isSuccessfullyComplete = isComplete && uiState === 'download';

    // Story 14.1.1: Inline mode - minimal styling (no card background/border)
    // Card mode: full card styling with bg, border, rounded corners
    const cardClasses = inline
      ? '' // No card styling when inline
      : 'bg-slate-50 rounded-2xl rounded-tl-sm p-4 max-w-md border border-slate-100';

    const errorCardClasses = inline
      ? '' // No card styling when inline
      : 'bg-red-50 rounded-2xl rounded-tl-sm p-4 max-w-md border-2 border-red-200';

    // Story 13.6.1: Auto-collapse when complete (with guards)
    useEffect(() => {
      // Only auto-collapse on successful completion, not error
      if (isSuccessfullyComplete) {
        collapseTimerRef.current = setTimeout(() => {
          setIsExpanded(false);
          collapseTimerRef.current = null;
        }, 800);
      }
      // Always return cleanup to clear any pending timer on ANY state change
      return () => {
        if (collapseTimerRef.current) {
          clearTimeout(collapseTimerRef.current);
          collapseTimerRef.current = null;
        }
      };
    }, [isSuccessfullyComplete]);

    // Story 13.6.1: Keep expanded on error to show failure point
    useEffect(() => {
      if (uiState === 'error') {
        // Clear any pending collapse timer
        if (collapseTimerRef.current) {
          clearTimeout(collapseTimerRef.current);
          collapseTimerRef.current = null;
        }
        setIsExpanded(true);
      }
    }, [uiState]);

    // Story 13.6.2: Reset collapse state on conversation switch
    const activeConversationId = useChatStore((s) => s.activeConversationId);
    const prevConversationIdRef = useRef(activeConversationId);
    useEffect(() => {
      // Skip on initial mount - only act on actual conversation changes
      if (prevConversationIdRef.current === activeConversationId) {
        return;
      }
      prevConversationIdRef.current = activeConversationId;

      // Clear any pending collapse timer when conversation changes
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      // Reset to expanded on conversation switch
      setIsExpanded(true);
    }, [activeConversationId]);

    // Story 13.4.4: Auto-expand when generation starts
    useEffect(() => {
      if (isRunning && currentStep >= 0) {
        setIsExpanded(true);
      }
    }, [isRunning, currentStep]);

    // Alternating status message effect (like ProgressMessage Story 24.3)
    // Reset when generation starts/stops
    useEffect(() => {
      const isGeneratingNow = hasStartedGeneration && !isComplete;

      if (isGeneratingNow !== lastGeneratingState.current) {
        lastGeneratingState.current = isGeneratingNow;
        setShowWaitMessage(false);
        setIsAlternating(false);
      }

      if (!isGeneratingNow) return;

      // Start showing wait message after 5 seconds
      const waitTimer = setTimeout(() => {
        setShowWaitMessage(true);
        setIsAlternating(true);
      }, 5000);

      return () => clearTimeout(waitTimer);
    }, [hasStartedGeneration, isComplete]);

    // Alternate between messages every 3 seconds
    useEffect(() => {
      if (!isAlternating || isComplete) return;

      const alternateTimer = setInterval(() => {
        setShowWaitMessage(prev => !prev);
      }, 3000);

      return () => clearInterval(alternateTimer);
    }, [isAlternating, isComplete]);

    // ─────────────────────────────────────────────────────────────
    // ERROR STATE
    // ─────────────────────────────────────────────────────────────
    if (uiState === 'error') {
      return (
        <div
          ref={ref}
          data-testid="questionnaire-card-error"
          className={cn(errorCardClasses, className)}
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-600">Generation Failed</p>
              <p className="text-sm text-red-700 mt-1">{error || 'An unexpected error occurred'}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={onRetry}
                className="mt-2"
                data-testid="retry-btn"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // ─────────────────────────────────────────────────────────────
    // DOWNLOAD STATE (Story 13.4.3-4: with collapsible stepper)
    // ─────────────────────────────────────────────────────────────
    if (uiState === 'download' && exportData) {
      return (
        <div
          ref={ref}
          data-testid="questionnaire-card-download"
          className={cn(cardClasses, className)}
        >
          {/* Message text */}
          <p className="text-sm text-slate-700 mb-3">
            Perfect! I&apos;ve generated the questionnaire for your {config.label.toLowerCase()}.
          </p>

          {/* Collapsible stepper section */}
          {steps.length > 0 && (
            <div className="border border-slate-200 rounded-lg bg-white overflow-hidden mb-3">
              {/* Header - clickable to toggle */}
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors"
                data-testid="stepper-toggle"
                aria-expanded={isExpanded}
                aria-controls="stepper-content-download"
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-slate-700">Assessment Complete</span>
                </div>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-slate-400 transition-transform duration-200',
                    isExpanded && 'rotate-180'
                  )}
                />
              </button>

              {/* Expandable stepper content */}
              <div
                id="stepper-content-download"
                className={cn(
                  'overflow-hidden transition-all duration-300 ease-in-out',
                  isExpanded ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
                )}
              >
                <div className="px-3 pb-3 border-t border-slate-100">
                  <div className="pt-3">
                    <VerticalStepper
                      steps={steps}
                      currentStep={currentStep}
                      isRunning={false}
                      progress={null} // No progress in download state
                      isReconnecting={false}
                    />
                  </div>
                </div>
              </div>

              {/* Summary meta - shown when collapsed (Story 13.6.4: safe fallbacks) */}
              {!isExpanded && (
                <div className="px-3 pb-2.5 -mt-1">
                  <span className="text-xs text-slate-500">
                    {payload?.estimatedQuestions
                      ? `~${payload.estimatedQuestions} questions`
                      : 'Assessment complete'}
                    {config?.label && ` · ${config.label}`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Download buttons - dynamically rendered from exportData.formats */}
          {/* Story 14.2.2: Primary dark (Word) + ghost (others) per Appendix */}
          {/* Word is primary as it's the most common enterprise format */}
          {/* Epic 32.2: Filter out 'excel' - backend sends it but UI removed Excel support */}
          <div className="flex flex-wrap items-center gap-2 animate-fadeIn">
            {[...exportData.formats]
              .filter((format) => format !== 'excel') // Excel removed from UI (Epic 32.2)
              .sort((a, b) => {
                // Word first (primary), then PDF, then others alphabetically
                if (a === 'word') return -1;
                if (b === 'word') return 1;
                if (a === 'pdf') return -1;
                if (b === 'pdf') return 1;
                return a.localeCompare(b);
              })
              .map((format, index) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => onDownload(format)}
                  data-testid={`download-${format}-btn`}
                  className={cn(
                    'text-sm rounded-lg transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                    index === 0
                      ? // Primary: dark style with icon
                        'inline-flex items-center gap-1.5 px-4 py-2 font-medium bg-slate-800 text-white hover:bg-slate-700 focus-visible:ring-slate-500'
                      : // Secondary: ghost style
                        'px-3 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 focus-visible:ring-slate-400'
                  )}
                >
                  {index === 0 && <Download className="h-4 w-4" />}
                  {format.charAt(0).toUpperCase() + format.slice(1)}
                </button>
              ))}
          </div>
        </div>
      );
    }

    // ─────────────────────────────────────────────────────────────
    // READY / GENERATING STATE (Story 13.4.3-4: with stepper during generation)
    // ─────────────────────────────────────────────────────────────
    const isGenerating = uiState === 'generating';

    return (
      <div
        ref={ref}
        data-testid="questionnaire-card-ready"
        className={cn(cardClasses, className)}
      >
        {/* Message text - changes based on state */}
        <p className="text-sm text-slate-700 mb-3">
          {!hasStartedGeneration && 'Ready to generate your questionnaire.'}
          {hasStartedGeneration && !isComplete && `Generating questionnaire for your ${config.label.toLowerCase()}.`}
        </p>

        {/* Collapsible stepper section - shown during generation */}
        {hasStartedGeneration && steps.length > 0 && (
          <div className="border border-slate-200 rounded-lg bg-white overflow-hidden mb-3">
            {/* Header - clickable to toggle */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors"
              data-testid="stepper-toggle"
              aria-expanded={isExpanded}
              aria-controls="stepper-content-generating"
            >
              <div className="flex items-center gap-2">
                {/* Spinner */}
                <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                {/* Alternating status message */}
                <span
                  className={cn(
                    'text-sm font-medium transition-all duration-300',
                    showWaitMessage ? 'text-sky-600' : 'text-slate-700'
                  )}
                >
                  {showWaitMessage ? 'This may take a minute...' : 'Generating Assessment'}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-slate-400 transition-transform duration-200',
                  isExpanded && 'rotate-180'
                )}
              />
            </button>

            {/* Expandable stepper content */}
            <div
              id="stepper-content-generating"
              className={cn(
                'overflow-hidden transition-all duration-300 ease-in-out',
                isExpanded ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
              )}
            >
              <div className="px-3 pb-3 border-t border-slate-100">
                <div className="pt-3">
                  <VerticalStepper
                    steps={steps}
                    currentStep={currentStep}
                    isRunning={isRunning}
                    progress={progress}
                    isReconnecting={isReconnecting}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summary info - only when NOT generating */}
        {!hasStartedGeneration && (
          <div className="space-y-1 mb-3">
            {payload.vendorName && (
              <p className="text-sm text-gray-700">
                <span className="font-medium">Vendor:</span> {payload.vendorName}
                {payload.solutionName && ` - ${payload.solutionName}`}
              </p>
            )}

            {payload.contextSummary && (
              <p className="text-sm text-gray-600 italic line-clamp-2">
                &quot;{payload.contextSummary}&quot;
              </p>
            )}

            <p className="text-sm text-gray-500">
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium border mr-2',
                  config.bgColor,
                  config.color,
                  config.borderColor
                )}
              >
                {config.label}
              </span>
              {payload.estimatedQuestions
                ? `~${payload.estimatedQuestions} questions`
                : config.description}
            </p>
          </div>
        )}

        {/* Generate button - hidden during generation (stepper shows progress instead) */}
        {!hasStartedGeneration && (
          <button
            type="button"
            data-testid="generate-questionnaire-btn"
            onClick={onGenerate}
            disabled={isGenerating}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              'bg-slate-800 text-white',
              'hover:bg-slate-700',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-800'
            )}
          >
            <FileText className="h-4 w-4" />
            Generate Questionnaire
          </button>
        )}
      </div>
    );
  }
);

QuestionnairePromptCard.displayName = 'QuestionnairePromptCard';

export default QuestionnairePromptCard;
