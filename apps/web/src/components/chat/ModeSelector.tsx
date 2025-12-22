'use client';

import React, { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type ConversationMode = 'consult' | 'assessment' | 'scoring';

export interface ModeOption {
  value: ConversationMode;
  name: string;
  description: string;
}

export interface ModeSelectorProps {
  selectedMode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
  disabled?: boolean;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: 'consult',
    name: 'Consult',
    description: 'General questions about AI governance',
  },
  {
    value: 'assessment',
    name: 'Assessment',
    description: 'Structured vendor assessment workflow',
  },
  {
    value: 'scoring',
    name: 'Scoring',
    description: 'Score completed questionnaire responses',
  },
];

export function ModeSelector({ selectedMode, onModeChange, disabled = false }: ModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Get current mode display name
  const selectedOption = MODE_OPTIONS.find((opt) => opt.value === selectedMode);
  const displayName = selectedOption?.name || 'Consult';

  const handleModeSelect = (mode: ConversationMode) => {
    onModeChange(mode);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`Mode: ${displayName}`}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span>{displayName}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-64 rounded-xl border border-gray-200 bg-white shadow-xl p-0"
      >
        {/* Header */}
        <div className="px-3 py-2 border-b border-gray-100">
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Mode
          </span>
        </div>

        {/* Mode options */}
        <div className="p-2">
          {MODE_OPTIONS.map((option) => {
            const isSelected = option.value === selectedMode;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleModeSelect(option.value)}
                className={`w-full flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'bg-gray-100'
                    : 'hover:bg-gray-50'
                }`}
                role="option"
                aria-selected={isSelected}
                data-testid={`mode-option-${option.value}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{option.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{option.description}</div>
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" aria-label="Selected" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
