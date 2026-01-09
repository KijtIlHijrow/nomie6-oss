import dayjs from 'dayjs'
import { get } from 'svelte/store'
import { LedgerStore, saveLog } from '../ledger/LedgerStore'
import { TrackableStore, getTrackablesFromStorage, saveTrackersToStorage } from '../trackable/TrackableStore'
import { Trackable } from '../trackable/Trackable.class'
import logsToTrackableUsage from '../usage/usage-utils'
import NLog from '../nomie-log/nomie-log'
import TrackerClass, { toTag } from '../../modules/tracker/TrackerClass'
import ScoreNote from '../../modules/scoring/score-note'
import type { ITrackers } from '../../modules/import/import'
import { Interact } from '../../store/interact'
import UOM from '../uom/uom'
import UOMS from '../uom/uom.config'
import { getGroupedUoms } from '../uom/uom-utils'
import type { PopMenuButton } from '../../components/pop-menu/usePopmenu'
import type { UOMElement } from '../uom/uom-types'
import appConfig from '../../config/appConfig'
import { focusTypes } from '../focus/focus-utils'

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
  action?: 'add_entry' | 'question' | 'needs_value' | 'needs_tracker_creation' | 'needs_tracker_type' | 'needs_uom' | 'needs_uom_category' | 'needs_math' | 'needs_positivity' | 'needs_focus' | 'needs_also_include' | 'needs_default_value' | 'create_tracker_with_config'
  trackerTag?: string
  trackerName?: string // Original tracker name with capitalization preserved
  trackerType?: string
  value?: number
  originalMessage?: string
  config?: { type?: string; uom?: string; math?: string; score?: string; focus?: string[]; include?: string; default?: number } // Partial config being built
  options?: Array<{ label: string; value: string }> // Options for multiple choice
}

export interface IntentDetectionResult {
  type: 'add_entry' | 'question'
  trackerName?: string
  value?: number
  trackerNames?: string[] // For multiple trackers
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
  // Normalize tag - remove # prefix if present, since tracker.id doesn't include it
  const normalizedTag = trackerTag.startsWith('#') ? trackerTag.slice(1) : trackerTag
  
  // Filter logs that contain this tracker
  const trackerLogs = logs
    .filter((log) => {
      if (!log.trackers) {
        log.getMeta() // Ensure meta is loaded
      }
      const trackerFound = log.trackers?.find((t) => t.id === normalizedTag || t.id === trackerTag)
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
  // Show decimal hours if less than 1 hour total (e.g., "0.5 hours")
  if (avgHoursDecimal < 1) {
    avgFormatted = `${avgHoursDecimal.toFixed(1)} hours`
  } else {
    // Show hours and minutes for intervals >= 1 hour
    avgFormatted = `${avgHours} hour${avgHours !== 1 ? 's' : ''}`
    if (avgMins > 0) {
      avgFormatted += ` ${avgMins} minute${avgMins !== 1 ? 's' : ''}`
    }
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
    .map((t: Trackable) => {
      const tag = t.tag || ''
      // Safe to call replace since tag is guaranteed to be a string (fallback to '')
      const label = t.label || t.ctx?.label || tag.replace('+', '') || ''
      return {
        tag,
        label,
      }
    })

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
      const trackable = usage.trackable
      
      // For contexts with duration, expand dates to include all days within the duration
      let dates = usage.dates.map((d: any) => d.format('YYYY-MM-DD'))
      let expandedDates = dates
      
      if (trackable?.type === 'context' && trackable?.ctx?.duration && trackable.ctx.duration > 1) {
        // Expand each log entry date to include all days within the duration
        const duration = trackable.ctx.duration
        expandedDates = []
        const dateSet = new Set<string>()
        
        dates.forEach((dateStr: string) => {
          const startDate = dayjs(dateStr)
          // Add all days from the log entry date through the duration
          for (let i = 0; i < duration; i++) {
            const dayDate = startDate.add(i, 'day').format('YYYY-MM-DD')
            dateSet.add(dayDate)
          }
        })
        
        expandedDates = Array.from(dateSet).sort()
      }
      
      const baseData = {
        tag: usage.trackable?.tag,
        label: usage.trackable?.label,
        values: usage.values,
        dates: dates, // Original log entry dates
        expandedDates: expandedDates, // Expanded dates (for contexts with duration)
        average: usage.values.filter((v: number) => !isNaN(v)).length > 0
          ? usage.values.filter((v: number) => !isNaN(v)).reduce((a: number, b: number) => a + b, 0) /
            usage.values.filter((v: number) => !isNaN(v)).length
          : 0,
        count: usage.values.filter((v: number) => !isNaN(v)).length,
        contextDuration: trackable?.type === 'context' ? (trackable.ctx?.duration || 1) : undefined,
      }
      
      // Add period detection for contexts and tick-type trackers (which are good for period tracking)
      if (trackable?.type === 'context' || (trackable?.type === 'tracker' && trackable?.tracker?.type === 'tick')) {
        // Use expanded dates for period detection (accounts for context duration)
        const periods = detectPeriods(expandedDates)
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
    if (trackable?.type === 'tracker' && baseData.count > 1) {
      const intervalData = calculateIntervals(logs, tag)
      baseData['intervals'] = intervalData.intervals
      baseData['averageInterval'] = intervalData.averageFormatted
      baseData['averageIntervalHours'] = intervalData.averageHours
      baseData['averageIntervalMinutes'] = intervalData.averageMinutes
      // Include entry timestamps for detailed analysis
      // Normalize tag - remove # prefix if present, since tracker.id doesn't include it
      const normalizedTag = tag.startsWith('#') ? tag.slice(1) : tag
      const trackerLogs = logs
        .filter((log) => {
          if (!log.trackers) {
            log.getMeta() // Ensure meta is loaded
          }
          const trackerFound = log.trackers?.find((t) => t.id === normalizedTag || t.id === tag)
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
 * Detect intent from user message - whether they want to add an entry or ask a question
 */
function detectIntent(message: string, availableTrackers: Array<{ tag: string; label: string }>): IntentDetectionResult {
  const lowerMessage = message.toLowerCase().trim()
  
  // Keywords that indicate entry creation intent
  const addKeywords = ['add', 'track', 'log', 'record', 'enter', 'create entry', 'new entry']
  const questionKeywords = ['how', 'what', 'when', 'where', 'why', 'which', 'who', '?', 'show', 'tell', 'analyze', 'compare']
  
  // Check for explicit add keywords
  const hasAddKeyword = addKeywords.some(keyword => lowerMessage.includes(keyword))
  const hasQuestionKeyword = questionKeywords.some(keyword => lowerMessage.includes(keyword))
  
  // If it has question keywords and no add keywords, it's a question
  if (hasQuestionKeyword && !hasAddKeyword) {
    return { type: 'question' }
  }
  
  // If it has add keywords, it's likely an entry creation
  if (hasAddKeyword) {
    // Try to extract tracker name(s) and value
    const trackerNames: string[] = []
    let value: number | undefined
    
    // Extract value from message (e.g., "add intraworkout 5")
    const valueMatch = lowerMessage.match(/(?:add|track|log|record|enter)\s+\w+\s+(\d+(?:\.\d+)?)/i)
    if (valueMatch) {
      value = parseFloat(valueMatch[1])
    }
    
    // Try to find tracker names by matching against available trackers first
    for (const tracker of availableTrackers) {
      const tagLower = tracker.tag.toLowerCase().replace('#', '')
      const labelLower = tracker.label.toLowerCase()
      
      // Check if message contains tracker tag or label
      if (lowerMessage.includes(tagLower) || lowerMessage.includes(labelLower)) {
        trackerNames.push(tracker.tag)
      }
    }
    
    // If no tracker found by name, try to extract from message
    if (trackerNames.length === 0) {
      // Look for patterns like "for 'X'", "for X", "called X", "named X"
      let extractedName: string | null = null
      
      // Pattern 1: "for 'X'" or "for "X""
      const forQuotedMatch = message.match(/for\s+['"]([^'"]+)['"]/i)
      if (forQuotedMatch) {
        extractedName = forQuotedMatch[1].trim()
      }
      
      // Pattern 2: "for X" (where X is capitalized or a single word)
      if (!extractedName) {
        const forMatch = lowerMessage.match(/for\s+([a-z0-9_]+)/i)
        if (forMatch) {
          // Check if the word after "for" is capitalized in original message (likely a name)
          const originalMatch = message.match(/for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/)
          if (originalMatch) {
            extractedName = originalMatch[1] // Preserve original capitalization
          } else {
            extractedName = forMatch[1]
          }
        }
      }
      
      // Pattern 3: "called X" or "named X"
      if (!extractedName) {
        const calledMatch = lowerMessage.match(/(?:called|named)\s+([a-z0-9_]+)/i)
        if (calledMatch) {
          extractedName = calledMatch[1]
        }
      }
      
      // Pattern 4: Look for quoted strings anywhere in the message
      if (!extractedName) {
        const quotedMatch = message.match(/['"]([^'"]+)['"]/i)
        if (quotedMatch) {
          extractedName = quotedMatch[1].trim() // Preserve original capitalization from quotes
        }
      }
      
      // Pattern 5: Look for capitalized words (likely proper nouns/tracker names)
      if (!extractedName) {
        const capitalizedMatch = message.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/)
        if (capitalizedMatch) {
          extractedName = capitalizedMatch[1] // Preserve original capitalization
        }
      }
      
      // Pattern 6: Fallback - look for words after "add", "track", etc., but skip common words
      if (!extractedName) {
        const skipWords = ['new', 'a', 'an', 'the', 'tracker', 'entry', 'log']
        const addMatch = lowerMessage.match(/(?:add|track|log|record|enter)\s+(?:new\s+)?(?:tracker\s+for\s+)?(?:a\s+)?(?:an\s+)?(?:the\s+)?([a-z0-9_]+)/i)
        if (addMatch) {
          const potentialTag = addMatch[1]
          if (!skipWords.includes(potentialTag)) {
            extractedName = potentialTag
          }
        }
      }
      
      if (extractedName) {
        // Normalize for matching against existing trackers
        const normalizedName = extractedName.toLowerCase()
        // Try fuzzy match against available trackers
        for (const tracker of availableTrackers) {
          const tagLower = tracker.tag.toLowerCase().replace('#', '')
          if (tagLower.includes(normalizedName) || normalizedName.includes(tagLower)) {
            trackerNames.push(tracker.tag)
            break
          }
        }
        // If still no match, use the extracted name as potential tracker name (preserve original capitalization)
        if (trackerNames.length === 0) {
          trackerNames.push(extractedName)
        }
      }
    }
    
    return {
      type: 'add_entry',
      trackerNames: trackerNames.length > 0 ? trackerNames : undefined,
      trackerName: trackerNames.length > 0 ? trackerNames[0] : undefined,
      value,
    }
  }
  
  // Default: treat as question if no clear intent
  return { type: 'question' }
}

/**
 * Parse numeric value from user message
 */
export function parseValueFromMessage(message: string): number | null {
  // Try to extract numbers (integers and decimals)
  const numberMatch = message.match(/(\d+(?:\.\d+)?)/)
  if (numberMatch) {
    return parseFloat(numberMatch[1])
  }
  return null
}

/**
 * Find tracker by name (fuzzy matching)
 */
async function findTrackerByName(trackerName: string): Promise<Trackable | null> {
  const trackables = await getTrackablesFromStorage()
  const normalizedName = trackerName.toLowerCase().replace('#', '').trim()
  
  // First try exact match
  for (const tag in trackables) {
    const trackable = trackables[tag]
    if (trackable.type === 'tracker') {
      const tagNormalized = tag.toLowerCase().replace('#', '')
      if (tagNormalized === normalizedName) {
        return trackable
      }
    }
  }
  
  // Then try fuzzy match
  for (const tag in trackables) {
    const trackable = trackables[tag]
    if (trackable.type === 'tracker') {
      const tagNormalized = tag.toLowerCase().replace('#', '')
      const labelNormalized = (trackable.label || '').toLowerCase()
      
      // Check if normalized name is contained in tag or label
      if (tagNormalized.includes(normalizedName) || normalizedName.includes(tagNormalized) ||
          labelNormalized.includes(normalizedName) || normalizedName.includes(labelNormalized)) {
        return trackable
      }
    }
  }
  
  return null
}

/**
 * Parse UOM hint from message (e.g., "grams", "kg", "pounds")
 */
function parseUOMHint(message: string): string | null {
  const lowerMessage = message.toLowerCase()
  
  // Common UOM mappings
  const uomMap: { [key: string]: string } = {
    'gram': 'gram',
    'grams': 'gram',
    'g': 'gram',
    'kilogram': 'kg',
    'kilograms': 'kg',
    'kg': 'kg',
    'pound': 'lb',
    'pounds': 'lb',
    'lbs': 'lb',
    'lb': 'lb',
    'ounce': 'oz',
    'ounces': 'oz',
    'oz': 'oz',
    'count': 'num',
    'number': 'num',
    'times': 'num',
    'calorie': 'calorie',
    'calories': 'calorie',
    'cal': 'calorie',
    'kcal': 'kcal',
    'cup': 'cup',
    'cups': 'cup',
    'ml': 'ml',
    'milliliter': 'ml',
    'milliliters': 'ml',
    'liter': 'liter',
    'liters': 'liter',
    'l': 'liter',
  }
  
  // Check for UOM mentions
  for (const [keyword, uomKey] of Object.entries(uomMap)) {
    if (lowerMessage.includes(keyword)) {
      return uomKey
    }
  }
  
  return null
}

/**
 * Infer UOM hint from tracker name based on common patterns
 * e.g., "Apple Juice" → "liter" (for liquids)
 */
function inferUOMFromTrackerName(trackerName: string): string | null {
  const lowerName = trackerName.toLowerCase()
  
  // Liquid-related keywords → suggest liter
  const liquidKeywords = ['juice', 'water', 'drink', 'beverage', 'soda', 'coffee', 'tea', 'milk', 'smoothie', 'liquid']
  for (const keyword of liquidKeywords) {
    if (lowerName.includes(keyword)) {
      return 'liter'
    }
  }
  
  // Food-related keywords → could be weight or volume, but default to weight
  const foodKeywords = ['food', 'meal', 'snack', 'breakfast', 'lunch', 'dinner']
  for (const keyword of foodKeywords) {
    if (lowerName.includes(keyword)) {
      return 'gram' // Default to grams for food
    }
  }
  
  // Exercise-related → could be time or distance
  const exerciseKeywords = ['run', 'walk', 'exercise', 'workout', 'jog']
  for (const keyword of exerciseKeywords) {
    if (lowerName.includes(keyword)) {
      return 'minute' // Default to minutes for exercise
    }
  }
  
  return null
}

/**
 * Get default UOM for a category (most common unit in that category)
 */
function getDefaultUOMForCategory(category: string): string | null {
  const categoryDefaults: { [key: string]: string } = {
    'volume': 'liter',
    'weight': 'gram',
    'distance': 'meter',
    'time': 'minute',
    'temperature': 'celsius',
    'currency': 'usd',
    'health': 'num',
    'general': 'num',
  }
  
  return categoryDefaults[category.toLowerCase()] || null
}

/**
 * Prompt user to select UOM (Unit of Measure)
 */
async function promptForUOM(hint: string | null = null): Promise<string> {
  return new Promise((resolve) => {
    const popMenuId = 'select-uom'
    const groupedUOM = UOM.toGroupedArray()
    const buttons: PopMenuButton[] = []
    
    // Add hint as first option if provided
    if (hint) {
      const hintUOM = UOMS[hint]
      if (hintUOM) {
        buttons.push({
          title: `${UOM.plural(hint)} (${hintUOM.symbol || ''})`,
          click: () => {
            resolve(hint)
          },
        })
        buttons.push({ title: '---', divider: true })
      }
    }
    
    // Add all UOM options grouped by type
    Object.keys(groupedUOM).forEach((groupKey) => {
      if (groupKey !== 'Timer') {
        buttons.push({ title: `-- ${groupKey} --`, divider: true })
        groupedUOM[groupKey].forEach((uom: any) => {
          const displayName = `${UOM.plural(uom.key)}${uom.symbol ? ` (${uom.symbol})` : ''}`
          buttons.push({
            title: displayName,
            click: () => {
              resolve(uom.key)
            },
          })
        })
      }
    })
    
    Interact.popmenu({
      id: popMenuId,
      title: 'Measure By',
      description: 'How should this tracker be measured?',
      buttons,
    })
  })
}

/**
 * Prompt user to select tracker type
 */
async function promptForTrackerType(): Promise<'tick' | 'value' | 'range' | 'picker' | 'note' | 'timer'> {
  return new Promise((resolve) => {
    const popMenuId = 'select-tracker-type'
    const buttons: PopMenuButton[] = [
      {
        title: 'Tally (Yes/No)',
        click: () => resolve('tick'),
      },
      {
        title: 'Value (Number)',
        click: () => resolve('value'),
      },
      {
        title: 'Range (Slider)',
        click: () => resolve('range'),
      },
      {
        title: 'Picker (Choices)',
        click: () => resolve('picker'),
      },
      {
        title: 'Note (Text)',
        click: () => resolve('note'),
      },
    ]
    
    Interact.popmenu({
      id: popMenuId,
      title: 'Input Type',
      description: 'How will you track this?',
      buttons,
    })
  })
}

/**
 * Prompt user to select math calculation
 */
async function promptForMath(): Promise<'sum' | 'mean'> {
  return new Promise((resolve) => {
    const popMenuId = 'select-math'
    const buttons: PopMenuButton[] = [
      {
        title: 'Sum (Total)',
        click: () => resolve('sum'),
      },
      {
        title: 'Average (Mean)',
        click: () => resolve('mean'),
      },
    ]
    
    Interact.popmenu({
      id: popMenuId,
      title: 'Calculate Totals',
      description: 'How should totals be calculated?',
      buttons,
    })
  })
}

/**
 * Create a tracker with configuration prompts
 */
async function createBasicTracker(
  trackerName: string,
  userMessage?: string,
  config?: { type?: string; uom?: string; math?: string; score?: string; focus?: string[]; include?: string; default?: number }
): Promise<Trackable | null> {
  try {
    const tag = toTag(trackerName)
    
    // Parse hints from user message
    const uomHint = userMessage ? parseUOMHint(userMessage) : null
    
    // Determine tracker type - if user mentioned a unit, it's likely a value tracker
    let trackerType: 'tick' | 'value' | 'range' | 'picker' | 'note' | 'timer' = 'tick'
    if (uomHint || userMessage?.toLowerCase().includes('measure') || userMessage?.toLowerCase().includes('gram')) {
      trackerType = 'value'
    }
    
    // Use provided config or prompt for settings
    let finalType = config?.type || trackerType
    let finalUOM = config?.uom || 'num'
    let finalMath = (config?.math || 'sum') as 'sum' | 'mean'
    
    // If we have a UOM hint, ask to confirm or select
    if (uomHint && !config?.uom) {
      finalUOM = await promptForUOM(uomHint)
    } else if (!config?.uom && trackerType === 'value') {
      // If it's a value tracker and no UOM specified, ask
      finalUOM = await promptForUOM()
    }
    
    // If type is value/range and no config provided, ask about math
    if ((finalType === 'value' || finalType === 'range') && !config?.math) {
      finalMath = await promptForMath()
    }
    
    // Parse score (positivity) - can be string or number
    let finalScore: string | number | undefined = undefined
    if (config?.score !== undefined && config?.score !== null) {
      finalScore = typeof config.score === 'string' ? config.score : String(config.score)
    }
    
    // Parse focus - ensure it's an array of valid focus types
    let finalFocus: Array<'mind' | 'body' | 'spirit'> = []
    if (config?.focus && Array.isArray(config.focus)) {
      finalFocus = config.focus.filter((f): f is 'mind' | 'body' | 'spirit' => 
        f === 'mind' || f === 'body' || f === 'spirit'
      )
    }
    
    const tracker = new TrackerClass({
      tag: tag,
      label: trackerName,
      type: finalType,
      uom: finalUOM,
      math: finalMath,
      score: finalScore,
      focus: finalFocus.length > 0 ? finalFocus : undefined,
      include: config?.include && config.include.trim() !== '' ? config.include : undefined, // Only set if not empty
      default: config?.default,
      emoji: '📝',
    })
    
    const trackable = new Trackable({
      type: 'tracker',
      tracker: tracker,
    })
    
    const saved = await saveTrackersToStorage([trackable])
    if (saved) {
      // Refresh trackables
      await getTrackablesFromStorage()
      return trackable
    }
    return null
  } catch (e) {
    console.error('Error creating tracker:', e)
    return null
  }
}

/**
 * Create a log entry for a tracker
 */
async function createLogEntry(tracker: Trackable, value?: number): Promise<{ success: boolean; error?: string; log?: NLog }> {
  try {
    if (!tracker || tracker.type !== 'tracker' || !tracker.tracker) {
      return { success: false, error: 'Invalid tracker' }
    }
    
    const trackerObj = tracker.tracker
    let note = ''
    
    // Build note based on tracker type
    if (trackerObj.type === 'tick') {
      // Tick type: just the tag
      note = tracker.tag
      if (trackerObj.include) {
        note += ` ${trackerObj.getIncluded(1).trim()}`
      }
    } else if (trackerObj.type === 'note' || trackerObj.type === 'picker') {
      // Note or picker: just the tag
      note = tracker.tag
    } else {
      // Value, range, timer: need a value
      if (value !== undefined && value !== null) {
        note = `${tracker.tag}(${value})`
      } else {
        // Use default if available
        if (trackerObj.default !== undefined && trackerObj.default !== null) {
          note = `${tracker.tag}(${trackerObj.default})`
        } else {
          note = tracker.tag
        }
      }
      
      // Add include if present
      if (trackerObj.include) {
        const val = value !== undefined ? value : (trackerObj.default || 1)
        note += ` ${trackerObj.getIncluded(val).trim()}`
      }
    }
    
    // Create log
    const log = new NLog({
      note: note,
      end: new Date(),
    })
    
    // Score the note
    const trackables = await getTrackablesFromStorage()
    const knownTrackers: ITrackers = {}
    Object.keys(trackables).forEach((tag) => {
      if (tag.substring(0, 1) === '#') {
        const trackable = trackables[tag]
        if (trackable.type === 'tracker' && trackable.tracker) {
          knownTrackers[tag.replace('#', '')] = trackable.tracker
        }
      }
    })
    log.score = ScoreNote(log.note, log.end, knownTrackers)
    
    // Save log
    await saveLog(log)
    
    return { success: true, log }
  } catch (e: any) {
    console.error('Error creating log entry:', e)
    return { success: false, error: e.message || 'Failed to create log entry' }
  }
}

/**
 * Handle entry creation request
 */
export async function handleEntryCreation(
  message: string,
  trackerName?: string,
  value?: number
): Promise<AIQueryResponse> {
  try {
    // Get available trackers for matching
    const trackables = await getTrackablesFromStorage()
    const trackerList = Object.values(trackables)
      .filter((t: Trackable) => t.type === 'tracker')
      .map((t: Trackable) => ({
        tag: t.tag || '',
        label: t.label || '',
      }))
    
    // Find tracker
    let tracker: Trackable | null = null
    let suggestedTag = ''
    
    if (trackerName) {
      tracker = await findTrackerByName(trackerName)
      if (!tracker) {
        // Suggest tag name
        suggestedTag = toTag(trackerName)
        return {
          answer: `I don't see a tracker called "${trackerName}". Would you like me to create a tracker called "${trackerName}"?`,
          action: 'needs_tracker_creation',
          trackerTag: suggestedTag,
          trackerName: trackerName, // Preserve original capitalization
          originalMessage: message,
        }
      }
    } else {
      return {
        answer: 'I need to know which tracker you want to add an entry for. Please specify the tracker name.',
        action: 'needs_tracker_creation',
      }
    }
    
    // Check if tracker needs a value
    const trackerType = tracker.tracker?.type || 'tick'
    const needsValue = ['value', 'range', 'picker'].includes(trackerType)
    
    if (needsValue && (value === undefined || value === null)) {
      // Get UOM from tracker if available
      const trackerUOM = tracker.tracker?.uom || 'num'
      return {
        answer: `How much ${tracker.label || tracker.tag}? (e.g., enter a number)`,
        action: 'needs_value',
        trackerTag: tracker.tag,
        trackerType: trackerType,
        config: { uom: trackerUOM },
      }
    }
    
    // Create the entry
    const result = await createLogEntry(tracker, value)
    
    if (result.success && result.log) {
      const valueStr = value !== undefined ? `(${value})` : ''
      return {
        answer: `✓ Added ${tracker.tag}${valueStr}`,
        action: 'add_entry',
        trackerTag: tracker.tag,
        value: value,
        data: {
          log: result.log,
        },
      }
    } else {
      return {
        answer: `Sorry, I couldn't add that entry: ${result.error || 'Unknown error'}`,
        error: result.error,
      }
    }
  } catch (error: any) {
    return {
      answer: '',
      error: error.message || 'Failed to create entry',
    }
  }
}

/**
 * Start tracker configuration flow - ask for tracker type first
 */
export function startTrackerConfiguration(trackerName: string, userMessage?: string, value?: number, existingConfig?: { type?: string; uom?: string; math?: string; score?: string; focus?: string[]; include?: string }): AIQueryResponse {
  const config = existingConfig || {}
  
  // If we don't have a type yet, ask for it
  if (!config.type) {
    const typeOptions = [
      { label: 'Tally (Yes/No)', value: 'tick' },
      { label: 'Value (Number)', value: 'value' },
      { label: 'Range (Slider)', value: 'range' },
      { label: 'Picker (Choices)', value: 'picker' },
      { label: 'Note (Text)', value: 'note' },
    ]
    
    return {
      answer: `What type of tracker should "${trackerName}" be?`,
      action: 'needs_tracker_type',
      trackerName: trackerName,
      trackerTag: toTag(trackerName),
      originalMessage: userMessage,
      value: value,
      config: config,
      options: typeOptions,
    }
  }
  
  // If we have type but need UOM (for value/range types)
  if ((config.type === 'value' || config.type === 'range') && !config.uom) {
    // Try to get UOM hint from message first, then infer from tracker name
    const uomHint = userMessage ? parseUOMHint(userMessage) : null
    const inferredUOM = !uomHint ? inferUOMFromTrackerName(trackerName) : null
    const finalUOMHint = uomHint || inferredUOM
    
    // If we have a hint and it's a valid UOM, show it as a quick option, then all UOMs from that category
    if (finalUOMHint && UOMS[finalUOMHint]) {
      const groupedUOM = UOM.toGroupedArray()
      const uomOptions: Array<{ label: string; value: string }> = []
      const hintedUOMObj = UOMS[finalUOMHint]
      const hintedCategory = hintedUOMObj.type
      
      // Add the hinted UOM as a quick option first
      uomOptions.push({
        label: `${UOM.plural(finalUOMHint)}${hintedUOMObj.symbol ? ` (${hintedUOMObj.symbol})` : ''} - Quick Select`,
        value: `__quick__${finalUOMHint}`,
      })
      uomOptions.push({
        label: '---',
        value: '__divider__',
      })
      
      // Add all UOMs from the same category as the hinted UOM
      if (hintedCategory && groupedUOM[hintedCategory]) {
        const categoryUOMs = groupedUOM[hintedCategory]
        if (Array.isArray(categoryUOMs)) {
          categoryUOMs.forEach((uom: any) => {
            const uomKey = uom.key || Object.keys(UOMS).find(k => {
              const uomObj = UOMS[k]
              return uomObj && uomObj.type === hintedCategory && uomObj.plural === uom.plural
            })
            
            // Skip the hinted UOM since we already added it as quick-select
            if (uomKey && uomKey !== finalUOMHint && UOMS[uomKey]) {
              const uomObj = UOMS[uomKey]
              const symbol = uomObj.symbol || ''
              const displayName = `${UOM.plural(uomKey)}${symbol ? ` (${symbol})` : ''}`
              uomOptions.push({
                label: displayName,
                value: uomKey,
              })
            }
          })
        }
      }
      
      // If no UOMs found in grouped array, iterate through all UOMS and filter by type
      if (uomOptions.length === 2) { // Only quick-select and divider
        Object.keys(UOMS).forEach((uomKey) => {
          const uomObj = UOMS[uomKey]
          if (uomObj && uomObj.type === hintedCategory && uomKey !== finalUOMHint) {
            const symbol = uomObj.symbol || ''
            const displayName = `${UOM.plural(uomKey)}${symbol ? ` (${symbol})` : ''}`
            uomOptions.push({
              label: displayName,
              value: uomKey,
            })
          }
        })
      }
      
      // Add divider before other categories if we have UOMs from the hinted category
      if (uomOptions.length > 2) {
        uomOptions.push({
          label: '---',
          value: '__divider__',
        })
      }
      
      // Add category options for other categories
      const categoryLabels: { [key: string]: string } = {
        'general': 'General',
        'currency': 'Currency',
        'time': 'Time',
        'distance': 'Distance',
        'temperature': 'Temperature',
        'weight': 'Weight',
        'volume': 'Volume',
        'health': 'Health',
      }
      
      Object.keys(groupedUOM).forEach((groupKey) => {
        // Skip the hinted category since we already showed its UOMs
        if (groupKey !== 'Timer' && groupKey !== 'timer' && groupKey !== hintedCategory) {
          const groupItems = groupedUOM[groupKey]
          if (Array.isArray(groupItems) && groupItems.length > 0) {
            const categoryLabel = categoryLabels[groupKey] || groupKey.charAt(0).toUpperCase() + groupKey.slice(1)
            uomOptions.push({
              label: categoryLabel,
              value: groupKey,
            })
          }
        }
      })
      
      return {
        answer: `How should "${trackerName}" be measured?`,
        action: 'needs_uom',
        trackerName: trackerName,
        trackerTag: toTag(trackerName),
        originalMessage: userMessage,
        value: value,
        config: config,
        options: uomOptions,
      }
    }
    
    // No hint, show categories first
    const groupedUOM = UOM.toGroupedArray()
    const categoryOptions: Array<{ label: string; value: string }> = []
    
    // Category labels mapping
    const categoryLabels: { [key: string]: string } = {
      'general': 'General',
      'currency': 'Currency',
      'time': 'Time',
      'distance': 'Distance',
      'temperature': 'Temperature',
      'weight': 'Weight',
      'volume': 'Volume',
      'health': 'Health',
    }
    
    Object.keys(groupedUOM).forEach((groupKey) => {
      if (groupKey !== 'Timer' && groupKey !== 'timer') {
        const groupItems = groupedUOM[groupKey]
        if (Array.isArray(groupItems) && groupItems.length > 0) {
          const categoryLabel = categoryLabels[groupKey] || groupKey.charAt(0).toUpperCase() + groupKey.slice(1)
          categoryOptions.push({
            label: categoryLabel,
            value: groupKey,
          })
        }
      }
    })
    
    // Ensure we have at least some categories
    if (categoryOptions.length === 0) {
      // Fallback: add common categories directly from UOMS
      const seenTypes = new Set<string>()
      Object.keys(UOMS).forEach((uomKey) => {
        const uomObj = UOMS[uomKey]
        if (uomObj && uomObj.type && uomObj.type !== 'Timer' && uomObj.type !== 'timer' && !seenTypes.has(uomObj.type)) {
          seenTypes.add(uomObj.type)
          const categoryLabel = categoryLabels[uomObj.type] || uomObj.type.charAt(0).toUpperCase() + uomObj.type.slice(1)
          categoryOptions.push({
            label: categoryLabel,
            value: uomObj.type,
          })
        }
      })
    }
    
    return {
      answer: `How should "${trackerName}" be measured?`,
      action: 'needs_uom_category',
      trackerName: trackerName,
      trackerTag: toTag(trackerName),
      originalMessage: userMessage,
      value: value,
      config: config,
      options: categoryOptions,
    }
  }
  
  // If we have type and UOM but need math (for value/range types)
  if ((config.type === 'value' || config.type === 'range') && config.uom && !config.math) {
    const mathOptions = [
      { label: 'Sum (Total)', value: 'sum' },
      { label: 'Average (Mean)', value: 'mean' },
    ]
    
    return {
      answer: `How should totals be calculated for "${trackerName}"?`,
      action: 'needs_math',
      trackerName: trackerName,
      trackerTag: toTag(trackerName),
      originalMessage: userMessage,
      value: value,
      config: config,
      options: mathOptions,
    }
  }
  
  // All basic config collected, now ask about positivity
  if (!config.score && config.score !== 0) {
    const positivityOptions = appConfig.positivity.map((pos) => ({
      label: `${pos.emoji} ${pos.label}`,
      value: `${pos.score}`,
    }))
    positivityOptions.push({ label: 'Skip (Neutral)', value: '0' })
    
    return {
      answer: `What's the positivity of "${trackerName}"?`,
      action: 'needs_positivity',
      trackerName: trackerName,
      trackerTag: toTag(trackerName),
      originalMessage: userMessage,
      value: value,
      config: config,
      options: positivityOptions,
    }
  }
  
  // Positivity set, now ask about focus (mind/body/spirit)
  if (config.focus === undefined) {
    const focusOptions = focusTypes.map((focus) => ({
      label: `${focus.emoji} ${focus.label}`,
      value: focus.id,
    }))
    focusOptions.push({ label: 'Skip (None)', value: '__skip__' })
    focusOptions.push({ label: 'Done (Continue)', value: '__done__' })
    
    return {
      answer: `Does "${trackerName}" affect your mind, body, or spirit? (You can select multiple, then click "Done")`,
      action: 'needs_focus',
      trackerName: trackerName,
      trackerTag: toTag(trackerName),
      originalMessage: userMessage,
      value: value,
      config: config,
      options: focusOptions,
    }
  }
  
  // Focus set, now ask about "Also Include"
  // Check if include is undefined (not set yet) or if we're waiting for content
  if (config.include === undefined || config.include === null) {
    // Check if we're waiting for the include content (user said yes but hasn't provided it yet)
    const waitingForInclude = (config as any).__waiting_for_include === true
    
    if (waitingForInclude) {
      // User said yes, now ask for the content
      return {
        answer: `What should be automatically included when tracking "${trackerName}"? (e.g., #alcohol({value}*0.5) or @person or +context)`,
        action: 'needs_also_include',
        trackerName: trackerName,
        trackerTag: toTag(trackerName),
        originalMessage: userMessage,
        value: value,
        config: config,
        options: [{ label: 'Skip (No)', value: '__skip__' }],
      }
    } else {
      // Initial question: Yes or Skip
      const alsoIncludeOptions = [
        { label: 'Yes, add "Also Include"', value: '__yes__' },
        { label: 'Skip (No)', value: '__skip__' },
      ]
      
      return {
        answer: `Would you like to automatically include other trackers, people, or contexts when tracking "${trackerName}"? (e.g., include #alcohol({value}*0.5) in a beer tracker)`,
        action: 'needs_also_include',
        trackerName: trackerName,
        trackerTag: toTag(trackerName),
        originalMessage: userMessage,
        value: value,
        config: config,
        options: alsoIncludeOptions,
      }
    }
  }
  
  // All config collected, return response indicating ready to create
  // The view will handle the async creation
  return {
    answer: `Creating tracker "${trackerName}"...`,
    action: 'create_tracker_with_config',
    trackerName: trackerName,
    trackerTag: toTag(trackerName),
    originalMessage: userMessage,
    value: value,
    config: config,
  }
}

/**
 * Create tracker with full configuration (called by view when all config is collected)
 */
export async function createTrackerWithConfig(trackerName: string, userMessage?: string, value?: number, config?: { type?: string; uom?: string; math?: string; score?: string; focus?: string[]; include?: string; default?: number }): Promise<AIQueryResponse> {
  try {
    const tracker = await createBasicTracker(trackerName, userMessage, config)
    if (tracker) {
      // Now create the entry
      const response = await handleEntryCreation(`add ${trackerName}`, trackerName, value)
      // Ensure config is passed through if response needs value
      if (response.action === 'needs_value') {
        // Merge config from parameter with config from response (response takes precedence)
        response.config = { ...config, ...(response.config || {}) }
        // If UOM is in the config, use it; otherwise get it from the tracker
        if (!response.config.uom && tracker.tracker?.uom) {
          response.config.uom = tracker.tracker.uom
        }
      }
      return response
    } else {
      return {
        answer: `Sorry, I couldn't create the tracker "${trackerName}".`,
        error: 'Failed to create tracker',
      }
    }
  } catch (error: any) {
    return {
      answer: '',
      error: error.message || 'Failed to create tracker',
    }
  }
}

/**
 * Handle configuration selection and continue the flow
 */
export function handleTrackerConfigSelection(
  trackerName: string,
  configKey: 'type' | 'uom' | 'math' | 'uom_category' | 'positivity' | 'focus' | 'also_include',
  selectedValue: string,
  userMessage?: string,
  value?: number,
  existingConfig?: { type?: string; uom?: string; math?: string; selectedCategory?: string; score?: string; focus?: string[]; include?: string }
): AIQueryResponse {
  // Handle UOM category selection - show UOMs in that category
  if (configKey === 'uom_category') {
    // Check if it's a quick select (hinted UOM)
    if (selectedValue.startsWith('__quick__')) {
      const uomKey = selectedValue.replace('__quick__', '')
      const config = { ...existingConfig, uom: uomKey }
      return startTrackerConfiguration(trackerName, userMessage, value, config)
    }
    
    // Check if it's a divider (shouldn't happen, but handle it)
    if (selectedValue === '__divider__') {
      return startTrackerConfiguration(trackerName, userMessage, value, existingConfig)
    }
    
    // It's a category - show UOMs in that category
    const groupedUOM = UOM.toGroupedArray()
    const categoryUOMs = groupedUOM[selectedValue]
    const uomOptions: Array<{ label: string; value: string }> = []
    
    // Get default UOM for this category to show as quick-select
    const defaultUOM = getDefaultUOMForCategory(selectedValue)
    let hasDefaultUOM = false
    
    if (Array.isArray(categoryUOMs)) {
      categoryUOMs.forEach((uom: any) => {
        const uomKey = uom.key || Object.keys(UOMS).find(k => {
          const uomObj = UOMS[k]
          return uomObj && uomObj.type === selectedValue && uomObj.plural === uom.plural
        })
        
        if (uomKey && UOMS[uomKey]) {
          const uomObj = UOMS[uomKey]
          const symbol = uomObj.symbol || ''
          const displayName = `${UOM.plural(uomKey)}${symbol ? ` (${symbol})` : ''}`
          
          // If this is the default UOM for the category, mark it and we'll add it as quick-select first
          if (defaultUOM && uomKey === defaultUOM) {
            hasDefaultUOM = true
          } else {
            uomOptions.push({
              label: displayName,
              value: uomKey,
            })
          }
        }
      })
    }
    
    // If no UOMs found, iterate through all UOMS and filter by type
    if (uomOptions.length === 0 && !hasDefaultUOM) {
      Object.keys(UOMS).forEach((uomKey) => {
        const uomObj = UOMS[uomKey]
        if (uomObj && uomObj.type === selectedValue) {
          const symbol = uomObj.symbol || ''
          const displayName = `${UOM.plural(uomKey)}${symbol ? ` (${symbol})` : ''}`
          
          // If this is the default UOM for the category, mark it and we'll add it as quick-select first
          if (defaultUOM && uomKey === defaultUOM) {
            hasDefaultUOM = true
          } else {
            uomOptions.push({
              label: displayName,
              value: uomKey,
            })
          }
        }
      })
    }
    
    // Add default UOM as quick-select option at the beginning if it exists
    if (hasDefaultUOM && defaultUOM && UOMS[defaultUOM]) {
      const defaultUOMObj = UOMS[defaultUOM]
      const symbol = defaultUOMObj.symbol || ''
      uomOptions.unshift({
        label: `${UOM.plural(defaultUOM)}${symbol ? ` (${symbol})` : ''} - Quick Select`,
        value: `__quick__${defaultUOM}`,
      })
      uomOptions.unshift({
        label: '---',
        value: '__divider__',
      })
    }
    
    const categoryLabels: { [key: string]: string } = {
      'general': 'General',
      'currency': 'Currency',
      'time': 'Time',
      'distance': 'Distance',
      'temperature': 'Temperature',
      'weight': 'Weight',
      'volume': 'Volume',
      'health': 'Health',
    }
    const categoryLabel = categoryLabels[selectedValue] || selectedValue.charAt(0).toUpperCase() + selectedValue.slice(1)
    return {
      answer: `Select a ${categoryLabel.toLowerCase()} unit:`,
      action: 'needs_uom',
      trackerName: trackerName,
      trackerTag: toTag(trackerName),
      originalMessage: userMessage,
      value: value,
      config: { ...existingConfig, selectedCategory: selectedValue },
      options: uomOptions,
    }
  }
  
  // Handle positivity selection
  if (configKey === 'positivity') {
    const config = { ...existingConfig, score: selectedValue }
    return startTrackerConfiguration(trackerName, userMessage, value, config)
  }
  
  // Handle focus selection - this is multi-select, so we need to toggle
  if (configKey === 'focus') {
    const config = { ...existingConfig }
    if (!config.focus) {
      config.focus = []
    }
    
    if (selectedValue === '__skip__') {
      // Skip focus selection
      config.focus = []
      return startTrackerConfiguration(trackerName, userMessage, value, config)
    }
    
    if (selectedValue === '__done__') {
      // Done selecting, continue with flow
      return startTrackerConfiguration(trackerName, userMessage, value, config)
    }
    
    // Toggle the focus value
    const currentFocus = config.focus || []
    const focusIndex = currentFocus.indexOf(selectedValue as 'mind' | 'body' | 'spirit')
    if (focusIndex > -1) {
      // Remove if already selected
      config.focus = currentFocus.filter(f => f !== selectedValue)
    } else {
      // Add if not selected
      config.focus = [...currentFocus, selectedValue as 'mind' | 'body' | 'spirit']
    }
    
    // Continue with the same question to allow multiple selections
    // But provide a "Done" option
    const focusOptions = focusTypes.map((focus) => ({
      label: `${focus.emoji} ${focus.label}${config.focus?.includes(focus.id) ? ' ✓' : ''}`,
      value: focus.id,
    }))
    focusOptions.push({ label: 'Skip (None)', value: '__skip__' })
    focusOptions.push({ label: 'Done (Continue)', value: '__done__' })
    
    return {
      answer: `Does "${trackerName}" affect your mind, body, or spirit? (You can select multiple, then click "Done")`,
      action: 'needs_focus',
      trackerName: trackerName,
      trackerTag: toTag(trackerName),
      originalMessage: userMessage,
      value: value,
      config: config,
      options: focusOptions,
    }
  }
  
  // Handle "Also Include" selection
  if (configKey === 'also_include') {
    const config = { ...existingConfig } as any
    
    if (selectedValue === '__skip__') {
      // Skip "Also Include" - set to empty string so we don't ask again
      delete config.__waiting_for_include
      config.include = '' // Use empty string instead of undefined to indicate "skipped"
      return startTrackerConfiguration(trackerName, userMessage, value, config)
    } else if (selectedValue === '__yes__') {
      // User wants to add "Also Include" - mark that we're waiting for content
      config.__waiting_for_include = true
      return startTrackerConfiguration(trackerName, userMessage, value, config)
    } else {
      // User provided the include content
      config.include = selectedValue
      delete config.__waiting_for_include
      return startTrackerConfiguration(trackerName, userMessage, value, config)
    }
  }
  
  // Handle UOM selection (when selecting from needs_uom action)
  if (configKey === 'uom') {
    // Check if it's a quick select (from category view)
    if (selectedValue.startsWith('__quick__')) {
      const uomKey = selectedValue.replace('__quick__', '')
      const config = { ...existingConfig, uom: uomKey }
      return startTrackerConfiguration(trackerName, userMessage, value, config)
    }
    
    // Check if it's a divider (shouldn't happen, but handle it)
    if (selectedValue === '__divider__') {
      return startTrackerConfiguration(trackerName, userMessage, value, existingConfig)
    }
    
    // Check if it's a category name (not a valid UOM key) - treat it as category selection
    if (!UOMS[selectedValue]) {
      // Check if it's a known category
      const groupedUOM = UOM.toGroupedArray()
      if (groupedUOM[selectedValue]) {
        // It's a category, show UOMs from that category (same logic as uom_category handler)
        const categoryUOMs = groupedUOM[selectedValue]
        const uomOptions: Array<{ label: string; value: string }> = []
        
        // Get default UOM for this category to show as quick-select
        const defaultUOM = getDefaultUOMForCategory(selectedValue)
        let hasDefaultUOM = false
        
        if (Array.isArray(categoryUOMs)) {
          categoryUOMs.forEach((uom: any) => {
            const uomKey = uom.key || Object.keys(UOMS).find(k => {
              const uomObj = UOMS[k]
              return uomObj && uomObj.type === selectedValue && uomObj.plural === uom.plural
            })
            
            if (uomKey && UOMS[uomKey]) {
              const uomObj = UOMS[uomKey]
              const symbol = uomObj.symbol || ''
              const displayName = `${UOM.plural(uomKey)}${symbol ? ` (${symbol})` : ''}`
              
              // If this is the default UOM for the category, mark it and we'll add it as quick-select first
              if (defaultUOM && uomKey === defaultUOM) {
                hasDefaultUOM = true
              } else {
                uomOptions.push({
                  label: displayName,
                  value: uomKey,
                })
              }
            }
          })
        }
        
        // If no UOMs found, iterate through all UOMS and filter by type
        if (uomOptions.length === 0 && !hasDefaultUOM) {
          Object.keys(UOMS).forEach((uomKey) => {
            const uomObj = UOMS[uomKey]
            if (uomObj && uomObj.type === selectedValue) {
              const symbol = uomObj.symbol || ''
              const displayName = `${UOM.plural(uomKey)}${symbol ? ` (${symbol})` : ''}`
              
              // If this is the default UOM for the category, mark it and we'll add it as quick-select first
              if (defaultUOM && uomKey === defaultUOM) {
                hasDefaultUOM = true
              } else {
                uomOptions.push({
                  label: displayName,
                  value: uomKey,
                })
              }
            }
          })
        }
        
        // Add default UOM as quick-select option at the beginning if it exists
        if (hasDefaultUOM && defaultUOM && UOMS[defaultUOM]) {
          const defaultUOMObj = UOMS[defaultUOM]
          const symbol = defaultUOMObj.symbol || ''
          uomOptions.unshift({
            label: `${UOM.plural(defaultUOM)}${symbol ? ` (${symbol})` : ''} - Quick Select`,
            value: `__quick__${defaultUOM}`,
          })
          uomOptions.unshift({
            label: '---',
            value: '__divider__',
          })
        }
        
        const categoryLabels: { [key: string]: string } = {
          'general': 'General',
          'currency': 'Currency',
          'time': 'Time',
          'distance': 'Distance',
          'temperature': 'Temperature',
          'weight': 'Weight',
          'volume': 'Volume',
          'health': 'Health',
        }
        const categoryLabel = categoryLabels[selectedValue] || selectedValue.charAt(0).toUpperCase() + selectedValue.slice(1)
        return {
          answer: `Select a ${categoryLabel.toLowerCase()} unit:`,
          action: 'needs_uom',
          trackerName: trackerName,
          trackerTag: toTag(trackerName),
          originalMessage: userMessage,
          value: value,
          config: { ...existingConfig, selectedCategory: selectedValue },
          options: uomOptions,
        }
      }
    }
    
    // Regular UOM selection
    const config = { ...existingConfig, uom: selectedValue }
    return startTrackerConfiguration(trackerName, userMessage, value, config)
  }
  
  // Handle other config selections
  const config = { ...existingConfig }
  if (configKey !== 'uom_category') {
    config[configKey] = selectedValue
  }
  return startTrackerConfiguration(trackerName, userMessage, value, config)
}

/**
 * Create tracker if user confirms (legacy - now starts configuration flow)
 */
export async function createTrackerAndEntry(trackerName: string, userMessage?: string, value?: number): Promise<AIQueryResponse> {
  return startTrackerConfiguration(trackerName, userMessage, value)
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
    
    // Check intent first
    const intent = detectIntent(question, data.trackers)
    
    // If it's an entry creation intent, handle it
    if (intent.type === 'add_entry') {
      return await handleEntryCreation(question, intent.trackerName, intent.value)
    }
    
    // Otherwise, proceed with question answering
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

    // Check if question is about time intervals (needed for determining which trackers to show details for)
    const isIntervalQuestion = /average.*time.*between|time.*between|how.*often|how.*long.*between/i.test(question)
    
    // Build context for AI - limit size to avoid timeout
    const trackerList = data.trackers.slice(0, 30).map((t) => `- ${t.tag} (${t.label}) - Type: ${t.type}`).join('\n')
    const contextList = data.contexts.slice(0, 20).map((c) => `- ${c.tag} (${c.label})`).join('\n')
    
    // Build usage summary with period information and interval data
    // Prioritize interval data for trackers when available
    const usageSummary = Object.keys(data.usageData)
      .slice(0, 20)
      .map((tag) => {
        const usage = data.usageData[tag]
        let summary = `${usage.tag} (${usage.label}): ${usage.count} entries`
        
        // PRIORITIZE interval information - this uses actual timestamps and is what you need for "time between" questions
        if (usage.averageInterval) {
          summary += ` [AVERAGE TIME BETWEEN ENTRIES: ${usage.averageInterval} - calculated from actual timestamps]`
        }
        
        // Period information is about consecutive days, NOT about time between individual entries
        if (usage.periods && usage.periods.length > 0) {
          let periodInfo = `, Period info (consecutive days): ${usage.periodCount} period(s)`
          
          // Note if context duration was applied
          if (usage.contextDuration && usage.contextDuration > 1) {
            periodInfo += ` [context duration: ${usage.contextDuration} days - periods expanded accordingly]`
          }
          
          if (usage.lastPeriod) {
            // Make it very clear what the dates mean - the end date is already calculated correctly
            const startDate = formatDateForAI(usage.lastPeriod.start)
            const endDate = formatDateForAI(usage.lastPeriod.end)
            const duration = usage.lastPeriod.duration
            periodInfo += `, last period: from ${startDate} to ${endDate} (${duration} day${duration !== 1 ? 's' : ''} total)`
            if (usage.contextDuration && usage.contextDuration > 1) {
              periodInfo += ` [Note: This period was calculated from a log entry on ${startDate} with a ${usage.contextDuration}-day duration, so it extends through ${endDate}]`
            }
          }
          if (usage.longestPeriod && usage.longestPeriod.duration > 0) {
            periodInfo += `, longest: ${usage.longestPeriod.duration} days`
          }
          
          summary += periodInfo
        } else if (usage.count > 0 && !usage.averageInterval) {
          summary += `, avg: ${usage.average.toFixed(2)}`
        }
        
        // Note context duration even if no periods detected yet
        if (usage.contextDuration && usage.contextDuration > 1 && (!usage.periods || usage.periods.length === 0)) {
          summary += ` [context duration: ${usage.contextDuration} days - each entry expands to ${usage.contextDuration} days]`
        }
        
        return summary
      })
      .join('\n')
    
    // Build detailed entry list for trackers mentioned in the question
    // For interval questions, always show detailed entries for relevant trackers
    let detailedTrackerEntries = ''
    const trackersToShow = parsed.trackers && parsed.trackers.length > 0 
      ? parsed.trackers 
      : (isIntervalQuestion 
          ? Object.keys(data.usageData).filter(tag => {
              const usage = data.usageData[tag]
              return usage && usage.entries && usage.entries.length > 1
            })
          : [])
    
    if (trackersToShow.length > 0) {
      const detailedEntries = trackersToShow
        .map((trackerTag: string) => {
          // Handle tag format - might be with or without #
          const normalizedTag = trackerTag.startsWith('#') ? trackerTag.slice(1) : trackerTag
          const usage = data.usageData[normalizedTag] || data.usageData[`#${normalizedTag}`] || data.usageData[trackerTag]
          
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
            const summaryLine = usage.averageInterval 
              ? `\n⭐ AVERAGE TIME BETWEEN ENTRIES: ${usage.averageInterval} (calculated from ${usage.entries.length} entries with actual timestamps)`
              : `\n(${usage.entries.length} entries)`
            return `📊 Detailed entries for ${usage.tag} (${usage.label}):\n${entriesList}${summaryLine}`
          }
          return null
        })
        .filter((x: string | null) => x !== null)
        .join('\n\n')
      
      if (detailedEntries) {
        detailedTrackerEntries = '\n\n' + '='.repeat(60) + '\n📋 DETAILED ENTRY TIMESTAMPS (for time interval calculations):\n' + '='.repeat(60) + '\n' + detailedEntries
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

    const today = dayjs()
    const todayFormatted = formatDateForAI(today)
    
    const context = `You are an AI assistant analyzing personal tracking data from Nomie.

TODAY'S DATE: ${todayFormatted} (${today.format('YYYY-MM-DD')})

Available Trackers (${data.trackers.length} total):
${trackerList}

Available Contexts (${data.contexts.length} total):
${contextList || 'None'}

Date Range: ${formatDateForAI(data.dateRange.start)} to ${formatDateForAI(data.dateRange.end)}

Usage Summary:
${usageSummary}${detailedTrackerEntries}

Recent Logs:
${recentLogs}

User Question: ${question}

CRITICAL INSTRUCTIONS:
${isIntervalQuestion ? `
⚠️ THIS IS A QUESTION ABOUT TIME BETWEEN ENTRIES ⚠️
- DO NOT use "period" information - periods show consecutive days, NOT time between individual entries
- DO use the "[AVERAGE TIME BETWEEN ENTRIES: ...]" data shown in the usage summary - this uses actual timestamps
- DO use the "Detailed Entry Timestamps" section above if available - it shows exact times and intervals between entries
- The average time between entries is calculated from actual entry timestamps, not from day counts
` : `
- If asking about periods (like "when was my last bulk"), use the period information from the usage summary.
- Period information shows consecutive days where something was tracked, NOT time between individual entries.
`}
- If asking about "average time between" entries (e.g., "average time between pees"), you MUST use the "[AVERAGE TIME BETWEEN ENTRIES: ...]" field which is calculated from actual timestamps.
- All entries have timestamps with exact times (hours and minutes) - use these for precise calculations.
- Contexts are marked with + prefix (e.g., +bulk) and are designed for tracking periods/situations.
- Contexts can have a duration setting (e.g., 30 days). When a context has a duration, each log entry is expanded to cover that many days. For example, if +bulk has a 30-day duration and was logged on Jan 1st, it covers Jan 1-30. Period detection accounts for this expansion.
- ⚠️ CRITICAL: When period info shows "last period: from [START DATE] to [END DATE] (X days total)", the END DATE is ALREADY CALCULATED and CORRECT. DO NOT recalculate or reinterpret it. The period information already accounts for the duration expansion. If you see "from Jan 8 to Feb 6 (30 days total)", that means the period runs from Jan 8 through Feb 6 - the end date is already correct, don't say it ends on Jan 8 or any other date. Use the END DATE shown in the period info as-is.
- When the usage summary shows "[AVERAGE TIME BETWEEN ENTRIES: X]", that is the actual calculated average based on timestamps, use that value directly.

⚠️ CRITICAL: USE CORRECT TENSE BASED ON DATES ⚠️
- Compare ALL dates to TODAY'S DATE (${todayFormatted} / ${today.format('YYYY-MM-DD')}) when writing your response.
- If a date is BEFORE today: use PAST TENSE (e.g., "ended", "was", "started", "lasted")
- If a date is TODAY: use PRESENT TENSE (e.g., "ends", "is", "starts", "lasts")
- If a date is AFTER today: use FUTURE TENSE (e.g., "will end", "will be", "will start", "will last")
- Examples:
  * If a period ends on Feb 6, 2026 and today is Jan 15, 2026: say "will end on" or "ends on" (future)
  * If a period ended on Dec 1, 2025 and today is Jan 15, 2026: say "ended on" (past)
  * If a period ends today: say "ends today" (present)
- Always check the date against TODAY before choosing your tense!

⚠️ STYLE: BE CONCISE AND DIRECT ⚠️
- Provide direct answers without explaining your reasoning process
- Do NOT include meta-commentary like "Since this period includes today...", "We will use future tense...", etc.
- Just state the facts directly: "The blast phase ends on February 6, 2026" (not "Since this period includes today and extends beyond it, we will use future tense. The blast phase ends on...")
- Answer the question directly and concisely without explaining how you arrived at the answer.`

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

