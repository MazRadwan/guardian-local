'use client';

import { useState, useCallback } from 'react';

export type ConversationMode = 'consult' | 'assessment' | 'scoring';

export function useConversationMode(initialMode: ConversationMode = 'consult') {
  const [mode, setMode] = useState<ConversationMode>(initialMode);
  const [isChanging, setIsChanging] = useState(false);

  const changeMode = useCallback(async (newMode: ConversationMode) => {
    if (mode === newMode) return;

    setIsChanging(true);
    try {
      // API call to update mode on backend would go here
      // For now, just update local state
      setMode(newMode);

      // Emit event for other components to react
      window.dispatchEvent(
        new CustomEvent('conversation:mode-changed', {
          detail: { mode: newMode },
        })
      );
    } catch (error) {
      console.error('Failed to change conversation mode:', error);
      throw error;
    } finally {
      setIsChanging(false);
    }
  }, [mode]);

  /**
   * Hydrate mode from active conversation without toggling isChanging/side-effects.
   */
  const setModeFromConversation = useCallback((newMode: ConversationMode) => {
    setMode((prev) => (prev === newMode ? prev : newMode));
  }, []);

  return {
    mode,
    changeMode,
    isChanging,
    setModeFromConversation,
  };
}
