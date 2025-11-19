'use client';

import React, { useEffect, useRef, forwardRef, useState, useCallback } from 'react';
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
    const [isNearBottom, setIsNearBottom] = useState(true);

    // Merged ref callback to ensure both parent ref and local ref point to same DOM node
    const mergedRef = useCallback((node: HTMLDivElement | null) => {
      scrollContainerRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    }, [ref]);

    // IntersectionObserver to track if user is near bottom
    useEffect(() => {
      const container = scrollContainerRef.current;
      const sentinel = bottomRef.current;

      if (!container || !sentinel) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          const nearBottom = entry.isIntersecting;
          setIsNearBottom(nearBottom);

          // Show button only if: NOT near bottom AND has overflow content
          const hasOverflow = container.scrollHeight > container.clientHeight;
          setShowScrollButton(!nearBottom && hasOverflow);
        },
        {
          root: container,  // Observe within the scroll container
          threshold: 0.1,   // Trigger when 10% of sentinel is visible
        }
      );

      observer.observe(sentinel);

      return () => observer.disconnect();
    }, [messages.length]); // Re-observe when messages change

    // Use useLayoutEffect for synchronous scroll updates to prevent visual lag (text going behind composer)
    React.useLayoutEffect(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      // If we are streaming OR if we were already near bottom, force scroll to bottom immediately
      if (isStreaming || isNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }, [messages, isStreaming, isNearBottom]);

    // Scroll to bottom when button clicked
    const handleScrollToBottom = () => {
      const sentinel = bottomRef.current;
      const container = scrollContainerRef.current;

      // Use scrollIntoView for smooth scroll
      if (sentinel) {
        sentinel.scrollIntoView({ behavior: 'smooth' });
      } else if (container) {
        container.scrollTop = container.scrollHeight;
      }

      // Immediately hide button (don't wait for scroll event)
      setShowScrollButton(false);
      setIsNearBottom(true);
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
      <div className="relative flex h-full min-h-0 flex-col">
        {/* Inner scroll container */}
        <div
          ref={mergedRef}
          className="flex-1 overflow-y-auto"
        >
          {/* Centered content container (max-w-3xl = 768px) */}
          <div className="max-w-3xl mx-auto w-full px-4 py-6 pb-6">
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
        </div>

        {/* Scroll-to-bottom button - ChatGPT Style (Centered, Floating) */}
        {showScrollButton && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center z-20 pointer-events-none">
            <button
              onClick={handleScrollToBottom}
              className="h-8 w-8 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-md text-gray-600 hover:bg-gray-50 transition-all cursor-pointer pointer-events-auto"
              aria-label="Scroll to bottom"
              title="Scroll to latest message"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  }
);
