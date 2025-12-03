'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import { QuestionnaireReadyPayload } from '@/lib/websocket';
import { cn } from '@/lib/utils';

interface GenerateQuestionnaireButtonProps {
  /** Payload from questionnaire_ready event */
  payload: QuestionnaireReadyPayload;
  /** Called when user clicks Generate */
  onGenerate: () => void;
  /** Whether generation is in progress */
  isGenerating?: boolean;
  /** Optional className for styling */
  className?: string;
}

/**
 * Assessment type display labels and colors
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
 * GenerateQuestionnaireButton
 *
 * Displays a card with questionnaire summary and a Generate button.
 * Shown when Claude calls the questionnaire_ready tool.
 *
 * User must click the button to trigger actual questionnaire generation.
 */
export function GenerateQuestionnaireButton({
  payload,
  onGenerate,
  isGenerating = false,
  className,
}: GenerateQuestionnaireButtonProps) {
  const config = assessmentTypeConfig[payload.assessmentType];

  return (
    <div
      data-testid="questionnaire-ready-card"
      className={cn(
        'border-2 rounded-lg transition-all duration-200 p-4',
        config.borderColor,
        config.bgColor,
        isGenerating && 'opacity-75',
        className
      )}
    >
      <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={cn('mt-0.5', config.color)}>
            {isGenerating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <FileText className="h-5 w-5" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className={cn('text-sm font-semibold', config.color)}>
                {isGenerating ? 'Generating...' : 'Ready to Generate'}
              </span>
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  config.bgColor,
                  config.color,
                  'border',
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
                <p className="text-sm text-gray-600 italic">
                  &quot;{payload.contextSummary}&quot;
                </p>
              )}

              <p className="text-sm text-gray-500">
                {payload.estimatedQuestions
                  ? `~${payload.estimatedQuestions} questions`
                  : config.description}
                {payload.selectedCategories &&
                  payload.selectedCategories.length > 0 && (
                    <span>
                      {' '}
                      &bull; Categories: {payload.selectedCategories.join(', ')}
                    </span>
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
                className={cn(
                  'transition-all',
                  !isGenerating && 'hover:scale-105'
                )}
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

export default GenerateQuestionnaireButton;
