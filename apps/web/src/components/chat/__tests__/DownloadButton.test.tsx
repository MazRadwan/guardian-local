import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DownloadButton } from '../DownloadButton';

// Mock useRouter
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock useAuth
const mockLogout = jest.fn();
let mockToken: string | null = 'test-token-123';
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    token: mockToken,
    logout: mockLogout,
  }),
}));

// Mock fetch
global.fetch = jest.fn();
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

describe('DownloadButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    mockToken = 'test-token-123'; // Reset token for each test
  });

  describe('rendering', () => {
    it('renders with correct format label for PDF', () => {
      render(<DownloadButton assessmentId="test-123" format="pdf" />);
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });

    it('renders with correct format label for Word', () => {
      render(<DownloadButton assessmentId="test-123" format="word" />);
      expect(screen.getByText('Word')).toBeInTheDocument();
    });

    it('renders with correct format label for Excel', () => {
      render(<DownloadButton assessmentId="test-123" format="excel" />);
      expect(screen.getByText('Excel')).toBeInTheDocument();
    });

    it('renders with custom label when provided', () => {
      render(<DownloadButton assessmentId="test-123" format="pdf" label="Get Report" />);
      expect(screen.getByText('Get Report')).toBeInTheDocument();
    });
  });

  describe('authentication', () => {
    it('includes auth header in request when token exists', async () => {
      const mockBlob = new Blob(['test content'], { type: 'application/pdf' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      });

      render(<DownloadButton assessmentId="test-123" format="pdf" />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8000/api/assessments/test-123/export/pdf',
          expect.objectContaining({
            method: 'GET',
            headers: {
              Authorization: 'Bearer test-token-123',
            },
          })
        );
      });
    });

    it('redirects to login when no token exists', async () => {
      mockToken = null;

      render(<DownloadButton assessmentId="test-123" format="pdf" />);

      const button = screen.getByRole('button');

      // Button should NOT be disabled - click triggers redirect
      expect(button).not.toBeDisabled();

      fireEvent.click(button);

      // Should redirect to login without making fetch call
      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/login?redirect='));
      });
    });

    it('is enabled when no token exists (redirects on click)', () => {
      mockToken = null;

      render(<DownloadButton assessmentId="test-123" format="pdf" />);

      const button = screen.getByRole('button');
      // Button is NOT disabled - user can click to trigger redirect
      expect(button).not.toBeDisabled();
    });

    it('shows helper text when no token', () => {
      mockToken = null;

      render(<DownloadButton assessmentId="test-123" format="pdf" />);

      // Updated helper text explains click behavior
      expect(screen.getByText('Click to log in and download')).toBeInTheDocument();
    });

    it('handles 401 response with logout and redirect', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      render(<DownloadButton assessmentId="test-123" format="pdf" />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/login?redirect='));
      });
    });
  });

  describe('download flow', () => {
    it('initiates download on button click', async () => {
      const mockBlob = new Blob(['test content'], { type: 'application/pdf' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      });

      render(<DownloadButton assessmentId="test-123" format="pdf" />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8000/api/assessments/test-123/export/pdf',
          expect.any(Object)
        );
      });
    });

    it('shows loading state during download', async () => {
      const mockBlob = new Blob(['test content'], { type: 'application/pdf' });
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  blob: () => Promise.resolve(mockBlob),
                }),
              100
            )
          )
      );

      render(<DownloadButton assessmentId="test-123" format="pdf" />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      // Should show loading text
      expect(screen.getByText('Downloading...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('PDF')).toBeInTheDocument();
      });
    });

    it('disables button during download', async () => {
      const mockBlob = new Blob(['test content'], { type: 'application/pdf' });
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  blob: () => Promise.resolve(mockBlob),
                }),
              100
            )
          )
      );

      render(<DownloadButton assessmentId="test-123" format="pdf" />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(button).toBeDisabled();

      await waitFor(() => {
        expect(button).not.toBeDisabled();
      });
    });

    it('creates blob URL and triggers download for PDF', async () => {
      const mockBlob = new Blob(['test content'], { type: 'application/pdf' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      });

      render(<DownloadButton assessmentId="test-123" format="pdf" />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        // Verify blob URL was created
        expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
        // Verify blob URL was revoked (cleanup)
        expect(global.URL.revokeObjectURL).toHaveBeenCalled();
      });
    });

    it('creates blob URL and triggers download for Word', async () => {
      const mockBlob = new Blob(['test content'], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      });

      render(<DownloadButton assessmentId="test-123" format="word" />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        // Verify blob URL was created
        expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
        // Verify blob URL was revoked (cleanup)
        expect(global.URL.revokeObjectURL).toHaveBeenCalled();
      });
    });

    it('creates blob URL and triggers download for Excel', async () => {
      const mockBlob = new Blob(['test content'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      });

      render(<DownloadButton assessmentId="test-123" format="excel" />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        // Verify blob URL was created
        expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
        // Verify blob URL was revoked (cleanup)
        expect(global.URL.revokeObjectURL).toHaveBeenCalled();
      });
    });

    it('calls onDownload callback after successful download', async () => {
      const mockBlob = new Blob(['test content'], { type: 'application/pdf' });
      const onDownload = jest.fn();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      });

      render(<DownloadButton assessmentId="test-123" format="pdf" onDownload={onDownload} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(onDownload).toHaveBeenCalled();
      });
    });
  });

  describe('error handling', () => {
    it('shows error message for failed download (non-401)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error details'),
      });

      render(<DownloadButton assessmentId="test-123" format="pdf" />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        // Should show inline error, not alert
        expect(screen.getByText(/Download failed/)).toBeInTheDocument();
      });
    });

    it('handles network error gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<DownloadButton assessmentId="test-123" format="pdf" />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        // Should show inline error
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });

    it('clears error on subsequent download attempt', async () => {
      // First attempt fails
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<DownloadButton assessmentId="test-123" format="pdf" />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });

      // Second attempt succeeds
      const mockBlob = new Blob(['test content'], { type: 'application/pdf' });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      });

      fireEvent.click(button);

      await waitFor(() => {
        // Error should be cleared
        expect(screen.queryByText(/Network error/)).not.toBeInTheDocument();
      });
    });
  });
});
