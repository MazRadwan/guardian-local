# Story 26.2: Vendor Title Upgrade

## Description

Verify and ensure that conversation titles upgrade to "Assessment: {vendorName}" format when `generate_questionnaire` fires with vendor info. This functionality was implemented in Epic 25.3 but needs verification in the context of Story 26.1's changes.

**Current State:** The `generate_questionnaire` handler in `ChatServer.ts` (lines ~2311-2335) already updates the title to "Assessment: {vendorName}" when vendor/solution info is provided. This story verifies that logic still works correctly after Story 26.1's LLM fallback changes.

**Key Behavior:**
1. After 26.1: Assessment mode gets LLM title (e.g., "AI Vendor Risk Questions")
2. When `generate_questionnaire` fires with vendor: Title upgrades to "Assessment: Acme Corp"
3. If `titleManuallyEdited` is true: Title is NOT changed

## Acceptance Criteria

- [ ] Title upgrades from LLM-generated title to "Assessment: {vendorName}" on questionnaire generation
- [ ] Title upgrades from "New Assessment" placeholder to "Assessment: {vendorName}"
- [ ] Upgrade only happens if `titleManuallyEdited` is false
- [ ] WebSocket event `conversation_title_updated` emitted on upgrade
- [ ] Frontend sidebar updates in real-time
- [ ] Truncation works correctly for long vendor names (max 50 chars)
- [ ] Solution name used if vendor name not provided

## Technical Approach

### 1. Verify Existing Logic (lines ~2311-2335)

The existing implementation in `handleGenerateQuestionnaire`:

```typescript
// Epic 25.3: Update conversation title with vendor/solution name
// Only if title hasn't been manually edited by user
if (vendorName || solutionName) {
  const titlePrefix = 'Assessment: ';
  const titleName = vendorName || solutionName || '';
  const maxTitleLength = 50;
  let newTitle = `${titlePrefix}${titleName}`;
  if (newTitle.length > maxTitleLength) {
    newTitle = newTitle.slice(0, maxTitleLength - 3) + '...';
  }

  const titleUpdated = await this.conversationService.updateTitleIfNotManuallyEdited(
    conversationId,
    newTitle
  );

  if (titleUpdated) {
    socket.emit('conversation_title_updated', {
      conversationId,
      title: newTitle,
    });
    console.log(`[ChatServer] Updated assessment title: "${newTitle}"`);
  }
}
```

**This logic is correct.** Story 26.2 is primarily a verification story to ensure:
1. The upgrade works after 26.1's LLM fallback changes
2. Integration test covers the full flow

### 2. Add Integration Test

Create an integration test that verifies the full flow:
1. User sends message in Assessment mode -> LLM title generated (from 26.1)
2. User triggers `generate_questionnaire` with vendor -> Title upgrades to "Assessment: {vendor}"
3. Verify both `conversation_title_updated` events are emitted

### 3. Edge Case: No Vendor Info

If `generate_questionnaire` is called without vendor info:
- Current behavior: Title stays as is (no update)
- Expected behavior: Same (no regression)

This is correct - if no vendor info, keep the LLM-generated title from 26.1.

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Add clarifying comment only (no logic changes)
- `packages/backend/__tests__/unit/ChatServer.titleGeneration.test.ts` - Add integration test for title upgrade flow (extends from 26.1)

## Tests Affected

Existing tests that may be affected:
- `packages/backend/__tests__/unit/infrastructure/websocket/ChatServer.test.ts` (if exists)
  - Tests for `generate_questionnaire` handler
  - Verify title update behavior
- No breaking changes expected since logic is unchanged

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Integration test: Assessment mode title upgrades on questionnaire generation
- [ ] Integration test: Title not upgraded if `titleManuallyEdited` is true
- [ ] Integration test: Title not changed if no vendor info provided
- [ ] Unit test: Truncation works for long vendor names

### Test Cases

```typescript
describe('Vendor title upgrade (Story 26.2)', () => {
  describe('generate_questionnaire handler', () => {
    it('should upgrade title to "Assessment: {vendorName}" when vendor provided', async () => {
      // Setup: Create conversation with LLM-generated title
      const conversationId = 'test-conv-id';
      const socket = createMockSocket();

      // Simulate conversation with LLM title already set (from 26.1)
      await mockConversationService.updateTitle(conversationId, 'AI Vendor Assessment');

      // Call generate_questionnaire with vendor info
      await chatServer.handleGenerateQuestionnaire(socket, {
        conversationId,
        vendorName: 'Acme Healthcare AI',
        solutionName: 'DiagnosticBot',
      }, 'user-id');

      // Verify title upgraded
      expect(socket.emit).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId,
        title: 'Assessment: Acme Healthcare AI',
      });
    });

    it('should NOT upgrade title if titleManuallyEdited is true', async () => {
      const conversationId = 'test-conv-id';
      const socket = createMockSocket();

      // Setup: Conversation with manually edited title
      await mockConversationService.setTitleManuallyEdited(conversationId, true);
      await mockConversationService.updateTitle(conversationId, 'My Custom Title');

      // Call generate_questionnaire
      await chatServer.handleGenerateQuestionnaire(socket, {
        conversationId,
        vendorName: 'Acme Corp',
      }, 'user-id');

      // Verify title NOT changed (no title update event)
      expect(socket.emit).not.toHaveBeenCalledWith(
        'conversation_title_updated',
        expect.anything()
      );
    });

    it('should use solutionName if vendorName not provided', async () => {
      const conversationId = 'test-conv-id';
      const socket = createMockSocket();

      await chatServer.handleGenerateQuestionnaire(socket, {
        conversationId,
        solutionName: 'SmartDiagnosis Tool',
      }, 'user-id');

      expect(socket.emit).toHaveBeenCalledWith('conversation_title_updated', {
        conversationId,
        title: 'Assessment: SmartDiagnosis Tool',
      });
    });

    it('should truncate long vendor names to 50 chars', async () => {
      const conversationId = 'test-conv-id';
      const socket = createMockSocket();

      const longVendorName = 'A Very Long Vendor Name That Exceeds The Maximum Allowed Length';

      await chatServer.handleGenerateQuestionnaire(socket, {
        conversationId,
        vendorName: longVendorName,
      }, 'user-id');

      const emittedEvent = socket.emit.mock.calls.find(
        call => call[0] === 'conversation_title_updated'
      );
      expect(emittedEvent[1].title.length).toBeLessThanOrEqual(50);
      expect(emittedEvent[1].title.startsWith('Assessment:')).toBe(true);
    });

    it('should NOT update title if no vendor/solution provided', async () => {
      const conversationId = 'test-conv-id';
      const socket = createMockSocket();

      // Setup: Conversation with LLM title
      await mockConversationService.updateTitle(conversationId, 'AI Vendor Questions');

      // Call generate_questionnaire without vendor info
      await chatServer.handleGenerateQuestionnaire(socket, {
        conversationId,
        // No vendorName or solutionName
      }, 'user-id');

      // Verify no title update event (title stays as LLM-generated)
      expect(socket.emit).not.toHaveBeenCalledWith(
        'conversation_title_updated',
        expect.anything()
      );
    });
  });
});
```

## Definition of Done

- [ ] Existing title upgrade logic verified working
- [ ] Integration tests added for title upgrade flow
- [ ] Manual title edits are respected (not overwritten)
- [ ] Truncation verified for long vendor names
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Code reviewed and approved

## Notes

This story is primarily a **verification story** - the core logic was implemented in Epic 25.3. The main deliverable is:
1. Confirming the logic works after Story 26.1 changes
2. Adding comprehensive tests for the upgrade flow
3. Documenting the two-phase title behavior (LLM first, vendor upgrade later)
