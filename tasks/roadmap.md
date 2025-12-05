# Guardian Feature Roadmap

**Version:** 1.0
**Last Updated:** 2025-01-04
**Status:** Active Planning

---

## Purpose

This roadmap defines **what we're building and when**. Features are organized by phase to support iterative development and validation.

**Related Documents:**
- **Current Tasks:** `tasks/task-overview.md` - Execution-level tasks
- **Architecture:** `docs/design/architecture/` - How we're building it
- **Database:** `docs/design/data/database-schema.md` - Data model by phase

---

## MVP (Phase 1) - Chat + Questionnaire Generation

**Goal:** Validate core value proposition - conversational AI expert that generates professional assessment questionnaires.

### Features

**Chat Foundation:**
- ✅ User authentication (email/password, JWT tokens)
- ✅ Mode switcher dropdown (Consult Mode / Assessment Mode)
- ✅ Conversational chat interface (WebSocket streaming)
- ✅ Message history (save, resume conversations)
- ✅ Chat context persistence (resume where you left off)

**Assessment Questionnaire Generation:**
- ✅ Conversational intake (Guardian asks clarifying questions)
- ✅ Dynamic question generation (Claude generates 78-126 questions based on vendor context)
- ✅ Section organization (11 sections: Clinical, Privacy, Security, etc.)
- ✅ Question persistence (save generated questions to database)
- ✅ Vendor tracking (create/update vendor profiles)
- ✅ Assessment history (track multiple assessments per vendor over time)

**Export & Delivery:**
- ✅ Export questionnaire to PDF (formatted, professional)
- ✅ Export questionnaire to Word (.docx for offline editing)
- ✅ Export questionnaire to Excel (spreadsheet format)
- ✅ Download button in chat (embedded component)

**User Management:**
- ✅ User registration (admin creates users)
- ✅ Role-based access (admin, analyst, viewer)
- ✅ Basic authorization (who can create assessments)

### Database (6 Tables)

- `users` - Authentication and roles
- `vendors` - Company profiles
- `assessments` - Assessment metadata
- `questions` - Generated questions
- `conversations` - Chat sessions
- `messages` - Chat history

### Tech Stack

- Frontend: Next.js 16 + React 19 + Tailwind v4 + Shadcn/ui
- Backend: Node.js 22 + Express 5 + Socket.IO
- Database: PostgreSQL 17 + Drizzle ORM
- AI: Anthropic Claude API (Sonnet 4.5)

### Success Criteria

- [ ] User can chat with Guardian in Consult mode (ask general questions)
- [ ] User can switch to Assessment mode via dropdown
- [ ] Guardian asks clarifying questions and generates customized questionnaire
- [ ] User can export questionnaire in 3 formats (PDF, Word, Excel)
- [ ] Vendor profiles persisted (track assessment history)
- [ ] Chat history saved (can resume conversation later)
- [ ] Multi-user support (10 concurrent users)
- [ ] Response time: < 2 seconds to first token (streaming)

### Effort Estimate

**Size:** Medium (4-6 weeks with multi-agent development)

**Why:** Chat interface + Claude integration + Export generation are non-trivial, but well-scoped.

---

## Phase 2 - Analysis & Reports

**Goal:** Enable complete assessment workflow - from questionnaire to risk analysis to professional reports.

**Dependency:** MVP must be validated (users find questionnaire generation valuable).

### Deferred from MVP (Epic 8)

**Production Readiness:**
- ⏸️ PHI/PII log redaction (ensure logs never include message text or sensitive data)
- ⏸️ Claude config externalization (model, maxTokens, temperature to environment variables)

**Vendor Management:**
- ⏸️ Vendor Directory View (Story 8.5 - requires UX decisions)
  - `/vendors` page with list and search
  - Vendor cards showing assessment count
  - Click to view vendor assessment history

**UI/UX Enhancements (Epic 9):**
- ⏸️ Conversation browsing UI (Story 8.4 - ConversationList component)
- ⏸️ Multi-conversation selection and resume
- ⏸️ Progress indicators for question generation
- ⏸️ Export progress spinners

**Rationale for Deferral:**
- Not blocking core MVP functionality
- Vendor directory needs product decisions about workflow
- UI enhancements better suited after user feedback
- Production readiness items can be addressed during Phase 2 prep

### Features

**Response Input (Method TBD During MVP):**
- ⏸️ Option A: Conversational Q&A (one-at-a-time in chat)
- ⏸️ Option B: Web form (all questions visible, batch entry)
- ⏸️ Option C: Document upload + parsing (OCR handwritten notes or typed Word doc)
- ⏸️ Option D: Hybrid (user chooses method)
 
**AI Tool Use & Research:**
- ⏸️ Web search integration (Brave Search API or similar)
- ⏸️ Real-time vendor documentation lookup
- ⏸️ Current compliance law research (PIPEDA, ATIPP updates)
- ⏸️ Industry standard verification (NIST CSF, ITIL4 latest versions)
- ⏸️ Tool result streaming (show search results in chat)

**Risk Analysis:**
- ⏸️ Claude interpretation (analyze responses against rubrics)
- ⏸️ Risk factor extraction (identify specific gaps/concerns)
- ⏸️ 10-dimension scoring (Clinical, Privacy, Security, Technical, Vendor Capability, AI Transparency, Ethical, Regulatory, Operational, Sustainability)
- ⏸️ Composite score calculation (weighted by solution type)
- ⏸️ Compliance evaluation (PIPEDA, ATIPP, NIST CSF, ITIL4)

**Report Generation:**
- ⏸️ Interactive web report view (charts, expandable sections)
- ⏸️ Executive summary (Claude-generated, cached)
- ⏸️ Risk dashboard (10 dimensions with scores/severity)
- ⏸️ Critical findings (Claude narrative with evidence)
- ⏸️ Compliance assessment (PIPEDA/ATIPP/NIST analysis)
- ⏸️ Gap analysis (what's missing, what's concerning)
- ⏸️ Recommendations (Approve/Conditional/Decline with rationale)
- ⏸️ Vendor feedback package (professional, constructive)

**Export & Delivery:**
- ⏸️ Multi-format export (PDF, Word, Excel, JSON)
- ⏸️ YAML export (backward compatibility with Claude.ai)
- ⏸️ Email delivery (Leadership: internal report, Vendor: feedback package)
- ⏸️ Custom templates (organizational branding)

**Caching:**
- ⏸️ Redis integration (cache report sections, analysis results)
- ⏸️ Cache invalidation (when assessment updated)
- ⏸️ Cache warming (pre-generate executive summaries)

### Database (Add 3 Tables)

- `responses` - Vendor answers to questions
- `risk_scores` - Calculated scores (10 dimensions)
- `reports` - Generated reports (cached)

### Success Criteria

- [ ] User can input responses (via chosen method)
- [ ] Analysis completes in < 60 seconds (10 parallel Claude API calls)
- [ ] Reports match Claude.ai Project quality
- [ ] Multiple export formats work correctly
- [ ] Email delivery functional (internal + vendor)
- [ ] Caching reduces API costs by 60-70%
- [ ] Can import YAML from Claude.ai Projects (backward compat)

### Effort Estimate

**Size:** Large (6-8 weeks)

**Why:** Analysis orchestration + Report generation + Multiple export formats + Caching = significant complexity.

---

## Phase 3 - Portfolio & Collaboration

**Goal:** Enable organizations to manage vendor portfolio at scale with team collaboration.

**Dependency:** Phase 2 complete (full assessment workflow works).

### Features

**Portfolio Analytics:**
- ⏸️ Portfolio dashboard (all vendors, risk overview)
- ⏸️ Vendor comparison (side-by-side, multiple vendors)
- ⏸️ Trend analysis (risk scores over time)
- ⏸️ Industry benchmarking (compare vendor to industry avg)
- ⏸️ Renewal tracking (alerts for assessments > 12 months old)
- ⏸️ Risk heat map (visualize portfolio risk landscape)

**Natural Language Queries:**
- ⏸️ Portfolio mode (3rd mode in dropdown)
- ⏸️ Query interface ("Show all vendors with critical privacy risks")
- ⏸️ SQL generation from natural language
- ⏸️ Chart rendering from query results

**Multi-User Collaboration:**
- ⏸️ Assessment review workflow (peer review before finalize)
- ⏸️ Comments and annotations (collaborative feedback)
- ⏸️ Approval workflows (reviewer must approve high-risk assessments)
- ⏸️ Role expansion (add "reviewer" role with specific permissions)

**Audit & Governance:**
- ⏸️ Comprehensive audit log (who did what, when)
- ⏸️ Compliance export (all actions in date range)
- ⏸️ User activity tracking
- ⏸️ Assessment change history

### Database (Add 1 Table, Extend Existing)

- `audit_log` - Immutable action trail
- Extend `users` with soft delete (deactivatedAt)
- Extend `assessments` with approval workflow fields

### Success Criteria

- [ ] Portfolio dashboard loads in < 2 seconds (with caching)
- [ ] Can compare 3 vendors side-by-side
- [ ] Natural language portfolio queries work
- [ ] Renewal alerts trigger automatically
- [ ] Multi-user review workflow functional
- [ ] Complete audit trail for governance
- [ ] Supports 200+ assessments without performance issues

### Effort Estimate

**Size:** Large (8-10 weeks)

**Why:** Portfolio analytics (complex SQL), collaboration features (workflow state machines), audit trail (comprehensive logging).

---

## Phase 4 - Advanced Features (Future)

**Goal:** Power features for mature adoption. Build based on user feedback from Phases 1-3.

**Dependency:** Phase 3 complete, user feedback collected.

### Potential Features

**Smart Input Methods:**
- ⏸️ Document upload + OCR (handwritten notes → parsed responses)
- ⏸️ Voice-to-text (speak answers, transcribed)
- ⏸️ "Copy from previous assessment" (renewal optimization)
- ⏸️ Bulk import (upload multiple assessments)

**Integrations:**
- ⏸️ Procurement system integration (Coupa, SAP Ariba)
- ⏸️ API for external systems
- ⏸️ Webhook notifications
- ⏸️ SSO (SAML, OAuth)

**Advanced AI:**
- ⏸️ Custom compliance frameworks (beyond PIPEDA/ATIPP/NIST)
- ⏸️ ML-powered risk prediction (based on historical data)
- ⏸️ Automated vendor outreach
- ⏸️ Multi-language support

**Vendor Portal:**
- ⏸️ Vendor self-service (vendors fill assessments themselves)
- ⏸️ Vendor dashboard (track assessment status)
- ⏸️ Remediation tracking (vendor can update on progress)

### Database

TBD based on features selected.

### Effort Estimate

**Size:** Variable (depends on features chosen)

---

## Decision Gates

**Between Each Phase:**

### Gate 1: MVP → Phase 2
**Decision:** Do users find questionnaire generation valuable?
- ✅ If yes: Proceed to Phase 2 (add analysis features)
- ❌ If no: Pivot or cancel

**Validation:**
- User feedback (5-10 analysts test MVP)
- Usage metrics (questionnaires generated, export rate)
- Value assessment (time saved vs manual process)

### Gate 2: Phase 2 → Phase 3
**Decision:** Do users complete full assessments and find analysis helpful?
- ✅ If yes: Proceed to Phase 3 (portfolio features)
- ❌ If no: Refine Phase 2 features

**Validation:**
- 20+ completed assessments
- Report quality matches expectations
- Analysis accuracy validated

### Gate 3: Phase 3 → Phase 4
**Decision:** What advanced features do users actually want?
**Validation:**
- User interviews (what pain points remain?)
- Feature requests (what would make this indispensable?)
- Market research (what do competitors offer?)

---

## Feature Dependency Map

```
MVP (Phase 1)
  ├── Chat foundation
  │   ├── Auth
  │   ├── Conversations
  │   └── Messages
  └── Questionnaire generation
      ├── Vendor tracking
      ├── Assessment metadata
      ├── Questions (Claude)
      └── Export (PDF/Word/Excel)

↓ (Requires MVP)

Phase 2
  ├── Response input ← (METHOD TBD)
  ├── Analysis
  │   ├── Claude interpretation
  │   ├── Risk scoring (depends on responses)
  │   └── Compliance eval
  └── Reports (depends on analysis)
      ├── Web view
      ├── Export formats
      └── Email delivery

↓ (Requires Phase 2)

Phase 3
  ├── Portfolio analytics (depends on multiple assessments)
  ├── Collaboration (depends on Phase 2 workflow)
  └── Audit trail (comprehensive logging)

↓ (Requires Phase 3)

Phase 4
  └── Advanced features (depends on user feedback)
```

**Critical Path:** Can't skip phases. Each builds on previous.

---

## Risks & Mitigation

### Risk 1: MVP Takes Too Long
**Mitigation:** Cut scope further - remove export formats (just PDF), simplify auth (no roles)

### Risk 2: Response Input Method Unclear
**Mitigation:** Build multiple prototypes in Phase 2, user test, choose best

### Risk 3: Claude API Costs Higher Than Expected
**Mitigation:** Aggressive caching, optimize prompts, consider Claude Haiku for simple tasks

### Risk 4: Portfolio Analytics Performance Issues at Scale
**Mitigation:** Database indexes, read replicas, caching strategy, query optimization

---

## Current Phase

**We are in:** MVP (Phase 1) Planning
**Next step:** Break MVP features into agent tasks
**Estimated start:** After task breakdown complete

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-04 | Initial roadmap - 4 phases defined (MVP: Chat + Questionnaire, Phase 2: Analysis + Reports, Phase 3: Portfolio + Collaboration, Phase 4: Advanced features). Includes success criteria, effort estimates, decision gates, dependency map. |

---

**This roadmap is the FEATURE PLAN for Guardian.** All documentation should align with these phases.

**For current execution, see:** `task-overview.md`
**For architecture details, see:** `docs/design/architecture/`
