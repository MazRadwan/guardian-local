# Epic 12: Tool-Based Questionnaire Generation Trigger

## Overview

Replace brittle pattern-matching trigger detection with Claude tool calls. Claude semantically decides when it's ready to generate a questionnaire, and the user explicitly confirms via a "Generate Questionnaire" button.

**Prerequisites:** Epic 11 (Questionnaire Extraction) complete

---

## Current vs Target Flow

### Current Flow (Brittle)
```
User: "generate it"
    ↓
TriggerDetection.ts pattern matches (60+ regex patterns)
    ↓
Claude generates questionnaire immediately
    ↓
Extraction → Download buttons
```

**Problems:**
- Pattern matching misses edge cases
- False positives ("can you generate?" triggers immediately)
- User has no control over timing
- Claude unaware of generation trigger

### Target Flow (Tool-Based)
```
User conversation in Assessment Mode
    ↓
Claude determines it has enough context
    ↓
Claude calls `questionnaire_ready` tool
    ↓
Backend intercepts tool_use → emits WebSocket event
    ↓
Frontend shows "Generate Questionnaire" button + summary
    ↓
User clicks button → emits `generate_questionnaire` event
    ↓
Backend triggers Claude to generate → extraction → export_ready
```

**Benefits:**
- Claude decides readiness (semantic understanding)
- User has explicit control
- Clean separation of concerns
- Feature-flagged rollout

---

## Module Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                                  │
│                                 (apps/web)                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────────────────────────┐    ┌─────────────────────────────┐   │
│  │        chatStore.ts [MODIFY]         │    │   useWebSocketEvents.ts     │   │
│  │  + pendingQuestionnaire state        │◄───│        [MODIFY]             │   │
│  │  + setPendingQuestionnaire()         │    │  + questionnaire_ready      │   │
│  │  + clearPendingQuestionnaire()       │    │    event handler            │   │
│  └──────────────────────────────────────┘    └─────────────────────────────┘   │
│                    │                                        │                    │
│                    ▼                                        │                    │
│  ┌──────────────────────────────────────┐                   │                    │
│  │  GenerateQuestionnaireButton.tsx     │                   │                    │
│  │            [NEW]                     │◄──────────────────┘                    │
│  │  - Renders button + summary card     │                                        │
│  │  - Emits generate_questionnaire      │                                        │
│  └──────────────────────────────────────┘                                        │
│                    │                                                             │
│                    ▼                                                             │
│  ┌──────────────────────────────────────┐                                        │
│  │       websocket.ts [MODIFY]          │                                        │
│  │  + QuestionnaireReadyPayload type    │                                        │
│  │  + onQuestionnaireReady()            │                                        │
│  │  + confirmQuestionnaireGeneration()  │                                        │
│  └──────────────────────────────────────┘                                        │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ WebSocket
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            INFRASTRUCTURE LAYER                                  │
│                     (packages/backend/src/infrastructure)                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────────────────────────┐    ┌─────────────────────────────┐   │
│  │       ChatServer.ts [MODIFY]         │───►│    ClaudeClient.ts          │   │
│  │  + Feature flag check                │    │        [MODIFY]             │   │
│  │  + Handle tool_use response          │    │  + Accept tools param       │   │
│  │  + Emit questionnaire_ready event    │    │  + Parse tool_use response  │   │
│  │  + generate_questionnaire handler    │    │  + streamMessageWithTools() │   │
│  └──────────────────────────────────────┘    └─────────────────────────────┘   │
│                    │                                        │                    │
│                    │                                        │                    │
│                    │         ┌──────────────────────────────┘                    │
│                    │         │                                                   │
│                    │         ▼                                                   │
│                    │    ┌─────────────────────────────────────┐                  │
│                    │    │  ai/tools/questionnaireReadyTool.ts │                  │
│                    │    │              [NEW]                  │                  │
│                    │    │  - Tool definition JSON             │                  │
│                    │    │  - Schema: assessment_type required │                  │
│                    │    │  - Optional: vendor, summary        │                  │
│                    │    └─────────────────────────────────────┘                  │
│                    │                                                             │
│                    │    ┌─────────────────────────────────────┐                  │
│                    │    │  TriggerDetection.ts [KEEP]         │                  │
│                    │    │  - Fallback when flag disabled      │                  │
│                    │    │  - Eventually deprecated            │                  │
│                    │    └─────────────────────────────────────┘                  │
│                    │                                                             │
│                    │    ┌─────────────────────────────────────┐                  │
│                    │    │  prompts/*.ts [MODIFY]              │                  │
│                    │    │  - Add tool usage instructions      │                  │
│                    │    └─────────────────────────────────────┘                  │
│                    │                                                             │
└────────────────────┼─────────────────────────────────────────────────────────────┘
                     │
                     │ Delegates to
                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             APPLICATION LAYER                                    │
│                      (packages/backend/src/application)                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────────────────────────┐                                        │
│  │  interfaces/IToolUseHandler.ts       │                                        │
│  │              [NEW]                   │                                        │
│  │  - ToolUseInput interface            │                                        │
│  │  - ToolUseResult interface           │                                        │
│  │  - ToolUseContext interface          │                                        │
│  │  - IToolUseHandler interface         │                                        │
│  └──────────────────────────────────────┘                                        │
│                    ▲                                                             │
│                    │ implements                                                  │
│                    │                                                             │
│  ┌──────────────────────────────────────┐    ┌─────────────────────────────┐   │
│  │  services/QuestionnaireReadyService  │───►│    AssessmentService        │   │
│  │              [NEW]                   │    │    ConversationService      │   │
│  │  - handle(input, context)            │    │    (existing services)      │   │
│  │  - Validates tool input              │    └─────────────────────────────┘   │
│  │  - Returns ToolUseResult             │                                        │
│  │  - Builds event payload              │                                        │
│  └──────────────────────────────────────┘                                        │
│                                                                                  │
│  ┌──────────────────────────────────────┐                                        │
│  │  interfaces/IClaudeClient.ts         │                                        │
│  │           [MODIFY]                   │                                        │
│  │  + ClaudeTool type                   │                                        │
│  │  + ToolUseBlock type                 │                                        │
│  │  + ClaudeRequestOptionsWithTools     │                                        │
│  └──────────────────────────────────────┘                                        │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Components Summary

| Component | Action | Layer | Sprint |
|-----------|--------|-------|--------|
| `IToolUseHandler.ts` | NEW | Application | 1 |
| `QuestionnaireReadyService.ts` | NEW | Application | 1 |
| `IClaudeClient.ts` | MODIFY | Application | 1 |
| `questionnaireReadyTool.ts` | NEW | Infrastructure | 2 |
| `ClaudeClient.ts` | MODIFY | Infrastructure | 2 |
| `ChatServer.ts` | MODIFY | Infrastructure | 2 |
| `TriggerDetection.ts` | KEEP (fallback) | Infrastructure | 2 |
| `websocket.ts` | MODIFY | Presentation | 3 |
| `chatStore.ts` | MODIFY | Presentation | 3 |
| `GenerateQuestionnaireButton.tsx` | NEW | Presentation | 3 |
| `useWebSocketEvents.ts` | MODIFY | Presentation | 3 |
| `prompts/*.ts` | MODIFY | Infrastructure | 4 |

---

## Sprint Overview

| Sprint | Focus | Stories |
|--------|-------|---------|
| **Sprint 1** | Application Layer Foundation | 1.1, 1.2, 1.3 |
| **Sprint 2** | Infrastructure Layer (Feature-Flagged) | 2.1, 2.2, 2.3, 2.4, 2.5 |
| **Sprint 3** | Frontend Ready State | 3.1, 3.2, 3.3, 3.4 |
| **Sprint 4** | Prompts & E2E Testing | 4.1, 4.2, 4.3, 4.3.1-4.3.5 |
| **Sprint 5** | Hybrid Generation Architecture | 5.1, 5.2, 5.3, 5.3.1, 5.4, 5.5, 5.6 |

> **Note:** Sprint 5 was refactored after Epic 12.4.3. The original 5.1-5.2 (feature flag removal)
> was replaced with a comprehensive architectural refactor implementing the hybrid JSON→render→stream flow.
> See `sprint-5-overview.md` for full context.

---

## WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `questionnaire_ready` | Backend → Frontend | `{ conversationId, vendorName?, assessmentType, contextSummary?, estimatedQuestions? }` |
| `generate_questionnaire` | Frontend → Backend | `{ conversationId }` |

---

## Feature Flag

```bash
# .env
USE_TOOL_BASED_TRIGGER=false  # Default: use old pattern matching
USE_TOOL_BASED_TRIGGER=true   # Enable: use Claude tool calls
```

---

## Story File Naming

```
tasks/epic-12/
├── overview.md                          # This file
├── sprint-5-overview.md                 # Sprint 5 architectural context
├── 1.1-itoolhandler-interface.md
├── 1.2-questionnaire-ready-service.md
├── 1.3-app-layer-tests.md
├── 2.1-tool-definition.md
├── 2.2-claude-client-tools.md
├── 2.3-chatserver-tool-handling.md
├── 2.4-feature-flag-wiring.md
├── 2.5-integration-tests.md
├── 3.1-websocket-events.md
├── 3.2-chat-store-state.md
├── 3.3-generate-button-component.md
├── 3.4-frontend-tests.md
├── 4.1-system-prompt-updates.md
├── 4.2-e2e-testing.md
├── 4.3-questionnaire-gen-UX-enhancement.md
├── 4.3.1-4.3.5 (UX bug fixes)
├── 5.1-questionnaire-schema-types.md    # NEW - Sprint 5 refactor
├── 5.2-markdown-renderer.md             # NEW
├── 5.3-generation-service.md            # NEW
├── 5.3.1-tool-use-refinement.md         # NEW - tool_use for reliable JSON
├── 5.4-chatserver-refactor.md           # NEW
├── 5.5-prompt-cleanup.md                # NEW
└── 5.6-integration-cleanup.md           # NEW

# Implementation log (standard location)
tasks/implementation-logs/epic-12-implementation-log.md
```

---

## Agent Instructions

The `epic-12-agent` should:
1. Read this overview for context
2. Find the next incomplete story file (check `status: pending`)
3. Execute the story with full implementation
4. Mark story `status: complete` in the story file
5. Update `tasks/implementation-logs/epic-12-implementation-log.md` with progress
6. Proceed to next story

**Note:** Skip Opus code review - main agent is Opus.
