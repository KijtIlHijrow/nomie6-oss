# Phase 7: Nutrition Community Contributions Design

**Date:** 2026-01-13
**Status:** Approved
**Phase:** 7 of 8 (Nutrition Tracking Implementation)

## Overview

Enable users to contribute nutrition data to OpenFoodFacts when barcode scanning fails. This closes the loop on the barcode scanning feature by allowing the community to expand the database.

## User Experience

### Trigger Flow

When barcode scanning fails across all providers (OpenFoodFacts, Nutritionix, USDA):

1. AI chat displays action type: `needs_manual_contribution`
2. Message: "Product not found in database. Would you like to add it?"
3. Button: "Add this product to database"
4. Click expands inline form within chat message
5. User fills comprehensive nutrition form
6. Submit attempts immediate sync, falls back to queue if offline

### Form Structure

**ManualNutritionForm.svelte** - Inline component in AI chat

**Product Information:**
- Barcode (pre-filled, read-only)
- Product Name (required, text input)
- Brand (optional, text input)

**Serving Information:**
- Serving Size (required, number input, > 0)
- Serving Unit (required, dropdown: g, ml, oz, cup, piece, can, bottle, bar)

**Macronutrients (Required):**
- Calories (kcal)
- Protein (g)
- Carbohydrates (g)
- Fat (g)

**Extended Macros (Optional, collapsed):**
- Fiber (g)
- Sugar (g)
- Saturated Fat (g)
- Trans Fat (g)

**Minerals (Optional, collapsed):**
- Sodium (mg)
- Potassium (mg)
- Calcium (mg)
- Iron (mg)
- Magnesium (mg)
- Zinc (mg)
- Phosphorus (mg)

**Vitamins (Optional, collapsed):**
- Vitamin A (mcg)
- Vitamin C (mg)
- Vitamin D (mcg)
- Vitamin E (mg)
- Vitamin K (mcg)
- B-Complex vitamins (B1, B2, B3, B6, B12, Folate, Biotin, Pantothenic Acid)

**Additional Information (Optional, collapsed):**
- Ingredients (textarea, comma-separated)
- Allergens (multi-select: milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soy)
- Cholesterol (mg)
- Caffeine (mg)
- Product Image URL (text input)

**Visual Design:**
- Accordion-style sections (expand/collapse)
- Start with Product Info + Serving + Macros expanded
- Advanced nutrients collapsed by default
- Real-time validation with inline error messages
- Two buttons:
  - "Save Draft" (secondary) - Queue locally without submitting
  - "Submit to OpenFoodFacts" (primary) - Hybrid submission

## Architecture

### Components

**New:**
- `ManualNutritionForm.svelte` - Full nutrition entry form
- `openfoodfacts-contributor.ts` - OpenFoodFacts submission module
- `contribution-sync-service.ts` - Background sync service

**Modified:**
- `ai-query-view.svelte` - Add `needs_manual_contribution` action handler
- `nutrition-service.ts` - Add `contributeProduct()` method
- `ai-query-service.ts` - Detect scan failure → trigger contribution flow

### Data Flow

```
Barcode Scan Fails
    ↓
AI detects → needs_manual_contribution action
    ↓
User fills ManualNutritionForm
    ↓
nutrition-service.contributeProduct()
    ↓
┌─────────────────────────────────┐
│ Validate Required Fields        │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Try Immediate Submission        │
│ openfoodfacts-contributor.ts    │
└─────────────────────────────────┘
    ↓
  Success? ──YES──> Cache locally + Show "Product added! ✓"
    │
    NO (network error)
    ↓
┌─────────────────────────────────┐
│ Queue in IndexedDB              │
│ barcodeCache.queueContribution()│
└─────────────────────────────────┘
    ↓
Show "Saved locally. Will sync when online. ⏳"
    ↓
┌─────────────────────────────────┐
│ Background Sync (periodic)      │
│ contribution-sync-service.ts    │
└─────────────────────────────────┘
    ↓
Retry queued contributions → Update sync status
```

## Submission Logic

### Hybrid Submission Flow

**Method Signature:**
```typescript
async contributeProduct(data: NutritionData): Promise<{
  success: boolean
  queued: boolean
  error?: string
}>
```

**Process:**

1. **Validate**
   - Check all required fields present
   - Validate data types and ranges
   - Serving size > 0
   - All numbers non-negative, max 4 decimal places
   - If invalid → Return `{success: false, error: "..."}`

2. **Immediate Submission Attempt**
   - POST to OpenFoodFacts API via `openfoodfacts-contributor.ts`
   - If success (status = 1):
     - Cache product locally in IndexedDB
     - Return `{success: true, queued: false}`
   - If network error (timeout, offline):
     - Proceed to step 3 (queue)
   - If API validation error (400/422):
     - Return `{success: false, error: "Invalid data"}`
     - Do NOT queue invalid data

3. **Queue on Network Failure**
   - Call `barcodeCache.queueContribution(data)`
   - Return `{success: true, queued: true}`
   - User sees: "Saved for later sync"

### Background Sync Service

**contribution-sync-service.ts**

**Triggers:**
- App startup (if online)
- Periodic interval: Every 30 minutes (when online)
- Manual trigger from settings menu

**Process:**
```typescript
async syncPendingContributions(): Promise<SyncResult> {
  const pending = await barcodeCache.getPendingContributions()

  let synced = 0
  let failed = 0

  for (const contribution of pending) {
    await delay(1000) // Rate limiting: 1 second between submissions

    try {
      const result = await openfoodfactsContributor.submit(contribution.data)

      if (result.success) {
        await barcodeCache.markContributionSynced(contribution.id, true)
        synced++
      } else {
        await barcodeCache.markContributionSynced(contribution.id, false, result.error)
        failed++
      }
    } catch (error) {
      // Network error - leave as pending, try again later
      continue
    }
  }

  if (synced > 0) {
    showToast({ message: `Synced ${synced} contribution(s) to OpenFoodFacts` })
  }

  return { synced, failed, pending: pending.length - synced - failed }
}
```

**User Feedback:**
- Toast notification on successful background sync
- Badge in settings showing pending contribution count
- Sync history view (optional Phase 8)

## OpenFoodFacts API Integration

### Endpoint

**URL:** `https://world.openfoodfacts.org/cgi/product_jqm2.pl`
**Method:** POST
**Content-Type:** `application/x-www-form-urlencoded`

### Authentication

- `user_id`: "nomie-app" (app identifier)
- `password`: User email (optional, for contributor credit)
- Include in POST body as form fields

### Payload Mapping

Transform `NutritionData` → OpenFoodFacts format:

```typescript
{
  // Authentication
  user_id: "nomie-app",
  password: userEmail || "",

  // Product
  code: data.barcode,
  product_name: data.productName,
  brands: data.brand || "",
  serving_size: `${data.servingSize}`,

  // Macronutrients
  nutriment_energy: data.nutrients.calories * 4.184, // Convert kcal → kJ
  nutriment_proteins: data.nutrients.protein_g,
  nutriment_carbohydrates: data.nutrients.carbs_g,
  nutriment_fat: data.nutrients.fat_g,

  // Extended macros
  nutriment_fiber: data.nutrients.fiber_g,
  nutriment_sugars: data.nutrients.sugar_g,
  nutriment_saturated_fat: data.nutrients.saturated_fat_g,
  nutriment_trans_fat: data.nutrients.trans_fat_g,

  // Minerals (convert to g for OpenFoodFacts)
  nutriment_sodium: data.nutrients.sodium_mg ? data.nutrients.sodium_mg / 1000 : undefined,
  nutriment_potassium: data.nutrients.potassium_mg ? data.nutrients.potassium_mg / 1000 : undefined,
  nutriment_calcium: data.nutrients.calcium_mg ? data.nutrients.calcium_mg / 1000 : undefined,
  nutriment_iron: data.nutrients.iron_mg ? data.nutrients.iron_mg / 1000 : undefined,

  // Vitamins (convert mcg → mg where needed)
  nutriment_vitamin_a: data.nutrients.vitamin_a_mcg ? data.nutrients.vitamin_a_mcg / 1000 : undefined,
  nutriment_vitamin_c: data.nutrients.vitamin_c_mg,
  nutriment_vitamin_d: data.nutrients.vitamin_d_mcg ? data.nutrients.vitamin_d_mcg / 1000 : undefined,

  // Additional
  nutriment_cholesterol: data.nutrients.cholesterol_mg ? data.nutrients.cholesterol_mg / 1000 : undefined,
  nutriment_caffeine: data.nutrients.caffeine_mg ? data.nutrients.caffeine_mg / 1000 : undefined,

  // Text fields
  ingredients_text: data.ingredients.join(", "),
  allergens: data.allergens?.join(", "),
  image_url: data.imageUrl
}
```

### Response Handling

**Success Response:**
```json
{
  "status": 1,
  "status_verbose": "fields saved",
  "product": { ... }
}
```

**Error Response:**
```json
{
  "status": 0,
  "status_verbose": "Error message here"
}
```

**Handling:**
- Status 1 → Success, cache product
- Status 0 → API error, return error message
- Network timeout/offline → Queue for later

### Rate Limiting

- 1-second delay between batch sync submissions
- OpenFoodFacts has no strict rate limits, but we're respectful
- Max 100 contributions per sync cycle

## Validation Rules

### Required Fields

- `barcode` - Pre-filled, validated format
- `productName` - Min 2 characters
- `servingSize` - Number > 0
- `servingUnit` - One of allowed units
- `calories` - Number ≥ 0
- `protein_g` - Number ≥ 0
- `carbs_g` - Number ≥ 0
- `fat_g` - Number ≥ 0

### Optional Fields

- All other nutrients: Number ≥ 0 if provided
- Max 4 decimal places for all numbers
- Ingredients: Max 2000 characters
- Product name: Max 200 characters
- Brand: Max 100 characters

### Real-time Validation

- Show inline error messages as user types
- Highlight invalid fields in red
- Disable submit button until all required fields valid
- "Save Draft" always enabled (allows partial data)

## User Feedback Messages

**Immediate Success:**
> ✓ Product added to OpenFoodFacts!
> Cached locally for faster future lookups.

**Queued (offline):**
> ⏳ Saved locally. Will sync when online.
> You have 3 pending contributions.

**Validation Error:**
> ⚠ Please fix the following errors:
> • Serving size must be greater than 0
> • Protein cannot be negative

**Background Sync Success:**
> ✓ Synced 3 contributions to OpenFoodFacts

**Background Sync Partial:**
> ⏳ Synced 2 of 5 contributions
> 3 pending (will retry later)

## Error Handling

### Network Errors
- Catch all fetch errors
- Queue contribution automatically
- Don't alarm user ("saved for later sync")

### API Validation Errors
- Show specific field errors from OpenFoodFacts
- Don't queue invalid data
- Let user correct and retry

### Offline Detection
- Check `navigator.onLine` before submit attempt
- If offline, skip immediate submit, go straight to queue
- Show appropriate message

## Settings Integration

### Contribution Preferences

Add to nutrition settings panel:

- **Enable Contributions:** Toggle (default: ON)
- **Contributor Email:** Optional text input (for credit)
- **Pending Contributions:** Badge count + "View Queue" button
- **Sync Now:** Manual trigger button

### Queue Management

**View Queue Screen** (optional Phase 8):
- List all pending contributions
- Show sync status (pending, syncing, failed)
- Retry failed contributions
- Delete individual contributions
- Clear all synced contributions

## Testing Considerations (Phase 8)

### Unit Tests
- Validate form fields
- Transform NutritionData → OpenFoodFacts format
- Queue/sync logic

### Integration Tests
- Mock OpenFoodFacts API responses
- Test offline → online transition
- Test background sync service

### E2E Tests
- Full flow: Scan fails → Fill form → Submit
- Offline submission → Background sync
- Invalid data handling

## Success Metrics

- Contribution submission success rate
- Average time to fill form
- Queue size (pending contributions)
- Sync success rate
- User adoption (% who contribute after failed scan)

## Future Enhancements (Post-Phase 7)

- OCR for scanning nutrition labels (auto-fill from photo)
- Duplicate detection before submission
- Product image upload to OpenFoodFacts
- Community moderation (flag incorrect data)
- Gamification (contribution badges/streaks)
