# Epic 16.6.1: Document Upload UX Improvements

## Overview

This document outlines the current issues with the document upload UI/UX and proposes changes to align with industry-standard chat composer patterns (Claude.ai, ChatGPT).

---

## Current Issues

### Issue 1: Extracted Context Displayed as Chat Message

**Problem:** When a document is uploaded and parsed, the extracted context (vendor name, solution, features, compliance mentions, etc.) is rendered as a visible assistant message in the chat.

**Current Behavior:**
```
┌─────────────────────────────────────────────────────────┐
│  Assistant Message:                                     │
│  📄 Document Context Extracted                          │
│  Solution: NLHS Project Roadmap Prioritization Tool     │
│  Type: Administrative Automation                        │
│  Key Features: ...                                      │
│  Compliance Mentions: ...                               │
│  Areas Needing Clarification: ...                       │
└─────────────────────────────────────────────────────────┘
```

**Why This Is Wrong:**
- Violates established chat UX patterns (Claude/ChatGPT don't narrate what they extracted)
- Creates visual noise in the conversation
- The AI should **absorb context silently**, not announce what it learned
- Users expect the AI to "just know" the document contents

**Root Cause (Code):**
- `DocumentUploadController.ts` lines 251-264: Saves context as assistant message
- `DocumentUploadController.ts` line 258: Emits `'message'` event causing chat display

---

### Issue 2: Progress Indicator Outside Composer

**Problem:** The `UploadProgress` component renders as a floating card BETWEEN the chat messages and the composer, rather than inside the composer where the file is being attached.

**Current Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Chat Messages                                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │ 📄 NLHS.pdf                                      │   │ ← FLOATING OUTSIDE
│  │ Analyzing document...  ████████░░░░             │   │
│  └─────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │ Type a message...                                │   │ ← COMPOSER (separate)
│  │ [Assessment ▾] [📎]                    [Send]   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Why This Is Wrong:**
- Breaks the mental model of "attaching a file to my message"
- Creates z-index/layering issues (card appears behind composer)
- Not consistent with Claude.ai/ChatGPT where file chip is INSIDE composer
- File feels disconnected from the message being composed

**Root Cause (Code):**
- `Composer.tsx` lines 149-158: `UploadProgress` rendered outside the composer box container

---

### Issue 3: Full-Width Progress Card Style

**Problem:** The current `UploadProgress` component is a full-width card with padding, borders, and extensive layout. This is visually heavy and doesn't match modern chat UX.

**Current Style:**
- Full-width rounded card with border
- Large padding and spacing
- Separate icon, filename, status text, and progress bar rows
- Takes up significant vertical space

**Why This Is Wrong:**
- Dominates the UI when a simple indicator would suffice
- Doesn't match the compact chip style used by Claude.ai/ChatGPT
- Creates visual imbalance in the composer area

---

### Issue 4: No Cancel/Remove During Active Upload

**Problem:** The X button to dismiss/cancel only appears after upload completes or errors. During active upload, users cannot cancel or remove the file.

**Root Cause (Code):**
- `UploadProgress.tsx` line 101: X button conditionally rendered only for `complete` or `error` stages

---

### Issue 5: Auto-Processing Instead of Queue-to-Send

**Problem:** When a file is selected, it immediately uploads and processes. Users cannot attach a file and then send it WITH a typed message.

**Industry Standard Pattern:**
1. Select file → File chip appears in composer (removable)
2. User types optional message
3. User clicks Send → File + message sent together

**Current Pattern:**
1. Select file → Immediate upload + processing
2. Context extracted and displayed
3. No opportunity to add context or cancel

---

## Proposed Changes

### Change 1: Silent Context Caching

**Proposal:** Remove the chat message for extracted context. Cache the context silently for the AI's context window.

**User Feedback:** Show a subtle toast notification: "Document processed ✓"

**Backend Changes:**
- Remove assistant message creation in `DocumentUploadController.ts`
- Remove `'message'` event emission
- Keep `'intake_context_ready'` event for UI state updates
- Store context in conversation metadata for Claude's context window

---

### Change 2: Compact File Chip Inside Composer

**Proposal:** Replace the full-width `UploadProgress` card with a compact, dark-themed file chip positioned INSIDE the composer, above the textarea.

**Target Layout:**
```
┌──────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────┐                     │
│  │ 📄 NLHS Product Requireme...  × │  ← Compact chip     │
│  │    ━━━━━━━━━━░░░░  65%          │    inside composer  │
│  └─────────────────────────────────┘                     │
│                                                          │
│  Type a message...                                       │
│                                                          │
│  [Assessment ▾] [📎]                            [Send]   │
└──────────────────────────────────────────────────────────┘
```

**Key Points:**
- Chip is compact (auto-width, not full-width)
- Left-aligned within composer
- Existing composer layout preserved (textarea, toolbar with Mode Selector, Paperclip, Send)

---

### Change 3: New FileChip Component Design

**Visual Specification (based on Claude.ai reference):**

```
┌─────────────────────────────────────┐
│ 📄  NLHS Product Requireme...    ×  │  ← Dark charcoal background
│     ━━━━━━━━━━━━░░░░░░  65%         │  ← Thin progress bar + percentage
└─────────────────────────────────────┘
```

**Styling:**
| Property | Value |
|----------|-------|
| Background | `bg-gray-800` (dark charcoal) |
| Text color | `text-white` |
| Border radius | `rounded-lg` (8px) |
| Padding | `px-3 py-2` |
| Icon | `FileText` from lucide-react, white |
| Filename | Truncated with ellipsis, ~20 chars max |
| X button | Always visible, `text-gray-400 hover:text-white` |
| Progress bar | Thin (2px), `bg-blue-500`, below filename |
| Percentage | Small text, `text-gray-400` |

**States:**
| State | Visual |
|-------|--------|
| Uploading | Spinner icon + progress bar + percentage |
| Processing | Spinner icon + "Analyzing..." text |
| Ready | Checkmark icon + "Ready" text |
| Error | Alert icon + error message + red tint |

---

### Change 4: X Button Always Visible

**Proposal:** The X button should be visible at ALL stages (uploading, processing, ready, error) to allow users to cancel or remove at any time.

---

### Change 5: Future - Queue for Send-with-Message

**Note:** This is a larger architectural change. For MVP, we can keep auto-processing but with the improved UI. A future iteration can implement the queue pattern.

**Future Pattern:**
1. Select file → Chip appears, background upload starts
2. User can type message
3. User clicks Send → Message + file context sent together
4. Processing happens → Toast notification on completion

---

## Files to Modify

### Frontend

| File | Changes |
|------|---------|
| `apps/web/src/components/chat/Composer.tsx` | Move file chip inside composer box, remove old UploadProgress placement |
| `apps/web/src/components/chat/UploadProgress.tsx` | Replace with new `FileChip` component or restyle completely |
| `apps/web/src/components/chat/FileChip.tsx` | NEW: Compact dark chip component |

### Backend

| File | Changes |
|------|---------|
| `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts` | Remove assistant message creation (lines 251-264), remove 'message' event emission (line 258) |

---

## Acceptance Criteria

- [ ] Document upload does NOT create a visible chat message
- [ ] File chip appears INSIDE composer, above textarea
- [ ] File chip uses compact dark pill style (not full-width card)
- [ ] X button visible at all stages (uploading, processing, ready, error)
- [ ] Existing composer layout preserved (Mode Selector, Paperclip, Send button)
- [ ] Progress shown as thin bar inside chip with percentage
- [ ] Subtle toast notification on successful processing (optional)

---

## References

- Claude.ai composer with file attachment
- ChatGPT file upload UX
- Screenshots provided by user (2025-12-16)
