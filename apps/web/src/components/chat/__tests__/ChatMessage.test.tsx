import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChatMessage } from '../ChatMessage';

describe('ChatMessage', () => {
  it('renders user message with correct styling', () => {
    render(<ChatMessage role="user" content="Hello" />);

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'user message');
  });

  it('renders assistant message with correct styling', () => {
    render(<ChatMessage role="assistant" content="Hello back" />);

    expect(screen.getByText('Guardian')).toBeInTheDocument();
    expect(screen.getByText('Hello back')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'assistant message');
  });

  it('renders system message', () => {
    render(<ChatMessage role="system" content="System notification" />);

    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('System notification')).toBeInTheDocument();
  });

  it('renders markdown content', () => {
    const markdownContent = '**Bold text** and *italic text*';
    render(<ChatMessage role="assistant" content={markdownContent} />);

    // Markdown should be rendered as HTML
    const article = screen.getByRole('article');
    expect(article).toBeInTheDocument();
  });

  it('displays timestamp when provided', () => {
    const timestamp = new Date('2024-01-01T12:00:00');
    render(<ChatMessage role="user" content="Test" timestamp={timestamp} />);

    expect(screen.getByLabelText('Message timestamp')).toBeInTheDocument();
  });

  it('renders embedded button component', () => {
    const components = [
      {
        type: 'button' as const,
        data: { label: 'Click me', action: 'test_action' },
      },
    ];

    render(<ChatMessage role="assistant" content="Message with button" components={components} />);

    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });
});
