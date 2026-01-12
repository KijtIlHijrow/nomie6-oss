/**
 * Nutrition Service Tests
 *
 * Tests for barcode validation and service orchestration
 */

import { describe, it, expect } from 'vitest'
import { NutritionService } from './nutrition-service'

describe('NutritionService', () => {
  const service = new NutritionService()

  describe('Barcode Validation', () => {
    it('should validate UPC-A barcodes (12 digits)', () => {
      const result = service.validateBarcode('012345678901')
      expect(result.valid).toBe(true)
      expect(result.format).toBe('UPC-A')
    })

    it('should validate EAN-13 barcodes (13 digits)', () => {
      const result = service.validateBarcode('0123456789012')
      expect(result.valid).toBe(true)
      expect(result.format).toBe('EAN-13')
    })

    it('should validate EAN-8 barcodes (8 digits)', () => {
      const result = service.validateBarcode('01234567')
      expect(result.valid).toBe(true)
      expect(result.format).toBe('EAN-8')
    })

    it('should reject barcodes with invalid length', () => {
      const result = service.validateBarcode('12345') // 5 digits
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid barcode length')
    })

    it('should reject non-numeric barcodes', () => {
      const result = service.validateBarcode('abc123456789')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must contain only digits')
    })

    it('should reject empty barcodes', () => {
      const result = service.validateBarcode('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Barcode is required')
    })

    it('should handle barcodes with whitespace', () => {
      const result = service.validateBarcode('  012345678901  ')
      expect(result.valid).toBe(true)
      expect(result.format).toBe('UPC-A')
    })
  })

  describe('Provider Management', () => {
    it('should have OpenFoodFacts provider registered', () => {
      const provider = service.getProvider('openfoodfacts')
      expect(provider).toBeDefined()
      expect(provider?.name).toBe('openfoodfacts')
    })

    it('should return OpenFoodFacts as primary provider by default', () => {
      const primary = service.getPrimaryProvider()
      expect(primary.name).toBe('openfoodfacts')
    })

    it('should return undefined for non-existent provider', () => {
      const provider = service.getProvider('nonexistent')
      expect(provider).toBeUndefined()
    })
  })
})
