'use client';

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { RecommendationBadge } from './RecommendationBadge';
import { ScoreDashboard } from './ScoreDashboard';
import { DownloadButton } from './DownloadButton';
import { ISOAlignmentSection } from './ISOAlignmentSection';
import { ScoringResultData, RiskRating } from '@/types/scoring';

interface ScoringResultCardProps {
  result: ScoringResultData;
}

const RISK_RATING_COLORS: Record<RiskRating, string> = {
  low: 'text-green-600',
  medium: 'text-amber-600',
  high: 'text-orange-600',
  critical: 'text-red-600',
};

// Keywords to highlight with their corresponding styles
const HIGHLIGHT_PATTERNS: Array<{ pattern: RegExp; className: string }> = [
  { pattern: /\b(CRITICAL|critical)\b/g, className: 'font-semibold text-red-600' },
  { pattern: /\b(HIGH|high)\s*(RISK|risk)?\b/g, className: 'font-semibold text-orange-600' },
  { pattern: /\b(MEDIUM|medium)\s*(RISK|risk)?\b/g, className: 'font-semibold text-amber-600' },
  { pattern: /\b(LOW|low)\s*(RISK|risk)?\b/g, className: 'font-semibold text-green-600' },
  { pattern: /\b(APPROVE[D]?|CONDITIONAL\s*APPROVAL?|DECLINE[D]?)\b/gi, className: 'font-semibold text-purple-600' },
];

/**
 * Split text into paragraphs for better readability
 * Splits on double newlines, or groups sentences if no explicit breaks
 */
function splitIntoParagraphs(text: string): string[] {
  // First try splitting by double newlines
  const byNewlines = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  if (byNewlines.length > 1) {
    return byNewlines;
  }

  // If no explicit paragraphs, split by sentences and group every 2-3
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  if (sentences.length <= 3) {
    return [text];
  }

  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const chunk = sentences.slice(i, i + 2).join(' ').trim();
    if (chunk) paragraphs.push(chunk);
  }
  return paragraphs;
}

/**
 * Highlight risk-related keywords in text
 */
function highlightKeywords(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let keyIndex = 0;

  // Find all matches across all patterns
  const allMatches: Array<{ start: number; end: number; text: string; className: string }> = [];

  for (const { pattern, className } of HIGHLIGHT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      allMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        className,
      });
    }
  }

  // Sort by position and remove overlaps
  allMatches.sort((a, b) => a.start - b.start);
  const filteredMatches = allMatches.filter((match, i) => {
    if (i === 0) return true;
    return match.start >= allMatches[i - 1].end;
  });

  // Build the result
  let lastEnd = 0;
  for (const match of filteredMatches) {
    if (match.start > lastEnd) {
      parts.push(<span key={keyIndex++}>{text.slice(lastEnd, match.start)}</span>);
    }
    parts.push(
      <span key={keyIndex++} className={match.className}>
        {match.text}
      </span>
    );
    lastEnd = match.end;
  }

  if (lastEnd < text.length) {
    parts.push(<span key={keyIndex++}>{text.slice(lastEnd)}</span>);
  }

  return parts.length > 0 ? parts : [<span key={0}>{text}</span>];
}

/**
 * Executive Summary component with formatted paragraphs and highlighted keywords
 */
function FormattedExecutiveSummary({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const paragraphs = useMemo(() => splitIntoParagraphs(text), [text]);
  const isLong = text.length > 400;

  // Show first paragraph only if collapsed and text is long
  const visibleParagraphs = isLong && !isExpanded ? paragraphs.slice(0, 1) : paragraphs;
  const hasMore = isLong && paragraphs.length > 1;

  return (
    <div className="space-y-3">
      {visibleParagraphs.map((paragraph, i) => (
        <p key={i} className="text-gray-700 text-sm leading-relaxed">
          {highlightKeywords(paragraph)}
        </p>
      ))}
      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
        >
          {isExpanded ? (
            <>Show less <ChevronUp className="h-3 w-3" /></>
          ) : (
            <>Show more <ChevronDown className="h-3 w-3" /></>
          )}
        </button>
      )}
    </div>
  );
}

export function ScoringResultCard({
  result,
}: ScoringResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isISOExpanded, setIsISOExpanded] = useState(false);

  const hasISOData = result.dimensionScores.some(
    (d) => d.findings?.isoClauseReferences && d.findings.isoClauseReferences.length > 0
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden" data-testid="scoring-result-card">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <BarChart3 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Risk Assessment Complete</h3>
              <p className="text-sm text-gray-500">10 dimensions analyzed</p>
            </div>
          </div>
          <RecommendationBadge recommendation={result.recommendation} size="lg" data-testid="recommendation" />
        </div>
      </div>

      {/* Composite Score */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Composite Score</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-gray-900" data-testid="composite-score">{result.compositeScore}</span>
              <span className="text-lg text-gray-400">/100</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Overall Risk</p>
            <p className={`text-lg font-semibold capitalize ${RISK_RATING_COLORS[result.overallRiskRating]}`} data-testid="overall-risk">
              {result.overallRiskRating}
            </p>
          </div>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="px-6 py-4 border-b border-gray-100">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Executive Summary</h4>
        <FormattedExecutiveSummary text={result.executiveSummary} />
      </div>

      {/* Key Findings */}
      {result.keyFindings.length > 0 && (
        <div className="px-6 py-4 border-b border-gray-100">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Key Findings</h4>
          <ul className="space-y-1">
            {result.keyFindings.map((finding, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-purple-500">•</span>
                {finding}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dimension Scores (Collapsible) */}
      <div className="border-b border-gray-100">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-semibold text-gray-900">Dimension Scores</span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </button>
        {isExpanded && (
          <div className="px-6 pb-4">
            <ScoreDashboard dimensionScores={result.dimensionScores} />
          </div>
        )}
      </div>

      {/* ISO Alignment (Collapsible) */}
      {hasISOData && (
        <div className="border-b border-gray-100">
          <button
            onClick={() => setIsISOExpanded(!isISOExpanded)}
            className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            data-testid="iso-alignment-toggle"
          >
            <span className="text-sm font-semibold text-gray-900">ISO Standards Alignment</span>
            {isISOExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
          </button>
          {isISOExpanded && (
            <div className="px-6 pb-4">
              <ISOAlignmentSection dimensionScores={result.dimensionScores} />
            </div>
          )}
        </div>
      )}

      {/* Export Actions */}
      <div className="px-6 py-4 bg-gray-50 flex gap-3">
        <DownloadButton
          assessmentId={result.assessmentId}
          batchId={result.batchId}
          format="pdf"
          exportType="scoring"
          label="Export PDF"
        />
        <DownloadButton
          assessmentId={result.assessmentId}
          batchId={result.batchId}
          format="word"
          exportType="scoring"
          label="Export Word"
        />
        {/* Excel removed per Epic 32.2 - backend sends it but UI removed Excel support */}
      </div>
    </div>
  );
}
