'use client';

import React from 'react';
import type { Step } from '@/types/stepper';

// Re-export Step type for backward compatibility
export type { Step };

/**
 * Epic 32.2.2: Progress info passed from chatStore
 */
export interface ProgressInfo {
  message: string;
  step: number;
  totalSteps: number;
}

/**
 * Props for the VerticalStepper component
 */
interface VerticalStepperProps {
  steps: Step[];
  currentStep: number; // -1 = none, 0-N = active step index
  isRunning: boolean;
  /** Epic 32.2.2: Questionnaire generation progress (dimension-level feedback) */
  progress?: ProgressInfo | null;
  /** Epic 32.2.3: Whether reconnection is in progress */
  isReconnecting?: boolean;
}

/**
 * VerticalStepper - Renders animated steps with checkmarks, pulse indicators, and connecting lines
 *
 * Visual states:
 * - Completed: Green checkmark, green line
 * - Active: Blue pulsing indicator, gray line
 * - Future: Not rendered
 *
 * Epic 32.2.2: Added progress prop for dimension-level feedback during generation
 * Epic 32.2.3: Added isReconnecting prop for reconnection state display
 *
 * @example
 * <VerticalStepper
 *   steps={[
 *     { id: 'context', label: 'Context gathered' },
 *     { id: 'generating', label: 'Generating questions' },
 *   ]}
 *   currentStep={1}
 *   isRunning={true}
 *   progress={{ message: "Generating questions for Data Security...", step: 3, totalSteps: 10 }}
 * />
 */
export const VerticalStepper = React.memo<VerticalStepperProps>(
  ({ steps, currentStep, isRunning, progress, isReconnecting }) => {
    // Don't render anything if no steps have started
    if (currentStep < 0) {
      return null;
    }

    return (
      <div className="space-y-0 py-1" data-testid="vertical-stepper">
        {steps.slice(0, Math.max(currentStep + 1, 0)).map((step, idx) => {
          const isComplete = idx < currentStep;
          const isActive = idx === currentStep && isRunning;
          const isLast = idx === Math.min(currentStep, steps.length - 1);

          return (
            <div
              key={step.id}
              className="flex items-stretch animate-fadeIn"
              style={{ animationDelay: `${idx * 100}ms` }}
              data-testid={`step-${step.id}`}
            >
              {/* Left indicator column */}
              <div className="flex flex-col items-center mr-3">
                <div
                  className={`
                    w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all duration-300
                    ${isComplete ? 'bg-emerald-500 text-white' : ''}
                    ${isActive ? 'bg-sky-500 text-white ring-2 ring-sky-200' : ''}
                  `}
                  data-testid={`step-indicator-${step.id}`}
                  data-state={isComplete ? 'complete' : isActive ? 'active' : 'pending'}
                >
                  {isComplete ? (
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                      data-testid="checkmark-icon"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isActive ? (
                    <div
                      className="w-2 h-2 bg-white rounded-full animate-pulse"
                      data-testid="pulse-indicator"
                    />
                  ) : null}
                </div>
                {/* Connecting line */}
                {!isLast && (
                  <div
                    className={`w-0.5 flex-1 min-h-[16px] transition-colors duration-300 ${
                      isComplete ? 'bg-emerald-300' : 'bg-slate-200'
                    }`}
                    data-testid={`step-line-${step.id}`}
                  />
                )}
              </div>
              {/* Step label and progress */}
              <div className={`pb-3 ${isLast ? 'pb-0' : ''} flex-1`}>
                <div
                  className={`
                    text-sm transition-colors duration-300
                    ${isComplete ? 'text-slate-600' : ''}
                    ${isActive ? 'text-slate-700 font-medium' : ''}
                  `}
                >
                  {step.label}
                  {isActive && <span className="text-sky-500 animate-pulse">...</span>}
                </div>

                {/* Epic 32.2.2: Progress message for active step */}
                {isActive && (
                  <div
                    className="mt-1 text-xs transition-opacity duration-300"
                    data-testid="progress-message"
                    aria-live="polite"
                  >
                    {/* Epic 32.2.3: Reconnection state */}
                    {isReconnecting ? (
                      <span className="text-amber-600" data-testid="reconnecting-message">
                        Reconnecting...{progress?.message && ` (${progress.message})`}
                      </span>
                    ) : progress ? (
                      <>
                        <span className="text-sky-600" data-testid="progress-step-counter">
                          Step {progress.step} of {progress.totalSteps}
                        </span>
                        <span className="mx-1 text-slate-400">-</span>
                        <span className="text-slate-500 animate-pulse" data-testid="progress-text">
                          {progress.message}
                        </span>
                      </>
                    ) : (
                      /* Epic 32.2.3: Fallback when no progress received yet */
                      <span className="text-slate-400" data-testid="progress-fallback">
                        Generating...
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);

VerticalStepper.displayName = 'VerticalStepper';
