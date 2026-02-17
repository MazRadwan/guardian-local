# Epic 37: Pre-Planning Codebase Audit Report

**Date:** 2026-02-13
**Auditors:** Cascade Chain, File Boundary, Pattern Verifier (3 parallel agents)
**Files Audited:** 75+

---

## BLOCKER: Files That Must Split BEFORE ISO Work

| File | Current LOC | Limit | Action Required |
|------|-------------|-------|-----------------|
| `application/services/ScoringService.ts` | **542** | 300 | Extract into thin orchestrator + dedicated services |
| `infrastructure/ai/prompts/scoringPrompt.ts` | **348** | 300 | Extract ISO logic to `scoringPrompt.iso.ts` |
| `domain/scoring/ScoringPayloadValidator.ts` | **275** | 300 | Will exceed with ISO+confidence. Extract confidence validator |

**These splits are Sprint 1 prerequisites. No ISO feature work until they're done.**

---

## SCOPE CORRECTION: D-10 Already Done

`rawToolPayload` provenance is already implemented:
- `assessment_results.raw_tool_payload` (JSONB) stores full Claude output pre-validation
- File: `infrastructure/database/schema/assessmentResults.ts` line 42
- Repository: `DrizzleAssessmentResultRepository.ts` line 36
- **Remove D-10 from Epic 37 scope.**

---

## SCORING PIPELINE CASCADE (Verified File Paths + LOC)

| Component | File (all under `packages/backend/src/`) | LOC | Change |
|-----------|------------------------------------------|-----|--------|
| Tool Schema | `domain/scoring/tools/scoringComplete.ts` | 102 | Add `assessmentConfidence` + `isoClauseReferences` to dimension findings |
| Validator | `domain/scoring/ScoringPayloadValidator.ts` | 275 | Add ISO + confidence validation (soft warnings) |
| Service | `application/services/ScoringService.ts` | 542 | SPLIT, then integrate ISO services |
| Prompt (system) | `infrastructure/ai/prompts/scoringPrompt.ts` | 348 | SPLIT, add ISO catalog to system prompt |
| Prompt Builder | `infrastructure/ai/ScoringPromptBuilder.ts` | 45 | Add ISO prompt methods |
| Types | `domain/scoring/types.ts` | 91 | Add ISO + confidence types |
| DTOs | `domain/scoring/dtos.ts` | 108 | Add ISO fields to findings type |
| Sub-score Rules | `domain/scoring/subScoreRules.ts` | ~150 | No change |
| Rubric | `domain/scoring/rubric.ts` | ~300 | No change (ISO mappings in DB, not hardcoded) |
| Dim Scores Schema | `infrastructure/database/schema/dimensionScores.ts` | 39 | No migration needed (JSONB flexible) |
| Assessment Results | `infrastructure/database/schema/assessmentResults.ts` | 59 | No change (rawToolPayload already exists) |
| Dim Score Repo | `infrastructure/database/repositories/DrizzleDimensionScoreRepository.ts` | ~100 | No change (Drizzle handles JSONB) |
| PromptCacheManager | `infrastructure/ai/PromptCacheManager.ts` | exists | Ready for ISO catalog caching. No modifications needed |

### Scoring Flow (Current → After Epic 37)
```
ScoringService.score()
  → parseDocument() → responses
  → [NEW] ISOControlRetrievalService.getApplicableControls(dimensions)
  → buildScoringSystemPrompt() + [NEW ISO catalog section]
  → buildScoringUserPrompt() + [NEW applicable controls section]
  → llmClient.streamWithTool(scoring_complete) [maxTokens: 8000 → 10000]
  → validator.validate(payload) [NEW ISO + confidence validation]
  → storeScores() [confidence + ISO refs flow into findings JSONB]
```

---

## DATABASE — 6 New Tables

All follow existing pattern (one file per table in `infrastructure/database/schema/`).

| Table | Key Columns | Est. LOC | Notes |
|-------|-------------|----------|-------|
| `compliance_frameworks` | id, name, description, created_at | 40-50 | One per standard (ISO 42001, ISO 23894) |
| `framework_versions` | id, framework_id, version_label, status, published_at | 40-50 | Two-level versioning Level 1 |
| `framework_controls` | id, version_id, clause_ref, domain, title | 50-70 | Immutable per standard version. Unique: (version_id, clause_ref) |
| `interpretive_criteria` | id, control_id, criteria_version, criteria_text, assessment_guidance, review_status | 50-70 | Two-level versioning Level 2. Unique: (control_id, criteria_version) |
| `dimension_control_mappings` | id, control_id, dimension, relevance_weight | 40-50 | Maps controls → Guardian dimensions. Many-to-many |
| `assessment_compliance_results` | id, assessment_id, framework_version_id, criteria_version, control_id, finding | 50-70 | Per-assessment compliance data |

### Indexes Needed
- `framework_controls` → (version_id, clause_ref)
- `interpretive_criteria` → (control_id, criteria_version)
- `dimension_control_mappings` → (dimension, control_id)

### Test DB Update Required
`__tests__/setup/test-db.ts` (64 LOC) — add 6 new tables to `truncateAllTables()` CASCADE list.

---

## DOMAIN ENTITIES — 5 New (Follow Assessment.ts Pattern)

Location: `domain/entities/`

| Entity | Est. LOC | Pattern |
|--------|----------|---------|
| ComplianceFramework | 80-100 | Entity with factory methods, `create()` + `fromPersistence()` |
| FrameworkVersion | 60-80 | Entity, immutable per standard version |
| FrameworkControl | 40-60 | Value Object, immutable |
| InterpretiveCriteria | 60-80 | Value Object with versioning |
| DimensionControlMapping | 40-50 | Value Object |

---

## REPOSITORIES — 5 New (Follow Drizzle Pattern)

Each = interface in `application/interfaces/` + implementation in `infrastructure/database/repositories/`

| Repository | Key Methods | Est. LOC |
|------------|------------|----------|
| IComplianceFrameworkRepository | findAll, findByStandardId, create | 80-100 |
| IFrameworkVersionRepository | findByFrameworkAndVersion, findLatest | 60-80 |
| IFrameworkControlRepository | findByFrameworkVersion, findByClauseNumber, findApplicableForDimension | 100-120 |
| IInterpretiveCriteriaRepository | findByControl, findApprovedByVersion | 80-100 |
| IDimensionControlMappingRepository | findMappingsForDimension, findAllMappings | 100-120 |

---

## NEW SERVICES — 3

| Service | Location | Purpose | Est. LOC |
|---------|----------|---------|----------|
| ISOControlRetrievalService | `application/services/` | Query ISO controls by dimension, build prompt context | 100-130 |
| ScoringConfidenceValidator | `domain/scoring/` | Validate confidence fields (extracted from ScoringPayloadValidator) | 50-60 |
| scoringPrompt.iso.ts | `infrastructure/ai/prompts/` | Build ISO catalog + per-assessment applicable controls | 120-150 |

---

## ASSUMPTION VERIFICATION (All 9 Verified)

| # | Assumption | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `findings` JSONB in `dimension_scores` | CORRECT | `dimensionScores.ts:18-23` — flexible JSONB, no migration needed |
| 2 | 6 isolated prompt pipelines | CORRECT | Verified: consult, assessment, scoring, export narrative, question gen, intake extraction |
| 3 | `scoringComplete` tool schema | CORRECT | `scoringComplete.ts` — `ScoringCompleteInput` type at lines 88-101 |
| 4 | Sub-score soft warnings | CORRECT | `ScoringPayloadValidator.ts:189-271` — warnings array, not errors |
| 5 | rawToolPayload stripped | WRONG — already preserved | `assessmentResults.ts:42` stores full payload. D-10 is done |
| 6 | PromptCacheManager exists | CORRECT | `PromptCacheManager.ts` — SHA256 hash caching, ready for ISO catalog |
| 7 | maxTokens = 8000 | CORRECT | `ScoringService.ts:~210` — increase to 10000 for ISO headroom |
| 8 | Two confidence concepts (no collision) | CORRECT | `extractionConfidence` in responses table (real 0-1), `assessmentConfidence` will be in dimension_scores JSONB (H/M/L string). Different tables, types, semantics |
| 9 | Existing patterns for new features | CORRECT | DB: dimensionScores pattern. Entity: Assessment.ts. Repo: DrizzleAssessmentResultRepository |

---

## COLLISION RISK — Files Multiple Stories Will Touch

| File | Risk | Mitigation |
|------|------|-----------|
| `scoringComplete.ts` | HIGH | Tool schema story FIRST, all others reference it |
| `scoringPrompt.ts` | HIGH | Split into main + ISO file FIRST |
| `ScoringService.ts` | HIGH | Split FIRST, then integrate new services |
| `ScoringPayloadValidator.ts` | HIGH | Extract confidence validator before adding ISO |
| `schema/index.ts` | LOW | Barrel file, add exports last |
| `domain/scoring/types.ts` | MEDIUM | Define all new types in one story, others import |

---

## PARALLELIZATION ANALYSIS

### Can Parallel (No File Overlap)
- 5 schema files (independent)
- 5 domain entities (independent)
- 5 repository interfaces (independent)
- 5 repository implementations (after entities)

### Must Sequence
```
Sprint 1: Split blockers (ScoringService, scoringPrompt, Validator)
  ↓
Sprint 2: DB schema + entities + repos (parallel tracks within sprint)
  ↓
Sprint 3: Seed script + ISO services
  ↓
Sprint 4: Tool schema + prompt enrichment + validator updates
  ↓
Sprint 5: Integration (wire into ScoringService) + prompt iteration
  ↓
Sprint 6: Golden sample regression + extensibility test
```

### Guardian-Native Dimensions (No ISO Mapping)
Per PRD, these 3 dimensions get "Guardian healthcare-specific criteria" label, NOT ISO references:
- `clinical_risk` (no ISO clinical controls)
- `vendor_capability` (ISO coverage too weak)
- `ethical_considerations` / `sustainability` (Guardian-native)

---

## FILE COUNT SUMMARY

| Category | New Files | Modified Files |
|----------|-----------|----------------|
| DB Schema | 5-6 | 1 (index.ts) |
| Migrations | 5-6 | 0 |
| Domain Entities | 5 | 0 |
| Repository Interfaces | 5 | 0 |
| Repository Implementations | 5 | 0 |
| Services | 1-3 | 1 (ScoringService split) |
| Prompts | 1 | 2 (scoringPrompt split + builder) |
| Tool Schema | 0 | 1 |
| Validator | 1 (confidence) | 1 (main validator) |
| Types/DTOs | 0 | 2 |
| Tests | 8-10 | 2-3 |
| Test Setup | 0 | 1 (test-db.ts) |
| Seed Script | 1 | 0 |
| **TOTAL** | **~37-42** | **~11-13** |
