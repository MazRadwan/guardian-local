import { useEffect, useState } from 'react';

/**
 * Hook to delay showing loading state until a threshold is reached.
 * This prevents jarring flashes for fast operations.
 *
 * @param isLoading - The actual loading state
 * @param delay - Delay in ms before showing loading state (default: 300ms)
 * @returns Boolean indicating whether to show loading UI
 */
export function useDelayedLoading(isLoading: boolean, delay: number = 300): boolean {
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      // Immediately hide loading state when done
      setShowLoading(false);
      return;
    }

    // Set a timeout to show loading state after delay
    const timeout = setTimeout(() => {
      setShowLoading(true);
    }, delay);

    // Cleanup: If loading completes before delay, cancel the timeout
    return () => clearTimeout(timeout);
  }, [isLoading, delay]);

  return showLoading;
}
