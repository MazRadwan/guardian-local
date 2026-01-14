/**
 * FileChip Component Tests
 *
 * Epic 16.6.1: Tests for the compact file upload indicator component.
 * Epic 16.6.8: Updated for light theme styling.
 * Epic 17.2.3: Tests for disabled prop and variant prop (compact mode).
 * Epic 17 UX Fix: Tests for 'pending' stage (Queued status).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { FileChip, FileChipProps } from '../FileChip';

describe('FileChip', () => {
  const defaultProps: FileChipProps = {
    filename: 'test-document.pdf',
    stage: 'uploading',
    progress: 45,
    onRemove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders filename correctly', () => {
      render(<FileChip {...defaultProps} />);
      expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
    });

    it('truncates long filenames', () => {
      const longFilename = 'this-is-a-very-long-filename-that-should-be-truncated.pdf';
      render(<FileChip {...defaultProps} filename={longFilename} />);

      const filenameElement = screen.getByText(longFilename);
      expect(filenameElement).toHaveClass('truncate');
    });

    it('renders with light background', () => {
      const { container } = render(<FileChip {...defaultProps} />);
      const chip = container.firstChild;
      expect(chip).toHaveClass('bg-gray-100');
    });

    it('has accessibility label', () => {
      render(<FileChip {...defaultProps} />);
      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'File test-document.pdf: 45%'
      );
    });
  });

  describe('X button visibility', () => {
    it('shows X button during uploading stage', () => {
      render(<FileChip {...defaultProps} stage="uploading" />);
      expect(screen.getByRole('button', { name: /remove file/i })).toBeInTheDocument();
    });

    it('shows X button during storing stage', () => {
      render(<FileChip {...defaultProps} stage="storing" />);
      expect(screen.getByRole('button', { name: /remove file/i })).toBeInTheDocument();
    });

    it('shows X button during parsing stage', () => {
      render(<FileChip {...defaultProps} stage="parsing" />);
      expect(screen.getByRole('button', { name: /remove file/i })).toBeInTheDocument();
    });

    it('shows X button when complete', () => {
      render(<FileChip {...defaultProps} stage="complete" />);
      expect(screen.getByRole('button', { name: /remove file/i })).toBeInTheDocument();
    });

    it('shows X button on error', () => {
      render(<FileChip {...defaultProps} stage="error" error="Upload failed" />);
      expect(screen.getByRole('button', { name: /remove file/i })).toBeInTheDocument();
    });

    it('calls onRemove when X button clicked', () => {
      const onRemove = jest.fn();
      render(<FileChip {...defaultProps} onRemove={onRemove} />);

      fireEvent.click(screen.getByRole('button', { name: /remove file/i }));
      expect(onRemove).toHaveBeenCalledTimes(1);
    });
  });

  describe('Progress bar', () => {
    it('shows progress bar during uploading', () => {
      render(<FileChip {...defaultProps} stage="uploading" progress={50} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    });

    it('shows progress bar during storing', () => {
      render(<FileChip {...defaultProps} stage="storing" progress={70} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('shows progress bar during parsing', () => {
      render(<FileChip {...defaultProps} stage="parsing" progress={90} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('hides progress bar when complete', () => {
      render(<FileChip {...defaultProps} stage="complete" progress={100} />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('hides progress bar on error', () => {
      render(<FileChip {...defaultProps} stage="error" error="Failed" />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  describe('Status text', () => {
    it('shows percentage during uploading', () => {
      render(<FileChip {...defaultProps} stage="uploading" progress={45} />);
      expect(screen.getByText('45%')).toBeInTheDocument();
    });

    it('shows "Storing..." during storing stage', () => {
      render(<FileChip {...defaultProps} stage="storing" progress={60} />);
      expect(screen.getByText('Storing...')).toBeInTheDocument();
    });

    it('shows "Analyzing..." during parsing stage', () => {
      render(<FileChip {...defaultProps} stage="parsing" progress={80} />);
      expect(screen.getByText('Analyzing...')).toBeInTheDocument();
    });

    it('shows "Ready" when complete', () => {
      render(<FileChip {...defaultProps} stage="complete" progress={100} />);
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('shows light red background on error', () => {
      const { container } = render(
        <FileChip {...defaultProps} stage="error" error="Upload failed" />
      );
      const chip = container.firstChild;
      expect(chip).toHaveClass('bg-red-50');
    });

    it('shows error message', () => {
      render(<FileChip {...defaultProps} stage="error" error="Upload failed" />);
      expect(screen.getByText('Upload failed')).toBeInTheDocument();
    });

    it('truncates long error messages', () => {
      const longError = 'This is a very long error message that should be truncated';
      render(<FileChip {...defaultProps} stage="error" error={longError} />);

      const errorElement = screen.getByText(longError);
      expect(errorElement).toHaveClass('truncate');
    });
  });

  describe('Icons', () => {
    it('shows spinner during uploading', () => {
      const { container } = render(<FileChip {...defaultProps} stage="uploading" />);
      // Loader2 icon has animate-spin class
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('shows spinner during storing', () => {
      const { container } = render(<FileChip {...defaultProps} stage="storing" />);
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('shows spinner during parsing', () => {
      const { container } = render(<FileChip {...defaultProps} stage="parsing" />);
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('shows checkmark when complete', () => {
      const { container } = render(<FileChip {...defaultProps} stage="complete" />);
      // No spinner when complete
      expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
      // Has green icon
      expect(container.querySelector('.text-green-600')).toBeInTheDocument();
    });

    it('shows alert icon on error', () => {
      const { container } = render(<FileChip {...defaultProps} stage="error" error="Failed" />);
      // Has red icon
      expect(container.querySelector('.text-red-500')).toBeInTheDocument();
    });
  });

  describe('Epic 17.2.1: disabled prop', () => {
    it('should render X button by default (disabled=false)', () => {
      render(<FileChip {...defaultProps} stage="complete" progress={100} />);
      expect(screen.getByRole('button', { name: /remove file/i })).toBeInTheDocument();
    });

    it('should hide X button when disabled=true', () => {
      render(<FileChip {...defaultProps} stage="complete" progress={100} disabled />);
      expect(screen.queryByRole('button', { name: /remove file/i })).not.toBeInTheDocument();
    });

    it('should call onRemove when X clicked and not disabled', () => {
      const onRemove = jest.fn();
      render(<FileChip {...defaultProps} onRemove={onRemove} />);

      fireEvent.click(screen.getByRole('button', { name: /remove file/i }));
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('should default disabled to false', () => {
      render(<FileChip {...defaultProps} />);
      // X button should be present (default is not disabled)
      expect(screen.getByRole('button', { name: /remove file/i })).toBeInTheDocument();
    });

    it('should hide X button when disabled during uploading', () => {
      render(<FileChip {...defaultProps} stage="uploading" progress={50} disabled />);
      expect(screen.queryByRole('button', { name: /remove file/i })).not.toBeInTheDocument();
    });

    it('should hide X button when disabled during error state', () => {
      render(<FileChip {...defaultProps} stage="error" error="Upload failed" disabled />);
      expect(screen.queryByRole('button', { name: /remove file/i })).not.toBeInTheDocument();
    });
  });

  describe('Epic 17.2.2: variant prop', () => {
    it('should render default variant by default', () => {
      render(<FileChip {...defaultProps} stage="uploading" progress={45} />);
      // Default shows progress percentage text
      expect(screen.getByText('45%')).toBeInTheDocument();
    });

    it('should hide progress text in compact variant', () => {
      render(
        <FileChip {...defaultProps} stage="uploading" progress={45} variant="compact" />
      );
      // Compact hides progress text
      expect(screen.queryByText('45%')).not.toBeInTheDocument();
    });

    it('should render filename in both variants', () => {
      const { rerender } = render(<FileChip {...defaultProps} />);
      expect(screen.getByText('test-document.pdf')).toBeInTheDocument();

      rerender(<FileChip {...defaultProps} variant="compact" />);
      expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
    });

    it('should hide error text in compact variant', () => {
      render(
        <FileChip
          {...defaultProps}
          stage="error"
          progress={0}
          error="Upload failed"
          variant="compact"
        />
      );
      // Error text hidden in compact (icon still shows via AlertCircle)
      expect(screen.queryByText('Upload failed')).not.toBeInTheDocument();
    });

    it('should show error text in default variant', () => {
      render(
        <FileChip {...defaultProps} stage="error" progress={0} error="Upload failed" />
      );
      expect(screen.getByText('Upload failed')).toBeInTheDocument();
    });

    it('should hide Ready text in compact variant', () => {
      render(
        <FileChip {...defaultProps} stage="complete" progress={100} variant="compact" />
      );
      expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    });

    it('should show Ready text in default variant', () => {
      render(<FileChip {...defaultProps} stage="complete" progress={100} />);
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('should show Storing... in default variant', () => {
      render(<FileChip {...defaultProps} stage="storing" progress={60} />);
      expect(screen.getByText('Storing...')).toBeInTheDocument();
    });

    it('should hide Storing... text in compact variant', () => {
      render(
        <FileChip {...defaultProps} stage="storing" progress={60} variant="compact" />
      );
      expect(screen.queryByText('Storing...')).not.toBeInTheDocument();
    });

    it('should show Analyzing... in default variant', () => {
      render(<FileChip {...defaultProps} stage="parsing" progress={80} />);
      expect(screen.getByText('Analyzing...')).toBeInTheDocument();
    });

    it('should hide Analyzing... text in compact variant', () => {
      render(
        <FileChip {...defaultProps} stage="parsing" progress={80} variant="compact" />
      );
      expect(screen.queryByText('Analyzing...')).not.toBeInTheDocument();
    });

    it('should render progressbar in both variants', () => {
      const { rerender } = render(
        <FileChip {...defaultProps} stage="uploading" progress={50} />
      );
      expect(screen.getByRole('progressbar')).toBeInTheDocument();

      rerender(
        <FileChip {...defaultProps} stage="uploading" progress={50} variant="compact" />
      );
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Epic 17.2: Combined props', () => {
    it('should support disabled + compact together', () => {
      render(
        <FileChip
          {...defaultProps}
          stage="uploading"
          progress={50}
          disabled
          variant="compact"
        />
      );

      // No X button (disabled)
      expect(screen.queryByRole('button', { name: /remove file/i })).not.toBeInTheDocument();
      // No progress text (compact)
      expect(screen.queryByText('50%')).not.toBeInTheDocument();
      // Filename still shows
      expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
    });

    it('should support disabled=false + compact together', () => {
      render(
        <FileChip
          {...defaultProps}
          stage="complete"
          progress={100}
          disabled={false}
          variant="compact"
        />
      );

      // X button shows (not disabled)
      expect(screen.getByRole('button', { name: /remove file/i })).toBeInTheDocument();
      // No Ready text (compact)
      expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    });
  });

  describe('Epic 17.2: Backward compatibility', () => {
    it('should work with minimal props (existing usage)', () => {
      // This test ensures existing Composer code still works
      render(
        <FileChip
          filename="test.pdf"
          stage="uploading"
          progress={50}
          onRemove={() => {}}
        />
      );

      expect(screen.getByText('test.pdf')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /remove file/i })).toBeInTheDocument();
    });

    it('should maintain X button visibility for all stages by default', () => {
      const stages: Array<'pending' | 'uploading' | 'storing' | 'parsing' | 'complete' | 'error'> = [
        'pending',
        'uploading',
        'storing',
        'parsing',
        'complete',
        'error',
      ];

      stages.forEach((stage) => {
        const { unmount } = render(<FileChip {...defaultProps} stage={stage} />);
        expect(screen.getByRole('button', { name: /remove file/i })).toBeInTheDocument();
        unmount();
      });
    });

    it('should maintain progress bar for active stages', () => {
      const activeStages: Array<'uploading' | 'storing' | 'parsing'> = [
        'uploading',
        'storing',
        'parsing',
      ];

      activeStages.forEach((stage) => {
        const { unmount } = render(<FileChip {...defaultProps} stage={stage} />);
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        unmount();
      });
    });
  });

  describe('Epic 17 UX Fix: pending stage', () => {
    it('shows X button during pending stage', () => {
      render(<FileChip {...defaultProps} stage="pending" />);
      expect(screen.getByRole('button', { name: /remove file/i })).toBeInTheDocument();
    });

    it('shows clock icon during pending stage', () => {
      const { container } = render(<FileChip {...defaultProps} stage="pending" />);
      // Clock icon has text-gray-400 class
      expect(container.querySelector('.text-gray-400')).toBeInTheDocument();
    });

    it('shows "Queued" status text during pending stage', () => {
      render(<FileChip {...defaultProps} stage="pending" />);
      expect(screen.getByText('Queued')).toBeInTheDocument();
    });

    it('hides progress bar during pending stage', () => {
      render(<FileChip {...defaultProps} stage="pending" />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('has correct aria-label during pending stage', () => {
      render(<FileChip {...defaultProps} stage="pending" />);
      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'File test-document.pdf: Queued'
      );
    });

    it('has light background during pending stage (not error)', () => {
      const { container } = render(<FileChip {...defaultProps} stage="pending" />);
      const chip = container.firstChild;
      expect(chip).toHaveClass('bg-gray-100');
      expect(chip).not.toHaveClass('bg-red-50');
    });

    it('hides "Queued" text in compact variant', () => {
      render(<FileChip {...defaultProps} stage="pending" variant="compact" />);
      expect(screen.queryByText('Queued')).not.toBeInTheDocument();
    });

    it('shows filename in compact pending state', () => {
      render(<FileChip {...defaultProps} stage="pending" variant="compact" />);
      expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
    });
  });

  describe('Story 19.0.3: Document Type (No Warning)', () => {
    it('should NOT show amber styling regardless of detectedDocType', () => {
      const { container } = render(
        <FileChip
          {...defaultProps}
          filename="whitepaper.pdf"
          stage="attached"
          progress={100}
          detectedDocType="document"
          mode="scoring"
        />
      );

      const chip = container.firstChild;
      // Should have gray styling, NOT amber
      expect(chip).toHaveClass('bg-gray-100');
      expect(chip).not.toHaveClass('bg-amber-50');
      expect(chip).not.toHaveClass('border-amber-300');
    });

    it('should show checkmark icon for attached stage regardless of docType', () => {
      const { container } = render(
        <FileChip
          {...defaultProps}
          filename="whitepaper.pdf"
          stage="attached"
          progress={100}
          detectedDocType="document"
          mode="scoring"
        />
      );

      // Should show green checkmark, not amber warning
      const checkIcon = container.querySelector('.text-green-600');
      expect(checkIcon).toBeInTheDocument();

      const warningIcon = container.querySelector('.text-amber-500');
      expect(warningIcon).not.toBeInTheDocument();
    });

    it('should NOT show "Not a questionnaire?" text', () => {
      render(
        <FileChip
          {...defaultProps}
          filename="whitepaper.pdf"
          stage="attached"
          progress={100}
          detectedDocType="document"
          mode="scoring"
        />
      );

      expect(screen.queryByText(/not a questionnaire/i)).not.toBeInTheDocument();
    });

    it('should have clean aria-label without warning text', () => {
      render(
        <FileChip
          {...defaultProps}
          filename="whitepaper.pdf"
          stage="attached"
          progress={100}
          detectedDocType="document"
          mode="scoring"
        />
      );

      const chip = screen.getByRole('status');
      expect(chip.getAttribute('aria-label')).not.toContain('Warning');
      expect(chip.getAttribute('aria-label')).not.toContain('questionnaire');
      expect(chip.getAttribute('aria-label')).toBe('File whitepaper.pdf: Attached');
    });

    it('should show "Attached" text for attached stage in scoring mode with document type', () => {
      render(
        <FileChip
          {...defaultProps}
          filename="whitepaper.pdf"
          stage="attached"
          progress={100}
          detectedDocType="document"
          mode="scoring"
        />
      );

      expect(screen.getByText('Attached')).toBeInTheDocument();
    });

    it('should show "Ready" text for complete stage regardless of document type', () => {
      render(
        <FileChip
          {...defaultProps}
          filename="whitepaper.pdf"
          stage="complete"
          progress={100}
          detectedDocType="document"
          mode="scoring"
        />
      );

      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('should show normal gray styling for questionnaire in scoring mode', () => {
      const { container } = render(
        <FileChip
          {...defaultProps}
          filename="questionnaire.pdf"
          stage="attached"
          progress={100}
          detectedDocType="questionnaire"
          mode="scoring"
        />
      );

      const chip = container.firstChild;
      expect(chip).toHaveClass('bg-gray-100');
      expect(chip).not.toHaveClass('bg-amber-50');
    });

    it('should show normal gray styling when detectedDocType is null', () => {
      const { container } = render(
        <FileChip
          {...defaultProps}
          filename="unknown.pdf"
          stage="attached"
          progress={100}
          detectedDocType={null}
          mode="scoring"
        />
      );

      const chip = container.firstChild;
      expect(chip).toHaveClass('bg-gray-100');
    });

    it('should show normal gray styling when mode is not provided', () => {
      const { container } = render(
        <FileChip
          {...defaultProps}
          filename="document.pdf"
          stage="attached"
          progress={100}
          detectedDocType="document"
        />
      );

      const chip = container.firstChild;
      expect(chip).toHaveClass('bg-gray-100');
    });
  });
});
