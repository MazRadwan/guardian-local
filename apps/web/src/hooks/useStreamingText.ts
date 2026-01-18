'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Options for useStreamingText hook
 */
export interface UseStreamingTextOptions {
  /** The full text to stream */
  text: string;
  /** Characters per second (default: 40) */
  speed?: number;
  /** Callback when streaming completes */
  onComplete?: () => void;
  /** Whether streaming is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Return type for useStreamingText hook
 */
export interface UseStreamingTextResult {
  /** Current displayed text (progressively revealed) */
  displayedText: string;
  /** Whether streaming is currently in progress */
  isStreaming: boolean;
  /** Whether streaming has completed */
  isComplete: boolean;
}

/**
 * useStreamingText - Simulates streaming text display
 *
 * Story 24.5: Used to make mode switch guidance messages stream in
 * progressively like regular Claude responses instead of appearing instantly.
 *
 * @param options - Configuration options
 * @returns Object with displayedText, isStreaming, and isComplete
 *
 * @example
 * ```tsx
 * const { displayedText, isStreaming, isComplete } = useStreamingText({
 *   text: 'Hello, world!',
 *   speed: 40,
 *   onComplete: () => console.log('Done!'),
 * });
 *
 * return <p>{displayedText}</p>;
 * ```
 */
export function useStreamingText({
  text,
  speed = 40,
  onComplete,
  enabled = true,
}: UseStreamingTextOptions): UseStreamingTextResult {
  const [displayedText, setDisplayedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const indexRef = useRef(0);
  const onCompleteRef = useRef(onComplete);

  // Keep onComplete ref updated to avoid stale closures
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // If disabled, show full text immediately
    if (!enabled) {
      setDisplayedText(text);
      setIsStreaming(false);
      return;
    }

    // If no text, reset state
    if (!text) {
      setDisplayedText('');
      setIsStreaming(false);
      return;
    }

    // Start streaming
    setIsStreaming(true);
    indexRef.current = 0;
    setDisplayedText('');

    // Calculate interval (ms per character)
    const intervalMs = 1000 / speed;

    const timer = setInterval(() => {
      indexRef.current += 1;
      const newText = text.slice(0, indexRef.current);
      setDisplayedText(newText);

      // Check if complete
      if (indexRef.current >= text.length) {
        clearInterval(timer);
        setIsStreaming(false);
        onCompleteRef.current?.();
      }
    }, intervalMs);

    // Cleanup on unmount or text change
    return () => clearInterval(timer);
  }, [text, speed, enabled]);

  // Compute isComplete
  const isComplete = !isStreaming && displayedText === text && text.length > 0;

  return { displayedText, isStreaming, isComplete };
}

/**
 * Skip to end of streaming - useful for user interaction (e.g., clicking to show all)
 * This is a convenience hook that wraps useStreamingText with skip functionality.
 */
export function useStreamingTextWithSkip(options: UseStreamingTextOptions) {
  const [skipToEnd, setSkipToEnd] = useState(false);

  // Compute enabled: if skip is requested, disable streaming (shows full text)
  // Default enabled to true if not provided
  const effectiveEnabled = (options.enabled ?? true) && !skipToEnd;

  const result = useStreamingText({
    ...options,
    enabled: effectiveEnabled,
  });

  const skip = useCallback(() => {
    setSkipToEnd(true);
  }, []);

  // Reset skip when text changes
  useEffect(() => {
    setSkipToEnd(false);
  }, [options.text]);

  return {
    ...result,
    skip,
    skipped: skipToEnd,
  };
}
