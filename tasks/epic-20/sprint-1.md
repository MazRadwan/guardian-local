# Sprint 1: Critical Fixes (P0)

## Goal
Fix the two critical issues blocking production readiness: empty narrative reports in exports and incorrect solution-type weighting.

## Stories
- [ ] 20.1.1 - On-demand narrative prompt builder
- [ ] 20.1.2 - Export service narrative generation integration
- [ ] 20.1.3 - Repository update method for narrative persistence
- [ ] 20.1.4 - Fix solution-type weighting bug

## Dependencies
- Story 20.1.2 depends on 20.1.1 (prompt builder must exist)
- Story 20.1.2 depends on 20.1.3 (repository method must exist)
- Story 20.1.4 is independent (can run in parallel with 20.1.1-20.1.3)

## Parallelization Matrix

| Story | Files | Can Parallel With |
|-------|-------|-------------------|
| 20.1.1 | prompts/, ExportNarrativePromptBuilder.ts | 20.1.3, 20.1.4 |
| 20.1.2 | ScoringExportService.ts | None (depends on 20.1.1, 20.1.3) |
| 20.1.3 | DrizzleAssessmentResultRepository.ts | 20.1.1, 20.1.4 |
| 20.1.4 | ScoringService.ts, Assessment entity | 20.1.1, 20.1.3 |

## Acceptance Criteria
- [ ] Exported PDFs contain detailed narrative analysis section
- [ ] Narrative is generated on-demand at export time (not during scoring)
- [ ] Generated narratives are persisted for subsequent exports
- [ ] Scoring uses correct dimension weights based on assessment.solutionType
- [ ] Fallback to executiveSummary if LLM fails during export
- [ ] All existing tests continue to pass
- [ ] New test coverage for narrative generation and weighting fix

## Technical Context

### R7: On-Demand Narrative Generation
The current scoring workflow uses `tool_choice: { type: 'any' }` which forces Claude to skip text output and go directly to the `scoring_complete` tool. This results in an always-empty `narrativeReport`. The fix generates the narrative at export time using stored scores and responses.

### R0/R1: Solution-Type Weighting Bug
`ScoringService.determineSolutionType()` maps `assessment.assessmentType` (quick/comprehensive/category_focused) to rubric weights, but these values never match the rubric's `SolutionType` (clinical_ai/administrative_ai/patient_facing). The fix should use `assessment.solutionType` instead.
