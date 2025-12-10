/**
 * Guardian Questionnaire Generation Progress Component
 * 
 * A collapsible chat bubble with vertical stepper that shows tool call progress
 * during questionnaire generation. Auto-collapses when complete to reveal download buttons.
 * 
 * BEHAVIOR:
 * - Idle: Shows generate button
 * - Running: Expands stepper, steps appear progressively as they complete
 * - Complete: Auto-collapses after 800ms, shows summary header + download buttons
 * - User can manually expand/collapse via chevron anytime
 * 
 * PROPS:
 * - steps: Array of { id: string, label: string } - the generation steps
 * - currentStep: number - index of current step (-1 = idle, >= steps.length = complete)
 * - isRunning: boolean - whether generation is in progress
 * - isComplete: boolean - whether all steps finished
 * - onGenerate: () => void - callback when generate button clicked
 * - onDownload: (format: 'word' | 'pdf' | 'excel') => void - callback for downloads
 * - questionCount?: number - number of questions generated (shown in summary)
 * - assessmentType?: string - type label (shown in summary)
 */

import React, { useState, useEffect } from 'react';

// Required CSS (add to global styles or CSS module)
const styles = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fadeIn {
    animation: fadeIn 0.3s ease-out forwards;
  }
`;

// Step type definition
interface Step {
  id: string;
  label: string;
}

// Vertical Stepper - renders completed and active steps with connecting lines
const VerticalStepper = ({ 
  steps, 
  currentStep, 
  isRunning 
}: { 
  steps: Step[]; 
  currentStep: number; 
  isRunning: boolean;
}) => (
  <div className="space-y-0 py-1">
    {steps.slice(0, Math.max(currentStep + 1, 0)).map((step, idx) => {
      const isComplete = idx < currentStep;
      const isActive = idx === currentStep && isRunning;
      const isLast = idx === Math.min(currentStep, steps.length - 1);
      
      return (
        <div 
          key={step.id} 
          className="flex items-stretch animate-fadeIn"
          style={{ animationDelay: `${idx * 100}ms` }}
        >
          {/* Left indicator column */}
          <div className="flex flex-col items-center mr-3">
            <div
              className={`
                w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all duration-300
                ${isComplete ? 'bg-emerald-500 text-white' : ''}
                ${isActive ? 'bg-blue-500 text-white ring-2 ring-blue-200' : ''}
              `}
            >
              {isComplete ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : isActive ? (
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              ) : null}
            </div>
            {/* Connecting line */}
            {!isLast && (
              <div className={`w-0.5 flex-1 min-h-[16px] transition-colors duration-300 ${isComplete ? 'bg-emerald-300' : 'bg-slate-200'}`} />
            )}
          </div>
          {/* Step label */}
          <div className={`pb-3 ${isLast ? 'pb-0' : ''}`}>
            <div className={`
              text-sm transition-colors duration-300
              ${isComplete ? 'text-slate-600' : ''}
              ${isActive ? 'text-slate-700 font-medium' : ''}
            `}>
              {step.label}
              {isActive && <span className="text-blue-500 animate-pulse">...</span>}
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

// Main Component
interface QuestionnaireProgressProps {
  steps: Step[];
  currentStep: number;
  isRunning: boolean;
  isComplete: boolean;
  onGenerate: () => void;
  onDownload: (format: 'word' | 'pdf' | 'excel') => void;
  questionCount?: number;
  assessmentType?: string;
}

const QuestionnaireProgress: React.FC<QuestionnaireProgressProps> = ({
  steps,
  currentStep,
  isRunning,
  isComplete,
  onGenerate,
  onDownload,
  questionCount = 40,
  assessmentType = 'Patient-facing AI chatbot',
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Auto-collapse when complete
  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => setIsExpanded(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isComplete]);

  // Auto-expand when generation starts
  useEffect(() => {
    if (isRunning && currentStep >= 0) {
      setIsExpanded(true);
    }
  }, [isRunning, currentStep]);

  const hasStarted = currentStep >= 0;

  // NOTE: No avatar in this component - the card appears inline after a Guardian
  // message which already has the avatar. Adding one here would be redundant.

  return (
    <>
      <style>{styles}</style>
      <div className="bg-slate-50 rounded-2xl rounded-tl-sm p-4 max-w-md border border-slate-100">
        <div>
          {/* Message text - changes based on state */}
          <div className="text-sm text-slate-700 mb-3">
            {!hasStarted && "Ready to generate your questionnaire."}
            {hasStarted && !isComplete && `Generating questionnaire for a ${assessmentType.toLowerCase()} assessment.`}
            {isComplete && `Perfect! I've generated the questionnaire for a ${assessmentType.toLowerCase()} assessment.`}
          </div>

          {/* Collapsible stepper section */}
          {hasStarted && (
            <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
              {/* Header - always visible, clickable to toggle */}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isComplete ? (
                    <>
                      <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-slate-700">Assessment Complete</span>
                    </>
                  ) : (
                    <>
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm font-medium text-slate-700">Generating Assessment</span>
                    </>
                  )}
                </div>
                {/* Chevron */}
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expandable stepper content */}
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="px-3 pb-3 border-t border-slate-100">
                  <div className="pt-3">
                    <VerticalStepper steps={steps} currentStep={currentStep} isRunning={isRunning} />
                  </div>
                </div>
              </div>

              {/* Summary meta info - shown when collapsed and complete */}
              {isComplete && !isExpanded && (
                <div className="px-3 pb-2.5 -mt-1">
                  <span className="text-xs text-slate-500">{questionCount} questions · {assessmentType}</span>
                </div>
              )}
            </div>
          )}

          {/* Download buttons - appear after complete */}
          {isComplete && (
            <div className="flex items-center gap-2 mt-3 animate-fadeIn">
              {/* Primary: Word */}
              <button
                onClick={() => onDownload('word')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Word
              </button>
              {/* Secondary: PDF, Excel */}
              <button
                onClick={() => onDownload('pdf')}
                className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                PDF
              </button>
              <button
                onClick={() => onDownload('excel')}
                className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Excel
              </button>
            </div>
          )}

          {/* Generate button - only when idle */}
          {!hasStarted && (
            <button
              onClick={onGenerate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Generate Questionnaire
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default QuestionnaireProgress;

/**
 * USAGE EXAMPLE:
 * 
 * const GENERATION_STEPS = [
 *   { id: 'context', label: 'Context gathered' },
 *   { id: 'generating', label: 'Generating questionnaire' },
 *   { id: 'validating', label: 'Validating structure' },
 *   { id: 'saving', label: 'Saving questions' },
 * ];
 * 
 * <QuestionnaireProgress
 *   steps={GENERATION_STEPS}
 *   currentStep={currentStep}           // -1 = idle, 0-3 = in progress, 4+ = complete
 *   isRunning={isGenerating}
 *   isComplete={currentStep >= GENERATION_STEPS.length}
 *   onGenerate={handleGenerateClick}
 *   onDownload={(format) => downloadQuestionnaire(format)}
 *   questionCount={40}
 *   assessmentType="Patient-facing AI chatbot"
 * />
 * 
 * INTEGRATION WITH WEBSOCKET:
 * 
 * // Map your socket events to step progression:
 * socket.on('tool_start', (toolName) => {
 *   if (toolName === 'questionnaire_ready') setCurrentStep(0);
 * });
 * socket.on('generation_started', () => setCurrentStep(1));
 * socket.on('validation_complete', () => setCurrentStep(2));
 * socket.on('questions_saved', () => setCurrentStep(3));
 * socket.on('export_ready', () => setCurrentStep(4)); // triggers complete state
 */