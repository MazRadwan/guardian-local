import { RefObject, useState, useEffect } from 'react';

/**
 * Tracks whether the questionnaire card is visible in the message list viewport.
 * Uses IntersectionObserver with the container as the root.
 *
 * @param cardRef - Ref to the QuestionnairePromptCard element
 * @param containerRef - Ref to the scrollable message list container
 * @returns boolean - true if card is visible (or refs not ready), false if scrolled out
 */
export function useQuestionnaireCardVisibility(
  cardRef: RefObject<HTMLDivElement | null>,
  containerRef: RefObject<HTMLDivElement | null>
): boolean {
  const [isVisible, setIsVisible] = useState(true); // Default visible until proven otherwise
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  // Sync refs to state on every render (state only updates when value changes)
  useEffect(() => {
    setCard(cardRef.current);
    setContainer(containerRef.current);
  });

  // Observer effect now depends on actual elements
  useEffect(() => {
    if (!card || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      {
        root: container,
        threshold: 0.1, // Consider visible if 10% is showing
      }
    );

    observer.observe(card);
    return () => observer.disconnect();
  }, [card, container]);

  return isVisible;
}
