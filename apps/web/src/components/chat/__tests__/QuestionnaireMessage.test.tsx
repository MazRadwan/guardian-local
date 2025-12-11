import React from 'react';
import { render, screen } from '@testing-library/react';
import { QuestionnaireMessage } from '../QuestionnaireMessage';

// Mock QuestionnairePromptCard to avoid complex setup
jest.mock('../QuestionnairePromptCard', () => ({
  QuestionnairePromptCard: ({ uiState, inline }: { uiState: string; inline?: boolean }) => (
    <div
      data-testid="questionnaire-prompt-card"
      data-ui-state={uiState}
      data-inline={inline ? 'true' : 'false'}
    >
      Mocked Card
    </div>
  ),
}));

// Mock chatStore to avoid Zustand setup
jest.mock('@/stores/chatStore', () => ({
  useChatStore: jest.fn(() => 'conv-123'),
}));

const mockPayload = {
  conversationId: 'conv-123',
  assessmentType: 'comprehensive' as const,
  vendorName: 'Test Vendor',
  solutionName: 'Test Solution',
  contextSummary: 'Test context',
  estimatedQuestions: 85,
  selectedCategories: null,
};

describe('QuestionnaireMessage', () => {
  const defaultProps = {
    payload: mockPayload,
    uiState: 'ready' as const,
    onGenerate: jest.fn(),
    onDownload: jest.fn(),
    onRetry: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Layout Structure', () => {
    it('renders with assistant message layout (gray background)', () => {
      render(<QuestionnaireMessage {...defaultProps} />);

      const container = screen.getByTestId('questionnaire-message');
      expect(container).toHaveClass('bg-gray-50');
      expect(container).toHaveClass('flex', 'w-full', 'gap-4');
    });

    it('has correct aria-label for accessibility', () => {
      render(<QuestionnaireMessage {...defaultProps} />);

      const container = screen.getByTestId('questionnaire-message');
      expect(container).toHaveAttribute('aria-label', 'assistant message');
      expect(container).toHaveAttribute('role', 'article');
    });
  });

  describe('Avatar', () => {
    it('renders Guardian avatar with purple background', () => {
      const { container } = render(<QuestionnaireMessage {...defaultProps} />);

      const avatar = container.querySelector('.bg-purple-600.rounded-full');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveClass('h-8', 'w-8');
    });

    it('contains Bot icon inside avatar', () => {
      const { container } = render(<QuestionnaireMessage {...defaultProps} />);

      const avatar = container.querySelector('.bg-purple-600');
      const icon = avatar?.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Role Label', () => {
    it('renders Guardian role label', () => {
      render(<QuestionnaireMessage {...defaultProps} />);

      const label = screen.getByText('Guardian');
      expect(label).toBeInTheDocument();
      expect(label).toHaveClass('text-sm', 'font-semibold', 'text-gray-900');
    });
  });

  describe('QuestionnairePromptCard Integration', () => {
    it('renders QuestionnairePromptCard inside content area', () => {
      render(<QuestionnaireMessage {...defaultProps} />);

      expect(screen.getByTestId('questionnaire-prompt-card')).toBeInTheDocument();
    });

    it('passes inline=true to QuestionnairePromptCard', () => {
      render(<QuestionnaireMessage {...defaultProps} />);

      const card = screen.getByTestId('questionnaire-prompt-card');
      expect(card).toHaveAttribute('data-inline', 'true');
    });

    it('passes uiState to QuestionnairePromptCard', () => {
      render(<QuestionnaireMessage {...defaultProps} uiState="generating" />);

      const card = screen.getByTestId('questionnaire-prompt-card');
      expect(card).toHaveAttribute('data-ui-state', 'generating');
    });

    it('passes download uiState correctly', () => {
      render(<QuestionnaireMessage {...defaultProps} uiState="download" />);

      const card = screen.getByTestId('questionnaire-prompt-card');
      expect(card).toHaveAttribute('data-ui-state', 'download');
    });
  });

  describe('Timestamp', () => {
    it('renders timestamp when provided', () => {
      const timestamp = new Date('2024-01-15T10:30:00');
      render(<QuestionnaireMessage {...defaultProps} timestamp={timestamp} />);

      const timestampEl = screen.getByLabelText('Message timestamp');
      expect(timestampEl).toBeInTheDocument();
      expect(timestampEl).toHaveClass('text-xs', 'text-gray-500');
    });

    it('does not render timestamp when not provided', () => {
      render(<QuestionnaireMessage {...defaultProps} />);

      expect(screen.queryByLabelText('Message timestamp')).not.toBeInTheDocument();
    });

    it('formats timestamp correctly', () => {
      const timestamp = new Date('2024-01-15T10:30:00');
      render(<QuestionnaireMessage {...defaultProps} timestamp={timestamp} />);

      const timestampEl = screen.getByLabelText('Message timestamp');
      // Should contain time in HH:MM format
      expect(timestampEl.textContent).toMatch(/\d{1,2}:\d{2}/);
    });
  });

  describe('Custom ClassName', () => {
    it('applies custom className to container', () => {
      render(<QuestionnaireMessage {...defaultProps} className="custom-class" />);

      const container = screen.getByTestId('questionnaire-message');
      expect(container).toHaveClass('custom-class');
    });

    it('preserves default classes when custom className applied', () => {
      render(<QuestionnaireMessage {...defaultProps} className="custom-class" />);

      const container = screen.getByTestId('questionnaire-message');
      expect(container).toHaveClass('bg-gray-50', 'flex', 'custom-class');
    });
  });

  // Story 14.1.5: Auto-scroll download bubble into view
  describe('Scroll into view (Story 14.1.5)', () => {
    const mockScrollIntoView = jest.fn();

    beforeEach(() => {
      mockScrollIntoView.mockClear();
      Element.prototype.scrollIntoView = mockScrollIntoView;
    });

    afterEach(() => {
      // @ts-expect-error - restoring prototype
      delete Element.prototype.scrollIntoView;
    });

    it('scrolls into view when download state with exportData', async () => {
      // Use fake timers to control requestAnimationFrame
      jest.useFakeTimers();

      render(
        <QuestionnaireMessage
          {...defaultProps}
          uiState="download"
          exportData={{ formats: ['pdf'], assessmentId: 'assess-123' }}
        />
      );

      // Run requestAnimationFrame callback
      jest.runAllTimers();

      expect(mockScrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'end',
      });

      jest.useRealTimers();
    });

    it('does not scroll when uiState is not download', () => {
      jest.useFakeTimers();

      render(<QuestionnaireMessage {...defaultProps} uiState="ready" />);

      jest.runAllTimers();

      expect(mockScrollIntoView).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('does not scroll when exportData is null', () => {
      jest.useFakeTimers();

      render(
        <QuestionnaireMessage {...defaultProps} uiState="download" exportData={null} />
      );

      jest.runAllTimers();

      expect(mockScrollIntoView).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});
