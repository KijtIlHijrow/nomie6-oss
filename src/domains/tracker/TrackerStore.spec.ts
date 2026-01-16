import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.matchMedia before imports
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock Storage before importing TrackerStore
// Use a simple in-memory store to persist data across get/put calls
const mockStorageData: Record<string, any> = {}

vi.mock('../storage/storage', () => {
  const mockStorage = {
    get: vi.fn((key: string) => Promise.resolve(mockStorageData[key] || null)),
    put: vi.fn((key: string, value: any) => {
      mockStorageData[key] = value
      return Promise.resolve({})
    }),
    delete: vi.fn((key: string) => {
      delete mockStorageData[key]
      return Promise.resolve({})
    }),
  }
  return { default: mockStorage }
})

// Now import after mocking
const { TrackerStore, getOrCreate } = await import('./TrackerStore')
const TrackerClass = (await import('../../modules/tracker/TrackerClass')).default
const { TrackerAliasStore, createMapping } = await import('./TrackerAliasStore')

describe('TrackerStore.getOrCreate', () => {
  beforeEach(async () => {
    await TrackerStore.clear()
    await TrackerAliasStore.clear()
  })

  it('should return existing tracker when alias mapping exists', async () => {
    // Create a tracker
    const tracker = new TrackerClass({ tag: 'carbohydrates', label: 'Carbohydrates' })
    await TrackerStore.upsert(tracker)

    // Create alias mapping
    await TrackerAliasStore.init()
    await createMapping('#carbohydrates', 'carbs', 0.95, true)

    // Try to create with alias
    const result = await getOrCreate('carbs', { label: 'Carbs' })

    expect(result.tracker.tag).toBe('carbohydrates')
    expect(result.usedExisting).toBe(true)
  })

  it('should find fuzzy matches and require confirmation', async () => {
    const tracker = new TrackerClass({ tag: 'carbohydrates', label: 'Carbohydrates' })
    await TrackerStore.upsert(tracker)

    const result = await getOrCreate('carbs', { label: 'Carbs' })

    expect(result.requiresConfirmation).toBe(true)
    expect(result.matches?.length).toBeGreaterThan(0)
    expect(result.matches?.[0].tracker.tag).toBe('carbohydrates')
  })

  it('should create new tracker when no matches found', async () => {
    const result = await getOrCreate('completely_new', { label: 'Completely New' })

    expect(result.usedExisting).toBe(false)
    expect(result.requiresConfirmation).toBe(false)
    expect(result.tracker.tag).toBe('completely_new')
  })

  it('should return existing tracker with exact tag match', async () => {
    const tracker = new TrackerClass({ tag: 'water', label: 'Water' })
    await TrackerStore.upsert(tracker)

    const result = await getOrCreate('water', { label: 'Water' })

    expect(result.tracker.tag).toBe('water')
    expect(result.usedExisting).toBe(true)
    expect(result.requiresConfirmation).toBe(false)
  })

  it('should normalize tag to lowercase and trim spaces', async () => {
    const tracker = new TrackerClass({ tag: 'protein', label: 'Protein' })
    await TrackerStore.upsert(tracker)

    const result = await getOrCreate('  PROTEIN  ', { label: 'Protein' })

    expect(result.tracker.tag).toBe('protein')
    expect(result.usedExisting).toBe(true)
  })

  it('should increment usage count when alias mapping is used', async () => {
    const tracker = new TrackerClass({ tag: 'calories', label: 'Calories' })
    await TrackerStore.upsert(tracker)

    await TrackerAliasStore.init()
    const mapping = await createMapping('#calories', 'cals', 0.95, true)

    const result = await getOrCreate('cals', { label: 'Cals' })

    expect(result.tracker.tag).toBe('calories')
    expect(result.usedExisting).toBe(true)

    // Verify usage was incremented
    const state = TrackerAliasStore.rawState()
    const updatedMapping = state[mapping.id]
    expect(updatedMapping.usageCount).toBe(1)
  })
})
