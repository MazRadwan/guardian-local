'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Messages to cycle through in the welcome screen.
 * The first message is shown immediately, then we cycle through the rest with a typing effect.
 */
const WELCOME_MESSAGES = [
  'Start a conversation to assess AI vendors or get guidance.',
  'Select Assessment mode to evaluate AI vendors...',
  'Upload a completed questionnaire in Scoring mode...',
  'Ask questions about AI governance in Consult mode...',
  'Generate questionnaires tailored to your vendor...',
];

/**
 * Configuration for the typing animation
 */
const CONFIG = {
  /** Characters per second for typing effect */
  TYPING_SPEED: 50,
  /** How long to display each message before transitioning (ms) */
  DISPLAY_DURATION: 4000,
  /** How long to wait before starting to cycle (ms) */
  INITIAL_DELAY: 5000,
  /** Fade transition duration (ms) */
  FADE_DURATION: 300,
};

interface TypingWelcomeProps {
  /** Optional className for the container */
  className?: string;
}

/**
 * TypingWelcome - Displays cycling welcome messages with typing effect
 *
 * Types out the first message on mount, then cycles through mode-specific
 * suggestions with a typewriter effect. Respects prefers-reduced-motion.
 */
export function TypingWelcome({ className = '' }: TypingWelcomeProps) {
  // Start with empty text - will type out first message on mount
  const [displayedText, setDisplayedText] = useState('');
  const [isFading, setIsFading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  // Use refs for mutable state that shouldn't trigger re-renders
  const messageIndexRef = useRef(0);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cycleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fadeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Clear all timers helper
  const clearAllTimers = () => {
    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
  };

  // Type out a message character by character
  const typeMessage = (message: string, onComplete: () => void) => {
    if (prefersReducedMotion) {
      setDisplayedText(message);
      onComplete();
      return;
    }

    setIsTyping(true);
    let charIndex = 0;
    setDisplayedText('');

    const intervalMs = 1000 / CONFIG.TYPING_SPEED;
    typingTimerRef.current = setInterval(() => {
      charIndex += 1;
      setDisplayedText(message.slice(0, charIndex));

      if (charIndex >= message.length) {
        if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        setIsTyping(false);
        onComplete();
      }
    }, intervalMs);
  };

  // Transition to next message
  const transitionToNext = () => {
    setIsFading(true);

    fadeTimerRef.current = setTimeout(() => {
      // Move to next message
      messageIndexRef.current = (messageIndexRef.current + 1) % WELCOME_MESSAGES.length;
      const nextMessage = WELCOME_MESSAGES[messageIndexRef.current];
      setIsFading(false);

      // Type the new message
      typeMessage(nextMessage, () => {
        // Schedule next transition after display duration
        cycleTimerRef.current = setTimeout(transitionToNext, CONFIG.DISPLAY_DURATION);
      });
    }, CONFIG.FADE_DURATION);
  };

  // Main effect to type first message on mount, then start cycling
  useEffect(() => {
    if (hasStarted) return;
    setHasStarted(true);

    if (prefersReducedMotion) {
      // Show full text immediately if reduced motion preferred
      setDisplayedText(WELCOME_MESSAGES[0]);
      return;
    }

    // Type out the first message immediately on mount
    typeMessage(WELCOME_MESSAGES[0], () => {
      // After first message types, wait then start cycling
      cycleTimerRef.current = setTimeout(transitionToNext, CONFIG.DISPLAY_DURATION);
    });

    // Cleanup on unmount
    return clearAllTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReducedMotion, hasStarted]);

  return (
    <p
      className={`transition-opacity duration-300 ${className}`}
      style={{ opacity: isFading ? 0 : 1 }}
      aria-live="polite"
      aria-atomic="true"
    >
      {displayedText}
      {isTyping && (
        <span className="animate-pulse ml-0.5" aria-hidden="true">|</span>
      )}
    </p>
  );
}

export default TypingWelcome;
