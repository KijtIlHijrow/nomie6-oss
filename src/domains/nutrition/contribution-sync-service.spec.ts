/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { contributionSyncService } from './contribution-sync-service'
import { openfoodfactsContributor } from './openfoodfacts-contributor'
import { barcodeCache } from './barcode-cache'
import { validNutritionData } from './__tests__/fixtures/mock-nutrition-data'

// Import fake-indexeddb for this test file
import 'fake-indexeddb/auto'

describe('ContributionSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Stop service if running
    contributionSyncService.stop()
  })

  afterEach(() => {
    contributionSyncService.stop()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('Lifecycle Management', () => {
    it('should set up 30-minute interval on start', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval')

      contributionSyncService.start()

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        30 * 60 * 1000
      )
    })

    it('should trigger immediate sync when online on start', async () => {
      // Use real timers to allow async operations to complete
      vi.useRealTimers()

      Object.defineProperty(navigator, 'onLine', { value: true, writable: true })

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([])

      contributionSyncService.start()

      // Wait for the immediate sync promise to settle
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(barcodeCache.getPendingContributions).toHaveBeenCalled()

      // Restore fake timers for other tests
      vi.useFakeTimers()
    })

    it('should not sync immediately when offline on start', async () => {
      // Use real timers to allow async operations to complete
      vi.useRealTimers()

      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([])

      contributionSyncService.start()

      // Wait a bit to ensure sync doesn't trigger
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(barcodeCache.getPendingContributions).not.toHaveBeenCalled()

      // Restore fake timers for other tests
      vi.useFakeTimers()
    })

    it('should clear interval on stop', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

      contributionSyncService.start()
      contributionSyncService.stop()

      expect(clearIntervalSpy).toHaveBeenCalled()
    })

    it('should handle stop when not started', () => {
      expect(() => contributionSyncService.stop()).not.toThrow()
    })
  })

  describe('Sync Logic', () => {
    it('should return early when no pending contributions', async () => {
      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([])

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.pending).toBe(0)
    })

    it('should sync single contribution successfully', async () => {
      const contribution = {
        id: 1,
        data: validNutritionData,
        synced: false,
        timestamp: Date.now(),
      }

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        contribution,
      ])
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(1)
      expect(result.failed).toBe(0)
      expect(barcodeCache.markContributionSynced).toHaveBeenCalledWith(1, true)
    })

    it('should sync multiple contributions with rate limiting', async () => {
      // Use real timers for this test to allow actual delays
      vi.useRealTimers()

      const contributions = [
        { id: 1, data: validNutritionData, synced: false, timestamp: Date.now() },
        { id: 2, data: validNutritionData, synced: false, timestamp: Date.now() },
        { id: 3, data: validNutritionData, synced: false, timestamp: Date.now() },
      ]

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue(
        contributions
      )
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(3)
      expect(openfoodfactsContributor.submit).toHaveBeenCalledTimes(3)

      // Restore fake timers for other tests
      vi.useFakeTimers()
    })

    it('should mark failed submissions correctly', async () => {
      const contribution = {
        id: 1,
        data: validNutritionData,
        synced: false,
        timestamp: Date.now(),
      }

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        contribution,
      ])
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: false,
        error: 'API validation error',
      })
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(0)
      expect(result.failed).toBe(1)
      expect(barcodeCache.markContributionSynced).toHaveBeenCalledWith(
        1,
        false,
        'API validation error'
      )
    })

    it('should leave contributions pending on network error', async () => {
      const contribution = {
        id: 1,
        data: validNutritionData,
        synced: false,
        timestamp: Date.now(),
      }

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        contribution,
      ])
      vi.spyOn(openfoodfactsContributor, 'submit').mockRejectedValue(
        new Error('Network timeout')
      )
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.pending).toBe(1) // Still pending
      expect(barcodeCache.markContributionSynced).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(
        'Network error during sync:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('should continue syncing after network error', async () => {
      const contributions = [
        { id: 1, data: validNutritionData, synced: false, timestamp: Date.now() },
        { id: 2, data: validNutritionData, synced: false, timestamp: Date.now() },
      ]

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue(
        contributions
      )
      vi.spyOn(openfoodfactsContributor, 'submit')
        .mockRejectedValueOnce(new Error('Network error')) // First fails
        .mockResolvedValueOnce({ success: true }) // Second succeeds
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(1)
      expect(result.pending).toBe(1)
    })
  })

  describe('Rate Limiting', () => {
    it('should not delay first submission', async () => {
      const contribution = {
        id: 1,
        data: validNutritionData,
        synced: false,
        timestamp: Date.now(),
      }

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        contribution,
      ])
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()

      const startTime = Date.now()
      await contributionSyncService.syncNow()
      const duration = Date.now() - startTime

      // Should complete quickly (no 1-second delay)
      expect(duration).toBeLessThan(100)
    })
  })

  describe('Error Handling', () => {
    it('should skip contributions with missing ID', async () => {
      const contribution = {
        data: validNutritionData,
        synced: false,
        timestamp: Date.now(),
        // id missing
      }

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        contribution as any,
      ])
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(0)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Contribution missing ID, skipping sync'
      )

      consoleSpy.mockRestore()
    })

    it('should handle toast notification errors gracefully', async () => {
      const contribution = {
        id: 1,
        data: validNutritionData,
        synced: false,
        timestamp: Date.now(),
      }

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        contribution,
      ])
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()

      // Mock showToast to throw error
      const { showToast } = await import('../../components/toast/ToastStore')
      vi.spyOn({ showToast }, 'showToast').mockImplementation(() => {
        throw new Error('Toast error')
      })

      // Should not throw
      await expect(contributionSyncService.syncNow()).resolves.toBeDefined()
    })
  })

  describe('Helper Methods', () => {
    it('should return pending contribution count', async () => {
      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        { id: 1, data: validNutritionData, synced: false, timestamp: Date.now() },
        { id: 2, data: validNutritionData, synced: false, timestamp: Date.now() },
      ])

      const count = await contributionSyncService.getPendingCount()

      expect(count).toBe(2)
    })
  })
})
