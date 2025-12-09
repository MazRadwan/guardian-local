import { renderHook } from '@testing-library/react';
import { useQuestionnairePersistence } from '../useQuestionnairePersistence';
import { ExportReadyPayload, QuestionnaireReadyPayload } from '@/lib/websocket';

describe('useQuestionnairePersistence', () => {
  beforeEach(() => {
    // Clear localStorage before each test (if it exists)
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.clear();
    }
  });

  afterEach(() => {
    // Clean up after each test (if it exists)
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.clear();
    }
  });

  it('dismiss() sets localStorage with user-namespaced key', () => {
    const { result } = renderHook(() => useQuestionnairePersistence('user123'));

    result.current.dismiss('conv456');

    expect(localStorage.getItem('guardian_q_dismissed_user123:conv456')).toBe('true');
  });

  it('isDismissed() returns true when dismissed', () => {
    const { result } = renderHook(() => useQuestionnairePersistence('user123'));

    result.current.dismiss('conv456');

    expect(result.current.isDismissed('conv456')).toBe(true);
  });

  it('isDismissed() returns false when not dismissed', () => {
    const { result } = renderHook(() => useQuestionnairePersistence('user123'));

    expect(result.current.isDismissed('conv456')).toBe(false);
  });

  it('clearDismiss() removes dismissed state', () => {
    const { result } = renderHook(() => useQuestionnairePersistence('user123'));

    result.current.dismiss('conv456');
    expect(result.current.isDismissed('conv456')).toBe(true);

    result.current.clearDismiss('conv456');
    expect(result.current.isDismissed('conv456')).toBe(false);
  });

  it('savePayload() / loadPayload() round-trip correctly', () => {
    const { result } = renderHook(() => useQuestionnairePersistence('user123'));

    const payload: QuestionnaireReadyPayload = {
      conversationId: 'conv456',
      assessmentType: 'quick',
      vendorName: 'Test Vendor',
      solutionName: 'Test Solution',
      contextSummary: 'Test context',
      estimatedQuestions: 10,
      selectedCategories: null,
    };

    result.current.savePayload('conv456', payload);

    const loaded = result.current.loadPayload('conv456');
    expect(loaded).toEqual(payload);
  });

  it('loadPayload() returns null when no payload exists', () => {
    const { result } = renderHook(() => useQuestionnairePersistence('user123'));

    const loaded = result.current.loadPayload('non-existent');
    expect(loaded).toBeNull();
  });

  it('loadPayload() returns null when payload is invalid JSON', () => {
    const { result } = renderHook(() => useQuestionnairePersistence('user123'));

    // Manually set invalid JSON
    localStorage.setItem('guardian_q_payload_user123:conv456', 'invalid-json');

    const loaded = result.current.loadPayload('conv456');
    expect(loaded).toBeNull();
  });

  it('clearPayload() removes payload from localStorage', () => {
    const { result } = renderHook(() => useQuestionnairePersistence('user123'));

    const payload: QuestionnaireReadyPayload = {
      conversationId: 'conv456',
      assessmentType: 'comprehensive',
      vendorName: null,
      solutionName: null,
      contextSummary: null,
      estimatedQuestions: null,
      selectedCategories: null,
    };

    result.current.savePayload('conv456', payload);
    expect(result.current.loadPayload('conv456')).toEqual(payload);

    result.current.clearPayload('conv456');
    expect(result.current.loadPayload('conv456')).toBeNull();
  });

  it('clearAllForUser() removes all entries for that user', () => {
    const { result } = renderHook(() => useQuestionnairePersistence('user123'));

    const payload1: QuestionnaireReadyPayload = {
      conversationId: 'conv1',
      assessmentType: 'quick',
      vendorName: null,
      solutionName: null,
      contextSummary: null,
      estimatedQuestions: null,
      selectedCategories: null,
    };

    const payload2: QuestionnaireReadyPayload = {
      conversationId: 'conv2',
      assessmentType: 'comprehensive',
      vendorName: null,
      solutionName: null,
      contextSummary: null,
      estimatedQuestions: null,
      selectedCategories: null,
    };

    result.current.dismiss('conv1');
    result.current.dismiss('conv2');
    result.current.savePayload('conv1', payload1);
    result.current.savePayload('conv2', payload2);

    // Verify data exists
    expect(result.current.isDismissed('conv1')).toBe(true);
    expect(result.current.isDismissed('conv2')).toBe(true);
    expect(result.current.loadPayload('conv1')).toEqual(payload1);
    expect(result.current.loadPayload('conv2')).toEqual(payload2);

    result.current.clearAllForUser();

    // Verify all data removed
    expect(result.current.isDismissed('conv1')).toBe(false);
    expect(result.current.isDismissed('conv2')).toBe(false);
    expect(result.current.loadPayload('conv1')).toBeNull();
    expect(result.current.loadPayload('conv2')).toBeNull();
  });

  it('clearAllForUser() only removes entries for that specific user', () => {
    const { result: result1 } = renderHook(() => useQuestionnairePersistence('user123'));
    const { result: result2 } = renderHook(() => useQuestionnairePersistence('user456'));

    result1.current.dismiss('conv1');
    result2.current.dismiss('conv1');

    result1.current.clearAllForUser();

    // User123's data should be cleared
    expect(result1.current.isDismissed('conv1')).toBe(false);

    // User456's data should remain
    expect(result2.current.isDismissed('conv1')).toBe(true);
  });

  it('returns no-op functions when userId is undefined', () => {
    const { result } = renderHook(() => useQuestionnairePersistence(undefined));

    // All functions should be no-ops
    result.current.dismiss('any');
    result.current.savePayload('any', {} as QuestionnaireReadyPayload);

    expect(result.current.isDismissed('any')).toBe(false);
    expect(result.current.loadPayload('any')).toBeNull();

    // Verify nothing was written to localStorage
    expect(localStorage.length).toBe(0);
  });

  it('user namespacing prevents cross-user data access', () => {
    const { result: user1 } = renderHook(() => useQuestionnairePersistence('user1'));
    const { result: user2 } = renderHook(() => useQuestionnairePersistence('user2'));

    const payload1: QuestionnaireReadyPayload = {
      conversationId: 'conv1',
      assessmentType: 'quick',
      vendorName: 'Vendor1',
      solutionName: null,
      contextSummary: null,
      estimatedQuestions: null,
      selectedCategories: null,
    };

    const payload2: QuestionnaireReadyPayload = {
      conversationId: 'conv1',
      assessmentType: 'comprehensive',
      vendorName: 'Vendor2',
      solutionName: null,
      contextSummary: null,
      estimatedQuestions: null,
      selectedCategories: null,
    };

    // Save different payloads for same conversation ID but different users
    user1.current.savePayload('conv1', payload1);
    user2.current.savePayload('conv1', payload2);

    // Each user should see their own payload
    expect(user1.current.loadPayload('conv1')).toEqual(payload1);
    expect(user2.current.loadPayload('conv1')).toEqual(payload2);

    // Dismiss for user1 should not affect user2
    user1.current.dismiss('conv1');
    expect(user1.current.isDismissed('conv1')).toBe(true);
    expect(user2.current.isDismissed('conv1')).toBe(false);
  });

  // Story 13.3.2: Export persistence tests
  describe('export persistence (Story 13.3.2)', () => {
    const userId = 'user123';
    const conversationId = 'conv456';
    const validExport: ExportReadyPayload = {
      conversationId: 'conv456',
      assessmentId: 'assess789',
      formats: ['pdf', 'word', 'excel'],
      questionCount: 40,
    };

    it('saveExport() saves export to localStorage with user-scoped key', () => {
      const { result } = renderHook(() => useQuestionnairePersistence(userId));

      result.current.saveExport(conversationId, validExport);

      const stored = localStorage.getItem(`guardian_q_export_${userId}:${conversationId}`);
      expect(JSON.parse(stored!)).toEqual(validExport);
    });

    it('loadExport() returns null when no export exists', () => {
      const { result } = renderHook(() => useQuestionnairePersistence(userId));

      expect(result.current.loadExport(conversationId)).toBeNull();
    });

    it('loadExport() returns valid export when present', () => {
      localStorage.setItem(
        `guardian_q_export_${userId}:${conversationId}`,
        JSON.stringify(validExport)
      );

      const { result } = renderHook(() => useQuestionnairePersistence(userId));

      expect(result.current.loadExport(conversationId)).toEqual(validExport);
    });

    it('loadExport() returns null and clears malformed export (missing assessmentId)', () => {
      const malformed = { conversationId, formats: ['pdf'] }; // missing assessmentId
      localStorage.setItem(
        `guardian_q_export_${userId}:${conversationId}`,
        JSON.stringify(malformed)
      );

      const { result } = renderHook(() => useQuestionnairePersistence(userId));

      expect(result.current.loadExport(conversationId)).toBeNull();
      expect(localStorage.getItem(`guardian_q_export_${userId}:${conversationId}`)).toBeNull();
    });

    it('loadExport() returns null and clears malformed export (wrong conversationId)', () => {
      const malformed = { ...validExport, conversationId: 'wrong-id' };
      localStorage.setItem(
        `guardian_q_export_${userId}:${conversationId}`,
        JSON.stringify(malformed)
      );

      const { result } = renderHook(() => useQuestionnairePersistence(userId));

      expect(result.current.loadExport(conversationId)).toBeNull();
      expect(localStorage.getItem(`guardian_q_export_${userId}:${conversationId}`)).toBeNull();
    });

    it('loadExport() returns null and clears malformed export (formats not array)', () => {
      const malformed = { ...validExport, formats: 'pdf' }; // not an array
      localStorage.setItem(
        `guardian_q_export_${userId}:${conversationId}`,
        JSON.stringify(malformed)
      );

      const { result } = renderHook(() => useQuestionnairePersistence(userId));

      expect(result.current.loadExport(conversationId)).toBeNull();
      expect(localStorage.getItem(`guardian_q_export_${userId}:${conversationId}`)).toBeNull();
    });

    it('loadExport() returns null when export is invalid JSON', () => {
      localStorage.setItem(`guardian_q_export_${userId}:${conversationId}`, 'invalid-json');

      const { result } = renderHook(() => useQuestionnairePersistence(userId));

      expect(result.current.loadExport(conversationId)).toBeNull();
    });

    it('clearExport() removes export from localStorage', () => {
      localStorage.setItem(
        `guardian_q_export_${userId}:${conversationId}`,
        JSON.stringify(validExport)
      );

      const { result } = renderHook(() => useQuestionnairePersistence(userId));
      result.current.clearExport(conversationId);

      expect(localStorage.getItem(`guardian_q_export_${userId}:${conversationId}`)).toBeNull();
    });

    it('clearAllForUser() clears export keys along with payload and dismissed keys', () => {
      // Set up various keys
      localStorage.setItem(`guardian_q_export_${userId}:conv-1`, JSON.stringify(validExport));
      localStorage.setItem(`guardian_q_payload_${userId}:conv-2`, JSON.stringify({}));
      localStorage.setItem(`guardian_q_dismissed_${userId}:conv-3`, 'true');
      localStorage.setItem('unrelated_key', 'should remain');

      const { result } = renderHook(() => useQuestionnairePersistence(userId));
      result.current.clearAllForUser();

      expect(localStorage.getItem(`guardian_q_export_${userId}:conv-1`)).toBeNull();
      expect(localStorage.getItem(`guardian_q_payload_${userId}:conv-2`)).toBeNull();
      expect(localStorage.getItem(`guardian_q_dismissed_${userId}:conv-3`)).toBeNull();
      expect(localStorage.getItem('unrelated_key')).toBe('should remain');
    });

    it('export persistence respects user namespacing', () => {
      const { result: user1 } = renderHook(() => useQuestionnairePersistence('user1'));
      const { result: user2 } = renderHook(() => useQuestionnairePersistence('user2'));

      const export1: ExportReadyPayload = { ...validExport, assessmentId: 'assess1' };
      const export2: ExportReadyPayload = { ...validExport, assessmentId: 'assess2' };

      user1.current.saveExport(conversationId, export1);
      user2.current.saveExport(conversationId, export2);

      expect(user1.current.loadExport(conversationId)).toEqual(export1);
      expect(user2.current.loadExport(conversationId)).toEqual(export2);
    });

    it('returns no-op export functions when userId is undefined', () => {
      const { result } = renderHook(() => useQuestionnairePersistence(undefined));

      // Should not throw
      result.current.saveExport('any', validExport);
      result.current.clearExport('any');

      expect(result.current.loadExport('any')).toBeNull();

      // Verify nothing was written to localStorage
      expect(localStorage.length).toBe(0);
    });
  });
});
