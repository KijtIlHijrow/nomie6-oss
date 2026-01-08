import dayjs from 'dayjs'
import { get } from 'svelte/store'
import { LedgerStore } from '../ledger/LedgerStore'
import { TrackableStore, getTrackablesFromStorage } from '../trackable/TrackableStore'
import type { Trackable } from '../trackable/Trackable.class'
import logsToTrackableUsage from '../usage/usage-utils'
import type NLog from '../nomie-log/nomie-log'

const OLLAMA_ENDPOINT = 'http://localhost:11434/api/generate'
const DEFAULT_MODEL = 'llama3.2' // You can change this to any model you have installed

export interface AIQueryResponse {
  answer: string
  data?: any
  error?: string
}

/**
 * Query Ollama AI with a prompt and timeout
 */
async function queryOllama(prompt: string, model: string = DEFAULT_MODEL, timeoutMs: number = 60000): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(OLLAMA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama API error (${response.status}): ${errorText || response.statusText}`)
    }

    const data = await response.json()
    if (!data.response) {
      throw new Error('No response from Ollama. The model may not be loaded or there was an error.')
    }
    return data.response
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds. The model may be too slow or the prompt too complex.`)
    }
    console.error('Error querying Ollama:', error)
    throw error
  }
}

/**
 * Get relevant data from Nomie based on the question
 */
async function getRelevantData(question: string): Promise<{
  trackers: Array<{ tag: string; label: string; type: string }>
  logs: Array<NLog>
  usageData: any
  dateRange: { start: string; end: string }
}> {
  // Get all trackables
  const trackables = await getTrackablesFromStorage()
  const trackerList = Object.values(trackables)
    .filter((t: Trackable) => t.type === 'tracker')
    .map((t: Trackable) => ({
      tag: t.tag || '',
      label: t.label || '',
      type: t.tracker?.type || 'tick',
    }))

  // Get logs from last 90 days (adjust as needed)
  const end = dayjs().endOf('day')
  const start = end.subtract(90, 'days').startOf('day')

  const logs = await LedgerStore.query({
    start: start,
    end: end,
  })

  // Get usage data for analysis
  const usageData = logsToTrackableUsage(logs, {
    trackables: trackables,
  })

  return {
    trackers: trackerList,
    logs: logs.slice(0, 1000), // Limit to recent logs for performance
    usageData: Object.keys(usageData).reduce((acc, tag) => {
      const usage = usageData[tag]
      acc[tag] = {
        tag: usage.trackable?.tag,
        label: usage.trackable?.label,
        values: usage.values,
        dates: usage.dates.map((d: any) => d.format('YYYY-MM-DD')),
        average: usage.values.filter((v: number) => !isNaN(v)).length > 0
          ? usage.values.filter((v: number) => !isNaN(v)).reduce((a: number, b: number) => a + b, 0) /
            usage.values.filter((v: number) => !isNaN(v)).length
          : 0,
        count: usage.values.filter((v: number) => !isNaN(v)).length,
      }
      return acc
    }, {} as any),
    dateRange: {
      start: start.format('YYYY-MM-DD'),
      end: end.format('YYYY-MM-DD'),
    },
  }
}

/**
 * Parse the question to extract relevant information
 */
function parseQuestion(question: string): {
  trackers?: string[]
  conditions?: Array<{ tracker: string; operator: string; value: number }>
  timeRange?: { start?: string; end?: string }
} {
  const lowerQuestion = question.toLowerCase()
  const result: any = {}

  // Try to extract tracker names (common patterns)
  const trackerMatches = lowerQuestion.match(/#(\w+)/g)
  if (trackerMatches) {
    result.trackers = trackerMatches.map((m) => m.replace('#', ''))
  }

  // Try to extract time conditions (e.g., "6 hours", "last week")
  if (lowerQuestion.includes('6 hours') || lowerQuestion.includes('6 hour')) {
    result.timeRange = {
      start: dayjs().subtract(6, 'hours').format('YYYY-MM-DD HH:mm'),
    }
  }

  // Try to extract value conditions
  const valueMatch = lowerQuestion.match(/(\d+)\s*(hours?|days?|weeks?|months?)/i)
  if (valueMatch) {
    const value = parseInt(valueMatch[1])
    const unit = valueMatch[2].toLowerCase()
    if (unit.includes('hour')) {
      result.timeRange = {
        start: dayjs().subtract(value, 'hours').format('YYYY-MM-DD HH:mm'),
      }
    } else if (unit.includes('day')) {
      result.timeRange = {
        start: dayjs().subtract(value, 'days').format('YYYY-MM-DD'),
      }
    } else if (unit.includes('week')) {
      result.timeRange = {
        start: dayjs().subtract(value, 'weeks').format('YYYY-MM-DD'),
      }
    } else if (unit.includes('month')) {
      result.timeRange = {
        start: dayjs().subtract(value, 'months').format('YYYY-MM-DD'),
      }
    }
  }

  return result
}

/**
 * Main function to answer a question about Nomie data
 */
export async function answerQuestion(question: string, model: string = DEFAULT_MODEL): Promise<AIQueryResponse> {
  try {
    // Get relevant data
    const data = await getRelevantData(question)
    const parsed = parseQuestion(question)

    // Build context for AI - limit size to avoid timeout
    const trackerList = data.trackers.slice(0, 30).map((t) => `- ${t.tag} (${t.label}) - Type: ${t.type}`).join('\n')
    const usageSummary = Object.keys(data.usageData)
      .slice(0, 15)
      .map((tag) => {
        const usage = data.usageData[tag]
        return `${usage.tag} (${usage.label}): ${usage.count} entries, avg: ${usage.average.toFixed(2)}`
      })
      .join('\n')
    
    const recentLogs = data.logs
      .slice(0, 5)
      .map((log) => {
        const date = dayjs(log.end).format('YYYY-MM-DD HH:mm')
        return `[${date}] ${log.note}`
      })
      .join('\n')

    const context = `You are an AI assistant analyzing personal tracking data from Nomie.

Available Trackers (${data.trackers.length} total):
${trackerList}

Date Range: ${data.dateRange.start} to ${data.dateRange.end}

Usage Summary:
${usageSummary}

Recent Logs:
${recentLogs}

User Question: ${question}

Provide a concise, helpful answer based on the data above. If asking about specific values, use the actual numbers from the usage summary.`

    // Query AI
    const answer = await queryOllama(context, model)

    return {
      answer,
      data: {
        parsed,
        trackerCount: data.trackers.length,
        logCount: data.logs.length,
      },
    }
  } catch (error: any) {
    return {
      answer: '',
      error: error.message || 'Failed to query AI',
    }
  }
}

/**
 * Check if Ollama is available
 */
export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      method: 'GET',
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Get available models from Ollama
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const response = await fetch('http://localhost:11434/api/tags')
    if (!response.ok) {
      console.error(`Ollama API error (${response.status}): ${response.statusText}`)
      return []
    }
    const data = await response.json()
    return data.models?.map((m: any) => m.name) || []
  } catch (error) {
    console.error('Error fetching available models:', error)
    return []
  }
}

