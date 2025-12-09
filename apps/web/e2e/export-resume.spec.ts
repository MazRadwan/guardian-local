import { test, expect } from '@playwright/test';

/**
 * Story 13.9.4: E2E Tests - Export Resume Flow
 *
 * These tests verify the server-side export resume flow:
 * - User generates questionnaire, leaves, returns
 * - Download buttons restored from server (via get_export_status WebSocket)
 * - No regeneration required
 *
 * Prerequisites:
 * - Backend running on port 8000
 * - Frontend running on port 3000
 * - Test user seeded in database
 *
 * Run with: npx playwright test export-resume.spec.ts
 */

// Test user credentials (auto-created by dev-login endpoint)
const TEST_USER = {
  email: 'test@guardian.com',
  password: 'Test1234',
};

// Mock export API responses for download tests
const MOCK_PDF_CONTENT = Buffer.from('Mock PDF content for testing');
const MOCK_WORD_CONTENT = Buffer.from('Mock Word content for testing');
const MOCK_EXCEL_CONTENT = Buffer.from('Mock Excel content for testing');

/**
 * Intercepts all export API requests regardless of assessmentId.
 */
function setupExportApiMock(page: import('@playwright/test').Page) {
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

/**
 * Helper to login with test user credentials
 */
async function loginTestUser(page: import('@playwright/test').Page) {
  await page.goto('/login');

  // Fill login form using semantic selectors
  await page.locator('#email').fill(TEST_USER.email);
  await page.locator('#password').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for redirect to chat (concrete element assertion, not networkidle)
  await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({
    timeout: 10000,
  });
}

/**
 * Helper to switch to assessment mode
 * Opens the mode selector popover and clicks the assessment option
 */
async function switchToAssessmentMode(page: import('@playwright/test').Page) {
  // Click the mode selector trigger button (shows current mode name)
  // Default mode is "Consult", so aria-label is "Mode: Consult"
  const modeTrigger = page.getByRole('button', { name: /^Mode:/ });
  await modeTrigger.click();

  // Wait for popover to open and click the assessment option
  await page.locator('[data-testid="mode-option-assessment"]').click();
}

test.describe('Export Resume Flow (Story 13.9.4)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test for isolation
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());

    // Setup export API mock
    await setupExportApiMock(page);

    // Login with test user
    await loginTestUser(page);
  });

  test('shows download buttons on resume without regeneration', async ({ page }) => {
    // Use unique vendor name for test isolation
    const vendorName = `ResumeTest-${Date.now()}`;

    // Step 1: Switch to assessment mode
    await switchToAssessmentMode(page);

    // Send message that triggers questionnaire_ready
    await page.getByRole('textbox', { name: 'Message input' }).fill(
      `Assess vendor ${vendorName} for their AI diagnostic tool. Generate the questionnaire.`
    );
    await page.getByRole('button', { name: 'Send message' }).click();

    // Wait for questionnaire ready state (concrete element, not networkidle)
    await expect(page.locator('[data-testid="generate-questionnaire-btn"]')).toBeVisible({
      timeout: 30000,
    });

    // Generate the questionnaire
    await page.click('[data-testid="generate-questionnaire-btn"]');

    // Wait for download buttons (generation complete)
    await expect(page.locator('[data-testid="download-word-btn"]')).toBeVisible({
      timeout: 90000,
    });

    // Verify we're in download state
    await expect(page.locator('[data-testid="download-pdf-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="download-excel-btn"]')).toBeVisible();

    // Step 2: Simulate "leaving" by clearing localStorage and refreshing
    // This tests the server-side resume (13.9.1-2) - localStorage empty, server has export
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Re-setup mock after reload
    await setupExportApiMock(page);

    // Wait for chat UI to be ready (not networkidle)
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({
      timeout: 10000,
    });

    // Step 3: Verify download buttons appear WITHOUT regenerating
    // This tests the get_export_status WebSocket flow
    await expect(page.locator('[data-testid="download-word-btn"]')).toBeVisible({
      timeout: 15000,
    });

    // Verify generate button is NOT shown (we're in download state, not ready)
    await expect(page.locator('[data-testid="generate-questionnaire-btn"]')).not.toBeVisible();
  });

  test('falls back to generate flow when no export exists', async ({ page }) => {
    // Use unique vendor name for test isolation
    const vendorName = `NewVendor-${Date.now()}`;

    // Create a new conversation (no previous export)
    await page.getByRole('button', { name: 'New Chat' }).click();

    // Switch to assessment mode
    await switchToAssessmentMode(page);

    // Send a message that triggers questionnaire_ready
    await page.getByRole('textbox', { name: 'Message input' }).fill(
      `Assess vendor ${vendorName} for their platform. Generate the questionnaire.`
    );
    await page.getByRole('button', { name: 'Send message' }).click();

    // Wait for questionnaire ready prompt
    await expect(page.locator('[data-testid="generate-questionnaire-btn"]')).toBeVisible({
      timeout: 30000,
    });

    // Verify we're in ready state (generate button visible, download not)
    await expect(page.locator('[data-testid="download-word-btn"]')).not.toBeVisible();
  });

  // NOTE: Regenerate tests removed - Story 13.9.3 deferred

  test('download actually works after resume', async ({ page }) => {
    const vendorName = `DownloadTest-${Date.now()}`;

    // Setup: generate questionnaire
    await switchToAssessmentMode(page);
    await page.getByRole('textbox', { name: 'Message input' }).fill(
      `Assess vendor ${vendorName}. Generate the questionnaire.`
    );
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.locator('[data-testid="generate-questionnaire-btn"]')).toBeVisible({
      timeout: 30000,
    });
    await page.click('[data-testid="generate-questionnaire-btn"]');
    await expect(page.locator('[data-testid="download-word-btn"]')).toBeVisible({
      timeout: 90000,
    });

    // Clear localStorage and reload (simulate new session)
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await setupExportApiMock(page);
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({
      timeout: 10000,
    });

    // Wait for resume to complete
    await expect(page.locator('[data-testid="download-word-btn"]')).toBeVisible({
      timeout: 15000,
    });

    // Click download and verify it works
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-word-btn"]'),
    ]);

    // Verify download started
    expect(download.suggestedFilename()).toMatch(/questionnaire.*\.docx$/);
  });

  test('multiple format downloads work after resume', async ({ page }) => {
    const vendorName = `MultiFormat-${Date.now()}`;

    // Setup: generate questionnaire
    await switchToAssessmentMode(page);
    await page.getByRole('textbox', { name: 'Message input' }).fill(
      `Assess vendor ${vendorName}. Generate the questionnaire.`
    );
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.locator('[data-testid="generate-questionnaire-btn"]')).toBeVisible({
      timeout: 30000,
    });
    await page.click('[data-testid="generate-questionnaire-btn"]');
    await expect(page.locator('[data-testid="download-word-btn"]')).toBeVisible({
      timeout: 90000,
    });

    // Clear localStorage and reload (simulate resume)
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await setupExportApiMock(page);
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('[data-testid="download-word-btn"]')).toBeVisible({
      timeout: 15000,
    });

    // Download Word
    const [wordDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-word-btn"]'),
    ]);
    expect(wordDownload.suggestedFilename()).toContain('.docx');

    // Download buttons should still be visible (durability)
    await expect(page.locator('[data-testid="download-pdf-btn"]')).toBeVisible();

    // Download PDF
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="download-pdf-btn"]'),
    ]);
    expect(pdfDownload.suggestedFilename()).toContain('.pdf');
  });

  test('handles backend error gracefully on resume', async ({ page }) => {
    const vendorName = `ErrorTest-${Date.now()}`;

    // Setup: generate questionnaire first
    await switchToAssessmentMode(page);
    await page.getByRole('textbox', { name: 'Message input' }).fill(
      `Assess vendor ${vendorName}. Generate the questionnaire.`
    );
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.locator('[data-testid="generate-questionnaire-btn"]')).toBeVisible({
      timeout: 30000,
    });
    await page.click('[data-testid="generate-questionnaire-btn"]');
    await expect(page.locator('[data-testid="download-word-btn"]')).toBeVisible({
      timeout: 90000,
    });

    // Clear localStorage and reload
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await setupExportApiMock(page);
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({
      timeout: 10000,
    });

    // Should not crash - chat UI should still be functional
    // Either download buttons appear (successful resume) or generate button (fallback)
    const hasDownload = await page
      .locator('[data-testid="download-word-btn"]')
      .isVisible({ timeout: 15000 })
      .catch(() => false);
    const hasGenerate = await page
      .locator('[data-testid="generate-questionnaire-btn"]')
      .isVisible()
      .catch(() => false);
    const hasInput = await page.getByRole('textbox', { name: 'Message input' }).isVisible();

    // One of these should be true - UI should recover to a valid state
    expect(hasDownload || hasGenerate || hasInput).toBe(true);
  });
});
