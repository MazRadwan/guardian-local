import { test, expect } from '@playwright/test';

/**
 * Epic 22 Story 22.1.4: E2E Tests - Scoring Card Rehydration
 *
 * Test Strategy:
 * 1. Login with cleared storage (triggers auto-create of new conversation)
 * 2. Wait for conversation ID to appear in URL (auto-created by app)
 * 3. Mock only the scoring API for that conversation
 * 4. Reload and verify the scoring card appears via rehydration
 *
 * This approach works because:
 * - After login with no saved conversation, app auto-creates one via WebSocket
 * - The conversation ID is set in localStorage and URL automatically
 * - No message is sent, avoiding LLM calls
 * - Only the scoring rehydration API is mocked
 *
 * Run with: npx playwright test scoring-persistence.spec.ts
 */

// Test user credentials (auto-created by dev-login endpoint)
const TEST_USER = {
  email: 'test@guardian.com',
  password: 'Test1234',
};

// Mock scoring result data that matches backend response shape
const MOCK_SCORING_RESULT = {
  compositeScore: 72,
  recommendation: 'conditional',
  overallRiskRating: 'medium',
  executiveSummary: 'The AI vendor demonstrates moderate risk across key dimensions. Data privacy controls are adequate but security practices need improvement.',
  keyFindings: [
    'Strong data encryption practices',
    'Inadequate third-party audit documentation',
    'Compliance with HIPAA requirements verified',
  ],
  dimensionScores: [
    { dimension: 'Data Privacy', score: 80, riskRating: 'low' },
    { dimension: 'Security', score: 65, riskRating: 'medium' },
    { dimension: 'Compliance', score: 78, riskRating: 'low' },
    { dimension: 'Transparency', score: 70, riskRating: 'medium' },
    { dimension: 'Accountability', score: 68, riskRating: 'medium' },
    { dimension: 'Data Governance', score: 75, riskRating: 'low' },
    { dimension: 'AI Ethics', score: 72, riskRating: 'medium' },
    { dimension: 'Vendor Stability', score: 69, riskRating: 'medium' },
    { dimension: 'Integration Risk', score: 74, riskRating: 'low' },
    { dimension: 'Clinical Validation', score: 71, riskRating: 'medium' },
  ],
  batchId: 'batch-e2e-test-123',
  assessmentId: 'assess-e2e-test-456',
};

/**
 * Helper to login with test user credentials.
 * Clears storage first to trigger auto-create flow.
 */
async function loginTestUser(page: import('@playwright/test').Page) {
  // Clear storage to ensure clean state and trigger auto-create
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.goto('/login');

  // Fill login form
  await page.locator('#email').fill(TEST_USER.email);
  await page.locator('#password').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for redirect to chat
  await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({
    timeout: 10000,
  });
}

/**
 * Wait for the app to auto-create a conversation and return its ID.
 * After login with cleared storage, the app auto-creates a new conversation.
 */
async function waitForAutoCreatedConversation(page: import('@playwright/test').Page): Promise<string> {
  // Wait for conversation ID to appear in URL
  // The app auto-creates a conversation after login if no saved conversation exists
  await page.waitForFunction(
    () => {
      const url = new URL(window.location.href);
      return url.searchParams.get('conversation') !== null;
    },
    { timeout: 15000 }
  );

  // Extract conversation ID from URL
  const url = new URL(page.url());
  const conversationId = url.searchParams.get('conversation');

  if (!conversationId) {
    throw new Error('Failed to get conversation ID from URL');
  }

  // Verify localStorage is also set (confirms proper state setup)
  const storedId = await page.evaluate(() => localStorage.getItem('guardian_conversation_id'));
  if (storedId !== conversationId) {
    throw new Error(`localStorage mismatch: ${storedId} !== ${conversationId}`);
  }

  return conversationId;
}

/**
 * Setup mock for scoring API endpoint for a specific conversation.
 * Only mocks the scoring rehydration API.
 */
function setupScoringApiMock(
  page: import('@playwright/test').Page,
  conversationId: string,
  result: typeof MOCK_SCORING_RESULT | null = MOCK_SCORING_RESULT
) {
  return page.route(`**/api/scoring/conversation/${conversationId}`, async (route) => {
    if (result) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result),
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'No scoring result found' }),
      });
    }
  });
}

test.describe('Scoring Card Rehydration (Epic 22)', () => {
  test('scoring card displays after rehydration on page reload', async ({ page }) => {
    // 1. Login (triggers auto-create of conversation)
    await loginTestUser(page);

    // 2. Wait for auto-created conversation
    const conversationId = await waitForAutoCreatedConversation(page);

    // 3. Set up scoring API mock for this conversation
    await setupScoringApiMock(page, conversationId, MOCK_SCORING_RESULT);

    // 4. Reload the page - this triggers rehydration
    await page.reload();

    // 5. Wait for scoring card to appear (rehydration from mock API)
    await expect(page.locator('[data-testid="scoring-result-card"]')).toBeVisible({
      timeout: 15000,
    });

    // 6. Verify composite score
    const compositeScore = await page.locator('[data-testid="composite-score"]').textContent();
    expect(compositeScore).toBe(String(MOCK_SCORING_RESULT.compositeScore));

    // 7. Verify overall risk
    const overallRisk = await page.locator('[data-testid="overall-risk"]').textContent();
    expect(overallRisk?.toLowerCase()).toBe(MOCK_SCORING_RESULT.overallRiskRating);

    // 8. Verify recommendation
    const recommendation = await page.locator('[data-testid="recommendation"]').textContent();
    expect(recommendation?.toLowerCase()).toContain('conditional');
  });

  test('scoring card data persists correctly across multiple reloads', async ({ page }) => {
    // 1. Login and wait for auto-created conversation
    await loginTestUser(page);
    const conversationId = await waitForAutoCreatedConversation(page);

    // 2. Setup mock and reload
    await setupScoringApiMock(page, conversationId, MOCK_SCORING_RESULT);
    await page.reload();

    // 3. Wait for initial scoring card
    await expect(page.locator('[data-testid="scoring-result-card"]')).toBeVisible({
      timeout: 15000,
    });

    // 4. Capture values
    const scoreBefore = await page.locator('[data-testid="composite-score"]').textContent();
    const riskBefore = await page.locator('[data-testid="overall-risk"]').textContent();

    // 5. Reload again (need to re-setup mock after page.reload clears routes)
    await setupScoringApiMock(page, conversationId, MOCK_SCORING_RESULT);
    await page.reload();

    // 6. Wait for card to reappear
    await expect(page.locator('[data-testid="scoring-result-card"]')).toBeVisible({
      timeout: 15000,
    });

    // 7. Verify data matches
    const scoreAfter = await page.locator('[data-testid="composite-score"]').textContent();
    const riskAfter = await page.locator('[data-testid="overall-risk"]').textContent();

    expect(scoreAfter).toBe(scoreBefore);
    expect(riskAfter).toBe(riskBefore);
  });

  test('no scoring card when API returns 404', async ({ page }) => {
    // 1. Login and wait for auto-created conversation
    await loginTestUser(page);
    const conversationId = await waitForAutoCreatedConversation(page);

    // 2. Setup mock to return 404
    await setupScoringApiMock(page, conversationId, null);

    // 3. Reload
    await page.reload();

    // 4. Wait for chat interface to be ready (message input visible)
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({
      timeout: 10000,
    });

    // 5. Verify scoring card is NOT visible
    // Use a short timeout since we're checking for absence
    await expect(page.locator('[data-testid="scoring-result-card"]')).not.toBeVisible({
      timeout: 3000,
    });
  });

  test('scoring card displays dimension scores correctly', async ({ page }) => {
    // 1. Login and wait for auto-created conversation
    await loginTestUser(page);
    const conversationId = await waitForAutoCreatedConversation(page);

    // 2. Setup mock and reload
    await setupScoringApiMock(page, conversationId, MOCK_SCORING_RESULT);
    await page.reload();

    // 3. Wait for scoring card
    await expect(page.locator('[data-testid="scoring-result-card"]')).toBeVisible({
      timeout: 15000,
    });

    // 4. Expand dimension scores if collapsed
    const dimensionButton = page.getByRole('button', { name: /Dimension Scores/i });
    if (await dimensionButton.isVisible()) {
      await dimensionButton.click();
    }

    // 5. Verify dimension names are visible
    await expect(page.getByText('Data Privacy')).toBeVisible();
    await expect(page.getByText('Security')).toBeVisible();
  });

  test('scoring card displays key findings', async ({ page }) => {
    // 1. Login and wait for auto-created conversation
    await loginTestUser(page);
    const conversationId = await waitForAutoCreatedConversation(page);

    // 2. Setup mock and reload
    await setupScoringApiMock(page, conversationId, MOCK_SCORING_RESULT);
    await page.reload();

    // 3. Wait for scoring card
    await expect(page.locator('[data-testid="scoring-result-card"]')).toBeVisible({
      timeout: 15000,
    });

    // 4. Verify key findings section
    await expect(page.getByText('Key Findings')).toBeVisible();
    await expect(page.getByText(MOCK_SCORING_RESULT.keyFindings[0])).toBeVisible();
  });

  test('export buttons are present on rehydrated scoring card', async ({ page }) => {
    // 1. Login and wait for auto-created conversation
    await loginTestUser(page);
    const conversationId = await waitForAutoCreatedConversation(page);

    // 2. Setup mock and reload
    await setupScoringApiMock(page, conversationId, MOCK_SCORING_RESULT);
    await page.reload();

    // 3. Wait for scoring card
    await expect(page.locator('[data-testid="scoring-result-card"]')).toBeVisible({
      timeout: 15000,
    });

    // 4. Verify export buttons
    await expect(page.getByRole('button', { name: /Export PDF/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Export Word/i })).toBeVisible();
  });
});

test.describe('Scoring Rehydration Edge Cases (Epic 22)', () => {
  test('handles slow API response gracefully', async ({ page }) => {
    // 1. Login and wait for auto-created conversation
    await loginTestUser(page);
    const conversationId = await waitForAutoCreatedConversation(page);

    // 2. Setup slow mock (3 second delay)
    await page.route(`**/api/scoring/conversation/${conversationId}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SCORING_RESULT),
      });
    });

    // 3. Reload
    await page.reload();

    // 4. Wait for scoring card with extended timeout
    await expect(page.locator('[data-testid="scoring-result-card"]')).toBeVisible({
      timeout: 20000,
    });

    // 5. Verify data loaded
    const compositeScore = await page.locator('[data-testid="composite-score"]').textContent();
    expect(compositeScore).toBe(String(MOCK_SCORING_RESULT.compositeScore));
  });

  test('handles API error gracefully', async ({ page }) => {
    // 1. Login and wait for auto-created conversation
    await loginTestUser(page);
    const conversationId = await waitForAutoCreatedConversation(page);

    // 2. Setup error mock
    await page.route(`**/api/scoring/conversation/${conversationId}`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    // 3. Reload
    await page.reload();

    // 4. Wait for chat interface to be ready
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({
      timeout: 10000,
    });

    // 5. Scoring card should NOT appear (error case)
    await expect(page.locator('[data-testid="scoring-result-card"]')).not.toBeVisible({
      timeout: 3000,
    });

    // 6. App should still be functional
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible();
  });
});

/**
 * Test Coverage Notes:
 *
 * These E2E tests verify the FRONTEND rehydration behavior:
 * - Real conversation is auto-created after login (proper WebSocket state)
 * - No messages are sent (avoids LLM calls)
 * - Only the scoring API is mocked (rehydration data)
 * - Tests verify the card renders correctly from rehydrated data
 *
 * For BACKEND persistence testing, see:
 * - packages/backend/__tests__/integration/scoring-rehydration.test.ts
 *
 * For FULL end-to-end persistence (with actual scoring):
 * 1. Upload a completed questionnaire PDF
 * 2. Wait for scoring to complete (~60s)
 * 3. Reload page
 * 4. Verify card reappears with same data
 *
 * That flow is tested manually or in a dedicated slow E2E suite
 * due to the 60+ second scoring time.
 */
