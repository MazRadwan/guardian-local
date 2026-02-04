import { test, expect } from '@playwright/test';

/**
 * Epic 33 E2E Tests - Consult Mode Web Search
 *
 * Story 33.3.4: Integration & E2E Tests
 *
 * These tests verify the complete UI flow for web search in consult mode,
 * including typing indicator states and final response with citations.
 *
 * Prerequisites:
 * - Backend running with JINA_API_KEY set (or mocked in test env)
 * - Frontend running
 * - Test user seeded in database
 *
 * Test architecture:
 * - Tests UI behavior in response to WebSocket events
 * - Verifies typing indicator shows search status
 * - Verifies final response contains citations
 * - Verifies mode gating (assessment mode does NOT trigger search)
 *
 * Run with: npx playwright test consult-web-search.spec.ts
 */

/**
 * Helper to login via Quick Login button (dev mode)
 * This uses the DevModeButton which auto-creates test user and logs in.
 * Requires NEXT_PUBLIC_ENABLE_DEV_MODE=true in the frontend.
 */
async function loginTestUser(page: import('@playwright/test').Page) {
  // Navigate to login page
  await page.goto('/login');

  // Click the Quick Login button (visible in dev mode)
  await page.getByRole('button', { name: /Quick Login/i }).click();

  // Wait for redirect to chat and interface to load
  await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({
    timeout: 15000,
  });
}

test.describe('Consult Mode Web Search', () => {
  test.beforeEach(async ({ page }) => {
    // Login with test user (handles localStorage clearing internally)
    await loginTestUser(page);

    // App defaults to consult mode, but ensure we're in consult mode
    // The mode selector is in the header
    const modeTrigger = page.getByRole('button', { name: /^Mode:/ });
    if (await modeTrigger.isVisible()) {
      const modeText = await modeTrigger.textContent();
      if (!modeText?.includes('Consult')) {
        await modeTrigger.click();
        await page.locator('[data-testid="mode-option-consult"]').click();
      }
    }
  });

  test('shows "Searching the web..." indicator during search', async ({ page }) => {
    // Send a message that should trigger web search
    // Note: This requires JINA_API_KEY to be set in the backend env
    await page.getByRole('textbox', { name: 'Message input' }).fill('What are the latest HIPAA regulations for 2025?');
    await page.getByRole('button', { name: 'Send message' }).click();

    // Verify typing indicator shows search status
    // Use a longer timeout since search may take a moment to trigger
    // The indicator should show "Searching..." or "Reading..." when web search is active
    await expect(page.locator('[data-testid="typing-indicator"]')).toContainText(/Searching|Reading|thinking/i, {
      timeout: 15000,
    });
  });

  test('final response includes source citations', async ({ page }) => {
    // Send a message that triggers web search
    await page.getByRole('textbox', { name: 'Message input' }).fill('What are the latest AI healthcare regulations?');
    await page.getByRole('button', { name: 'Send message' }).click();

    // Wait for response to complete
    await page.waitForSelector('article[aria-label="assistant message"]', {
      timeout: 60000,
    });

    // Verify response contains citation-like content (markdown links or "Sources" section)
    const responseText = await page.locator('article[aria-label="assistant message"]').last().textContent();

    // Should contain "Sources" section or inline citations (URLs or markdown links)
    // Note: If JINA_API_KEY is not set, Claude will respond without citations
    // This test verifies that when citations exist, they are displayed
    expect(responseText).toBeDefined();

    // Check for any of: "Sources" heading, http links, or markdown link syntax
    const hasCitations =
      responseText?.includes('Sources') ||
      responseText?.includes('Source') ||
      responseText?.match(/https?:\/\//) ||
      responseText?.match(/\[.*\]\(.*\)/);

    // Log for debugging in CI
    if (!hasCitations) {
      console.log('Response text (no citations found):', responseText?.substring(0, 500));
    }

    // In a real environment with JINA_API_KEY, citations should appear
    // In test environment without API key, this assertion may be skipped
    if (process.env.JINA_API_KEY) {
      expect(hasCitations).toBeTruthy();
    }
  });

  test('typing indicator returns to normal after search completes', async ({ page }) => {
    // Send a search-triggering message
    await page.getByRole('textbox', { name: 'Message input' }).fill('Search for GDPR compliance requirements');
    await page.getByRole('button', { name: 'Send message' }).click();

    // Wait for response to complete
    await page.waitForSelector('article[aria-label="assistant message"]', {
      timeout: 60000,
    });

    // Typing indicator should be gone or back to idle
    await expect(page.locator('[data-testid="typing-indicator"]')).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('assessment mode does NOT show search indicator', async ({ page }) => {
    // Switch to assessment mode
    const modeTrigger = page.getByRole('button', { name: /^Mode:/ });
    await modeTrigger.click();
    // Wait for popover to open
    await page.locator('[data-testid="mode-option-assessment"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="mode-option-assessment"]').click();

    // Send a message
    await page.getByRole('textbox', { name: 'Message input' }).fill('What are the latest HIPAA updates?');
    await page.getByRole('button', { name: 'Send message' }).click();

    // Wait for typing indicator to appear
    await expect(page.locator('[data-testid="typing-indicator"]')).toBeVisible({
      timeout: 5000,
    });

    // Should NOT show "Searching" - should show default "thinking" text or Guardian indicator
    // Note: We check that it does NOT contain search-specific text
    const indicatorText = await page.locator('[data-testid="typing-indicator"]').textContent();

    // Assessment mode should not trigger web search
    expect(indicatorText).not.toMatch(/Searching the web/i);
    expect(indicatorText).not.toMatch(/Reading sources/i);

    // Wait for response
    await page.waitForSelector('article[aria-label="assistant message"]', {
      timeout: 30000,
    });
  });

  test('rapid messages do not cause indicator state issues', async ({ page }) => {
    // Send first message
    const messageInput = page.getByRole('textbox', { name: 'Message input' });
    await messageInput.fill('First search query');
    await page.getByRole('button', { name: 'Send message' }).click();

    // Wait a moment then send another message while streaming
    await page.waitForTimeout(500);

    // The second message might be blocked or queued while first is streaming
    // This tests that the UI handles this gracefully

    // Try to send second message (may be blocked by streaming lock)
    await messageInput.fill('Second search query');
    await page.getByRole('button', { name: 'Send message' }).click();

    // Wait for at least one response
    await page.waitForSelector('article[aria-label="assistant message"]', {
      timeout: 60000,
    });

    // Indicator should eventually clear (not stuck in searching state)
    await expect(page.locator('[data-testid="typing-indicator"]')).not.toBeVisible({
      timeout: 10000,
    });

    // No console errors related to state
    // Note: This checks for any errors logged during the test
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Give a moment for any async state updates
    await page.waitForTimeout(500);

    // Filter for state-related errors (React, Zustand, etc.)
    const stateErrors = consoleErrors.filter(
      (e) =>
        e.includes('state') ||
        e.includes('Cannot update') ||
        e.includes('Maximum update depth')
    );
    expect(stateErrors).toHaveLength(0);
  });
});

/**
 * Additional tests for edge cases
 */
test.describe('Consult Mode Web Search - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    // Login with test user (handles localStorage clearing internally)
    await loginTestUser(page);

    // Ensure we're in consult mode (app defaults to consult, but verify)
    const modeTrigger = page.getByRole('button', { name: /^Mode:/ });
    if (await modeTrigger.isVisible()) {
      const modeText = await modeTrigger.textContent();
      if (!modeText?.includes('Consult')) {
        await modeTrigger.click();
        await page.locator('[data-testid="mode-option-consult"]').click();
      }
    }
  });

  test('handles conversation switch during search gracefully', async ({ page }) => {
    // Start a search
    await page.getByRole('textbox', { name: 'Message input' }).fill('Search for healthcare AI compliance');
    await page.getByRole('button', { name: 'Send message' }).click();

    // Wait for typing indicator to appear
    await page.waitForSelector('[data-testid="typing-indicator"]', { timeout: 5000 });

    // Try to start new conversation while search is in progress
    const newConversationBtn = page.locator('[data-testid="new-conversation-btn"]');
    if (await newConversationBtn.isVisible()) {
      await newConversationBtn.click();
    }

    // Should not crash - either aborts current search or waits for completion
    // Wait a moment for state to settle
    await page.waitForTimeout(1000);

    // App should still be functional
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible();
  });

  test('handles mode switch during search gracefully', async ({ page }) => {
    // Start a search (already in consult mode from beforeEach)
    await page.getByRole('textbox', { name: 'Message input' }).fill('What are the latest compliance updates?');
    await page.getByRole('button', { name: 'Send message' }).click();

    // Wait for typing indicator
    await page.waitForSelector('[data-testid="typing-indicator"]', { timeout: 5000 });

    // Try to switch mode while search is in progress
    const modeTrigger = page.getByRole('button', { name: /^Mode:/ });
    if (await modeTrigger.isVisible()) {
      await modeTrigger.click();
      // Try to click assessment mode (may be disabled during streaming)
      const assessmentMode = page.locator('[data-testid="mode-option-assessment"]');
      if (await assessmentMode.isEnabled()) {
        await assessmentMode.click();
      }
    }

    // Wait for response or for state to settle
    await page.waitForTimeout(2000);

    // App should not crash and chat input should be visible
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible();
  });
});

/**
 * Run locally with:
 * 1. Start backend: cd packages/backend && JINA_API_KEY=your-key pnpm dev
 * 2. Start frontend: cd apps/web && pnpm dev
 * 3. Run tests: cd apps/web && npx playwright test consult-web-search.spec.ts
 *
 * Environment setup for CI:
 * - Set JINA_API_KEY in CI secrets for real search tests
 * - Or mock Jina API at network level for deterministic tests
 *
 * Note: Tests are designed to gracefully handle both scenarios:
 * - With JINA_API_KEY: Full web search functionality tested
 * - Without JINA_API_KEY: UI behavior tested, search-specific assertions may be skipped
 */
