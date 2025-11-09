import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeSwitcher } from '../ModeSwitcher';

describe('ModeSwitcher', () => {
  it('displays current mode correctly', () => {
    render(<ModeSwitcher currentMode="consult" onModeChange={jest.fn()} />);

    const select = screen.getByLabelText('Select conversation mode') as HTMLSelectElement;
    expect(select.value).toBe('consult');
  });

  it('calls onModeChange when mode is changed', () => {
    const handleModeChange = jest.fn();
    render(<ModeSwitcher currentMode="consult" onModeChange={handleModeChange} />);

    const select = screen.getByLabelText('Select conversation mode');
    fireEvent.change(select, { target: { value: 'assessment' } });

    expect(handleModeChange).toHaveBeenCalledWith('assessment');
  });

  it('disables select when disabled prop is true', () => {
    render(<ModeSwitcher currentMode="consult" onModeChange={jest.fn()} disabled />);

    const select = screen.getByLabelText('Select conversation mode');
    expect(select).toBeDisabled();
  });

  it('shows both mode options', () => {
    render(<ModeSwitcher currentMode="consult" onModeChange={jest.fn()} />);

    expect(screen.getByRole('option', { name: 'Consult' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Assessment' })).toBeInTheDocument();
  });
});
