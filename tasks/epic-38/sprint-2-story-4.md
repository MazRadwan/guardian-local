# Story 38.2.4: ISO Messaging Prohibited Terms List

## Description

Create a shared prohibited terms list that all export templates and prompt builders can reference for ISO messaging compliance. Per the PRD (Section 13), Guardian must never claim ISO certification or compliance -- only ISO-informed assessment. This list is consumed by Sprint 8's messaging audit tests and provides constants for template authors.

## Acceptance Criteria

- [ ] `isoMessagingTerms.ts` created with prohibited terms and compliant alternatives
- [ ] Each prohibited term has a regex pattern for matching
- [ ] Each prohibited term has a suggested compliant alternative
- [ ] List includes all terms from PRD Section 13
- [ ] Constants exported for use in templates and tests
- [ ] Under 300 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Create isoMessagingTerms.ts

**File:** `packages/backend/src/domain/compliance/isoMessagingTerms.ts` (CREATE)

```typescript
/**
 * ISO Messaging Compliance Terms
 *
 * Guardian provides ISO-informed assessment, NOT ISO certification.
 * All exports and prompts must use approved language only.
 *
 * Source: PRD Section 13 - ISO Compliance Messaging Guidelines
 */

export interface ProhibitedTerm {
  /** The prohibited phrase */
  term: string;
  /** Regex pattern for matching (case-insensitive) */
  pattern: RegExp;
  /** What to use instead */
  alternative: string;
  /** Why this term is prohibited */
  reason: string;
}

export const PROHIBITED_TERMS: ProhibitedTerm[] = [
  {
    term: 'ISO compliant',
    pattern: /\bISO[- ]compliant\b/i,
    alternative: 'ISO-informed',
    reason: 'Guardian does not certify ISO compliance',
  },
  {
    term: 'ISO certified',
    pattern: /\bISO[- ]certified\b/i,
    alternative: 'assessed against ISO standards',
    reason: 'Only accredited bodies can certify',
  },
  {
    term: 'meets ISO requirements',
    pattern: /\bmeets?\s+ISO\s+requirements?\b/i,
    alternative: 'demonstrates alignment with ISO controls',
    reason: 'Implies certification authority',
  },
  {
    term: 'ISO conformant',
    pattern: /\bISO[- ]conformant\b/i,
    alternative: 'ISO-traceable',
    reason: 'Conformance is a formal certification term',
  },
  {
    term: 'complies with ISO',
    pattern: /\bcompl(?:y|ies)\s+with\s+ISO\b/i,
    alternative: 'aligned with ISO standards',
    reason: 'Compliance is a formal certification term',
  },
  {
    term: 'ISO compliance',
    pattern: /\bISO\s+compliance\b/i,
    alternative: 'ISO alignment',
    reason: 'Compliance implies formal certification',
  },
  {
    term: 'certified against ISO',
    pattern: /\bcertified\s+against\s+ISO\b/i,
    alternative: 'referenced against ISO',
    reason: 'Only accredited bodies certify',
  },
];

/**
 * Approved terms for ISO references in Guardian reports.
 * Use these in templates and narratives.
 */
export const APPROVED_TERMS = [
  'ISO-traceable',
  'ISO-informed',
  'aligned with',
  'referenced against',
  'informed by ISO standards',
  'Guardian assessment informed by ISO controls',
  'demonstrates alignment with',
  'ISO clause reference',
] as const;

/**
 * Standard disclaimer text for all export templates.
 */
export const ISO_DISCLAIMER =
  'This assessment is informed by ISO/IEC 42001 and ISO/IEC 23894 standards. ' +
  'Guardian provides risk assessment referenced against ISO controls, not ISO certification. ' +
  'ISO certification requires formal audit by an accredited certification body.';

/**
 * Check text for prohibited terms.
 * Returns array of violations found.
 */
export function findProhibitedTerms(text: string): ProhibitedTerm[] {
  return PROHIBITED_TERMS.filter((pt) => pt.pattern.test(text));
}
```

### 2. Key Rules

- **Domain layer placement**: This is a domain concern (messaging rules), not infrastructure.
- **Regex patterns are case-insensitive**: ISO messaging violations could appear in any case.
- **Important:** Do NOT use the `/g` flag on these patterns. The `findProhibitedTerms` function uses `test()`, and RegExp with `/g` has stateful `lastIndex` that causes unreliable results on repeated calls. Use `/i` only.
- **Re-usable**: This file is consumed by (a) narrative prompt builders, (b) export template tests, (c) Sprint 8 messaging audit.
- **PRD compliance**: Terms list must match PRD Section 13. If in doubt, err on the side of prohibiting more terms.

## Files Touched

- `packages/backend/src/domain/compliance/isoMessagingTerms.ts` - CREATE (~90 LOC)

## Tests Affected

- None (new file, no existing dependencies)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/domain/compliance/isoMessagingTerms.test.ts`
  - Test `findProhibitedTerms` detects "ISO compliant" in text
  - Test `findProhibitedTerms` detects "ISO certified" in text
  - Test `findProhibitedTerms` detects "meets ISO requirements" in text
  - Test `findProhibitedTerms` detects "complies with ISO" in text
  - Test `findProhibitedTerms` returns empty array for clean text
  - Test `findProhibitedTerms` is case-insensitive
  - Test `findProhibitedTerms` does not flag approved terms ("ISO-traceable", "ISO-informed")
  - Test `ISO_DISCLAIMER` exists and does not contain prohibited terms
  - Test `APPROVED_TERMS` array is non-empty

## Definition of Done

- [ ] `isoMessagingTerms.ts` created with all prohibited terms
- [ ] Each term has pattern, alternative, and reason
- [ ] `findProhibitedTerms()` helper function works
- [ ] ISO disclaimer text passes its own prohibited terms check
- [ ] All tests pass
- [ ] No TypeScript errors
