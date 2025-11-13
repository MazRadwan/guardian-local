import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModeSelector, ConversationMode } from '../ModeSelector';

describe('ModeSelector', () => {
  const mockOnModeChange = jest.fn();

  beforeEach(() => {
    mockOnModeChange.mockClear();
  });

  // Basic rendering
  describe('Rendering', () => {
    it('renders badge with current mode name', () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      expect(screen.getByText('Consult')).toBeInTheDocument();
      expect(screen.getByLabelText('Mode: Consult')).toBeInTheDocument();
    });

    it('renders badge with assessment mode', () => {
      render(<ModeSelector selectedMode="assessment" onModeChange={mockOnModeChange} />);

      expect(screen.getByText('Assessment')).toBeInTheDocument();
      expect(screen.getByLabelText('Mode: Assessment')).toBeInTheDocument();
    });

    it('renders ChevronDown icon', () => {
      const { container } = render(
        <ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />
      );

      const chevron = container.querySelector('.lucide-chevron-down');
      expect(chevron).toBeInTheDocument();
    });

    it('dropdown is initially closed', () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  // Dropdown interaction
  describe('Dropdown Interaction', () => {
    it('opens dropdown when badge clicked', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('shows both mode options when open', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      expect(screen.getByTestId('mode-option-consult')).toBeInTheDocument();
      expect(screen.getByTestId('mode-option-assessment')).toBeInTheDocument();
    });

    it('shows mode descriptions in dropdown', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      expect(screen.getByText('General questions about AI governance')).toBeInTheDocument();
      expect(screen.getByText('Structured vendor assessment workflow')).toBeInTheDocument();
    });

    it('closes dropdown when clicking badge again', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');

      // Open
      await userEvent.click(badge);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      // Close
      await userEvent.click(badge);
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  // Mode selection
  describe('Mode Selection', () => {
    it('calls onModeChange when selecting mode', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      const assessmentOption = screen.getByTestId('mode-option-assessment');
      await userEvent.click(assessmentOption);

      expect(mockOnModeChange).toHaveBeenCalledWith('assessment');
      expect(mockOnModeChange).toHaveBeenCalledTimes(1);
    });

    it('closes dropdown after selecting mode', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      const assessmentOption = screen.getByTestId('mode-option-assessment');
      await userEvent.click(assessmentOption);

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('allows selecting same mode (no-op but closes dropdown)', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      const consultOption = screen.getByTestId('mode-option-consult');
      await userEvent.click(consultOption);

      expect(mockOnModeChange).toHaveBeenCalledWith('consult');
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  // Check icon display
  describe('Check Icon', () => {
    it('shows check icon for selected mode', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      const consultOption = screen.getByTestId('mode-option-consult');
      const checkIcon = consultOption.querySelector('.lucide-check');
      expect(checkIcon).toBeInTheDocument();
    });

    it('does not show check icon for unselected mode', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      const assessmentOption = screen.getByTestId('mode-option-assessment');
      const checkIcon = assessmentOption.querySelector('.lucide-check');
      expect(checkIcon).not.toBeInTheDocument();
    });

    it('check icon has aria-label', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      const checkIcon = screen.getByLabelText('Selected');
      expect(checkIcon).toBeInTheDocument();
    });
  });

  // Backdrop interaction
  describe('Backdrop', () => {
    it('shows backdrop when dropdown open', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      expect(screen.getByTestId('mode-selector-backdrop')).toBeInTheDocument();
    });

    it('closes dropdown when clicking backdrop', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      const backdrop = screen.getByTestId('mode-selector-backdrop');
      await userEvent.click(backdrop);

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('backdrop has aria-hidden="true"', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      const backdrop = screen.getByTestId('mode-selector-backdrop');
      expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    });
  });

  // Keyboard navigation
  describe('Keyboard Navigation', () => {
    it('opens dropdown on Enter key', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      badge.focus();
      fireEvent.keyDown(badge, { key: 'Enter' });

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('opens dropdown on Space key', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      badge.focus();
      fireEvent.keyDown(badge, { key: ' ' });

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('opens dropdown on ArrowDown key', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      badge.focus();
      fireEvent.keyDown(badge, { key: 'ArrowDown' });

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('closes dropdown on Escape key', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      fireEvent.keyDown(badge, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('navigates options with ArrowDown key', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      badge.focus();
      fireEvent.keyDown(badge, { key: 'Enter' });

      // Arrow down should focus next option
      fireEvent.keyDown(badge, { key: 'ArrowDown' });

      const assessmentOption = screen.getByTestId('mode-option-assessment');
      expect(assessmentOption).toHaveClass('bg-gray-50');
    });

    it('navigates options with ArrowUp key', async () => {
      render(<ModeSelector selectedMode="assessment" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Assessment');
      badge.focus();
      fireEvent.keyDown(badge, { key: 'Enter' });

      // Arrow up should focus previous option
      fireEvent.keyDown(badge, { key: 'ArrowUp' });

      const consultOption = screen.getByTestId('mode-option-consult');
      expect(consultOption).toHaveClass('bg-gray-50');
    });

    it('selects focused option on Enter key', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      badge.focus();
      fireEvent.keyDown(badge, { key: 'Enter' });

      // Arrow down to assessment option
      fireEvent.keyDown(badge, { key: 'ArrowDown' });

      // Enter to select
      fireEvent.keyDown(badge, { key: 'Enter' });

      expect(mockOnModeChange).toHaveBeenCalledWith('assessment');
    });

    it('selects focused option on Space key', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      badge.focus();
      fireEvent.keyDown(badge, { key: 'Enter' });

      // Arrow down to assessment option
      fireEvent.keyDown(badge, { key: 'ArrowDown' });

      // Space to select
      fireEvent.keyDown(badge, { key: ' ' });

      expect(mockOnModeChange).toHaveBeenCalledWith('assessment');
    });

    it('wraps focus to top when ArrowDown at bottom', async () => {
      render(<ModeSelector selectedMode="assessment" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Assessment');
      badge.focus();
      fireEvent.keyDown(badge, { key: 'Enter' });

      // Arrow down should wrap to first option
      fireEvent.keyDown(badge, { key: 'ArrowDown' });

      const consultOption = screen.getByTestId('mode-option-consult');
      expect(consultOption).toHaveClass('bg-gray-50');
    });
  });

  // ChevronDown rotation
  describe('ChevronDown Icon Rotation', () => {
    it('rotates 180deg when dropdown open', async () => {
      const { container } = render(
        <ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />
      );

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      const chevron = container.querySelector('.lucide-chevron-down');
      expect(chevron).toHaveClass('rotate-180');
    });

    it('no rotation when dropdown closed', () => {
      const { container } = render(
        <ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />
      );

      const chevron = container.querySelector('.lucide-chevron-down');
      expect(chevron).not.toHaveClass('rotate-180');
    });
  });

  // Disabled state
  describe('Disabled State', () => {
    it('badge is disabled when disabled prop is true', () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} disabled={true} />);

      const badge = screen.getByLabelText('Mode: Consult');
      expect(badge).toBeDisabled();
    });

    it('does not open dropdown when disabled and clicked', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} disabled={true} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('badge has disabled styling', () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} disabled={true} />);

      const badge = screen.getByLabelText('Mode: Consult');
      expect(badge).toHaveClass('disabled:opacity-50');
      expect(badge).toHaveClass('disabled:cursor-not-allowed');
    });
  });

  // Accessibility
  describe('Accessibility', () => {
    it('badge has aria-expanded attribute', () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      expect(badge).toHaveAttribute('aria-expanded', 'false');
    });

    it('badge aria-expanded is true when open', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      expect(badge).toHaveAttribute('aria-expanded', 'true');
    });

    it('badge has aria-haspopup attribute', () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      expect(badge).toHaveAttribute('aria-haspopup', 'listbox');
    });

    it('dropdown has role="listbox"', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      const dropdown = screen.getByRole('listbox');
      expect(dropdown).toHaveAttribute('aria-label', 'Select conversation mode');
    });

    it('mode options have role="option"', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(2);
    });

    it('selected option has aria-selected="true"', async () => {
      render(<ModeSelector selectedMode="consult" onModeChange={mockOnModeChange} />);

      const badge = screen.getByLabelText('Mode: Consult');
      await userEvent.click(badge);

      const consultOption = screen.getByTestId('mode-option-consult');
      expect(consultOption).toHaveAttribute('aria-selected', 'true');
    });
  });
});
