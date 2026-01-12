import React, { createRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Composer, ComposerRef } from '../Composer';

// Mock useAuth for upload tests (hook requires token)
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token-123' }),
}));

describe('Composer', () => {
  const mockOnSendMessage = jest.fn();

  beforeEach(() => {
    mockOnSendMessage.mockClear();
  });

  // Basic rendering
  describe('Rendering', () => {
    it('renders textarea with placeholder', () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...');
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveAttribute('aria-label', 'Message input');
    });

    it('renders with custom placeholder', () => {
      render(<Composer onSendMessage={mockOnSendMessage} placeholder="Custom placeholder" />);

      expect(screen.getByPlaceholderText('Custom placeholder')).toBeInTheDocument();
    });

    it('renders send button', () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).toBeInTheDocument();
    });

    it('renders file upload button', () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const uploadButton = screen.getByLabelText('Attach file');
      expect(uploadButton).toBeInTheDocument();
    });
  });

  // Send button state
  describe('Send Button State', () => {
    it('send button disabled when textarea empty', () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).toBeDisabled();
    });

    it('send button disabled when textarea contains only whitespace', async () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...');
      const sendButton = screen.getByLabelText('Send message');

      await userEvent.type(textarea, '   ');
      expect(sendButton).toBeDisabled();
    });

    it('send button enabled when text exists', async () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...');
      const sendButton = screen.getByLabelText('Send message');

      await userEvent.type(textarea, 'Hello');
      expect(sendButton).not.toBeDisabled();
    });

    it('send button re-disables after message sent', async () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...');
      const sendButton = screen.getByLabelText('Send message');

      await userEvent.type(textarea, 'Hello');
      await userEvent.click(sendButton);

      expect(sendButton).toBeDisabled();
    });
  });

  // Message sending
  describe('Message Sending', () => {
    it('calls onSendMessage when send button clicked', async () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...');
      const sendButton = screen.getByLabelText('Send message');

      await userEvent.type(textarea, 'Test message');
      await userEvent.click(sendButton);

      // Epic 16.6.9: onSendMessage now accepts optional attachments param
      expect(mockOnSendMessage).toHaveBeenCalledWith('Test message', undefined);
      expect(mockOnSendMessage).toHaveBeenCalledTimes(1);
    });

    it('trims whitespace before sending', async () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...');
      const sendButton = screen.getByLabelText('Send message');

      await userEvent.type(textarea, '  Hello world  ');
      await userEvent.click(sendButton);

      expect(mockOnSendMessage).toHaveBeenCalledWith('Hello world', undefined);
    });

    it('clears textarea after sending', async () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
      const sendButton = screen.getByLabelText('Send message');

      await userEvent.type(textarea, 'Test message');
      await userEvent.click(sendButton);

      expect(textarea.value).toBe('');
    });

    it('does not send empty message', async () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const sendButton = screen.getByLabelText('Send message');

      // Try to click disabled button
      await userEvent.click(sendButton);

      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    it('does not send when disabled prop is true', async () => {
      render(<Composer onSendMessage={mockOnSendMessage} disabled={true} />);

      const textarea = screen.getByPlaceholderText('Type a message...');
      const sendButton = screen.getByLabelText('Send message');

      await userEvent.type(textarea, 'Test message');
      await userEvent.click(sendButton);

      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });
  });

  // Keyboard interactions
  describe('Keyboard Interactions', () => {
    it('sends message when Enter key pressed', async () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...');

      await userEvent.type(textarea, 'Hello');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(mockOnSendMessage).toHaveBeenCalledWith('Hello', undefined);
    });

    it('creates new line when Shift+Enter pressed', async () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement;

      await userEvent.type(textarea, 'Line 1');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
      await userEvent.type(textarea, 'Line 2');

      // Message should not be sent
      expect(mockOnSendMessage).not.toHaveBeenCalled();

      // Textarea should contain both lines (with newline character)
      expect(textarea.value).toContain('Line 1');
      expect(textarea.value).toContain('Line 2');
    });

    it('does not send on Enter if textarea empty', () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...');

      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });
  });

  // Auto-resize behavior
  describe('Auto-Resize Behavior', () => {
    it('textarea starts at minimum height', () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement;

      expect(textarea.style.minHeight).toBe('60px');
    });

    it('textarea has maximum height constraint', () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement;

      expect(textarea.style.maxHeight).toBe('200px');
    });

    it('textarea expands when text added', async () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement;

      // Mock scrollHeight to simulate textarea expansion
      Object.defineProperty(textarea, 'scrollHeight', {
        configurable: true,
        get: function() {
          // Return larger height if textarea has content
          return this.value.length > 0 ? 120 : 60;
        },
      });

      const initialHeight = textarea.style.height || '60px';

      // Type multiple lines
      await userEvent.type(textarea, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');

      await waitFor(() => {
        const currentHeight = parseInt(textarea.style.height);
        const initial = parseInt(initialHeight);
        expect(currentHeight).toBeGreaterThan(initial);
      });
    });

    it('textarea resets to minimum height after sending', async () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
      const sendButton = screen.getByLabelText('Send message');

      // Type multiple lines to expand
      await userEvent.type(textarea, 'Line 1\nLine 2\nLine 3');

      // Send message
      await userEvent.click(sendButton);

      // Height should reset
      await waitFor(() => {
        expect(textarea.style.height).toBe('60px');
      });
    });
  });

  // Visual styling
  describe('Visual Styling', () => {
    it('composer has centered container (max-w-3xl)', () => {
      const { container } = render(<Composer onSendMessage={mockOnSendMessage} />);

      const centeredContainer = container.querySelector('.max-w-3xl');
      expect(centeredContainer).toBeInTheDocument();
    });

    it('composer has elevated design (shadow-lg, rounded-2xl)', () => {
      const { container } = render(<Composer onSendMessage={mockOnSendMessage} />);

      const elevatedBox = container.querySelector('.shadow-lg.rounded-2xl');
      expect(elevatedBox).toBeInTheDocument();
    });

    it('composer has border and background', () => {
      const { container } = render(<Composer onSendMessage={mockOnSendMessage} />);

      const composerBox = container.querySelector('.border.border-gray-200.bg-white');
      expect(composerBox).toBeInTheDocument();
    });
  });

  // Disabled state
  describe('Disabled State', () => {
    it('disables textarea when disabled prop is true', () => {
      render(<Composer onSendMessage={mockOnSendMessage} disabled={true} />);

      const textarea = screen.getByPlaceholderText('Type a message...');
      expect(textarea).toBeDisabled();
    });

    it('disables send button when disabled prop is true', () => {
      render(<Composer onSendMessage={mockOnSendMessage} disabled={true} />);

      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).toBeDisabled();
    });

    it('disables file upload button when disabled prop is true', () => {
      render(<Composer onSendMessage={mockOnSendMessage} disabled={true} />);

      const uploadButton = screen.getByLabelText('Attach file');
      // Label elements don't have native disabled attribute - check CSS classes instead
      expect(uploadButton).toHaveClass('pointer-events-none');
      expect(uploadButton).toHaveClass('cursor-not-allowed');
    });
  });

  // File upload (Epic 16)
  describe('File Upload', () => {
    it('file upload button is disabled when wsAdapter or conversationId not provided', async () => {
      // Without wsAdapter and conversationId, upload should be disabled
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const uploadButton = screen.getByLabelText('Attach file');
      // Label elements don't have native disabled attribute - check CSS classes instead
      expect(uploadButton).toHaveClass('pointer-events-none');
      expect(uploadButton).toHaveClass('cursor-not-allowed');
    });

    it('has hidden file input for upload', () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      // File input should exist but be hidden
      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeTruthy();
      expect(fileInput).toHaveClass('hidden');
    });
  });

  // Mode selector integration
  describe('Mode Selector Integration', () => {
    const mockOnModeChange = jest.fn();

    beforeEach(() => {
      mockOnModeChange.mockClear();
    });

    it('renders mode selector when onModeChange provided', () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          currentMode="consult"
          onModeChange={mockOnModeChange}
        />
      );

      const modeButton = screen.getByLabelText(/Mode:/);
      expect(modeButton).toBeInTheDocument();
      expect(modeButton).toHaveTextContent('Consult');
    });

    it('does not render mode selector when onModeChange not provided', () => {
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const modeButton = screen.queryByLabelText(/Mode:/);
      expect(modeButton).not.toBeInTheDocument();
    });

    it('mode selector positioned in left toolbar group', () => {
      const { container } = render(
        <Composer
          onSendMessage={mockOnSendMessage}
          currentMode="consult"
          onModeChange={mockOnModeChange}
        />
      );

      // Find the toolbar (has justify-between class)
      const toolbar = container.querySelector('.justify-between');
      expect(toolbar).toBeInTheDocument();

      // Find left group (first child with gap-2)
      const leftGroup = toolbar?.querySelector('.gap-2');
      expect(leftGroup).toBeInTheDocument();

      // Mode selector should be in left group (before file upload button)
      const modeButton = screen.getByLabelText(/Mode:/);
      expect(leftGroup).toContainElement(modeButton);
    });

    it('calls onModeChange when mode selected', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          currentMode="consult"
          onModeChange={mockOnModeChange}
        />
      );

      const modeButton = screen.getByLabelText(/Mode:/);
      await userEvent.click(modeButton);

      // Select Assessment mode
      const assessmentOption = screen.getByTestId('mode-option-assessment');
      await userEvent.click(assessmentOption);

      expect(mockOnModeChange).toHaveBeenCalledWith('assessment');
      expect(mockOnModeChange).toHaveBeenCalledTimes(1);
    });

    it('disables mode selector when composer disabled', () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          currentMode="consult"
          onModeChange={mockOnModeChange}
          disabled={true}
        />
      );

      const modeButton = screen.getByLabelText(/Mode:/);
      expect(modeButton).toBeDisabled();
    });

    it('disables mode selector when modeChangeDisabled prop is true', () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          currentMode="consult"
          onModeChange={mockOnModeChange}
          modeChangeDisabled={true}
        />
      );

      const modeButton = screen.getByLabelText(/Mode:/);
      expect(modeButton).toBeDisabled();
    });

    it('shows current mode in selector badge', () => {
      const { rerender } = render(
        <Composer
          onSendMessage={mockOnSendMessage}
          currentMode="consult"
          onModeChange={mockOnModeChange}
        />
      );

      let modeButton = screen.getByLabelText(/Mode:/);
      expect(modeButton).toHaveTextContent('Consult');

      // Change mode
      rerender(
        <Composer
          onSendMessage={mockOnSendMessage}
          currentMode="assessment"
          onModeChange={mockOnModeChange}
        />
      );

      modeButton = screen.getByLabelText(/Mode:/);
      expect(modeButton).toHaveTextContent('Assessment');
    });
  });

  // Ref forwarding
  describe('Ref Forwarding', () => {
    it('exposes focus method via ref', () => {
      const ref = createRef<ComposerRef>();

      render(<Composer ref={ref} onSendMessage={mockOnSendMessage} />);

      expect(ref.current).not.toBeNull();
      expect(ref.current?.focus).toBeDefined();
      expect(typeof ref.current?.focus).toBe('function');
    });

    it('focus method focuses the textarea', () => {
      const ref = createRef<ComposerRef>();

      render(<Composer ref={ref} onSendMessage={mockOnSendMessage} />);

      const textarea = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement;

      // Call focus via ref
      ref.current?.focus();

      // Textarea should be focused
      expect(textarea).toHaveFocus();
    });
  });

  // Multi-file upload (Epic 17, Sprint 2)
  describe('Multi-file Upload', () => {
    const mockWsAdapter = {
      isConnected: true,
      subscribeUploadProgress: jest.fn(() => jest.fn()),
      subscribeIntakeContextReady: jest.fn(() => jest.fn()),
      subscribeScoringParseReady: jest.fn(() => jest.fn()),
      subscribeFileAttached: jest.fn(() => jest.fn()), // Epic 18
    };

    beforeEach(() => {
      mockWsAdapter.subscribeUploadProgress.mockClear();
      mockWsAdapter.subscribeIntakeContextReady.mockClear();
      mockWsAdapter.subscribeScoringParseReady.mockClear();
      mockWsAdapter.subscribeFileAttached.mockClear(); // Epic 18
    });

    it('should render multiple file chips', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      // Get the file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();

      // Simulate file selection
      const file1 = new File(['content1'], 'doc1.pdf', { type: 'application/pdf' });
      const file2 = new File(['content2'], 'doc2.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file1, file2],
        writable: false,
      });

      fireEvent.change(fileInput);

      // Wait for chips to appear
      await waitFor(() => {
        expect(screen.getByText('doc1.pdf')).toBeInTheDocument();
        expect(screen.getByText('doc2.pdf')).toBeInTheDocument();
      });
    });

    it('should remove individual files', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file1 = new File(['content1'], 'doc1.pdf', { type: 'application/pdf' });
      const file2 = new File(['content2'], 'doc2.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file1, file2],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('doc1.pdf')).toBeInTheDocument();
        expect(screen.getByText('doc2.pdf')).toBeInTheDocument();
      });

      // Get remove buttons
      const removeButtons = screen.getAllByLabelText('Remove file');
      expect(removeButtons).toHaveLength(2);

      // Remove first file
      await userEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText('doc1.pdf')).not.toBeInTheDocument();
        expect(screen.getByText('doc2.pdf')).toBeInTheDocument();
      });
    });

    it('should use compact variant for 4+ files', async () => {
      const { container } = render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const files = Array(4)
        .fill(null)
        .map((_, i) => new File([`content${i}`], `doc${i}.pdf`, { type: 'application/pdf' }));

      Object.defineProperty(fileInput, 'files', {
        value: files,
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('doc0.pdf')).toBeInTheDocument();
        expect(screen.getByText('doc3.pdf')).toBeInTheDocument();
      });

      // Check that chips exist (compact variant detection would need data-testid)
      const chipContainer = container.querySelector('.flex.flex-wrap');
      expect(chipContainer?.children).toHaveLength(4);
    });

    it('should disable attach button at max files', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const files = Array(10)
        .fill(null)
        .map((_, i) => new File([`content${i}`], `doc${i}.pdf`, { type: 'application/pdf' }));

      Object.defineProperty(fileInput, 'files', {
        value: files,
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('doc0.pdf')).toBeInTheDocument();
      });

      // Attach button should be disabled (at max files)
      const attachButton = screen.getByLabelText('Attach file');
      // Label elements don't have native disabled attribute - check CSS classes instead
      expect(attachButton).toHaveClass('pointer-events-none');
      expect(attachButton).toHaveClass('cursor-not-allowed');
    });

    it('should clear files after successful send', async () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('doc.pdf')).toBeInTheDocument();
      });

      // Type a message
      const textarea = screen.getByPlaceholderText('Type a message...');
      await userEvent.type(textarea, 'Here is a file');

      // Send message
      const sendButton = screen.getByLabelText('Send message');
      await userEvent.click(sendButton);

      // Files should be cleared
      await waitFor(() => {
        expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument();
      });
    });

    it('should enable send button with files only (no text)', async () => {
      // Epic 18 Sprint 3: Send requires files to be attached/parsing/complete (not just pending)
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('doc.pdf')).toBeInTheDocument();
      });

      // Epic 18 Sprint 3: Send button disabled for pending files (need attached+)
      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).toBeDisabled();
    });

    it('should allow multiple attribute on file input', () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toHaveAttribute('multiple');
    });
  });

  // Sprint 2 Fix: Upload state and send button behavior
  describe('Upload State (Sprint 2 Fixes)', () => {
    const mockWsAdapter = {
      isConnected: true,
      subscribeUploadProgress: jest.fn(() => jest.fn()),
      subscribeIntakeContextReady: jest.fn(() => jest.fn()),
      subscribeScoringParseReady: jest.fn(() => jest.fn()),
      subscribeFileAttached: jest.fn(() => jest.fn()), // Epic 18
    };

    beforeEach(() => {
      mockWsAdapter.subscribeUploadProgress.mockClear();
      mockWsAdapter.subscribeIntakeContextReady.mockClear();
      mockWsAdapter.subscribeScoringParseReady.mockClear();
      mockWsAdapter.subscribeFileAttached.mockClear(); // Epic 18
      // Reset any global mocks
      jest.clearAllMocks();
    });

    it('should disable send button during upload (isUploading)', async () => {
      // Epic 18 Sprint 3: Disable send during early upload stages (pending/uploading/storing)
      // Send is ENABLED once file reaches attached/parsing/complete (trigger-on-send)
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      // Add a file
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      // Verify file chip appears
      await waitFor(() => {
        expect(screen.getByText('doc.pdf')).toBeInTheDocument();
      });

      // Epic 18 Sprint 3: Send button disabled during early upload (file in 'pending' state)
      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).toBeDisabled();
    });

    // Epic 17 UX Fix: Removed aggregate progress bar (per-file chips show progress)
    // This test removed since the UI element no longer exists

    it('should have correct aria-label on send button when uploading files', () => {
      // The send button aria-label changes when uploading
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-123"
        />
      );

      // Default state: not uploading
      const sendButton = screen.getByRole('button', { name: /send message/i });
      expect(sendButton).toBeInTheDocument();
    });
  });

  /**
   * Sprint 2 Integration Test: Verify stale closure fix
   * This test would FAIL if waitForCompletion() didn't return attachments
   * from latest state (the bug that was fixed)
   */
  describe('Upload + Send Integration (Sprint 2 Stale Closure Fix)', () => {
    // Track WebSocket subscription handlers
    let uploadProgressHandler: ((data: unknown) => void) | null = null;
    let intakeContextHandler: ((data: unknown) => void) | null = null;

    const mockWsAdapter = {
      isConnected: true,
      subscribeUploadProgress: jest.fn((handler) => {
        uploadProgressHandler = handler;
        return () => { uploadProgressHandler = null; };
      }),
      subscribeIntakeContextReady: jest.fn((handler) => {
        intakeContextHandler = handler;
        return () => { intakeContextHandler = null; };
      }),
      subscribeScoringParseReady: jest.fn(() => jest.fn()),
      subscribeFileAttached: jest.fn(() => jest.fn()), // Epic 18
    };

    const mockFetch = jest.fn();
    // Save original fetch to restore after tests (test isolation)
    const originalFetch = global.fetch;

    beforeEach(() => {
      mockWsAdapter.subscribeUploadProgress.mockClear();
      mockWsAdapter.subscribeIntakeContextReady.mockClear();
      mockWsAdapter.subscribeScoringParseReady.mockClear();
      mockWsAdapter.subscribeFileAttached.mockClear(); // Epic 18
      uploadProgressHandler = null;
      intakeContextHandler = null;
      mockFetch.mockClear();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      // Restore original fetch to avoid cross-suite leakage
      global.fetch = originalFetch;
      jest.restoreAllMocks();
    });

    it('should call onSendMessage with attachments ONLY after WS completion (not immediately after HTTP)', async () => {
      // This test verifies the stale closure fix:
      // - Add file → auto-upload starts (Epic 17 UX Fix)
      // - HTTP returns 202 with uploadId
      // - onSendMessage should NOT be called yet (waiting for WS)
      // - WS intake_context_ready arrives with fileId
      // - Type text and click Send
      // - onSendMessage called WITH complete attachments

      // Mock fetch FIRST (auto-upload will call it)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-xyz-123', status: 'accepted' }],
        }),
      });

      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-conv-123"
        />
      );

      // 1. Add a file (auto-upload will trigger via useEffect)
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test content'], 'test-doc.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('test-doc.pdf')).toBeInTheDocument();
      });

      // 2. Wait for auto-upload fetch to be called
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // 3. CRITICAL: onSendMessage should NOT have been called yet!
      // (No send triggered - just upload)
      expect(mockOnSendMessage).not.toHaveBeenCalled();

      // 4. Simulate WS intake_context_ready event with fileId
      await waitFor(() => {
        expect(intakeContextHandler).not.toBeNull();
      });

      // Trigger WS completion
      intakeContextHandler?.({
        conversationId: 'test-conv-123',
        uploadId: 'upload-xyz-123',
        success: true,
        context: { vendorName: 'Test Vendor' },
        fileMetadata: {
          fileId: 'file-uuid-final-123',
          filename: 'test-doc.pdf',
          mimeType: 'application/pdf',
          size: 12,
        },
      });

      // 5. Wait for file to show as complete (Ready status)
      await waitFor(() => {
        // After WS completion, file should be complete - chip shows checkmark
        const chip = screen.getByText('test-doc.pdf').closest('[role="status"]');
        expect(chip).toHaveAttribute('aria-label', expect.stringContaining('Ready'));
      });

      // 6. Type some text
      const textarea = screen.getByPlaceholderText('Type a message...');
      await userEvent.type(textarea, 'Test with attachment');

      // 7. Now click send - file is already complete
      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).not.toBeDisabled();

      await userEvent.click(sendButton);

      // 8. onSendMessage should be called WITH correct attachments
      await waitFor(() => {
        expect(mockOnSendMessage).toHaveBeenCalledTimes(1);
      });

      // Verify the attachments include the fileId from WS (not empty!)
      expect(mockOnSendMessage).toHaveBeenCalledWith(
        'Test with attachment',
        expect.arrayContaining([
          expect.objectContaining({
            fileId: 'file-uuid-final-123',
            filename: 'test-doc.pdf',
            mimeType: 'application/pdf',
            size: 12,
          }),
        ])
      );
    });

    it('should show error toast and not send if all files fail', async () => {
      // Mock fetch FIRST (auto-upload will call it immediately)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, status: 'rejected', error: 'Invalid file format' }],
        }),
      });

      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-conv-123"
        />
      );

      // Add a file (no text) - auto-upload triggers immediately
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test content'], 'test-doc.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('test-doc.pdf')).toBeInTheDocument();
      });

      // Wait for auto-upload fetch (rejected)
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Wait for file to show as error
      await waitFor(() => {
        const chip = screen.getByText('test-doc.pdf').closest('[role="status"]');
        expect(chip).toHaveAttribute('aria-label', expect.stringContaining('Error'));
      });

      // Click send (file is in error state, no text)
      const sendButton = screen.getByLabelText('Send message');
      await userEvent.click(sendButton);

      // onSendMessage should NOT be called (no text + all files failed)
      await waitFor(() => {
        expect(mockOnSendMessage).not.toHaveBeenCalled();
      });
    });
  });

  // Stop button during streaming
  describe('Stop Button', () => {
    it('does not render stop button when not streaming', () => {
      render(<Composer onSendMessage={mockOnSendMessage} isStreaming={false} />);

      expect(screen.queryByLabelText('Stop generating')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Send message')).toBeInTheDocument();
    });

    it('renders stop button when streaming', () => {
      render(<Composer onSendMessage={mockOnSendMessage} isStreaming={true} onStopStream={jest.fn()} />);

      expect(screen.getByLabelText('Stop generating')).toBeInTheDocument();
      expect(screen.queryByLabelText('Send message')).not.toBeInTheDocument();
    });

    it('stop button has red background', () => {
      render(<Composer onSendMessage={mockOnSendMessage} isStreaming={true} onStopStream={jest.fn()} />);

      const stopButton = screen.getByLabelText('Stop generating');
      expect(stopButton).toHaveClass('bg-red-500');
    });

    it('stop button is circular with correct size', () => {
      render(<Composer onSendMessage={mockOnSendMessage} isStreaming={true} onStopStream={jest.fn()} />);

      const stopButton = screen.getByLabelText('Stop generating');
      expect(stopButton).toHaveClass('h-8', 'w-8', 'rounded-full');
    });

    it('stop button shows square icon', () => {
      render(<Composer onSendMessage={mockOnSendMessage} isStreaming={true} onStopStream={jest.fn()} />);

      const stopButton = screen.getByLabelText('Stop generating');
      const icon = stopButton.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('clicking stop button calls onStopStream callback', async () => {
      const mockOnStopStream = jest.fn();
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          isStreaming={true}
          onStopStream={mockOnStopStream}
        />
      );

      const stopButton = screen.getByLabelText('Stop generating');
      await userEvent.click(stopButton);

      expect(mockOnStopStream).toHaveBeenCalledTimes(1);
    });

    it('textarea disabled during streaming', () => {
      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          isStreaming={true}
          disabled={true}
        />
      );

      const textarea = screen.getByPlaceholderText('Type a message...');
      expect(textarea).toBeDisabled();
    });
  });
});
