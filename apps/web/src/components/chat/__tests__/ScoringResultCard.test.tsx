import React from 'react';
import { render, screen } from '@testing-library/react';
import { ScoringResultCard } from '../ScoringResultCard';
import type { ScoringResultData } from '@/types/scoring';

// Mock child components to isolate ScoringResultCard behavior
jest.mock('../ScoreDashboard', () => ({
  ScoreDashboard: ({ dimensionScores }: { dimensionScores: unknown[] }) => (
    <div data-testid="score-dashboard">
      {dimensionScores.length} dimensions
    </div>
  ),
}));

jest.mock('../RecommendationBadge', () => ({
  RecommendationBadge: ({ recommendation }: { recommendation: string }) => (
    <span data-testid="recommendation-badge">{recommendation}</span>
  ),
}));

// Mock DownloadButton to capture props (especially batchId)
const mockDownloadButtonCalls: Array<Record<string, unknown>> = [];
jest.mock('../DownloadButton', () => ({
  DownloadButton: (props: Record<string, unknown>) => {
    mockDownloadButtonCalls.push(props);
    return (
      <button
        data-testid={`download-${props.format}`}
        data-batch-id={props.batchId ?? 'undefined'}
        data-assessment-id={props.assessmentId}
      >
        {String(props.label)}
      </button>
    );
  },
}));

describe('ScoringResultCard', () => {
  beforeEach(() => {
    mockDownloadButtonCalls.length = 0;
  });

  const baseScoringResult: ScoringResultData = {
    compositeScore: 78,
    recommendation: 'conditional',
    overallRiskRating: 'medium',
    assessmentId: 'assess-abc-123',
    executiveSummary: 'The vendor demonstrates moderate risk across key dimensions.',
    keyFindings: ['Strong encryption practices', 'Gaps in audit logging'],
    dimensionScores: [
      { dimension: 'clinical_risk', score: 6, riskRating: 'medium' },
      { dimension: 'privacy_risk', score: 8, riskRating: 'high' },
    ],
    batchId: 'batch-xyz-789',
  };

  it('renders the scoring result card', () => {
    render(<ScoringResultCard result={baseScoringResult} />);

    expect(screen.getByTestId('scoring-result-card')).toBeInTheDocument();
    expect(screen.getByTestId('composite-score')).toHaveTextContent('78');
    expect(screen.getByTestId('overall-risk')).toHaveTextContent('medium');
  });

  it('passes batchId to both DownloadButton components', () => {
    render(<ScoringResultCard result={baseScoringResult} />);

    // There should be two DownloadButton instances (PDF and Word)
    const pdfButton = screen.getByTestId('download-pdf');
    const wordButton = screen.getByTestId('download-word');

    expect(pdfButton).toHaveAttribute('data-batch-id', 'batch-xyz-789');
    expect(wordButton).toHaveAttribute('data-batch-id', 'batch-xyz-789');

    // Verify through captured props
    expect(mockDownloadButtonCalls).toHaveLength(2);
    const pdfCall = mockDownloadButtonCalls.find((c) => c.format === 'pdf');
    const wordCall = mockDownloadButtonCalls.find((c) => c.format === 'word');
    expect(pdfCall?.batchId).toBe('batch-xyz-789');
    expect(wordCall?.batchId).toBe('batch-xyz-789');
  });

  it('passes assessmentId to both DownloadButton components', () => {
    render(<ScoringResultCard result={baseScoringResult} />);

    const pdfButton = screen.getByTestId('download-pdf');
    const wordButton = screen.getByTestId('download-word');

    expect(pdfButton).toHaveAttribute('data-assessment-id', 'assess-abc-123');
    expect(wordButton).toHaveAttribute('data-assessment-id', 'assess-abc-123');
  });

  it('renders DownloadButton without batchId when batchId is empty string', () => {
    const resultWithoutBatch: ScoringResultData = {
      ...baseScoringResult,
      batchId: '',
    };

    render(<ScoringResultCard result={resultWithoutBatch} />);

    const pdfCall = mockDownloadButtonCalls.find((c) => c.format === 'pdf');
    const wordCall = mockDownloadButtonCalls.find((c) => c.format === 'word');
    expect(pdfCall?.batchId).toBe('');
    expect(wordCall?.batchId).toBe('');
  });

  it('renders executive summary text', () => {
    render(<ScoringResultCard result={baseScoringResult} />);

    expect(screen.getByText(/moderate risk across key dimensions/)).toBeInTheDocument();
  });

  it('renders key findings', () => {
    render(<ScoringResultCard result={baseScoringResult} />);

    expect(screen.getByText('Strong encryption practices')).toBeInTheDocument();
    expect(screen.getByText('Gaps in audit logging')).toBeInTheDocument();
  });

  it('renders ScoreDashboard with dimension scores', () => {
    render(<ScoringResultCard result={baseScoringResult} />);

    expect(screen.getByTestId('score-dashboard')).toHaveTextContent('2 dimensions');
  });
});
