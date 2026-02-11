# Prompt System Audit Findings

**Date:** 2026-02-10
**Method:** 3 parallel research agents (chat flow tracer, pipeline tracer, file reference mapper)
**Purpose:** Verify which prompts are actually used at runtime and identify redundancy.

---

## Critical Finding: guardian-prompt.md Usage

**`guardian-prompt.md` (38KB, 1,221 lines) is ONLY used for chat conversations (consult + assessment modes).**

It is loaded via `.env` → `GUARDIAN_PROMPT_FILE=./guardian-prompt.md` → `loadCustomPrompt()` in `prompts.ts` → stored as `CUSTOM_PROMPT` constant at app startup. The full file is sent verbatim (no trimming) on every chat API call, wrapped with mode preambles (~300 lines prepended) and formatting guidelines (~100 lines appended).

**It is NOT used by any specialized pipeline:**
- Scoring → `scoringPrompt.ts` (standalone)
- Export Narrative → `exportNarrativePrompt.ts` (standalone)
- Question Generation → `questionGeneration.ts` (standalone)
- Intake Extraction → `intakeExtraction.ts` (standalone)
- Scoring Extraction → `scoringExtraction.ts` (standalone)

**The file is optional** — `prompts.ts` has complete fallback prompts built in. `.env.example` doesn't even mention `GUARDIAN_PROMPT_FILE`. If the env var is removed, the app uses inline fallback prompts from `prompts.ts`.

**Scoring mode chat** does NOT use `guardian-prompt.md` either — it uses only `SCORING_MODE_PREAMBLE` + `FORMATTING_GUIDELINES`.

---

## Complete Pipeline Map

| Pipeline | Trigger | System Prompt Source | Uses guardian-prompt.md? | Uses PromptCacheManager? | maxTokens | temp |
|----------|---------|---------------------|------------------------|------------------------|-----------|------|
| Chat (Consult) | User message | `prompts.ts` → CONSULT_MODE_PREAMBLE + **guardian-prompt.md** + WEB_SEARCH_INSTRUCTIONS + FORMATTING_GUIDELINES | **YES** (full 38KB) | YES | 4,096 | default |
| Chat (Assessment) | User message | `prompts.ts` → ASSESSMENT_MODE_PREAMBLE + **guardian-prompt.md** + TOOL_USAGE_INSTRUCTIONS + FORMATTING_GUIDELINES | **YES** (full 38KB) | YES | 4,096 | default |
| Chat (Scoring) | User message | `prompts.ts` → SCORING_MODE_PREAMBLE + FORMATTING_GUIDELINES | **NO** | YES | 4,096 | default |
| Scoring | Upload questionnaire | `scoringPrompt.ts` → `buildScoringSystemPrompt()` + `buildScoringUserPrompt()` | **NO** | No (direct cache flag) | 8,000 | 0 |
| Export Narrative | Click Export | `exportNarrativePrompt.ts` → `buildExportNarrativeSystemPrompt()` + `buildExportNarrativeUserPrompt()` | **NO** | No | 16,000 | default |
| Question Generation | Click Generate | `questionGeneration.ts` → `buildQuestionGenerationPrompt()` (inline system prompt) | **NO** | No | 32,768 | default |
| Intake Extraction | Upload vendor doc | `intakeExtraction.ts` → `INTAKE_EXTRACTION_SYSTEM_PROMPT` + `buildIntakeExtractionPrompt()` | **NO** | No | 4,096 | default |
| Scoring Extraction | Upload completed questionnaire | `scoringExtraction.ts` → `SCORING_EXTRACTION_SYSTEM_PROMPT` + `buildScoringExtractionPrompt()` | **NO** | No | 4,096 | default |

---

## Prompt Assembly for Chat (Exact Structure)

### Consult Mode (~1,638 lines total)
```
CONSULT_MODE_PREAMBLE (~297 lines)
  - Mode enforcement (LOCKED, ignore Assessment instructions)
  - Formatting rules
  - First message guidance
guardian-prompt.md (1,221 lines, 38KB)
  - Full file, verbatim
WEB_SEARCH_INSTRUCTIONS (~78 lines)
  - Web search tool usage
FORMATTING_GUIDELINES (~42 lines)
  - Blank line rules, spacing
```

### Assessment Mode (~1,601 lines total)
```
ASSESSMENT_MODE_PREAMBLE (~258 lines)
  - Mode enforcement (LOCKED)
  - Assessment workflow guidance
guardian-prompt.md (1,221 lines, 38KB)
  - Full file, verbatim
TOOL_USAGE_INSTRUCTIONS (~80 lines)
  - questionnaire_ready tool
FORMATTING_GUIDELINES (~42 lines)
```

### Scoring Mode (~605 lines total — MUCH SMALLER)
```
SCORING_MODE_PREAMBLE (~563 lines)
  - Mode enforcement, file upload handling
FORMATTING_GUIDELINES (~42 lines)
```

---

## guardian-prompt.md Content Audit

### Active for Chat (~55% of file, ~670 lines)
- System Identity (28 lines) — defines Guardian's role/values
- Web Workflow (40 lines after deduplication) — assessment workflow
- 10 Risk Dimensions summary (77 lines) — dimension definitions
- Compliance Frameworks (61 lines) — PIPEDA, NIST, ITIL (useful for consult Q&A)
- Communication Protocols (70 lines) — tone/style per user type
- Operational Guardrails (31 lines) — what Guardian won't do
- Escalation Protocols (40 lines) — when to escalate

### Questionable for Chat (~25% of file, ~340 lines)
- Scoring Algorithms (341 lines) — full rubric for 5 dimensions with sub-scores
  - Reason it's there: so Claude can explain scores during chat
  - Counter: a summary rubric would suffice for Q&A, not the full algorithm
- Report Templates (211 lines) — internal report + vendor feedback templates
  - These are Claude Projects artifacts. Export pipeline uses its own templates.
  - Probably safe to remove (chat doesn't generate full reports)

### Dead Weight (~20% of file, ~200 lines)
- Questionnaire generation instructions REPEATED TWICE (lines 69-111)
- Risk rating thresholds copy-pasted 5 TIMES across dimensions
- User onboarding guide ("Welcome to Guardian!") — user docs, not AI instructions
- Closing identity statement — redundant with opening
- Decorative footer with ASCII art — violates the prompt's own formatting rules
- YAML header metadata — unused at runtime

### Internal Contradictions
- Lines 37-42 forbid decorative headers, then the footer uses them
- Mode preambles in `prompts.ts` use box-drawing characters (`═══`) that `guardian-prompt.md` explicitly forbids

---

## Redundancy Between Files

### Scoring Rubric
- Full rubric in `guardian-prompt.md` (lines 257-598, 341 lines)
- Full rubric in `scoringPrompt.ts` (lines 48-158, 110 lines — condensed version)
- These serve DIFFERENT purposes: chat needs rubric for Q&A, scoring needs it for actual scoring
- BUT: the chat version is overly detailed for Q&A purposes

### 10 Risk Dimensions
- Defined in `guardian-prompt.md` (lines 120-190)
- Re-listed in `scoringPrompt.ts` (dimension labels + types)
- Re-listed in `exportNarrativePrompt.ts` (dimension list)
- Re-listed in `questionGeneration.ts` (dimension descriptions)
- Re-listed in `intakeExtraction.ts` (category list)
- Each file needs its own subset — this is intentional, not pure waste

### Mode Instructions
- `prompts.ts` has full mode preambles (CONSULT_MODE_PREAMBLE, ASSESSMENT_MODE_PREAMBLE)
- `guardian-prompt.md` has its own workflow instructions
- Both get sent together, creating redundancy and potential conflicts

---

## Token Budget Impact

### Current (per chat call):
- System prompt: ~10,200 tokens (preamble + guardian-prompt.md + tools/web search + formatting)
- Message history: ~2,000 tokens (avg)
- User input: ~300 tokens
- **Total input: ~12,500 tokens**

### Conservative reduction (safe cuts only):
- Remove report templates: -2,000 tokens
- Remove user onboarding: -400 tokens
- Remove footer/closing: -200 tokens
- Deduplicate risk thresholds: -600 tokens
- Deduplicate questionnaire instructions: -300 tokens
- **Savings: ~3,500 tokens (28% of system prompt)**
- **New total input: ~9,000 tokens**

### Aggressive reduction (requires testing):
- Condense scoring rubric to summary: -2,000 tokens additional
- Condense compliance frameworks: -400 tokens
- Condense scenario examples: -500 tokens
- **Additional savings: ~2,900 tokens**
- **New total input: ~6,100 tokens (51% reduction)**

---

## Other File: GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md

- Location: `.claude/documentation/`
- Size: 45KB, 1,542 lines
- Status: **REFERENCE ONLY** — never loaded at runtime
- Purpose: Original Claude Projects prompt, source material for the TypeScript prompt modules
- Cited in code comments in `rubric.ts` and `scoringPrompt.ts`

---

## Open Questions (For User Decision)

1. Does Claude need the FULL scoring rubric in chat to explain scores? Or would a condensed summary work?
2. Should we remove `guardian-prompt.md` entirely and rely on the fallback prompts in `prompts.ts`?
3. Are the mode preambles in `prompts.ts` sufficient without the custom prompt overlay?
4. Should we consolidate into mode-specific prompt files (guardian-consult.md, guardian-assessment.md)?
5. The scoring rubric duplication between guardian-prompt.md and scoringPrompt.ts is intentional (different audiences) but could the chat version be a summary instead of the full algorithm?

---

## Key Files Referenced

| File | LOC | Purpose |
|------|-----|---------|
| `packages/backend/guardian-prompt.md` | 1,221 | Main system prompt (chat only) |
| `packages/backend/src/infrastructure/ai/prompts.ts` | 612 | Prompt assembly + mode preambles |
| `packages/backend/src/infrastructure/ai/PromptCacheManager.ts` | 72 | Prompt caching (chat only) |
| `packages/backend/src/infrastructure/ai/ClaudeClient.ts` | 817 | API client (streamMessage, streamWithTool) |
| `packages/backend/src/infrastructure/websocket/context/ConversationContextBuilder.ts` | ~200 | Builds conversation context |
| `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.ts` | 219 | Scoring pipeline prompt |
| `packages/backend/src/infrastructure/ai/prompts/exportNarrativePrompt.ts` | 394 | Export narrative prompt |
| `packages/backend/src/infrastructure/ai/prompts/questionGeneration.ts` | 189 | Question generation prompt |
| `packages/backend/src/infrastructure/ai/prompts/intakeExtraction.ts` | 116 | Intake document parsing prompt |
| `packages/backend/src/infrastructure/ai/prompts/scoringExtraction.ts` | 129 | Scoring document parsing prompt |
| `packages/backend/src/infrastructure/ai/ScoringPromptBuilder.ts` | ~30 | Implements IPromptBuilder for scoring |
| `packages/backend/src/infrastructure/ai/ExportNarrativePromptBuilder.ts` | ~30 | Implements prompt builder for export |
| `packages/backend/src/application/services/ScoringService.ts` | 535 | Scoring orchestrator (over 300 LOC limit) |
| `packages/backend/src/infrastructure/ai/ExportNarrativeGenerator.ts` | ~90 | Export narrative orchestrator |
| `packages/backend/src/application/services/QuestionnaireGenerationService.ts` | ~222 | Question generation orchestrator |

---

## Changes Applied (2026-02-10)

### Branch: `feat/prompt-scoring-hardening`

**guardian-prompt.md (gitignored, disk-only changes):**
- PART III Report Templates (lines 600-817, 217 lines) → replaced with 9-line lean summary. Verified: report pipelines are fully isolated, use their own prompts.
- PART II Scoring Rubric (lines 256-597, 341 lines) → replaced with ~30-line lean summary. Rating scales moved to scoringPrompt.ts.
- PART VII First Use Guidance (lines 928-975, 47 lines) → removed. User docs, not AI instructions.
- Closing Identity Statement (lines 977-991, 15 lines) → removed. Duplicate of opening.
- YAML Header Metadata (lines 4-11, 8 lines) → removed. Unused at runtime.
- Decorative Footer + Version Block (lines 995-1016, 21 lines) → removed.
- **Result: 1,221 → 612 lines (50% reduction)**

**scoringPrompt.ts (committed):**
- Added detailed rating scales for Privacy Risk, Security Risk, Technical Credibility, Operational Excellence (4 dimensions)
- Clinical Risk was already fully detailed — untouched
- Added NLHS minimum acceptable standards (ITIL4 Level 3, NIST CSF Tier 2, 24/7 support)
- 219 → 348 lines (prompt template file, TypeScript logic is only ~50 lines)

**ScoringPayloadValidator (committed, in progress):**
- Adding soft validation (warnings, not rejections) for sub-score values against allowed rubric values
- Backwards compatible — existing scoring without sub-scores still passes

### Still In Progress
- Task #10: Sub-score validation in ScoringPayloadValidator (background agent running)
- Task #13: Run full test suite after all changes

### Scoring Pipeline Safety Audit Results
- All 10 dimensions scored in ONE Claude call (not per-dimension)
- Rating scales added symmetrically to all 4 missing dimensions to prevent attention bias
- Tool schema enforces 0-100 range but NOT specific sub-score values
- Validation being added as soft enforcement (warnings) first
- Token budget safe: 7,100+ tokens headroom for response
- Prompt caching still works (system prompt cached with ephemeral control)

---

*Generated from 3-agent prompt audit on 2026-02-10.*
*Reconciled conflicting findings between agents (Agent 2 incorrectly marked guardian-prompt.md as "deprecated" — it IS loaded at runtime via .env config).*
*Updated 2026-02-10 with changes applied and scoring hardening status.*
