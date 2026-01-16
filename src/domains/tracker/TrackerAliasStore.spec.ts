import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get } from 'svelte/store'

// Mock Storage before importing TrackerAliasStore
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
const { TrackerAliasStore, createMapping, findMappingByAlias, incrementUsage } = await import('./TrackerAliasStore')

describe('TrackerAliasStore', () => {
  beforeEach(async () => {
    await TrackerAliasStore.clear()
  })

  it('should initialize as empty store', async () => {
    await TrackerAliasStore.init()
    const state = get(TrackerAliasStore)
    expect(Object.keys(state).length).toBe(0)
  })

  it('should create and retrieve mapping', async () => {
    await TrackerAliasStore.init()
    const mapping = await createMapping('#carbohydrates', 'carbs', 0.95, true)

    const found = await findMappingByAlias('carbs')
    expect(found).not.toBeNull()
    expect(found?.canonical).toBe('#carbohydrates')
    expect(found?.confidence).toBe(0.95)
  })

  it('should increment usage count', async () => {
    await TrackerAliasStore.init()
    const mapping = await createMapping('#carbohydrates', 'carbs', 0.95, true)

    await incrementUsage(mapping.id)
    const found = await findMappingByAlias('carbs')
    expect(found?.usageCount).toBe(1)
  })

  it('should handle case-insensitive alias lookup', async () => {
    await TrackerAliasStore.init()
    await createMapping('#carbohydrates', 'CARBS', 0.95, true)

    const found = await findMappingByAlias('carbs')
    expect(found).not.toBeNull()
  })

  it('should handle lookup without explicit init call', async () => {
    await TrackerAliasStore.clear()
    await createMapping('#carbohydrates', 'carbs', 0.95, true)

    // Simulate lookup on fresh store (reinit needed)
    const found = await findMappingByAlias('carbs')
    expect(found).not.toBeNull()
  })
})
