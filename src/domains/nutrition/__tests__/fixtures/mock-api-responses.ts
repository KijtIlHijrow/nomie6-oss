/**
 * Mock API response fixtures for OpenFoodFacts and other providers
 */

import type { NutritionData } from '../../nutrition-types'
import { validNutritionData } from './mock-nutrition-data'

/**
 * OpenFoodFacts API responses
 */
export const mockOpenFoodFactsResponses = {
  success: {
    status: 1,
    status_verbose: 'fields saved',
  },

  validationError: {
    status: 0,
    status_verbose: 'Missing required fields: product_name',
  },

  networkError: {
    status: 0,
    status_verbose: 'Network request failed',
  },

  serverError: {
    status: 0,
    status_verbose: 'Internal server error',
  },

  productFound: {
    status: 1,
    product: {
      code: '5449000000996',
      product_name: 'Coca-Cola',
      brands: 'Coca-Cola',
      serving_size: '330 ml',
      nutriments: {
        'energy-kcal_100g': 42,
        proteins_100g: 0,
        carbohydrates_100g: 10.6,
        fat_100g: 0,
        fiber_100g: 0,
        sugars_100g: 10.6,
        sodium_100g: 0.015,
      },
    },
  },

  productNotFound: {
    status: 0,
    status_verbose: 'product not found',
  },
}

/**
 * Nutritionix API responses
 */
export const mockNutritionixResponses = {
  searchSuccess: {
    foods: [
      {
        food_name: 'Coca-Cola',
        brand_name: 'Coca-Cola',
        serving_qty: 330,
        serving_unit: 'ml',
        nf_calories: 139,
        nf_protein: 0,
        nf_total_carbohydrate: 35,
        nf_total_fat: 0,
      },
    ],
  },

  searchEmpty: {
    foods: [],
  },

  unauthorized: {
    message: 'Invalid API credentials',
  },
}

/**
 * Generic fetch error responses
 */
export const mockFetchErrors = {
  networkError: new TypeError('Failed to fetch'),
  timeout: new Error('Request timeout'),
  serverError: new Response('Internal Server Error', { status: 500 }),
}
