/**
 * OpenFoodFacts Contributor
 *
 * Handles submission of nutrition data to OpenFoodFacts API
 */

import type { NutritionData } from './nutrition-types'

export interface ContributionResult {
  success: boolean
  error?: string
}

/**
 * OpenFoodFacts API contributor
 */
export class OpenFoodFactsContributor {
  private readonly apiUrl = 'https://world.openfoodfacts.org/cgi/product_jqm2.pl'
  private readonly userId = 'nomie-app'

  /**
   * Submit nutrition data to OpenFoodFacts
   */
  async submit(data: NutritionData, userEmail?: string): Promise<ContributionResult> {
    try {
      // Build form data
      const formData = new URLSearchParams()

      // Authentication
      formData.append('user_id', this.userId)
      formData.append('password', userEmail || '')

      // Product info
      formData.append('code', data.barcode)
      formData.append('product_name', data.productName)
      if (data.brand) formData.append('brands', data.brand)
      formData.append('serving_size', data.servingSize)

      // Macronutrients (convert as needed)
      formData.append('nutriment_energy', String(data.nutrients.calories * 4.184)) // kcal → kJ
      formData.append('nutriment_proteins', String(data.nutrients.protein_g))
      formData.append('nutriment_carbohydrates', String(data.nutrients.carbs_g))
      formData.append('nutriment_fat', String(data.nutrients.fat_g))

      // Extended macros (optional)
      if (data.nutrients.fiber_g) formData.append('nutriment_fiber', String(data.nutrients.fiber_g))
      if (data.nutrients.sugar_g) formData.append('nutriment_sugars', String(data.nutrients.sugar_g))
      if (data.nutrients.saturated_fat_g) formData.append('nutriment_saturated_fat', String(data.nutrients.saturated_fat_g))
      if (data.nutrients.trans_fat_g) formData.append('nutriment_trans_fat', String(data.nutrients.trans_fat_g))

      // Minerals (convert mg → g)
      if (data.nutrients.sodium_mg) formData.append('nutriment_sodium', String(data.nutrients.sodium_mg / 1000))
      if (data.nutrients.potassium_mg) formData.append('nutriment_potassium', String(data.nutrients.potassium_mg / 1000))
      if (data.nutrients.calcium_mg) formData.append('nutriment_calcium', String(data.nutrients.calcium_mg / 1000))
      if (data.nutrients.iron_mg) formData.append('nutriment_iron', String(data.nutrients.iron_mg / 1000))

      // Vitamins (convert mcg → mg where needed)
      if (data.nutrients.vitamin_a_mcg) formData.append('nutriment_vitamin_a', String(data.nutrients.vitamin_a_mcg / 1000))
      if (data.nutrients.vitamin_c_mg) formData.append('nutriment_vitamin_c', String(data.nutrients.vitamin_c_mg))
      if (data.nutrients.vitamin_d_mcg) formData.append('nutriment_vitamin_d', String(data.nutrients.vitamin_d_mcg / 1000))

      // Additional nutrients
      if (data.nutrients.cholesterol_mg) formData.append('nutriment_cholesterol', String(data.nutrients.cholesterol_mg / 1000))
      if (data.nutrients.caffeine_mg) formData.append('nutriment_caffeine', String(data.nutrients.caffeine_mg / 1000))

      // Text fields
      if (data.ingredients.length > 0) formData.append('ingredients_text', data.ingredients.join(', '))
      if (data.allergens && data.allergens.length > 0) formData.append('allergens', data.allergens.join(', '))
      if (data.imageUrl) formData.append('image_url', data.imageUrl)

      // Submit
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      })

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const result = await response.json()

      if (result.status === 1) {
        return { success: true }
      } else {
        return {
          success: false,
          error: result.status_verbose || 'Unknown error from OpenFoodFacts',
        }
      }
    } catch (error) {
      console.error('Failed to submit to OpenFoodFacts:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      }
    }
  }
}

// Export singleton instance
export const openfoodfactsContributor = new OpenFoodFactsContributor()
