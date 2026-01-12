import dayjs, { type Dayjs } from 'dayjs'
import type { IntentDetectionResult } from './ai-query-service'
import UOMS from '../uom/uom.config'

/**
 * AI Query Helpers
 *
 * This module provides AI-powered parsing functions that enhance the deterministic
 * AI query system with intelligent fallbacks. All functions follow the pattern:
 * 1. Try deterministic methods first (regex, pattern matching)
 * 2. Use AI only when deterministic methods fail or return low confidence
 * 3. Graceful degradation if AI is unavailable
 */

// Constants
const OLLAMA_ENDPOINT = 'http://127.0.0.1:11434/api/generate'
const DEFAULT_MODEL = 'mistral'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Timeouts per feature (shorter than default 60s for better UX)
export const AI_TIMEOUTS = {
  intentDetection: 5000,      // 5s - quick decision needed
  trackerConfig: 8000,        // 8s - user is filling form, less urgent
  timeRange: 5000,            // 5s - part of query processing
  valueExtraction: 5000,      // 5s - user waiting for response
}

// Confidence thresholds for using AI results
export const CONFIDENCE_THRESHOLDS = {
  intentDetection: 0.7,       // High threshold for action decisions
  trackerConfig: 0.8,         // Auto-apply only when very confident
  valueExtraction: 0.5,       // Lower - user sees value and can correct
}

// Cache for AI parsing results
const aiParseCache = new Map<string, { result: any; timestamp: number }>()

/**
 * Get cached result if available and not expired
 */
function getCached<T>(key: string): T | null {
  const cached = aiParseCache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result as T
  }
  if (cached) {
    aiParseCache.delete(key) // Expired, remove it
  }
  return null
}

/**
 * Cache a result with current timestamp
 */
function setCache(key: string, result: any): void {
  aiParseCache.set(key, { result, timestamp: Date.now() })
}

/**
 * Clear all cached AI parsing results
 * Call this when trackers are created/deleted to invalidate cache
 */
export function invalidateAICache(): void {
  aiParseCache.clear()
}

/**
 * Core Ollama API wrapper
 * Copied from ai-query-service.ts to avoid circular imports
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
 * Query Ollama and parse JSON response with retry logic
 *
 * This wrapper enhances queryOllama by:
 * - Requesting structured JSON output
 * - Extracting JSON from response (handles AI adding extra text)
 * - Retrying on parse failures
 * - Type-safe response handling
 */
export async function queryOllamaJSON<T = any>(
  prompt: string,
  schema: { [key: string]: string },
  options: {
    model?: string
    timeout?: number
    maxRetries?: number
  } = {}
): Promise<{ data: T | null; raw: string; error?: string }> {
  const { model = DEFAULT_MODEL, timeout = 10000, maxRetries = 2 } = options

  // Enhance prompt with JSON schema requirements
  const enhancedPrompt = `${prompt}

CRITICAL: Respond with ONLY valid JSON matching this schema:
${JSON.stringify(schema, null, 2)}

Do not include any explanatory text before or after the JSON.
Do not wrap the JSON in markdown code blocks.`

  let lastError: string | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const raw = await queryOllama(enhancedPrompt, model, timeout)

      // Extract JSON from response (handles cases where AI adds extra text or markdown)
      let jsonText = raw.trim()

      // Remove markdown code blocks if present
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1]
      }

      // Find JSON object in text
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        lastError = 'No JSON object found in response'
        if (attempt < maxRetries - 1) continue
        return { data: null, raw, error: lastError }
      }

      const data = JSON.parse(jsonMatch[0]) as T
      return { data, raw }

    } catch (error: any) {
      lastError = error.message
      if (attempt < maxRetries - 1) {
        // Retry with more explicit instructions
        continue
      }
    }
  }

  return { data: null, raw: '', error: lastError }
}

/**
 * Feature 1: Smart Intent Fallback
 *
 * Uses AI to classify user intent when regex patterns fail.
 * Returns structured intent with confidence score.
 */
export async function parseIntentWithAI(
  message: string,
  availableTrackers: Array<{ tag: string; label: string }>
): Promise<IntentDetectionResult & { confidence: number } | null> {
  const cacheKey = `intent:${message}:${availableTrackers.map(t => t.tag).sort().join(',').substring(0, 20)}`
  const cached = getCached<IntentDetectionResult & { confidence: number }>(cacheKey)
  if (cached) return cached

  const trackerList = availableTrackers.slice(0, 30).map(t => t.tag).join(', ')

  const prompt = `Classify the user's intent from their message.

Available trackers: ${trackerList}

User message: "${message}"

Respond with ONLY valid JSON in this exact format:
{
  "intent": "add_entry" | "delete_entry" | "question",
  "trackerName": "tracker_name or null",
  "value": number or null,
  "confidence": 0.0 to 1.0
}

Rules:
- "add_entry": user wants to log/track something (words like track, log, add, record, I did, I had)
- "delete_entry": user wants to remove/undo an entry (words like remove, delete, undo, erase)
- "question": user is asking about their data (words like how, what, when, where, why, which)
- Use exact tracker names from the available list (case-insensitive matching)
- Extract numeric values if mentioned (e.g., "logged 5 water" → value: 5)
- confidence < 0.7 means uncertain - use lower confidence if ambiguous`

  const schema = {
    intent: 'string (add_entry | delete_entry | question)',
    trackerName: 'string or null',
    value: 'number or null',
    confidence: 'number (0.0 to 1.0)'
  }

  const result = await queryOllamaJSON<{
    intent: 'add_entry' | 'delete_entry' | 'question'
    trackerName: string | null
    value: number | null
    confidence: number
  }>(
    prompt,
    schema,
    { timeout: AI_TIMEOUTS.intentDetection }
  )

  if (result.data) {
    // Convert AI response format to IntentDetectionResult format
    const intentData: IntentDetectionResult & { confidence: number } = {
      type: result.data.intent as 'add_entry' | 'delete_entry' | 'question',
      trackerName: result.data.trackerName || undefined,
      value: result.data.value || undefined,
      confidence: result.data.confidence
    }
    setCache(cacheKey, intentData)
    return intentData
  }

  return null
}

/**
 * Feature 2: AI-Powered Tracker Configuration
 *
 * Suggests tracker configuration (type, UOM, math) based on tracker name and context.
 * Returns null if confidence is too low.
 */
export async function suggestTrackerConfigWithAI(
  trackerName: string,
  userMessage?: string
): Promise<{
  type: 'tick' | 'value' | 'range' | 'picker' | 'note'
  uom?: string
  math?: 'sum' | 'mean'
  reasoning?: string
  confidence: number
} | null> {
  const cacheKey = `config:${trackerName}:${userMessage || ''}`
  const cached = getCached<any>(cacheKey)
  if (cached) return cached

  const availableUOMs = Object.keys(UOMS).join(', ')

  const prompt = `Suggest tracker configuration based on the tracker name and context.

Tracker Name: "${trackerName}"
User Message: "${userMessage || 'N/A'}"

Available UOMs: ${availableUOMs}

Respond with ONLY valid JSON:
{
  "type": "tick" | "value" | "range" | "picker" | "note",
  "uom": "uom_key or null",
  "math": "sum" | "mean" | null,
  "reasoning": "brief explanation",
  "confidence": 0.0 to 1.0
}

Examples:
- "Water" → {"type": "value", "uom": "liter", "math": "sum", "reasoning": "Water is measured in volume", "confidence": 0.95}
- "Mood" → {"type": "range", "uom": null, "math": null, "reasoning": "Mood is subjective scale", "confidence": 0.9}
- "Meditation" → {"type": "tick", "uom": null, "math": null, "reasoning": "Meditation is yes/no activity", "confidence": 0.85}
- "Exercise" → {"type": "value", "uom": "minute", "math": "sum", "reasoning": "Exercise duration tracked", "confidence": 0.9}
- "Coffee" → {"type": "value", "uom": "num", "math": "sum", "reasoning": "Count cups of coffee", "confidence": 0.9}

Rules:
- Use "value" for measurable quantities (water, exercise, coffee, sleep)
- Use "tick" for yes/no behaviors (meditation, workout, vitamins)
- Use "range" for subjective scales (mood, energy, pain, stress)
- Use "note" for text entries (journal, thoughts)
- Pick the most specific UOM that makes sense
- Use "sum" math for cumulative values, "mean" for averages
- confidence < 0.8 means uncertain - be conservative`

  const schema = {
    type: 'string (tick | value | range | picker | note)',
    uom: 'string or null',
    math: 'string (sum | mean) or null',
    reasoning: 'string',
    confidence: 'number (0.0 to 1.0)'
  }

  const result = await queryOllamaJSON<any>(
    prompt,
    schema,
    { timeout: AI_TIMEOUTS.trackerConfig }
  )

  if (result.data) {
    setCache(cacheKey, result.data)
    return result.data
  }

  return null
}

/**
 * Feature 3: Natural Time Parsing
 *
 * Parses natural language time expressions into date ranges.
 * Examples: "last week", "past 3 days", "yesterday morning"
 */
export async function parseTimeRangeWithAI(
  timeExpression: string,
  referenceDate: Dayjs = dayjs()
): Promise<{
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  startTime?: string // HH:mm
  endTime?: string   // HH:mm
  label: string
} | null> {
  const cacheKey = `time:${timeExpression}:${referenceDate.format('YYYY-MM-DD')}`
  const cached = getCached<any>(cacheKey)
  if (cached) return cached

  const currentDate = referenceDate.format('YYYY-MM-DD')
  const currentTime = referenceDate.format('HH:mm')
  const currentDay = referenceDate.format('dddd')

  const prompt = `Parse the time expression into a date range.

Current date: ${currentDate}
Current time: ${currentTime}
Current day of week: ${currentDay}

Time expression: "${timeExpression}"

Respond with ONLY valid JSON:
{
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "startTime": "HH:mm or null",
  "endTime": "HH:mm or null",
  "label": "human readable description"
}

Examples:
- "last week" → {"startDate": "2026-01-05", "endDate": "2026-01-11", "startTime": null, "endTime": null, "label": "Last Week"}
- "past 3 days" → {"startDate": "2026-01-09", "endDate": "2026-01-12", "startTime": null, "endTime": null, "label": "Past 3 Days"}
- "yesterday morning" → {"startDate": "2026-01-11", "endDate": "2026-01-11", "startTime": "06:00", "endTime": "12:00", "label": "Yesterday Morning"}
- "this month" → {"startDate": "2026-01-01", "endDate": "2026-01-31", "startTime": null, "endTime": null, "label": "This Month"}

Rules:
- Week starts on Sunday (use this for "last week", "this week")
- "last X" means the previous complete period (last week = previous Sun-Sat)
- "past X" means from X ago until now (past 3 days = 3 days ago to today)
- "this X" means current period (this week = current Sun-Sat)
- Default to full days (00:00 to 23:59) unless time is specifically mentioned
- Morning = 06:00-12:00, Afternoon = 12:00-18:00, Evening = 18:00-22:00, Night = 22:00-06:00`

  const schema = {
    startDate: 'string (YYYY-MM-DD)',
    endDate: 'string (YYYY-MM-DD)',
    startTime: 'string (HH:mm) or null',
    endTime: 'string (HH:mm) or null',
    label: 'string'
  }

  const result = await queryOllamaJSON<any>(
    prompt,
    schema,
    { timeout: AI_TIMEOUTS.timeRange }
  )

  if (result.data) {
    // Validate date ranges
    const start = dayjs(result.data.startDate)
    const end = dayjs(result.data.endDate)
    const daysDiff = end.diff(start, 'day')

    if (daysDiff < 0 || daysDiff > 365) {
      console.warn('AI returned invalid date range, rejecting:', result.data)
      return null
    }

    setCache(cacheKey, result.data)
    return result.data
  }

  return null
}

/**
 * Feature 4: Value Extraction with AI Fallback
 *
 * Extracts numeric values from fuzzy quantities like "a bunch", "a lot", "some".
 * Returns null if no quantity is mentioned or confidence is too low.
 */
export async function extractValueWithAI(
  message: string,
  trackerName: string,
  trackerUOM?: string
): Promise<{
  value: number
  reasoning?: string
  confidence: number
} | null> {
  const cacheKey = `value:${message}:${trackerName}:${trackerUOM || ''}`
  const cached = getCached<any>(cacheKey)
  if (cached) return cached

  const prompt = `Extract a numeric value from the user's message.

Tracker: "${trackerName}"
Unit: "${trackerUOM || 'count'}"
Message: "${message}"

Respond with ONLY valid JSON:
{
  "value": number or null,
  "reasoning": "brief explanation",
  "confidence": 0.0 to 1.0
}

Fuzzy quantity guidelines (be conservative):
- "a bunch" → 5-10 (context dependent)
- "a lot" → 10-20
- "some" → 3-5
- "a little" → 1-2
- "several" → 3-5
- "a few" → 2-3
- "a couple" → 2

Context matters - consider the tracker name and UOM:
- "bunch of water" (liters) → 1.5 (reasonable drink amount)
- "bunch of grapes" (count) → 10-15 (reasonable serving)
- "lot of coffee" (cups) → 3-4 (not excessive)
- "some exercise" (minutes) → 15-20 (short workout)

Rules:
- Return null if no quantity is mentioned at all
- Be conservative with estimates - better to underestimate
- Consider what's reasonable for the tracker type
- confidence < 0.5 means very uncertain - use lower confidence if ambiguous`

  const schema = {
    value: 'number or null',
    reasoning: 'string',
    confidence: 'number (0.0 to 1.0)'
  }

  const result = await queryOllamaJSON<any>(
    prompt,
    schema,
    { timeout: AI_TIMEOUTS.valueExtraction }
  )

  if (result.data && result.data.value !== null) {
    // Sanity check based on UOM
    const expectedRanges: { [key: string]: { min: number; max: number } } = {
      'liter': { min: 0.1, max: 10 },     // Reasonable drink amounts
      'ml': { min: 10, max: 5000 },       // Reasonable drink amounts in ml
      'gram': { min: 1, max: 2000 },      // Reasonable food portions
      'kg': { min: 0.1, max: 10 },        // Reasonable weights
      'minute': { min: 1, max: 300 },     // Reasonable activity duration
      'hour': { min: 0.1, max: 24 },      // Reasonable time tracking
      'num': { min: 1, max: 100 },        // General counts
    }

    const range = expectedRanges[trackerUOM || 'num'] || { min: 0, max: Infinity }
    if (result.data.value < range.min || result.data.value > range.max) {
      console.warn(`AI extracted value ${result.data.value} outside expected range for ${trackerUOM}, rejecting`)
      return null
    }

    setCache(cacheKey, result.data)
    return result.data
  }

  return null
}
