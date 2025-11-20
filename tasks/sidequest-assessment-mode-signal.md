# Sidequest: Assessment Mode Signal & Questionnaire Type Alignment

**Version:** 0.1  
**Created:** 2025-11-20
**Status:** Planning  
**Priority:** High (unblocks Story 8.1 end-to-end workflow)  
**Scope:** Implement three assessment selections (Quick, Custom, Category Sets), ensure the AI sees the mode switch, and make questionnaire generation honor the chosen assessment type.

---

## Goals
- Make assessment toggle actually signal the backend/model (not just local state).
- Present three clear assessment entry paths (Quick, Custom, Category-based sets).
- Align question generation with the selected assessment type (different counts/focus).
- Preserve existing chat behaviors and tests; no regressions to consult mode.

## Constraints / Non-Goals
- No new UX beyond the three assessment choices and initial guidance message.
- No changes to scoring/analysis workflows (Phase 2).
- Maintain current WebSocket contracts; extend them if needed, do not break.
- Keep ASCII output and existing test coverage philosophy (per CLAUDE.md).

## Epics & Stories

### Epic A — Prompt Alignment (Model Guidance)
- **A1: Baseline & Target Copy**
  - Read current `prompts.ts` assessment prompt and the Claude system prompt to extract must-have guardrails.
  - Draft updated assessment system prompt that explicitly lists the three entry paths and keeps safety/guardrails intact.
- **A2: Implement Prompt Update**
  - Update `ASSESSMENT_MODE_PROMPT` (and any cacheable prompt) to include Quick / Custom / Category-set options and expected intake behavior.
  - Ensure PRODUCT_CONTEXT still prepends correctly.
- **A3: Tests & QA**
  - Add/adjust unit tests around `getSystemPrompt` selection.
  - Manual sanity: switch to assessment mode → first assistant guidance aligns with new copy.

### Epic B — Assessment Mode Signaling (Backend + Frontend)
- **B1: Signaling Design**
  - Decide on the event/route for mode changes (e.g., new socket event `switch_mode` or reuse existing conversation update).
  - Define payload shape and idempotency expectations.
- **B2: Backend Mode Update**
  - Implement conversation mode update in ChatServer → ConversationService → ConversationRepo.
  - Guardrails: validate ownership, active conversation only, emit confirmation event.
- **B3: Frontend Toggle Wiring**
  - Wire ModeSelector/Composer toggle to call the backend mode update.
  - Handle optimistic UI + rollback on failure; keep local system message for UX.
- **B4: Initial Assistant Message**
  - On successful switch to assessment, inject a single assistant message offering the three assessment paths (reuse Epic A copy).
  - Ensure dedupe (no duplicates on rapid toggles) and no effect in consult mode.
- **B5: Tests**
  - Unit: adapter emits mode switch; controller handles success/error.
  - E2E: switch to assessment → conversation mode persisted → initial guidance message received.

### Epic C — Questionnaire Type Branching (Quick / Comprehensive / Category/Renewal)
- **C1: Type Definitions**
  - Define per-type targets (e.g., Quick 30–40 questions, Comprehensive 85–95, Renewal/Category 60–70 with focused sections).
  - Map category-set selection to an internal `assessmentType` + category metadata.
- **C2: Plumb Type to Generation**
  - Pass the chosen `assessmentType` + category context into question generation (DTO → service → prompt builder).
  - Ensure assessment creation stores the selected type.
- **C3: Prompt Branching**
  - Update `buildQuestionGenerationPrompt` (or variant) to branch wording, counts, and section emphasis by type and category.
- **C4: Tests & QA**
  - Unit: prompt builder outputs different counts/sections per type.
  - Integration: generate questions for quick vs comprehensive → observed question count/sections differ as defined.

---

## Dependencies
- Existing conversation mode field in DB and WebSocket flow (reuse, do not break).
- Assessment types already modeled (`quick | comprehensive | renewal`); category-set mapping to be defined in C1.

## Risks / Mitigations
- **Risk:** Duplicate mode-change events → Use idempotent backend handler and short debounce on frontend.
- **Risk:** Breaking current chat tests → Add/adjust tests before refactors; keep contracts stable.
- **Risk:** Prompt bloat/token cost → Keep updated assessment prompt concise, rely on PRODUCT_CONTEXT; consider cache flags later.

## Definition of Done
- Switching to assessment updates conversation mode in the backend and emits confirmation.
- First assistant response in assessment mode offers Quick / Custom / Category-set choices.
- Question generation varies by selected assessment type (counts/sections) and passes type through the stack.
- All related unit/integration tests updated and passing; no regressions in consult mode.

## QA Checklist (per Epic)
- **Epic A:** New assessment prompt visible in code; `getSystemPrompt('assessment')` returns updated copy; manual toggle shows guidance language.
- **Epic B:** Toggle emits backend mode change; conversation record shows `mode=assessment`; initial assistant guidance appears once; reconnect resumes correct mode.
- **Epic C:** Quick vs Comprehensive vs Renewal/Category runs produce different question totals/section emphasis as defined; exports still succeed for generated sets.
