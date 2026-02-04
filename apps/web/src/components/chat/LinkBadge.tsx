/**
 * LinkBadge Component
 *
 * Claude-style inline link badge with hover preview card.
 * Renders markdown links as small domain badges that show full details on hover.
 *
 * Part of Epic 33: Consult Search Tool (link formatting enhancement)
 */

'use client';

import React, { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

export interface LinkBadgeProps {
  href: string;
  children: React.ReactNode;
}

/**
 * Extract domain from URL for display
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove 'www.' prefix if present
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    // Fallback for invalid URLs
    return url.slice(0, 20) + (url.length > 20 ? '...' : '');
  }
}

/**
 * Get favicon URL for a domain using Google's favicon service
 */
function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=16`;
  } catch {
    return '';
  }
}

/**
 * Extract title text from React children (handles nested elements)
 */
function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') {
    return children;
  }
  if (Array.isArray(children)) {
    return children.map(extractText).join('');
  }
  if (React.isValidElement(children)) {
    const props = children.props as { children?: React.ReactNode };
    if (props.children) {
      return extractText(props.children);
    }
  }
  return '';
}

export function LinkBadge({ href, children }: LinkBadgeProps) {
  const domain = useMemo(() => extractDomain(href), [href]);
  const faviconUrl = useMemo(() => getFaviconUrl(href), [href]);
  const title = useMemo(() => extractText(children), [children]);

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="truncate max-w-[120px]">{domain}</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0 text-slate-500" />
        </a>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-72">
        <div className="space-y-2">
          {/* Title */}
          <p className="text-sm font-medium text-slate-900 line-clamp-2">
            {title || domain}
          </p>

          {/* Domain with favicon */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {faviconUrl && (
              <img
                src={faviconUrl}
                alt=""
                className="h-4 w-4 flex-shrink-0"
                onError={(e) => {
                  // Hide broken favicon images
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span className="truncate">{domain}</span>
          </div>

          {/* Full URL (truncated) */}
          <p className="text-xs text-slate-400 truncate">
            {href}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export default LinkBadge;
