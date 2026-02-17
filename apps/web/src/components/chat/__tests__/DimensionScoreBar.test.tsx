import React from 'react';
import { render, screen } from '@testing-library/react';
import { DimensionScoreBar } from '../DimensionScoreBar';
import type { DimensionScoreData } from '@/types/scoring';

describe('DimensionScoreBar', () => {
  const baseProps = {
    label: 'Privacy Risk',
    score: 72,
    riskRating: 'medium' as const,
    type: 'risk' as const,
  };

  it('renders without findings prop (backward compatible)', () => {
    render(<DimensionScoreBar {...baseProps} />);

    expect(screen.getByText('Privacy Risk')).toBeInTheDocument();
    expect(screen.getByText(/72\/100/)).toBeInTheDocument();
    expect(screen.queryByTestId('confidence-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('iso-clause-count')).not.toBeInTheDocument();
  });

  it('renders confidence badge when findings.assessmentConfidence exists', () => {
    const findings: DimensionScoreData['findings'] = {
      assessmentConfidence: {
        level: 'high',
        rationale: 'Strong evidence across vendor responses.',
      },
    };

    render(
      <DimensionScoreBar
        {...baseProps}
        dimension="privacy_risk"
        findings={findings}
      />
    );

    expect(screen.getByTestId('confidence-badge')).toBeInTheDocument();
    expect(screen.getByTestId('confidence-badge')).toHaveTextContent('High');
  });

  it('does not render confidence badge when findings is undefined', () => {
    render(
      <DimensionScoreBar
        {...baseProps}
        dimension="privacy_risk"
      />
    );

    expect(screen.queryByTestId('confidence-badge')).not.toBeInTheDocument();
  });

  it('renders ISO clause count for non-Guardian-native dimension', () => {
    const findings: DimensionScoreData['findings'] = {
      isoClauseReferences: [
        { clauseRef: 'A.6.2.6', title: 'Data quality', framework: 'ISO/IEC 42001', status: 'aligned' },
        { clauseRef: 'A.6.2.7', title: 'Data protection', framework: 'ISO/IEC 42001', status: 'partial' },
        { clauseRef: 'A.8.4', title: 'System security', framework: 'ISO/IEC 42001', status: 'not_evidenced' },
      ],
    };

    render(
      <DimensionScoreBar
        {...baseProps}
        dimension="privacy_risk"
        findings={findings}
      />
    );

    const isoCount = screen.getByTestId('iso-clause-count');
    expect(isoCount).toBeInTheDocument();
    expect(isoCount).toHaveTextContent('3 ISO');
  });

  it('does not render ISO clause count for Guardian-native dimension', () => {
    const findings: DimensionScoreData['findings'] = {
      isoClauseReferences: [
        { clauseRef: 'A.6.2.6', title: 'Data quality', framework: 'ISO/IEC 42001', status: 'aligned' },
      ],
    };

    render(
      <DimensionScoreBar
        {...baseProps}
        dimension="clinical_risk"
        findings={findings}
      />
    );

    expect(screen.queryByTestId('iso-clause-count')).not.toBeInTheDocument();
  });

  it('does not render ISO clause count when no clauses exist', () => {
    const findings: DimensionScoreData['findings'] = {
      isoClauseReferences: [],
    };

    render(
      <DimensionScoreBar
        {...baseProps}
        dimension="privacy_risk"
        findings={findings}
      />
    );

    expect(screen.queryByTestId('iso-clause-count')).not.toBeInTheDocument();
  });

  it('does not render ISO clause count when isoClauseReferences is undefined', () => {
    const findings: DimensionScoreData['findings'] = {
      assessmentConfidence: {
        level: 'medium',
        rationale: 'Some evidence found.',
      },
    };

    render(
      <DimensionScoreBar
        {...baseProps}
        dimension="privacy_risk"
        findings={findings}
      />
    );

    expect(screen.queryByTestId('iso-clause-count')).not.toBeInTheDocument();
  });

  it('ISO count has correct data-testid', () => {
    const findings: DimensionScoreData['findings'] = {
      isoClauseReferences: [
        { clauseRef: 'A.6.2.6', title: 'Data quality', framework: 'ISO/IEC 42001', status: 'aligned' },
      ],
    };

    render(
      <DimensionScoreBar
        {...baseProps}
        dimension="security_risk"
        findings={findings}
      />
    );

    expect(screen.getByTestId('iso-clause-count')).toBeInTheDocument();
  });

  it('skips ISO count for all four Guardian-native dimensions', () => {
    const findings: DimensionScoreData['findings'] = {
      isoClauseReferences: [
        { clauseRef: 'A.1', title: 'Test', framework: 'ISO/IEC 42001', status: 'aligned' },
      ],
    };

    const guardianNative = ['clinical_risk', 'vendor_capability', 'ethical_considerations', 'sustainability'];

    for (const dim of guardianNative) {
      const { unmount } = render(
        <DimensionScoreBar
          {...baseProps}
          dimension={dim}
          findings={findings}
        />
      );

      expect(screen.queryByTestId('iso-clause-count')).not.toBeInTheDocument();
      unmount();
    }
  });
});
