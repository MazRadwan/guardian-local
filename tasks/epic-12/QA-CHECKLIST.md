# Epic 12 QA Checklist

## Pre-requisites
- [ ] Backend running
- [ ] Frontend running
- [ ] User logged in

## Scenario 1: Tool Flow (USE_TOOL_BASED_TRIGGER=true)

1. Set environment:
   ```bash
   USE_TOOL_BASED_TRIGGER=true pnpm dev
   ```

2. [ ] Open new conversation in assessment mode
3. [ ] Send: "I need a comprehensive assessment for Acme AI healthcare solution"
4. [ ] Claude should ask clarifying questions or offer to generate
5. [ ] Send: "Yes, generate the questionnaire"
6. [ ] **VERIFY:** "Generate Questionnaire" button appears
7. [ ] **VERIFY:** Button shows "Comprehensive Assessment"
8. [ ] Click the Generate button
9. [ ] **VERIFY:** Loading state shows
10. [ ] **VERIFY:** Questionnaire streams in
11. [ ] **VERIFY:** Download buttons appear at end

## Scenario 2: Fallback Flow (USE_TOOL_BASED_TRIGGER=false)

1. Set environment:
   ```bash
   USE_TOOL_BASED_TRIGGER=false pnpm dev
   ```

2. [ ] Open new conversation in assessment mode
3. [ ] Send: "Generate a questionnaire"
4. [ ] **VERIFY:** No Generate button appears
5. [ ] **VERIFY:** Questionnaire generates immediately
6. [ ] **VERIFY:** Download buttons appear

## Scenario 3: Tool NOT Called for Questions

1. USE_TOOL_BASED_TRIGGER=true
2. [ ] Send: "What questions are in a typical assessment?"
3. [ ] **VERIFY:** Claude answers the question
4. [ ] **VERIFY:** No Generate button appears
5. [ ] Send: "How many questions in a quick assessment?"
6. [ ] **VERIFY:** Claude answers
7. [ ] **VERIFY:** Still no button

## Scenario 4: Conversation Switch

1. [ ] Trigger questionnaire_ready in conversation A (button appears)
2. [ ] Click "New Conversation" or switch to another
3. [ ] **VERIFY:** Button disappears
4. [ ] Switch back to original conversation
5. [ ] **VERIFY:** Button is still gone

## Scenario 5: Browser Refresh

1. [ ] Trigger questionnaire_ready (button appears)
2. [ ] Refresh the browser
3. [ ] **VERIFY:** Button is gone (state not persisted)

## Edge Cases

- [ ] Test with very long vendor name
- [ ] Test with special characters in context summary
- [ ] Test rapid clicking of Generate button
- [ ] Test network disconnect during generation

## Results

**Date:** ___________
**Tester:** ___________
**Build:** ___________

**Pass/Fail:** ___________

**Notes:**
