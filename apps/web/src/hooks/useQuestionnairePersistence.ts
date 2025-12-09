import { useMemo } from 'react';
import { ExportReadyPayload, QuestionnaireReadyPayload } from '@/lib/websocket';

const DISMISS_KEY_PREFIX = 'guardian_q_dismissed_';
const PAYLOAD_KEY_PREFIX = 'guardian_q_payload_';
const EXPORT_KEY_PREFIX = 'guardian_q_export_';

function makeKey(prefix: string, userId: string, conversationId: string) {
  return `${prefix}${userId}:${conversationId}`;
}

export function useQuestionnairePersistence(userId: string | undefined) {
  return useMemo(() => {
    // Guard: No persistence if no user OR SSR
    const isClient = typeof window !== 'undefined';
    if (!userId || !isClient) {
      return {
        dismiss: () => {},
        isDismissed: () => false,
        clearDismiss: () => {},
        savePayload: () => {},
        loadPayload: () => null,
        clearPayload: () => {},
        clearAllForUser: () => {},
        // Story 13.3.2: Export persistence
        saveExport: () => {},
        loadExport: () => null,
        clearExport: () => {},
      };
    }

    // Dismiss management (permanent until new tool call)
    const dismiss = (conversationId: string) => {
      localStorage.setItem(makeKey(DISMISS_KEY_PREFIX, userId, conversationId), 'true');
    };

    const isDismissed = (conversationId: string): boolean => {
      return localStorage.getItem(makeKey(DISMISS_KEY_PREFIX, userId, conversationId)) === 'true';
    };

    const clearDismiss = (conversationId: string) => {
      localStorage.removeItem(makeKey(DISMISS_KEY_PREFIX, userId, conversationId));
    };

    // Payload persistence (survives page refresh)
    const savePayload = (conversationId: string, payload: QuestionnaireReadyPayload) => {
      localStorage.setItem(makeKey(PAYLOAD_KEY_PREFIX, userId, conversationId), JSON.stringify(payload));
    };

    const loadPayload = (conversationId: string): QuestionnaireReadyPayload | null => {
      const stored = localStorage.getItem(makeKey(PAYLOAD_KEY_PREFIX, userId, conversationId));
      if (!stored) return null;
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    };

    const clearPayload = (conversationId: string) => {
      localStorage.removeItem(makeKey(PAYLOAD_KEY_PREFIX, userId, conversationId));
    };

    // Story 13.3.2: Export persistence (survives page refresh)
    const saveExport = (conversationId: string, payload: ExportReadyPayload) => {
      try {
        localStorage.setItem(
          makeKey(EXPORT_KEY_PREFIX, userId, conversationId),
          JSON.stringify(payload)
        );
      } catch (e) {
        console.error('[useQuestionnairePersistence] Failed to save export:', e);
      }
    };

    const loadExport = (conversationId: string): ExportReadyPayload | null => {
      try {
        const data = localStorage.getItem(makeKey(EXPORT_KEY_PREFIX, userId, conversationId));
        if (!data) return null;

        const parsed = JSON.parse(data);
        // Shape validation: conversationId match + required fields
        if (
          parsed.conversationId === conversationId &&
          parsed.assessmentId &&
          Array.isArray(parsed.formats)
        ) {
          return parsed;
        }
        // Malformed entry - clear to prevent state poisoning
        localStorage.removeItem(makeKey(EXPORT_KEY_PREFIX, userId, conversationId));
        return null;
      } catch (e) {
        console.error('[useQuestionnairePersistence] Failed to load export:', e);
        return null;
      }
    };

    const clearExport = (conversationId: string) => {
      try {
        localStorage.removeItem(makeKey(EXPORT_KEY_PREFIX, userId, conversationId));
      } catch (e) {
        console.error('[useQuestionnairePersistence] Failed to clear export:', e);
      }
    };

    // Called on logout - clears ALL questionnaire data for this user
    const clearAllForUser = () => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith(`${DISMISS_KEY_PREFIX}${userId}:`) ||
          key.startsWith(`${PAYLOAD_KEY_PREFIX}${userId}:`) ||
          key.startsWith(`${EXPORT_KEY_PREFIX}${userId}:`)  // Story 13.3.2: Clear export keys too
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    };

    return {
      dismiss,
      isDismissed,
      clearDismiss,
      savePayload,
      loadPayload,
      clearPayload,
      clearAllForUser,
      // Story 13.3.2: Export persistence
      saveExport,
      loadExport,
      clearExport,
    };
  }, [userId]);
}
