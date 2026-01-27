import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Upload Timing E2E Tests - Comprehensive Race Condition Analysis
 *
 * These tests measure timing for file upload and context injection to identify
 * race conditions between file upload completion and message sending.
 *
 * Test files location: /Users/mazradwan/Downloads/multifile-test
 * Large PDF for testing: /Users/mazradwan/Downloads/Next of kin.pdf (6MB)
 *
 * Key measurements:
 * 1. Time from upload start to file_attached event (per file)
 * 2. Time from send_message to Claude API call
 * 3. Which files have textExcerpt ready vs missing
 * 4. Parallel vs sequential processing behavior
 * 5. Race condition detection when sending before file_attached
 *
 * Run with: pnpm --filter @guardian/web test:e2e upload-timing.spec.ts --project=chromium
 */

// Test user credentials (auto-created by dev-login endpoint)
const TEST_USER = {
  email: 'test@guardian.com',
  password: 'Test1234',
};

const TEST_FILES_DIR = '/Users/mazradwan/Downloads/multifile-test';
const LARGE_PDF_PATH = '/Users/mazradwan/Downloads/Next of kin.pdf';

// Test file info
interface TestFile {
  name: string;
  path: string;
  size: number;
}

// Timing result interface
interface TimingResult {
  scenario: string;
  passed: boolean;
  totalTimeMs: number;
  details: Record<string, unknown>;
  raceConditionDetected: boolean;
}

// Store results for summary
const testResults: TimingResult[] = [];

/**
 * Get list of test files from the test directory
 */
function getTestFiles(): TestFile[] {
  if (!fs.existsSync(TEST_FILES_DIR)) {
    console.warn(`Test files directory not found: ${TEST_FILES_DIR}`);
    return [];
  }

  const files = fs.readdirSync(TEST_FILES_DIR);
  return files
    .filter(f => !f.startsWith('.'))
    .map(f => {
      const fullPath = path.join(TEST_FILES_DIR, f);
      const stats = fs.statSync(fullPath);
      return {
        name: f,
        path: fullPath,
        size: stats.size,
      };
    });
}

/**
 * Get the large PDF file info
 */
function getLargePdfFile(): TestFile | null {
  if (!fs.existsSync(LARGE_PDF_PATH)) {
    console.warn(`Large PDF not found: ${LARGE_PDF_PATH}`);
    return null;
  }

  const stats = fs.statSync(LARGE_PDF_PATH);
  return {
    name: path.basename(LARGE_PDF_PATH),
    path: LARGE_PDF_PATH,
    size: stats.size,
  };
}

/**
 * Helper to wait for file_attached event via WebSocket (custom event from app)
 */
async function waitForFileAttached(page: Page, timeout = 30000): Promise<{
  filename: string;
  fileId: string;
  hasExcerpt: boolean;
  timestamp: number;
}> {
  return page.evaluate((timeout) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for file_attached'));
      }, timeout);

      const handler = (event: CustomEvent) => {
        clearTimeout(timer);
        resolve({
          filename: event.detail.filename,
          fileId: event.detail.fileId,
          hasExcerpt: event.detail.hasExcerpt,
          timestamp: Date.now(),
        });
      };

      window.addEventListener('guardian:file_attached', handler as EventListener, { once: true });
    });
  }, timeout);
}

/**
 * Helper to check if response indicates file context was available
 */
function analyzeResponseForContext(responseText: string | null, expectedFileNames: string[]): {
  hasFileContext: boolean;
  filesReferenced: string[];
  contextIndicators: string[];
} {
  if (!responseText) {
    return { hasFileContext: false, filesReferenced: [], contextIndicators: [] };
  }

  const lowerResponse = responseText.toLowerCase();
  const contextIndicators: string[] = [];
  const filesReferenced: string[] = [];

  // Check for indicators that Claude had file context
  const positiveIndicators = [
    'document', 'file', 'questionnaire', 'health', 'uploaded',
    'attached', 'content', 'text', 'pdf', 'docx', 'screenshot',
    'image', 'shows', 'displays', 'contains', 'mentions'
  ];

  // Check for indicators that Claude did NOT have file context
  const negativeIndicators = [
    "i don't see any",
    "no file",
    "no document",
    "haven't uploaded",
    "please upload",
    "can't see",
    "unable to access",
    "no attachment"
  ];

  for (const indicator of positiveIndicators) {
    if (lowerResponse.includes(indicator)) {
      contextIndicators.push(indicator);
    }
  }

  for (const indicator of negativeIndicators) {
    if (lowerResponse.includes(indicator)) {
      contextIndicators.push(`NEGATIVE: ${indicator}`);
    }
  }

  // Check if specific files are referenced
  for (const fileName of expectedFileNames) {
    const baseName = fileName.replace(/\.[^.]+$/, '').toLowerCase();
    // Check first 15 chars of filename (handles truncation)
    if (lowerResponse.includes(baseName.substring(0, Math.min(15, baseName.length)))) {
      filesReferenced.push(fileName);
    }
  }

  const hasFileContext = contextIndicators.length > 0 &&
    !contextIndicators.some(i => i.startsWith('NEGATIVE:'));

  return { hasFileContext, filesReferenced, contextIndicators };
}

test.describe('Upload Timing Analysis - Comprehensive Race Condition Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');

    // Wait for login page to fully load
    await page.waitForLoadState('networkidle');

    // Use Quick Login button (dev mode) - more reliable than filling the form
    const quickLoginButton = page.getByRole('button', { name: /Quick Login/i });
    if (await quickLoginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await quickLoginButton.click();
    } else {
      // Fallback to manual login if Quick Login not available
      await page.locator('#email').fill(TEST_USER.email);
      await page.locator('#password').fill(TEST_USER.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
    }

    // Wait for redirect to chat and message input to be visible
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({ timeout: 15000 });
  });

  test('Scenario A: Multi-file upload timing (parallel vs sequential)', async ({ page }) => {
    const testFiles = getTestFiles();

    if (testFiles.length < 3) {
      test.skip(true, 'Need at least 3 test files');
      return;
    }

    // Take first 3 files
    const filesToUpload = testFiles.slice(0, 3);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`SCENARIO A: Multi-file Upload Timing`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Files to upload:`);
    filesToUpload.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.name} (${(f.size / 1024).toFixed(2)} KB)`);
    });

    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({ timeout: 10000 });

    const fileInput = await page.locator('#composer-file-input');
    const uploadStartTime = Date.now();
    console.log(`\n[TIMING] Upload initiated at: ${new Date(uploadStartTime).toISOString()}`);

    // Upload all 3 files simultaneously
    await fileInput.setInputFiles(filesToUpload.map(f => f.path));

    // Track when each file_attached arrives
    const fileTimings: { name: string; attachedAt: number; elapsed: number }[] = [];

    for (let i = 0; i < filesToUpload.length; i++) {
      const chip = page.locator('[role="status"]').nth(i);
      await expect(chip).toBeVisible({ timeout: 30000 });
      const attachedTime = Date.now();
      const elapsed = attachedTime - uploadStartTime;
      fileTimings.push({
        name: filesToUpload[i].name,
        attachedAt: attachedTime,
        elapsed,
      });
      console.log(`[TIMING] File ${i + 1} attached: ${filesToUpload[i].name} at ${elapsed}ms`);
    }

    const totalTime = Date.now() - uploadStartTime;

    // Analyze parallel vs sequential behavior
    const timeDiffs = fileTimings.map((t, i) =>
      i > 0 ? t.elapsed - fileTimings[i - 1].elapsed : 0
    ).slice(1);
    const avgTimeBetween = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    const isParallel = avgTimeBetween < 500; // If files arrive within 500ms of each other, likely parallel

    console.log(`\n--- SCENARIO A RESULTS ---`);
    console.log(`Total upload time: ${totalTime}ms`);
    console.log(`Average time between file arrivals: ${avgTimeBetween.toFixed(0)}ms`);
    console.log(`Processing appears: ${isParallel ? 'PARALLEL' : 'SEQUENTIAL'}`);
    console.log(`Per-file timings:`);
    fileTimings.forEach(t => {
      console.log(`  - ${t.name}: ${t.elapsed}ms`);
    });
    console.log(`${'='.repeat(70)}\n`);

    testResults.push({
      scenario: 'A: Multi-file timing',
      passed: true,
      totalTimeMs: totalTime,
      details: {
        fileCount: filesToUpload.length,
        fileTimings,
        avgTimeBetween,
        isParallel,
      },
      raceConditionDetected: false,
    });

    expect(fileTimings.length).toBe(filesToUpload.length);
  });

  test('Scenario B: Race condition - immediate send after upload', async ({ page }) => {
    const testFiles = getTestFiles();
    const docxFile = testFiles.find(f => f.name.endsWith('.docx'));

    if (!docxFile) {
      test.skip(true, 'No DOCX test file available');
      return;
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`SCENARIO B: Race Condition - Immediate Send (NO WAIT)`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Test file: ${docxFile.name} (${(docxFile.size / 1024).toFixed(2)} KB)`);
    console.log(`Strategy: Upload file, type message, send IMMEDIATELY without waiting for file_attached`);

    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({ timeout: 10000 });

    const fileInput = await page.locator('#composer-file-input');
    const uploadStartTime = Date.now();

    console.log(`\n[TIMING] Upload initiated: ${uploadStartTime}`);

    // Upload file but DO NOT wait for completion
    const uploadPromise = fileInput.setInputFiles(docxFile.path);

    // Immediately type and send message (using Promise.all for true simultaneity)
    const messageInput = page.getByRole('textbox', { name: 'Message input' });

    // Race: upload in progress while we type and send
    await Promise.all([
      uploadPromise,
      (async () => {
        // Type message as fast as possible
        await messageInput.fill('Summarize this document for me please');
        console.log(`[TIMING] Message typed: ${Date.now() - uploadStartTime}ms after upload start`);
        // Send immediately
        await messageInput.press('Enter');
        console.log(`[TIMING] Message sent: ${Date.now() - uploadStartTime}ms after upload start`);
      })(),
    ]);

    const sendTime = Date.now();
    console.log(`[TIMING] Both upload and send initiated within: ${sendTime - uploadStartTime}ms`);

    // Wait for assistant response
    await expect(page.locator('[aria-label="assistant message"]').first()).toBeVisible({
      timeout: 60000,
    });
    const responseStartTime = Date.now();
    console.log(`[TIMING] Response started: ${responseStartTime - uploadStartTime}ms after upload start`);

    // Wait for response to complete
    await page.waitForTimeout(5000);
    const responseEndTime = Date.now();

    // Analyze response
    const responseText = await page.locator('[aria-label="assistant message"]').first().textContent();
    const analysis = analyzeResponseForContext(responseText, [docxFile.name]);

    console.log(`\n--- SCENARIO B RESULTS ---`);
    console.log(`Time from upload start to send: ${sendTime - uploadStartTime}ms`);
    console.log(`Time from upload start to response: ${responseStartTime - uploadStartTime}ms`);
    console.log(`Total time: ${responseEndTime - uploadStartTime}ms`);
    console.log(`Response length: ${responseText?.length || 0} chars`);
    console.log(`Has file context: ${analysis.hasFileContext}`);
    console.log(`Context indicators: ${analysis.contextIndicators.join(', ')}`);
    console.log(`Race condition detected: ${!analysis.hasFileContext}`);
    console.log(`${'='.repeat(70)}\n`);

    testResults.push({
      scenario: 'B: Immediate send',
      passed: true,
      totalTimeMs: responseEndTime - uploadStartTime,
      details: {
        uploadToSendMs: sendTime - uploadStartTime,
        uploadToResponseMs: responseStartTime - uploadStartTime,
        hasFileContext: analysis.hasFileContext,
        contextIndicators: analysis.contextIndicators,
        responseLength: responseText?.length || 0,
      },
      raceConditionDetected: !analysis.hasFileContext,
    });

    // Test passes regardless - we're measuring, not asserting context exists
    expect(responseText).toBeTruthy();
  });

  test('Scenario C: Multi-file + immediate send', async ({ page }) => {
    const testFiles = getTestFiles();

    if (testFiles.length < 3) {
      test.skip(true, 'Need at least 3 test files');
      return;
    }

    const filesToUpload = testFiles.slice(0, 3);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`SCENARIO C: Multi-file + Immediate Send`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Files to upload:`);
    filesToUpload.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.name} (${(f.size / 1024).toFixed(2)} KB)`);
    });
    console.log(`Strategy: Upload 3 files, send "summarize all" IMMEDIATELY`);

    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({ timeout: 10000 });

    const fileInput = await page.locator('#composer-file-input');
    const uploadStartTime = Date.now();

    console.log(`\n[TIMING] Multi-file upload initiated: ${uploadStartTime}`);

    // Upload files but race with message send
    const uploadPromise = fileInput.setInputFiles(filesToUpload.map(f => f.path));
    const messageInput = page.getByRole('textbox', { name: 'Message input' });

    // Race: upload multiple files while typing and sending
    await Promise.all([
      uploadPromise,
      (async () => {
        await messageInput.fill('Summarize all uploaded documents and tell me what each one is about');
        console.log(`[TIMING] Message typed: ${Date.now() - uploadStartTime}ms after upload start`);
        await messageInput.press('Enter');
        console.log(`[TIMING] Message sent: ${Date.now() - uploadStartTime}ms after upload start`);
      })(),
    ]);

    const sendTime = Date.now();
    console.log(`[TIMING] Upload and send completed within: ${sendTime - uploadStartTime}ms`);

    // Wait for assistant response
    await expect(page.locator('[aria-label="assistant message"]').first()).toBeVisible({
      timeout: 60000,
    });
    const responseStartTime = Date.now();
    console.log(`[TIMING] Response started: ${responseStartTime - uploadStartTime}ms`);

    // Wait for response to complete
    await page.waitForTimeout(8000);
    const responseEndTime = Date.now();

    // Analyze response
    const responseText = await page.locator('[aria-label="assistant message"]').first().textContent();
    const analysis = analyzeResponseForContext(responseText, filesToUpload.map(f => f.name));

    console.log(`\n--- SCENARIO C RESULTS ---`);
    console.log(`Files uploaded: ${filesToUpload.length}`);
    console.log(`Time to send: ${sendTime - uploadStartTime}ms`);
    console.log(`Time to response: ${responseStartTime - uploadStartTime}ms`);
    console.log(`Total time: ${responseEndTime - uploadStartTime}ms`);
    console.log(`Has file context: ${analysis.hasFileContext}`);
    console.log(`Files referenced in response: ${analysis.filesReferenced.length}/${filesToUpload.length}`);
    console.log(`  - Referenced: ${analysis.filesReferenced.join(', ') || 'none'}`);
    console.log(`  - Missing: ${filesToUpload.filter(f => !analysis.filesReferenced.includes(f.name)).map(f => f.name).join(', ') || 'none'}`);
    console.log(`Context indicators: ${analysis.contextIndicators.join(', ')}`);
    console.log(`Race condition detected: ${analysis.filesReferenced.length < filesToUpload.length}`);
    console.log(`${'='.repeat(70)}\n`);

    testResults.push({
      scenario: 'C: Multi-file + immediate send',
      passed: true,
      totalTimeMs: responseEndTime - uploadStartTime,
      details: {
        fileCount: filesToUpload.length,
        filesReferenced: analysis.filesReferenced.length,
        hasFileContext: analysis.hasFileContext,
        uploadToSendMs: sendTime - uploadStartTime,
      },
      raceConditionDetected: analysis.filesReferenced.length < filesToUpload.length,
    });

    expect(responseText).toBeTruthy();
  });

  test('Scenario D: Large file blocking (6MB PDF + small DOCX)', async ({ page }) => {
    const testFiles = getTestFiles();
    const smallDocx = testFiles.find(f => f.name.endsWith('.docx'));
    const largePdf = getLargePdfFile();

    if (!smallDocx || !largePdf) {
      test.skip(true, 'Need both small DOCX and large PDF');
      return;
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`SCENARIO D: Large File Blocking Test`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Files to upload:`);
    console.log(`  1. LARGE: ${largePdf.name} (${(largePdf.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`  2. SMALL: ${smallDocx.name} (${(smallDocx.size / 1024).toFixed(2)} KB)`);
    console.log(`Strategy: Upload both simultaneously, measure which arrives first`);

    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({ timeout: 10000 });

    const fileInput = await page.locator('#composer-file-input');
    const uploadStartTime = Date.now();

    console.log(`\n[TIMING] Upload initiated: ${uploadStartTime}`);

    // Upload both files simultaneously
    await fileInput.setInputFiles([largePdf.path, smallDocx.path]);

    // Track when each file arrives
    const fileArrivals: { name: string; time: number; elapsed: number }[] = [];

    // Wait for first file
    const chip1 = page.locator('[role="status"]').first();
    await expect(chip1).toBeVisible({ timeout: 60000 });
    const file1Time = Date.now();
    fileArrivals.push({ name: 'File 1', time: file1Time, elapsed: file1Time - uploadStartTime });
    console.log(`[TIMING] First file attached: ${file1Time - uploadStartTime}ms`);

    // Wait for second file
    const chip2 = page.locator('[role="status"]').nth(1);
    await expect(chip2).toBeVisible({ timeout: 120000 });
    const file2Time = Date.now();
    fileArrivals.push({ name: 'File 2', time: file2Time, elapsed: file2Time - uploadStartTime });
    console.log(`[TIMING] Second file attached: ${file2Time - uploadStartTime}ms`);

    const totalTime = Date.now() - uploadStartTime;
    const timeBetweenFiles = file2Time - file1Time;

    // Determine if large file delayed small file
    const isSequential = timeBetweenFiles > 2000; // If more than 2s between, likely sequential
    const largeFileDelaysSmall = isSequential;

    console.log(`\n--- SCENARIO D RESULTS ---`);
    console.log(`First file arrived at: ${file1Time - uploadStartTime}ms`);
    console.log(`Second file arrived at: ${file2Time - uploadStartTime}ms`);
    console.log(`Time between arrivals: ${timeBetweenFiles}ms`);
    console.log(`Total upload time: ${totalTime}ms`);
    console.log(`Processing behavior: ${isSequential ? 'SEQUENTIAL' : 'PARALLEL'}`);
    console.log(`Large file blocks small file: ${largeFileDelaysSmall ? 'YES' : 'NO'}`);
    console.log(`${'='.repeat(70)}\n`);

    testResults.push({
      scenario: 'D: Large file blocking',
      passed: true,
      totalTimeMs: totalTime,
      details: {
        largePdfSizeMB: (largePdf.size / 1024 / 1024).toFixed(2),
        smallDocxSizeKB: (smallDocx.size / 1024).toFixed(2),
        file1TimeMs: file1Time - uploadStartTime,
        file2TimeMs: file2Time - uploadStartTime,
        timeBetweenMs: timeBetweenFiles,
        isSequential,
        largeFileDelaysSmall,
      },
      raceConditionDetected: largeFileDelaysSmall,
    });

    expect(fileArrivals.length).toBe(2);
  });

  test('Scenario E: Staggered uploads with mid-upload send', async ({ page }) => {
    const testFiles = getTestFiles();

    if (testFiles.length < 2) {
      test.skip(true, 'Need at least 2 test files');
      return;
    }

    const file1 = testFiles[0];
    const file2 = testFiles[1];

    console.log(`\n${'='.repeat(70)}`);
    console.log(`SCENARIO E: Staggered Uploads with Mid-Upload Send`);
    console.log(`${'='.repeat(70)}`);
    console.log(`File 1: ${file1.name} (${(file1.size / 1024).toFixed(2)} KB)`);
    console.log(`File 2: ${file2.name} (${(file2.size / 1024).toFixed(2)} KB)`);
    console.log(`Strategy:`);
    console.log(`  1. Upload file 1`);
    console.log(`  2. Wait 500ms`);
    console.log(`  3. Upload file 2`);
    console.log(`  4. Send immediately after file 2 upload starts`);
    console.log(`Expected: File 1 has context, file 2 does not`);

    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({ timeout: 10000 });

    const fileInput = await page.locator('#composer-file-input');
    const testStartTime = Date.now();

    // Step 1: Upload file 1
    console.log(`\n[TIMING] Step 1 - Upload file 1: ${Date.now() - testStartTime}ms`);
    await fileInput.setInputFiles(file1.path);

    // Wait for file 1 to be attached
    const chip1 = page.locator('[role="status"]').first();
    await expect(chip1).toBeVisible({ timeout: 30000 });
    const file1AttachedTime = Date.now();
    console.log(`[TIMING] File 1 attached: ${file1AttachedTime - testStartTime}ms`);

    // Step 2: Wait 500ms
    console.log(`[TIMING] Step 2 - Waiting 500ms...`);
    await page.waitForTimeout(500);

    // Step 3: Upload file 2
    console.log(`[TIMING] Step 3 - Upload file 2: ${Date.now() - testStartTime}ms`);
    const upload2StartTime = Date.now();

    // We need to add to existing files, not replace
    // Use a different approach: click the upload button to add more
    // Actually, setInputFiles replaces. Let's use the multi-file input approach
    // For this test, we'll need to clear and re-upload both files
    // But we want to simulate staggered timing...

    // Alternative: Upload file 2 and immediately send
    const uploadAndSend = async () => {
      // Set both files (since setInputFiles replaces)
      await fileInput.setInputFiles([file1.path, file2.path]);
      console.log(`[TIMING] Files set (both): ${Date.now() - testStartTime}ms`);
    };

    const sendMessage = async () => {
      // Small delay to let upload start processing
      await page.waitForTimeout(100);
      const messageInput = page.getByRole('textbox', { name: 'Message input' });
      await messageInput.fill('What are the main topics in these documents? Describe each file.');
      console.log(`[TIMING] Message typed: ${Date.now() - testStartTime}ms`);
      await messageInput.press('Enter');
      console.log(`[TIMING] Message sent: ${Date.now() - testStartTime}ms`);
    };

    // Race: upload file 2 while immediately sending
    await Promise.all([uploadAndSend(), sendMessage()]);

    const sendTime = Date.now();
    console.log(`[TIMING] Upload + send completed: ${sendTime - testStartTime}ms`);

    // Wait for response
    await expect(page.locator('[aria-label="assistant message"]').first()).toBeVisible({
      timeout: 60000,
    });
    const responseStartTime = Date.now();
    console.log(`[TIMING] Response started: ${responseStartTime - testStartTime}ms`);

    // Wait for response to complete
    await page.waitForTimeout(5000);
    const responseEndTime = Date.now();

    // Analyze response
    const responseText = await page.locator('[aria-label="assistant message"]').first().textContent();
    const analysis = analyzeResponseForContext(responseText, [file1.name, file2.name]);

    // Check which files are referenced
    const file1Referenced = analysis.filesReferenced.includes(file1.name);
    const file2Referenced = analysis.filesReferenced.includes(file2.name);

    console.log(`\n--- SCENARIO E RESULTS ---`);
    console.log(`File 1 (uploaded first) referenced: ${file1Referenced}`);
    console.log(`File 2 (uploaded with send) referenced: ${file2Referenced}`);
    console.log(`Time from test start to send: ${sendTime - testStartTime}ms`);
    console.log(`Total time: ${responseEndTime - testStartTime}ms`);
    console.log(`Has file context: ${analysis.hasFileContext}`);
    console.log(`Context indicators: ${analysis.contextIndicators.join(', ')}`);
    console.log(`Race condition for file 2: ${!file2Referenced && file1Referenced}`);
    console.log(`${'='.repeat(70)}\n`);

    testResults.push({
      scenario: 'E: Staggered uploads',
      passed: true,
      totalTimeMs: responseEndTime - testStartTime,
      details: {
        file1Name: file1.name,
        file2Name: file2.name,
        file1Referenced,
        file2Referenced,
        hasFileContext: analysis.hasFileContext,
        sendTimeMs: sendTime - testStartTime,
      },
      raceConditionDetected: !file2Referenced || !file1Referenced,
    });

    expect(responseText).toBeTruthy();
  });

  // Control test - this should always have context
  test('Control: Delayed send (3s wait for extraction)', async ({ page }) => {
    const testFiles = getTestFiles();
    const docxFile = testFiles.find(f => f.name.endsWith('.docx'));

    if (!docxFile) {
      test.skip(true, 'No DOCX test file available');
      return;
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`CONTROL TEST: Delayed Send (3 second wait)`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Test file: ${docxFile.name} (${(docxFile.size / 1024).toFixed(2)} KB)`);
    console.log(`Strategy: Upload file, wait 3 seconds, then send message`);
    console.log(`Expected: Always have file context (baseline comparison)`);

    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({ timeout: 10000 });

    const fileInput = await page.locator('#composer-file-input');
    const uploadStartTime = Date.now();

    console.log(`\n[TIMING] Upload initiated: ${uploadStartTime}`);
    await fileInput.setInputFiles(docxFile.path);

    // Wait for attachment
    const chip = page.locator('[role="status"]').first();
    await expect(chip).toBeVisible({ timeout: 30000 });
    const attachedTime = Date.now();
    console.log(`[TIMING] File attached: ${attachedTime - uploadStartTime}ms`);

    // WAIT 3 seconds for extraction to complete
    console.log(`[TIMING] Waiting 3 seconds for extraction...`);
    await page.waitForTimeout(3000);

    // Now send
    const messageInput = page.getByRole('textbox', { name: 'Message input' });
    await messageInput.fill('Please summarize this document for me.');
    const sendTime = Date.now();
    console.log(`[TIMING] Message sent (after 3s delay): ${sendTime - uploadStartTime}ms`);
    await messageInput.press('Enter');

    // Wait for response
    await expect(page.locator('[aria-label="assistant message"]').first()).toBeVisible({
      timeout: 60000,
    });
    const responseStartTime = Date.now();
    console.log(`[TIMING] Response started: ${responseStartTime - uploadStartTime}ms`);

    // Wait for response to complete
    await page.waitForTimeout(5000);
    const responseEndTime = Date.now();

    // Analyze response
    const responseText = await page.locator('[aria-label="assistant message"]').first().textContent();
    const analysis = analyzeResponseForContext(responseText, [docxFile.name]);

    console.log(`\n--- CONTROL TEST RESULTS ---`);
    console.log(`Upload to attached: ${attachedTime - uploadStartTime}ms`);
    console.log(`Intentional delay: 3000ms`);
    console.log(`Total time to send: ${sendTime - uploadStartTime}ms`);
    console.log(`Time to response: ${responseStartTime - uploadStartTime}ms`);
    console.log(`Has file context: ${analysis.hasFileContext}`);
    console.log(`Context indicators: ${analysis.contextIndicators.join(', ')}`);
    console.log(`This should ALWAYS have context (baseline)`);
    console.log(`${'='.repeat(70)}\n`);

    testResults.push({
      scenario: 'Control: Delayed send',
      passed: true,
      totalTimeMs: responseEndTime - uploadStartTime,
      details: {
        uploadToAttachedMs: attachedTime - uploadStartTime,
        delayMs: 3000,
        sendTimeMs: sendTime - uploadStartTime,
        hasFileContext: analysis.hasFileContext,
        contextIndicators: analysis.contextIndicators,
      },
      raceConditionDetected: !analysis.hasFileContext,
    });

    // Control test SHOULD have context
    expect(analysis.hasFileContext).toBe(true);
  });

  test.afterAll(async () => {
    // Print summary table
    console.log(`\n${'='.repeat(80)}`);
    console.log(`UPLOAD TIMING TEST SUMMARY`);
    console.log(`${'='.repeat(80)}`);
    console.log(`\n| Scenario | Passed | Time (ms) | Race Condition |`);
    console.log(`|----------|--------|-----------|----------------|`);

    for (const result of testResults) {
      const passedIcon = result.passed ? 'PASS' : 'FAIL';
      const raceIcon = result.raceConditionDetected ? 'YES' : 'NO';
      console.log(`| ${result.scenario.padEnd(30)} | ${passedIcon.padEnd(6)} | ${result.totalTimeMs.toString().padStart(9)} | ${raceIcon.padEnd(14)} |`);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`RACE CONDITION ANALYSIS`);
    console.log(`${'='.repeat(80)}`);

    const racesDetected = testResults.filter(r => r.raceConditionDetected);
    if (racesDetected.length > 0) {
      console.log(`\nRace conditions detected in ${racesDetected.length} scenario(s):`);
      for (const result of racesDetected) {
        console.log(`  - ${result.scenario}`);
        console.log(`    Details: ${JSON.stringify(result.details, null, 2)}`);
      }
    } else {
      console.log(`\nNo race conditions detected in any scenario.`);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Check backend logs with: cat /tmp/backend-timing-logs.txt | grep -E "\\[TIMING\\]"`);
    console.log(`${'='.repeat(80)}\n`);
  });
});

/**
 * EXPECTED OUTPUT FORMAT:
 *
 * Backend logs (visible in backend console) will show:
 * [TIMING] DocumentUploadController processUpload START: 1234567890123 (file: example.docx, size: 23832)
 * [TIMING] DocumentUploadController S3_STORE_START: 1234567890124
 * [TIMING] DocumentUploadController S3_STORE_END: 1234567890500 (duration: 376ms)
 * [TIMING] DocumentUploadController TEXT_EXTRACT_START: 1234567890501
 * [TIMING] DocumentUploadController TEXT_EXTRACT_END: 1234567891200 (duration: 699ms, success: true, excerptLength: 5432)
 * [TIMING] DocumentUploadController FILE_ATTACHED_EMIT: 1234567891300 (total upload duration: 1177ms, fileId: abc-123, hasExcerpt: true)
 *
 * [TIMING] MessageHandler validateSendMessage START: 1234567892000
 * [TIMING] MessageHandler validateSendMessage END: 1234567892050 (duration: 50ms, valid: true)
 * [TIMING] MessageHandler buildFileContext START: 1234567892051
 * [TIMING] FileContextBuilder buildWithImages START: 1234567892052
 * [TIMING] FileContextBuilder FILES_FOUND: 1234567892100 (count: 1, files: abc-123:example.docx:hasExcerpt=true:hasIntake=false)
 * [TIMING] FileContextBuilder buildWithImages END: 1234567892110 (duration: 58ms, textContextLength: 5500, imageBlocksCount: 0)
 * [TIMING] MessageHandler buildFileContext END: 1234567892111 (duration: 60ms)
 * [TIMING] ClaudeClient streamMessage START: 1234567892200 (systemPromptLength: 12000, hasFileContext: true, imageBlockCount: 0, messageCount: 2)
 * [TIMING] ClaudeClient streamMessage END: 1234567895000 (duration: 2800ms, stopReason: end_turn)
 */
