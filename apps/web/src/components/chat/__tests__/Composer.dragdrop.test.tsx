/**
 * Composer Drag-and-Drop Tests
 * Epic 19 Story 19.5.2: Integrate dropzone with Composer
 *
 * Tests for react-dropzone integration including:
 * - Visual feedback during drag operations
 * - File validation and rejection
 * - Disabled states (streaming, loading, max files, etc.)
 * - Coexistence with paperclip upload
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Composer } from '../Composer';
import { toast } from 'sonner';

// Mock useAuth for upload tests (hook requires token)
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token-123' }),
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// Mock fetch to keep uploads in progress
const mockFetch = jest.fn();
const originalFetch = global.fetch;

describe('Composer Drag-and-Drop (Epic 19 Story 19.5.2)', () => {
  const mockOnSendMessage = jest.fn();
  const mockWsAdapter = {
    isConnected: true,
    subscribeUploadProgress: jest.fn(() => jest.fn()),
    subscribeIntakeContextReady: jest.fn(() => jest.fn()),
    subscribeScoringParseReady: jest.fn(() => jest.fn()),
    subscribeFileAttached: jest.fn(() => jest.fn()),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /**
   * Helper to create a drag event with files
   */
  const createDragEvent = (files: File[], type: string = 'dragenter') => {
    const dataTransfer = {
      files,
      items: files.map((file) => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
      types: ['Files'],
    };

    return {
      dataTransfer,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };
  };

  /**
   * Helper to get the dropzone container
   */
  const getDropzoneContainer = (container: HTMLElement) => {
    return container.querySelector('.max-w-3xl > div');
  };

  describe('Visual Feedback', () => {
    it('should show drag feedback on dragEnter', async () => {
      const { container } = render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const dropzone = getDropzoneContainer(container);
      expect(dropzone).toBeInTheDocument();

      // Create a valid PDF file
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const dragEvent = createDragEvent([file]);

      // Trigger dragEnter
      await act(async () => {
        fireEvent.dragEnter(dropzone!, dragEvent);
      });

      // Should show blue border and overlay
      await waitFor(() => {
        expect(dropzone).toHaveClass('border-blue-400');
      });
    });

    it('should show red border for invalid files (isDragReject)', async () => {
      const { container } = render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const dropzone = getDropzoneContainer(container);

      // Create an invalid file type
      const file = new File(['content'], 'test.exe', { type: 'application/x-msdownload' });
      const dragEvent = createDragEvent([file]);

      // Trigger dragEnter with invalid file
      await act(async () => {
        fireEvent.dragEnter(dropzone!, dragEvent);
      });

      // Should show red border for rejection
      await waitFor(() => {
        expect(dropzone).toHaveClass('border-red-500');
      });
    });

    it('should clear visual feedback when drag ends', async () => {
      const { container } = render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const dropzone = getDropzoneContainer(container);
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const dragEvent = createDragEvent([file]);

      // Trigger dragEnter
      await act(async () => {
        fireEvent.dragEnter(dropzone!, dragEvent);
      });

      // Wait for active state
      await waitFor(() => {
        expect(dropzone).toHaveClass('border-blue-400');
      });

      // Trigger dragLeave
      await act(async () => {
        fireEvent.dragLeave(dropzone!, dragEvent);
      });

      // Should clear blue border
      await waitFor(() => {
        expect(dropzone).not.toHaveClass('border-blue-400');
      });
    });
  });

  describe('File Drop Handling', () => {
    it('should call addFiles on valid file drop', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      // Create a valid PDF file
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      // Use data-transfer-based drop simulation
      const dropzone = document.querySelector('.max-w-3xl > div');

      await act(async () => {
        fireEvent.drop(dropzone!, {
          dataTransfer: {
            files: [file],
            items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
            types: ['Files'],
          },
        });
      });

      // File chip should appear
      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });
    });

    it('should show error toast on invalid file type', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const dropzone = document.querySelector('.max-w-3xl > div');

      // Create an invalid file type
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        fireEvent.drop(dropzone!, {
          dataTransfer: {
            files: [file],
            items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
            types: ['Files'],
          },
        });
      });

      // Toast should be called with error
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it('should reject files when at max count', async () => {
      // Test that dropzone enforces maxFiles limit
      // This test adds files via drop until max is reached, then verifies rejection
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const dropzone = document.querySelector('.max-w-3xl > div');

      // Drop 10 files one at a time to reach max
      for (let i = 0; i < 10; i++) {
        const file = new File(['0123456789'], `doc${i}.pdf`, { type: 'application/pdf' });
        await act(async () => {
          fireEvent.drop(dropzone!, {
            dataTransfer: {
              files: [file],
              items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
              types: ['Files'],
            },
          });
        });
      }

      // Wait for files to appear
      await waitFor(() => {
        expect(screen.getByText('doc0.pdf')).toBeInTheDocument();
        expect(screen.getByText('doc9.pdf')).toBeInTheDocument();
      });

      // Verify attach button is disabled (max files reached)
      const attachButton = screen.getByLabelText('Attach file');
      expect(attachButton).toHaveClass('pointer-events-none');
      expect(attachButton).toHaveClass('cursor-not-allowed');

      // Now try to drop an 11th file - should be rejected by dropzone
      const extraFile = new File(['content'], 'extra.pdf', { type: 'application/pdf' });
      await act(async () => {
        fireEvent.drop(dropzone!, {
          dataTransfer: {
            files: [extraFile],
            items: [{ kind: 'file', type: extraFile.type, getAsFile: () => extraFile }],
            types: ['Files'],
          },
        });
      });

      // Extra file should not appear (dropzone maxFiles = 0)
      expect(screen.queryByText('extra.pdf')).not.toBeInTheDocument();
      // Note: When maxFiles=0, dropzone silently ignores drops rather than calling onDropRejected
      // The key assertion is that the file wasn't added
    });
  });

  describe('Disabled States', () => {
    it('should be disabled when uploadEnabled is false', async () => {
      // No wsAdapter or conversationId = upload disabled
      const { container } = render(
        <Composer onSendMessage={mockOnSendMessage} />
      );

      const dropzone = getDropzoneContainer(container);
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      // Try to drop
      await act(async () => {
        fireEvent.drop(dropzone!, {
          dataTransfer: {
            files: [file],
            items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
            types: ['Files'],
          },
        });
      });

      // File should not be added (upload disabled)
      expect(screen.queryByText('test.pdf')).not.toBeInTheDocument();
    });

    it('should not show drag overlay when isStreaming=true', async () => {
      const { container } = render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
          isStreaming={true}
          onStopStream={jest.fn()}
        />
      );

      const dropzone = getDropzoneContainer(container);
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const dragEvent = createDragEvent([file]);

      // Trigger dragEnter while streaming
      await act(async () => {
        fireEvent.dragEnter(dropzone!, dragEvent);
      });

      // Overlay should not appear (dropzone disabled during streaming)
      expect(screen.queryByText('Drop files here')).not.toBeInTheDocument();
    });

    it('should not show drag overlay when isLoading=true', async () => {
      const { container } = render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
          isLoading={true}
        />
      );

      const dropzone = getDropzoneContainer(container);
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const dragEvent = createDragEvent([file]);

      // Trigger dragEnter while loading
      await act(async () => {
        fireEvent.dragEnter(dropzone!, dragEvent);
      });

      // Overlay should not appear (dropzone disabled during loading)
      expect(screen.queryByText('Drop files here')).not.toBeInTheDocument();
    });

    it('should not accept drops when disabled=true', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
          disabled={true}
        />
      );

      const dropzone = document.querySelector('.max-w-3xl > div');
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      await act(async () => {
        fireEvent.drop(dropzone!, {
          dataTransfer: {
            files: [file],
            items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
            types: ['Files'],
          },
        });
      });

      // File should not be added
      expect(screen.queryByText('test.pdf')).not.toBeInTheDocument();
    });
  });

  describe('Paperclip Coexistence', () => {
    it('should not interfere with paperclip upload', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      // Use paperclip (file input) to upload
      const fileInput = document.querySelector('#composer-file-input') as HTMLInputElement;
      const file = new File(['content'], 'paperclip-file.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      // File chip should appear via paperclip
      await waitFor(() => {
        expect(screen.getByText('paperclip-file.pdf')).toBeInTheDocument();
      });

      // Both inputs should exist - paperclip and dropzone
      const allFileInputs = document.querySelectorAll('input[type="file"]');
      expect(allFileInputs.length).toBeGreaterThanOrEqual(2); // Paperclip + dropzone
    });

    it('should allow both drop and paperclip uploads to add files', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      // First, add via paperclip
      const fileInput = document.querySelector('#composer-file-input') as HTMLInputElement;
      const paperclipFile = new File(['content1'], 'paperclip.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [paperclipFile],
        writable: false,
        configurable: true,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('paperclip.pdf')).toBeInTheDocument();
      });

      // Then, add via drop
      const dropzone = document.querySelector('.max-w-3xl > div');
      const dropFile = new File(['content2'], 'dropped.pdf', { type: 'application/pdf' });

      await act(async () => {
        fireEvent.drop(dropzone!, {
          dataTransfer: {
            files: [dropFile],
            items: [{ kind: 'file', type: dropFile.type, getAsFile: () => dropFile }],
            types: ['Files'],
          },
        });
      });

      // Both files should be present
      await waitFor(() => {
        expect(screen.getByText('paperclip.pdf')).toBeInTheDocument();
        expect(screen.getByText('dropped.pdf')).toBeInTheDocument();
      });
    });
  });

  describe('File Type Acceptance', () => {
    it('should accept PDF files', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const dropzone = document.querySelector('.max-w-3xl > div');
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      await act(async () => {
        fireEvent.drop(dropzone!, {
          dataTransfer: {
            files: [file],
            items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
            types: ['Files'],
          },
        });
      });

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });
    });

    it('should accept DOCX files', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const dropzone = document.querySelector('.max-w-3xl > div');
      const file = new File(['content'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      await act(async () => {
        fireEvent.drop(dropzone!, {
          dataTransfer: {
            files: [file],
            items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
            types: ['Files'],
          },
        });
      });

      await waitFor(() => {
        expect(screen.getByText('test.docx')).toBeInTheDocument();
      });
    });

    it('should accept PNG files', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const dropzone = document.querySelector('.max-w-3xl > div');
      const file = new File(['content'], 'test.png', { type: 'image/png' });

      await act(async () => {
        fireEvent.drop(dropzone!, {
          dataTransfer: {
            files: [file],
            items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
            types: ['Files'],
          },
        });
      });

      await waitFor(() => {
        expect(screen.getByText('test.png')).toBeInTheDocument();
      });
    });

    it('should accept JPEG files', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const dropzone = document.querySelector('.max-w-3xl > div');
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });

      await act(async () => {
        fireEvent.drop(dropzone!, {
          dataTransfer: {
            files: [file],
            items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
            types: ['Files'],
          },
        });
      });

      await waitFor(() => {
        expect(screen.getByText('test.jpg')).toBeInTheDocument();
      });
    });
  });
});
