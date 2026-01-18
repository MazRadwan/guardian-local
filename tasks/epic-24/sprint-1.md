# Epic 24 Sprint 1: Chat UX Refinements

## Overview

Polish chat interactions including regenerate functionality, scoring progress indicators, and mode switching animations. Focus on making AI interactions feel more responsive and informative.

## Sprint Duration
- Start: Sprint 1
- Stories: 5
- Estimated Points: 13

## Stories

| Story | Title | Agent | Points | Dependencies |
|-------|-------|-------|--------|--------------|
| 24.1 | Regenerate with Retry Context | backend-agent | 5 | None |
| 24.2 | Scoring Progress Message Reliability | frontend-agent | 2 | None |
| 24.3 | "This Will Take a Minute" Animation | frontend-agent | 2 | Story 24.2 |
| 24.4 | Update Scoring Progress Text | backend-agent | 1 | None |
| 24.5 | Stream Mode Switch Preambles | backend-agent | 3 | None |

## Parallelization Strategy

**Parallel Track A (backend-agent):**
- Story 24.1: Regenerate with Retry Context
- Story 24.4: Update Scoring Progress Text
- Story 24.5: Stream Mode Switch Preambles

**Parallel Track B (frontend-agent):**
- Story 24.2: Scoring Progress Message Reliability
- Story 24.3: "This Will Take a Minute" Animation (after 24.2)

## Success Criteria (QA Required)

Each story MUST pass browser QA before code-reviewer approval:

1. **24.1:** Open browser -> Send message -> Get response -> Click regenerate -> Response MUST differ
2. **24.2:** Open browser -> Upload questionnaire -> ALL 8 progress messages MUST display in sequence
3. **24.3:** Open browser -> Trigger scoring -> Wait 10s -> "This may take a minute..." MUST appear with animation
4. **24.4:** Open browser -> Trigger scoring -> Text MUST say "Analyzing scoring..." (not "against rubric")
5. **24.5:** Open browser -> Switch mode -> Guidance message MUST stream in (not pop)

**Agents must use Playwright MCP to take screenshots verifying each criterion.**

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Unit tests passing
- [ ] Integration tests passing (if applicable)
- [ ] Browser QA screenshots captured via Playwright MCP
- [ ] Code-reviewer approved
- [ ] No regressions in existing functionality

## References

- Goals document: `/tasks/epic-24/epic-24-goals.md`
- Branch: `epic-24/chat-ux-refinements`
