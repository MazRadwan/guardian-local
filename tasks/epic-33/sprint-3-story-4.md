# Story 33.3.4: Integration & E2E Tests

## Description

Create integration tests (Jest) and E2E tests (Playwright) that verify the complete consult mode web search flow works end-to-end. This includes tool invocation, Jina API mocking, tool_result handling, final response with citations, and browser-based verification of the UI flow.

## Acceptance Criteria

### Backend Integration Tests (Jest)
- [ ] Integration test verifies complete tool_use -> tool_result -> final answer flow
- [ ] Test mocks Jina API responses (no real external calls)
- [ ] Test verifies tool_status events are emitted
- [ ] Test verifies assistant_done is emitted only once (after final answer)
- [ ] Test verifies citations appear in final response
- [ ] Test verifies assessment mode does NOT trigger web search
- [ ] Test verifies search errors are handled gracefully

### E2E Tests (Playwright)
- [ ] E2E test verifies consult mode web search UI flow
- [ ] Test shows typing indicator with "Searching the web..." text during search
- [ ] Test shows "Reading sources..." during content reading
- [ ] Test verifies final response appears with source citations
- [ ] Test verifies indicator returns to normal after search completes
- [ ] Test verifies assessment mode does NOT show search indicator

## Technical Approach

**IMPORTANT:** Base test setup on existing patterns in `packages/backend/__tests__/e2e/websocket-chat.test.ts`. The helpers referenced below (`createTestChatServer`, `connectTestSocket`, `waitForEvent`, `createConversation`) do not exist - this story must either:

1. **Option A (Recommended):** Create reusable test helpers in `packages/backend/__tests__/helpers/websocket-test-helpers.ts` that can be shared
2. **Option B:** Inline the test setup using patterns from the existing E2E tests

Reference the existing `websocket-chat.test.ts` for patterns on:
- Creating HTTP server and attaching Socket.IO
- Connecting test sockets with proper cleanup
- Waiting for WebSocket events with timeouts
- Creating conversations via socket emit

Create integration test that spins up real ChatServer with mocked JinaClient:

```typescript
// In __tests__/integration/consult-web-search.test.ts
// NOTE: Either create helpers or inline setup based on websocket-chat.test.ts patterns
describe('Consult Mode Web Search', () => {
  let mockJinaClient: jest.Mocked<IJinaClient>;
  let chatServer: ChatServer;
  let socket: Socket;

  beforeEach(async () => {
    // Create mock Jina client
    mockJinaClient = {
      search: jest.fn().mockResolvedValue([
        { title: 'HIPAA 2024 Updates', url: 'https://example.com/hipaa', snippet: 'Latest changes...' },
      ]),
      readUrl: jest.fn().mockResolvedValue({
        url: 'https://example.com/hipaa',
        content: 'Full article content about HIPAA updates...',
        title: 'HIPAA 2024 Updates',
      }),
      readUrls: jest.fn().mockImplementation(async (urls) =>
        urls.map(url => ({
          url,
          content: 'Article content...',
          title: 'Source title',
        }))
      ),
    };

    // Setup based on existing websocket-chat.test.ts patterns
    // Either use shared helpers (if created) or inline the setup
    chatServer = createTestChatServer({
      jinaClient: mockJinaClient,
    });

    // Connect test socket
    socket = await connectTestSocket(chatServer);
  });

  afterEach(async () => {
    await disconnectTestSocket(socket);
    await chatServer.close();
  });

  it('should complete tool loop and emit citations', async () => {
    // Arrange: Create consult mode conversation
    const conversationId = await createConversation(socket, 'consult');

    // Act: Send message that triggers web search
    const events: any[] = [];
    socket.on('tool_status', (data) => events.push({ type: 'tool_status', data }));
    socket.on('assistant_token', (data) => events.push({ type: 'token', data }));
    socket.on('assistant_done', (data) => events.push({ type: 'done', data }));

    socket.emit('send_message', {
      conversationId,
      content: 'What are the latest HIPAA updates for 2024?',
    });

    // Wait for completion
    await waitForEvent(socket, 'assistant_done', 30000);

    // Assert: Verify tool_status events
    const toolStatusEvents = events.filter(e => e.type === 'tool_status');
    expect(toolStatusEvents).toContainEqual({ type: 'tool_status', data: { conversationId, status: 'searching' } });
    expect(toolStatusEvents).toContainEqual({ type: 'tool_status', data: { conversationId, status: 'idle' } });

    // Assert: Only one assistant_done
    const doneEvents = events.filter(e => e.type === 'done');
    expect(doneEvents).toHaveLength(1);

    // Assert: Final response includes citation
    const doneEvent = doneEvents[0];
    expect(doneEvent.data.fullText).toContain('Sources');
    expect(doneEvent.data.fullText).toMatch(/\[.*\]\(https:\/\//);
  });

  it('should NOT trigger web search in assessment mode', async () => {
    // Arrange: Create assessment mode conversation
    const conversationId = await createConversation(socket, 'assessment');

    // Act: Send message
    socket.emit('send_message', {
      conversationId,
      content: 'What are the latest HIPAA updates?',
    });

    await waitForEvent(socket, 'assistant_done', 10000);

    // Assert: Jina was not called
    expect(mockJinaClient.search).not.toHaveBeenCalled();
  });

  it('should handle Jina API errors gracefully', async () => {
    // Arrange: Make Jina fail
    mockJinaClient.search.mockRejectedValueOnce(new Error('API rate limited'));

    const conversationId = await createConversation(socket, 'consult');

    // Act: Send message
    socket.emit('send_message', {
      conversationId,
      content: 'Search for something',
    });

    await waitForEvent(socket, 'assistant_done', 10000);

    // Assert: Response completed (no crash)
    // Claude should answer based on knowledge (error as tool_result)
    expect(mockJinaClient.search).toHaveBeenCalled();
  });
});
```

## Files Touched

- `packages/backend/__tests__/integration/consult-web-search.test.ts` - CREATE: Backend integration test file
- `apps/web/e2e/consult-web-search.spec.ts` - CREATE: Playwright E2E test file

## Tests Affected

No existing tests should break (new test files).

## Agent Assignment

- [x] backend-agent

## Tests Required

This story IS the tests. The integration and E2E tests constitute the required test coverage.

---

## Playwright E2E Tests

**File:** `apps/web/e2e/consult-web-search.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

/**
 * Epic 33 E2E Tests - Consult Mode Web Search
 *
 * These tests verify the complete UI flow for web search in consult mode,
 * including typing indicator states and final response with citations.
 *
 * Prerequisites:
 * - Backend running with JINA_API_KEY set (or mocked in test env)
 * - Frontend running
 *
 * Run with: npx playwright test consult-web-search.spec.ts
 */

test.describe('Consult Mode Web Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Switch to consult mode
    await page.click('[data-testid="mode-selector"]');
    await page.click('[data-testid="consult-mode"]');
  });

  test('shows "Searching the web..." indicator during search', async ({ page }) => {
    // Send a message that should trigger web search
    await page.fill('[data-testid="chat-input"]', 'What are the latest HIPAA regulations for 2025?');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Verify typing indicator shows search status
    // Use a longer timeout since search may take a moment to trigger
    await expect(page.locator('[data-testid="typing-indicator"]')).toContainText(/Searching|Reading/, {
      timeout: 15000,
    });
  });

  test('final response includes source citations', async ({ page }) => {
    // Send a message that triggers web search
    await page.fill('[data-testid="chat-input"]', 'What are the latest AI healthcare regulations?');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for response to complete
    await page.waitForSelector('[data-testid="assistant-message"]', {
      timeout: 60000,
    });

    // Verify response contains citation-like content (markdown links)
    const responseText = await page.locator('[data-testid="assistant-message"]').last().textContent();

    // Should contain "Sources" section or inline citations
    expect(responseText).toMatch(/Sources|Source|http|https|\[.*\]\(.*\)/i);
  });

  test('typing indicator returns to normal after search completes', async ({ page }) => {
    // Send a search-triggering message
    await page.fill('[data-testid="chat-input"]', 'Search for GDPR compliance requirements');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for response to complete
    await page.waitForSelector('[data-testid="assistant-message"]', {
      timeout: 60000,
    });

    // Typing indicator should be gone or back to idle
    await expect(page.locator('[data-testid="typing-indicator"]')).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('assessment mode does NOT show search indicator', async ({ page }) => {
    // Switch to assessment mode
    await page.click('[data-testid="mode-selector"]');
    await page.click('[data-testid="assessment-mode"]');

    // Send a message
    await page.fill('[data-testid="chat-input"]', 'What are the latest HIPAA updates?');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for typing indicator to appear
    await expect(page.locator('[data-testid="typing-indicator"]')).toBeVisible({
      timeout: 5000,
    });

    // Should NOT show "Searching" - should show default "thinking" text
    await expect(page.locator('[data-testid="typing-indicator"]')).not.toContainText(/Searching|Reading/);
    await expect(page.locator('[data-testid="typing-indicator"]')).toContainText(/thinking|Guardian/i);

    // Wait for response
    await page.waitForSelector('[data-testid="assistant-message"]', {
      timeout: 30000,
    });
  });

  test('rapid messages do not cause indicator state issues', async ({ page }) => {
    // Send first message
    await page.fill('[data-testid="chat-input"]', 'First search query');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Immediately send second message (should be queued or ignored while streaming)
    await page.fill('[data-testid="chat-input"]', 'Second search query');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for responses
    await page.waitForSelector('[data-testid="assistant-message"]', {
      timeout: 60000,
    });

    // Indicator should eventually clear
    await expect(page.locator('[data-testid="typing-indicator"]')).not.toBeVisible({
      timeout: 10000,
    });

    // No console errors related to state
    const consoleErrors = await page.evaluate(() => {
      // Check for any React state errors logged
      return (window as any).__testConsoleErrors || [];
    });
    expect(consoleErrors.filter((e: string) => e.includes('state'))).toHaveLength(0);
  });
});

/**
 * Run locally with:
 * 1. Start backend: cd packages/backend && pnpm dev
 * 2. Start frontend: cd apps/web && pnpm dev
 * 3. Run tests: cd apps/web && npx playwright test consult-web-search.spec.ts
 *
 * Note: For real search to work, JINA_API_KEY must be set in backend env.
 * In CI, consider mocking the Jina API at the network level.
 */
```

---

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Backend integration tests written and passing
- [ ] Playwright E2E tests written and passing
- [ ] Tests use mocked Jina client (no external calls in CI)
- [ ] Tests run in CI without JINA_API_KEY
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] E2E tests pass locally with `npx playwright test consult-web-search.spec.ts`
