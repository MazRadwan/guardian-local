'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Download, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export interface DownloadButtonProps {
  assessmentId: string;
  format: 'pdf' | 'word' | 'excel';
  exportType?: 'questionnaire' | 'scoring';
  batchId?: string;
  label?: string;
  onDownload?: () => void;
}

const STATUS_MESSAGES = [
  'Generating detailed report...',
  'This may take a minute...',
];

export function DownloadButton({
  assessmentId,
  format,
  exportType = 'questionnaire',
  batchId,
  label,
  onDownload,
}: DownloadButtonProps) {
  const router = useRouter();
  const { token, logout } = useAuth();
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'generating'>('idle');
  const [msgIndex, setMsgIndex] = useState(0);

  // Cycle through status messages every 5 seconds during generation
  useEffect(() => {
    if (phase !== 'generating') {
      setMsgIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [phase]);

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
    setPhase('generating');
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // Build URL based on exportType
      let url = exportType === 'scoring'
        ? `${apiUrl}/api/export/scoring/${assessmentId}/${format}`
        : `${apiUrl}/api/assessments/${assessmentId}/export/${format}`;

      // Append batchId to prevent batch drift (export matches displayed results)
      if (batchId && exportType === 'scoring') {
        url += `?batchId=${encodeURIComponent(batchId)}`;
      }

      const response = await fetch(url, {
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
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;

      // Try to get filename from Content-Disposition header, fall back to generic
      let filename: string;
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        // Parse filename from header: attachment; filename="name.ext" or filename*=UTF-8''name.ext
        const filenameMatch = contentDisposition.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
        filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : '';
      } else {
        filename = '';
      }

      // Fall back to generic filename if header parsing failed
      if (!filename) {
        const extension = format === 'word' ? 'docx' : format === 'excel' ? 'xlsx' : 'pdf';
        const timestamp = new Date().toISOString().split('T')[0];
        const prefix = exportType === 'scoring' ? 'scoring-report' : 'questionnaire';
        filename = `${prefix}-${timestamp}.${extension}`;
      }

      a.download = filename;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);

      console.log(`[DownloadButton] Successfully downloaded ${format.toUpperCase()} file`);
      onDownload?.();
    } catch (err) {
      console.error('[DownloadButton] Download error:', err);
      setError(err instanceof Error ? err.message : 'Failed to download file');
    } finally {
      setIsDownloading(false);
      setPhase('idle');
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
        {isDownloading ? 'Generating...' : formatLabel}
      </Button>
      {phase === 'generating' && (
        <span className="text-xs text-gray-500" data-testid="status-message">
          {STATUS_MESSAGES[msgIndex]}
        </span>
      )}
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
