# Epic 18: Visual Flow Comparison

## Before Epic 18 (Auto-Trigger)

### Upload Phase (Blocks UI for ~4 minutes)
```
┌─────────────────────────────────────────┐
│ Composer                                │
│                                         │
│ [Progress Bar: Uploading... 35%]       │
│ [Progress Bar: Storing... 60%]         │
│ [Progress Bar: Parsing... 80%]         │
│ [Progress Bar: Complete! 100%]         │
│                                         │
│ [Text input DISABLED]                   │
│ [Send button DISABLED]                  │
└─────────────────────────────────────────┘
```

**Problems:**
- User stares at loading spinner for 4 minutes
- No visibility into what's happening
- Composer blocked (can't type new message)
- Poor UX for slow operations

---

## After Epic 18 (Trigger-on-Send)

### Upload Phase (~3 seconds)
```
┌─────────────────────────────────────────┐
│ Composer                                │
│                                         │
│ [✓ vendor-questionnaire.pdf] Attached   │
│                                         │
│ [Text input ENABLED - type message]     │
│ [Send button ENABLED]                   │
└─────────────────────────────────────────┘
```

### After User Clicks Send
```
┌─────────────────────────────────────────┐
│ Chat Messages                           │
│                                         │
│ [User Message]                          │
│ 📎 vendor-questionnaire.pdf             │
│ "Please score this questionnaire"       │
│                                         │
│ [Progress in Chat]                      │
│ ⏳ Analyzing questionnaire responses... │
│ ▓▓▓▓▓▓▓░░░░░░░░░░░░░ 35%              │
│                                         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Composer (CLEARED, READY)               │
│                                         │
│ [Text input ENABLED]                    │
│ [Send button READY]                     │
└─────────────────────────────────────────┘
```

### Progress Updates (In Chat Stream)
```
┌─────────────────────────────────────────┐
│ [Progress Message - Updates in Place]  │
│ ⏳ Scoring AI Ethics & Bias...          │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░ 70%              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ [Progress Message - Final Update]      │
│ ⏳ Validating results...                │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 95%              │
└─────────────────────────────────────────┘
```

### Completion
```
┌─────────────────────────────────────────┐
│ [Progress Message Removed]             │
│                                         │
│ [Assistant Message with Results]       │
│ ✅ Scoring Complete                     │
│                                         │
│ ## Overall Score: 7.2/10                │
│ ### Dimension Scores:                   │
│ - Data Privacy: 8/10                    │
│ - AI Ethics: 6/10                       │
│ ...                                     │
└─────────────────────────────────────────┘
```

---

## Key UX Improvements

### 1. Fast Feedback (3 seconds vs 4 minutes)
**Before:** Wait 4 minutes before seeing "Attached"
**After:** See "Attached" within 3 seconds

### 2. Non-Blocking UI
**Before:** Composer blocked during entire upload/parse cycle
**After:** Composer clears immediately after send, ready for next message

### 3. Visibility into Progress
**Before:** Generic spinner, no phase info
**After:**
- "Analyzing questionnaire responses..." (parsing phase)
- "Scoring AI Ethics & Bias..." (dimension-by-dimension)
- Progress bar with percentage

### 4. Better Error Recovery
**Before:** If parsing fails, user loses 4 minutes
**After:** Upload completes in 3s, parsing triggered on-demand (can retry)

### 5. Multi-Tasking
**Before:** Can't do anything while waiting
**After:** Can continue conversation, add context, ask questions while scoring runs

---

## Component Architecture

### ProgressMessage Component
```
┌─────────────────────────────────────────┐
│ [Icon] [Message Text]                   │
│        [Progress Bar] (optional)        │
└─────────────────────────────────────────┘
```

**States:**
- `parsing` - Spinner icon, progress bar
- `scoring` - Spinner icon, progress bar
- `complete` - Checkmark icon, no progress bar (ephemeral, removed)

**Props:**
```typescript
interface ProgressMessageProps {
  status: ScoringStatus;
  progress?: number;
  message: string;
}
```

**Accessibility:**
- `role="status"` - Screen readers announce updates
- `aria-live="polite"` - Non-interruptive announcements
- `aria-label` with percentage - Clear progress indication
- Semantic HTML - Proper heading hierarchy

---

## Event Flow

### Sprint 1A (Backend)
```
Upload → S3 Store → Emit file_attached → Extract excerpt
                                           ↓
                                    Store textExcerpt
                                           ↓
                                    (Enrichment optional)
```

### Sprint 2 (Trigger-on-Send)
```
User sends message with fileId
        ↓
Message handler checks if parsing needed
        ↓
Emit scoring_progress: "parsing"
        ↓
Parse questionnaire
        ↓
Emit scoring_progress: "scoring" (per dimension)
        ↓
Score each dimension
        ↓
Emit scoring_progress: "complete"
        ↓
Emit scoring_complete with results
```

### Frontend (This Sprint)
```
scoring_progress event
        ↓
Update chatStore.scoringProgress
        ↓
MessageList renders ProgressMessage
        ↓
Auto-scroll to show progress
        ↓
Progress bar updates (CSS transition)
        ↓
Status changes to "complete"
        ↓
ProgressMessage removed
        ↓
ScoringResultCard appears
```

---

## CSS Animations

### Progress Bar Transition
```css
.h-full {
  transition: width 300ms ease-out;
}
```
**Effect:** Smooth width animation as progress increases

### Pulse Animation
```css
@keyframes pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.95; }
}
```
**Effect:** Subtle breathing effect to indicate activity (2s cycle)

### Spinner Rotation
```css
.animate-spin {
  animation: spin 1s linear infinite;
}
```
**Effect:** Continuous rotation for loading icon

---

## Testing Strategy

### Unit Tests (7 tests)
✅ Renders with parsing status
✅ Renders with scoring status
✅ Shows spinner icon for active states
✅ Shows checkmark icon for complete status
✅ Hides progress bar when undefined
✅ Hides progress bar when complete
✅ Has accessible ARIA labels

### Integration Tests (To be added in Story 18.2.4)
- File upload → file_attached within 3s
- Send message → scoring_progress events
- Progress bar updates in real-time
- Progress message disappears on complete
- Final result card appears

### Manual Testing Checklist
- [ ] Upload PDF in scoring mode
- [ ] Verify "Attached" chip appears within 3s
- [ ] Composer remains enabled after attach
- [ ] Send message with file
- [ ] Verify progress message appears in chat
- [ ] Verify progress bar updates smoothly
- [ ] Verify dimension names appear correctly
- [ ] Verify progress message disappears on complete
- [ ] Verify scoring result card appears
- [ ] Test screen reader announcements

---

## Performance Metrics

### Before Epic 18
- Time to "ready": ~240 seconds (4 minutes)
- Composer blocked: 240 seconds
- User idle time: 240 seconds

### After Epic 18
- Time to "attached": ~3 seconds (SLO)
- Composer blocked: 0 seconds
- User idle time: 0 seconds (can continue working)
- Parsing/scoring: Still ~4 minutes, but non-blocking

### SLO Achievement
✅ file_attached within 3 seconds (Sprint 1A)
✅ Composer clears immediately (existing behavior)
✅ Progress updates every 5-10 seconds (existing backend)
