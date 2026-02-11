# PRD: ISO Compliance Framework, Explainability & Confidence Scoring

**Status:** Revised Draft
**Author:** Guardian Team
**Date:** 2026-02-10
**Stakeholders:** Leadership, Product, Engineering
**Inputs:** Discovery findings (`iso-discovery-findings.md`), Design council consensus (`iso-design-council-consensus.md`)

---

## 1. Problem Statement

Leadership has expanded Guardian's scope to include ISO standards compliance in vendor assessments. Currently, Guardian scores vendors across 10 risk dimensions using a proprietary rubric, but scores lack traceability to recognized international standards. Assessors and leadership cannot answer: "Why did this vendor score 3/5 on Data Governance, and how confident are we in that score?"

Three capabilities are required:
1. **ISO Standards Mapping** — Assess vendors against specific ISO controls
2. **Explainability** — Trace every score back through a reasoning chain to specific evidence and standards
3. **Confidence Scoring** — Indicate how reliable each assessment score is using qualitative confidence levels

These capabilities must be built in an extensible, version-aware manner because standards evolve and scope will grow.

---

## 2. Goals

- Augment Guardian's existing 10-dimension scoring with ISO compliance traceability
- Provide explainability: every dimension score links to ISO clause references and vendor evidence
- Provide confidence assessment: each dimension score has a qualitative reliability indicator (High/Medium/Low) with rationale
- Support two-level versioning from day 1 (standard versions + Guardian criteria versions)
- Architecture supports adding new standards without prompt or code changes (DB-driven)

## Non-Goals

- Replacing the current 10-dimension scoring model (ISO augments, not replaces)
- Reproducing copyrighted ISO clause text verbatim (interpretive controls only)
- Implementing all 6 standards at once (tiered rollout)
- Building a standalone compliance product (this is an enhancement to existing assessments)
- Claiming ISO compliance or certification on behalf of vendors (see Section 13: Messaging Guidelines)
- Making question generation ISO-aware (deferred — questions stay assessment-focused)

---

## 3. Success Criteria

| # | Criterion | How to Verify |
|---|-----------|---------------|
| SC-1 | A completed assessment report traces each ISO-mapped dimension score to at least one ISO clause reference | Review exported PDF/Word report for ISO references per dimension |
| SC-2 | Confidence level reliably distinguishes specific vendor evidence from vague claims | Run 5 sample assessments, verify High confidence correlates with specific answers and Low with vague answers |
| SC-3 | Adding a Tier 2 standard requires only DB seeding — zero prompt file changes, zero code changes | Seed ISO 22989 into framework tables, run assessment, verify it appears in report |
| SC-4 | Updating a standard version preserves old assessment validity | Create assessment against v2023, seed v202x, verify old assessment still shows v2023 scores |
| SC-5 | Explainability chain is complete: score -> ISO clause -> threshold -> evidence -> confidence -> rationale | Trace one dimension score end-to-end in report output |
| SC-6 | Prompt regression: existing assessment quality does not degrade | Run golden sample baseline assessments before and after prompt changes, compare scoring consistency |
| SC-7 | Guardian-native dimensions (Clinical Risk, Vendor Viability) are clearly labeled as such in reports | Verify these dimensions show "Guardian healthcare-specific criteria" language, not ISO references |
| SC-8 | All report language uses approved ISO messaging (D-16) — no "compliant" or "certified" language | Audit 5 exported reports for prohibited terms |

---

## 4. User Journeys

### Journey 1: Assessor Runs ISO-Augmented Assessment
1. Assessor starts assessment in Assessment Mode (unchanged workflow)
2. Guardian asks intake questions (unchanged)
3. Guardian generates questionnaire (unchanged — question generation is not ISO-aware)
4. Vendor responses are scored against 10 dimensions (unchanged)
5. Each dimension score now includes: ISO clause references (where mapped), confidence level, evidence traceability
6. Exported report shows explainability chain per ISO-mapped dimension
7. Guardian-native dimensions (Clinical Risk, Vendor Viability) show healthcare-specific criteria instead

### Journey 2: Admin Seeds a New Framework
1. Admin runs seed script for ISO 23053:2022 (Tier 2)
2. Claude generates interpretive criteria for each control
3. Admin reviews generated criteria (YAML or UI)
4. Criteria stored in DB with criteria version tag (e.g., `guardian-iso23053-v1.0`)
5. Controls mapped to relevant Guardian dimensions via `dimension_control_mappings`
6. Next assessment automatically includes new framework controls in export context
7. No prompt files or code changed

### Journey 3: Standard Version Update
1. ISO 42001:2023 is superseded by 42001:202x
2. Admin creates new framework version, runs seed script
3. New version's controls are generated and reviewed
4. Old version marked deprecated (but not deleted)
5. New assessments use 202x, old assessments retain 2023 reference
6. Guardian criteria version can be updated independently (e.g., correcting interpretive criteria without waiting for a new ISO edition)

### Journey 4: Leadership Reads Report
1. Opens PDF/Word export
2. Sees dimension score: "Data Governance: 3/5" with confidence badge: "Medium"
3. Reads explainability: "Score reflects partial alignment with ISO 42001 A.6.2.6 (data quality management). Vendor demonstrates systematic encryption protocols but lacks independent audit verification. Confidence is medium due to absence of third-party validation."
4. Sees ISO Standards Alignment section listing specific clause references and their status
5. Understands why the score is what it is, and how much to trust it

---

## 5. Scope Tiers

### Tier 1 — Ship First
| Standard | Structure | Role | Rationale |
|----------|-----------|------|-----------|
| ISO 42001:2023 | 38 Annex A controls, 9 domains | Primary framework | Core AI management system, highest vendor relevance |
| ISO 23894:2023 | Risk management guidance | Gap-filler for 42001 | Supplements 42001 where risk management detail is thin; not a standalone framework |

**Note:** ISO 23894 is guidance (not certifiable). It is seeded as supplementary to 42001, filling gaps in risk treatment coverage. No separate framework selection UI. Deduplication with 42001 is handled at seed time during human review.

### Tier 2 — Next
| Standard | Structure | Rationale |
|----------|-----------|-----------|
| ISO 22989:2022 | Terminology | Embed as reference layer, less complex |
| ISO 23053:2022 | ML framework | Feeds AI Architecture assessment section |

### Tier 3 — After
| Standard | Structure | Rationale |
|----------|-----------|-----------|
| ISO 42005:2025 | Impact assessment | Newer, less vendor adoption |
| ISO 42006:2025 | Audit requirements | Informs methodology, less urgent for scoring |

**Tier 1 is the MVP. Tier 2/3 should require only DB seeding if architecture is right (SC-3).**

---

## 6. Technical Constraints

### ISO Copyright
- Cannot reproduce ISO clause text verbatim without licensing
- **Approach:** Interpretive controls — Guardian's own assessment criteria that reference ISO clause numbers but express requirements in original language
- Criteria become Guardian's intellectual property
- Leadership is exploring CSA Group licensing as a parallel track (non-blocking)

### Two-Level Versioning (Non-Negotiable)

Two distinct version concepts must be tracked independently:

**Level 1: Standard Version** (external, immutable)
- ISO 42001:**2023** — changes only when ISO publishes a new edition
- Controls are immutable per standard version

**Level 2: Criteria Version** (internal, Guardian-controlled)
- `guardian-iso42001-v1.0`, `guardian-iso42001-v1.1`
- Guardian's interpretive criteria for each control
- Can be corrected/improved without requiring a new ISO version
- Version bumps when criteria are materially revised
- Old assessments reference the criteria version they were scored against

Assessments link to both: which ISO standard version AND which Guardian criteria version was used.

### ISO Coverage Gaps (Two Dimensions)

Two of Guardian's 10 risk dimensions have weak or no ISO coverage:

| Dimension | ISO Coverage | Approach |
|-----------|-------------|----------|
| **Clinical Risk** | None — ISO 42001 is industry-agnostic, no clinical controls | Guardian-native healthcare-specific criteria (no ISO mapping) |
| **Vendor Viability** | Weak — only 3 generic third-party controls in ISO 42001 | Guardian-native criteria (mapping would be misleading) |

These dimensions are explicitly labeled as "assessed using Guardian healthcare-specific criteria" in reports. IEC 62304 / ISO 14971 supplementation for Clinical Risk is deferred to Tier 2/3.

### Prompt Complexity
- 7 prompt files in the system (main, scoring, question gen, export narrative, intake extraction, scoring extraction, question generation)
- Phase 1 touches only export narrative prompt
- Phase 2 touches scoring prompt + tool schema
- 40KB main prompt has been tuned over 4 months — high regression risk
- Prompt changes must be iterative with regression testing at each step

### Prompt Architecture for ISO Context
- **Static catalog** (ISO control reference data) → system prompt (cacheable via PromptCacheManager)
- **Per-assessment applicability** (which controls are relevant) → user prompt (dynamic)
- All 38 controls stored in DB; only dimension-mapped controls (~30) injected into prompts
- ~8 organizational-only controls (e.g., A.2.2 "AI policy alignment") stored but not used in scoring context

### Extensibility Requirement
- "They will keep adding scope" — architecture must handle Tier 2/3 without rework
- Adding a standard = DB seed + human review, not code changes
- ISO controls injected into prompts from DB at runtime, not hardcoded
- Overlapping controls deduplicated at seed time during human review (not query time)

---

## 7. Confidence Model

### Why Qualitative, Not Numeric

The original proposal used a 4-signal weighted formula producing numeric percentages. Design council analysis demonstrated this is infeasible:

- Claude produces 10-15% variance on repeated scoring of identical inputs
- The 4 proposed signals (specificity, coverage, consistency, verifiability) are **correlated, not independent** — Claude cannot decompose them reliably
- Claude cannot reliably "count" coverage percentage or detect subtle contradictions across 20+ Q&A pairs
- Numeric confidence (e.g., "72%") creates false precision when the underlying measurement varies by 15% each run

### Adopted Model: Qualitative Assessment Confidence

Claude assigns a confidence level per dimension during scoring/export, based on holistic assessment of evidence quality:

| Level | Label | Meaning | Example |
|-------|-------|---------|---------|
| **High** | Strong evidence | Specific, verifiable evidence directly addressing the assessed controls | "Vendor provides ISO 27001 certificate, names specific encryption protocols (AES-256), and references independent audit report from 2025" |
| **Medium** | Partial evidence | Some relevant evidence but with gaps, generalities, or missing verification | "Vendor describes encryption practices but provides no audit evidence or specific implementation details" |
| **Low** | Weak evidence | Vague claims, contradictory statements, or minimal response to relevant questions | "Vendor states 'we take security seriously' with no specifics; contradicts earlier claim about data handling" |

### Output Schema (Per Dimension)

```json
{
  "confidence": {
    "level": "high" | "medium" | "low",
    "rationale": "Specific explanation citing evidence and ISO references that support this confidence level"
  }
}
```

**Storage:** Inside existing `findings` JSONB in `dimension_scores` table (zero schema migration for Phase 1). Phase 2 may promote to a dedicated column.

### Confidence Naming Convention

Two distinct "confidence" concepts exist in the system — they must never be conflated:

| Name | Context | Meaning |
|------|---------|---------|
| `extractionConfidence` | Scoring extraction (document parsing) | "I parsed this document correctly" — existing, unchanged |
| `assessmentConfidence` | Dimension scoring / export | "The evidence supports this score" — new, introduced by this PRD |

These are never displayed together in reports. `extractionConfidence` is internal; `assessmentConfidence` is user-facing.

### Compliance Condition

The confidence rationale string **must** cite specific evidence and ISO references. A bare "Medium" without explanation is not acceptable. This was a condition from the Compliance SME for accepting qualitative over numeric confidence.

---

## 8. Explainability Model

The missing "middle layer" between Claude's scores and ISO standards:

**Current chain (incomplete):**
```
Dimension Score -> findings.evidenceRefs -> question/response pairs
```

**Target chain (complete):**
```
Dimension Score
  -> ISO clause reference(s) (which standard, which control)
  -> Assessment threshold (what "good" looks like for this control)
  -> Vendor evidence (specific Q&A that informed the score)
  -> Confidence level (High/Medium/Low)
  -> Rationale (natural language explanation citing evidence + ISO references)
```

**In the report, this reads:**

> **Data Governance: 3/5**
>
> Assessment Confidence: **Medium**
>
> Score reflects partial alignment with ISO 42001 A.6.2.6 (data quality management for AI systems) and ISO 23894 6.3 (risk treatment). Vendor demonstrates systematic encryption protocols (AES-256 at rest, TLS 1.3 in transit) but lacks independent audit verification. No evidence of structured data lineage or bias detection processes. Confidence is medium due to absence of third-party validation.
>
> **ISO Standards Alignment:**
> - ISO 42001 A.6.2.6 — Data quality management: Partial
> - ISO 42001 A.6.2.7 — Data provenance: Not evidenced
> - ISO 23894 6.3 — Risk treatment: Addressed
>
> **Evidence:** Q12 (encryption protocols), Q15 (data handling), Q23 (audit processes)

**For Guardian-native dimensions:**

> **Clinical Risk: 4/5**
>
> Assessment Confidence: **High**
>
> Assessed using Guardian healthcare-specific criteria (no ISO mapping available for clinical risk in current framework scope).
>
> **Evidence:** Q8 (clinical validation), Q14 (safety protocols), Q31 (incident response)

---

## 9. Database Schema (Conceptual)

```
compliance_frameworks
  id, name, description, created_at
  -- "ISO/IEC 42001", "ISO/IEC 23894"

framework_versions
  id, framework_id, version_label, status (active|deprecated),
  published_at, created_at
  -- version_label="2023", status="active"

framework_controls
  id, version_id, clause_ref, domain, title,
  created_at
  -- Immutable per standard version.
  -- One row per control per version.

interpretive_criteria
  id, control_id, criteria_version, criteria_text,
  assessment_guidance, review_status (draft|approved|deprecated),
  created_at, approved_at, approved_by
  -- Guardian's own language. Versioned independently of the ISO standard.
  -- criteria_version: "guardian-iso42001-v1.0"
  -- Corrections create new criteria version, not new control records.
  -- review_status tracks human approval workflow.

dimension_control_mappings
  id, control_id, dimension, relevance_weight
  -- Maps controls to Guardian's 10 risk dimensions
  -- One control can map to multiple dimensions
  -- Only mapped controls are injected into prompts (~30 of 38)

assessment_compliance_results  (Phase 2)
  id, assessment_id, framework_version_id, criteria_version,
  control_id, finding, evidence_refs,
  created_at
  -- Per-assessment, per-control evaluation
  -- Phase 1: not used (confidence lives in findings JSONB)
  -- Phase 2: structured compliance data per control
```

**Key schema decisions:**
- `interpretive_criteria` is separate from `framework_controls` to support two-level versioning
- `review_status` tracks the human approval workflow for generated criteria
- `assessment_compliance_results` is Phase 2 only — Phase 1 stores confidence in existing `findings` JSONB
- Confidence is NOT stored in `assessment_compliance_results` (it's per-dimension, not per-control)

---

## 10. Risks & Mitigations

| # | Risk | Impact | Mitigation | Status |
|---|------|--------|------------|--------|
| R-1 | Prompt regression — ISO context breaks existing scoring quality | High | Golden sample baseline tests before Phase 2 prompt changes; Phase 1 only touches export narrative (lower risk) | Phase 2 prerequisite |
| R-2 | Content accuracy — Are Claude-generated interpretive criteria correct? | High | Human review cycle with `review_status` tracking before criteria are used in production | Architecture supports this |
| R-3 | Confidence consistency — Can Claude produce stable H/M/L assignments? | Medium | Qualitative model (not numeric) reduces variance; test same input 5x for stability | Design council addressed |
| R-4 | Scope creep — Tier 2/3 standards add more complexity than expected | Medium | SC-3 validates extensibility before Tier 2 work begins; Tier 2 overlap handled at seed time | Architecture supports this |
| R-5 | ISO licensing — CSA Group licensing timeline unknown | Low | Interpretive approach works without license; license is additive | Non-blocking |
| R-6 | Report complexity — Explainability chains make reports too long/dense | Medium | UX design: ISO references as supporting detail (not headline); exec summary gets one ISO sentence only | Design council addressed |
| R-7 | Performance — Injecting ISO controls into prompt increases token count | Medium | Only dimension-mapped controls (~30, not all 38) injected; static catalog in system prompt for cache hits | Architecture supports this |
| R-8 | Messaging liability — "ISO-compliant" language implies certification Guardian can't provide | High | D-16 messaging guidelines enforced in prompts and templates; human review of Phase 1 output | New — design council added |
| R-9 | Two confidence concepts confused — extraction vs assessment confidence | Medium | Explicit naming convention (`extractionConfidence` vs `assessmentConfidence`); never shown together | Design council addressed |

---

## 11. Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| Current Epic 16 (Document Parser) | In Progress | Phase 1 is independent — no conflict |
| Current Epic 17 (Multi-File Upload) | Planned | Phase 1 is independent — no conflict |
| Epic 8 (Integration & Polish) | Pending | May overlap with report template changes |
| Leadership: Report format expectations | Awaiting | Using UX designer's proposed format until feedback received |
| Leadership: ISO licensing decision | In exploration | Non-blocking (interpretive approach works without license) |
| Phase 2 prerequisites (P2-1 through P2-4) | Not started | Must complete before Phase 2 starts (can overlap with Phase 1) |

---

## 12. Delivery Phases

### Phase 1: ISO-Aware Export Narrative (Ship First)

**Scope:** Add ISO traceability and confidence to exported reports. Zero changes to the scoring pipeline.

| Component | Change | Files Affected |
|-----------|--------|----------------|
| DB tables + seeding | New tables: `compliance_frameworks`, `framework_versions`, `framework_controls`, `interpretive_criteria`, `dimension_control_mappings` | Schema migration + seed script |
| Export narrative prompt | Inject relevant ISO controls into narrative generation context | `exportNarrativePrompt.ts` |
| Score formatting | Include ISO context when building dimension data for export | `formatDimensionScore()` |
| PDF/Word templates | Render ISO references, confidence badges, Guardian-native labels | Template files |
| ISO messaging | Enforce approved language in prompt instructions and templates | Prompt + template text |

**What Phase 1 does NOT touch:**
- `ScoringService.ts` (scoring pipeline)
- `scoringComplete.ts` (tool schema)
- `ScoringPayloadValidator.ts` (validation)
- `scoring/types.ts` (domain types)
- Question generation prompts
- Main system prompt (`guardian-prompt.md`)

**Prerequisites:** None. Can start immediately.

### Phase 2 Prerequisites (Between Phase 1 and Phase 2)

These must be completed before Phase 2 begins. Can overlap with Phase 1 development.

| # | Item | Effort | Description |
|---|------|--------|-------------|
| P2-1 | Fix `rawToolPayload` provenance | ~1 day | Add true raw column storing Claude's output pre-validation |
| P2-2 | Tighten `findings` JSONB validation | ~1 day | Add schema validation to `ScoringPayloadValidator` for `findings` internals |
| P2-3 | Split `ScoringService.ts` | ~1-2 days | Extract `scoreWithClaude` + `storeScores` (currently 535 LOC, over 300 limit) |
| P2-4 | Regression test baseline | ~2-3 days | Golden sample test suite: 5 assessments scored and stored as expected output |

### Phase 2: Structured ISO Scoring Data (Separate Epic)

**Scope:** Integrate ISO compliance into the scoring pipeline itself. Structured data stored per assessment per control.

| Component | Change |
|-----------|--------|
| Scoring tool schema | Add ISO fields to `scoringComplete.ts` tool definition |
| Payload validator | Validate ISO fields in scoring output |
| Domain types | Add ISO types to `types.ts` |
| Scoring prompt | Inject ISO controls into scoring context (system + user prompt split) |
| DB storage | Populate `assessment_compliance_results` table |
| maxTokens | Assess and increase if needed (8000 → 10000) |

**Prerequisites:** P2-1 through P2-4 complete.

### Phase 3: Extensibility Validation

- Seed Tier 2 standard (ISO 22989) with zero code changes (validates SC-3)
- Version update workflow test
- Re-scoring capability (optional)

---

## 13. ISO Messaging Guidelines

Guardian is NOT a certification body. All ISO references in reports, UI, and documentation must use approved language.

### Required Language
- **"ISO-traceable"** — assessment criteria reference ISO clauses
- **"ISO-informed"** — scoring is informed by ISO controls
- **"maps to ISO 42001 A.x.x.x"** — specific clause reference

### Prohibited Language
- **"ISO-compliant"** — implies certification
- **"ISO-certified"** — Guardian cannot certify
- **"meets ISO requirements"** — implies conformity assessment
- **"ISO score"** — no such thing exists

### Enforcement
- Messaging guidelines baked into export narrative prompt instructions
- Report templates reviewed for prohibited terms
- Human review of all ISO-related report output during Phase 1
- Automated linting for prohibited terms in Phase 2+

---

## 14. Test Strategy

### Phase 1 Tests
| Type | What | Coverage |
|------|------|----------|
| Unit | ISO control retrieval, prompt injection logic, template rendering | Export pipeline components |
| Integration | Export pipeline end-to-end with ISO context | Full export flow |
| Snapshot | Report output format stability | Catch unintended format changes |
| Manual | Generated ISO narrative accuracy | Human spot-check of 5 reports |

### Phase 2 Prerequisite Tests
| Type | What | Purpose |
|------|------|---------|
| Golden sample baseline | 5 assessments scored + stored as expected output | Regression detection |
| A/B comparison | Pre-ISO vs post-ISO scoring on same inputs | Quality validation |
| Confidence stability | Same input scored 5x, verify H/M/L consistency | Model reliability |

### Scope Fence
- Phase 1 tests: export pipeline ONLY
- Phase 2 prep tests: regression baseline + scoring consistency
- Phase 2 tests: full scoring pipeline with ISO + confidence

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-02-10 | Initial draft from leadership requirements |
| 0.2 | 2026-02-10 | Major revision incorporating design council consensus (16 decisions). Rewrote confidence model (qualitative replaces numeric). Added two-level versioning, ISO messaging guidelines (D-16), coverage gaps, phased delivery structure, test strategy. Updated schema for interpretive criteria versioning. |
