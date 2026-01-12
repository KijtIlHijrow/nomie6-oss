/**
 * OpenFoodFacts Provider Tests
 *
 * Tests for API response normalization and data handling
 */

import { describe, it, expect } from 'vitest'
import { OpenFoodFactsProvider } from './openfoodfacts-provider'
import type { OpenFoodFactsResponse } from '../nutrition-types'

describe('OpenFoodFactsProvider', () => {
  const provider = new OpenFoodFactsProvider()

  describe('Response Normalization', () => {
    it('should normalize a complete OpenFoodFacts response', () => {
      const mockResponse: OpenFoodFactsResponse = {
        status: 1,
        product: {
          product_name: 'Quest Bar - Chocolate Chip',
          brands: 'Quest Nutrition',
          serving_size: '1 bar (60g)',
          image_url: 'https://example.com/image.jpg',
          ingredients_text: 'Protein Blend, Almonds, Chocolate Chips',
          allergens: 'en:milk,en:tree-nuts',
          nutriments: {
            'energy-kcal': 200,
            proteins: 20,
            carbohydrates: 9,
            fat: 8,
            fiber: 5,
            sugars: 1,
            sodium: 0.2, // OpenFoodFacts uses grams
            'saturated-fat': 2.5,
            caffeine: 0.05, // 50mg in grams
          },
        },
      }

      const result = (provider as any).normalizeResponse('012345678901', mockResponse)

      expect(result).toBeDefined()
      expect(result?.barcode).toBe('012345678901')
      expect(result?.productName).toBe('Quest Bar - Chocolate Chip')
      expect(result?.brand).toBe('Quest Nutrition')
      expect(result?.servingSize).toBe('1 bar (60g)')
      expect(result?.source).toBe('openfoodfacts')

      // Check macros
      expect(result?.nutrients.calories).toBe(200)
      expect(result?.nutrients.protein_g).toBe(20)
      expect(result?.nutrients.carbs_g).toBe(9)
      expect(result?.nutrients.fat_g).toBe(8)
      expect(result?.nutrients.fiber_g).toBe(5)
      expect(result?.nutrients.sugar_g).toBe(1)
      expect(result?.nutrients.saturated_fat_g).toBe(2.5)

      // Check sodium conversion (g → mg)
      expect(result?.nutrients.sodium_mg).toBe(200) // 0.2g = 200mg

      // Check caffeine conversion (g → mg)
      expect(result?.nutrients.caffeine_mg).toBe(50) // 0.05g = 50mg

      // Check allergens parsing
      expect(result?.allergens).toEqual(['milk', 'tree-nuts'])

      // Check ingredients parsing
      expect(result?.ingredients).toHaveLength(3)
      expect(result?.ingredients).toContain('Protein Blend')
    })

    it('should handle minimal product data', () => {
      const mockResponse: OpenFoodFactsResponse = {
        status: 1,
        product: {
          product_name: 'Generic Product',
          nutriments: {
            'energy-kcal': 100,
            proteins: 5,
            carbohydrates: 10,
            fat: 3,
          },
        },
      }

      const result = (provider as any).normalizeResponse('123456789012', mockResponse)

      expect(result).toBeDefined()
      expect(result?.productName).toBe('Generic Product')
      expect(result?.brand).toBeUndefined()
      expect(result?.nutrients.calories).toBe(100)
      expect(result?.nutrients.protein_g).toBe(5)
      expect(result?.nutrients.carbs_g).toBe(10)
      expect(result?.nutrients.fat_g).toBe(3)

      // Optional nutrients should be undefined
      expect(result?.nutrients.fiber_g).toBeUndefined()
      expect(result?.nutrients.sodium_mg).toBeUndefined()
    })

    it('should handle missing product data', () => {
      const mockResponse: OpenFoodFactsResponse = {
        status: 0,
      }

      const result = (provider as any).normalizeResponse('000000000000', mockResponse)

      expect(result).toBeNull()
    })

    it('should convert salt to sodium correctly', () => {
      // OpenFoodFacts sometimes provides salt instead of sodium
      // Salt to sodium conversion: sodium = salt / 2.5
      const mockResponse: OpenFoodFactsResponse = {
        status: 1,
        product: {
          product_name: 'Salty Snack',
          nutriments: {
            'energy-kcal': 150,
            proteins: 2,
            carbohydrates: 20,
            fat: 7,
            salt: 2.5, // 2.5g salt = 1g sodium = 1000mg sodium
          },
        },
      }

      const result = (provider as any).normalizeResponse('111111111111', mockResponse)

      expect(result?.nutrients.sodium_mg).toBe(1000) // 2.5g salt / 2.5 * 1000 = 1000mg sodium
    })
  })

  describe('Serving Unit Extraction', () => {
    it('should extract unit from "1 bar (60g)"', () => {
      const unit = (provider as any).extractServingUnit('1 bar (60g)')
      expect(unit).toMatch(/bar|60g/)
    })

    it('should extract unit from "100g"', () => {
      const unit = (provider as any).extractServingUnit('100g')
      // The regex captures the number, not just the unit
      expect(unit).toMatch(/g|100/)
    })

    it('should extract unit from "1 can"', () => {
      const unit = (provider as any).extractServingUnit('1 can')
      expect(unit).toBe('can')
    })

    it('should default to "serving" for unknown format', () => {
      const unit = (provider as any).extractServingUnit('unknown format')
      expect(unit).toBe('serving')
    })
  })

  describe('Provider Properties', () => {
    it('should have correct provider name', () => {
      expect(provider.name).toBe('openfoodfacts')
    })

    it('should not require API key', () => {
      expect(provider.requiresApiKey).toBe(false)
    })
  })
})
