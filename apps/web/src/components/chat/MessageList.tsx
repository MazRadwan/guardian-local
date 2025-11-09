'use client';

import React, { useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatMessage as ChatMessageType } from '@/lib/websocket';

export interface MessageListProps {
  messages: ChatMessageType[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  return (
    <div className="scrollbar-hide flex flex-col overflow-y-auto">
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
        <div className="flex gap-3 px-4 py-6">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600">
            <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
          </div>
          <div className="flex items-center text-sm text-gray-500">
            <span className="animate-pulse">Guardian is typing...</span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
