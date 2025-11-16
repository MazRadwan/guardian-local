'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { User, Bot, Copy, Check } from 'lucide-react';

export interface MessageComponent {
  type: 'button' | 'link' | 'form';
  data: Record<string, any>;
}

export interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  components?: MessageComponent[];
  timestamp?: Date;
  className?: string;
}

export function ChatMessage({
  role,
  content,
  components = [],
  timestamp,
  className,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  // Copy to clipboard state
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      // Reset after 2 seconds
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  return (
    <div
      className={cn(
        'flex w-full gap-3 px-4 py-6',
        isUser ? 'bg-gray-50' : 'bg-white',
        className
      )}
      role="article"
      aria-label={`${role} message`}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-blue-600' : 'bg-purple-600'
        )}
      >
        {isUser ? (
          <User className="h-5 w-5 text-white" aria-hidden="true" />
        ) : (
          <Bot className="h-5 w-5 text-white" aria-hidden="true" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 space-y-3">
        {/* Role label */}
        <div className="text-sm font-semibold text-gray-900">
          {isUser ? 'You' : isSystem ? 'System' : 'Guardian'}
        </div>

        {/* Message content */}
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>

        {/* Embedded components */}
        {components.length > 0 && (
          <div className="mt-4 space-y-2">
            {components.map((component, index) => (
              <EmbeddedComponent key={index} component={component} />
            ))}
          </div>
        )}

        {/* Timestamp */}
        {timestamp && (
          <div className="text-xs text-gray-500" aria-label="Message timestamp">
            {new Date(timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}

        {/* Copy Button - Assistant Messages Only */}
        {!isUser && !isSystem && (
          <button
            onClick={handleCopy}
            className="mt-2 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
            aria-label={isCopied ? 'Copied to clipboard' : 'Copy message'}
            title={isCopied ? 'Copied!' : 'Copy to clipboard'}
          >
            {isCopied ? (
              <>
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-green-600 font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>Copy</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function EmbeddedComponent({ component }: { component: MessageComponent }) {
  switch (component.type) {
    case 'button':
      return <EmbeddedButton data={component.data} />;
    case 'link':
      return <EmbeddedLink data={component.data} />;
    case 'form':
      return <EmbeddedForm data={component.data} />;
    default:
      return null;
  }
}

function EmbeddedButton({ data }: { data: Record<string, any> }) {
  const handleClick = () => {
    // Emit custom event that parent can listen to
    window.dispatchEvent(
      new CustomEvent('chat:action', {
        detail: { action: data.action, payload: data.payload },
      })
    );
  };

  return (
    <button
      onClick={handleClick}
      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      {data.label}
    </button>
  );
}

function EmbeddedLink({ data }: { data: Record<string, any> }) {
  return (
    <a
      href={data.url}
      target={data.target || '_blank'}
      rel="noopener noreferrer"
      className="text-blue-600 underline hover:text-blue-800"
    >
      {data.label}
    </a>
  );
}

function EmbeddedForm({ data }: { data: Record<string, any> }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-700">{data.description}</p>
      {/* Form fields would go here - placeholder for now */}
    </div>
  );
}
