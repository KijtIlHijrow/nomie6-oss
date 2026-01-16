import { createKVStore } from '../../store/KVStore'
import NPaths from '../../paths'
import nid from '../../modules/nid/nid'

export interface TrackerAliasMapping {
  id: string
  canonical: string      // e.g., "#carbohydrates"
  alias: string          // e.g., "carbs"
  confidence: number     // 0-1 score
  userConfirmed: boolean
  createdAt: Date
  usageCount: number
}

const baseStore = createKVStore(NPaths.storage.trackerAliases(), {
  label: 'TrackerAliases',
  key: 'id',
  itemSerializer: (item: TrackerAliasMapping) => {
    return {
      ...item,
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt
    }
  },
  itemInitializer: (item: any) => {
    return {
      ...item,
      createdAt: item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt)
    }
  },
})

// Add clear method to the store
export const TrackerAliasStore = {
  ...baseStore,
  clear: async (): Promise<void> => {
    // Clear by setting to empty object, which will write empty state to storage
    baseStore.set({})
    // Import Storage dynamically to avoid circular dependency issues in tests
    const { default: Storage } = await import('../storage/storage')
    await Storage.delete(NPaths.storage.trackerAliases())
  }
}

export const createMapping = async (
  canonical: string,
  alias: string,
  confidence: number,
  userConfirmed: boolean = false
): Promise<TrackerAliasMapping> => {
  const mapping: TrackerAliasMapping = {
    id: nid(),
    canonical,
    alias: alias.toLowerCase(),
    confidence,
    userConfirmed,
    createdAt: new Date(),
    usageCount: 0
  }
  await TrackerAliasStore.upsert(mapping)
  return mapping
}

export const findMappingByAlias = async (alias: string): Promise<TrackerAliasMapping | null> => {
  const state = TrackerAliasStore.rawState()
  const mappings = Object.values(state) as TrackerAliasMapping[]
  return mappings.find(m => m.alias.toLowerCase() === alias.toLowerCase()) || null
}

export const incrementUsage = async (mappingId: string): Promise<void> => {
  await TrackerAliasStore.updateSync((state) => {
    if (state[mappingId]) {
      state[mappingId].usageCount++
    }
    return state
  })
}
