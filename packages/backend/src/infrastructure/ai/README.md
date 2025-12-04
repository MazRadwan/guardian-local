# Guardian AI Infrastructure

This directory contains Guardian's AI integration components for Claude API.

## Components

### ClaudeClient (`ClaudeClient.ts`)
- **Purpose:** Wraps Anthropic SDK with retry logic and streaming support
- **Model:** `claude-sonnet-4-5-20250929` (Sonnet 4.5)
- **Features:**
  - Automatic retry with exponential backoff (2s, 4s, 8s)
  - Streaming support for real-time responses
  - Error handling for API failures
  - Configurable max tokens (4096)

**Usage:**
```typescript
const client = new ClaudeClient(process.env.ANTHROPIC_API_KEY);

// Send message
const response = await client.sendMessage(
  [{ role: 'user', content: 'Hello' }],
  { systemPrompt: 'System prompt here' }
);

// Stream message
for await (const chunk of client.streamMessage(messages, { systemPrompt })) {
  console.log(chunk.content);
}
```

### Question Generation Prompt (`prompts/questionGeneration.ts`)
- **Purpose:** Generate assessment questionnaires based on vendor context
- **Input:** Vendor type, solution type, industry, assessment focus
- **Output:** 85-95 questions across 10 risk dimensions (JSON format)
- **Sections:**
  1. Company Overview (8-10 questions)
  2. AI Architecture (12-15 questions)
  3. Clinical Validation (10-12 questions)
  4. Privacy Compliance (10-12 questions)
  5. Security Architecture (8-10 questions)
  6. Implementation & Integration (6-8 questions)
  7. Governance & Risk Management (6-8 questions)
  8. AI Transparency & Explainability (8-10 questions)
  9. Ethics & Fairness (8-10 questions)
  10. Vendor Capability (6-8 questions)
  11. Operational Excellence (12-15 questions)

**Usage:**
```typescript
const prompt = buildQuestionGenerationPrompt({
  vendorType: 'SaaS Provider',
  solutionType: 'Clinical Decision Support AI',
  industry: 'Healthcare',
  assessmentFocus: 'PIPEDA compliance, patient safety'
});

const response = await claudeClient.sendMessage(
  [{ role: 'user', content: prompt }],
  { systemPrompt: GUARDIAN_SYSTEM_CONTEXT }
);
```

### Question Parser (`parsers/QuestionParser.ts`)
- **Purpose:** Validate and parse Claude's JSON response
- **Validation:**
  - JSON structure (Zod schema)
  - Question count (78-126)
  - Required fields (sectionName, questionText, etc.)
  - Unique positions (no duplicates)
  - Enum questions have options

**Usage:**
```typescript
const questions = QuestionParser.parse(claudeResponse.content);
// Returns: ParsedQuestion[]

// Validate enum questions
QuestionParser.validateEnumQuestions(questions);
```

## Environment Variables

```bash
ANTHROPIC_API_KEY=your-api-key-here
```

## Error Handling

### ClaudeAPIError
Thrown when Claude API calls fail after all retry attempts.

```typescript
try {
  const response = await client.sendMessage(messages);
} catch (error) {
  if (error instanceof ClaudeAPIError) {
    console.error('Claude API error:', error.message);
    console.error('Original error:', error.originalError);
  }
}
```

### QuestionParseError
Thrown when Claude's response fails validation.

```typescript
try {
  const questions = QuestionParser.parse(jsonResponse);
} catch (error) {
  if (error instanceof QuestionParseError) {
    console.error('Question parsing error:', error.message);
  }
}
```

## Testing

### Unit Tests
- `__tests__/unit/QuestionParser.test.ts` - JSON parsing and validation

### Integration Tests
- Claude API mocking for CI/CD
- Actual API calls in local development (with API key)

### Manual Testing
```bash
# Set API key
export ANTHROPIC_API_KEY=your-key

# Run question generation
curl -X POST http://localhost:8000/api/assessments/:id/generate-questions \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "vendorType": "SaaS Provider",
    "solutionType": "Clinical AI",
    "industry": "Healthcare"
  }'
```

## Performance

- **Question generation:** ~10-15 seconds (Claude API call)
- **Streaming:** Real-time chunks (100-200ms latency per chunk)
- **Retry logic:** Max 22 seconds (3 attempts: 0s, 2s, 4s, 8s delays)

## Best Practices

1. **Always set ANTHROPIC_API_KEY** - Client throws error if missing
2. **Use streaming for real-time UX** - Better user experience for long responses
3. **Handle errors gracefully** - Claude API can timeout or rate limit
4. **Validate enum questions** - Ensure all enum questions have options
5. **Monitor API costs** - Track token usage for budgeting

## Future Enhancements

- [ ] Prompt caching (reduce costs for repeated calls)
- [ ] Multi-language support (French for Quebec healthcare)
- [ ] Custom section templates (user-defined risk dimensions)
- [ ] Question quality scoring (evaluate generated questions)
- [ ] Streaming progress updates (emit section completion events)
