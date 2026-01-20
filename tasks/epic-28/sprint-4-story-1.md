# Story 28.7.1: Extract ScoringHandler.ts (triggerScoringOnSend)

**Sprint:** 4 - Business Logic Handlers
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Create ScoringHandler and implement the `triggerScoringOnSend()` logic that auto-triggers scoring when conditions are met (scoring mode + document + Claude complete).

---

## Acceptance Criteria

- [ ] `ScoringHandler.ts` created at `infrastructure/websocket/handlers/`
- [ ] `shouldTriggerScoring()` check implemented
- [ ] `triggerScoring()` method implemented
- [ ] Emits `scoring_progress` events during scoring
- [ ] Handles scoring service errors gracefully
- [ ] Unit tests cover trigger conditions

---

## Technical Approach

```typescript
// infrastructure/websocket/handlers/ScoringHandler.ts

import { ScoringService } from '../../../application/services/ScoringService';
import { VendorValidationService } from '../../../application/services/VendorValidationService';
import { IFileRepository } from '../../../application/interfaces/IFileRepository';
import { IAuthenticatedSocket } from '../ChatContext';
import { sanitizeErrorForClient } from '../../../utils/sanitize';

export class ScoringHandler {
  constructor(
    private readonly scoringService: ScoringService,
    private readonly vendorValidationService: VendorValidationService,
    private readonly fileRepository: IFileRepository
  ) {}

  /**
   * Check if scoring should auto-trigger after a message
   */
  shouldTriggerScoring(
    mode: string,
    hasDocuments: boolean,
    isClaudeComplete: boolean
  ): boolean {
    return mode === 'scoring' && hasDocuments && isClaudeComplete;
  }

  /**
   * Trigger scoring and emit progress events
   */
  async triggerScoring(
    socket: IAuthenticatedSocket,
    conversationId: string,
    fileIds: string[]
  ): Promise<void> {
    try {
      socket.emit('scoring_progress', {
        conversationId,
        status: 'starting',
        message: 'Starting vendor response analysis...',
      });

      // Check for multiple vendors
      if (this.vendorValidationService && fileIds.length > 0) {
        const validationResult = await this.vendorValidationService.validateSingleVendor(fileIds);

        if (!validationResult.isValid) {
          console.log(`[ScoringHandler] Multiple vendors detected, requesting clarification`);
          socket.emit('vendor_clarification_needed', {
            conversationId,
            vendors: validationResult.vendors,
            message: 'Multiple vendors detected in uploaded documents. Please select which vendor to score.',
          });
          return;
        }
      }

      socket.emit('scoring_progress', {
        conversationId,
        status: 'processing',
        message: 'Analyzing vendor responses...',
      });

      const result = await this.scoringService.scoreConversation(conversationId);

      socket.emit('scoring_progress', {
        conversationId,
        status: 'complete',
        message: 'Scoring complete',
        result,
      });
    } catch (error) {
      console.error('[ScoringHandler] Scoring error:', error);
      socket.emit('scoring_progress', {
        conversationId,
        status: 'error',
        message: sanitizeErrorForClient(error, 'Scoring failed'),
      });
    }
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/ScoringHandler.ts` - Create
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ScoringHandler.test.ts` - Create

---

## Tests Required

```typescript
describe('ScoringHandler', () => {
  describe('shouldTriggerScoring', () => {
    it('should return true when all conditions met', () => {
      expect(handler.shouldTriggerScoring('scoring', true, true)).toBe(true);
    });

    it('should return false when not in scoring mode', () => {
      expect(handler.shouldTriggerScoring('consult', true, true)).toBe(false);
      expect(handler.shouldTriggerScoring('assessment', true, true)).toBe(false);
    });

    it('should return false when no documents', () => {
      expect(handler.shouldTriggerScoring('scoring', false, true)).toBe(false);
    });

    it('should return false when Claude not complete', () => {
      expect(handler.shouldTriggerScoring('scoring', true, false)).toBe(false);
    });
  });

  describe('triggerScoring', () => {
    it('should emit progress events during scoring', async () => {
      mockScoringService.scoreConversation.mockResolvedValue({ score: 85 });

      await handler.triggerScoring(mockSocket, 'conv-1', ['file-1']);

      expect(mockSocket.emit).toHaveBeenCalledWith('scoring_progress', expect.objectContaining({
        status: 'starting',
      }));
      expect(mockSocket.emit).toHaveBeenCalledWith('scoring_progress', expect.objectContaining({
        status: 'complete',
      }));
    });

    it('should request clarification for multiple vendors', async () => {
      mockVendorValidationService.validateSingleVendor.mockResolvedValue({
        isValid: false,
        vendors: ['Vendor A', 'Vendor B'],
      });

      await handler.triggerScoring(mockSocket, 'conv-1', ['file-1', 'file-2']);

      expect(mockSocket.emit).toHaveBeenCalledWith('vendor_clarification_needed', expect.any(Object));
    });
  });
});
```

---

## Definition of Done

- [ ] ScoringHandler created
- [ ] shouldTriggerScoring implemented
- [ ] triggerScoring implemented with progress events
- [ ] Unit tests passing
