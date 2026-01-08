import dayjs from 'dayjs'
import { get } from 'svelte/store'
import { LedgerStore } from '../ledger/LedgerStore'
import { TrackableStore, getTrackablesFromStorage } from '../trackable/TrackableStore'
import type { Trackable } from '../trackable/Trackable.class'
import logsToTrackableUsage from '../usage/usage-utils'
import type NLog from '../nomie-log/nomie-log'

/**
 * Format date for AI display in a human-readable format
 * Example: "Thursday, 8th January 2026"
 */
function formatDateForAI(date: string | dayjs.Dayjs): string {
  return dayjs(date).format('dddd, Do MMMM YYYY')
}

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
 * Detect periods (consecutive days) from an array of dates
 */
function detectPeriods(dates: string[]): Array<{ start: string; end: string; duration: number }> {
  if (dates.length === 0) return []
  
  const sortedDates = [...dates].sort()
  const periods: Array<{ start: string; end: string; duration: number }> = []
  let currentPeriodStart = sortedDates[0]
  let currentPeriodEnd = sortedDates[0]
  
  for (let i = 1; i < sortedDates.length; i++) {
    const currentDate = dayjs(sortedDates[i])
    const previousDate = dayjs(sortedDates[i - 1])
    const daysDiff = currentDate.diff(previousDate, 'day')
    
    if (daysDiff <= 1) {
      // Consecutive or same day - extend current period
      currentPeriodEnd = sortedDates[i]
    } else {
      // Gap detected - save current period and start new one
      periods.push({
        start: currentPeriodStart,
        end: currentPeriodEnd,
        duration: dayjs(currentPeriodEnd).diff(dayjs(currentPeriodStart), 'day') + 1,
      })
      currentPeriodStart = sortedDates[i]
      currentPeriodEnd = sortedDates[i]
    }
  }
  
  // Add the last period
  periods.push({
    start: currentPeriodStart,
    end: currentPeriodEnd,
    duration: dayjs(currentPeriodEnd).diff(dayjs(currentPeriodStart), 'day') + 1,
  })
  
  return periods
}

/**
 * Calculate intervals between log entries for a tracker
 * Returns intervals in hours and minutes
 */
function calculateIntervals(logs: Array<NLog>, trackerTag: string): {
  intervals: Array<{ hours: number; minutes: number; formatted: string }>
  averageHours: number
  averageMinutes: number
  averageFormatted: string
} {
  // Filter logs that contain this tracker
  const trackerLogs = logs
    .filter((log) => {
      const trackerFound = log.trackers?.find((t) => t.id === trackerTag)
      return !!trackerFound
    })
    .sort((a, b) => dayjs(a.end).valueOf() - dayjs(b.end).valueOf())

  if (trackerLogs.length < 2) {
    return {
      intervals: [],
      averageHours: 0,
      averageMinutes: 0,
      averageFormatted: 'N/A (need at least 2 entries)',
    }
  }

  // Calculate intervals between consecutive entries
  const intervals: Array<{ hours: number; minutes: number; formatted: string }> = []
  for (let i = 1; i < trackerLogs.length; i++) {
    const prevTime = dayjs(trackerLogs[i - 1].end)
    const currTime = dayjs(trackerLogs[i].end)
    const diffMinutes = currTime.diff(prevTime, 'minute')
    const hours = Math.floor(diffMinutes / 60)
    const minutes = diffMinutes % 60

    let formatted = ''
    if (hours > 0) {
      formatted = `${hours} hour${hours !== 1 ? 's' : ''}`
      if (minutes > 0) {
        formatted += ` ${minutes} minute${minutes !== 1 ? 's' : ''}`
      }
    } else {
      formatted = `${minutes} minute${minutes !== 1 ? 's' : ''}`
    }

    intervals.push({ hours, minutes, formatted })
  }

  // Calculate average
  const totalMinutes = intervals.reduce((sum, interval) => sum + interval.hours * 60 + interval.minutes, 0)
  const averageMinutes = totalMinutes / intervals.length
  const avgHours = Math.floor(averageMinutes / 60)
  const avgMins = Math.round(averageMinutes % 60)
  const avgHoursDecimal = averageMinutes / 60

  let avgFormatted = ''
  if (avgHours > 0) {
    // Show decimal hours if less than 1 hour total, otherwise show hours and minutes
    if (avgHoursDecimal < 1) {
      avgFormatted = `${avgHoursDecimal.toFixed(1)} hours`
    } else {
      avgFormatted = `${avgHours} hour${avgHours !== 1 ? 's' : ''}`
      if (avgMins > 0) {
        avgFormatted += ` ${avgMins} minute${avgMins !== 1 ? 's' : ''}`
      }
    }
  } else {
    avgFormatted = `${Math.round(averageMinutes)} minute${Math.round(averageMinutes) !== 1 ? 's' : ''}`
  }

  return {
    intervals,
    averageHours: avgHoursDecimal,
    averageMinutes: averageMinutes,
    averageFormatted: avgFormatted,
  }
}

/**
 * Get relevant data from Nomie based on the question
 */
async function getRelevantData(question: string): Promise<{
  trackers: Array<{ tag: string; label: string; type: string }>
  contexts: Array<{ tag: string; label: string }>
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

  const contextList = Object.values(trackables)
    .filter((t: Trackable) => t.type === 'context')
    .map((t: Trackable) => ({
      tag: t.tag || '',
      label: t.label || t.ctx?.label || t.tag?.replace('+', '') || '',
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

  // Enhance usage data with period detection for contexts and tick trackers
  // Also add interval calculations for trackers
  const enhancedUsageData = Object.keys(usageData).reduce((acc, tag) => {
    const usage = usageData[tag]
    const dates = usage.dates.map((d: any) => d.format('YYYY-MM-DD'))
    const trackable = usage.trackable
    
    const baseData = {
      tag: usage.trackable?.tag,
      label: usage.trackable?.label,
      values: usage.values,
      dates: dates,
      average: usage.values.filter((v: number) => !isNaN(v)).length > 0
        ? usage.values.filter((v: number) => !isNaN(v)).reduce((a: number, b: number) => a + b, 0) /
          usage.values.filter((v: number) => !isNaN(v)).length
        : 0,
      count: usage.values.filter((v: number) => !isNaN(v)).length,
    }
    
    // Add period detection for contexts and tick-type trackers (which are good for period tracking)
    if (trackable?.type === 'context' || (trackable?.type === 'tracker' && trackable?.tracker?.type === 'tick')) {
      const periods = detectPeriods(dates)
      baseData['periods'] = periods
      baseData['periodCount'] = periods.length
      if (periods.length > 0) {
        // Get the most recent period
        const sortedPeriods = [...periods].sort((a, b) => dayjs(b.end).diff(dayjs(a.end)))
        baseData['lastPeriod'] = sortedPeriods[0]
        baseData['longestPeriod'] = periods.reduce((longest, p) => p.duration > longest.duration ? p : longest, periods[0])
      }
    }
    
    // Add interval calculations for all trackers (useful for "average time between" questions)
    if (trackable?.type === 'tracker' && usage.count > 1) {
      const intervalData = calculateIntervals(logs, tag)
      baseData['intervals'] = intervalData.intervals
      baseData['averageInterval'] = intervalData.averageFormatted
      baseData['averageIntervalHours'] = intervalData.averageHours
      baseData['averageIntervalMinutes'] = intervalData.averageMinutes
      // Include entry timestamps for detailed analysis
      const trackerLogs = logs
        .filter((log) => {
          const trackerFound = log.trackers?.find((t) => t.id === tag)
          return !!trackerFound
        })
        .sort((a, b) => dayjs(a.end).valueOf() - dayjs(b.end).valueOf())
        .map((log) => ({
          timestamp: log.end.toISOString(),
          date: formatDateForAI(log.end),
          time: dayjs(log.end).format('HH:mm'),
          formatted: `${formatDateForAI(log.end)} at ${dayjs(log.end).format('HH:mm')}`,
        }))
      baseData['entries'] = trackerLogs
    }
    
    acc[tag] = baseData
    return acc
  }, {} as any)

  return {
    trackers: trackerList,
    contexts: contextList,
    logs: logs.slice(0, 1000), // Limit to recent logs for performance
    usageData: enhancedUsageData,
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
  contexts?: string[]
  conditions?: Array<{ tracker: string; operator: string; value: number }>
  timeRange?: { start?: string; end?: string }
} {
  const lowerQuestion = question.toLowerCase()
  const result: any = {}

  // Try to extract tracker names (common patterns with #)
  const trackerMatches = lowerQuestion.match(/#(\w+)/g)
  if (trackerMatches) {
    result.trackers = trackerMatches.map((m) => m.replace('#', ''))
  }

  // Try to extract context names (common patterns with +)
  const contextMatches = lowerQuestion.match(/\+(\w+)/g)
  if (contextMatches) {
    result.contexts = contextMatches.map((m) => m.replace('+', ''))
  }

  // Also try to extract context names from natural language (e.g., "bulk period", "bulk")
  // This helps when users ask "when was my last bulk" without the + prefix
  const contextKeywords = ['bulk', 'cut', 'maintenance', 'deload'] // Add more as needed
  const foundContexts = contextKeywords.filter(keyword => 
    lowerQuestion.includes(keyword) && !result.contexts?.includes(keyword)
  )
  if (foundContexts.length > 0) {
    result.contexts = [...(result.contexts || []), ...foundContexts]
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
    
    // Enhance parsed trackers with fuzzy matching from natural language
    // If no trackers found by exact match, try to find similar ones from question
    if (!parsed.trackers || parsed.trackers.length === 0) {
      const lowerQuestion = question.toLowerCase()
      // Common patterns: "my X", "I X", "Xed", "Xing", etc.
      const trackerCandidates: string[] = []
      
      // Try to match trackers by tag or label similarity
      for (const tracker of data.trackers) {
        const tag = tracker.tag.toLowerCase()
        const label = tracker.label.toLowerCase()
        
        // Check if question contains the tag or label
        if (lowerQuestion.includes(tag) || lowerQuestion.includes(label)) {
          trackerCandidates.push(tracker.tag)
        } else {
          // Try fuzzy matching: check if tag/label is contained in words from question
          const questionWords = lowerQuestion.split(/\W+/)
          const tagWords = tag.split(/[-_\s]+/)
          const labelWords = label.split(/[-_\s]+/)
          
          // Check if any tag word matches any question word (or is a substring)
          for (const qWord of questionWords) {
            if (qWord.length > 2) { // Only match words with 3+ characters
              for (const tWord of tagWords) {
                if (tWord.length > 2 && (qWord.includes(tWord) || tWord.includes(qWord))) {
                  trackerCandidates.push(tracker.tag)
                  break
                }
              }
              if (trackerCandidates.includes(tracker.tag)) break
              
              // Also check label words
              for (const lWord of labelWords) {
                if (lWord.length > 2 && (qWord.includes(lWord) || lWord.includes(qWord))) {
                  trackerCandidates.push(tracker.tag)
                  break
                }
              }
              if (trackerCandidates.includes(tracker.tag)) break
            }
          }
        }
      }
      
      if (trackerCandidates.length > 0) {
        parsed.trackers = [...new Set(trackerCandidates)] // Remove duplicates
      }
    }

    // Build context for AI - limit size to avoid timeout
    const trackerList = data.trackers.slice(0, 30).map((t) => `- ${t.tag} (${t.label}) - Type: ${t.type}`).join('\n')
    const contextList = data.contexts.slice(0, 20).map((c) => `- ${c.tag} (${c.label})`).join('\n')
    
    // Build usage summary with period information and interval data
    const usageSummary = Object.keys(data.usageData)
      .slice(0, 20)
      .map((tag) => {
        const usage = data.usageData[tag]
        let summary = `${usage.tag} (${usage.label}): ${usage.count} entries`
        
        if (usage.periods && usage.periods.length > 0) {
          summary += `, ${usage.periodCount} period(s)`
          if (usage.lastPeriod) {
            summary += `, last: ${formatDateForAI(usage.lastPeriod.start)} to ${formatDateForAI(usage.lastPeriod.end)} (${usage.lastPeriod.duration} days)`
          }
          if (usage.longestPeriod && usage.longestPeriod.duration > 0) {
            summary += `, longest: ${usage.longestPeriod.duration} days`
          }
        } else if (usage.count > 0) {
          summary += `, avg: ${usage.average.toFixed(2)}`
        }
        
        // Add interval information if available (for "average time between" questions)
        if (usage.averageInterval) {
          summary += `, avg time between entries: ${usage.averageInterval}`
        }
        
        return summary
      })
      .join('\n')
    
    // Build detailed entry list for trackers mentioned in the question
    let detailedTrackerEntries = ''
    if (parsed.trackers && parsed.trackers.length > 0) {
      const detailedEntries = parsed.trackers
        .map((trackerTag: string) => {
          const usage = data.usageData[trackerTag]
          if (usage && usage.entries && usage.entries.length > 0) {
            const entriesList = usage.entries
              .map((entry: any, idx: number) => {
                let entryStr = `${idx + 1}. ${entry.formatted}`
                if (usage.intervals && usage.intervals[idx - 1]) {
                  entryStr += ` (${usage.intervals[idx - 1].formatted} since previous)`
                }
                return entryStr
              })
              .join('\n')
            return `Detailed entries for ${usage.tag} (${usage.label}):\n${entriesList}\nAverage time between: ${usage.averageInterval}`
          }
          return null
        })
        .filter((x: string | null) => x !== null)
        .join('\n\n')
      
      if (detailedEntries) {
        detailedTrackerEntries = '\n\nDetailed Entry Timestamps:\n' + detailedEntries
      }
    }
    
    const recentLogs = data.logs
      .slice(0, 5)
      .map((log) => {
        const date = formatDateForAI(log.end)
        const time = dayjs(log.end).format('HH:mm')
        return `[${date} at ${time}] ${log.note}`
      })
      .join('\n')

    const context = `You are an AI assistant analyzing personal tracking data from Nomie.

Available Trackers (${data.trackers.length} total):
${trackerList}

Available Contexts (${data.contexts.length} total):
${contextList || 'None'}

Date Range: ${formatDateForAI(data.dateRange.start)} to ${formatDateForAI(data.dateRange.end)}

Usage Summary (includes period detection for contexts and tick trackers, and interval calculations for trackers):
${usageSummary}${detailedTrackerEntries}

Recent Logs:
${recentLogs}

User Question: ${question}

Provide a concise, helpful answer based on the data above. 
- If asking about periods (like "when was my last bulk"), use the period information from the usage summary.
- If asking about specific values, use the actual numbers from the usage summary.
- If asking about "average time between" entries (e.g., "average time between pees"), use the "avg time between entries" data from the usage summary, or calculate from the detailed entry timestamps if provided.
- All entries have timestamps - use these to calculate intervals when needed.
- Contexts are marked with + prefix (e.g., +bulk) and are designed for tracking periods/situations.
- Periods are detected by finding consecutive days where a context or tracker was used.
- When multiple entries exist with timestamps, you CAN calculate average time between entries using the provided interval data or by analyzing the detailed entry timestamps.`

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

