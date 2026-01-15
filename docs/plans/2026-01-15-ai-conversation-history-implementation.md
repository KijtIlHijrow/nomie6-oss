# AI Conversation History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add conversational context to AI query system - allow users to type numeric responses ("2") to answer multiple-choice questions and maintain conversation history across turns.

**Architecture:** Transform UI messages into OpenAI-style format, detect numeric responses to auto-select options, pass full conversation history to Ollama's chat API, and automatically trim history to prevent token overflow.

**Tech Stack:** TypeScript, Svelte, Ollama API (chat endpoint)

---

## Phase 1: Message Conversion Utilities

### Task 1: Add Message Conversion Types and Utilities

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte:1-50` (add interfaces and utilities at top of script)

**Step 1: Add AIMessage interface and conversion utilities**

Add these after the existing imports and before the variable declarations in the `<script lang="ts">` section:

```typescript
// AI Message format for conversation history
interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const MAX_HISTORY_MESSAGES = 20 // ~10 exchanges

/**
 * Clean message content for AI consumption
 * Removes UI artifacts and formats options as numbered lists
 */
function cleanMessageContent(message: typeof messages[0]): string {
  // For assistant messages with options, include numbered list
  if (message.action && message.options) {
    const optionsList = message.options
      .filter(opt => opt.value !== '__divider__')
      .map((opt, idx) => `${idx + 1}. ${opt.label}`)
      .join('\n')
    return `${message.content}\n\n${optionsList}`
  }

  // For messages showing user selections, clean up the "→" notation
  // "How much Chicken? → 2" becomes just "How much Chicken?"
  return message.content.split('→')[0].trim()
}

/**
 * Convert UI messages to AI message format
 * Filters out errors, loading states, and limits history length
 */
function convertToAIMessages(uiMessages: typeof messages): AIMessage[] {
  const converted = uiMessages
    .filter(m => m.role !== 'error' && m.content !== '...') // Skip errors and loading
    .map(m => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: cleanMessageContent(m)
    }))

  // Keep only recent messages if history is too long
  return converted.slice(-MAX_HISTORY_MESSAGES)
}
```

**Step 2: Verify code compiles**

Run: `npm run autobuild` (if running) or check TypeScript compilation
Expected: No compilation errors

**Step 3: Commit conversion utilities**

```bash
git add src/domains/ai-query/ai-query-view.svelte
git commit -m "feat: add message conversion utilities for AI history

Add AIMessage interface and conversion functions to transform UI messages
into clean conversational format for Ollama chat API.

- cleanMessageContent(): Removes UI artifacts, formats options as lists
- convertToAIMessages(): Filters and trims message history

Part of AI conversation history feature.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: AI Service Update

### Task 2: Update answerQuestion to Accept Conversation History

**Files:**
- Modify: `src/domains/ai-query/ai-query-service.ts:2265` (answerQuestion function signature and implementation)

**Step 1: Add conversationHistory parameter to function signature**

Find the `answerQuestion` function (around line 2265) and update the signature:

```typescript
export async function answerQuestion(
  question: string,
  model: string = DEFAULT_MODEL,
  conversationHistory: Array<{role: 'user' | 'assistant' | 'system', content: string}> = []
): Promise<AIQueryResponse> {
```

**Step 2: Find where Ollama API is called**

Search for the Ollama API call in answerQuestion (should be around `/api/generate`). We need to conditionally use `/api/chat` when history is provided.

**Step 3: Update Ollama API integration**

Find the section where the function calls Ollama (after intent detection, around the "For questions" section). Replace the existing API call with:

```typescript
// Determine if we should use chat API (when history is provided)
const useChatAPI = conversationHistory.length > 0

if (useChatAPI) {
  // Use chat API with full conversation history
  const messages = [
    {
      role: 'system' as const,
      content: buildSystemPrompt(data)
    },
    ...conversationHistory,
    {
      role: 'user' as const,
      content: question
    }
  ]

  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false
    })
  })

  if (!response.ok) {
    throw new Error(`Ollama chat API error: ${response.statusText}`)
  }

  const result = await response.json()

  // Extract answer from chat API response
  const answer = result.message?.content || result.response || ''

  // Continue with existing response parsing...
  // (rest of the function continues as before, using 'answer' variable)
} else {
  // Use existing /api/generate endpoint (backward compatibility)
  // (keep existing code here)
}
```

**Step 4: Locate the buildSystemPrompt usage**

If `buildSystemPrompt(data)` doesn't exist, find where the system prompt is currently built. It might be constructed inline. Extract it to match the pattern above, or use the existing prompt string directly in the system message.

**Step 5: Test compilation**

Run: `npm run autobuild`
Expected: No TypeScript errors

**Step 6: Commit AI service update**

```bash
git add src/domains/ai-query/ai-query-service.ts
git commit -m "feat: add conversation history support to answerQuestion

Update answerQuestion() to accept optional conversationHistory parameter.
When provided, uses Ollama's /api/chat endpoint with full message history.

- Backward compatible: empty history uses existing /api/generate
- Switches to chat API when history is present
- Includes system prompt, history, and current question

Part of AI conversation history feature.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: UI Integration

### Task 3: Pass Conversation History from UI to AI Service

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte:939-943` (handleSubmit function)

**Step 1: Find the answerQuestion call in handleSubmit**

Locate the line that calls `answerQuestion(questionToAsk, selectedModel)` around line 941.

**Step 2: Add conversation history conversion before AI call**

Just before the `answerQuestion` call, add the conversion:

```typescript
// Convert UI messages to AI format for conversation history
const aiMessages = convertToAIMessages(messages)

// Call AI with full conversation history
const response: AIQueryResponse = await answerQuestion(questionToAsk, selectedModel, aiMessages)
```

Replace the existing `await answerQuestion(questionToAsk, selectedModel)` call with the above.

**Step 3: Test compilation**

Run: `npm run autobuild`
Expected: No TypeScript errors

**Step 4: Manual test - conversational context**

1. Start dev server: `npm run dev`
2. Navigate to AI Query page
3. Ask: "edit my chicken tracker settings to include macros"
4. AI should ask a clarifying question
5. Respond with a follow-up (not a number, test context first)
6. Verify AI remembers the previous context

Expected: AI responds with context from previous messages

**Step 5: Commit UI integration**

```bash
git add src/domains/ai-query/ai-query-view.svelte
git commit -m "feat: integrate conversation history into AI queries

Update handleSubmit() to convert UI messages and pass to answerQuestion.
AI now maintains full conversational context across turns.

Enables follow-up questions and context-aware responses.

Part of AI conversation history feature.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 4: Numeric Response Detection

### Task 4: Add Config Key Mapping Utility

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte` (add utility function after convertToAIMessages)

**Step 1: Add getConfigKeyFromAction utility**

Add this function after the `convertToAIMessages` function:

```typescript
/**
 * Map action type to config key for handleButtonClick
 */
function getConfigKeyFromAction(action: string): 'type' | 'uom' | 'uom_category' | 'math' | 'positivity' | 'focus' | 'also_include' {
  const mapping: Record<string, 'type' | 'uom' | 'uom_category' | 'math' | 'positivity' | 'focus' | 'also_include'> = {
    'needs_tracker_type': 'type',
    'needs_uom': 'uom',
    'needs_uom_category': 'uom_category',
    'needs_math': 'math',
    'needs_positivity': 'positivity',
    'needs_focus': 'focus',
    'needs_also_include': 'also_include'
  }
  return mapping[action] || 'type'
}
```

**Step 2: Verify compilation**

Run: `npm run autobuild`
Expected: No TypeScript errors

**Step 3: Commit utility function**

```bash
git add src/domains/ai-query/ai-query-view.svelte
git commit -m "feat: add config key mapping for numeric responses

Add getConfigKeyFromAction() to map action types to config keys.
Enables automatic option selection when user types numbers.

Part of AI conversation history feature.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

### Task 5: Add Numeric Response Detection to handleSubmit

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte:854-906` (handleSubmit function)

**Step 1: Add numeric detection after input validation**

Find the section after `const questionToAsk = question.trim()` and before the pending value request check (around line 858).

Insert this code:

```typescript
  const questionToAsk = question.trim()
  question = '' // Clear input immediately

  // ===== NEW: Check for numeric response to pending options =====
  const lastAssistantMessage = messages
    .slice()
    .reverse()
    .find(m => m.role === 'assistant' && m.action && m.options)

  if (lastAssistantMessage && /^\d+$/.test(questionToAsk)) {
    const optionIndex = parseInt(questionToAsk) - 1 // Convert 1-based to 0-based
    const selectedOption = lastAssistantMessage.options[optionIndex]

    if (selectedOption && selectedOption.value !== '__divider__') {
      // Determine which config key this is for
      const configKey = getConfigKeyFromAction(lastAssistantMessage.action)

      // Auto-click the button
      await handleButtonClick(
        'select_config',
        lastAssistantMessage.id,
        lastAssistantMessage.trackerTag,
        lastAssistantMessage.originalMessage,
        lastAssistantMessage.value,
        configKey,
        selectedOption.value
      )
      return // Don't send to AI
    }
  }
  // ===== END NEW CODE =====

  // Check for pending value request first
  // (existing code continues)
```

**Step 2: Verify compilation**

Run: `npm run autobuild`
Expected: No TypeScript errors

**Step 3: Manual test - numeric response**

1. Start dev server: `npm run dev`
2. Navigate to AI Query page
3. Ask: "edit my chicken tracker settings to include macros"
4. AI should ask a clarifying question with numbered options
5. Type: "2"
6. Verify option 2 is automatically selected

Expected: Option 2 selected, no error, conversation continues

**Step 4: Manual test - invalid numeric**

1. With pending options showing, type: "99"
2. Verify it goes to AI (option doesn't exist)

Expected: AI receives "99" with context and can respond naturally

**Step 5: Manual test - numeric without pending options**

1. Start fresh conversation
2. Type: "2"
3. Verify it goes to AI (no pending options)

Expected: AI receives "2" and responds appropriately

**Step 6: Commit numeric detection**

```bash
git add src/domains/ai-query/ai-query-view.svelte
git commit -m "feat: add numeric response detection for multiple choice

Detect when user types a number (1, 2, 3) and auto-select the
corresponding option from pending multiple-choice questions.

- Finds most recent assistant message with options
- Converts 1-based input to 0-based index
- Auto-triggers handleButtonClick for valid selections
- Falls back to AI for invalid numbers or no pending options

Fixes issue where typing '2' was treated as new query instead
of selecting option 2.

Part of AI conversation history feature.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 5: Testing & Polish

### Task 6: Comprehensive Manual Testing

**Manual Test Cases:**

**Test 1: Conversational Context**
1. Start conversation: "Tell me about my sleep patterns"
2. Follow up: "What about last week?"
3. Verify AI understands "last week" refers to sleep patterns

Expected: ✓ AI maintains context

**Test 2: Numeric Response - Happy Path**
1. Ask: "edit my chicken tracker to add macros"
2. AI asks: "Which option? 1. Add macro field 2. Create new tracker"
3. Type: "2"
4. Verify option 2 selected automatically

Expected: ✓ Option 2 selected, no AI call for the "2"

**Test 3: Numeric Response - Out of Bounds**
1. With options 1-3 showing, type: "10"
2. Verify AI receives "10" with context

Expected: ✓ AI gets full history and can say "I only provided 3 options"

**Test 4: Numeric Response - No Pending Options**
1. Start fresh, type: "2"
2. Verify AI receives it with context

Expected: ✓ AI responds naturally (might ask what "2" refers to)

**Test 5: Long Conversation Trimming**
1. Have 25+ message exchanges
2. Check that history is trimmed to 20 messages

Expected: ✓ Only last 20 messages sent to AI (check network tab)

**Test 6: Error Messages Don't Pollute History**
1. Trigger an error message
2. Continue conversation
3. Verify error not included in history

Expected: ✓ Conversation continues cleanly

**Test 7: Model Switching**
1. Start conversation with model A
2. Switch to model B mid-conversation
3. Continue conversation

Expected: ✓ Model B gets full history, context maintained

**Step 1: Execute all manual tests**

Go through each test case above and document results.

**Step 2: Fix any issues found**

If any test fails, fix the issue and re-test.

**Step 3: Document test results**

Create a test results summary (optional, can be in commit message).

### Task 7: Final Verification and Commit

**Step 1: Verify all functionality works end-to-end**

Run through the original problem scenario:
1. Ask: "for my chicken tracker, can u add its macros in 'also include'?"
2. AI asks clarifying question with options
3. Type: "2"
4. Verify option 2 selected
5. Continue conversation naturally

Expected: ✓ All steps work smoothly

**Step 2: Check for any console errors**

Open browser console, go through test scenarios.

Expected: No JavaScript errors

**Step 3: Verify build succeeds**

Run: `npm run vbuild`
Expected: Build completes successfully

**Step 4: Final commit**

```bash
git add -A
git commit -m "test: verify AI conversation history feature complete

All manual tests passing:
- Conversational context maintained across turns
- Numeric responses (1, 2, 3) auto-select options
- Invalid numbers fall back to AI with context
- History trimmed at 20 messages to prevent token overflow
- Error messages excluded from history
- Model switching preserves conversation

Original issue resolved: typing '2' now selects option 2 instead
of starting new isolated query.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Rollback Plan

If issues occur during implementation:

**After Task 5 (Numeric Detection):**
```bash
git revert HEAD  # Remove numeric detection
# Conversation history still works, just no auto-selection
```

**After Task 3 (UI Integration):**
```bash
git revert HEAD~2..HEAD  # Remove UI integration and numeric detection
# AI service still supports history, UI just doesn't use it
```

**After Task 2 (AI Service):**
```bash
git revert HEAD~4..HEAD  # Remove all changes
# Back to original state
```

Each phase is independently reversible.

---

## Success Criteria

- [x] User can type "2" to select option 2 from multiple-choice questions
- [x] AI maintains context across multiple turns
- [x] Follow-up questions work naturally ("what about last week?")
- [x] Invalid numeric input gracefully falls back to AI
- [x] History automatically trims to prevent token overflow
- [x] No performance degradation
- [x] No console errors

---

## Implementation Notes

- **Backward Compatibility:** Empty history falls back to `/api/generate`
- **Performance:** Local Ollama makes full history virtually free
- **Session-Based:** History clears on page refresh (by design)
- **Type Safety:** AIMessage interface ensures correct format

---

## Related Files

- Design Doc: `docs/plans/2026-01-15-ai-conversation-history-design.md`
- UI Component: `src/domains/ai-query/ai-query-view.svelte`
- AI Service: `src/domains/ai-query/ai-query-service.ts`
