'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Download, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export interface DownloadButtonProps {
  assessmentId: string;
  format: 'pdf' | 'word' | 'excel';
  label?: string;
  onDownload?: () => void;
}

export function DownloadButton({
  assessmentId,
  format,
  label,
  onDownload,
}: DownloadButtonProps) {
  const router = useRouter();
  const { token, logout } = useAuth();
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleDownload = async () => {
    // Clear any previous error
    setError(null);

    // Check authentication before attempting download
    if (!token) {
      console.log('[DownloadButton] No token - redirecting to login');
      // Preserve current URL for return after login
      const returnUrl = typeof window !== 'undefined' ? window.location.pathname : '/chat';
      router.push(`/login?redirect=${encodeURIComponent(returnUrl)}`);
      return;
    }

    setIsDownloading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
      const response = await fetch(`${apiUrl}/assessments/${assessmentId}/export/${format}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Handle authentication errors with login redirect
      if (response.status === 401) {
        console.log('[DownloadButton] Session expired - logging out and redirecting to login');
        logout();
        const returnUrl = typeof window !== 'undefined' ? window.location.pathname : '/chat';
        router.push(`/login?redirect=${encodeURIComponent(returnUrl)}`);
        return;
      }

      // Handle other errors
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Download failed: ${response.statusText}. ${errorText}`);
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Set filename based on format with timestamp
      const extension = format === 'word' ? 'docx' : format === 'excel' ? 'xlsx' : 'pdf';
      const timestamp = new Date().toISOString().split('T')[0];
      a.download = `questionnaire-${timestamp}.${extension}`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log(`[DownloadButton] Successfully downloaded ${format.toUpperCase()} file`);
      onDownload?.();
    } catch (err) {
      console.error('[DownloadButton] Download error:', err);
      setError(err instanceof Error ? err.message : 'Failed to download file');
    } finally {
      setIsDownloading(false);
    }
  };

  const formatLabels: Record<string, string> = {
    pdf: 'PDF',
    word: 'Word',
    excel: 'Excel',
  };

  const formatLabel = label || formatLabels[format] || format.toUpperCase();

  // Determine if button should be disabled (only during download, NOT for auth)
  // Auth check happens in handleDownload which redirects to login
  const isDisabled = isDownloading;

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        onClick={handleDownload}
        disabled={isDisabled}
        variant="outline"
        size="sm"
        className="gap-2"
        data-testid={`download-${format}`}
      >
        {isDownloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {isDownloading ? 'Downloading...' : formatLabel}
      </Button>
      {!token && !error && !isDownloading && (
        <span className="text-xs text-muted-foreground">Click to log in and download</span>
      )}
      {error && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
