/**
 * Epic 18 Sprint 3: Mode-Specific Frontend Tests
 * Tests for Stories 18.3.1 and 18.3.4
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Composer } from '../Composer';

// Mock useAuth for upload tests (hook requires token)
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token-123' }),
}));

describe('Epic 18 Sprint 3: Mode-Specific Frontend', () => {
  const mockOnSendMessage = jest.fn();
  const mockOnModeChange = jest.fn();

  const mockWsAdapter = {
    isConnected: true,
    subscribeUploadProgress: jest.fn(() => jest.fn()),
    subscribeIntakeContextReady: jest.fn(() => jest.fn()),
    subscribeScoringParseReady: jest.fn(() => jest.fn()),
    subscribeFileAttached: jest.fn(() => jest.fn()),
  };

  beforeEach(() => {
    mockOnSendMessage.mockClear();
    mockOnModeChange.mockClear();
    mockWsAdapter.subscribeUploadProgress.mockClear();
    mockWsAdapter.subscribeIntakeContextReady.mockClear();
    mockWsAdapter.subscribeScoringParseReady.mockClear();
    mockWsAdapter.subscribeFileAttached.mockClear();
  });

  describe('Story 18.3.1: Mode-Aware Send Enablement', () => {
    it('should enable send when files are in attached stage', async () => {
      // This test verifies trigger-on-send behavior:
      // - Files at 'attached' stage allow sending
      // - Send triggers parsing/scoring, not upload completion

      const mockFetch = jest.fn();
      const originalFetch = global.fetch;
      global.fetch = mockFetch;

      // Mock file_attached event handler
      let fileAttachedHandler: ((data: any) => void) | null = null;
      mockWsAdapter.subscribeFileAttached.mockImplementation((handler) => {
        fileAttachedHandler = handler;
        return () => { fileAttachedHandler = null; };
      });

      // Mock upload response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-123', status: 'accepted' }],
        }),
      });

      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-conv"
          currentMode="consult"
        />
      );

      // Add a file (auto-upload triggers)
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });

      // Wait for auto-upload
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Simulate file_attached event (Epic 18)
      await waitFor(() => {
        expect(fileAttachedHandler).not.toBeNull();
      });

      await act(async () => {
        fileAttachedHandler?.({
          conversationId: 'test-conv',
          uploadId: 'upload-123',
          fileId: 'file-uuid-123',
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          size: 100,
          hasExcerpt: true,
        });
      });

      // Wait for file to transition to 'attached' stage
      await waitFor(() => {
        // File chip should show some progress indicator (not error)
        const chip = screen.getByText('test.pdf').closest('[role="status"]');
        expect(chip).toBeInTheDocument();
      });

      // Send button should be ENABLED (file in 'attached' stage)
      // Note: aria-label shows 'Uploading files...' because file is still in-flight
      let sendButton = screen.getByRole('button', { name: /send|uploading/i });

      // Before typing text, button should be enabled because file is in 'attached' stage
      expect(sendButton).not.toBeDisabled();

      // Type message and send
      const textarea = screen.getByPlaceholderText('Type a message...');
      await userEvent.type(textarea, 'Test with attached file');

      // Re-query button after typing (might have different aria-label)
      sendButton = screen.getByRole('button', { name: /send|uploading/i });
      expect(sendButton).not.toBeDisabled();

      await userEvent.click(sendButton);

      // onSendMessage should be called (trigger-on-send behavior)
      await waitFor(() => {
        expect(mockOnSendMessage).toHaveBeenCalledTimes(1);
      });

      global.fetch = originalFetch;
    });

    it('should enable send with files in parsing stage', async () => {
      // Verify that files in 'parsing' stage also allow sending
      // (parsing may continue in background after send)

      const mockFetch = jest.fn();
      const originalFetch = global.fetch;
      global.fetch = mockFetch;

      let uploadProgressHandler: ((data: any) => void) | null = null;
      mockWsAdapter.subscribeUploadProgress.mockImplementation((handler) => {
        uploadProgressHandler = handler;
        return () => { uploadProgressHandler = null; };
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-456', status: 'accepted' }],
        }),
      });

      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-conv"
          currentMode="scoring"
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'questionnaire.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('questionnaire.pdf')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Simulate upload_progress:parsing event
      await waitFor(() => {
        expect(uploadProgressHandler).not.toBeNull();
      });

      await act(async () => {
        uploadProgressHandler?.({
          conversationId: 'test-conv',
          uploadId: 'upload-456',
          progress: 50,
          stage: 'parsing',
          message: 'Parsing...',
        });
      });

      await waitFor(() => {
        // File should be in parsing stage
        const chip = screen.getByText('questionnaire.pdf').closest('[role="status"]');
        expect(chip).toBeInTheDocument();
      });

      // Send button should be enabled (file is in parsing stage)
      // Note: aria-label shows 'Uploading files...' because parsing is in-flight
      const sendButton = screen.getByRole('button', { name: /send|uploading/i });
      expect(sendButton).not.toBeDisabled();

      global.fetch = originalFetch;
    });

    it('should enable send with files in complete stage', async () => {
      // Verify files in 'complete' stage allow sending (standard case)

      const mockFetch = jest.fn();
      const originalFetch = global.fetch;
      global.fetch = mockFetch;

      let intakeContextHandler: ((data: any) => void) | null = null;
      mockWsAdapter.subscribeIntakeContextReady.mockImplementation((handler) => {
        intakeContextHandler = handler;
        return () => { intakeContextHandler = null; };
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-789', status: 'accepted' }],
        }),
      });

      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-conv"
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'complete.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Simulate intake_context_ready (complete)
      await waitFor(() => {
        expect(intakeContextHandler).not.toBeNull();
      });

      await act(async () => {
        intakeContextHandler?.({
          conversationId: 'test-conv',
          uploadId: 'upload-789',
          success: true,
          context: { vendorName: 'Test Vendor' },
          fileMetadata: {
            fileId: 'file-uuid-789',
            filename: 'complete.pdf',
            mimeType: 'application/pdf',
            size: 100,
          },
        });
      });

      await waitFor(() => {
        const chip = screen.getByText('complete.pdf').closest('[role="status"]');
        expect(chip).toHaveAttribute('aria-label', expect.stringContaining('Ready'));
      });

      // Send button enabled (file is complete - not in-flight)
      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).not.toBeDisabled();

      global.fetch = originalFetch;
    });

    it('should disable send when files are in pending or uploading stage', async () => {
      // Verify send is disabled for files not yet attached

      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-conv"
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'pending.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('pending.pdf')).toBeInTheDocument();
      });

      // File is in 'pending' stage (not attached yet)
      // Send button should be disabled (no text + files not ready)
      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).toBeDisabled();
    });
  });

  describe('Story 18.3.4: Mode Transition Handling', () => {
    it('should show warning icon when files are incomplete', async () => {
      // Test that warning icon appears in mode selector when files processing

      const mockFetch = jest.fn();
      const originalFetch = global.fetch;
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-warn', status: 'accepted' }],
        }),
      });

      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-conv"
          currentMode="consult"
          onModeChange={mockOnModeChange}
        />
      );

      // Add file
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'processing.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // File is processing (not complete) - warning should appear
      await waitFor(() => {
        const modeButton = screen.getByLabelText(/Mode:/);
        // Check for warning in aria-label
        expect(modeButton).toHaveAttribute(
          'aria-label',
          expect.stringContaining('files still processing')
        );
      });

      global.fetch = originalFetch;
    });

    it('should show tooltip on mode selector when files incomplete', async () => {
      const mockFetch = jest.fn();
      const originalFetch = global.fetch;
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-tooltip', status: 'accepted' }],
        }),
      });

      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-conv"
          currentMode="assessment"
          onModeChange={mockOnModeChange}
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'incomplete.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Mode selector should have title attribute with warning
      await waitFor(() => {
        const modeButton = screen.getByLabelText(/Mode:/);
        expect(modeButton).toHaveAttribute(
          'title',
          'Files are still processing. Switching modes may affect analysis.'
        );
      });

      global.fetch = originalFetch;
    });

    it('should NOT show warning when files are complete', async () => {
      const mockFetch = jest.fn();
      const originalFetch = global.fetch;
      global.fetch = mockFetch;

      let intakeContextHandler: ((data: any) => void) | null = null;
      mockWsAdapter.subscribeIntakeContextReady.mockImplementation((handler) => {
        intakeContextHandler = handler;
        return () => { intakeContextHandler = null; };
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-complete', status: 'accepted' }],
        }),
      });

      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-conv"
          currentMode="consult"
          onModeChange={mockOnModeChange}
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'done.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Complete the file
      await waitFor(() => {
        expect(intakeContextHandler).not.toBeNull();
      });

      await act(async () => {
        intakeContextHandler?.({
          conversationId: 'test-conv',
          uploadId: 'upload-complete',
          success: true,
          context: { vendorName: 'Test' },
          fileMetadata: {
            fileId: 'file-done',
            filename: 'done.pdf',
            mimeType: 'application/pdf',
            size: 100,
          },
        });
      });

      await waitFor(() => {
        const chip = screen.getByText('done.pdf').closest('[role="status"]');
        expect(chip).toHaveAttribute('aria-label', expect.stringContaining('Ready'));
      });

      // Mode selector should NOT have warning
      const modeButton = screen.getByLabelText(/Mode:/);
      expect(modeButton).not.toHaveAttribute(
        'aria-label',
        expect.stringContaining('files still processing')
      );
      expect(modeButton).not.toHaveAttribute('title');

      global.fetch = originalFetch;
    });

    it('should allow mode change with incomplete files (no blocking)', async () => {
      // Verify warning doesn't prevent mode change, just informs user

      const mockFetch = jest.fn();
      const originalFetch = global.fetch;
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, uploadId: 'upload-switch', status: 'accepted' }],
        }),
      });

      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-conv"
          currentMode="consult"
          onModeChange={mockOnModeChange}
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'switching.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Click mode selector
      const modeButton = screen.getByLabelText(/Mode:/);
      await userEvent.click(modeButton);

      // Select different mode
      const assessmentOption = screen.getByTestId('mode-option-assessment');
      await userEvent.click(assessmentOption);

      // onModeChange should be called (warning doesn't block)
      expect(mockOnModeChange).toHaveBeenCalledWith('assessment');

      global.fetch = originalFetch;
    });

    it('should NOT show warning when files in error state', async () => {
      // Error is a terminal state - no warning needed

      const mockFetch = jest.fn();
      const originalFetch = global.fetch;
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ index: 0, status: 'rejected', error: 'Invalid file' }],
        }),
      });

      render(
        <Composer
          onSendMessage={mockOnSendMessage}
          wsAdapter={mockWsAdapter}
          conversationId="test-conv"
          currentMode="consult"
          onModeChange={mockOnModeChange}
        />
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'error.pdf', { type: 'application/pdf' });

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      await waitFor(() => {
        const chip = screen.getByText('error.pdf').closest('[role="status"]');
        expect(chip).toHaveAttribute('aria-label', expect.stringContaining('Error'));
      });

      // Mode selector should NOT show warning (error is terminal)
      const modeButton = screen.getByLabelText(/Mode:/);
      expect(modeButton).not.toHaveAttribute(
        'aria-label',
        expect.stringContaining('files still processing')
      );

      global.fetch = originalFetch;
    });
  });
});
