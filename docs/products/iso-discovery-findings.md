# ISO Compliance Discovery Findings

**Date:** 2026-02-10
**Method:** 4-agent research team (iso-researcher, scoring-analyst, prompt-specialist, data-analyst)
**Purpose:** Surface findings, constraints, edge cases, and open questions before planning implementation.

---

## Table of Contents

1. [Scoring Pipeline: End-to-End Flow](#1-scoring-pipeline-end-to-end-flow)
2. [Prompt Inventory](#2-prompt-inventory)
3. [Token Budget Analysis](#3-token-budget-analysis)
4. [ISO 42001 Structure (38 Controls, 9 Domains)](#4-iso-42001-structure)
5. [ISO 23894 Structure](#5-iso-23894-structure)
6. [Dimension-to-ISO Mapping](#6-dimension-to-iso-mapping)
7. [Coverage Gaps](#7-coverage-gaps)
8. [Sample Interpretive Criteria](#8-sample-interpretive-criteria)
9. [Current Explainability Chain (What Exists vs What's Missing)](#9-current-explainability-chain)
10. [Current DB Schema (10 Tables)](#10-current-db-schema)
11. [Export Pipeline Flow](#11-export-pipeline-flow)
12. [Injection Point Analysis](#12-injection-point-analysis)
13. [Prompt Caching Impact](#13-prompt-caching-impact)
14. [Structured Output Schema](#14-structured-output-schema)
15. [Validator Field Survival Analysis](#15-validator-field-survival-analysis)
16. [7-Link Cascade Chain](#16-7-link-cascade-chain)
17. [Phased Implementation Strategy](#17-phased-implementation-strategy)
18. [Pre-Existing Technical Debt](#18-pre-existing-technical-debt)
19. [Tier 2/3 Complexity Assessment](#19-tier-23-complexity-assessment)
20. [Alignment with Leadership's Explainability-to-Confidence Vision](#20-alignment-with-leaderships-vision)
21. [Key Design Decisions Needed (Before Any Implementation)](#21-key-design-decisions)
22. [All Open Questions by Domain](#22-all-open-questions)

---

## 1. Scoring Pipeline: End-to-End Flow

```
User uploads questionnaire file (DOCX/PDF)
    |
    v
ScoringHandler.triggerScoringOnSend() — WebSocket entry point
    |
    v
ScoringService.score() — Orchestrator
    |
    +-- Step 1: Authorization (fileRepo.findByIdAndUser)
    +-- Step 2: File retrieval (fileStorage.retrieve)
    +-- Step 3: Document parsing (scoringExtraction prompt)
    +-- Step 4: Confidence gate (>= 0.7)
    +-- Step 5: Assessment authorization
    +-- Step 6: Status gate (must be 'exported' or 'scored')
    +-- Step 7: Rate limit (5/day per assessment)
    +-- Step 8: Store responses (responseRepo.createBatch)
    +-- Step 9: Determine solution type
    +-- Step 10: SCORE WITH CLAUDE
    |     +-- promptBuilder.buildScoringSystemPrompt()  → STATIC rubric
    |     +-- promptBuilder.buildScoringUserPrompt()    → DYNAMIC per-assessment
    |     +-- llmClient.streamWithTool() with:
    |     |     - tool: scoring_complete (forced via tool_choice: any)
    |     |     - usePromptCache: true
    |     |     - maxTokens: 8000
    |     |     - temperature: 0 (deterministic)
    |     +-- Returns: { narrativeReport (streamed), payload (tool call JSON) }
    +-- Step 11: Validate payload (ScoringPayloadValidator)
    +-- Step 12: Store scores atomically (dimension_scores + assessment_results)
    +-- Step 13: Update assessment status → 'scored'
    +-- Step 14: Build ScoringReportData → return to handler
```

**Critical: Two separate prompt pipelines exist:**
- **Pipeline A (Chat):** `getSystemPrompt()` → `PromptCacheManager` → `ClaudeClient.streamMessage()`
- **Pipeline B (Scoring):** `ScoringPromptBuilder` → `scoringPrompt.ts` → `ClaudeClient.streamWithTool()`

ISO work primarily affects Pipeline B.

---

## 2. Prompt Inventory

| # | File | Purpose | Size | Output Format |
|---|------|---------|------|---------------|
| 1 | `guardian-prompt.md` | Main system prompt (loaded at runtime via env var) | ~38K chars / ~9,600 tokens | N/A (system prompt) |
| 2 | `prompts.ts` | Mode preambles, formatting, tool instructions, `getSystemPrompt()` | ~25K chars (file) | N/A (assembly) |
| 3 | `prompts/scoringPrompt.ts` | Scoring rubric + vendor response builder | ~5.7K chars / ~1,500 tokens (system) | `scoring_complete` tool JSON |
| 4 | `prompts/questionGeneration.ts` | Assessment questionnaire generation | ~8.5K chars / ~2,100 tokens | JSON sections/questions |
| 5 | `prompts/intakeExtraction.ts` | Document parsing for vendor uploads | ~3.8K chars / ~950 tokens | JSON vendor data |
| 6 | `prompts/scoringExtraction.ts` | Q&A extraction from completed questionnaires | ~4.3K chars / ~1,100 tokens | JSON responses |
| 7 | `prompts/exportNarrativePrompt.ts` | Report narrative generation | ~11K chars / ~2,800 tokens (system) | Markdown narrative |

**ISO work touches at minimum:** #3 (scoring), #7 (export narrative). Possibly #4 (question generation) depending on design decision D-7.

---

## 3. Token Budget Analysis

| Pipeline | System Prompt | User Message | History | Max Output | Total | Headroom (of 200K) |
|----------|--------------|-------------|---------|------------|-------|---------------------|
| Chat (Consult) | ~10,500 | ~100-500 | ~2K-8K | 4,096 | ~15-23K | **177-185K** |
| Chat (Assessment) | ~10,700 | ~100-500 | ~2K-8K | 4,096 | ~15-23K | **177-185K** |
| Scoring | ~4,000 | ~5-20K | None | 8,000 | ~17-32K | **168-183K** |
| Export Narrative | ~2,800 | ~5-15K | None | 16,000 | ~12-22K | **178-188K** |
| Question Gen | Inline | ~2,100 | None | Varies | ~5-10K | **190K** |

**Conclusion:** Token budget is NOT a constraint. Even a 5,000-token ISO control injection is trivially within budget.

---

## 4. ISO 42001 Structure

**Type:** Certifiable AI Management System standard (Plan-Do-Check-Act).
**38 Annex A controls across 9 domains:**

| Domain | Controls | Key Topics |
|--------|----------|------------|
| A.2 Policies (3) | A.2.2, A.2.3, A.2.4 | AI policy, alignment, review |
| A.3 Internal Org (2) | A.3.2, A.3.3 | Roles/responsibilities, reporting concerns |
| A.4 Resources (5) | A.4.2-A.4.6 | Documentation, data, tooling, computing, human resources |
| A.5 Impact Assessment (4) | A.5.2-A.5.5 | Impact process, documentation, individual/societal impact |
| A.6 AI Lifecycle (9) | A.6.1.2-A.6.2.8 | Development objectives, requirements, design, V&V, deployment, monitoring, docs, logs |
| A.7 Data (5) | A.7.2-A.7.6 | Development data, acquisition, quality, provenance, preparation |
| A.8 Information (4) | A.8.2-A.8.5 | User docs, external reporting, incidents, stakeholder info |
| A.9 Use of AI (3) | A.9.2-A.9.4 | Responsible use processes, objectives, intended use |
| A.10 Third-party (3) | A.10.2-A.10.4 | Responsibility allocation, suppliers, customers |

**Additionally:** Annex C defines 11 Trustworthiness Objectives and 7 Risk Source Categories (informative, not auditable).

---

## 5. ISO 23894 Structure

**Type:** Guidance standard (NOT certifiable). Extends ISO 31000 for AI risk management.

- Clauses 4-6: Principles, Framework, Risk Management Process
- Annex A: Common AI-related objectives (~6 objectives parallel to 42001 Annex C)
- Annex B: 10 risk source categories (data quality, model failures, security, privacy, safety, fairness, transparency, human oversight, environmental, societal)
- Annex C: Maps risk management to 6 AI lifecycle phases

**Key difference from 42001:** 23894 is process-oriented (how to do risk management), not control-oriented (what to check). Less structured but its risk sources map almost 1:1 to Guardian's dimensions.

---

## 6. Dimension-to-ISO Mapping

| # | Guardian Dimension | ISO 42001 Controls | ISO 23894 Coverage | Coverage |
|---|---|---|---|---|
| 1 | Clinical Risk | A.5.4, A.5.5, C.2.9 (Safety) | Annex B: Safety risks | **PARTIAL** |
| 2 | Data Governance | A.7.2-A.7.6, A.4.3 | Annex B: Data quality, Privacy | **STRONG** |
| 3 | AI Model Risk | A.6.2.2-A.6.2.4, C.3.4 | Annex B: Model limitations; Annex C: Model dev | **STRONG** |
| 4 | Security & Access Control | A.4.5, C.2.10 | Annex B: Security vulnerabilities | **MODERATE** |
| 5 | Integration Risk | A.6.2.5, A.6.2.6, C.3.1 | Annex C: Deployment, Operation | **MODERATE** |
| 6 | Operational Risk | A.6.2.6, A.6.2.8, A.8.4, C.3.3 | Clause 6.6; Annex B: Human oversight | **STRONG** |
| 7 | Vendor Viability | A.10.2-A.10.4, C.3.7 | Limited | **WEAK** |
| 8 | Regulatory & Compliance | A.2.2-A.2.4, A.5.2-A.5.5 | Clause 5.3 | **MODERATE** |
| 9 | Ethical & Social | A.5.4, A.5.5, C.2.1, C.2.5, C.2.11 | Annex B: Fairness, Societal, Transparency | **STRONG** |
| 10 | Change Management | A.6.2.5, A.6.2.7, A.4.6, C.3.7 | Annex C: Deployment; Clause 5.5 | **MODERATE** |

**Summary:** 3 STRONG, 4 MODERATE, 1 PARTIAL, 1 WEAK, 0 unmapped.

---

## 7. Coverage Gaps

**Clinical Risk (PARTIAL):**
ISO 42001 is industry-agnostic. No patient safety, clinical decision support, or healthcare workflow controls. Would need IEC 62304 (medical software) / ISO 14971 (medical device risk) or Guardian-native criteria.

**Vendor Viability (WEAK):**
Only 3 generic third-party controls (A.10.2-A.10.4). No vendor financial stability, lock-in risk, data portability, business continuity, SLA enforcement, exit strategy. This dimension stays mostly Guardian-native.

**Security & Access Control (MODERATE):**
General security objectives exist but specific access control patterns are thin. Better covered by ISO 27001 (not in scope).

**Regulatory & Compliance (MODERATE):**
Standards require "align with regulations" but don't specify WHICH regulations. Healthcare-specific regs (HIPAA, FDA, PIPEDA) need Guardian-specific criteria.

**Change Management (MODERATE):**
Technical deployment covered. Organizational change (clinician training, workflow redesign, user adoption) is thin.

---

## 8. Sample Interpretive Criteria

**Control:** ISO 42001 A.6.2.6 — AI system operation and monitoring

**Guardian's Interpretive Criteria:**

> **Dimension: AI Model Risk — Ongoing Monitoring**
>
> **What Guardian asks the vendor:**
> "Describe your production monitoring approach for AI model performance. Specifically: (a) What metrics do you track continuously after deployment? (b) How do you detect model drift or degradation over time? (c) What automated alerts or thresholds trigger human review? (d) What is your process for model retraining or rollback when performance degrades?"
>
> **Scoring Rubric (Guardian Language):**
> - **Low Risk (1-2):** Comprehensive real-time monitoring with defined drift thresholds, automated alerting, documented retraining/rollback procedures, historical performance tracking.
> - **Medium Risk (3-5):** Monitors some metrics but lacks automated drift detection; retraining is manual/ad-hoc; limited historical tracking.
> - **High Risk (6-8):** Minimal or no production monitoring; no drift detection; no defined process for model degradation response.
> - **Critical Risk (9-10):** Cannot describe any monitoring approach; no evidence of post-deployment oversight.

This demonstrates how ISO text (paraphrased, not copied) becomes Guardian's own assessment language.

---

## 9. Current Explainability Chain

**What EXISTS today:**
```
Dimension Score (e.g., privacy_risk: 65/100, HIGH)
  → findings.subScores (breakdown: "Data Classification: 4/10")
  → findings.keyRisks (["No independent audit verification"])
  → findings.mitigations (["Require annual SOC 2 Type II audit"])
  → findings.evidenceRefs ({ sectionNumber, questionNumber, quote })
  → narrativeReport (Claude-generated prose with [Section X, Q Y] citations)
```

**What's MISSING (the ISO middle layer):**
```
Dimension Score
  → ISO clause reference (42001 A.6.2.6, 23894 6.3)
  → Assessment threshold (what "good" looks like per the standard)
  → Confidence level (how reliable is this evaluation)
  → Rationale tying evidence to standard
```

**The gap is clearly defined.** The dimension → evidence chain is solid. The dimension → standard → threshold → evidence chain doesn't exist.

---

## 10. Current DB Schema

```
users
  |-- assessments (created_by)
  |-- conversations (user_id)
  |-- files (user_id)

vendors
  |-- assessments (vendor_id)
        |-- questions (assessment_id)
        |-- responses (assessment_id)
        |-- dimension_scores (assessment_id)
        |-- assessment_results (assessment_id)

conversations
  |-- assessments (nullable)
  |-- messages (conversation_id)
  |-- files (conversation_id)
```

**Key columns for ISO work:**
- `dimension_scores.findings` — JSONB, flexible, stores subScores/keyRisks/mitigations/evidenceRefs
- `assessment_results.rubric_version` — plain text `'guardian-v1.0'`, not a FK
- `assessment_results.raw_tool_payload` — JSONB, stores POST-VALIDATION payload (not true raw)
- `assessment_results.model_id` — tracks which Claude model produced scores

---

## 11. Export Pipeline Flow

**Two separate export pipelines:**

**Pipeline A: Questionnaire Export (pre-scoring)**
- `ExportController → ExportService → {PDF, Word, Excel}Exporter`
- Blank questionnaire for vendors. No scoring data.

**Pipeline B: Scoring Report Export (post-scoring)**
- `ScoringExportController → ScoringExportService → {ScoringPDF, ScoringWord}Exporter`
- Data retrieval: assessment → assessment_results → dimension_scores → narrative
- Narrative generated on-demand by `ExportNarrativeGenerator` (calls Claude, 16K maxTokens)
- Top 30 vendor responses selected as evidence (3-tier fallback strategy)
- Narrative cached in `assessment_results.narrativeReport`

**Current report structure:**
1. Header (vendor, solution, date, assessment ID)
2. Score Banner (composite score, recommendation, overall risk)
3. Executive Summary
4. Key Findings (bullet list)
5. Dimension Scores Table (10 rows: dimension, score/100, risk badge)
6. Detailed Analysis (Claude-generated narrative)
7. Footer (rubric version, batch ID)

**No Excel scoring exporter exists.** Only questionnaire export has Excel.

---

## 12. Injection Point Analysis

**Option A: System prompt (buildScoringSystemPrompt)**
- Pros: Claude sees ISO controls alongside rubric. Conceptually clean — ISO controls ARE rubric criteria.
- Cons: Cache breaks if ISO content varies per assessment.
- Verdict: Best if ISO framework selection is organization-wide (rare changes).

**Option B: User prompt (buildScoringUserPrompt)**
- Pros: Preserves prompt cache. System prompt stays static.
- Cons: Splits rubric criteria across two prompt locations.
- Verdict: Best if ISO framework selection varies per assessment.

**Revised consensus (from cross-team collaboration):**
- **System prompt:** ISO control CATALOG — static definitions. Changes only when standards are revised. Cacheable.
- **User prompt:** ISO control APPLICABILITY — which controls apply to this vendor/solution type. Varies per assessment.

This maps naturally to the existing architecture (system = static rubric, user = per-assessment context).

---

## 13. Prompt Caching Impact

**Current caching:**
- Chat prompts: `PromptCacheManager` with SHA-256 hash, in-memory map, `cache_control: { type: 'ephemeral' }`
- Scoring prompts: `usePromptCache: true` flag on `streamWithTool()` call

**ISO impact with catalog/applicability split:**
- System prompt (catalog) stays static → **cache preserved**
- User prompt (applicability) varies per assessment → **no cache impact** (user prompt varies anyway)
- Only breaks cache when standard version is updated (annual at most)

---

## 14. Structured Output Schema

**Current `scoring_complete` tool:**
```typescript
{
  compositeScore: integer (0-100),
  recommendation: enum ['approve', 'conditional', 'decline', 'more_info'],
  overallRiskRating: enum ['low', 'medium', 'high', 'critical'],
  executiveSummary: string,
  keyFindings: string[],
  disqualifyingFactors: string[],
  dimensionScores: Array<{         // Exactly 10
    dimension: enum (10 values),
    score: integer (0-100),
    riskRating: enum,
    findings: object (optional)    // UNTYPED in tool schema
  }>
}
```

**TypeScript type has richer findings:**
```typescript
findings?: {
  subScores: Array<{ name, score, maxScore, notes }>,
  keyRisks: string[],
  mitigations: string[],
  evidenceRefs: Array<{ sectionNumber, questionNumber, quote }>
}
```

**The mismatch:** Tool schema says `findings: { type: 'object' }`. TypeScript type has structured sub-fields. Claude gets no schema guidance on findings structure — only prompt text. This is a pre-existing reliability risk.

**Only 5 of 10 dimensions have detailed sub-score guidance** in the scoring prompt (clinical, privacy, security, technical, operational). The other 5 are underspecified. ISO controls could fill this gap.

---

## 15. Validator Field Survival Analysis

| Field Location | Passes Validator? | Survives Sanitization? | Stored in dimension_scores? | Stored in rawToolPayload? |
|---|---|---|---|---|
| Top-level (e.g., `isoComplianceSummary`) | YES | **NO** (stripped) | N/A | **NO** |
| Per-dimension (e.g., `confidence`) | YES | YES | **NO** (not mapped) | YES |
| Inside `findings` (e.g., `findings.isoControlRefs`) | YES | YES | **YES** | YES |

**Implication:** The safest Phase 1 path is ISO data INSIDE `findings`. Flows through entire pipeline without code changes. New top-level or per-dimension fields require validator + type + storage mapping updates.

---

## 16. 7-Link Cascade Chain

For ISO data to flow from Claude's output to the PDF/Word export:

```
Link 1: scoringComplete tool schema (scoringComplete.ts)        → UPDATE (add ISO fields to findings)
Link 2: ScoringPayloadValidator (ScoringPayloadValidator.ts)     → OPTIONAL (tighten findings validation)
Link 3: dimension_scores DB table (dimensionScores.ts)           → NO CHANGE (JSONB flexible)
Link 4: DimensionScoreData type (types.ts)                       → UPDATE (add ISO to findings type)
Link 5: formatDimensionScore() (exportNarrativePrompt.ts)        → UPDATE (read + format ISO fields)
Link 6: Export narrative system prompt                            → UPDATE (instruct Claude to use ISO)
Link 7: PDF/Word template                                        → UPDATE (render ISO compliance section)
```

**5 mandatory changes, 1 optional, 1 free.**

---

## 17. Phased Implementation Strategy

**Phase 1: ISO-Aware Export Narrative (Low effort, high value)**
- Only changes links 5, 6, 7 (export prompt + template)
- No scoring tool schema changes
- No validator changes
- No DB schema changes
- Claude reads existing `findings` data and generates ISO-contextualized narrative
- 16K token budget is generous
- **Delivers:** ISO compliance language in PDF/Word reports

**Phase 2: Structured ISO Scoring Data (Full integration)**
- Changes links 1, 2, 4 (tool schema, validator, types)
- ISO control references stored in `dimension_scores.findings` JSONB
- Structured ISO compliance data queryable in database
- Export narrative gets richer structured data
- **Delivers:** Searchable/queryable ISO compliance data per assessment

Phase 1 ships independently and gives immediate value while Phase 2 adds the full structured pipeline.

---

## 18. Pre-Existing Technical Debt

These issues exist TODAY and should be addressed before or alongside ISO work:

**1. `findings` JSONB has no validation at scoring time.**
Tool schema defines `findings` as `{ type: 'object' }` with no constraints. Validator doesn't check internals. Claude can return any shape. Export pipeline has defensive null guards but malformed data is silently stored. ~1 day fix.

**2. `rawToolPayload` stores sanitized output, not true Claude output.**
The sanitization step constructs a new object with only known fields. Unknown fields are stripped before storage. No way to audit what Claude actually returned. For ISO compliance auditability, this is a gap.

**3. ScoringService.ts is 535 LOC.** Exceeds the 300 LOC limit. Should be split before adding ISO features.

**4. 5 of 10 dimensions lack detailed sub-score guidance.** Only clinical, privacy, security, technical, operational have explicit sub-score breakdowns in the scoring prompt. The other 5 are underspecified.

---

## 19. Tier 2/3 Complexity Assessment

| Standard | Type | Items to Map | Effort | Notes |
|---|---|---|---|---|
| ISO 42001:2023 | Certifiable (controls) | 38 controls + 11 objectives + 7 risk sources | SIGNIFICANT | Well-defined structure |
| ISO 23894:2023 | Guidance (process) | 10 risk categories + 6 lifecycle phases + ~6 objectives | MODERATE | Maps well to Guardian dimensions |
| ISO 22989:2022 | Terminology | Reference embedding | LOW | No controls to map |
| ISO 23053:2022 | ML Framework | Feeds AI Architecture section | MODERATE | |
| ISO 42005:2025 | Impact Assessment | Focused scope | LOW-MODERATE | Newer, less adoption |
| ISO 42006:2025 | Audit Requirements | Methodology-informing | LOW | Less urgent for scoring |

**Significant overlap exists between standards.** 42001 Annex C overlaps with 23894 Annex A/B. A deduplication strategy is needed for Tier 2/3.

**NIST AI RMF** has an official crosswalk to ISO 23894. Could inform a standard-agnostic control taxonomy.

---

## 20. Alignment with Leadership's Vision

Leadership described the "Explainability-to-Confidence Pipeline." Here's how findings align:

| Leadership's Claim | Findings | Status |
|---|---|---|
| `findings.evidenceRefs` links scores to Q/A pairs | Confirmed. Structure: `{ sectionNumber, questionNumber, quote }` | **Aligned** |
| `rubric_version` tracks which rubric was used | Exists as plain text string, not a FK. Works for audit but won't scale to framework versioning. | **Partially aligned** |
| `raw_tool_payload` preserves Claude's original response | **Stores POST-VALIDATION sanitized payload.** Unknown fields silently stripped. Not true raw output. | **Misaligned** |
| "Missing middle layer" is the ISO mapping | Confirmed. The dimension → standard → threshold → evidence chain doesn't exist. | **Aligned** |
| "Once mapping exists, confidence becomes meaningful" | Correct in principle, but complicated by: two different confidence concepts (extraction vs assessment), per-control vs per-dimension aggregation question, and two dimensions with weak ISO coverage where ISO-based confidence is meaningless. | **Aligned with caveats** |

---

## 21. Key Design Decisions Needed (Before Any Implementation)

| # | Decision | Options | Impact | Notes |
|---|----------|---------|--------|-------|
| **D-1** | Where does ISO context go in the prompt? | A) System prompt (catalog, static, cacheable) + user prompt (applicability, per-assessment). B) All in user prompt. C) All in system prompt. | Affects caching, architecture | Team consensus: Option A (split) |
| **D-2** | All 38 controls or only dimension-mapped ones? | A) All 38 (completeness). B) Only dimension-mapped (~30, skip organizational controls like A.2.2). | Affects content scope, token budget | Some controls (AI policy alignment) may not be relevant for vendor assessment |
| **D-3** | How to handle Clinical Risk gap? | A) Guardian-native criteria only (no ISO mapping). B) Supplement with IEC 62304 / ISO 14971. C) Both. | Affects framework model, Tier 2 scope | ISO 42001 is industry-agnostic, no clinical controls |
| **D-4** | How to handle Vendor Viability gap? | A) Accept as Guardian-native dimension. B) Map to ISO 27001 business continuity. | Affects whether all dimensions have ISO coverage | Only 3 generic third-party controls exist |
| **D-5** | Per-dimension confidence or per-control? | A) Per-dimension (10 values, simpler). B) Per-control (30-80 values, granular). C) Per-control stored, aggregated to per-dimension for display. | Affects output schema, report complexity, token budget | Option C is most flexible but most complex |
| **D-6** | Confidence stored where? | A) Inside existing `findings` JSONB (zero migration). B) New column on `dimension_scores`. C) Only in `assessment_compliance_results`. | Affects schema migration, query patterns | Option A is safest Phase 1 path |
| **D-7** | Should question generation become ISO-aware? | A) No change (safest). B) Light touch — add ISO-relevant keywords. C) Full ISO mapping in questions. | Affects questionnaire character, prompt complexity | Option C risks making it feel like an ISO audit, not a healthcare assessment |
| **D-8** | Is ISO 23894 a separate framework or merged into 42001? | A) Separate selectable framework. B) Merged as supplementary guidance. C) Gap-filler only. | Affects DB seeding, framework selection UI, deduplication | Significant overlap between standards |
| **D-9** | Deduplication strategy for overlapping controls? | A) At query time. B) At seed time. C) Standard-agnostic control taxonomy. | Affects Tier 2/3 extensibility | Option C is most future-proof but most effort |
| **D-10** | Fix `rawToolPayload` provenance gap? | A) Add true raw column (pre-validation). B) Keep as-is. C) Log to separate audit table. | Affects compliance auditability | Leadership may not know this gap exists |
| **D-11** | Confidence naming to avoid collision? | A) `extractionConfidence` vs `assessmentConfidence`. B) Different display contexts only. | Affects codebase clarity, report design | Two fundamentally different measures exist/are proposed |
| **D-12** | Fix `findings` validation before ISO work? | A) Yes — tighten validator (~1 day). B) No — rely on prompt guidance. | Affects data quality for ISO fields | Pre-existing debt, not ISO-specific |
| **D-13** | Phase 1 before Phase 2, or both together? | A) Phase 1 first (export narrative only, ships fast). B) Both together (full pipeline). | Affects delivery timeline, risk | Phase 1 gives immediate value with minimal risk |
| **D-14** | maxTokens increase for scoring? | A) Bump 8000 → 10000. B) Keep 8000, optimize output. | Affects cost per scoring call (marginal) | Single line change if needed |
| **D-15** | Split ScoringService.ts before ISO work? | A) Yes — extract scoreWithClaude + storeScores. B) No — add ISO inline. | Affects maintainability, 300 LOC rule | Currently 535 LOC, already over limit |

---

## 22. All Open Questions by Domain

### ISO Standards
1. Should Guardian map ALL 38 ISO 42001 controls, or only those relevant to vendor assessment?
2. How should ISO 23894 relate to 42001 in Guardian — separate framework or merged?
3. Is ISO 42005:2025 (AI impact assessment) worth including in Tier 2?
4. What's the deduplication strategy when a user selects overlapping standards?
5. How does ISO 13485 (medical devices) HLS conflict affect healthcare orgs?

### Scoring Pipeline
6. Where does ISO framework selection live? Assessment entity needs a field for selected frameworks.
7. Should solution type affect ISO control applicability (different weights per solution type)?
8. If ISO controls modify scoring criteria, should rubric_version become `guardian-v1.1-iso42001`?
9. Should the scoring prompt be versioned in the DB alongside framework versions?

### Prompts & AI
10. Should question generation become ISO-aware?
11. What's the right maxTokens for scoring with ISO + confidence signals?
12. Should the `findings` tool schema be tightened to match the TypeScript type?
13. How do we regression test prompt changes? (No existing baseline tests)

### Data & Reports
14. Per-dimension confidence: stored or computed at query time?
15. Backward compatibility: existing assessments won't have compliance results. Graceful degradation or re-score?
16. Does the ISO work need Excel report export?
17. Should `assessment_compliance_results` use batchId for idempotency?
18. The `dimension` field in `dimension_control_mappings` — FK or text field?
19. Report format mockup — has leadership provided guidance?
20. Should ISO references go inside `findings.evidenceRefs` (auto export) or separate `findings.isoControlRefs` (cleaner)?

---

## Key Files Reference

| File | Purpose | LOC |
|------|---------|-----|
| `src/application/services/ScoringService.ts` | Scoring orchestrator | 535 |
| `src/infrastructure/ai/prompts/scoringPrompt.ts` | Scoring prompt builder | 219 |
| `src/infrastructure/ai/prompts/exportNarrativePrompt.ts` | Export narrative prompt | ~200 |
| `src/infrastructure/ai/prompts.ts` | Chat system prompts | 612 |
| `src/infrastructure/ai/PromptCacheManager.ts` | Prompt caching | 72 |
| `src/infrastructure/ai/ClaudeClient.ts` | LLM API wrapper | 817 |
| `src/domain/scoring/tools/scoringComplete.ts` | Tool schema | 102 |
| `src/domain/scoring/rubric.ts` | Rubric constants/weights | 166 |
| `src/domain/scoring/ScoringPayloadValidator.ts` | Payload validation | 179 |
| `src/domain/scoring/types.ts` | Domain types | 92 |
| `src/infrastructure/websocket/handlers/ScoringHandler.ts` | WebSocket handler | 567 |
| `src/infrastructure/database/schema/dimensionScores.ts` | DB schema | 40 |
| `src/infrastructure/database/schema/assessmentResults.ts` | DB schema | 59 |
| `packages/backend/guardian-prompt.md` | Main system prompt | ~1,221 lines |

---

*Generated by iso-discovery agent team (4 agents, cross-team collaboration) on 2026-02-10.*
