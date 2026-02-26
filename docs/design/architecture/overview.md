# Guardian App - Project Overview

**Version:** 1.3
**Last Updated:** 2026-02-26
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
- ScoringPayloadReconciler handles all arithmetic deterministically (Claude interprets, code calculates)
- Modular report generation (only generate sections viewed)
- Prompt caching reduces repeat scoring costs (cache hit rate tracked by ScoringMetricsCollector)

**Integration & Automation**
- API-first design enables integration with procurement systems
- Automated renewal reminders based on assessment age
- Exportable data (PDF, Word, Excel scoring reports; PDF, Word, Excel questionnaire exports; CSV, JSON)
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

### Risk Analysis (10 Dimensions, Rubric v1.1)

All 10 dimensions are scored 0-100 with rubric-defined sub-scores. Each dimension has 4-6 named sub-score components with explicit point allocations that sum to the dimension total. Dimensions are classified as either **risk** (lower is better) or **capability** (higher is better):

**Risk Dimensions (lower is better):**
- **Clinical Risk:** Evidence quality, regulatory status, patient safety, population relevance, workflow integration
- **Privacy Risk:** PIPEDA compliance, ATIPP compliance, PHI protection, consent mechanisms, data subject rights
- **Security Risk:** Security architecture, access control, vulnerability management, incident response, certifications, PHI-specific controls

**Capability Dimensions (higher is better):**
- **Technical Credibility:** AI architecture, development practices, validation/testing, documentation, explainability
- **Vendor Capability:** Company stability, healthcare experience, customer references, support capability, roadmap credibility
- **AI Transparency:** Model explainability, audit trail, confidence scoring, limitations documentation, interpretability
- **Ethical Considerations:** Bias testing, population fairness, equity impact, Indigenous/rural health, algorithmic justice
- **Regulatory Compliance:** Health Canada status, QMS maturity, clinical evidence, post-market surveillance, regulatory roadmap
- **Operational Excellence:** ITIL4 maturity, NIST CSF tier, support model, change management, FTE sustainability
- **Sustainability:** ITIL4 service maturity, NIST CSF alignment, support model sustainability, BCP/disaster recovery, total cost of ownership

Severity ratings use risk-type thresholds (0-20 Low, 21-40 Medium, 41-60 High, 61-100 Critical) for risk dimensions and inverted thresholds for capability dimensions (80-100 Excellent, 60-79 Good, 40-59 Adequate, 0-39 Poor).

### Report Generation
- **Interactive Web Reports:** Primary display as rich web view with risk dashboards, expandable sections, charts, and real-time streaming from Claude
- **Internal Decision Report:** Comprehensive analysis for leadership (executive summary, risk dashboard, critical findings, gap analysis, compliance assessment with ISO/IEC 42001 references, recommendation)
- **Vendor Feedback Package:** Professional external communication (strengths acknowledged, required remediations, actionable guidance)
- **Modular Sections:** Generate full report or individual sections on-demand (streaming, cached for 24 hours)
- **Multi-Format Scoring Export:** PDF (ScoringPDFExporter), Word with ISO clause sections (ScoringWordExporter), Excel with dimension breakdowns (ScoringExcelExporter)
- **Multi-Format Questionnaire Export:** PDF, Word, Excel for generated questionnaires
- **Email Delivery:** Direct email to leadership or vendors with PDF attachments and professional messaging
- **Customizable Templates:** Adapt reports to organizational branding

### Vendor Portfolio Management
- **Vendor Profiles:** Centralized vendor information, contact history, assessment timeline
- **Assessment History:** All past assessments for each vendor with comparison tools
- **Portfolio Dashboard:** Aggregate risk view across all vendors
- **Trend Analysis:** Risk score changes over time, common gap patterns
- **Renewal Tracking:** Alerts for assessments older than 12 months

### Compliance Frameworks
- **ISO/IEC 42001 (AI Management Systems):** Full domain model with ComplianceFramework, FrameworkVersion, FrameworkControl, InterpretiveCriteria, and DimensionControlMapping entities. Controls are mapped to risk dimensions and injected into scoring prompts via ISOControlRetrievalService.
- **PIPEDA (Federal):** 10 Fair Information Principles assessment (mapped to privacy_risk dimension sub-scores)
- **ATIPP (NL Provincial):** Public body obligations, PIA requirements (mapped to privacy_risk dimension sub-scores)
- **NIST Cybersecurity Framework:** Tier assessment (1-4), mapped to operational_excellence and sustainability sub-scores
- **ITIL4 Service Management:** Maturity level assessment (1-5), mapped to operational_excellence and sustainability sub-scores
- **Custom Frameworks:** Extensible via ComplianceFramework domain entities

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
- **Architecture:** Lightweight Clean Architecture (4 layers: Presentation, Application, Domain, Infrastructure). Max 300 LOC per source file enforced -- services and clients decomposed into focused modules.

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
- **Claude Client Decomposition:** ClaudeClientBase (shared SDK/retry), ClaudeTextClient (non-streaming), ClaudeStreamClient (streaming with tool use), ClaudeVisionClient (image analysis)
- **Conversation Management:** Claude for natural language interaction, intent detection, question generation
- **Scoring Pipeline:** normalize -> reconcile -> validate -> store (ScoringPayloadReconciler auto-corrects Claude's arithmetic before validation)
- **Scoring Service Decomposition:** ScoringService (orchestrator), ScoringLLMService (prompt building + streaming), ScoringStorageService (response/score persistence), ScoringQueryService (read-only queries), ScoringRetryService (structural violation retry), ScoringMetricsCollector (cache hit rate, cost, latency)
- **Rubric Version:** guardian-v1.1 -- all 10 dimensions have sub-score rules, dimension weights per solution type
- **Compliance Domain:** ISO compliance framework entities (ComplianceFramework, FrameworkVersion, FrameworkControl, InterpretiveCriteria, DimensionControlMapping) with ISOControlRetrievalService for prompt injection
- **Extraction Pipeline:** ExtractionRoutingService routes between RegexResponseExtractor (fast path) and Claude fallback, with ExtractionConfidenceCalculator evaluating extraction quality
- **Report Generation:** Claude API (narrative, interpretation, recommendations, vendor feedback)
- **Export Formats:** PDF (ScoringPDFExporter), Word (ScoringWordExporter), Excel (ScoringExcelExporter) for scoring reports; PDF, Word, Excel for questionnaires

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

**3. Analysis Engine ("Claude Interprets, Code Calculates")**
- **AI (ScoringLLMService):** Claude interprets qualitative responses against rubric, assigns sub-scores, identifies disqualifiers, generates narrative reports with ISO/IEC 42001 references
- **Reconciliation (ScoringPayloadReconciler):** Auto-corrects dimension totals from sub-score sums, enforces recommendation/disqualifier coherence, recomputes composite from weighted averages
- **Validation (ScoringPayloadValidator):** Hard errors reject payload, structural violations trigger retry, soft warnings are logged
- **Compliance (ISOControlRetrievalService):** Retrieves ISO controls from database and injects into scoring prompts; ComplianceFramework domain entities model ISO/IEC 42001 structure
- **Report Generation:** Claude composes professional prose, deterministic code structures data, multi-format export (PDF, Word, Excel)

**4. Presentation Layer (Chat + Dashboards)**
- Primary: Chat interface with rich message components (forms, buttons, charts embedded)
- Secondary: Portfolio dashboard views (accessible via chat or navigation)
- Exports: Multi-format scoring reports (PDF, Word, Excel), questionnaire exports, CSV data

**Why This Approach?**
- **Natural Interaction:** Users converse with an expert, not fill out forms
- **Flexibility:** Guardian adapts questions to context, explains concepts on-demand
- **Efficiency:** Structured workflows embedded in conversation prevent context exhaustion
- **Persistence:** Database stores both conversations and structured data
- **Cost-Effective:** ~50 assessments/year means token cost ($0.50-1.00 per assessment) is acceptable. ScoringMetricsCollector tracks per-call cache hit rates and estimated cost (Sonnet 4.5 pricing: $3/MTok input, $15/MTok output, $0.30/MTok cache read).

### Hybrid Intelligence: "Claude Interprets, Code Calculates"

The scoring architecture enforces a strict separation: Claude provides qualitative interpretation against the rubric, while TypeScript handles all arithmetic and validation. The ScoringPayloadReconciler embodies this principle by auto-correcting any mathematical inconsistencies in Claude's output before validation.

**Claude (LLM) Responsibilities:**
- Interprets qualitative vendor responses against the Guardian rubric
- Assigns sub-scores within each dimension based on evidence quality
- Identifies disqualifying factors from vendor responses
- Generates narrative reports (executive summary, critical findings, vendor feedback)
- Provides recommendation rationale with evidence citations
- Maps vendor responses to ISO/IEC 42001 compliance controls

**TypeScript (Deterministic) Responsibilities:**
- ScoringPayloadReconciler: Recalculates dimension totals from sub-score sums, enforces recommendation consistency with disqualifier tiers, recomputes composite score from weighted averages
- ScoringPayloadValidator: Validates payload structure, enum values, sub-score ranges; distinguishes hard errors from structural violations and soft warnings
- Compliance checklist evaluation (boolean/enum matching)
- Portfolio aggregations (SQL queries, averages, trends)
- Assessment comparisons (diff algorithms)

**Benefits:**
- Claude never does arithmetic it can get wrong -- code recalculates deterministically
- Reconciler corrections are logged for auditability
- Predictable costs (most operations are local computation)
- Structural violations trigger one LLM retry; soft warnings are logged but do not reject the payload

### Modular Report Generation

**Always Generated (Small, Fast):**
- Executive summary (2 pages)
- Risk dashboard (10-dimension scores + ratings + sub-score breakdowns)
- Final recommendation (approve/conditional/decline) with disqualifier analysis

**On-Demand (Large, Optional):**
- Detailed findings per dimension with sub-score evidence (generate when user clicks dimension)
- Full compliance analysis with ISO/IEC 42001 clause references (generate when requested)
- Gap analysis table (derived from scores)
- Vendor feedback package (generate when user clicks "Create Feedback")

**Multi-Format Export (ScoringExportService):**
- PDF: Professional formatted reports via ScoringPDFExporter
- Word: Editable documents with ISO clause sections, narrative parsing via ScoringWordExporter
- Excel: Data-oriented dimension breakdowns via ScoringExcelExporter
- On-demand narrative generation with concurrency-safe claim pattern

**Benefits:**
- 60-70% reduction in API costs (users don't always need full 40-page report)
- Faster initial results (executive summary in 20-30 seconds)
- Pay only for what users actually view
- ScoringMetricsCollector tracks cache hit rates, token usage, and cost per scoring run

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

The scoring pipeline processes uploaded questionnaire documents through a multi-stage flow. Each stage has a distinct responsibility, and the pipeline is orchestrated by ScoringService which delegates to focused sub-services.

**Step 1: Document Extraction**
```
Input: Uploaded questionnaire document (PDF, Word, Excel)

ExtractionRoutingService:
  1. RegexResponseExtractor attempts fast-path extraction
  2. ExtractionConfidenceCalculator evaluates quality
  3. If confidence >= threshold -> use regex result
  4. If below threshold -> fall back to Claude Vision

Output: ScoringParseResult (assessmentId, vendorName, responses[])
```

**Step 2: AI Interpretation (Claude via ScoringLLMService)**
```
Input: Extracted vendor responses + Guardian rubric + ISO controls

Claude evaluates each dimension using rubric-defined sub-scores:
- security_architecture_score: 0-25 points
- access_control_score: 0-20 points
- vulnerability_management_score: 0-20 points
- incident_response_score: 0-15 points
- certifications_score: 0-10 points
- phi_specific_controls_score: 0-10 points

Output: scoring_complete tool call with:
  - 10 dimension scores (each with sub-scores, findings, ISO references)
  - Composite score, recommendation, disqualifying factors
  - Narrative report with evidence citations
```

**Step 3: Normalize -> Reconcile -> Validate (TypeScript)**
```
Pipeline: normalize -> reconcile -> validate -> store

1. Normalize: Coerce LLM output variations (e.g., object -> array)
2. Reconcile (ScoringPayloadReconciler):
   - Dimension scores = sum of valid sub-scores
   - Recommendation = auto-corrected from disqualifier tiers
     (hard_decline -> must be 'decline', remediable_blocker -> cannot be 'approve')
   - Composite score = recalculated from weighted average
3. Validate (ScoringPayloadValidator):
   - Hard errors: missing fields, invalid enums, wrong dimension count
   - Structural violations: sub-score values not in allowed set (triggers retry)
   - Soft warnings: logged but do not reject payload
4. Store: Persist scores, narrative, and rubric version for auditability
```

**Step 4: Retry on Structural Violations (ScoringRetryService)**
```
If structural violations found:
  1. Re-prompt Claude with specific correction instructions
  2. Re-run normalize -> reconcile -> validate pipeline
  3. If still invalid -> fail closed with error
```

**Why This Design:**
- Claude handles **qualitative interpretation** (what the rubric means in context)
- Code handles **all arithmetic** (sub-score sums, weighted averages, recommendation logic)
- Reconciler corrects Claude's math before validation even runs
- Every correction is logged for auditability
- Rubric version (guardian-v1.1) stored with results for reproducibility

### 10 Risk Dimensions (Scoring Reference, Rubric v1.1)

Each dimension scored **0-100** using rubric-defined sub-scores. All 10 dimensions have explicit sub-score rules with named components and allowed point values (see `subScoreRules.ts`).

**Risk Dimensions (lower is better):**

| # | Dimension | Sub-scores | Max | Thresholds |
|---|-----------|------------|-----|------------|
| 1 | **Clinical Risk** | evidence_quality (40), regulatory_status (20), patient_safety (20), population_relevance (10), workflow_integration (10) | 100 | 0-20 Low, 21-40 Medium, 41-60 High, 61-100 Critical |
| 2 | **Privacy Risk** | pipeda_compliance (30), atipp_compliance (25), phi_protection (20), consent_mechanism (15), data_subject_rights (10) | 100 | 0-20 Low, 21-40 Medium, 41-60 High, 61-100 Critical |
| 3 | **Security Risk** | security_architecture (25), access_control (20), vulnerability_management (20), incident_response (15), certifications (10), phi_specific_controls (10) | 100 | 0-20 Low, 21-40 Medium, 41-60 High, 61-100 Critical |

**Capability Dimensions (higher is better):**

| # | Dimension | Sub-scores | Max | Thresholds |
|---|-----------|------------|-----|------------|
| 4 | **Technical Credibility** | ai_architecture (25), development_practices (20), validation_testing (20), documentation (15), explainability (20) | 100 | 80-100 Excellent, 60-79 Good, 40-59 Adequate, 0-39 Poor |
| 5 | **Vendor Capability** | company_stability (25), healthcare_experience (25), customer_references (20), support_capability (15), roadmap_credibility (15) | 100 | 80-100 Excellent, 60-79 Good, 40-59 Adequate, 0-39 Poor |
| 6 | **AI Transparency** | model_explainability (25), audit_trail (25), confidence_scoring (20), limitations_documentation (15), interpretability (15) | 100 | 80-100 Excellent, 60-79 Good, 40-59 Adequate, 0-39 Poor |
| 7 | **Ethical Considerations** | bias_testing (25), population_fairness (25), equity_impact (20), indigenous_rural_health (15), algorithmic_justice (15) | 100 | 80-100 Excellent, 60-79 Good, 40-59 Adequate, 0-39 Poor |
| 8 | **Regulatory Compliance** | health_canada_status (25), qms_maturity (25), clinical_evidence (20), post_market_surveillance (15), regulatory_roadmap (15) | 100 | 80-100 Excellent, 60-79 Good, 40-59 Adequate, 0-39 Poor |
| 9 | **Operational Excellence** | itil4_maturity (30), nist_csf_tier (25), support_model (20), change_management (15), fte_sustainability (10) | 100 | 80-100 Excellent, 60-79 Good, 40-59 Adequate, 0-39 Poor |
| 10 | **Sustainability** | itil4_service_maturity (25), nist_csf_alignment (20), support_model_sustainability (20), bcp_disaster_recovery (20), total_cost_of_ownership (15) | 100 | 80-100 Excellent, 60-79 Good, 40-59 Adequate, 0-39 Poor |

**Composite Score Calculation (Rubric v1.1):**

All 10 dimensions receive non-zero weights for every solution type. Risk dimensions are converted to risk-equivalent (capability scores inverted: 100 - score) before weighting.

| Dimension | Clinical AI | Administrative AI | Patient-Facing |
|-----------|-------------|-------------------|----------------|
| Clinical Risk | **25%** | 5% | 10% |
| Privacy Risk | 15% | **20%** | **20%** |
| Security Risk | 15% | 18% | 15% |
| Technical Credibility | 10% | 10% | 10% |
| Operational Excellence | 10% | 12% | 5% |
| Vendor Capability | 5% | 8% | 5% |
| AI Transparency | 5% | 5% | 10% |
| Ethical Considerations | 5% | 5% | 10% |
| Regulatory Compliance | 5% | 10% | 10% |
| Sustainability | 5% | 7% | 5% |

**Disqualifying Factors (Two-Tier System):**
- **Hard Decline:** Fundamental safety/architecture gaps that force a "decline" recommendation (e.g., no encryption for PHI, cross-border data transfer without safeguards, no clinical validation for diagnosis AI)
- **Remediable Blockers:** Process/documentation gaps fixable in 30-90 days that block "approve" but allow "conditional" (e.g., no PIA for PHI processing, no penetration testing ever conducted, no incident response plan)

The ScoringPayloadReconciler enforces recommendation coherence: hard_decline factors force "decline", remediable_blockers prevent "approve".

**Detailed scoring rubrics:** See `packages/backend/src/domain/scoring/rubric.ts` and `subScoreRules.ts`

### Data Storage

**Storage:**
- PostgreSQL stores structured assessment data (normalized tables)
- JSONB columns for flexible response storage (questions, findings with sub-scores, ISO references, assessment confidence, metadata)
- ISO compliance framework data stored in dedicated tables (compliance_frameworks, framework_versions, framework_controls, interpretive_criteria, dimension_control_mappings) with in-memory caching in ISOControlRetrievalService (5-min TTL)
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
- ✅ Risk scoring is deterministic after reconciliation (ScoringPayloadReconciler corrects Claude's arithmetic; same sub-scores = same dimension totals and composite, always)
- ✅ Reports are professional quality (ready for executive review without editing)
- ✅ No data loss (auto-save, transaction safety)
- ✅ Claude API failures degrade gracefully (show cached scores, retry later)
- ✅ Rubric version (guardian-v1.1) stored with every result for auditability and reproducibility

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
| 1.11 | 2026-02-26 | Updated | Epic 37-40 complete. Rubric v1.1: all 10 dimensions have sub-score rules and dimension weights per solution type. ScoringPayloadReconciler auto-corrects Claude's arithmetic (normalize -> reconcile -> validate -> store). ScoringService decomposed into 5 focused services. ClaudeClient decomposed into 4 focused clients. ISO compliance domain (ComplianceFramework, FrameworkVersion, FrameworkControl, InterpretiveCriteria, DimensionControlMapping). ExtractionRoutingService with regex fast-path and confidence calculator. Two-tier disqualifying factor system. Multi-format scoring exports (PDF, Word, Excel). ScoringMetricsCollector for cost tracking. |

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
- **Scoring Rubric:** `packages/backend/src/domain/scoring/rubric.ts` (weights, thresholds, disqualifiers)
- **Sub-Score Rules:** `packages/backend/src/domain/scoring/subScoreRules.ts` (all 10 dimensions)
- **Reconciler:** `packages/backend/src/domain/scoring/ScoringPayloadReconciler.ts`
- **System Prompt Reference:** `.claude/documentation/GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md`

---

**This document is the north star for the Guardian App project.** All subsequent architecture decisions, feature specifications, and implementation details should reference and align with this overview. As the project evolves, this document will be updated to reflect major directional changes, but the core vision should remain stable.

**For task tracking, planning, and status updates, see:** `tasks/task-overview.md`
