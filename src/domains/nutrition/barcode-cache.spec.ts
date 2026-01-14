import { describe, it, expect, beforeEach } from 'vitest'
import { barcodeCache } from './barcode-cache'
import { validNutritionData } from './__tests__/fixtures/mock-nutrition-data'
import type { NutritionData } from './nutrition-types'

// Import fake-indexeddb for this test file
import 'fake-indexeddb/auto'

describe('BarcodeCache', () => {
  beforeEach(async () => {
    // Clear all cached products
    await barcodeCache.instance.clearAll()

    // Clear all contributions (both synced and pending)
    const allContributions = await barcodeCache.instance.getAllContributions()
    for (const contribution of allContributions) {
      if (contribution.id !== undefined) {
        await barcodeCache.instance.deleteContribution(contribution.id)
      }
    }
  })

  describe('Basic CRUD Operations', () => {
    it('should store nutrition data with timestamp', async () => {
      const barcode = '123456789012'

      await barcodeCache.set(barcode, validNutritionData)

      const cached = await barcodeCache.get(barcode)

      expect(cached).toBeDefined()
      expect(cached?.data.productName).toBe('Test Coca-Cola')
      expect(cached?.cachedAt).toBeDefined()
    })

    it('should retrieve cached nutrition data', async () => {
      const barcode = '123456789012'
      await barcodeCache.set(barcode, validNutritionData)

      const cached = await barcodeCache.get(barcode)

      expect(cached?.data).toEqual(validNutritionData)
    })

    it('should return null for non-existent barcode', async () => {
      const result = await barcodeCache.get('999999999999')

      expect(result).toBeNull()
    })

    it('should count cached entries', async () => {
      await barcodeCache.set('111111', validNutritionData)
      await barcodeCache.set('222222', validNutritionData)
      await barcodeCache.set('333333', validNutritionData)

      const count = await barcodeCache.count()

      expect(count).toBe(3)
    })
  })

  describe('Expiry Logic', () => {
    it('should identify non-expired data', async () => {
      const barcode = '123456789012'
      await barcodeCache.set(barcode, validNutritionData)

      const cached = await barcodeCache.get(barcode)
      const expiry = 30 * 24 * 60 * 60 * 1000 // 30 days

      const expired = barcodeCache.isExpired(cached!, expiry)

      expect(expired).toBe(false)
    })

    it('should identify expired data', async () => {
      const barcode = '123456789012'
      await barcodeCache.set(barcode, validNutritionData)

      const cached = await barcodeCache.get(barcode)
      // Set very short expiry (1ms)
      const expiry = 1

      // Wait 2ms
      await new Promise((resolve) => setTimeout(resolve, 2))

      const expired = barcodeCache.isExpired(cached!, expiry)

      expect(expired).toBe(true)
    })

    it('should return null for expired cache entries', async () => {
      const barcode = '123456789012'
      await barcodeCache.set(barcode, validNutritionData)

      // Wait 2ms to ensure entry is expired
      await new Promise((resolve) => setTimeout(resolve, 2))

      // Clean with very short expiry
      await barcodeCache.cleanExpired(1)

      const cached = await barcodeCache.get(barcode)

      expect(cached).toBeNull()
    })

    it('should remove expired entries with cleanExpired', async () => {
      await barcodeCache.set('111111', validNutritionData)
      await barcodeCache.set('222222', validNutritionData)

      // Wait 2ms to ensure entries are expired
      await new Promise((resolve) => setTimeout(resolve, 2))

      const deleted = await barcodeCache.cleanExpired(1) // Very short expiry

      expect(deleted).toBeGreaterThan(0)

      const count = await barcodeCache.count()
      expect(count).toBe(0)
    })
  })

  describe('Contribution Queue', () => {
    it('should queue contribution with pending status', async () => {
      await barcodeCache.queueContribution(validNutritionData)

      const pending = await barcodeCache.getPendingContributions()

      expect(pending).toHaveLength(1)
      expect(pending[0].data.barcode).toBe(validNutritionData.barcode)
      expect(pending[0].synced).toBe(false)
      expect(pending[0].queuedAt).toBeDefined()
    })

    it('should return only pending contributions', async () => {
      // Queue 2 contributions
      await barcodeCache.queueContribution({
        ...validNutritionData,
        barcode: '111111',
      })
      await barcodeCache.queueContribution({
        ...validNutritionData,
        barcode: '222222',
      })

      // Mark first as synced
      const pending = await barcodeCache.getPendingContributions()
      await barcodeCache.markContributionSynced(pending[0].id!, true)

      // Should only return the unsynced one
      const stillPending = await barcodeCache.getPendingContributions()
      expect(stillPending).toHaveLength(1)
      expect(stillPending[0].data.barcode).toBe('222222')
    })

    it('should mark contribution as synced', async () => {
      await barcodeCache.queueContribution(validNutritionData)

      const pending = await barcodeCache.getPendingContributions()
      const id = pending[0].id!

      await barcodeCache.markContributionSynced(id, true)

      const stillPending = await barcodeCache.getPendingContributions()
      expect(stillPending).toHaveLength(0)

      const all = await barcodeCache.getAllContributions()
      expect(all[0].synced).toBe(true)
    })

    it('should store error message when sync fails', async () => {
      await barcodeCache.queueContribution(validNutritionData)

      const pending = await barcodeCache.getPendingContributions()
      const id = pending[0].id!

      await barcodeCache.markContributionSynced(id, false, 'API validation error')

      const all = await barcodeCache.getAllContributions()
      expect(all[0].synced).toBe(false)
      expect(all[0].error).toBe('API validation error')
    })

    it('should return all contributions (synced and pending)', async () => {
      await barcodeCache.queueContribution({
        ...validNutritionData,
        barcode: '111111',
      })
      await barcodeCache.queueContribution({
        ...validNutritionData,
        barcode: '222222',
      })

      const pending = await barcodeCache.getPendingContributions()
      await barcodeCache.markContributionSynced(pending[0].id!, true)

      const all = await barcodeCache.getAllContributions()

      expect(all).toHaveLength(2)
      expect(all.filter((c) => c.synced)).toHaveLength(1)
      expect(all.filter((c) => !c.synced)).toHaveLength(1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle multiple sets to same barcode', async () => {
      const barcode = '123456789012'

      await barcodeCache.set(barcode, validNutritionData)
      await barcodeCache.set(barcode, {
        ...validNutritionData,
        productName: 'Updated Product',
      })

      const cached = await barcodeCache.get(barcode)

      expect(cached?.data.productName).toBe('Updated Product')
    })

    it('should handle empty barcode gracefully', async () => {
      const result = await barcodeCache.get('')

      expect(result).toBeNull()
    })
  })
})
