# Product Name Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable text-based product search in AI chat to complement barcode scanning

**Architecture:** Add product search intent detection, implement multi-provider search with cascade fallback, reuse existing product confirmation UI

**Tech Stack:** TypeScript, Svelte, NutritionService (OpenFoodFacts, Nutritionix, USDA providers)

---

## Task 1: Add Product Name Extraction Helper

**Files:**
- Modify: `src/domains/ai-query/ai-query-service.ts`
- Test: Create test file for this later (after seeing if tests exist)

**Step 1: Add extractProductName helper function**

Add after line 380 (before `detectIntent`):

```typescript
/**
 * Extracts product name from message after search keyword
 * Examples:
 *   "lookup Monster Zero Ultra" → "Monster Zero Ultra"
 *   "search for protein bar" → "protein bar"
 *   "find greek yogurt 2 servings" → "greek yogurt"
 */
function extractProductName(message: string, searchKeywords: string[]): string {
  const lowerMessage = message.toLowerCase()

  // Find which search keyword was used
  let keywordMatch: string | null = null
  for (const keyword of searchKeywords) {
    if (keyword.includes(' ')) {
      if (lowerMessage.includes(keyword)) {
        keywordMatch = keyword
        break
      }
    } else {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i')
      if (regex.test(lowerMessage)) {
        keywordMatch = keyword
        break
      }
    }
  }

  if (!keywordMatch) return message.trim()

  // Extract everything after the keyword
  const keywordIndex = lowerMessage.indexOf(keywordMatch)
  let productName = message.substring(keywordIndex + keywordMatch.length).trim()

  // Remove quantity patterns (e.g., "2 cans", "1 serving")
  productName = productName.replace(/^\d+(?:\.\d+)?\s*(?:servings?|portions?|bars?|cans?|bottles?|packages?|items?)\s*/i, '')

  // Remove trailing quantity patterns (e.g., "yogurt 2 servings" → "yogurt")
  productName = productName.replace(/\s+\d+(?:\.\d+)?\s*(?:servings?|portions?|bars?|cans?|bottles?|packages?|items?)$/i, '')

  return productName.trim()
}
```

**Step 2: Verify code compiles**

Run: `npm run vbuild`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/domains/ai-query/ai-query-service.ts
git commit -m "feat(ai-query): add extractProductName helper for search intent

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Add Product Search Intent Detection

**Files:**
- Modify: `src/domains/ai-query/ai-query-service.ts:521-542`

**Step 1: Add search_product intent detection**

Add BEFORE the barcode scan check (around line 521), after the color update intent block:

```typescript
  // Check for product search intent (before barcode scan)
  const searchKeywords = ['lookup', 'search', 'find', 'search for', 'look up']
  const hasSearchKeyword = searchKeywords.some(keyword => {
    if (keyword.includes(' ')) {
      return lowerMessage.includes(keyword)
    }
    const regex = new RegExp(`\\b${keyword}\\b`, 'i')
    return regex.test(lowerMessage)
  })

  if (hasSearchKeyword && hasFoodKeyword) {
    // Extract product name - everything after the search keyword
    const productName = extractProductName(lowerMessage, searchKeywords)

    // Extract quantity using same logic as barcode scan
    let quantity = 1
    const quantityMatch = lowerMessage.match(/(\d+(?:\.\d+)?)\s*(?:servings?|portions?|bars?|cans?|bottles?|packages?|items?)?/)
    if (quantityMatch) {
      quantity = parseFloat(quantityMatch[1])
    }

    return {
      type: 'search_product',
      productName,
      quantity,
    }
  }
```

**Step 2: Update IntentDetectionResult type**

Find the `IntentDetectionResult` type definition and add the new intent type:

```typescript
type IntentDetectionResult =
  | { type: 'delete_entry'; trackerName?: string; count: number }
  | { type: 'update_all_colors'; referenceTracker?: string; boardLabel?: string }
  | { type: 'scan_barcode'; quantity: number; suggestScan?: boolean }
  | { type: 'search_product'; productName: string; quantity: number }  // NEW
  | { type: 'question' }
  | { type: 'add_entry'; trackerNames?: string[]; value?: number }
```

**Step 3: Verify code compiles**

Run: `npm run vbuild`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/domains/ai-query/ai-query-service.ts
git commit -m "feat(ai-query): add search_product intent detection

Detects explicit search keywords (lookup, search, find) combined with food
context to trigger product name search instead of barcode scanning.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Add UI State for Product Search

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte`

**Step 1: Add state variables**

Find the existing state variables (search for `let nutritionData` around line 150-200) and add:

```typescript
// Product search state
let searchResults: NutritionData[] = []
let searchError: string | null = null
let isSearching: boolean = false
let currentSearchQuantity: number = 1
```

**Step 2: Verify code compiles**

Run: `npm run vbuild`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/domains/ai-query/ai-query-view.svelte
git commit -m "feat(ai-query): add UI state for product search

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Add Product Deduplication Helper

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte`

**Step 1: Add deduplicateResults helper function**

Add after the state variables (around line 200):

```typescript
/**
 * Deduplicate nutrition results by normalized product name + brand
 * Prefers results with more complete nutrient data
 */
function deduplicateResults(results: NutritionData[]): NutritionData[] {
  const seen = new Map<string, NutritionData>()

  for (const result of results) {
    // Create normalized key from product name + brand
    const normalizedName = result.productName.toLowerCase().trim()
    const normalizedBrand = (result.brand || '').toLowerCase().trim()
    const key = `${normalizedBrand}|${normalizedName}`

    const existing = seen.get(key)

    if (!existing) {
      seen.set(key, result)
    } else {
      // Keep result with more nutrient data
      const existingNutrientCount = Object.keys(existing.nutrients).length
      const newNutrientCount = Object.keys(result.nutrients).length

      if (newNutrientCount > existingNutrientCount) {
        seen.set(key, result)
      }
    }
  }

  return Array.from(seen.values())
}
```

**Step 2: Verify code compiles**

Run: `npm run vbuild`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/domains/ai-query/ai-query-view.svelte
git commit -m "feat(ai-query): add deduplicateResults helper

Deduplicates search results by normalized product name + brand,
preferring results with more complete nutrient data.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Implement Multi-Provider Search Handler

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte`

**Step 1: Import nutrition providers**

Add to imports at top of script section:

```typescript
import { nutritionixProvider } from '$domains/nutrition/providers/nutritionix-provider'
import { usdaProvider } from '$domains/nutrition/providers/usda-provider'
```

**Step 2: Add handleProductSearch function**

Add after `deduplicateResults`:

```typescript
/**
 * Search for products by name using multi-provider cascade
 * Tries OpenFoodFacts first, then Nutritionix, then USDA until we have 3+ results
 */
async function handleProductSearch(productName: string, quantity: number) {
  isSearching = true
  searchError = null
  searchResults = []

  try {
    let allResults: NutritionData[] = []

    // Primary: OpenFoodFacts (via nutritionService)
    try {
      const offResults = await nutritionService.search(productName)
      allResults.push(...offResults)
    } catch (error) {
      console.warn('OpenFoodFacts search failed:', error)
    }

    // If <3 results, try Nutritionix
    if (allResults.length < 3) {
      try {
        const nixResults = await nutritionixProvider.search(productName)
        allResults.push(...nixResults)
      } catch (error) {
        console.warn('Nutritionix search failed:', error)
      }
    }

    // If still <3, try USDA
    if (allResults.length < 3) {
      try {
        const usdaResults = await usdaProvider.search(productName)
        allResults.push(...usdaResults)
      } catch (error) {
        console.warn('USDA search failed:', error)
      }
    }

    // Deduplicate by product name + brand
    const unique = deduplicateResults(allResults)
    searchResults = unique.slice(0, 5) // Top 5

    if (searchResults.length === 0) {
      searchError = `No results found for "${productName}"`
    }

    currentSearchQuantity = quantity
  } catch (error) {
    console.error('Product search failed:', error)
    searchError = `Search failed: ${error.message}`
  } finally {
    isSearching = false
  }
}
```

**Step 3: Verify code compiles**

Run: `npm run vbuild`
Expected: Build succeeds (may have unused import warnings, that's OK)

**Step 4: Commit**

```bash
git add src/domains/ai-query/ai-query-view.svelte
git commit -m "feat(ai-query): implement multi-provider product search

Cascades through OpenFoodFacts → Nutritionix → USDA until 3+ results found.
Returns top 5 deduplicated results.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Add Product Selection Handler

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte`

**Step 1: Add handleProductSelect function**

Add after `handleProductSearch`:

```typescript
/**
 * Handle user selecting a product from search results
 * Reuses existing product confirmation flow (same as barcode scan)
 */
function handleProductSelect(selectedProduct: NutritionData) {
  // Clear search results
  searchResults = []
  searchError = null

  // Set product data (triggers product confirmation card display)
  nutritionData = selectedProduct

  // The rest follows the existing barcode scan flow:
  // - Shows product confirmation card
  // - User can adjust quantity
  // - User clicks "Log It" to create entry
}
```

**Step 2: Verify code compiles**

Run: `npm run vbuild`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/domains/ai-query/ai-query-view.svelte
git commit -m "feat(ai-query): add product selection handler

Reuses existing product confirmation flow from barcode scanning.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Wire Search Intent to Handler

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte`

**Step 1: Find intent handling code**

Locate where `detectIntent` results are processed (search for `intentResult.type`), likely in the message submission handler.

**Step 2: Add search_product case**

Add alongside existing intent handlers:

```typescript
if (intentResult.type === 'search_product') {
  await handleProductSearch(intentResult.productName, intentResult.quantity)
  return // Don't send to LLM
}
```

**Step 3: Verify code compiles**

Run: `npm run vbuild`
Expected: Build succeeds

**Step 4: Test basic flow manually**

Run: `npm run dev`
1. Open app in browser
2. Go to AI chat
3. Type: "lookup protein bar"
4. Expected: Should trigger search (may see loading, errors OK at this stage)

**Step 5: Commit**

```bash
git add src/domains/ai-query/ai-query-view.svelte
git commit -m "feat(ai-query): wire search_product intent to handler

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Add Search Results UI Component

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte` (UI section)

**Step 1: Add search results display**

Find the existing product confirmation UI section and add nearby:

```svelte
{#if isSearching}
  <div class="search-loading">
    <div class="spinner"></div>
    <p>Searching for products...</p>
  </div>
{/if}

{#if searchError && searchResults.length === 0}
  <div class="search-error">
    <p>{searchError}</p>
    <button
      class="btn btn-sm"
      on:click={() => {
        searchError = null
        // Could trigger barcode scanner here as fallback
      }}
    >
      Try Barcode Scan Instead
    </button>
  </div>
{/if}

{#if searchResults.length > 0}
  <div class="search-results">
    <h4>Select Product:</h4>
    {#each searchResults as result}
      <button
        class="product-result-item"
        on:click={() => handleProductSelect(result)}
      >
        <div class="product-info">
          <div class="product-name">{result.productName}</div>
          {#if result.brand}
            <div class="product-brand">{result.brand}</div>
          {/if}
          <div class="product-serving">{result.servingSize}</div>
        </div>
        <div class="product-source-badge">{result.source}</div>
      </button>
    {/each}
  </div>
{/if}
```

**Step 2: Add basic styles**

Add to style section:

```scss
.search-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  gap: 0.5rem;
}

.search-error {
  padding: 1rem;
  background: var(--color-red-faded);
  border-radius: 8px;
  margin: 0.5rem 0;

  p {
    margin: 0 0 0.5rem 0;
    color: var(--color-red);
  }
}

.search-results {
  margin: 1rem 0;

  h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
    opacity: 0.7;
  }
}

.product-result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: var(--color-solid-2);
  border: 1px solid var(--color-solid-3);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;

  &:hover {
    background: var(--color-solid-3);
    transform: translateX(2px);
  }

  .product-info {
    flex: 1;
  }

  .product-name {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .product-brand {
    font-size: 0.85rem;
    opacity: 0.7;
    margin-bottom: 0.25rem;
  }

  .product-serving {
    font-size: 0.8rem;
    opacity: 0.6;
  }

  .product-source-badge {
    font-size: 0.7rem;
    padding: 0.25rem 0.5rem;
    background: var(--color-primary-faded);
    color: var(--color-primary);
    border-radius: 4px;
    text-transform: uppercase;
  }
}
```

**Step 3: Verify code compiles**

Run: `npm run vbuild`
Expected: Build succeeds

**Step 4: Test UI manually**

Run: `npm run dev`
1. Type: "lookup protein bar"
2. Expected: See search results list
3. Click a result
4. Expected: Shows product confirmation card

**Step 5: Commit**

```bash
git add src/domains/ai-query/ai-query-view.svelte
git commit -m "feat(ai-query): add search results UI

Displays top 5 search results with product name, brand, serving size,
and source badge. Includes loading and error states.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Add Search Timeout Handling

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte`

**Step 1: Add timeout wrapper utility**

Add helper function:

```typescript
/**
 * Wraps a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Search timeout')), timeoutMs)
    ),
  ])
}
```

**Step 2: Update handleProductSearch to use timeouts**

Modify each provider call:

```typescript
// Primary: OpenFoodFacts (via nutritionService)
try {
  const offResults = await withTimeout(
    nutritionService.search(productName),
    10000 // 10s timeout
  )
  allResults.push(...offResults)
} catch (error) {
  console.warn('OpenFoodFacts search failed:', error)
}

// If <3 results, try Nutritionix
if (allResults.length < 3) {
  try {
    const nixResults = await withTimeout(
      nutritionixProvider.search(productName),
      10000
    )
    allResults.push(...nixResults)
  } catch (error) {
    console.warn('Nutritionix search failed:', error)
  }
}

// If still <3, try USDA
if (allResults.length < 3) {
  try {
    const usdaResults = await withTimeout(
      usdaProvider.search(productName),
      10000
    )
    allResults.push(...usdaResults)
  } catch (error) {
    console.warn('USDA search failed:', error)
  }
}
```

**Step 3: Verify code compiles**

Run: `npm run vbuild`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/domains/ai-query/ai-query-view.svelte
git commit -m "feat(ai-query): add 10s timeout per provider search

Prevents hanging on slow/unresponsive nutrition APIs. Cascades to next
provider on timeout.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Manual Testing & Bug Fixes

**Files:**
- Various (as needed based on testing)

**Step 1: Test basic search flow**

Manual test scenarios:
1. "lookup Monster Zero Ultra" → Should return results
2. "search protein bar" → Should return results
3. "find greek yogurt" → Should return results
4. Select a product → Should show confirmation card
5. Adjust quantity → Should work
6. Click "Log It" → Should create entry with trackers

**Step 2: Test edge cases**

1. "lookup asdfghjkl" → Should show "No results found"
2. "search" alone (no product) → Should not crash
3. "ate Monster" (no search keyword) → Should still suggest barcode scan

**Step 3: Test provider cascade**

Use browser DevTools Network tab:
1. Search for obscure product
2. Verify multiple API calls if needed
3. Verify max 3 providers tried

**Step 4: Fix any bugs found**

Document bugs and fixes:
- Bug: [description]
- Fix: [what was changed]
- Commit each fix separately

**Step 5: Verify tests still pass**

Run: `npm run vtest run`
Expected: Same pass/fail as baseline (1 pre-existing failure in goals.spec.ts)

**Step 6: Final commit if any fixes**

```bash
git add .
git commit -m "fix(ai-query): address manual testing issues

[List specific fixes made]

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Update Documentation

**Files:**
- Modify: `README.md` or relevant docs

**Step 1: Add feature to changelog/docs**

Document the new feature:
- How to use: "Type 'lookup [product name]' in AI chat"
- What it does: Searches nutrition databases
- Limitations: Requires exact or similar product name

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add product search feature documentation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Testing Checklist (Manual Verification)

After implementation, verify:

- [ ] "lookup Monster Zero Ultra" returns results from OpenFoodFacts
- [ ] "search protein bar" shows top 5 results
- [ ] "find greek yogurt" cascades through providers
- [ ] Selecting result shows product confirmation card (same UI as barcode)
- [ ] Quantity adjustment works correctly in confirmation card
- [ ] "Log It" creates all macro trackers (calories, protein, carbs, fat, sodium)
- [ ] Entries appear in timeline with correct values
- [ ] "ate Monster" still suggests barcode scan (doesn't trigger search)
- [ ] Misspelled names show similar results or "No results found"
- [ ] Timeout handling works (test with slow network)
- [ ] Empty results show fallback message
- [ ] Error states display properly
- [ ] All existing tests still pass (except pre-existing goals.spec.ts failure)
- [ ] No TypeScript errors in build
- [ ] No console errors during normal operation
- [ ] Mobile UI works (responsive design)

---

## Notes for Implementer

**Existing Code to Reuse:**
- `processScannedBarcode()` flow at line 778 - product confirmation card
- `ensureNutritionTrackers()` - auto-creates missing trackers
- `createNutritionEntry()` - builds log entry with macros
- Quantity extraction regex at line 565

**Key Files:**
- `/src/domains/ai-query/ai-query-service.ts` - Intent detection
- `/src/domains/ai-query/ai-query-view.svelte` - UI and handlers
- `/src/domains/nutrition/nutrition-service.ts` - Provider abstraction
- `/src/domains/nutrition/providers/` - OpenFoodFacts, Nutritionix, USDA

**Testing:**
- Run `npm run dev` for local dev server
- Run `npm run vbuild` to verify builds
- Run `npm run vtest run` for test suite
- Test manually in browser at http://localhost:5001

**Common Issues:**
- Provider imports might need path adjustments
- NutritionData type might need importing
- CSS variables might differ from examples (check existing styles)
- Search API might be rate-limited (use demo keys for testing)

**Success Criteria:**
- Users can type "lookup [product]" and get search results
- Results can be selected and logged with same UX as barcode scan
- All existing barcode scan functionality remains unchanged
- No regression in existing tests
