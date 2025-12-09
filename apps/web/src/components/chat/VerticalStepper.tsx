'use client';

import React from 'react';
import type { Step } from '@/types/stepper';

// Re-export Step type for backward compatibility
export type { Step };

/**
 * Props for the VerticalStepper component
 */
interface VerticalStepperProps {
  steps: Step[];
  currentStep: number; // -1 = none, 0-N = active step index
  isRunning: boolean;
}

/**
 * VerticalStepper - Renders animated steps with checkmarks, pulse indicators, and connecting lines
 *
 * Visual states:
 * - Completed: Green checkmark, green line
 * - Active: Blue pulsing indicator, gray line
 * - Future: Not rendered
 *
 * @example
 * <VerticalStepper
 *   steps={[
 *     { id: 'context', label: 'Context gathered' },
 *     { id: 'generating', label: 'Generating questions' },
 *   ]}
 *   currentStep={1}
 *   isRunning={true}
 * />
 */
export const VerticalStepper = React.memo<VerticalStepperProps>(
  ({ steps, currentStep, isRunning }) => {
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
                    ${isActive ? 'bg-blue-500 text-white ring-2 ring-blue-200' : ''}
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
              {/* Step label */}
              <div className={`pb-3 ${isLast ? 'pb-0' : ''}`}>
                <div
                  className={`
                    text-sm transition-colors duration-300
                    ${isComplete ? 'text-slate-600' : ''}
                    ${isActive ? 'text-slate-700 font-medium' : ''}
                  `}
                >
                  {step.label}
                  {isActive && <span className="text-blue-500 animate-pulse">...</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);

VerticalStepper.displayName = 'VerticalStepper';
