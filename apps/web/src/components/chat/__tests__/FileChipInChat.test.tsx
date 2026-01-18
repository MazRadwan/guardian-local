/**
 * FileChipInChat Component Tests
 *
 * Epic 16.6.8: Tests for the chat stream file attachment display component.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { FileChipInChat, FileChipInChatProps } from '../FileChipInChat';

describe('FileChipInChat', () => {
  const defaultProps: FileChipInChatProps = {
    filename: 'test-document.pdf',
    fileId: 'file-123',
    mimeType: 'application/pdf',
    onClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders filename correctly', () => {
      render(<FileChipInChat {...defaultProps} />);
      expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
    });

    it('renders with white background', () => {
      const { container } = render(<FileChipInChat {...defaultProps} />);
      const button = container.querySelector('button');
      expect(button).toHaveClass('bg-white');
    });

    it('has proper accessibility label', () => {
      render(<FileChipInChat {...defaultProps} />);
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Download test-document.pdf'
      );
    });

    it('truncates long filenames', () => {
      const longFilename = 'this-is-a-very-long-filename-that-should-be-truncated.pdf';
      render(<FileChipInChat {...defaultProps} filename={longFilename} />);

      const filenameElement = screen.getByText(longFilename);
      expect(filenameElement).toHaveClass('truncate');
    });
  });

  describe('Type labels', () => {
    it('shows "PDF" for PDF files', () => {
      render(<FileChipInChat {...defaultProps} mimeType="application/pdf" />);
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });

    it('shows "Word" for Word documents', () => {
      render(
        <FileChipInChat
          {...defaultProps}
          mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        />
      );
      expect(screen.getByText('Word')).toBeInTheDocument();
    });

    it('shows "Image" for image files', () => {
      render(<FileChipInChat {...defaultProps} mimeType="image/png" />);
      expect(screen.getByText('Image')).toBeInTheDocument();
    });

    it('shows "Document" for unknown types', () => {
      render(<FileChipInChat {...defaultProps} mimeType="application/unknown" />);
      expect(screen.getByText('Document')).toBeInTheDocument();
    });

    it('shows "Document" when mimeType is undefined', () => {
      render(<FileChipInChat {...defaultProps} mimeType={undefined} />);
      expect(screen.getByText('Document')).toBeInTheDocument();
    });
  });

  describe('Click behavior', () => {
    it('calls onClick when clicked', () => {
      const onClick = jest.fn();
      render(<FileChipInChat {...defaultProps} onClick={onClick} />);

      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('has cursor-pointer for click affordance', () => {
      const { container } = render(<FileChipInChat {...defaultProps} />);
      const button = container.querySelector('button');
      expect(button).toHaveClass('cursor-pointer');
    });
  });

  describe('Visual elements', () => {
    it('renders document icon with sky background', () => {
      const { container } = render(<FileChipInChat {...defaultProps} />);
      const iconContainer = container.querySelector('.bg-sky-500');
      expect(iconContainer).toBeInTheDocument();
    });

    it('does not have X button (unlike FileChip)', () => {
      render(<FileChipInChat {...defaultProps} />);
      // FileChip has "Remove file" button, FileChipInChat should not
      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    });
  });
});
