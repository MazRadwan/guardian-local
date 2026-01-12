# Story 18.4.3: User Query Addressing After Scoring

**Sprint:** 4
**Track:** B (standalone)
**Phase:** 1 (parallel with 18.4.4a, 18.4.5)
**Agent:** backend-agent
**Estimated Lines:** ~350
**Dependencies:** None

---

## Overview

### What This Story Does

When a user uploads a questionnaire in Scoring mode and includes a message like
"Score this and tell me about the security findings", the current system ignores
the message. This story addresses the user's query AFTER scoring completes.

### User-Visible Change

**Before:**
```
User: [uploads questionnaire] "Score this and highlight security concerns"
System: [scores questionnaire]
System: [shows scoring results]
# User's question about security concerns is NEVER addressed
```

**After:**
```
User: [uploads questionnaire] "Score this and highlight security concerns"
System: [scores questionnaire]
System: [shows scoring results]
System: "Based on the scoring results, here are the key security concerns:
         - Security Architecture scored 6/10...
         - The vendor lacks SOC 2 certification..."
```

### Why It's Needed

- Users often ask questions with their uploads
- Ignoring these questions creates friction
- Scoring results provide rich context for answering questions
- Improves conversational UX

---

## Prerequisites

- Sprint 3 complete (trigger-on-send working)
- triggerScoringOnSend method exists (ChatServer.ts:628)
- ClaudeService available for follow-up response

---

## Codebase Context

### File to Modify

**Path:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

### Current triggerScoringOnSend Method (lines 628-814)

```typescript
private async triggerScoringOnSend(
  socket: AuthenticatedSocket,
  conversationId: string,
  userId: string,
  fileIds: string[]
): Promise<void> {
  // ... existing scoring logic ...

  // After scoring completes:
  socket.emit('scoring_complete', {
    conversationId,
    result: resultData,
    narrativeReport: scoringResult.report.narrativeReport,
  });

  // Mark file as completed
  await this.fileRepository.updateParseStatus(fileId, 'completed');

  // Save narrative report as assistant message
  // ...
}
```

### Current Call Site (lines 1066-1078)

```typescript
// In send_message handler:
if (mode === 'scoring' && enrichedAttachments && enrichedAttachments.length > 0) {
  console.log(`[ChatServer] Scoring mode with ${enrichedAttachments.length} attachments - triggering scoring`);

  const fileIds = enrichedAttachments.map(a => a.fileId);

  // Trigger scoring (async, with progress events)
  await this.triggerScoringOnSend(socket, conversationId, socket.userId!, fileIds);

  // Scoring mode handles its own response - don't generate Claude response
  return;  // <-- User message is LOST here
}
```

### ClaudeService Interface

```typescript
// packages/backend/src/infrastructure/ai/ClaudeService.ts
async streamChat(
  messages: Message[],
  options: StreamOptions,
  onChunk: (chunk: string) => void
): Promise<string>
```

---

## Implementation Steps

### Step 1: Modify triggerScoringOnSend Signature

Add `userQuery` parameter to capture the user's original message.

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`
**Location:** Line 628

**Change:**
```typescript
// BEFORE:
private async triggerScoringOnSend(
  socket: AuthenticatedSocket,
  conversationId: string,
  userId: string,
  fileIds: string[]
): Promise<void> {

// AFTER:
private async triggerScoringOnSend(
  socket: AuthenticatedSocket,
  conversationId: string,
  userId: string,
  fileIds: string[],
  userQuery?: string  // NEW: Optional user query to address after scoring
): Promise<void> {
```

---

### Step 2: Add User Query Handling After Scoring

After `scoring_complete` is emitted and the narrative report is saved, check if
there's a user query to address.

**Location:** After line 814 (end of scoring_complete handling)

**Add:**
```typescript
// =========================================================
// Epic 18.4.3: Address user query after scoring
// =========================================================
if (userQuery && userQuery.trim().length > 0) {
  console.log(`[ChatServer] Addressing user query after scoring: "${userQuery.slice(0, 50)}..."`);

  try {
    // Build context with scoring results
    const scoringContext = this.buildScoringFollowUpContext(scoringResult.report);

    // Get conversation history (includes scoring narrative)
    const { messages, systemPrompt, mode } = await this.buildConversationContext(conversationId);

    // Build enhanced prompt with scoring context
    const enhancedPrompt = `${systemPrompt}

${scoringContext}

The user submitted this questionnaire with a question. The scoring has completed.
Now address their question using the scoring results above as context.
Be specific and reference actual scores and findings from the assessment.
If they asked about a specific dimension or topic, focus your answer on that area.`;

    // Emit typing indicator
    socket.emit('assistant_stream_start', { conversationId });

    // Stream Claude response
    let fullResponse = '';

    await this.claudeService.streamChat(
      messages,
      { systemPrompt: enhancedPrompt },
      (chunk: string) => {
        fullResponse += chunk;
        socket.emit('assistant_stream_chunk', {
          conversationId,
          chunk,
          fullText: fullResponse,
        });
      }
    );

    // Save assistant response
    const followUpMessage = await this.conversationService.sendMessage({
      conversationId,
      role: 'assistant',
      content: fullResponse,
      userId,
    });

    // Emit stream complete
    socket.emit('assistant_stream_complete', {
      conversationId,
      messageId: followUpMessage.id,
      content: fullResponse,
    });

    console.log(`[ChatServer] User query addressed (${fullResponse.length} chars)`);
  } catch (error) {
    console.error('[ChatServer] Failed to address user query:', error);
    // Non-fatal - scoring already completed
    socket.emit('message', {
      role: 'assistant',
      content: "I've completed the scoring. I tried to address your question but encountered an issue. Feel free to ask again.",
      conversationId,
    });
  }
}
```

---

### Step 3: Add Helper Method for Scoring Context

Add a method to format scoring results for Claude context injection.

**Location:** After triggerScoringOnSend method (~line 820)

**Add:**
```typescript
/**
 * Epic 18.4.3: Build scoring context for follow-up questions
 *
 * Formats the scoring results as context for Claude to reference
 * when answering user questions about the assessment.
 */
private buildScoringFollowUpContext(report: ScoringReport): string {
  const { payload } = report;

  // Format dimension scores for context
  const dimensionSummary = payload.dimensionScores
    .map(ds => `- ${ds.dimension}: ${ds.score}/10 (${ds.riskRating})`)
    .join('\n');

  return `
## Scoring Results Context

**Composite Score:** ${payload.compositeScore}/100
**Overall Risk Rating:** ${payload.overallRiskRating}
**Recommendation:** ${payload.recommendation}

### Dimension Scores:
${dimensionSummary}

### Key Findings:
${payload.keyFindings.map(f => `- ${f}`).join('\n')}

### Executive Summary:
${payload.executiveSummary}
`;
}
```

---

### Step 4: Update Call Site to Pass User Query

**Location:** Lines 1066-1078

**Change:**
```typescript
// BEFORE:
if (mode === 'scoring' && enrichedAttachments && enrichedAttachments.length > 0) {
  console.log(`[ChatServer] Scoring mode with ${enrichedAttachments.length} attachments - triggering scoring`);

  const fileIds = enrichedAttachments.map(a => a.fileId);

  await this.triggerScoringOnSend(socket, conversationId, socket.userId!, fileIds);

  return;
}

// AFTER:
if (mode === 'scoring' && enrichedAttachments && enrichedAttachments.length > 0) {
  console.log(`[ChatServer] Scoring mode with ${enrichedAttachments.length} attachments - triggering scoring`);

  const fileIds = enrichedAttachments.map(a => a.fileId);

  // Epic 18.4.3: Pass user message for follow-up addressing
  // messageText is the user's original message content
  await this.triggerScoringOnSend(
    socket,
    conversationId,
    socket.userId!,
    fileIds,
    messageText  // NEW: Pass user query
  );

  return;
}
```

---

## Tests to Write

### Unit Test File

**Path:** `packages/backend/__tests__/unit/ChatServer.userQueryPostScoring.test.ts`

### Test Cases

```typescript
describe('ChatServer - User Query Post-Scoring (Epic 18.4.3)', () => {
  describe('triggerScoringOnSend with userQuery', () => {
    it('should address user query after scoring completes', async () => {
      // Setup: Mock scoring to complete successfully
      // Setup: Provide userQuery "What are the security concerns?"
      // Assert: Claude is called with scoring context
      // Assert: Response addresses the query
    });

    it('should skip follow-up when userQuery is empty', async () => {
      // Setup: Mock scoring to complete
      // Setup: userQuery = ''
      // Assert: No additional Claude call
    });

    it('should skip follow-up when userQuery is whitespace only', async () => {
      // Setup: userQuery = '   '
      // Assert: No additional Claude call
    });

    it('should handle Claude error gracefully', async () => {
      // Setup: Mock Claude to throw error
      // Assert: Scoring still completes
      // Assert: Error message sent to user
    });

    it('should include scoring results in follow-up context', async () => {
      // Setup: Mock scoring result with specific scores
      // Assert: Claude receives context with scores
    });
  });

  describe('buildScoringFollowUpContext', () => {
    it('should format dimension scores correctly', async () => {
      const report = {
        payload: {
          compositeScore: 72,
          overallRiskRating: 'Medium',
          dimensionScores: [
            { dimension: 'Security', score: 8, riskRating: 'Low' },
            { dimension: 'Privacy', score: 6, riskRating: 'Medium' },
          ],
          // ...
        },
      };

      const context = chatServer.buildScoringFollowUpContext(report);

      expect(context).toContain('Composite Score: 72/100');
      expect(context).toContain('Security: 8/10 (Low)');
      expect(context).toContain('Privacy: 6/10 (Medium)');
    });
  });
});
```

---

## Acceptance Criteria

- [ ] User query is passed to triggerScoringOnSend
- [ ] After scoring completes, Claude addresses the user's query
- [ ] Response includes specific references to scoring results
- [ ] Empty/whitespace queries are skipped (no extra Claude call)
- [ ] Claude errors don't break scoring flow
- [ ] Response is saved as assistant message
- [ ] Response is streamed to frontend
- [ ] Unit tests for all scenarios

---

## Verification

### Commands to Run

```bash
# Run unit tests
pnpm --filter @guardian/backend test:unit -- --grep "User Query Post-Scoring"

# Run all ChatServer tests
pnpm --filter @guardian/backend test:unit -- --grep "ChatServer"
```

### Manual Testing Checklist

1. [ ] Upload questionnaire in Scoring mode WITH message "What are the main risks?"
2. [ ] Verify scoring completes normally
3. [ ] Verify follow-up response appears after scoring results
4. [ ] Verify response references actual scores
5. [ ] Upload questionnaire WITHOUT message
6. [ ] Verify no follow-up response (just scoring results)
7. [ ] Test with very long user query (edge case)
8. [ ] Test with multi-line user query

### Expected Behavior

```
Scoring Mode + File + Query:
1. file_attached event fires (~3s)
2. User sends with message "Tell me about security"
3. scoring_progress events stream
4. scoring_complete event fires with results
5. assistant_stream_start for follow-up
6. assistant_stream_chunk with response chunks
7. assistant_stream_complete with full response
8. Response saved as message in conversation
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Follow-up adds latency | Expected (+10-30s), but UX is better |
| Claude error | Non-fatal fallback message |
| Context too long | Limit scoring context to key findings |
| User asks unrelated question | Claude handles contextually |

---

## Notes

- The user query is already saved as a user message before scoring starts
- The follow-up response is a NEW assistant message (separate from scoring narrative)
- This creates a natural conversation flow: User question → Scoring → Answer
