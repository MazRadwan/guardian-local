import React from 'react';
import { render, screen } from '@testing-library/react';
import { ScoreDashboard } from '../ScoreDashboard';
import type { DimensionScoreData } from '@/types/scoring';

// Mock DimensionScoreBar to isolate ScoreDashboard tests
jest.mock('../DimensionScoreBar', () => ({
  DimensionScoreBar: ({ label, dimension }: { label: string; dimension?: string }) => (
    <div data-testid={`dimension-bar-${dimension}`}>{label}</div>
  ),
}));

describe('ScoreDashboard', () => {
  const clinicalRisk: DimensionScoreData = {
    dimension: 'clinical_risk',
    score: 65,
    riskRating: 'medium',
  };

  const privacyRisk: DimensionScoreData = {
    dimension: 'privacy_risk',
    score: 72,
    riskRating: 'high',
  };

  const securityRisk: DimensionScoreData = {
    dimension: 'security_risk',
    score: 45,
    riskRating: 'low',
  };

  const vendorCapability: DimensionScoreData = {
    dimension: 'vendor_capability',
    score: 80,
    riskRating: 'low',
  };

  const ethicalConsiderations: DimensionScoreData = {
    dimension: 'ethical_considerations',
    score: 70,
    riskRating: 'medium',
  };

  const sustainability: DimensionScoreData = {
    dimension: 'sustainability',
    score: 60,
    riskRating: 'medium',
  };

  const technicalCredibility: DimensionScoreData = {
    dimension: 'technical_credibility',
    score: 85,
    riskRating: 'low',
  };

  const aiTransparency: DimensionScoreData = {
    dimension: 'ai_transparency',
    score: 77,
    riskRating: 'medium',
  };

  it('shows Guardian-native label in Risk Dimensions when clinical_risk is present', () => {
    render(
      <ScoreDashboard
        dimensionScores={[clinicalRisk, privacyRisk, securityRisk, technicalCredibility]}
      />
    );

    const labels = screen.getAllByTestId('guardian-native-label');
    // clinical_risk is a Guardian-native risk dimension, so label appears in risk group
    expect(labels.length).toBeGreaterThanOrEqual(1);
    expect(labels[0]).toHaveTextContent(
      'Some dimensions assessed using Guardian healthcare-specific criteria'
    );
  });

  it('shows Guardian-native label in Capability Dimensions when Guardian-native capability dimensions are present', () => {
    render(
      <ScoreDashboard
        dimensionScores={[
          privacyRisk,
          vendorCapability,
          ethicalConsiderations,
          sustainability,
        ]}
      />
    );

    const labels = screen.getAllByTestId('guardian-native-label');
    // vendor_capability, ethical_considerations, sustainability are Guardian-native capability dimensions
    expect(labels.length).toBeGreaterThanOrEqual(1);
    // The capability group label should contain the expected text
    const lastLabel = labels[labels.length - 1];
    expect(lastLabel).toHaveTextContent(
      'Some dimensions assessed using Guardian healthcare-specific criteria'
    );
  });

  it('does not show Guardian-native label when no Guardian-native dimensions are present', () => {
    render(
      <ScoreDashboard
        dimensionScores={[privacyRisk, securityRisk, technicalCredibility, aiTransparency]}
      />
    );

    expect(screen.queryByTestId('guardian-native-label')).not.toBeInTheDocument();
  });

  it('shows labels in both groups when both contain Guardian-native dimensions', () => {
    render(
      <ScoreDashboard
        dimensionScores={[
          clinicalRisk,
          privacyRisk,
          vendorCapability,
          ethicalConsiderations,
          technicalCredibility,
        ]}
      />
    );

    const labels = screen.getAllByTestId('guardian-native-label');
    // One in risk group (clinical_risk) and one in capability group (vendor_capability, ethical_considerations)
    expect(labels).toHaveLength(2);
  });

  it('label has correct data-testid attribute', () => {
    render(
      <ScoreDashboard dimensionScores={[clinicalRisk, vendorCapability]} />
    );

    const labels = screen.getAllByTestId('guardian-native-label');
    for (const label of labels) {
      expect(label).toHaveAttribute('data-testid', 'guardian-native-label');
    }
  });

  it('label text contains "Guardian healthcare-specific criteria"', () => {
    render(
      <ScoreDashboard dimensionScores={[clinicalRisk]} />
    );

    const label = screen.getByTestId('guardian-native-label');
    expect(label).toHaveTextContent('Guardian healthcare-specific criteria');
  });

  it('renders score-dashboard container', () => {
    render(<ScoreDashboard dimensionScores={[privacyRisk]} />);

    expect(screen.getByTestId('score-dashboard')).toBeInTheDocument();
  });
});
