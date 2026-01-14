import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nutritionService } from '../../nutrition-service'
import { contributionSyncService } from '../../contribution-sync-service'
import { openfoodfactsContributor } from '../../openfoodfacts-contributor'
import { barcodeCache } from '../../barcode-cache'
import { validNutritionData, invalidNutritionData } from '../fixtures/mock-nutrition-data'

// Setup fake-indexeddb for testing
import 'fake-indexeddb/auto'

describe('Contribution Workflow Integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Clear database
    await barcodeCache.instance.clearAll()
    // Also clear contributions
    const contributions = await barcodeCache.getAllContributions()
    for (const contribution of contributions) {
      if (contribution.id !== undefined) {
        await barcodeCache.deleteContribution(contribution.id)
      }
    }
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Happy Path (Online)', () => {
    it('should complete immediate submission when online', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })

      const cacheSpy = vi.spyOn(barcodeCache, 'set')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(false)
      expect(cacheSpy).toHaveBeenCalledWith(
        validNutritionData.barcode,
        validNutritionData
      )
    })

    it('should call OpenFoodFacts API when online', async () => {
      const submitSpy = vi
        .spyOn(openfoodfactsContributor, 'submit')
        .mockResolvedValue({ success: true })

      await nutritionService.contributeProduct(validNutritionData)

      expect(submitSpy).toHaveBeenCalledWith(validNutritionData, undefined)
    })

    it('should cache product locally after successful submission', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })

      await nutritionService.contributeProduct(validNutritionData)

      const cached = await barcodeCache.get(validNutritionData.barcode)
      expect(cached).toBeDefined()
      expect(cached?.data.productName).toBe('Test Coca-Cola')
    })
  })

  describe('Offline Path', () => {
    it('should queue when offline without attempting submit', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const submitSpy = vi.spyOn(openfoodfactsContributor, 'submit')
      const queueSpy = vi.spyOn(barcodeCache.instance, 'queueContribution')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(submitSpy).not.toHaveBeenCalled()
      expect(queueSpy).toHaveBeenCalledWith(validNutritionData)
    })

    it('should store contribution in IndexedDB queue when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      await nutritionService.contributeProduct(validNutritionData)

      const pending = await barcodeCache.getPendingContributions()
      expect(pending).toHaveLength(1)
      expect(pending[0].data.barcode).toBe(validNutritionData.barcode)
    })
  })

  describe('Network Error Path', () => {
    it('should queue automatically on network error', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockRejectedValue(
        new Error('Network timeout')
      )

      const queueSpy = vi.spyOn(barcodeCache.instance, 'queueContribution')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(queueSpy).toHaveBeenCalled()
    })

    it('should show queued message on network failure', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockRejectedValue(
        new Error('Failed to fetch')
      )

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
    })
  })

  describe('Background Sync', () => {
    it('should sync pending contributions successfully', async () => {
      // Queue a contribution first
      await barcodeCache.queueContribution(validNutritionData)

      // Mock successful sync
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(1)
      expect(result.failed).toBe(0)
      expect(result.pending).toBe(0)
    })

    it('should mark contribution as synced after successful sync', async () => {
      await barcodeCache.queueContribution(validNutritionData)

      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })

      await contributionSyncService.syncNow()

      const pending = await barcodeCache.getPendingContributions()
      expect(pending).toHaveLength(0) // Marked as synced

      const all = await barcodeCache.getAllContributions()
      expect(all[0].synced).toBe(true)
    })

    it('should leave contributions pending on sync failure', async () => {
      await barcodeCache.queueContribution(validNutritionData)

      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: false,
        error: 'API error',
      })

      const result = await contributionSyncService.syncNow()

      expect(result.failed).toBe(1)

      // When marked as failed, they are removed from pending (synced=false but processed)
      const all = await barcodeCache.getAllContributions()
      expect(all[0].synced).toBe(false)
      expect(all[0].error).toBe('API error')
    })

    it('should continue syncing after network error', async () => {
      // Queue 2 contributions
      await barcodeCache.queueContribution({
        ...validNutritionData,
        barcode: '111111111111',
      })
      await barcodeCache.queueContribution({
        ...validNutritionData,
        barcode: '222222222222',
      })

      // First fails with network error, second succeeds
      vi.spyOn(openfoodfactsContributor, 'submit')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ success: true })

      const result = await contributionSyncService.syncNow()

      // First left as pending, second synced
      expect(result.synced).toBe(1)
      expect(result.pending).toBe(1) // First one still pending
    })
  })

  describe('Validation Integration', () => {
    it('should not queue invalid data', async () => {
      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')

      const result = await nutritionService.contributeProduct(
        invalidNutritionData.missingProductName
      )

      expect(result.success).toBe(false)
      expect(result.queued).toBe(false)
      expect(queueSpy).not.toHaveBeenCalled()
    })

    it('should validate before attempting submission', async () => {
      const submitSpy = vi.spyOn(openfoodfactsContributor, 'submit')

      await nutritionService.contributeProduct(
        invalidNutritionData.negativeCalories
      )

      expect(submitSpy).not.toHaveBeenCalled() // Validation fails first
    })
  })

  describe('Error Recovery', () => {
    it('should queue on unexpected errors during submission', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockImplementation(() => {
        throw new Error('Unexpected error')
      })

      const queueSpy = vi.spyOn(barcodeCache.instance, 'queueContribution')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(queueSpy).toHaveBeenCalled()
    })
  })
})
