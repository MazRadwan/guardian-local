import React, { createRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Composer, ComposerRef } from '../Composer';

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
      expect(uploadButton).toBeDisabled();
    });
  });

  // File upload (Epic 16)
  describe('File Upload', () => {
    it('file upload button is disabled when wsAdapter or conversationId not provided', async () => {
      // Without wsAdapter and conversationId, upload should be disabled
      render(<Composer onSendMessage={mockOnSendMessage} />);

      const uploadButton = screen.getByLabelText('Attach file');
      expect(uploadButton).toBeDisabled();
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
