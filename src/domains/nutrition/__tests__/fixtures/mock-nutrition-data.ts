/**
 * Mock nutrition data test fixtures
 * Based on nutrition-types.ts NutritionData interface
 */

import type { NutritionData } from '../../nutrition-types'

export const validNutritionData: NutritionData = {
  barcode: '5449000000996',
  productName: 'Test Coca-Cola',
  brand: 'Coca-Cola',
  servingSize: '330ml',
  servingUnit: 'ml',
  nutrients: {
    calories: 139,
    protein_g: 0,
    carbs_g: 35,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 35,
    sodium_mg: 15,
  },
  ingredients: ['Carbonated water', 'Sugar', 'Caramel color', 'Phosphoric acid', 'Natural flavors', 'Caffeine'],
  allergens: [],
  source: 'openfoodfacts',
  lastUpdated: Date.now(),
}

export const invalidNutritionData = {
  missingProductName: {
    ...validNutritionData,
    productName: '',
  } as NutritionData,

  missingServingSize: {
    ...validNutritionData,
    servingSize: '',
  } as NutritionData,

  negativeCalories: {
    ...validNutritionData,
    nutrients: { ...validNutritionData.nutrients, calories: -100 },
  } as NutritionData,

  missingBarcode: {
    ...validNutritionData,
    barcode: '',
  } as NutritionData,

  shortBarcode: {
    ...validNutritionData,
    barcode: '123', // Too short
  } as NutritionData,

  missingServingUnit: {
    ...validNutritionData,
    servingUnit: '',
  } as NutritionData,

  negativeProtein: {
    ...validNutritionData,
    nutrients: { ...validNutritionData.nutrients, protein_g: -5 },
  } as NutritionData,

  negativeCarbs: {
    ...validNutritionData,
    nutrients: { ...validNutritionData.nutrients, carbs_g: -10 },
  } as NutritionData,

  negativeFat: {
    ...validNutritionData,
    nutrients: { ...validNutritionData.nutrients, fat_g: -8 },
  } as NutritionData,
}

export const boundaryNutritionData = {
  highCalories: {
    ...validNutritionData,
    nutrients: { ...validNutritionData.nutrients, calories: 2500 },
  } as NutritionData,

  highProtein: {
    ...validNutritionData,
    nutrients: { ...validNutritionData.nutrients, protein_g: 150 },
  } as NutritionData,

  zeroNutrients: {
    ...validNutritionData,
    nutrients: {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    },
  } as NutritionData,
}
