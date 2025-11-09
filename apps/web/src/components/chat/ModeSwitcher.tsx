'use client';

import React from 'react';
import { Select } from '@/components/ui/select';
import { MessageSquare, ClipboardCheck } from 'lucide-react';

export type ConversationMode = 'consult' | 'assessment';

export interface ModeSwitcherProps {
  currentMode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
  disabled?: boolean;
}

export function ModeSwitcher({ currentMode, onModeChange, disabled }: ModeSwitcherProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onModeChange(e.target.value as ConversationMode);
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="mode-select" className="sr-only">
        Conversation Mode
      </label>
      <div className="flex items-center gap-2 text-sm text-gray-600">
        {currentMode === 'consult' ? (
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">Mode:</span>
      </div>
      <Select
        id="mode-select"
        value={currentMode}
        onChange={handleChange}
        disabled={disabled}
        className="w-40"
        aria-label="Select conversation mode"
      >
        <option value="consult">Consult</option>
        <option value="assessment">Assessment</option>
      </Select>
    </div>
  );
}
