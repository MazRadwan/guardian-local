'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { cn } from '@/lib/utils';
import { User, ShieldCheck, Copy, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { DownloadButton } from './DownloadButton';
import { FileChipInChat } from './FileChipInChat';
import { ScoringResultCard } from './ScoringResultCard';
import { useChatStore } from '@/stores/chatStore';
import { useStreamingText } from '@/hooks/useStreamingText';
import type { ScoringResultData, RiskRating, Recommendation, DimensionScoreData } from '@/types/scoring';

/**
 * Post-process markdown to add spacing before section headers.
 * Claude often outputs single newlines where double newlines are needed.
 * This function detects bold headers and ensures blank lines precede them.
 */
function addSectionSpacing(markdown: string): string {
  // Pattern: A line starting with **text** that isn't already preceded by a blank line
  // We want to add a blank line before bold text that starts a new section

  // Split into lines for processing
  const lines = markdown.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : '';

    // Check if this line starts with bold text (section header pattern)
    // Patterns: "**Header**" or "**Header:**" or "**Header** -" etc.
    const isBoldHeader = /^\*\*[^*]+\*\*/.test(line.trim());

    // Check if previous line is empty (already has spacing)
    const prevIsEmpty = prevLine.trim() === '';

    // Check if this is the very first line (don't add spacing at start)
    const isFirstLine = i === 0;

    // Add blank line before bold headers that don't already have one
    if (isBoldHeader && !prevIsEmpty && !isFirstLine) {
      result.push(''); // Add blank line
    }

    result.push(line);
  }

  return result.join('\n');
}

/**
 * Epic 16.6.8: File attachment metadata for chat messages
 */
export interface MessageAttachment {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
}

export interface MessageComponent {
  type: 'button' | 'link' | 'form' | 'download' | 'error' | 'scoring_result';
  data: Record<string, any>;
}

export interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  components?: MessageComponent[];
  timestamp?: Date;
  className?: string;
  messageIndex?: number;
  onRegenerate?: (messageIndex: number) => void;
  isRegenerating?: boolean;
  /** Epic 16.6.8: File attachments to display in message */
  attachments?: MessageAttachment[];
  /** Epic 16.6.8: Callback when user clicks attachment to download */
  onDownloadAttachment?: (attachment: MessageAttachment) => void;
  /** Epic 22 Story 22.1.3: Whether this message contains the LAST scoring_result component */
  isLastScoringMessage?: boolean;
  /** Story 24.5: Whether to simulate streaming for this message (mode switch guidance) */
  simulateStreaming?: boolean;
}

export function ChatMessage({
  role,
  content,
  components = [],
  timestamp,
  className,
  messageIndex,
  onRegenerate,
  isRegenerating = false,
  attachments = [],
  onDownloadAttachment,
  isLastScoringMessage = false,
  simulateStreaming = false,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  // Story 24.5: Use simulated streaming for mode switch guidance messages
  const { displayedText, isStreaming: isSimulatedStreaming, isComplete } = useStreamingText({
    text: content,
    speed: 80, // 80 chars/sec - faster than Claude but still visible streaming effect
    enabled: simulateStreaming,
  });

  // Use streamed text if simulating, otherwise use full content
  // Apply section spacing post-processing to add blank lines before headers
  const baseContent = simulateStreaming ? displayedText : content;
  const renderedContent = addSectionSpacing(baseContent);


  // Copy to clipboard state
  const [isCopied, setIsCopied] = useState(false);

  // Epic 22 Story 22.1.3: Conditional scoring_result rendering with fallback strategy
  // Get activeConversationId from store (ChatMessage doesn't have conversationId prop)
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const scoringResultInStore = useChatStore(
    (state) => activeConversationId
      ? state.scoringResultByConversation[activeConversationId]
      : null
  );

  // Epic 22 Story 22.1.3: Filter out scoring_result from components when:
  // 1. Store has result (prevent duplicate - store takes precedence)
  // 2. OR this is NOT the last scoring message (latest-only rule)
  const filteredComponents = components.filter((c) => {
    if (c.type === 'scoring_result') {
      // If store has result, skip rendering from message (store takes precedence)
      if (scoringResultInStore) {
        return false;
      }
      // If store is empty but this is NOT the last scoring message, skip (latest-only)
      if (!isLastScoringMessage) {
        return false;
      }
      // Fallback: render from message if store empty AND this is last scoring message
      return true;
    }
    return true;
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      // Reset after 2 seconds
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  const handleRegenerateClick = () => {
    if (messageIndex !== undefined && onRegenerate) {
      onRegenerate(messageIndex);
    }
  };

  return (
    <div
      className={cn(
        'flex w-full gap-4 px-4 py-6 md:px-8 md:py-8',
        isUser && 'flex-row-reverse',
        className
      )}
      role="article"
      aria-label={`${role} message`}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex w-10 h-10 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-sky-100' : 'bg-sky-500'
        )}
      >
        {isUser ? (
          <User className="h-5 w-5 text-sky-600" aria-hidden="true" />
        ) : (
          <ShieldCheck className="h-5 w-5 text-white" aria-hidden="true" />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex-1 min-w-0 overflow-hidden', isUser && 'flex flex-col items-end')}>
        {/* Role label */}
        <div className={cn(
          'text-sm font-semibold',
          isUser ? 'text-gray-900' : 'text-sky-600'
        )}>
          {isUser ? 'You' : isSystem ? 'System' : 'Guardian'}
        </div>

        {/* Content container - sky-50 for Guardian, plain for user */}
        <div className={cn(!isUser && !isSystem && 'bg-sky-50 rounded-xl p-5 mt-2', (isUser || isSystem) && 'mt-2')}>
          {/* Message content */}
          <div className="prose prose-slate prose-base max-w-none break-words
            prose-p:leading-7 prose-p:my-4 prose-li:leading-7
            prose-pre:p-0 prose-pre:bg-transparent
            [&>table]:my-4
            [&>th]:bg-gray-100 [&>th]:p-2 [&>th]:text-left [&>th]:border [&>th]:border-gray-300
            [&>td]:p-2 [&>td]:border [&>td]:border-gray-300
          ">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={{
                table: ({node, ...props}) => (
                  <div className="overflow-x-auto w-full my-4 border rounded-lg">
                    <table className="min-w-full border-collapse text-sm" {...props} />
                  </div>
                ),
                thead: ({node, ...props}) => (
                  <thead className="bg-gray-50" {...props} />
                ),
                th: ({node, ...props}) => (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b" {...props} />
                ),
                td: ({node, ...props}) => (
                  <td className="px-4 py-3 text-sm text-gray-900 border-b last:border-0" {...props} />
                )
              }}
            >
              {renderedContent}
            </ReactMarkdown>
          </div>

          {/* Epic 16.6.8: File attachments */}
          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" data-testid="message-attachments">
              {attachments.map((attachment) => (
                <FileChipInChat
                  key={attachment.fileId}
                  filename={attachment.filename}
                  fileId={attachment.fileId}
                  mimeType={attachment.mimeType}
                  onClick={() => onDownloadAttachment?.(attachment)}
                />
              ))}
            </div>
          )}

          {/* Embedded components */}
          {/* Epic 22 Story 22.1.3: Use filteredComponents to prevent duplicate scoring_result rendering */}
          {filteredComponents.length > 0 && (
            <div className="mt-4 space-y-2">
              {filteredComponents.map((component, index) => (
                <EmbeddedComponent key={index} component={component} />
              ))}
            </div>
          )}

          {/* Message Actions - Assistant Messages Only (inside sky-50 container) */}
          {!isUser && !isSystem && (
            <div className="mt-4 flex items-center gap-2">
              {/* Copy Button */}
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-sky-100 active:bg-sky-200 transition-colors"
                aria-label={isCopied ? 'Copied to clipboard' : 'Copy message'}
                title={isCopied ? 'Copied!' : 'Copy to clipboard'}
              >
                {isCopied ? (
                  <>
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-green-600 font-medium">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              {/* Regenerate Button */}
              {onRegenerate && messageIndex !== undefined && (
                <button
                  onClick={handleRegenerateClick}
                  disabled={isRegenerating}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-sky-100 active:bg-sky-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Regenerate response"
                  title="Regenerate response"
                >
                  <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                  <span>Regenerate</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmbeddedComponent({ component }: { component: MessageComponent }) {
  switch (component.type) {
    case 'button':
      return <EmbeddedButton data={component.data} />;
    case 'link':
      return <EmbeddedLink data={component.data} />;
    case 'form':
      return <EmbeddedForm data={component.data} />;
    case 'download':
      return <EmbeddedDownload data={component.data} />;
    case 'error':
      return <EmbeddedError data={component.data} />;
    case 'scoring_result':
      return <EmbeddedScoringResult data={component.data} />;
    default:
      return null;
  }
}

function EmbeddedButton({ data }: { data: Record<string, any> }) {
  const handleClick = () => {
    // Emit custom event that parent can listen to
    window.dispatchEvent(
      new CustomEvent('chat:action', {
        detail: { action: data.action, payload: data.payload },
      })
    );
  };

  return (
    <button
      onClick={handleClick}
      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      {data.label}
    </button>
  );
}

function EmbeddedLink({ data }: { data: Record<string, any> }) {
  return (
    <a
      href={data.url}
      target={data.target || '_blank'}
      rel="noopener noreferrer"
      className="text-blue-600 underline hover:text-blue-800"
    >
      {data.label}
    </a>
  );
}

function EmbeddedForm({ data }: { data: Record<string, any> }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-700">{data.description}</p>
      {/* Form fields would go here - placeholder for now */}
    </div>
  );
}

// Only show Word and PDF - Excel removed per user request
const VALID_FORMATS = ['word', 'pdf'] as const;
type ValidFormat = typeof VALID_FORMATS[number];

function isValidFormat(format: unknown): format is ValidFormat {
  return typeof format === 'string' && VALID_FORMATS.includes(format as ValidFormat);
}

function EmbeddedDownload({ data }: { data: Record<string, any> }) {
  // Validate required data
  if (!data.assessmentId || typeof data.assessmentId !== 'string') {
    console.warn('[EmbeddedDownload] Missing or invalid assessmentId:', data);
    return null;
  }

  if (!data.formats || !Array.isArray(data.formats) || data.formats.length === 0) {
    console.warn('[EmbeddedDownload] Missing or invalid formats:', data);
    return null;
  }

  // Filter to valid formats only (word and pdf), sorted with word first
  const validFormats = data.formats
    .filter(isValidFormat)
    .sort((a, b) => {
      // Word first, then PDF
      if (a === 'word') return -1;
      if (b === 'word') return 1;
      return 0;
    });
  if (validFormats.length === 0) {
    console.warn('[EmbeddedDownload] No valid formats found:', data.formats);
    return null;
  }

  // Validate questionCount is a positive number
  const questionCount = typeof data.questionCount === 'number' && data.questionCount > 0
    ? data.questionCount
    : 0;

  return (
    <div
      className="rounded-lg border border-green-200 bg-green-50 p-4"
      data-testid="download-component"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-green-700 font-medium">
          Questionnaire ready ({questionCount} questions)
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {validFormats.map((format) => (
          <DownloadButton
            key={format}
            assessmentId={data.assessmentId}
            format={format}
          />
        ))}
      </div>
    </div>
  );
}

function EmbeddedError({ data }: { data: Record<string, any> }) {
  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50 p-4"
      data-testid="extraction-error"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-red-600" />
        <span className="text-red-700 font-medium">
          {data.label || 'Error'}
        </span>
      </div>
      {data.error && (
        <p className="mt-2 text-sm text-red-600">{data.error}</p>
      )}
    </div>
  );
}

/**
 * Epic 15 Story 5b: Render scoring result as persistent message component
 * Maps raw component data to ScoringResultData and renders ScoringResultCard
 */
function EmbeddedScoringResult({ data }: { data: Record<string, any> }) {
  // Validate required fields
  if (
    typeof data.compositeScore !== 'number' ||
    typeof data.recommendation !== 'string' ||
    typeof data.overallRiskRating !== 'string' ||
    typeof data.assessmentId !== 'string'
  ) {
    console.warn('[EmbeddedScoringResult] Missing required fields:', data);
    return null;
  }

  // Map raw data to typed ScoringResultData
  const result: ScoringResultData = {
    compositeScore: data.compositeScore,
    recommendation: data.recommendation as Recommendation,
    overallRiskRating: data.overallRiskRating as RiskRating,
    executiveSummary: data.executiveSummary || '',
    keyFindings: Array.isArray(data.keyFindings) ? data.keyFindings : [],
    dimensionScores: Array.isArray(data.dimensionScores)
      ? data.dimensionScores.map((d: DimensionScoreData) => ({
          dimension: d.dimension || '',
          score: typeof d.score === 'number' ? d.score : 0,
          riskRating: (d.riskRating || 'medium') as RiskRating,
        }))
      : [],
    batchId: data.batchId || '',
    assessmentId: data.assessmentId,
  };

  return (
    <div data-testid="scoring-result-component">
      <ScoringResultCard result={result} />
    </div>
  );
}
