'use client';

import React, { useState, useMemo } from 'react';
import { ChevronDown, Check, MessageSquare, ClipboardList, BarChart3 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type ConversationMode = 'consult' | 'assessment' | 'scoring';

export interface ModeOption {
  value: ConversationMode;
  name: string;
  description: string;
  icon: React.ReactNode;
}

export interface ModeSelectorProps {
  selectedMode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
  disabled?: boolean;
  // NOTE: hasIncompleteFiles removed in Epic 19 Story 19.0.2
  // Per behavior-matrix.md, no warning triangle on ModeSelector
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: 'consult',
    name: 'Consult',
    description: 'General questions about AI governance',
    icon: <MessageSquare className="h-4 w-4" />,
  },
  {
    value: 'assessment',
    name: 'Assessment',
    description: 'Structured vendor assessment workflow',
    icon: <ClipboardList className="h-4 w-4" />,
  },
  {
    value: 'scoring',
    name: 'Scoring',
    description: 'Score completed questionnaire responses',
    icon: <BarChart3 className="h-4 w-4" />,
  },
];

export function ModeSelector({
  selectedMode,
  onModeChange,
  disabled = false,
}: ModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = MODE_OPTIONS.find((opt) => opt.value === selectedMode);

  // All modes always available - Scoring visible regardless of export status
  // (users may return days later to score returned questionnaires)
  const availableModes = MODE_OPTIONS;

  const handleModeSelect = (mode: ConversationMode) => {
    onModeChange(mode);
    setIsOpen(false);
  };

  // Color based on mode
  const modeColors: Record<ConversationMode, string> = {
    consult: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
    assessment: 'bg-green-50 text-green-700 hover:bg-green-100',
    scoring: 'bg-purple-50 text-purple-700 hover:bg-purple-100',
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${modeColors[selectedMode]}`}
          aria-label={`Mode: ${selectedOption?.name}`}
        >
          {selectedOption?.icon}
          <span>{selectedOption?.name}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-72 p-0 z-[100] bg-white shadow-lg border border-gray-200 rounded-lg">
        <div className="px-3 py-2 border-b border-gray-100">
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Mode</span>
        </div>
        <div className="p-2">
          {availableModes.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleModeSelect(option.value)}
              className={`w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                option.value === selectedMode ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
              data-testid={`mode-option-${option.value}`}
              role="option"
              aria-selected={option.value === selectedMode}
            >
              {option.icon && <span className="mt-0.5 text-gray-500">{option.icon}</span>}
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{option.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{option.description}</div>
              </div>
              {option.value === selectedMode && (
                <Check className="h-4 w-4 text-blue-600 mt-0.5" aria-label="Selected" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
