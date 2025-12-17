/**
 * FileChip Component Tests
 *
 * Epic 16.6.1: Tests for the compact file upload indicator component.
 * Epic 16.6.8: Updated for light theme styling.
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
});
