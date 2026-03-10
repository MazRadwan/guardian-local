import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssessmentTypeSelector } from '../AssessmentTypeSelector';

describe('AssessmentTypeSelector', () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    mockOnSelect.mockClear();
  });

  it('renders all three assessment options', () => {
    render(<AssessmentTypeSelector onSelect={mockOnSelect} />);

    expect(screen.getByText('Quick Assessment')).toBeInTheDocument();
    expect(screen.getByText('Comprehensive Assessment')).toBeInTheDocument();
    expect(screen.getByText('Category-Focused Assessment')).toBeInTheDocument();
  });

  it('renders the header and instruction text', () => {
    render(<AssessmentTypeSelector onSelect={mockOnSelect} />);

    expect(screen.getByText('Assessment Mode Activated')).toBeInTheDocument();
    expect(
      screen.getByText(/Select your assessment depth to get started/)
    ).toBeInTheDocument();
  });

  it('renders the Start Assessment button disabled by default', () => {
    render(<AssessmentTypeSelector onSelect={mockOnSelect} />);

    const startButton = screen.getByTestId('assessment-start-button');
    expect(startButton).toBeDisabled();
  });

  it('enables Start Assessment button after selecting an option', () => {
    render(<AssessmentTypeSelector onSelect={mockOnSelect} />);

    fireEvent.click(screen.getByTestId('assessment-option-1'));

    const startButton = screen.getByTestId('assessment-start-button');
    expect(startButton).not.toBeDisabled();
  });

  it('calls onSelect with label when Quick Assessment is selected and Start is clicked', () => {
    render(<AssessmentTypeSelector onSelect={mockOnSelect} />);

    fireEvent.click(screen.getByTestId('assessment-option-1'));
    fireEvent.click(screen.getByTestId('assessment-start-button'));

    expect(mockOnSelect).toHaveBeenCalledWith('Quick Assessment');
    expect(mockOnSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect with label when Comprehensive Assessment is selected', () => {
    render(<AssessmentTypeSelector onSelect={mockOnSelect} />);

    fireEvent.click(screen.getByTestId('assessment-option-2'));
    fireEvent.click(screen.getByTestId('assessment-start-button'));

    expect(mockOnSelect).toHaveBeenCalledWith('Comprehensive Assessment');
  });

  it('calls onSelect with label when Category-Focused Assessment is selected', () => {
    render(<AssessmentTypeSelector onSelect={mockOnSelect} />);

    fireEvent.click(screen.getByTestId('assessment-option-3'));
    fireEvent.click(screen.getByTestId('assessment-start-button'));

    expect(mockOnSelect).toHaveBeenCalledWith('Category-Focused Assessment');
  });

  it('does not call onSelect when Start is clicked without selection', () => {
    render(<AssessmentTypeSelector onSelect={mockOnSelect} />);

    fireEvent.click(screen.getByTestId('assessment-start-button'));

    expect(mockOnSelect).not.toHaveBeenCalled();
  });

  it('allows changing selection before clicking Start', () => {
    render(<AssessmentTypeSelector onSelect={mockOnSelect} />);

    // Select option 1 first
    fireEvent.click(screen.getByTestId('assessment-option-1'));
    // Change to option 3
    fireEvent.click(screen.getByTestId('assessment-option-3'));
    // Click start
    fireEvent.click(screen.getByTestId('assessment-start-button'));

    expect(mockOnSelect).toHaveBeenCalledWith('Category-Focused Assessment');
    expect(mockOnSelect).toHaveBeenCalledTimes(1);
  });

  it('has the correct data-testid on the root element', () => {
    render(<AssessmentTypeSelector onSelect={mockOnSelect} />);

    expect(screen.getByTestId('assessment-type-selector')).toBeInTheDocument();
  });

  it('applies custom className when provided', () => {
    render(
      <AssessmentTypeSelector onSelect={mockOnSelect} className="custom-class" />
    );

    const selector = screen.getByTestId('assessment-type-selector');
    expect(selector.className).toContain('custom-class');
  });
});
