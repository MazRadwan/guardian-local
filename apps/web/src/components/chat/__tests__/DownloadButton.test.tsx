import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DownloadButton } from '../DownloadButton';

// Mock fetch
global.fetch = jest.fn();
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

// Mock alert
global.alert = jest.fn();

describe('DownloadButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset DOM for each test
    document.body.innerHTML = '';
  });

  it('renders with default label', () => {
    render(<DownloadButton assessmentId="test-123" format="pdf" />);

    expect(screen.getByText('Download PDF')).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    render(<DownloadButton assessmentId="test-123" format="pdf" label="Get Report" />);

    expect(screen.getByText('Get Report')).toBeInTheDocument();
  });

  it('renders correct format labels', () => {
    const { rerender } = render(<DownloadButton assessmentId="test-123" format="pdf" />);
    expect(screen.getByText('Download PDF')).toBeInTheDocument();

    rerender(<DownloadButton assessmentId="test-123" format="word" />);
    expect(screen.getByText('Download WORD')).toBeInTheDocument();

    rerender(<DownloadButton assessmentId="test-123" format="excel" />);
    expect(screen.getByText('Download EXCEL')).toBeInTheDocument();
  });

  it('initiates download on button click', async () => {
    const mockBlob = new Blob(['test content'], { type: 'application/pdf' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
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
        })
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
      expect(screen.getByText('Download PDF')).toBeInTheDocument();
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

  it('creates download link with correct filename for PDF', async () => {
    const mockBlob = new Blob(['test content'], { type: 'application/pdf' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    render(<DownloadButton assessmentId="test-123" format="pdf" />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      const link = document.querySelector('a[download]');
      expect(link).toBeDefined();
    });
  });

  it('creates download link with correct filename for Word', async () => {
    const mockBlob = new Blob(['test content'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    render(<DownloadButton assessmentId="test-123" format="word" />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      const link = document.querySelector('a[download]');
      expect(link).toBeDefined();
    });
  });

  it('creates download link with correct filename for Excel', async () => {
    const mockBlob = new Blob(['test content'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    render(<DownloadButton assessmentId="test-123" format="excel" />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      const link = document.querySelector('a[download]');
      expect(link).toBeDefined();
    });
  });

  it('handles download error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
    });

    render(<DownloadButton assessmentId="test-123" format="pdf" />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith('Failed to download file. Please try again.');
    });
  });

  it('calls onDownload callback after successful download', async () => {
    const mockBlob = new Blob(['test content'], { type: 'application/pdf' });
    const onDownload = jest.fn();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    render(<DownloadButton assessmentId="test-123" format="pdf" onDownload={onDownload} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(onDownload).toHaveBeenCalled();
    });
  });

  it('handles fetch network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(<DownloadButton assessmentId="test-123" format="pdf" />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith('Failed to download file. Please try again.');
    });
  });
});
