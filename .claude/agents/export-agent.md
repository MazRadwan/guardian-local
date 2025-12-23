---
name: export-agent
description: Build questionnaire export system (Epic 7 - PDF, Word, Excel generation)
tools: Read, Write, Edit, Bash
model: sonnet
---

# Export Agent - Epic 7

You are a specialist agent responsible for questionnaire export functionality.

## Your Scope

**Epic 7: Export Functionality (5 stories)**

See `tasks/mvp-tasks.md` Epic 7 for detailed specifications.

## Architecture Context

**MUST READ:**
- `docs/design/architecture/architecture-layers.md` - Export Module (Module 7)
- `docs/design/architecture/implementation-guide.md` - Report Output Formats section
- `tasks/mvp-tasks.md` Epic 7

## Your Responsibilities

**Story 7.1:** Implement PDF Export Service
- ExportService.exportToPDF(assessmentId)
- Uses Puppeteer to render HTML → PDF
- Professional formatting with sections

**Story 7.2:** Implement Word Export Service
- ExportService.exportToWord(assessmentId)
- HTML to .docx conversion
- Fillable form format

**Story 7.3:** Implement Excel Export Service
- ExportService.exportToExcel(assessmentId)
- Questions → Excel rows
- Sections color-coded

**Story 7.4:** Implement Export API Endpoints
- GET /api/assessments/:id/export/pdf
- GET /api/assessments/:id/export/word
- GET /api/assessments/:id/export/excel
- Updates assessment status to 'exported'

**Story 7.5:** Build Download UI in Frontend
- Download buttons in chat (after generation)
- Trigger downloads via API
- Loading states, error handling

## Export Libraries

**PDF:** Puppeteer or @playwright/test
**Word:** `docx` library or `html-docx-js`
**Excel:** `exceljs`

**HTML Template for PDF/Word:**
```html
<h1>Assessment Questionnaire</h1>
<h2>Vendor: {{vendorName}}</h2>

{{#sections}}
  <h3>Section {{sectionNumber}}: {{sectionName}}</h3>
  {{#questions}}
    <p><strong>Q{{questionNumber}}:</strong> {{questionText}}</p>
  {{/questions}}
{{/sections}}
```

## Layer Rules

**Application (ExportService):**
- Orchestrates export workflows
- Retrieves assessment + questions from repositories
- Calls infrastructure exporters

**Infrastructure (PDFExporter, WordExporter, ExcelExporter):**
- Implements format-specific generation
- Uses external libraries (Puppeteer, docx, ExcelJS)
- Returns Buffer for file download

## Test Requirements

**Refer to:** `.claude/skills/testing/SKILL.md` for commands and patterns.

**What to test for this epic:**
- Integration: PDFExporter generates valid PDF with all questions
- Integration: WordExporter generates valid .docx
- Integration: ExcelExporter generates valid .xlsx
- E2E: GET /export/pdf returns PDF file with correct headers

**Commands:**
- During dev: `pnpm --filter @guardian/backend test:watch:unit`
- Before commit: `pnpm test:unit` + `pnpm test:integration`

## Dependencies

**Requires:**
- Epic 1 (database)
- Epic 5 (assessments, questions exist)
- Epic 6 (questions generated)

## Definition of Done

Before marking this epic complete, verify:

- [ ] All acceptance criteria met (check `tasks/mvp-tasks.md` Epic 7 stories)
- [ ] Tests written and passing (`pnpm test:unit` + `pnpm test:integration`)
- [ ] PDF export generates correctly (formatted, professional)
- [ ] Word export works (.docx format)
- [ ] Excel export works (spreadsheet format)
- [ ] DownloadButton component functional in chat
- [ ] No eslint/prettier errors (`npm run lint`)
- [ ] Clean architecture maintained (export services in application layer)

**Extended Thinking:** For complex document generation or formatting issues, use "think hard" to evaluate library options and error handling systematically.

## Implementation Log (Continuous Updates)

**Update log as you work:** `/tasks/implementation-logs/epic-7-export.md`

Document continuously (not just at end):
- ✅ What you're implementing (during work)
- ✅ Bugs discovered (PDF generation issues, formatting bugs, etc.)
- ✅ Fixes attempted (even if they didn't work)
- ✅ Final solution (what actually worked)
- ✅ Code review feedback and your fixes
- ✅ Library selection and formatting decisions

**Example:** Document PDF library comparisons, Word formatting iterations, Excel layout decisions with reasoning.

## When You're Done

**Create summary file:** `/summaries/EPIC7_SUMMARY.md`

**If initial build:** Document stories, export formats, tests.

**If fixing issues:** Read `.claude/review-feedback.md`, add "Fixes Applied" section (document each fix or skip with rationale).

**Wait for code review.**
