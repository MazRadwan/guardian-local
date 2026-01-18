# Story 22.1.4: E2E Test - Scoring Persistence

## Description

Create an end-to-end test that verifies the scoring card persists across page reloads. This is the definitive test that the Epic 22 fix works correctly.

The test will:
1. Complete a scoring flow (upload questionnaire, trigger scoring)
2. Verify card displays with correct data
3. Reload the page
4. Verify card still displays with same data
5. Verify data matches database values

## Acceptance Criteria

- [ ] E2E test covers complete persistence flow
- [ ] Test uploads a questionnaire and triggers scoring
- [ ] Test verifies scoring card displays after scoring completes
- [ ] Test reloads page and verifies card still displays
- [ ] Test verifies data consistency (scores match before/after reload)
- [ ] Test verifies UI data matches database values via API call (source of truth)
- [ ] Test uses proper test fixtures and cleanup
- [ ] Test is stable (no flaky failures)
- [ ] Chrome DevTools MCP QA validation passes (see QA section below)

## Technical Approach

### 1. Test Setup

- Use existing E2E infrastructure (Playwright)
- Create test fixtures for:
  - Test user authentication
  - Sample questionnaire file (**PDF or DOCX format** - YAML not accepted by upload)
  - Expected scoring ranges (for validation)

**Important:** The upload API accepts: PDF, DOCX, PNG, JPEG (see `Composer.tsx:122-127`).
YAML files are NOT directly uploadable. Use a PDF export of a completed questionnaire.

### 2. Test Flow

```typescript
test.describe('Scoring Card Persistence', () => {
  test('scoring card persists after page reload', async ({ page }) => {
    // 1. Login as test user
    await loginAsTestUser(page);

    // 2. Create new conversation in scoring mode
    await page.click('[data-testid="new-chat"]');
    await page.selectOption('[data-testid="mode-selector"]', 'scoring');

    // 3. Upload completed questionnaire (PDF format)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('./fixtures/completed-questionnaire.pdf');

    // 4. Wait for scoring to complete
    await page.waitForSelector('[data-testid="scoring-result-card"]', {
      timeout: 60000, // Scoring can take up to 60s
    });

    // 5. Capture scoring data
    const compositeScore = await page.textContent('[data-testid="composite-score"]');
    const overallRisk = await page.textContent('[data-testid="overall-risk"]');
    const recommendation = await page.textContent('[data-testid="recommendation"]');

    expect(compositeScore).toBeTruthy();
    expect(overallRisk).toBeTruthy();
    expect(recommendation).toBeTruthy();

    // 6. Reload page
    await page.reload();

    // 7. Wait for card to reappear (rehydration)
    await page.waitForSelector('[data-testid="scoring-result-card"]', {
      timeout: 10000, // Rehydration should be fast
    });

    // 8. Verify data matches after reload
    const compositeScoreAfter = await page.textContent('[data-testid="composite-score"]');
    const overallRiskAfter = await page.textContent('[data-testid="overall-risk"]');
    const recommendationAfter = await page.textContent('[data-testid="recommendation"]');

    expect(compositeScoreAfter).toBe(compositeScore);
    expect(overallRiskAfter).toBe(overallRisk);
    expect(recommendationAfter).toBe(recommendation);

    // 9. Verify against database via API (source of truth)
    const conversationId = page.url().split('/').pop();
    const apiResponse = await page.request.get(`/api/scoring/conversation/${conversationId}`);
    expect(apiResponse.status()).toBe(200);

    const dbData = await apiResponse.json();
    expect(String(dbData.compositeScore)).toBe(compositeScore);
    expect(dbData.overallRiskRating).toBe(overallRisk?.toLowerCase());
    expect(dbData.recommendation).toBe(recommendation?.toLowerCase());
  });

  test('scoring card persists after logout and login', async ({ page }) => {
    // Similar flow but with logout/login instead of reload
    // ...
  });
});
```

### 3. Test Fixtures

Create `apps/web/e2e/fixtures/completed-questionnaire.pdf`:
- Use a PDF export of a completed Guardian questionnaire
- Pre-filled responses that will score consistently
- Include all 10 dimensions with sample responses
- Must contain a valid Guardian Assessment ID (for scoring to work)

**Alternative:** Use a DOCX file if PDF generation is complex. Either format is accepted.

### 4. Test Data Attributes

Ensure components have required `data-testid` attributes:
- `scoring-result-card` - Main card container
- `composite-score` - Composite score value
- `overall-risk` - Risk rating
- `recommendation` - Recommendation text
- `dimension-score-{dimension}` - Per-dimension scores

### 5. Stability Considerations

- Use `waitForSelector` with appropriate timeouts
- Avoid hardcoded waits (`page.waitForTimeout`)
- Use test isolation (each test gets fresh conversation)
- Clean up test data in afterEach

### 6. Chrome DevTools MCP QA Validation

**Required QA steps using Chrome DevTools MCP after implementation:**

```
1. Visual verification:
   - take_screenshot: Capture scoring card after scoring completes
   - take_screenshot: Capture scoring card after page reload
   - Compare screenshots for visual consistency

2. Console check:
   - list_console_messages: Verify no errors/warnings related to scoring
   - Confirm rehydration logs appear: "[ChatInterface] Rehydrated scoring result from backend"

3. Network verification:
   - list_network_requests: Verify GET /api/scoring/conversation/:id is called on reload
   - get_network_request: Confirm response matches expected shape (200 OK)
   - Verify no duplicate rehydration requests (in-flight guard working)

4. Persistence flow:
   - navigate_page: Load conversation with scoring
   - take_snapshot: Capture DOM state
   - navigate_page: Reload page
   - take_snapshot: Capture DOM state after reload
   - Verify scoring card present in both snapshots
```

**QA Pass Criteria:**
- [ ] No console errors related to scoring/rehydration
- [ ] Rehydration API called exactly once on reload
- [ ] Scoring card visually identical before/after reload
- [ ] Response time < 500ms for rehydration endpoint

## Files Touched

- `apps/web/e2e/scoring-persistence.spec.ts` - **NEW** E2E test file
- `apps/web/e2e/fixtures/completed-questionnaire.pdf` - **NEW** test fixture (PDF format, not YAML)
- `apps/web/src/components/chat/ScoringResultCard.tsx` - **MODIFY** Add required data-testid attributes: `scoring-result-card`, `composite-score`, `overall-risk`, `recommendation`, `dimension-score-{dimension}`

## Tests Affected

No existing tests should be affected. This is a new E2E test file.

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] `apps/web/e2e/scoring-persistence.spec.ts` - E2E test file
  - Test: scoring card displays after scoring completes
  - Test: scoring card persists after page reload
  - Test: scoring card data matches before/after reload
  - Test: scoring card persists after logout/login (optional, can be added later)
- [ ] `apps/web/e2e/fixtures/completed-questionnaire.pdf` - Test fixture (PDF format with pre-filled responses)
- [ ] Verify existing E2E tests still pass (no regressions)

## Definition of Done

- [ ] All acceptance criteria met
- [ ] E2E test passes consistently (run 3x to verify stability)
- [ ] Test fixtures created and committed
- [ ] Data-testid attributes added to components
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Chrome DevTools MCP QA validation completed (all criteria pass)
- [ ] Test documented in PR description
