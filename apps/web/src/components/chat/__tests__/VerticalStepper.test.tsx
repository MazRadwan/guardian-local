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
});
