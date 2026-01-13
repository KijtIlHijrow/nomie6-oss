# Phase 8: Testing & Refinement Design

**Date:** 2026-01-13
**Status:** Approved
**Phase:** 8 of 8 (Nutrition Tracking Implementation)

## Overview

Comprehensive testing strategy for the nutrition tracking feature, focusing on critical paths with integration tests and mocked dependencies. Validates contribution workflow, error handling, and barcode scanning without requiring physical devices for automated tests.

## Current State

**Existing Tests:**
- `nutrition-service.spec.ts` - 10 tests passing
- `openfoodfacts-provider.spec.ts` - 10 tests passing

**Modules Without Tests:**
- `barcode-scanner.ts`
- `barcode-cache.ts`
- `contribution-sync-service.ts`
- `openfoodfacts-contributor.ts`
- `nutritionix-provider.ts`
- `usda-provider.ts`

**Testing Infrastructure:**
- Vitest for unit/integration tests
- Cypress for E2E tests
- Coverage tools available

## Testing Philosophy

**Critical Path Focus:**
- Test the most important user-facing flows
- Integration tests with mocked APIs (realistic, maintainable)
- Emphasis on validation failures and API error handling
- Mock hardware-dependent features (barcode scanner)
- Minimal E2E tests (one happy path)

**Priorities:**
1. **Validation** - Prevent bad data from reaching API
2. **API Error Handling** - Graceful degradation on failures
3. **Offline/Online Flow** - Queue and sync mechanisms
4. **Scanner Integration** - Entry point to feature

## Testing Architecture

### Test Structure

```
src/domains/nutrition/
├── __tests__/
│   ├── fixtures/
│   │   ├── mock-barcodes.ts          # Test barcode data
│   │   ├── mock-nutrition-data.ts    # Valid/invalid nutrition objects
│   │   └── mock-api-responses.ts     # OpenFoodFacts response scenarios
│   ├── mocks/
│   │   ├── capacitor-barcode.mock.ts # Mocked scanner plugin
│   │   └── fetch.mock.ts             # Mocked API calls
│   └── integration/
│       ├── contribution-workflow.spec.ts     # Form → Submit → Queue → Sync
│       ├── validation-errors.spec.ts         # All validation scenarios
│       ├── api-error-handling.spec.ts        # Network/API failure cases
│       └── barcode-scanning.spec.ts          # Scanner flow with mocks
├── barcode-cache.spec.ts             # Unit tests for IndexedDB ops
├── contribution-sync-service.spec.ts # Unit tests for sync logic
└── (existing test files)
```

### Testing Layers

**1. Unit Tests** - Fast, isolated logic
- Existing: `nutrition-service.spec.ts`, `openfoodfacts-provider.spec.ts`
- New: `barcode-cache.spec.ts`, `contribution-sync-service.spec.ts`

**2. Integration Tests** - Mocked dependencies, real workflows
- `contribution-workflow.spec.ts` - End-to-end contribution flow
- `validation-errors.spec.ts` - All validation scenarios
- `api-error-handling.spec.ts` - API failure cases
- `barcode-scanning.spec.ts` - Scanner with mocked Capacitor plugin

**3. E2E Tests** - Real browser, critical user journey
- `cypress/e2e/nutrition-contribution.cy.ts` - One happy path test

## Test Scenarios

### Integration Test 1: Validation Errors

**File:** `__tests__/integration/validation-errors.spec.ts`

**Scenarios:**

**Required Field Validation:**
- Missing product name → error
- Product name < 2 characters → error
- Missing or zero serving size → error
- Missing calories → error
- Missing protein/carbs/fat → error
- Negative nutrient values → error

**Boundary Cases:**
- Serving size = 0.01 (minimum valid) → success
- Calories = 0 (zero-calorie products) → success
- Protein = 100g (high but valid) → success
- Calories > 2000 → warning (not blocking)

**Data Type Validation:**
- Non-numeric values → error
- NaN from parseFloat → error
- Empty strings for optional fields → undefined (valid)

**Barcode Validation:**
- Valid EAN-13 (13 digits) → success
- Valid UPC-A (12 digits) → success
- Valid EAN-8 (8 digits) → success
- Invalid length (7, 14 digits) → error
- Non-numeric barcode → error

**Test Pattern:**
```typescript
describe('Nutrition Contribution Validation', () => {
  describe('Required Fields', () => {
    it('should reject missing product name', async () => {
      const data = { ...validNutritionData, productName: '' }
      const result = await nutritionService.contributeProduct(data)

      expect(result.success).toBe(false)
      expect(result.error).toContain('productName')
    })

    it('should reject negative calories', async () => {
      const data = {
        ...validNutritionData,
        nutrients: { ...validNutritionData.nutrients, calories: -100 }
      }
      const result = await nutritionService.contributeProduct(data)

      expect(result.success).toBe(false)
      expect(result.error).toContain('calories')
    })
  })

  describe('Boundary Cases', () => {
    it('should accept minimum serving size', async () => {
      const data = { ...validNutritionData, servingSize: 0.01 }
      // Mock API success
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({ success: true })

      const result = await nutritionService.contributeProduct(data)
      expect(result.success).toBe(true)
    })
  })
})
```

### Integration Test 2: API Error Handling

**File:** `__tests__/integration/api-error-handling.spec.ts`

**Scenarios:**

**Success Cases:**
- API returns `status: 1` → success, cache product locally
- API returns product data → parse and cache correctly

**API Validation Errors (Don't Queue):**
- `status: 0` with error message → return error to user
- 400 Bad Request → show validation error
- Missing required fields on API side → show specific error

**Network Errors (Queue for Retry):**
- Fetch timeout → queue contribution
- `navigator.onLine = false` → queue immediately
- 500 Server Error → queue contribution
- Network unreachable → queue contribution

**Malformed Responses:**
- Invalid JSON → return parse error
- Missing `status` field → return format error
- Unexpected response structure → handle gracefully

**Test Pattern:**
```typescript
describe('OpenFoodFacts API Error Handling', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
  })

  describe('Success Scenarios', () => {
    it('should cache product on API success', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true
      })

      const cacheSpy = vi.spyOn(barcodeCache, 'set')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(false)
      expect(cacheSpy).toHaveBeenCalledWith(
        validNutritionData.barcode,
        validNutritionData
      )
    })
  })

  describe('API Validation Errors', () => {
    it('should not queue invalid data', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: false,
        error: 'Invalid product name'
      })

      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(false)
      expect(result.queued).toBe(false)
      expect(result.error).toContain('Invalid')
      expect(queueSpy).not.toHaveBeenCalled()
    })
  })

  describe('Network Errors', () => {
    it('should queue on network timeout', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockRejectedValue(
        new Error('Network timeout')
      )

      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(queueSpy).toHaveBeenCalledWith(validNutritionData)
    })

    it('should queue immediately when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')
      const submitSpy = vi.spyOn(openfoodfactsContributor, 'submit')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.queued).toBe(true)
      expect(submitSpy).not.toHaveBeenCalled() // Skip submit attempt
      expect(queueSpy).toHaveBeenCalled()
    })
  })

  describe('Malformed Responses', () => {
    it('should handle invalid JSON gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected token'))
      })

      const result = await openfoodfactsContributor.submit(validNutritionData)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid response')
    })
  })
})
```

### Integration Test 3: Contribution Workflow

**File:** `__tests__/integration/contribution-workflow.spec.ts`

**Scenarios:**

**Happy Path (Online):**
- Valid form data → immediate submit → API success → cache locally → show success message

**Offline Path:**
- Valid form data → `navigator.onLine = false` → queue immediately → show queued message

**Network Error Path:**
- Valid form data → fetch fails → queue automatically → show queued message

**Background Sync:**
- Queued contributions → sync service runs → API success → mark synced → toast notification
- Queued contributions → sync fails → remain pending → no toast

**Validation Integration:**
- Invalid data → validateNutritionData fails → error shown → NOT queued

**Test Pattern:**
```typescript
describe('Contribution Workflow Integration', () => {
  describe('Happy Path (Online)', () => {
    it('should complete immediate submission when online', async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true })

      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true
      })

      const cacheSpy = vi.spyOn(barcodeCache, 'set')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(false)
      expect(cacheSpy).toHaveBeenCalled()
    })
  })

  describe('Offline Path', () => {
    it('should queue when offline without attempting submit', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const submitSpy = vi.spyOn(openfoodfactsContributor, 'submit')
      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(submitSpy).not.toHaveBeenCalled()
      expect(queueSpy).toHaveBeenCalled()
    })
  })

  describe('Background Sync', () => {
    it('should sync pending contributions and show toast', async () => {
      // Setup: Queue a contribution
      await barcodeCache.queueContribution(validNutritionData)

      // Mock successful sync
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true
      })

      const toastSpy = vi.spyOn(console, 'log') // Mock toast notification

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(1)
      expect(result.failed).toBe(0)
      expect(toastSpy).toHaveBeenCalledWith(
        expect.stringContaining('Synced 1 contribution')
      )
    })
  })

  describe('Validation Integration', () => {
    it('should not queue invalid data', async () => {
      const invalidData = { ...validNutritionData, productName: '' }

      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')

      const result = await nutritionService.contributeProduct(invalidData)

      expect(result.success).toBe(false)
      expect(result.queued).toBe(false)
      expect(queueSpy).not.toHaveBeenCalled()
    })
  })
})
```

### Integration Test 4: Barcode Scanning

**File:** `__tests__/integration/barcode-scanning.spec.ts`

**Scenarios:**

**Permission Flow:**
- Has camera permission → start scan immediately
- No permission → request → granted → start scan
- No permission → request → denied → show error message

**Scan Success:**
- Valid barcode scanned → return barcode string → trigger nutrition lookup
- EAN-13 format → validate and proceed
- UPC-A format → validate and proceed

**Scan Failure:**
- User cancels scan → cleanup, return to chat
- Invalid barcode format → show validation error
- Scanner error → show user-friendly error, cleanup

**State Management:**
- Scanner cleanup on success → `stopScan()` called
- Scanner cleanup on error → `stopScan()` called
- Multiple rapid scans → debounced/prevented

**Test Pattern:**
```typescript
import { BarcodeScanner } from '@capacitor-community/barcode-scanner'

vi.mock('@capacitor-community/barcode-scanner', () => ({
  BarcodeScanner: {
    checkPermission: vi.fn(),
    requestPermissions: vi.fn(),
    startScan: vi.fn(),
    stopScan: vi.fn(),
  }
}))

describe('Barcode Scanner Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Permission Flow', () => {
    it('should start scan when permission already granted', async () => {
      vi.mocked(BarcodeScanner.checkPermission).mockResolvedValue({
        granted: true
      })
      vi.mocked(BarcodeScanner.startScan).mockResolvedValue({
        hasContent: true,
        content: '5449000000996'
      })

      const result = await barcodeScannerService.scan()

      expect(BarcodeScanner.startScan).toHaveBeenCalled()
      expect(result).toBe('5449000000996')
    })

    it('should request permission when not granted', async () => {
      vi.mocked(BarcodeScanner.checkPermission).mockResolvedValue({
        granted: false
      })
      vi.mocked(BarcodeScanner.requestPermissions).mockResolvedValue({
        granted: true
      })
      vi.mocked(BarcodeScanner.startScan).mockResolvedValue({
        hasContent: true,
        content: '5449000000996'
      })

      const result = await barcodeScannerService.scan()

      expect(BarcodeScanner.requestPermissions).toHaveBeenCalled()
      expect(BarcodeScanner.startScan).toHaveBeenCalled()
      expect(result).toBe('5449000000996')
    })

    it('should throw error when permission denied', async () => {
      vi.mocked(BarcodeScanner.checkPermission).mockResolvedValue({
        granted: false
      })
      vi.mocked(BarcodeScanner.requestPermissions).mockResolvedValue({
        granted: false
      })

      await expect(barcodeScannerService.scan()).rejects.toThrow('Permission denied')
    })
  })

  describe('Scan Success', () => {
    it('should validate EAN-13 barcode', async () => {
      vi.mocked(BarcodeScanner.startScan).mockResolvedValue({
        hasContent: true,
        content: '5449000000996' // EAN-13
      })

      const result = await barcodeScannerService.scan()

      expect(result).toBe('5449000000996')
      expect(BarcodeScanner.stopScan).toHaveBeenCalled()
    })
  })

  describe('Scan Failure', () => {
    it('should cleanup on user cancel', async () => {
      vi.mocked(BarcodeScanner.startScan).mockResolvedValue({
        hasContent: false
      })

      const result = await barcodeScannerService.scan()

      expect(result).toBeNull()
      expect(BarcodeScanner.stopScan).toHaveBeenCalled()
    })

    it('should handle scanner errors gracefully', async () => {
      vi.mocked(BarcodeScanner.startScan).mockRejectedValue(
        new Error('Camera not available')
      )

      await expect(barcodeScannerService.scan()).rejects.toThrow('Camera not available')
      expect(BarcodeScanner.stopScan).toHaveBeenCalled()
    })
  })
})
```

## Unit Tests

### Unit Test 1: Barcode Cache

**File:** `barcode-cache.spec.ts`

**Scenarios:**

**Basic CRUD:**
- `set()` → stores nutrition data with timestamp
- `get()` → retrieves cached data
- `get()` non-existent barcode → returns null
- `count()` → returns accurate count

**Expiry Logic:**
- `isExpired()` with recent data → false
- `isExpired()` with old data (> 30 days) → true
- `get()` with expired cache → returns null
- `cleanExpired()` → removes entries older than expiry

**Contribution Queue:**
- `queueContribution()` → adds to queue with pending status
- `getPendingContributions()` → returns only unsynced items
- `markContributionSynced(id, true)` → updates sync status to true
- `markContributionSynced(id, false, error)` → stores error message
- `getAllContributions()` → includes synced and pending

**Test Pattern:**
```typescript
import 'fake-indexeddb/auto'

describe('BarcodeCache', () => {
  beforeEach(async () => {
    // Clear database
    await barcodeCache.instance.clear()
  })

  describe('Basic CRUD', () => {
    it('should store and retrieve nutrition data', async () => {
      await barcodeCache.set('123456', validNutritionData)

      const cached = await barcodeCache.get('123456')

      expect(cached).toBeDefined()
      expect(cached?.data.productName).toBe('Test Product')
    })

    it('should return null for non-existent barcode', async () => {
      const result = await barcodeCache.get('999999')

      expect(result).toBeNull()
    })
  })

  describe('Contribution Queue', () => {
    it('should queue contribution with pending status', async () => {
      await barcodeCache.queueContribution(validNutritionData)

      const pending = await barcodeCache.getPendingContributions()

      expect(pending).toHaveLength(1)
      expect(pending[0].data.barcode).toBe(validNutritionData.barcode)
      expect(pending[0].synced).toBe(false)
    })

    it('should mark contribution as synced', async () => {
      await barcodeCache.queueContribution(validNutritionData)
      const pending = await barcodeCache.getPendingContributions()
      const id = pending[0].id!

      await barcodeCache.markContributionSynced(id, true)

      const stillPending = await barcodeCache.getPendingContributions()
      expect(stillPending).toHaveLength(0)

      const all = await barcodeCache.getAllContributions()
      expect(all[0].synced).toBe(true)
    })
  })
})
```

### Unit Test 2: Contribution Sync Service

**File:** `contribution-sync-service.spec.ts`

**Scenarios:**

**Lifecycle:**
- `start()` → sets up 30-minute interval
- `start()` when online → triggers immediate sync
- `stop()` → clears interval
- `stop()` when not started → no error

**Sync Logic:**
- `syncPendingContributions()` with 0 pending → returns early
- `syncPendingContributions()` with 3 pending → submits all with 1s delays
- Successful submission → marks synced, shows toast
- API error → marks failed, no toast
- Network error → leaves pending, continues to next

**Rate Limiting:**
- First submission → no delay
- Subsequent submissions → 1 second delay between each

**Error Handling:**
- Missing `contribution.id` → skips, logs error, continues
- Toast notification fails → catches error, continues sync

**Test Pattern:**
```typescript
describe('ContributionSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Lifecycle', () => {
    it('should set up 30-minute interval on start', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval')

      contributionSyncService.start()

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        30 * 60 * 1000
      )
    })

    it('should trigger immediate sync when online', async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true })

      const syncSpy = vi.spyOn(contributionSyncService as any, 'syncPendingContributions')

      contributionSyncService.start()

      expect(syncSpy).toHaveBeenCalled()
    })

    it('should clear interval on stop', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

      contributionSyncService.start()
      contributionSyncService.stop()

      expect(clearIntervalSpy).toHaveBeenCalled()
    })
  })

  describe('Sync Logic', () => {
    it('should return early when no pending contributions', async () => {
      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([])

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.pending).toBe(0)
    })

    it('should sync multiple contributions with rate limiting', async () => {
      const contributions = [
        { id: 1, data: validNutritionData, synced: false, timestamp: Date.now() },
        { id: 2, data: validNutritionData, synced: false, timestamp: Date.now() },
        { id: 3, data: validNutritionData, synced: false, timestamp: Date.now() },
      ]

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue(contributions)
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({ success: true })

      const delaySpy = vi.spyOn(contributionSyncService as any, 'delay')

      await contributionSyncService.syncNow()

      expect(openfoodfactsContributor.submit).toHaveBeenCalledTimes(3)
      expect(delaySpy).toHaveBeenCalledTimes(2) // No delay on first, then 2 delays
    })
  })

  describe('Error Handling', () => {
    it('should skip contributions with missing ID', async () => {
      const contributions = [
        { data: validNutritionData, synced: false, timestamp: Date.now() }, // No ID
      ]

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue(contributions as any)
      const consoleSpy = vi.spyOn(console, 'error')

      const result = await contributionSyncService.syncNow()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('missing ID'))
      expect(result.synced).toBe(0)
    })
  })
})
```

## E2E Test

### Cypress E2E Test

**File:** `cypress/e2e/nutrition-contribution.cy.ts`

**Single Happy Path Test:**

```typescript
describe('Nutrition Contribution Flow', () => {
  it('should complete full contribution workflow', () => {
    // Setup: Navigate to AI chat
    cy.visit('/')
    cy.get('[data-testid="ai-chat-button"]').click()

    // Trigger barcode scan (mock the scanner result)
    cy.window().then((win) => {
      // Inject mock barcode result for non-existent product
      win.mockBarcodeResult = '9999999999999'
    })
    cy.get('[data-testid="scan-barcode-button"]').click()

    // Verify contribution prompt appears
    cy.contains('Product not found').should('be.visible')
    cy.contains('Would you like to add it?').should('be.visible')

    // Fill out nutrition form
    cy.get('[data-testid="product-name"]').type('Test Product')
    cy.get('[data-testid="serving-size"]').type('100')
    cy.get('[data-testid="serving-unit"]').select('g')
    cy.get('[data-testid="calories"]').type('250')
    cy.get('[data-testid="protein"]').type('10')
    cy.get('[data-testid="carbs"]').type('30')
    cy.get('[data-testid="fat"]').type('8')

    // Submit form (mock API to return success)
    cy.intercept('POST', '**/openfoodfacts.org/**', {
      statusCode: 200,
      body: { status: 1, status_verbose: 'fields saved' }
    }).as('submitContribution')

    cy.get('[data-testid="submit-contribution"]').click()

    // Wait for API call
    cy.wait('@submitContribution')

    // Verify success message
    cy.contains('Product added to OpenFoodFacts').should('be.visible')
    cy.contains('Cached locally').should('be.visible')
  })
})
```

**Why Only One E2E Test:**
- E2E tests are slow and brittle
- Integration tests already cover error paths
- This test verifies UI integration works
- Real device testing covers scanner hardware

## Test Fixtures

### Mock Barcodes

**File:** `__tests__/fixtures/mock-barcodes.ts`

```typescript
export const validBarcodes = {
  ean13: '5449000000996',      // Coca-Cola (13 digits)
  upcA: '012345678905',        // Generic UPC-A (12 digits)
  ean8: '12345670',            // Short format (8 digits)
}

export const invalidBarcodes = {
  tooShort: '1234567',         // 7 digits (invalid)
  tooLong: '12345678901234',   // 14 digits (invalid)
  nonNumeric: 'ABC123XYZ',     // Contains letters
  empty: '',                   // Empty string
}
```

### Mock Nutrition Data

**File:** `__tests__/fixtures/mock-nutrition-data.ts`

```typescript
import type { NutritionData } from '../nutrition-types'

export const validNutritionData: NutritionData = {
  barcode: '5449000000996',
  productName: 'Test Product',
  brand: 'Test Brand',
  servingSize: 100,
  servingUnit: 'g',
  nutrients: {
    calories: 250,
    protein_g: 10,
    carbs_g: 30,
    fat_g: 8,
    fiber_g: 2,
    sugar_g: 15,
    sodium_mg: 150,
  },
  ingredients: ['Water', 'Sugar', 'Flavoring'],
  allergens: ['soy'],
  source: 'user_contributed',
  lastUpdated: Date.now(),
}

export const invalidNutritionData = {
  missingProductName: {
    ...validNutritionData,
    productName: ''
  },

  negativeCalories: {
    ...validNutritionData,
    nutrients: {
      ...validNutritionData.nutrients,
      calories: -100
    }
  },

  zeroServingSize: {
    ...validNutritionData,
    servingSize: 0
  },

  nanValues: {
    ...validNutritionData,
    nutrients: {
      ...validNutritionData.nutrients,
      protein_g: NaN
    }
  },

  missingRequiredNutrients: {
    ...validNutritionData,
    nutrients: {
      calories: 250,
      // Missing protein, carbs, fat
    }
  }
}
```

### Mock API Responses

**File:** `__tests__/fixtures/mock-api-responses.ts`

```typescript
export const mockApiResponses = {
  success: {
    status: 1,
    status_verbose: 'fields saved',
    product: {
      code: '5449000000996',
      product_name: 'Test Product',
    }
  },

  validationError: {
    status: 0,
    status_verbose: 'Missing required fields'
  },

  serverError: {
    status: 0,
    status_verbose: 'Internal server error'
  },

  malformedJson: 'not valid json at all',

  networkTimeout: new Error('Network timeout after 5000ms'),

  fetchError: new Error('Failed to fetch'),
}
```

## Global Test Setup

### Vitest Setup

**File:** `vitest.setup.ts` (add to existing setup)

```typescript
import { beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true,
  configurable: true,
})

// Reset navigator.onLine between tests
beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', {
    writable: true,
    value: true,
    configurable: true,
  })
})

// Mock global fetch
global.fetch = vi.fn()

// Reset mocks after each test
afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})
```

## Implementation Plan

### Week 1: Core Integration Tests (Priority 1)

**Day 1-2: Validation Errors**
- Create `__tests__/fixtures/` directory
- Implement `mock-nutrition-data.ts` with valid/invalid data
- Write `validation-errors.spec.ts` (15+ scenarios)
- Run tests, verify all pass

**Day 3-4: API Error Handling**
- Implement `mock-api-responses.ts` with success/error responses
- Write `api-error-handling.spec.ts` (12+ scenarios)
- Mock fetch globally
- Run tests, verify all pass

**Day 5: Contribution Workflow**
- Write `contribution-workflow.spec.ts` (8+ scenarios)
- Test end-to-end flow with mocked dependencies
- Verify offline/online transitions work

### Week 2: Unit Tests & Scanner (Priority 2)

**Day 1-2: Barcode Cache**
- Set up fake-indexeddb in vitest.setup.ts
- Write `barcode-cache.spec.ts` (15+ tests)
- Test CRUD, expiry, queue operations
- Run tests, verify all pass

**Day 3: Contribution Sync Service**
- Write `contribution-sync-service.spec.ts` (12+ tests)
- Use fake timers for interval testing
- Test rate limiting, error handling
- Run tests, verify all pass

**Day 4: Barcode Scanner**
- Implement `capacitor-barcode.mock.ts`
- Write `barcode-scanning.spec.ts` (10+ scenarios)
- Test permissions, scan success/failure, cleanup
- Run tests, verify all pass

**Day 5: E2E Test**
- Add data-testid attributes to UI components
- Write `nutrition-contribution.cy.ts` (1 happy path)
- Set up Cypress intercepts for API mocking
- Run in Cypress, verify passes

### Week 3: Manual Testing & Refinement

**Device Testing:**
- iOS device: Barcode scan → contribution → sync
- Android device: Same workflow
- Offline mode: Queue → online → background sync
- Edge cases: Invalid barcodes, API timeouts

**Bug Fixes & Polish:**
- Address any issues found in manual testing
- Improve error messages based on real usage
- Update tests if bugs found

## Success Criteria

### Coverage Targets

✅ **Test Count:**
- Integration tests: 15+ scenarios in validation-errors.spec.ts
- Integration tests: 12+ scenarios in api-error-handling.spec.ts
- Integration tests: 8+ scenarios in contribution-workflow.spec.ts
- Integration tests: 10+ scenarios in barcode-scanning.spec.ts
- Unit tests: 15+ tests in barcode-cache.spec.ts
- Unit tests: 12+ tests in contribution-sync-service.spec.ts
- E2E: 1 happy path test
- **Total:** 73+ new tests

✅ **Code Coverage:**
- Nutrition domain: >80% line coverage
- Critical paths: 100% coverage (validation, API errors, sync)
- All new Phase 7 code covered

### Quality Gates

✅ **All Tests Pass:**
- No failing tests in nutrition domain
- No regressions in existing 310 tests
- CI pipeline green

✅ **Performance:**
- Integration tests complete in <10 seconds
- Unit tests complete in <5 seconds
- E2E test completes in <30 seconds

✅ **No Console Errors:**
- Clean test output
- No unhandled promise rejections
- No memory leaks in test runs

### Manual Testing Checklist

**iOS Device:**
- [ ] Barcode scan with camera works
- [ ] Contribution form submission succeeds
- [ ] Offline queue → sync works
- [ ] Background sync shows toast

**Android Device:**
- [ ] Barcode scan with camera works
- [ ] Contribution form submission succeeds
- [ ] Offline queue → sync works
- [ ] Background sync shows toast

**Web Browser:**
- [ ] Manual barcode entry works (no camera)
- [ ] Form validation shows errors
- [ ] API error handling shows messages
- [ ] Cypress E2E test passes

**Edge Cases:**
- [ ] Invalid barcode format rejected
- [ ] API timeout triggers queue
- [ ] Offline submission queues immediately
- [ ] Multiple rapid scans handled gracefully
- [ ] Very long product names (200 chars) work
- [ ] Zero-calorie products accepted
- [ ] Empty optional fields saved correctly

## Deliverables

1. **6 Test Files:**
   - `__tests__/integration/validation-errors.spec.ts`
   - `__tests__/integration/api-error-handling.spec.ts`
   - `__tests__/integration/contribution-workflow.spec.ts`
   - `__tests__/integration/barcode-scanning.spec.ts`
   - `barcode-cache.spec.ts`
   - `contribution-sync-service.spec.ts`

2. **3 Fixture Files:**
   - `__tests__/fixtures/mock-barcodes.ts`
   - `__tests__/fixtures/mock-nutrition-data.ts`
   - `__tests__/fixtures/mock-api-responses.ts`

3. **1 E2E Test:**
   - `cypress/e2e/nutrition-contribution.cy.ts`

4. **1 Mock File:**
   - `__tests__/mocks/capacitor-barcode.mock.ts`

5. **Updated Config:**
   - `vitest.setup.ts` with fake-indexeddb and global mocks

6. **Documentation:**
   - Manual testing checklist
   - Test coverage report
   - Phase 8 completion commit

## Notes

- Tests use Vitest (already configured)
- Mocking strategy: Mock at API boundaries (fetch, Capacitor)
- Integration tests more valuable than unit tests for this feature
- E2E tests minimal due to hardware dependencies
- Manual device testing still critical for scanner
- Phase 8 focuses on confidence in critical paths, not 100% coverage
- Future: Add performance benchmarks if needed

## Success Metrics (Post-Phase 8)

After testing is complete, track these metrics:

**Technical:**
- Test suite runs successfully in CI
- No test flakiness (<1% flake rate)
- Coverage >80% for nutrition domain
- Integration tests catch bugs early

**Quality:**
- Bugs found: X bugs discovered during testing
- Bugs fixed: Y bugs fixed before production
- Regression rate: <5% after Phase 8 deployment

**User Impact:**
- Contribution success rate: >95% when online
- Queue success rate: >98% when offline → online
- User-reported validation errors: <2% of submissions
