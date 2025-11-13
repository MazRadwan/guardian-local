'use client';

import React, { useState, useRef, useEffect, KeyboardEvent, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Paperclip } from 'lucide-react';
import { ModeSelector, ConversationMode } from './ModeSelector';

export interface ComposerProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  currentMode?: ConversationMode;
  onModeChange?: (mode: ConversationMode) => void;
  modeChangeDisabled?: boolean;
}

export interface ComposerRef {
  focus: () => void;
}

export const Composer = forwardRef<ComposerRef, ComposerProps>(
  (
    {
      onSendMessage,
      disabled = false,
      placeholder = 'Type a message...',
      currentMode = 'consult',
      onModeChange,
      modeChangeDisabled = false,
    },
    ref
  ) => {
    const [message, setMessage] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Expose focus method to parent
    useImperativeHandle(ref, () => ({
      focus: () => {
        textareaRef.current?.focus();
      },
    }));

    // Auto-resize textarea based on content
    useEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // Reset height to auto to get correct scrollHeight
      textarea.style.height = 'auto';

      // Calculate new height (min 60px, max 200px)
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 60), 200);
      textarea.style.height = `${newHeight}px`;
    }, [message]);

    const handleSend = () => {
      const trimmedMessage = message.trim();
      if (!trimmedMessage || disabled) return;

      onSendMessage(trimmedMessage);
      setMessage('');

      // Reset textarea height after sending
      if (textareaRef.current) {
        textareaRef.current.style.height = '60px';
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter without Shift sends message
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      // Shift+Enter creates new line (default behavior, no action needed)
    };

    const isSendEnabled = message.trim().length > 0 && !disabled;

    return (
      <div className="bg-white p-4">
        {/* Centered composer container */}
        <div className="max-w-3xl mx-auto">
          {/* Elevated composer box */}
          <div className="border border-gray-200 rounded-2xl shadow-lg bg-white overflow-hidden">
            {/* Textarea section (top) */}
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className="w-full resize-none border-0 px-4 pt-4 pb-2 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 disabled:bg-gray-50 disabled:text-gray-500"
              style={{ minHeight: '60px', maxHeight: '200px' }}
              aria-label="Message input"
            />

            {/* Toolbar section (bottom) */}
            <div className="flex items-center justify-between px-4 pb-3 pt-1">
              {/* Left group: Mode selector + File upload button */}
              <div className="flex items-center gap-2">
                {/* Mode Selector */}
                {onModeChange && (
                  <ModeSelector
                    selectedMode={currentMode}
                    onModeChange={onModeChange}
                    disabled={disabled || modeChangeDisabled}
                  />
                )}

                {/* File upload button (stub for now) */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-gray-500 hover:bg-gray-100 rounded-lg"
                  disabled={disabled}
                  aria-label="Attach file"
                  onClick={() => {
                    // Stub - file upload functionality deferred
                    console.log('File upload clicked (not yet implemented)');
                  }}
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
              </div>

              {/* Right group: Send button */}
              <Button
                type="button"
                onClick={handleSend}
                disabled={!isSendEnabled}
                className="h-8 w-8 rounded-full p-0 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-700 text-white"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

Composer.displayName = 'Composer';
