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
  term: string
  /** Regex pattern for matching (case-insensitive, NO /g flag) */
  pattern: RegExp
  /** What to use instead */
  alternative: string
  /** Why this term is prohibited */
  reason: string
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
]

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
] as const

/**
 * Standard disclaimer text for all export templates.
 */
export const ISO_DISCLAIMER =
  'This assessment is informed by ISO/IEC 42001 and ISO/IEC 23894 standards. ' +
  'Guardian provides risk assessment referenced against ISO controls, not ISO certification. ' +
  'ISO certification requires formal audit by an accredited certification body.'

/**
 * Check text for prohibited terms.
 * Returns array of violations found.
 */
export function findProhibitedTerms(text: string): ProhibitedTerm[] {
  return PROHIBITED_TERMS.filter((pt) => pt.pattern.test(text))
}
