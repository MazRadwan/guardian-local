# Epic 11: Questionnaire Extraction & Export Wiring

## Overview

Connect Claude's chat-generated questionnaires to the existing export infrastructure. When Claude outputs a questionnaire in Assessment Mode, automatically extract it, persist to database, and surface download buttons in the chat UI.

**Prerequisites:** Epic 7 (Export) complete, Epic 10 (Prompt Refinement) complete

---

## Workflow Diagram

```
User says "generate questionnaire" in Assessment Mode
       ↓
ChatServer detects trigger phrase in user message
       ↓
AssessmentService.create() → new Assessment record (draft status)
       ↓
ConversationService.linkAssessment(conversationId, assessmentId)
       ↓
Claude streams response (with <!-- QUESTIONNAIRE_START/END --> markers)
       ↓
ChatServer.ts (stream_end, abortRequested=false)
       ↓
QuestionExtractionService.handleAssistantCompletion(conversationId, assessmentId, fullResponse)
       ↓
Detects markers → MarkdownToJsonConverter → JSON envelope
       ↓
QuestionParser.parse() → validates structure (reuses existing parser)
       ↓
Transaction: deleteByAssessmentId() + bulkCreate() → atomic persistence
       ↓
AssessmentRepository.updateStatus(assessmentId, 'questions_generated')
       ↓
socket.emit('export_ready', { conversationId, assessmentId, formats: ['pdf','word','excel'] })
       ↓
Frontend useWebSocket → handles export_ready, stores assessmentId
       ↓
ChatMessage renders DownloadButton (new 'download' component type)
       ↓
User clicks → fetch with JWT → /api/assessments/:id/export/:format
       ↓
ExportService → generates file buffer → streams to browser
```

---

## Components to Build

| Component | Purpose | Layer |
|-----------|---------|-------|
| **Assessment Lifecycle Logic** | Create Assessment when user triggers "generate", link to Conversation | Application |
| **VendorService.findOrCreateDefault** | Create default vendor for assessments | Application |
| **MarkdownQuestionnaireConverter** | Convert markdown questionnaire to JSON envelope matching QuestionParser format | Infrastructure |
| **QuestionExtractionService** | Orchestrate marker detection, conversion, atomic persistence, status update | Application |
| **Prompt Updates** | Add marker instructions to guardian-prompt.md AND prompts.ts | Infrastructure |
| **ChatServer Wiring** | Inject services, detect triggers, call extraction, emit events | Infrastructure |
| **Frontend Event Plumbing** | Handle export_ready event, store assessmentId | Presentation |
| **Download Component** | New 'download' MessageComponent type rendering DownloadButton | Presentation |
| **DownloadButton Auth** | Add JWT to export requests | Presentation |

---

## Sprint 0: Assessment Lifecycle

### Story 11.0.1: Detect Generate Trigger in ChatServer

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

**Task:** Add trigger phrase detection before streaming to Claude.

**Implementation:**

Add after class properties (around line 35):

```typescript
private readonly GENERATE_TRIGGERS = [
  'generate questionnaire',
  'generate the questionnaire',
  'create questionnaire',
  'generate it',
  'go ahead',
  'yes generate',
];
```

Add method to class:

```typescript
/**
 * Detect if user message contains a questionnaire generation trigger
 */
private detectGenerateTrigger(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return this.GENERATE_TRIGGERS.some(trigger => normalized.includes(trigger));
}
```

In `handleSendMessage`, after saving user message (around line 280), add:

```typescript
const isGenerateRequest = this.detectGenerateTrigger(payload.text || payload.content || '');
```

**Acceptance Criteria:**
- [ ] `GENERATE_TRIGGERS` array defined as class property
- [ ] `detectGenerateTrigger()` method exists and returns boolean
- [ ] Method called in `handleSendMessage` before streaming
- [ ] Result stored in `isGenerateRequest` variable

**Test File:** `packages/backend/__tests__/unit/ChatServer.test.ts`

Add to existing test file:

```typescript
describe('detectGenerateTrigger', () => {
  it('returns true for "generate questionnaire"', () => {
    expect(chatServer['detectGenerateTrigger']('generate questionnaire')).toBe(true);
  });

  it('returns true for "Generate the Questionnaire please"', () => {
    expect(chatServer['detectGenerateTrigger']('Generate the Questionnaire please')).toBe(true);
  });

  it('returns true for "yes, go ahead"', () => {
    expect(chatServer['detectGenerateTrigger']('yes, go ahead')).toBe(true);
  });

  it('returns false for "tell me about questionnaires"', () => {
    expect(chatServer['detectGenerateTrigger']('tell me about questionnaires')).toBe(false);
  });

  it('returns false for regular questions', () => {
    expect(chatServer['detectGenerateTrigger']('what is HIPAA compliance?')).toBe(false);
  });
});
```

---

### Story 11.0.2: Add VendorService.findOrCreateDefault Method

**File:** `packages/backend/src/application/services/VendorService.ts`

**Task:** Add method to find or create a default vendor for assessments created from chat.

**Implementation:**

Add method to VendorService class:

```typescript
/**
 * Find existing default vendor or create one
 * Used when creating assessments from chat without explicit vendor selection
 */
async findOrCreateDefault(userId: string): Promise<Vendor> {
  const defaultVendorName = 'Chat Assessment Vendor';

  // Try to find existing default vendor
  const existing = await this.vendorRepository.findByName(defaultVendorName);
  if (existing) {
    return existing;
  }

  // Create default vendor
  const vendor = Vendor.create({
    name: defaultVendorName,
    industry: 'Healthcare Technology',
    website: null,
    contactInfo: null,
  });

  return await this.vendorRepository.create(vendor);
}
```

**If `findByName` doesn't exist on repository, add to interface:**

File: `packages/backend/src/application/interfaces/IVendorRepository.ts`

```typescript
findByName(name: string): Promise<Vendor | null>;
```

File: `packages/backend/src/infrastructure/database/repositories/DrizzleVendorRepository.ts`

```typescript
async findByName(name: string): Promise<Vendor | null> {
  const result = await db
    .select()
    .from(vendors)
    .where(eq(vendors.name, name))
    .limit(1);

  if (result.length === 0) return null;
  return Vendor.fromPersistence(result[0]);
}
```

**Acceptance Criteria:**
- [ ] `findOrCreateDefault` method exists on VendorService
- [ ] Returns existing vendor if found by name
- [ ] Creates new vendor if not found
- [ ] `findByName` method exists on repository

**Test File:** `packages/backend/__tests__/unit/VendorService.test.ts`

```typescript
describe('findOrCreateDefault', () => {
  it('returns existing default vendor when found', async () => {
    const existingVendor = Vendor.create({ name: 'Chat Assessment Vendor', industry: null, website: null, contactInfo: null });
    mockVendorRepo.findByName.mockResolvedValue(existingVendor);

    const result = await vendorService.findOrCreateDefault('user-123');

    expect(mockVendorRepo.findByName).toHaveBeenCalledWith('Chat Assessment Vendor');
    expect(mockVendorRepo.create).not.toHaveBeenCalled();
    expect(result).toBe(existingVendor);
  });

  it('creates default vendor when none exists', async () => {
    mockVendorRepo.findByName.mockResolvedValue(null);
    const createdVendor = Vendor.create({ name: 'Chat Assessment Vendor', industry: 'Healthcare Technology', website: null, contactInfo: null });
    mockVendorRepo.create.mockResolvedValue(createdVendor);

    const result = await vendorService.findOrCreateDefault('user-123');

    expect(mockVendorRepo.findByName).toHaveBeenCalled();
    expect(mockVendorRepo.create).toHaveBeenCalled();
    expect(result.name).toBe('Chat Assessment Vendor');
  });
});
```

---

### Story 11.0.3: Create Assessment on Generate Trigger

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

**Task:** When generate trigger detected AND conversation is in assessment mode with no linked assessment, create one.

**Update constructor signature (around line 45):**

```typescript
constructor(
  io: SocketIOServer,
  conversationService: ConversationService,
  claudeClient: IClaudeClient,
  rateLimiter: RateLimiter,
  jwtSecret: string,
  promptCacheManager: PromptCacheManager,
  private readonly assessmentService: AssessmentService,
  private readonly vendorService: VendorService,
) {
  // ... existing initialization
}
```

**Add imports at top:**

```typescript
import { AssessmentService } from '../../application/services/AssessmentService';
import { VendorService } from '../../application/services/VendorService';
```

**In `handleSendMessage`, after trigger detection (around line 285):**

> **IMPORTANT:** Before implementing, verify the actual `AssessmentService` method signature.
> The service may use `createAssessment()` instead of `create()`. Check
> `packages/backend/src/application/services/AssessmentService.ts` for the correct DTO shape.

```typescript
let assessmentId: string | null = null;

if (isGenerateRequest) {
  const conversation = await this.conversationService.getConversation(conversationId);

  if (conversation && conversation.mode === 'assessment' && !conversation.assessmentId) {
    try {
      // Create default vendor
      const vendor = await this.vendorService.findOrCreateDefault(socket.data.userId);

      // Create assessment in draft status
      // NOTE: Verify method name - may be createAssessment() not create()
      const assessment = await this.assessmentService.create({
        vendorId: vendor.id,
        createdBy: socket.data.userId,
        assessmentType: 'comprehensive',
        solutionName: 'Assessment from Chat',
        status: 'draft',
      });

      assessmentId = assessment.id;

      // Link assessment to conversation
      await this.conversationService.linkAssessment(conversationId, assessmentId);

      console.log(`[ChatServer] Created assessment ${assessmentId} for conversation ${conversationId}`);
    } catch (error) {
      console.error('[ChatServer] Failed to create assessment:', error);
      // Continue without assessment - extraction will be skipped
    }
  } else if (conversation?.assessmentId) {
    assessmentId = conversation.assessmentId;
  }
}
```

**Acceptance Criteria:**
- [ ] `AssessmentService` injected into ChatServer
- [ ] `VendorService` injected into ChatServer
- [ ] Assessment created only when: trigger + assessment mode + no existing link
- [ ] Assessment linked to conversation
- [ ] `assessmentId` variable available for stream handler

**Test File:** `packages/backend/__tests__/integration/assessment-lifecycle.test.ts`

```typescript
import { AssessmentService } from '../../src/application/services/AssessmentService';
import { VendorService } from '../../src/application/services/VendorService';
import { ConversationService } from '../../src/application/services/ConversationService';

describe('Assessment Lifecycle Integration', () => {
  let assessmentService: AssessmentService;
  let vendorService: VendorService;
  let conversationService: ConversationService;

  beforeEach(async () => {
    // Setup services with test database
  });

  it('creates assessment when user triggers generation in assessment mode', async () => {
    // Create conversation in assessment mode
    const conversation = await conversationService.createConversation({
      userId: 'test-user',
      mode: 'assessment',
    });

    expect(conversation.assessmentId).toBeNull();

    // Simulate trigger detection and assessment creation
    const vendor = await vendorService.findOrCreateDefault('test-user');
    const assessment = await assessmentService.create({
      vendorId: vendor.id,
      createdBy: 'test-user',
      assessmentType: 'comprehensive',
      solutionName: 'Assessment from Chat',
    });

    await conversationService.linkAssessment(conversation.id, assessment.id);

    // Verify
    const updated = await conversationService.getConversation(conversation.id);
    expect(updated?.assessmentId).toBe(assessment.id);
  });

  it('reuses existing assessment if conversation already linked', async () => {
    const vendor = await vendorService.findOrCreateDefault('test-user');
    const assessment = await assessmentService.create({
      vendorId: vendor.id,
      createdBy: 'test-user',
      assessmentType: 'comprehensive',
    });

    const conversation = await conversationService.createConversation({
      userId: 'test-user',
      mode: 'assessment',
      assessmentId: assessment.id,
    });

    // Should use existing, not create new
    expect(conversation.assessmentId).toBe(assessment.id);
  });

  it('does not create assessment in consult mode', async () => {
    const conversation = await conversationService.createConversation({
      userId: 'test-user',
      mode: 'consult',
    });

    // Even with trigger, no assessment in consult mode
    expect(conversation.assessmentId).toBeNull();
  });
});
```

---

### Story 11.0.4: Update index.ts with New Dependencies

**File:** `packages/backend/src/index.ts`

**Task:** Instantiate and inject new services into ChatServer.

**Add imports:**

```typescript
import { AssessmentService } from './application/services/AssessmentService';
import { VendorService } from './application/services/VendorService';
```

**Update ChatServer instantiation (find existing `new ChatServer` call):**

```typescript
// Ensure services are instantiated
const vendorService = new VendorService(vendorRepository);
const assessmentService = new AssessmentService(
  assessmentRepository,
  vendorRepository,
  questionRepository
);

const chatServer = new ChatServer(
  io,
  conversationService,
  claudeClient,
  rateLimiter,
  process.env.JWT_SECRET || 'dev-secret',
  promptCacheManager,
  assessmentService,
  vendorService,
);
```

**Also update `connection_ready` event to include assessmentId for reconnect scenarios:**

In ChatServer.ts `handleConnection` method, when emitting `connection_ready`:

```typescript
// When resuming existing conversation, include assessmentId
socket.emit('connection_ready', {
  conversationId: existingConversation?.id || null,
  resumed: !!existingConversation,
  hasActiveConversation: !!existingConversation,
  assessmentId: existingConversation?.assessmentId || null,  // ADD THIS
});
```

**Acceptance Criteria:**
- [ ] VendorService instantiated
- [ ] AssessmentService instantiated
- [ ] Both passed to ChatServer constructor
- [ ] Server starts without errors
- [ ] `connection_ready` event includes `assessmentId` for reconnect scenarios

---

## Sprint 1: Prompt & Markers

### Story 11.1.1: Add Marker Instructions to guardian-prompt.md

**File:** `packages/backend/guardian-prompt.md`

**Task:** Add instructions for Claude to wrap questionnaire output in markers.

**Find the "WEB APPLICATION WORKFLOW" section and update step 4:**

```markdown
4. **Generate the Questionnaire**
   When user confirms, generate the customized questionnaire directly in chat.

   **CRITICAL: Output Format for System Processing**
   You MUST wrap the entire questionnaire in these exact XML-style markers:

   <!-- QUESTIONNAIRE_START -->
   [Your questionnaire content here]
   <!-- QUESTIONNAIRE_END -->

   These markers allow the system to automatically detect, extract, and process the questionnaire for export functionality.

   **Structure inside markers:**

   ## Section 1: Privacy Compliance
   1. [Question text - must be at least 10 characters]
   2. [Question text]

   ## Section 2: Security Architecture
   1. [Question text]
   2. [Question text]

   Continue for all relevant sections based on the assessment type and vendor context.

   **Section numbering:** Use "## Section N: [Name]" format where N is 1-11.
   **Question numbering:** Use "1. " numbered list format within each section.
```

**Acceptance Criteria:**
- [ ] Marker instructions added to guardian-prompt.md
- [ ] Format specifies `<!-- QUESTIONNAIRE_START -->` and `<!-- QUESTIONNAIRE_END -->`
- [ ] Format specifies section headers with numbers
- [ ] Format specifies numbered questions within sections

---

### Story 11.1.2: Add Marker Instructions to prompts.ts Fallback

**File:** `packages/backend/src/infrastructure/ai/prompts.ts`

**Task:** Add same marker instructions to `ASSESSMENT_MODE_PROMPT` and `ASSESSMENT_MODE_PREAMBLE`.

**Update ASSESSMENT_MODE_PROMPT (around line 175, after "WHEN YOU'RE READY:" section):**

```typescript
QUESTIONNAIRE OUTPUT FORMAT:
When generating the questionnaire, you MUST wrap it in these exact markers:

<!-- QUESTIONNAIRE_START -->
[Questionnaire content organized by section]
<!-- QUESTIONNAIRE_END -->

Use this structure inside the markers:

## Section 1: Privacy Compliance
1. [Question text - minimum 10 characters]
2. [Question text]

## Section 2: Security Architecture
1. [Question text]

Continue for all relevant sections (up to 11 risk dimensions).
The markers are REQUIRED for the system to process the questionnaire for export.
```

**Also update ASSESSMENT_MODE_PREAMBLE (around line 255) with similar instructions:**

```typescript
QUESTIONNAIRE OUTPUT REQUIREMENT:
When you generate a questionnaire, ALWAYS wrap it in markers:
<!-- QUESTIONNAIRE_START -->
[content]
<!-- QUESTIONNAIRE_END -->
This is required for the export system to work.
```

**Acceptance Criteria:**
- [ ] `ASSESSMENT_MODE_PROMPT` has marker instructions
- [ ] `ASSESSMENT_MODE_PREAMBLE` has marker instructions
- [ ] Instructions match guardian-prompt.md format

---

### Story 11.1.3: Manual Test - Verify Claude Outputs Markers

**Task:** Manual verification that Claude outputs markers correctly.

**Test Steps:**

1. Ensure backend running with `guardian-prompt.md` present:
   ```bash
   ls packages/backend/guardian-prompt.md
   pnpm --filter @guardian/backend dev
   ```

2. Start frontend:
   ```bash
   pnpm --filter @guardian/web dev
   ```

3. Login and switch to Assessment Mode via dropdown

4. Complete basic intake:
   - "I want to evaluate a clinical AI diagnostic tool"
   - Select option "2" (Comprehensive)
   - Provide brief context when asked

5. Say "generate questionnaire"

6. Check Claude's response contains:
   - `<!-- QUESTIONNAIRE_START -->` near beginning of questionnaire
   - `<!-- QUESTIONNAIRE_END -->` at end
   - Sections formatted as `## Section N: Name`
   - Questions as numbered lists

7. Repeat test with custom prompt disabled (rename guardian-prompt.md temporarily):
   ```bash
   mv packages/backend/guardian-prompt.md packages/backend/guardian-prompt.md.bak
   # Restart backend
   # Test again
   mv packages/backend/guardian-prompt.md.bak packages/backend/guardian-prompt.md
   ```

8. **Cold cache test** (prompt cache miss scenario):
   ```bash
   # Clear prompt cache by restarting backend
   pkill -f "guardian/backend"
   pnpm --filter @guardian/backend dev
   # Wait for startup, then test immediately before cache warms
   # Verify markers still appear in output
   ```

**Acceptance Criteria:**
- [ ] Markers present in Claude output with custom prompt
- [ ] Markers present in Claude output with fallback prompt
- [ ] Markers present when prompt cache is cold (first request after restart)
- [ ] Questions organized by numbered sections
- [ ] Section format matches expected pattern

---

## Sprint 2: Markdown-to-JSON Converter

### Story 11.2.1: Create MarkdownQuestionnaireConverter

**File:** `packages/backend/src/infrastructure/ai/converters/MarkdownQuestionnaireConverter.ts` (NEW)

**Task:** Create utility class to convert markdown questionnaire to JSON envelope.

**Create directory if needed:**
```bash
mkdir -p packages/backend/src/infrastructure/ai/converters
```

**Implementation:**

```typescript
/**
 * Converts markdown-formatted questionnaire to JSON envelope
 * matching QuestionParser expected input format.
 *
 * Expected markdown format:
 * ## Section 1: Privacy Compliance
 * 1. Question text here?
 * 2. Another question?
 *
 * ## Section 2: Security Architecture
 * 1. Security question?
 */

export interface ConvertedQuestion {
  sectionName: string;
  sectionNumber: number;
  questionNumber: number;
  questionText: string;
  questionType: 'text' | 'enum' | 'boolean';
  questionMetadata?: {
    required?: boolean;
    helpText?: string;
    enumOptions?: string[];
  };
}

export interface ConvertedQuestionnaire {
  questions: ConvertedQuestion[];
}

export class MarkdownQuestionnaireConverter {
  private static readonly SECTION_REGEX = /^##\s*Section\s*(\d+):\s*(.+)$/i;
  private static readonly QUESTION_REGEX = /^(\d+)\.\s*(.+)$/;

  /**
   * Convert markdown questionnaire to JSON envelope
   * @param markdown - Raw markdown with section headers and numbered questions
   * @returns JSON envelope matching QuestionParser expected format
   * @throws Error if no sections found or invalid format
   */
  static convert(markdown: string): ConvertedQuestionnaire {
    const sections = this.extractSections(markdown);

    if (sections.length === 0) {
      throw new Error('No sections found in questionnaire markdown. Expected format: "## Section N: Name"');
    }

    const questions: ConvertedQuestion[] = [];

    for (const section of sections) {
      const sectionQuestions = this.extractQuestions(section);
      questions.push(...sectionQuestions);
    }

    if (questions.length === 0) {
      throw new Error('No questions found in questionnaire markdown. Expected format: "1. Question text"');
    }

    return { questions };
  }

  /**
   * Extract sections from markdown
   */
  private static extractSections(markdown: string): Array<{
    sectionNumber: number;
    sectionName: string;
    content: string;
  }> {
    const lines = markdown.split('\n');
    const sections: Array<{ sectionNumber: number; sectionName: string; content: string }> = [];

    let currentSection: { sectionNumber: number; sectionName: string; lines: string[] } | null = null;

    for (const line of lines) {
      const sectionMatch = line.match(this.SECTION_REGEX);

      if (sectionMatch) {
        // Save previous section
        if (currentSection) {
          sections.push({
            sectionNumber: currentSection.sectionNumber,
            sectionName: currentSection.sectionName,
            content: currentSection.lines.join('\n'),
          });
        }

        // Start new section
        currentSection = {
          sectionNumber: parseInt(sectionMatch[1], 10),
          sectionName: sectionMatch[2].trim(),
          lines: [],
        };
      } else if (currentSection) {
        currentSection.lines.push(line);
      }
    }

    // Don't forget last section
    if (currentSection) {
      sections.push({
        sectionNumber: currentSection.sectionNumber,
        sectionName: currentSection.sectionName,
        content: currentSection.lines.join('\n'),
      });
    }

    return sections;
  }

  /**
   * Extract questions from a section
   */
  private static extractQuestions(section: {
    sectionNumber: number;
    sectionName: string;
    content: string;
  }): ConvertedQuestion[] {
    const questions: ConvertedQuestion[] = [];
    const lines = section.content.split('\n');

    let currentQuestionNum: number | null = null;
    let currentQuestionLines: string[] = [];

    const saveCurrentQuestion = () => {
      if (currentQuestionNum !== null && currentQuestionLines.length > 0) {
        const questionText = currentQuestionLines.join(' ').trim();

        // Skip questions shorter than 10 characters (likely parsing artifacts)
        if (questionText.length >= 10) {
          questions.push({
            sectionName: section.sectionName,
            sectionNumber: section.sectionNumber,
            questionNumber: currentQuestionNum,
            questionText,
            questionType: this.inferQuestionType(questionText),
            questionMetadata: {
              required: true,
            },
          });
        }
      }
    };

    for (const line of lines) {
      const questionMatch = line.match(this.QUESTION_REGEX);

      if (questionMatch) {
        // Save previous question
        saveCurrentQuestion();

        // Start new question
        currentQuestionNum = parseInt(questionMatch[1], 10);
        currentQuestionLines = [questionMatch[2].trim()];
      } else if (currentQuestionNum !== null && line.trim()) {
        // Continuation of current question (multi-line)
        currentQuestionLines.push(line.trim());
      }
    }

    // Don't forget last question
    saveCurrentQuestion();

    return questions;
  }

  /**
   * Infer question type from text content
   *
   * TODO: Future enhancement - support explicit metadata hints in markdown:
   *   1. Question text here? [Type: enum] [Options: High, Medium, Low]
   *   or
   *   1. Question text here?
   *      Type: enum
   *      Options: High, Medium, Low
   *
   * This would allow prompt engineering to specify exact types/options
   * without relying solely on text inference.
   */
  private static inferQuestionType(text: string): 'text' | 'enum' | 'boolean' {
    const lowerText = text.toLowerCase();

    // Boolean indicators
    if (
      lowerText.includes('yes or no') ||
      lowerText.includes('(yes/no)') ||
      lowerText.includes('yes/no') ||
      lowerText.match(/^(does|is|are|has|have|can|will|do)\s/i)
    ) {
      return 'boolean';
    }

    // TODO: Add enum detection for patterns like:
    // - "select from:" or "choose:"
    // - "[Options: A, B, C]" inline hints
    // - Indented "Options:" block after question

    // For now, default to text
    return 'text';
  }
}
```

**Acceptance Criteria:**
- [ ] File created at `packages/backend/src/infrastructure/ai/converters/MarkdownQuestionnaireConverter.ts`
- [ ] `convert()` static method accepts markdown string
- [ ] Returns JSON matching QuestionParser expected format
- [ ] Throws descriptive errors for invalid input
- [ ] Handles multi-line questions
- [ ] Infers boolean type for yes/no questions

---

### Story 11.2.2: Unit Tests for MarkdownQuestionnaireConverter

**File:** `packages/backend/__tests__/unit/MarkdownQuestionnaireConverter.test.ts` (NEW)

**Implementation:**

```typescript
import { MarkdownQuestionnaireConverter } from '../../src/infrastructure/ai/converters/MarkdownQuestionnaireConverter';

describe('MarkdownQuestionnaireConverter', () => {
  describe('convert', () => {
    it('converts valid markdown with multiple sections', () => {
      const markdown = `
## Section 1: Privacy Compliance
1. Does the vendor have a documented privacy policy?
2. How is personal health information (PHI) stored and protected?

## Section 2: Security Architecture
1. What encryption standards are used for data at rest?
2. Is data encrypted in transit using TLS 1.2 or higher?
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions).toHaveLength(4);
      expect(result.questions[0]).toMatchObject({
        sectionNumber: 1,
        sectionName: 'Privacy Compliance',
        questionNumber: 1,
        questionText: 'Does the vendor have a documented privacy policy?',
        questionType: 'boolean',
      });
      expect(result.questions[2]).toMatchObject({
        sectionNumber: 2,
        sectionName: 'Security Architecture',
        questionNumber: 1,
      });
    });

    it('handles sections with varying question counts', () => {
      const markdown = `
## Section 1: Short Section
1. Single question in this section?

## Section 2: Longer Section
1. First question?
2. Second question?
3. Third question?
4. Fourth question?
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions.filter(q => q.sectionNumber === 1)).toHaveLength(1);
      expect(result.questions.filter(q => q.sectionNumber === 2)).toHaveLength(4);
    });

    it('infers boolean type for yes/no questions', () => {
      const markdown = `
## Section 1: Test
1. Does the vendor comply with HIPAA requirements? (yes/no)
2. Is multi-factor authentication enabled?
3. Describe the vendor's security certifications.
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions[0].questionType).toBe('boolean');
      expect(result.questions[1].questionType).toBe('boolean');
      expect(result.questions[2].questionType).toBe('text');
    });

    it('handles multi-line questions', () => {
      const markdown = `
## Section 1: Complex Questions
1. This is a long question that spans
   multiple lines and should be combined
   into a single question text.
2. Short question?
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions[0].questionText).toContain('multiple lines');
      expect(result.questions[0].questionText).not.toContain('\n');
    });

    it('throws error for empty markdown', () => {
      expect(() => MarkdownQuestionnaireConverter.convert('')).toThrow('No sections found');
    });

    it('throws error for markdown without sections', () => {
      const markdown = 'Just some text without any section headers.';
      expect(() => MarkdownQuestionnaireConverter.convert(markdown)).toThrow('No sections found');
    });

    it('throws error for sections without questions', () => {
      const markdown = `
## Section 1: Empty Section
This section has no numbered questions, just text.

## Section 2: Also Empty
More text but no questions.
`;
      expect(() => MarkdownQuestionnaireConverter.convert(markdown)).toThrow('No questions found');
    });

    it('skips questions shorter than 10 characters', () => {
      const markdown = `
## Section 1: Test
1. Too short
2. This is a valid question with enough characters?
3. Nope
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].questionText).toContain('valid question');
    });

    it('handles case-insensitive section headers', () => {
      const markdown = `
## SECTION 1: UPPERCASE
1. Question in uppercase section?

## section 2: lowercase
1. Question in lowercase section?
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions).toHaveLength(2);
    });

    it('preserves section names with special characters', () => {
      const markdown = `
## Section 1: Privacy & Data Protection
1. How is PII handled?
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions[0].sectionName).toBe('Privacy & Data Protection');
    });
  });
});
```

**Acceptance Criteria:**
- [ ] Test file created
- [ ] Tests cover: valid input, multiple sections, boolean detection, multi-line, empty input, no sections, no questions, short questions, case insensitivity
- [ ] All tests pass: `pnpm --filter @guardian/backend test MarkdownQuestionnaireConverter`

---

## Sprint 3: Extraction Service

### Story 11.3.1: Create QuestionExtractionService

**File:** `packages/backend/src/application/services/QuestionExtractionService.ts` (NEW)

**Task:** Create service to orchestrate questionnaire extraction from Claude responses.

**Implementation:**

```typescript
import { IQuestionRepository } from '../interfaces/IQuestionRepository';
import { IAssessmentRepository } from '../interfaces/IAssessmentRepository';
import { MarkdownQuestionnaireConverter } from '../../infrastructure/ai/converters/MarkdownQuestionnaireConverter';
import { QuestionParser } from '../../infrastructure/ai/parsers/QuestionParser';
import { Question } from '../../domain/entities/Question';
// NOTE: Verify actual import path - existing repos may use 'client' not 'connection'
// Check: packages/backend/src/infrastructure/database/ for the correct export
import { db } from '../../infrastructure/database/connection';

export interface ExtractionResult {
  success: boolean;
  assessmentId: string;
  questionCount: number;
  error?: string;
}

export class QuestionExtractionService {
  private readonly MARKER_START = '<!-- QUESTIONNAIRE_START -->';
  private readonly MARKER_END = '<!-- QUESTIONNAIRE_END -->';

  constructor(
    private readonly questionRepository: IQuestionRepository,
    private readonly assessmentRepository: IAssessmentRepository,
  ) {}

  /**
   * Handle assistant completion and extract questionnaire if present
   * @param conversationId - The conversation ID (for logging)
   * @param assessmentId - The linked assessment ID (or null)
   * @param fullResponse - Complete assistant response text
   * @returns ExtractionResult with success status and question count, or null if no markers
   */
  async handleAssistantCompletion(
    conversationId: string,
    assessmentId: string | null,
    fullResponse: string
  ): Promise<ExtractionResult | null> {
    // 1. Check for markers
    if (!this.hasQuestionnaireMarkers(fullResponse)) {
      return null; // Not a questionnaire response
    }

    console.log(`[QuestionExtractionService] Questionnaire markers detected in conversation ${conversationId}`);

    // 2. Verify we have an assessment
    if (!assessmentId) {
      console.warn('[QuestionExtractionService] Markers found but no assessmentId');
      return {
        success: false,
        assessmentId: '',
        questionCount: 0,
        error: 'No assessment linked to conversation',
      };
    }

    // 3. Verify assessment exists and is in draft status
    const assessment = await this.assessmentRepository.findById(assessmentId);
    if (!assessment) {
      return {
        success: false,
        assessmentId,
        questionCount: 0,
        error: 'Assessment not found',
      };
    }

    if (assessment.status !== 'draft') {
      return {
        success: false,
        assessmentId,
        questionCount: 0,
        error: `Assessment must be in draft status, current: ${assessment.status}`,
      };
    }

    try {
      // 4. Extract content between markers
      const markedContent = this.extractMarkedContent(fullResponse);
      if (!markedContent) {
        throw new Error('Failed to extract content between markers');
      }

      console.log(`[QuestionExtractionService] Extracted ${markedContent.length} chars of questionnaire content`);

      // 5. Convert markdown to JSON envelope
      const jsonEnvelope = MarkdownQuestionnaireConverter.convert(markedContent);

      console.log(`[QuestionExtractionService] Converted to ${jsonEnvelope.questions.length} questions`);

      // 6. Convert to Question entities
      const questionEntities = jsonEnvelope.questions.map((q) =>
        Question.create({
          assessmentId,
          sectionName: q.sectionName,
          sectionNumber: q.sectionNumber,
          questionNumber: q.questionNumber,
          questionText: q.questionText,
          questionType: q.questionType,
          questionMetadata: q.questionMetadata,
        })
      );

      // 7. Atomic persistence (delete existing + insert new in transaction)
      await this.persistQuestionsAtomically(assessmentId, questionEntities);

      // 8. Update assessment status
      await this.assessmentRepository.updateStatus(assessmentId, 'questions_generated');

      console.log(`[QuestionExtractionService] Successfully extracted ${questionEntities.length} questions for assessment ${assessmentId}`);

      return {
        success: true,
        assessmentId,
        questionCount: questionEntities.length,
      };

    } catch (error) {
      console.error('[QuestionExtractionService] Extraction failed:', error);
      return {
        success: false,
        assessmentId,
        questionCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if response contains questionnaire markers
   */
  hasQuestionnaireMarkers(response: string): boolean {
    return response.includes(this.MARKER_START) && response.includes(this.MARKER_END);
  }

  /**
   * Extract content between markers
   */
  extractMarkedContent(response: string): string | null {
    const startIdx = response.indexOf(this.MARKER_START);
    const endIdx = response.indexOf(this.MARKER_END);

    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      return null;
    }

    return response.slice(startIdx + this.MARKER_START.length, endIdx).trim();
  }

  /**
   * Persist questions atomically (delete + insert in transaction)
   */
  private async persistQuestionsAtomically(
    assessmentId: string,
    questions: Question[]
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // Delete existing questions to prevent unique constraint violations
      await this.questionRepository.deleteByAssessmentId(assessmentId);

      // Bulk insert new questions
      if (questions.length > 0) {
        await this.questionRepository.bulkCreate(questions);
      }
    });
  }
}
```

**Also create interface:** `packages/backend/src/application/interfaces/IQuestionExtractionService.ts`

```typescript
import { ExtractionResult } from '../services/QuestionExtractionService';

export interface IQuestionExtractionService {
  handleAssistantCompletion(
    conversationId: string,
    assessmentId: string | null,
    fullResponse: string
  ): Promise<ExtractionResult | null>;

  hasQuestionnaireMarkers(response: string): boolean;
  extractMarkedContent(response: string): string | null;
}
```

**Acceptance Criteria:**
- [ ] Service file created
- [ ] Interface file created
- [ ] `handleAssistantCompletion` method implemented
- [ ] Marker detection methods implemented
- [ ] Atomic persistence with transaction
- [ ] Proper error handling and logging

---

### Story 11.3.2: Unit Tests for QuestionExtractionService

**File:** `packages/backend/__tests__/unit/QuestionExtractionService.test.ts` (NEW)

**Implementation:**

```typescript
import { QuestionExtractionService } from '../../src/application/services/QuestionExtractionService';
import { IQuestionRepository } from '../../src/application/interfaces/IQuestionRepository';
import { IAssessmentRepository } from '../../src/application/interfaces/IAssessmentRepository';

describe('QuestionExtractionService', () => {
  let service: QuestionExtractionService;
  let mockQuestionRepo: jest.Mocked<IQuestionRepository>;
  let mockAssessmentRepo: jest.Mocked<IAssessmentRepository>;

  beforeEach(() => {
    mockQuestionRepo = {
      bulkCreate: jest.fn().mockResolvedValue([]),
      deleteByAssessmentId: jest.fn().mockResolvedValue(undefined),
      findByAssessmentId: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
    } as any;

    mockAssessmentRepo = {
      findById: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    } as any;

    service = new QuestionExtractionService(mockQuestionRepo, mockAssessmentRepo);
  });

  describe('hasQuestionnaireMarkers', () => {
    it('returns true when both markers present', () => {
      const response = 'Some text <!-- QUESTIONNAIRE_START --> content <!-- QUESTIONNAIRE_END --> more text';
      expect(service.hasQuestionnaireMarkers(response)).toBe(true);
    });

    it('returns false when start marker missing', () => {
      const response = 'content <!-- QUESTIONNAIRE_END -->';
      expect(service.hasQuestionnaireMarkers(response)).toBe(false);
    });

    it('returns false when end marker missing', () => {
      const response = '<!-- QUESTIONNAIRE_START --> content';
      expect(service.hasQuestionnaireMarkers(response)).toBe(false);
    });

    it('returns false when no markers', () => {
      const response = 'Just regular text without any markers';
      expect(service.hasQuestionnaireMarkers(response)).toBe(false);
    });
  });

  describe('extractMarkedContent', () => {
    it('extracts content between markers', () => {
      const response = 'prefix <!-- QUESTIONNAIRE_START -->the content<!-- QUESTIONNAIRE_END --> suffix';
      expect(service.extractMarkedContent(response)).toBe('the content');
    });

    it('trims whitespace from extracted content', () => {
      const response = '<!-- QUESTIONNAIRE_START -->\n  content with whitespace  \n<!-- QUESTIONNAIRE_END -->';
      expect(service.extractMarkedContent(response)).toBe('content with whitespace');
    });

    it('returns null if markers missing', () => {
      expect(service.extractMarkedContent('no markers')).toBeNull();
    });

    it('returns null if markers in wrong order', () => {
      const response = '<!-- QUESTIONNAIRE_END -->content<!-- QUESTIONNAIRE_START -->';
      expect(service.extractMarkedContent(response)).toBeNull();
    });
  });

  describe('handleAssistantCompletion', () => {
    const validQuestionnaire = `
<!-- QUESTIONNAIRE_START -->
## Section 1: Privacy Compliance
1. Does the vendor have a privacy policy?
2. How is personal data protected?

## Section 2: Security
1. What encryption is used?
<!-- QUESTIONNAIRE_END -->
`;

    it('returns null if no markers in response', async () => {
      const result = await service.handleAssistantCompletion('conv-1', 'assess-1', 'no markers here');
      expect(result).toBeNull();
      expect(mockQuestionRepo.bulkCreate).not.toHaveBeenCalled();
    });

    it('returns error if no assessmentId provided', async () => {
      const result = await service.handleAssistantCompletion('conv-1', null, validQuestionnaire);

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.error).toContain('No assessment linked');
    });

    it('returns error if assessment not found', async () => {
      mockAssessmentRepo.findById.mockResolvedValue(null);

      const result = await service.handleAssistantCompletion('conv-1', 'assess-1', validQuestionnaire);

      expect(result?.success).toBe(false);
      expect(result?.error).toBe('Assessment not found');
    });

    it('returns error if assessment not in draft status', async () => {
      mockAssessmentRepo.findById.mockResolvedValue({ status: 'questions_generated' } as any);

      const result = await service.handleAssistantCompletion('conv-1', 'assess-1', validQuestionnaire);

      expect(result?.success).toBe(false);
      expect(result?.error).toContain('must be in draft status');
    });

    it('extracts and persists questions successfully', async () => {
      mockAssessmentRepo.findById.mockResolvedValue({ id: 'assess-1', status: 'draft' } as any);

      const result = await service.handleAssistantCompletion('conv-1', 'assess-1', validQuestionnaire);

      expect(result?.success).toBe(true);
      expect(result?.questionCount).toBe(3);
      expect(mockQuestionRepo.deleteByAssessmentId).toHaveBeenCalledWith('assess-1');
      expect(mockQuestionRepo.bulkCreate).toHaveBeenCalled();
      expect(mockAssessmentRepo.updateStatus).toHaveBeenCalledWith('assess-1', 'questions_generated');
    });

    it('handles conversion errors gracefully', async () => {
      mockAssessmentRepo.findById.mockResolvedValue({ id: 'assess-1', status: 'draft' } as any);

      const badQuestionnaire = '<!-- QUESTIONNAIRE_START -->no valid sections<!-- QUESTIONNAIRE_END -->';

      const result = await service.handleAssistantCompletion('conv-1', 'assess-1', badQuestionnaire);

      expect(result?.success).toBe(false);
      expect(result?.error).toContain('No sections found');
    });
  });
});
```

**Acceptance Criteria:**
- [ ] Test file created
- [ ] Tests cover marker detection, content extraction, all error cases, success case
- [ ] All tests pass: `pnpm --filter @guardian/backend test QuestionExtractionService`

---

## Sprint 4: ChatServer Wiring

### Story 11.4.1: Inject QuestionExtractionService into ChatServer

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

**Task:** Add extraction service injection.

**Update constructor (extend from Story 11.0.3):**

```typescript
import { QuestionExtractionService, ExtractionResult } from '../../application/services/QuestionExtractionService';

constructor(
  io: SocketIOServer,
  conversationService: ConversationService,
  claudeClient: IClaudeClient,
  rateLimiter: RateLimiter,
  jwtSecret: string,
  promptCacheManager: PromptCacheManager,
  private readonly assessmentService: AssessmentService,
  private readonly vendorService: VendorService,
  private readonly questionExtractionService: QuestionExtractionService,
) {
  // ... existing initialization
}
```

**Update index.ts instantiation:**

```typescript
import { QuestionExtractionService } from './application/services/QuestionExtractionService';

// After repository instantiation:
const questionExtractionService = new QuestionExtractionService(
  questionRepository,
  assessmentRepository
);

const chatServer = new ChatServer(
  io,
  conversationService,
  claudeClient,
  rateLimiter,
  process.env.JWT_SECRET || 'dev-secret',
  promptCacheManager,
  assessmentService,
  vendorService,
  questionExtractionService,
);
```

**Acceptance Criteria:**
- [ ] Service added to ChatServer constructor
- [ ] Service instantiated in index.ts
- [ ] No runtime errors on startup
- [ ] **Update any ChatServer test mocks** to include new constructor params

---

### Story 11.4.2: Call Extraction Service on Stream End (Fire-and-Forget)

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

**Task:** Call extraction service after saving assistant message, emit export_ready on success. Use fire-and-forget pattern to avoid blocking socket event.

**Update stream completion handler (after saving message, around line 355):**

```typescript
// After: const completeMessage = await this.conversationService.sendMessage(...)
// Before: socket.emit('assistant_done', ...)

// Emit assistant_done IMMEDIATELY (don't wait for extraction)
if (!socket.data.abortRequested) {
  socket.emit('assistant_done', {
    messageId: completeMessage.id,
    conversationId,
    fullText: fullResponse,
    assessmentId: assessmentId || null,
  });
}

// Fire-and-forget extraction (non-blocking)
// Do NOT await this - extraction runs in background after socket event completes
if (!socket.data.abortRequested && assessmentId) {
  this.attemptQuestionnaireExtraction(socket, conversationId, assessmentId, fullResponse);
}
```

**Add private helper method to ChatServer class:**

```typescript
/**
 * Attempt questionnaire extraction in background (fire-and-forget)
 * Emits export_ready event on success, logs errors on failure
 * Does NOT block the socket event handler
 */
private attemptQuestionnaireExtraction(
  socket: Socket,
  conversationId: string,
  assessmentId: string,
  fullResponse: string
): void {
  // Intentionally not awaited - runs in background
  this.questionExtractionService
    .handleAssistantCompletion(conversationId, assessmentId, fullResponse)
    .then((extractionResult) => {
      if (extractionResult?.success) {
        console.log(`[ChatServer] Extracted ${extractionResult.questionCount} questions for assessment ${assessmentId}`);

        // Emit export_ready to THIS socket only (not broadcast)
        socket.emit('export_ready', {
          conversationId,
          assessmentId,
          formats: ['pdf', 'word', 'excel'] as const,
          questionCount: extractionResult.questionCount,
        });
      } else if (extractionResult) {
        console.warn(`[ChatServer] Extraction failed: ${extractionResult.error}`);

        // Emit extraction_failed for UI to show error
        socket.emit('extraction_failed', {
          conversationId,
          assessmentId,
          error: extractionResult.error,
        });
      }
      // extractionResult === null means no markers found, which is normal
    })
    .catch((error) => {
      console.error('[ChatServer] Extraction service error:', error);
      // Don't fail the socket connection for extraction errors
    });
}
```

**Acceptance Criteria:**
- [ ] Extraction service called after message saved
- [ ] Only called if not aborted and assessmentId exists
- [ ] **Uses fire-and-forget pattern (NOT awaited)** - socket event completes immediately
- [ ] `assistant_done` emitted BEFORE extraction starts
- [ ] `export_ready` emitted on successful extraction
- [ ] `extraction_failed` emitted on extraction error
- [ ] Uses `socket.emit()` not broadcast
- [ ] Errors caught and logged, don't break chat

---

### Story 11.4.3: Integration Test - Stream to Export Ready

**File:** `packages/backend/__tests__/integration/questionnaire-extraction.integration.test.ts` (NEW)

**Implementation:**

```typescript
import { Server } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { ChatServer } from '../../src/infrastructure/websocket/ChatServer';

describe('Questionnaire Extraction Integration', () => {
  let httpServer: any;
  let ioServer: Server;
  let chatServer: ChatServer;
  let clientSocket: ClientSocket;

  beforeAll(async () => {
    // Setup test server with mocked Claude client
  });

  afterAll(async () => {
    clientSocket?.disconnect();
    await ioServer?.close();
    httpServer?.close();
  });

  it('emits export_ready when questionnaire markers detected', async () => {
    const events: any[] = [];

    clientSocket.on('export_ready', (data) => {
      events.push({ type: 'export_ready', data });
    });

    clientSocket.on('assistant_done', (data) => {
      events.push({ type: 'assistant_done', data });
    });

    // Mock Claude to return questionnaire with markers
    mockClaudeClient.streamMessage.mockImplementation(async function* () {
      yield {
        content: `Here's your questionnaire:
<!-- QUESTIONNAIRE_START -->
## Section 1: Privacy Compliance
1. Does the vendor have a documented privacy policy that addresses PHI handling?
2. How does the vendor ensure compliance with HIPAA regulations?
<!-- QUESTIONNAIRE_END -->
That's the questionnaire.`,
        isComplete: false
      };
      yield { content: '', isComplete: true };
    });

    // Setup: create conversation with linked assessment
    // ... test setup code

    // Send message that triggers questionnaire
    clientSocket.emit('send_message', {
      conversationId: testConversationId,
      text: 'generate questionnaire',
    });

    // Wait for events
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify export_ready emitted
    const exportReady = events.find(e => e.type === 'export_ready');
    expect(exportReady).toBeDefined();
    expect(exportReady.data.assessmentId).toBeDefined();
    expect(exportReady.data.formats).toEqual(['pdf', 'word', 'excel']);
    expect(exportReady.data.questionCount).toBe(2);

    // Verify assistant_done has extraction info
    const assistantDone = events.find(e => e.type === 'assistant_done');
    expect(assistantDone.data.extraction?.success).toBe(true);
  });

  it('does not emit export_ready when no markers present', async () => {
    const events: any[] = [];

    clientSocket.on('export_ready', (data) => {
      events.push({ type: 'export_ready', data });
    });

    // Mock Claude to return normal response without markers
    mockClaudeClient.streamMessage.mockImplementation(async function* () {
      yield { content: 'Here is some helpful information about HIPAA compliance.', isComplete: false };
      yield { content: '', isComplete: true };
    });

    clientSocket.emit('send_message', {
      conversationId: testConversationId,
      text: 'tell me about HIPAA',
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const exportReady = events.find(e => e.type === 'export_ready');
    expect(exportReady).toBeUndefined();
  });
});
```

**Acceptance Criteria:**
- [ ] Test file created
- [ ] Tests verify export_ready emission on success
- [ ] Tests verify no emission when no markers
- [ ] Tests pass

---

## Sprint 5: Frontend Event Plumbing

### Story 11.5.1: Add export_ready Event Types

**File:** `apps/web/src/lib/websocket.ts`

**Task:** Add TypeScript types for export_ready event.

**Add interfaces:**

```typescript
export interface ExportReadyPayload {
  conversationId: string;
  assessmentId: string;
  formats: Array<'pdf' | 'word' | 'excel'>;
  questionCount: number;
}

// Update existing AssistantDonePayload if present, or add:
export interface AssistantDonePayload {
  messageId: string;
  conversationId: string;
  fullText: string;
  assessmentId?: string | null;
  extraction?: {
    success: boolean;
    questionCount: number;
    error?: string;
  } | null;
}
```

**Acceptance Criteria:**
- [ ] `ExportReadyPayload` interface defined and exported
- [ ] `AssistantDonePayload` updated with extraction info
- [ ] Types compile without errors

---

### Story 11.5.2: Add export_ready Handler to useWebSocket

**File:** `apps/web/src/hooks/useWebSocket.ts`

**Task:** Add callback parameter and registration for export_ready event.

**Update UseWebSocketOptions interface:**

```typescript
export interface UseWebSocketOptions {
  // ... existing options
  onExportReady?: (data: ExportReadyPayload) => void;
}
```

**Update hook function signature:**

```typescript
export function useWebSocket({
  // ... existing params
  onExportReady,
}: UseWebSocketOptions) {
```

**Add event registration in useEffect (with other event registrations):**

```typescript
if (onExportReady) {
  const handleExportReady = (data: ExportReadyPayload) => {
    onExportReady(data);
  };

  client.socket.on('export_ready', handleExportReady);
  unsubscribers.push(() => client.socket.off('export_ready', handleExportReady));
}
```

**Update dependency array to include `onExportReady`.**

**Acceptance Criteria:**
- [ ] `onExportReady` added to options interface
- [ ] Parameter added to hook function
- [ ] Event registration added in useEffect
- [ ] Added to dependency array
- [ ] Cleanup unsubscribes on unmount

---

### Story 11.5.3: Add handleExportReady to useWebSocketEvents

**File:** `apps/web/src/hooks/useWebSocketEvents.ts`

**Task:** Add stable handler for export_ready event.

**Add to hook parameters interface:**

```typescript
interface UseWebSocketEventsParams {
  // ... existing params
  setExportReady: (data: { assessmentId: string; formats: string[]; questionCount: number } | null) => void;
}
```

**Add handler in hook:**

```typescript
const handleExportReady = useCallback(
  (data: ExportReadyPayload) => {
    // Ignore if for different conversation
    if (data.conversationId !== activeConversationId) {
      console.warn('[useWebSocketEvents] Ignoring export_ready for inactive conversation');
      return;
    }

    console.log('[useWebSocketEvents] Export ready:', data);

    setExportReady({
      assessmentId: data.assessmentId,
      formats: data.formats,
      questionCount: data.questionCount,
    });
  },
  [activeConversationId, setExportReady]
);
```

**Add to return object:**

```typescript
return {
  // ... existing handlers
  handleExportReady,
};
```

**Acceptance Criteria:**
- [ ] `handleExportReady` handler added with useCallback
- [ ] Filters by activeConversationId
- [ ] Calls store action with payload
- [ ] Handler returned from hook

---

### Story 11.5.4: Add Export State to Chat Store (Per-Conversation)

**File:** `apps/web/src/stores/chatStore.ts` (or equivalent state management)

**Task:** Add state for tracking export readiness **per conversation** to support multiple conversations in sidebar.

**Add state type:**

```typescript
interface ExportReadyState {
  assessmentId: string;
  formats: Array<'pdf' | 'word' | 'excel'>;
  questionCount: number;
}

interface ChatStore {
  // ... existing state

  // Per-conversation export state (Map keyed by conversationId)
  exportReadyByConversation: Map<string, ExportReadyState>;

  // ... existing actions
  setExportReady: (conversationId: string, data: ExportReadyState | null) => void;
  getExportReady: (conversationId: string) => ExportReadyState | null;
  clearExportReady: (conversationId: string) => void;
  clearAllExportReady: () => void;
}
```

**Add implementation (if using zustand):**

```typescript
export const useChatStore = create<ChatStore>((set, get) => ({
  // ... existing state
  exportReadyByConversation: new Map(),

  // ... existing actions
  setExportReady: (conversationId, data) =>
    set((state) => {
      const newMap = new Map(state.exportReadyByConversation);
      if (data === null) {
        newMap.delete(conversationId);
      } else {
        newMap.set(conversationId, data);
      }
      return { exportReadyByConversation: newMap };
    }),

  getExportReady: (conversationId) => {
    return get().exportReadyByConversation.get(conversationId) || null;
  },

  clearExportReady: (conversationId) =>
    set((state) => {
      const newMap = new Map(state.exportReadyByConversation);
      newMap.delete(conversationId);
      return { exportReadyByConversation: newMap };
    }),

  clearAllExportReady: () => set({ exportReadyByConversation: new Map() }),
}));
```

**Usage in components (derive current conversation's state):**

```typescript
// In useChatController or component:
const activeConversationId = useActiveConversationId();
const exportReady = useChatStore(
  (state) => state.exportReadyByConversation.get(activeConversationId) || null
);
```

**Acceptance Criteria:**
- [ ] `exportReadyByConversation` Map state added (NOT single global `exportReady`)
- [ ] `setExportReady` action takes conversationId parameter
- [ ] `getExportReady` selector takes conversationId parameter
- [ ] `clearExportReady` action takes conversationId parameter
- [ ] Export state is isolated per conversation
- [ ] Switching conversations shows correct export state for each

---

### Story 11.5.5: Wire Handler in useChatController

**File:** `apps/web/src/hooks/useChatController.ts`

**Task:** Connect export_ready handler to WebSocket hook.

**Get handler from useWebSocketEvents:**

```typescript
const {
  // ... existing handlers
  handleExportReady,
} = useWebSocketEvents({
  // ... existing params
  setExportReady,
});
```

**Pass to useWebSocket:**

```typescript
const { /* ... */ } = useWebSocket({
  // ... existing options
  onExportReady: handleExportReady,
});
```

**Acceptance Criteria:**
- [ ] `handleExportReady` passed to `useWebSocket`
- [ ] Handler is stable reference (from useCallback)
- [ ] No unnecessary re-renders

---

## Sprint 6: Frontend Download Component

### Story 11.6.1: Add Download Component Type to ChatMessage

**File:** `apps/web/src/components/chat/ChatMessage.tsx`

**Task:** Extend MessageComponent to support download type.

**Update interface:**

```typescript
export interface MessageComponent {
  type: 'button' | 'link' | 'form' | 'download';
  data: Record<string, any>;
}

interface DownloadComponentData {
  assessmentId: string;
  formats: Array<'pdf' | 'word' | 'excel'>;
  questionCount: number;
}
```

**Acceptance Criteria:**
- [ ] `download` added to type union
- [ ] `DownloadComponentData` interface defined

---

### Story 11.6.2: Implement EmbeddedDownload Component (with Validation)

**File:** `apps/web/src/components/chat/ChatMessage.tsx`

**Task:** Create component to render download buttons inline in chat. **Include runtime shape validation** to handle malformed data gracefully.

**Add import:**

```typescript
import { DownloadButton } from './DownloadButton';
```

**Add validation helper and component:**

```typescript
interface DownloadComponentData {
  assessmentId: string;
  formats: Array<'pdf' | 'word' | 'excel'>;
  questionCount: number;
}

/**
 * Runtime validation for download component data
 * Prevents rendering errors from malformed WebSocket payloads
 */
function isValidDownloadData(data: unknown): data is DownloadComponentData {
  if (!data || typeof data !== 'object') return false;

  const d = data as Record<string, unknown>;

  // Required: assessmentId must be non-empty string
  if (typeof d.assessmentId !== 'string' || d.assessmentId.length === 0) {
    console.warn('[EmbeddedDownload] Invalid assessmentId:', d.assessmentId);
    return false;
  }

  // Required: formats must be array with valid format values
  if (!Array.isArray(d.formats) || d.formats.length === 0) {
    console.warn('[EmbeddedDownload] Invalid formats:', d.formats);
    return false;
  }

  const validFormats = ['pdf', 'word', 'excel'];
  for (const format of d.formats) {
    if (!validFormats.includes(format)) {
      console.warn('[EmbeddedDownload] Invalid format value:', format);
      return false;
    }
  }

  // Required: questionCount must be positive number
  if (typeof d.questionCount !== 'number' || d.questionCount < 1) {
    console.warn('[EmbeddedDownload] Invalid questionCount:', d.questionCount);
    return false;
  }

  return true;
}

function EmbeddedDownload({ data }: { data: unknown }) {
  // Runtime validation before rendering
  if (!isValidDownloadData(data)) {
    return (
      <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-700">
        Unable to display download options. Invalid data received.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
      <div className="flex items-center gap-2 text-sm font-medium text-green-800">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Questionnaire generated ({data.questionCount} questions)
      </div>
      <p className="text-sm text-green-700">
        Download the questionnaire in your preferred format:
      </p>
      <div className="flex gap-2 flex-wrap mt-1">
        {data.formats.map((format) => (
          <DownloadButton
            key={format}
            assessmentId={data.assessmentId}
            format={format}
          />
        ))}
      </div>
    </div>
  );
}
```

**Update switch statement in EmbeddedComponent:**

```typescript
function EmbeddedComponent({ component }: { component: MessageComponent }) {
  switch (component.type) {
    case 'button':
      return <EmbeddedButton data={component.data} />;
    case 'link':
      return <EmbeddedLink data={component.data} />;
    case 'form':
      return <EmbeddedForm data={component.data} />;
    case 'download':
      // Pass as unknown - EmbeddedDownload validates internally
      return <EmbeddedDownload data={component.data} />;
    default:
      return null;
  }
}
```

**Acceptance Criteria:**
- [ ] `EmbeddedDownload` component created
- [ ] **Runtime shape validation via `isValidDownloadData()`**
- [ ] Shows fallback UI when validation fails (not crash)
- [ ] Renders DownloadButton for each format
- [ ] Shows question count and success message
- [ ] Added to switch statement
- [ ] Styled consistently with chat UI
- [ ] Logs warnings for debugging invalid data

---

### Story 11.6.3: Inject Download Component on Export Ready

**File:** `apps/web/src/hooks/useWebSocketEvents.ts` or `useChatController.ts`

**Task:** When export_ready received, inject download component into messages.

**Update handleExportReady to inject component:**

```typescript
const handleExportReady = useCallback(
  (data: ExportReadyPayload) => {
    if (data.conversationId !== activeConversationId) {
      return;
    }

    // Store export state
    setExportReady({
      assessmentId: data.assessmentId,
      formats: data.formats,
      questionCount: data.questionCount,
    });

    // Inject download component into last assistant message
    setMessages((prevMessages) => {
      const newMessages = [...prevMessages];

      // Find last assistant message
      for (let i = newMessages.length - 1; i >= 0; i--) {
        if (newMessages[i].role === 'assistant') {
          // Deduplicate: check if download component already exists for this assessmentId
          const existingComponents = newMessages[i].components || [];
          const alreadyHasDownload = existingComponents.some(
            (c) => c.type === 'download' && c.data?.assessmentId === data.assessmentId
          );

          if (alreadyHasDownload) {
            console.log('[handleExportReady] Download component already exists, skipping duplicate');
            break;
          }

          newMessages[i] = {
            ...newMessages[i],
            components: [
              ...existingComponents,
              {
                type: 'download' as const,
                data: {
                  assessmentId: data.assessmentId,
                  formats: data.formats,
                  questionCount: data.questionCount,
                },
              },
            ],
          };
          break;
        }
      }

      return newMessages;
    });
  },
  [activeConversationId, setExportReady, setMessages]
);
```

**Acceptance Criteria:**
- [ ] Download component injected into last assistant message
- [ ] Only injected if message is from assistant
- [ ] Contains assessmentId, formats, questionCount
- [ ] **Deduplicates by assessmentId** - repeated events don't stack multiple download blocks
- [ ] Component renders correctly in chat

---

### Story 11.6.4: Fix DownloadButton Authentication (with Login Redirect)

**File:** `apps/web/src/components/chat/DownloadButton.tsx`

**Task:** Add JWT authentication to download requests. **Use login redirect instead of alert() for 401 errors.**

**Update implementation:**

```typescript
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';  // Or your toast/notification system

export interface DownloadButtonProps {
  assessmentId: string;
  format: 'pdf' | 'word' | 'excel';
  label?: string;
  onDownload?: () => void;
}

export function DownloadButton({
  assessmentId,
  format,
  label,
  onDownload
}: DownloadButtonProps) {
  const router = useRouter();
  const { token, logout } = useAuth();
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = React.useState(false);

  const handleDownload = async () => {
    if (!token) {
      // Redirect to login instead of alert
      toast({
        title: 'Authentication Required',
        description: 'Please log in to download files.',
        variant: 'destructive',
      });
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }

    setIsDownloading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(
        `${apiUrl}/api/assessments/${assessmentId}/export/${format}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        // Session expired - clear auth state and redirect to login
        logout();
        toast({
          title: 'Session Expired',
          description: 'Your session has expired. Please log in again.',
          variant: 'destructive',
        });
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Download failed: ${response.statusText}. ${errorText}`);
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Set filename based on format
      const extension = format === 'word' ? 'docx' : format === 'excel' ? 'xlsx' : 'pdf';
      const timestamp = new Date().toISOString().split('T')[0];
      a.download = `questionnaire-${timestamp}.${extension}`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Download Started',
        description: `Your ${format.toUpperCase()} file is downloading.`,
      });

      onDownload?.();
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: 'Download Failed',
        description: error instanceof Error ? error.message : 'Failed to download file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const formatLabels = {
    pdf: 'PDF',
    word: 'Word',
    excel: 'Excel',
  };

  const formatLabel = label || formatLabels[format];

  return (
    <Button
      onClick={handleDownload}
      disabled={isDownloading || !token}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      {isDownloading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {isDownloading ? 'Downloading...' : formatLabel}
    </Button>
  );
}
```

**Acceptance Criteria:**
- [ ] `useAuth` hook imported and used
- [ ] Token added to Authorization header
- [ ] Handles missing token with **login redirect** (not alert)
- [ ] Handles 401 response with **login redirect and logout()** (not alert)
- [ ] Uses toast notifications for user feedback
- [ ] Preserves return URL via `redirect` query param
- [ ] Shows loading state during download
- [ ] Disabled when no token

---

### Story 11.6.5: Unit Tests for Download Component

**File:** `apps/web/__tests__/components/DownloadButton.test.tsx` (NEW)

> **NOTE:** Tests must mock all hooks used by the updated DownloadButton:
> - `useAuth` - for token and logout
> - `useRouter` - for login redirect
> - `useToast` - for toast notifications (replaces alert())

**Implementation:**

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DownloadButton } from '@/components/chat/DownloadButton';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/useToast';

// Mock all required hooks
jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: jest.fn(),
}));

describe('DownloadButton', () => {
  const mockUseAuth = useAuth as jest.Mock;
  const mockUseRouter = useRouter as jest.Mock;
  const mockUseToast = useToast as jest.Mock;
  const mockPush = jest.fn();
  const mockToast = jest.fn();
  const mockLogout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup useAuth mock
    mockUseAuth.mockReturnValue({
      token: 'test-token-123',
      logout: mockLogout,
    });

    // Setup useRouter mock
    mockUseRouter.mockReturnValue({
      push: mockPush,
    });

    // Setup useToast mock
    mockUseToast.mockReturnValue({
      toast: mockToast,
    });

    global.fetch = jest.fn();
    global.URL.createObjectURL = jest.fn(() => 'blob:test');
    global.URL.revokeObjectURL = jest.fn();
  });

  it('renders with correct format label', () => {
    render(<DownloadButton assessmentId="123" format="pdf" />);
    expect(screen.getByText('PDF')).toBeInTheDocument();
  });

  it('renders custom label when provided', () => {
    render(<DownloadButton assessmentId="123" format="pdf" label="Download Report" />);
    expect(screen.getByText('Download Report')).toBeInTheDocument();
  });

  it('includes auth header in request', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['test'])),
    });

    render(<DownloadButton assessmentId="123" format="pdf" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/assessments/123/export/pdf'),
        expect.objectContaining({
          headers: { 'Authorization': 'Bearer test-token-123' },
        })
      );
    });
  });

  it('redirects to login when not authenticated', () => {
    mockUseAuth.mockReturnValue({ token: null, logout: mockLogout });

    render(<DownloadButton assessmentId="123" format="pdf" />);
    fireEvent.click(screen.getByRole('button'));

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Authentication Required',
    }));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/login?redirect='));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('is disabled when not authenticated', () => {
    mockUseAuth.mockReturnValue({ token: null });

    render(<DownloadButton assessmentId="123" format="pdf" />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows loading state during download', async () => {
    let resolveDownload: () => void;
    const downloadPromise = new Promise<void>(resolve => { resolveDownload = resolve; });

    (global.fetch as jest.Mock).mockImplementation(() =>
      downloadPromise.then(() => ({
        ok: true,
        blob: () => Promise.resolve(new Blob(['test'])),
      }))
    );

    render(<DownloadButton assessmentId="123" format="pdf" />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Downloading...')).toBeInTheDocument();

    resolveDownload!();

    await waitFor(() => {
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });
  });

  it('handles 401 error with logout and redirect', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    render(<DownloadButton assessmentId="123" format="pdf" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Session Expired',
      }));
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/login?redirect='));
    });
  });

  it('calls onDownload callback on success', async () => {
    const onDownload = jest.fn();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['test'])),
    });

    render(<DownloadButton assessmentId="123" format="pdf" onDownload={onDownload} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(onDownload).toHaveBeenCalled();
    });
  });
});
```

**Acceptance Criteria:**
- [ ] Test file created
- [ ] Tests auth header inclusion
- [ ] Tests missing token handling
- [ ] Tests loading state
- [ ] Tests 401 handling
- [ ] Tests callback invocation
- [ ] All tests pass: `pnpm --filter @guardian/web test DownloadButton`

---

## Sprint 7: E2E & Polish

### Story 11.7.1: E2E Test Full Flow

**File:** `apps/web/__tests__/e2e/questionnaire-export.e2e.test.ts` (NEW)

**Implementation:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Questionnaire Export E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'testpassword');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/chat');
  });

  test('full flow: assessment mode → generate → download buttons appear', async ({ page }) => {
    // Switch to assessment mode
    await page.click('[data-testid="mode-selector"]');
    await page.click('[data-testid="mode-assessment"]');

    // Start assessment conversation
    await page.fill('[data-testid="composer-input"]', 'I want to evaluate a clinical AI diagnostic tool');
    await page.click('[data-testid="send-button"]');

    // Wait for assistant response
    await page.waitForSelector('[data-testid="assistant-message"]');

    // Select comprehensive assessment
    await page.fill('[data-testid="composer-input"]', '2');
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="assistant-message"]:nth-of-type(2)');

    // Trigger questionnaire generation
    await page.fill('[data-testid="composer-input"]', 'generate questionnaire');
    await page.click('[data-testid="send-button"]');

    // Wait for download buttons to appear (longer timeout for Claude response)
    await page.waitForSelector('[data-testid="download-component"]', { timeout: 60000 });

    // Verify all format buttons present
    await expect(page.locator('button:has-text("PDF")')).toBeVisible();
    await expect(page.locator('button:has-text("Word")')).toBeVisible();
    await expect(page.locator('button:has-text("Excel")')).toBeVisible();

    // Verify question count shown
    await expect(page.locator('text=/\\d+ questions/')).toBeVisible();
  });

  test('download PDF works', async ({ page }) => {
    // Setup: navigate to state with download buttons
    // ... (same setup as above)

    // Start download
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("PDF")');

    const download = await downloadPromise;

    // Verify file
    expect(download.suggestedFilename()).toMatch(/questionnaire.*\.pdf$/);
  });

  test('download buttons do not appear in consult mode', async ({ page }) => {
    // Ensure in consult mode (default)
    await page.fill('[data-testid="composer-input"]', 'Tell me about HIPAA compliance');
    await page.click('[data-testid="send-button"]');

    await page.waitForSelector('[data-testid="assistant-message"]');

    // Verify no download component
    await expect(page.locator('[data-testid="download-component"]')).not.toBeVisible();
  });
});
```

**Acceptance Criteria:**
- [ ] E2E test file created
- [ ] Tests full flow: mode switch → conversation → generate → download
- [ ] Tests actual file download
- [ ] Tests consult mode doesn't show downloads
- [ ] Tests pass in CI

---

### Story 11.7.2: Error Handling - Show Extraction Failure

**File:** `apps/web/src/hooks/useWebSocketEvents.ts`

**Task:** Handle extraction failure gracefully in UI. Listen for `extraction_failed` event (emitted by fire-and-forget pattern in Story 11.4.2).

**Add handler for extraction_failed event:**

```typescript
const handleExtractionFailed = useCallback(
  (data: { conversationId: string; assessmentId: string; error: string }) => {
    // Ignore if for different conversation
    if (data.conversationId !== activeConversationId) {
      return;
    }

    console.warn('[useWebSocketEvents] Extraction failed:', data.error);

    // Inject error component into last assistant message
    setMessages((prevMessages) => {
      const newMessages = [...prevMessages];
      const lastIdx = newMessages.length - 1;

      if (lastIdx >= 0 && newMessages[lastIdx].role === 'assistant') {
        newMessages[lastIdx] = {
          ...newMessages[lastIdx],
          components: [
            ...(newMessages[lastIdx].components || []),
            {
              type: 'error' as const,
              data: {
                message: 'Unable to process questionnaire for export.',
                suggestion: 'Try saying "generate questionnaire" again.',
              },
            },
          ],
        };
      }

      return newMessages;
    });
  },
  [activeConversationId, setMessages]
);

// Return from hook
return {
  // ... existing handlers
  handleExtractionFailed,
};
```

**Wire in useWebSocket.ts:**

```typescript
if (onExtractionFailed) {
  const handleExtractionFailed = (data: ExtractionFailedPayload) => {
    onExtractionFailed(data);
  };

  client.socket.on('extraction_failed', handleExtractionFailed);
  unsubscribers.push(() => client.socket.off('extraction_failed', handleExtractionFailed));
}
```

**Add error component to ChatMessage.tsx:**

```typescript
interface ErrorComponentData {
  message: string;
  suggestion?: string;
}

function EmbeddedError({ data }: { data: ErrorComponentData }) {
  return (
    <div className="flex flex-col gap-1 mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
      <div className="text-sm text-amber-800">{data.message}</div>
      {data.suggestion && (
        <div className="text-xs text-amber-600">{data.suggestion}</div>
      )}
    </div>
  );
}

// Add to switch statement
case 'error':
  return <EmbeddedError data={component.data as ErrorComponentData} />;
```

**Integration test for extraction failure path:**

**File:** `packages/backend/__tests__/integration/questionnaire-extraction.integration.test.ts`

**Add test case:**

```typescript
it('emits extraction_failed when questionnaire parsing fails', async () => {
  const events: any[] = [];

  clientSocket.on('extraction_failed', (data) => {
    events.push({ type: 'extraction_failed', data });
  });

  clientSocket.on('export_ready', (data) => {
    events.push({ type: 'export_ready', data });
  });

  // Mock Claude to return malformed questionnaire (markers but no valid sections)
  mockClaudeClient.streamMessage.mockImplementation(async function* () {
    yield {
      content: `Here's your questionnaire:
<!-- QUESTIONNAIRE_START -->
This is malformed content with no proper section headers.
No numbered questions here.
Just random text.
<!-- QUESTIONNAIRE_END -->
That's the questionnaire.`,
      isComplete: false
    };
    yield { content: '', isComplete: true };
  });

  // Setup: create conversation with linked assessment
  // ... test setup code (same as success test)

  // Send message that triggers questionnaire
  clientSocket.emit('send_message', {
    conversationId: testConversationId,
    text: 'generate questionnaire',
  });

  // Wait for events
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Verify extraction_failed emitted (NOT export_ready)
  const extractionFailed = events.find(e => e.type === 'extraction_failed');
  expect(extractionFailed).toBeDefined();
  expect(extractionFailed.data.conversationId).toBe(testConversationId);
  expect(extractionFailed.data.error).toContain('No sections found');

  // Verify export_ready was NOT emitted
  const exportReady = events.find(e => e.type === 'export_ready');
  expect(exportReady).toBeUndefined();
});
```

**Acceptance Criteria:**
- [ ] Error component type added to ChatMessage
- [ ] `extraction_failed` event handler wired in frontend
- [ ] Extraction failure shows user-friendly message
- [ ] Suggests retry action
- [ ] Doesn't break chat flow
- [ ] **Integration test verifies extraction_failed emitted on parse error**
- [ ] **Integration test verifies export_ready NOT emitted on failure**

---

### Story 11.7.3: Clear Export State on Conversation Switch

**File:** `apps/web/src/hooks/useChatController.ts`

**Task:** Ensure export state is cleared when switching conversations.

**Add effect:**

```typescript
// Clear export state when conversation changes
useEffect(() => {
  clearExportReady();
}, [activeConversationId, clearExportReady]);
```

**Also clear when starting new conversation:**

```typescript
const startNewConversation = useCallback(() => {
  clearExportReady();
  // ... existing new conversation logic
}, [clearExportReady, /* ... */]);
```

**Acceptance Criteria:**
- [ ] Export state cleared on conversation switch
- [ ] Export state cleared on new conversation
- [ ] Download buttons don't persist incorrectly

---


## Tests Checklist

### New Tests to Create
- [ ] `packages/backend/__tests__/unit/ChatServer.test.ts` - trigger detection tests
- [ ] `packages/backend/__tests__/unit/VendorService.test.ts` - findOrCreateDefault tests
- [ ] `packages/backend/__tests__/unit/TriggerDetection.test.ts` - expanded trigger detection (Sprint 8)
- [ ] `packages/backend/__tests__/unit/ChatServer.extraction.test.ts` - fallback extraction logic (Sprint 8)
- [ ] `packages/backend/__tests__/integration/export-flow.integration.test.ts` - export endpoint validation (Sprint 8)
- [ ] `packages/backend/__tests__/integration/assessment-lifecycle.test.ts`
- [ ] `packages/backend/__tests__/unit/MarkdownQuestionnaireConverter.test.ts`
- [ ] `packages/backend/__tests__/unit/QuestionExtractionService.test.ts`
- [ ] `packages/backend/__tests__/integration/questionnaire-extraction.integration.test.ts`
- [ ] `apps/web/__tests__/components/DownloadButton.test.tsx`
- [ ] `apps/web/__tests__/e2e/questionnaire-export.e2e.test.ts`

### Existing Tests to Verify Pass
- [ ] `QuestionParser.test.ts` - no changes needed
- [ ] `QuestionRepository.test.ts` - verify bulkCreate/delete work
- [ ] `ExportService.test.ts` - no changes needed
- [ ] `ChatServer.test.ts` - update for new constructor params

---

## File Summary

### New Files
| Path | Purpose |
|------|---------|
| `packages/backend/src/infrastructure/ai/converters/MarkdownQuestionnaireConverter.ts` | Markdown → JSON conversion |
| `packages/backend/src/application/services/QuestionExtractionService.ts` | Extraction orchestration |
| `packages/backend/src/application/interfaces/IQuestionExtractionService.ts` | Service interface |
| `packages/backend/__tests__/unit/MarkdownQuestionnaireConverter.test.ts` | Converter tests |
| `packages/backend/__tests__/unit/QuestionExtractionService.test.ts` | Service tests |
| `packages/backend/__tests__/integration/assessment-lifecycle.test.ts` | Lifecycle tests |
| `packages/backend/__tests__/integration/questionnaire-extraction.integration.test.ts` | Integration tests |
| `apps/web/__tests__/components/DownloadButton.test.tsx` | Component tests |
| `apps/web/__tests__/e2e/questionnaire-export.e2e.test.ts` | E2E tests |

### Modified Files
| Path | Changes |
|------|---------|
| `packages/backend/guardian-prompt.md` | Add marker instructions |
| `packages/backend/src/infrastructure/ai/prompts.ts` | Add marker instructions to fallbacks |
| `packages/backend/src/infrastructure/websocket/ChatServer.ts` | Inject services, trigger detection, extraction call, event emission |
| `packages/backend/src/index.ts` | Instantiate and inject new services |
| `packages/backend/src/application/services/VendorService.ts` | Add findOrCreateDefault method |
| `packages/backend/src/application/interfaces/IVendorRepository.ts` | Add findByName method |
| `packages/backend/src/infrastructure/database/repositories/DrizzleVendorRepository.ts` | Implement findByName |
| `apps/web/src/lib/websocket.ts` | Add ExportReadyPayload type |
| `apps/web/src/hooks/useWebSocket.ts` | Add onExportReady callback |
| `apps/web/src/hooks/useWebSocketEvents.ts` | Add handleExportReady handler |
| `apps/web/src/hooks/useChatController.ts` | Wire export handler, clear on switch |
| `apps/web/src/stores/chatStore.ts` | Add exportReady state and actions |
| `apps/web/src/components/chat/ChatMessage.tsx` | Add download and error component types |
| `apps/web/src/components/chat/DownloadButton.tsx` | Add JWT authentication |

---

## Execution Order

Execute sprints in order. Within each sprint, stories can be parallelized where noted.

1. **Sprint 0** - Assessment Lifecycle (prerequisite for everything)
2. **Sprint 1** - Prompt & Markers (can start after 0.1)
3. **Sprint 2** - Markdown Converter (independent, can parallel with Sprint 1)
4. **Sprint 3** - Extraction Service (requires Sprint 2)
5. **Sprint 4** - ChatServer Wiring (requires Sprint 0, 3)
6. **Sprint 5** - Frontend Event Plumbing (can start after Sprint 4.2)
7. **Sprint 6** - Download Component (requires Sprint 5)
8. **Sprint 7** - E2E & Polish (requires all above)


---

## Definition of Done

Each story is complete when:
- [ ] Code implemented as specified
- [ ] Unit tests written and passing
- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] Manual verification (where applicable)
- [ ] Code committed with descriptive message
