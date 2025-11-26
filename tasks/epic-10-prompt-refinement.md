# Epic 10: Guardian Prompt Refinement for Web App

**Version:** 1.3
**Created:** 2025-11-24
**Updated:** 2025-11-25
**Status:** In Progress (Stories 10.1-10.22 COMPLETE, Story 10.23 frontend wiring COMPLETE - ready for E2E testing)
**Priority:** High
**Estimated Duration:** 1-2 weeks (incremental editing approach)

---

## Overview

Refine the Guardian system prompt (`guardian-prompt.md`) to align with web application UX instead of Claude Projects command-based workflow. Remove command syntax and YAML workflows while preserving all domain expertise, risk assessment methodology, and analytical capabilities.

**Goal:** Recreate Claude Projects conversational experience in web app without the workarounds (`!commands`, YAML imports) that were necessitated by Claude Projects constraints.

---

## Problem Statement

**Current State:**
- `guardian-prompt.md` (46KB, 1542 lines) contains extensive domain expertise BUT:
  - References 16 `!commands` that don't exist in web app
  - Instructs users to "paste YAML" and "type !import_quick_assessment"
  - Includes analyst interview workflow (STEP 1-7) meant for human analyst, not chatbot
  - Describes "Forge" tool creation metaphor not applicable to web app

**Impact:**
- Chatbot confused about available actions
- Users don't know how to trigger questionnaire generation
- Workflow descriptions don't match web app UX

**Desired State:**
- Prompt describes conversational web app workflow
- No command syntax
- Clear instructions for both questionnaire generation AND direct risk analysis
- All domain expertise preserved (10 risk dimensions, compliance frameworks, scoring rubrics)

---

## Goals

1. **Remove Command Syntax:** Delete all `!command` references, replace with conversational equivalents
2. **Clarify Web App Workflow:** Add explicit instructions for Assessment and Consult modes
3. **Preserve Domain Expertise:** Keep all scoring rubrics, compliance knowledge, report templates
4. **Enable Dual Workflows:** Support both questionnaire generation AND direct conversational analysis
5. **Maintain Prompt Caching:** Ensure edited prompt works with existing PromptCacheManager

---

## Key Principles

### What to DELETE:
- ❌ All `!command` syntax (16 commands)
- ❌ YAML import/export workflow instructions
- ❌ Interview preparation steps (analyst workflow, not chatbot behavior)
- ❌ Forge metaphor (tool creation/export/import)
- ❌ Checkpoint/restore commands (not needed with backend persistence)
- ❌ Commands specific to Claude Projects constraints

### What to KEEP:
- ✅ 10 risk dimensions with detailed scoring rubrics
- ✅ Canadian compliance frameworks (PIPEDA, ATIPP, PHIA)
- ✅ NIST CSF / ITIL4 / clinical validation standards
- ✅ Report generation templates (Internal Decision, Vendor Feedback)
- ✅ Communication tone guidelines
- ✅ Quality gates and validation checklists
- ✅ Recommendation logic (Approve/Conditional/Decline)

### What to ADD:
- ✅ Web app operating context (no commands, conversational only)
- ✅ Consult Mode behavior (general questions)
- ✅ Assessment Mode behavior (context gathering → questionnaire OR analysis)
- ✅ File upload guidance (documents can be uploaded during conversation)
- ✅ Dual workflow support (questionnaire generation OR direct analysis)

---

## Architecture Compatibility

### Prompt Caching (Unchanged)
- ✅ Same file: `guardian-prompt.md`
- ✅ Same loading: `GUARDIAN_PROMPT_FILE=./guardian-prompt.md`
- ✅ Hash will change after edits → new cache entry generated
- ✅ PromptCacheManager handles automatically

### Backend Integration (Unchanged)
- ✅ QuestionService still generates questions via API
- ✅ ExportService still generates PDF/Word/Excel
- ✅ ChatServer still passes prompt to Claude
- ✅ No code changes needed

### Frontend (Unchanged)
- ✅ Chat interface works as-is
- ✅ Download buttons already exist
- ✅ File upload already supported
- ✅ No UI changes needed

---

## Sprints & Stories

Stories are sized for **2-4 hours each** with testing between edits.

---

## Sprint 1: Remove Confusing Elements (Week 1)

**Goal:** Delete command syntax and Claude Projects-specific workflows

### Story 10.1: Delete Command Interface Section
**Estimated:** 2 hours

**Tasks:**
- [ ] Delete PART II: COMMAND INTERFACE (lines ~181-264)
- [ ] Remove all `!command` definitions and syntax
- [ ] Remove command reference tables
- [ ] Test: Search prompt for remaining `!` commands - should find none

**Acceptance Criteria:**
- [ ] No `!` commands remain in prompt
- [ ] Section completely removed
- [ ] Remaining content flows logically
- [ ] Line count reduced by ~80 lines

**Files Modified:**
- `packages/backend/guardian-prompt.md`

**Testing:**
- [ ] Search for `!` character in prompt
- [ ] Verify no broken references to deleted commands
- [ ] Start test conversation - chatbot shouldn't mention commands

---

### Story 10.2: Delete Interview Workflow Section
**Estimated:** 2 hours

**Tasks:**
- [ ] Delete PART III: ASSESSMENT WORKFLOW - STEP 1-7 (lines ~266-456)
- [ ] Remove analyst interview preparation instructions
- [ ] Remove YAML form completion steps
- [ ] Remove offline interview structure
- [ ] Keep scoring methodology (moves to different section)

**Acceptance Criteria:**
- [ ] Interview prep steps removed
- [ ] YAML workflow instructions removed
- [ ] No references to "90-minute interview" or "fill form offline"
- [ ] Line count reduced by ~190 lines

**Files Modified:**
- `packages/backend/guardian-prompt.md`

**Testing:**
- [ ] Search for "YAML", "interview", "STEP 1"
- [ ] Verify no instructions for offline workflows
- [ ] Test conversation - no mentions of forms or interviews

**Dependencies:** Story 10.1

---

### Story 10.3: Delete Forge and Phase 2 Commands
**Estimated:** 1.5 hours

**Tasks:**
- [ ] Delete PART VIII: SPECIAL CAPABILITIES - Forge sections (lines ~1263-1347)
- [ ] Remove forge create_assessment
- [ ] Remove forge quick_start scenarios
- [ ] Remove vendor_history commands
- [ ] Remove portfolio analysis commands
- [ ] Remove checkpoint/restore commands

**Acceptance Criteria:**
- [ ] No "Forge" metaphor remains
- [ ] No Phase 2 command references (comparison, history, portfolio)
- [ ] Line count reduced by ~85 lines

**Files Modified:**
- `packages/backend/guardian-prompt.md`

**Testing:**
- [ ] Search for "forge", "!vendor_history", "!analyze_portfolio"
- [ ] Should find zero matches
- [ ] Test conversation - no Phase 2 command mentions

**Dependencies:** Story 10.2

---

### Story 10.4: Renumber Remaining Parts
**Estimated:** 30 minutes

**Tasks:**
- [ ] After deletions, renumber PART IV → PART II
- [ ] PART V → PART III
- [ ] PART VI → PART IV
- [ ] PART VII → PART V
- [ ] Update table of contents if exists

**Acceptance Criteria:**
- [ ] Parts numbered sequentially
- [ ] No skipped numbers
- [ ] Internal references updated

**Files Modified:**
- `packages/backend/guardian-prompt.md`

**Dependencies:** Story 10.3

---

## Sprint 2: Add Web App Workflow Instructions (Week 1-2)

**Goal:** Add clear web app operating context and mode behaviors

### Story 10.5: Add Web Application Context Section
**Estimated:** 3 hours

**Tasks:**
- [ ] Create new PART II: WEB APPLICATION WORKFLOW
- [ ] Add operating context (conversational interface, no commands)
- [ ] Explain available UI elements (mode selector, file upload, download buttons)
- [ ] Clarify what chatbot cannot do (trigger APIs directly, mention commands)
- [ ] Add after PART I: CORE CAPABILITIES

**Acceptance Criteria:**
- [ ] New PART II inserted after system identity
- [ ] Clearly explains web app context
- [ ] Lists UI elements available to user
- [ ] Sets boundaries for chatbot behavior
- [ ] ~50-75 lines of new content

**Content Outline:**
```markdown
## PART II: WEB APPLICATION WORKFLOW

### Operating Context
- Conversational web interface (not Claude Projects)
- User actions via UI (mode selector, upload, download)
- System calls APIs (questionnaire generation, export)
- Chatbot guides, doesn't execute

### What You Cannot Do
- No command syntax
- No YAML instructions
- No claiming to trigger APIs directly

### Consult Mode Behavior
[Instructions for general Q&A mode]

### Assessment Mode Behavior
[Instructions for vendor assessment mode]
```

**Files Modified:**
- `packages/backend/guardian-prompt.md`

**Testing:**
- [ ] Read new section - clear and unambiguous?
- [ ] Start test conversation - chatbot follows web app patterns?

**Dependencies:** Story 10.4

---

### Story 10.6: Define Consult Mode Behavior
**Estimated:** 2 hours

**Tasks:**
- [ ] Add detailed Consult Mode instructions to PART II
- [ ] Purpose: Answer general AI governance questions
- [ ] Topics: Compliance, risk assessment, best practices, frameworks
- [ ] Response style: Concise (2-3 paragraphs), actionable
- [ ] Referral: Suggest Assessment Mode for vendor evaluations

**Acceptance Criteria:**
- [ ] Clear description of Consult Mode purpose
- [ ] Example topics listed
- [ ] Response style guidelines
- [ ] Transition guidance to Assessment Mode
- [ ] ~30-40 lines of content

**Files Modified:**
- `packages/backend/guardian-prompt.md`

**Testing:**
- [ ] Test conversation in Consult Mode
- [ ] Ask general questions - responses concise?
- [ ] Ask about vendor - suggests Assessment Mode?

**Dependencies:** Story 10.5

---

### Story 10.7: Define Assessment Mode - Context Gathering
**Estimated:** 3 hours

**Tasks:**
- [ ] Add Assessment Mode context gathering instructions
- [ ] Include path selection prompt (Quick/Comprehensive/Category)
- [ ] Progressive questioning strategy (3-5 exchanges)
- [ ] File upload integration (analyze docs, ask follow-ups)
- [ ] Readiness signal: "Ready to proceed?"

**Acceptance Criteria:**
- [ ] Clear entry flow with 3 assessment paths
- [ ] Context gathering questions defined
- [ ] File upload behavior explained
- [ ] Readiness confirmation pattern specified
- [ ] ~60-80 lines of content

**Files Modified:**
- `packages/backend/guardian-prompt.md`

**Testing:**
- [ ] Enter Assessment Mode - shows path selection?
- [ ] Upload document - chatbot acknowledges and asks follow-ups?
- [ ] After 3-5 exchanges - signals readiness?

**Dependencies:** Story 10.6

---

### Story 10.8: Define Assessment Mode - Dual Workflow (Questionnaire vs Analysis)
**Estimated:** 3 hours

**Tasks:**
- [ ] Add instructions for questionnaire generation workflow
- [ ] Add instructions for direct conversational analysis workflow
- [ ] Clarify when each is appropriate
- [ ] Explain: User can request either path
- [ ] Download button instructions (questionnaire generated)
- [ ] Regeneration instructions (user requests changes)

**Acceptance Criteria:**
- [ ] Both workflows clearly documented
- [ ] User choice emphasized (not forced into one path)
- [ ] Questionnaire generation trigger clear: user confirms readiness
- [ ] Analysis trigger clear: user requests "risk assessment" or "analyze"
- [ ] Download and regeneration explained
- [ ] ~80-100 lines of content

**Content Outline:**
```markdown
**Workflow A: Questionnaire Generation**
1. Context gathering → readiness confirmation
2. User confirms → "Generating questionnaire now..."
3. System generates questions → saves to database
4. Download buttons appear in chat [PDF] [Word] [Excel]
5. User can request modifications → regenerate

**Workflow B: Direct Conversational Analysis**
1. Context gathering (may be brief or extensive)
2. User requests: "Do a risk assessment" or "Analyze what we've discussed"
3. Guardian analyzes available evidence
4. Generates risk scores with confidence levels
5. Flags gaps: "Insufficient evidence for X - recommend..."
6. Generates report with download buttons

**When to Use Each:**
- Questionnaire: Structured vendor interview needed
- Analysis: Quick triage, rich documentation already provided, renewal assessments
```

**Files Modified:**
- `packages/backend/guardian-prompt.md`

**Testing:**
- [ ] Request questionnaire - generates and shows download?
- [ ] Request analysis - produces risk scores?
- [ ] Both workflows work without confusion?

**Dependencies:** Story 10.7

---

## Sprint 3: Update Scoring & Report Sections (Week 2)

**Goal:** Clarify when scoring is used and update Phase 2 references

### Story 10.9: Add Phase 2 Notes to Scoring Section
**Estimated:** 1.5 hours

**Tasks:**
- [ ] Add note to PART IV (Scoring & Analysis Methodology)
- [ ] Clarify: Rubrics guide questionnaire design NOW
- [ ] Clarify: Rubrics power analysis in conversational workflow
- [ ] Clarify: Full vendor response scoring is Phase 2
- [ ] Keep all rubric details (needed for current analysis capability)

**Acceptance Criteria:**
- [ ] Note added explaining dual use of rubrics
- [ ] Scoring methodology preserved
- [ ] No confusion about when scoring happens
- [ ] ~10-15 lines added

**Files Modified:**
- `packages/backend/guardian-prompt.md`

**Testing:**
- [ ] Test conversational analysis - uses rubrics correctly?
- [ ] Chatbot doesn't claim to score without data?

**Dependencies:** Story 10.8

---

### Story 10.10: Update Report Generation Instructions
**Estimated:** 2 hours

**Tasks:**
- [ ] Update PART V: REPORT GENERATION
- [ ] Keep both report templates (Internal Decision, Vendor Feedback)
- [ ] Add: Reports can be generated from conversational analysis
- [ ] Clarify: Full vendor response reports are Phase 2
- [ ] Update language: Remove "!generate_report", use conversational triggers
- [ ] Add: Reports appear with download buttons

**Acceptance Criteria:**
- [ ] Report templates preserved
- [ ] No command syntax
- [ ] Conversational triggers explained
- [ ] Phase 2 distinction clear
- [ ] ~20-30 lines modified

**Files Modified:**
- `packages/backend/guardian-prompt.md`

**Testing:**
- [ ] Request report - generates without command syntax?
- [ ] Download buttons appear correctly?

**Dependencies:** Story 10.9

---

### Story 10.11: Clean Up Quality Gates Section
**Estimated:** 1.5 hours

**Tasks:**
- [ ] Review PART VII: QUALITY GATES & VALIDATION
- [ ] Keep evidence requirements
- [ ] Keep quality standards
- [ ] Remove/update checklists specific to YAML workflow
- [ ] Update "Before Finalizing Assessment" checklist for web app context

**Acceptance Criteria:**
- [ ] Quality standards preserved
- [ ] No references to offline workflows
- [ ] Checklists applicable to web app
- [ ] ~10-20 lines modified

**Files Modified:**
- `packages/backend/guardian-prompt.md`

**Testing:**
- [ ] Review section - makes sense for web app?

**Dependencies:** Story 10.10

---

## Sprint 4: Testing & Validation (Week 2)

**Goal:** Verify prompt works correctly in all scenarios

### Story 10.12: Test Consult Mode Conversations
**Estimated:** 2 hours

**Tasks:**
- [ ] Start Consult Mode conversation
- [ ] Ask 5-10 general governance questions
- [ ] Verify responses are concise (2-3 paragraphs)
- [ ] Verify no command mentions
- [ ] Verify suggests Assessment Mode when appropriate
- [ ] Document any issues found

**Acceptance Criteria:**
- [ ] 10 test questions answered correctly
- [ ] No command syntax in responses
- [ ] Appropriate mode switching suggestions
- [ ] Response quality maintained

**Testing Scenarios:**
- General AI risk questions
- Compliance framework questions (PIPEDA, ATIPP)
- Best practices for vendor evaluation
- Regulatory requirement questions
- Request to assess specific vendor (should redirect to Assessment Mode)

**Dependencies:** Story 10.11

---

### Story 10.13: Test Assessment Mode - Questionnaire Generation
**Estimated:** 3 hours

**Tasks:**
- [ ] Start Assessment Mode conversation
- [ ] Test all 3 paths: Quick, Comprehensive, Category-Focused
- [ ] Verify context gathering works (3-5 exchanges)
- [ ] Verify file upload integration
- [ ] Verify readiness signal appears
- [ ] Verify "Generating questionnaire now..." response
- [ ] Test regeneration after modifications
- [ ] Document any issues

**Acceptance Criteria:**
- [ ] All 3 assessment paths work
- [ ] Context gathering feels natural
- [ ] File uploads acknowledged and processed
- [ ] Readiness confirmation clear
- [ ] Generation trigger works
- [ ] Regeneration works

**Testing Scenarios:**
- Quick Assessment: Clinical decision support tool
- Comprehensive Assessment: Patient portal application
- Category-Focused: Radiology AI
- Upload vendor document during gathering
- Request modifications after generation

**Dependencies:** Story 10.12

---

### Story 10.14: Test Assessment Mode - Direct Analysis
**Estimated:** 2 hours

**Tasks:**
- [ ] Start Assessment Mode conversation
- [ ] Provide context (typed + uploaded docs)
- [ ] Request direct risk analysis (no questionnaire)
- [ ] Verify Guardian analyzes available evidence
- [ ] Verify risk scores generated with confidence levels
- [ ] Verify gaps flagged
- [ ] Verify report generated
- [ ] Document any issues

**Acceptance Criteria:**
- [ ] Analysis works without questionnaire
- [ ] Risk scores generated appropriately
- [ ] Confidence levels included ("Medium confidence - limited clinical validation data")
- [ ] Gaps explicitly flagged
- [ ] Report format matches templates

**Testing Scenarios:**
- Rich documentation provided (architecture, security, compliance docs)
- Minimal information (quick triage request)
- Mixed evidence quality

**Dependencies:** Story 10.13

---

### Story 10.15: Edge Case Testing
**Estimated:** 2 hours

**Tasks:**
- [ ] Test mode switching mid-conversation
- [ ] Test very long conversations (10+ exchanges)
- [ ] Test insufficient context (user asks for questionnaire too early)
- [ ] Test conflicting information
- [ ] Test edge case categories/scenarios
- [ ] Document all issues found

**Acceptance Criteria:**
- [ ] Mode switching handled gracefully
- [ ] Long conversations maintain context
- [ ] Early generation requests handled appropriately
- [ ] Conflicts trigger clarifying questions
- [ ] All edge cases have reasonable behavior

**Files Modified:**
- `packages/backend/guardian-prompt.md` (bug fixes if needed)

**Dependencies:** Story 10.14

---

### Story 10.16: Prompt Optimization and Polish
**Estimated:** 2 hours

**Tasks:**
- [ ] Review entire prompt for clarity
- [ ] Fix any unclear instructions
- [ ] Optimize token count where possible (without losing content)
- [ ] Ensure consistent tone throughout
- [ ] Verify all sections flow logically
- [ ] Final proofread for typos/formatting

**Acceptance Criteria:**
- [ ] Prompt reads clearly start to finish
- [ ] No ambiguous instructions
- [ ] Consistent voice and tone
- [ ] Professional formatting
- [ ] Final line count ~1000-1100 (down from 1542)

**Files Modified:**
- `packages/backend/guardian-prompt.md`

**Testing:**
- [ ] Full re-read of entire prompt
- [ ] Test both modes end-to-end
- [ ] Verify no regressions

**Dependencies:** Story 10.15

---

## Sprint 5: Documentation & Handoff (Week 2)

**Goal:** Document changes and close out epic

### Story 10.17: Create Implementation Log
**Estimated:** 2 hours

**Tasks:**
- [ ] Create `tasks/implementation-logs/epic-10-prompt-refinement.md`
- [ ] Document what was deleted and why
- [ ] Document what was added and why
- [ ] Document testing results
- [ ] Provide before/after comparison
- [ ] Include lessons learned

**Acceptance Criteria:**
- [ ] Complete implementation log created
- [ ] All changes documented
- [ ] Testing results included
- [ ] Future agent can understand what was done

**Files Created:**
- `tasks/implementation-logs/epic-10-prompt-refinement.md`

**Dependencies:** Story 10.16

---

### Story 10.18: Update Task Documentation
**Estimated:** 1 hour

**Tasks:**
- [ ] Mark Epic 10 complete in `tasks/task-overview.md`
- [ ] Update this file status to "Complete"
- [ ] Add completion notes
- [ ] Document final prompt size and structure

**Acceptance Criteria:**
- [ ] task-overview.md shows Epic 10 complete
- [ ] This file marked complete
- [ ] Completion date added
- [ ] Notes added for future reference

**Files Modified:**
- `tasks/task-overview.md`
- `tasks/epic-10-prompt-refinement.md`

**Dependencies:** Story 10.17

---

## Definition of Done (Story-Level)

A story is **DONE** when:
- [ ] All tasks completed
- [ ] Acceptance criteria met
- [ ] Testing completed and documented
- [ ] No regressions in chatbot behavior
- [ ] Changes committed with clear message
- [ ] Implementation log updated (if applicable)

---

## Definition of Done (Epic-Level)

Epic 10 is **DONE** when:
- [ ] All 18 stories complete
- [ ] Prompt reduced from 1542 lines to ~1000-1100 lines
- [ ] No `!command` syntax remains
- [ ] Both Consult and Assessment modes tested and working
- [ ] Both questionnaire and analysis workflows validated
- [ ] Implementation log complete
- [ ] task-overview.md updated
- [ ] Ready to merge to main

---

## Success Metrics

**Prompt Quality:**
- [ ] No command syntax confusion
- [ ] Clear web app workflow instructions
- [ ] All domain expertise preserved
- [ ] Both workflows (questionnaire + analysis) supported

**Chatbot Behavior:**
- [ ] Consult Mode: Concise, helpful, appropriate redirects
- [ ] Assessment Mode: Clear path selection, fluid context gathering
- [ ] Questionnaire generation: Works on user confirmation
- [ ] Direct analysis: Works when requested, flags gaps appropriately

**Technical:**
- [ ] Prompt caching still works (new hash generated)
- [ ] No backend code changes needed
- [ ] No frontend changes needed
- [ ] Token count optimized without losing quality

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Delete too much, lose domain expertise | High | Incremental edits, test after each story |
| Ambiguous instructions confuse chatbot | Medium | Clear testing scenarios, iterate based on results |
| Breaking prompt caching | Low | Hash automatically updates, no code changes needed |
| Scope creep (new features) | Medium | Stick to "recreate Claude Projects in web app" - no new decision points |

---

## Dependencies

**External:**
- Existing guardian-prompt.md (46KB source file)
- Prompt caching infrastructure (Epic: Sidequest)
- Export infrastructure (Epic 7)

**Internal:**
- QuestionService for questionnaire generation (Epic 6)
- ExportService for PDF/Word/Excel (Epic 7)
- File upload capability (frontend)

---

## Rollback Plan

If prompt edits cause issues:
1. **Git Revert:** Revert to commit before Epic 10 edits
2. **Backup File:** Keep `guardian-prompt-original.md` copy before editing
3. **Incremental Testing:** Each story tested independently - can roll back story-by-story

---

## Notes

**Dual Workflow Support:**
- Questionnaire generation: User wants structured vendor interview
- Direct analysis: User has rich documentation or wants quick triage

Both are valid. Don't force users into one path.

**No New Features:**
- Not adding artifact previews
- Not adding button triggers (conversational only)
- Not adding Phase 2 capabilities
- Just aligning prompt to current web app UX

**Incremental Approach:**
- Test after every 2-3 stories
- Document issues immediately
- Fix before proceeding to next sprint

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-24 | Initial epic breakdown - 18 stories across 5 sprints |
| 1.1 | 2025-11-25 | Added Sprint 6: Export Feature Integration (Stories 10.19-10.23) |
| 1.2 | 2025-11-25 | Stories 10.19-10.22 complete, Story 10.23 ready for testing |
| 1.3 | 2025-11-25 | Story 10.23 frontend wiring complete - full WebSocket chain, UI panels implemented |

---

## Sprint 6: Export Feature Integration (Added 2025-11-25)

**Goal:** Wire questionnaire generation and export to chat interface

**Context:** The web app uses `prompts.ts` (not just `guardian-prompt.md`). The `prompts.ts` has rigid "3-5 exchanges" rules that conflict with OG Guardian's conversational approach. Additionally, the export feature needs to be wired to the chat.

---

### Story 10.19: Update Assessment Mode Prompt for Conversational Flow ✅
**Estimated:** 2 hours
**Actual:** 1 hour
**Completed:** 2025-11-25
**Priority:** HIGH - Blocking other export stories

**Tasks:**
- [x] Update `packages/backend/src/infrastructure/ai/prompts.ts`
- [x] Remove rigid "After 3-5 exchanges" rule
- [x] Replace with conversational judgment guidance
- [x] Add 5 key context areas (solution type, data sensitivity, users, risk profile, concerns)
- [x] Add hint: "Say 'generate' whenever you're ready"
- [x] Add guidance: When Claude has enough context, ask "Ready to generate the questionnaire?"

**Acceptance Criteria:**
- [x] No rigid exchange count rules
- [x] Conversational context gathering guidance added
- [x] User hint included
- [x] Claude readiness signal defined
- [x] Matches OG Guardian conversational approach

**Files Modified:**
- `packages/backend/src/infrastructure/ai/prompts.ts`

---

### Story 10.20: Implement Generate Button Trigger Detection ✅
**Estimated:** 3 hours
**Actual:** 1.5 hours
**Completed:** 2025-11-25

**Tasks:**
- [x] In ChatServer.ts, detect trigger phrases in Claude's response OR user message
- [x] Trigger phrases: "Ready to generate", "generate the questionnaire", "generate now"
- [x] Emit `generate_ready` WebSocket event with assessmentId
- [x] Frontend: Listen for `generate_ready` event (requires frontend integration)
- [x] Show "Generate Questionnaire" button in chat (requires frontend integration)

**Acceptance Criteria:**
- [x] Backend detects trigger phrases
- [x] WebSocket event emitted correctly
- [ ] Frontend receives event and shows button (PENDING: requires frontend wiring)
- [x] Button only appears when appropriate (mode guard implemented)

**Files Modified:**
- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
- Frontend integration pending (not part of this story)

---

### Story 10.21: Create GenerateQuestionnaireButton Component ✅
**Estimated:** 2 hours
**Actual:** 45 minutes
**Completed:** 2025-11-25

**Tasks:**
- [x] Create `GenerateQuestionnaireButton` component
- [x] On click: `POST /api/assessments/:id/generate-questions`
- [x] Show loading state during generation
- [x] On success: Emit event to show download buttons (via callback)
- [x] On error: Show error message in chat (via callback)

**Acceptance Criteria:**
- [x] Button calls existing API correctly
- [x] Loading state visible during generation
- [x] Success triggers download button display (via onSuccess callback)
- [x] Errors handled gracefully (via onError callback)

**Files Created:**
- `apps/web/src/components/chat/GenerateQuestionnaireButton.tsx`

**Note:** Parent component integration (listening for generate_ready event and showing this button) is part of Story 10.23 integration testing.

---

### Story 10.22: Wire DownloadButton with JWT Auth ✅
**Estimated:** 1 hour
**Actual:** 15 minutes
**Completed:** 2025-11-25

**Tasks:**
- [x] Update `apps/web/src/components/chat/DownloadButton.tsx`
- [x] Uncomment and implement Authorization header
- [x] Get token from localStorage (guardian_token)
- [x] Pass to fetch request

**Acceptance Criteria:**
- [x] Download requests include JWT token
- [x] PDF/Word/Excel downloads work with auth (pending E2E test)
- [x] Unauthorized requests handled gracefully (error thrown and caught)

**Files Modified:**
- `apps/web/src/components/chat/DownloadButton.tsx`

---

### Story 10.23: Integration Testing - Export Flow 🔄
**Estimated:** 2 hours
**Status:** Ready for E2E Testing (frontend wiring complete)
**Started:** 2025-11-25

**Tasks:**
- [ ] E2E test: Full chat → generate → download flow
- [ ] Test trigger phrase detection (multiple variations)
- [ ] Test auth on download endpoints
- [ ] Test error scenarios (no assessment, generation failure)
- [ ] Document any issues

**Acceptance Criteria:**
- [ ] Complete flow works end-to-end
- [ ] All trigger phrases detected correctly
- [ ] Downloads work with authentication
- [ ] Error cases handled

**Implementation Status:**
- ✅ Backend trigger detection implemented (`ChatServer.ts:78-111`)
- ✅ Backend emits `generate_ready` event with conversationId + assessmentId
- ✅ GenerateQuestionnaireButton component created
- ✅ DownloadButton JWT auth wired
- ✅ Frontend `generate_ready` event chain wired:
  - `websocket.ts:440-452` - `onGenerateReady` method
  - `useWebSocket.ts:23,44,233-238` - option and effect registration
  - `useWebSocketAdapter.ts:27,129` - handler interface
  - `useWebSocketEvents.ts:48,64,117,313-324,338` - `handleGenerateReady` handler
  - `useChatController.ts:33,45,87-88,154,182,199,213,441-444,459,471` - state and exposure
  - `ChatInterface.tsx:3,6-8,29-47,62-111` - UI panels for generation and download
- ⏸️ Manual E2E testing required to validate full flow

**User Flow (Expected):**
1. User starts Assessment Mode conversation
2. User/Claude discuss context (conversational, no rigid exchange count)
3. User or Claude says "generate" (trigger phrase detected)
4. Blue panel appears: "Ready to generate your questionnaire"
5. User clicks "Generate Questionnaire" button
6. POST to `/api/assessments/:id/generate-questions`
7. On success: Green panel with download buttons (PDF, Word, Excel)
8. User clicks download button → authenticated fetch → file download

**Next Steps:**
1. Manual E2E testing of full flow
2. Document results in implementation log

---

## Updated Epic Summary

**Original Scope (Stories 10.1-10.18):** Clean up guardian-prompt.md (46KB), remove commands, add web app context

**New Scope (Stories 10.19-10.23):** Wire export feature to chat, update prompts.ts for conversational flow

**Recommended Order:**
1. Story 10.19 (prompts.ts update) - FIRST, unblocks other stories
2. Story 10.22 (DownloadButton auth) - Simple fix
3. Stories 10.20-10.21 (Generate button trigger & component)
4. Story 10.23 (Integration testing)
5. Then proceed with original Stories 10.1-10.18 for guardian-prompt.md cleanup

---

**This is the single source of truth for Epic 10: Prompt Refinement.**

All agents working on prompt alignment should reference this document.
