'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChatMessage, EmbeddedComponent, ExportReadyPayload, ExtractionFailedPayload, QuestionnaireReadyPayload, ScoringStartedPayload, ScoringProgressPayload, ScoringCompletePayload, ScoringErrorPayload, VendorClarificationNeededPayload } from '@/lib/websocket';
import { useChatStore, GENERATION_STEPS } from '@/stores/chatStore';
import type { GenerationPhasePayload } from '@guardian/shared';
import type { Conversation } from '@/stores/chatStore';
import type { ComposerRef } from '@/components/chat/Composer';
import type { ConversationMode } from '@/components/chat/ModeSelector';

export interface UseWebSocketEventsParams {
  // Store actions
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  finishStreaming: () => void;
  startStreaming: () => void;
  appendToLastMessage: (chunk: string) => void;
  appendComponentToLastAssistantMessage: (component: EmbeddedComponent) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversationTitle: (id: string, title: string) => void;
  removeConversationFromList: (id: string) => void;
  clearDeleteConversationRequest: () => void;
  requestNewChat: () => void;
  setExportReady: (conversationId: string, payload: ExportReadyPayload) => void;
  clearExportReady: (conversationId: string) => void;

  // State
  messages: ChatMessage[];
  isLoading: boolean;
  activeConversationId: string | null;
  conversations: Conversation[];
  newChatRequested: boolean;

  // Refs
  composerRef: React.RefObject<ComposerRef | null>;

  // Other hooks
  handleHistory: (messages: ChatMessage[]) => void;
  setShouldLoadHistory: (should: boolean) => void;
  markConversationAsJustCreated: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  setModeFromConversation: (mode: ConversationMode) => void;

  // Flags
  setRegeneratingMessageIndex: (index: number | null) => void;
  focusComposer: () => void;

  // Persistence (Story 4.3.5, Story 13.3.2)
  userId?: string;
  persistence?: {
    clearDismiss: (conversationId: string) => void;
    savePayload: (conversationId: string, payload: QuestionnaireReadyPayload) => void;
    // Story 13.3.2: Export persistence
    saveExport: (conversationId: string, payload: ExportReadyPayload) => void;
    loadExport: (conversationId: string) => ExportReadyPayload | null;
    clearExport: (conversationId: string) => void;
  };
}

export interface UseWebSocketEventsReturn {
  // All event handlers as stable callbacks
  handleMessage: (message: ChatMessage) => void;
  handleMessageStream: (chunk: string, conversationId: string) => void;
  handleError: (errorMessage: string) => void;
  handleConnectionReady: (data: { conversationId?: string; resumed: boolean; hasActiveConversation: boolean }) => void;
  handleStreamComplete: () => void;
  handleConversationsList: (conversations: Conversation[]) => void;
  handleConversationCreated: (conversation: Conversation) => void;
  handleConversationTitleUpdated: (conversationId: string, title: string) => void;
  handleStreamAborted: (conversationId: string) => void;
  handleConversationDeleted: (conversationId: string) => void;
  handleConversationModeUpdated: (data: { conversationId: string; mode: ConversationMode }) => void;
  handleExportReady: (data: ExportReadyPayload) => void;
  handleExtractionFailed: (data: ExtractionFailedPayload) => void;
  handleQuestionnaireReady: (data: QuestionnaireReadyPayload) => void;
  handleGenerationPhase: (data: GenerationPhasePayload) => void;
  // Epic 15 Story 5a.7: Scoring event handlers
  handleScoringStarted: (data: ScoringStartedPayload) => void;
  handleScoringProgress: (data: ScoringProgressPayload) => void;
  handleScoringComplete: (data: ScoringCompletePayload) => void;
  handleScoringError: (data: ScoringErrorPayload) => void;
  // Epic 18.4.2b: Vendor clarification handler
  handleVendorClarificationNeeded: (data: VendorClarificationNeededPayload) => void;
}

/**
 * useWebSocketEvents - Extracts WebSocket event handler logic from useChatController
 *
 * This hook encapsulates all WebSocket event callbacks (11 total) with stable references
 * to prevent unnecessary re-registration. All handlers are wrapped in useCallback with
 * proper dependency tracking to avoid stale closures.
 *
 * Event Handlers:
 * 1. handleMessage - Process complete assistant messages
 * 2. handleMessageStream - Process streaming message chunks
 * 3. handleError - Handle WebSocket errors
 * 4. handleConnectionReady - Handle connection initialization/resume
 * 5. handleStreamComplete - Clean up after streaming completes
 * 6. handleConversationsList - Update conversations list
 * 7. handleConversationCreated - Handle new conversation creation
 * 8. handleConversationTitleUpdated - Update conversation title
 * 9. handleStreamAborted - Handle stream abortion
 * 10. handleConversationDeleted - Handle conversation deletion
 * 11. (handleHistory delegated to useHistoryManager)
 *
 * @param params - All necessary store actions, state, refs, and callbacks
 * @returns Object containing all stable event handler callbacks
 */
export function useWebSocketEvents({
  addMessage,
  setMessages,
  finishStreaming,
  startStreaming,
  appendToLastMessage,
  appendComponentToLastAssistantMessage,
  setLoading,
  setError,
  setConversations,
  addConversation,
  updateConversationTitle,
  removeConversationFromList,
  clearDeleteConversationRequest,
  requestNewChat,
  setExportReady,
  clearExportReady,
  messages,
  isLoading,
  activeConversationId,
  conversations,
  newChatRequested,
  composerRef,
  handleHistory,
  setShouldLoadHistory,
  markConversationAsJustCreated,
  setActiveConversation,
  setModeFromConversation,
  setRegeneratingMessageIndex,
  focusComposer,
  userId,
  persistence,
}: UseWebSocketEventsParams): UseWebSocketEventsReturn {

  // Handler 1: Process complete assistant messages
  const handleMessage = useCallback(
    (message: ChatMessage) => {
      // Add message to store (critical - this was missing!)
      addMessage(message);
      finishStreaming();
      setLoading(false); // Hide typing indicator

      // Auto-focus input after assistant response completes
      focusComposer();
    },
    [addMessage, finishStreaming, setLoading, focusComposer]
  );

  // Handler 2: Process streaming message chunks
  const handleMessageStream = useCallback(
    (chunk: string, conversationId: string) => {
      // CRITICAL: Ignore chunks for inactive conversations (Story 9.0c)
      // This prevents streaming responses from bleeding across conversation switches
      if (conversationId !== activeConversationId) {
        console.warn(
          `[useWebSocketEvents] Ignoring streaming chunk for inactive conversation. ` +
          `Chunk belongs to: ${conversationId}, active conversation: ${activeConversationId}`
        );
        return;
      }

      // If this is the first chunk, start a new streaming message
      if (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') {
        startStreaming();
        setLoading(false); // Hide typing indicator, show streaming message instead
      }
      appendToLastMessage(chunk);
    },
    [activeConversationId, messages, startStreaming, appendToLastMessage, setLoading]
  );

  // Handler 3: Handle WebSocket errors
  const handleError = useCallback(
    (errorMessage: string) => {
      // "Conversation X not found" is expected when returning to a deleted/stale conversation
      // This can happen when localStorage has a conversationId that no longer exists
      const isConversationNotFound = /Conversation .+ not found/i.test(errorMessage);

      if (isConversationNotFound) {
        console.log('[useWebSocketEvents] Conversation not found (stale reference) - clearing and requesting new chat');
        // Clear the stale activeConversationId
        setActiveConversation(null);
        // Clear localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('guardian_conversation_id');
        }
        // Request a new chat to be created
        requestNewChat();
        // Don't set error state - this is an expected recovery scenario
        setLoading(false);
        return;
      }

      console.error('[useWebSocketEvents] Error received:', errorMessage);
      setError(errorMessage);
      finishStreaming();
      setLoading(false); // Hide typing indicator on error
      setRegeneratingMessageIndex(null); // Reset regenerating state

      // Reset generating state on error (allows retry - don't clear pendingQuestionnaire)
      useChatStore.getState().setGenerating(false);
      // Story 13.6.1: Reset generation step so Generate button re-enables
      useChatStore.getState().resetGenerationStep();
      // Transition to error state for questionnaire card to show retry
      useChatStore.getState().setQuestionnaireUIState('error');
      useChatStore.getState().setQuestionnaireError(errorMessage);
    },
    [setError, finishStreaming, setLoading, setRegeneratingMessageIndex, setActiveConversation, requestNewChat]
  );

  // Handler 4: Handle connection initialization/resume
  const handleConnectionReady = useCallback(
    (data: { conversationId?: string; resumed: boolean; hasActiveConversation: boolean }) => {
      console.log('[useWebSocketEvents] Connection ready:', data);

      if (data.hasActiveConversation && data.conversationId) {
        // SCENARIO 1: Backend successfully resumed existing conversation
        console.log('[useWebSocketEvents] Resuming conversation:', data.conversationId);

        // Set flag to load history for this conversation
        setShouldLoadHistory(true);

        // Set as active (URL + localStorage updates handled by useConversationSync)
        setActiveConversation(data.conversationId);
      } else {
        // SCENARIO 2: No active conversation (deleted/missing) - auto-create new chat
        // CRITICAL: Clear localStorage BEFORE setActiveConversation(null) to prevent race condition
        // The URL sync effect runs when activeConversationId changes and checks if localStorage
        // matches the URL. If we clear localStorage first, the guard will fail and won't restore
        // the stale ID from the URL.
        console.log('[useWebSocketEvents] Clearing stale conversation ID and localStorage');
        if (typeof window !== 'undefined') {
          localStorage.removeItem('guardian_conversation_id');
        }
        setActiveConversation(null);

        // Use sessionStorage guard to survive React Strict Mode double-mount
        const hasAutoCreated = sessionStorage.getItem('guardian_auto_created_chat');

        if (!hasAutoCreated && !newChatRequested) {
          console.log('[useWebSocketEvents] No active conversation - auto-creating new chat');
          sessionStorage.setItem('guardian_auto_created_chat', 'true');
          requestNewChat();
        }
      }

      // CRITICAL: Always clear loading state to prevent skeleton hang
      setLoading(false);
    },
    [requestNewChat, newChatRequested, setShouldLoadHistory, setActiveConversation, setLoading]
  );

  // Handler 5: Clean up after streaming completes
  const handleStreamComplete = useCallback(() => {
    // Stream is complete, finish streaming and auto-focus input
    finishStreaming();
    setLoading(false);
    setRegeneratingMessageIndex(null); // Reset regenerating state
    focusComposer();

    // CRITICAL FIX (Story 4.3.5): DO NOT clear pendingQuestionnaire here!
    // Only clear generation flag. Payload clears on:
    // - User clicks Dismiss
    // - User downloads successfully
    // - New questionnaire_ready event received
    useChatStore.getState().setGenerating(false);

    // Story 14.1.5: Mark questionnaire stream as complete and update index
    // This gates download bubble visibility until streaming finishes
    const state = useChatStore.getState();
    if (state.pendingQuestionnaire) {
      // Update index to current messages length (download bubble renders AFTER questionnaire)
      state.setQuestionnaireMessageIndex(messages.length);
      state.setQuestionnaireStreamComplete(true);
    }
  }, [finishStreaming, setLoading, setRegeneratingMessageIndex, focusComposer, messages.length]);

  // Handler 6: Update conversations list
  const handleConversationsList = useCallback(
    (conversations: Conversation[]) => {
      console.log('[useWebSocketEvents] handleConversationsList called with:', conversations.length, 'conversations');
      console.log('[useWebSocketEvents] Conversations data:', conversations);
      setConversations(conversations);
      console.log('[useWebSocketEvents] setConversations called - chatStore should be updated');
    },
    [setConversations]
  );

  // Handler 7: Handle new conversation creation
  const handleConversationCreated = useCallback(
    (conversation: Conversation) => {
      console.log('[useWebSocketEvents] New conversation created:', conversation.id);
      addConversation(conversation);

      // Mark this conversation as just created (to prevent loading history for it)
      markConversationAsJustCreated(conversation.id);

      // Set as active (URL + localStorage updates handled by useConversationSync)
      setActiveConversation(conversation.id);
      // Hydrate mode from server payload
      setModeFromConversation(conversation.mode);
    },
    [addConversation, setActiveConversation, markConversationAsJustCreated, setModeFromConversation]
  );

  // Handler 8: Update conversation title
  const handleConversationTitleUpdated = useCallback(
    (conversationId: string, title: string) => {
      console.log('[useWebSocketEvents] Conversation title updated:', conversationId, title);
      updateConversationTitle(conversationId, title);
    },
    [updateConversationTitle]
  );

  // Handler 9: Handle stream abortion
  const handleStreamAborted = useCallback(
    (conversationId: string) => {
      console.log('[useWebSocketEvents] Stream aborted for conversation:', conversationId);
      // Finish streaming and re-enable composer
      finishStreaming();
      setLoading(false);
      setRegeneratingMessageIndex(null); // Reset regenerating state
      // Auto-focus composer after abort
      focusComposer();
    },
    [finishStreaming, setLoading, setRegeneratingMessageIndex, focusComposer]
  );

  // Handler 10: Handle conversation deletion
  const handleConversationDeleted = useCallback(
    (conversationId: string) => {
      console.log('[useWebSocketEvents] Conversation deleted:', conversationId);
      // Clear export cache for this conversation before removal
      clearExportReady(conversationId);

      // Story 13.3.2: Also clear localStorage export
      if (persistence) {
        persistence.clearExport(conversationId);
      }

      // Remove from local store
      removeConversationFromList(conversationId);
      // Clear the request flag
      clearDeleteConversationRequest();

      // CRITICAL FIX: Clear localStorage if deleted conversation was the saved one
      if (typeof window !== 'undefined') {
        const savedId = localStorage.getItem('guardian_conversation_id');
        if (savedId === conversationId) {
          console.log('[useWebSocketEvents] Clearing localStorage for deleted conversation');
          localStorage.removeItem('guardian_conversation_id');
        }
      }

      // Get remaining conversations after removal
      const remainingConversations = conversations.filter(c => c.id !== conversationId);

      // CRITICAL FIX: If deleted conversation was active, handle state transition
      if (activeConversationId === conversationId) {
        console.log('[useWebSocketEvents] Deleted conversation was active - transitioning state');

        // Clear messages immediately to prevent stale UI
        setMessages([]);

        if (remainingConversations.length > 0) {
          // Auto-select the most recent remaining conversation
          const nextConversation = remainingConversations[0]; // Already sorted by updatedAt desc
          console.log('[useWebSocketEvents] Auto-selecting conversation:', nextConversation.id);
          setActiveConversation(nextConversation.id);
          // History will be loaded by the conversation switching effect
          setShouldLoadHistory(true);
        } else {
          // No conversations left - clear active and auto-create new one
          console.log('[useWebSocketEvents] Last conversation deleted - auto-creating new chat');
          setActiveConversation(null);
          requestNewChat();
        }
      }
    },
    [removeConversationFromList, clearDeleteConversationRequest, clearExportReady, activeConversationId, setActiveConversation, conversations, requestNewChat, persistence, setMessages, setShouldLoadHistory]
  );

  // Handler 11: Conversation mode updated (server→client)
  const handleConversationModeUpdated = useCallback(
    (data: { conversationId: string; mode: ConversationMode }) => {
      // Update conversations list entry
      const updatedConversations = conversations.map((conv) =>
        conv.id === data.conversationId ? { ...conv, mode: data.mode } : conv
      );
      setConversations(updatedConversations);

      // If this is the active conversation, hydrate local mode
      if (activeConversationId === data.conversationId) {
        setModeFromConversation(data.mode);
      }
    },
    [conversations, setConversations, activeConversationId, setModeFromConversation]
  );

  // Handler 12: Export ready (questionnaire extracted)
  const handleExportReady = useCallback(
    (data: ExportReadyPayload) => {
      // Ignore if for different conversation
      if (data.conversationId !== activeConversationId) {
        console.warn('[useWebSocketEvents] Ignoring export_ready for inactive conversation');
        return;
      }

      console.log('[useWebSocketEvents] Export ready:', data);

      // Story 13.4.5: Mark stepper as complete (step = GENERATION_STEPS.length)
      useChatStore.getState().setCurrentGenerationStep(GENERATION_STEPS.length);

      // Cache the export ready payload for this conversation
      setExportReady(data.conversationId, data);

      // Story 13.3.2: Persist to localStorage for page reload survival
      if (persistence) {
        persistence.saveExport(data.conversationId, data);
      }

      // Story 4.3.5: Transition questionnaire UI to 'download' state
      // NOTE: Legacy injection removed - QuestionnairePromptCard handles download UI
      useChatStore.getState().setQuestionnaireUIState('download');
      useChatStore.getState().setGenerating(false);
    },
    [activeConversationId, setExportReady, persistence]
  );

  // Handler 13: Extraction failed (questionnaire extraction error)
  const handleExtractionFailed = useCallback(
    (data: ExtractionFailedPayload) => {
      // Ignore if for different conversation
      if (data.conversationId !== activeConversationId) {
        console.warn('[useWebSocketEvents] Ignoring extraction_failed for inactive conversation');
        return;
      }

      console.log('[useWebSocketEvents] Extraction failed:', data);

      // Story 13.4.5: Reset stepper on error
      useChatStore.getState().resetGenerationStep();

      // Clear any previous export state for this conversation (in case of retry)
      clearExportReady(data.conversationId);

      // Story 13.3.2: Also clear localStorage export to prevent stale rehydration
      if (persistence) {
        persistence.clearExport(data.conversationId);
      }

      // Story 4.3.5: Transition questionnaire UI to 'error' state
      // NOTE: Legacy injection removed - QuestionnairePromptCard handles error UI
      useChatStore.getState().setQuestionnaireUIState('error');
      useChatStore.getState().setQuestionnaireError(data.error);
      useChatStore.getState().setGenerating(false);
    },
    [activeConversationId, clearExportReady, persistence]
  );

  // Handler 14: Questionnaire ready (Claude indicates readiness to generate)
  const handleQuestionnaireReady = useCallback(
    (data: QuestionnaireReadyPayload) => {
      // Guard: Skip if generation already in progress (prevents replay issues)
      if (useChatStore.getState().isGeneratingQuestionnaire) {
        console.log('[useWebSocketEvents] Ignoring questionnaire_ready - generation in progress');
        return;
      }

      // Only process if for the active conversation
      if (data.conversationId !== activeConversationId) {
        console.warn(
          `[useWebSocketEvents] Ignoring questionnaire_ready for inactive conversation. ` +
          `Event belongs to: ${data.conversationId}, active conversation: ${activeConversationId}`
        );
        return;
      }

      console.log('[useWebSocketEvents] Questionnaire ready:', {
        conversationId: data.conversationId,
        assessmentType: data.assessmentType,
      });

      // Story 13.3.2: Clear old export state (in-memory + localStorage) before setting new questionnaire
      clearExportReady(data.conversationId);
      if (persistence) {
        persistence.clearExport(data.conversationId);
      }

      // Save questionnaire payload to localStorage for rehydration
      if (persistence) {
        persistence.savePayload(data.conversationId, data);
      }

      // Update store with pending questionnaire and set to 'ready' state
      useChatStore.getState().setPendingQuestionnaire(data);
      useChatStore.getState().setQuestionnaireUIState('ready');
      useChatStore.getState().setQuestionnaireError(null); // Clear any previous error
    },
    [activeConversationId, clearExportReady, persistence]
  );

  // Handler 15: Generation phase update (Story 13.5.3)
  const handleGenerationPhase = useCallback(
    (data: GenerationPhasePayload) => {
      // Only process for active conversation
      if (data.conversationId !== activeConversationId) {
        console.log('[useWebSocketEvents] Ignoring phase event for inactive conversation:', data.conversationId);
        return;
      }

      // Only advance forward (idempotency - handles reconnection/duplicates)
      const currentStep = useChatStore.getState().currentGenerationStep;
      if (data.phase <= currentStep) {
        console.log('[useWebSocketEvents] Ignoring out-of-order phase event:', data.phase, '<=', currentStep);
        return;
      }

      console.log('[useWebSocketEvents] Generation phase:', data.phaseId, '(', data.phase, ')');
      useChatStore.getState().setCurrentGenerationStep(data.phase);
    },
    [activeConversationId]
  );

  // Epic 15 Story 5a.7: Scoring event handlers
  const handleScoringStarted = useCallback(
    (data: ScoringStartedPayload) => {
      // Only process for active conversation
      if (data.conversationId !== activeConversationId) {
        console.log('[useWebSocketEvents] Ignoring scoring_started for inactive conversation');
        return;
      }

      console.log('[useWebSocketEvents] Scoring started:', data.assessmentId);

      // Epic 18.4.2b: Clear vendor clarification when scoring starts
      // This confirms vendor selection was successful (if there was one)
      useChatStore.getState().clearVendorClarification();

      // Update scoring progress state to 'parsing' (first status)
      useChatStore.getState().updateScoringProgress({
        status: 'parsing',
        message: 'Starting analysis...',
      });
    },
    [activeConversationId]
  );

  // Story 24.2: Track last update time to enforce minimum display duration
  const lastProgressUpdate = useRef<number>(0);
  const pendingProgress = useRef<ScoringProgressPayload | null>(null);
  const progressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MIN_DISPLAY_MS = 500;

  const handleScoringProgress = useCallback(
    (data: ScoringProgressPayload) => {
      // Only process for active conversation
      if (data.conversationId !== activeConversationId) {
        console.log('[useWebSocketEvents] Ignoring scoring_progress for inactive conversation');
        return;
      }

      const now = Date.now();
      const timeSinceLastUpdate = now - lastProgressUpdate.current;

      console.log('[useWebSocketEvents] Scoring progress:', data.status, data.message,
        `(${timeSinceLastUpdate}ms since last)`);

      if (timeSinceLastUpdate < MIN_DISPLAY_MS) {
        // Queue this update to display after minimum duration
        pendingProgress.current = data;

        // Clear any existing timeout to avoid duplicate updates
        if (progressTimeoutRef.current) {
          clearTimeout(progressTimeoutRef.current);
        }

        progressTimeoutRef.current = setTimeout(() => {
          if (pendingProgress.current === data) {
            useChatStore.getState().updateScoringProgress({
              status: data.status,
              message: data.message,
              progress: data.progress,
              error: data.error,
            });
            lastProgressUpdate.current = Date.now();
            pendingProgress.current = null;
          }
        }, MIN_DISPLAY_MS - timeSinceLastUpdate);
      } else {
        // Update immediately
        useChatStore.getState().updateScoringProgress({
          status: data.status,
          message: data.message,
          progress: data.progress,
          error: data.error,
        });
        lastProgressUpdate.current = now;
      }
    },
    [activeConversationId]
  );

  const handleScoringComplete = useCallback(
    (data: ScoringCompletePayload) => {
      // Only process for active conversation
      if (data.conversationId !== activeConversationId) {
        console.log('[useWebSocketEvents] Ignoring scoring_complete for inactive conversation');
        return;
      }

      console.log('[useWebSocketEvents] Scoring complete:', data.result?.compositeScore);

      // Update scoring progress to complete
      useChatStore.getState().updateScoringProgress({
        status: 'complete',
        message: 'Analysis complete!',
      });

      // Store scoring results (in current display state)
      useChatStore.getState().setScoringResult(data.result);

      // Story 5c: Also save to per-conversation cache for persistence across switches
      useChatStore.getState().setScoringResultForConversation(data.conversationId, data.result);

      // Narrative report is sent as a separate message event, no need to handle it here
    },
    [activeConversationId]
  );

  const handleScoringError = useCallback(
    (data: ScoringErrorPayload) => {
      // Only process for active conversation
      if (data.conversationId !== activeConversationId) {
        console.log('[useWebSocketEvents] Ignoring scoring_error for inactive conversation');
        return;
      }

      console.error('[useWebSocketEvents] Scoring error:', data.code, data.error);

      // Map error codes to user-friendly messages
      const errorMessages: Record<string, string> = {
        ASSESSMENT_NOT_FOUND: 'Assessment not found. Please try again.',
        UNAUTHORIZED_ASSESSMENT: 'You do not have permission to score this assessment.',
        ASSESSMENT_NOT_EXPORTED: 'This assessment has not been exported yet. Please export the questionnaire first.',
        NO_ASSESSMENT: 'No assessment linked to this conversation. Please generate a questionnaire first in Assessment mode, then upload the completed responses here.',
        PARSE_FAILED: 'Failed to extract responses from the document. Please ensure you uploaded a valid Guardian questionnaire.',
        PARSE_CONFIDENCE_TOO_LOW: 'Document quality is too low. Please upload a text-based PDF or Word document instead of a scanned image.',
        RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
        DUPLICATE_FILE: 'This file has already been uploaded. Please upload a different file.',
        SCORING_FAILED: 'Scoring analysis failed. Please try again.',
      };

      const userMessage = data.code && errorMessages[data.code]
        ? errorMessages[data.code]
        : data.error || 'An error occurred during scoring.';

      // Update scoring progress to error state
      useChatStore.getState().updateScoringProgress({
        status: 'error',
        message: userMessage,
        error: data.error,
      });

      // Epic 18: Clear loading/streaming state so UI doesn't hang
      finishStreaming();
      setLoading(false);

      // Add error message to chat so user sees feedback
      addMessage({
        id: `scoring-error-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Scoring Error**\n\n${userMessage}`,
        conversationId: data.conversationId,
        createdAt: new Date().toISOString(),
      });

      // Re-focus composer so user can try again
      focusComposer();
    },
    [activeConversationId, finishStreaming, setLoading, addMessage, focusComposer]
  );

  // Epic 18.4.2b: Vendor clarification needed handler
  const handleVendorClarificationNeeded = useCallback(
    (data: VendorClarificationNeededPayload) => {
      // Only process for active conversation
      if (data.conversationId !== activeConversationId) {
        console.log('[useWebSocketEvents] Ignoring vendor_clarification_needed for inactive conversation');
        return;
      }

      console.log('[useWebSocketEvents] Vendor clarification needed:', data.vendors.length, 'vendors detected');

      // Store vendor clarification data for UI to display
      useChatStore.getState().setVendorClarification(data);

      // Clear loading/streaming state so UI shows clarification card
      finishStreaming();
      setLoading(false);
    },
    [activeConversationId, finishStreaming, setLoading]
  );

  return {
    handleMessage,
    handleMessageStream,
    handleError,
    handleConnectionReady,
    handleStreamComplete,
    handleConversationsList,
    handleConversationCreated,
    handleConversationTitleUpdated,
    handleStreamAborted,
    handleConversationDeleted,
    handleConversationModeUpdated,
    handleExportReady,
    handleExtractionFailed,
    handleQuestionnaireReady,
    handleGenerationPhase,
    handleScoringStarted,
    handleScoringProgress,
    handleScoringComplete,
    handleScoringError,
    handleVendorClarificationNeeded,
  };
}
