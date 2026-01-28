import React from 'react';
import { render, screen } from '@testing-library/react';
import { VerticalStepper } from '../VerticalStepper';
import type { Step } from '@/types/stepper';
import { GENERATION_STEPS } from '@/types/stepper';

// Use actual GENERATION_STEPS for realistic testing
const mockSteps: Step[] = GENERATION_STEPS;

describe('VerticalStepper', () => {
  describe('rendering', () => {
    it('renders nothing when currentStep is -1', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={-1} isRunning={false} />
      );

      expect(screen.queryByTestId('vertical-stepper')).not.toBeInTheDocument();
      expect(screen.queryByText('Context gathered')).not.toBeInTheDocument();
    });

    it('renders only first step when currentStep is 0', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={0} isRunning={true} />
      );

      expect(screen.getByTestId('vertical-stepper')).toBeInTheDocument();
      expect(screen.getByText('Context gathered')).toBeInTheDocument();
      expect(screen.queryByText('Generating questions')).not.toBeInTheDocument();
    });

    it('renders steps up to currentStep (inclusive)', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={2} isRunning={true} />
      );

      expect(screen.getByText('Context gathered')).toBeInTheDocument();
      expect(screen.getByText('Generating questions')).toBeInTheDocument();
      expect(screen.getByText(/Validating structure/)).toBeInTheDocument();
      expect(screen.queryByText('Saving assessment')).not.toBeInTheDocument();
    });

    it('renders all steps when currentStep equals length (complete)', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={GENERATION_STEPS.length} isRunning={false} />
      );

      expect(screen.getByText('Context gathered')).toBeInTheDocument();
      expect(screen.getByText('Generating questions')).toBeInTheDocument();
      expect(screen.getByText('Validating structure')).toBeInTheDocument();
      expect(screen.getByText('Saving assessment')).toBeInTheDocument();
    });

    it('renders correct step data-testids', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={1} isRunning={true} />
      );

      expect(screen.getByTestId('step-context')).toBeInTheDocument();
      expect(screen.getByTestId('step-generating')).toBeInTheDocument();
    });
  });

  describe('step indicators', () => {
    it('shows checkmark for completed steps', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={2} isRunning={true} />
      );

      // First two steps should have checkmarks
      expect(screen.getAllByTestId('checkmark-icon')).toHaveLength(2);
    });

    it('shows pulse indicator for active step when running', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={1} isRunning={true} />
      );

      expect(screen.getByTestId('pulse-indicator')).toBeInTheDocument();
    });

    it('does not show pulse indicator when not running', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={1} isRunning={false} />
      );

      expect(screen.queryByTestId('pulse-indicator')).not.toBeInTheDocument();
    });

    it('marks completed steps with data-state="complete"', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={2} isRunning={true} />
      );

      expect(screen.getByTestId('step-indicator-context')).toHaveAttribute('data-state', 'complete');
      expect(screen.getByTestId('step-indicator-generating')).toHaveAttribute('data-state', 'complete');
      expect(screen.getByTestId('step-indicator-validating')).toHaveAttribute('data-state', 'active');
    });

    it('shows "..." suffix on active step label when running', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={1} isRunning={true} />
      );

      // The active step (index 1) should have "..." suffix
      const activeStep = screen.getByTestId('step-generating');
      expect(activeStep).toHaveTextContent('Generating questions...');
    });

    it('does not show "..." suffix when not running', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={1} isRunning={false} />
      );

      const activeStep = screen.getByTestId('step-generating');
      expect(activeStep).not.toHaveTextContent('...');
    });
  });

  describe('connecting lines', () => {
    it('shows connecting line between steps', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={2} isRunning={true} />
      );

      // Should have lines for first two steps (not last)
      expect(screen.getByTestId('step-line-context')).toBeInTheDocument();
      expect(screen.getByTestId('step-line-generating')).toBeInTheDocument();
      expect(screen.queryByTestId('step-line-validating')).not.toBeInTheDocument();
    });

    it('shows green line for completed steps', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={2} isRunning={true} />
      );

      const completedLine = screen.getByTestId('step-line-context');
      expect(completedLine).toHaveClass('bg-emerald-300');
    });

    it('shows green line for completed steps (not gray)', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={2} isRunning={true} />
      );

      // When currentStep=2, steps 0 and 1 are complete, so their lines are green
      // Step 2 (validating) is active and last rendered, so no line
      const generatingLine = screen.getByTestId('step-line-generating');
      expect(generatingLine).toHaveClass('bg-emerald-300');
    });

    it('does not show line after last rendered step', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={0} isRunning={true} />
      );

      // Only one step rendered, should have no connecting line
      expect(screen.queryByTestId('step-line-context')).not.toBeInTheDocument();
    });
  });

  describe('animations', () => {
    it('applies fadeIn animation class to steps', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={1} isRunning={true} />
      );

      const steps = [
        screen.getByTestId('step-context'),
        screen.getByTestId('step-generating'),
      ];

      steps.forEach((step) => {
        expect(step).toHaveClass('animate-fadeIn');
      });
    });

    it('applies staggered animation delay', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={2} isRunning={true} />
      );

      const step0 = screen.getByTestId('step-context');
      const step1 = screen.getByTestId('step-generating');
      const step2 = screen.getByTestId('step-validating');

      expect(step0).toHaveStyle({ animationDelay: '0ms' });
      expect(step1).toHaveStyle({ animationDelay: '100ms' });
      expect(step2).toHaveStyle({ animationDelay: '200ms' });
    });
  });

  describe('edge cases', () => {
    it('handles empty steps array', () => {
      render(
        <VerticalStepper steps={[]} currentStep={0} isRunning={true} />
      );

      // Should render container but no steps
      expect(screen.getByTestId('vertical-stepper')).toBeInTheDocument();
    });

    it('handles currentStep beyond steps length', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={10} isRunning={false} />
      );

      // Should render all 4 steps (capped at array length)
      expect(screen.getByTestId('step-context')).toBeInTheDocument();
      expect(screen.getByTestId('step-generating')).toBeInTheDocument();
      expect(screen.getByTestId('step-validating')).toBeInTheDocument();
      expect(screen.getByTestId('step-saving')).toBeInTheDocument();
    });

    it('handles single step array', () => {
      const singleStep: Step[] = [{ id: 'only', label: 'Only step' }];

      render(
        <VerticalStepper steps={singleStep} currentStep={0} isRunning={true} />
      );

      expect(screen.getByText('Only step')).toBeInTheDocument();
      expect(screen.queryByTestId('step-line-only')).not.toBeInTheDocument();
    });
  });

  // Epic 32.2.2: Progress display tests
  describe('progress display (Epic 32.2.2)', () => {
    it('shows fallback text when no progress provided', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={1} isRunning={true} />
      );

      expect(screen.getByTestId('progress-fallback')).toHaveTextContent('Generating...');
    });

    it('displays progress message when provided', () => {
      const progress = {
        message: 'Generating questions for Data Security...',
        step: 3,
        totalSteps: 10,
      };

      render(
        <VerticalStepper steps={mockSteps} currentStep={1} isRunning={true} progress={progress} />
      );

      expect(screen.getByTestId('progress-text')).toHaveTextContent('Generating questions for Data Security...');
      expect(screen.getByTestId('progress-step-counter')).toHaveTextContent('Step 3 of 10');
    });

    it('does not show progress for completed steps', () => {
      const progress = {
        message: 'Generating...',
        step: 3,
        totalSteps: 10,
      };

      render(
        <VerticalStepper steps={mockSteps} currentStep={2} isRunning={true} progress={progress} />
      );

      // Progress should only show for active step (index 2)
      // Completed steps (0, 1) should not have progress
      const stepContext = screen.getByTestId('step-context');
      expect(stepContext).not.toContainElement(screen.queryByTestId('progress-text'));
    });

    it('does not show progress when not running', () => {
      const progress = {
        message: 'Generating...',
        step: 3,
        totalSteps: 10,
      };

      render(
        <VerticalStepper steps={mockSteps} currentStep={1} isRunning={false} progress={progress} />
      );

      // Progress should not be shown when not running
      expect(screen.queryByTestId('progress-message')).not.toBeInTheDocument();
    });
  });

  // Epic 32.2.3: Reconnection state tests
  describe('reconnection state (Epic 32.2.3)', () => {
    it('shows reconnecting message when isReconnecting is true', () => {
      render(
        <VerticalStepper steps={mockSteps} currentStep={1} isRunning={true} isReconnecting={true} />
      );

      expect(screen.getByTestId('reconnecting-message')).toBeInTheDocument();
      expect(screen.getByTestId('reconnecting-message')).toHaveTextContent('Reconnecting...');
    });

    it('shows progress message in parentheses during reconnection', () => {
      const progress = {
        message: 'Data Security',
        step: 3,
        totalSteps: 10,
      };

      render(
        <VerticalStepper steps={mockSteps} currentStep={1} isRunning={true} progress={progress} isReconnecting={true} />
      );

      expect(screen.getByTestId('reconnecting-message')).toHaveTextContent('Reconnecting... (Data Security)');
    });

    it('shows normal progress when not reconnecting', () => {
      const progress = {
        message: 'Generating questions for Data Security...',
        step: 3,
        totalSteps: 10,
      };

      render(
        <VerticalStepper steps={mockSteps} currentStep={1} isRunning={true} progress={progress} isReconnecting={false} />
      );

      expect(screen.queryByTestId('reconnecting-message')).not.toBeInTheDocument();
      expect(screen.getByTestId('progress-text')).toHaveTextContent('Generating questions for Data Security...');
    });
  });
});
