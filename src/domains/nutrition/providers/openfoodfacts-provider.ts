/**
 * OpenFoodFacts API Provider
 *
 * Free, community-driven nutrition database
 * API Docs: https://wiki.openfoodfacts.org/API
 */

import type {
  NutritionProvider,
  NutritionData,
  OpenFoodFactsResponse,
  NutritionContribution,
} from '../nutrition-types'

export class OpenFoodFactsProvider implements NutritionProvider {
  name = 'openfoodfacts'
  requiresApiKey = false

  private readonly baseUrl = 'https://world.openfoodfacts.org/api/v2'
  private readonly userAgent = 'Nomie6-OSS/1.0 (https://github.com/open-nomie/nomie6-oss)'

  /**
   * Lookup product by barcode
   */
  async lookup(barcode: string): Promise<NutritionData | null> {
    try {
      const url = `${this.baseUrl}/product/${barcode}.json`
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
        },
      })

      if (!response.ok) {
        console.error(`OpenFoodFacts API error: ${response.status}`)
        return null
      }

      const json: OpenFoodFactsResponse = await response.json()

      if (json.status === 0 || !json.product) {
        // Product not found
        return null
      }

      return this.normalizeResponse(barcode, json)
    } catch (error) {
      console.error('OpenFoodFacts lookup failed:', error)
      return null
    }
  }

  /**
   * Search for products by name
   */
  async search(query: string): Promise<NutritionData[]> {
    try {
      const url = `${this.baseUrl}/search?search_terms=${encodeURIComponent(query)}&page_size=10&json=true`
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
        },
      })

      if (!response.ok) {
        console.error(`OpenFoodFacts search error: ${response.status}`)
        return []
      }

      const json = await response.json()
      const products = json.products || []

      const normalized = products
        .map((product: any) =>
          this.normalizeResponse(product.code || '', { status: 1, product })
        )
        .filter((data: NutritionData | null) => data !== null) as NutritionData[]

      // Score and filter by relevance (minimum score of 0.3)
      const scored = normalized
        .map(product => ({
          product,
          score: this.calculateRelevanceScore(query, product)
        }))
        .filter(item => item.score >= 0.3)
        .sort((a, b) => b.score - a.score)
        .map(item => item.product)

      return scored
    } catch (error) {
      console.error('OpenFoodFacts search failed:', error)
      return []
    }
  }

  /**
   * Contribute a new product to OpenFoodFacts
   * Note: Requires user authentication (not implemented in Phase 1)
   */
  async contribute(data: NutritionData): Promise<boolean> {
    console.warn('OpenFoodFacts contribution not yet implemented (Phase 7)')
    // TODO: Implement in Phase 7
    // Will require user authentication and proper form submission
    return false
  }

  /**
   * Calculate relevance score for search results (0-1)
   * Higher score = more relevant to search query
   */
  private calculateRelevanceScore(query: string, product: NutritionData): number {
    const normalizedQuery = query.toLowerCase().trim()
    const normalizedName = product.productName.toLowerCase().trim()
    const normalizedBrand = (product.brand || '').toLowerCase().trim()

    let score = 0

    // Exact match in name (very high score)
    if (normalizedName === normalizedQuery) {
      score += 1.0
    }
    // Name starts with query (high score)
    else if (normalizedName.startsWith(normalizedQuery)) {
      score += 0.8
    }
    // Query is contained in name (medium score)
    else if (normalizedName.includes(normalizedQuery)) {
      score += 0.6
    }
    // Check individual words
    else {
      const queryWords = normalizedQuery.split(/\s+/)
      const nameWords = normalizedName.split(/\s+/)
      const matchedWords = queryWords.filter(qw =>
        nameWords.some(nw => nw.includes(qw) || qw.includes(nw))
      )
      score += (matchedWords.length / queryWords.length) * 0.5
    }

    // Brand match bonus
    if (normalizedBrand) {
      const queryWords = normalizedQuery.split(/\s+/)
      if (queryWords.some(word => normalizedBrand.includes(word))) {
        score += 0.2
      }
    }

    // Nutrient completeness bonus (up to 0.1)
    const nutrientCount = Object.values(product.nutrients).filter(v => v !== undefined).length
    score += Math.min(nutrientCount / 100, 0.1)

    return Math.min(score, 1.0)
  }

  /**
   * Normalize OpenFoodFacts response to our NutritionData format
   */
  private normalizeResponse(
    barcode: string,
    response: OpenFoodFactsResponse
  ): NutritionData | null {
    const product = response.product
    if (!product) return null

    const nutriments = product.nutriments || {}

    // Extract product name and brand
    const productName = product.product_name || 'Unknown Product'
    const brand = product.brands || undefined

    // Extract serving size
    const servingSize = product.serving_size || '1 serving'
    const servingUnit = this.extractServingUnit(servingSize)

    // Extract ingredients
    const ingredients = product.ingredients_text
      ? product.ingredients_text.split(',').map((i: string) => i.trim())
      : []

    // Extract allergens
    const allergens = product.allergens
      ? product.allergens.split(',').map((a: string) => a.trim().replace('en:', ''))
      : undefined

    // Extract image URL
    const imageUrl = product.image_url || undefined

    // Build nutrient profile
    const nutrients = {
      // Macros
      calories: nutriments['energy-kcal'] || 0,
      protein_g: nutriments.proteins || 0,
      carbs_g: nutriments.carbohydrates || 0,
      fat_g: nutriments.fat || 0,

      // Common macros
      fiber_g: nutriments.fiber,
      sugar_g: nutriments.sugars,
      saturated_fat_g: nutriments['saturated-fat'],
      trans_fat_g: nutriments['trans-fat'],
      monounsaturated_fat_g: nutriments['monounsaturated-fat'],
      polyunsaturated_fat_g: nutriments['polyunsaturated-fat'],

      // Minerals (OpenFoodFacts uses g, we need mg)
      sodium_mg: nutriments.sodium ? nutriments.sodium * 1000 : nutriments.salt ? (nutriments.salt * 1000) / 2.5 : undefined,
      potassium_mg: nutriments.potassium ? nutriments.potassium * 1000 : undefined,
      calcium_mg: nutriments.calcium ? nutriments.calcium * 1000 : undefined,
      iron_mg: nutriments.iron ? nutriments.iron * 1000 : undefined,
      magnesium_mg: nutriments.magnesium ? nutriments.magnesium * 1000 : undefined,
      zinc_mg: nutriments.zinc ? nutriments.zinc * 1000 : undefined,
      phosphorus_mg: nutriments.phosphorus ? nutriments.phosphorus * 1000 : undefined,

      // Vitamins
      vitamin_a_mcg: nutriments['vitamin-a'] ? nutriments['vitamin-a'] * 1000000 : undefined,
      vitamin_c_mg: nutriments['vitamin-c'] ? nutriments['vitamin-c'] * 1000 : undefined,
      vitamin_d_mcg: nutriments['vitamin-d'] ? nutriments['vitamin-d'] * 1000000 : undefined,
      vitamin_e_mg: nutriments['vitamin-e'] ? nutriments['vitamin-e'] * 1000 : undefined,
      vitamin_k_mcg: nutriments['vitamin-k'] ? nutriments['vitamin-k'] * 1000000 : undefined,
      vitamin_b1_mg: nutriments['vitamin-b1'] ? nutriments['vitamin-b1'] * 1000 : undefined,
      vitamin_b2_mg: nutriments['vitamin-b2'] ? nutriments['vitamin-b2'] * 1000 : undefined,
      vitamin_b6_mg: nutriments['vitamin-b6'] ? nutriments['vitamin-b6'] * 1000 : undefined,
      vitamin_b12_mcg: nutriments['vitamin-b12'] ? nutriments['vitamin-b12'] * 1000000 : undefined,
      folate_mcg: nutriments.folate ? nutriments.folate * 1000000 : undefined,

      // Other
      cholesterol_mg: nutriments.cholesterol ? nutriments.cholesterol * 1000 : undefined,
      caffeine_mg: nutriments.caffeine ? nutriments.caffeine * 1000 : undefined,
      alcohol_g: nutriments.alcohol,
    }

    return {
      barcode,
      productName,
      brand,
      servingSize,
      servingUnit,
      nutrients,
      ingredients,
      allergens,
      imageUrl,
      source: 'openfoodfacts',
      lastUpdated: Date.now(),
    }
  }

  /**
   * Extract serving unit from serving size string
   * Examples:
   * "1 can (473ml)" → "can"
   * "60g" → "g"
   * "1 bar" → "bar"
   */
  private extractServingUnit(servingSize: string): string {
    const normalized = servingSize.toLowerCase().trim()

    // Check for common units
    const unitPatterns = [
      { pattern: /\b(can|bottle|bar|serving|piece|slice|cup|tbsp|tsp)\b/, unit: '$1' },
      { pattern: /(\d+)\s*(g|ml|oz|lb)\b/, unit: '$2' },
      { pattern: /\(([^)]+)\)/, unit: '$1' }, // Extract from parentheses
    ]

    for (const { pattern, unit } of unitPatterns) {
      const match = normalized.match(pattern)
      if (match) {
        return match[1] || unit
      }
    }

    return 'serving' // Default fallback
  }
}
