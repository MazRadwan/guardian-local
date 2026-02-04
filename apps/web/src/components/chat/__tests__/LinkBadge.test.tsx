import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LinkBadge } from '../LinkBadge';

describe('LinkBadge', () => {
  it('renders domain from URL', () => {
    render(<LinkBadge href="https://www.example.com/article">Example Article</LinkBadge>);

    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('removes www. prefix from domain', () => {
    render(<LinkBadge href="https://www.medscape.com/article/123">Medscape Article</LinkBadge>);

    expect(screen.getByText('medscape.com')).toBeInTheDocument();
  });

  it('renders external link icon', () => {
    render(<LinkBadge href="https://example.com">Test</LinkBadge>);

    // Lucide icons have role="img" or we can check for svg
    const link = screen.getByRole('link');
    const svg = link.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('opens link in new tab', () => {
    render(<LinkBadge href="https://example.com">Test</LinkBadge>);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows hover card on hover', async () => {
    const user = userEvent.setup();
    render(<LinkBadge href="https://example.com/article/123">Full Article Title Here</LinkBadge>);

    const trigger = screen.getByRole('link');
    await user.hover(trigger);

    // Wait for hover card to appear (200ms delay)
    // The title should appear in the hover card
    // Note: HoverCard uses portals, so we need to wait
    await screen.findByText('Full Article Title Here', {}, { timeout: 500 });
  });

  it('truncates long domains', () => {
    render(<LinkBadge href="https://very-long-subdomain.example.com">Test</LinkBadge>);

    const link = screen.getByRole('link');
    // Check that the domain container has truncate class
    const domainSpan = link.querySelector('.truncate');
    expect(domainSpan).toBeInTheDocument();
  });

  it('handles invalid URLs gracefully', () => {
    render(<LinkBadge href="not-a-valid-url">Test Link</LinkBadge>);

    // Should not crash, will show truncated URL as fallback
    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
  });

  it('uses correct styling for badge', () => {
    render(<LinkBadge href="https://example.com">Test</LinkBadge>);

    const link = screen.getByRole('link');
    expect(link).toHaveClass('bg-slate-100');
    expect(link).toHaveClass('rounded-md');
    expect(link).toHaveClass('no-underline');
  });
});
