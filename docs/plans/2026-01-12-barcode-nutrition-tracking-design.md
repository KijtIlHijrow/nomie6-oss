# Barcode Nutrition Tracking Design

**Date:** 2026-01-12
**Status:** Design Complete
**Author:** User + Claude Code

## Overview

Add barcode scanning functionality to Nomie's AI chat interface, enabling users to scan food product barcodes and automatically log detailed nutrition information including macros (calories, protein, carbs, fat) and micronutrients (vitamins, minerals, caffeine, etc.) as individual tracker entries. Similar to MyFitnessPal's barcode scanning feature, but integrated into Nomie's existing AI-powered tracking workflow.

## User Experience Flow

```
User: "I ate a protein bar"
AI: "Would you like to scan the barcode for precise nutrition info?"
  [📷 Scan Barcode] [⌨️ Enter Manually] [Skip]

→ User taps "Scan Barcode"
→ Native camera opens with barcode detection overlay
→ Scans barcode "012345678901"
→ Shows loading: "Looking up nutrition info..."
→ API returns: Quest Bar - Chocolate Chip (nutrition data)
→ AI extracts quantity from original message (defaults to 1)

→ Shows confirmation card:
  "Quest Bar - Chocolate Chip
   Serving: 1 bar (60g)

   Quantity: [½x] [1x*] [2x] [___]

   Macros:
   - 200 calories
   - 20g protein
   - 9g carbs
   - 8g fat

   [Show 12 more nutrients ▼]

   [Log This Meal]"

→ User confirms
→ Creates tracker entries:
   - +200 #calories
   - +20g #protein
   - +9g #carbs
   - +8g #fat
   - +200mg #sodium
   - +5g #fiber
   - ... (all available nutrients)

→ Timeline shows grouped entry:
   "3:45 PM - Quest Bar - Chocolate Chip
    +200 calories, +20g protein, +9g carbs, +8g fat [+8 more]"
```

## Architecture Overview

### Three-Layer Architecture

1. **AI Query Integration Layer** - Extends `ai-query-service.ts` with barcode scanning actions
2. **Nutrition Service Layer** - New `nutrition-service.ts` handles API calls, caching, and data normalization
3. **Barcode Scanner Layer** - New `barcode-scanner.ts` wraps Capacitor Camera + manual input

### Key Components

- `src/domains/nutrition/nutrition-service.ts` - API abstraction, caching, data transforms
- `src/domains/nutrition/barcode-scanner.ts` - Camera access + manual input modal
- `src/domains/nutrition/nutrition-types.ts` - TypeScript interfaces
- `src/domains/nutrition/providers/` - API provider implementations
  - `openfoodfacts-provider.ts`
  - `nutritionix-provider.ts`
  - `usda-provider.ts`
- `src/domains/ai-query/ai-query-service.ts` - New `scanBarcode()` action + quantity extraction
- `src/domains/ai-query/ai-query-view.svelte` - Barcode scan button in AI chat
- `src/domains/nutrition/components/` - UI components
  - `NutritionConfirmationCard.svelte`
  - `ManualEntryForm.svelte`
  - `BarcodeScannerModal.svelte`
- `src/config/appConfig.ts` - Nutrition API settings

## Data Model & Storage

### Nutrition Data Interface

```typescript
interface NutritionData {
  barcode: string
  productName: string
  brand?: string
  servingSize: string  // "1 can (473ml)", "1 bar (60g)"
  servingUnit: string  // "can", "bar", "g", "ml"
  nutrients: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g?: number
    sugar_g?: number
    sodium_mg?: number
    saturated_fat_g?: number
    trans_fat_g?: number
    cholesterol_mg?: number
    potassium_mg?: number
    calcium_mg?: number
    iron_mg?: number
    vitamin_a_mcg?: number
    vitamin_c_mg?: number
    vitamin_d_mcg?: number
    vitamin_b6_mg?: number
    vitamin_b12_mcg?: number
    caffeine_mg?: number
    taurine_mg?: number
    // ... extensible for any nutrient
  }
  ingredients: string[]  // ["Water", "Caffeine", "Taurine", "B-Vitamins"]
  allergens?: string[]   // ["milk", "soy", "tree nuts"]
  imageUrl?: string      // For verification
  source: 'openfoodfacts' | 'nutritionix' | 'usda' | 'user_contributed'
  lastUpdated: number    // Timestamp
}
```

### Provider Interface

```typescript
interface NutritionProvider {
  name: string
  requiresApiKey: boolean
  lookup(barcode: string): Promise<NutritionData | null>
  search(query: string): Promise<NutritionData[]>
  contribute?(data: NutritionData): Promise<boolean>
}
```

### Local Cache Storage

- **Storage:** IndexedDB with `barcode → NutritionData` map
- **Cache Duration:** 30 days for successful lookups
- **Offline Support:** Cache persists for offline access
- **User Contributions:** Store separately in `user_nutrition_contributions` table for syncing to OpenFoodFacts

### Tracker Auto-Creation

Auto-create these trackers on first nutrition entry (if they don't exist):

**Always Created (Macros):**
- `#calories` - type: value, uom: kcal, math: sum
- `#protein` - type: value, uom: gram, math: sum
- `#carbs` - type: value, uom: gram, math: sum
- `#fat` - type: value, uom: gram, math: sum

**Conditionally Created (Micronutrients):**
Only created if the nutrient exists in the scanned product AND `trackMicronutrients` is enabled:
- `#fiber` - gram
- `#sugar` - gram
- `#sodium` - mg
- `#caffeine` - mg
- `#calcium` - mg
- `#iron` - mg
- `#vitamin_a` - mcg
- `#vitamin_c` - mg
- `#vitamin_d` - mcg
- ... etc.

### Log Entry Pattern

Each barcode scan creates **multiple log entries** with:
- **Shared timestamp** - All entries at same moment
- **Shared note** - Product name + brand
- **Individual values** - Each nutrient as separate tracker entry
- **Metadata** - Barcode, servings, source

Example entries created:

```javascript
[
  {
    tracker: '#calories',
    value: 200,
    timestamp: 1736726700000,
    note: 'Quest Bar - Chocolate Chip',
    meta: { barcode: '012345678901', servings: 1, source: 'openfoodfacts' }
  },
  {
    tracker: '#protein',
    value: 20,
    timestamp: 1736726700000,
    note: 'Quest Bar - Chocolate Chip',
    meta: { barcode: '012345678901', servings: 1, source: 'openfoodfacts' }
  },
  // ... etc for all nutrients
]
```

Timeline displays these grouped by timestamp as a single meal entry.

## API Integration Strategy

### Multi-Provider Architecture

```typescript
class NutritionService {
  private providers: Map<string, NutritionProvider>
  private cache: BarcodeCache

  async lookup(barcode: string): Promise<NutritionData | null> {
    // 1. Check local cache first (instant)
    const cached = await this.cache.get(barcode)
    if (cached && !this.isExpired(cached)) return cached

    // 2. Try primary provider (user's configured choice)
    const primary = this.getPrimaryProvider()
    try {
      const data = await primary.lookup(barcode)
      if (data) {
        await this.cache.set(barcode, data)
        return data
      }
    } catch (error) {
      console.error(`Primary provider failed: ${error}`)
    }

    // 3. Fallback cascade through other providers
    for (const provider of this.getSecondaryProviders()) {
      try {
        const data = await provider.lookup(barcode)
        if (data) {
          await this.cache.set(barcode, data)
          return data
        }
      } catch (error) {
        console.error(`Provider ${provider.name} failed: ${error}`)
      }
    }

    // 4. Return stale cache if available
    if (cached) {
      showWarning("Using offline data - couldn't reach servers")
      return cached
    }

    // 5. Not found anywhere
    return null
  }
}
```

### Provider Implementations

#### OpenFoodFacts Provider (Default, Free)

```typescript
class OpenFoodFactsProvider implements NutritionProvider {
  name = 'openfoodfacts'
  requiresApiKey = false

  async lookup(barcode: string): Promise<NutritionData | null> {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
    )
    const json = await response.json()

    if (json.status === 0) return null // Product not found

    return this.normalizeResponse(json.product)
  }

  async contribute(data: NutritionData): Promise<boolean> {
    // POST to OpenFoodFacts API with user-submitted data
    // Requires user authentication (handled separately)
  }

  private normalizeResponse(product: any): NutritionData {
    // Transform OpenFoodFacts structure to our NutritionData interface
  }
}
```

#### Nutritionix Provider (Requires API Key)

```typescript
class NutritionixProvider implements NutritionProvider {
  name = 'nutritionix'
  requiresApiKey = true

  constructor(
    private appId: string,
    private apiKey: string
  ) {}

  async lookup(barcode: string): Promise<NutritionData | null> {
    const response = await fetch(
      `https://trackapi.nutritionix.com/v2/search/item?upc=${barcode}`,
      {
        headers: {
          'x-app-id': this.appId,
          'x-app-key': this.apiKey
        }
      }
    )
    const json = await response.json()
    return this.normalizeResponse(json.foods?.[0])
  }

  private normalizeResponse(food: any): NutritionData | null {
    // Transform Nutritionix structure to our NutritionData interface
  }
}
```

#### USDA Provider (Free, Limited Barcode Coverage)

```typescript
class USDAProvider implements NutritionProvider {
  name = 'usda'
  requiresApiKey = false

  async lookup(barcode: string): Promise<NutritionData | null> {
    // USDA FoodData Central API
    // Good for whole foods, limited packaged food coverage
  }
}
```

### Configuration in appConfig.ts

```typescript
nutritionApis: {
  enabled: true,
  primaryProvider: 'openfoodfacts',

  // Nutritionix (optional)
  nutritionixAppId: '',
  nutritionixApiKey: '',
  // Get free API key: https://www.nutritionix.com/business/api

  // Behavior
  autoCreateTrackers: true,
  trackMicronutrients: true,  // If false, only track macros (calories, protein, carbs, fat)
  cacheExpiry: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds

  // Rate limiting
  maxApiCallsPerMinute: 30,

  // Contribution
  contributeToOpenFoodFacts: true,  // Default checkbox state
}
```

## Barcode Scanner Implementation

### Scanner Class

```typescript
class BarcodeScanner {
  async scan(): Promise<string | null> {
    // Check camera permission first
    const hasPermission = await this.checkAndRequestPermission()
    if (!hasPermission) {
      return this.manualEntry()
    }

    if (Capacitor.isNativePlatform()) {
      return await this.scanNative()
    } else {
      return await this.scanWeb()
    }
  }

  private async checkAndRequestPermission(): Promise<boolean> {
    const status = await BarcodeScanner.checkPermission({ force: true })

    if (status.denied) {
      showError(
        "Camera access denied. Please enable camera in settings or use manual entry.",
        { action: 'Manual Entry', handler: () => this.manualEntry() }
      )
      return false
    }

    return status.granted || status.restricted
  }

  private async scanNative(): Promise<string | null> {
    // Use @capacitor-community/barcode-scanner plugin
    await BarcodeScanner.hideBackground() // Make webview transparent
    const result = await BarcodeScanner.startScan()
    await BarcodeScanner.showBackground() // Restore webview

    if (result.hasContent) {
      return result.content // Barcode string
    }
    return null // User cancelled
  }

  private async scanWeb(): Promise<string | null> {
    // Use html5-qrcode library for browser camera
    // Show modal with camera feed
    return new Promise((resolve) => {
      const scanner = new Html5Qrcode("reader")
      scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          scanner.stop()
          resolve(decodedText)
        },
        (error) => {
          // Continuous scanning errors (ignore)
        }
      )

      // Add cancel button to resolve(null)
    })
  }

  async manualEntry(): Promise<string | null> {
    // Show modal with input field
    // Validate barcode format (UPC-A, EAN-13, EAN-8)
    return showPrompt({
      title: 'Enter Barcode',
      placeholder: '012345678901',
      type: 'number',
      validator: (value) => {
        const length = value.length
        return length === 8 || length === 12 || length === 13
      }
    })
  }
}
```

### Supported Barcode Formats

- **UPC-A** - 12 digits (most US products)
- **EAN-13** - 13 digits (international products)
- **EAN-8** - 8 digits (small packages)

Validation ensures barcode is numeric and correct length before API lookup.

## AI Query Service Integration

### New Action Type

```typescript
// Add to AIQueryAction enum
type AIQueryAction =
  | 'create_tracker'
  | 'create_entry'
  | 'scan_barcode'  // NEW
  | 'delete_entry'
  | 'answer_question'
  | 'configure_tracker'
```

### Scan Barcode Handler

```typescript
async function handleScanBarcode(
  message: string,
  context: AIContext
): Promise<void> {
  // 1. Extract quantity from user's original message using AI
  const quantity = await extractQuantityFromMessage(message)
  const finalQuantity = quantity || 1

  // 2. Show barcode scan prompt in chat
  await showMessage({
    type: 'ai',
    text: 'Would you like to scan the barcode for precise nutrition info?',
    actions: [
      { label: '📷 Scan Barcode', handler: 'scan' },
      { label: '⌨️ Enter Manually', handler: 'manual' },
      { label: 'Skip', handler: 'skip' }
    ]
  })

  // 3. Wait for user action
  const action = await waitForUserAction()
  if (action === 'skip') return

  // 4. Get barcode (via camera or manual)
  const scanner = new BarcodeScanner()
  const barcode = action === 'scan'
    ? await scanner.scan()
    : await scanner.manualEntry()

  if (!barcode) return // User cancelled

  // 5. Show loading state
  await showMessage({
    type: 'system',
    text: 'Looking up nutrition info...',
    loading: true
  })

  // 6. Lookup nutrition data
  const nutritionService = new NutritionService()
  const nutrition = await nutritionService.lookup(barcode)

  if (!nutrition) {
    // Not found in any database
    await handleBarcodeNotFound(barcode)
    return
  }

  // 7. Show confirmation card
  const confirmed = await showNutritionConfirmation(nutrition, finalQuantity)
  if (!confirmed) return

  // 8. Create all nutrition tracker entries
  await createNutritionEntries(nutrition, confirmed.quantity)

  // 9. Show success message
  await showMessage({
    type: 'ai',
    text: `Logged ${confirmed.quantity}x ${nutrition.productName}! ` +
          `Added ${Object.keys(nutrition.nutrients).length} nutrient trackers.`
  })
}
```

### Quantity Extraction

Reuse existing `extractValueWithAI` pattern from Feature 4:

```typescript
async function extractQuantityFromMessage(message: string): Promise<number | null> {
  const patterns = [
    /(\d+\.?\d*)\s*(servings?|portions?|bars?|cans?|bottles?)/i,
    /(half|quarter|third)/i,
    /(\d+)/
  ]

  // Try regex first (fast)
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match) {
      const word = match[1].toLowerCase()
      if (word === 'half') return 0.5
      if (word === 'quarter') return 0.25
      if (word === 'third') return 0.33
      return parseFloat(match[1])
    }
  }

  // Fallback to AI if no clear number found
  return await extractValueWithAI(message, {
    context: 'food quantity',
    defaultValue: 1
  })
}
```

### Intent Detection Enhancement

Add food-related triggers to `detectIntent()`:

```typescript
function detectIntent(message: string): IntentDetectionResult {
  const lowerMessage = message.toLowerCase()

  // Barcode scan triggers
  if (
    lowerMessage.includes('scan barcode') ||
    lowerMessage.includes('scan the barcode')
  ) {
    return { action: 'scan_barcode', confidence: 0.95 }
  }

  // Food-related triggers (suggest barcode scan)
  const foodTriggers = [
    /\b(ate|eaten|eating|eat|drank|drinking|drink|consumed|had)\b/i,
    /\b(breakfast|lunch|dinner|snack|meal)\b/i,
    /\b(food|protein bar|energy drink|yogurt|cereal)\b/i
  ]

  for (const trigger of foodTriggers) {
    if (trigger.test(message)) {
      return {
        action: 'scan_barcode',
        confidence: 0.6,
        suggestion: true  // Offer scan, don't auto-trigger
      }
    }
  }

  // ... existing intent detection logic
}
```

## Tracker Auto-Creation & Entry Logic

### Ensure Nutrition Trackers Exist

```typescript
async function ensureNutritionTrackers(
  nutrients: NutritionData['nutrients']
): Promise<void> {
  const config = appConfig.nutritionApis

  // Always create macro trackers
  const macros = [
    { tag: 'calories', uom: 'kcal', label: 'Calories' },
    { tag: 'protein', uom: 'gram', label: 'Protein' },
    { tag: 'carbs', uom: 'gram', label: 'Carbs' },
    { tag: 'fat', uom: 'gram', label: 'Fat' },
  ]

  for (const macro of macros) {
    await createTrackerIfNotExists({
      tag: macro.tag,
      label: macro.label,
      type: 'value',
      uom: macro.uom,
      math: 'sum',
      default: 0,
      color: getNutrientColor(macro.tag)
    })
  }

  // Conditionally create micronutrient trackers
  if (config.trackMicronutrients) {
    const microSpecs = [
      { key: 'fiber_g', tag: 'fiber', uom: 'gram', label: 'Fiber' },
      { key: 'sugar_g', tag: 'sugar', uom: 'gram', label: 'Sugar' },
      { key: 'sodium_mg', tag: 'sodium', uom: 'mg', label: 'Sodium' },
      { key: 'caffeine_mg', tag: 'caffeine', uom: 'mg', label: 'Caffeine' },
      { key: 'calcium_mg', tag: 'calcium', uom: 'mg', label: 'Calcium' },
      { key: 'iron_mg', tag: 'iron', uom: 'mg', label: 'Iron' },
      { key: 'vitamin_a_mcg', tag: 'vitamin_a', uom: 'mcg', label: 'Vitamin A' },
      { key: 'vitamin_c_mg', tag: 'vitamin_c', uom: 'mg', label: 'Vitamin C' },
      { key: 'vitamin_d_mcg', tag: 'vitamin_d', uom: 'mcg', label: 'Vitamin D' },
      // ... add more as needed
    ]

    for (const spec of microSpecs) {
      // Only create if this nutrient exists in the scanned product
      if (nutrients[spec.key] !== undefined && nutrients[spec.key] > 0) {
        await createTrackerIfNotExists({
          tag: spec.tag,
          label: spec.label,
          type: 'value',
          uom: spec.uom,
          math: 'sum',
          default: 0,
          color: getNutrientColor(spec.tag),
          hidden: true  // Don't clutter main tracker list
        })
      }
    }
  }
}

function getNutrientColor(tag: string): string {
  const colors = {
    calories: '#FF6B6B',
    protein: '#4ECDC4',
    carbs: '#FFE66D',
    fat: '#95E1D3',
    // ... default colors for common nutrients
  }
  return colors[tag] || '#A8DADC'
}
```

### Create Nutrition Entries

```typescript
async function createNutritionEntries(
  nutrition: NutritionData,
  quantity: number
): Promise<void> {
  // 1. Ensure all necessary trackers exist
  await ensureNutritionTrackers(nutrition.nutrients)

  // 2. Build batch of entries
  const timestamp = Date.now()
  const note = nutrition.brand
    ? `${nutrition.productName} (${nutrition.brand})`
    : nutrition.productName

  const entries: NLogEntry[] = []

  // Map nutrient keys to tracker tags
  const nutrientMapping = {
    calories: 'calories',
    protein_g: 'protein',
    carbs_g: 'carbs',
    fat_g: 'fat',
    fiber_g: 'fiber',
    sugar_g: 'sugar',
    sodium_mg: 'sodium',
    caffeine_mg: 'caffeine',
    calcium_mg: 'calcium',
    iron_mg: 'iron',
    vitamin_a_mcg: 'vitamin_a',
    vitamin_c_mg: 'vitamin_c',
    vitamin_d_mcg: 'vitamin_d',
    // ... complete mapping
  }

  for (const [nutrientKey, trackerTag] of Object.entries(nutrientMapping)) {
    const value = nutrition.nutrients[nutrientKey]

    if (value !== undefined && value > 0) {
      entries.push({
        tracker: `#${trackerTag}`,
        value: value * quantity,
        timestamp,
        note,
        meta: {
          barcode: nutrition.barcode,
          servings: quantity,
          servingSize: nutrition.servingSize,
          source: nutrition.source,
          productName: nutrition.productName
        }
      })
    }
  }

  // 3. Batch create all entries at once
  await LedgerStore.batchCreate(entries)

  // 4. Trigger stats recalculation for affected trackers
  await StatsStore.invalidate(
    entries.map(e => e.tracker),
    startOfDay(timestamp)
  )
}
```

### Timeline Display

Entries share the same timestamp, so they appear grouped:

```
3:45 PM - Quest Bar - Chocolate Chip
  +200 calories
  +20g protein
  +9g carbs
  +8g fat
  +5g fiber
  +1g sugar
  +200mg sodium
  [+5 more nutrients]
```

User can expand to see all nutrients or collapse to compact view.

## UI/UX Components

### 1. Barcode Scan Button (ai-query-view.svelte)

```svelte
{#if currentMessage?.suggestBarcodeScan}
  <div class="barcode-prompt">
    <p class="prompt-text">
      Would you like to scan the barcode for precise nutrition info?
    </p>
    <div class="button-group">
      <button
        class="primary-action"
        on:click={() => handleAction('scan')}
      >
        📷 Scan Barcode
      </button>
      <button
        class="secondary-action"
        on:click={() => handleAction('manual')}
      >
        ⌨️ Enter Manually
      </button>
      <button
        class="tertiary-action"
        on:click={() => handleAction('skip')}
      >
        Skip
      </button>
    </div>
  </div>
{/if}
```

### 2. Nutrition Confirmation Card

```svelte
<!-- NutritionConfirmationCard.svelte -->
<script lang="ts">
  import type { NutritionData } from '../nutrition-types'

  export let nutrition: NutritionData
  export let initialQuantity: number = 1
  export let onConfirm: (quantity: number) => void
  export let onCancel: () => void

  let quantity = initialQuantity
  let showAllNutrients = false

  $: macros = {
    calories: nutrition.nutrients.calories * quantity,
    protein: nutrition.nutrients.protein_g * quantity,
    carbs: nutrition.nutrients.carbs_g * quantity,
    fat: nutrition.nutrients.fat_g * quantity,
  }

  $: micronutrients = Object.entries(nutrition.nutrients)
    .filter(([key]) => !['calories', 'protein_g', 'carbs_g', 'fat_g'].includes(key))
    .filter(([_, value]) => value > 0)
</script>

<div class="nutrition-card">
  {#if nutrition.imageUrl}
    <img src={nutrition.imageUrl} alt={nutrition.productName} class="product-image">
  {/if}

  <h3 class="product-name">{nutrition.productName}</h3>
  {#if nutrition.brand}
    <p class="brand">{nutrition.brand}</p>
  {/if}
  <p class="serving-size">{nutrition.servingSize}</p>

  <div class="quantity-selector">
    <label>Quantity:</label>
    <div class="quantity-buttons">
      <button
        class:active={quantity === 0.5}
        on:click={() => quantity = 0.5}
      >
        ½x
      </button>
      <button
        class:active={quantity === 1}
        on:click={() => quantity = 1}
      >
        1x
      </button>
      <button
        class:active={quantity === 2}
        on:click={() => quantity = 2}
      >
        2x
      </button>
      <input
        type="number"
        bind:value={quantity}
        min="0.1"
        step="0.1"
        class="quantity-input"
      />
    </div>
  </div>

  <div class="macros">
    <div class="macro-item">
      <span class="label">Calories</span>
      <span class="value">{macros.calories}</span>
    </div>
    <div class="macro-item">
      <span class="label">Protein</span>
      <span class="value">{macros.protein}g</span>
    </div>
    <div class="macro-item">
      <span class="label">Carbs</span>
      <span class="value">{macros.carbs}g</span>
    </div>
    <div class="macro-item">
      <span class="label">Fat</span>
      <span class="value">{macros.fat}g</span>
    </div>
  </div>

  {#if micronutrients.length > 0}
    <details bind:open={showAllNutrients}>
      <summary>
        Show {micronutrients.length} more nutrients
      </summary>
      <div class="micronutrients">
        {#each micronutrients as [key, value]}
          <div class="micro-item">
            <span class="label">{formatNutrientName(key)}</span>
            <span class="value">{value * quantity}{getNutrientUnit(key)}</span>
          </div>
        {/each}
      </div>
    </details>
  {/if}

  <div class="actions">
    <button class="btn-primary" on:click={() => onConfirm(quantity)}>
      Log This Meal
    </button>
    <button class="btn-secondary" on:click={onCancel}>
      Cancel
    </button>
  </div>
</div>

<style>
  .nutrition-card {
    background: var(--color-bg-card);
    border-radius: 12px;
    padding: 16px;
    margin: 12px 0;
  }

  .product-image {
    width: 100%;
    max-height: 200px;
    object-fit: contain;
    border-radius: 8px;
    margin-bottom: 12px;
  }

  .product-name {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .brand {
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-bottom: 8px;
  }

  .serving-size {
    font-size: 13px;
    color: var(--color-text-tertiary);
    margin-bottom: 16px;
  }

  .quantity-selector {
    margin-bottom: 16px;
  }

  .quantity-buttons {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .quantity-buttons button {
    flex: 1;
    padding: 8px;
    border-radius: 6px;
    background: var(--color-bg-secondary);
    border: 2px solid transparent;
  }

  .quantity-buttons button.active {
    border-color: var(--color-primary);
    background: var(--color-primary-faded);
  }

  .quantity-input {
    width: 80px;
    padding: 8px;
    border-radius: 6px;
    text-align: center;
  }

  .macros {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }

  .macro-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--color-bg-secondary);
    border-radius: 6px;
  }

  .macro-item .label {
    font-weight: 500;
  }

  .macro-item .value {
    font-weight: 600;
    color: var(--color-primary);
  }

  details {
    margin-bottom: 16px;
  }

  summary {
    cursor: pointer;
    padding: 8px 0;
    color: var(--color-primary);
    font-size: 14px;
  }

  .micronutrients {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 8px;
  }

  .micro-item {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    padding: 4px 8px;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .btn-primary {
    flex: 1;
    padding: 12px;
    background: var(--color-primary);
    color: white;
    border-radius: 8px;
    font-weight: 600;
  }

  .btn-secondary {
    padding: 12px 16px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 8px;
  }
</style>
```

### 3. Manual Entry Form

```svelte
<!-- ManualEntryForm.svelte -->
<script lang="ts">
  export let barcode: string
  export let onSubmit: (data: NutritionData) => void
  export let onCancel: () => void

  let productName = ''
  let brand = ''
  let servingSize = ''
  let calories = ''
  let protein = ''
  let carbs = ''
  let fat = ''
  let contributeToOFF = true
  let showOptionalFields = false

  // Optional micronutrients
  let fiber = ''
  let sugar = ''
  let sodium = ''
  let caffeine = ''

  function handleSubmit() {
    const nutritionData: NutritionData = {
      barcode,
      productName,
      brand: brand || undefined,
      servingSize,
      servingUnit: extractServingUnit(servingSize),
      nutrients: {
        calories: parseFloat(calories),
        protein_g: parseFloat(protein),
        carbs_g: parseFloat(carbs),
        fat_g: parseFloat(fat),
        fiber_g: fiber ? parseFloat(fiber) : undefined,
        sugar_g: sugar ? parseFloat(sugar) : undefined,
        sodium_mg: sodium ? parseFloat(sodium) : undefined,
        caffeine_mg: caffeine ? parseFloat(caffeine) : undefined,
      },
      ingredients: [],
      source: 'user_contributed',
      lastUpdated: Date.now()
    }

    onSubmit(nutritionData)

    if (contributeToOFF) {
      // Queue for submission to OpenFoodFacts
      OpenFoodFactsService.queueContribution(nutritionData)
    }
  }
</script>

<form class="manual-entry-form" on:submit|preventDefault={handleSubmit}>
  <h3>Product Not Found</h3>
  <p class="subtitle">Help us by adding this product's nutrition info</p>

  <div class="form-section">
    <h4>Basic Info</h4>
    <input
      type="text"
      placeholder="Product name *"
      bind:value={productName}
      required
    />
    <input
      type="text"
      placeholder="Brand (optional)"
      bind:value={brand}
    />
    <input
      type="text"
      placeholder="Serving size (e.g., 1 can, 60g) *"
      bind:value={servingSize}
      required
    />
  </div>

  <div class="form-section">
    <h4>Macros (Required)</h4>
    <div class="macro-grid">
      <input
        type="number"
        placeholder="Calories *"
        bind:value={calories}
        min="0"
        step="1"
        required
      />
      <input
        type="number"
        placeholder="Protein (g) *"
        bind:value={protein}
        min="0"
        step="0.1"
        required
      />
      <input
        type="number"
        placeholder="Carbs (g) *"
        bind:value={carbs}
        min="0"
        step="0.1"
        required
      />
      <input
        type="number"
        placeholder="Fat (g) *"
        bind:value={fat}
        min="0"
        step="0.1"
        required
      />
    </div>
  </div>

  <details bind:open={showOptionalFields}>
    <summary>Add more nutrients (optional)</summary>
    <div class="form-section">
      <div class="micro-grid">
        <input type="number" placeholder="Fiber (g)" bind:value={fiber} min="0" step="0.1" />
        <input type="number" placeholder="Sugar (g)" bind:value={sugar} min="0" step="0.1" />
        <input type="number" placeholder="Sodium (mg)" bind:value={sodium} min="0" step="1" />
        <input type="number" placeholder="Caffeine (mg)" bind:value={caffeine} min="0" step="1" />
      </div>
    </div>
  </details>

  <label class="contribute-checkbox">
    <input type="checkbox" bind:checked={contributeToOFF} />
    Submit to OpenFoodFacts to help others
  </label>

  <div class="actions">
    <button type="submit" class="btn-primary">
      Save & Log
    </button>
    <button type="button" class="btn-secondary" on:click={onCancel}>
      Cancel
    </button>
  </div>
</form>
```

### 4. Settings Screen (Nutrition Section)

Add to existing settings/preferences UI:

```svelte
<section class="settings-section">
  <h3>🍎 Nutrition Tracking</h3>

  <div class="setting-item">
    <label>Primary Database</label>
    <select bind:value={$appConfig.nutritionApis.primaryProvider}>
      <option value="openfoodfacts">OpenFoodFacts (Free, Community-driven)</option>
      <option value="nutritionix">Nutritionix (Requires API Key)</option>
      <option value="usda">USDA FoodData Central (Free, Limited)</option>
    </select>
  </div>

  {#if $appConfig.nutritionApis.primaryProvider === 'nutritionix'}
    <div class="setting-item">
      <label>Nutritionix App ID</label>
      <input
        type="text"
        placeholder="Your App ID"
        bind:value={$appConfig.nutritionApis.nutritionixAppId}
      />
    </div>
    <div class="setting-item">
      <label>Nutritionix API Key</label>
      <input
        type="password"
        placeholder="Your API Key"
        bind:value={$appConfig.nutritionApis.nutritionixApiKey}
      />
      <a
        href="https://www.nutritionix.com/business/api"
        target="_blank"
        class="help-link"
      >
        Get free API key (500 requests/day)
      </a>
    </div>
  {/if}

  <div class="setting-item">
    <label>
      <input
        type="checkbox"
        bind:checked={$appConfig.nutritionApis.autoCreateTrackers}
      />
      Auto-create nutrition trackers
    </label>
    <p class="setting-description">
      Automatically create #calories, #protein, etc. when first scanning food
    </p>
  </div>

  <div class="setting-item">
    <label>
      <input
        type="checkbox"
        bind:checked={$appConfig.nutritionApis.trackMicronutrients}
      />
      Track micronutrients
    </label>
    <p class="setting-description">
      Track vitamins, minerals, caffeine, etc. (in addition to macros)
    </p>
  </div>

  <div class="setting-item">
    <label>
      <input
        type="checkbox"
        bind:checked={$appConfig.nutritionApis.contributeToOpenFoodFacts}
      />
      Contribute to OpenFoodFacts by default
    </label>
    <p class="setting-description">
      Help the community by sharing manually-entered nutrition data
    </p>
  </div>
</section>
```

## Error Handling & Edge Cases

### Camera Permission Denied

```typescript
async function handlePermissionDenied() {
  await showAlert({
    title: 'Camera Access Required',
    message: 'Please enable camera access in your device settings to scan barcodes.',
    buttons: [
      {
        text: 'Open Settings',
        handler: () => {
          if (Capacitor.isNativePlatform()) {
            NativeSettings.open('application')
          }
        }
      },
      {
        text: 'Enter Manually',
        handler: () => BarcodeScanner.manualEntry()
      },
      {
        text: 'Cancel',
        role: 'cancel'
      }
    ]
  })
}
```

### Network Failures

```typescript
async function handleNetworkError(barcode: string, cachedData?: NutritionData) {
  if (cachedData) {
    // Use stale cache
    await showWarning('Using offline data - could not reach nutrition database')
    return cachedData
  }

  // No cache available
  await showError(
    'Cannot lookup barcode offline. Please check your internet connection.',
    {
      action: 'Enter Manually',
      handler: () => showManualEntryForm(barcode)
    }
  )
  return null
}
```

### Barcode Not Found

```typescript
async function handleBarcodeNotFound(barcode: string) {
  const result = await showAlert({
    title: 'Product Not Found',
    message: `Barcode ${barcode} not found in any database. Would you like to add it manually?`,
    buttons: [
      { text: 'Add Manually', value: 'manual' },
      { text: 'Try Different Barcode', value: 'retry' },
      { text: 'Cancel', value: 'cancel', role: 'cancel' }
    ]
  })

  if (result === 'manual') {
    await showManualEntryForm(barcode)
  } else if (result === 'retry') {
    await BarcodeScanner.scan()
  }
}
```

### Multiple Barcodes on Package

Scanner detects first barcode and uses it. If wrong:
- User can cancel and re-scan
- User can use manual entry to try different barcode

### International Barcode Formats

```typescript
function validateBarcode(barcode: string): { valid: boolean; format?: string } {
  const formats = {
    'UPC-A': /^\d{12}$/,
    'EAN-13': /^\d{13}$/,
    'EAN-8': /^\d{8}$/,
  }

  for (const [format, pattern] of Object.entries(formats)) {
    if (pattern.test(barcode)) {
      return { valid: true, format }
    }
  }

  return { valid: false }
}
```

### Partial Nutrition Data

```typescript
function validateNutritionData(data: NutritionData): {
  valid: boolean
  warnings: string[]
} {
  const warnings: string[] = []

  // Check for required macros
  if (!data.nutrients.calories) warnings.push('Missing calorie information')
  if (!data.nutrients.protein_g) warnings.push('Missing protein information')
  if (!data.nutrients.carbs_g) warnings.push('Missing carb information')
  if (!data.nutrients.fat_g) warnings.push('Missing fat information')

  // Count available micronutrients
  const microCount = Object.values(data.nutrients).filter(v => v !== undefined).length - 4
  if (microCount < 3) {
    warnings.push('Limited micronutrient data available')
  }

  return {
    valid: warnings.length === 0,
    warnings
  }
}
```

Show warnings to user but allow proceeding if at least macros are available.

### User Scans Wrong Product

Confirmation card shows product image (if available) for verification:
- User can see product before confirming
- "Cancel" button allows re-scanning

### Duplicate Entries (Same Barcode Twice)

No automatic prevention - user may legitimately eat same food multiple times.

Optional enhancement: If same barcode scanned within 5 minutes, show:
```
"You logged Monster Energy Drink 3 minutes ago. Log another one?"
[Yes, Log It] [No, Cancel]
```

### Serving Size Confusion

Display serving size prominently:
```
Serving: 1 can (473ml) = 240 calories

If you drank half a can, set quantity to 0.5x
```

### Offline Mode

```typescript
class BarcodeCache {
  async get(barcode: string): Promise<CachedNutrition | null> {
    const db = await openDB('nutrition-cache')
    return await db.get('products', barcode)
  }

  async set(barcode: string, data: NutritionData): Promise<void> {
    const db = await openDB('nutrition-cache')
    await db.put('products', {
      barcode,
      data,
      cachedAt: Date.now()
    })
  }

  isExpired(cached: CachedNutrition): boolean {
    const expiryDuration = appConfig.nutritionApis.cacheExpiry
    return Date.now() - cached.cachedAt > expiryDuration
  }
}
```

User contributions queued for upload when back online:

```typescript
class ContributionQueue {
  async queue(data: NutritionData): Promise<void> {
    const db = await openDB('nutrition-cache')
    await db.add('contributions', {
      data,
      queuedAt: Date.now(),
      synced: false
    })
  }

  async sync(): Promise<void> {
    const db = await openDB('nutrition-cache')
    const pending = await db.getAllFromIndex('contributions', 'synced', false)

    for (const item of pending) {
      try {
        await OpenFoodFactsProvider.contribute(item.data)
        item.synced = true
        await db.put('contributions', item)
      } catch (error) {
        console.error('Failed to sync contribution:', error)
      }
    }
  }
}

// Sync when app comes online
window.addEventListener('online', () => {
  ContributionQueue.sync()
})
```

## Implementation Phases

### Phase 1: Foundation (Core Services) - Week 1

**Tasks:**
- Create `src/domains/nutrition/` directory structure
- Create `nutrition-types.ts` with TypeScript interfaces
- Create `nutrition-service.ts` with basic lookup logic
- Create `openfoodfacts-provider.ts` implementation
- Create `barcode-cache.ts` using IndexedDB
- Add nutrition config to `appConfig.ts`
- Write unit tests for API response normalization

**Deliverables:**
- Working OpenFoodFacts API integration
- Local caching functional
- Type-safe nutrition data structures

**Testing:**
- Unit tests for provider normalization
- Cache read/write tests
- Test with 10+ real barcodes

### Phase 2: Barcode Scanning - Week 2

**Tasks:**
- Install `@capacitor-community/barcode-scanner` dependency
- Create `barcode-scanner.ts` wrapper class
- Implement native camera scanning for iOS/Android
- Install `html5-qrcode` for web fallback
- Create `BarcodeScannerModal.svelte` component
- Implement manual barcode entry modal
- Handle camera permissions properly

**Deliverables:**
- Working barcode scanner on iOS
- Working barcode scanner on Android
- Web fallback functional
- Manual entry option

**Testing:**
- Test on physical iOS device
- Test on physical Android device
- Test web version in Chrome/Safari
- Test permission denial flows
- Test manual entry validation

### Phase 3: AI Integration - Week 3

**Tasks:**
- Add `scan_barcode` action type to `ai-query-service.ts`
- Implement `handleScanBarcode()` function
- Add quantity extraction from messages
- Update `detectIntent()` with food triggers
- Add barcode scan button to `ai-query-view.svelte`
- Implement loading states in chat UI
- Connect scanner to AI flow

**Deliverables:**
- AI detects food mentions and suggests scanning
- Quantity extracted from user messages
- Barcode scanning integrated into chat flow
- Loading/error states in UI

**Testing:**
- Test various food-related messages
- Test quantity extraction accuracy
- Test complete user flow end-to-end
- Test error handling in AI flow

### Phase 4: Tracker Auto-Creation - Week 4

**Tasks:**
- Implement `ensureNutritionTrackers()` function
- Create `createNutritionEntries()` batch logic
- Add color coding for nutrition trackers
- Implement macro/micro conditional creation
- Test timeline grouping
- Verify stats aggregation

**Deliverables:**
- Nutrition trackers auto-created correctly
- Entries grouped properly in timeline
- Stats show correct aggregated values
- Micro trackers hidden by default

**Testing:**
- Scan products with various nutrients
- Verify tracker creation logic
- Test with micronutrients enabled/disabled
- Verify timeline grouping works
- Test stats page calculations

### Phase 5: UI Polish - Week 5

**Tasks:**
- Create `NutritionConfirmationCard.svelte`
- Create `ManualEntryForm.svelte`
- Build quantity selector component
- Add product image display
- Create expandable micronutrient list
- Add settings screen for nutrition APIs
- Polish loading states and animations

**Deliverables:**
- Beautiful nutrition confirmation UI
- User-friendly manual entry form
- Intuitive quantity adjustment
- Settings screen for API configuration

**Testing:**
- Test UI on various screen sizes
- Test accessibility (screen readers)
- Test dark mode compatibility
- User acceptance testing

### Phase 6: Multi-Provider Support - Week 6

**Tasks:**
- Create `nutritionix-provider.ts`
- Create `usda-provider.ts`
- Implement provider fallback cascade
- Add API key validation
- Test with all three providers
- Handle rate limiting

**Deliverables:**
- Nutritionix integration working
- USDA integration working
- Fallback cascade functional
- API key validation in settings

**Testing:**
- Test with Nutritionix API key
- Test USDA lookups
- Test fallback when primary fails
- Test rate limiting behavior

### Phase 7: OpenFoodFacts Contribution - Week 7

**Tasks:**
- Implement contribution submission flow
- Create contribution queue for offline
- Build background sync service
- Show user contribution history
- Handle authentication for contributions

**Deliverables:**
- Users can contribute new products
- Offline contributions queued
- Background sync when online
- Contribution history visible

**Testing:**
- Test contribution submission
- Test offline queueing
- Test sync on reconnect
- Verify data appears on OpenFoodFacts

### Phase 8: Testing & Refinement - Week 8

**Tasks:**
- End-to-end testing on iOS/Android/Web
- Performance testing (scanner speed, API latency)
- Offline mode thorough testing
- Edge case handling verification
- User acceptance testing with beta users
- Bug fixes and polish

**Deliverables:**
- All platforms working smoothly
- Performance metrics met
- Edge cases handled
- Beta user feedback incorporated

**Testing:**
- Full regression test suite
- Performance benchmarks
- Offline/online transition tests
- Real-world usage scenarios

## Success Metrics

### Technical Metrics

- **Barcode scan success rate:** > 80% of scans successfully detect barcode
- **API lookup success rate:** > 90% of barcodes found across all providers
- **Average scan-to-log time:** < 10 seconds from opening camera to entries created
- **Cache hit rate:** > 60% of lookups served from cache (offline support)
- **Battery impact:** < 2% battery drain per 10 scans (camera usage)

### User Metrics

- **Adoption rate:** % of food-related entries using barcode scan vs manual
- **Contribution rate:** % of users who contribute when barcode not found
- **Retention:** Users who scan barcodes continue using feature after 1 week
- **Error rate:** < 5% of scans result in wrong product logged

### Performance Benchmarks

- **API latency:**
  - OpenFoodFacts: < 1s average response time
  - Nutritionix: < 800ms average response time
  - USDA: < 1.2s average response time
- **Scanner performance:**
  - Barcode detection: < 2s from opening camera
  - Camera startup: < 500ms
- **UI responsiveness:**
  - Confirmation card renders: < 100ms
  - Timeline updates: < 200ms after logging

## Future Enhancements (Post-MVP)

### Phase 9+: Advanced Features

1. **Meal Templates**
   - Save common meal combinations
   - Quick re-log entire meals
   - "I had breakfast" → scans saved template

2. **Recipe Builder**
   - Scan multiple ingredients
   - Calculate total nutrition
   - Save as custom recipe tracker

3. **Photo Recognition**
   - Take photo of food
   - AI identifies food items
   - Suggests barcode scan or estimates macros

4. **Nutrition Goals & Insights**
   - Set daily macro targets
   - Progress bars in tracker UI
   - Weekly nutrition reports
   - Deficiency warnings

5. **Restaurant Menu Integration**
   - Partner APIs for restaurant nutrition
   - "I ate at Chipotle" → shows menu
   - Select items, log nutrition

6. **Ingredient Allergen Alerts**
   - User sets allergen list
   - Scan warns if product contains allergen
   - Highlights allergens in ingredients

7. **Custom Nutrition Database**
   - Private family recipes
   - Homemade meal nutrition
   - Shareable within family

8. **Voice Commands**
   - "Add the barcode I just scanned"
   - Hands-free while cooking
   - Siri/Google Assistant integration

9. **Smart Suggestions**
   - "You usually have coffee after breakfast, track it?"
   - Learn meal patterns
   - Suggest complementary foods

10. **Batch Scanning**
    - Scan multiple items at once
    - Grocery haul tracking
    - Meal prep planning

### Performance Optimizations

- **Prefetch common barcodes** - Background fetch for frequently scanned items
- **Image compression** - Optimize product images for faster loading
- **Debounce scanner** - Prevent accidental double-scans
- **Lazy-load micronutrients** - Only fetch detailed nutrients when expanded
- **Service worker** - Offline-first architecture for instant cache access
- **CDN for images** - Cache product images on CDN for faster display

## Dependencies

### New NPM Packages

```json
{
  "@capacitor-community/barcode-scanner": "^4.0.0",
  "html5-qrcode": "^2.3.8",
  "idb": "^7.1.1"
}
```

### Capacitor Plugins

- `@capacitor/camera` (already installed for HealthKit)
- `@capacitor-community/barcode-scanner` (new)

### API Keys Required (Optional)

- **Nutritionix:** Free tier provides 500 requests/day
  - Sign up: https://www.nutritionix.com/business/api
  - Required fields: `nutritionixAppId`, `nutritionixApiKey`

## Risks & Mitigations

### Risk 1: Barcode Not Found

**Mitigation:**
- Multi-provider fallback cascade
- Manual entry option
- Encourage user contributions to OpenFoodFacts
- Cache user-contributed data locally

### Risk 2: Poor Scanner Performance

**Mitigation:**
- Use native scanner on iOS/Android (fast, reliable)
- Manual entry always available
- Clear error messages with retry option
- Timeout after 15s, prompt for manual entry

### Risk 3: API Rate Limits

**Mitigation:**
- Aggressive local caching (30 days)
- Rate limit checks before API calls
- Graceful degradation to cache
- Upgrade to paid Nutritionix if needed

### Risk 4: User Privacy Concerns

**Mitigation:**
- All data stored locally first
- Opt-in for OpenFoodFacts contributions
- Clear privacy policy in settings
- No tracking of individual food choices

### Risk 5: Inaccurate Nutrition Data

**Mitigation:**
- Show data source (OpenFoodFacts, Nutritionix, User)
- Allow users to edit entries
- Community verification via OpenFoodFacts
- Product images for verification

### Risk 6: Camera Permission Denied

**Mitigation:**
- Clear permission request message
- Deep link to settings if denied
- Manual entry always works without camera
- Educational tooltip on first use

## Conclusion

This barcode nutrition tracking feature transforms Nomie into a comprehensive nutrition tracking app while maintaining its core philosophy of flexible, private, local-first data. By integrating barcode scanning into the existing AI chat interface, we provide a seamless user experience that feels natural and requires minimal learning curve.

The multi-provider architecture ensures maximum barcode coverage, while local caching and offline support maintain Nomie's privacy-first approach. Auto-creating nutrition trackers reduces friction, and the community contribution model helps build a better nutrition database for everyone.

Implementation is split into 8 manageable phases over ~8 weeks, with clear deliverables and testing criteria at each stage. The foundation prioritizes core functionality first, with polish and advanced features following after the MVP proves successful.

Success will be measured by user adoption, technical performance, and the quality of nutrition data logged. With proper execution, this feature positions Nomie as a serious competitor to MyFitnessPal while maintaining its unique advantages of privacy, flexibility, and AI-powered tracking.
