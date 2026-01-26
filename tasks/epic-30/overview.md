# Epic 30: Vision API Support - Overview

## Summary

Enable Claude to see and analyze images uploaded in **Consult mode only**.

## Hard Requirements (from external review)

| Requirement | Status |
|-------------|--------|
| **Clean Architecture**: Vision types in `infrastructure/ai/types/`, NOT `domain/` | Encoded in Sprint 1 |
| **Security**: Never log base64/buffers, only fileId/mimeType/size | Encoded in Sprint 2 |
| **Size Policy**: 5MB max (API limit), 4MB warn, MIME normalization | Encoded in Sprint 2 |
| **Mode Scope**: Consult mode only (Assessment out of scope) | Encoded in Sprint 4 |
| **Regression Test**: DocumentParserService must not break | Encoded in Sprint 4 |

## Sprints

| Sprint | Focus | Stories | Estimated |
|--------|-------|---------|-----------|
| Sprint 1 | Types & Infrastructure | 3 | Types, ClaudeApiMessage, ContentBlock support |
| Sprint 2 | Image Processing | 4 | VisionContentBuilder, size/MIME validation, DI wiring, upload limits alignment |
| Sprint 3 | Pipeline Integration | 5 | FileContextBuilder, ConversationContextBuilder, MessageHandler, DI, caching |
| Sprint 4 | Testing & Polish | 5 | Integration tests, error handling, mode behavior, regression, docs |

**Total Stories:** 17

## Execution Order

```
Sprint 1 (Types) - backend-agent
    ↓
Sprint 2 (VisionContentBuilder)
    ┌───────────────────────────────┐
    │ backend: 30.2.1 → 30.2.2 → 30.2.3 │
    │           ║ PARALLEL              │
    │ frontend: 30.2.4                  │
    └───────────────────────────────┘
    ↓
Sprint 3 (Pipeline Integration) - backend-agent
    ↓
Sprint 4 (Testing & Polish) - backend-agent
```

**Parallelization:** Sprint 2 has one frontend story (30.2.4) that can run in parallel with backend stories - no file overlap.

## Files Created/Modified

### New Files
- `packages/backend/src/infrastructure/ai/types/vision.ts` - Anthropic API schemas (NOT domain/)
- `packages/backend/src/infrastructure/ai/types/message.ts` - ClaudeApiMessage type (infrastructure layer)
- `packages/backend/src/infrastructure/ai/types/index.ts` - Type exports
- `packages/backend/src/application/interfaces/IVisionContentBuilder.ts`
- `packages/backend/src/infrastructure/ai/VisionContentBuilder.ts`
- `packages/backend/__tests__/integration/vision-pipeline.test.ts`
- `packages/backend/__tests__/integration/document-parser-regression.test.ts` - REQUIRED regression test

### Modified Files
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts` - Accept imageBlocks parameter
- `packages/backend/src/infrastructure/websocket/context/FileContextBuilder.ts`
- `packages/backend/src/infrastructure/websocket/context/ConversationContextBuilder.ts`
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`
- `packages/backend/src/index.ts`
- `packages/backend/src/application/interfaces/IDocumentParser.ts` - Align image size limit
- `apps/web/src/hooks/useFileUpload.ts` - Align image size limit (10MB → 5MB)
- `apps/web/src/hooks/useMultiFileUpload.ts` - Add image-specific size validation

## Success Metrics

1. **Functional:** Claude describes uploaded images accurately
2. **Performance:** No noticeable latency increase (<500ms additional)
3. **Reliability:** Graceful fallback if image processing fails
4. **Compatibility:** Existing text file uploads unaffected

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large images cause memory issues | High | Size limits (5MB max per Anthropic API) |
| Vision API cost increase | Medium | Document expected usage |
| Breaking existing flow | High | Comprehensive regression tests |
| Base64 encoding overhead | Low | Acceptable for <5MB images |

## Definition of Done

- [ ] Sprint 1-4 complete
- [ ] All tests pass (unit + integration)
- [ ] Manual QA checklist complete
- [ ] No regressions in existing functionality
- [ ] Deployed to production
