<script lang="ts">
  import { onMount } from 'svelte'
  import Card from '../../components/card/card.svelte'
  import { answerQuestion, checkOllamaAvailable, getAvailableModels, type AIQueryResponse } from './ai-query-service'
  import { Interact } from '../../store/interact'
  import { Lang } from '../../store/lang'

  let question = ''
  let answer = ''
  let loading = false
  let error = ''
  let ollamaAvailable = false
  let availableModels: string[] = []
  let selectedModel = 'llama3.2'
  let history: Array<{ id: string; question: string; answer: string; timestamp: Date }> = []

  onMount(async () => {
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
    } catch (e) {
      console.error('Error checking Ollama:', e)
      error = 'Ollama is not available. Please make sure Ollama is running on localhost:11434'
    }
  })

  async function handleSubmit() {
    if (!question.trim()) return
    if (!ollamaAvailable) {
      await Interact.alert('Ollama Not Available', 'Please make sure Ollama is running on localhost:11434')
      return
    }

    loading = true
    error = ''
    answer = ''
    const questionToAsk = question // Save the question before clearing

    try {
      console.log('Sending question to AI:', questionToAsk)
      const response: AIQueryResponse = await answerQuestion(questionToAsk, selectedModel)
      console.log('AI Response:', response)
      
      if (response.error) {
        error = response.error
        console.error('AI Error:', response.error)
      } else if (response.answer) {
        answer = response.answer
        history = [
          {
            id: `${Date.now()}-${Math.random()}`,
            question: questionToAsk,
            answer: response.answer,
            timestamp: new Date(),
          },
          ...history
        ]
        question = '' // Clear input
      } else {
        error = 'No answer received from AI. Please try again.'
      }
    } catch (e: any) {
      console.error('Error in handleSubmit:', e)
      error = e.message || 'Failed to get answer. Check console for details.'
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
</script>

<div class="p-4 max-w-4xl mx-auto min-h-screen">
  <h1 class="text-2xl font-bold mb-4">Ask Nomie AI</h1>
  <Card pad title="Ask Nomie AI">
      {#if !ollamaAvailable}
        <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
          <p class="text-yellow-800 dark:text-yellow-200">
            ⚠️ Ollama is not available. Make sure:
          </p>
          <ul class="list-disc list-inside mt-2 text-sm text-yellow-700 dark:text-yellow-300">
            <li>Ollama is running (check docker-compose or run: <code class="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">docker ps</code>)</li>
            <li>Ollama is accessible at <code class="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">http://localhost:11434</code></li>
            <li>You have at least one model installed (e.g., <code class="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">ollama pull llama3.2</code>)</li>
          </ul>
        </div>
      {/if}

      {#if availableModels.length > 0}
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">Model:</label>
          <select bind:value={selectedModel} class="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700">
            {#each availableModels as model}
              <option value={model}>{model}</option>
            {/each}
          </select>
        </div>
      {/if}

      <div class="mb-4">
        <label class="block text-sm font-medium mb-2">Ask a question about your data:</label>
        <textarea
          bind:value={question}
          on:keypress={handleKeyPress}
          placeholder="e.g., How was my usual anxiety level when I slept for only 6 hours?"
          class="w-full p-3 border rounded dark:bg-gray-800 dark:border-gray-700 min-h-[100px]"
          disabled={loading || !ollamaAvailable}
        />
        <button
          on:click={handleSubmit}
          disabled={loading || !ollamaAvailable || !question.trim()}
          class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if loading}
            Thinking...
          {:else}
            Ask
          {/if}
        </button>
      </div>

      {#if error}
        <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
          <p class="text-red-800 dark:text-red-200">Error: {error}</p>
        </div>
      {/if}

      {#if answer}
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
          <h3 class="font-semibold mb-2">Answer:</h3>
          <div class="prose dark:prose-invert max-w-none">
            <p class="whitespace-pre-wrap">{answer}</p>
          </div>
        </div>
      {/if}
    </Card>

    {#if history && history.length > 0}
      <Card pad title="Recent Questions" class="mt-4">
        <div class="space-y-4">
          {#each history as item (item.id)}
            <div class="border-b dark:border-gray-700 pb-4 last:border-0">
              <div class="flex items-start justify-between mb-2">
                <p class="font-medium text-sm text-gray-500 dark:text-gray-400">
                  {item.timestamp.toLocaleString()}
                </p>
              </div>
              <p class="font-semibold mb-2">{item.question}</p>
              <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm">{item.answer}</p>
            </div>
          {/each}
        </div>
      </Card>
    {/if}
  </div>

