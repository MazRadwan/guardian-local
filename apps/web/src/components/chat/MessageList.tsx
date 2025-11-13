'use client';

import React, { useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { SkeletonMessage } from './SkeletonMessage';
import { ChatMessage as ChatMessageType } from '@/lib/websocket';

export interface MessageListProps {
  messages: ChatMessageType[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

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
    <div ref={scrollContainerRef} className="flex h-full min-h-0 flex-col overflow-y-auto">
      {/* Centered content container (max-w-3xl = 768px) */}
      <div className="max-w-3xl mx-auto w-full px-4 py-6">
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id || `msg-${index}`}
            role={message.role}
            content={message.content}
            components={message.components}
            timestamp={message.timestamp}
          />
        ))}
        {isLoading && (
          <div data-testid="typing-indicator" className="flex gap-3 py-6">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              </svg>
            </div>
            <div className="flex items-center gap-1 py-2">
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}></span>
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }}></span>
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }}></span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
