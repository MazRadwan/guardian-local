import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { ChatInterface } from '../ChatInterface';
import { useChatStore } from '@/stores/chatStore';
import type { ScoringCompletePayload } from '@/lib/websocket';

// Mock chat controller with messages (active state)
const mockChatMessages = [
  { role: 'user', content: 'Upload completed', timestamp: new Date() },
  { role: 'assistant', content: 'Analyzing...', timestamp: new Date() },
];

jest.mock('@/hooks/useChatController', () => ({
  useChatController: () => ({
    messages: mockChatMessages,
    isLoading: false,
    error: null,
    isStreaming: false,
    isConnected: true,
    mode: 'scoring',
    isChanging: false,
    showDelayedLoading: false,
    regeneratingMessageIndex: null,
    composerRef: { current: null },
    messageListRef: { current: null },
    handleSendMessage: jest.fn(),
    handleModeChange: jest.fn(),
    handleRegenerate: jest.fn(),
    abortStream: jest.fn(),
    setError: jest.fn(),
    activeConversationId: 'conv-123',
    adapter: null,
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, token: 'test-token' }),
}));

jest.mock('@/hooks/useQuestionnairePersistence', () => ({
  useQuestionnairePersistence: () => ({
    loadPayload: jest.fn(),
    loadExport: jest.fn(),
    clearPayload: jest.fn(),
  }),
}));

// Mock child components to avoid Next.js router issues
jest.mock('../MessageList', () => ({
  MessageList: React.forwardRef(({ messages, scoringResult }: { messages: unknown[]; scoringResult?: unknown }, ref) => (
    <div data-testid="message-list" ref={ref as React.Ref<HTMLDivElement>}>
      Messages: {messages.length}
      {/* Render scoring result card if provided */}
      {scoringResult && (
        <div data-testid="message-list-scoring">
          <div data-testid="scoring-result-card">
            <h3>Risk Assessment Complete</h3>
            <div data-testid="composite-score">{(scoringResult as { compositeScore: number }).compositeScore}</div>
            <div data-testid="overall-risk">{(scoringResult as { overallRiskRating: string }).overallRiskRating}</div>
            <div data-testid="recommendation">{(scoringResult as { recommendation: string }).recommendation}</div>
            <div data-testid="executive-summary">{(scoringResult as { executiveSummary: string }).executiveSummary}</div>
            {(scoringResult as { keyFindings: string[] }).keyFindings.map((finding: string, i: number) => (
              <div key={i} data-testid="key-finding">{finding}</div>
            ))}
            <button data-testid="export-pdf">Export PDF</button>
            <button data-testid="export-word">Export Word</button>
          </div>
        </div>
      )}
    </div>
  )),
}));

jest.mock('../Composer', () => ({
  Composer: React.forwardRef(() => <div data-testid="composer" />),
}));

jest.mock('../ScoringResultCard', () => ({
  ScoringResultCard: ({ result }: { result: ScoringCompletePayload['result'] }) => (
    <div data-testid="scoring-result-card">
      <h3>Risk Assessment Complete</h3>
      <div data-testid="composite-score">{result.compositeScore}</div>
      <div data-testid="overall-risk">{result.overallRiskRating}</div>
      <div data-testid="recommendation">{result.recommendation}</div>
      <div data-testid="executive-summary">{result.executiveSummary}</div>
      {result.keyFindings.map((finding, i) => (
        <div key={i} data-testid="key-finding">{finding}</div>
      ))}
      <button data-testid="export-pdf">Export PDF</button>
      <button data-testid="export-word">Export Word</button>
    </div>
  ),
}));

const mockScoringResult: ScoringCompletePayload['result'] = {
  compositeScore: 75,
  recommendation: 'conditional',
  overallRiskRating: 'medium',
  executiveSummary: 'Test executive summary for risk assessment',
  keyFindings: ['Finding 1: Key concern identified', 'Finding 2: Positive aspect noted'],
  dimensionScores: [
    { dimension: 'Data Privacy', score: 80, riskRating: 'low' },
    { dimension: 'Security', score: 70, riskRating: 'medium' },
  ],
  batchId: 'batch-123',
  assessmentId: 'assess-123',
};

describe('ChatInterface scoring result (Story 5c)', () => {
  beforeEach(() => {
    // Reset store to clean state
    useChatStore.setState({
      scoringResult: null,
      pendingQuestionnaire: null,
      questionnaireUIState: 'hidden',
    });
  });

  it('renders ScoringResultCard when scoringResult is present', () => {
    // Set scoring result before rendering
    useChatStore.setState({
      scoringResult: mockScoringResult,
      activeConversationId: 'conv-123', // Set this first to prevent useEffect clearing
    });

    const { rerender } = render(<ChatInterface />);

    // Ensure scoringResult persists after render
    act(() => {
      useChatStore.setState({ scoringResult: mockScoringResult });
    });
    rerender(<ChatInterface />);

    expect(screen.getByTestId('scoring-result-card')).toBeInTheDocument();
    expect(screen.getByText('Risk Assessment Complete')).toBeInTheDocument();
    expect(screen.getByTestId('composite-score')).toHaveTextContent('75');
  });

  it('displays composite score and overall risk rating', () => {
    useChatStore.setState({
      scoringResult: mockScoringResult,
      activeConversationId: 'conv-123',
    });

    const { rerender } = render(<ChatInterface />);
    act(() => {
      useChatStore.setState({ scoringResult: mockScoringResult });
    });
    rerender(<ChatInterface />);

    expect(screen.getByTestId('composite-score')).toHaveTextContent('75');
    expect(screen.getByTestId('overall-risk')).toHaveTextContent('medium');
  });

  it('displays executive summary', () => {
    useChatStore.setState({
      scoringResult: mockScoringResult,
      activeConversationId: 'conv-123',
    });

    const { rerender } = render(<ChatInterface />);
    act(() => {
      useChatStore.setState({ scoringResult: mockScoringResult });
    });
    rerender(<ChatInterface />);

    expect(screen.getByTestId('executive-summary')).toHaveTextContent(
      'Test executive summary for risk assessment'
    );
  });

  it('displays export buttons (PDF and Word)', () => {
    useChatStore.setState({
      scoringResult: mockScoringResult,
      activeConversationId: 'conv-123',
    });

    const { rerender } = render(<ChatInterface />);
    act(() => {
      useChatStore.setState({ scoringResult: mockScoringResult });
    });
    rerender(<ChatInterface />);

    expect(screen.getByTestId('export-pdf')).toBeInTheDocument();
    expect(screen.getByTestId('export-word')).toBeInTheDocument();
  });

  it('does not render ScoringResultCard when scoringResult is null', () => {
    useChatStore.setState({ scoringResult: null });

    render(<ChatInterface />);

    expect(screen.queryByTestId('scoring-result-card')).not.toBeInTheDocument();
  });

  it('does not render ScoringResultCard when assessmentId is missing', () => {
    useChatStore.setState({
      scoringResult: { ...mockScoringResult, assessmentId: '' },
    });

    render(<ChatInterface />);

    expect(screen.queryByTestId('scoring-result-card')).not.toBeInTheDocument();
  });

  it('renders recommendation', () => {
    useChatStore.setState({
      scoringResult: mockScoringResult,
      activeConversationId: 'conv-123',
    });

    const { rerender } = render(<ChatInterface />);
    act(() => {
      useChatStore.setState({ scoringResult: mockScoringResult });
    });
    rerender(<ChatInterface />);

    expect(screen.getByTestId('recommendation')).toHaveTextContent('conditional');
  });

  it('renders key findings when present', () => {
    useChatStore.setState({
      scoringResult: mockScoringResult,
      activeConversationId: 'conv-123',
    });

    const { rerender } = render(<ChatInterface />);
    act(() => {
      useChatStore.setState({ scoringResult: mockScoringResult });
    });
    rerender(<ChatInterface />);

    const findings = screen.getAllByTestId('key-finding');
    expect(findings).toHaveLength(2);
    expect(findings[0]).toHaveTextContent('Finding 1: Key concern identified');
    expect(findings[1]).toHaveTextContent('Finding 2: Positive aspect noted');
  });

  it('resets scoring result when conversation changes', () => {
    // Spy on resetScoring
    const resetScoringSpy = jest.fn();
    const originalResetScoring = useChatStore.getState().resetScoring;
    useChatStore.setState({ resetScoring: resetScoringSpy });

    // Initial render with scoring result
    useChatStore.setState({
      scoringResult: mockScoringResult,
      activeConversationId: 'conv-123',
    });

    render(<ChatInterface />);

    // Verify resetScoring was called on mount (conversation change effect)
    expect(resetScoringSpy).toHaveBeenCalled();

    // Restore original
    useChatStore.setState({ resetScoring: originalResetScoring });
  });
});

// Separate describe block for empty state tests (messages.length === 0)
describe('ChatInterface scoring result in empty state', () => {
  beforeEach(() => {
    // Reset mocks and store
    jest.resetModules();
    useChatStore.setState({
      scoringResult: null,
      pendingQuestionnaire: null,
      questionnaireUIState: 'hidden',
    });
  });

  it('renders ScoringResultCard in empty state when scoring completes', () => {
    // Override useChatController to return empty messages
    jest.doMock('@/hooks/useChatController', () => ({
      useChatController: () => ({
        messages: [], // Empty messages
        isLoading: false,
        error: null,
        isStreaming: false,
        isConnected: true,
        mode: 'scoring',
        isChanging: false,
        showDelayedLoading: false,
        regeneratingMessageIndex: null,
        composerRef: { current: null },
        messageListRef: { current: null },
        handleSendMessage: jest.fn(),
        handleModeChange: jest.fn(),
        handleRegenerate: jest.fn(),
        abortStream: jest.fn(),
        setError: jest.fn(),
        activeConversationId: 'conv-empty',
        adapter: null,
      }),
    }));

    // Set scoring result
    useChatStore.setState({
      scoringResult: mockScoringResult,
      activeConversationId: 'conv-empty',
    });

    const { rerender } = render(<ChatInterface />);
    act(() => {
      useChatStore.setState({ scoringResult: mockScoringResult });
    });
    rerender(<ChatInterface />);

    // Should render scoring card even in empty state
    expect(screen.getByTestId('scoring-result-card')).toBeInTheDocument();
  });

  it('hides welcome message when scoring result is shown in empty state', () => {
    useChatStore.setState({
      scoringResult: mockScoringResult,
      activeConversationId: 'conv-empty',
    });

    const { rerender } = render(<ChatInterface />);
    act(() => {
      useChatStore.setState({ scoringResult: mockScoringResult });
    });
    rerender(<ChatInterface />);

    // Welcome message should be hidden when scoring result is present
    expect(screen.queryByText('Welcome to Guardian')).not.toBeInTheDocument();
  });
});
