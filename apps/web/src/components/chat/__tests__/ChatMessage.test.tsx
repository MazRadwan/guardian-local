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

  describe('Markdown Heading and HR Rendering', () => {
    it('renders h2 headings with proper styling', () => {
      const markdownContent = '## Clinical Risk\n\nThis is content.';
      render(<ChatMessage role="assistant" content={markdownContent} />);

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent('Clinical Risk');
      expect(heading).toHaveClass('text-lg', 'font-semibold', 'text-slate-800');
    });

    it('renders h3 headings with proper styling', () => {
      const markdownContent = '### Sub-section\n\nContent here.';
      render(<ChatMessage role="assistant" content={markdownContent} />);

      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent('Sub-section');
      expect(heading).toHaveClass('text-base', 'font-semibold', 'text-slate-700');
    });

    it('renders horizontal rules with proper margin', () => {
      const markdownContent = 'Section 1\n\n---\n\nSection 2';
      render(<ChatMessage role="assistant" content={markdownContent} />);

      const hr = screen.getByRole('separator');
      expect(hr).toBeInTheDocument();
      expect(hr).toHaveClass('my-6', 'border-t', 'border-slate-200');
    });

    it('renders questionnaire-style markdown with visual hierarchy', () => {
      const questionnaireMarkdown = `## Clinical Risk

1. How does the AI model handle patient data?
2. What clinical validation has been performed?

---

## Operational Risk

3. Describe your deployment process.
4. What monitoring is in place?`;

      render(<ChatMessage role="assistant" content={questionnaireMarkdown} />);

      // Should have two h2 headings
      const headings = screen.getAllByRole('heading', { level: 2 });
      expect(headings).toHaveLength(2);
      expect(headings[0]).toHaveTextContent('Clinical Risk');
      expect(headings[1]).toHaveTextContent('Operational Risk');

      // Should have a separator
      const hr = screen.getByRole('separator');
      expect(hr).toBeInTheDocument();
    });

    it('first heading does not have excessive top margin', () => {
      const markdownContent = '## First Section\n\nContent.';
      render(<ChatMessage role="assistant" content={markdownContent} />);

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveClass('first:mt-0');
    });

    it('adds margin to paragraphs that start with bold text (subheading pattern)', () => {
      // This tests Claude's pattern of using **Bold** instead of ### Heading
      const markdownContent = 'Introduction paragraph.\n\n**Key Finding:** This is important.';
      render(<ChatMessage role="assistant" content={markdownContent} />);

      // Find all paragraphs
      const paragraphs = screen.getByRole('article').querySelectorAll('p');
      expect(paragraphs.length).toBeGreaterThanOrEqual(2);

      // Second paragraph should have margin class (starts with bold)
      const boldParagraph = Array.from(paragraphs).find(p =>
        p.querySelector('strong')?.textContent?.includes('Key Finding')
      );
      expect(boldParagraph).toHaveClass('mt-6');
    });

    it('does not add extra margin to paragraphs with inline bold text', () => {
      // Bold in the middle should NOT trigger the subheading margin
      const markdownContent = 'This has **bold text** in the middle.';
      render(<ChatMessage role="assistant" content={markdownContent} />);

      const paragraph = screen.getByRole('article').querySelector('p');
      expect(paragraph).not.toHaveClass('mt-6');
    });

    it('first bold paragraph does not have excessive top margin', () => {
      // First paragraph should use first:mt-0 to avoid double spacing at top
      const markdownContent = '**Introduction:** Start of message.';
      render(<ChatMessage role="assistant" content={markdownContent} />);

      const paragraph = screen.getByRole('article').querySelector('p');
      expect(paragraph).toHaveClass('first:mt-0');
    });
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

    it('passes findings data (including assessmentConfidence and isoClauseReferences) through to ScoringResultCard', () => {
      // Mock store with empty scoring result so fallback rendering is used
      mockUseChatStore.mockImplementation((selector) => {
        const state = {
          activeConversationId: 'conv-123',
          scoringResultByConversation: {},
        };
        return selector(state as any);
      });

      const scoringResultWithFindings = {
        type: 'scoring_result' as const,
        data: {
          compositeScore: 82,
          recommendation: 'conditional',
          overallRiskRating: 'medium',
          assessmentId: 'assess-findings-123',
          executiveSummary: 'Summary with findings',
          keyFindings: ['Finding 1'],
          batchId: 'batch-456',
          dimensionScores: [
            {
              dimension: 'security_risk',
              score: 70,
              riskRating: 'medium',
              findings: {
                subScores: [{ name: 'Patient Safety', score: 3, maxScore: 5, notes: 'Needs improvement' }],
                keyRisks: ['Data leakage risk'],
                mitigations: ['Encryption at rest'],
                evidenceRefs: [{ sectionNumber: 1, questionNumber: 3, quote: 'We encrypt all data' }],
                assessmentConfidence: { level: 'high', rationale: 'Strong evidence provided' },
                isoClauseReferences: [
                  { clauseRef: 'A.8.2', title: 'Information classification', framework: 'ISO 27001:2022', status: 'aligned' },
                ],
              },
            },
            {
              dimension: 'privacy_risk',
              score: 50,
              riskRating: 'medium',
              findings: {
                assessmentConfidence: { level: 'medium', rationale: 'Partial evidence' },
                isoClauseReferences: [],
              },
            },
          ],
        },
      };

      // Should render without errors and include the scoring result component
      render(
        <ChatMessage
          role="assistant"
          content="Analysis with findings"
          components={[scoringResultWithFindings]}
          isLastScoringMessage={true}
        />
      );

      // The scoring_result component should be rendered (fallback path)
      expect(screen.getByTestId('scoring-result-component')).toBeInTheDocument();
      expect(screen.getByTestId('scoring-result-card')).toBeInTheDocument();
      expect(screen.getByTestId('composite-score')).toHaveTextContent('82');

      // CONTRACT: If findings were stripped (the bug this test guards against),
      // ConfidenceBadge would return null and these elements would not exist.
      const badges = screen.getAllByTestId('confidence-badge');
      expect(badges.length).toBeGreaterThanOrEqual(2); // both dimensions have confidence
      expect(badges[0]).toHaveAttribute('data-confidence-level', 'high');

      // security_risk is NOT Guardian-native, has 1 ISO clause → shows "1 ISO"
      const isoCounts = screen.getAllByTestId('iso-clause-count');
      expect(isoCounts.length).toBeGreaterThanOrEqual(1);
      expect(isoCounts[0]).toHaveTextContent('1 ISO');
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
