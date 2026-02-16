# Story 38.8.3: ISO Messaging Compliance Audit Test

## Description

Create an automated test that scans all export templates, prompt files, and static text for prohibited ISO messaging terms. Uses the `findProhibitedTerms()` function from `isoMessagingTerms.ts` (Story 38.2.4) to detect violations. This test serves as a CI gate -- if anyone accidentally adds "ISO compliant" or "ISO certified" language, the test fails.

## Acceptance Criteria

- [ ] Test scans all export template files for prohibited terms
- [ ] Test scans all prompt files for prohibited terms
- [ ] Test scans the ISO disclaimer constant for prohibited terms
- [ ] Test fails with specific violation details if prohibited terms found
- [ ] Test provides clear error messages showing which file, which term, and the suggested alternative
- [ ] All scanned files pass (zero violations)
- [ ] At least 90% of scanned files must exist (not skipped)
- [ ] Scanner correctly exempts negative-example lines (lines with "NEVER use" or inside "CRITICAL MESSAGING RULES" sections) from prohibited term detection
- [ ] `findProhibitedTerms()` is also usable at runtime for validating LLM-generated narrative text (see Runtime Narrative Validation section below)

## Technical Approach

### 1. Create messaging audit test

**File:** `packages/backend/__tests__/unit/domain/compliance/iso-messaging-audit.test.ts` (CREATE)

```typescript
import * as fs from 'fs';
import * as path from 'path';
import {
  findProhibitedTerms,
  PROHIBITED_TERMS,
  ISO_DISCLAIMER,
  APPROVED_TERMS,
} from '../../../../src/domain/compliance/isoMessagingTerms';

/**
 * ISO Messaging Compliance Audit
 *
 * Scans all export-related files for prohibited ISO terminology.
 * This test is a CI gate to prevent accidental ISO certification language.
 *
 * Per PRD Section 13: Guardian provides ISO-informed assessment, NOT certification.
 */
describe('ISO Messaging Compliance Audit', () => {
  // Files to scan for prohibited terms
  const FILES_TO_SCAN = [
    // Templates
    'src/infrastructure/export/templates/scoring-report.html',
    // Export builders
    'src/infrastructure/export/WordSectionBuilders.ts',
    'src/infrastructure/export/ScoringWordExporter.ts',
    'src/infrastructure/export/ScoringPDFExporter.ts',
    'src/infrastructure/export/ScoringExcelExporter.ts',
    // Prompts
    'src/infrastructure/ai/prompts/exportNarrativeSystemPrompt.ts',
    'src/infrastructure/ai/prompts/exportNarrativeUserPrompt.ts',
    'src/infrastructure/ai/prompts/scoringPrompt.iso.ts',
    // Compliance types
    'src/domain/compliance/types.ts',
    'src/domain/compliance/isoMessagingTerms.ts',
  ];

  const ROOT = path.join(__dirname, '../../../..');

  for (const filePath of FILES_TO_SCAN) {
    const fullPath = path.join(ROOT, filePath);

    it(`${filePath} should not contain prohibited ISO terms`, () => {
      // Skip if file doesn't exist (graceful for incremental rollout)
      if (!fs.existsSync(fullPath)) {
        console.warn(`[SKIP] File not found: ${filePath}`);
        return;
      }

      const rawContent = fs.readFileSync(fullPath, 'utf-8');

      // Strip negative-example lines that intentionally contain prohibited terms
      // (e.g., "NEVER use: 'ISO compliant'" in prompt files)
      const content = stripNegativeExamples(rawContent);

      // The terms definition file intentionally contains prohibited terms as definitions
      if (filePath.includes('isoMessagingTerms.ts')) {
        // This file intentionally contains prohibited terms as definitions
        // Verify the disclaimer and approved terms are clean instead
        const violations = findProhibitedTerms(ISO_DISCLAIMER);
        expect(violations).toEqual([]);
        return;
      }

      // Reset regex lastIndex (findProhibitedTerms creates new regex each call)
      const violations = findProhibitedTerms(content);

      if (violations.length > 0) {
        const details = violations
          .map((v) => `  - Found: "${v.term}" -> Use: "${v.alternative}" (${v.reason})`)
          .join('\n');
        fail(`Prohibited ISO terms found in ${filePath}:\n${details}`);
      }
    });
  }

  it('ISO_DISCLAIMER should not contain prohibited terms', () => {
    const violations = findProhibitedTerms(ISO_DISCLAIMER);
    expect(violations).toEqual([]);
  });

  it('APPROVED_TERMS should not trigger prohibited terms check', () => {
    for (const term of APPROVED_TERMS) {
      const violations = findProhibitedTerms(term);
      expect(violations).toEqual([]);
    }
  });

  it('should have at least 5 prohibited terms defined', () => {
    expect(PROHIBITED_TERMS.length).toBeGreaterThanOrEqual(5);
  });

  it('should scan at least 90% of expected files (not skipped)', () => {
    let scannedCount = 0;
    for (const filePath of FILES_TO_SCAN) {
      const fullPath = path.join(ROOT, filePath);
      if (fs.existsSync(fullPath)) {
        scannedCount++;
      }
    }
    // Prevent silently passing if files don't exist
    expect(scannedCount).toBeGreaterThanOrEqual(FILES_TO_SCAN.length - 1);
  });
});
```

### 2. Key Rules

- **Scan real files**: Read actual source files and scan their content. This catches terms in string literals, comments, and template text.
- **Skip terms definition file**: `isoMessagingTerms.ts` intentionally contains prohibited terms as definitions. Only verify that the disclaimer and constants within it are clean.
- **Context-aware scanning (negative-example exemption)**: Story 38.2.3 adds "NEVER use" examples to the narrative system prompt that intentionally contain prohibited terms (e.g., `NEVER use: "ISO compliant", "ISO certified"`). The scanner MUST exclude lines that are inside negative-example contexts. Before calling `findProhibitedTerms(content)`, strip lines matching any of these patterns:
  - Lines containing `NEVER use` (case-insensitive)
  - Lines starting with a negative-example marker: `//` comment followed by `NEVER`, or lines containing the pattern `- NEVER use:`
  - Lines prefixed with the cross-mark emoji pattern (lines containing `"NEVER"` or starting with a negation example block)

  **Implementation:** Before scanning each file, filter content line-by-line. Exclude any line where `line.includes('NEVER use')` or `line.trimStart().startsWith('- NEVER')` or the line is inside a section headed `## Prohibited` or `**CRITICAL MESSAGING RULES:**`. This prevents the scanner from flagging intentional negative examples in prompt files while still catching genuine violations.

  ```typescript
  function stripNegativeExamples(content: string): string {
    const lines = content.split('\n');
    let inProhibitedSection = false;
    return lines
      .filter((line) => {
        const trimmed = line.trim();
        // Track prohibited/messaging-rules sections (end at next heading or blank line)
        if (trimmed.startsWith('## Prohibited') || trimmed.includes('CRITICAL MESSAGING RULES')) {
          inProhibitedSection = true;
          return false;
        }
        if (inProhibitedSection && (trimmed.startsWith('##') || trimmed === '')) {
          inProhibitedSection = false;
        }
        if (inProhibitedSection) return false;
        // Skip individual negative-example lines
        if (/NEVER use/i.test(trimmed)) return false;
        return true;
      })
      .join('\n');
  }
  ```

  Update the test to use `stripNegativeExamples(content)` before passing to `findProhibitedTerms()`.

- **Clear error messages**: When a violation is found, show the file path, the prohibited term, and the suggested alternative.
- **CI gate**: This test runs with `pnpm test:unit` and prevents prohibited terms from being merged.
- **Graceful file skipping**: If a file does not exist yet (e.g., ScoringExcelExporter not yet created), skip with a warning instead of failing. However, at least 90% of files must exist to prevent the test from silently passing when files are missing. After scanning all files, assert minimum scanned count: `expect(scannedCount).toBeGreaterThanOrEqual(FILES_TO_SCAN.length - 1)`.

### 3. Runtime Narrative Validation (HIGH-4 Fix)

**Problem:** The static source code scan only catches prohibited terms in checked-in files. However, the LLM generates narrative text at runtime that could also contain prohibited terms like "ISO compliant" or "ISO certified". A static CI gate alone is insufficient.

**Fix:** The `findProhibitedTerms()` function from `isoMessagingTerms.ts` must also be called at runtime to validate LLM-generated narrative text before it is included in exports.

**Implementation:** Add a validation step in the export pipeline (in `ScoringExportService` or `ExportNarrativeGenerator`) that calls `findProhibitedTerms(narrativeText)` on the generated narrative. If violations are found, either:
1. **Log a warning** and strip/replace the prohibited terms with approved alternatives, OR
2. **Throw an error** that prevents the export from completing with prohibited language.

Recommended approach (option 1 -- graceful replacement with warning):

```typescript
import { findProhibitedTerms, PROHIBITED_TERMS } from '../../domain/compliance/isoMessagingTerms';

function validateNarrativeMessaging(narrative: string): string {
  const violations = findProhibitedTerms(narrative);
  if (violations.length === 0) return narrative;

  // Log violations for monitoring
  console.warn(
    `[ISO Messaging] ${violations.length} prohibited term(s) found in generated narrative:`,
    violations.map((v) => `"${v.term}" -> "${v.alternative}"`).join(', ')
  );

  // Replace prohibited terms using the original detection regex pattern
  // (not just the literal term string), so variant matches are also replaced.
  // Each violation.pattern is the RegExp from PROHIBITED_TERMS that detected it.
  let cleaned = narrative;
  for (const violation of violations) {
    // Re-create with 'gi' flags to replace ALL occurrences (source pattern uses 'i' only)
    const globalPattern = new RegExp(violation.pattern.source, 'gi');
    cleaned = cleaned.replace(globalPattern, violation.alternative);
  }
  return cleaned;
}
```

**Where to call it (dual-validation approach):**

**Validation Point 1 -- Generation time:** At the end of `ExportNarrativeGenerator.generateNarrative()` (in `packages/backend/src/infrastructure/ai/ExportNarrativeGenerator.ts`), after `extractMarkdown()` and the empty-check, but before returning the narrative string:

```typescript
// In ExportNarrativeGenerator.generateNarrative(), after extractMarkdown:
const narrative = this.extractMarkdown(response.content);

if (!narrative || narrative.trim().length === 0) {
  throw new Error('LLM returned empty narrative');
}

// Validate ISO messaging compliance before returning
const validatedNarrative = validateNarrativeMessaging(narrative);
return validatedNarrative;
```

**Validation Point 2 -- Export orchestration (catches cached narratives):** In `ScoringExportService.getScoringData()` (in `packages/backend/src/application/services/ScoringExportService.ts`), immediately after `ensureNarrative()` returns, apply `validateNarrativeMessaging()` to the narrative before it is included in the export data. This is critical because `ensureNarrative()` has a cached path (line ~173) that returns `result.narrativeReport` directly when `narrativeStatus === 'complete'`, bypassing the generator entirely. Narratives stored before the validation was added -- or narratives that were manually edited in the DB -- would never be checked.

```typescript
// In getScoringData(), after ensureNarrative():
const rawNarrative = await this.ensureNarrative(
  result, dimensionScores, dimensionScoreData,
  vendor.name, assessment.solutionName || 'Unknown Solution', solutionType
);

// Validate ISO messaging compliance (catches both new AND cached narratives)
const narrativeReport = validateNarrativeMessaging(rawNarrative);
```

**Why dual validation:** Validating only at generation time misses: (a) narratives cached before the validation code was deployed, (b) narratives edited directly in the database, (c) narratives generated by a different code path (e.g., fallback narrative). The export orchestration layer is the last point before the narrative reaches the user, making it the definitive safety net.

**Acceptance criteria for runtime validation:**
- [ ] `findProhibitedTerms()` is called on LLM-generated narrative text at generation time in `ExportNarrativeGenerator.generateNarrative()` (catches new narratives)
- [ ] `validateNarrativeMessaging()` is ALSO called in `ScoringExportService.getScoringData()` after `ensureNarrative()` returns (catches cached/stored narratives that bypass the generator)
- [ ] Prohibited terms in generated narratives are either replaced or flagged
- [ ] A warning is logged when runtime violations are detected (for monitoring/alerting)

## Files Touched

- `packages/backend/__tests__/unit/domain/compliance/iso-messaging-audit.test.ts` - CREATE (~90 LOC)
- `packages/backend/src/infrastructure/ai/ExportNarrativeGenerator.ts` - MODIFY (add runtime narrative validation call at generation time)
- `packages/backend/src/application/services/ScoringExportService.ts` - MODIFY (add `validateNarrativeMessaging()` call after `ensureNarrative()` to catch cached narratives)

## Tests Affected

- `packages/backend/__tests__/unit/domain/compliance/iso-messaging-audit.test.ts` - CREATE (new audit test file)
- `packages/backend/__tests__/unit/application/services/ScoringExportService.test.ts` - EXTEND (verify cached narrative validation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] This IS the audit test file. See acceptance criteria above.
- [ ] `packages/backend/__tests__/unit/application/services/ScoringExportService.test.ts` (extend)
  - Test that `getScoringData()` calls `validateNarrativeMessaging()` on cached narratives (narrativeStatus === 'complete')
  - Test that a cached narrative containing a prohibited term (e.g., "ISO certified") is cleaned before export
  - Test that newly generated narratives are also validated at export time (double validation is idempotent)

## Definition of Done

- [ ] Messaging audit test scans all export-related files
- [ ] Zero prohibited terms found in any scanned file
- [ ] Scanner exempts negative-example lines from prompt files (no false positives from "NEVER use" examples)
- [ ] Clear error messages for violations
- [ ] Runtime narrative validation calls `findProhibitedTerms()` on LLM-generated text at generation time (`ExportNarrativeGenerator`)
- [ ] Export orchestration validation calls `validateNarrativeMessaging()` on ALL narratives (including cached) before export output (`ScoringExportService`)
- [ ] Test passes in CI
- [ ] No TypeScript errors
