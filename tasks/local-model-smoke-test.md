# Local Model Smoke Test Plan

**Branch:** `feat/local-model-smoke-test`
**Date:** 2026-03-03
**Purpose:** Prove Guardian can run on a local open-weights model (data residency compliance)

---

## Context

Guardian currently uses Claude API (Anthropic) for all AI inference. For data residency compliance, we need to demonstrate the system can run on locally-hosted open-weights models with no data leaving the premises.

**This is a smoke test, not a migration.** Minimal code changes, validate core flows, document results.

---

## Local Setup

| Component | Details |
|-----------|---------|
| **Hardware** | Mac Studio (Apple Silicon) |
| **Runtime** | LM Studio with MLX backend |
| **Model** | `mlx-community/Qwen3.5-35B-A3B-4bit` (MoE, 3B active params) |
| **Embeddings** | `text-embedding-nomic-embed-text-v1.5` |
| **Endpoint** | `http://localhost:1234/v1` (OpenAI-compatible API) |
| **LM Studio Config** | Port 1234, localhost only, JIT model loading, verbose logging |

---

## Architecture

```
Guardian Backend (Anthropic SDK, port 8000)
    → LiteLLM Proxy (port 4000, translates Anthropic → OpenAI format)
        → LM Studio (port 1234, runs Qwen 3.5 35B via MLX)
```

**Why LiteLLM:** Guardian uses the Anthropic SDK which sends Anthropic-shaped payloads. LM Studio expects OpenAI-shaped payloads. LiteLLM translates between the two formats — zero code changes to Guardian's inference layer.

---

## Implementation Steps

### Step 1: Install LiteLLM

```bash
pip install litellm
```

### Step 2: Start LiteLLM Proxy

```bash
litellm --model openai/qwen3.5-35b-a3b --api_base http://localhost:1234/v1 --port 4000
```

### Step 3: Environment Variable Changes

Add to `packages/backend/.env` (DO NOT remove existing values):

```env
# === LOCAL MODEL SMOKE TEST ===
# Uncomment ANTHROPIC_BASE_URL to route through LiteLLM → LM Studio
# Comment it out to revert to Claude API
ANTHROPIC_BASE_URL=http://localhost:4000

# Override max_tokens for local model (tokens are free, model needs room to think)
# Qwen 3.5 uses think-then-answer pattern, needs higher limits
# Only takes effect when set; otherwise hardcoded Claude-optimized values apply
LOCAL_MODEL_MAX_TOKENS=65536

# Use built-in fallback prompts instead of guardian-prompt.md
# The custom prompt file exceeded the current LM Studio context window
LOCAL_MODEL_USE_FALLBACK_PROMPT=true
```

### Step 4: Code Changes (minimal, branch-only)

**File: `packages/backend/src/infrastructure/ai/ClaudeClientBase.ts`**
- Add env var check for `LOCAL_MODEL_MAX_TOKENS`
- If set, override `this.maxTokens` with that value
- If not set, existing hardcoded value (`4096`) remains

**Files with hardcoded max_tokens that need the override pattern:**

| File | Line | Claude Value | Purpose |
|------|------|-------------|---------|
| `ClaudeClientBase.ts` | 25 | `4096` | Default for all clients |
| `ClaudeStreamClient.ts` | 45 | `8192` | Streaming chat |
| `TitleGenerationService.ts` | 110 | `100` | Title generation |
| `ClaudeVisionClient.ts` | 49 | `4096` | Vision/document analysis |
| `ExportNarrativeGenerator.ts` | 79 | `16000` | Export narrative |
| `DocumentParserService.ts` | 196, 203 | `16384` | Scoring document parsing |
| `IntakeDocumentParser.ts` | 70, 76 | `4096` | Intake document parsing |
| `ScoringLLMService.ts` | 135 | `16384` | Scoring LLM calls |
| `QuestionnaireGenerationService.ts` | 149 | `32768` | Questionnaire generation |

**Strategy:** Helper function that returns `LOCAL_MODEL_MAX_TOKENS` if set, otherwise the passed-in default. One function, used everywhere.

```typescript
// In ClaudeClientBase.ts or a shared config util
export function getMaxTokens(defaultValue: number): number {
  const override = parseInt(process.env.LOCAL_MODEL_MAX_TOKENS || '0', 10);
  return override > 0 ? override : defaultValue;
}
```

### Step 5: Verify Startup

```bash
# Terminal 1: LM Studio (already running)
# Terminal 2: LiteLLM proxy
litellm --model openai/qwen3.5-35b-a3b --api_base http://localhost:1234/v1 --port 4000

# Terminal 3: Guardian backend
pnpm --filter @guardian/backend dev
```

---

## Test Cases

### Test 1: Basic Chat (Consult Mode)
- **Action:** Send a simple message in consult mode
- **Expected:** Qwen responds through the full pipeline (backend → LiteLLM → LM Studio → back)
- **Success:** Response appears in chat UI, no errors in backend logs
- **Watch for:** Qwen's "Thinking Process" preamble appearing in the response

### Test 2: Streaming
- **Action:** Send a message and observe streaming behavior
- **Expected:** Tokens stream to the frontend progressively
- **Success:** Text appears incrementally, not all at once
- **Watch for:** Streaming format differences between Anthropic SSE and OpenAI SSE (LiteLLM should handle this)

### Test 3: Title Generation
- **Action:** Start a new conversation, send a message
- **Expected:** Auto-generated title appears in sidebar
- **Success:** Title is generated (even if quality differs from Claude Haiku)
- **Watch for:** max_tokens=100 was very tight for Claude — Qwen may need more room

### Test 4: Assessment Mode - Question Generation
- **Action:** Switch to assessment mode, trigger questionnaire generation
- **Expected:** Qwen generates assessment questions based on Guardian rubric
- **Success:** Questions are generated and displayed (quality may vary)
- **Watch for:** Tool use / function calling — this is the highest risk area. Qwen's tool use format may not translate cleanly through LiteLLM

### Test 5: Document Upload (Vision)
- **Action:** Upload a document in scoring mode
- **Expected:** Qwen processes the document (text extraction path, not vision for PDFs)
- **Success:** Document content is extracted and acknowledged
- **Watch for:** Vision API differences if testing image-based input

### Test 6: Scoring
- **Action:** Run a scoring flow on uploaded vendor responses
- **Expected:** Qwen applies rubric and returns scores
- **Success:** Scores are returned in expected format, validation passes
- **Watch for:** Qwen may not follow the exact JSON schema Guardian expects — ScoringPayloadReconciler should help but structured output compliance is the risk

---

## Success Criteria

| Criteria | Required | Nice to Have |
|----------|----------|-------------|
| Backend starts without errors | YES | |
| Basic chat works end-to-end | YES | |
| Streaming works | YES | |
| Title generation works | | YES |
| Question generation works | | YES |
| Tool use / function calling works | | YES |
| Scoring pipeline completes | | YES |
| No data leaves localhost | YES | |

**Minimum viable success:** Tests 1-2 pass (chat + streaming). This proves the infrastructure works and the model can serve Guardian's conversational interface locally.

**Full success:** Tests 1-6 all pass. This proves Guardian is provider-agnostic and can run entirely on-premises.

---

## Known Risks

1. **Tool use translation:** Anthropic and OpenAI have different tool/function calling schemas. LiteLLM translates but complex multi-tool flows may break.
2. **Thinking tokens:** Qwen 3.5 outputs internal reasoning before answering. This may confuse Guardian's response parsing or appear in the UI.
3. **Prompt adherence:** Guardian's system prompts are tuned for Claude. Qwen may not follow structured output instructions as precisely.
4. **Model quality:** 35B-A3B (3B active) at 4-bit quantization is significantly less capable than Claude Sonnet 4.5. Expect degraded quality, especially on complex rubric interpretation.
5. **Streaming format:** SSE event format differences may cause chunking issues even through LiteLLM.
6. **Prompt size / context window:** `guardian-prompt.md` exceeded the current LM Studio context window and caused requests to fail with `The number of tokens to keep from the initial prompt is greater than the context length.` Use `LOCAL_MODEL_USE_FALLBACK_PROMPT=true` or increase the model context window in LM Studio.

---

## Rollback

1. Comment out `ANTHROPIC_BASE_URL` in `.env`
2. Comment out `LOCAL_MODEL_MAX_TOKENS` in `.env`
3. Stop LiteLLM process
4. Restart Guardian backend → back on Claude API

Or simply: `git checkout main`

---

## Future Considerations (Out of Scope for Smoke Test)

- Provider abstraction layer (interface with Claude/OpenAI implementations)
- Config-driven model selection (per-service model routing)
- Prompt optimization for open-weights models
- Benchmarking: Qwen vs Claude on Guardian rubric quality
- Embedding model swap (nomic-embed already loaded in LM Studio)
