/**
 * Nutritionix API Provider
 *
 * Commercial nutrition database with comprehensive food data
 * API Docs: https://developer.nutritionix.com/docs/v2
 * Requires: App ID and API Key (free tier available)
 */

import type {
  NutritionProvider,
  NutritionData,
  NutritionixResponse,
  NutritionContribution,
} from '../nutrition-types'

export class NutritionixProvider implements NutritionProvider {
  name = 'nutritionix'
  requiresApiKey = true

  private readonly baseUrl = 'https://trackapi.nutritionix.com/v2'
  private appId: string
  private apiKey: string

  constructor(appId: string, apiKey: string) {
    this.appId = appId
    this.apiKey = apiKey
  }

  /**
   * Lookup product by barcode (UPC)
   */
  async lookup(barcode: string): Promise<NutritionData | null> {
    if (!this.appId || !this.apiKey) {
      console.warn('Nutritionix API credentials not configured')
      return null
    }

    try {
      const url = `${this.baseUrl}/search/item?upc=${barcode}`
      const response = await fetch(url, {
        headers: {
          'x-app-id': this.appId,
          'x-app-key': this.apiKey,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          // Product not found
          return null
        }
        console.error(`Nutritionix API error: ${response.status}`)
        return null
      }

      const json: NutritionixResponse = await response.json()

      if (!json.foods || json.foods.length === 0) {
        return null
      }

      return this.normalizeResponse(barcode, json.foods[0])
    } catch (error) {
      console.error('Nutritionix lookup failed:', error)
      return null
    }
  }

  /**
   * Search for products by name
   */
  async search(query: string): Promise<NutritionData[]> {
    if (!this.appId || !this.apiKey) {
      console.warn('Nutritionix API credentials not configured')
      return []
    }

    try {
      const url = `${this.baseUrl}/search/instant?query=${encodeURIComponent(query)}`
      const response = await fetch(url, {
        headers: {
          'x-app-id': this.appId,
          'x-app-key': this.apiKey,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        console.error(`Nutritionix search error: ${response.status}`)
        return []
      }

      const json = await response.json()
      const branded = json.branded || []

      return branded
        .slice(0, 10)
        .map((item: any) => this.normalizeResponse(item.nix_item_id || '', item))
        .filter((data: NutritionData | null) => data !== null) as NutritionData[]
    } catch (error) {
      console.error('Nutritionix search failed:', error)
      return []
    }
  }

  /**
   * Contribute: Not supported by Nutritionix (read-only API)
   */
  async contribute(data: NutritionData): Promise<boolean> {
    console.warn('Nutritionix does not support user contributions')
    return false
  }

  /**
   * Normalize Nutritionix response to our NutritionData format
   */
  private normalizeResponse(barcode: string, food: any): NutritionData | null {
    if (!food) return null

    // Extract product name and brand
    const productName = food.food_name || food.brand_name_item_name || 'Unknown Product'
    const brand = food.brand_name || undefined

    // Extract serving size
    const servingQty = food.serving_qty || 1
    const servingUnit = food.serving_unit || 'serving'
    const servingWeight = food.serving_weight_grams || undefined
    const servingSize = servingWeight
      ? `${servingQty} ${servingUnit} (${servingWeight}g)`
      : `${servingQty} ${servingUnit}`

    // Extract image URL
    const imageUrl = food.photo?.thumb || food.photo?.highres || undefined

    // Build nutrient profile
    const nutrients = {
      // Macros
      calories: food.nf_calories || 0,
      protein_g: food.nf_protein || 0,
      carbs_g: food.nf_total_carbohydrate || 0,
      fat_g: food.nf_total_fat || 0,

      // Common macros
      fiber_g: food.nf_dietary_fiber,
      sugar_g: food.nf_sugars,
      saturated_fat_g: food.nf_saturated_fat,
      trans_fat_g: undefined, // Not provided by Nutritionix

      // Minerals
      sodium_mg: food.nf_sodium,
      potassium_mg: food.nf_potassium,
      calcium_mg: undefined, // Not in standard response
      iron_mg: undefined, // Not in standard response
      magnesium_mg: undefined,
      zinc_mg: undefined,
      phosphorus_mg: food.nf_p,

      // Vitamins - Not in standard Nutritionix response
      vitamin_a_mcg: undefined,
      vitamin_c_mg: undefined,
      vitamin_d_mcg: undefined,
      vitamin_e_mg: undefined,
      vitamin_k_mcg: undefined,
      vitamin_b1_mg: undefined,
      vitamin_b2_mg: undefined,
      vitamin_b6_mg: undefined,
      vitamin_b12_mcg: undefined,
      folate_mcg: undefined,

      // Other
      cholesterol_mg: food.nf_cholesterol,
      caffeine_mg: undefined,
    }

    return {
      barcode,
      productName,
      brand,
      servingSize: `${servingQty}`,
      servingUnit,
      nutrients,
      ingredients: [], // Nutritionix doesn't provide detailed ingredients in barcode lookup
      allergens: undefined,
      imageUrl,
      source: 'nutritionix',
      lastUpdated: Date.now(),
    }
  }
}
