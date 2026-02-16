/**
 * Unit tests for exportNarrativeSystemPrompt
 *
 * Part of Epic 38: File splitting refactor
 * Story 38.1.3: Split exportNarrativePrompt into System and User Prompt Files
 */

import { buildExportNarrativeSystemPrompt } from '../../../../../src/infrastructure/ai/prompts/exportNarrativeSystemPrompt.js';
import {
  ALL_DIMENSIONS,
  DIMENSION_CONFIG,
  RUBRIC_VERSION,
} from '../../../../../src/domain/scoring/rubric.js';

describe('buildExportNarrativeSystemPrompt', () => {
  const systemPrompt = buildExportNarrativeSystemPrompt();

  it('returns a non-empty string containing "Guardian"', () => {
    expect(typeof systemPrompt).toBe('string');
    expect(systemPrompt.length).toBeGreaterThan(100);
    expect(systemPrompt).toContain('Guardian');
  });

  it('mentions all 10 risk dimensions', () => {
    for (const dim of ALL_DIMENSIONS) {
      const label = DIMENSION_CONFIG[dim].label;
      expect(systemPrompt).toContain(label);
    }
  });

  it('includes the rubric version', () => {
    expect(systemPrompt).toContain(RUBRIC_VERSION);
  });

  it('includes formatting requirements section', () => {
    expect(systemPrompt).toContain('## Formatting Requirements');
    expect(systemPrompt).toContain('Typography');
    expect(systemPrompt).toContain('Section Breaks');
    expect(systemPrompt).toContain('Evidence Citations');
  });

  it('includes "DO NOT GENERATE" section', () => {
    expect(systemPrompt).toContain('DO NOT GENERATE');
    expect(systemPrompt).toContain('Report header or title');
    expect(systemPrompt).toContain('Executive Summary');
    expect(systemPrompt).toContain('Key findings list');
    expect(systemPrompt).toContain('Risk Overview');
  });

  it('includes report structure with required sections', () => {
    expect(systemPrompt).toContain('Dimension Analysis');
    expect(systemPrompt).toContain('Compliance Assessment');
    expect(systemPrompt).toContain('Recommendations');
    expect(systemPrompt).toContain('Conclusion');
  });

  it('includes risk rating interpretation table', () => {
    expect(systemPrompt).toContain('LOW');
    expect(systemPrompt).toContain('MEDIUM');
    expect(systemPrompt).toContain('HIGH');
    expect(systemPrompt).toContain('CRITICAL');
  });

  it('includes recommendation criteria', () => {
    expect(systemPrompt).toContain('APPROVE');
    expect(systemPrompt).toContain('CONDITIONAL');
    expect(systemPrompt).toContain('DECLINE');
    expect(systemPrompt).toContain('MORE_INFO');
  });

  it('is deterministic (same output on multiple calls)', () => {
    const prompt1 = buildExportNarrativeSystemPrompt();
    const prompt2 = buildExportNarrativeSystemPrompt();
    expect(prompt1).toBe(prompt2);
  });
});
