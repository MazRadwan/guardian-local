import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatMessage } from '../ChatMessage';
import { useChatStore } from '@/stores/chatStore';

// Mock next/navigation for DownloadButton (used in EmbeddedScoringResult)
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/chat',
}));

// Mock useAuth for DownloadButton
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    token: 'test-token',
    logout: jest.fn(),
  }),
}));

// Mock the store
jest.mock('@/stores/chatStore', () => ({
  useChatStore: jest.fn(),
}));

const mockUseChatStore = useChatStore as jest.MockedFunction<typeof useChatStore>;

describe('ChatMessage', () => {
  beforeEach(() => {
    // Default mock: no scoring result in store
    mockUseChatStore.mockImplementation((selector) => {
      const state = {
        activeConversationId: 'conv-123',
        scoringResultByConversation: {},
      };
      return selector(state as any);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  it('renders user message with correct styling', () => {
    render(<ChatMessage role="user" content="Hello" />);

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'user message');
  });

  it('renders assistant message with correct styling', () => {
    render(<ChatMessage role="assistant" content="Hello back" />);

    expect(screen.getByText('Guardian')).toBeInTheDocument();
    expect(screen.getByText('Hello back')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'assistant message');
  });

  it('renders system message', () => {
    render(<ChatMessage role="system" content="System notification" />);

    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('System notification')).toBeInTheDocument();
  });

  it('renders markdown content', () => {
    const markdownContent = '**Bold text** and *italic text*';
    render(<ChatMessage role="assistant" content={markdownContent} />);

    // Markdown should be rendered as HTML
    const article = screen.getByRole('article');
    expect(article).toBeInTheDocument();
  });

  // Epic 21 Story 21.3: Timestamps removed from UI
  // it('displays timestamp when provided', () => {
  //   const timestamp = new Date('2024-01-01T12:00:00');
  //   render(<ChatMessage role="user" content="Test" timestamp={timestamp} />);
  //   expect(screen.getByLabelText('Message timestamp')).toBeInTheDocument();
  // });

  it('renders embedded button component', () => {
    const components = [
      {
        type: 'button' as const,
        data: { label: 'Click me', action: 'test_action' },
      },
    ];

    render(<ChatMessage role="assistant" content="Message with button" components={components} />);

    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  // Copy Button Tests
  describe('Copy Button', () => {
    // Mock clipboard API
    beforeEach(() => {
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn().mockResolvedValue(undefined),
        },
      });
    });

    it('renders copy button for assistant messages', () => {
      render(<ChatMessage role="assistant" content="Assistant response" />);

      const copyButton = screen.getByRole('button', { name: 'Copy message' });
      expect(copyButton).toBeInTheDocument();
      expect(screen.getByText('Copy')).toBeInTheDocument();
    });

    it('does not render copy button for user messages', () => {
      render(<ChatMessage role="user" content="User message" />);

      const copyButton = screen.queryByRole('button', { name: 'Copy message' });
      expect(copyButton).not.toBeInTheDocument();
    });

    it('does not render copy button for system messages', () => {
      render(<ChatMessage role="system" content="System message" />);

      const copyButton = screen.queryByRole('button', { name: 'Copy message' });
      expect(copyButton).not.toBeInTheDocument();
    });

    it('calls clipboard API when copy button clicked', async () => {
      render(<ChatMessage role="assistant" content="Test message" />);

      const copyButton = screen.getByRole('button', { name: 'Copy message' });
      await userEvent.click(copyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Test message');
    });

    it('changes to check icon after clicking copy', async () => {
      render(<ChatMessage role="assistant" content="Test message" />);

      const copyButton = screen.getByRole('button', { name: 'Copy message' });
      await userEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument();
        expect(screen.getByLabelText('Copied to clipboard')).toBeInTheDocument();
      });
    });

    it('shows green color when copied', async () => {
      render(<ChatMessage role="assistant" content="Test message" />);

      const copyButton = screen.getByRole('button', { name: 'Copy message' });
      await userEvent.click(copyButton);

      await waitFor(() => {
        const copiedText = screen.getByText('Copied');
        expect(copiedText).toHaveClass('text-green-600');
      });
    });

    it('resets to copy state after 2 seconds', async () => {
      jest.useFakeTimers();

      render(<ChatMessage role="assistant" content="Test message" />);

      const copyButton = screen.getByRole('button', { name: 'Copy message' });

      // Click copy
      act(() => {
        copyButton.click();
      });

      // Should show "Copied"
      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument();
      });

      // Fast-forward 2 seconds
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Should revert to "Copy"
      await waitFor(() => {
        expect(screen.getByText('Copy')).toBeInTheDocument();
        expect(screen.queryByText('Copied')).not.toBeInTheDocument();
      });

      jest.useRealTimers();
    });

    it('handles clipboard API errors gracefully', async () => {
      // Mock clipboard to reject
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn().mockRejectedValue(new Error('Clipboard denied')),
        },
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      render(<ChatMessage role="assistant" content="Test message" />);

      const copyButton = screen.getByRole('button', { name: 'Copy message' });
      await userEvent.click(copyButton);

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  // Regenerate Button Tests
  describe('Regenerate Button', () => {
    it('renders regenerate button for assistant messages when callback provided', () => {
      const onRegenerate = jest.fn();
      render(
        <ChatMessage
          role="assistant"
          content="Response"
          messageIndex={1}
          onRegenerate={onRegenerate}
        />
      );

      expect(screen.getByRole('button', { name: 'Regenerate response' })).toBeInTheDocument();
      expect(screen.getByText('Regenerate')).toBeInTheDocument();
    });

    it('does not render regenerate button for user messages', () => {
      const onRegenerate = jest.fn();
      render(
        <ChatMessage
          role="user"
          content="Question"
          messageIndex={0}
          onRegenerate={onRegenerate}
        />
      );

      expect(screen.queryByRole('button', { name: 'Regenerate response' })).not.toBeInTheDocument();
    });

    it('does not render regenerate button for system messages', () => {
      const onRegenerate = jest.fn();
      render(
        <ChatMessage
          role="system"
          content="System message"
          messageIndex={0}
          onRegenerate={onRegenerate}
        />
      );

      expect(screen.queryByRole('button', { name: 'Regenerate response' })).not.toBeInTheDocument();
    });

    it('does not render regenerate button when callback not provided', () => {
      render(<ChatMessage role="assistant" content="Response" messageIndex={1} />);

      expect(screen.queryByRole('button', { name: 'Regenerate response' })).not.toBeInTheDocument();
    });

    it('calls onRegenerate with messageIndex when clicked', async () => {
      const onRegenerate = jest.fn();
      render(
        <ChatMessage
          role="assistant"
          content="Response"
          messageIndex={3}
          onRegenerate={onRegenerate}
        />
      );

      const regenerateButton = screen.getByRole('button', { name: 'Regenerate response' });
      await userEvent.click(regenerateButton);

      expect(onRegenerate).toHaveBeenCalledWith(3);
      expect(onRegenerate).toHaveBeenCalledTimes(1);
    });

    it('disables button during regeneration', () => {
      const onRegenerate = jest.fn();
      render(
        <ChatMessage
          role="assistant"
          content="Response"
          messageIndex={1}
          onRegenerate={onRegenerate}
          isRegenerating={true}
        />
      );

      const regenerateButton = screen.getByRole('button', { name: 'Regenerate response' });
      expect(regenerateButton).toBeDisabled();
    });

    it('shows spinning RefreshCw icon during regeneration', () => {
      const onRegenerate = jest.fn();
      render(
        <ChatMessage
          role="assistant"
          content="Response"
          messageIndex={1}
          onRegenerate={onRegenerate}
          isRegenerating={true}
        />
      );

      const regenerateButton = screen.getByRole('button', { name: 'Regenerate response' });
      const icon = regenerateButton.querySelector('svg');
      expect(icon).toHaveClass('animate-spin');
    });

    it('both copy and regenerate buttons appear together', () => {
      const onRegenerate = jest.fn();
      render(
        <ChatMessage
          role="assistant"
          content="Response"
          messageIndex={1}
          onRegenerate={onRegenerate}
        />
      );

      expect(screen.getByRole('button', { name: 'Copy message' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Regenerate response' })).toBeInTheDocument();
    });
  });

  // Epic 16.6.8: Attachment Rendering Tests
  describe('File Attachments', () => {
    const mockAttachment = {
      fileId: 'file-123',
      filename: 'test-document.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      storagePath: 'uploads/user-1/test-document.pdf',
    };

    it('renders attachments for user messages', () => {
      render(
        <ChatMessage
          role="user"
          content="Here is my document"
          attachments={[mockAttachment]}
        />
      );

      expect(screen.getByTestId('message-attachments')).toBeInTheDocument();
      expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
    });

    it('renders attachments for assistant messages', () => {
      render(
        <ChatMessage
          role="assistant"
          content="Here is the report"
          attachments={[mockAttachment]}
        />
      );

      expect(screen.getByTestId('message-attachments')).toBeInTheDocument();
      expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
    });

    it('renders multiple attachments', () => {
      const attachments = [
        mockAttachment,
        {
          fileId: 'file-456',
          filename: 'report.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 2048,
          storagePath: 'uploads/user-1/report.docx',
        },
      ];

      render(
        <ChatMessage
          role="user"
          content="Two documents"
          attachments={attachments}
        />
      );

      expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
      expect(screen.getByText('report.docx')).toBeInTheDocument();
    });

    it('does not render attachments section when empty', () => {
      render(<ChatMessage role="user" content="No attachments" attachments={[]} />);

      expect(screen.queryByTestId('message-attachments')).not.toBeInTheDocument();
    });

    it('calls onDownloadAttachment when attachment clicked', async () => {
      const onDownload = jest.fn();
      render(
        <ChatMessage
          role="user"
          content="Download this"
          attachments={[mockAttachment]}
          onDownloadAttachment={onDownload}
        />
      );

      const attachmentButton = screen.getByRole('button', { name: /download/i });
      await userEvent.click(attachmentButton);

      expect(onDownload).toHaveBeenCalledWith(mockAttachment);
      expect(onDownload).toHaveBeenCalledTimes(1);
    });

    it('shows PDF type label for PDF attachments', () => {
      render(
        <ChatMessage
          role="user"
          content="PDF file"
          attachments={[mockAttachment]}
        />
      );

      expect(screen.getByText('PDF')).toBeInTheDocument();
    });

    it('shows Word type label for Word documents', () => {
      const wordAttachment = {
        ...mockAttachment,
        fileId: 'word-123',
        filename: 'document.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };

      render(
        <ChatMessage
          role="user"
          content="Word file"
          attachments={[wordAttachment]}
        />
      );

      expect(screen.getByText('Word')).toBeInTheDocument();
    });
  });

  // Epic 22 Story 22.1.3: Scoring Result Fallback Tests
  describe('Scoring Result Fallback (Epic 22)', () => {
    const scoringResultComponent = {
      type: 'scoring_result' as const,
      data: {
        compositeScore: 75,
        recommendation: 'conditional',
        overallRiskRating: 'medium',
        assessmentId: 'assess-123',
        executiveSummary: 'Test summary',
        keyFindings: [],
        dimensionScores: [],
      },
    };

    const mockScoringResultInStore = {
      compositeScore: 85,
      recommendation: 'approved',
      overallRiskRating: 'low',
      assessmentId: 'assess-store-123',
      executiveSummary: 'Store summary',
      keyFindings: [],
      dimensionScores: [],
      batchId: 'batch-123',
    };

    it('filters out scoring_result component when store has result (prevent duplicate)', () => {
      // Mock store with scoring result
      mockUseChatStore.mockImplementation((selector) => {
        const state = {
          activeConversationId: 'conv-123',
          scoringResultByConversation: {
            'conv-123': mockScoringResultInStore,
          },
        };
        return selector(state as any);
      });

      render(
        <ChatMessage
          role="assistant"
          content="Analysis complete"
          components={[scoringResultComponent]}
          isLastScoringMessage={true}
        />
      );

      // scoring_result should NOT be rendered (store takes precedence)
      expect(screen.queryByTestId('scoring-result-component')).not.toBeInTheDocument();
    });

    it('renders scoring_result as fallback when store is empty and isLastScoringMessage', () => {
      // Mock store with empty scoring result
      mockUseChatStore.mockImplementation((selector) => {
        const state = {
          activeConversationId: 'conv-123',
          scoringResultByConversation: {},
        };
        return selector(state as any);
      });

      render(
        <ChatMessage
          role="assistant"
          content="Analysis complete"
          components={[scoringResultComponent]}
          isLastScoringMessage={true}
        />
      );

      // scoring_result should be rendered as fallback
      expect(screen.getByTestId('scoring-result-component')).toBeInTheDocument();
    });

    it('does NOT render scoring_result when store is empty but NOT isLastScoringMessage (latest-only)', () => {
      // Mock store with empty scoring result
      mockUseChatStore.mockImplementation((selector) => {
        const state = {
          activeConversationId: 'conv-123',
          scoringResultByConversation: {},
        };
        return selector(state as any);
      });

      render(
        <ChatMessage
          role="assistant"
          content="Old analysis"
          components={[scoringResultComponent]}
          isLastScoringMessage={false}
        />
      );

      // scoring_result should NOT be rendered (not the latest)
      expect(screen.queryByTestId('scoring-result-component')).not.toBeInTheDocument();
    });

    it('renders other component types normally regardless of store state', () => {
      // Mock store with scoring result
      mockUseChatStore.mockImplementation((selector) => {
        const state = {
          activeConversationId: 'conv-123',
          scoringResultByConversation: {
            'conv-123': mockScoringResultInStore,
          },
        };
        return selector(state as any);
      });

      const buttonComponent = {
        type: 'button' as const,
        data: { label: 'Test Button', action: 'test' },
      };

      render(
        <ChatMessage
          role="assistant"
          content="Message with button"
          components={[buttonComponent, scoringResultComponent]}
          isLastScoringMessage={true}
        />
      );

      // Button should still render
      expect(screen.getByRole('button', { name: 'Test Button' })).toBeInTheDocument();
      // scoring_result should NOT render (store has result)
      expect(screen.queryByTestId('scoring-result-component')).not.toBeInTheDocument();
    });

    it('handles null activeConversationId gracefully', () => {
      // Mock store with null conversation ID
      mockUseChatStore.mockImplementation((selector) => {
        const state = {
          activeConversationId: null,
          scoringResultByConversation: {},
        };
        return selector(state as any);
      });

      render(
        <ChatMessage
          role="assistant"
          content="Analysis complete"
          components={[scoringResultComponent]}
          isLastScoringMessage={true}
        />
      );

      // Should render fallback when no active conversation (store lookup returns null)
      expect(screen.getByTestId('scoring-result-component')).toBeInTheDocument();
    });
  });
});
