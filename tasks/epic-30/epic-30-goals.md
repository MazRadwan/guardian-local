# Epic 30: Vision API Support for Chat

## Goal

Enable Claude to see and analyze images uploaded in **Consult mode only**. Currently, images are uploaded and stored but never passed to Claude's Vision API — the model only receives the filename as text.

**Scope Constraint:** This epic targets Consult mode only to minimize regression surface. Assessment mode image support is out of scope.

## Problem Statement

When users upload images in Consult mode:
1. Image is uploaded to S3 ✓
2. Metadata saved to database ✓
3. Context built for Claude...
4. **Only filename injected as text** — no image data
5. Claude responds: "I can't see images in this conversation"

The Vision API infrastructure exists (`ClaudeClient.analyzeImages()`) but is only used by `DocumentParserService` for intake extraction — **not connected to the chat pipeline**.

## Success Criteria

- [ ] Users can upload images in Consult mode and Claude analyzes them
- [ ] Images are converted to base64 and passed as Vision content blocks
- [ ] Works for PNG, JPG, JPEG formats
- [ ] Existing text file uploads (PDF, DOCX) continue to work
- [ ] No regression in Assessment or Scoring modes

## Technical Approach

### Architecture Gap

| Component | Current | Needed |
|-----------|---------|--------|
| FileContextBuilder | Text excerpts only | Base64 image conversion |
| ClaudeMessage type | `content: string` | `content: string \| ContentBlock[]` |
| Message pipeline | Text only | Include Vision content blocks |
| ClaudeClient | Vision methods exist but unused in chat | Connect to chat pipeline |

### Key Files to Modify

**Backend:**
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts` - Support content arrays
- `packages/backend/src/infrastructure/websocket/context/FileContextBuilder.ts` - Image → base64
- `packages/backend/src/infrastructure/websocket/context/ConversationContextBuilder.ts` - Pass image blocks

**New Files:**
- `packages/backend/src/infrastructure/ai/VisionContentBuilder.ts` - Image → Vision API format
- `packages/backend/src/infrastructure/ai/types/vision.ts` - Vision content types (Anthropic API schemas)

**IMPORTANT - Clean Architecture Constraint:**
Vision content types (`ContentBlock`, `ImageContentBlock`) are **Anthropic API schemas**, NOT domain concepts. They MUST live in `infrastructure/ai/types/`, NOT `domain/types/`. Domain layer must not couple to vendor payloads.

## Scope

- **In Scope:** Consult mode image analysis, base64 encoding, Vision API integration
- **Out of Scope:** Image editing, image generation, multi-modal responses, OCR for PDFs

## Risks

| Risk | Mitigation |
|------|------------|
| Memory pressure (base64 large images) | Hard limit: 20MB max, warn at 5MB |
| API cost increase (Vision tokens) | Document expected token usage |
| Breaking existing file uploads | Thorough regression testing |
| Breaking DocumentParserService | Dedicated regression test required |

## Security Requirements (MANDATORY)

| Requirement | Details |
|-------------|---------|
| **Never log base64 or buffers** | Logs may contain ONLY: `fileId`, `mimeType`, `size`, correlation/request ID |
| **Authorization on file retrieval** | Verify user owns conversation before loading files. Prevent cross-user data leakage |
| **PHI protection** | Image content is PHI - treat accordingly |

## Image Size Policy (Single Source of Truth)

**Based on Anthropic API limits (verified Jan 2026):**

| Threshold | Action |
|-----------|--------|
| < 4MB | Process normally |
| 4MB - 5MB | Log warning, process (near API limit) |
| > 5MB | **Reject with error** - exceeds Anthropic API limit |

**Resolution limits:**
| Constraint | Limit |
|------------|-------|
| Max resolution | 8000×8000 px (hard reject above) |
| Optimal resolution | ≤1568 px on longest side (for performance) |
| Multi-image (20+) | 2000×2000 px max per image |

**Source:** https://docs.anthropic.com/en/docs/build-with-claude/vision

**Supported MIME types (allowlist):**
- `image/png`
- `image/jpeg` (normalize `image/jpg` → `image/jpeg`)
- `image/gif`
- `image/webp`

## Dependencies

- Anthropic Claude API Vision support (already available)
- S3 file storage (already implemented)
- File upload pipeline (already implemented)

## Sprints

TBD - Awaiting sprint planning with user

---

## References

- Explore agent analysis: `/private/tmp/claude/-Users-mazradwan-Documents-PROJECTS-guardian-app/tasks/aa46353.output`
- ClaudeClient Vision methods: `packages/backend/src/infrastructure/ai/ClaudeClient.ts`
- FileContextBuilder: `packages/backend/src/infrastructure/websocket/context/FileContextBuilder.ts`
