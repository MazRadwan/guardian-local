'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export interface DownloadButtonProps {
  assessmentId: string;
  format: 'pdf' | 'word' | 'excel';
  label?: string;
  onDownload?: () => void;
}

export function DownloadButton({ assessmentId, format, label, onDownload }: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = React.useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
      const response = await fetch(`${apiUrl}/assessments/${assessmentId}/export/${format}`, {
        method: 'GET',
        headers: {
          // JWT token would go here
          // 'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `assessment-${assessmentId}.${format === 'word' ? 'docx' : format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      onDownload?.();
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download file. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const formatLabel = label || `Download ${format.toUpperCase()}`;

  return (
    <Button onClick={handleDownload} disabled={isDownloading} variant="outline" size="sm">
      <Download className="mr-2 h-4 w-4" />
      {isDownloading ? 'Downloading...' : formatLabel}
    </Button>
  );
}
