'use client';

import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import { Recommendation } from '@/types/scoring';

interface RecommendationBadgeProps {
  recommendation: Recommendation;
  size?: 'sm' | 'md' | 'lg';
  'data-testid'?: string;
}

const RECOMMENDATION_CONFIG: Record<Recommendation, {
  label: string;
  icon: React.ReactNode;
  className: string;
}> = {
  approve: {
    label: 'Approved',
    icon: <CheckCircle className="h-5 w-5" />,
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  conditional: {
    label: 'Conditional',
    icon: <AlertTriangle className="h-5 w-5" />,
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  decline: {
    label: 'Declined',
    icon: <XCircle className="h-5 w-5" />,
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  more_info: {
    label: 'More Info Needed',
    icon: <HelpCircle className="h-5 w-5" />,
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
};

const SIZE_CLASSES = {
  sm: 'px-2 py-1 text-xs gap-1',
  md: 'px-3 py-1.5 text-sm gap-2',
  lg: 'px-4 py-2 text-base gap-2',
};

export function RecommendationBadge({ recommendation, size = 'md', 'data-testid': testId }: RecommendationBadgeProps) {
  const config = RECOMMENDATION_CONFIG[recommendation];

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border ${config.className} ${SIZE_CLASSES[size]}`}
      data-testid={testId}
    >
      {config.icon}
      {config.label}
    </span>
  );
}
