import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfidenceBadge } from '../ConfidenceBadge';
import type { AssessmentConfidence } from '@/types/scoring';

describe('ConfidenceBadge', () => {
  const highConfidence: AssessmentConfidence = {
    level: 'high',
    rationale: 'Strong evidence across all vendor responses with specific citations.',
  };

  const mediumConfidence: AssessmentConfidence = {
    level: 'medium',
    rationale: 'Partial evidence found but some areas lack specificity.',
  };

  const lowConfidence: AssessmentConfidence = {
    level: 'low',
    rationale: 'Insufficient evidence to make a confident assessment.',
  };

  it('renders "High" badge for high confidence', () => {
    render(<ConfidenceBadge confidence={highConfidence} />);

    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveTextContent('High');
  });

  it('renders "Med" badge for medium confidence', () => {
    render(<ConfidenceBadge confidence={mediumConfidence} />);

    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveTextContent('Med');
  });

  it('renders "Low" badge for low confidence', () => {
    render(<ConfidenceBadge confidence={lowConfidence} />);

    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveTextContent('Low');
  });

  it('renders nothing when confidence is null', () => {
    const { container } = render(<ConfidenceBadge confidence={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when confidence is undefined', () => {
    const { container } = render(<ConfidenceBadge confidence={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('has correct data-testid attribute', () => {
    render(<ConfidenceBadge confidence={highConfidence} />);
    expect(screen.getByTestId('confidence-badge')).toBeInTheDocument();
  });

  it('has correct data-confidence-level attribute for each level', () => {
    const { rerender } = render(<ConfidenceBadge confidence={highConfidence} />);
    expect(screen.getByTestId('confidence-badge')).toHaveAttribute('data-confidence-level', 'high');

    rerender(<ConfidenceBadge confidence={mediumConfidence} />);
    expect(screen.getByTestId('confidence-badge')).toHaveAttribute('data-confidence-level', 'medium');

    rerender(<ConfidenceBadge confidence={lowConfidence} />);
    expect(screen.getByTestId('confidence-badge')).toHaveAttribute('data-confidence-level', 'low');
  });

  it('shows tooltip on mouse enter', () => {
    render(<ConfidenceBadge confidence={highConfidence} />);

    const badge = screen.getByTestId('confidence-badge');

    // Tooltip should not be visible initially
    expect(screen.queryByTestId('confidence-tooltip')).not.toBeInTheDocument();

    // Hover over badge
    fireEvent.mouseEnter(badge);

    // Tooltip should appear
    expect(screen.getByTestId('confidence-tooltip')).toBeInTheDocument();
  });

  it('tooltip shows rationale text', () => {
    render(<ConfidenceBadge confidence={highConfidence} />);

    const badge = screen.getByTestId('confidence-badge');
    fireEvent.mouseEnter(badge);

    const tooltip = screen.getByTestId('confidence-tooltip');
    expect(tooltip).toHaveTextContent('Assessment Confidence: HIGH');
    expect(tooltip).toHaveTextContent(highConfidence.rationale);
  });

  it('tooltip disappears on mouse leave', () => {
    render(<ConfidenceBadge confidence={highConfidence} />);

    const badge = screen.getByTestId('confidence-badge');

    // Show tooltip
    fireEvent.mouseEnter(badge);
    expect(screen.getByTestId('confidence-tooltip')).toBeInTheDocument();

    // Hide tooltip
    fireEvent.mouseLeave(badge);
    expect(screen.queryByTestId('confidence-tooltip')).not.toBeInTheDocument();
  });

  it('applies green styles for high confidence', () => {
    render(<ConfidenceBadge confidence={highConfidence} />);

    const badge = screen.getByTestId('confidence-badge');
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-700');
    expect(badge.className).toContain('border-green-200');
  });

  it('applies amber styles for medium confidence', () => {
    render(<ConfidenceBadge confidence={mediumConfidence} />);

    const badge = screen.getByTestId('confidence-badge');
    expect(badge.className).toContain('bg-amber-100');
    expect(badge.className).toContain('text-amber-700');
    expect(badge.className).toContain('border-amber-200');
  });

  it('applies red styles for low confidence', () => {
    render(<ConfidenceBadge confidence={lowConfidence} />);

    const badge = screen.getByTestId('confidence-badge');
    expect(badge.className).toContain('bg-red-100');
    expect(badge.className).toContain('text-red-700');
    expect(badge.className).toContain('border-red-200');
  });
});
