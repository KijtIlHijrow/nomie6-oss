import { describe, it, expect } from 'vitest'
import {
  calculateStringDistance,
  calculateConfidence,
  findSimilarTrackers,
  type MatchResult
} from './TrackerMatcher'
import TrackerClass from '../../modules/tracker/TrackerClass'

describe('TrackerMatcher - String Distance', () => {
  it('should calculate Levenshtein distance', () => {
    expect(calculateStringDistance('carbs', 'carbohydrates')).toBeGreaterThan(0)
    expect(calculateStringDistance('fat', 'fats')).toBe(1)
    expect(calculateStringDistance('protein', 'protein')).toBe(0)
  })
})

describe('TrackerMatcher - Confidence Scoring', () => {
  it('should give high confidence to exact abbreviations', () => {
    const result = calculateConfidence('carbs', 'carbohydrates')
    expect(result.confidence).toBeGreaterThan(0.8)
  })

  it('should give high confidence to plural variations', () => {
    const result = calculateConfidence('fat', 'fats')
    expect(result.confidence).toBeGreaterThan(0.9)
  })
})

describe('TrackerMatcher - Find Similar Trackers', () => {
  it('should find exact abbreviation matches', () => {
    const trackers = [
      new TrackerClass({ tag: 'carbohydrates', label: 'Carbohydrates' }),
      new TrackerClass({ tag: 'protein', label: 'Protein' }),
    ]

    const matches = findSimilarTrackers('carbs', trackers)
    expect(matches.length).toBe(1)
    expect(matches[0].tracker.tag).toBe('carbohydrates')
    expect(matches[0].confidence).toBeGreaterThan(0.8)
  })

  it('should sort results by confidence', () => {
    const trackers = [
      new TrackerClass({ tag: 'fat', label: 'Fat' }),
      new TrackerClass({ tag: 'fats', label: 'Fats' }),
      new TrackerClass({ tag: 'fatty_acids', label: 'Fatty Acids' }),
    ]

    const matches = findSimilarTrackers('fat', trackers)
    expect(matches[0].tracker.tag).toBe('fat') // exact match
    expect(matches[0].confidence).toBe(1.0)
  })

  it('should respect minimum confidence threshold', () => {
    const trackers = [
      new TrackerClass({ tag: 'completely_different', label: 'Completely Different' }),
    ]

    const matches = findSimilarTrackers('carbs', trackers, 0.6)
    expect(matches.length).toBe(0)
  })
})
