'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export interface UseConversationSyncParams {
  activeConversationId: string | null;
  setActiveConversation: (id: string | null) => void;
}

export interface UseConversationSyncReturn {
  // Saved conversation ID from localStorage
  savedConversationId: string | null | undefined;

  // Guard flag for skipping history on newly created conversations
  isJustCreatedConversation: (conversationId: string) => boolean;

  // Mark conversation as just created (clears after 100ms)
  markConversationAsJustCreated: (conversationId: string) => void;

  // Handle conversation change (for external triggers)
  handleConversationChange: (conversationId: string) => void;
}

export function useConversationSync({
  activeConversationId,
  setActiveConversation,
}: UseConversationSyncParams): UseConversationSyncReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [savedConversationId, setSavedConversationId] = useState<string | null | undefined>(null);
  const justCreatedConversationId = useRef<string | null>(null);

  // Load saved conversationId from localStorage on mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('guardian_conversation_id');
      setSavedConversationId(saved || undefined);
    }
  }, []);

  // Sync activeConversationId from URL on mount
  // GUARD: Only sync if localStorage also has the ID (prevents restoring stale URLs)
  useEffect(() => {
    const urlConversationId = searchParams.get('conversation');
    if (urlConversationId && !activeConversationId) {
      // Check localStorage - if it's been cleared, don't restore from URL
      // This prevents race condition when intentionally clearing stale conversations
      const storedId = typeof window !== 'undefined' ? localStorage.getItem('guardian_conversation_id') : null;
      if (storedId === urlConversationId) {
        setActiveConversation(urlConversationId);
      } else {
        console.log('[useConversationSync] Skipping URL sync - localStorage mismatch (stale URL being cleared)');
      }
    }
  }, [searchParams, activeConversationId, setActiveConversation]);

  // Update URL and localStorage when activeConversationId changes
  useEffect(() => {
    if (activeConversationId) {
      // Only update URL if different from current URL (prevent navigation loop)
      const currentConversationId = searchParams.get('conversation');
      if (currentConversationId !== activeConversationId) {
        console.log('[useConversationSync] Updating URL to conversation:', activeConversationId);
        router.replace(`/chat?conversation=${activeConversationId}`, { scroll: false });
      }

      // Update localStorage for session persistence
      if (typeof window !== 'undefined') {
        localStorage.setItem('guardian_conversation_id', activeConversationId);
      }
    } else if (activeConversationId === null) {
      // Clear localStorage when conversation is explicitly set to null
      // This prevents stale conversation IDs from being passed on reconnect
      if (typeof window !== 'undefined') {
        console.log('[useConversationSync] Clearing stale conversation from localStorage');
        localStorage.removeItem('guardian_conversation_id');
      }

      // Clear URL param if present
      const currentConversationId = searchParams.get('conversation');
      if (currentConversationId) {
        console.log('[useConversationSync] Clearing stale conversation from URL');
        router.replace('/chat', { scroll: false });
      }
    }
  }, [activeConversationId, searchParams, router]);

  // Check if conversation was just created (skip history loading)
  const isJustCreatedConversation = (conversationId: string): boolean => {
    return justCreatedConversationId.current === conversationId;
  };

  // Mark conversation as just created, auto-clear after 100ms
  const markConversationAsJustCreated = (conversationId: string): void => {
    justCreatedConversationId.current = conversationId;
    setTimeout(() => {
      justCreatedConversationId.current = null;
    }, 100);
  };

  // Handle external conversation changes (can be called manually)
  const handleConversationChange = (conversationId: string): void => {
    setActiveConversation(conversationId);
  };

  return {
    savedConversationId,
    isJustCreatedConversation,
    markConversationAsJustCreated,
    handleConversationChange,
  };
}
