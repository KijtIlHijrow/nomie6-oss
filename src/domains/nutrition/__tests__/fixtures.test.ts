/**
 * Verification test for test fixtures
 * Ensures all fixtures are correctly structured
 */

import { describe, it, expect } from 'vitest'
import { validBarcodes, invalidBarcodes, edgeCaseBarcodes } from './fixtures/mock-barcodes'
import {
  validNutritionData,
  invalidNutritionData,
  boundaryNutritionData,
} from './fixtures/mock-nutrition-data'
import {
  mockOpenFoodFactsResponses,
  mockNutritionixResponses,
  mockFetchErrors,
} from './fixtures/mock-api-responses'

describe('Test Fixtures', () => {
  it('should have valid barcode fixtures', () => {
    expect(validBarcodes.ean13).toBe('5449000000996')
    expect(validBarcodes.upcA).toBe('012345678905')
    expect(validBarcodes.ean8).toBe('12345670')
    expect(invalidBarcodes.empty).toBe('')
    expect(edgeCaseBarcodes.leadingZeros).toBe('0000000000123')
  })

  it('should have valid nutrition data fixtures', () => {
    expect(validNutritionData.barcode).toBe('5449000000996')
    expect(validNutritionData.productName).toBe('Test Coca-Cola')
    expect(validNutritionData.nutrients.calories).toBe(139)
    expect(invalidNutritionData.missingProductName.productName).toBe('')
    expect(boundaryNutritionData.highCalories.nutrients.calories).toBe(2500)
  })

  it('should have OpenFoodFacts API response fixtures', () => {
    expect(mockOpenFoodFactsResponses.success.status).toBe(1)
    expect(mockOpenFoodFactsResponses.validationError.status).toBe(0)
    expect(mockOpenFoodFactsResponses.productFound.product.code).toBe('5449000000996')
  })

  it('should have Nutritionix API response fixtures', () => {
    expect(mockNutritionixResponses.searchSuccess.foods).toHaveLength(1)
    expect(mockNutritionixResponses.searchEmpty.foods).toHaveLength(0)
  })

  it('should have fetch error fixtures', () => {
    expect(mockFetchErrors.networkError).toBeInstanceOf(TypeError)
    expect(mockFetchErrors.serverError).toBeInstanceOf(Response)
  })
})
