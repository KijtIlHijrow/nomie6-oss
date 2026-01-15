# AI Query Conversation History Design

**Date:** 2026-01-15
**Status:** Approved
**Author:** Claude Code

## Problem Statement

The AI query system currently treats each user input as an isolated query with no conversational context. When users type responses like "2" to answer multiple-choice questions, the system doesn't recognize it as a continuation of the previous exchange. Instead, it sends "2" as a new standalone query to the AI, causing confusion and poor UX.

**Example of broken flow:**
```
AI: "Which option? 1. Add macro field 2. Create new tracker 3. Something else"
User: "2"
AI: "I'm ready to assist with your questions about your personal tracking data..."
```

The AI has no memory that it just asked a question with options.

## Goals

1. **Conversational Context** - Maintain full conversation history and pass it to the AI model on each request
2. **Numeric Response Detection** - Automatically detect when user types a number corresponding to a pending multiple-choice option
3. **Session-Based** - Keep history in memory during the session; reset on page refresh
4. **OpenAI-Compatible Format** - Use standard message format that works with modern LLMs

## Architecture Overview

### Core Components

1. **Message Conversion Layer** - Transform UI messages (with actions, buttons, metadata) into clean conversational format for AI
2. **Numeric Response Handler** - Detect numeric input and auto-select corresponding options before reaching AI
3. **Enhanced AI Service** - Accept conversation history parameter and use Ollama's chat API
4. **History Management** - Trim history to prevent token overflow

### Data Flow

```
User Input
    ↓
Numeric Response Detection (if pending options exist)
    ↓ (if not numeric or no pending options)
Convert UI Messages → AI Message Format
    ↓
Pass to answerQuestion(question, model, history)
    ↓
Ollama Chat API with full conversation
    ↓
Response added to UI messages array
```

## Design Details

### 1. Message Conversion

**Input:** UI messages with actions, options, buttons, logs
**Output:** Clean conversational messages for AI

```typescript
interface UIMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  timestamp: Date
  action?: string
  options?: Array<{label: string, value: string}>
  config?: object
  // ... other UI metadata
}

interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

function convertToAIMessages(messages: UIMessage[]): AIMessage[] {
  return messages
    .filter(m => m.role !== 'error' && m.content !== '...') // Skip errors and loading
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: cleanMessageContent(m)
    }))
}

function cleanMessageContent(message: UIMessage): string {
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
```

**Why this works:**
- Converts button-based options into numbered lists the AI can understand
- Removes UI artifacts (loading indicators, error states)
- Preserves conversational flow without cluttering with metadata

### 2. Numeric Response Detection

**Location:** In `handleSubmit()` before calling `answerQuestion()`

```typescript
async function handleSubmit() {
  if (!question.trim()) return

  const questionToAsk = question.trim()
  question = '' // Clear input

  // Check for numeric response to pending options
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

  // Not a numeric response - proceed with AI call
  // ... existing code continues
}

function getConfigKeyFromAction(action: string): ConfigKey {
  const mapping: Record<string, ConfigKey> = {
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

**Edge Cases:**
- If user types "2" but there's no pending question → goes to AI with context
- If option index is out of bounds → goes to AI with context
- If there are multiple pending actions → only matches most recent one

### 3. AI Service Integration

**Modify `answerQuestion()` to accept conversation history:**

```typescript
export async function answerQuestion(
  question: string,
  model: string = DEFAULT_MODEL,
  conversationHistory: AIMessage[] = []
): Promise<AIQueryResponse> {
  try {
    // Existing intent detection still runs
    const timeContext = await parseTimeContext(question)
    const data = await getRelevantData(question, timeContext)
    const intent = await detectIntent(question, data.trackers)

    // Handle special intents without AI (delete, add entry)
    if (intent.type === 'delete_entry') {
      return await handleEntryDeletion(question, intent.trackerName, intent.count)
    }
    if (intent.type === 'add_entry') {
      return await handleEntryCreation(question, intent.trackerName, intent.value)
    }

    // For questions, use chat API with full conversation
    const messages = [
      {
        role: 'system',
        content: buildSystemPrompt(data) // Existing prompt with tracker info
      },
      ...conversationHistory,
      {
        role: 'user',
        content: question
      }
    ]

    // Use chat API instead of generate
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false
      })
    })

    const result = await response.json()

    // Parse AI response (existing logic)
    return {
      answer: result.message.content,
      // ... rest of response processing
    }
  } catch (error) {
    // ... existing error handling
  }
}
```

**Key changes:**
- Switch from `/api/generate` to `/api/chat` endpoint
- Include system prompt as first message
- Append conversation history before current question
- Backward compatible (empty history = current behavior)

### 4. Calling from UI

**In `ai-query-view.svelte`, modify `handleSubmit()`:**

```typescript
async function handleSubmit() {
  // ... existing input validation and pending value checks ...

  // Add user message to UI
  const userMessage = {
    id: generateMessageId('user'),
    role: 'user' as const,
    content: questionToAsk,
    timestamp: new Date(),
  }
  messages = [...messages, userMessage]
  scrollToBottom()

  loading = true

  // Convert UI messages to AI format
  const aiMessages = convertToAIMessages(messages)

  // Call AI with full conversation history
  const response: AIQueryResponse = await answerQuestion(
    questionToAsk,
    selectedModel,
    aiMessages
  )

  // ... existing response handling ...
}
```

### 5. History Management

**Prevent token overflow:**

```typescript
const MAX_HISTORY_MESSAGES = 20 // ~10 exchanges

function convertToAIMessages(messages: UIMessage[]): AIMessage[] {
  const converted = messages
    .filter(m => m.role !== 'error' && m.content !== '...')
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: cleanMessageContent(m)
    }))

  // Keep only recent messages if history is too long
  return converted.slice(-MAX_HISTORY_MESSAGES)
}
```

**Rationale:**
- Most LLMs have context limits (4k-8k tokens typically)
- 20 messages = ~10 exchanges, plenty for most conversations
- Older context becomes less relevant anyway
- System prompt doesn't count against this limit

## Error Handling

1. **API Errors** - If chat API fails, fall back to existing error handling
2. **Invalid Numeric Input** - If "2" is typed but no options exist, treat as regular question
3. **Model Switching** - History carries over when user changes models (model-agnostic)
4. **Long Conversations** - Automatic trimming prevents token overflow

## Testing Strategy

### Unit Tests
- `convertToAIMessages()` - Test filtering, cleaning, option formatting
- `cleanMessageContent()` - Test removal of UI artifacts
- `getConfigKeyFromAction()` - Test action-to-config mapping

### Integration Tests
1. **Numeric Response**
   - User types "2" with pending options → auto-selects option 2
   - User types "2" with no pending options → goes to AI with context
   - User types "10" for option that doesn't exist → goes to AI

2. **Conversational Context**
   - Multi-turn conversation maintains context
   - Follow-up questions reference previous answers
   - Model switching preserves history

3. **Edge Cases**
   - Very long conversation (>20 messages) → trimming works
   - Error messages don't pollute history
   - Loading indicators excluded from history

### Manual Testing
- Type "edit my chicken tracker settings to include macros"
- AI asks clarifying question with options
- Type "2" → should auto-select option 2
- Continue conversation → AI should remember context

## Implementation Plan

### Phase 1: Core Conversion (Low Risk)
1. Add `convertToAIMessages()` and `cleanMessageContent()` utilities
2. Add tests for conversion logic
3. No behavioral changes yet

### Phase 2: AI Service Update (Medium Risk)
1. Add optional `conversationHistory` parameter to `answerQuestion()`
2. Switch to `/api/chat` endpoint when history is provided
3. Keep existing `/api/generate` as fallback
4. Test with and without history

### Phase 3: UI Integration (Medium Risk)
1. Update `handleSubmit()` to call conversion utilities
2. Pass converted history to `answerQuestion()`
3. Test conversational flow

### Phase 4: Numeric Detection (Low Risk)
1. Add numeric response detection in `handleSubmit()`
2. Add `getConfigKeyFromAction()` utility
3. Test auto-selection behavior

### Phase 5: Polish
1. Add history trimming
2. Handle edge cases
3. Comprehensive testing

## Rollback Plan

If issues arise:
1. **Phase 4 issues** - Remove numeric detection, keep conversation history
2. **Phase 3 issues** - Don't pass history to `answerQuestion()`, API still works
3. **Phase 2 issues** - Revert to `/api/generate` endpoint
4. **Phase 1 issues** - No code changes needed, only utilities added

Each phase is independently reversible.

## Success Criteria

1. User can type "2" to select option 2 from a multiple-choice question
2. AI maintains context across multiple turns in a conversation
3. Follow-up questions like "I'll take the second one" work without repeating context
4. No performance degradation (local Ollama makes history nearly free)
5. Conversation resets on page refresh (as designed)

## Future Enhancements (Out of Scope)

- Persistent conversation history across page refreshes
- Multi-conversation management (like ChatGPT threads)
- Conversation export/import
- Conversation search
- Smarter history trimming (summarize old context)
