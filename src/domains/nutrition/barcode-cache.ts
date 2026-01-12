/**
 * Barcode Cache using IndexedDB
 *
 * Caches nutrition data locally for offline access and performance
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { CachedNutrition, NutritionData, NutritionContribution } from './nutrition-types'

const DB_NAME = 'nomie-nutrition-cache'
const DB_VERSION = 1
const STORE_PRODUCTS = 'products'
const STORE_CONTRIBUTIONS = 'contributions'

/**
 * Barcode cache manager
 */
export class BarcodeCache {
  private dbPromise: Promise<IDBPDatabase>

  constructor() {
    // Only initialize DB in browser environment
    if (typeof indexedDB !== 'undefined') {
      this.dbPromise = this.initDB()
    } else {
      // In test/SSR environment, use a dummy promise
      this.dbPromise = Promise.reject(new Error('IndexedDB not available'))
    }
  }

  /**
   * Initialize IndexedDB database
   */
  private async initDB(): Promise<IDBPDatabase> {
    return openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Products store: cached nutrition data
        if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
          const productStore = db.createObjectStore(STORE_PRODUCTS, {
            keyPath: 'barcode',
          })
          productStore.createIndex('cachedAt', 'cachedAt')
          productStore.createIndex('source', 'data.source')
        }

        // Contributions store: user-submitted nutrition data
        if (!db.objectStoreNames.contains(STORE_CONTRIBUTIONS)) {
          const contributionStore = db.createObjectStore(STORE_CONTRIBUTIONS, {
            keyPath: 'id',
            autoIncrement: true,
          })
          contributionStore.createIndex('synced', 'synced')
          contributionStore.createIndex('queuedAt', 'queuedAt')
          contributionStore.createIndex('barcode', 'data.barcode')
        }
      },
    })
  }

  /**
   * Get cached nutrition data for a barcode
   */
  async get(barcode: string): Promise<CachedNutrition | null> {
    if (typeof indexedDB === 'undefined') return null
    try {
      const db = await this.dbPromise
      const cached = await db.get(STORE_PRODUCTS, barcode)
      return cached || null
    } catch (error) {
      console.error('Failed to get from cache:', error)
      return null
    }
  }

  /**
   * Store nutrition data in cache
   */
  async set(barcode: string, data: NutritionData): Promise<void> {
    try {
      const db = await this.dbPromise
      const cached: CachedNutrition = {
        barcode,
        data,
        cachedAt: Date.now(),
      }
      await db.put(STORE_PRODUCTS, cached)
    } catch (error) {
      console.error('Failed to set cache:', error)
    }
  }

  /**
   * Check if cached data is expired
   */
  isExpired(cached: CachedNutrition, expiryMs: number): boolean {
    return Date.now() - cached.cachedAt > expiryMs
  }

  /**
   * Delete cached data for a barcode
   */
  async delete(barcode: string): Promise<void> {
    try {
      const db = await this.dbPromise
      await db.delete(STORE_PRODUCTS, barcode)
    } catch (error) {
      console.error('Failed to delete from cache:', error)
    }
  }

  /**
   * Clear all cached products
   */
  async clearAll(): Promise<void> {
    try {
      const db = await this.dbPromise
      await db.clear(STORE_PRODUCTS)
    } catch (error) {
      console.error('Failed to clear cache:', error)
    }
  }

  /**
   * Get all cached products (for debugging/stats)
   */
  async getAll(): Promise<CachedNutrition[]> {
    try {
      const db = await this.dbPromise
      return await db.getAll(STORE_PRODUCTS)
    } catch (error) {
      console.error('Failed to get all from cache:', error)
      return []
    }
  }

  /**
   * Get cache size (number of cached products)
   */
  async count(): Promise<number> {
    try {
      const db = await this.dbPromise
      return await db.count(STORE_PRODUCTS)
    } catch (error) {
      console.error('Failed to count cache:', error)
      return 0
    }
  }

  /**
   * Clean up expired cache entries
   */
  async cleanExpired(expiryMs: number): Promise<number> {
    try {
      const db = await this.dbPromise
      const all = await db.getAll(STORE_PRODUCTS)
      const now = Date.now()
      let cleaned = 0

      for (const cached of all) {
        if (now - cached.cachedAt > expiryMs) {
          await db.delete(STORE_PRODUCTS, cached.barcode)
          cleaned++
        }
      }

      return cleaned
    } catch (error) {
      console.error('Failed to clean cache:', error)
      return 0
    }
  }

  // ========== Contribution Queue Methods ==========

  /**
   * Queue a user contribution for later submission
   */
  async queueContribution(data: NutritionData): Promise<void> {
    try {
      const db = await this.dbPromise
      const contribution: Omit<NutritionContribution, 'id'> = {
        data,
        queuedAt: Date.now(),
        synced: false,
      }
      await db.add(STORE_CONTRIBUTIONS, contribution)
    } catch (error) {
      console.error('Failed to queue contribution:', error)
    }
  }

  /**
   * Get all pending (unsynced) contributions
   */
  async getPendingContributions(): Promise<NutritionContribution[]> {
    try {
      const db = await this.dbPromise
      const index = db.transaction(STORE_CONTRIBUTIONS).store.index('synced')
      return await index.getAll(false)
    } catch (error) {
      console.error('Failed to get pending contributions:', error)
      return []
    }
  }

  /**
   * Mark a contribution as synced
   */
  async markContributionSynced(id: number, success: boolean, error?: string): Promise<void> {
    try {
      const db = await this.dbPromise
      const contribution = await db.get(STORE_CONTRIBUTIONS, id)
      if (contribution) {
        contribution.synced = success
        contribution.syncedAt = Date.now()
        if (error) {
          contribution.error = error
        }
        await db.put(STORE_CONTRIBUTIONS, contribution)
      }
    } catch (error) {
      console.error('Failed to mark contribution as synced:', error)
    }
  }

  /**
   * Delete a contribution
   */
  async deleteContribution(id: number): Promise<void> {
    try {
      const db = await this.dbPromise
      await db.delete(STORE_CONTRIBUTIONS, id)
    } catch (error) {
      console.error('Failed to delete contribution:', error)
    }
  }

  /**
   * Get all contributions (for debugging/history)
   */
  async getAllContributions(): Promise<NutritionContribution[]> {
    try {
      const db = await this.dbPromise
      return await db.getAll(STORE_CONTRIBUTIONS)
    } catch (error) {
      console.error('Failed to get all contributions:', error)
      return []
    }
  }

  /**
   * Clear all synced contributions (cleanup)
   */
  async clearSyncedContributions(): Promise<number> {
    try {
      const db = await this.dbPromise
      const index = db.transaction(STORE_CONTRIBUTIONS, 'readwrite').store.index('synced')
      const synced = await index.getAll(true)

      for (const contribution of synced) {
        if (contribution.id !== undefined) {
          await db.delete(STORE_CONTRIBUTIONS, contribution.id)
        }
      }

      return synced.length
    } catch (error) {
      console.error('Failed to clear synced contributions:', error)
      return 0
    }
  }
}

// Export singleton instance (lazy-initialized to avoid IndexedDB errors in test/SSR environments)
let _barcodeCache: BarcodeCache | null = null
export const barcodeCache = {
  get instance(): BarcodeCache {
    if (!_barcodeCache) {
      _barcodeCache = new BarcodeCache()
    }
    return _barcodeCache
  },
  // Proxy methods for convenience
  get: (barcode: string) => barcodeCache.instance.get(barcode),
  set: (barcode: string, data: any) => barcodeCache.instance.set(barcode, data),
  delete: (barcode: string) => barcodeCache.instance.delete(barcode),
  clearAll: () => barcodeCache.instance.clearAll(),
  getAll: () => barcodeCache.instance.getAll(),
  count: () => barcodeCache.instance.count(),
  cleanExpired: (expiryMs: number) => barcodeCache.instance.cleanExpired(expiryMs),
  isExpired: (cached: any, expiryMs: number) => barcodeCache.instance.isExpired(cached, expiryMs),
  queueContribution: (data: any) => barcodeCache.instance.queueContribution(data),
  getPendingContributions: () => barcodeCache.instance.getPendingContributions(),
  markContributionSynced: (id: number, success: boolean, error?: string) =>
    barcodeCache.instance.markContributionSynced(id, success, error),
  deleteContribution: (id: number) => barcodeCache.instance.deleteContribution(id),
  getAllContributions: () => barcodeCache.instance.getAllContributions(),
  clearSyncedContributions: () => barcodeCache.instance.clearSyncedContributions(),
}
