# Sprint 3: Cost Optimization (P2)

## Goal
Reduce LLM API costs through prompt caching, configurable token limits, abort support, and query optimization.

## Stories
- [ ] 20.3.1 - Prompt caching for scoring rubric
- [ ] 20.3.2 - Configurable maxTokens for scoring
- [ ] 20.3.3 - Abort support for parsing
- [ ] 20.3.4 - Combine assessment+vendor lookup

## Dependencies
- All stories are independent and can run in parallel
- No dependency on Sprint 1 or Sprint 2 completion

## Parallelization Matrix

| Story | Files | Can Parallel With |
|-------|-------|-------------------|
| 20.3.1 | ScoringPromptBuilder.ts, PromptCacheManager.ts | 20.3.2, 20.3.3, 20.3.4 |
| 20.3.2 | ILLMClient.ts, ClaudeClient.ts, ScoringService.ts | 20.3.1, 20.3.3, 20.3.4 |
| 20.3.3 | IScoringDocumentParser.ts, DocumentParserService.ts, ScoringService.ts | 20.3.1, 20.3.2, 20.3.4 |
| 20.3.4 | IAssessmentRepository.ts, DrizzleAssessmentRepository.ts | 20.3.1, 20.3.2, 20.3.3 |

**Note:** Stories 20.3.2 and 20.3.3 both touch ScoringService.ts but in different methods, so can still be parallel with careful merging.

## Acceptance Criteria
- [ ] Scoring rubric prompt uses Anthropic prompt caching (30-50% input cost reduction)
- [ ] maxTokens is configurable per call (default reduced to 2,500 for scoring)
- [ ] Abort signal propagates through parsing LLM calls
- [ ] Assessment+vendor lookup is single query instead of two
- [ ] All changes are backward compatible
- [ ] All existing tests continue to pass

## Technical Context

### R9: Prompt Caching
The scoring system prompt (~2,500 tokens) is static and identical for every scoring call. Using Anthropic's prompt caching can reduce input token costs by 30-50%.

### R10: Configurable maxTokens
`streamWithTool` hardcodes 8192 output tokens, but the scoring tool payload only needs ~1,200. Reducing this may improve latency and prevents runaway token usage.

### R11: Abort Support
Currently `ScoringService.abort()` stops scoring but the parsing LLM call (in DocumentParserService) continues running. Wiring the abort signal through saves tokens.

### R3: Combined Lookup
`ScoringService` calls `assessmentRepo.findById()` then `assessmentRepo.getVendor()` separately. A single query with join is more efficient.
