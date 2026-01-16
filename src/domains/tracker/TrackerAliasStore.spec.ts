import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get } from 'svelte/store'

// Mock Storage before importing TrackerAliasStore
vi.mock('../storage/storage', () => {
  const mockStorage = {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
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
})
