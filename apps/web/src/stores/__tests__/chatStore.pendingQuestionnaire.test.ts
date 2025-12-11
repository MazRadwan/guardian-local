/**
 * Tests for chatStore pending questionnaire state
 *
 * Part of Epic 12: Tool-Based Questionnaire Generation Trigger
 *
 * NOTE: apps/web uses Jest (not Vitest)
 */

import { useChatStore } from '../chatStore';
import { QuestionnaireReadyPayload } from '@/lib/websocket';

const testPayload: QuestionnaireReadyPayload = {
  conversationId: 'conv-123',
  assessmentType: 'comprehensive',
  vendorName: 'Test Vendor',
  solutionName: null,
  contextSummary: 'Test context',
  estimatedQuestions: 90,
  selectedCategories: null,
};

// Capture initial state for proper reset
const initialState = useChatStore.getState();

describe('chatStore pending questionnaire', () => {
  beforeEach(() => {
    // Full reset to initial state (second param = replace, not merge)
    useChatStore.setState(initialState, true);
  });

  describe('setPendingQuestionnaire', () => {
    it('should set pending questionnaire', () => {
      useChatStore.getState().setPendingQuestionnaire(testPayload);

      const state = useChatStore.getState();
      expect(state.pendingQuestionnaire).toEqual(testPayload);
    });

    it('should replace existing pending questionnaire', () => {
      useChatStore.getState().setPendingQuestionnaire(testPayload);

      const newPayload = { ...testPayload, conversationId: 'conv-456' };
      useChatStore.getState().setPendingQuestionnaire(newPayload);

      const state = useChatStore.getState();
      expect(state.pendingQuestionnaire?.conversationId).toBe('conv-456');
    });
  });

  describe('clearPendingQuestionnaire', () => {
    it('should clear pending questionnaire', () => {
      useChatStore.getState().setPendingQuestionnaire(testPayload);
      useChatStore.getState().clearPendingQuestionnaire();

      const state = useChatStore.getState();
      expect(state.pendingQuestionnaire).toBeNull();
    });

    it('should be safe to call when already null', () => {
      useChatStore.getState().clearPendingQuestionnaire();

      const state = useChatStore.getState();
      expect(state.pendingQuestionnaire).toBeNull();
    });
  });

  describe('isGeneratingQuestionnaire', () => {
    it('should track isGeneratingQuestionnaire flag', () => {
      expect(useChatStore.getState().isGeneratingQuestionnaire).toBe(false);

      useChatStore.getState().setGenerating(true);
      expect(useChatStore.getState().isGeneratingQuestionnaire).toBe(true);

      useChatStore.getState().setGenerating(false);
      expect(useChatStore.getState().isGeneratingQuestionnaire).toBe(false);
    });

    it('should persist pending while generating', () => {
      useChatStore.getState().setPendingQuestionnaire(testPayload);
      useChatStore.getState().setGenerating(true);

      // Card should still be visible (not cleared on click)
      expect(useChatStore.getState().pendingQuestionnaire).toEqual(testPayload);
      expect(useChatStore.getState().isGeneratingQuestionnaire).toBe(true);
    });
  });

  describe('conversation change', () => {
    it('should clear pending questionnaire when conversation changes', () => {
      useChatStore.getState().setPendingQuestionnaire(testPayload);

      // Simulate conversation change
      useChatStore.getState().setActiveConversation('different-conv');

      const state = useChatStore.getState();
      expect(state.pendingQuestionnaire).toBeNull();
    });

    it('should reset generating state when conversation changes', () => {
      useChatStore.getState().setGenerating(true);
      useChatStore.getState().setActiveConversation('different-conv');

      expect(useChatStore.getState().isGeneratingQuestionnaire).toBe(false);
    });
  });

  // Story 14.1.5: Stream completion gating for download bubble
  describe('isQuestionnaireStreamComplete (Story 14.1.5)', () => {
    it('should default to false', () => {
      expect(useChatStore.getState().isQuestionnaireStreamComplete).toBe(false);
    });

    it('should set stream complete flag', () => {
      useChatStore.getState().setQuestionnaireStreamComplete(true);
      expect(useChatStore.getState().isQuestionnaireStreamComplete).toBe(true);

      useChatStore.getState().setQuestionnaireStreamComplete(false);
      expect(useChatStore.getState().isQuestionnaireStreamComplete).toBe(false);
    });

    it('should reset to false when setPendingQuestionnaire is called', () => {
      // Set flag to true
      useChatStore.getState().setQuestionnaireStreamComplete(true);
      expect(useChatStore.getState().isQuestionnaireStreamComplete).toBe(true);

      // Set new pending questionnaire - should reset flag
      useChatStore.getState().setPendingQuestionnaire(testPayload);
      expect(useChatStore.getState().isQuestionnaireStreamComplete).toBe(false);
    });

    it('should reset to false when clearPendingQuestionnaire is called', () => {
      // Set flag to true
      useChatStore.getState().setQuestionnaireStreamComplete(true);
      expect(useChatStore.getState().isQuestionnaireStreamComplete).toBe(true);

      // Clear pending questionnaire - should reset flag
      useChatStore.getState().clearPendingQuestionnaire();
      expect(useChatStore.getState().isQuestionnaireStreamComplete).toBe(false);
    });

    it('should capture questionnaireMessageIndex when setPendingQuestionnaire is called', () => {
      // Add some messages first
      useChatStore.getState().addMessage({ role: 'user', content: 'msg 1', timestamp: new Date() });
      useChatStore.getState().addMessage({ role: 'assistant', content: 'msg 2', timestamp: new Date() });

      // Set pending questionnaire - should capture current message count
      useChatStore.getState().setPendingQuestionnaire(testPayload);

      // Index should be 2 (inserted after existing messages)
      expect(useChatStore.getState().questionnaireMessageIndex).toBe(2);
    });

    it('should reset questionnaireMessageIndex to -1 when clearPendingQuestionnaire is called', () => {
      // Set pending questionnaire first
      useChatStore.getState().setPendingQuestionnaire(testPayload);
      expect(useChatStore.getState().questionnaireMessageIndex).toBeGreaterThanOrEqual(0);

      // Clear should reset to -1
      useChatStore.getState().clearPendingQuestionnaire();
      expect(useChatStore.getState().questionnaireMessageIndex).toBe(-1);
    });
  });
});
