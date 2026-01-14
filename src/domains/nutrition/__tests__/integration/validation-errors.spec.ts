import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nutritionService } from '../../nutrition-service'
import {
  validNutritionData,
  invalidNutritionData,
  boundaryNutritionData,
} from '../fixtures/mock-nutrition-data'

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

describe('Nutrition Contribution Validation', () => {
  let originalOnlineValue: boolean

  beforeEach(() => {
    // Save original value
    originalOnlineValue = navigator.onLine
  })

  afterEach(() => {
    // Restore original value
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnlineValue,
      writable: true,
      configurable: true,
    })
  })

  describe('Required Fields', () => {
    it('should reject missing product name', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.missingProductName
      )

      expect(result.success).toBe(false)
      expect(result.queued).toBe(false)
      expect(result.error).toContain('productName')
    })

    it('should reject product name less than 2 characters', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.productNameTooShort
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('productName')
    })

    it('should reject zero serving size', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.zeroServingSize
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('servingSize')
    })

    it('should reject negative serving size', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.negativeServingSize
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('servingSize')
    })

    it('should reject missing calories', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.missingCalories
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('calories')
    })

    it('should reject negative calories', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.negativeCalories
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('calories')
    })

    it('should reject NaN calories', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.nanCalories
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('calories')
    })

    it('should reject missing protein', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.missingProtein
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('protein')
    })

    it('should reject NaN protein', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.nanProtein
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('protein')
    })
  })

  describe('Boundary Cases', () => {
    it('should accept minimum serving size (0.01)', async () => {
      // Mock offline to avoid actual API call
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      const result = await nutritionService.contributeProduct(
        boundaryNutritionData.minimumServingSize
      )

      // Should queue successfully (offline)
      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
    })

    it('should accept zero calories (valid for zero-calorie products)', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const result = await nutritionService.contributeProduct(
        boundaryNutritionData.zeroCalories
      )

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
    })

    it('should accept high protein values (100g)', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const result = await nutritionService.contributeProduct(
        boundaryNutritionData.highProtein
      )

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
    })

    it('should accept high calories (>2000) with warning', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const result = await nutritionService.contributeProduct(
        boundaryNutritionData.highCalories
      )

      // Should still succeed (warning, not error)
      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
    })
  })

  describe('Barcode Validation', () => {
    it('should reject barcode with invalid length', async () => {
      const data = {
        ...validNutritionData,
        barcode: '1234567', // 7 digits (invalid)
      }

      const result = await nutritionService.contributeProduct(data)

      expect(result.success).toBe(false)
      expect(result.error).toContain('barcode')
    })

    it('should reject non-numeric barcode', async () => {
      const data = {
        ...validNutritionData,
        barcode: 'ABC123XYZ',
      }

      const result = await nutritionService.contributeProduct(data)

      expect(result.success).toBe(false)
      expect(result.error).toContain('barcode')
    })

    it('should accept EAN-13 barcode (13 digits)', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const data = {
        ...validNutritionData,
        barcode: '5449000000996', // EAN-13
      }

      const result = await nutritionService.contributeProduct(data)

      expect(result.success).toBe(true)
    })

    it('should accept UPC-A barcode (12 digits)', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const data = {
        ...validNutritionData,
        barcode: '012345678905', // UPC-A
      }

      const result = await nutritionService.contributeProduct(data)

      expect(result.success).toBe(true)
    })

    it('should accept EAN-8 barcode (8 digits)', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const data = {
        ...validNutritionData,
        barcode: '12345670', // EAN-8
      }

      const result = await nutritionService.contributeProduct(data)

      expect(result.success).toBe(true)
    })
  })
})
