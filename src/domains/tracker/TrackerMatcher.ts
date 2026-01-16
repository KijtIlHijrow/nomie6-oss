import TrackerClass from '../../modules/tracker/TrackerClass'

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of edits needed to transform one string into another
 */
export function calculateStringDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  const matrix: number[][] = []

  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[s2.length][s1.length]
}

/**
 * Common nutrition/tracker abbreviations
 */
const ABBREVIATION_PATTERNS: Record<string, string[]> = {
  'carbohydrates': ['carbs', 'carb'],
  'protein': ['proteins'],
  'fat': ['fats'],
  'calories': ['calorie', 'cals', 'cal'],
  'fiber': ['fibre'],
  'sodium': ['salt'],
  'cholesterol': ['chol'],
}

/**
 * Check if one string is a known abbreviation of another
 */
function isKnownAbbreviation(short: string, long: string): boolean {
  const shortLower = short.toLowerCase()
  const longLower = long.toLowerCase()

  // Check direct match
  if (ABBREVIATION_PATTERNS[longLower]?.includes(shortLower)) {
    return true
  }

  // Check reverse (user typed long form, tracker is short)
  if (ABBREVIATION_PATTERNS[shortLower]?.includes(longLower)) {
    return true
  }

  return false
}

/**
 * Check if strings are plural variations of each other
 */
function isPluralVariation(str1: string, str2: string): boolean {
  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  return (s1 + 's' === s2) || (s2 + 's' === s1)
}

export interface MatchReason {
  type: 'abbreviation' | 'plural' | 'similar_spelling' | 'semantic'
  description: string
}

/**
 * Calculate confidence score (0-1) and reason for potential match
 */
export function calculateConfidence(
  input: string,
  trackerLabel: string
): { confidence: number; reason: MatchReason } {
  const inputLower = input.toLowerCase().trim()
  const labelLower = trackerLabel.toLowerCase().trim()

  // Exact match
  if (inputLower === labelLower) {
    return {
      confidence: 1.0,
      reason: { type: 'similar_spelling', description: 'Exact match' }
    }
  }

  // Known abbreviation
  if (isKnownAbbreviation(inputLower, labelLower)) {
    return {
      confidence: 0.95,
      reason: { type: 'abbreviation', description: 'Common abbreviation' }
    }
  }

  // Plural variation
  if (isPluralVariation(inputLower, labelLower)) {
    return {
      confidence: 0.9,
      reason: { type: 'plural', description: 'Plural variation' }
    }
  }

  // String similarity
  const distance = calculateStringDistance(inputLower, labelLower)
  const maxLength = Math.max(inputLower.length, labelLower.length)
  const normalizedDistance = 1 - (distance / maxLength)

  // Only consider matches with normalized distance > 0.5
  if (normalizedDistance > 0.5) {
    return {
      confidence: normalizedDistance,
      reason: { type: 'similar_spelling', description: 'Similar spelling' }
    }
  }

  return { confidence: 0, reason: { type: 'similar_spelling', description: 'No match' } }
}

export interface MatchResult {
  tracker: TrackerClass
  confidence: number
  reason: MatchReason
}

/**
 * Find similar trackers from existing tracker list
 * Returns matches above confidence threshold, sorted by confidence
 */
export function findSimilarTrackers(
  input: string,
  existingTrackers: TrackerClass[],
  minConfidence: number = 0.6
): MatchResult[] {
  const results: MatchResult[] = []

  for (const tracker of existingTrackers) {
    const { confidence, reason } = calculateConfidence(input, tracker.label || tracker.tag)

    if (confidence >= minConfidence) {
      results.push({ tracker, confidence, reason })
    }
  }

  // Sort by confidence descending
  return results.sort((a, b) => b.confidence - a.confidence)
}
