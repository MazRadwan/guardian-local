/**
 * ISO Messaging Compliance Audit Test
 *
 * Story 38.8.3: CI gate test that scans export-related files for prohibited
 * ISO terms. Ensures no file accidentally uses certification language.
 *
 * Also tests the runtime validateNarrativeMessaging() function.
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  findProhibitedTerms,
  PROHIBITED_TERMS,
  ISO_DISCLAIMER,
  APPROVED_TERMS,
  validateNarrativeMessaging,
} from '../../../../src/domain/compliance/isoMessagingTerms'

/**
 * Files to scan for prohibited ISO terms.
 * All paths relative to packages/backend/
 */
const FILES_TO_SCAN = [
  'src/infrastructure/export/templates/scoring-report.html',
  'src/infrastructure/export/WordSectionBuilders.ts',
  'src/infrastructure/export/ScoringWordExporter.ts',
  'src/infrastructure/export/ScoringPDFExporter.ts',
  'src/infrastructure/export/ScoringExcelExporter.ts',
  'src/infrastructure/ai/prompts/exportNarrativeSystemPrompt.ts',
  'src/infrastructure/ai/prompts/exportNarrativeUserPrompt.ts',
  'src/infrastructure/ai/prompts/scoringPrompt.iso.ts',
  'src/domain/compliance/types.ts',
  'src/domain/compliance/isoMessagingTerms.ts',
]

const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..', '..')

/**
 * Strip negative examples and instructional lines from source files.
 *
 * Files contain intentional prohibited term references in:
 * - "NEVER use: 'ISO compliant'" instructions to the LLM
 * - "Do NOT use" instructional lines in prompt templates
 * - Prohibited/CRITICAL MESSAGING sections (multi-line blocks)
 * - JSDoc/comment lines describing the feature ("ISO Compliance Domain Types")
 *
 * These are instructions or descriptions, not actual certification claims.
 * Strip them before scanning to avoid false positives.
 */
function stripNegativeExamples(content: string): string {
  const lines = content.split('\n')
  let inProhibitedSection = false
  return lines
    .filter((line) => {
      const trimmed = line.trim()
      if (
        trimmed.startsWith('## Prohibited') ||
        trimmed.includes('CRITICAL MESSAGING RULES')
      ) {
        inProhibitedSection = true
        return false
      }
      if (inProhibitedSection && (trimmed.startsWith('##') || trimmed === '')) {
        inProhibitedSection = false
      }
      if (inProhibitedSection) return false
      // Filter instructional lines that quote prohibited terms as examples
      if (/NEVER use/i.test(trimmed)) return false
      if (/Do\s+NOT\s+use/i.test(trimmed)) return false
      // Filter JSDoc/comment lines that use "ISO compliance" as a feature descriptor
      if (/^\s*(\*|\/\*|\*\/|\/\/)/.test(line) && /ISO\s+compliance/i.test(trimmed)) return false
      return true
    })
    .join('\n')
}

describe('ISO Messaging Compliance Audit', () => {
  describe('File scanning for prohibited terms', () => {
    const existingFiles: Array<{ relativePath: string; fullPath: string }> = []
    const skippedFiles: string[] = []

    // Pre-compute file existence
    beforeAll(() => {
      for (const relativePath of FILES_TO_SCAN) {
        const fullPath = path.join(BACKEND_ROOT, relativePath)
        if (fs.existsSync(fullPath)) {
          existingFiles.push({ relativePath, fullPath })
        } else {
          skippedFiles.push(relativePath)
        }
      }
    })

    it('should have ALL scanned files exist (fail-closed gate)', () => {
      const scannedCount = existingFiles.length
      expect(scannedCount).toBe(FILES_TO_SCAN.length)
      if (skippedFiles.length > 0) {
        throw new Error(
          `ISO Audit gate is fail-closed: ${skippedFiles.length} file(s) not found.\n` +
          `Missing: ${skippedFiles.join(', ')}\n` +
          `If renamed/moved, update FILES_TO_SCAN in this test.`
        )
      }
    })

    it.each(FILES_TO_SCAN)(
      'should not contain prohibited terms: %s',
      (relativePath) => {
        const fullPath = path.join(BACKEND_ROOT, relativePath)

        if (!fs.existsSync(fullPath)) {
          throw new Error(
            `Audited file not found: ${relativePath}. If renamed/moved, update FILES_TO_SCAN.`
          )
        }

        const rawContent = fs.readFileSync(fullPath, 'utf-8')

        // Special handling for isoMessagingTerms.ts:
        // This file intentionally contains prohibited terms as definitions.
        // Only verify that ISO_DISCLAIMER itself is clean (tested separately).
        if (relativePath.endsWith('isoMessagingTerms.ts')) {
          return
        }

        // Strip negative examples from prompt files before scanning
        const content = stripNegativeExamples(rawContent)
        const violations = findProhibitedTerms(content)

        if (violations.length > 0) {
          const details = violations
            .map((v) => `  - "${v.term}" (use "${v.alternative}" instead)`)
            .join('\n')
          throw new Error(
            `Prohibited ISO terms found in ${relativePath}:\n${details}\n\n` +
              `Fix: Replace prohibited terms with approved alternatives.`
          )
        }
      }
    )
  })

  describe('ISO_DISCLAIMER compliance', () => {
    it('should not contain prohibited terms', () => {
      const violations = findProhibitedTerms(ISO_DISCLAIMER)
      expect(violations).toEqual([])
    })
  })

  describe('APPROVED_TERMS compliance', () => {
    it('should not trigger prohibited terms check', () => {
      const approvedText = APPROVED_TERMS.join(' ')
      const violations = findProhibitedTerms(approvedText)
      expect(violations).toEqual([])
    })
  })

  describe('PROHIBITED_TERMS coverage', () => {
    it('should have at least 5 prohibited terms defined', () => {
      expect(PROHIBITED_TERMS.length).toBeGreaterThanOrEqual(5)
    })
  })

  describe('validateNarrativeMessaging (runtime validation)', () => {
    it('should return clean narrative unchanged', () => {
      const clean =
        'This assessment is ISO-informed and aligned with ISO standards.'
      const result = validateNarrativeMessaging(clean)
      expect(result).toBe(clean)
    })

    it('should replace "ISO compliant" with "ISO-informed"', () => {
      const dirty = 'The vendor solution is ISO compliant.'
      const result = validateNarrativeMessaging(dirty)
      expect(result).toContain('ISO-informed')
      expect(result).not.toMatch(/ISO[- ]compliant/i)
    })

    it('should replace "ISO certified" with "assessed against ISO standards"', () => {
      const dirty = 'This system is ISO certified for healthcare.'
      const result = validateNarrativeMessaging(dirty)
      expect(result).toContain('assessed against ISO standards')
      expect(result).not.toMatch(/ISO[- ]certified/i)
    })

    it('should replace multiple prohibited terms in one narrative', () => {
      const dirty =
        'The ISO compliant system is ISO certified and meets ISO requirements.'
      const result = validateNarrativeMessaging(dirty)
      expect(result).not.toMatch(/ISO[- ]compliant/i)
      expect(result).not.toMatch(/ISO[- ]certified/i)
      expect(result).not.toMatch(/meets?\s+ISO\s+requirements?/i)
    })

    it('should log a warning when violations are found', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation()
      validateNarrativeMessaging('The vendor is ISO compliant.')
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ISO Messaging]'),
        expect.stringContaining('"ISO compliant"')
      )
      warnSpy.mockRestore()
    })

    it('should not log when narrative is clean', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation()
      validateNarrativeMessaging('ISO-informed assessment aligned with standards.')
      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('should handle empty string without error', () => {
      const result = validateNarrativeMessaging('')
      expect(result).toBe('')
    })

    it('should produce consistent results on repeated calls', () => {
      const dirty = 'ISO compliant and ISO certified system.'
      const r1 = validateNarrativeMessaging(dirty)
      const r2 = validateNarrativeMessaging(dirty)
      const r3 = validateNarrativeMessaging(dirty)
      expect(r1).toBe(r2)
      expect(r2).toBe(r3)
    })
  })
})
