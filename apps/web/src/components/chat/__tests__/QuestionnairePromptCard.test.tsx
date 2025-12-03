import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestionnairePromptCard } from '../QuestionnairePromptCard';

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
    onDismiss: jest.fn(),
    onDownload: jest.fn(),
    onRetry: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Ready state', () => {
    it('renders summary information', () => {
      render(<QuestionnairePromptCard {...defaultProps} />);
      expect(screen.getByText('Ready to Generate')).toBeInTheDocument();
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

    it('calls onDismiss when X clicked', () => {
      render(<QuestionnairePromptCard {...defaultProps} />);
      fireEvent.click(screen.getByTestId('dismiss-btn'));
      expect(defaultProps.onDismiss).toHaveBeenCalled();
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
      expect(screen.getByText('Ready to Generate')).toBeInTheDocument();
      expect(screen.getByText(/~30-40 questions/)).toBeInTheDocument();
    });

    it('displays selected categories for category_focused type', () => {
      const categoryPayload = {
        ...mockPayload,
        assessmentType: 'category_focused' as const,
        selectedCategories: ['Security', 'Privacy'],
      };
      render(<QuestionnairePromptCard {...defaultProps} payload={categoryPayload} />);
      expect(screen.getByText(/Security, Privacy/)).toBeInTheDocument();
    });
  });

  describe('Generating state', () => {
    it('shows spinner and disables button', () => {
      render(<QuestionnairePromptCard {...defaultProps} uiState="generating" />);
      expect(screen.getByText('Generating...')).toBeInTheDocument();
      expect(screen.getByTestId('generate-questionnaire-btn')).toBeDisabled();
    });

    it('shows generating text on button', () => {
      render(<QuestionnairePromptCard {...defaultProps} uiState="generating" />);
      expect(screen.getByText('Generating Questionnaire...')).toBeInTheDocument();
    });

    it('hides dismiss button during generation', () => {
      render(<QuestionnairePromptCard {...defaultProps} uiState="generating" />);
      expect(screen.queryByTestId('dismiss-btn')).not.toBeInTheDocument();
    });

    it('applies opacity style during generation', () => {
      const { container } = render(<QuestionnairePromptCard {...defaultProps} uiState="generating" />);
      const card = container.querySelector('[data-testid="questionnaire-card-ready"]');
      expect(card).toHaveClass('opacity-75');
    });
  });

  describe('Download state', () => {
    it('renders download buttons for each format', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf', 'docx', 'xlsx'], assessmentId: 'assess-123' }}
        />
      );
      expect(screen.getByTestId('download-pdf-btn')).toBeInTheDocument();
      expect(screen.getByTestId('download-docx-btn')).toBeInTheDocument();
      expect(screen.getByTestId('download-xlsx-btn')).toBeInTheDocument();
    });

    it('displays correct text for download state', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
        />
      );
      expect(screen.getByText('Questionnaire Ready')).toBeInTheDocument();
      expect(screen.getByText('Download your questionnaire:')).toBeInTheDocument();
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
          exportData={{ formats: ['pdf', 'docx'], assessmentId: 'assess-123' }}
        />
      );
      fireEvent.click(screen.getByTestId('download-pdf-btn'));
      fireEvent.click(screen.getByTestId('download-docx-btn'));
      expect(defaultProps.onDownload).toHaveBeenCalledWith('pdf');
      expect(defaultProps.onDownload).toHaveBeenCalledWith('docx');
      expect(defaultProps.onDownload).toHaveBeenCalledTimes(2);
    });

    it('shows dismiss button in download state', () => {
      render(
        <QuestionnairePromptCard
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
        />
      );
      expect(screen.getByTestId('dismiss-btn')).toBeInTheDocument();
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

    it('shows dismiss button in error state', () => {
      render(<QuestionnairePromptCard {...defaultProps} uiState="error" />);
      expect(screen.getByTestId('dismiss-btn')).toBeInTheDocument();
    });

    it('calls onDismiss from error state', () => {
      render(<QuestionnairePromptCard {...defaultProps} uiState="error" />);
      fireEvent.click(screen.getByTestId('dismiss-btn'));
      expect(defaultProps.onDismiss).toHaveBeenCalled();
    });
  });

  describe('Assessment type styling', () => {
    it('applies correct styling for quick assessment', () => {
      const quickPayload = { ...mockPayload, assessmentType: 'quick' as const };
      const { container } = render(<QuestionnairePromptCard {...defaultProps} payload={quickPayload} />);
      const card = container.querySelector('[data-testid="questionnaire-card-ready"]');
      expect(card).toHaveClass('border-green-200', 'bg-green-50');
    });

    it('applies correct styling for comprehensive assessment', () => {
      const { container } = render(<QuestionnairePromptCard {...defaultProps} />);
      const card = container.querySelector('[data-testid="questionnaire-card-ready"]');
      expect(card).toHaveClass('border-blue-200', 'bg-blue-50');
    });

    it('applies correct styling for category_focused assessment', () => {
      const categoryPayload = { ...mockPayload, assessmentType: 'category_focused' as const };
      const { container } = render(<QuestionnairePromptCard {...defaultProps} payload={categoryPayload} />);
      const card = container.querySelector('[data-testid="questionnaire-card-ready"]');
      expect(card).toHaveClass('border-purple-200', 'bg-purple-50');
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
});
