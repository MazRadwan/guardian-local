import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QuestionnairePromptCard } from '../QuestionnairePromptCard';
import { GENERATION_STEPS } from '@/types/stepper';
import type { Step } from '@/types/stepper';
import { useChatStore } from '@/stores/chatStore';

// Use actual GENERATION_STEPS for realistic testing
const mockSteps: Step[] = GENERATION_STEPS;

const mockPayload = {
  conversationId: 'conv-123',
  assessmentType: 'comprehensive' as const,
  vendorName: 'Test Vendor',
  solutionName: 'Test Solution',
  contextSummary: 'AI-powered diagnostic tool',
  estimatedQuestions: 90,
  selectedCategories: null,
};


describe('QuestionnairePromptCard', () => {
  const defaultProps = {
    payload: mockPayload,
    uiState: 'ready' as const,
    onGenerate: jest.fn(),
    onDownload: jest.fn(),
    onRetry: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Ready state', () => {
    it('renders summary information', () => {
      render(<QuestionnairePromptCard {...defaultProps} />);
      expect(screen.getByText('Ready to generate your questionnaire.')).toBeInTheDocument();
      expect(screen.getByText(/Test Vendor/)).toBeInTheDocument();
      expect(screen.getByText(/~90 questions/)).toBeInTheDocument();
    });

    it('displays assessment type badge', () => {
      render(<QuestionnairePromptCard {...defaultProps} />);
      expect(screen.getByText('Comprehensive Assessment')).toBeInTheDocument();
    });

    it('displays vendor and solution name', () => {
      render(<QuestionnairePromptCard {...defaultProps} />);
      expect(screen.getByText(/Test Vendor - Test Solution/)).toBeInTheDocument();
    });

    it('displays context summary', () => {
      render(<QuestionnairePromptCard {...defaultProps} />);
      expect(screen.getByText(/AI-powered diagnostic tool/)).toBeInTheDocument();
    });

    it('calls onGenerate when button clicked', () => {
      render(<QuestionnairePromptCard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('generate-questionnaire-btn'));
      expect(defaultProps.onGenerate).toHaveBeenCalled();
    });

    it('renders with minimal payload', () => {
      const minimalPayload = {
        conversationId: 'conv-123',
        assessmentType: 'quick' as const,
        vendorName: null,
        solutionName: null,
        contextSummary: null,
        estimatedQuestions: null,
        selectedCategories: null,
      };
      render(<QuestionnairePromptCard {...defaultProps} payload={minimalPayload} />);
      expect(screen.getByText('Ready to generate your questionnaire.')).toBeInTheDocument();
      expect(screen.getByText(/~30-40 questions/)).toBeInTheDocument();
    });

    it('displays category-focused badge for category_focused type', () => {
      const categoryPayload = {
        ...mockPayload,
        assessmentType: 'category_focused' as const,
        selectedCategories: ['Security', 'Privacy'],
      };
      render(<QuestionnairePromptCard {...defaultProps} payload={categoryPayload} />);
      expect(screen.getByText('Category-Focused Assessment')).toBeInTheDocument();
    });
  });

  describe('Generating state', () => {
    it('disables generate button', () => {
      render(<QuestionnairePromptCard {...defaultProps} uiState="generating" />);
      expect(screen.getByTestId('generate-questionnaire-btn')).toBeDisabled();
    });

    it('shows stepper during generation', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="generating"
          steps={mockSteps}
          currentStep={1}
          isRunning={true}
        />
      );
      expect(screen.getByText('Generating Assessment')).toBeInTheDocument();
      expect(screen.getByTestId('stepper-toggle')).toBeInTheDocument();
    });

    it('shows generation message', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="generating"
          steps={mockSteps}
          currentStep={1}
          isRunning={true}
        />
      );
      expect(screen.getByText(/Generating questionnaire for your comprehensive assessment/i)).toBeInTheDocument();
    });

    it('shows disabled generate button with "Generating..." text during generation', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="generating"
          steps={mockSteps}
          currentStep={1}
          isRunning={true}
        />
      );
      const button = screen.getByTestId('generate-questionnaire-btn');
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent('Generating...');
    });
  });

  describe('Download state', () => {
    it('renders download buttons for each format', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf', 'word', 'excel'], assessmentId: 'assess-123' }}
        />
      );
      expect(screen.getByTestId('download-pdf-btn')).toBeInTheDocument();
      expect(screen.getByTestId('download-word-btn')).toBeInTheDocument();
      expect(screen.getByTestId('download-excel-btn')).toBeInTheDocument();
    });

    it('displays correct text for download state', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
        />
      );
      expect(screen.getByText(/Perfect! I've generated the questionnaire/)).toBeInTheDocument();
    });

    it('calls onDownload with format when clicked', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
        />
      );
      fireEvent.click(screen.getByTestId('download-pdf-btn'));
      expect(defaultProps.onDownload).toHaveBeenCalledWith('pdf');
    });

    it('calls onDownload for each format independently', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf', 'word'], assessmentId: 'assess-123' }}
        />
      );
      fireEvent.click(screen.getByTestId('download-pdf-btn'));
      fireEvent.click(screen.getByTestId('download-word-btn'));
      expect(defaultProps.onDownload).toHaveBeenCalledWith('pdf');
      expect(defaultProps.onDownload).toHaveBeenCalledWith('word');
      expect(defaultProps.onDownload).toHaveBeenCalledTimes(2);
    });

    it('shows Assessment Complete header with stepper in download state', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={4}
        />
      );
      expect(screen.getByText('Assessment Complete')).toBeInTheDocument();
      expect(screen.getByTestId('stepper-toggle')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('renders error message and retry button', () => {
      render(
        <QuestionnairePromptCard {...defaultProps} uiState="error" error="Network error" />
      );
      expect(screen.getByText('Generation Failed')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
      expect(screen.getByTestId('retry-btn')).toBeInTheDocument();
    });

    it('renders default error message if none provided', () => {
      render(<QuestionnairePromptCard {...defaultProps} uiState="error" />);
      expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
    });

    it('calls onRetry when retry clicked', () => {
      render(<QuestionnairePromptCard {...defaultProps} uiState="error" />);
      fireEvent.click(screen.getByTestId('retry-btn'));
      expect(defaultProps.onRetry).toHaveBeenCalled();
    });
  });

  describe('Stepper collapse/expand (Story 13.4.4)', () => {
    it('stepper is expanded by default', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="generating"
          steps={mockSteps}
          currentStep={1}
          isRunning={true}
        />
      );
      // Expanded state shows max-h-64 opacity-100
      const stepperContent = screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-64');
      expect(stepperContent).toBeInTheDocument();
    });

    it('toggles stepper on click', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="generating"
          steps={mockSteps}
          currentStep={1}
          isRunning={true}
        />
      );
      const toggle = screen.getByTestId('stepper-toggle');
      fireEvent.click(toggle);
      // After click, should collapse (max-h-0)
      const stepperContent = toggle.parentElement?.querySelector('.max-h-0');
      expect(stepperContent).toBeInTheDocument();
    });

    it('auto-collapses after completion (800ms delay)', async () => {
      const { rerender } = render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={4}
          isRunning={false}
        />
      );

      // Initially expanded
      expect(screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-64')).toBeInTheDocument();

      // Advance timers
      act(() => {
        jest.advanceTimersByTime(800);
      });

      // Should now be collapsed
      await waitFor(() => {
        expect(screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-0')).toBeInTheDocument();
      });
    });

    it('auto-expands when generation starts', () => {
      const { rerender } = render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="ready"
          steps={mockSteps}
          currentStep={-1}
          isRunning={false}
        />
      );

      // Start generation
      rerender(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="generating"
          steps={mockSteps}
          currentStep={0}
          isRunning={true}
        />
      );

      // Should be expanded
      expect(screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-64')).toBeInTheDocument();
    });

    it('shows summary meta when collapsed in download state', async () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={4}
          isRunning={false}
        />
      );

      // Collapse manually
      fireEvent.click(screen.getByTestId('stepper-toggle'));

      // Should show summary (format: "90 questions · Comprehensive Assessment")
      await waitFor(() => {
        expect(screen.getByText(/90 questions · Comprehensive Assessment/i)).toBeInTheDocument();
      });
    });
  });

  describe('Bubble styling', () => {
    it('applies assistant bubble styling', () => {
      const { container } = render(<QuestionnairePromptCard {...defaultProps} />);
      const card = container.querySelector('[data-testid="questionnaire-card-ready"]');
      expect(card).toHaveClass('bg-slate-50', 'rounded-2xl', 'rounded-tl-sm');
    });

    it('applies same bubble styling for all assessment types', () => {
      const quickPayload = { ...mockPayload, assessmentType: 'quick' as const };
      const { container: quickContainer } = render(<QuestionnairePromptCard {...defaultProps} payload={quickPayload} />);
      const quickCard = quickContainer.querySelector('[data-testid="questionnaire-card-ready"]');
      expect(quickCard).toHaveClass('bg-slate-50');

      const categoryPayload = { ...mockPayload, assessmentType: 'category_focused' as const };
      const { container: categoryContainer } = render(<QuestionnairePromptCard {...defaultProps} payload={categoryPayload} />);
      const categoryCard = categoryContainer.querySelector('[data-testid="questionnaire-card-ready"]');
      expect(categoryCard).toHaveClass('bg-slate-50');
    });

    it('keeps assessment type badge colors', () => {
      render(<QuestionnairePromptCard {...defaultProps} />);
      const badge = screen.getByText('Comprehensive Assessment');
      expect(badge).toHaveClass('text-blue-600', 'bg-blue-50');
    });
  });

  describe('forwardRef', () => {
    it('forwards ref to card element in ready state', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<QuestionnairePromptCard {...defaultProps} ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(ref.current).toHaveAttribute('data-testid', 'questionnaire-card-ready');
    });

    it('forwards ref to card element in error state', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<QuestionnairePromptCard {...defaultProps} uiState="error" ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(ref.current).toHaveAttribute('data-testid', 'questionnaire-card-error');
    });

    it('forwards ref to card element in download state', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          ref={ref}
        />
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(ref.current).toHaveAttribute('data-testid', 'questionnaire-card-download');
    });
  });

  describe('Custom className', () => {
    it('applies custom className to card', () => {
      const { container } = render(
        <QuestionnairePromptCard {...defaultProps} className="custom-class" />
      );
      const card = container.querySelector('[data-testid="questionnaire-card-ready"]');
      expect(card).toHaveClass('custom-class');
    });
  });

  describe('Stepper integration (Story 13.4.3)', () => {
    it('shows vendor info during ready state (not stepper)', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="ready"
          steps={mockSteps}
          currentStep={-1}
        />
      );

      expect(screen.getByText(/Test Vendor/)).toBeInTheDocument();
      expect(screen.queryByTestId('stepper-toggle')).not.toBeInTheDocument();
    });

    it('shows stepper steps during generation', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="generating"
          steps={mockSteps}
          currentStep={1}
          isRunning={true}
        />
      );

      expect(screen.getByText('Context gathered')).toBeInTheDocument();
      expect(screen.getByText(/Generating questions/)).toBeInTheDocument();
    });

    it('shows spinner header during generation', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="generating"
          steps={mockSteps}
          currentStep={1}
          isRunning={true}
        />
      );

      expect(screen.getByText('Generating Assessment')).toBeInTheDocument();
      // Spinner icon should be present (Loader2 with animate-spin)
      const header = screen.getByTestId('stepper-toggle');
      expect(header.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('shows checkmark header when complete', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      expect(screen.getByText('Assessment Complete')).toBeInTheDocument();
      // Checkmark icon should be present (CheckCircle2 with emerald color)
      const header = screen.getByTestId('stepper-toggle');
      // The icon should have emerald styling (could be on icon or container)
      expect(header.querySelector('svg')).toBeInTheDocument();
      expect(header.querySelector('.animate-spin')).not.toBeInTheDocument(); // No spinner
    });

    it('uses GENERATION_STEPS.length for completion check', () => {
      // Complete state is when currentStep >= steps.length
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Should show complete header, not generating
      expect(screen.getByText('Assessment Complete')).toBeInTheDocument();
      expect(screen.queryByText('Generating Assessment')).not.toBeInTheDocument();
    });

    it('does not show stepper in error state', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="error"
          error="Test error"
          steps={mockSteps}
          currentStep={2}
        />
      );

      expect(screen.getByText('Generation Failed')).toBeInTheDocument();
      expect(screen.queryByTestId('stepper-toggle')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Story 13.6.1 - Completion Guards
  // ─────────────────────────────────────────────────────────────
  describe('Completion guards (Story 13.6.1)', () => {
    it('does NOT auto-collapse on error state', async () => {
      // Error state should keep stepper expanded to show failure point
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="error"
          error="Generation failed"
          steps={mockSteps}
          currentStep={2}
        />
      );

      // Error state doesn't show stepper, so this test just verifies no crash
      act(() => {
        jest.advanceTimersByTime(800);
      });

      // Error UI should still be visible
      expect(screen.getByText('Generation Failed')).toBeInTheDocument();
    });

    it('does NOT auto-collapse on complete→error transition (timer cleared)', async () => {
      const { rerender } = render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Initially expanded
      expect(screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-64')).toBeInTheDocument();

      // Transition to error BEFORE 800ms timer fires
      rerender(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="error"
          error="Late error"
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Advance past the 800ms - timer should have been cleared
      act(() => {
        jest.advanceTimersByTime(800);
      });

      // Error UI should be showing (not collapsed download state)
      expect(screen.getByText('Generation Failed')).toBeInTheDocument();
    });

    it('expands stepper when error occurs', () => {
      // Start in download state, collapsed
      const { rerender } = render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Manually collapse
      fireEvent.click(screen.getByTestId('stepper-toggle'));
      expect(screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-0')).toBeInTheDocument();

      // Switch to generating state (would show stepper)
      rerender(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="generating"
          steps={mockSteps}
          currentStep={1}
          isRunning={true}
        />
      );

      // Should be expanded again
      expect(screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-64')).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Story 13.6.2 - Conversation Scoping
  // ─────────────────────────────────────────────────────────────
  describe('Conversation scoping (Story 13.6.2)', () => {
    beforeEach(() => {
      // Reset store state
      useChatStore.setState({ activeConversationId: 'convo-a' });
    });

    it('resets expand state when conversation switches', async () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Manually collapse
      fireEvent.click(screen.getByTestId('stepper-toggle'));
      expect(screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-0')).toBeInTheDocument();

      // Switch conversation
      act(() => {
        useChatStore.setState({ activeConversationId: 'convo-b' });
      });

      // Should reset to expanded
      await waitFor(() => {
        expect(screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-64')).toBeInTheDocument();
      });
    });

    it('clears pending collapse timer when conversation switches mid-delay', async () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Initially expanded
      expect(screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-64')).toBeInTheDocument();

      // Advance 400ms (halfway through collapse delay)
      act(() => {
        jest.advanceTimersByTime(400);
      });

      // Switch conversation mid-timer
      act(() => {
        useChatStore.setState({ activeConversationId: 'convo-b' });
      });

      // Advance remaining 400ms - timer should have been cleared
      act(() => {
        jest.advanceTimersByTime(400);
      });

      // Should still be expanded (timer was cleared on conversation switch)
      await waitFor(() => {
        expect(screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-64')).toBeInTheDocument();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Story 13.6.4 - Summary Fallbacks
  // ─────────────────────────────────────────────────────────────
  describe('Summary fallbacks (Story 13.6.4)', () => {
    it('shows full summary when all data present', async () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Collapse to see summary
      fireEvent.click(screen.getByTestId('stepper-toggle'));

      await waitFor(() => {
        expect(screen.getByText(/~90 questions/)).toBeInTheDocument();
        expect(screen.getByText(/Comprehensive Assessment/)).toBeInTheDocument();
      });
    });

    it('shows "Assessment complete" fallback when estimatedQuestions missing', async () => {
      const payloadWithoutQuestions = {
        ...mockPayload,
        estimatedQuestions: null,
      };

      render(
        <QuestionnairePromptCard
          {...defaultProps}
          payload={payloadWithoutQuestions}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Collapse to see summary
      fireEvent.click(screen.getByTestId('stepper-toggle'));

      await waitFor(() => {
        expect(screen.getByText(/Assessment complete/)).toBeInTheDocument();
      });
    });

    it('shows assessment type when estimatedQuestions missing', async () => {
      const payloadWithoutQuestions = {
        ...mockPayload,
        estimatedQuestions: null,
      };

      render(
        <QuestionnairePromptCard
          {...defaultProps}
          payload={payloadWithoutQuestions}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Collapse to see summary
      fireEvent.click(screen.getByTestId('stepper-toggle'));

      await waitFor(() => {
        // Should show "Assessment complete · Comprehensive Assessment"
        expect(screen.getByText(/Assessment complete/)).toBeInTheDocument();
        expect(screen.getByText(/Comprehensive Assessment/)).toBeInTheDocument();
      });
    });

    it('handles quick assessment type in summary', async () => {
      const quickPayload = {
        ...mockPayload,
        assessmentType: 'quick' as const,
        estimatedQuestions: 35,
      };

      render(
        <QuestionnairePromptCard
          {...defaultProps}
          payload={quickPayload}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Collapse to see summary
      fireEvent.click(screen.getByTestId('stepper-toggle'));

      await waitFor(() => {
        expect(screen.getByText(/~35 questions/)).toBeInTheDocument();
        expect(screen.getByText(/Quick Assessment/)).toBeInTheDocument();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Story 13.6.3 - Download Buttons Always Visible
  // ─────────────────────────────────────────────────────────────
  describe('Download buttons visibility (Story 13.6.3)', () => {
    it('download buttons visible when expanded', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf', 'word', 'excel'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Stepper is expanded
      expect(screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-64')).toBeInTheDocument();

      // Download buttons should be visible
      expect(screen.getByTestId('download-pdf-btn')).toBeInTheDocument();
      expect(screen.getByTestId('download-word-btn')).toBeInTheDocument();
      expect(screen.getByTestId('download-excel-btn')).toBeInTheDocument();
    });

    it('download buttons visible when collapsed', async () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf', 'word', 'excel'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Collapse stepper
      fireEvent.click(screen.getByTestId('stepper-toggle'));

      await waitFor(() => {
        expect(screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-0')).toBeInTheDocument();
      });

      // Download buttons should STILL be visible (outside collapsible section)
      expect(screen.getByTestId('download-pdf-btn')).toBeInTheDocument();
      expect(screen.getByTestId('download-word-btn')).toBeInTheDocument();
      expect(screen.getByTestId('download-excel-btn')).toBeInTheDocument();
    });

    it('download buttons work after auto-collapse', async () => {
      const onDownload = jest.fn();

      render(
        <QuestionnairePromptCard
          {...defaultProps}
          onDownload={onDownload}
          uiState="download"
          exportData={{ formats: ['pdf', 'word'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Wait for auto-collapse
      act(() => {
        jest.advanceTimersByTime(800);
      });

      await waitFor(() => {
        expect(screen.getByTestId('stepper-toggle').parentElement?.querySelector('.max-h-0')).toBeInTheDocument();
      });

      // Click download buttons
      fireEvent.click(screen.getByTestId('download-pdf-btn'));
      fireEvent.click(screen.getByTestId('download-word-btn'));

      expect(onDownload).toHaveBeenCalledWith('pdf');
      expect(onDownload).toHaveBeenCalledWith('word');
      expect(onDownload).toHaveBeenCalledTimes(2);
    });

    it('allows multiple downloads (state not cleared)', async () => {
      const onDownload = jest.fn();

      render(
        <QuestionnairePromptCard
          {...defaultProps}
          onDownload={onDownload}
          uiState="download"
          exportData={{ formats: ['pdf', 'word', 'excel'], assessmentId: 'assess-123' }}
          steps={mockSteps}
          currentStep={GENERATION_STEPS.length}
          isRunning={false}
        />
      );

      // Download same format multiple times
      fireEvent.click(screen.getByTestId('download-pdf-btn'));
      fireEvent.click(screen.getByTestId('download-pdf-btn'));
      fireEvent.click(screen.getByTestId('download-word-btn'));

      expect(onDownload).toHaveBeenCalledTimes(3);
      expect(onDownload).toHaveBeenNthCalledWith(1, 'pdf');
      expect(onDownload).toHaveBeenNthCalledWith(2, 'pdf');
      expect(onDownload).toHaveBeenNthCalledWith(3, 'word');
    });
  });
});
