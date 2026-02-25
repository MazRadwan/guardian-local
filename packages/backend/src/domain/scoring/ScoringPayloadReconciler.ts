/**
 * ScoringPayloadReconciler
 *
 * Auto-corrects arithmetic in Claude's scoring payload BEFORE validation.
 * Follows the principle: "Claude interprets, code calculates."
 *
 * Reconciliation steps:
 * 1. Dimension scores = sum of valid sub-scores
 * 2. Recommendation = auto-corrected from disqualifier tiers
 * 3. Composite score = recalculated from corrected dimension scores + weights
 */

import { RiskDimension } from '../types/QuestionnaireSchema.js';
import { DIMENSION_WEIGHTS, DIMENSION_CONFIG, SolutionType, DISQUALIFIER_TIER } from './rubric.js';
import { SUB_SCORE_RULES } from './subScoreRules.js';

/** A correction that was applied during reconciliation */
export interface ReconciliationCorrection {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
}

export interface ReconciliationResult {
  payload: Record<string, unknown>;
  corrections: ReconciliationCorrection[];
}

/**
 * Reconciles Claude's scoring payload to ensure mathematical consistency.
 * Mutates a COPY of the payload — never modifies the original.
 */
export function reconcilePayload(
  payload: unknown,
  solutionType: SolutionType
): ReconciliationResult {
  if (!payload || typeof payload !== 'object') {
    return { payload: payload as Record<string, unknown>, corrections: [] };
  }

  const p = structuredClone(payload) as Record<string, unknown>;
  const corrections: ReconciliationCorrection[] = [];

  // Step 1: Reconcile dimension scores from sub-scores
  reconcileDimensionScores(p, corrections);

  // Step 2: Reconcile recommendation from disqualifiers
  reconcileRecommendation(p, corrections);

  // Step 3: Recalculate composite score from corrected dimension scores
  reconcileCompositeScore(p, solutionType, corrections);

  if (corrections.length > 0) {
    console.info(
      `[ScoringPayloadReconciler] Applied ${corrections.length} correction(s):`,
      corrections.map(c => `${c.field}: ${c.oldValue} → ${c.newValue} (${c.reason})`)
    );
  }

  return { payload: p, corrections };
}

/** Set dimension score = sum of valid sub-scores when sub-scores exist */
function reconcileDimensionScores(
  p: Record<string, unknown>,
  corrections: ReconciliationCorrection[]
): void {
  if (!Array.isArray(p.dimensionScores)) return;

  for (const ds of p.dimensionScores as Array<Record<string, unknown>>) {
    if (!ds || typeof ds !== 'object') continue;

    const dimension = ds.dimension as RiskDimension;
    const findings = ds.findings as Record<string, unknown> | undefined;
    if (!findings || typeof findings !== 'object') continue;

    const subScores = findings.subScores as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(subScores) || subScores.length === 0) continue;

    const rules = SUB_SCORE_RULES[dimension];
    if (!rules) continue;

    const validNames = new Set(rules.map(r => r.name));
    let sum = 0;
    let hasValidSubScores = false;

    for (const sub of subScores) {
      const name = sub.name as string;
      const score = sub.score as number;
      if (typeof name === 'string' && validNames.has(name) && typeof score === 'number') {
        sum += score;
        hasValidSubScores = true;
      }
    }

    if (!hasValidSubScores) continue;

    const currentScore = ds.score as number;
    if (typeof currentScore === 'number' && currentScore !== sum) {
      corrections.push({
        field: `dimensionScores.${dimension}.score`,
        oldValue: currentScore,
        newValue: sum,
        reason: 'dimension score adjusted to match sub-score sum',
      });
      ds.score = sum;
    }
  }
}

/** Auto-correct recommendation when disqualifiers conflict */
function reconcileRecommendation(
  p: Record<string, unknown>,
  corrections: ReconciliationCorrection[]
): void {
  const disqualifiers = Array.isArray(p.disqualifyingFactors)
    ? (p.disqualifyingFactors as string[])
    : [];
  if (disqualifiers.length === 0) return;

  const recommendation = p.recommendation as string;
  let hasHard = false;
  let hasRemediable = false;

  for (const factor of disqualifiers) {
    const tier = DISQUALIFIER_TIER[factor] ?? 'hard_decline'; // unknown = hard (fail safe)
    if (tier === 'hard_decline') hasHard = true;
    else hasRemediable = true;
  }

  if (hasHard && recommendation !== 'decline') {
    corrections.push({
      field: 'recommendation',
      oldValue: recommendation,
      newValue: 'decline',
      reason: 'hard_decline disqualifier(s) present — must be decline',
    });
    p.recommendation = 'decline';
  } else if (!hasHard && hasRemediable && recommendation === 'approve') {
    corrections.push({
      field: 'recommendation',
      oldValue: recommendation,
      newValue: 'conditional',
      reason: 'remediable_blocker(s) present — cannot approve',
    });
    p.recommendation = 'conditional';
  }
}

/** Recalculate composite score from corrected dimension scores + weights */
function reconcileCompositeScore(
  p: Record<string, unknown>,
  solutionType: SolutionType,
  corrections: ReconciliationCorrection[]
): void {
  if (!Array.isArray(p.dimensionScores)) return;

  const weights = DIMENSION_WEIGHTS[solutionType];
  const dimScores = p.dimensionScores as Array<Record<string, unknown>>;
  let totalContribution = 0;

  for (const dimension of Object.keys(weights) as RiskDimension[]) {
    const weight = weights[dimension];
    if (weight <= 0) continue;

    const entry = dimScores.find(ds => ds.dimension === dimension);
    if (!entry || typeof entry.score !== 'number') return; // can't calculate

    const config = DIMENSION_CONFIG[dimension];
    const riskEquivalent = config.type === 'capability'
      ? 100 - (entry.score as number)
      : (entry.score as number);

    totalContribution += (weight * riskEquivalent) / 100;
  }

  const expected = Math.round(totalContribution);
  const current = p.compositeScore as number;

  if (typeof current === 'number' && current !== expected) {
    corrections.push({
      field: 'compositeScore',
      oldValue: current,
      newValue: expected,
      reason: `recalculated weighted average (${solutionType})`,
    });
    p.compositeScore = expected;
  }
}
