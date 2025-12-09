import { test, expect, Download } from '@playwright/test';

/**
 * Epic 12 E2E Tests - Tool-Based Questionnaire Generation
 *
 * These tests verify the complete flow from conversation to questionnaire generation
 * using the tool-based trigger approach (now the only approach).
 *
 * Prerequisites:
 * - Backend running
 * - Frontend running
 * - Test user account available
 *
 * Run with: npx playwright test questionnaire-generation.spec.ts
 */

// Story 13.3.4: Mock export API responses for download tests
// Uses wildcard pattern to match any assessmentId from backend
const MOCK_PDF_CONTENT = Buffer.from('Mock PDF content for testing');
const MOCK_WORD_CONTENT = Buffer.from('Mock Word content for testing');
const MOCK_EXCEL_CONTENT = Buffer.from('Mock Excel content for testing');

/**
 * Intercepts all export API requests regardless of assessmentId.
 * The actual assessmentId comes from the backend's export_ready WebSocket payload,
 * so we use a wildcard pattern to match any ID.
 */
function setupExportApiMock(page: import('@playwright/test').Page) {
  // Use wildcard (*) to match any assessmentId
  return page.route('**/api/assessments/*/export/*', async (route) => {
    const url = route.request().url();
    let content: Buffer;
    let contentType: string;
    let filename: string;

    if (url.includes('/export/pdf')) {
      content = MOCK_PDF_CONTENT;
      contentType = 'application/pdf';
      filename = 'questionnaire.pdf';
    } else if (url.includes('/export/word')) {
      content = MOCK_WORD_CONTENT;
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      filename = 'questionnaire.docx';
    } else if (url.includes('/export/excel')) {
      content = MOCK_EXCEL_CONTENT;
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = 'questionnaire.xlsx';
    } else {
      await route.fulfill({ status: 404 });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: content,
    });
  });
}

test.describe('Questionnaire Generation (Tool Flow)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('/');

    // TODO: Add login steps once auth is implemented
    // For now, assuming direct access to chat interface
    // await page.fill('[data-testid="email-input"]', 'test@example.com');
    // await page.fill('[data-testid="password-input"]', 'password123');
    // await page.click('[data-testid="login-button"]');
  });

  test('Scenario 1: tool flow shows generate button', async ({ page }) => {
    // Start conversation in assessment mode
    await page.click('[data-testid="mode-selector"]');
    await page.click('[data-testid="assessment-mode"]');

    // Send message that triggers tool
    await page.fill('[data-testid="chat-input"]', 'Yes, generate a comprehensive questionnaire');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for and verify button appears (tool was called)
    await expect(page.locator('[data-testid="questionnaire-card-ready"]')).toBeVisible({
      timeout: 15000
    });
    await expect(page.locator('text=Comprehensive Assessment')).toBeVisible();
    await expect(page.locator('[data-testid="generate-questionnaire-btn"]')).toBeEnabled();
  });

  test('Scenario 1 continued: clicking button triggers generation', async ({ page }) => {
    // Setup: Navigate to state where button is showing
    // (In real test, might need to repeat previous test steps or use fixtures)
    await page.click('[data-testid="mode-selector"]');
    await page.click('[data-testid="assessment-mode"]');
    await page.fill('[data-testid="chat-input"]', 'Yes, generate a comprehensive questionnaire');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for button to appear
    await expect(page.locator('[data-testid="questionnaire-card-ready"]')).toBeVisible({
      timeout: 15000
    });

    // Click the generate button
    await page.click('[data-testid="generate-questionnaire-btn"]');

    // Verify loading state
    await expect(page.locator('text=Generating')).toBeVisible();

    // Wait for completion (questionnaire content streams in as markdown)
    // Look for questionnaire heading or content in the chat
    await expect(page.locator('text=Assessment Questionnaire').or(page.locator('text=Risk Assessment'))).toBeVisible({
      timeout: 60000
    });

    // Verify download buttons appear (card transitions to download state)
    await expect(page.locator('[data-testid="questionnaire-card-download"]')).toBeVisible({
      timeout: 10000
    });
    await expect(page.locator('[data-testid="download-pdf-btn"]')).toBeVisible();
  });

  test('Scenario 4: no tool call for questions about questionnaires', async ({ page }) => {
    // Start conversation in assessment mode
    await page.click('[data-testid="mode-selector"]');
    await page.click('[data-testid="assessment-mode"]');

    // Ask a question (should NOT trigger tool)
    await page.fill('[data-testid="chat-input"]', 'What questions are in a typical assessment?');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for response
    await page.waitForSelector('[data-testid="assistant-message"]', {
      timeout: 15000
    });

    // Verify NO generate button appeared
    await expect(page.locator('[data-testid="questionnaire-card-ready"]')).not.toBeVisible();
  });

  test('Scenario 5: conversation switch clears button', async ({ page }) => {
    // Trigger questionnaire_ready (button appears)
    await page.click('[data-testid="mode-selector"]');
    await page.click('[data-testid="assessment-mode"]');
    await page.fill('[data-testid="chat-input"]', 'Generate the questionnaire');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for button to appear
    await expect(page.locator('[data-testid="questionnaire-card-ready"]')).toBeVisible({
      timeout: 15000
    });

    // Switch to new conversation
    await page.click('[data-testid="new-conversation-btn"]');

    // Verify button disappears
    await expect(page.locator('[data-testid="questionnaire-card-ready"]')).not.toBeVisible();

    // Switch back to original conversation (if conversation list exists)
    // await page.click('[data-testid="conversation-list-item-0"]');

    // Verify button is still gone
    // await expect(page.locator('[data-testid="questionnaire-card-ready"]')).not.toBeVisible();
  });

  test('Edge case: rapid button clicking', async ({ page }) => {
    // Setup: get to state with button showing
    await page.click('[data-testid="mode-selector"]');
    await page.click('[data-testid="assessment-mode"]');
    await page.fill('[data-testid="chat-input"]', 'Generate questionnaire');
    await page.press('[data-testid="chat-input"]', 'Enter');

    await expect(page.locator('[data-testid="questionnaire-card-ready"]')).toBeVisible({
      timeout: 15000
    });

    // Rapid click the button multiple times
    const button = page.locator('[data-testid="generate-questionnaire-btn"]');
    await button.click();
    await button.click(); // Should be disabled by now
    await button.click();

    // Verify only ONE questionnaire is generated
    // (Check that button is disabled and loading state is active)
    await expect(button).toBeDisabled();
    await expect(page.locator('text=Generating')).toBeVisible();

    // Wait for generation to complete (questionnaire content appears as markdown)
    await expect(page.locator('text=Assessment Questionnaire').or(page.locator('text=Risk Assessment'))).toBeVisible({
      timeout: 60000
    });

    // Verify only one download card appears (not multiple)
    const downloadCards = await page.locator('[data-testid="questionnaire-card-download"]').count();
    expect(downloadCards).toBe(1);
  });
});

/**
 * Story 13.3.4: Durable Download Tests
 *
 * These tests verify that download buttons remain visible after download
 * and that the download state survives page reload.
 */
test.describe('Durable Downloads (Story 13.3)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('/');

    // Setup export API mock
    await setupExportApiMock(page);

    // TODO: Add login steps once auth is implemented
  });

  test('download buttons remain visible after downloading', async ({ page }) => {
    // Setup: Trigger questionnaire generation and wait for download state
    await page.click('[data-testid="mode-selector"]');
    await page.click('[data-testid="assessment-mode"]');
    await page.fill('[data-testid="chat-input"]', 'Generate a comprehensive questionnaire');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for ready state
    await expect(page.locator('[data-testid="questionnaire-card-ready"]')).toBeVisible({
      timeout: 15000,
    });

    // Click generate button
    await page.click('[data-testid="generate-questionnaire-btn"]');

    // Wait for download state
    await expect(page.locator('[data-testid="questionnaire-card-download"]')).toBeVisible({
      timeout: 60000,
    });

    // Download PDF
    const [download1] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-pdf-btn"]'),
    ]);

    // Verify download completed
    expect(download1.suggestedFilename()).toContain('.pdf');

    // KEY ASSERTION: Download buttons should STILL be visible after download
    await expect(page.locator('[data-testid="questionnaire-card-download"]')).toBeVisible();
    await expect(page.locator('[data-testid="download-pdf-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="download-word-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="download-excel-btn"]')).toBeVisible();
  });

  test('can download multiple formats sequentially', async ({ page }) => {
    // Setup: Trigger questionnaire generation and wait for download state
    await page.click('[data-testid="mode-selector"]');
    await page.click('[data-testid="assessment-mode"]');
    await page.fill('[data-testid="chat-input"]', 'Generate a comprehensive questionnaire');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for ready state
    await expect(page.locator('[data-testid="questionnaire-card-ready"]')).toBeVisible({
      timeout: 15000,
    });

    // Click generate button
    await page.click('[data-testid="generate-questionnaire-btn"]');

    // Wait for download state
    await expect(page.locator('[data-testid="questionnaire-card-download"]')).toBeVisible({
      timeout: 60000,
    });

    // Download PDF
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-pdf-btn"]'),
    ]);
    expect(pdfDownload.suggestedFilename()).toContain('.pdf');

    // Download Word (buttons should still be visible)
    await expect(page.locator('[data-testid="download-word-btn"]')).toBeVisible();
    const [wordDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-word-btn"]'),
    ]);
    expect(wordDownload.suggestedFilename()).toContain('.docx');

    // Download Excel (buttons should still be visible)
    await expect(page.locator('[data-testid="download-excel-btn"]')).toBeVisible();
    const [excelDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-excel-btn"]'),
    ]);
    expect(excelDownload.suggestedFilename()).toContain('.xlsx');

    // All buttons should STILL be visible after all downloads
    await expect(page.locator('[data-testid="questionnaire-card-download"]')).toBeVisible();
  });

  test('download state survives page reload', async ({ page, context }) => {
    // Setup: Trigger questionnaire generation and wait for download state
    await page.click('[data-testid="mode-selector"]');
    await page.click('[data-testid="assessment-mode"]');
    await page.fill('[data-testid="chat-input"]', 'Generate a comprehensive questionnaire');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for ready state
    await expect(page.locator('[data-testid="questionnaire-card-ready"]')).toBeVisible({
      timeout: 15000,
    });

    // Click generate button
    await page.click('[data-testid="generate-questionnaire-btn"]');

    // Wait for download state
    await expect(page.locator('[data-testid="questionnaire-card-download"]')).toBeVisible({
      timeout: 60000,
    });

    // Download PDF to verify download state is active
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-pdf-btn"]'),
    ]);
    expect(download.suggestedFilename()).toContain('.pdf');

    // Reload the page
    await page.reload();

    // Re-setup export API mock after reload
    await setupExportApiMock(page);

    // KEY ASSERTION: Download state should be restored from localStorage
    await expect(page.locator('[data-testid="questionnaire-card-download"]')).toBeVisible({
      timeout: 5000,
    });

    // Download buttons should be available again
    await expect(page.locator('[data-testid="download-pdf-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="download-word-btn"]')).toBeVisible();

    // Should be able to download again after reload
    const [redownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-word-btn"]'),
    ]);
    expect(redownload.suggestedFilename()).toContain('.docx');
  });

  test('download state clears when conversation is deleted', async ({ page }) => {
    // Setup: Trigger questionnaire generation and wait for download state
    await page.click('[data-testid="mode-selector"]');
    await page.click('[data-testid="assessment-mode"]');
    await page.fill('[data-testid="chat-input"]', 'Generate a comprehensive questionnaire');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for ready state
    await expect(page.locator('[data-testid="questionnaire-card-ready"]')).toBeVisible({
      timeout: 15000,
    });

    // Click generate button
    await page.click('[data-testid="generate-questionnaire-btn"]');

    // Wait for download state
    await expect(page.locator('[data-testid="questionnaire-card-download"]')).toBeVisible({
      timeout: 60000,
    });

    // Delete the conversation (if delete button exists)
    const deleteButton = page.locator('[data-testid="delete-conversation-btn"]');
    if (await deleteButton.isVisible()) {
      await deleteButton.click();

      // Confirm deletion if there's a confirmation dialog
      const confirmButton = page.locator('[data-testid="confirm-delete-btn"]');
      if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmButton.click();
      }

      // Download card should disappear
      await expect(page.locator('[data-testid="questionnaire-card-download"]')).not.toBeVisible();
    }
  });

  test('new questionnaire_ready clears previous download state', async ({ page }) => {
    // Setup: Trigger questionnaire generation and wait for download state
    await page.click('[data-testid="mode-selector"]');
    await page.click('[data-testid="assessment-mode"]');
    await page.fill('[data-testid="chat-input"]', 'Generate a comprehensive questionnaire');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for ready state
    await expect(page.locator('[data-testid="questionnaire-card-ready"]')).toBeVisible({
      timeout: 15000,
    });

    // Click generate button
    await page.click('[data-testid="generate-questionnaire-btn"]');

    // Wait for download state
    await expect(page.locator('[data-testid="questionnaire-card-download"]')).toBeVisible({
      timeout: 60000,
    });

    // Request a new questionnaire in the same conversation
    await page.fill('[data-testid="chat-input"]', 'Generate a quick questionnaire instead');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for new ready state (replaces download state)
    await expect(page.locator('[data-testid="questionnaire-card-ready"]')).toBeVisible({
      timeout: 15000,
    });

    // Previous download state should be cleared
    await expect(page.locator('[data-testid="questionnaire-card-download"]')).not.toBeVisible();
  });
});

/**
 * CI Configuration Notes:
 *
 * playwright.config.ts is now configured with:
 * - testDir: './e2e'
 * - timeout: 120000 (2 minutes for long-running Claude responses)
 * - retries: 2 on CI, 1 locally
 * - acceptDownloads: true (Story 13.3.4 - required for download tests)
 * - screenshot/video on failure
 *
 * To run E2E tests:
 * 1. Install Playwright: pnpm add -D @playwright/test && npx playwright install
 * 2. Start backend: pnpm --filter @guardian/backend dev
 * 3. Run tests: npx playwright test
 *
 * Environment setup for CI:
 * - Ensure backend and frontend are running before tests
 * - Use test database to avoid polluting production data
 * - Optional: Set GUARDIAN_FAST_GENERATION=true for faster fixture-based tests
 */
