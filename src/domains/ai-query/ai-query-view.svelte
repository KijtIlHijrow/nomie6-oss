<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { answerQuestion, checkOllamaAvailable, getAvailableModels, type AIQueryResponse } from './ai-query-service'
  import { Interact } from '../../store/interact'

  let question = ''
  let loading = false
  let error = ''
  let ollamaAvailable = false
  let availableModels: string[] = []
  let selectedModel = 'llama3.2'
  let messages: Array<{ id: string; role: 'user' | 'assistant' | 'error'; content: string; timestamp: Date }> = []
  let chatContainer: HTMLDivElement
  let showModelSelector = false
  let modelSelectorContainer: HTMLDivElement
  let inputElement: HTMLDivElement

  // Stable function reference for event listener to prevent memory leaks
  const handleClickOutside = (event: MouseEvent) => {
    if (modelSelectorContainer && !modelSelectorContainer.contains(event.target as Node)) {
      showModelSelector = false
    }
  }

  // Portal action to move element to body
  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node)
        }
      }
    }
  }

  // Generate unique message IDs to prevent collisions
  let messageIdCounter = 0
  function generateMessageId(prefix: string): string {
    return `${prefix}-${Date.now()}-${++messageIdCounter}-${Math.random().toString(36).substr(2, 9)}`
  }

  onMount(async () => {
    if (typeof document !== 'undefined') {
      document.addEventListener('click', handleClickOutside)
    }
    try {
      ollamaAvailable = await checkOllamaAvailable()
      if (ollamaAvailable) {
        try {
          availableModels = await getAvailableModels()
          if (availableModels.length > 0) {
            selectedModel = availableModels[0]
          }
        } catch (e) {
          console.error('Error getting models:', e)
        }
      }
      
      // Add welcome message
      if (ollamaAvailable) {
        messages = [
          {
            id: 'welcome',
            role: 'assistant',
            content: 'Hello! I\'m Nomie AI. Ask me anything about your tracking data. For example: "How was my anxiety level when I slept for only 6 hours?"',
            timestamp: new Date(),
          }
        ]
      } else {
        messages = [
          {
            id: 'error-setup',
            role: 'error',
            content: 'Ollama is not available. Make sure Ollama is running on localhost:11434 and you have at least one model installed.',
            timestamp: new Date(),
          }
        ]
      }
    } catch (e) {
      console.error('Error checking Ollama:', e)
      messages = [
        {
          id: 'error-setup',
          role: 'error',
          content: 'Ollama is not available. Please make sure Ollama is running on localhost:11434',
          timestamp: new Date(),
        }
      ]
    }
  })

  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', handleClickOutside)
    }
  })

  function scrollToBottom() {
    setTimeout(() => {
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight
      }
    }, 100)
  }

  async function handleSubmit() {
    if (!question.trim()) return
    if (!ollamaAvailable) {
      await Interact.alert('Ollama Not Available', 'Please make sure Ollama is running on localhost:11434')
      return
    }

    const questionToAsk = question.trim()
    question = '' // Clear input immediately

    // Add user message
    const userMessage = {
      id: generateMessageId('user'),
      role: 'user' as const,
      content: questionToAsk,
      timestamp: new Date(),
    }
    messages = [...messages, userMessage]
    scrollToBottom()

    loading = true
    error = ''

    // Add loading message
    const loadingMessageId = generateMessageId('loading')
    const loadingMessage = {
      id: loadingMessageId,
      role: 'assistant' as const,
      content: '...',
      timestamp: new Date(),
    }
    messages = [...messages, loadingMessage]
    scrollToBottom()

    try {
      console.log('Sending question to AI:', questionToAsk)
      const response: AIQueryResponse = await answerQuestion(questionToAsk, selectedModel)
      console.log('AI Response:', response)
      
      // Remove loading message
      messages = messages.filter(m => m.id !== loadingMessageId)
      
      if (response.error) {
        error = response.error
        console.error('AI Error:', response.error)
        messages = [
          ...messages,
          {
            id: generateMessageId('error'),
            role: 'error',
            content: `Error: ${response.error}`,
            timestamp: new Date(),
          }
        ]
      } else if (response.answer) {
        messages = [
          ...messages,
          {
            id: generateMessageId('assistant'),
            role: 'assistant',
            content: response.answer,
            timestamp: new Date(),
          }
        ]
      } else {
        messages = [
          ...messages,
          {
            id: generateMessageId('error'),
            role: 'error',
            content: 'No answer received from AI. Please try again.',
            timestamp: new Date(),
          }
        ]
      }
      scrollToBottom()
    } catch (e: any) {
      console.error('Error in handleSubmit:', e)
      // Remove loading message
      messages = messages.filter(m => m.id !== loadingMessageId)
      messages = [
        ...messages,
        {
          id: generateMessageId('error'),
          role: 'error',
          content: e.message || 'Failed to get answer. Check console for details.',
          timestamp: new Date(),
        }
      ]
      scrollToBottom()
    } finally {
      loading = false
    }
  }

  function handleKeyPress(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  $: if (messages.length > 0) {
    scrollToBottom()
  }
</script>

<div class="ai-chat-wrapper flex flex-col h-full">
  <div class="ai-chat-container flex flex-col flex-1 min-h-0">
    <!-- Header -->
    <div class="ai-chat-header bg-white dark:bg-gray-900 flex items-center justify-between p-4 border-b border-gray-300 dark:border-gray-700 flex-shrink-0">
    <div class="flex items-center gap-3">
      <h1 class="text-xl font-bold text-gray-900 dark:text-white">Ask Nomie AI</h1>
      {#if availableModels.length > 0}
        <div class="relative" bind:this={modelSelectorContainer}>
          <button
            on:click|stopPropagation={() => showModelSelector = !showModelSelector}
            class="text-sm px-3 py-1.5 rounded-lg transition-colors text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Model: {selectedModel} ▼
          </button>
          {#if showModelSelector}
            <div class="absolute top-full left-0 mt-2 rounded-lg shadow-lg z-10 min-w-[200px] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700">
              {#each availableModels as model}
                <button
                  on:click|stopPropagation={() => {
                    selectedModel = model
                    showModelSelector = false
                  }}
                  class="w-full text-left px-4 py-2 first:rounded-t-lg last:rounded-b-lg transition-colors text-gray-900 dark:text-gray-100 {selectedModel === model ? 'bg-primary-500 bg-opacity-10 text-primary-500 dark:text-primary-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
                >
                  {model}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
    {#if !ollamaAvailable}
      <div class="text-xs text-orange-600 dark:text-orange-400">
        ⚠️ Ollama not available
      </div>
    {/if}
  </div>

    <!-- Chat Messages -->
    <div
      bind:this={chatContainer}
      class="ai-chat-messages flex-1 overflow-y-auto p-4 space-y-4 pb-32"
      style="background-color: var(--color-bg);"
    >
    {#each messages as message (message.id)}
      <div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
        <div
          class="ai-message max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-3 {message.role === 'user'
            ? 'bg-blue-500 text-white'
            : message.role === 'error'
            ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'}"
        >
          {#if message.role === 'assistant' && message.content === '...'}
            <div class="flex items-center gap-1 loading-indicator">
              <span class="animate-pulse">●</span>
              <span class="animate-pulse delay-75">●</span>
              <span class="animate-pulse delay-150">●</span>
            </div>
          {:else}
            <div class="whitespace-pre-wrap text-sm leading-relaxed selectable-text">{message.content}</div>
            <div class="text-xs mt-2 opacity-70 selectable-text">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </div>
          {/if}
        </div>
      </div>
      {/each}
    </div>
  </div>

  <!-- Input Area - Fixed above tabs (portaled to body) -->
  <div use:portal bind:this={inputElement} class="ai-chat-input fixed bg-white dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 p-4">
    {#if !ollamaAvailable}
      <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-3">
        <p class="text-xs text-yellow-800 dark:text-yellow-200 mb-2">
          ⚠️ Ollama is not available. Make sure:
        </p>
        <ul class="text-xs text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside">
          <li>Ollama is running (check docker-compose or run: <code class="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">docker ps</code>)</li>
          <li>Ollama is accessible at <code class="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">http://localhost:11434</code></li>
          <li>You have at least one model installed (e.g., <code class="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">ollama pull llama3.2</code>)</li>
        </ul>
      </div>
    {/if}
    <div class="flex items-end gap-2">
      <textarea
        bind:value={question}
        on:keypress={handleKeyPress}
        placeholder="Ask a question about your data..."
        class="flex-1 p-3 border border-gray-300 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 min-h-[60px] max-h-[120px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
        disabled={loading || !ollamaAvailable}
        rows="2"
      />
      <button
        on:click={handleSubmit}
        disabled={loading || !ollamaAvailable || !question.trim()}
        class="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center min-w-[80px]"
      >
        {#if loading}
          <span class="animate-pulse">...</span>
        {:else}
          Send
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .ai-chat-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .ai-chat-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .ai-chat-messages {
    scroll-behavior: smooth;
    min-height: 0;
  }

  .ai-message {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .loading-indicator {
    user-select: none !important;
    -webkit-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
    cursor: default;
  }

  .ai-chat-input {
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
    bottom: 0 !important;
    padding-bottom: max(1rem, env(safe-area-inset-bottom, 1rem));
    position: fixed !important;
    z-index: 2000 !important;
    left: 0;
    right: 0;
  }

  /* Match layout's sidebar offset on XL screens (900px+ to match Tailwind xl breakpoint) */
  @media (min-width: 900px) {
    .ai-chat-input {
      left: 14rem; /* w-56 = 14rem = 224px, matching sidebar width and layout's xl:ml-56 */
    }
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .delay-75 {
    animation-delay: 0.15s;
  }

  .delay-150 {
    animation-delay: 0.3s;
  }

  .selectable-text {
    user-select: text !important;
    -webkit-user-select: text !important;
    -moz-user-select: text !important;
    -ms-user-select: text !important;
    cursor: text;
  }
</style>

