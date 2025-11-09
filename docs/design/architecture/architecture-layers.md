# Guardian Architecture - Layers & Modules

**Version:** 1.0 (Extracted from system-design.md v1.5)
**Last Updated:** 2025-01-04
**Architecture Pattern:** Lightweight Clean Architecture
**Status:** Stable (foundational)

---

## Part of Guardian System Architecture

**Related Documents:**
- **Overview:** `overview.md` - High-level vision and goals
- **Implementation:** `implementation-guide.md` - Build instructions, data flows, testing
- **Deployment:** `deployment-guide.md` - Infrastructure and deployment
- **Tasks:** `tasks/task-overview.md` - Current work and priorities
- **Quick Reference:** `CLAUDE.md` - Guardrails for Claude sessions

---

## Architecture Overview

Guardian uses **Lightweight Clean Architecture** - explicit layer separation with clear responsibilities and dependency rules, without over-engineering.

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation Layer (Frontend)                              │
│  - Next.js (UI only, no business logic)                     │
│  - Chat interface, dashboards, forms                        │
│  - Consumes APIs only                                       │
│  Dependency: → Application Layer (via HTTP/WebSocket)       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Application Layer (Use Cases / Services)                   │
│  - AssessmentService, AnalysisService, ReportService        │
│  - Orchestrates workflows, enforces business rules          │
│  - Pure TypeScript, no framework coupling                   │
│  Dependency: → Domain Layer (entities, business rules)      │
│               → Infrastructure Layer (via interfaces/ports) │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Domain Layer (Business Logic / Entities)                   │
│  - Assessment, Vendor, RiskScore entities                   │
│  - Scoring algorithms, validation rules                     │
│  - Value objects (Email, RiskLevel, ComplianceStatus)       │
│  Dependency: NONE (pure business logic)                     │
└─────────────────────────────────────────────────────────────┘
                          ↑ (implements interfaces)
┌─────────────────────────────────────────────────────────────┐
│  Infrastructure Layer (External Concerns)                   │
│  - Express/Fastify (HTTP server, WebSocket)                 │
│  - Drizzle ORM (database access implementation)             │
│  - Claude API client (AI integration)                       │
│  - Auth providers, email services, file storage             │
│  Dependency: → Application Layer (implements its interfaces)│
└─────────────────────────────────────────────────────────────┘
```

**Key Principle:** Dependencies point INWARD. Domain has zero dependencies. Infrastructure depends on everything.

---

## Layer Responsibilities

### Presentation Layer (Next.js Frontend)

**CAN:**
- ✅ Render UI components (chat messages, forms, dashboards)
- ✅ Capture user input (text, file uploads, button clicks)
- ✅ Make HTTP/WebSocket calls to backend APIs
- ✅ Manage UI state (form data, conversation history display)
- ✅ Display validation errors from backend
- ✅ Handle routing and navigation

**CANNOT:**
- ❌ Access database directly
- ❌ Call Claude API directly
- ❌ Implement business logic (scoring, validation)
- ❌ Store sensitive data (API keys, secrets)
- ❌ Make business decisions (approve/decline logic)

**Technology:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Shadcn/ui

**Example:** Chat component receives messages from backend, renders them, sends user input back via WebSocket. Zero business logic.

---

### Application Layer (Services / Use Cases)

**CAN:**
- ✅ Orchestrate workflows (create assessment → generate questions → analyze → generate report)
- ✅ Enforce business rules (assessment must have vendor name, scores must be 0-100)
- ✅ Coordinate between domain and infrastructure
- ✅ Handle application-level errors and retries
- ✅ Manage transactions and consistency

**CANNOT:**
- ❌ Know about HTTP requests, WebSocket frames
- ❌ Know about Drizzle, SQL, database details
- ❌ Know about specific LLM APIs (uses interfaces)
- ❌ Implement UI rendering logic

**Technology:** Pure TypeScript classes/functions

**Example Services:**
- `AssessmentService` - Create, update, retrieve assessments
- `ConversationService` - Manage chat sessions, route messages
- `AnalysisService` - Orchestrate Claude interpretation + scoring
- `ReportService` - Generate reports on-demand
- `VendorService` - Manage vendor profiles and portfolio
- `AuthService` - Handle authentication flows

**Pattern:**
```typescript
class AssessmentService {
  constructor(
    private assessmentRepo: IAssessmentRepository,  // Interface, not Drizzle
    private questionGen: IQuestionGenerator,        // Interface, not Claude
    private eventBus: IEventBus                     // Interface, not specific impl
  ) {}

  async createAssessment(data: CreateAssessmentDTO): Promise<Assessment> {
    // 1. Validate (domain rules)
    const assessment = Assessment.create(data)

    // 2. Generate questions (via interface)
    const questions = await this.questionGen.generate(assessment.type)

    // 3. Persist (via interface)
    const saved = await this.assessmentRepo.save(assessment)

    // 4. Emit event (via interface)
    await this.eventBus.publish('assessment.created', saved)

    return saved
  }
}
```

---

### Domain Layer (Business Logic / Entities)

**CAN:**
- ✅ Define entities (Assessment, Vendor, RiskScore)
- ✅ Define value objects (Email, VendorName, RiskLevel)
- ✅ Implement scoring algorithms (calculateSecurityScore)
- ✅ Define business rules (Assessment must have ≥78 questions)
- ✅ Validate domain constraints

**CANNOT:**
- ❌ Know about databases, APIs, HTTP, WebSocket
- ❌ Import framework libraries (Express, Drizzle, etc.)
- ❌ Depend on infrastructure or application layers
- ❌ Perform I/O operations

**Technology:** Pure TypeScript (zero dependencies on frameworks)

**Example Entities:**
```typescript
// domain/entities/Assessment.ts
export class Assessment {
  private constructor(
    public readonly id: AssessmentId,
    public vendorName: VendorName,
    public assessmentType: AssessmentType,
    public responses: AssessmentResponse[],
    public status: AssessmentStatus
  ) {}

  static create(data: CreateAssessmentData): Assessment {
    // Validation (business rules)
    if (!data.vendorName) throw new DomainError('Vendor name required')
    if (data.responses.length < 78) throw new DomainError('Minimum 78 questions')

    return new Assessment(...)
  }

  addResponse(response: AssessmentResponse): void {
    // Business logic for adding responses
    this.responses.push(response)
  }

  isComplete(): boolean {
    // Business rule: All questions answered
    return this.responses.every(r => r.isAnswered())
  }
}
```

**Example Business Rules:**
```typescript
// domain/business-rules/calculateRiskScore.ts
export function calculateSecurityScore(factors: SecurityFactors): number {
  let score = 100

  if (factors.testing_tier === "Tier 1") score -= 30
  if (factors.vuln_management === "Reactive") score -= 20
  if (factors.code_review === "Partial") score -= 15

  return Math.max(0, Math.min(100, score))
}
```

---

### Infrastructure Layer (External Concerns)

**CAN:**
- ✅ Implement repository interfaces (DrizzleAssessmentRepository)
- ✅ Implement API interfaces (ClaudeQuestionGenerator)
- ✅ Handle HTTP requests/responses (Express routes)
- ✅ Manage database connections and queries
- ✅ Integrate external services (Claude API, email, storage)
- ✅ Implement WebSocket server

**CANNOT:**
- ❌ Implement business logic (that's domain layer)
- ❌ Make business decisions (that's application layer)

**Technology:** Express, Drizzle ORM, Anthropic SDK, WebSocket libraries

**Example Repository Implementation:**
```typescript
// infrastructure/database/DrizzleAssessmentRepository.ts
import { db } from '../client'
import { assessments } from '../schema'
import { eq } from 'drizzle-orm'
import { IAssessmentRepository } from '../../application/interfaces'
import { Assessment } from '../../domain/entities'

export class DrizzleAssessmentRepository implements IAssessmentRepository {
  async save(assessment: Assessment): Promise<Assessment> {
    const [data] = await db
      .insert(assessments)
      .values({
        id: assessment.id.value,
        vendorName: assessment.vendorName.value,
        // ... map domain entity to Drizzle schema
      })
      .returning()

    return Assessment.fromPersistence(data) // Convert back to domain entity
  }

  async findById(id: string): Promise<Assessment | null> {
    const [data] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, id))

    return data ? Assessment.fromPersistence(data) : null
  }
}
```

**Example API Integration:**
```typescript
// infrastructure/ai/ClaudeQuestionGenerator.ts
import Anthropic from '@anthropic-ai/sdk'
import { IQuestionGenerator } from '../../application/interfaces'

export class ClaudeQuestionGenerator implements IQuestionGenerator {
  constructor(private client: Anthropic) {}

  async generate(context: AssessmentContext): Promise<Question[]> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      messages: [/* ... */]
    })

    return this.parseQuestions(response.content)
  }
}
```

---

## Module Boundaries

Guardian is organized into **7 modules** plus shared infrastructure:

### Module 1: Assessment Module

**Owns:**
- Assessment creation and intake workflow
- Question generation (via Claude)
- Assessment data model (questions, responses, metadata)
- Progress tracking and session management
- YAML import/export

**Public Interface:**
```typescript
// What other modules can use
interface IAssessmentModule {
  createAssessment(data: CreateAssessmentDTO): Promise<Assessment>
  generateQuestions(context: AssessmentContext): Promise<Question[]>
  saveResponse(assessmentId: string, response: Response): Promise<void>
  getAssessment(assessmentId: string): Promise<Assessment>
  importYAML(yaml: string): Promise<Assessment>
  exportYAML(assessmentId: string): Promise<string>
}
```

**Dependencies:**
- Depends on: Shared module (types, utils)
- Used by: Analysis module, Reporting module

---

### Module 2: Analysis Module

**Owns:**
- Risk scoring algorithms (10 dimensions)
- Claude interpretation orchestration
- Compliance framework evaluation (PIPEDA, ATIPP, NIST)
- Gap analysis
- Recommendation generation (Approve/Conditional/Decline)

**Public Interface:**
```typescript
interface IAnalysisModule {
  analyzeAssessment(assessment: Assessment): Promise<AnalysisResult>
  calculateRiskScores(responses: Response[]): Promise<RiskScores>
  evaluateCompliance(assessment: Assessment): Promise<ComplianceResult>
  generateRecommendation(analysis: AnalysisResult): Promise<Recommendation>
}
```

**Dependencies:**
- Depends on: Assessment module (read assessment data), Shared module
- Used by: Reporting module, Conversation module

---

### Module 3: Reporting Module

**Owns:**
- Report generation (internal + vendor feedback)
- Report templates and formatting
- Web view rendering (interactive reports)
- Modular report sections
- Report storage and retrieval

**Public Interface:**
```typescript
interface IReportingModule {
  generateInternalReport(analysisId: string): Promise<Report>
  generateVendorFeedback(analysisId: string): Promise<Report>
  generateReportSection(section: ReportSection): Promise<string>
  renderWebView(reportId: string): Promise<ReactComponent>
}
```

**Dependencies:**
- Depends on: Assessment module, Analysis module, Shared module
- Used by: Conversation module, Portfolio module, Export module

---

### Module 4: Portfolio Module

**Owns:**
- Vendor profile management
- Assessment history tracking
- Portfolio analytics (aggregations, trends)
- Vendor comparison tools
- Renewal tracking and alerts

**Public Interface:**
```typescript
interface IPortfolioModule {
  getVendorProfile(vendorId: string): Promise<Vendor>
  getAssessmentHistory(vendorId: string): Promise<Assessment[]>
  getPortfolioAnalytics(): Promise<PortfolioStats>
  compareVendors(vendorIds: string[]): Promise<Comparison>
  getRenewalsNeeded(): Promise<Vendor[]>
}
```

**Dependencies:**
- Depends on: Assessment module, Analysis module, Shared module
- Used by: Conversation module

---

### Module 5: Conversation Module

**Owns:**
- Chat session management
- Message storage and retrieval
- Intent detection and routing
- Conversation context management
- Streaming message delivery

**Public Interface:**
```typescript
interface IConversationModule {
  createSession(userId: string): Promise<Session>
  sendMessage(sessionId: string, message: Message): Promise<Response>
  getHistory(sessionId: string): Promise<Message[]>
  detectIntent(message: string): Promise<Intent>
  streamResponse(response: string): AsyncIterable<string>
}
```

**Dependencies:**
- Depends on: All other modules (orchestrates everything), Shared module
- Used by: None (top-level module)

---

### Module 6: User & Auth Module

**Owns:**
- User registration and profile management
- Authentication (login, logout, session management)
- Authorization (RBAC, permissions)
- JWT token generation and validation
- Audit trail of user actions

**Public Interface:**
```typescript
interface IAuthModule {
  register(userData: RegisterDTO): Promise<User>
  login(credentials: Credentials): Promise<AuthToken>
  validateToken(token: string): Promise<User>
  checkPermission(userId: string, resource: string, action: string): Promise<boolean>
  logAction(userId: string, action: AuditAction): Promise<void>
}
```

**Dependencies:**
- Depends on: Shared module
- Used by: All modules (for authorization checks)

---

### Module 7: Export Module

**Owns:**
- Multi-format export generation (PDF, Word, Excel, JSON, YAML)
- Email delivery service (leadership reports, vendor feedback)
- Export templates and formatting
- Print-optimized layouts

**Public Interface:**
```typescript
interface IExportModule {
  exportToPDF(reportId: string, template?: string): Promise<Buffer>
  exportToWord(reportId: string): Promise<Buffer>
  exportToExcel(reportId: string): Promise<Buffer>
  exportToJSON(reportId: string): Promise<object>
  exportToYAML(reportId: string): Promise<string>
  emailToLeadership(reportId: string, recipients: string[]): Promise<void>
  emailToVendor(reportId: string, vendorEmail: string): Promise<void>
}
```

**Dependencies:**
- Depends on: Reporting module (report data), Shared module
- Used by: Conversation module (when user requests export)

---

### Shared Kernel

**Contains:**
- Common types (DTOs, interfaces, enums)
- Utility functions (date formatting, string validation)
- Error types (DomainError, ApplicationError, InfrastructureError)
- Constants and configuration
- Cross-cutting concerns (logging, monitoring)

**No business logic** - only utilities used everywhere.

---

## Module Dependency Rules

```
Conversation ──→ Assessment
           └──→ Analysis
           └──→ Portfolio
           └──→ Reporting
           └──→ Export
           └──→ Auth

Export      ──→ Reporting

Reporting   ──→ Assessment
           └──→ Analysis

Portfolio   ──→ Assessment
           └──→ Analysis

Analysis    ──→ Assessment

Assessment  ──→ Shared only

Auth        ──→ Shared only

All modules ──→ Shared
```

**Rules:**
1. Modules only depend on modules below them (no circular dependencies)
2. Each module has explicit public interface
3. Cross-module calls go through interfaces only
4. Shared kernel has NO dependencies on any module

---

## Key Design Patterns

### Pattern 1: Dependency Inversion

All infrastructure dependencies go through **interfaces** in application layer:

```typescript
// ✅ GOOD: Application depends on interface
class AnalysisService {
  constructor(private claude: IClaudeClient) {} // Interface, not Anthropic SDK

  async analyze(text: string): Promise<RiskFactors> {
    return await this.claude.interpretResponse(text)
  }
}

// Infrastructure implements interface
class AnthropicClaudeClient implements IClaudeClient {
  constructor(private anthropic: Anthropic) {}

  async interpretResponse(text: string): Promise<RiskFactors> {
    // Anthropic-specific implementation
  }
}

// ❌ BAD: Service depends on concrete implementation
class AnalysisService {
  constructor(private anthropic: Anthropic) {} // Direct dependency
}
```

**Benefit:** Can swap Claude for different LLM without touching application layer.

---

### Pattern 2: Repository Pattern

All database access goes through **repository interfaces**:

```typescript
// Application layer defines what it needs
interface IAssessmentRepository {
  save(assessment: Assessment): Promise<Assessment>
  findById(id: string): Promise<Assessment | null>
  findByVendor(vendorId: string): Promise<Assessment[]>
  delete(id: string): Promise<void>
}

// Infrastructure implements with Drizzle
class DrizzleAssessmentRepository implements IAssessmentRepository {
  // Drizzle-specific implementation
}

// Services use interface, not Drizzle
class AssessmentService {
  constructor(private repo: IAssessmentRepository) {} // Interface
}
```

**Benefit:** Can swap Drizzle for Prisma, TypeORM, Kysely, or raw SQL without touching services.

---

### Pattern 3: Chat Message Components

Backend returns **structured message objects** that frontend renders as components:

```typescript
// Backend response
{
  type: 'message',
  content: "Let me help you create an assessment.",
  components: [
    {
      type: 'form',
      fields: [
        { name: 'vendorName', label: 'Vendor Name', type: 'text' },
        { name: 'solutionType', label: 'Solution Type', type: 'dropdown', options: [...] }
      ]
    },
    {
      type: 'actions',
      buttons: [
        { label: 'Generate Assessment', action: 'create_assessment' }
      ]
    }
  ]
}

// Frontend renders as React components
<ChatMessage>
  <p>Let me help you create an assessment.</p>
  <Form fields={components[0].fields} />
  <ActionButtons buttons={components[1].buttons} />
</ChatMessage>
```

**Benefit:** Backend controls UI structure, frontend just renders. No business logic leaks to frontend.

---

### Pattern 4: Streaming Responses

Claude API responses streamed to frontend in real-time:

```typescript
// Backend
async function* streamAnalysis(assessment: Assessment) {
  const stream = await claudeClient.stream({...})

  for await (const chunk of stream) {
    yield chunk.content // Yield each token
  }
}

// Frontend
useEffect(() => {
  const socket = io('/chat')

  socket.on('message:stream', (chunk: string) => {
    setMessages(prev => appendToLastMessage(prev, chunk))
  })
}, [])
```

**Benefit:** Real-time chat feel, better UX than waiting 30 seconds for full response.

---

## Why This Architecture Works for Multi-Agent Development

### Clear Boundaries for Agent Assignment

**Agent 1:** Build Assessment Module
- Files: `domain/entities/Assessment.ts`, `application/services/AssessmentService.ts`, `infrastructure/database/repositories/DrizzleAssessmentRepository.ts`
- Reads: `architecture-layers.md` (this document) - knows layer rules and dependencies
- Delivers: Assessment CRUD + question generation

**Agent 2:** Build Analysis Module
- Files: `domain/business-rules/calculate*Risk.ts`, `application/services/AnalysisService.ts`, `infrastructure/ai/ClaudeResponseInterpreter.ts`
- Reads: `architecture-layers.md` - knows to use interfaces for Claude API
- Delivers: Risk scoring + Claude interpretation orchestration

**Agent 3:** Build Reporting Module
- Files: `domain/entities/Report.ts`, `application/services/ReportService.ts`
- Reads: `architecture-layers.md` - knows dependencies on Assessment + Analysis modules
- Delivers: Report generation (web view, streaming sections)

**Agent 4:** Build Export Module
- Files: `application/services/ExportService.ts`, `infrastructure/export/PDFExporter.ts`, `infrastructure/export/WordExporter.ts`, `infrastructure/export/ExcelExporter.ts`
- Reads: `architecture-layers.md` - knows to read from Reporting module
- Delivers: Multi-format export (PDF, Word, Excel, JSON, YAML) + email delivery

**Agents work in parallel** - interfaces defined upfront, implementations built independently.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-04 | Extracted from system-design.md v1.5 - Contains architecture overview, layer responsibilities, 7 module boundaries, dependency rules, and key design patterns |

---

**This document defines the FOUNDATIONAL architecture for Guardian.** All agents should read this FIRST before building any module. The layers and module boundaries are stable - changes to this document require team discussion.

**For implementation details (data flows, caching, testing), see:** `implementation-guide.md`
**For deployment and infrastructure, see:** `deployment-guide.md`
