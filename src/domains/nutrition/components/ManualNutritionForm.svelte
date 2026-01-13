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
