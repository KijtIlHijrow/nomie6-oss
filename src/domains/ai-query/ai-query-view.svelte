<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { answerQuestion, checkOllamaAvailable, getAvailableModels, handleEntryCreation, createTrackerAndEntry, parseValueFromMessage, handleTrackerConfigSelection, createTrackerWithConfig, startTrackerConfiguration, type AIQueryResponse } from './ai-query-service'
  import UOM from '../../domains/uom/uom'
  import { Interact } from '../../store/interact'
  import ListItemLog from '../../components/list-item-log/list-item-log.svelte'
  import NLog from '../../domains/nomie-log/nomie-log'
  import { getTrackablesFromStorage, saveTrackersToStorage } from '../../domains/trackable/TrackableStore'
  import AutoComplete from '../../components/auto-complete/auto-complete.svelte'

  let question = ''
  let loading = false
  let error = ''
  let ollamaAvailable = false
  let availableModels: string[] = []
  let selectedModel = 'llama3.2'
  let includeInputValues: { [key: string]: string } = {}
  let messages: Array<{ 
    id: string; 
    role: 'user' | 'assistant' | 'error'; 
    content: string; 
    timestamp: Date;
    action?: 'needs_value' | 'needs_tracker_creation' | 'needs_tracker_type' | 'needs_uom' | 'needs_uom_category' | 'needs_math' | 'needs_positivity' | 'needs_focus' | 'needs_also_include' | 'needs_default_value' | 'create_tracker_with_config' | 'add_entry' | 'question';
    trackerTag?: string;
    trackerName?: string;
    trackerType?: string;
    originalMessage?: string;
    value?: number;
    config?: { type?: string; uom?: string; math?: string; score?: string; focus?: string[]; include?: string; default?: number };
    options?: Array<{ label: string; value: string }>;
    log?: NLog | undefined;
  }> = []
  let chatContainer: HTMLDivElement
  let showModelSelector = false
  let modelSelectorContainer: HTMLDivElement
  let inputElement: HTMLDivElement
  
  // Conversation state for pending value requests
  let pendingValueRequest: { trackerTag: string; trackerType: string; messageId: string } | null = null

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
            content: 'Hello! I\'m Nomie AI. I can help you in two ways:\n\n1. Ask questions about your data: "How was my anxiety level when I slept for only 6 hours?"\n2. Add entries: "add intraworkout" or "track water 8"\n\nTry asking a question or adding an entry!',
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

  async function handleButtonClick(action: 'create_tracker' | 'cancel_tracker' | 'submit_value' | 'select_config' | 'save_default', messageId: string, trackerTag?: string, originalMessage?: string, value?: number, configKey?: 'type' | 'uom' | 'math' | 'uom_category' | 'positivity' | 'focus' | 'also_include', selectedValue?: string) {
    const message = messages.find(m => m.id === messageId)
    if (!message) return

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
      if (action === 'create_tracker') {
        const message = messages.find(m => m.id === messageId)
        // Use trackerName if available (preserves capitalization), otherwise fall back to trackerTag
        const nameToUse = message?.trackerName || trackerTag?.replace('#', '') || ''
        if (!nameToUse) return
        const response = startTrackerConfiguration(nameToUse, originalMessage || message?.originalMessage, value || message?.value)
        
        // Remove loading message
        messages = messages.filter(m => m.id !== loadingMessageId)
        
        // Remove the action buttons from the original message
        messages = messages.map(m => {
          if (m.id === messageId) {
            return { ...m, action: undefined }
          }
          return m
        })
        
        if (response.error) {
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
              action: response.action,
              trackerTag: response.trackerTag,
              trackerName: response.trackerName,
              originalMessage: response.originalMessage,
              value: response.value,
              config: response.config,
              options: response.options,
            }
          ]
        }
      } else if (action === 'cancel_tracker') {
        // Remove loading message
        messages = messages.filter(m => m.id !== loadingMessageId)
        
        // Remove the action buttons from the original message
        messages = messages.map(m => {
          if (m.id === messageId) {
            return { ...m, action: undefined }
          }
          return m
        })
        
        messages = [
          ...messages,
          {
            id: generateMessageId('assistant'),
            role: 'assistant',
            content: 'Okay, I won\'t create the tracker. You can create it manually if you\'d like.',
            timestamp: new Date(),
          }
        ]
      } else if (action === 'submit_value' && message) {
        const response = await handleEntryCreation('', message.trackerTag?.replace('#', '') || '', value)
        
        // Remove loading message - use the specific ID first
        messages = messages.filter(m => m.id !== loadingMessageId)
        // Safety cleanup: remove any other lingering typing indicators that might have been created
        messages = messages.filter(m => !(m.role === 'assistant' && m.content === '...'))
        
        // Remove the action buttons from the original message
        messages = messages.map(m => {
          if (m.id === messageId) {
            return { ...m, action: undefined }
          }
          return m
        })
        
        if (response.error) {
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
              log: response.data?.log ? new NLog(response.data.log) : undefined,
            }
          ]
        }
        
        pendingValueRequest = null
      } else if (action === 'save_default' && message && value !== undefined) {
        // Note: save_default doesn't create a loading message since it's called after entry creation
        // But we should still clean up any existing loading messages as a safety measure
        messages = messages.filter(m => !(m.role === 'assistant' && m.content === '...'))
        
        try {
          // Save the value as default for the tracker
          const trackerTag = message.trackerTag || ''
          const trackables = await getTrackablesFromStorage()
          const tracker = trackables[trackerTag] || trackables[trackerTag.replace('#', '')] || trackables[`#${trackerTag.replace('#', '')}`]
          
          if (tracker && tracker.type === 'tracker' && tracker.tracker) {
            tracker.tracker.default = value
            await saveTrackersToStorage([tracker])
            
            messages = [
              ...messages,
              {
                id: generateMessageId('assistant'),
                role: 'assistant',
                content: `✓ Saved ${value} as the default value for ${message.trackerTag}`,
                timestamp: new Date(),
              }
            ]
          }
        } catch (e: any) {
          console.error('Error saving default value:', e)
        }
      } else if (action === 'select_config' && message && configKey && selectedValue) {
        // Handle configuration selection
        try {
          const response = handleTrackerConfigSelection(
            message.trackerName || message.trackerTag?.replace('#', '') || '',
            configKey,
            selectedValue,
            message.originalMessage,
            message.value,
            message.config
          )
          
          // Remove loading message
          messages = messages.filter(m => m.id !== loadingMessageId)
          
          // If response has an action, check if it's ready to create or needs more config
          if (response.action === 'create_tracker_with_config') {
          // All config collected, create tracker (async)
          const createResponse = await createTrackerWithConfig(
            response.trackerName || response.trackerTag?.replace('#', '') || '',
            response.originalMessage,
            response.value,
            response.config
          )
          
          // Remove the action buttons from the original message
          messages = messages.map(m => {
            if (m.id === messageId) {
              return { ...m, action: undefined }
            }
            return m
          })
          
          if (createResponse.error) {
            messages = [
              ...messages,
              {
                id: generateMessageId('error'),
                role: 'error',
                content: `Error: ${createResponse.error}`,
                timestamp: new Date(),
              }
            ]
          } else if (createResponse.answer) {
            const assistantMessage = {
              id: generateMessageId('assistant'),
              role: 'assistant' as const,
              content: createResponse.answer,
              timestamp: new Date(),
              action: createResponse.action,
              trackerTag: createResponse.trackerTag,
              trackerName: createResponse.trackerName,
              trackerType: createResponse.trackerType,
              config: createResponse.config,
              log: createResponse.data?.log ? new NLog(createResponse.data.log) : undefined,
            }
            messages = [...messages, assistantMessage]
            
            // Handle special actions
            if (createResponse.action === 'needs_value') {
              pendingValueRequest = {
                trackerTag: createResponse.trackerTag || '',
                trackerType: createResponse.trackerType || '',
                messageId: assistantMessage.id,
              }
            } else if (createResponse.action === 'add_entry') {
              // Entry created successfully, clear any pending requests
              pendingValueRequest = null
            }
          }
        } else if (response.action) {
          // More configuration needed
          // For focus selection, update the existing message instead of creating a new one
          if (response.action === 'needs_focus' && message.action === 'needs_focus') {
            // Update the existing message with new options and config
            messages = messages.map(m => {
              if (m.id === messageId) {
                return {
                  ...m,
                  content: response.answer,
                  config: response.config,
                  options: response.options,
                }
              }
              return m
            })
          } else {
            // For other actions, remove the action from the original message and create a new one
            messages = messages.map(m => {
              if (m.id === messageId) {
                return { ...m, action: undefined }
              }
              return m
            })
            
            const newMessage = {
              id: generateMessageId('assistant'),
              role: 'assistant' as const,
              content: response.answer,
              timestamp: new Date(),
              action: response.action,
              trackerTag: response.trackerTag,
              trackerName: response.trackerName,
              originalMessage: response.originalMessage,
              value: response.value,
              config: response.config,
              options: response.options,
            }
            messages = [...messages, newMessage]
          }
        } else {
          // No action in response - remove action from original message
          messages = messages.map(m => {
            if (m.id === messageId) {
              return { ...m, action: undefined }
            }
            return m
          })
          console.warn('No action in response from handleTrackerConfigSelection:', response)
        }
        } catch (err) {
          console.error('Error in handleTrackerConfigSelection:', err)
          messages = messages.filter(m => m.id !== loadingMessageId)
          messages = [
            ...messages,
            {
              id: generateMessageId('error'),
              role: 'error',
              content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
              timestamp: new Date(),
            }
          ]
        }
      }
      
      scrollToBottom()
    } catch (e: any) {
      messages = messages.filter(m => m.id !== loadingMessageId)
      messages = [
        ...messages,
        {
          id: generateMessageId('error'),
          role: 'error',
          content: e.message || 'Failed to process request',
          timestamp: new Date(),
        }
      ]
      scrollToBottom()
    } finally {
      loading = false
      // Safety cleanup: remove any lingering typing indicators that might have been missed
      // This prevents typing indicators from persisting indefinitely if an error occurred
      // or if the cleanup code didn't run properly. This is safe because this function
      // should complete before another operation starts, so any typing indicators remaining
      // are likely from this operation and should be cleaned up.
      messages = messages.filter(m => !(m.role === 'assistant' && m.content === '...'))
    }
  }

  async function handleSubmit() {
    if (!question.trim()) return
    
    // Entry creation doesn't require Ollama, so we'll check later for questions
    const questionToAsk = question.trim()
    question = '' // Clear input immediately

    // Check for pending value request first
    // Also check if the last message has needs_value action (fallback)
    let valueRequestMessage = null
    if (pendingValueRequest) {
      valueRequestMessage = messages.find(m => m.id === pendingValueRequest.messageId)
    } else {
      // Fallback: check the most recent message with needs_value action
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].action === 'needs_value') {
          valueRequestMessage = messages[i]
          // Set pendingValueRequest for consistency
          pendingValueRequest = {
            trackerTag: messages[i].trackerTag || '',
            trackerType: messages[i].trackerType || '',
            messageId: messages[i].id,
          }
          break
        }
      }
    }
    
    if (valueRequestMessage) {
      const value = parseValueFromMessage(questionToAsk)
      if (value !== null) {
        await handleButtonClick('submit_value', valueRequestMessage.id, undefined, undefined, value)
        return
      } else {
        // Invalid value, ask again
        messages = [
          ...messages,
          {
            id: generateMessageId('assistant'),
            role: 'assistant',
            content: 'Please enter a valid number.',
            timestamp: new Date(),
          }
        ]
        loading = false
        scrollToBottom()
        return
      }
    }

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

    // Check Ollama availability for questions (entry creation doesn't need it)
    if (!ollamaAvailable && !pendingValueRequest) {
      await Interact.alert('Ollama Not Available', 'Please make sure Ollama is running on localhost:11434')
      loading = false
      return
    }

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
        const assistantMessage = {
          id: generateMessageId('assistant'),
          role: 'assistant' as const,
          content: response.answer,
          timestamp: new Date(),
          action: response.action,
          trackerTag: response.trackerTag,
          trackerName: response.trackerName,
          trackerType: response.trackerType,
          originalMessage: response.originalMessage,
          log: response.data?.log ? new NLog(response.data.log) : undefined,
        }
        messages = [...messages, assistantMessage]
        
        // Handle special actions
        if (response.action === 'needs_value') {
          pendingValueRequest = {
            trackerTag: response.trackerTag || '',
            trackerType: response.trackerType || '',
            messageId: assistantMessage.id,
          }
        } else if (response.action === 'add_entry') {
          // Entry created successfully, clear any pending requests
          pendingValueRequest = null
        }
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
            
            {#if message.log}
              <div class="mt-3 -mx-2">
                <ListItemLog 
                  log={message.log} 
                  className="max-w-full"
                  on:textClick={(evt) => {
                    // Text click handled by ListItemLog
                  }}
                />
              </div>
            {/if}
            
            {#if message.action === 'needs_tracker_creation' && message.trackerTag}
              <div class="mt-3 flex gap-2">
                <button
                  on:click={() => handleButtonClick('create_tracker', message.id, message.trackerTag, message.originalMessage)}
                  class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                  disabled={loading}
                >
                  Yes, create it
                </button>
                <button
                  on:click={() => handleButtonClick('cancel_tracker', message.id)}
                  class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                  disabled={loading}
                >
                  No, cancel
                </button>
              </div>
            {/if}
            
            {#if message.action === 'needs_tracker_type' && message.options}
              <div class="mt-3 flex flex-col gap-2">
                {#each message.options as option}
                  <button
                    on:click={() => handleButtonClick('select_config', message.id, message.trackerTag, message.originalMessage, message.value, 'type', option.value)}
                    class="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium text-left"
                    disabled={loading}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            {/if}
            
            {#if message.action === 'needs_uom_category' && message.options}
              <div class="mt-3 flex flex-col gap-2">
                {#each message.options as option}
                  {#if option.value === '__divider__'}
                    <div class="border-t border-gray-300 dark:border-gray-700 my-1"></div>
                  {:else}
                    <button
                      on:click={() => handleButtonClick('select_config', message.id, message.trackerTag, message.originalMessage, message.value, 'uom_category', option.value)}
                      class="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium text-left"
                      disabled={loading}
                    >
                      {option.label}
                    </button>
                  {/if}
                {/each}
              </div>
            {/if}
            
            {#if message.action === 'needs_uom' && message.options}
              <div class="mt-3 flex flex-col gap-2 max-h-64 overflow-y-auto">
                {#each message.options as option}
                  {#if option.value === '__divider__'}
                    <div class="border-t border-gray-300 dark:border-gray-700 my-1"></div>
                  {:else}
                    <button
                      on:click={() => handleButtonClick('select_config', message.id, message.trackerTag, message.originalMessage, message.value, 'uom', option.value)}
                      class="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium text-left"
                      disabled={loading}
                    >
                      {option.label}
                    </button>
                  {/if}
                {/each}
              </div>
            {/if}
            
            {#if message.action === 'needs_math' && message.options}
              <div class="mt-3 flex flex-col gap-2">
                {#each message.options as option}
                  <button
                    on:click={() => handleButtonClick('select_config', message.id, message.trackerTag, message.originalMessage, message.value, 'math', option.value)}
                    class="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium text-left"
                    disabled={loading}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            {/if}
            
            {#if message.action === 'needs_positivity' && message.options}
              <div class="mt-3 flex flex-col gap-2">
                {#each message.options as option}
                  <button
                    on:click={() => handleButtonClick('select_config', message.id, message.trackerTag, message.originalMessage, message.value, 'positivity', option.value)}
                    class="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium text-left"
                    disabled={loading}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            {/if}
            
            {#if message.action === 'needs_focus' && message.options}
              <div class="mt-3 flex flex-col gap-2">
                {#each message.options as option}
                  <button
                    on:click={() => handleButtonClick('select_config', message.id, message.trackerTag, message.originalMessage, message.value, 'focus', option.value)}
                    class="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium text-left"
                    disabled={loading}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            {/if}
            
            {#if message.action === 'needs_also_include' && message.options}
              {@const alsoIncludeInputId = `also-include-input-${message.id}`}
              {@const includeInputKey = `include-input-${message.id}`}
              {#if !includeInputValues[includeInputKey]}
                {@const _ = (includeInputValues[includeInputKey] = '')}
              {/if}
              <div class="mt-3">
                {#if message.options.length === 1 && message.options[0].value === '__skip__'}
                  <!-- User said yes, now asking for the content -->
                  <div class="flex flex-col gap-2">
                    <div class="relative">
                      <input
                        id={alsoIncludeInputId}
                        type="text"
                        placeholder="e.g., #alcohol or @person or +context"
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                        bind:value={includeInputValues[includeInputKey]}
                        on:keypress={(e) => {
                          if (e.key === 'Enter') {
                            const val = includeInputValues[includeInputKey]?.trim() || ''
                            if (val) {
                              handleButtonClick('select_config', message.id, message.trackerTag, message.originalMessage, message.value, 'also_include', val)
                            } else {
                              handleButtonClick('select_config', message.id, message.trackerTag, message.originalMessage, message.value, 'also_include', '__skip__')
                            }
                            includeInputValues[includeInputKey] = ''
                          }
                        }}
                        disabled={loading}
                        autofocus
                      />
                      <AutoComplete
                        input={includeInputValues[includeInputKey] || ''}
                        scroller
                        on:select={async (evt) => {
                          includeInputValues[includeInputKey] = evt.detail.note + ''
                        }}
                      />
                    </div>
                    <div class="flex gap-2">
                      <button
                        on:click={() => {
                          const val = includeInputValues[includeInputKey]?.trim() || ''
                          if (val) {
                            handleButtonClick('select_config', message.id, message.trackerTag, message.originalMessage, message.value, 'also_include', val)
                          } else {
                            handleButtonClick('select_config', message.id, message.trackerTag, message.originalMessage, message.value, 'also_include', '__skip__')
                          }
                          includeInputValues[includeInputKey] = ''
                        }}
                        class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                        disabled={loading}
                      >
                        Submit
                      </button>
                      <button
                        on:click={() => handleButtonClick('select_config', message.id, message.trackerTag, message.originalMessage, message.value, 'also_include', '__skip__')}
                        class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                        disabled={loading}
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                {:else}
                  <!-- Initial question: Yes or Skip -->
                  <div class="flex flex-col gap-2">
                    {#each message.options as option}
                      <button
                        on:click|stopPropagation={() => {
                          console.log('Also Include button clicked:', option.value)
                          handleButtonClick('select_config', message.id, message.trackerTag, message.originalMessage, message.value, 'also_include', option.value)
                        }}
                        class="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium text-left"
                        disabled={loading}
                      >
                        {option.label}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
            
            {#if message.action === 'needs_value' && message.trackerTag}
              {@const valueInputId = `value-input-${message.id}`}
              {@const saveDefaultId = `save-default-${message.id}`}
              {@const uomKey = message.config?.uom}
              {@const uomLabel = uomKey ? UOM.plural(uomKey) : ''}
              <div class="mt-3">
                <div class="flex gap-2 items-center">
                  <input
                    id={valueInputId}
                    type="number"
                    step="any"
                    placeholder="Enter value..."
                    class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    on:keypress={(e) => {
                      if (e.key === 'Enter') {
                        const inputEl = document.getElementById(valueInputId)
                        const checkboxEl = document.getElementById(saveDefaultId)
                        if (inputEl && 'value' in inputEl) {
                          const value = parseFloat(String(inputEl.value))
                          if (!isNaN(value)) {
                            const saveDefault = checkboxEl && checkboxEl instanceof HTMLInputElement ? checkboxEl.checked : false
                            handleButtonClick('submit_value', message.id, undefined, undefined, value)
                            if (saveDefault) {
                              // Save as default after a short delay to ensure entry is created first
                              setTimeout(() => {
                                handleButtonClick('save_default', message.id, message.trackerTag, undefined, value)
                              }, 500)
                            }
                            inputEl.value = ''
                            if (checkboxEl && checkboxEl instanceof HTMLInputElement) {
                              checkboxEl.checked = false
                            }
                          }
                        }
                      }
                    }}
                    disabled={loading}
                  />
                  {#if uomLabel}
                    <span class="text-sm text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">
                      {uomLabel}
                    </span>
                  {/if}
                  <button
                    on:click={() => {
                      const inputEl = document.getElementById(valueInputId)
                      const checkboxEl = document.getElementById(saveDefaultId)
                      if (inputEl && 'value' in inputEl) {
                        const value = parseFloat(String(inputEl.value))
                        if (!isNaN(value)) {
                          const saveDefault = checkboxEl && checkboxEl instanceof HTMLInputElement ? checkboxEl.checked : false
                          handleButtonClick('submit_value', message.id, undefined, undefined, value)
                          if (saveDefault) {
                            // Save as default after a short delay to ensure entry is created first
                            setTimeout(() => {
                              handleButtonClick('save_default', message.id, message.trackerTag, undefined, value)
                            }, 500)
                          }
                          inputEl.value = ''
                          if (checkboxEl && checkboxEl instanceof HTMLInputElement) {
                            checkboxEl.checked = false
                          }
                        }
                      }
                    }}
                    class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                    disabled={loading}
                  >
                    Submit
                  </button>
                </div>
                <div class="mt-2 flex items-center">
                  <input
                    id={saveDefaultId}
                    type="checkbox"
                    class="mr-2 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <label for={saveDefaultId} class="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    Save as default value
                  </label>
                </div>
              </div>
            {/if}
            
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
    <div class="flex items-stretch gap-2">
      <textarea
        bind:value={question}
        on:keypress={handleKeyPress}
        placeholder={pendingValueRequest ? "Enter a number..." : "Ask a question or add an entry (e.g., 'add intraworkout')..."}
        class="flex-1 p-3 border border-gray-300 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 min-h-[60px] max-h-[120px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
        disabled={loading || (!ollamaAvailable && !pendingValueRequest)}
        rows="2"
      />
      <button
        on:click={handleSubmit}
        disabled={loading || !ollamaAvailable || !question.trim()}
        class="px-6 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center min-w-[80px]"
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

