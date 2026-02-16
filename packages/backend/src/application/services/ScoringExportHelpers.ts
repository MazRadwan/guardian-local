/**
 * ScoringExportHelpers
 *
 * Pure helper functions extracted from ScoringExportService.
 * These are stateless functions used for response selection,
 * section-dimension mapping, solution type determination,
 * fallback narrative generation, and sleep utility.
 *
 * Epic 38.1.1: Extracted to reduce ScoringExportService below 300 LOC.
 */

import { DimensionScoreData } from '../../domain/scoring/types';
import { AssessmentResultDTO, ResponseDTO } from '../../domain/scoring/dtos';
import { SolutionType, DIMENSION_CONFIG } from '../../domain/scoring/rubric';
import { DimensionExportISOData } from '../interfaces/IScoringPDFExporter';

/**
 * Select top vendor responses for narrative evidence.
 *
 * Implements tiered fallback strategy:
 * 1. Use findings.evidenceRefs if available
 * 2. Fall back to section-to-dimension mapping
 * 3. Fall back to even distribution across sections
 *
 * @param responses All responses for the batch
 * @param dimensionScores Dimension scores with potential evidence refs
 * @returns Selected responses (max 30, truncated to 500 chars each)
 */
export function selectTopResponses(
  responses: ResponseDTO[],
  dimensionScores: DimensionScoreData[]
): ResponseDTO[] {
  const selected: ResponseDTO[] = [];
  const usedIds = new Set<string>();

  // Strategy 1: Try to use findings references if available
  for (const ds of dimensionScores) {
    if (ds.findings?.evidenceRefs && Array.isArray(ds.findings.evidenceRefs)) {
      for (const ref of ds.findings.evidenceRefs.slice(0, 2)) {
        const match = responses.find(
          (r) =>
            r.questionNumber === ref.questionNumber &&
            r.sectionNumber === ref.sectionNumber &&
            !usedIds.has(`${r.sectionNumber}-${r.questionNumber}`)
        );
        if (match) {
          selected.push(match);
          usedIds.add(`${match.sectionNumber}-${match.questionNumber}`);
        }
      }
    }
  }

  // Strategy 2: Fallback - select by dimension/section mapping
  if (selected.length < 20) {
    const sectionToDimension = getSectionDimensionMapping();

    for (const ds of dimensionScores) {
      const relevantSections = sectionToDimension[ds.dimension] || [];
      for (const section of relevantSections) {
        const sectionResponses = responses.filter(
          (r) =>
            r.sectionNumber === section &&
            !usedIds.has(`${r.sectionNumber}-${r.questionNumber}`)
        );
        // Take up to 2 per section
        for (const r of sectionResponses.slice(0, 2)) {
          if (selected.length >= 30) break;
          selected.push(r);
          usedIds.add(`${r.sectionNumber}-${r.questionNumber}`);
        }
      }
      if (selected.length >= 30) break;
    }
  }

  // Strategy 3: Ultimate fallback - distribute evenly across all sections
  if (selected.length < 10) {
    const remaining = responses.filter(
      (r) => !usedIds.has(`${r.sectionNumber}-${r.questionNumber}`)
    );
    const perSection = Math.ceil(20 / 10); // ~2 per section
    const bySectionMap = new Map<number, ResponseDTO[]>();

    for (const r of remaining) {
      if (!bySectionMap.has(r.sectionNumber)) {
        bySectionMap.set(r.sectionNumber, []);
      }
      bySectionMap.get(r.sectionNumber)!.push(r);
    }

    for (const [, sectionResps] of bySectionMap) {
      for (const r of sectionResps.slice(0, perSection)) {
        if (selected.length >= 30) break;
        selected.push(r);
      }
      if (selected.length >= 30) break;
    }
  }

  // Truncate each response for token budgeting
  return selected.map((r) => ({
    ...r,
    responseText: r.responseText.slice(0, 500) + (r.responseText.length > 500 ? '...' : ''),
  }));
}

/**
 * Maps dimensions to questionnaire sections.
 * Based on Guardian questionnaire structure.
 */
export function getSectionDimensionMapping(): Record<string, number[]> {
  return {
    clinical_risk: [1, 2],
    privacy_risk: [3],
    security_risk: [4],
    technical_credibility: [5, 6],
    operational_excellence: [7],
    vendor_capability: [8],
    ai_transparency: [5],
    ethical_considerations: [9],
    regulatory_compliance: [3, 10],
    sustainability: [8],
  };
}

/**
 * Determine solution type from assessment solutionType string.
 * Aligns with ScoringService.determineSolutionType() for consistent weighting.
 *
 * GPT Review Fix: Use same logic as ScoringService to ensure narrative
 * weighting aligns with actual scoring weights.
 */
export function determineSolutionType(solutionType: string | null): SolutionType {
  // P2 Fix: Use same strict logic as ScoringService to ensure narrative
  // weighting aligns with actual scoring weights.
  // Removed keyword heuristics that could cause mismatches.
  const validTypes: SolutionType[] = ['clinical_ai', 'administrative_ai', 'patient_facing'];

  if (!solutionType) {
    // Default to clinical_ai for healthcare assessments (aligned with ScoringService)
    return 'clinical_ai';
  }

  const lower = solutionType.toLowerCase();

  // Only accept exact rubric types - no keyword heuristics
  // This ensures export narrative uses same weighting as scoring
  if (validTypes.includes(lower as SolutionType)) {
    return lower as SolutionType;
  }

  // Log warning for invalid values (aligned with ScoringService)
  console.warn(
    `[ScoringExportService] Invalid solutionType "${solutionType}", defaulting to clinical_ai`
  );
  return 'clinical_ai';
}

/**
 * Build fallback narrative when LLM generation fails.
 * Uses executiveSummary + keyFindings with warning.
 */
export function buildFallbackNarrative(result: AssessmentResultDTO): string {
  const findings = (result.keyFindings || []).map((f) => `- ${f}`).join('\n');

  return `## Executive Summary

${result.executiveSummary || 'No executive summary available.'}

## Key Findings

${findings || 'No key findings available.'}

---
*Note: Detailed analysis was not available for this export. Please contact support if this issue persists.*
`;
}

/**
 * Guardian-native dimensions that have no ISO control mappings.
 * These use Guardian healthcare-specific criteria instead.
 */
const GUARDIAN_NATIVE_DIMENSIONS = [
  'clinical_risk',
  'vendor_capability',
  'ethical_considerations',
  'sustainability',
];

/**
 * Build export-friendly ISO data from dimension scores.
 * Extracts assessmentConfidence and isoClauseReferences from findings JSONB.
 */
export function buildDimensionISOData(
  dimensionScores: DimensionScoreData[]
): DimensionExportISOData[] {
  return dimensionScores.map((ds) => ({
    dimension: ds.dimension,
    label: DIMENSION_CONFIG[ds.dimension]?.label || ds.dimension.replace(/_/g, ' '),
    confidence: ds.findings?.assessmentConfidence ?? null,
    isoClauseReferences: ds.findings?.isoClauseReferences ?? [],
    isGuardianNative: GUARDIAN_NATIVE_DIMENSIONS.includes(ds.dimension),
  }));
}

/**
 * Sleep utility for polling
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
