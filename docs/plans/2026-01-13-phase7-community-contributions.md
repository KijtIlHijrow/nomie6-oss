# Phase 7: Community Contributions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to contribute nutrition data to OpenFoodFacts when barcode scanning fails across all providers.

**Architecture:** Inline form in AI chat (needs_manual_contribution action) → Hybrid submission (immediate + queue fallback) → Background sync service for queued contributions.

**Tech Stack:** Svelte, TypeScript, IndexedDB (idb), OpenFoodFacts API

---

## Task 1: OpenFoodFacts Contributor Module

**Files:**
- Create: `src/domains/nutrition/openfoodfacts-contributor.ts`
- Test: Manual verification (Phase 8 for unit tests)

**Step 1: Create OpenFoodFacts contributor module**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/domains/nutrition/openfoodfacts-contributor.ts
git commit -m "feat: add OpenFoodFacts contributor module

- Transforms NutritionData to OpenFoodFacts API format
- Handles unit conversions (kcal→kJ, mg→g, mcg→mg)
- Returns success/error result
- Singleton instance for easy import

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Extend Nutrition Service with Contribution Method

**Files:**
- Modify: `src/domains/nutrition/nutrition-service.ts` (add method after line ~120)
- Modify: `src/domains/nutrition/nutrition-types.ts` (add interface)

**Step 1: Add ContributionResult interface to nutrition-types.ts**

Add after line 182 (after NutritionApiConfig):

```typescript
/**
 * Result of nutrition data contribution
 */
export interface ContributionResult {
  success: boolean
  queued: boolean
  error?: string
}
```

**Step 2: Add contributeProduct method to NutritionService**

Add this method to the NutritionService class (after the lookup method):

```typescript
  /**
   * Contribute nutrition data to OpenFoodFacts
   * Hybrid approach: Try immediate submission, queue on failure
   */
  async contributeProduct(data: NutritionData, userEmail?: string): Promise<ContributionResult> {
    try {
      // Validate required fields
      const validation = this.validateNutritionData(data)
      if (!validation.valid) {
        return {
          success: false,
          queued: false,
          error: `Invalid data: ${validation.missingRequired.join(', ')}`,
        }
      }

      // Try immediate submission if online
      if (navigator.onLine) {
        const { openfoodfactsContributor } = await import('./openfoodfacts-contributor')
        const result = await openfoodfactsContributor.submit(data, userEmail)

        if (result.success) {
          // Cache the contributed data locally
          await barcodeCache.instance.set(data.barcode, data)
          return {
            success: true,
            queued: false,
          }
        }

        // If API validation error (not network error), don't queue
        if (result.error && !result.error.includes('Network')) {
          return {
            success: false,
            queued: false,
            error: result.error,
          }
        }

        // Network error - fall through to queue
      }

      // Queue for later sync (offline or network error)
      await barcodeCache.instance.queueContribution(data)
      return {
        success: true,
        queued: true,
      }
    } catch (error) {
      console.error('Failed to contribute product:', error)
      // Queue on any error
      await barcodeCache.instance.queueContribution(data)
      return {
        success: true,
        queued: true,
      }
    }
  }

  /**
   * Validate nutrition data before submission
   */
  private validateNutritionData(data: NutritionData): NutritionValidation {
    const missingRequired: string[] = []
    const warnings: string[] = []

    // Required fields
    if (!data.barcode || data.barcode.length < 8) missingRequired.push('barcode')
    if (!data.productName || data.productName.length < 2) missingRequired.push('productName')
    if (!data.servingSize) missingRequired.push('servingSize')
    if (!data.servingUnit) missingRequired.push('servingUnit')
    if (data.nutrients.calories === undefined || data.nutrients.calories < 0) missingRequired.push('calories')
    if (data.nutrients.protein_g === undefined || data.nutrients.protein_g < 0) missingRequired.push('protein')
    if (data.nutrients.carbs_g === undefined || data.nutrients.carbs_g < 0) missingRequired.push('carbohydrates')
    if (data.nutrients.fat_g === undefined || data.nutrients.fat_g < 0) missingRequired.push('fat')

    // Warnings for suspicious values
    if (data.nutrients.calories > 2000) warnings.push('Unusually high calories per serving')
    if (data.nutrients.protein_g > 100) warnings.push('Unusually high protein')

    return {
      valid: missingRequired.length === 0,
      warnings,
      missingRequired,
    }
  }
```

**Step 3: Add import at top of nutrition-service.ts**

```typescript
import type { NutritionProvider, NutritionData, BarcodeValidation, ContributionResult, NutritionValidation } from './nutrition-types'
```

**Step 4: Commit**

```bash
git add src/domains/nutrition/nutrition-service.ts src/domains/nutrition/nutrition-types.ts
git commit -m "feat: add contribution method to nutrition service

- contributeProduct() with hybrid submission logic
- Validates required fields before submission
- Tries immediate OpenFoodFacts POST
- Falls back to queue on network errors
- Caches successful contributions locally

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Manual Nutrition Form Component

**Files:**
- Create: `src/domains/nutrition/components/ManualNutritionForm.svelte`

**Step 1: Create comprehensive nutrition form component**

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { NutritionData } from '../nutrition-types'

  const dispatch = createEventDispatcher<{
    submit: NutritionData
    cancel: void
  }>()

  export let barcode: string
  export let loading = false

  // Product info
  let productName = ''
  let brand = ''

  // Serving
  let servingSize = ''
  let servingUnit = 'g'

  // Macros (required)
  let calories = ''
  let protein = ''
  let carbs = ''
  let fat = ''

  // Extended macros
  let fiber = ''
  let sugar = ''
  let saturatedFat = ''
  let transFat = ''

  // Minerals
  let sodium = ''
  let potassium = ''
  let calcium = ''
  let iron = ''

  // Vitamins
  let vitaminA = ''
  let vitaminC = ''
  let vitaminD = ''

  // Other
  let cholesterol = ''
  let caffeine = ''
  let ingredients = ''
  let allergens: string[] = []
  let imageUrl = ''

  // UI state
  let showExtendedMacros = false
  let showMinerals = false
  let showVitamins = false
  let showOther = false

  // Validation errors
  let errors: Record<string, string> = {}

  const servingUnits = [
    { value: 'g', label: 'Grams (g)' },
    { value: 'ml', label: 'Milliliters (ml)' },
    { value: 'oz', label: 'Ounces (oz)' },
    { value: 'cup', label: 'Cup' },
    { value: 'piece', label: 'Piece' },
    { value: 'can', label: 'Can' },
    { value: 'bottle', label: 'Bottle' },
    { value: 'bar', label: 'Bar' },
  ]

  const allergenOptions = [
    'Milk', 'Eggs', 'Fish', 'Shellfish', 'Tree nuts',
    'Peanuts', 'Wheat', 'Soy', 'Sesame'
  ]

  function validateForm(): boolean {
    errors = {}

    if (!productName || productName.length < 2) {
      errors.productName = 'Product name must be at least 2 characters'
    }
    if (!servingSize || parseFloat(servingSize) <= 0) {
      errors.servingSize = 'Serving size must be greater than 0'
    }
    if (!calories || parseFloat(calories) < 0) {
      errors.calories = 'Calories required (0 or greater)'
    }
    if (!protein || parseFloat(protein) < 0) {
      errors.protein = 'Protein required (0 or greater)'
    }
    if (!carbs || parseFloat(carbs) < 0) {
      errors.carbs = 'Carbohydrates required (0 or greater)'
    }
    if (!fat || parseFloat(fat) < 0) {
      errors.fat = 'Fat required (0 or greater)'
    }

    return Object.keys(errors).length === 0
  }

  function handleSubmit() {
    if (!validateForm()) return

    const ingredientsArray = ingredients
      .split(',')
      .map((i) => i.trim())
      .filter((i) => i.length > 0)

    const nutritionData: NutritionData = {
      barcode,
      productName,
      brand: brand || undefined,
      servingSize,
      servingUnit,
      nutrients: {
        calories: parseFloat(calories),
        protein_g: parseFloat(protein),
        carbs_g: parseFloat(carbs),
        fat_g: parseFloat(fat),
        fiber_g: fiber ? parseFloat(fiber) : undefined,
        sugar_g: sugar ? parseFloat(sugar) : undefined,
        saturated_fat_g: saturatedFat ? parseFloat(saturatedFat) : undefined,
        trans_fat_g: transFat ? parseFloat(transFat) : undefined,
        sodium_mg: sodium ? parseFloat(sodium) : undefined,
        potassium_mg: potassium ? parseFloat(potassium) : undefined,
        calcium_mg: calcium ? parseFloat(calcium) : undefined,
        iron_mg: iron ? parseFloat(iron) : undefined,
        vitamin_a_mcg: vitaminA ? parseFloat(vitaminA) : undefined,
        vitamin_c_mg: vitaminC ? parseFloat(vitaminC) : undefined,
        vitamin_d_mcg: vitaminD ? parseFloat(vitaminD) : undefined,
        cholesterol_mg: cholesterol ? parseFloat(cholesterol) : undefined,
        caffeine_mg: caffeine ? parseFloat(caffeine) : undefined,
      },
      ingredients: ingredientsArray,
      allergens: allergens.length > 0 ? allergens : undefined,
      imageUrl: imageUrl || undefined,
      source: 'user_contributed',
      lastUpdated: Date.now(),
    }

    dispatch('submit', nutritionData)
  }

  function handleCancel() {
    dispatch('cancel')
  }
</script>

<div class="manual-nutrition-form p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
  <h3 class="text-lg font-semibold mb-4">Add Product to Database</h3>

  <!-- Product Information -->
  <div class="mb-4">
    <h4 class="font-medium mb-2">Product Information</h4>

    <div class="mb-2">
      <label class="block text-sm mb-1">Barcode</label>
      <input
        type="text"
        value={barcode}
        disabled
        class="w-full px-3 py-2 border rounded bg-gray-200 dark:bg-gray-700"
      />
    </div>

    <div class="mb-2">
      <label class="block text-sm mb-1">Product Name *</label>
      <input
        type="text"
        bind:value={productName}
        placeholder="e.g., Red Bull Energy Drink"
        class="w-full px-3 py-2 border rounded {errors.productName ? 'border-red-500' : ''}"
      />
      {#if errors.productName}
        <p class="text-red-500 text-xs mt-1">{errors.productName}</p>
      {/if}
    </div>

    <div class="mb-2">
      <label class="block text-sm mb-1">Brand (optional)</label>
      <input
        type="text"
        bind:value={brand}
        placeholder="e.g., Red Bull"
        class="w-full px-3 py-2 border rounded"
      />
    </div>
  </div>

  <!-- Serving Information -->
  <div class="mb-4">
    <h4 class="font-medium mb-2">Serving Information</h4>

    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class="block text-sm mb-1">Serving Size *</label>
        <input
          type="number"
          step="0.1"
          bind:value={servingSize}
          placeholder="473"
          class="w-full px-3 py-2 border rounded {errors.servingSize ? 'border-red-500' : ''}"
        />
        {#if errors.servingSize}
          <p class="text-red-500 text-xs mt-1">{errors.servingSize}</p>
        {/if}
      </div>

      <div>
        <label class="block text-sm mb-1">Unit *</label>
        <select bind:value={servingUnit} class="w-full px-3 py-2 border rounded">
          {#each servingUnits as unit}
            <option value={unit.value}>{unit.label}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  <!-- Macronutrients (Required) -->
  <div class="mb-4">
    <h4 class="font-medium mb-2">Macronutrients (per serving) *</h4>

    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class="block text-sm mb-1">Calories (kcal)</label>
        <input
          type="number"
          step="0.1"
          bind:value={calories}
          placeholder="110"
          class="w-full px-3 py-2 border rounded {errors.calories ? 'border-red-500' : ''}"
        />
        {#if errors.calories}
          <p class="text-red-500 text-xs mt-1">{errors.calories}</p>
        {/if}
      </div>

      <div>
        <label class="block text-sm mb-1">Protein (g)</label>
        <input
          type="number"
          step="0.1"
          bind:value={protein}
          placeholder="1.0"
          class="w-full px-3 py-2 border rounded {errors.protein ? 'border-red-500' : ''}"
        />
        {#if errors.protein}
          <p class="text-red-500 text-xs mt-1">{errors.protein}</p>
        {/if}
      </div>

      <div>
        <label class="block text-sm mb-1">Carbohydrates (g)</label>
        <input
          type="number"
          step="0.1"
          bind:value={carbs}
          placeholder="28.0"
          class="w-full px-3 py-2 border rounded {errors.carbs ? 'border-red-500' : ''}"
        />
        {#if errors.carbs}
          <p class="text-red-500 text-xs mt-1">{errors.carbs}</p>
        {/if}
      </div>

      <div>
        <label class="block text-sm mb-1">Fat (g)</label>
        <input
          type="number"
          step="0.1"
          bind:value={fat}
          placeholder="0.0"
          class="w-full px-3 py-2 border rounded {errors.fat ? 'border-red-500' : ''}"
        />
        {#if errors.fat}
          <p class="text-red-500 text-xs mt-1">{errors.fat}</p>
        {/if}
      </div>
    </div>
  </div>

  <!-- Extended Macros (Collapsible) -->
  <div class="mb-4">
    <button
      type="button"
      on:click={() => (showExtendedMacros = !showExtendedMacros)}
      class="flex items-center gap-2 font-medium mb-2 hover:underline"
    >
      <span>{showExtendedMacros ? '▼' : '▶'}</span>
      Extended Macros (optional)
    </button>

    {#if showExtendedMacros}
      <div class="grid grid-cols-2 gap-2 ml-6">
        <div>
          <label class="block text-sm mb-1">Fiber (g)</label>
          <input type="number" step="0.1" bind:value={fiber} class="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">Sugar (g)</label>
          <input type="number" step="0.1" bind:value={sugar} class="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">Saturated Fat (g)</label>
          <input type="number" step="0.1" bind:value={saturatedFat} class="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">Trans Fat (g)</label>
          <input type="number" step="0.1" bind:value={transFat} class="w-full px-3 py-2 border rounded" />
        </div>
      </div>
    {/if}
  </div>

  <!-- Minerals (Collapsible) -->
  <div class="mb-4">
    <button
      type="button"
      on:click={() => (showMinerals = !showMinerals)}
      class="flex items-center gap-2 font-medium mb-2 hover:underline"
    >
      <span>{showMinerals ? '▼' : '▶'}</span>
      Minerals (optional)
    </button>

    {#if showMinerals}
      <div class="grid grid-cols-2 gap-2 ml-6">
        <div>
          <label class="block text-sm mb-1">Sodium (mg)</label>
          <input type="number" step="0.1" bind:value={sodium} class="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">Potassium (mg)</label>
          <input type="number" step="0.1" bind:value={potassium} class="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">Calcium (mg)</label>
          <input type="number" step="0.1" bind:value={calcium} class="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">Iron (mg)</label>
          <input type="number" step="0.1" bind:value={iron} class="w-full px-3 py-2 border rounded" />
        </div>
      </div>
    {/if}
  </div>

  <!-- Vitamins (Collapsible) -->
  <div class="mb-4">
    <button
      type="button"
      on:click={() => (showVitamins = !showVitamins)}
      class="flex items-center gap-2 font-medium mb-2 hover:underline"
    >
      <span>{showVitamins ? '▼' : '▶'}</span>
      Vitamins (optional)
    </button>

    {#if showVitamins}
      <div class="grid grid-cols-2 gap-2 ml-6">
        <div>
          <label class="block text-sm mb-1">Vitamin A (mcg)</label>
          <input type="number" step="0.1" bind:value={vitaminA} class="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">Vitamin C (mg)</label>
          <input type="number" step="0.1" bind:value={vitaminC} class="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">Vitamin D (mcg)</label>
          <input type="number" step="0.1" bind:value={vitaminD} class="w-full px-3 py-2 border rounded" />
        </div>
      </div>
    {/if}
  </div>

  <!-- Other (Collapsible) -->
  <div class="mb-4">
    <button
      type="button"
      on:click={() => (showOther = !showOther)}
      class="flex items-center gap-2 font-medium mb-2 hover:underline"
    >
      <span>{showOther ? '▼' : '▶'}</span>
      Additional Information (optional)
    </button>

    {#if showOther}
      <div class="ml-6 space-y-2">
        <div>
          <label class="block text-sm mb-1">Cholesterol (mg)</label>
          <input type="number" step="0.1" bind:value={cholesterol} class="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">Caffeine (mg)</label>
          <input type="number" step="0.1" bind:value={caffeine} class="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label class="block text-sm mb-1">Ingredients (comma-separated)</label>
          <textarea
            bind:value={ingredients}
            placeholder="Water, Caffeine, Taurine, Vitamins"
            rows="2"
            class="w-full px-3 py-2 border rounded"
          ></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Allergens</label>
          <div class="flex flex-wrap gap-2">
            {#each allergenOptions as allergen}
              <label class="flex items-center gap-1">
                <input
                  type="checkbox"
                  value={allergen.toLowerCase()}
                  bind:group={allergens}
                  class="rounded"
                />
                <span class="text-sm">{allergen}</span>
              </label>
            {/each}
          </div>
        </div>
        <div>
          <label class="block text-sm mb-1">Product Image URL</label>
          <input type="url" bind:value={imageUrl} placeholder="https://..." class="w-full px-3 py-2 border rounded" />
        </div>
      </div>
    {/if}
  </div>

  <!-- Action Buttons -->
  <div class="flex gap-2 mt-6">
    <button
      type="button"
      on:click={handleSubmit}
      disabled={loading}
      class="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
    >
      {loading ? 'Submitting...' : 'Submit to OpenFoodFacts'}
    </button>
    <button
      type="button"
      on:click={handleCancel}
      disabled={loading}
      class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
    >
      Cancel
    </button>
  </div>

  <p class="text-xs text-gray-500 mt-2">* Required fields</p>
</div>
```

**Step 2: Export from components index**

Add to `src/domains/nutrition/components/index.ts`:

```typescript
export { default as ManualNutritionForm } from './ManualNutritionForm.svelte'
```

**Step 3: Commit**

```bash
git add src/domains/nutrition/components/ManualNutritionForm.svelte src/domains/nutrition/components/index.ts
git commit -m "feat: add manual nutrition entry form component

- Comprehensive form with all nutrient fields
- Accordion UI for optional sections
- Real-time validation for required fields
- Dispatches submit/cancel events
- Pre-fills barcode, collects full NutritionData

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Add Contribution Action to AI Query Types

**Files:**
- Modify: `src/domains/ai-query/ai-query-service.ts:36` (add to action union type)

**Step 1: Add needs_manual_contribution to action type**

Update line 36 to include new action:

```typescript
action?: 'add_entry' | 'question' | 'delete_entry' | 'scan_barcode' | 'needs_value' | 'needs_tracker_creation' | 'needs_tracker_type' | 'needs_uom' | 'needs_uom_category' | 'needs_math' | 'needs_positivity' | 'needs_focus' | 'needs_also_include' | 'needs_default_value' | 'create_tracker_with_config' | 'needs_manual_contribution'
```

**Step 2: Commit**

```bash
git add src/domains/ai-query/ai-query-service.ts
git commit -m "feat: add needs_manual_contribution action type

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Integrate Contribution Flow in AI Query Service

**Files:**
- Modify: `src/domains/ai-query/ai-query-service.ts` (add scan failure detection)

**Step 1: Add contribution trigger after barcode scan failure**

Find the barcode scanning section in `handleScanBarcode` function (search for "scan_barcode" action). After the nutrition lookup fails (all providers return null), add:

```typescript
// After barcode lookup fails across all providers
if (!nutritionData) {
  messages.push({
    id: nextId++,
    text: "Product not found in any nutrition database. Would you like to add it?",
    sender: 'ai',
    timestamp: new Date(),
    action: 'needs_manual_contribution',
    barcode: validBarcode,
  })
  return { messages }
}
```

**Step 2: Commit**

```bash
git add src/domains/ai-query/ai-query-service.ts
git commit -m "feat: trigger manual contribution on scan failure

- Shows contribution prompt when barcode not found
- Passes barcode to needs_manual_contribution action

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Add Manual Contribution UI to AI Query View

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte` (add action handler)
- Modify: Import ManualNutritionForm component

**Step 1: Import ManualNutritionForm**

Add to imports section:

```typescript
import { ManualNutritionForm } from '../nutrition/components'
import { nutritionService } from '../nutrition/nutrition-service'
```

**Step 2: Add contribution handler in conditional rendering**

After the existing action handlers (around line 800+), add:

```svelte
{#if message.action === 'needs_manual_contribution' && message.barcode}
  <div class="mt-3">
    <ManualNutritionForm
      barcode={message.barcode}
      loading={loading}
      on:submit={async (event) => {
        loading = true
        const result = await nutritionService.contributeProduct(event.detail)
        loading = false

        if (result.success && !result.queued) {
          // Immediate success
          messages = [
            ...messages,
            {
              id: Date.now(),
              text: `✓ Product added to OpenFoodFacts!\n\nCached locally for faster future lookups.`,
              sender: 'ai',
              timestamp: new Date(),
            },
          ]
        } else if (result.success && result.queued) {
          // Queued for later
          messages = [
            ...messages,
            {
              id: Date.now(),
              text: `⏳ Saved locally. Will sync to OpenFoodFacts when online.\n\nYou can use this product immediately.`,
              sender: 'ai',
              timestamp: new Date(),
            },
          ]
        } else {
          // Error
          messages = [
            ...messages,
            {
              id: Date.now(),
              text: `⚠ Failed to add product: ${result.error}\n\nPlease check the data and try again.`,
              sender: 'ai',
              timestamp: new Date(),
            },
          ]
        }
      }}
      on:cancel={() => {
        messages = [
          ...messages,
          {
            id: Date.now(),
            text: 'Contribution cancelled.',
            sender: 'ai',
            timestamp: new Date(),
          },
        ]
      }}
    />
  </div>
{/if}
```

**Step 3: Commit**

```bash
git add src/domains/ai-query/ai-query-view.svelte
git commit -m "feat: integrate manual contribution form in AI chat

- Shows ManualNutritionForm for needs_manual_contribution action
- Handles submit with success/queued/error feedback
- Provides contextual user messages
- Handles cancel action

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Background Sync Service

**Files:**
- Create: `src/domains/nutrition/contribution-sync-service.ts`

**Step 1: Create sync service**

```typescript
/**
 * Contribution Sync Service
 *
 * Handles background synchronization of queued nutrition contributions
 */

import { barcodeCache } from './barcode-cache'
import { openfoodfactsContributor } from './openfoodfacts-contributor'
import { showToast } from '../../components/toast/useToast'

export interface SyncResult {
  synced: number
  failed: number
  pending: number
}

/**
 * Sync service for nutrition contributions
 */
export class ContributionSyncService {
  private syncInterval: number | null = null
  private readonly SYNC_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
  private readonly DELAY_BETWEEN_SUBMISSIONS_MS = 1000 // 1 second rate limit

  /**
   * Start periodic background sync
   */
  start(): void {
    // Initial sync on start (if online)
    if (navigator.onLine) {
      this.syncPendingContributions()
    }

    // Set up periodic sync
    this.syncInterval = window.setInterval(() => {
      if (navigator.onLine) {
        this.syncPendingContributions()
      }
    }, this.SYNC_INTERVAL_MS)

    console.log('Contribution sync service started')
  }

  /**
   * Stop periodic background sync
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
      console.log('Contribution sync service stopped')
    }
  }

  /**
   * Manually trigger sync (called from settings)
   */
  async syncNow(): Promise<SyncResult> {
    return this.syncPendingContributions()
  }

  /**
   * Sync all pending contributions
   */
  private async syncPendingContributions(): Promise<SyncResult> {
    const pending = await barcodeCache.instance.getPendingContributions()

    if (pending.length === 0) {
      return { synced: 0, failed: 0, pending: 0 }
    }

    let synced = 0
    let failed = 0

    for (const contribution of pending) {
      // Rate limiting: Wait 1 second between submissions
      if (synced > 0 || failed > 0) {
        await this.delay(this.DELAY_BETWEEN_SUBMISSIONS_MS)
      }

      try {
        const result = await openfoodfactsContributor.submit(contribution.data)

        if (result.success) {
          await barcodeCache.instance.markContributionSynced(contribution.id!, true)
          synced++
        } else {
          await barcodeCache.instance.markContributionSynced(contribution.id!, false, result.error)
          failed++
        }
      } catch (error) {
        console.error('Network error during sync:', error)
        // Leave as pending, will retry later
        continue
      }
    }

    // Show toast notification if any synced
    if (synced > 0) {
      showToast({
        message: `✓ Synced ${synced} contribution${synced > 1 ? 's' : ''} to OpenFoodFacts`,
      })
    }

    const stillPending = pending.length - synced - failed

    return { synced, failed, pending: stillPending }
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Get count of pending contributions
   */
  async getPendingCount(): Promise<number> {
    const pending = await barcodeCache.instance.getPendingContributions()
    return pending.length
  }
}

// Export singleton instance
export const contributionSyncService = new ContributionSyncService()
```

**Step 2: Commit**

```bash
git add src/domains/nutrition/contribution-sync-service.ts
git commit -m "feat: add background contribution sync service

- Periodic sync every 30 minutes
- Manual sync trigger
- Rate limiting (1 sec between submissions)
- Toast notifications on success
- Singleton instance for app-wide use

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Initialize Sync Service on App Start

**Files:**
- Modify: `src/App.svelte` or main entry point (find initialization code)

**Step 1: Import and start sync service**

Add to the app initialization section:

```typescript
import { contributionSyncService } from './domains/nutrition/contribution-sync-service'

// In onMount or initialization function:
contributionSyncService.start()
```

**Step 2: Stop service on cleanup**

```typescript
onDestroy(() => {
  contributionSyncService.stop()
})
```

**Step 3: Commit**

```bash
git add src/App.svelte
git commit -m "feat: initialize contribution sync on app start

- Starts background sync service
- Cleanup on app destroy

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Update Package Dependencies (if needed)

**Files:**
- Verify: `package.json` (idb already installed from Phase 1)

**Step 1: Verify dependencies**

Check that these are in package.json:
- `idb` (already installed)
- No new dependencies needed

**Step 2: Run install if anything added**

```bash
docker exec Journaleith npm install --legacy-peer-deps
```

---

## Task 10: Final Testing & Commit Phase 7

**Files:**
- All Phase 7 files

**Step 1: Test the complete flow**

Manual testing checklist:
1. Scan barcode that doesn't exist in any provider
2. Verify "Product not found. Would you like to add it?" appears
3. Click "Add this product to database"
4. Fill out form with required fields
5. Submit → Verify success message
6. Go offline, submit another → Verify queued message
7. Go online → Wait for background sync → Verify toast notification

**Step 2: Final commit**

```bash
git add -A
git commit -m "feat: implement Phase 7 community contributions

Complete implementation:
- OpenFoodFacts contributor module
- Manual nutrition entry form (comprehensive)
- Hybrid submission (immediate + queue fallback)
- Background sync service (30-min intervals)
- AI chat integration (needs_manual_contribution action)
- User feedback for all scenarios

Phase 7 of 8 complete

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Success Criteria

- [ ] Barcode scan failure triggers contribution prompt
- [ ] Form accepts all required and optional nutrient fields
- [ ] Submission validates required fields
- [ ] Immediate submission works when online
- [ ] Queue fallback works when offline or on network error
- [ ] Background sync runs every 30 minutes
- [ ] Toast notifications appear on successful sync
- [ ] User sees appropriate feedback for all scenarios
- [ ] Contributed products cached locally
- [ ] No console errors during flow

---

## Notes

- Phase 8 will add comprehensive tests for all modules
- Consider adding settings UI for sync status/manual trigger
- Future: OCR for nutrition label scanning
- Future: Duplicate detection before submission
