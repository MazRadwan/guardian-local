/**
 * Unit tests for ChatServer vendor clarification events (Epic 18.4.2a)
 *
 * When multiple vendors are detected in uploaded files, the system should:
 * 1. Emit `vendor_clarification_needed` with vendor options
 * 2. Wait for `vendor_selected` from user
 * 3. Resume scoring with only the selected vendor's files
 */

import type { VendorInfo } from '../../src/domain/types/QuestionnaireSchema.js';

/**
 * Simulated pending clarification state stored on socket
 */
interface PendingVendorClarification {
  conversationId: string;
  userId: string;
  fileIds: string[];
  userQuery?: string;
  vendors: VendorInfo[];
}

/**
 * Simulate vendor validation result
 */
interface VendorValidationResult {
  valid: boolean;
  vendorName?: string;
  vendors?: VendorInfo[];
}

/**
 * Simulate triggerScoringOnSend with vendor validation
 */
async function triggerScoringOnSendWithValidation(
  fileIds: string[],
  conversationId: string,
  userId: string,
  userQuery: string | undefined,
  vendorValidationService: {
    validateSingleVendor: (fileIds: string[]) => Promise<VendorValidationResult>;
  } | undefined,
  socketData: { pendingVendorClarification?: PendingVendorClarification },
  emittedEvents: Array<{ event: string; data: unknown }>,
  proceedWithScoring: () => Promise<void>
): Promise<{ clarificationNeeded: boolean }> {
  // Validate single vendor before scoring
  if (vendorValidationService && fileIds.length > 0) {
    const validationResult = await vendorValidationService.validateSingleVendor(fileIds);

    if (!validationResult.valid && validationResult.vendors) {
      // Store pending for when user responds
      socketData.pendingVendorClarification = {
        conversationId,
        userId,
        fileIds,
        userQuery,
        vendors: validationResult.vendors,
      };

      // Emit clarification event
      emittedEvents.push({
        event: 'vendor_clarification_needed',
        data: {
          conversationId,
          vendors: validationResult.vendors,
          message: `I found documents from ${validationResult.vendors.length} different vendors. Which vendor would you like to score first?`,
        },
      });

      return { clarificationNeeded: true };
    }
  }

  // No clarification needed - proceed with scoring
  await proceedWithScoring();
  return { clarificationNeeded: false };
}

/**
 * Simulate vendor_selected handler
 */
async function handleVendorSelected(
  payload: { conversationId: string; vendorName: string },
  socketData: { pendingVendorClarification?: PendingVendorClarification },
  emittedEvents: Array<{ event: string; data: unknown }>,
  triggerScoring: (fileIds: string[], userQuery?: string) => Promise<void>
): Promise<{ success: boolean; error?: string }> {
  const pending = socketData.pendingVendorClarification;

  if (!pending) {
    emittedEvents.push({
      event: 'error',
      data: { event: 'vendor_selected', message: 'No pending vendor clarification' },
    });
    return { success: false, error: 'No pending vendor clarification' };
  }

  // Find selected vendor (case-insensitive)
  const selectedVendor = pending.vendors.find(
    v => v.name.toLowerCase() === payload.vendorName.toLowerCase()
  );

  if (!selectedVendor) {
    emittedEvents.push({
      event: 'error',
      data: { event: 'vendor_selected', message: `Unknown vendor: ${payload.vendorName}` },
    });
    return { success: false, error: `Unknown vendor: ${payload.vendorName}` };
  }

  // Clear pending
  socketData.pendingVendorClarification = undefined;

  // Emit confirmation
  emittedEvents.push({
    event: 'message',
    data: {
      role: 'assistant',
      content: `Starting scoring for ${selectedVendor.name}...`,
      conversationId: pending.conversationId,
    },
  });

  // Resume scoring with selected vendor's files
  await triggerScoring(selectedVendor.fileIds, pending.userQuery);

  return { success: true };
}

describe('ChatServer - Vendor Clarification Events (Epic 18.4.2a)', () => {
  const createVendorInfo = (name: string, fileIds: string[]): VendorInfo => ({
    name,
    fileCount: fileIds.length,
    fileIds,
  });

  describe('triggerScoringOnSend with vendor validation', () => {
    it('should emit clarification event when multiple vendors detected', async () => {
      const emittedEvents: Array<{ event: string; data: unknown }> = [];
      const socketData: { pendingVendorClarification?: PendingVendorClarification } = {};
      let scoringCalled = false;

      const result = await triggerScoringOnSendWithValidation(
        ['file-1', 'file-2', 'file-3'],
        'conv-1',
        'user-1',
        'Tell me about security',
        {
          validateSingleVendor: async () => ({
            valid: false,
            vendors: [
              createVendorInfo('Acme Corp', ['file-1', 'file-2']),
              createVendorInfo('CloudSec Inc', ['file-3']),
            ],
          }),
        },
        socketData,
        emittedEvents,
        async () => { scoringCalled = true; }
      );

      expect(result.clarificationNeeded).toBe(true);
      expect(scoringCalled).toBe(false);

      // Check clarification event
      const clarificationEvent = emittedEvents.find(
        e => e.event === 'vendor_clarification_needed'
      );
      expect(clarificationEvent).toBeDefined();

      const eventData = clarificationEvent!.data as {
        conversationId: string;
        vendors: VendorInfo[];
        message: string;
      };
      expect(eventData.conversationId).toBe('conv-1');
      expect(eventData.vendors).toHaveLength(2);
      expect(eventData.message).toContain('2 different vendors');

      // Check pending state stored
      expect(socketData.pendingVendorClarification).toBeDefined();
      expect(socketData.pendingVendorClarification!.fileIds).toEqual(['file-1', 'file-2', 'file-3']);
      expect(socketData.pendingVendorClarification!.userQuery).toBe('Tell me about security');
    });

    it('should proceed with scoring when single vendor', async () => {
      const emittedEvents: Array<{ event: string; data: unknown }> = [];
      const socketData: { pendingVendorClarification?: PendingVendorClarification } = {};
      let scoringCalled = false;

      const result = await triggerScoringOnSendWithValidation(
        ['file-1', 'file-2'],
        'conv-1',
        'user-1',
        undefined,
        {
          validateSingleVendor: async () => ({
            valid: true,
            vendorName: 'Acme Corp',
          }),
        },
        socketData,
        emittedEvents,
        async () => { scoringCalled = true; }
      );

      expect(result.clarificationNeeded).toBe(false);
      expect(scoringCalled).toBe(true);
      expect(emittedEvents).toHaveLength(0);
      expect(socketData.pendingVendorClarification).toBeUndefined();
    });

    it('should proceed when validation service not available', async () => {
      const emittedEvents: Array<{ event: string; data: unknown }> = [];
      const socketData: { pendingVendorClarification?: PendingVendorClarification } = {};
      let scoringCalled = false;

      const result = await triggerScoringOnSendWithValidation(
        ['file-1'],
        'conv-1',
        'user-1',
        undefined,
        undefined, // No validation service
        socketData,
        emittedEvents,
        async () => { scoringCalled = true; }
      );

      expect(result.clarificationNeeded).toBe(false);
      expect(scoringCalled).toBe(true);
    });
  });

  describe('vendor_selected handler', () => {
    it('should resume scoring with selected vendor files', async () => {
      const emittedEvents: Array<{ event: string; data: unknown }> = [];
      const socketData: { pendingVendorClarification?: PendingVendorClarification } = {
        pendingVendorClarification: {
          conversationId: 'conv-1',
          userId: 'user-1',
          fileIds: ['file-1', 'file-2', 'file-3'],
          userQuery: 'What about compliance?',
          vendors: [
            createVendorInfo('Acme Corp', ['file-1', 'file-2']),
            createVendorInfo('CloudSec Inc', ['file-3']),
          ],
        },
      };

      let scoredFileIds: string[] = [];
      let scoredUserQuery: string | undefined;

      const result = await handleVendorSelected(
        { conversationId: 'conv-1', vendorName: 'Acme Corp' },
        socketData,
        emittedEvents,
        async (fileIds, userQuery) => {
          scoredFileIds = fileIds;
          scoredUserQuery = userQuery;
        }
      );

      expect(result.success).toBe(true);
      expect(scoredFileIds).toEqual(['file-1', 'file-2']);
      expect(scoredUserQuery).toBe('What about compliance?');

      // Check confirmation message
      const confirmEvent = emittedEvents.find(e => e.event === 'message');
      expect(confirmEvent).toBeDefined();
      expect((confirmEvent!.data as { content: string }).content).toContain('Acme Corp');

      // Pending should be cleared
      expect(socketData.pendingVendorClarification).toBeUndefined();
    });

    it('should handle case-insensitive vendor selection', async () => {
      const emittedEvents: Array<{ event: string; data: unknown }> = [];
      const socketData: { pendingVendorClarification?: PendingVendorClarification } = {
        pendingVendorClarification: {
          conversationId: 'conv-1',
          userId: 'user-1',
          fileIds: ['file-1', 'file-2'],
          vendors: [
            createVendorInfo('Acme Corp', ['file-1']),
            createVendorInfo('CloudSec Inc', ['file-2']),
          ],
        },
      };

      let scoredFileIds: string[] = [];

      // Select with different case
      const result = await handleVendorSelected(
        { conversationId: 'conv-1', vendorName: 'CLOUDSEC INC' },
        socketData,
        emittedEvents,
        async (fileIds) => { scoredFileIds = fileIds; }
      );

      expect(result.success).toBe(true);
      expect(scoredFileIds).toEqual(['file-2']);
    });

    it('should error when no pending clarification', async () => {
      const emittedEvents: Array<{ event: string; data: unknown }> = [];
      const socketData: { pendingVendorClarification?: PendingVendorClarification } = {};

      const result = await handleVendorSelected(
        { conversationId: 'conv-1', vendorName: 'Acme Corp' },
        socketData,
        emittedEvents,
        async () => {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('No pending vendor clarification');

      const errorEvent = emittedEvents.find(e => e.event === 'error');
      expect(errorEvent).toBeDefined();
    });

    it('should error when unknown vendor selected', async () => {
      const emittedEvents: Array<{ event: string; data: unknown }> = [];
      const socketData: { pendingVendorClarification?: PendingVendorClarification } = {
        pendingVendorClarification: {
          conversationId: 'conv-1',
          userId: 'user-1',
          fileIds: ['file-1'],
          vendors: [createVendorInfo('Acme Corp', ['file-1'])],
        },
      };

      const result = await handleVendorSelected(
        { conversationId: 'conv-1', vendorName: 'Unknown Vendor' },
        socketData,
        emittedEvents,
        async () => {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown vendor');

      const errorEvent = emittedEvents.find(e => e.event === 'error');
      expect(errorEvent).toBeDefined();
    });
  });

  describe('vendor_clarification_needed event format', () => {
    it('should include all required fields', async () => {
      const emittedEvents: Array<{ event: string; data: unknown }> = [];
      const socketData: { pendingVendorClarification?: PendingVendorClarification } = {};

      await triggerScoringOnSendWithValidation(
        ['file-1', 'file-2'],
        'conv-1',
        'user-1',
        undefined,
        {
          validateSingleVendor: async () => ({
            valid: false,
            vendors: [
              createVendorInfo('Vendor A', ['file-1']),
              createVendorInfo('Vendor B', ['file-2']),
            ],
          }),
        },
        socketData,
        emittedEvents,
        async () => {}
      );

      const event = emittedEvents[0];
      expect(event.event).toBe('vendor_clarification_needed');

      const data = event.data as {
        conversationId: string;
        vendors: VendorInfo[];
        message: string;
      };

      expect(data.conversationId).toBe('conv-1');
      expect(data.vendors).toHaveLength(2);
      expect(data.message).toBeTruthy();

      // Each vendor should have name, fileCount, fileIds
      for (const vendor of data.vendors) {
        expect(vendor.name).toBeTruthy();
        expect(typeof vendor.fileCount).toBe('number');
        expect(Array.isArray(vendor.fileIds)).toBe(true);
      }
    });
  });
});
