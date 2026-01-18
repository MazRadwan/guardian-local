/**
 * ProgressMessage Component Tests
 * Epic 18 Story 18.2.5
 * Story 24.2: Smooth transitions
 * Story 24.3: "This Will Take a Minute" animation
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { ProgressMessage } from '../ProgressMessage';
import type { ScoringStatus } from '@/types/scoring';

// Mock matchMedia for reduced motion tests
const mockMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
};

describe('ProgressMessage', () => {
  beforeEach(() => {
    mockMatchMedia(false); // Default: motion enabled
  });

  it('should render with parsing status', () => {
    render(
      <ProgressMessage
        status="parsing"
        progress={35}
        message="Analyzing questionnaire responses..."
      />
    );

    expect(screen.getByText('Analyzing questionnaire responses...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '35');
  });

  it('should render with scoring status', () => {
    render(
      <ProgressMessage
        status="scoring"
        progress={70}
        message="Scoring AI Ethics & Bias..."
      />
    );

    expect(screen.getByText('Scoring AI Ethics & Bias...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70');
  });

  it('should render spinner icon for active states', () => {
    const { container } = render(
      <ProgressMessage
        status="parsing"
        progress={50}
        message="Processing..."
      />
    );

    // Loader2 icon has animate-spin class
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should render checkmark icon for complete status', () => {
    const { container } = render(
      <ProgressMessage
        status="complete"
        message="Scoring complete!"
      />
    );

    // CheckCircle icon (no animate-spin)
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).not.toBeInTheDocument();

    // Verify message is still rendered
    expect(screen.getByText('Scoring complete!')).toBeInTheDocument();
  });

  it('should not render progress bar when progress is undefined', () => {
    render(
      <ProgressMessage
        status="parsing"
        message="Initializing..."
      />
    );

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('should not render progress bar when status is complete', () => {
    render(
      <ProgressMessage
        status="complete"
        progress={100}
        message="Done!"
      />
    );

    // No progress bar for complete status
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('should have accessible ARIA labels', () => {
    render(
      <ProgressMessage
        status="scoring"
        progress={60}
        message="Scoring dimension 6/10..."
      />
    );

    const container = screen.getByRole('status');
    expect(container).toHaveAttribute('aria-live', 'polite');

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-label', 'Progress: 60%');
  });

  // Story 24.2: Smooth transition tests
  it('should render with smooth transitions for message changes', () => {
    const { rerender } = render(
      <ProgressMessage status="parsing" message="First message" />
    );

    expect(screen.getByText('First message')).toHaveClass('transition-all');
    expect(screen.getByText('First message')).toHaveClass('duration-300');

    rerender(<ProgressMessage status="scoring" message="Second message" />);
    expect(screen.getByText('Second message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toHaveClass('transition-all');
  });

  it('should have transition classes for smooth updates', () => {
    render(
      <ProgressMessage
        status="parsing"
        progress={25}
        message="Extracting responses..."
      />
    );

    const messageElement = screen.getByText('Extracting responses...');
    expect(messageElement).toHaveClass('transition-all', 'duration-300');
  });
});

// Story 24.3: "This Will Take a Minute" Animation Tests
describe('ProgressMessage wait animation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockMatchMedia(false); // Motion enabled
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should show original message initially', () => {
    render(<ProgressMessage status="scoring" message="Analyzing..." />);
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
  });

  it('should show wait message after 5 seconds', () => {
    render(<ProgressMessage status="scoring" message="Analyzing..." />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(screen.getByText('This may take a minute...')).toBeInTheDocument();
  });

  it('should alternate between messages every 3 seconds', () => {
    render(<ProgressMessage status="scoring" message="Analyzing..." />);

    act(() => {
      jest.advanceTimersByTime(5000); // Show wait message
    });
    expect(screen.getByText('This may take a minute...')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3000); // Alternate back
    });
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3000); // Alternate again
    });
    expect(screen.getByText('This may take a minute...')).toBeInTheDocument();
  });

  it('should reset timer when status changes', () => {
    const { rerender } = render(<ProgressMessage status="parsing" message="Parsing..." />);

    act(() => {
      jest.advanceTimersByTime(4000); // Almost 5 seconds
    });

    rerender(<ProgressMessage status="scoring" message="Scoring..." />);

    act(() => {
      jest.advanceTimersByTime(2000); // Only 2 seconds in new status
    });
    expect(screen.getByText('Scoring...')).toBeInTheDocument();
    expect(screen.queryByText('This may take a minute...')).not.toBeInTheDocument();
  });

  it('should not show wait message when complete', () => {
    render(<ProgressMessage status="complete" message="Done!" />);

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(screen.getByText('Done!')).toBeInTheDocument();
    expect(screen.queryByText('This may take a minute...')).not.toBeInTheDocument();
  });

  it('should not show wait message when error', () => {
    render(<ProgressMessage status="error" message="Error occurred" />);

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(screen.getByText('Error occurred')).toBeInTheDocument();
    expect(screen.queryByText('This may take a minute...')).not.toBeInTheDocument();
  });

  it('should show clock icon when wait message is displayed', () => {
    const { container } = render(<ProgressMessage status="scoring" message="Analyzing..." />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // Check that spinner is not present (Clock icon doesn't have animate-spin)
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).not.toBeInTheDocument();

    // Check that sky-500 color is present (Clock icon color)
    const clockIcon = container.querySelector('.text-sky-500');
    expect(clockIcon).toBeInTheDocument();
  });

  it('should have shimmer animation classes when showing wait message', () => {
    render(<ProgressMessage status="scoring" message="Analyzing..." />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    const waitMessage = screen.getByText('This may take a minute...');
    expect(waitMessage).toHaveClass('animate-shimmer');
    expect(waitMessage).toHaveClass('bg-gradient-to-r');
  });

  it('should respect prefers-reduced-motion', () => {
    mockMatchMedia(true); // Reduced motion enabled

    render(<ProgressMessage status="scoring" message="Analyzing..." />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    const waitMessage = screen.getByText('This may take a minute...');
    // Should not have shimmer animation when reduced motion is preferred
    expect(waitMessage).not.toHaveClass('animate-shimmer');
    expect(waitMessage).toHaveClass('text-gray-900');
  });
});
