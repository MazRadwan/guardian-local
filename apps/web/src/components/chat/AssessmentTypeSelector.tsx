'use client';

import React, { useState } from 'react';
import { ClipboardList, Zap, Search, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AssessmentOption {
  value: string;
  label: string;
  description: string;
  questions: string;
  icon: React.ReactNode;
}

const ASSESSMENT_OPTIONS: AssessmentOption[] = [
  {
    value: '1',
    label: 'Quick Assessment',
    description: 'Fast red-flag screening, ~15 minutes',
    questions: '30–40 questions',
    icon: <Zap className="h-4 w-4" />,
  },
  {
    value: '2',
    label: 'Comprehensive Assessment',
    description: 'Full coverage across all 10 risk dimensions',
    questions: '85–95 questions',
    icon: <Search className="h-4 w-4" />,
  },
  {
    value: '3',
    label: 'Category-Focused Assessment',
    description: 'Tailored to your AI solution type',
    questions: '50–70 questions',
    icon: <Target className="h-4 w-4" />,
  },
];

interface AssessmentTypeSelectorProps {
  onSelect: (value: string) => void;
  className?: string;
}

/**
 * AssessmentTypeSelector
 *
 * Deterministic inline component rendered when mode switches to assessment.
 * Replaces the model's text-based "reply with 1, 2, or 3" prompt with
 * interactive radio buttons. Sends the selection as a user message.
 */
export function AssessmentTypeSelector({
  onSelect,
  className,
}: AssessmentTypeSelectorProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div
      data-testid="assessment-type-selector"
      className={cn(
        'bg-slate-50 rounded-2xl rounded-tl-sm p-5 max-w-md border border-slate-100 animate-fade-in',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <ClipboardList className="h-5 w-5 text-green-600" />
        <h3 className="text-sm font-semibold text-slate-800">
          Assessment Mode Activated
        </h3>
      </div>

      {/* Instruction */}
      <p className="text-sm text-slate-600 mb-4">
        Guardian will guide you through a structured vendor risk evaluation.
        Select your assessment depth to get started.
      </p>

      {/* Radio options */}
      <div className="space-y-2 mb-4">
        {ASSESSMENT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setSelected(option.value)}
            data-testid={`assessment-option-${option.value}`}
            className={cn(
              'w-full flex items-start gap-3 px-4 py-3 text-left rounded-lg transition-colors',
              'border bg-white',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2',
              selected === option.value
                ? 'border-green-400 bg-green-50'
                : 'border-slate-200 hover:border-green-300 hover:bg-green-50/50'
            )}
          >
            {/* Radio indicator */}
            <div className="mt-0.5 flex-shrink-0">
              <div
                className={cn(
                  'h-4 w-4 rounded-full border-2 flex items-center justify-center',
                  selected === option.value
                    ? 'border-green-500'
                    : 'border-slate-300'
                )}
              >
                {selected === option.value && (
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{option.icon}</span>
                <span className="text-sm font-medium text-slate-800">
                  {option.label}
                </span>
              </div>
              <span className="text-xs text-slate-500 block mt-0.5">
                {option.questions} — {option.description}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Start button */}
      <button
        type="button"
        disabled={!selected}
        onClick={() => {
          if (!selected) return;
          const option = ASSESSMENT_OPTIONS.find((o) => o.value === selected);
          onSelect(option ? option.label : selected);
        }}
        data-testid="assessment-start-button"
        className={cn(
          'w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2',
          selected
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
        )}
      >
        Start Assessment
      </button>
    </div>
  );
}

export default AssessmentTypeSelector;
