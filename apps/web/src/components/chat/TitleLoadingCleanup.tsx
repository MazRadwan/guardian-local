'use client';

import { useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';

/**
 * Story 26.3: Client component to clean up stale title loading states on app initialization.
 *
 * This component runs once on mount to clear any titleLoading states that are
 * older than 10 seconds. This handles the case where:
 * - User refreshes the page while a title was loading
 * - User closes and reopens the tab
 * - Session storage was cleared but conversations were persisted
 *
 * The component renders nothing (null) - it's purely for side effects.
 *
 * Note: This must be a client component because it uses useEffect and accesses
 * Zustand store. It's imported in layout.tsx (Server Component) but that's fine
 * because Server Components can render Client Components.
 */
export function TitleLoadingCleanup() {
  useEffect(() => {
    // Run cleanup on mount
    useChatStore.getState().cleanupStaleTitleLoadingStates();
  }, []);

  return null;
}
