# Product Name Search for AI Chat

**Date:** 2026-01-15
**Status:** Approved
**Feature:** Text-based product search in AI chat to complement barcode scanning

## Problem

Users can scan barcodes to track nutrition, but can't search by product name. The nutrition service already has `search()` methods for all providers (OpenFoodFacts, Nutritionix, USDA), but they're not exposed in the AI chat interface.

## Solution

Add explicit product search using keywords like "lookup", "search", "find" to trigger text-based nutrition database search. Shows top 5 results, user selects the right one, then follows the same confirmation flow as barcode scanning.

## User Flow

1. User types: "lookup Monster Zero Ultra"
2. System detects `search_product` intent (search keyword + food context)
3. Searches all nutrition providers with fallback cascade
4. Displays top 5 results (or "No exact match, here are similar products:")
5. User clicks desired product
6. Shows same product confirmation card as barcode scan
7. User adjusts quantity if needed, clicks "Log It"
8. Creates trackers (calories, protein, carbs, fat, sodium) and log entry

## Design Details

### 1. Intent Detection

**File:** `src/domains/ai-query/ai-query-service.ts`

**New Intent Type:** `search_product`

Add detection logic before food keyword check (around line 543):

```typescript
// Product search keywords (explicit)
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

  return {
    type: 'search_product',
    productName,
    quantity: extractQuantity(lowerMessage) // Reuse existing quantity logic
  }
}
```

**Intent Priority Order:**
1. Delete intent
2. Color update intent
3. Barcode scan (explicit "scan" keyword)
4. **Product search (new - search keywords + food context)**
5. Food keywords (suggests barcode scan)
6. Question intent
7. Add entry intent

**Behavior Difference:**
- "ate Monster Zero Ultra" → suggests barcode scan (existing)
- "lookup Monster Zero Ultra" → searches by name (new)

### 2. Search Execution

**File:** `src/domains/ai-query/ai-query-view.svelte`

**New Handler:**

```typescript
async function handleProductSearch(productName: string, quantity: number) {
  isSearching = true
  searchError = null

  try {
    let allResults = []

    // Primary: OpenFoodFacts
    const offResults = await nutritionService.search(productName)
    allResults.push(...offResults.map(r => ({...r, source: 'openfoodfacts'})))

    // If <3 results, try Nutritionix
    if (allResults.length < 3) {
      const nixResults = await nutritionixProvider.search(productName)
      allResults.push(...nixResults.map(r => ({...r, source: 'nutritionix'})))
    }

    // If still <3, try USDA
    if (allResults.length < 3) {
      const usdaResults = await usdaProvider.search(productName)
      allResults.push(...usdaResults.map(r => ({...r, source: 'usda'})))
    }

    // Deduplicate by product name + brand
    const unique = deduplicateResults(allResults)
    searchResults = unique.slice(0, 5) // Top 5

    if (searchResults.length === 0) {
      searchError = `No results found for "${productName}"`
    }

    currentSearchQuantity = quantity
  } catch (error) {
    searchError = `Search failed: ${error.message}`
  } finally {
    isSearching = false
  }
}
```

**Provider Cascade Strategy:**
- Start with OpenFoodFacts (free, best international coverage)
- If <3 results, try Nutritionix (US-focused, commercial)
- If still <3, try USDA (authoritative, government database)
- Combine results and deduplicate
- Return top 5

**Deduplication Logic:**
- Match on normalized product name + brand
- Case-insensitive comparison
- Prefer results with more complete nutrient data

### 3. UI State Management

**New State Variables:**

```typescript
let searchResults: NutritionData[] = []
let searchError: string | null = null
let isSearching: boolean = false
let currentSearchQuantity: number = 1
```

**Results Display:**
- Simple list of 5 items
- Each item shows: product name, brand, serving size, provider badge
- Click handler: `handleProductSelect(product)`

**Empty State:**
- No results: "No results found for '{productName}'"
- Similar results mode: "No exact match, here are similar products:"
- Fallback option: "Try scanning barcode?" button

### 4. Product Selection & Entry Creation

**Selection Handler:**

```typescript
function handleProductSelect(selectedProduct: NutritionData) {
  // Clear search results
  searchResults = []

  // Set product data (triggers product confirmation card)
  nutritionData = selectedProduct

  // Pre-fill quantity from search
  // (Uses same UI as barcode scan from line 778)
}
```

**Reused Components:**
- Product confirmation card (existing)
- `ensureNutritionTrackers()` - creates missing trackers
- `createNutritionEntry()` - builds log with scaled macros
- Quantity adjustment controls
- "Log It" button and logging flow

**No new UI needed** - completely reuses barcode scan confirmation flow.

### 5. Error Handling

| Error | Behavior |
|-------|----------|
| Search timeout (10s/provider) | Skip provider, continue to next |
| All providers fail | Show error + "Try scanning barcode?" button |
| Network offline | Show cached message if available, else error |
| Invalid product data | Skip result, log warning, continue |
| No results found | Show "No results" + similar products if any |

### 6. Technical Considerations

**Performance:**
- 10s timeout per provider
- Maximum 30s total (3 providers)
- Parallel requests not needed (cascade stops at 3+ results)
- Search results not cached (nutrition data already cached after selection)

**Data Quality:**
- OpenFoodFacts: Most comprehensive, community-driven
- Nutritionix: Best for branded US products
- USDA: Most authoritative, standardized nutrients
- Deduplication prevents showing same product from multiple sources

**Backward Compatibility:**
- Existing barcode scan flow unchanged
- Food keywords still suggest barcode (default behavior)
- Only explicit search keywords trigger new flow

## Implementation Plan

1. Add `search_product` intent detection in `ai-query-service.ts`
2. Add `extractProductName()` helper function
3. Add UI state variables in `ai-query-view.svelte`
4. Implement `handleProductSearch()` with provider cascade
5. Implement `deduplicateResults()` helper
6. Add search results UI component
7. Wire up `handleProductSelect()` to existing confirmation flow
8. Add error states and fallback UI
9. Test with various product names (branded, generic, misspelled)
10. Test provider fallback scenarios

## Testing Checklist

- [ ] "lookup Monster Zero Ultra" returns results
- [ ] "search protein bar" shows top 5
- [ ] "find greek yogurt" cascades through providers
- [ ] Selecting result shows product confirmation card
- [ ] Quantity adjustment works correctly
- [ ] Logging creates all macro trackers
- [ ] "ate Monster" still suggests barcode scan (not search)
- [ ] Misspelled names show similar results
- [ ] Network failure shows appropriate error
- [ ] Empty results show fallback message

## Future Enhancements (Out of Scope)

- Auto-complete/suggestions while typing
- Recent searches history
- Favorites/saved products
- Barcode lookup from product URL
- Custom product creation for missing items
