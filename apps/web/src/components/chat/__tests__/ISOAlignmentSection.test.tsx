import React from 'react';
import { render, screen } from '@testing-library/react';
import { ISOAlignmentSection } from '../ISOAlignmentSection';
import type { DimensionScoreData } from '@/types/scoring';

describe('ISOAlignmentSection', () => {
  it('renders nothing when dimensionScores array is empty', () => {
    const { container } = render(<ISOAlignmentSection dimensionScores={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when dimensions have no findings', () => {
    const scores: DimensionScoreData[] = [
      { dimension: 'clinical_risk', score: 7, riskRating: 'medium' },
      { dimension: 'privacy_risk', score: 5, riskRating: 'high' },
    ];
    const { container } = render(<ISOAlignmentSection dimensionScores={scores} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when findings exist but isoClauseReferences is empty', () => {
    const scores: DimensionScoreData[] = [
      {
        dimension: 'clinical_risk',
        score: 7,
        riskRating: 'medium',
        findings: { isoClauseReferences: [] },
      },
    ];
    const { container } = render(<ISOAlignmentSection dimensionScores={scores} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders clauses grouped by framework', () => {
    const scores: DimensionScoreData[] = [
      {
        dimension: 'clinical_risk',
        score: 7,
        riskRating: 'medium',
        findings: {
          isoClauseReferences: [
            {
              clauseRef: 'A.5.1',
              title: 'Policies for information security',
              framework: 'ISO 27001:2022',
              status: 'aligned',
            },
            {
              clauseRef: '5.2',
              title: 'AI system lifecycle',
              framework: 'ISO 42001:2023',
              status: 'partial',
            },
          ],
        },
      },
    ];

    render(<ISOAlignmentSection dimensionScores={scores} />);

    expect(screen.getByText('ISO 27001:2022')).toBeInTheDocument();
    expect(screen.getByText('ISO 42001:2023')).toBeInTheDocument();
    expect(screen.getByText('A.5.1')).toBeInTheDocument();
    expect(screen.getByText('Policies for information security')).toBeInTheDocument();
    expect(screen.getByText('5.2')).toBeInTheDocument();
    expect(screen.getByText('AI system lifecycle')).toBeInTheDocument();
  });

  it('deduplicates same clause from multiple dimensions and shows both dimension labels', () => {
    const scores: DimensionScoreData[] = [
      {
        dimension: 'clinical_risk',
        score: 7,
        riskRating: 'medium',
        findings: {
          isoClauseReferences: [
            {
              clauseRef: 'A.8.1',
              title: 'User endpoint devices',
              framework: 'ISO 27001:2022',
              status: 'aligned',
            },
          ],
        },
      },
      {
        dimension: 'security_risk',
        score: 6,
        riskRating: 'high',
        findings: {
          isoClauseReferences: [
            {
              clauseRef: 'A.8.1',
              title: 'User endpoint devices',
              framework: 'ISO 27001:2022',
              status: 'aligned',
            },
          ],
        },
      },
    ];

    render(<ISOAlignmentSection dimensionScores={scores} />);

    // The clause should appear only once
    const clauseRefs = screen.getAllByText('A.8.1');
    expect(clauseRefs).toHaveLength(1);

    // Both dimension labels should be shown
    expect(screen.getByText('Clinical Risk')).toBeInTheDocument();
    expect(screen.getByText('Security Risk')).toBeInTheDocument();
  });

  it('shows correct status badge text for each status type', () => {
    const scores: DimensionScoreData[] = [
      {
        dimension: 'clinical_risk',
        score: 7,
        riskRating: 'medium',
        findings: {
          isoClauseReferences: [
            {
              clauseRef: 'A.1',
              title: 'Clause one',
              framework: 'ISO 27001:2022',
              status: 'aligned',
            },
            {
              clauseRef: 'A.2',
              title: 'Clause two',
              framework: 'ISO 27001:2022',
              status: 'partial',
            },
            {
              clauseRef: 'A.3',
              title: 'Clause three',
              framework: 'ISO 27001:2022',
              status: 'not_evidenced',
            },
            {
              clauseRef: 'A.4',
              title: 'Clause four',
              framework: 'ISO 27001:2022',
              status: 'not_applicable',
            },
          ],
        },
      },
    ];

    render(<ISOAlignmentSection dimensionScores={scores} />);

    expect(screen.getByText('Aligned')).toBeInTheDocument();
    expect(screen.getByText('Partial')).toBeInTheDocument();
    expect(screen.getByText('Not Evidenced')).toBeInTheDocument();
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('has correct data-testid attribute', () => {
    const scores: DimensionScoreData[] = [
      {
        dimension: 'privacy_risk',
        score: 8,
        riskRating: 'high',
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
    ];

    render(<ISOAlignmentSection dimensionScores={scores} />);
    expect(screen.getByTestId('iso-alignment-section')).toBeInTheDocument();
  });
});
