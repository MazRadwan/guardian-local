# ISO Design Council — Consensus Document

**Date:** 2026-02-10
**Method:** 7-expert design council (128 messages, extensive cross-team debate)
**Participants:** Solutions Architect, Senior Backend Engineer, AI/ML Engineer, Product Manager, Compliance SME, UX/Report Designer, QA Lead
**Input:** PRD v0.1 (`prd-iso-compliance.md`), Discovery Findings (`iso-discovery-findings.md`), codebase verification
**Purpose:** Reach consensus on 15+1 design decisions before implementation begins.

---

## Executive Summary

The council reached consensus on all 16 design decisions after extensive debate. The most significant outcome is the **rejection of the PRD's numeric confidence model** — the AI/ML engineer demonstrated that Claude cannot reliably produce 4 weighted signals with the precision required. The replacement is a **qualitative High/Medium/Low + rationale** model.

Other key outcomes:
- **Phase 1 ships immediately** with zero code prerequisites (export narrative only)
- **All 38 controls in DB**, but only ~30 injected into prompts (organizational controls filtered)
- **Two-level versioning** required (standard version + Guardian criteria version)
- **New decision D-16** added: ISO messaging guidelines ("ISO-traceable," never "ISO-compliant")
- **Regression baseline** built between Phase 1 and Phase 2 (not before Phase 1)

---

## Consensus Decisions

### D-1: Where Does ISO Context Go in the Prompt?

**Decision: Option A — Split (static catalog in system prompt, per-assessment applicability in user prompt)**

| Role | Position | Notes |
|------|----------|-------|
| Architect | A (split) | Maximizes prompt cache hit rate; static catalog is cacheable |
| Backend | A (split) | Confirmed PromptCacheManager uses SHA-256 hash; static content = cache hits |
| AI/ML | A (split) | ISO catalog is reference material → system prompt. Dynamic assessment data → user prompt |
| PM | A | Agrees — no debate needed |
| Compliance | A | Catalog must be stable per version |
| UX | A | No direct impact on reports |
| QA | A | Testable: verify cache hit metrics |

**Consensus: Unanimous**

---

### D-2: All 38 Controls or Dimension-Mapped Only?

**Decision: Compromise — All 38 in DB, ~30 in prompts (filter organizational-only controls)**

| Role | Position | Notes |
|------|----------|-------|
| Compliance | All 38 in DB (completeness required for audit defensibility) | Non-negotiable for compliance |
| AI/ML | ~30 in prompts (organizational controls like A.2.2 "AI policy alignment" aren't assessable from vendor responses) | Reduces noise, improves output quality |
| Architect | Compromise: store all, inject relevant | Clean separation of data vs runtime |
| Backend | Compromise supported | Filter at query time via `dimension_control_mappings` |
| PM | Compromise | Ships faster with focused prompt |
| UX | Compromise | Fewer irrelevant references in reports |
| QA | Compromise | Test both: DB has 38, prompt gets ~30 |

**Consensus: Unanimous on compromise.** DB contains all 38 for completeness; prompt injection filters to dimension-mapped controls only (~30). The ~8 organizational controls are stored but not used in scoring prompts.

---

### D-3: Clinical Risk Gap Handling

**Decision: Option A — Guardian-native criteria only (no ISO mapping for Clinical Risk)**

| Role | Position | Notes |
|------|----------|-------|
| Compliance | A — Guardian-native only | ISO 42001 is industry-agnostic; inventing fake mappings is worse than admitting a gap |
| Architect | A | Clean architecture: explicitly mark dimension as "Guardian-native assessment" |
| Backend | A | Simpler implementation; no need to handle mixed ISO + non-ISO dimensions |
| AI/ML | A | Claude already has strong clinical risk scoring criteria; adding weak ISO mappings would dilute quality |
| PM | A | Avoids scope creep into IEC 62304 / ISO 14971 (Tier 2+ territory) |
| UX | A | Report should say "assessed using Guardian healthcare-specific criteria" — honest and clear |
| QA | A | Testable: verify Clinical Risk dimension has no ISO clause references in output |

**Consensus: Unanimous.** Clinical Risk remains Guardian-native. Reports explicitly state this dimension uses healthcare-specific criteria, not ISO mapping. IEC 62304 / ISO 14971 supplementation deferred to Tier 2/3.

---

### D-4: Vendor Viability Gap Handling

**Decision: Option A — Accept as Guardian-native dimension**

| Role | Position | Notes |
|------|----------|-------|
| All 7 | A | Only 3 generic third-party controls exist in ISO 42001; mapping would be misleading |

**Consensus: Unanimous.** Same treatment as Clinical Risk — Vendor Viability stays Guardian-native. Reports reflect this honestly. ISO 27001 business continuity mapping deferred to Tier 3+.

---

### D-5: Per-Dimension or Per-Control Confidence?

**Decision: Per-dimension only (High/Medium/Low + rationale string)**

This was the most debated decision. The PRD proposed per-control numeric confidence with 4 weighted signals. The AI/ML engineer **killed this model** with evidence:

**AI/ML Engineer's Analysis:**
- Claude produces 10-15% variance on repeated confidence scoring of identical inputs
- The 4 signals (specificity 0.35, coverage 0.30, consistency 0.20, verifiability 0.15) are **correlated, not independent** — Claude can't decompose them
- Claude cannot reliably "count" coverage percentage or detect subtle contradictions across 20+ Q&A pairs
- Numeric confidence creates a false sense of precision ("72% confident" is theater if the number varies by 15% each run)

**Resolution:**

| Role | Position | Notes |
|------|----------|-------|
| AI/ML | Per-dimension, qualitative only (H/M/L + rationale) | "Numeric signals are theater — correlated outputs, not independent measurements" |
| Backend | Per-dimension, qualitative | Simpler to implement; JSONB can store the rationale string |
| Architect | Per-dimension | Extensible: can add per-control later when LLM capability improves |
| PM | Per-dimension | Ships faster, avoids false precision |
| Compliance | Accepted with conditions | "Acceptable IF rationale string must cite specific evidence and ISO references" |
| UX | Per-dimension | Users understand H/M/L intuitively; numeric % requires explanation |
| QA | Per-dimension | Testable: verify H/M/L maps correctly, verify rationale non-empty |

**Consensus: Unanimous.** Qualitative confidence replaces numeric model. Per-control confidence deferred until LLM capability supports it.

**PRD Impact: Major revision required.** Section 7 (Confidence Scoring Model) must be rewritten. Remove 4-signal weighted formula. Replace with qualitative model.

---

### D-6: Confidence Storage Location

**Decision: Option A — Inside existing `findings` JSONB (zero migration for Phase 1)**

| Role | Position | Notes |
|------|----------|-------|
| Backend | A (findings JSONB) | Zero schema migration; `findings` already survives the cascade pipeline |
| Architect | A for Phase 1, B for Phase 2 | Phase 1: no migration. Phase 2: add proper column when structured data exists |
| All others | A | Consensus follows backend pragmatism |

**Consensus: Unanimous for Phase 1.** Confidence stored as `findings.confidence: { level: "high"|"medium"|"low", rationale: "..." }`. Phase 2 may promote to a dedicated column.

---

### D-7: Should Question Generation Become ISO-Aware?

**Decision: Option A — No change (safest, deferred to Phase 2+)**

| Role | Position | Notes |
|------|----------|-------|
| PM | A | "Is this needed for Tier 1? No." |
| AI/ML | A | Adding ISO keywords to question generation risks making it feel like an ISO audit, not a healthcare vendor assessment |
| Compliance | A | Questions should be assessment-focused, not standard-focused |
| All others | A | Unanimous |

**Consensus: Unanimous.** Question generation stays unchanged. ISO context is added at scoring and export time, not at question generation time.

---

### D-8: ISO 23894 — Separate Framework or Merged?

**Decision: Option C — Gap-filler only (supplements 42001, not a standalone framework)**

| Role | Position | Notes |
|------|----------|-------|
| Compliance | C (gap-filler) | 23894 is guidance, not certifiable; it provides risk management process detail where 42001 is thin |
| Architect | C | Cleanest architecture: 23894 controls fill gaps in 42001 domain mappings, not a separate selectable framework |
| All others | C | Follows compliance and architecture leads |

**Consensus: Unanimous.** ISO 23894 is seeded as supplementary to 42001. No separate framework selection UI. Its controls fill gaps in 42001's coverage (especially risk treatment). Deduplication handled at seed time.

---

### D-9: Deduplication Strategy for Overlapping Controls

**Decision: Option B — At seed time (manual curation during review)**

| Role | Position | Notes |
|------|----------|-------|
| Compliance | B | Deduplication requires human judgment about which standard's framing is primary |
| Architect | B for now, C (taxonomy) as aspirational Tier 3 goal | Option C (standard-agnostic taxonomy) is over-engineering for 2 standards |
| PM | B | "Don't build a taxonomy for 2 standards" |
| Backend | B | Simple and pragmatic |
| All others | B | Follows PM and compliance |

**Consensus: Unanimous.** Deduplication happens during the human review cycle when seeding controls. Overlapping controls get a single canonical representation with references to both source standards.

---

### D-10: Fix rawToolPayload Provenance Gap?

**Decision: Deferred to Phase 2 prerequisites**

| Role | Position | Notes |
|------|----------|-------|
| Backend | Defer — stores sanitized payload today, adding true raw column is a Phase 2 prerequisite, not Phase 1 | Phase 1 doesn't touch scoring pipeline |
| Compliance | Wants it fixed but accepts deferral | "Must be fixed before Phase 2 ships to production" |
| Architect | Defer to Phase 2 prep | Correct but non-blocking for Phase 1 |
| PM | Defer | "Ships faster" |
| All others | Defer | Phase 1 export narrative doesn't need raw payload |

**Consensus: Unanimous deferral.** Phase 1 doesn't touch scoring pipeline so provenance gap is non-blocking. Must be addressed as Phase 2 prerequisite (before structured ISO data flows through scoring).

---

### D-11: Confidence Naming to Avoid Collision

**Decision: Option A — Explicit naming: `extractionConfidence` vs `assessmentConfidence`**

| Role | Position | Notes |
|------|----------|-------|
| UX | A (explicit naming) | Reports must never confuse these two; different display contexts |
| Backend | A | Clean code separation; two different types in codebase |
| AI/ML | A | Different prompt contexts produce them; naming must reflect this |
| All others | A | Follows UX and backend leads |

**Consensus: Unanimous.** `extractionConfidence` = "I parsed this document correctly" (existing, on scoring extraction). `assessmentConfidence` = "the evidence supports this score" (new, on dimension scores). Never displayed together or conflated.

---

### D-12: Fix `findings` Validation Before ISO Work?

**Decision: Deferred to Phase 2 prerequisites**

| Role | Position | Notes |
|------|----------|-------|
| Backend | Defer — ~1 day fix but non-blocking for Phase 1 (export narrative reads existing findings, doesn't write new ones) |
| QA | Defer but flag — "must be fixed before Phase 2 adds new fields to findings JSONB" |
| All others | Defer | Consistent with D-10: Phase 1 doesn't touch scoring pipeline |

**Consensus: Unanimous deferral.** Tightening `findings` validation is Phase 2 prep work. Phase 1 only reads existing findings data.

---

### D-13: Phase 1 Before Phase 2?

**Decision: Option A — Phase 1 first (export narrative only, ships independently)**

| Role | Position | Notes |
|------|----------|-------|
| All 7 | A | Unanimous from the start — no debate needed |

**Consensus: Unanimous.** Phase 1 (ISO-aware export narrative) ships independently. It touches only the export pipeline (links 5-7 in the cascade chain). Zero scoring pipeline changes. Zero DB migration. Zero validator changes.

**Phase 1 scope:**
- Seed ISO 42001 + 23894 interpretive controls into DB (new tables)
- Modify `exportNarrativePrompt.ts` to inject relevant ISO controls
- Modify `formatDimensionScore()` to include ISO context
- Update PDF/Word templates to render ISO references + confidence
- Deliver: ISO-traceable language in exported reports

**Phase 2 scope (separate epic):**
- Modify scoring tool schema (`scoringComplete.ts`)
- Update `ScoringPayloadValidator.ts`
- Update domain types (`types.ts`)
- Structured ISO compliance data in DB
- Structured confidence scores per dimension

---

### D-14: maxTokens Increase for Scoring?

**Decision: Defer — assess after Phase 1 (Phase 1 doesn't change scoring pipeline)**

| Role | Position | Notes |
|------|----------|-------|
| AI/ML | Defer — export narrative uses its own maxTokens (16K budget has plenty of headroom) |
| Backend | Defer — single line change when needed |
| All others | Defer | Non-blocking for Phase 1 |

**Consensus: Unanimous deferral.** Phase 2 may need scoring maxTokens increase (8000 → 10000). Phase 1 uses export narrative budget (separate, generous).

---

### D-15: Split ScoringService.ts Before ISO Work?

**Decision: Deferred to Phase 2 prerequisites**

| Role | Position | Notes |
|------|----------|-------|
| Backend | Defer — Phase 1 doesn't touch ScoringService.ts at all |
| Architect | Defer — but must be done before Phase 2 adds ISO logic to scoring |
| All others | Defer | Consistent: Phase 1 only touches export pipeline |

**Consensus: Unanimous deferral.** ScoringService.ts (535 LOC, over 300 limit) refactoring is Phase 2 prep. Phase 1 has zero interaction with it.

---

### D-16: ISO Messaging Guidelines (NEW — added by Compliance SME)

**Decision: Adopt strict messaging language for all ISO references**

| Role | Position | Notes |
|------|----------|-------|
| Compliance | Proposed — critical for legal/regulatory defensibility | Guardian is not a certification body |
| PM | Strongly supports | "One wrong word in a report and we have a credibility problem" |
| UX | Supports | Report language must be precise |
| All others | Support | No dissent |

**Consensus: Unanimous.**

**Required language:**
- "ISO-traceable" (assessment criteria reference ISO clauses)
- "ISO-informed" (scoring is informed by ISO controls)
- "maps to ISO 42001 A.x.x.x" (specific reference)

**Prohibited language:**
- "ISO-compliant" (implies certification)
- "ISO-certified" (Guardian cannot certify)
- "meets ISO requirements" (implies conformity assessment)
- "ISO score" (no such thing)

**Implementation:** Baked into export narrative prompt instructions and report templates. Human review of all ISO-related report output during Phase 1.

---

## PRD Revisions Required

Based on council consensus, the following PRD sections need major revision:

| Section | Change | Severity |
|---------|--------|----------|
| **Section 7 (Confidence Scoring Model)** | **REWRITE.** Remove 4-signal weighted formula. Replace with qualitative H/M/L + rationale. | Critical |
| Section 4 (User Journeys) | Update Journey 4 — confidence shows as "High/Medium/Low" not "72%" | Moderate |
| Section 8 (Explainability Model) | Update example to show qualitative confidence, not percentage | Moderate |
| Section 5 (Scope Tiers) | Note that 23894 is gap-filler, not standalone framework | Minor |
| Section 9 (Database Schema) | Add `interpretive_criteria` versioning (two-level) and criteria review status | Moderate |
| Section 6 (Technical Constraints) | Add D-16 messaging guidelines, Clinical Risk + Vendor Viability gaps | Moderate |
| Section 12 (Epic Structure) | Update phasing — Phase 1 has zero prerequisites, Phase 2 has 3 prep items | Moderate |
| NEW section | Add ISO messaging guidelines (D-16) as a formal requirement | New |

---

## Two-Level Versioning Model

The Compliance SME and Architect identified that the PRD conflates two different version concepts:

**Level 1: Standard Version** (external, immutable)
- ISO 42001:**2023**
- Changes only when ISO publishes a new edition
- Controls are immutable per version

**Level 2: Criteria Version** (internal, Guardian-controlled)
- `guardian-iso42001-v1.0`, `guardian-iso42001-v1.1`
- Guardian's interpretive criteria for each control
- Can be corrected/improved without requiring a new ISO version
- Version bumps when criteria are materially revised
- Old assessments reference the criteria version they were scored against

**Schema implication:** The `framework_controls` table needs an additional `criteria_version` or a separate `interpretive_criteria` table to support corrections without creating phantom ISO versions.

---

## Phase 2 Prerequisites (Must Be Done Before Phase 2 Starts)

These items were unanimously deferred from Phase 1 but flagged as mandatory before Phase 2:

| # | Item | Decision | Effort | Owner |
|---|------|----------|--------|-------|
| P2-1 | Fix `rawToolPayload` provenance (D-10) | Add true raw column pre-validation | ~1 day | Backend |
| P2-2 | Tighten `findings` JSONB validation (D-12) | Add schema validation to validator | ~1 day | Backend |
| P2-3 | Split ScoringService.ts (D-15) | Extract scoreWithClaude + storeScores | ~1-2 days | Backend |
| P2-4 | Regression test baseline | Golden sample test suite for scoring consistency | ~2-3 days | QA + AI/ML |

**Total Phase 2 prep: ~5-7 days** (can overlap with Phase 1 development)

---

## Timeline

**Phase 1: ISO-Aware Export Narrative**
- Scope: DB tables + seeding + export prompt + templates
- Zero scoring pipeline changes
- **Estimated: 5-7 working days**
- Can start immediately (zero prerequisites)

**Phase 2 Prep: Technical Debt Resolution**
- Items P2-1 through P2-4 above
- **Estimated: 5-7 working days** (can overlap with Phase 1)

**Phase 2: Structured ISO Scoring Data**
- Scope: Scoring pipeline integration, structured compliance data
- Requires Phase 2 prep complete
- **Estimated: TBD (separate planning session)**

**Note:** PM proposed two timeline options: Option X (all prep first, 3 weeks) vs Option Y (Phase 1 immediately, prep in parallel, ~2 weeks to first ISO reports). Council converged toward **Option Y** — start Phase 1 immediately while Phase 2 prep runs in parallel.

---

## Dissent Log

| Decision | Dissenter | Position | Resolution |
|----------|-----------|----------|------------|
| D-5 | Compliance SME | Initially wanted numeric confidence for audit rigor | Accepted qualitative after AI/ML demonstrated numeric infeasibility. Condition: rationale string must cite specific evidence and ISO references. Accepted by all. |
| D-2 | Compliance SME | Initially wanted all 38 in prompts | Accepted compromise (38 in DB, ~30 in prompts) after AI/ML showed organizational controls add noise without improving scoring quality. |

No other formal dissents were recorded. All 16 decisions reached consensus.

---

## Report Design (UX Designer's Recommendations)

### Phase 1 Report Structure (Export Narrative)

**Current structure:** Header → Score Banner → Executive Summary → Key Findings → Dimension Scores Table → Detailed Analysis → Footer

**Phase 1 additions to Detailed Analysis section (per dimension):**

```
## Data Governance: 3/5

Assessment Confidence: Medium
"Score reflects partial alignment with ISO 42001 A.6.2.6 (data quality
management for AI systems). Vendor demonstrates systematic encryption
protocols but lacks independent audit verification."

ISO Standards Alignment:
- ISO 42001 A.6.2.6 — Data quality management: Partial
- ISO 42001 A.6.2.7 — Data provenance: Not evidenced
- ISO 23894 6.3 — Risk treatment: Addressed

Evidence: Q12 (encryption protocols), Q15 (data handling), Q23 (audit processes)
```

**For Guardian-native dimensions (Clinical Risk, Vendor Viability):**
```
## Clinical Risk: 4/5

Assessment Confidence: High
"Assessed using Guardian healthcare-specific criteria (no ISO mapping
available for clinical risk in current framework scope)."

Evidence: Q8 (clinical validation), Q14 (safety protocols), Q31 (incident response)
```

### Key UX Principles
- Confidence level displayed as badge/tag, NOT percentage
- ISO references as supporting detail, NOT headline
- Guardian-native dimensions clearly labeled (not hidden)
- "ISO-traceable" language per D-16
- Executive Summary gets ONE sentence about ISO alignment, not a data dump

---

## Test Strategy (QA Lead's Requirements)

### Phase 1 Tests
1. **Unit tests:** ISO control retrieval, prompt injection logic, template rendering
2. **Integration tests:** Export pipeline end-to-end with ISO context
3. **Snapshot tests:** Report output format stability
4. **Manual review:** Generated ISO narrative accuracy (human spot-check)

### Phase 2 Prerequisites (Before Phase 2 Starts)
1. **Golden sample regression baseline:** 5 sample assessments scored and stored as expected output
2. **A/B testing framework:** Compare pre-ISO and post-ISO scoring on same inputs
3. **Confidence consistency tests:** Same input scored 5x, verify H/M/L stability

### Scope Fence
- Phase 1 tests: export pipeline ONLY
- Phase 2 prep tests: regression baseline + scoring consistency
- Phase 2 tests: full scoring pipeline with ISO + confidence

---

## Open Questions Resolved by Council

| # | Question | Resolution |
|---|----------|------------|
| 1 | Should Guardian map ALL 38 controls? | Yes in DB, ~30 in prompts (D-2) |
| 2 | How does 23894 relate to 42001? | Gap-filler, not standalone (D-8) |
| 5 | How does ISO 13485 HLS affect healthcare? | Deferred to Tier 3 |
| 6 | Where does ISO framework selection live? | Assessment entity — deferred to Phase 2 |
| 10 | Should question gen become ISO-aware? | No (D-7) |
| 14 | Per-dimension confidence: stored or computed? | Stored in `findings` JSONB (D-6) |
| 15 | Backward compatibility for old assessments? | Graceful degradation — no ISO section if no ISO data exists |

## Open Questions Remaining (For Leadership)

| # | Question | Blocking? |
|---|----------|-----------|
| 19 | Report format mockup — has leadership provided guidance? | Phase 1 (using UX designer's proposed format until feedback) |
| 16 | Does ISO work need Excel report export? | Phase 2 |
| CSA | CSA Group licensing timeline? | Non-blocking (interpretive approach works without license) |

---

*Generated from iso-design-council team debate (7 experts, 128 messages) on 2026-02-10.*
*Prerequisite documents: prd-iso-compliance.md, iso-discovery-findings.md*
