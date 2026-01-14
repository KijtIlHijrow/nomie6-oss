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

  productNameTooShort: {
    ...validNutritionData,
    productName: 'A', // Less than 2 characters
  } as NutritionData,

  zeroServingSize: {
    ...validNutritionData,
    servingSize: '0g',
  } as NutritionData,

  negativeServingSize: {
    ...validNutritionData,
    servingSize: '-100g',
  } as NutritionData,

  negativeCalories: {
    ...validNutritionData,
    nutrients: { ...validNutritionData.nutrients, calories: -100 },
  } as NutritionData,

  missingCalories: {
    ...validNutritionData,
    nutrients: { ...validNutritionData.nutrients, calories: undefined as any },
  } as NutritionData,

  nanCalories: {
    ...validNutritionData,
    nutrients: { ...validNutritionData.nutrients, calories: NaN },
  } as NutritionData,

  missingProtein: {
    ...validNutritionData,
    nutrients: { ...validNutritionData.nutrients, protein_g: undefined as any },
  } as NutritionData,

  nanProtein: {
    ...validNutritionData,
    nutrients: { ...validNutritionData.nutrients, protein_g: NaN },
  } as NutritionData,
}

export const boundaryNutritionData = {
  minimumServingSize: {
    ...validNutritionData,
    servingSize: '0.01g',
  } as NutritionData,

  zeroCalories: {
    ...validNutritionData,
    nutrients: { ...validNutritionData.nutrients, calories: 0 },
  } as NutritionData,

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
