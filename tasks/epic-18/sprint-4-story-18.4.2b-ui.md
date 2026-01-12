# Story 18.4.2b: Clarification UI Component

**Sprint:** 4
**Track:** A (Clarification)
**Phase:** 3 (after 18.4.2a)
**Agent:** frontend-agent
**Estimated Lines:** ~450
**Dependencies:** 18.4.2a (clarification events)

---

## Overview

### What This Story Does

Implements the frontend component that displays clarification prompts as inline
buttons in the chat. Handles all clarification types:
- `wrong_document_type` - Document doesn't look like questionnaire
- `confirm_scoring` - Unknown document type, confirm to proceed
- `multiple_vendors` - Choose which vendor to score
- `offer_next_vendor` - After scoring, offer to score other vendor

Also handles `clear_composer_files` event to clear file chips when user
chooses "Remove & Re-upload".

### User-Visible Change

```
Wrong Document Type:
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠️ "whitepaper.pdf" doesn't look like a completed questionnaire.    │
│                                                                     │
│  [Switch to Consult]  [Switch to Assessment]  [Score Anyway]        │
└─────────────────────────────────────────────────────────────────────┘

Multiple Vendors:
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠️ Multiple vendors detected                                        │
│                                                                     │
│ Your files appear to be from different vendors. Scoring works best │
│ with one vendor at a time for accurate assessment.                 │
│                                                                     │
│ Detected vendors:                                                   │
│   • Acme Corp (2 files)                                            │
│   • CloudSec Inc (1 file)                                          │
│                                                                     │
│ Which vendor would you like to score first?                        │
│                                                                     │
│  [Score Acme Corp]  [Score CloudSec Inc]  [Remove & Re-upload]     │
└─────────────────────────────────────────────────────────────────────┘

Offer Next Vendor (after scoring completes):
┌─────────────────────────────────────────────────────────────────────┐
│ ✓ Scoring complete.                                                 │
│                                                                     │
│ Note: CloudSec Inc files were not scored: CloudSec.pdf             │
│                                                                     │
│ Would you like to score CloudSec Inc (1 file)?                     │
│                                                                     │
│  [Score CloudSec Inc]  [No thanks]                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Codebase Context

### Files to Modify/Create

**IMPORTANT:** The frontend uses a specific hook chain pattern for WebSocket events:
```
useWebSocket.ts → useWebSocketAdapter.ts → useWebSocketEvents.ts → useChatController.ts
```

1. `apps/web/src/lib/websocket.ts` - Add types + WebSocketClient methods
2. `apps/web/src/hooks/useWebSocket.ts` - Add callback options + registration
3. `apps/web/src/hooks/useWebSocketAdapter.ts` - Add to WebSocketEventHandlers
4. `apps/web/src/hooks/useWebSocketEvents.ts` - Create stable handlers
5. `apps/web/src/hooks/useChatController.ts` - Wire handlers to adapter
6. `apps/web/src/components/chat/ClarificationPrompt.tsx` (NEW)
7. `apps/web/src/components/chat/MessageList.tsx` - Add dedicated prop (NOT metadata)
8. `apps/web/src/hooks/useMultiFileUpload.ts` - Handle clear_composer_files

### Existing Pattern Reference

**Event registration in useWebSocket.ts:**
```typescript
// Options interface has onXxx callbacks
export interface UseWebSocketOptions {
  onConversationModeUpdated?: (data: { conversationId: string; mode: 'consult' | 'assessment' }) => void;
  // ...other callbacks
}

// Registration in useEffect
if (onConversationModeUpdated) {
  const unsub = client.onConversationModeUpdated((data) => {
    onConversationModeUpdated(data);
  });
  unsubscribers.push(unsub);
}
```

**Handler creation in useWebSocketEvents.ts:**
```typescript
const handleConversationModeUpdated = useCallback(
  (data: { conversationId: string; mode: ConversationMode }) => {
    // Update state
  },
  [/* deps */]
);
```

**NOT metadata-driven:** MessageList uses dedicated props for special content:
```typescript
// MessageList.tsx - uses props, NOT message.metadata
export interface MessageListProps {
  messages: ChatMessageType[];
  questionnaire?: { /* props */ };  // Dedicated prop
  scoringProgress?: { /* props */ }; // Dedicated prop
}
```

---

## Implementation Steps

### Step 1: Add Types to WebSocket Library

**File:** `apps/web/src/lib/websocket.ts`

Add near other event type exports:

```typescript
// Epic 18.4.2b: Clarification types
export type ClarificationPromptType =
  | 'wrong_document_type'
  | 'confirm_scoring'
  | 'multiple_vendors'
  | 'offer_next_vendor';

export interface ClarificationOption {
  id: string;
  label: string;
  description: string;
}

export interface ClarificationFileInfo {
  fileId: string;
  filename: string;
  detectedDocType: string | null;
  detectedVendorName: string | null;
}

export interface ClarificationPromptEvent {
  conversationId: string;
  promptId: string;
  type: ClarificationPromptType;
  message: string;
  files: ClarificationFileInfo[];
  options: ClarificationOption[];
}

export interface ClarificationResponsePayload {
  conversationId: string;
  promptId: string;
  optionId: string;
}

export interface ClearComposerFilesEvent {
  conversationId: string;
}
```

**Add methods to WebSocketClient class:**

```typescript
class WebSocketClient {
  // ... existing methods ...

  // Epic 18.4.2b: Clarification event listeners
  onClarificationPrompt(callback: (event: ClarificationPromptEvent) => void): () => void {
    this.socket?.on('clarification_prompt', callback);
    return () => this.socket?.off('clarification_prompt', callback);
  }

  onClearComposerFiles(callback: (event: ClearComposerFilesEvent) => void): () => void {
    this.socket?.on('clear_composer_files', callback);
    return () => this.socket?.off('clear_composer_files', callback);
  }

  // Emit clarification response
  sendClarificationResponse(payload: ClarificationResponsePayload): void {
    this.socket?.emit('clarification_response', payload);
  }
}
```

### Step 2: Create ClarificationPrompt Component

**File:** `apps/web/src/components/chat/ClarificationPrompt.tsx` (NEW)

```tsx
'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ClarificationPromptType, ClarificationOption } from '@/lib/websocket';

interface ClarificationPromptProps {
  promptId: string;
  type: ClarificationPromptType;
  message: string;
  options: ClarificationOption[];
  onSelect: (optionId: string) => void;
  disabled?: boolean;
}

export function ClarificationPrompt({
  promptId,
  type,
  message,
  options,
  onSelect,
  disabled = false,
}: ClarificationPromptProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const handleSelect = (optionId: string) => {
    if (disabled || selectedOption) return;
    setSelectedOption(optionId);
    onSelect(optionId);
  };

  // Determine styling based on type
  const isSuccess = type === 'offer_next_vendor';
  const Icon = isSuccess ? CheckCircle : AlertTriangle;
  const borderColor = isSuccess ? 'border-green-500/50' : 'border-yellow-500/50';
  const bgColor = isSuccess ? 'bg-green-500/5' : 'bg-yellow-500/5';
  const iconColor = isSuccess ? 'text-green-500' : 'text-yellow-500';

  // Determine button variant based on option
  const getButtonVariant = (optionId: string): 'default' | 'outline' | 'secondary' => {
    // Primary actions get default styling
    if (optionId === 'score_anyway' || optionId === 'score' || optionId === 'score_next') {
      return 'default';
    }
    if (optionId.startsWith('vendor_')) {
      return 'default';
    }
    // Secondary actions
    if (optionId === 'remove_conflicting' || optionId === 'cancel' || optionId === 'skip') {
      return 'secondary';
    }
    return 'outline';
  };

  return (
    <Card className={cn(borderColor, bgColor)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Icon className={cn('h-5 w-5 mt-0.5 flex-shrink-0', iconColor)} />
          <div className="flex-1 space-y-3">
            {/* Message with preserved line breaks */}
            <div className="text-sm text-foreground whitespace-pre-line">
              {message}
            </div>

            {/* Option buttons */}
            <div className="flex flex-wrap gap-2">
              {options.map((option) => (
                <Button
                  key={option.id}
                  variant={getButtonVariant(option.id)}
                  size="sm"
                  onClick={() => handleSelect(option.id)}
                  disabled={disabled || selectedOption !== null}
                  title={option.description}
                  className={cn(
                    selectedOption === option.id && 'ring-2 ring-primary',
                    selectedOption && selectedOption !== option.id && 'opacity-50'
                  )}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            {/* Show selected state */}
            {selectedOption && (
              <p className="text-xs text-muted-foreground">
                Processing your selection...
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Step 3: Add Callbacks to useWebSocket Options

**File:** `apps/web/src/hooks/useWebSocket.ts`

Add to UseWebSocketOptions interface:

```typescript
export interface UseWebSocketOptions {
  // ... existing options ...

  // Epic 18.4.2b: Clarification callbacks
  onClarificationPrompt?: (event: ClarificationPromptEvent) => void;
  onClearComposerFiles?: (event: ClearComposerFilesEvent) => void;
}
```

Add to destructured params:

```typescript
export function useWebSocket({
  // ... existing params ...
  onClarificationPrompt,
  onClearComposerFiles,
}: UseWebSocketOptions) {
```

### Step 3b: Fix Mode Type in websocket.ts

**File:** `apps/web/src/lib/websocket.ts`

The current `onConversationModeUpdated` callback type is missing 'scoring':

```typescript
// BEFORE (line 9, 674, 677):
mode: 'consult' | 'assessment'

// AFTER:
mode: 'consult' | 'assessment' | 'scoring'
```

**Why:** Clarification prompts can switch to any mode including 'scoring'.
The `ConversationMode` type in `useWebSocketAdapter.ts` already includes 'scoring' (line 9),
but `websocket.ts` types are inconsistent.

Add registration in the useEffect (follow existing pattern):

```typescript
// In the useEffect that registers event listeners
if (onClarificationPrompt) {
  const unsub = client.onClarificationPrompt((data) => {
    onClarificationPrompt(data);
  });
  unsubscribers.push(unsub);
}

if (onClearComposerFiles) {
  const unsub = client.onClearComposerFiles((data) => {
    onClearComposerFiles(data);
  });
  unsubscribers.push(unsub);
}
```

Add sendClarificationResponse to returned object:

```typescript
const sendClarificationResponse = useCallback(
  (payload: ClarificationResponsePayload) => {
    if (!clientRef.current || !isConnected) {
      console.warn('[useWebSocket] Cannot send clarification response - not connected');
      return;
    }
    clientRef.current.sendClarificationResponse(payload);
  },
  [isConnected]
);

return useMemo(() => ({
  // ... existing returns ...
  sendClarificationResponse,
}), [/* ... deps */]);
```

Add callbacks to deps array:

```typescript
}, [isConnected, /* existing deps */, onClarificationPrompt, onClearComposerFiles]);
```

### Step 4: Add to WebSocketEventHandlers Interface AND Adapter Interface

**File:** `apps/web/src/hooks/useWebSocketAdapter.ts`

**Part A: Add event handlers to WebSocketEventHandlers:**

```typescript
import type { ClarificationPromptEvent, ClearComposerFilesEvent, ClarificationResponsePayload } from '@/lib/websocket';

export interface WebSocketEventHandlers {
  // ... existing handlers ...

  // Epic 18.4.2b: Clarification handlers
  onClarificationPrompt?: (event: ClarificationPromptEvent) => void;
  onClearComposerFiles?: (event: ClearComposerFilesEvent) => void;
}
```

**Part B: Add sendClarificationResponse to WebSocketAdapterInterface:**

```typescript
export interface WebSocketAdapterInterface {
  // ... existing interface members ...

  // Epic 18.4.2b: Clarification response
  sendClarificationResponse: (payload: ClarificationResponsePayload) => void;
}
```

**Part C: Add handler passthrough AND method implementation:**

```typescript
// In useWebSocketAdapter function
const wsHook = useWebSocket({
  // ... existing options ...
  onClarificationPrompt: handlers.onClarificationPrompt,
  onClearComposerFiles: handlers.onClearComposerFiles,
});

// In the returned useMemo object
return useMemo(() => ({
  // ... existing returns ...

  // Epic 18.4.2b: Clarification response
  sendClarificationResponse: (payload: ClarificationResponsePayload) => {
    wsHook.sendClarificationResponse(payload);
  },
}), [/* ... deps including wsHook.sendClarificationResponse */]);
```

### Step 5: Create Handlers in useWebSocketEvents

**File:** `apps/web/src/hooks/useWebSocketEvents.ts`

**IMPORTANT:** The hook already receives `composerRef` as a parameter (see line 39, 133).
Use `composerRef.current?.clearFiles()` which already exists in the codebase.

**Part A: Add useState import and types (line 3):**

```typescript
import { useCallback, useState } from 'react';  // Add useState
import type { ClarificationPromptEvent, ClearComposerFilesEvent } from '@/lib/websocket';
```

**Part B: Update UseWebSocketEventsReturn interface (around line 64-86):**

```typescript
export interface UseWebSocketEventsReturn {
  // ... existing handlers (handleMessage, handleMessageStream, etc.) ...
  handleScoringStarted: (data: ScoringStartedPayload) => void;
  handleScoringProgress: (data: ScoringProgressPayload) => void;
  handleScoringComplete: (data: ScoringCompletePayload) => void;
  handleScoringError: (data: ScoringErrorPayload) => void;
  // Epic 18.4.2b: Clarification handlers + state
  handleClarificationPrompt: (data: ClarificationPromptEvent) => void;
  handleClearComposerFiles: (data: ClearComposerFilesEvent) => void;
  pendingClarification: ClarificationPromptEvent | null;
  setPendingClarification: React.Dispatch<React.SetStateAction<ClarificationPromptEvent | null>>;
}
```

**Part C: Add state and handlers in function body:**

```typescript
// Add state for pending clarification (near other state declarations)
const [pendingClarification, setPendingClarification] = useState<ClarificationPromptEvent | null>(null);

// Create stable handler for clarification_prompt
const handleClarificationPrompt = useCallback(
  (data: ClarificationPromptEvent) => {
    if (data.conversationId === activeConversationId) {
      setPendingClarification(data);
    }
  },
  [activeConversationId]
);

// Create stable handler for clear_composer_files
// NOTE: useWebSocketEvents already has composerRef passed in (line 39, 133)
const handleClearComposerFiles = useCallback(
  (data: ClearComposerFilesEvent) => {
    if (data.conversationId === activeConversationId) {
      // Use existing composerRef pattern (see Composer.tsx line 45, ChatInterface.tsx line 197)
      composerRef.current?.clearFiles();
    }
  },
  [activeConversationId, composerRef]
);
```

**Part D: Add to return object:**

```typescript
return {
  // ... existing returns ...
  handleClarificationPrompt,
  handleClearComposerFiles,
  pendingClarification,
  setPendingClarification,
};
```

### Step 6: Wire Handlers in useChatController

**File:** `apps/web/src/hooks/useChatController.ts`

```typescript
// Destructure from useWebSocketEvents
const {
  // ... existing handlers ...
  handleClarificationPrompt,
  handleClearComposerFiles,
  pendingClarification,
  setPendingClarification,
} = useWebSocketEvents(/* params */);

// Include in handlers object passed to adapter
const handlers = useMemo(() => ({
  // ... existing handlers ...
  onClarificationPrompt: handleClarificationPrompt,
  onClearComposerFiles: handleClearComposerFiles,
}), [/* deps including new handlers */]);

// Create response handler using adapter's send method
const handleClarificationResponse = useCallback((optionId: string) => {
  if (!pendingClarification) return;

  adapter.sendClarificationResponse({
    conversationId: pendingClarification.conversationId,
    promptId: pendingClarification.promptId,
    optionId,
  });

  // Clear pending state after response
  setPendingClarification(null);
}, [pendingClarification, adapter, setPendingClarification]);

// Return for component use
return {
  // ... existing returns ...
  pendingClarification,
  handleClarificationResponse,
};
```

### Step 7: Integrate into MessageList (Dedicated Prop Pattern)

**File:** `apps/web/src/components/chat/MessageList.tsx`

**IMPORTANT:** Use dedicated prop, NOT metadata-driven rendering.

**Part A: Add to MessageListProps interface (around line 15):**

```tsx
import { ClarificationPrompt } from './ClarificationPrompt';
import type { ClarificationPromptEvent } from '@/lib/websocket';

export interface MessageListProps {
  messages: ChatMessageType[];
  // ... existing props (isLoading, isStreaming, onRegenerate, etc.) ...
  questionnaire?: { /* existing */ };
  scoringResult?: ScoringResultData | null;
  scoringProgress?: { /* existing */ };
  // NEW: Clarification prompt (dedicated prop, not message metadata)
  clarificationPrompt?: ClarificationPromptEvent | null;
  onClarificationSelect?: (optionId: string) => void;
}
```

**Part B: Add to component destructuring (around line 50):**

```tsx
export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
  function MessageList({
    messages,
    isLoading,
    // ... existing props ...
    scoringProgress,
    clarificationPrompt,       // NEW
    onClarificationSelect,      // NEW
  }, ref) {
```

**Part C: Add render block BEFORE scoringProgress (around line 252):**

The existing render order is:
1. Messages (with questionnaire insertion)
2. Questionnaire at end (if insertIndex >= messages.length)
3. Loading indicator
4. **Clarification prompt (NEW - blocks scoring)**
5. Scoring progress
6. Scoring result

```tsx
{/* Render clarification prompt BEFORE scoring progress - it blocks scoring */}
{clarificationPrompt && onClarificationSelect && (
  <div className="py-4">
    <ClarificationPrompt
      promptId={clarificationPrompt.promptId}
      type={clarificationPrompt.type}
      message={clarificationPrompt.message}
      options={clarificationPrompt.options}
      onSelect={onClarificationSelect}
    />
  </div>
)}

{/* Epic 18 Story 18.2.5: Progress-in-chat UX - shows during parsing/scoring */}
{scoringProgress && (scoringProgress.status === 'parsing' || scoringProgress.status === 'scoring') && (
  <div className="py-4" data-testid="scoring-progress">
    <ProgressMessage
      status={scoringProgress.status}
      progress={scoringProgress.progress}
      message={scoringProgress.message}
    />
  </div>
)}
```

**NOTE:** The actual ChatMessage component (line 197-207) uses individual props:
`role`, `content`, `components`, `timestamp`, `messageIndex`, `onRegenerate`,
`isRegenerating`, `attachments`, `onDownloadAttachment` - NOT a single `message` prop.

**In ChatInterface.tsx (the correct parent component):**

**File:** `apps/web/src/components/chat/ChatInterface.tsx`

```tsx
// ChatInterface already uses useChatController (see line 8, 15-34)
// Add pendingClarification and handleClarificationResponse to destructuring

const {
  messages,
  // ... existing destructuring ...
  pendingClarification,           // NEW
  handleClarificationResponse,     // NEW
} = useChatController();

// Pass to MessageList (around line 200+ where MessageList is rendered)
<MessageList
  messages={messages}
  // ... existing props ...
  clarificationPrompt={pendingClarification}
  onClarificationSelect={handleClarificationResponse}
/>
```

### Step 8: No Changes to useMultiFileUpload

**NOTE:** We use `composerRef.current?.clearFiles()` in Step 5, which already exists in
the codebase (see `Composer.tsx` line 45, 117 and `ChatInterface.tsx` line 197).

The `ComposerRef.clearFiles()` method is already implemented:

```typescript
// From Composer.tsx (lines 112-118)
useImperativeHandle(ref, () => ({
  focus: () => textareaRef.current?.focus(),
  clearFiles: () => {
    // Implementation clears file state
  },
}));
```

**No changes needed to useMultiFileUpload.**

---

## Tests to Write

**File:** `apps/web/src/components/chat/__tests__/ClarificationPrompt.test.tsx`

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { ClarificationPrompt } from '../ClarificationPrompt';

describe('ClarificationPrompt', () => {
  const defaultProps = {
    promptId: 'test-prompt-id',
    type: 'wrong_document_type' as const,
    message: 'This document does not look like a questionnaire.',
    options: [
      { id: 'switch_consult', label: 'Switch to Consult', description: 'Ask questions' },
      { id: 'score_anyway', label: 'Score Anyway', description: 'Force scoring' },
    ],
    onSelect: jest.fn(),
    disabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render message and options', () => {
    render(<ClarificationPrompt {...defaultProps} />);

    expect(screen.getByText(/does not look like a questionnaire/)).toBeInTheDocument();
    expect(screen.getByText('Switch to Consult')).toBeInTheDocument();
    expect(screen.getByText('Score Anyway')).toBeInTheDocument();
  });

  it('should call onSelect when button clicked', () => {
    render(<ClarificationPrompt {...defaultProps} />);

    fireEvent.click(screen.getByText('Score Anyway'));

    expect(defaultProps.onSelect).toHaveBeenCalledWith('score_anyway');
  });

  it('should disable buttons after selection', () => {
    render(<ClarificationPrompt {...defaultProps} />);

    fireEvent.click(screen.getByText('Score Anyway'));

    // All buttons should be disabled after selection
    expect(screen.getByText('Switch to Consult')).toBeDisabled();
    expect(screen.getByText('Score Anyway')).toBeDisabled();
  });

  it('should disable buttons when disabled prop is true', () => {
    render(<ClarificationPrompt {...defaultProps} disabled={true} />);

    expect(screen.getByText('Switch to Consult')).toBeDisabled();
    expect(screen.getByText('Score Anyway')).toBeDisabled();
  });

  it('should show warning icon for wrong_document_type', () => {
    render(<ClarificationPrompt {...defaultProps} type="wrong_document_type" />);

    // AlertTriangle icon should have yellow styling
    const card = screen.getByRole('article') || document.querySelector('.border-yellow-500\\/50');
    expect(card).toBeTruthy();
  });

  it('should show success icon for offer_next_vendor', () => {
    render(
      <ClarificationPrompt
        {...defaultProps}
        type="offer_next_vendor"
        message="Scoring complete. Score next vendor?"
      />
    );

    // CheckCircle icon should have green styling
    const card = document.querySelector('.border-green-500\\/50');
    expect(card).toBeTruthy();
  });

  it('should preserve line breaks in message', () => {
    const multilineMessage = 'Line 1\nLine 2\nLine 3';
    render(<ClarificationPrompt {...defaultProps} message={multilineMessage} />);

    // The whitespace-pre-line class should preserve line breaks
    const messageElement = screen.getByText(/Line 1/);
    expect(messageElement).toHaveClass('whitespace-pre-line');
  });

  it('should render vendor selection options with default variant', () => {
    render(
      <ClarificationPrompt
        {...defaultProps}
        type="multiple_vendors"
        options={[
          { id: 'vendor_0', label: 'Score Acme Corp', description: '2 files' },
          { id: 'vendor_1', label: 'Score CloudSec', description: '1 file' },
          { id: 'remove_conflicting', label: 'Remove & Re-upload', description: 'Clear files' },
        ]}
      />
    );

    expect(screen.getByText('Score Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Score CloudSec')).toBeInTheDocument();
    expect(screen.getByText('Remove & Re-upload')).toBeInTheDocument();
  });

  it('should show processing message after selection', () => {
    render(<ClarificationPrompt {...defaultProps} />);

    fireEvent.click(screen.getByText('Score Anyway'));

    expect(screen.getByText('Processing your selection...')).toBeInTheDocument();
  });
});
```

**File:** `apps/web/src/hooks/__tests__/useWebSocketEvents.clarification.test.ts`

```typescript
import { renderHook, act } from '@testing-library/react';
import { useWebSocketEvents } from '../useWebSocketEvents';

describe('useWebSocketEvents - Clarification Handling', () => {
  it('should update pendingClarification on clarification_prompt event', () => {
    // Setup mock WebSocket adapter
    // Trigger handleClarificationPrompt with event data
    // Assert pendingClarification state updates
  });

  it('should only update for matching conversationId', () => {
    // Event with different conversationId should be ignored
  });

  it('should call clearUploadedFiles on clear_composer_files event', () => {
    // Trigger handleClearComposerFiles with event data
    // Assert clearUploadedFiles was called
  });
});
```

**File:** `apps/web/src/hooks/__tests__/useChatController.clarification.test.ts`

```typescript
import { renderHook, act } from '@testing-library/react';
import { useChatController } from '../useChatController';

describe('useChatController - Clarification Response', () => {
  it('should send clarification_response when handleClarificationResponse called', () => {
    // Setup with pendingClarification
    // Call handleClarificationResponse('switch_consult')
    // Assert adapter.sendClarificationResponse called with correct payload
  });

  it('should clear pendingClarification after response sent', () => {
    // Assert pendingClarification becomes null
  });

  it('should not send if no pendingClarification', () => {
    // Call handleClarificationResponse with no pending
    // Assert sendClarificationResponse NOT called
  });
});
```

---

## Acceptance Criteria

- [ ] ClarificationPrompt component created
- [ ] Component renders message and option buttons
- [ ] Clicking button sends clarification_response event via adapter
- [ ] Buttons disabled after selection
- [ ] "Processing..." message shown after selection
- [ ] Warning styling (yellow) for wrong_document_type, confirm_scoring, multiple_vendors
- [ ] Success styling (green) for offer_next_vendor
- [ ] Multiline messages preserved (whitespace-pre-line)
- [ ] Event types added to websocket.ts
- [ ] Mode type fixed to include 'scoring' (websocket.ts lines 9, 674, 677)
- [ ] WebSocketClient methods added (onClarificationPrompt, onClearComposerFiles, sendClarificationResponse)
- [ ] Callbacks added to useWebSocket (UseWebSocketOptions interface)
- [ ] sendClarificationResponse added to WebSocketAdapterInterface
- [ ] sendClarificationResponse implemented in useWebSocketAdapter useMemo
- [ ] Handlers added to useWebSocketAdapter (WebSocketEventHandlers interface)
- [ ] Stable handlers created in useWebSocketEvents (using composerRef.clearFiles())
- [ ] Handlers wired in useChatController
- [ ] ChatInterface.tsx updated to pass props to MessageList
- [ ] MessageList uses dedicated prop (NOT metadata-driven)
- [ ] clear_composer_files uses composerRef.current?.clearFiles()
- [ ] Unit tests pass

---

## Verification

```bash
# Run unit tests
pnpm --filter @guardian/web test:unit -- --grep "ClarificationPrompt"

# Run all frontend tests
pnpm --filter @guardian/web test:unit
```

**Manual Testing:**

1. Upload non-questionnaire in Scoring mode → see wrong_document_type prompt
2. Click "Switch to Consult" → verify mode switches in UI
3. Verify buttons disabled after clicking
4. Upload files from 2 vendors → see multiple_vendors prompt
5. Click vendor option → verify scoring starts for that vendor
6. After scoring, see offer_next_vendor prompt
7. Click "Remove & Re-upload" → verify file chips clear from composer

---

## Dependencies

### Uses from 18.4.2a (Events)

WebSocket events:
- `clarification_prompt` - Triggers ClarificationPrompt render
- `conversation_mode_updated` - Updates UI mode (already exists in codebase)
- `clear_composer_files` - Clears composer file chips
- `message` - Standard message display

**NOTE:** `conversation_mode_updated` already has handlers in the codebase (see `useWebSocket.ts` line 270-275). Only `clarification_prompt` and `clear_composer_files` need new handlers.

### Provides

- `ClarificationPrompt` component for inline prompts
- `clarification_response` event emission via WebSocketClient
- Event handlers in hook chain (useWebSocketEvents → useChatController)
- Composer file clearing via useMultiFileUpload

### Frontend Hook Chain (Reference)

```
websocket.ts (types + WebSocketClient methods)
    ↓
useWebSocket.ts (UseWebSocketOptions callbacks)
    ↓
useWebSocketAdapter.ts (WebSocketEventHandlers interface)
    ↓
useWebSocketEvents.ts (stable useCallback handlers)
    ↓
useChatController.ts (wire handlers + return for components)
    ↓
MessageList.tsx (dedicated props, NOT metadata)
```
