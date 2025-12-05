'use client';

import React, { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Download, AlertCircle, RefreshCw } from 'lucide-react';
import { QuestionnaireReadyPayload } from '@/lib/websocket';
import { cn } from '@/lib/utils';

export type QuestionnaireUIState = 'ready' | 'generating' | 'download' | 'error';

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
    { payload, uiState, error, exportData, onGenerate, onDownload, onRetry, className },
    ref
  ) => {
    const config = assessmentTypeConfig[payload.assessmentType] || assessmentTypeConfig.comprehensive;

    // ─────────────────────────────────────────────────────────────
    // ERROR STATE
    // ─────────────────────────────────────────────────────────────
    if (uiState === 'error') {
      return (
        <div
          ref={ref}
          data-testid="questionnaire-card-error"
          className={cn(
            'bg-red-50 rounded-2xl rounded-tl-sm p-4 max-w-md border-2 border-red-200',
            className
          )}
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
    // DOWNLOAD STATE
    // ─────────────────────────────────────────────────────────────
    if (uiState === 'download' && exportData) {
      return (
        <div
          ref={ref}
          data-testid="questionnaire-card-download"
          className={cn(
            'bg-green-50 rounded-2xl rounded-tl-sm p-4 max-w-md border-2 border-green-200',
            className
          )}
        >
          <div className="flex items-start gap-3">
            <Download className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-600">Questionnaire Ready</p>
              <p className="text-sm text-gray-600 mt-1">Download your questionnaire:</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {exportData.formats.map((format) => (
                  <Button
                    key={format}
                    size="sm"
                    variant="outline"
                    onClick={() => onDownload(format)}
                    data-testid={`download-${format}-btn`}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    {format.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ─────────────────────────────────────────────────────────────
    // READY / GENERATING STATE
    // ─────────────────────────────────────────────────────────────
    const isGenerating = uiState === 'generating';

    return (
      <div
        ref={ref}
        data-testid="questionnaire-card-ready"
        className={cn(
          'bg-slate-50 rounded-2xl rounded-tl-sm p-4 max-w-md border border-slate-200 transition-all duration-200',
          isGenerating && 'opacity-75',
          className
        )}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={cn('mt-0.5 flex-shrink-0', config.color)}>
            {isGenerating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <FileText className="h-5 w-5" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('text-sm font-semibold', config.color)}>
                {isGenerating ? 'Generating...' : 'Ready to Generate'}
              </span>
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium border',
                  config.bgColor,
                  config.color,
                  config.borderColor
                )}
              >
                {config.label}
              </span>
            </div>

            {/* Summary */}
            <div className="mt-2 space-y-1">
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
                {payload.estimatedQuestions
                  ? `~${payload.estimatedQuestions} questions`
                  : config.description}
                {payload.selectedCategories && payload.selectedCategories.length > 0 && (
                  <span> &bull; {payload.selectedCategories.join(', ')}</span>
                )}
              </p>
            </div>

            {/* Action Button */}
            <div className="mt-3">
              <Button
                data-testid="generate-questionnaire-btn"
                onClick={onGenerate}
                disabled={isGenerating}
                size="sm"
                className={cn('transition-all', !isGenerating && 'hover:scale-105')}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating Questionnaire...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Questionnaire
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

QuestionnairePromptCard.displayName = 'QuestionnairePromptCard';

export default QuestionnairePromptCard;
