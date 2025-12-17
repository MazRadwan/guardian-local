'use client';

/**
 * FileChipInChat - File attachment display for chat stream
 *
 * Epic 16.6.8: Displays file attachments within message bubbles.
 * Simplified version of FileChip (no X button, no progress bar).
 *
 * Features:
 * - Light theme to match app
 * - Document icon + filename + "Document" label
 * - Clickable to trigger download
 * - No remove functionality (already sent)
 */

import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileChipInChatProps {
  filename: string;
  fileId: string;
  mimeType?: string;
  onClick: () => void;
}

export function FileChipInChat({ filename, mimeType, onClick }: FileChipInChatProps) {
  // Determine file type label based on MIME type
  const getTypeLabel = () => {
    if (!mimeType) return 'Document';
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('word') || mimeType.includes('docx')) return 'Word';
    if (mimeType.includes('image')) return 'Image';
    return 'Document';
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-2 rounded-lg max-w-xs',
        'bg-gray-100 border border-gray-200',
        'hover:bg-gray-200 transition-colors cursor-pointer',
        'text-left'
      )}
      aria-label={`Download ${filename}`}
    >
      {/* Document icon */}
      <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
        <FileText className="h-4 w-4 text-white" aria-hidden="true" />
      </div>

      {/* Filename and type */}
      <div className="flex flex-col min-w-0">
        <span className="text-sm text-gray-900 truncate max-w-[180px]" title={filename}>
          {filename}
        </span>
        <span className="text-xs text-gray-500">{getTypeLabel()}</span>
      </div>
    </button>
  );
}
