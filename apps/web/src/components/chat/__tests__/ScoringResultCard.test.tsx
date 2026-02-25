import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

jest.mock('../ISOAlignmentSection', () => ({
  ISOAlignmentSection: ({ dimensionScores }: { dimensionScores: unknown[] }) => (
    <div data-testid="iso-alignment-section">
      {dimensionScores.length} dimensions with ISO data
    </div>
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

  it('passes batchId to all DownloadButton components', () => {
    render(<ScoringResultCard result={baseScoringResult} />);

    // There should be two DownloadButton instances (PDF and Word - Excel removed per Epic 32.2)
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

  it('passes assessmentId to all DownloadButton components', () => {
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

  describe('Export buttons (Excel removed per Epic 32.2)', () => {
    it('renders only PDF and Word download buttons', () => {
      render(<ScoringResultCard result={baseScoringResult} />);

      expect(screen.getByTestId('download-pdf')).toBeInTheDocument();
      expect(screen.getByTestId('download-word')).toBeInTheDocument();
      expect(screen.queryByTestId('download-excel')).not.toBeInTheDocument();
      expect(mockDownloadButtonCalls).toHaveLength(2);
    });
  });

  describe('ISO Alignment section', () => {
    const resultWithISO: ScoringResultData = {
      ...baseScoringResult,
      dimensionScores: [
        {
          dimension: 'clinical_risk',
          score: 6,
          riskRating: 'medium',
          findings: {
            isoClauseReferences: [
              {
                clauseRef: 'A.5.1',
                title: 'Info security policies',
                framework: 'ISO 27001:2022',
                status: 'aligned',
              },
            ],
          },
        },
        { dimension: 'privacy_risk', score: 8, riskRating: 'high' },
      ],
    };

    it('shows ISO toggle button when ISO data exists', () => {
      render(<ScoringResultCard result={resultWithISO} />);

      expect(screen.getByTestId('iso-alignment-toggle')).toBeInTheDocument();
      expect(screen.getByText('ISO Standards Alignment')).toBeInTheDocument();
    });

    it('does not show ISO toggle button when no ISO data exists', () => {
      render(<ScoringResultCard result={baseScoringResult} />);

      expect(screen.queryByTestId('iso-alignment-toggle')).not.toBeInTheDocument();
    });

    it('ISO section starts collapsed and expands on toggle click', () => {
      render(<ScoringResultCard result={resultWithISO} />);

      // Initially collapsed - ISOAlignmentSection not rendered
      expect(screen.queryByTestId('iso-alignment-section')).not.toBeInTheDocument();

      // Click toggle to expand
      fireEvent.click(screen.getByTestId('iso-alignment-toggle'));

      // Now the section should be visible
      expect(screen.getByTestId('iso-alignment-section')).toBeInTheDocument();
    });
  });
});
