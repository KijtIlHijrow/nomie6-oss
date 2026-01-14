import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nutritionService } from '../../nutrition-service'
import { openfoodfactsContributor } from '../../openfoodfacts-contributor'
import { barcodeCache } from '../../barcode-cache'
import { validNutritionData } from '../fixtures/mock-nutrition-data'
import { mockApiResponses } from '../fixtures/mock-api-responses'

// Mock barcode-cache module to avoid IndexedDB operations
vi.mock('../../barcode-cache', () => ({
  barcodeCache: {
    instance: {
      queueContribution: vi.fn().mockResolvedValue(undefined),
    },
    queueContribution: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('OpenFoodFacts API Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Success Scenarios', () => {
    it('should cache product on API success', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(false)
      expect(barcodeCache.set).toHaveBeenCalledWith(
        validNutritionData.barcode,
        validNutritionData
      )
    })

    it('should return success when API returns status 1', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(false)
      expect(result.error).toBeUndefined()
    })
  })

  describe('API Validation Errors (Should NOT Queue)', () => {
    it('should not queue when API returns validation error', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: false,
        error: 'Invalid product name',
      })

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(false)
      expect(result.queued).toBe(false)
      expect(result.error).toContain('Invalid')
      expect(barcodeCache.instance.queueContribution).not.toHaveBeenCalled()
    })

    it('should return error message from API validation failure', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: false,
        error: 'Missing required fields',
      })

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })

    it('should not queue when API returns 400-style error', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: false,
        error: 'Bad request: invalid barcode format',
      })

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(false)
      expect(barcodeCache.instance.queueContribution).not.toHaveBeenCalled()
    })
  })

  describe('Network Errors (Should Queue)', () => {
    it('should queue on network timeout', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockRejectedValue(
        new Error('Network timeout')
      )

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(barcodeCache.instance.queueContribution).toHaveBeenCalledWith(validNutritionData)
    })

    it('should queue immediately when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const submitSpy = vi.spyOn(openfoodfactsContributor, 'submit')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(submitSpy).not.toHaveBeenCalled() // Skip submit when offline
      expect(barcodeCache.instance.queueContribution).toHaveBeenCalledWith(validNutritionData)
    })

    it('should queue on fetch failure', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockRejectedValue(
        new Error('Failed to fetch')
      )

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(barcodeCache.instance.queueContribution).toHaveBeenCalled()
    })

    it('should queue on any Error with "Network" in message', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: false,
        error: 'Network request failed',
      })

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(barcodeCache.instance.queueContribution).toHaveBeenCalled()
    })
  })

  describe('Malformed Responses', () => {
    it('should handle invalid JSON response', async () => {
      // Mock fetch directly to return malformed JSON
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      })

      const result = await openfoodfactsContributor.submit(validNutritionData)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to parse API response')
    })

    it('should handle missing status field in response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status_verbose: 'Some message' }), // Missing status
      })

      const result = await openfoodfactsContributor.submit(validNutritionData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Some message')
    })

    it('should handle completely empty response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await openfoodfactsContributor.submit(validNutritionData)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown error from OpenFoodFacts')
    })
  })

  describe('Edge Cases', () => {
    it('should handle thrown errors during submission', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockImplementation(() => {
        throw new Error('Unexpected error')
      })

      const result = await nutritionService.contributeProduct(validNutritionData)

      // Should queue on any unexpected error
      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(barcodeCache.instance.queueContribution).toHaveBeenCalled()
    })

    it('should not attempt submission when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const submitSpy = vi.spyOn(openfoodfactsContributor, 'submit')

      await nutritionService.contributeProduct(validNutritionData)

      expect(submitSpy).not.toHaveBeenCalled()
    })
  })
})
