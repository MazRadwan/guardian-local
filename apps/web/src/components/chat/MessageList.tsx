'use client';

import React, { useEffect, useRef, forwardRef, useState } from 'react';
import { ChatMessage } from './ChatMessage';
import { SkeletonMessage } from './SkeletonMessage';
import { ChatMessage as ChatMessageType } from '@/lib/websocket';
import { ChevronDown } from 'lucide-react';

export interface MessageListProps {
  messages: ChatMessageType[];
  isLoading?: boolean;
  isStreaming?: boolean;
  onRegenerate?: (messageIndex: number) => void;
  regeneratingMessageIndex?: number | null;
}

export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
  function MessageList({ messages, isLoading, isStreaming, onRegenerate, regeneratingMessageIndex }, ref) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }, [messages]);

    // Continuous auto-scroll during streaming (keeps latest token visible above composer)
    useEffect(() => {
      if (!isStreaming || messages.length === 0) return;

      // During streaming, continuously scroll to bottom to keep latest tokens visible
      const scrollInterval = setInterval(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 50); // Scroll every 50ms during streaming for smooth tracking

      return () => clearInterval(scrollInterval);
    }, [isStreaming, messages.length]);

    // Handle scroll position to show/hide scroll-to-bottom button
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const element = e.currentTarget;
      const isAtBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 50;
      setShowScrollButton(!isAtBottom);
    };

    // Scroll to bottom when button clicked
    const handleScrollToBottom = () => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    };

    if (messages.length === 0 && !isLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">Welcome to Guardian</h2>
            <p className="mt-2 text-gray-600">
              Start a conversation to assess AI vendors or get guidance.
            </p>
          </div>
        </div>
      );
    }

    // Show skeleton loaders while loading history
    if (messages.length === 0 && isLoading) {
      return (
        <div className="flex h-full flex-col overflow-y-auto px-4 py-6">
          <SkeletonMessage />
          <SkeletonMessage />
          <SkeletonMessage />
        </div>
      );
    }

    return (
      <div
        ref={ref || scrollContainerRef}
        className="relative flex h-full min-h-0 flex-col overflow-y-auto scroll-smooth"
        onScroll={handleScroll}
      >
        {/* Centered content container (max-w-3xl = 768px) */}
        <div className="max-w-3xl mx-auto w-full px-4 py-6">
          {messages.map((message, index) => (
            <ChatMessage
              key={message.id || `msg-${index}`}
              role={message.role}
              content={message.content}
              components={message.components}
              timestamp={message.timestamp}
              messageIndex={index}
              onRegenerate={onRegenerate}
              isRegenerating={regeneratingMessageIndex === index}
            />
          ))}
          {isLoading && (
            <div data-testid="typing-indicator" className="flex gap-3 py-6">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                </svg>
              </div>
              <div className="flex items-center gap-1 py-2">
                <span
                  className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                  style={{ animationDelay: '0ms', animationDuration: '1s' }}
                ></span>
                <span
                  className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                  style={{ animationDelay: '150ms', animationDuration: '1s' }}
                ></span>
                <span
                  className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                  style={{ animationDelay: '300ms', animationDuration: '1s' }}
                ></span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Scroll-to-bottom button */}
        {showScrollButton && (
          <button
            onClick={handleScrollToBottom}
            className="absolute bottom-6 right-6 rounded-full bg-purple-600 text-white hover:bg-purple-700 shadow-lg transition-all p-2"
            aria-label="Scroll to bottom"
            title="Scroll to latest message"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        )}
      </div>
    );
  }
);
