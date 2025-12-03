'use client';

import React from 'react';
import { FileText, Loader2, Download, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type QuestionnaireUIState = 'ready' | 'generating' | 'download' | 'error';

interface StickyQuestionnaireIndicatorProps {
  /** Current UI state */
  uiState: QuestionnaireUIState;
  /** Whether the inline card is visible in viewport */
  isVisible: boolean;
  /** Called when user clicks the indicator to scroll to card */
  onScrollToCard: () => void;
  /** Optional className */
  className?: string;
}

/**
 * State-specific configurations
 */
const stateConfig = {
  ready: {
    icon: FileText,
    text: 'Questionnaire ready to generate',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    hoverBg: 'hover:bg-blue-100',
    animate: false,
  },
  generating: {
    icon: Loader2,
    text: 'Generating questionnaire...',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    hoverBg: 'hover:bg-blue-100',
    animate: true,
  },
  download: {
    icon: Download,
    text: 'Questionnaire ready to download',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    hoverBg: 'hover:bg-green-100',
    animate: false,
  },
  error: {
    icon: AlertCircle,
    text: 'Generation failed - click to retry',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    hoverBg: 'hover:bg-red-100',
    animate: false,
  },
};

/**
 * StickyQuestionnaireIndicator
 *
 * Slim bar (40px) that appears above the Composer when the
 * QuestionnairePromptCard is scrolled out of view.
 *
 * Clicking anywhere on it scrolls to the inline card.
 */
export function StickyQuestionnaireIndicator({
  uiState,
  isVisible,
  onScrollToCard,
  className,
}: StickyQuestionnaireIndicatorProps) {
  // Only render when card exists but is NOT visible
  if (isVisible) {
    return null;
  }

  const config = stateConfig[uiState];
  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={onScrollToCard}
      data-testid="sticky-questionnaire-indicator"
      className={cn(
        'w-full h-10 flex items-center justify-center gap-2',
        'border-t cursor-pointer transition-colors duration-150',
        config.bgColor,
        config.borderColor,
        config.color,
        config.hoverBg,
        className
      )}
      aria-label={`${config.text} - click to scroll to card`}
    >
      <Icon
        className={cn('h-4 w-4', config.animate && 'animate-spin')}
        aria-hidden="true"
      />
      <span className="text-sm font-medium">{config.text}</span>
    </button>
  );
}

export default StickyQuestionnaireIndicator;
