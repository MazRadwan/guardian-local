# Sprint 5: Hybrid Questionnaire Generation Architecture

**Status:** pending
**Supersedes:** Previous 5.1-5.2 (feature flag removal) - now obsolete

---

## Context for Agent

This sprint implements a **fundamental architectural refactor** to fix critical issues discovered after Epic 12.4.3:

### Problem Statement

The current questionnaire generation has **two separate paths** that produce different content:

1. **Chat path** (`ChatServer.ts` lines 904-919): Hardcoded inline prompt tells Claude to output markdown with markers → streams to chat → `performExtractionWithFallback()` parses markers
2. **Export path** (`questionGeneration.ts`): Separate prompt generates JSON for exports

**Result:** Chat content ≠ Download content (different prompts = different questions)

### Additional Issues

- `questionGeneration.ts` uses `renewal` type but UI uses `category_focused`
- `prompts.ts` says "11 risk dimensions" but original GUARDIAN doc has 10
- Marker extraction is brittle and adds latency
- Prompt logic embedded in WebSocket handler (untestable, unreusable)

---

## Solution: Hybrid JSON → Render → Stream

```
User clicks Generate
    ↓
ChatServer.generate_questionnaire()
    ↓
QuestionnaireGenerationService.generate(context)   ← NEW SERVICE
    ↓
Claude returns structured JSON (single call)
    ↓
questionnaireToMarkdown(schema)                    ← NEW RENDERER
    ↓
Stream markdown to chat + create exports from JSON
    ↓
emit('export_ready')
```

**Key Principles:**
1. **Single Claude call** - One prompt, one response, one source of truth
2. **JSON is canonical** - All downstream artifacts derive from typed schema
3. **Deterministic rendering** - Same JSON always produces same markdown
4. **Clean architecture** - Service generates, renderer formats, handler orchestrates

---

## Clean Architecture Compliance

```
┌─────────────────────────────────────────────────────────────────┐
│                        DOMAIN LAYER                              │
│  src/domain/types/QuestionnaireSchema.ts                        │
│  - QuestionnaireSchema, QuestionnaireSection, QuestionnaireQuestion │
│  - RiskDimension type (10 dimensions)                           │
│  - NO DEPENDENCIES (pure types)                                  │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ imports types
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                           │
│  src/application/services/QuestionnaireGenerationService.ts     │
│  - Orchestrates Claude call via IClaudeClient interface         │
│  - Returns { schema, assessmentId, markdown }                   │
│  - Depends on interfaces, not implementations                    │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ implements/uses
┌─────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE LAYER                          │
│  src/infrastructure/rendering/questionnaireToMarkdown.ts        │
│  - Pure function: QuestionnaireSchema → string                  │
│  - No external dependencies, easily testable                     │
│                                                                  │
│  src/infrastructure/websocket/ChatServer.ts                     │
│  - Delegates to QuestionnaireGenerationService                  │
│  - Handles WebSocket transport only                              │
│                                                                  │
│  src/infrastructure/ai/prompts/questionGeneration.ts            │
│  - Fix types, align to 10 dimensions                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Stories

| Story | Name | Scope | Est. |
|-------|------|-------|------|
| **5.1** | QuestionnaireSchema Types | Domain types + adapter + questionGeneration.ts fixes | 2h |
| **5.2** | Markdown Renderer | `questionnaireToMarkdown()` + unit tests | 1.5h |
| **5.3** | Generation Service | `QuestionnaireGenerationService` orchestration | 2h |
| **5.3.1** | Tool_use Refinement | Replace raw JSON with tool_use for reliable output | 1h |
| **5.4** | ChatServer Refactor | Delegate handler, remove inline prompt | 1.5h |
| **5.5** | Prompt Cleanup | Remove markers, fix 11→10 dimensions | 1h |
| **5.6** | Integration + Cleanup | Tests, delete deprecated code | 2h |

**Total:** ~11 hours

---

## 10 Risk Dimensions (Canonical)

Per `GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md`:

1. `clinical_risk` - Patient safety, clinical workflow integration
2. `privacy_risk` - Data protection, consent, PHI handling
3. `security_risk` - Infrastructure, access control, encryption
4. `technical_credibility` - Architecture, scalability, reliability
5. `vendor_capability` - Company stability, support, roadmap
6. `ai_transparency` - Model explainability, bias, validation
7. `ethical_considerations` - Fairness, autonomy, accountability
8. `regulatory_compliance` - HIPAA, FDA, state laws
9. `operational_excellence` - Implementation, training, maintenance
10. `sustainability` - Long-term viability, environmental impact

---

## Files Overview

### New Files
- `src/domain/types/QuestionnaireSchema.ts`
- `src/application/adapters/QuestionnaireSchemaAdapter.ts`
- `src/application/services/QuestionnaireGenerationService.ts`
- `src/infrastructure/rendering/questionnaireToMarkdown.ts`
- `src/infrastructure/ai/tools/questionnaireOutputTool.ts`
- `__tests__/unit/questionnaireToMarkdown.test.ts`
- `__tests__/unit/QuestionnaireGenerationService.test.ts`
- `__tests__/integration/QuestionnaireGenerationService.integration.test.ts`

### Modified Files
- `src/infrastructure/websocket/ChatServer.ts` - Delegate to service
- `src/infrastructure/ai/prompts/questionGeneration.ts` - Fix types, 10 dimensions
- `packages/backend/guardian-prompt.md` - Remove marker instructions
- `src/infrastructure/ai/prompts.ts` - Remove markers, fix 11→10

### Deprecated/Deleted
- `performExtractionWithFallback()` method - Replaced by direct JSON usage
- `TriggerDetection.ts` - Already deprecated, can be deleted
- Inline prompt in ChatServer (lines 904-919) - Moved to service

---

## Success Criteria

- [ ] Single Claude call produces both chat display and export artifacts
- [ ] Chat content is deterministically derived from JSON schema
- [ ] No marker syntax in any prompt files
- [ ] All prompts reference "10 risk dimensions"
- [ ] `category_focused` assessment type works end-to-end
- [ ] Unit test coverage for renderer ≥ 90%
- [ ] Integration test validates schema/markdown/export alignment

---

## Agent Instructions

1. Read this overview first
2. Execute stories 5.1 → 5.6 in order
3. Each story is self-contained with full implementation details
4. Run tests after each story: `cd packages/backend && pnpm test`
5. Mark story `status: complete` when done
6. **Skip Opus code review** - main agent is Opus
