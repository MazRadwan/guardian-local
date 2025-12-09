/**
 * Step type for vertical steppers (Story 13.4.1)
 * Shared between chatStore and VerticalStepper component
 */
export interface Step {
  id: string;
  label: string;
}

/**
 * Default generation steps for questionnaire generation (Story 13.4.2)
 * These map to the backend questionnaire generation phases
 */
export const GENERATION_STEPS: Step[] = [
  { id: 'context', label: 'Context gathered' },
  { id: 'generating', label: 'Generating questions' },
  { id: 'validating', label: 'Validating structure' },
  { id: 'saving', label: 'Saving assessment' },
];
