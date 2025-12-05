import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StickyQuestionnaireIndicator } from '../StickyQuestionnaireIndicator';

describe('StickyQuestionnaireIndicator', () => {
  const defaultProps = {
    uiState: 'ready' as const,
    isVisible: false,
    onScrollToCard: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when isVisible is false', () => {
    render(<StickyQuestionnaireIndicator {...defaultProps} />);
    expect(screen.getByTestId('sticky-questionnaire-indicator')).toBeInTheDocument();
  });

  it('does not render when isVisible is true', () => {
    render(<StickyQuestionnaireIndicator {...defaultProps} isVisible={true} />);
    expect(screen.queryByTestId('sticky-questionnaire-indicator')).not.toBeInTheDocument();
  });

  it('calls onScrollToCard when clicked', () => {
    render(<StickyQuestionnaireIndicator {...defaultProps} />);
    fireEvent.click(screen.getByTestId('sticky-questionnaire-indicator'));
    expect(defaultProps.onScrollToCard).toHaveBeenCalled();
  });

  it('shows correct text for ready state', () => {
    render(<StickyQuestionnaireIndicator {...defaultProps} uiState="ready" />);
    expect(screen.getByText('Questionnaire ready to generate')).toBeInTheDocument();
  });

  it('shows correct text for generating state', () => {
    render(<StickyQuestionnaireIndicator {...defaultProps} uiState="generating" />);
    expect(screen.getByText('Generating questionnaire...')).toBeInTheDocument();
  });

  it('shows correct text for download state', () => {
    render(<StickyQuestionnaireIndicator {...defaultProps} uiState="download" />);
    expect(screen.getByText('Questionnaire ready to download')).toBeInTheDocument();
  });

  it('shows correct text for error state', () => {
    render(<StickyQuestionnaireIndicator {...defaultProps} uiState="error" />);
    expect(screen.getByText('Generation failed - click to retry')).toBeInTheDocument();
  });

  it('has correct aria-label for accessibility', () => {
    render(<StickyQuestionnaireIndicator {...defaultProps} uiState="ready" />);
    const button = screen.getByTestId('sticky-questionnaire-indicator');
    expect(button).toHaveAttribute('aria-label', 'Questionnaire ready to generate - click to scroll to card');
  });

  it('is a button element for keyboard accessibility', () => {
    render(<StickyQuestionnaireIndicator {...defaultProps} />);
    const button = screen.getByTestId('sticky-questionnaire-indicator');
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  describe('styling by state', () => {
    it('has blue styling for ready state', () => {
      render(<StickyQuestionnaireIndicator {...defaultProps} uiState="ready" />);
      const button = screen.getByTestId('sticky-questionnaire-indicator');
      expect(button).toHaveClass('bg-blue-50', 'border-blue-200', 'text-blue-600');
    });

    it('has blue styling for generating state', () => {
      render(<StickyQuestionnaireIndicator {...defaultProps} uiState="generating" />);
      const button = screen.getByTestId('sticky-questionnaire-indicator');
      expect(button).toHaveClass('bg-blue-50', 'border-blue-200', 'text-blue-600');
    });

    it('has green styling for download state', () => {
      render(<StickyQuestionnaireIndicator {...defaultProps} uiState="download" />);
      const button = screen.getByTestId('sticky-questionnaire-indicator');
      expect(button).toHaveClass('bg-green-50', 'border-green-200', 'text-green-600');
    });

    it('has red styling for error state', () => {
      render(<StickyQuestionnaireIndicator {...defaultProps} uiState="error" />);
      const button = screen.getByTestId('sticky-questionnaire-indicator');
      expect(button).toHaveClass('bg-red-50', 'border-red-200', 'text-red-600');
    });
  });

  it('spinner animates in generating state', () => {
    const { container } = render(<StickyQuestionnaireIndicator {...defaultProps} uiState="generating" />);
    const icon = container.querySelector('.animate-spin');
    expect(icon).toBeInTheDocument();
  });

  it('no animation in other states', () => {
    const { container: readyContainer } = render(<StickyQuestionnaireIndicator {...defaultProps} uiState="ready" />);
    expect(readyContainer.querySelector('.animate-spin')).not.toBeInTheDocument();

    const { container: downloadContainer } = render(<StickyQuestionnaireIndicator {...defaultProps} uiState="download" />);
    expect(downloadContainer.querySelector('.animate-spin')).not.toBeInTheDocument();

    const { container: errorContainer } = render(<StickyQuestionnaireIndicator {...defaultProps} uiState="error" />);
    expect(errorContainer.querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<StickyQuestionnaireIndicator {...defaultProps} className="custom-class" />);
    const button = screen.getByTestId('sticky-questionnaire-indicator');
    expect(button).toHaveClass('custom-class');
  });

  it('has correct height (h-10 = 40px)', () => {
    render(<StickyQuestionnaireIndicator {...defaultProps} />);
    const button = screen.getByTestId('sticky-questionnaire-indicator');
    expect(button).toHaveClass('h-10');
  });

  it('is full width', () => {
    render(<StickyQuestionnaireIndicator {...defaultProps} />);
    const button = screen.getByTestId('sticky-questionnaire-indicator');
    expect(button).toHaveClass('w-full');
  });

  it('has hover effect', () => {
    render(<StickyQuestionnaireIndicator {...defaultProps} uiState="ready" />);
    const button = screen.getByTestId('sticky-questionnaire-indicator');
    expect(button).toHaveClass('hover:bg-blue-100');
  });
});
