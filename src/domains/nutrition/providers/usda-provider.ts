/**
 * USDA FoodData Central API Provider
 *
 * Free, authoritative nutrition database from the U.S. Department of Agriculture
 * API Docs: https://fdc.nal.usda.gov/api-guide.html
 * API Key: Optional but recommended (get at https://fdc.nal.usda.gov/api-key-signup.html)
 */

import type {
  NutritionProvider,
  NutritionData,
  USDAResponse,
  NutritionContribution,
} from '../nutrition-types'
import { appConfig } from '../../../config/appConfig'

export class USDAProvider implements NutritionProvider {
  name = 'usda'
  requiresApiKey = false // Optional, but recommended

  private readonly baseUrl = 'https://api.nal.usda.gov/fdc/v1'
  private apiKey: string

  constructor(apiKey: string = 'DEMO_KEY') {
    this.apiKey = apiKey
  }

  /**
   * Lookup product by barcode (GTIN/UPC)
   */
  async lookup(barcode: string): Promise<NutritionData | null> {
    try {
      // Search for foods with this GTIN/UPC
      const url = `${this.baseUrl}/foods/search?query=${barcode}&dataType=Branded&pageSize=1&api_key=${this.apiKey}`
      const response = await fetch(url)

      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        console.error(`USDA API error: ${response.status}`)
        return null
      }

      const json: USDAResponse = await response.json()

      if (!json.foods || json.foods.length === 0) {
        return null
      }

      // Find exact GTIN match
      const food = json.foods.find(
        (f) => f.gtinUpc === barcode || f.gtinUpc === barcode.padStart(14, '0')
      )

      if (!food) {
        return null
      }

      return this.normalizeResponse(barcode, food)
    } catch (error) {
      console.error('USDA lookup failed:', error)
      return null
    }
  }

  /**
   * Search for products by name
   * Searches across all food types (Branded, Foundation, SR Legacy, Survey)
   */
  async search(query: string): Promise<NutritionData[]> {
    try {
      // Don't filter by dataType - search all food types to include Foundation foods like raw fruits/vegetables
      const url = `${this.baseUrl}/foods/search?query=${encodeURIComponent(query)}&pageSize=10&api_key=${this.apiKey}`
      const response = await fetch(url)

      if (!response.ok) {
        console.error(`USDA search error: ${response.status}`)
        return []
      }

      const json: USDAResponse = await response.json()
      const foods = json.foods || []

      return foods
        .map((food) => this.normalizeResponse(food.gtinUpc || '', food))
        .filter((data: NutritionData | null) => data !== null) as NutritionData[]
    } catch (error) {
      console.error('USDA search failed:', error)
      return []
    }
  }

  /**
   * Contribute: Not supported by USDA (read-only API)
   */
  async contribute(data: NutritionData): Promise<boolean> {
    console.warn('USDA FoodData Central does not support user contributions')
    return false
  }

  /**
   * Normalize USDA response to our NutritionData format
   * IMPORTANT: Branded foods have nutrients per serving, must scale to per-100g
   * Foundation/SR Legacy foods are already per 100g
   */
  private normalizeResponse(barcode: string, food: any): NutritionData | null {
    if (!food) return null

    // Extract product name and brand
    const productName = food.description || 'Unknown Product'
    const brand = food.brandOwner || food.brandName || undefined

    // Extract serving size
    const servingSize = food.servingSize || food.householdServingFullText || '1'
    const servingUnit = food.servingSizeUnit || 'serving'

    // Extract ingredients
    const ingredients = food.ingredients
      ? food.ingredients.split(',').map((i: string) => i.trim())
      : []

    // Build nutrient profile from foodNutrients array
    // Handle both Branded (nutrientId, value) and Foundation (nutrient.id, amount) formats
    const nutrientMap = new Map()
    if (food.foodNutrients) {
      for (const nutrient of food.foodNutrients) {
        // Branded foods: nutrientId directly on object
        const id = nutrient.nutrientId || nutrient.nutrientNumber || nutrient.nutrient?.id
        const value = nutrient.value ?? nutrient.amount ?? 0
        if (id) {
          nutrientMap.set(id, value)
        }
      }
    }

    // USDA Nutrient IDs (standardized across FoodData Central)
    // Note: Despite derivationDescription saying "per serving", the API
    // normalizes all values to per 100g for consistency
    const nutrients = {
      // Macros
      calories: nutrientMap.get(1008) || 0, // Energy (kcal)
      protein_g: nutrientMap.get(1003) || 0, // Protein
      carbs_g: nutrientMap.get(1005) || 0, // Carbohydrate
      fat_g: nutrientMap.get(1004) || 0, // Total lipid (fat)

      // Common macros
      fiber_g: nutrientMap.get(1079), // Fiber, total dietary
      sugar_g: nutrientMap.get(2000), // Sugars, total
      saturated_fat_g: nutrientMap.get(1258), // Fatty acids, total saturated
      trans_fat_g: nutrientMap.get(1257), // Fatty acids, total trans

      // Minerals (all in mg)
      sodium_mg: nutrientMap.get(1093), // Sodium
      potassium_mg: nutrientMap.get(1092), // Potassium
      calcium_mg: nutrientMap.get(1087), // Calcium
      iron_mg: nutrientMap.get(1089), // Iron
      magnesium_mg: nutrientMap.get(1090), // Magnesium
      zinc_mg: nutrientMap.get(1095), // Zinc
      phosphorus_mg: nutrientMap.get(1091), // Phosphorus

      // Vitamins
      vitamin_a_mcg: nutrientMap.get(1106), // Vitamin A (RAE)
      vitamin_c_mg: nutrientMap.get(1162), // Vitamin C
      vitamin_d_mcg: nutrientMap.get(1114), // Vitamin D (D2 + D3)
      vitamin_e_mg: nutrientMap.get(1109), // Vitamin E (alpha-tocopherol)
      vitamin_k_mcg: nutrientMap.get(1185), // Vitamin K (phylloquinone)
      vitamin_b1_mg: nutrientMap.get(1165), // Thiamin
      vitamin_b2_mg: nutrientMap.get(1166), // Riboflavin
      vitamin_b6_mg: nutrientMap.get(1175), // Vitamin B-6
      vitamin_b12_mcg: nutrientMap.get(1178), // Vitamin B-12
      folate_mcg: nutrientMap.get(1177), // Folate, total

      // Other
      cholesterol_mg: nutrientMap.get(1253), // Cholesterol
      caffeine_mg: nutrientMap.get(1057), // Caffeine
    }

    return {
      barcode,
      productName,
      brand,
      servingSize,
      servingUnit,
      nutrients,
      ingredients,
      allergens: undefined, // USDA doesn't provide structured allergen data
      imageUrl: undefined, // USDA doesn't provide product images
      source: 'usda',
      lastUpdated: Date.now(),
    }
  }
}

// Singleton instance
export const usdaProvider = new USDAProvider(appConfig.nutritionApis?.usdaApiKey || 'DEMO_KEY')
