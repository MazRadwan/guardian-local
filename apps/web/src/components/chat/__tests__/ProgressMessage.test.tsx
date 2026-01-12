/**
 * ProgressMessage Component Tests
 * Epic 18 Story 18.2.5
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProgressMessage } from '../ProgressMessage';
import type { ScoringStatus } from '@/types/scoring';

describe('ProgressMessage', () => {
  it('should render with parsing status', () => {
    render(
      <ProgressMessage
        status="parsing"
        progress={35}
        message="Analyzing questionnaire responses..."
      />
    );

    expect(screen.getByText('Analyzing questionnaire responses...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '35');
  });

  it('should render with scoring status', () => {
    render(
      <ProgressMessage
        status="scoring"
        progress={70}
        message="Scoring AI Ethics & Bias..."
      />
    );

    expect(screen.getByText('Scoring AI Ethics & Bias...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70');
  });

  it('should render spinner icon for active states', () => {
    const { container } = render(
      <ProgressMessage
        status="parsing"
        progress={50}
        message="Processing..."
      />
    );

    // Loader2 icon has animate-spin class
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should render checkmark icon for complete status', () => {
    const { container } = render(
      <ProgressMessage
        status="complete"
        message="Scoring complete!"
      />
    );

    // CheckCircle icon (no animate-spin)
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).not.toBeInTheDocument();

    // Verify message is still rendered
    expect(screen.getByText('Scoring complete!')).toBeInTheDocument();
  });

  it('should not render progress bar when progress is undefined', () => {
    render(
      <ProgressMessage
        status="parsing"
        message="Initializing..."
      />
    );

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('should not render progress bar when status is complete', () => {
    render(
      <ProgressMessage
        status="complete"
        progress={100}
        message="Done!"
      />
    );

    // No progress bar for complete status
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('should have accessible ARIA labels', () => {
    render(
      <ProgressMessage
        status="scoring"
        progress={60}
        message="Scoring dimension 6/10..."
      />
    );

    const container = screen.getByRole('status');
    expect(container).toHaveAttribute('aria-live', 'polite');

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-label', 'Progress: 60%');
  });
});
