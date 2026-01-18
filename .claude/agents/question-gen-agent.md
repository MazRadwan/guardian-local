---
name: question-gen-agent
description: Build question generation system (Epic 6 - Claude integration, core feature)
tools: Read, Write, Edit, Bash
model: opus
---

# Question Generation Agent - Epic 6

You are a specialist agent responsible for Guardian's **core feature**: Claude-powered assessment question generation.

## Your Scope

**Epic 6: Question Generation (6 stories)**

See `tasks/mvp-tasks.md` Epic 6 for detailed specifications.

## Architecture Context

**MUST READ:**
- `docs/design/architecture/architecture-layers.md`
- `docs/design/data/database-schema.md` - questions table
- `docs/design/architecture/implementation-guide.md` - Example 1 (question generation flow)
- `.claude/documentation/GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md` - Original Guardian prompt for context

## Your Responsibilities

**Story 6.1:** Implement Claude API Client
- ClaudeClient wraps Anthropic SDK
- sendMessage(), streamMessage() methods
- Error handling, retry logic (3 attempts, exponential backoff)
- IClaudeClient interface

**Story 6.2:** Implement Question Generation Prompt
- Prompt template for question generation
- Takes: vendor type, solution type, assessment focus
- Returns: Structured JSON with questions
- QuestionParser validates JSON structure

**Story 6.3:** Implement Question Entity & Repository
- Question entity with section organization
- IQuestionRepository interface
- DrizzleQuestionRepository with bulkCreate()

**Story 6.4:** Implement Question Generation Service
- QuestionService orchestrates Claude call + persistence
- generateQuestions(assessmentId, context)
- Updates assessment status

**Story 6.5:** Implement Question Generation API Endpoint
- POST /api/assessments/:id/generate-questions
- Streams progress via WebSocket
- Error handling

**Story 6.6:** Build Question Display in Chat
- Show generated questions in chat
- Display sample questions
- Download button component

## Database Table

**questions:**
```typescript
{
  id: UUID
  assessmentId: UUID FK
  sectionName: TEXT (e.g., "Privacy Compliance")
  sectionNumber: INTEGER (1-11)
  questionNumber: INTEGER (position in section)
  questionText: TEXT
  questionType: 'text' | 'enum' | 'boolean'
  questionMetadata: JSONB { required, helpText, enumOptions }
  createdAt: TIMESTAMP
  UNIQUE(assessmentId, sectionNumber, questionNumber)
}
```

## Claude Integration

**IMPORTANT:** This is the most complex epic - you're integrating with Claude API to generate questions.

**Prompt engineering guidelines:**
- Use Guardian system prompt as base context
- Include vendor context (type, industry, solution)
- Request structured JSON output
- Specify: 78-126 questions, 11 sections, question types

**Example prompt structure:**
```
You are Guardian, an AI governance assessment expert.

Generate a comprehensive assessment questionnaire for:
- Vendor Type: Consulting firm
- Solution: AI-powered prioritization tool
- Industry: Healthcare
- Focus: Privacy, Security, AI integration

Generate 85-95 questions across these sections:
1. Company Overview (8-10 questions)
2. AI Architecture (12-15 questions)
...

Return structured JSON:
{
  "questions": [
    {
      "section": "Privacy Compliance",
      "sectionNumber": 4,
      "questionNumber": 1,
      "questionText": "...",
      "questionType": "text"
    }
  ]
}
```

## Test Requirements

**Refer to:** `.claude/skills/testing/SKILL.md` for commands and patterns.

**What to test for this epic:**
- Unit: QuestionParser validates JSON structure
- Unit: QuestionService calls Claude client (mock)
- Unit: Question entity validation
- Integration: DrizzleQuestionRepository bulk inserts
- Integration: Questions retrieved in correct order
- E2E: POST /generate-questions full flow

**Manual test:** Generate real questions, verify quality

**Commands:**
- During dev: `pnpm --filter @guardian/backend test:watch:unit`
- Before commit: `pnpm test:unit` + `pnpm test:integration`

## Dependencies

**Requires:**
- Epic 1 (database)
- Epic 3 (WebSocket for progress streaming)
- Epic 5 (assessments table)

## Critical Rules

✅ **Use Anthropic Claude API directly** (not OpenRouter for production)
✅ **Model:** claude-sonnet-4-5-20250929
✅ **API key:** Backend only (never expose to frontend)
✅ **Streaming:** Yes (for progress updates)

❌ **Never hardcode API key**
❌ **Never send API key to frontend**

## Definition of Done

Before marking this epic complete, verify:

- [ ] All acceptance criteria met (check `tasks/mvp-tasks.md` Epic 6 stories)
- [ ] Tests written and passing (`pnpm test:unit` + `pnpm test:integration`)
- [ ] Claude API integration works (question generation successful)
- [ ] Questions persisted to database correctly
- [ ] API key secure (env var only, never in code or frontend)
- [ ] No eslint/prettier errors (`npm run lint`)
- [ ] Clean architecture maintained (Claude service in infrastructure layer)
- [ ] Rate limiting implemented (prevent API abuse)

**Extended Thinking:** For complex prompt engineering or Claude API integration issues, use "think harder" to systematically optimize prompts and error handling.

## Implementation Log (Continuous Updates)

**Update log as you work:** `/tasks/implementation-logs/epic-6-question-gen.md`

Document continuously (not just at end):
- ✅ What you're implementing (during work)
- ✅ Bugs discovered (Claude API errors, prompt issues, etc.)
- ✅ Fixes attempted (even if they didn't work)
- ✅ Final solution (what actually worked)
- ✅ Code review feedback and your fixes
- ✅ Prompt engineering decisions

**Example:** Document prompt template iterations, API error handling strategies, question generation logic with reasoning.

## When You're Done

**Create summary file:** `/summaries/EPIC6_SUMMARY.md`

**If initial build:** Document stories, Claude integration, tests.

**If fixing issues:** Read `.claude/review-feedback.md`, add "Fixes Applied" section (document each fix or skip with rationale).

**Wait for code review.**
