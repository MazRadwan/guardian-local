# Guardian Model Evaluation Framework

## Purpose

This document defines a reusable evaluation framework for assessing open-weights models and local serving stacks for Guardian.

The goal is to avoid wasting time on prompt surgery or Guardian-specific architecture changes before a candidate model/runtime combination has demonstrated that it can meet Guardian's actual workload.

This framework is model-agnostic:

- It can be used for one general-purpose model
- It can be used for multiple specialized models
- It can be used to compare the same model across different runtimes
- It can be used to evaluate mixed-model deployments

## Baseline Assumption

Guardian itself is not the problem.

Guardian works correctly with the Claude API and is already optimized for that path. Claude behavior is the reference baseline for correctness, stability, and UX.

This must be treated as a hard evaluation principle:

- If a failure appears only on a local/open-weights path and not on Claude, classify it first as a model/runtime/transport compatibility issue.
- Do not treat local-model failures as evidence that Guardian architecture is flawed.
- Do not modify Guardian architecture to accommodate a candidate model unless the evaluation explicitly concludes that the change is justified and does not regress the Claude baseline.

This principle exists to prevent future sessions from "fixing Guardian" when the real issue is a candidate model or serving stack mismatch.

## What Guardian Demands From A Model

Guardian is not a single chat task. It places several different types of load on the model:

1. Consult chat
- Multi-turn instruction following
- Retrieval of recent chat history
- Synthetic intake context injection from uploaded files
- Optional web-search tool loop
- Streaming UX requirements

2. Intake and scoring extraction
- Long document parsing
- Structured extraction from questionnaire documents
- Assessment ID, vendor, and response recovery
- OCR/vision path for image-heavy documents

3. Questionnaire generation
- Large structured output
- Strict schema/tool output fidelity
- Coverage across 10 risk dimensions
- Minimal tolerance for malformed or incomplete output

4. Scoring
- Long-context evidence synthesis
- Narrative generation plus strict structured tool payload
- Numeric consistency
- Recommendation quality
- Retry resilience on structural validation failures

5. Export narrative generation
- Long-form synthesis from stored scoring results
- Clean markdown output
- Compliance-sensitive language

This matters because a model that is "good at chat" may still be a poor fit for Guardian.

## Evaluation Philosophy

Evaluate three layers separately:

1. Model Capability
- Can the model do the task?

2. Serving Stack Fit
- Can the runtime expose the model in a controllable, production-usable way?

3. Guardian Integration Fit
- Does the model/runtime combination behave correctly inside Guardian without requiring unjustified changes to Guardian?

This separation is critical. A failure in one layer does not automatically implicate the others.

## Evaluation Modes

Use the framework in one of these modes:

### Mode A: Single-Model Evaluation

One model is expected to handle:

- consult
- extraction
- questionnaire generation
- scoring
- export narrative

This is simplest operationally but requires the broadest capability.

### Mode B: Multi-Model Evaluation

Different models handle different tasks, for example:

- Model A for consult
- Model B for extraction
- Model C for scoring and narrative

This is more operationally complex, but may be the correct choice if one model cannot meet Guardian's full workload.

### Mode C: Same Model, Different Runtime Evaluation

The same model is tested across different serving stacks, for example:

- LM Studio
- vLLM
- llama.cpp server
- Ollama
- other OpenAI-compatible or Anthropic-compatible gateways

This is necessary when the model looks promising but the current runtime path is suspect.

## Evaluation Sequence

Always evaluate in this order:

1. Runtime Control Gate
2. Consult Gate
3. Extraction Gate
4. Questionnaire Gate
5. Scoring Gate
6. Operational Fit Gate

Do not proceed to deeper Guardian-specific tuning until the earlier gates pass.

## Hard Rules

### Rule 1: No Premature Prompt Tuning

Do not invest in major Guardian prompt changes before the candidate passes:

- Runtime Control Gate
- Consult Gate

If the model/runtime combination fails the easiest path, prompt tuning is likely masking the wrong problem.

### Rule 2: Compare Against Claude Baseline

Each gate should be judged relative to Claude behavior in Guardian.

The question is not:

- "Can we make it kind of work?"

The question is:

- "Is this good enough to justify replacing or complementing the Claude baseline for this workload?"

### Rule 3: Separate Model Failure From Runtime Failure

If a candidate fails, classify the failure as one of:

- model capability failure
- runtime/serving failure
- transport/API compatibility failure
- Guardian integration incompatibility

Do not collapse these into one bucket.

### Rule 4: Fail Fast

If a candidate fails a hard blocker, stop evaluation unless there is a strong reason to isolate whether the issue belongs to the runtime rather than the model.

## Gate Definitions

## Gate 0: Runtime Control Gate

Purpose:
- Determine whether the serving stack can expose the model in a controllable, stable way suitable for Guardian.

Pass criteria:

- Reasoning or chain-of-thought is not visibly leaked to end users
- Streaming is stable and does not destabilize the UI
- Context window behavior is predictable
- Tool-call transport behavior is reliable
- Stop behavior is predictable
- The runtime respects required request controls or offers a reliable alternative

Fail criteria:

- Visible chain-of-thought cannot be reliably suppressed
- Streaming cadence causes repeated UI instability
- Context behavior is inconsistent or difficult to control
- Tool calls are malformed, dropped, or delayed unpredictably
- Runtime requires brittle hacks to achieve basic usability

Notes:

- A runtime-level failure does not automatically disqualify the model
- It may instead justify retesting the same model on another runtime

## Gate 1: Consult Gate

Purpose:
- Verify the easiest Guardian mode before proceeding to heavier workflows

Pass criteria:

- Follows Guardian consult instructions consistently
- Produces clean user-facing output
- Maintains role and mode boundaries
- Uses tools correctly when factual lookups are needed
- Response quality is acceptable compared with Claude baseline

Fail criteria:

- Frequent reasoning leakage
- Wandering, verbose, or instruction-breaking answers
- Poor tool-use judgment
- Significant degradation relative to Claude in basic consult interactions

## Gate 2: Extraction Gate

Purpose:
- Verify that the candidate can parse Guardian questionnaires and related artifacts reliably

Pass criteria:

- Correctly identifies assessment ID
- Correctly extracts vendor and solution metadata
- Recovers questionnaire responses at acceptable accuracy
- Performs adequately on both text-based and image-heavy cases, if multimodal path is required
- Confidence and completeness are acceptable on representative documents

Fail criteria:

- Frequent parse failures
- Missed identifiers or metadata
- Large response extraction gaps
- Major degradation on OCR/vision path

## Gate 3: Questionnaire Gate

Purpose:
- Verify large structured generation under Guardian's schema constraints

Pass criteria:

- Valid structured output on repeated runs
- Correct tool/schema behavior
- Question counts within expected range
- Useful and non-generic question quality
- Appropriate dimension coverage
- No frequent truncation or malformed payloads

Fail criteria:

- Tool not called reliably
- Invalid schema
- Generic filler questions
- Incomplete output
- Overly unstable results across repeated runs

## Gate 4: Scoring Gate

Purpose:
- Verify the hardest reasoning and synthesis workload in Guardian

Pass criteria:

- Produces coherent narrative assessment
- Produces valid `scoring_complete` payload
- Maintains numerical consistency
- Recommendation quality is defensible
- Evidence grounding is acceptable
- Structural validation passes without frequent retry rescue

Fail criteria:

- Missing or malformed tool payload
- Poor narrative quality
- Arithmetic inconsistency
- Weak evidence grounding
- Frequent structural retry dependency
- Recommendation quality materially below baseline

## Gate 5: Operational Fit Gate

Purpose:
- Determine whether the candidate is practical to run in the target environment

Pass criteria:

- Fits available hardware comfortably
- Latency is acceptable for Guardian workflows
- Memory behavior is stable
- Throughput is adequate
- Operational complexity is acceptable

Fail criteria:

- Hardware utilization is too close to the edge
- Latency is unacceptable for real user workflows
- Runtime crashes or stalls under expected load
- Operational setup is too brittle

## Evaluation Dimensions

Each gate should be scored across these dimensions:

### A. Correctness
- Factual accuracy
- Extraction accuracy
- Schema fidelity
- Numeric consistency

### B. Control
- Instruction following
- Mode fidelity
- Tool-use reliability
- Reasoning visibility control

### C. Stability
- Repeated-run consistency
- Streaming stability
- Error handling behavior
- Recovery behavior

### D. UX Fit
- Clean output
- Response pacing
- Citation cleanliness
- No visible internal artifacts

### E. Operational Fit
- Memory
- latency
- context utilization
- runtime setup complexity

## Severity Classification

Classify any finding using one of these severities:

### Blocker

Candidate should not move forward unless the issue is clearly a runtime-only problem that can be re-tested elsewhere.

Examples:

- Visible chain-of-thought cannot be suppressed
- Tool calling is unreliable
- Scoring payloads are frequently invalid
- Questionnaire schema is unstable

### Major

Candidate may continue only if the issue appears containable and does not affect core Guardian trustworthiness.

Examples:

- Output formatting requires cleanup
- Latency is poor but tolerable for non-interactive flows
- Extraction quality is acceptable on text docs but weak on images

### Minor

Candidate remains viable; issue can be deferred.

Examples:

- Slight verbosity mismatch
- Mild citation formatting issues
- Small UX polish gaps

## Scoring Rubric

Score each gate on a 0-3 scale:

- 0 = fail
- 1 = weak / high concern
- 2 = acceptable with caveats
- 3 = strong

Recommended interpretation:

- 0: reject for this role
- 1: only continue if there is a compelling strategic reason
- 2: viable candidate with explicit caveats
- 3: strong candidate

Use this decision policy:

- Any Blocker at Gate 0 or Gate 1: stop
- Any Blocker at Gate 4: reject for scoring role
- Average below 2.0 across completed gates: reject for single-model route
- Average 2.0+ with uneven strengths: consider multi-model routing
- Average 2.5+ with no blockers: proceed to deeper integration

## Evaluation Template

Use the following record for each candidate:

```md
# Candidate Evaluation

## Candidate
- Model:
- Quantization / variant:
- Runtime:
- Transport path:
- Hardware:
- Date:

## Baseline
- Claude comparison completed: yes/no
- Guardian baseline assumption preserved: yes/no

## Gate 0: Runtime Control
- Score:
- Result: pass/fail
- Findings:

## Gate 1: Consult
- Score:
- Result: pass/fail
- Findings:

## Gate 2: Extraction
- Score:
- Result: pass/fail
- Findings:

## Gate 3: Questionnaire
- Score:
- Result: pass/fail
- Findings:

## Gate 4: Scoring
- Score:
- Result: pass/fail
- Findings:

## Gate 5: Operational Fit
- Score:
- Result: pass/fail
- Findings:

## Classification
- Model capability issue:
- Runtime/serving issue:
- Transport compatibility issue:
- Guardian integration issue:

## Decision
- Proceed
- Proceed with caveats
- Reject
- Retest on different runtime
- Keep only for a specialized role
```

## Suggested Initial Test Matrix

For each candidate, run a small but representative matrix:

### Runtime Control

- Simple single-turn reply
- Simple streamed reply
- Long streamed reply
- Tool-call turn
- Long-context turn

### Consult

- Greeting / first-turn behavior
- Policy/framework question
- Web-search-required factual question
- Multi-turn follow-up
- Context-aware consult with uploaded-file context

### Extraction

- Clean exported questionnaire PDF
- Messy but valid questionnaire
- Image-heavy questionnaire
- Wrong document type rejection

### Questionnaire

- Quick assessment
- Comprehensive assessment
- Category-focused assessment
- Repeatability across multiple runs

### Scoring

- Small complete questionnaire
- Large complete questionnaire
- Questionnaire with ambiguous evidence
- Questionnaire requiring structural validation scrutiny

### Operational

- Memory profile
- End-to-end latency
- Stream chunk pattern
- Context-window headroom

## Decision Outcomes

### Outcome A: Proceed As Single Model

Use when:

- Candidate passes all hard gates
- No blocker remains
- Scoring and questionnaire paths are credible

### Outcome B: Proceed As Specialized Model

Use when:

- Candidate is strong for one role only
- Another model may still be needed for scoring or extraction

Examples:

- Good consult model
- Good extraction model
- Good scoring model

### Outcome C: Retest Same Model On Different Runtime

Use when:

- Model seems capable
- Runtime control gate fails
- Failures appear transport/runtime-specific

### Outcome D: Reject

Use when:

- Consult already fails on controllability or stability
- Structured generation is unreliable
- Scoring quality is not defensible
- Too many brittle workarounds are required

## Explicit Warnings For Future Sessions

Do not do the following without an explicit evaluation-driven reason:

- Rewrite Guardian prompts to compensate for a model that has not passed early gates
- Change Guardian architecture because a local model behaves differently from Claude
- Treat Claude-optimized behavior as a Guardian flaw
- Keep investing in a candidate after Gate 0 or Gate 1 blocker failures without first deciding whether the issue belongs to the runtime rather than the model

## Current Working Hypothesis For Local Open-Weights Testing

For Guardian, the likely failure categories are:

1. Model capability mismatch
- The model cannot reliably handle structured, high-stakes scoring and generation

2. Runtime mismatch
- The serving stack exposes undesirable behavior such as visible reasoning or unstable chunking

3. Transport mismatch
- OpenAI-compatible or Anthropic-compatible translation layers do not preserve the controls Guardian needs

This framework exists to distinguish those cases before engineering time is spent in the wrong place.
