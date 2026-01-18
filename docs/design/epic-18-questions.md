Based on the Epic 18 context, here's how the user experience should flow for each mode.

  ---
  Consult Mode

  Purpose: Q&A about documents (like ChatGPT file attachment)

  User Flow:
  1. User is in Consult mode (default mode)
  2. User attaches file (vendor whitepaper, security policy, contract, etc.)
  3. [~3s] Chip shows "Attached ✓"
  4. User types question: "What encryption standards does this vendor support?"
  5. User clicks Send
  6. Composer clears immediately
  7. Claude responds using text excerpt as context
  8. User can ask follow-up questions about the same document

  Key UX Points:
  - No progress indicator needed (response is immediate)
  - File stays "attached" for the conversation (can reference it in follow-ups)
  user: file should persist not just chat but in subseequent sessions (how do oai and anthropic handle that)
  - Pure Q&A - no structured workflow triggered
  - Similar to ChatGPT/Claude.ai file attachment experience

  user: is there any image capability

  Open Questions:
  - What happens if user sends with file but no message?
    - Option A: "What would you like to know about this document?"
    - Option B: Auto-summarize the document

    user: Option B auto-summarize 

    - Option C: Block send without message text

  ---
  Assessment Mode

  Purpose: Structured vendor intake and assessment workflow

  User Flow:
  1. User switches to Assessment mode
  2. User attaches vendor documentation
  3. [~3s] Chip shows "Attached ✓"
  4. User clicks Send (message optional)
  5. Composer clears immediately
  6. Claude responds immediately with acknowledgment + initial observations:
     "I've received the vendor documentation for CloudSec Solutions.
      This appears to be a cloud-native security platform. Key highlights:
      - SOC 2 Type II certified
      - AES-256 encryption at rest

      user: what if it isnt a vendor doc 

      Would you like me to start the Guardian assessment framework?"
  7. [Background: light enrichment extracts vendor name, solution type, etc.]
  user : is this cached in the background , stored in memory
  8. Follow-up questions use enriched context

  Key UX Points:
  - Immediate response (no waiting for enrichment)
  - Guardian guides the assessment workflow conversationally
  - Background enrichment is invisible to user
  - No progress indicator (enrichment is background, not blocking)

  Open Questions:
  - Should Guardian auto-start assessment questions, or wait for user confirmation?
  user: there is a menu , check the code 
  - What if user uploads wrong file? How to course-correct?
  user: the model asks clarifying questions if the file looks out of context , the file upload in assessments is to provide context for preparing an assessment 
  - Multiple files: treated as one vendor package, or separate vendors?
  user : it should be treated as same vendor but the model should be able to create multiple vendors in a single chat , but good question multiple vendors would be more complex i would think . we may have to address ths

  ---
  Scoring Mode

  Purpose: Score a completed questionnaire against the 10-dimension rubric

  User Flow - The Big Question:

  This is where UX needs definition. There are several possible flows:

  Option A: Explicit Trigger (User Says "Score This")

  1. User switches to Scoring mode
  2. User attaches completed questionnaire (Excel/PDF with responses)
  3. [~3s] Chip shows "Attached ✓"
  4. User types: "Score this questionnaire" or "Analyze this for vendor ABC"
  5. User clicks Send
  6. Composer clears
  7. Progress appears in chat:
     ⏳ Analyzing questionnaire responses... [███░░░░░░░] 30%
     ⏳ Scoring Security Architecture... [███████░░░] 70%
  8. [~2 min] Results appear as assistant message

  Pros: User has full control, can ask questions before scoring
  Cons: Extra step, user might not know to say "score this"

  user : the scoring auto-starts on user send of the message is empty or not im not sure when it addresses the users query but i remember dealing with this recently check the code and verifyf

  ---
  Option B: Auto-Trigger on Send (Any Message Starts Scoring)

  1. User switches to Scoring mode
  2. User attaches completed questionnaire
  3. [~3s] Chip shows "Attached ✓"
  4. User clicks Send (message optional: "Score for vendor XYZ")
  5. Composer clears
  6. Scoring automatically starts, progress in chat
  7. Results appear

  Pros: Simpler, one less decision for user
  Cons: What if user wanted to ask a question first? Wasted compute if wrong file.

  ---
  Option C: Guardian Asks for Confirmation

  1. User switches to Scoring mode
  2. User attaches completed questionnaire
  3. [~3s] Chip shows "Attached ✓"
  4. User clicks Send
  5. Guardian responds:
     "I've received questionnaire-responses.xlsx (47 responses detected).

      Ready to score this against the Guardian 10-dimension framework?

      [Start Scoring] [Let me review first]"
  6. User clicks [Start Scoring] button
  7. Progress appears in chat
  8. Results appear

  Pros: User confirmation prevents wasted compute, clear expectations
  Cons: Extra click, more complex UI (inline buttons)

  ---
  Option D: Smart Detection (Hybrid)

  1. User in Scoring mode, attaches file
  2. [~3s] Chip shows "Attached ✓"
  3. IF user message contains scoring intent ("score", "analyze", "evaluate"):
       → Auto-trigger scoring with progress
     ELSE IF user sends with no message:
       → Guardian asks: "Ready to score? [Start Scoring]"
     ELSE (user asks a question):
       → Respond to question using excerpt (like Consult mode)
       → User can trigger scoring later

  Pros: Flexible, handles all use cases
  Cons: More complex logic, potential for confusion

  ---
  Key UX Decisions Needed
  ┌─────────────────────────────┬───────────────────────────────────────────────┬───────────────┐
  │          Question           │                    Options                    │    Impact     │
  ├─────────────────────────────┼───────────────────────────────────────────────┼───────────────┤
  │ 1. How is scoring           │ Explicit command / Auto on send <-this /             │ Core workflow │
  │ triggered?                  │ Confirmation button / Smart detection         │               │
  ├─────────────────────────────┼───────────────────────────────────────────────┼───────────────┤
  │ 2. Can user ask questions   │ Yes (flexible) <-this / No (scoring only)            │ User control  │
  │ before scoring?             │                                               │               │
  ├─────────────────────────────┼───────────────────────────────────────────────┼───────────────┤
  │ 3. What if wrong file       │ Cancel button during progress <- this/ Start over /  │ Error         │
  │ uploaded?                   │ Edit before scoring                           │ recovery      │
  ├─────────────────────────────┼───────────────────────────────────────────────┼───────────────┤
  │ 4. Progress location?       │ Chat stream (implemented),<-this> / Modal / Sidebar   │ Visual        │
  │                             │                                               │ feedback      │
  ├─────────────────────────────┼───────────────────────────────────────────────┼───────────────┤
  │ 5. Send without message     │ Allowed <-allowed / Blocked / Mode-dependent            │ Edge case     │
  │ text?                       │                                               │ handling      │
  ├─────────────────────────────┼───────────────────────────────────────────────┼───────────────┤
  │ 6. Multiple files in        │ Score together / Score separately / Block     │ Batch         │
  │ scoring?                    │ multiple      --undecided                                 │ handling      │
  └─────────────────────────────┴───────────────────────────────────────────────┴───────────────┘
  ---

   ---
  Scenario 1: Wrong Document Type in Scoring Mode

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  USER MISTAKE: Uploads vendor-whitepaper.pdf in Scoring mode                 │
  │  (Thinking they were in Consult/Assessment mode)                             │
  └─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 1: Document Type Detection (BEFORE scoring triggers)                   │
  │  ┌──────────────────────────────────────────────────────────────────────┐   │
  │  │ Analyze file structure:                                               │   │
  │  │                                                                       │   │
  │  │ ✅ Scoring Document Indicators:          ❌ Non-Scoring Indicators:   │   │
  │  │ - Question + Response columns            - Narrative text only        │   │
  │  │ - Excel with answer fields filled        - No Q&A structure           │   │
  │  │ - References assessment ID               - Marketing/policy content   │   │
  │  │ - "Vendor Response" headers              - No response fields         │   │
  │  └──────────────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
  ┌─────────────────────────┐     ┌─────────────────────────────────────────────┐
  │ VALID QUESTIONNAIRE     │     │ NOT A QUESTIONNAIRE                          │
  │ → Proceed with scoring  │     │ → Guardian asks clarification:               │
  │                         │     │                                              │
  │                         │     │ "This looks like a vendor whitepaper, not    │
  │                         │     │  a completed questionnaire. Would you like   │
  │                         │     │  to:                                         │
  │                         │     │                                              │
  │                         │     │  [Switch to Consult] - Ask questions about   │
  │                         │     │                        this document         │
  │                         │     │  [Switch to Assessment] - Use this for       │
  │                         │     │                          vendor intake       │
  │                         │     │  [Score Anyway] - I know what I'm doing"     │
  └─────────────────────────┘     └─────────────────────────────────────────────┘

  ---
  Scenario 2: Two Valid Scoring Documents (Different Assessments)

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  USER UPLOADS: vendorA-responses.xlsx + vendorB-responses.xlsx               │
  │  Both are valid completed questionnaires for DIFFERENT vendors               │
  └─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 1: Detect Multiple Assessments                                         │
  │  ┌──────────────────────────────────────────────────────────────────────┐   │
  │  │ Parse each file:                                                      │   │
  │  │                                                                       │   │
  │  │ vendorA-responses.xlsx          vendorB-responses.xlsx                │   │
  │  │ ├─ Vendor: "CloudSec Inc"       ├─ Vendor: "DataGuard LLC"            │   │
  │  │ ├─ Assessment: ASM-001          ├─ Assessment: ASM-002                │   │
  │  │ └─ Valid questionnaire ✓        └─ Valid questionnaire ✓              │   │
  │  │                                                                       │   │
  │  │ Detection: TWO different assessments found                            │   │
  │  └──────────────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 2: Parallel Scoring (Both Assessments)                                 │
  │  ┌──────────────────────────────────────────────────────────────────────┐   │
  │  │ Progress in chat:                                                     │   │
  │  │                                                                       │   │
  │  │ ⏳ Scoring CloudSec Inc... [███████░░░] 70%                           │   │
  │  │ ⏳ Scoring DataGuard LLC... [████░░░░░░] 40%                          │   │
  │  │                                                                       │   │
  │  │ (Can run in parallel or sequential - parallel preferred)              │   │
  │  └──────────────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 3: Two Scoring Results in Chat                                         │
  │  ┌──────────────────────────────────────────────────────────────────────┐   │
  │  │ ┌─────────────────────────────────────────────────────────────────┐  │   │
  │  │ │ 🏆 CloudSec Inc - Overall: 7.8/10                               │  │   │
  │  │ │ ├─ Data Privacy: 8/10                                           │  │   │
  │  │ │ ├─ Security Architecture: 8/10                                  │  │   │
  │  │ │ └─ AI Ethics: 6/10                                              │  │   │
  │  │ └─────────────────────────────────────────────────────────────────┘  │   │
  │  │                                                                       │   │
  │  │ ┌─────────────────────────────────────────────────────────────────┐  │   │
  │  │ │ 🏆 DataGuard LLC - Overall: 6.5/10                              │  │   │
  │  │ │ ├─ Data Privacy: 7/10                                           │  │   │
  │  │ │ ├─ Security Architecture: 6/10                                  │  │   │
  │  │ │ └─ AI Ethics: 5/10                                              │  │   │
  │  │ └─────────────────────────────────────────────────────────────────┘  │   │
  │  └──────────────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 4: Address User Query with BOTH Scores as Context                      │
  │  ┌──────────────────────────────────────────────────────────────────────┐   │
  │  │ User asked: "Which vendor is better for our healthcare use case?"     │   │
  │  │                                                                       │   │
  │  │ Guardian responds:                                                    │   │
  │  │ "Based on the scoring results, CloudSec Inc (7.8/10) outperforms     │   │
  │  │  DataGuard LLC (6.5/10) overall. For healthcare specifically:         │   │
  │  │                                                                       │   │
  │  │  CloudSec strengths:                                                  │   │
  │  │  - HIPAA compliance documented (Data Privacy: 8/10)                   │   │
  │  │  - Strong encryption at rest and in transit                           │   │
  │  │                                                                       │   │
  │  │  DataGuard concerns:                                                  │   │
  │  │  - AI Ethics gaps (5/10) - limited bias documentation                 │   │
  │  │  - No healthcare-specific certifications mentioned                    │   │
  │  │                                                                       │   │
  │  │  Recommendation: CloudSec Inc for healthcare deployments."            │   │
  │  └──────────────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  Summary: Smart Detection Logic

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                    SCORING MODE FILE VALIDATION                              │
  └─────────────────────────────────────────────────────────────────────────────┘

                      User uploads file(s) in Scoring mode
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │ For each file: Is it a valid  │
                      │ completed questionnaire?      │
                      └───────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
      ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
      │ ALL valid     │       │ SOME valid    │       │ NONE valid    │
      │ questionnaires│       │ (mixed)       │       │               │
      └───────────────┘       └───────────────┘       └───────────────┘
              │                       │                       │
              ▼                       ▼                       ▼
      ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
      │ Check vendor/ │       │ "File X looks │       │ "These don't 
      

regarding scoring the edge case that a user accidently uploads a non-scoring document in scoring    
  mode thinking they were in different mode , i think guardian asks them a clarification quesion , if 
  two assessment ids are found and the both are scoring documents can we handle scoring for both      

⏺ Great questions. Let me diagram both scenarios:

  ---
  Scenario 1: Wrong Document Type in Scoring Mode

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  USER MISTAKE: Uploads vendor-whitepaper.pdf in Scoring mode                 │
  │  (Thinking they were in Consult/Assessment mode)                             │
  └─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 1: Document Type Detection (BEFORE scoring triggers)                   │
  │  ┌──────────────────────────────────────────────────────────────────────┐   │
  │  │ Analyze file structure:                                               │   │
  │  │                                                                       │   │
  │  │ ✅ Scoring Document Indicators:          ❌ Non-Scoring Indicators:   │   │
  │  │ - Question + Response columns            - Narrative text only        │   │
  │  │ - Excel with answer fields filled        - No Q&A structure           │   │
  │  │ - References assessment ID               - Marketing/policy content   │   │
  │  │ - "Vendor Response" headers              - No response fields         │   │
  │  └──────────────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
  ┌─────────────────────────┐     ┌─────────────────────────────────────────────┐
  │ VALID QUESTIONNAIRE     │     │ NOT A QUESTIONNAIRE                          │
  │ → Proceed with scoring  │     │ → Guardian asks clarification:               │
  │                         │     │                                              │
  │                         │     │ "This looks like a vendor whitepaper, not    │
  │                         │     │  a completed questionnaire. Would you like   │
  │                         │     │  to:                                         │
  │                         │     │                                              │
  │                         │     │  [Switch to Consult] - Ask questions about   │
  │                         │     │                        this document         │
  │                         │     │  [Switch to Assessment] - Use this for       │
  │                         │     │                          vendor intake       │
  │                         │     │  [Score Anyway] - I know what I'm doing"     │
  └─────────────────────────┘     └─────────────────────────────────────────────┘

  ---
  Scenario 2: Two Valid Scoring Documents (Different Assessments)

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  USER UPLOADS: vendorA-responses.xlsx + vendorB-responses.xlsx               │
  │  Both are valid completed questionnaires for DIFFERENT vendors               │
  └─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 1: Detect Multiple Assessments                                         │
  │  ┌──────────────────────────────────────────────────────────────────────┐   │
  │  │ Parse each file:                                                      │   │
  │  │                                                                       │   │
  │  │ vendorA-responses.xlsx          vendorB-responses.xlsx                │   │
  │  │ ├─ Vendor: "CloudSec Inc"       ├─ Vendor: "DataGuard LLC"            │   │
  │  │ ├─ Assessment: ASM-001          ├─ Assessment: ASM-002                │   │
  │  │ └─ Valid questionnaire ✓        └─ Valid questionnaire ✓              │   │
  │  │                                                                       │   │
  │  │ Detection: TWO different assessments found                            │   │
  │  └──────────────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 2: Parallel Scoring (Both Assessments)                                 │
  │  ┌──────────────────────────────────────────────────────────────────────┐   │
  │  │ Progress in chat:                                                     │   │
  │  │                                                                       │   │
  │  │ ⏳ Scoring CloudSec Inc... [███████░░░] 70%                           │   │
  │  │ ⏳ Scoring DataGuard LLC... [████░░░░░░] 40%                          │   │
  │  │                                                                       │   │
  │  │ (Can run in parallel or sequential - parallel preferred)              │   │
  │  └──────────────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 3: Two Scoring Results in Chat                                         │
  │  ┌──────────────────────────────────────────────────────────────────────┐   │
  │  │ ┌─────────────────────────────────────────────────────────────────┐  │   │
  │  │ │ 🏆 CloudSec Inc - Overall: 7.8/10                               │  │   │
  │  │ │ ├─ Data Privacy: 8/10                                           │  │   │
  │  │ │ ├─ Security Architecture: 8/10                                  │  │   │
  │  │ │ └─ AI Ethics: 6/10                                              │  │   │
  │  │ └─────────────────────────────────────────────────────────────────┘  │   │
  │  │                                                                       │   │
  │  │ ┌─────────────────────────────────────────────────────────────────┐  │   │
  │  │ │ 🏆 DataGuard LLC - Overall: 6.5/10                              │  │   │
  │  │ │ ├─ Data Privacy: 7/10                                           │  │   │
  │  │ │ ├─ Security Architecture: 6/10                                  │  │   │
  │  │ │ └─ AI Ethics: 5/10                                              │  │   │
  │  │ └─────────────────────────────────────────────────────────────────┘  │   │
  │  └──────────────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 4: Address User Query with BOTH Scores as Context                      │
  │  ┌──────────────────────────────────────────────────────────────────────┐   │
  │  │ User asked: "Which vendor is better for our healthcare use case?"     │   │
  │  │                                                                       │   │
  │  │ Guardian responds:                                                    │   │
  │  │ "Based on the scoring results, CloudSec Inc (7.8/10) outperforms     │   │
  │  │  DataGuard LLC (6.5/10) overall. For healthcare specifically:         │   │
  │  │                                                                       │   │
  │  │  CloudSec strengths:                                                  │   │
  │  │  - HIPAA compliance documented (Data Privacy: 8/10)                   │   │
  │  │  - Strong encryption at rest and in transit                           │   │
  │  │                                                                       │   │
  │  │  DataGuard concerns:                                                  │   │
  │  │  - AI Ethics gaps (5/10) - limited bias documentation                 │   │
  │  │  - No healthcare-specific certifications mentioned                    │   │
  │  │                                                                       │   │
  │  │  Recommendation: CloudSec Inc for healthcare deployments."            │   │
  │  └──────────────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  Summary: Smart Detection Logic

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                    SCORING MODE FILE VALIDATION                              │
  └─────────────────────────────────────────────────────────────────────────────┘

                      User uploads file(s) in Scoring mode
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │ For each file: Is it a valid  │
                      │ completed questionnaire?      │
                      └───────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
      ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
      │ ALL valid     │       │ SOME valid    │       │ NONE valid    │
      │ questionnaires│       │ (mixed)       │       │               │
      └───────────────┘       └───────────────┘       └───────────────┘
              │                       │                       │
              ▼                       ▼                       ▼
      ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
      │ Check vendor/ │       │ "File X looks │       │ "These don't  │
      │ assessment IDs│       │ like a policy │       │ look like     │
      │               │       │ doc. Score    │       │ questionnaires│
      │ Same? → Merge │       │ the others?"  │       │ Switch mode?" │
      │ Diff? → Both  │       │ [Yes] [No]    │       │               │
      └───────────────┘       └───────────────┘       └───────────────┘

  ---
  Decisions Confirmed
  ┌───────────────────────────────────┬─────────────────────────────────────────────────────────┐
  │             Scenario              │                        Behavior                         │
  ├───────────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ Single valid questionnaire        │ Auto-score, address user query after                    │
  ├───────────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ Single non-questionnaire          │ Ask clarification, offer mode switch                    │
  ├───────────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ Multiple files, same vendor       │ Merge into single score                                 │
  ├───────────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ Multiple files, different vendors │ Score BOTH, return two results                          │
  ├───────────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ Mixed valid + invalid             │ Ask about invalid, score valid ones                     │
  ├───────────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ User query present                │ Queue it, address after scoring with results as context │
  └───────────────────────────────────┴─────────────────────────────────────────────────────────┘
  Does this match your understanding? If so, I'll write up the implementation plan.

✻ Worked for 1m 0s

❯ currently the issue we are trying to address is how long it takes to upload/parse a file , where    
  are the current bottlenecks and would your updated plan introduce new bottlenecks                   

⏺ Excellent point - let me analyze the current bottlenecks and assess impact of the proposed changes.

⏺ Explore(Analyze upload/parse bottlenecks)
  ⎿  Done (16 tool uses · 72.6k tokens · 59s)                                                        

⏺ Bottleneck Analysis: Current vs. Proposed

  Based on the exploration, here's where time goes and how my proposals would impact:

  ---
  Current Timing (After Epic 18)

  UPLOAD PHASE (Target: <3s) ─────────────────────────────────────────
  │
  ├─ [~500-2000ms]  S3 Storage
  ├─ [~100-3000ms]  Text Extraction (pdf-parse/mammoth)
  ├─ [~50-100ms]    DB Record Creation
  │
  └─ [EMIT file_attached] → User sees "Attached ✓" (~3s total)
                            Send button ENABLED

  SEND PHASE (Visible Progress) ──────────────────────────────────────
  │
  ├─ [~100-500ms]   buildFileContext() - load excerpts from DB
  ├─ [~10-30s]      Claude API call (context + response)
  │
  └─ For Scoring Mode:
     ├─ [~30-60s]   Parse questionnaire responses
     └─ [~30-60s]   Score 10 dimensions

  Total Scoring: ~60-120s (but with visible progress in chat)

  ---
  Impact of Proposed Enhancements

  1. Document Type Detection (Is it a questionnaire?)
  ┌───────────────────────┬──────────────┬───────────────┬───────────────────────┐
  │       Approach        │    Where     │ Added Latency │         Risk          │
  ├───────────────────────┼──────────────┼───────────────┼───────────────────────┤
  │ Claude classification │ Upload phase │ +10-30s ❌    │ Defeats Epic 18 goals │
  ├───────────────────────┼──────────────┼───────────────┼───────────────────────┤
  │ Claude classification │ On send      │ +5-10s ⚠️     │ Delays scoring start  │
  ├───────────────────────┼──────────────┼───────────────┼───────────────────────┤
  │ Heuristic detection   │ Upload phase │ +50-100ms ✅  │ Fast, good enough     │
  └───────────────────────┴──────────────┴───────────────┴───────────────────────┘
  Recommendation: Heuristic detection during upload

  Questionnaire indicators (can detect from excerpt):
  ✅ Excel file with multiple sheets
  ✅ Headers like "Question", "Response", "Answer"
  ✅ Numbered rows (Q1, Q2, Q3...)
  ✅ Vendor name field populated
  ✅ Assessment ID reference

  Non-questionnaire indicators:
  ❌ Narrative prose (whitepaper)
  ❌ No structured Q&A format
  ❌ Marketing language patterns

  Impact: +50-100ms to upload phase (negligible)

  ---
  2. Multi-Assessment/Vendor Detection
  ┌───────────────────────────┬──────────────┬─────────────────────┬──────────────────────┐
  │         Approach          │    Where     │    Added Latency    │         Risk         │
  ├───────────────────────────┼──────────────┼─────────────────────┼──────────────────────┤
  │ Claude extraction on send │ On send      │ +10-30s per file ❌ │ Major delay          │
  ├───────────────────────────┼──────────────┼─────────────────────┼──────────────────────┤
  │ Extract during upload     │ Upload phase │ +0ms on send ✅     │ Already have excerpt │
  └───────────────────────────┴──────────────┴─────────────────────┴──────────────────────┘
  Recommendation: Extract vendor name during upload, store in DB

  // During upload text extraction:
  const excerpt = await textExtractionService.extract(buffer, type);
  const vendorName = extractVendorNameFromExcerpt(excerpt); // Regex/heuristic

  // Store with file record:
  await fileRepository.create({
    ...fileData,
    textExcerpt: excerpt,
    detectedVendorName: vendorName,  // NEW field
    detectedDocType: 'questionnaire' | 'document' | 'unknown',  // NEW field
  });

  On send: Just compare stored vendor names (instant)

  Impact: +50-100ms to upload phase (negligible)

  ---
  3. User Query Addressing (After Scoring)

  CURRENT FLOW:
  User sends: "Which areas need improvement?" + file
    → Scoring runs (60-120s)
    → Scoring result saved
    → [END] ← User query ignored

  PROPOSED FLOW:
  User sends: "Which areas need improvement?" + file
    → Scoring runs (60-120s)
    → Scoring result saved
    → [NEW] Claude call with: history + scoring result + user query
    → Response addresses query with scoring context
  ┌────────────────┬─────────┬──────────┬─────────┐
  │     Phase      │ Current │ Proposed │  Delta  │
  ├────────────────┼─────────┼──────────┼─────────┤
  │ Scoring        │ 60-120s │ 60-120s  │ 0       │
  ├────────────────┼─────────┼──────────┼─────────┤
  │ Query response │ 0s      │ +10-30s  │ +10-30s │
  ├────────────────┼─────────┼──────────┼─────────┤
  │ Total          │ 60-120s │ 70-150s  │ +10-30s │
  └────────────────┴─────────┴──────────┴─────────┘
  This is expected and acceptable:
  - User sees scoring result first (immediate feedback)
  - Query response follows (answers their specific question)
  - Total time increases, but UX is better (query actually answered)

  Impact: +10-30s AFTER scoring (acceptable, expected)

  ---
  4. Clarification Prompts (Wrong Document)

  CURRENT FLOW (wrong doc uploaded):
  User uploads whitepaper in Scoring mode
    → Scoring triggers automatically
    → Parsing fails or produces garbage
    → Wasted 60-120s of compute
    → User confused by bad results

  PROPOSED FLOW:
  User uploads whitepaper in Scoring mode
    → Heuristic detects: NOT a questionnaire
    → [STOP] Show clarification inline (no scoring)
    → "This doesn't look like a questionnaire. [Switch mode] or [Score anyway]"
    → User fixes mistake in ~3s

  Impact: SAVES 60-120s of wasted compute on wrong files

  ---
  Summary: Bottleneck Impact
  ┌───────────────────────┬──────────────┬─────────────────┬──────────────┬───────────────┐
  │      Enhancement      │ Upload Phase │   Send Phase    │ Post-Scoring │  Net Impact   │
  ├───────────────────────┼──────────────┼─────────────────┼──────────────┼───────────────┤
  │ Doc type detection    │ +50-100ms    │ -               │ -            │ ✅ Negligible │
  ├───────────────────────┼──────────────┼─────────────────┼──────────────┼───────────────┤
  │ Vendor extraction     │ +50-100ms    │ -               │ -            │ ✅ Negligible │
  ├───────────────────────┼──────────────┼─────────────────┼──────────────┼───────────────┤
  │ Multi-vendor scoring  │ -            │ +0ms (parallel) │ -            │ ✅ None       │
  ├───────────────────────┼──────────────┼─────────────────┼──────────────┼───────────────┤
  │ User query addressing │ -            │ -               │ +10-30s      │ ⚠️ Expected   │
  ├───────────────────────┼──────────────┼─────────────────┼──────────────┼───────────────┤
  │ Wrong doc detection   │ -            │ SAVES 60-120s   │ -            │ ✅ Saves time │
  └───────────────────────┴──────────────┴─────────────────┴──────────────┴───────────────┘
  Net result: Minimal upload impact, saves time on errors, adds expected time for query response

  ---
  Proposed Architecture

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  UPLOAD PHASE (~3s target - UNCHANGED)                                       │
  ├─────────────────────────────────────────────────────────────────────────────┤
  │                                                                              │
  │  [~500-2000ms] Store to S3                                                   │
  │  [~100-3000ms] Extract text excerpt                                          │
  │  [+50-100ms]   NEW: Detect doc type (heuristic)                             │
  │  [+50-100ms]   NEW: Extract vendor name (regex from excerpt)                │
  │  [~50-100ms]   Save file record (with new fields)                           │
  │  [EMIT]        file_attached                                                 │
  │                                                                              │
  │  Total: ~3.2s (still under 3.5s SLO)                                        │
  └─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  SEND PHASE (Scoring Mode)                                                   │
  ├─────────────────────────────────────────────────────────────────────────────┤
  │                                                                              │
  │  [INSTANT]     Check detectedDocType from DB                                │
  │                │                                                             │
  │                ├─ NOT questionnaire → Clarification prompt (skip scoring)   │
  │                │                                                             │
  │                └─ IS questionnaire → Continue                               │
  │                                                                              │
  │  [INSTANT]     Check detectedVendorName for all files                       │
  │                │                                                             │
  │                ├─ Same vendor → Single scoring run                          │
  │                │                                                             │
  │                └─ Different vendors → Parallel scoring runs                 │
  │                                                                              │
  │  [60-120s]     Scoring with progress in chat                                │
  │                                                                              │
  │  [+10-30s]     NEW: If user had query, address it with scoring context      │
  │                                                                              │
  └─────────────────────────────────────────────────────────────────────────────┘
