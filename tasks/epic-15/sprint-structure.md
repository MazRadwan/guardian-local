# Epic 15: Sprint Structure & Execution Plan

## Status: Ready for Story Creation

**Created:** 2025-12-22
**Last Updated:** 2025-12-22
**Depends On:** Epic 16/17 (Document Parser Infrastructure) - COMPLETE

---

## Context Summary

Epic 15 implements **Questionnaire Scoring & Analysis** - the phase where completed questionnaires are uploaded, parsed, scored against the Guardian rubric, and a risk assessment report is generated.

### Key Decisions (from planning + code review)

| Decision | Resolution |
|----------|------------|
| Token strategy | Single API call + cached rubric via `PromptCacheManager` |
| Scoring authority | Claude applies rubric, outputs scores. TypeScript validates + stores. |
| Output format | Narrative streaming + `scoring_complete` tool for structured extraction |
| Export architecture | Parallel interfaces (`IScoringPDFExporter`, `IScoringWordExporter`) |
| Mode UX | New `'scoring'` mode in ModeSelector dropdown |
| Database | 3 new tables with provenance + idempotency constraints |
| Parsing | Text-only (pdf-parse, mammoth) - NOT Vision for PDF/DOCX |
| Payload validation | Strict schema validation before persistence |

### Reference Files

| File | Purpose |
|------|---------|
| `tasks/epic-15/scoring-analysis-plan.md` | Full planning document with all decisions |
| `tasks/epic-16/overview.md` | Sprint structure template |
| `tasks/epic-16/6.9-attachment-security-tests/` | Parallel agent execution pattern |
| `.claude/documentation/GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md` | Rubric (Part IV) + output template (Part V) |

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 0: PREREQUISITE (Sequential)                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Story 0.1: AssessmentId in Questionnaire Exports                    │   │
│  │  - Update QuestionnaireMetadata type                                 │   │
│  │  - Modify PDFExporter, WordExporter, ExcelExporter                   │   │
│  │  - Add tests (prerequisite for scoring flow)                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: FOUNDATION (Sequential)                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Story 1.1: Database Schema + Repositories                          │   │
│  │  - 3 tables: responses, dimension_scores, assessment_results        │   │
│  │  - Provenance fields: rubric_version, model_id, raw_tool_payload    │   │
│  │  - Idempotency: unique constraints on (assessment_id, batch_id, *)  │   │
│  │  - 3 repository interfaces + implementations                        │   │
│  │  - Integration tests for repositories                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌───────────────────────────────────┐ ┌───────────────────────────────────┐
│  PHASE 2A (Parallel)              │ │  PHASE 2B (Parallel)              │
│  ┌─────────────────────────────┐  │ │  ┌─────────────────────────────┐  │
│  │  Story 2.1: Types + Prompt  │  │ │  │  Story 2.2: Validator       │  │
│  │  - ScoringReportData type   │  │ │  │  - ScoringPayloadValidator  │  │
│  │  - scoring_complete tool    │  │ │  │  - Validation rules         │  │
│  │  - Scoring system prompt    │  │ │  │  - Error handling           │  │
│  │  - Rubric constants         │  │ │  │  - Unit tests (domain)      │  │
│  └─────────────────────────────┘  │ │  └─────────────────────────────┘  │
└───────────────────────────────────┘ └───────────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: SCORING SERVICE (Sequential - depends on Phase 2)                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Story 3.1: ScoringService Implementation                           │   │
│  │  - Orchestrate: parse → validate → score → store → emit             │   │
│  │  - Integration with ClaudeClient + PromptCacheManager               │   │
│  │  - WebSocket event emission (scoring_started, scoring_complete)     │   │
│  │  - Unit tests for service                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│  PHASE 4A (Parallel)│ │  PHASE 4B (Parallel)│ │  PHASE 4C (Parallel)│
│  ┌───────────────┐  │ │  ┌───────────────┐  │ │  ┌───────────────┐  │
│  │  Story 4.1    │  │ │  │  Story 4.2    │  │ │  │  Story 4.3    │  │
│  │  Mode + UX    │  │ │  │  ResultCard   │  │ │  │  Exporters    │  │
│  │  - ModeSelector│  │ │  │  - Component  │  │ │  │  - Interfaces │  │
│  │  - Welcome msg│  │ │  │  - Score viz  │  │ │  │  - PDF impl   │  │
│  │  - Rotating   │  │ │  │  - Risk dash  │  │ │  │  - Word impl  │  │
│  │    status     │  │ │  │  - Actions    │  │ │  │  - Templates  │  │
│  │  - Warnings   │  │ │  │               │  │ │  │               │  │
│  └───────────────┘  │ │  └───────────────┘  │ │  └───────────────┘  │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
            │                       │                       │
            └───────────────────────┼───────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: INTEGRATION (Sequential)                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Story 5.1: ChatServer Integration                                   │   │
│  │  - Wire ScoringService to ChatServer                                 │   │
│  │  - Handle scoring mode document uploads                              │   │
│  │  - Emit WebSocket events to frontend                                 │   │
│  │  - Integration tests for wiring                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 6: E2E + REMAINING TESTS (Sequential)                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Story 6.1: E2E Scoring Flow + Component Tests                       │   │
│  │  - Full flow: upload → parse → score → display → export             │   │
│  │  - Component tests for UI (4.1, 4.2)                                 │   │
│  │  - Export tests (4.3)                                                │   │
│  │  - Error scenario coverage                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Story Summary Table

| Story | Name | Phase | Parallel? | ~Lines | Tests? | Agent Type |
|-------|------|-------|-----------|--------|--------|------------|
| **0.1** | AssessmentId in Exports | 0 | No | 700 | Yes | `chat-backend-agent` |
| **1.1** | Schema + Repositories | 1 | No | 700 | Yes | `chat-backend-agent` |
| **2.1** | Types + Prompt + Tool | 2 | **Yes** | 600 | No | `chat-backend-agent` |
| **2.2** | ScoringPayloadValidator | 2 | **Yes** | 500 | Yes | `chat-backend-agent` |
| **3.1** | ScoringService | 3 | No | 700 | Yes | `chat-backend-agent` |
| **4.1** | Mode + Status + Warnings | 4 | **Yes** | 700 | No | `frontend-agent` |
| **4.2** | ScoringResultCard | 4 | **Yes** | 600 | No | `frontend-agent` |
| **4.3** | Scoring Exporters | 4 | **Yes** | 700 | No | `chat-backend-agent` |
| **5.1** | ChatServer Integration | 5 | No | 700 | Yes | `chat-backend-agent` |
| **6.1** | E2E + Remaining Tests | 6 | No | 600 | Yes | `chat-backend-agent` |

**Total:** 10 stories, ~6,500 lines across all story files

---

## Execution Phases

### Phase 0: Prerequisite (Sequential)
```
Agent: chat-backend-agent
Stories: 0.1
Duration: 1 agent session
```

### Phase 1: Foundation (Sequential)
```
Agent: chat-backend-agent
Stories: 1.1
Duration: 1 agent session
```

### Phase 2: Core Backend (2 Parallel Agents)
```
┌─────────────────────────────────────────────────────────────────┐
│  Launch: 2 Task tool calls in ONE message                       │
│                                                                 │
│  Agent A: chat-backend-agent                                    │
│  Prompt: "Execute Story 2.1 - Types + Prompt + Tool..."        │
│                                                                 │
│  Agent B: chat-backend-agent                                    │
│  Prompt: "Execute Story 2.2 - ScoringPayloadValidator..."      │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 3: Scoring Service (Sequential)
```
Agent: chat-backend-agent
Stories: 3.1
Duration: 1 agent session
Depends on: Phase 2 complete
```

### Phase 4: Frontend + Export (3 Parallel Agents)
```
┌─────────────────────────────────────────────────────────────────┐
│  Launch: 3 Task tool calls in ONE message                       │
│                                                                 │
│  Agent A: frontend-agent                                        │
│  Prompt: "Execute Story 4.1 - Mode + Status + Warnings..."     │
│                                                                 │
│  Agent B: frontend-agent                                        │
│  Prompt: "Execute Story 4.2 - ScoringResultCard..."            │
│                                                                 │
│  Agent C: chat-backend-agent                                    │
│  Prompt: "Execute Story 4.3 - Scoring Exporters..."            │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 5: Integration (Sequential)
```
Agent: chat-backend-agent
Stories: 5.1
Duration: 1 agent session
Depends on: Phases 3 + 4 complete
```

### Phase 6: E2E + Tests (Sequential)
```
Agent: chat-backend-agent
Stories: 6.1
Duration: 1 agent session
Depends on: Phase 5 complete
```

---

## File Conflict Analysis

| Story | Files Created/Modified | Conflicts With |
|-------|------------------------|----------------|
| 0.1 | PDFExporter.ts, WordExporter.ts, ExcelExporter.ts, QuestionnaireSchema.ts | None (existing files) |
| 1.1 | schema/responses.ts, schema/dimensionScores.ts, schema/assessmentResults.ts, repos/* | None (new files) |
| 2.1 | types/ScoringTypes.ts, prompts/scoringPrompt.ts, tools/scoringComplete.ts | None (new files) |
| 2.2 | domain/ScoringPayloadValidator.ts | None (new file) |
| 3.1 | services/ScoringService.ts | None (new file) |
| 4.1 | ModeSelector.tsx, RotatingStatus.tsx, ScoringWarnings.tsx | None |
| 4.2 | ScoringResultCard.tsx | None |
| 4.3 | IScoringPDFExporter.ts, ScoringPDFExporter.ts, IScoringWordExporter.ts, ScoringWordExporter.ts | None (new files) |
| 5.1 | ChatServer.ts | Potential conflict if 4.1 touches ChatServer |

**Note:** Phase 4 agents work on completely separate files - safe for parallel execution.

---

## Test Placement Rationale

| Story | Tests Included | Rationale |
|-------|----------------|-----------|
| 0.1 | ✅ Yes | Prerequisite - all later phases depend on ID in exports |
| 1.1 | ✅ Yes | Foundation - repos must work before service can store |
| 2.1 | ❌ No | Configuration/types - tested via service integration |
| 2.2 | ✅ Yes | Domain logic - critical validation, could regress |
| 3.1 | ✅ Yes | Core orchestration - Phase 5 depends on it working |
| 4.1 | ❌ No | UI - no downstream dependencies, test in Phase 6 |
| 4.2 | ❌ No | UI - no downstream dependencies, test in Phase 6 |
| 4.3 | ❌ No | Export - no downstream dependencies, test in Phase 6 |
| 5.1 | ✅ Yes | Integration wiring - could break the flow |
| 6.1 | ✅ Yes | All remaining tests + E2E validation |

---

## Story File Structure

```
tasks/epic-15/
├── scoring-analysis-plan.md          # Full planning document
├── sprint-structure.md               # This file
├── 0.1-assessmentid-in-exports.md    # Story file
├── 1.1-schema-repositories.md        # Story file
├── 2.1-types-prompt-tool.md          # Story file
├── 2.2-scoring-payload-validator.md  # Story file
├── 3.1-scoring-service.md            # Story file
├── 4.1-mode-status-warnings.md       # Story file
├── 4.2-scoring-result-card.md        # Story file
├── 4.3-scoring-exporters.md          # Story file
├── 5.1-chatserver-integration.md     # Story file
└── 6.1-e2e-remaining-tests.md        # Story file
```

---

## Story File Template

Each story file should follow this structure (~700 lines target):

```markdown
# Story X.X: [Name]

## Overview
[2-3 sentences describing what this story accomplishes]

## Dependencies
- Depends on: [list story dependencies]
- Blocks: [list stories this blocks]

## Files to Create/Modify
| File | Action | Description |
|------|--------|-------------|
| path/to/file.ts | CREATE/MODIFY | What to do |

## Detailed Requirements

### [Section 1]
[Detailed specs with code examples]

### [Section 2]
[More specs]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Tests pass (if applicable)

## Test Requirements (if applicable)
[Test cases to implement]

## Agent Instructions
1. Read this file completely
2. Check dependencies are complete
3. Implement in order: [list order]
4. Run tests
5. Mark story complete
```

---

## Handoff Context for Next Session

### What Was Completed
1. Full Epic 15 planning (`scoring-analysis-plan.md`)
2. Code review integration (payload validation, provenance, PHI handling)
3. Sprint structure design (this file)
4. CLAUDE.md updated (AI vs Code responsibilities)
5. architecture-layers.md updated (module status)

### What Needs to Be Done Next
1. Create 10 story files following the structure above
2. Each story ~700 lines with full context for agent execution
3. Start with Story 0.1 (prerequisite)

### Key Technical Context

**Existing Infrastructure (from Epic 16/17):**
- `DocumentParserService.parseForResponses()` - extracts Q&A from docs
- `PromptCacheManager` - cache scoring rubric
- `FileValidationService` - validates file types
- WebSocket events: `upload_progress`, `scoring_parse_ready`

**New Components to Build:**
- 3 DB tables: `responses`, `dimension_scores`, `assessment_results`
- `ScoringPayloadValidator` - validate `scoring_complete` tool output
- `ScoringService` - orchestrate scoring flow
- `ScoringResultCard` - display results in chat
- `ScoringPDFExporter`, `ScoringWordExporter` - export reports

**Scoring Flow:**
1. User selects 'scoring' mode → sees welcome message
2. User uploads completed questionnaire (PDF/DOCX)
3. `DocumentParserService.parseForResponses()` extracts Q&A + assessmentId
4. Validate assessmentId exists in DB
5. Store responses with batch_id
6. Send responses + cached rubric to Claude
7. Claude streams narrative report
8. Claude calls `scoring_complete` tool
9. Validate payload (scores 0-100, required fields, 10 dimensions)
10. Store to DB with provenance (rubric_version, model_id, raw_payload)
11. Display ScoringResultCard in chat
12. User can export to PDF/Word

### Branch
`feature/epic-15-scoring-analysis`

### Files Modified This Session
- `tasks/epic-15/scoring-analysis-plan.md` - extensive updates
- `CLAUDE.md` - AI vs Code rule updated
- `docs/design/architecture/architecture-layers.md` - module status added

---

## Success Criteria for Epic 15

After all stories complete:
- [ ] AssessmentId appears in all questionnaire exports (PDF, Word, Excel)
- [ ] 3 new database tables created with proper constraints
- [ ] Scoring mode available in ModeSelector dropdown
- [ ] Completed questionnaires can be uploaded and scored
- [ ] Claude applies rubric and outputs narrative + structured scores
- [ ] Payload validation rejects malformed scoring results
- [ ] Scores stored with provenance (rubric version, model ID)
- [ ] ScoringResultCard displays scores, risk ratings, recommendation
- [ ] Scoring reports exportable to PDF and Word
- [ ] E2E test validates full flow
- [ ] All tests pass with 70%+ coverage
