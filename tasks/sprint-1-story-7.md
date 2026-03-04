# Story 40.1.7: Update Golden-Sample Regression Snapshot

## Description

Regenerate the golden-sample regression test snapshot to reflect the v1.1 rubric changes.
The snapshot captures the scoring system prompt structure and is used to detect unintended
regressions. After updating weights, rubric criteria, and prompt text, the snapshot must
be regenerated.

Also update the golden-sample test assertions that reference "5 scored dimensions" to
reference all 10.

## Acceptance Criteria

- [ ] Golden-sample regression test updated to expect 10 scored dimension rubric criteria
- [ ] Test description updated from "5 scored dimensions" to "10 scored dimensions"
- [ ] User prompt weight percentage assertions updated to v1.1 values
- [ ] BOTH system prompt and user prompt snapshots regenerated
- [ ] Snapshot contains all 10 dimension rubric criteria sections
- [ ] Snapshot contains `guardian-v1.1` version string
- [ ] All golden-sample regression tests pass
- [ ] No TypeScript errors

## Technical Approach

### 1. Update System Prompt Test Assertions

**File:** `packages/backend/__tests__/integration/golden-sample-regression.test.ts`

**Line 7:** Update comment:
```typescript
// Before:
// - Rubric content is preserved (all 5 scored dimensions)
// After:
// - Rubric content is preserved (all 10 scored dimensions)
```

**Line 45:** Update test description and add 5 new assertions:
```typescript
// Before:
it('should contain all 5 scored dimension rubric criteria', () => {
  const prompt = buildScoringSystemPrompt();
  expect(prompt).toContain('CLINICAL RISK');
  expect(prompt).toContain('PRIVACY RISK');
  expect(prompt).toContain('SECURITY RISK');
  expect(prompt).toContain('TECHNICAL CREDIBILITY');
  expect(prompt).toContain('OPERATIONAL EXCELLENCE');
});

// After:
it('should contain all 10 scored dimension rubric criteria', () => {
  const prompt = buildScoringSystemPrompt();
  expect(prompt).toContain('CLINICAL RISK');
  expect(prompt).toContain('PRIVACY RISK');
  expect(prompt).toContain('SECURITY RISK');
  expect(prompt).toContain('TECHNICAL CREDIBILITY');
  expect(prompt).toContain('OPERATIONAL EXCELLENCE');
  expect(prompt).toContain('VENDOR CAPABILITY');
  expect(prompt).toContain('AI TRANSPARENCY');
  expect(prompt).toContain('ETHICAL CONSIDERATIONS');
  expect(prompt).toContain('REGULATORY COMPLIANCE');
  expect(prompt).toContain('SUSTAINABILITY');
});
```

### 2. Update User Prompt Weight Assertions

**[Architect + Spec review finding]:** Lines 183-186 hardcode v1.0 weight percentages:

```typescript
// Before (v1.0 clinical_ai weights):
expect(prompt).toContain('Clinical Risk: 40%');
expect(prompt).toContain('Privacy Risk: 20%');
expect(prompt).toContain('Security Risk: 15%');

// After (v1.1 clinical_ai weights from Story 40.1.2):
expect(prompt).toContain('Clinical Risk: 25%');
expect(prompt).toContain('Privacy Risk: 15%');
expect(prompt).toContain('Security Risk: 15%');
```

**Note:** Add assertions for the 5 new weighted dimensions as well, since
`buildWeightedDimensions()` will now output all 10.

### 3. Regenerate BOTH Snapshots

```bash
pnpm --filter @guardian/backend test -- --testPathPattern="golden-sample" --updateSnapshot
```

This regenerates both:
- System prompt snapshot (rubric criteria, version string)
- User prompt snapshot (weight percentages, composite formula)

### 4. Verify Snapshot Contents

After regeneration, verify the snapshot file contains:
- `guardian-v1.1` (not `guardian-v1.0`)
- All 10 dimension rubric criteria sections
- Updated composite formula text (from Story 40.1.3)
- All 10 weighted dimension percentages

### 5. Regenerate Export Snapshots

The export snapshot at `export-snapshots.test.ts.snap` may also need regeneration
if it embeds rubric version or weight information:

```bash
pnpm --filter @guardian/backend test -- --testPathPattern="export-snapshots" --updateSnapshot
```

## Files Touched

- `packages/backend/__tests__/integration/golden-sample-regression.test.ts` - MODIFY (update assertions + weight percentages)
- `packages/backend/__tests__/integration/__snapshots__/golden-sample-regression.test.ts.snap` - REGENERATE
- `packages/backend/__tests__/unit/infrastructure/export/__snapshots__/export-snapshots.test.ts.snap` - REGENERATE (if affected)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `pnpm --filter @guardian/backend test -- --testPathPattern="golden-sample"` passes
- [ ] `pnpm --filter @guardian/backend test -- --testPathPattern="export-snapshots"` passes
- [ ] Snapshot diff reviewed (expected: new rubric sections, updated version, updated formula, all 10 weight %)

## Definition of Done

- [ ] Test description says "10 scored dimensions"
- [ ] All 10 dimension assertions present
- [ ] User prompt weight % assertions updated to v1.1 values
- [ ] BOTH system and user prompt snapshots regenerated
- [ ] Export snapshots regenerated if affected
- [ ] All golden-sample and export-snapshot tests pass
- [ ] No TypeScript errors
- [ ] No lint errors
