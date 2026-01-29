# Guardian App - Project Overview

**Version:** 1.2
**Last Updated:** 2026-01-29
**Status:** Production MVP

---

## What is Guardian App?

Guardian is a conversational AI assistant for healthcare organizations to conduct comprehensive AI governance assessments of vendor solutions. It transforms a sophisticated Claude.ai Project system prompt into a production-ready, database-backed application that enables security and privacy analysts to interact naturally with an AI expert while maintaining structured assessment workflows, generating professional reports, and tracking vendor portfolios over time.

Originally created as a 16,000-token system prompt for Newfoundland & Labrador Health Services (NLHS), Guardian provides expert-level risk analysis covering clinical safety, privacy compliance (PIPEDA, ATIPP), security architecture, vendor capability, AI transparency, ethical considerations, regulatory compliance, operational excellence, and sustainability. The standalone app combines the flexibility of conversational AI with the persistence and structure needed for production governance workflows.

---

## The Problem We're Solving

Healthcare organizations increasingly adopt AI-powered solutions, but lack standardized frameworks to assess vendor compliance with Canadian privacy legislation (PIPEDA, ATIPP), security best practices (NIST CSF), and healthcare-specific risk factors. Manual assessment processes are:

- **Inconsistent:** Different analysts apply different criteria
- **Time-consuming:** 90-minute vendor interviews with manual documentation
- **Not persistent:** Assessments lost after completion, no vendor history tracking
- **Not scalable:** Each assessment starts from scratch, no portfolio insights
- **Expertise-dependent:** Requires senior analysts with deep compliance knowledge

Guardian provides a structured, evidence-based methodology that junior analysts can use while maintaining the rigor of expert assessment. It ensures consistent evaluation, captures institutional knowledge, and enables data-driven AI governance decisions.

---

## Why Not Just Use the Claude.ai Project Version?

The Guardian system prompt works well in Claude.ai Projects for **one-off assessments**, but has critical limitations for production use:

### Limitations of Claude.ai Project Implementation

**1. No Persistence Across Sessions**
- Cannot store vendor history or track assessments over time
- Commands like `!vendor_history`, `!analyze_portfolio`, `!compare_vendors` don't actually work
- Each session starts fresh with no memory of previous assessments
- Analysts must manually save YAML files and re-upload for future reference

**2. Context Window Exhaustion**
- The 111-question assessment consumes significant context (even with 1M window)
- During testing, Guardian started batching questions 6-10 together after being thorough with 1-5
- 90-minute conversational interviews degrade quality as context fills
- System prompt (16K tokens) + tools (36K tokens) + conversation leaves limited room for analysis

**3. Single-User, Single-Session Workflow**
- No multi-user collaboration or role-based access
- No approval workflows or review processes
- Cannot track who conducted assessment or when
- No audit trail for governance purposes

**4. Manual, Conversational Data Entry**
- Analysts must conduct interview, fill YAML manually, then paste into chat
- No structured form validation or guided workflow
- Prone to incomplete responses or formatting errors
- No real-time progress saving

**5. No Portfolio Analytics or Trend Analysis**
- Cannot aggregate data across multiple assessments
- No insights into common vendor gaps or improvement trends
- No comparison of vendors across dimensions
- No renewal tracking or risk monitoring over time

**6. Cost and Scalability**
- Subscription model regardless of usage volume
- Not cost-effective for organizations with sporadic assessment needs
- Cannot integrate into existing procurement workflows
- No API access for automation

### What the Standalone App Enables

**Persistence & History**
- Database stores all assessments, vendor profiles, and reports permanently
- True vendor history tracking with timeline of assessments
- Portfolio analytics showing risk trends across all vendors
- Assessment comparison tools (side-by-side, diff views)

**Conversational Data Collection with Structure**
- Chat-based interface with embedded forms and guided workflows
- No context window concerns - data stored in database, not conversation history
- Real-time saving prevents data loss
- Natural language interaction with GUI affordances (no command syntax required)
- Dynamic question generation tailored to vendor type and assessment context

**Multi-User Collaboration**
- Role-based access control (Admin, Analyst, Reviewer, Read-Only)
- Approval workflows for assessment review before finalization
- Audit trail of who assessed, reviewed, and approved
- Team collaboration on complex assessments

**Scalable Architecture**
- Pay-per-assessment API model (Anthropic Claude API)
- Deterministic scoring algorithms (no AI needed for calculations)
- Modular report generation (only generate sections viewed)
- Cost-effective at scale ($0.25-0.40 per assessment vs subscription)

**Integration & Automation**
- API-first design enables integration with procurement systems
- Automated renewal reminders based on assessment age
- Exportable data (CSV, JSON, PDF reports)
- Webhook notifications for governance workflows

---

## Core Features

### Conversational Interface & Modes
- **Consult Mode:** Free-form conversation with Guardian as AI governance expert (answer questions, explain concepts, provide guidance)
- **Assessment Mode:** Structured vendor evaluation with dynamically generated questionnaires tailored to vendor type and context
- **Portfolio Mode:** Natural language queries for portfolio analytics ("Show me all vendors with privacy risks over 70")
- **GUI Mode Switcher:** Dropdown to switch between modes (no command syntax needed)
- **Smart Action Detection:** Backend interprets user intent and provides appropriate UI (forms, file uploads, visualizations)

### Assessment Management
- **Dynamic Question Generation:** Guardian creates customized assessment questions based on vendor type, industry, and assessment focus
- **Conversational Q&A:** Chat-based question flow (one question at a time) with ability to ask clarifications mid-assessment
- **Progress Tracking:** Save and resume assessments over multiple sessions with chat history preserved
- **Assessment Types:** Quick (targeted), Comprehensive (full scope), Renewal (follow-up)
- **Flexible Scope:** Analysts can request Guardian add/remove question sections based on relevance
- **Document Upload:** PDF and Word documents for intake parsing and scoring

### Risk Analysis (10 Dimensions)
- **Clinical Risk:** Patient safety, care quality, clinical decision support
- **Privacy Risk:** PIPEDA, ATIPP, personal information handling
- **Security Risk:** Architecture, encryption, vulnerability management
- **Technical Credibility:** Stack quality, development practices, testing
- **Vendor Capability:** Financial stability, experience, certifications
- **AI Transparency:** Explainability, bias testing, human oversight
- **Ethical Considerations:** Fairness, accountability, governance
- **Regulatory Compliance:** Healthcare standards, audit readiness
- **Operational Excellence:** ITIL maturity, support model, SLAs
- **Sustainability:** Maintainability, cost, knowledge transfer

Each dimension scored 0-100 with severity rating (Low, Adequate, Concern, High Risk, Critical).

### Report Generation
- **Interactive Web Reports:** Primary display as rich web view with risk dashboards, expandable sections, charts, and real-time streaming from Claude
- **Internal Decision Report:** Comprehensive analysis for leadership (executive summary, risk dashboard, critical findings, gap analysis, compliance assessment, recommendation)
- **Vendor Feedback Package:** Professional external communication (strengths acknowledged, required remediations, actionable guidance)
- **Modular Sections:** Generate full report or individual sections on-demand (streaming, cached for 24 hours)
- **Multi-Format Export:** PDF (professional sharing), Word (editable), Excel (data analysis)
- **Email Delivery:** Direct email to leadership or vendors with PDF attachments and professional messaging
- **Customizable Templates:** Adapt reports to organizational branding

### Vendor Portfolio Management
- **Vendor Profiles:** Centralized vendor information, contact history, assessment timeline
- **Assessment History:** All past assessments for each vendor with comparison tools
- **Portfolio Dashboard:** Aggregate risk view across all vendors
- **Trend Analysis:** Risk score changes over time, common gap patterns
- **Renewal Tracking:** Alerts for assessments older than 12 months

### Compliance Frameworks
- **PIPEDA (Federal):** 10 Fair Information Principles assessment
- **ATIPP (NL Provincial):** Public body obligations, PIA requirements
- **NIST Cybersecurity Framework:** Tier assessment (1-4)
- **ITIL4 Service Management:** Maturity level assessment (1-5)
- **Custom Frameworks:** Extensible for additional compliance requirements

### Collaboration & Workflow
- **Role-Based Access:** Admin, Analyst, Reviewer, Read-Only Viewer
- **Approval Workflows:** Multi-stage review before finalizing assessments
- **Comments & Notes:** Collaborative annotation of findings
- **Activity Audit Trail:** Who did what, when, and why
- **Notifications:** Email alerts for pending reviews, renewals

---

## Target Users

### Primary: Security & Privacy Analysts
**Profile:** Professionals at healthcare organizations responsible for AI governance, vendor assessments, and compliance validation.

**Needs:**
- Structured assessment methodology (consistent, evidence-based)
- Expert guidance embedded in tool (reduces dependency on senior staff)
- Portfolio visibility (track vendors over time, identify trends)
- Professional reports (ready for leadership review)
- Audit trail (demonstrate due diligence)

**Skill Level:** Ranges from junior analysts (need guidance) to senior experts (want efficiency). Tool should support both.

### Secondary: Leadership & Governance
**Profile:** CIOs, CISOs, Privacy Officers, Clinical Governance Committees

**Needs:**
- Executive dashboards (high-level risk visibility)
- Portfolio analytics (aggregate view of AI vendor landscape)
- Decision support (clear recommendations with rationale)
- Compliance assurance (evidence of PIPEDA/ATIPP compliance)

**Interaction:** Read-only dashboards, receive reports, approve high-risk vendors.

### Tertiary: Vendors (External)
**Profile:** AI vendors undergoing assessment by healthcare organizations

**Needs:**
- Transparent assessment process (know what's being evaluated)
- Constructive feedback (actionable remediation guidance)
- Professional communication (partnership-oriented, not adversarial)

**Interaction:** Receive Vendor Feedback Package, optional read-only portal to track assessment status.

---

## Proposed Tech Stack

### Frontend
- **Framework:** Next.js 16 with App Router (UI presentation only, no backend logic)
- **React:** React 19.2 with Server Components
- **Bundler:** Turbopack (stable, 2-5x faster builds)
- **Chat UI:** Custom chat interface with streaming support, message history, embedded components
- **State Management:** React Context + Zustand (chat state, mode switching, conversation history)
- **UI Components:** Tailwind CSS v4.0 + Shadcn/ui (fully compatible, accessible, chat-optimized)
- **Message Rendering:** Markdown support with code highlighting, embedded forms, action buttons
- **Data Visualization:** Recharts or Chart.js (risk dashboards embedded in chat responses)
- **MCP:** Next.js devtools MCP server (built-in support for AI-assisted development)

### Backend (Separate from Frontend)
- **Runtime:** Node.js v22 LTS with TypeScript 5.6+
- **Framework:** Express.js v5.1.0 (dedicated backend service, NOT Next.js API routes)
- **API Pattern:** WebSocket (Socket.IO v4.8.1) for streaming chat + REST for CRUD operations
- **Authentication:** Passport.js with JWT tokens
- **AI Integration:** Anthropic Claude API (Sonnet 4.5 via @anthropic-ai/sdk)
- **Architecture:** Lightweight Clean Architecture (4 layers: Presentation, Application, Domain, Infrastructure)

### Database
- **Primary:** PostgreSQL 17.x (relational data, improved JSONB performance for chat messages)
- **ORM:** Drizzle ORM (SQL-first, lightweight ~30KB, no generation step, direct SQL control)
- **Migrations:** Drizzle Kit (migration management)
- **Caching:** Redis (optional, for session storage, conversation context, and computed results)
- **Search:** PostgreSQL full-text search for chat history and assessments (MVP), Elasticsearch (future if needed)

### DevOps & Hosting
- **Version Control:** Git + GitHub
- **CI/CD:** GitHub Actions (test, lint, build, deploy)
- **Hosting (MVP/Demo):** Vercel (frontend) + Railway/Render (backend + database)
- **Hosting (Production Future):** AWS (EC2, RDS, S3, CloudFront) or Azure
- **Monitoring:** Sentry (errors), Plausible/Posthog (analytics)

### AI & Scoring
- **LLM API:** Anthropic Claude API (Sonnet 4.5 20250929)
- **Conversation Management:** Claude for natural language interaction, intent detection, question generation
- **Scoring Logic:** Hybrid - TypeScript for deterministic calculations, Claude for nuanced interpretation
- **Compliance Data:** PostgreSQL (PIPEDA/ATIPP/NIST frameworks stored as data, retrieved as needed in conversation)
- **Report Generation:** Claude API (narrative, interpretation, recommendations, vendor feedback)

---

## Architecture Approach

### Conversational Interface with Structured Workflows

**Core Architecture: Chat-First with Embedded Components**

The application is built around a conversational interface where Guardian (powered by Claude) interacts naturally with users while seamlessly integrating structured workflows when needed.

**1. Conversational Layer (Claude API)**
- Natural language interaction for all user requests
- Intent detection (consult question vs assessment request vs portfolio query)
- Dynamic question generation based on context
- Contextual help and guidance throughout workflows
- Streaming responses for real-time feel

**2. Data Management Layer (Database + Cache)**
- Conversation history stored in PostgreSQL (resume sessions, audit trail)
- Assessment data stored separately from chat (structured, queryable)
- Redis cache for conversation context and frequently accessed data
- Real-time auto-save of assessment progress

**3. Analysis Engine (Hybrid: Deterministic + AI)**
- **Deterministic:** Risk score calculations using TypeScript algorithms
- **AI:** Claude interprets complex responses, generates narratives, provides recommendations
- **Compliance:** Rule-based checks enhanced by Claude's understanding of frameworks
- **Report Generation:** Claude composes professional prose, deterministic code structures data

**4. Presentation Layer (Chat + Dashboards)**
- Primary: Chat interface with rich message components (forms, buttons, charts embedded)
- Secondary: Portfolio dashboard views (accessible via chat or navigation)
- Exports: PDF reports, CSV data, YAML compatibility

**Why This Approach?**
- **Natural Interaction:** Users converse with an expert, not fill out forms
- **Flexibility:** Guardian adapts questions to context, explains concepts on-demand
- **Efficiency:** Structured workflows embedded in conversation prevent context exhaustion
- **Persistence:** Database stores both conversations and structured data
- **Cost-Effective:** ~50 assessments/year means token cost ($0.50-1.00 per assessment) is acceptable

### Hybrid Intelligence: Deterministic + AI

**Deterministic (TypeScript/PostgreSQL):**
- Risk score calculations (rule-based deductions/bonuses)
- Compliance checklist evaluation (boolean/enum matching)
- Portfolio aggregations (SQL queries, averages, trends)
- Assessment comparisons (diff algorithms)

**AI (Claude API):**
- Executive summary prose
- Critical findings narrative with evidence citations
- Recommendation rationale (why approve/conditional/decline)
- Vendor feedback package (professional, constructive tone)
- Nuanced interpretation of complex, open-ended responses

**Benefits:**
- Instant scoring (no API latency)
- Predictable costs (most operations are local computation)
- Auditability (scoring methodology is transparent code)
- Claude focused on what it's best at (interpretation, narrative, judgment)

### Modular Report Generation

**Always Generated (Small, Fast):**
- Executive summary (2 pages)
- Risk dashboard (scores + ratings)
- Final recommendation (approve/conditional/decline)

**On-Demand (Large, Optional):**
- Detailed findings per dimension (generate when user clicks dimension)
- Full compliance analysis (generate when requested)
- Gap analysis table (derived from scores)
- Vendor feedback package (generate when user clicks "Create Feedback")

**Benefits:**
- 60-70% reduction in API costs (users don't always need full 40-page report)
- Faster initial results (executive summary in 20-30 seconds)
- Pay only for what users actually view

### Chat-First API Design

**Backend provides:**
- **Streaming Chat Endpoint:** WebSocket or Server-Sent Events for real-time conversation with Claude
- **Intent Router:** Interprets user messages and routes to appropriate handlers
- **REST APIs:** CRUD operations for assessments, vendors, users, reports
- **Command Handlers:** Backend functions that execute when Guardian detects specific intents (create assessment, generate report, analyze portfolio)

**Frontend consumes:**
- Chat API for conversational interface (streaming support for real-time responses)
- REST APIs for dashboard views, portfolio analytics, exports
- WebSocket for real-time updates (assessment progress, notifications)

**Key Difference from Traditional Apps:**
- **No rigid API contracts:** Chat interface is flexible, backend interprets intent dynamically
- **Rich message responses:** Backend can return text + embedded components (forms, charts, buttons)
- **Stateful conversations:** Chat history maintained per session, context carried forward

**Benefits:**
- Natural language interface abstracts API complexity for users
- Backend handles both free-form consultation and structured workflows
- Future integrations can use chat API or direct REST APIs as needed
- Frontend can be enhanced with new embedded components without backend changes

---

## Assessment Structure & Methodology

### Dynamic Question Generation (Not Fixed 111)

**Important:** Guardian does NOT use a fixed 111-question format. The "111" is a reference number from sample assessments.

**Actual question count varies by:**
- Vendor type (clinical AI vs administrative AI vs patient-facing)
- Assessment scope (comprehensive vs targeted vs renewal)
- Risk level (high-risk clinical requires more questions)
- Previous assessments (renewals are shorter, change-focused)

**Typical Ranges:**
- **Emergency/Minimum:** 78 questions (rushed timeline, focused scope)
- **Standard Comprehensive:** 90-120 questions (most common)
- **Forge Custom:** 78-126 questions (generated by Claude based on context)
- **Renewal Assessment:** 65 questions (change-focused, comparison to previous)

**11 Assessment Sections** (from system prompt):

| Section | Question Range | Time | Focus |
|---------|---------------|------|-------|
| 1. Clinical Use Case | 8-12 | 10 min | Clinical workflow, patient impact |
| 2. AI Architecture | 12-18 | 15 min | Technical design, model details |
| 3. Clinical Validation | 10-15 | 15 min | Evidence quality, regulatory status |
| 4. Privacy & Compliance | 10-15 | 10 min | PIPEDA, ATIPP, PHIA |
| 5. Security Architecture | 8-12 | 10 min | Encryption, access control, pentesting |
| 6. Implementation | 6-10 | 8 min | Deployment approach, integration |
| 7. Governance | 6-10 | 5 min | Oversight, accountability |
| 8. Transparency | 8-12 | 7 min | Explainability, audit trails |
| 9. Ethics & Fairness | 8-12 | 8 min | Bias testing, equity |
| 10. Vendor Capability | 8-12 | 7 min | Company stability, experience |
| 11. Operational Excellence | 15-25 | 10 min | ITIL, support, FTE requirements |

**Total when all sections included:** 107-153 questions

Guardian dynamically:
- Skips irrelevant sections (no clinical validation for administrative tools)
- Adds deep-dive questions when red flags emerge
- Adjusts based on vendor responses
- Tailors to industry context (healthcare vs other)

### Scoring & Analysis Workflow

**Step 1: AI Interpretation (Claude)**
```
Input: Qualitative vendor responses (open-ended text)

Claude analyzes:
- "We follow secure coding practices. Kevin does code reviews..."

Against rubric:
- Security testing maturity (Tier 1-4 NIST CSF)
- Vulnerability management (Proactive/Reactive/None)
- Code review coverage (Comprehensive/Partial/Minimal)

Output: Structured risk factors
{
  security_testing_tier: "Tier 1 - Partial",
  vuln_management: "Reactive",
  code_review_coverage: "Partial",
  evidence: "Manual reviews on major features, periodic npm audit",
  confidence: "Medium"
}
```

**Step 2: Deterministic Calculation (TypeScript)**
```typescript
function calculateSecurityScore(factors: RiskFactors): number {
  let score = 100 // Start perfect, deduct for gaps

  if (factors.security_testing_tier === "Tier 1") score -= 30
  if (factors.security_testing_tier === "Tier 2") score -= 20
  if (factors.vuln_management === "Reactive") score -= 20
  if (factors.vuln_management === "None") score -= 35
  if (factors.code_review_coverage === "Partial") score -= 15
  if (factors.code_review_coverage === "Minimal") score -= 25

  return Math.max(0, score) // Floor at 0
}

// Result: 100 - 30 - 20 - 15 = 35/100 (High Risk)
```

**Why Hybrid:**
- AI handles **meaning extraction** from qualitative text
- Code handles **arithmetic** on extracted factors
- **Auditability:** Scoring logic is transparent, versioned code
- **Consistency:** Same factors = same score, always
- **Cost-effective:** Most operations don't require API calls

### 10 Risk Dimensions (Scoring Reference)

Each dimension scored **0-100** with severity rating based on thresholds:

**Lower is better (risk scores):**
1. **Clinical Risk** (0-100) - Patient safety, validation evidence, regulatory approval
   - 0-20: Low 🟢 | 21-40: Medium 🟡 | 41-60: High 🟠 | 61-100: Critical 🔴

2. **Privacy Risk** (0-100) - PIPEDA, ATIPP, PHIA compliance, data protection
   - 0-20: Low 🟢 | 21-40: Medium 🟡 | 41-60: High 🟠 | 61-100: Critical 🔴

3. **Security Risk** (0-100) - Architecture, encryption, vulnerability management
   - 0-20: Low 🟢 | 21-40: Medium 🟡 | 41-60: High 🟠 | 61-100: Critical 🔴

**Higher is better (capability scores):**
4. **Technical Credibility** (0-100) - AI architecture, development practices, testing
   - 80-100: Excellent 🟢 | 60-79: Good 🟡 | 40-59: Adequate 🟠 | 0-39: Poor 🔴

5. **Vendor Capability** (0-100) - Stability, healthcare experience, references
   - 80-100: Excellent 🟢 | 60-79: Good 🟡 | 40-59: Concern 🟠 | 0-39: Poor 🔴

6. **AI Transparency** (0-100) - Explainability, decision transparency, audit trail
   - 80-100: Excellent 🟢 | 60-79: Good 🟡 | 40-59: Limited 🟠 | 0-39: Black Box 🔴

7. **Ethical Considerations** (0-100) - Fairness, bias mitigation, equity
   - 80-100: Excellent 🟢 | 60-79: Good 🟡 | 40-59: Concern 🟠 | 0-39: Poor 🔴

8. **Regulatory Compliance** (0-100) - Health Canada, FDA, professional standards
   - 80-100: Excellent 🟢 | 60-79: Good 🟡 | 40-59: Gaps 🟠 | 0-39: Non-compliant 🔴

9. **Operational Excellence** (0-100) - ITIL4 maturity, NIST CSF tier, support model
   - 80-100: Excellent 🟢 | 60-79: Good 🟡 | 40-59: Concern 🟠 | 0-39: Inadequate 🔴

10. **Sustainability** (0-100) - TCO, FTE requirements, vendor lock-in risk
    - 80-100: Excellent 🟢 | 60-79: Good 🟡 | 40-59: Challenging 🟠 | 0-39: Unsustainable 🔴

**Composite Score Calculation:**
- Weighted average based on solution type (clinical vs administrative vs patient-facing)
- Clinical AI: Clinical Risk 40%, Privacy 20%, Security 15%, Technical 15%, Ops 10%
- Administrative AI: Privacy 30%, Security 25%, Ops 20%, Technical 15%, Clinical 10%
- Patient-Facing: Privacy 35%, Clinical 25%, Security 20%, Technical 12%, Ops 8%

**Detailed scoring rubrics:** See `.claude/documentation/GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md` (lines 446-684)

### Data Storage

**Storage:**
- PostgreSQL stores structured assessment data (normalized tables)
- JSONB columns for flexible response storage (questions, findings, metadata)
- Document uploads stored in S3-compatible object storage
- Extracted text cached in database for fast context injection

---

## What We're NOT Building (Yet)

### Out of Scope for MVP

**Multi-Tenancy**
- Single organization deployment initially
- Multi-org support requires complex data isolation, billing, etc.
- Future enhancement after MVP validation

**Mobile Native Apps**
- Web-first, responsive design for tablets
- Native iOS/Android apps would require separate development effort
- Mobile web experience sufficient for MVP

**Advanced ML/AI Features**
- No fine-tuning of Claude models
- No custom ML models for risk prediction
- No sentiment analysis beyond what Claude provides
- Stick to Claude API capabilities

**Complex Workflow Automation**
- No integration with procurement systems (Coupa, SAP Ariba, etc.)
- No automated vendor outreach or scheduling
- Manual workflows initially, automation in future versions

**Real-Time Collaboration**
- No Google Docs-style concurrent editing
- Single-user-at-a-time assessment editing
- Comments and review workflows, but not real-time co-editing

**Vendor Self-Service Portal**
- Vendors don't fill out assessments themselves (analyst-led)
- Vendors receive read-only feedback reports
- Full vendor portal (profile management, self-assessment) is future feature

---

## Success Criteria

### Functional Success
- ✅ Conversational assessment completion in < 45 minutes (streamlined vs 90+ in Claude.ai)
- ✅ Dynamic question generation tailored to vendor context
- ✅ Natural language interaction for consultations and portfolio queries
- ✅ Generate Guardian-quality reports via API that match Claude.ai Project output
- ✅ Support 50+ stored assessments with portfolio analytics (vendor history, comparisons, trends)
- ✅ Document upload (PDF, Word) with AI-powered intake parsing
- ✅ All 10 risk dimensions scored accurately with transparent methodology
- ✅ Mode switching (Consult/Assessment/Portfolio) is intuitive, no commands needed

### Performance & Cost
- ✅ Streaming chat responses feel real-time (< 2 second latency to first token)
- ✅ Report generation in < 60 seconds (executive summary < 30 seconds)
- ✅ Cost < $1.00 per assessment (acceptable for ~50 assessments/year = $50/year)
- ✅ Support 10 concurrent users/conversations without performance degradation
- ✅ Database queries < 200ms for portfolio dashboards
- ✅ Conversation history searchable and resumable

### Usability
- ✅ Junior analysts can ask questions mid-assessment and receive expert guidance
- ✅ No command syntax needed - all functionality accessible via GUI or natural language
- ✅ Leadership can query portfolio in plain English ("Show vendors needing renewal")
- ✅ Vendors receive professional, actionable feedback (not intimidating)
- ✅ Audit trail captures all actions including full conversation history

### Quality & Reliability
- ✅ Risk scoring is deterministic (same inputs = same scores, always)
- ✅ Reports are professional quality (ready for executive review without editing)
- ✅ No data loss (auto-save, transaction safety)
- ✅ Claude API failures degrade gracefully (show cached scores, retry later)

### Validation Approach
- **Compare outputs:** Run same assessment through Claude.ai Project and Guardian App, compare quality
- **User testing:** NLHS analysts (or similar) test with real vendor scenarios
- **Load testing:** Simulate 50 assessments, measure performance and cost
- **Audit review:** Have compliance officer review reports for PIPEDA/ATIPP accuracy

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-04 | Initial | Created high-level overview for architecture planning phase |
| 1.1 | 2025-01-04 | Updated | Revised to conversational AI interface with GUI affordances (no command syntax), dynamic question generation, mode switching, chat-first API design |
| 1.2 | 2025-01-04 | Updated | Removed tasks/phases - migrated to `tasks/task-overview.md` (single source of truth) |
| 1.3 | 2025-01-04 | Updated | Added "Assessment Structure & Methodology" section with dynamic question generation details, scoring workflow (AI interpretation → deterministic calculation), 10-dimension scoring reference, YAML structure. Clarified 111 is not rigid. |
| 1.4 | 2025-01-04 | Updated | Clarified tech stack: Next.js for frontend UI only, separate Node.js + Express backend (NOT Next.js API routes), WebSocket confirmed, Passport.js auth. Synced with system-design.md. |
| 1.5 | 2025-01-04 | Updated | Updated to latest verified stack versions: Next.js 15, Node.js 22 LTS, Express 5.1.0, PostgreSQL 17, Prisma v6, Tailwind v4.0, Socket.IO v4.8.1. All components compatibility verified. |
| 1.6 | 2025-01-04 | Updated | Upgraded to Next.js 16 (stable) with Turbopack, React 19.2, built-in MCP support. Added MCP server configuration. All compatibility verified. |
| 1.7 | 2025-01-04 | Updated | Replaced Prisma with Drizzle ORM (SQL-first, lightweight, better for complex queries and repository pattern). |
| 1.8 | 2025-01-04 | Updated | Clarified report generation as interactive web-first with multi-format export (PDF, Word, Excel, email delivery). YAML is import/export only, not primary interface. Assessment is conversational Q&A, not forms. |
| 1.9 | 2025-01-04 | Updated | system-design.md split into 3 focused documents (architecture-layers.md, implementation-guide.md, deployment-guide.md). Updated related documents section. Added architecture/README.md index. |
| 1.10 | 2026-01-29 | Updated | Epic 30-32 complete. Added Vision API for image analysis, parallel file upload with background extraction, questionnaire progress streaming. Production MVP status. |

---

## Related Documents

- **Planning:**
  - `tasks/roadmap.md` - Feature roadmap (MVP, Phase 2, Phase 3, Phase 4)
  - `tasks/task-overview.md` - Current tasks and execution status
- **System Architecture:**
  - `architecture-layers.md` - Foundational architecture (4 layers, 7 modules, design patterns)
  - `implementation-guide.md` - Build instructions (folder structure, data flows, caching, testing)
  - `deployment-guide.md` - Infrastructure setup (environments, Docker, CI/CD)
- **Data Design:**
  - `docs/design/data/database-schema.md` - Database schema (6 MVP tables, Phase 2 extensions)
- **Quick Reference:** `CLAUDE.md` (guardrails for Claude sessions)
- **System Prompt Reference:** `.claude/documentation/GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md`

---

**This document is the north star for the Guardian App project.** All subsequent architecture decisions, feature specifications, and implementation details should reference and align with this overview. As the project evolves, this document will be updated to reflect major directional changes, but the core vision should remain stable.

**For task tracking, planning, and status updates, see:** `tasks/task-overview.md`
