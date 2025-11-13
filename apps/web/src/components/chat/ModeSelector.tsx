'use client';

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export type ConversationMode = 'consult' | 'assessment';

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
];

export function ModeSelector({ selectedMode, onModeChange, disabled = false }: ModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Get current mode display name
  const selectedOption = MODE_OPTIONS.find((opt) => opt.value === selectedMode);
  const displayName = selectedOption?.name || 'Consult';

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!isOpen && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setIsOpen(true);
      setFocusedIndex(MODE_OPTIONS.findIndex((opt) => opt.value === selectedMode));
      return;
    }

    if (isOpen) {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setFocusedIndex(-1);
          buttonRef.current?.focus();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % MODE_OPTIONS.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + MODE_OPTIONS.length) % MODE_OPTIONS.length);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0) {
            handleModeSelect(MODE_OPTIONS[focusedIndex].value);
          }
          break;
      }
    }
  };

  const handleModeSelect = (mode: ConversationMode) => {
    onModeChange(mode);
    setIsOpen(false);
    setFocusedIndex(-1);
    buttonRef.current?.focus();
  };

  return (
    <div className="relative">
      {/* Pillbox badge button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
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

      {/* Dropdown menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setIsOpen(false);
              setFocusedIndex(-1);
            }}
            aria-hidden="true"
            data-testid="mode-selector-backdrop"
          />

          {/* Popover */}
          <div
            ref={dropdownRef}
            className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-gray-200 bg-white shadow-xl z-50"
            role="listbox"
            aria-label="Select conversation mode"
          >
            {/* Header */}
            <div className="px-3 py-2 border-b border-gray-100">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Mode
              </span>
            </div>

            {/* Mode options */}
            <div className="p-2">
              {MODE_OPTIONS.map((option, index) => {
                const isSelected = option.value === selectedMode;
                const isFocused = index === focusedIndex;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleModeSelect(option.value)}
                    className={`w-full flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-gray-100'
                        : isFocused
                        ? 'bg-gray-50'
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
          </div>
        </>
      )}
    </div>
  );
}
