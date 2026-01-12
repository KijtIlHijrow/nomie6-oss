/**
 * Nutrition Tracking Type Definitions
 *
 * Core types for barcode scanning and nutrition data management
 */

/**
 * Nutrition data for a food product
 * Contains macros, micronutrients, and product metadata
 */
export interface NutritionData {
  barcode: string
  productName: string
  brand?: string
  servingSize: string // "1 can (473ml)", "1 bar (60g)"
  servingUnit: string // "can", "bar", "g", "ml"
  nutrients: NutrientProfile
  ingredients: string[] // ["Water", "Caffeine", "Taurine"]
  allergens?: string[] // ["milk", "soy", "tree nuts"]
  imageUrl?: string // For product verification
  source: NutritionDataSource
  lastUpdated: number // Timestamp
}

/**
 * Complete nutrient profile for a food product
 * All values per serving as specified in servingSize
 */
export interface NutrientProfile {
  // Macronutrients (always present)
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number

  // Common macros (often present)
  fiber_g?: number
  sugar_g?: number
  saturated_fat_g?: number
  trans_fat_g?: number

  // Minerals (mg unless noted)
  sodium_mg?: number
  potassium_mg?: number
  calcium_mg?: number
  iron_mg?: number
  magnesium_mg?: number
  zinc_mg?: number
  phosphorus_mg?: number

  // Vitamins
  vitamin_a_mcg?: number
  vitamin_c_mg?: number
  vitamin_d_mcg?: number
  vitamin_e_mg?: number
  vitamin_k_mcg?: number
  vitamin_b1_mg?: number // Thiamin
  vitamin_b2_mg?: number // Riboflavin
  vitamin_b3_mg?: number // Niacin
  vitamin_b6_mg?: number
  vitamin_b12_mcg?: number
  folate_mcg?: number
  biotin_mcg?: number
  pantothenic_acid_mg?: number

  // Other nutrients
  cholesterol_mg?: number
  caffeine_mg?: number
  taurine_mg?: number
  alcohol_g?: number

  // Extensible for any other nutrient
  [key: string]: number | undefined
}

/**
 * Source of nutrition data
 */
export type NutritionDataSource =
  | 'openfoodfacts'
  | 'nutritionix'
  | 'usda'
  | 'user_contributed'

/**
 * API provider interface
 * Each nutrition database implements this interface
 */
export interface NutritionProvider {
  name: string
  requiresApiKey: boolean
  lookup(barcode: string): Promise<NutritionData | null>
  search?(query: string): Promise<NutritionData[]>
  contribute?(data: NutritionData): Promise<boolean>
}

/**
 * Cached nutrition data with timestamp
 */
export interface CachedNutrition {
  barcode: string
  data: NutritionData
  cachedAt: number
}

/**
 * User contribution to nutrition database
 * Queued for submission when online
 */
export interface NutritionContribution {
  id?: number // IndexedDB auto-increment
  data: NutritionData
  queuedAt: number
  synced: boolean
  syncedAt?: number
  error?: string
}

/**
 * Barcode format validation result
 */
export interface BarcodeValidation {
  valid: boolean
  format?: 'UPC-A' | 'EAN-13' | 'EAN-8'
  error?: string
}

/**
 * Nutrition data validation result
 */
export interface NutritionValidation {
  valid: boolean
  warnings: string[]
  missingRequired: string[]
}

/**
 * Nutrition tracker specification
 * Defines how to create a tracker for a nutrient
 */
export interface NutritionTrackerSpec {
  nutrientKey: string // Key in NutrientProfile (e.g., "calories", "protein_g")
  tag: string // Tracker tag (e.g., "calories", "protein")
  label: string // Display name (e.g., "Calories", "Protein")
  uom: string // Unit of measure (e.g., "kcal", "gram", "mg")
  required: boolean // Always create this tracker
  color?: string // Tracker color
}

/**
 * Result of nutrition entry creation
 */
export interface NutritionEntryResult {
  success: boolean
  entriesCreated: number
  trackersCreated: number
  productName: string
  error?: string
}

/**
 * Nutrition API configuration
 */
export interface NutritionApiConfig {
  enabled: boolean
  primaryProvider: 'openfoodfacts' | 'nutritionix' | 'usda'

  // Nutritionix credentials (optional)
  nutritionixAppId: string
  nutritionixApiKey: string

  // Behavior settings
  autoCreateTrackers: boolean
  trackMicronutrients: boolean
  cacheExpiry: number // Milliseconds

  // Rate limiting
  maxApiCallsPerMinute: number

  // Contribution settings
  contributeToOpenFoodFacts: boolean
}

/**
 * OpenFoodFacts API response (raw)
 * This is what we receive from their API
 */
export interface OpenFoodFactsResponse {
  status: number
  product?: {
    product_name?: string
    brands?: string
    serving_size?: string
    image_url?: string
    ingredients_text?: string
    allergens?: string
    nutriments?: {
      'energy-kcal'?: number
      proteins?: number
      carbohydrates?: number
      fat?: number
      fiber?: number
      sugars?: number
      salt?: number
      sodium?: number
      'saturated-fat'?: number
      'trans-fat'?: number
      cholesterol?: number
      calcium?: number
      iron?: number
      'vitamin-a'?: number
      'vitamin-c'?: number
      'vitamin-d'?: number
      caffeine?: number
      [key: string]: any
    }
  }
}

/**
 * Nutritionix API response (raw)
 */
export interface NutritionixResponse {
  foods?: Array<{
    food_name?: string
    brand_name?: string
    serving_qty?: number
    serving_unit?: string
    serving_weight_grams?: number
    nf_calories?: number
    nf_total_fat?: number
    nf_saturated_fat?: number
    nf_trans_fat?: number
    nf_cholesterol?: number
    nf_sodium?: number
    nf_total_carbohydrate?: number
    nf_dietary_fiber?: number
    nf_sugars?: number
    nf_protein?: number
    nf_potassium?: number
    photo?: { thumb?: string }
    [key: string]: any
  }>
}

/**
 * USDA FoodData Central API response (raw)
 */
export interface USDAResponse {
  foods?: Array<{
    description?: string
    brandOwner?: string
    servingSize?: number
    servingSizeUnit?: string
    foodNutrients?: Array<{
      nutrientId?: number
      nutrientName?: string
      value?: number
      unitName?: string
    }>
  }>
}
