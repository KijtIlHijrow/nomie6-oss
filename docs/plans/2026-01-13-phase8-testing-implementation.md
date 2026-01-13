# Phase 8: Testing & Refinement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement comprehensive test suite for nutrition tracking feature, focusing on critical paths with integration tests for validation, API error handling, and contribution workflows.

**Architecture:** Integration-heavy testing approach with mocked dependencies (fetch, Capacitor scanner), unit tests for core services (barcode-cache, sync-service), and minimal E2E testing. All tests use Vitest except one Cypress E2E happy path.

**Tech Stack:** Vitest, fake-indexeddb, Cypress, Vitest mocks (vi.fn(), vi.spyOn())

---

## Task 1: Test Fixtures Setup

**Files:**
- Create: `src/domains/nutrition/__tests__/fixtures/mock-barcodes.ts`
- Create: `src/domains/nutrition/__tests__/fixtures/mock-nutrition-data.ts`
- Create: `src/domains/nutrition/__tests__/fixtures/mock-api-responses.ts`

**Step 1: Create test fixtures directory**

```bash
mkdir -p src/domains/nutrition/__tests__/fixtures
```

**Step 2: Create mock barcodes fixture**

File: `src/domains/nutrition/__tests__/fixtures/mock-barcodes.ts`

```typescript
/**
 * Test barcode data for validation and scanning tests
 */

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

**Step 3: Create mock nutrition data fixture**

File: `src/domains/nutrition/__tests__/fixtures/mock-nutrition-data.ts`

```typescript
import type { NutritionData } from '../../nutrition-types'

/**
 * Test nutrition data - valid and invalid scenarios
 */

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
    productName: '',
  },

  productNameTooShort: {
    ...validNutritionData,
    productName: 'A', // Only 1 character
  },

  negativeCalories: {
    ...validNutritionData,
    nutrients: {
      ...validNutritionData.nutrients,
      calories: -100,
    },
  },

  zeroServingSize: {
    ...validNutritionData,
    servingSize: 0,
  },

  negativeServingSize: {
    ...validNutritionData,
    servingSize: -50,
  },

  nanCalories: {
    ...validNutritionData,
    nutrients: {
      ...validNutritionData.nutrients,
      calories: NaN,
    },
  },

  nanProtein: {
    ...validNutritionData,
    nutrients: {
      ...validNutritionData.nutrients,
      protein_g: NaN,
    },
  },

  missingCalories: {
    ...validNutritionData,
    nutrients: {
      protein_g: 10,
      carbs_g: 30,
      fat_g: 8,
      // calories missing
    } as any,
  },

  missingProtein: {
    ...validNutritionData,
    nutrients: {
      calories: 250,
      carbs_g: 30,
      fat_g: 8,
      // protein_g missing
    } as any,
  },
}

export const boundaryNutritionData = {
  minimumServingSize: {
    ...validNutritionData,
    servingSize: 0.01, // Minimum valid
  },

  zeroCalories: {
    ...validNutritionData,
    nutrients: {
      ...validNutritionData.nutrients,
      calories: 0, // Valid - zero-calorie products exist
    },
  },

  highProtein: {
    ...validNutritionData,
    nutrients: {
      ...validNutritionData.nutrients,
      protein_g: 100, // High but valid
    },
  },

  highCalories: {
    ...validNutritionData,
    nutrients: {
      ...validNutritionData.nutrients,
      calories: 2500, // Should trigger warning but not error
    },
  },
}
```

**Step 4: Create mock API responses fixture**

File: `src/domains/nutrition/__tests__/fixtures/mock-api-responses.ts`

```typescript
/**
 * Mock OpenFoodFacts API responses for testing
 */

export const mockApiResponses = {
  success: {
    status: 1,
    status_verbose: 'fields saved',
    product: {
      code: '5449000000996',
      product_name: 'Test Product',
    },
  },

  validationError: {
    status: 0,
    status_verbose: 'Missing required fields',
  },

  serverError: {
    status: 0,
    status_verbose: 'Internal server error',
  },

  invalidStatus: {
    // Missing status field entirely
    status_verbose: 'Some message',
  },

  emptyResponse: {},

  malformedJson: 'not valid json at all',

  networkTimeout: new Error('Network timeout after 5000ms'),

  fetchError: new Error('Failed to fetch'),

  offlineError: new Error('Network request failed'),
}
```

**Step 5: Verify fixtures import correctly**

Create a quick test file to verify:

File: `src/domains/nutrition/__tests__/fixtures.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { validBarcodes, invalidBarcodes } from './fixtures/mock-barcodes'
import { validNutritionData, invalidNutritionData } from './fixtures/mock-nutrition-data'
import { mockApiResponses } from './fixtures/mock-api-responses'

describe('Test Fixtures', () => {
  it('should have valid barcodes', () => {
    expect(validBarcodes.ean13).toBe('5449000000996')
    expect(validBarcodes.ean13).toHaveLength(13)
  })

  it('should have invalid barcodes', () => {
    expect(invalidBarcodes.tooShort).toHaveLength(7)
    expect(invalidBarcodes.nonNumeric).toMatch(/[A-Z]/)
  })

  it('should have valid nutrition data', () => {
    expect(validNutritionData.productName).toBe('Test Product')
    expect(validNutritionData.nutrients.calories).toBe(250)
  })

  it('should have invalid nutrition data variations', () => {
    expect(invalidNutritionData.missingProductName.productName).toBe('')
    expect(invalidNutritionData.negativeCalories.nutrients.calories).toBe(-100)
  })

  it('should have mock API responses', () => {
    expect(mockApiResponses.success.status).toBe(1)
    expect(mockApiResponses.validationError.status).toBe(0)
  })
})
```

**Step 6: Run fixture test**

Run: `npm run vtest src/domains/nutrition/__tests__/fixtures.test.ts`
Expected: 5 tests pass

**Step 7: Commit fixtures**

```bash
git add src/domains/nutrition/__tests__/
git commit -m "test: add test fixtures for nutrition domain

- Mock barcodes (valid EAN-13, UPC-A, EAN-8, invalid formats)
- Mock nutrition data (valid, invalid, boundary cases)
- Mock API responses (success, errors, malformed)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Validation Errors Integration Test

**Files:**
- Create: `src/domains/nutrition/__tests__/integration/validation-errors.spec.ts`

**Step 1: Create integration test directory**

```bash
mkdir -p src/domains/nutrition/__tests__/integration
```

**Step 2: Write validation errors test file**

File: `src/domains/nutrition/__tests__/integration/validation-errors.spec.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { nutritionService } from '../../nutrition-service'
import {
  validNutritionData,
  invalidNutritionData,
  boundaryNutritionData,
} from '../fixtures/mock-nutrition-data'

describe('Nutrition Contribution Validation', () => {
  describe('Required Fields', () => {
    it('should reject missing product name', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.missingProductName
      )

      expect(result.success).toBe(false)
      expect(result.queued).toBe(false)
      expect(result.error).toContain('productName')
    })

    it('should reject product name less than 2 characters', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.productNameTooShort
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('productName')
    })

    it('should reject zero serving size', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.zeroServingSize
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('servingSize')
    })

    it('should reject negative serving size', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.negativeServingSize
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('servingSize')
    })

    it('should reject missing calories', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.missingCalories
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('calories')
    })

    it('should reject negative calories', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.negativeCalories
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('calories')
    })

    it('should reject NaN calories', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.nanCalories
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('calories')
    })

    it('should reject missing protein', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.missingProtein
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('protein')
    })

    it('should reject NaN protein', async () => {
      const result = await nutritionService.contributeProduct(
        invalidNutritionData.nanProtein
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('protein')
    })
  })

  describe('Boundary Cases', () => {
    it('should accept minimum serving size (0.01)', async () => {
      // Mock offline to avoid actual API call
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      const result = await nutritionService.contributeProduct(
        boundaryNutritionData.minimumServingSize
      )

      // Should queue successfully (offline)
      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)

      // Reset
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
    })

    it('should accept zero calories (valid for zero-calorie products)', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const result = await nutritionService.contributeProduct(
        boundaryNutritionData.zeroCalories
      )

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)

      Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
    })

    it('should accept high protein values (100g)', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const result = await nutritionService.contributeProduct(
        boundaryNutritionData.highProtein
      )

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)

      Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
    })

    it('should accept high calories (>2000) with warning', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const result = await nutritionService.contributeProduct(
        boundaryNutritionData.highCalories
      )

      // Should still succeed (warning, not error)
      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)

      Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
    })
  })

  describe('Barcode Validation', () => {
    it('should reject barcode with invalid length', async () => {
      const data = {
        ...validNutritionData,
        barcode: '1234567', // 7 digits (invalid)
      }

      const result = await nutritionService.contributeProduct(data)

      expect(result.success).toBe(false)
      expect(result.error).toContain('barcode')
    })

    it('should reject non-numeric barcode', async () => {
      const data = {
        ...validNutritionData,
        barcode: 'ABC123XYZ',
      }

      const result = await nutritionService.contributeProduct(data)

      expect(result.success).toBe(false)
      expect(result.error).toContain('barcode')
    })

    it('should accept EAN-13 barcode (13 digits)', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const data = {
        ...validNutritionData,
        barcode: '5449000000996', // EAN-13
      }

      const result = await nutritionService.contributeProduct(data)

      expect(result.success).toBe(true)

      Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
    })

    it('should accept UPC-A barcode (12 digits)', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const data = {
        ...validNutritionData,
        barcode: '012345678905', // UPC-A
      }

      const result = await nutritionService.contributeProduct(data)

      expect(result.success).toBe(true)

      Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
    })

    it('should accept EAN-8 barcode (8 digits)', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const data = {
        ...validNutritionData,
        barcode: '12345670', // EAN-8
      }

      const result = await nutritionService.contributeProduct(data)

      expect(result.success).toBe(true)

      Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
    })
  })
})
```

**Step 3: Run validation test to see failures**

Run: `npm run vtest src/domains/nutrition/__tests__/integration/validation-errors.spec.ts`
Expected: Tests run (may have some failures if validation isn't complete)

**Step 4: Fix any validation gaps in nutrition-service.ts**

Review `nutrition-service.ts` validateNutritionData() method and ensure all validation rules match the tests.

**Step 5: Run test again to verify all pass**

Run: `npm run vtest src/domains/nutrition/__tests__/integration/validation-errors.spec.ts`
Expected: All 18 tests pass

**Step 6: Commit validation tests**

```bash
git add src/domains/nutrition/__tests__/integration/validation-errors.spec.ts
git commit -m "test: add validation errors integration tests

- 18 test scenarios covering required fields, boundary cases, barcode validation
- Tests reject invalid data (missing fields, negative values, NaN, wrong barcode length)
- Tests accept boundary cases (min serving, zero calories, high protein)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: API Error Handling Integration Test

**Files:**
- Create: `src/domains/nutrition/__tests__/integration/api-error-handling.spec.ts`

**Step 1: Write API error handling test**

File: `src/domains/nutrition/__tests__/integration/api-error-handling.spec.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nutritionService } from '../../nutrition-service'
import { openfoodfactsContributor } from '../../openfoodfacts-contributor'
import { barcodeCache } from '../../barcode-cache'
import { validNutritionData } from '../fixtures/mock-nutrition-data'
import { mockApiResponses } from '../fixtures/mock-api-responses'

describe('OpenFoodFacts API Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Success Scenarios', () => {
    it('should cache product on API success', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
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

    it('should return success when API returns status 1', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(false)
      expect(result.error).toBeUndefined()
    })
  })

  describe('API Validation Errors (Should NOT Queue)', () => {
    it('should not queue when API returns validation error', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: false,
        error: 'Invalid product name',
      })

      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(false)
      expect(result.queued).toBe(false)
      expect(result.error).toContain('Invalid')
      expect(queueSpy).not.toHaveBeenCalled()
    })

    it('should return error message from API validation failure', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: false,
        error: 'Missing required fields',
      })

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })

    it('should not queue when API returns 400-style error', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: false,
        error: 'Bad request: invalid barcode format',
      })

      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(false)
      expect(queueSpy).not.toHaveBeenCalled()
    })
  })

  describe('Network Errors (Should Queue)', () => {
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

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(submitSpy).not.toHaveBeenCalled() // Skip submit when offline
      expect(queueSpy).toHaveBeenCalledWith(validNutritionData)
    })

    it('should queue on fetch failure', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockRejectedValue(
        new Error('Failed to fetch')
      )

      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(queueSpy).toHaveBeenCalled()
    })

    it('should queue on any Error with "Network" in message', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: false,
        error: 'Network request failed',
      })

      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(queueSpy).toHaveBeenCalled()
    })
  })

  describe('Malformed Responses', () => {
    it('should handle invalid JSON response', async () => {
      // Mock fetch directly to return malformed JSON
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      })

      const result = await openfoodfactsContributor.submit(validNutritionData)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid response')
    })

    it('should handle missing status field in response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status_verbose: 'Some message' }), // Missing status
      })

      const result = await openfoodfactsContributor.submit(validNutritionData)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid API response format')
    })

    it('should handle completely empty response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await openfoodfactsContributor.submit(validNutritionData)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid API response format')
    })
  })

  describe('Edge Cases', () => {
    it('should handle thrown errors during submission', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockImplementation(() => {
        throw new Error('Unexpected error')
      })

      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')

      const result = await nutritionService.contributeProduct(validNutritionData)

      // Should queue on any unexpected error
      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(queueSpy).toHaveBeenCalled()
    })

    it('should not attempt submission when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      const submitSpy = vi.spyOn(openfoodfactsContributor, 'submit')

      await nutritionService.contributeProduct(validNutritionData)

      expect(submitSpy).not.toHaveBeenCalled()
    })
  })
})
```

**Step 2: Run API error handling test**

Run: `npm run vtest src/domains/nutrition/__tests__/integration/api-error-handling.spec.ts`
Expected: All 15 tests pass

**Step 3: Commit API error handling tests**

```bash
git add src/domains/nutrition/__tests__/integration/api-error-handling.spec.ts
git commit -m "test: add API error handling integration tests

- 15 test scenarios covering success, validation errors, network errors
- Tests queue on network failures but not on validation errors
- Tests handle malformed JSON, missing fields, offline mode

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Contribution Workflow Integration Test

**Files:**
- Create: `src/domains/nutrition/__tests__/integration/contribution-workflow.spec.ts`

**Step 1: Write contribution workflow test**

File: `src/domains/nutrition/__tests__/integration/contribution-workflow.spec.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nutritionService } from '../../nutrition-service'
import { contributionSyncService } from '../../contribution-sync-service'
import { openfoodfactsContributor } from '../../openfoodfacts-contributor'
import { barcodeCache } from '../../barcode-cache'
import { validNutritionData, invalidNutritionData } from '../fixtures/mock-nutrition-data'

describe('Contribution Workflow Integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Clear database
    await barcodeCache.instance.clear?.()
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Happy Path (Online)', () => {
    it('should complete immediate submission when online', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
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

    it('should call OpenFoodFacts API when online', async () => {
      const submitSpy = vi
        .spyOn(openfoodfactsContributor, 'submit')
        .mockResolvedValue({ success: true })

      await nutritionService.contributeProduct(validNutritionData)

      expect(submitSpy).toHaveBeenCalledWith(validNutritionData, undefined)
    })

    it('should cache product locally after successful submission', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })

      await nutritionService.contributeProduct(validNutritionData)

      const cached = await barcodeCache.get(validNutritionData.barcode)
      expect(cached).toBeDefined()
      expect(cached?.data.productName).toBe('Test Product')
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
      expect(queueSpy).toHaveBeenCalledWith(validNutritionData)
    })

    it('should store contribution in IndexedDB queue when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      await nutritionService.contributeProduct(validNutritionData)

      const pending = await barcodeCache.getPendingContributions()
      expect(pending).toHaveLength(1)
      expect(pending[0].data.barcode).toBe(validNutritionData.barcode)
    })
  })

  describe('Network Error Path', () => {
    it('should queue automatically on network error', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockRejectedValue(
        new Error('Network timeout')
      )

      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(queueSpy).toHaveBeenCalled()
    })

    it('should show queued message on network failure', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockRejectedValue(
        new Error('Failed to fetch')
      )

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
    })
  })

  describe('Background Sync', () => {
    it('should sync pending contributions successfully', async () => {
      // Queue a contribution first
      await barcodeCache.queueContribution(validNutritionData)

      // Mock successful sync
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(1)
      expect(result.failed).toBe(0)
      expect(result.pending).toBe(0)
    })

    it('should mark contribution as synced after successful sync', async () => {
      await barcodeCache.queueContribution(validNutritionData)

      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })

      await contributionSyncService.syncNow()

      const pending = await barcodeCache.getPendingContributions()
      expect(pending).toHaveLength(0) // Marked as synced

      const all = await barcodeCache.getAllContributions()
      expect(all[0].synced).toBe(true)
    })

    it('should leave contributions pending on sync failure', async () => {
      await barcodeCache.queueContribution(validNutritionData)

      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: false,
        error: 'API error',
      })

      const result = await contributionSyncService.syncNow()

      expect(result.failed).toBe(1)

      const pending = await barcodeCache.getPendingContributions()
      expect(pending).toHaveLength(0) // Marked as failed (not pending)

      const all = await barcodeCache.getAllContributions()
      expect(all[0].synced).toBe(false)
    })

    it('should continue syncing after network error', async () => {
      // Queue 2 contributions
      await barcodeCache.queueContribution({
        ...validNutritionData,
        barcode: '111111',
      })
      await barcodeCache.queueContribution({
        ...validNutritionData,
        barcode: '222222',
      })

      // First fails with network error, second succeeds
      vi.spyOn(openfoodfactsContributor, 'submit')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ success: true })

      const result = await contributionSyncService.syncNow()

      // First left as pending, second synced
      expect(result.synced).toBe(1)
      expect(result.pending).toBe(1) // First one still pending
    })
  })

  describe('Validation Integration', () => {
    it('should not queue invalid data', async () => {
      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')

      const result = await nutritionService.contributeProduct(
        invalidNutritionData.missingProductName
      )

      expect(result.success).toBe(false)
      expect(result.queued).toBe(false)
      expect(queueSpy).not.toHaveBeenCalled()
    })

    it('should validate before attempting submission', async () => {
      const submitSpy = vi.spyOn(openfoodfactsContributor, 'submit')

      await nutritionService.contributeProduct(
        invalidNutritionData.negativeCalories
      )

      expect(submitSpy).not.toHaveBeenCalled() // Validation fails first
    })
  })

  describe('Error Recovery', () => {
    it('should queue on unexpected errors during submission', async () => {
      vi.spyOn(openfoodfactsContributor, 'submit').mockImplementation(() => {
        throw new Error('Unexpected error')
      })

      const queueSpy = vi.spyOn(barcodeCache, 'queueContribution')

      const result = await nutritionService.contributeProduct(validNutritionData)

      expect(result.success).toBe(true)
      expect(result.queued).toBe(true)
      expect(queueSpy).toHaveBeenCalled()
    })
  })
})
```

**Step 2: Run contribution workflow test**

Run: `npm run vtest src/domains/nutrition/__tests__/integration/contribution-workflow.spec.ts`
Expected: All 15 tests pass

**Step 3: Commit contribution workflow tests**

```bash
git add src/domains/nutrition/__tests__/integration/contribution-workflow.spec.ts
git commit -m "test: add contribution workflow integration tests

- 15 test scenarios covering full contribution lifecycle
- Tests online submission, offline queuing, background sync
- Tests validation integration, error recovery
- Tests queue → sync → cache flow

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Barcode Cache Unit Tests

**Files:**
- Create: `src/domains/nutrition/barcode-cache.spec.ts`
- Modify: `vitest.setup.ts` (add fake-indexeddb)

**Step 1: Add fake-indexeddb to vitest setup**

Install fake-indexeddb:

```bash
npm install --save-dev fake-indexeddb
```

**Step 2: Update vitest.setup.ts**

File: `vitest.setup.ts` (add to existing setup)

```typescript
import 'fake-indexeddb/auto'
import { beforeEach, afterEach, vi } from 'vitest'

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

// Reset mocks after each test
afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})
```

**Step 3: Write barcode cache unit tests**

File: `src/domains/nutrition/barcode-cache.spec.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { barcodeCache } from './barcode-cache'
import { validNutritionData } from './__tests__/fixtures/mock-nutrition-data'
import type { NutritionData } from './nutrition-types'

describe('BarcodeCache', () => {
  beforeEach(async () => {
    // Clear database before each test
    const db = barcodeCache.instance
    // @ts-ignore - accessing private method for testing
    if (db.clear) await db.clear()
  })

  describe('Basic CRUD Operations', () => {
    it('should store nutrition data with timestamp', async () => {
      const barcode = '123456789012'

      await barcodeCache.set(barcode, validNutritionData)

      const cached = await barcodeCache.get(barcode)

      expect(cached).toBeDefined()
      expect(cached?.data.productName).toBe('Test Product')
      expect(cached?.timestamp).toBeDefined()
    })

    it('should retrieve cached nutrition data', async () => {
      const barcode = '123456789012'
      await barcodeCache.set(barcode, validNutritionData)

      const cached = await barcodeCache.get(barcode)

      expect(cached?.data).toEqual(validNutritionData)
    })

    it('should return null for non-existent barcode', async () => {
      const result = await barcodeCache.get('999999999999')

      expect(result).toBeNull()
    })

    it('should count cached entries', async () => {
      await barcodeCache.set('111111', validNutritionData)
      await barcodeCache.set('222222', validNutritionData)
      await barcodeCache.set('333333', validNutritionData)

      const count = await barcodeCache.count()

      expect(count).toBe(3)
    })
  })

  describe('Expiry Logic', () => {
    it('should identify non-expired data', async () => {
      const barcode = '123456789012'
      await barcodeCache.set(barcode, validNutritionData)

      const cached = await barcodeCache.get(barcode)
      const expiry = 30 * 24 * 60 * 60 * 1000 // 30 days

      const expired = barcodeCache.isExpired(cached!, expiry)

      expect(expired).toBe(false)
    })

    it('should identify expired data', async () => {
      const barcode = '123456789012'
      await barcodeCache.set(barcode, validNutritionData)

      const cached = await barcodeCache.get(barcode)
      // Set very short expiry (1ms)
      const expiry = 1

      // Wait 2ms
      await new Promise((resolve) => setTimeout(resolve, 2))

      const expired = barcodeCache.isExpired(cached!, expiry)

      expect(expired).toBe(true)
    })

    it('should return null for expired cache entries', async () => {
      const barcode = '123456789012'
      await barcodeCache.set(barcode, validNutritionData)

      // Clean with very short expiry
      await barcodeCache.cleanExpired(1)

      const cached = await barcodeCache.get(barcode)

      expect(cached).toBeNull()
    })

    it('should remove expired entries with cleanExpired', async () => {
      await barcodeCache.set('111111', validNutritionData)
      await barcodeCache.set('222222', validNutritionData)

      const deleted = await barcodeCache.cleanExpired(1) // Very short expiry

      expect(deleted).toBeGreaterThan(0)

      const count = await barcodeCache.count()
      expect(count).toBe(0)
    })
  })

  describe('Contribution Queue', () => {
    it('should queue contribution with pending status', async () => {
      await barcodeCache.queueContribution(validNutritionData)

      const pending = await barcodeCache.getPendingContributions()

      expect(pending).toHaveLength(1)
      expect(pending[0].data.barcode).toBe(validNutritionData.barcode)
      expect(pending[0].synced).toBe(false)
      expect(pending[0].timestamp).toBeDefined()
    })

    it('should return only pending contributions', async () => {
      // Queue 2 contributions
      await barcodeCache.queueContribution({
        ...validNutritionData,
        barcode: '111111',
      })
      await barcodeCache.queueContribution({
        ...validNutritionData,
        barcode: '222222',
      })

      // Mark first as synced
      const pending = await barcodeCache.getPendingContributions()
      await barcodeCache.markContributionSynced(pending[0].id!, true)

      // Should only return the unsynced one
      const stillPending = await barcodeCache.getPendingContributions()
      expect(stillPending).toHaveLength(1)
      expect(stillPending[0].data.barcode).toBe('222222')
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

    it('should store error message when sync fails', async () => {
      await barcodeCache.queueContribution(validNutritionData)

      const pending = await barcodeCache.getPendingContributions()
      const id = pending[0].id!

      await barcodeCache.markContributionSynced(id, false, 'API validation error')

      const all = await barcodeCache.getAllContributions()
      expect(all[0].synced).toBe(false)
      expect(all[0].error).toBe('API validation error')
    })

    it('should return all contributions (synced and pending)', async () => {
      await barcodeCache.queueContribution({
        ...validNutritionData,
        barcode: '111111',
      })
      await barcodeCache.queueContribution({
        ...validNutritionData,
        barcode: '222222',
      })

      const pending = await barcodeCache.getPendingContributions()
      await barcodeCache.markContributionSynced(pending[0].id!, true)

      const all = await barcodeCache.getAllContributions()

      expect(all).toHaveLength(2)
      expect(all.filter((c) => c.synced)).toHaveLength(1)
      expect(all.filter((c) => !c.synced)).toHaveLength(1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle multiple sets to same barcode', async () => {
      const barcode = '123456789012'

      await barcodeCache.set(barcode, validNutritionData)
      await barcodeCache.set(barcode, {
        ...validNutritionData,
        productName: 'Updated Product',
      })

      const cached = await barcodeCache.get(barcode)

      expect(cached?.data.productName).toBe('Updated Product')
    })

    it('should handle empty barcode gracefully', async () => {
      const result = await barcodeCache.get('')

      expect(result).toBeNull()
    })
  })
})
```

**Step 4: Run barcode cache tests**

Run: `npm run vtest src/domains/nutrition/barcode-cache.spec.ts`
Expected: All 18 tests pass

**Step 5: Commit barcode cache tests**

```bash
git add vitest.setup.ts src/domains/nutrition/barcode-cache.spec.ts package.json package-lock.json
git commit -m "test: add barcode cache unit tests

- 18 test scenarios covering CRUD, expiry, contribution queue
- Uses fake-indexeddb for isolated testing
- Tests pending/synced status, error messages
- Added fake-indexeddb dev dependency

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Contribution Sync Service Unit Tests

**Files:**
- Create: `src/domains/nutrition/contribution-sync-service.spec.ts`

**Step 1: Write sync service unit tests**

File: `src/domains/nutrition/contribution-sync-service.spec.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { contributionSyncService } from './contribution-sync-service'
import { openfoodfactsContributor } from './openfoodfacts-contributor'
import { barcodeCache } from './barcode-cache'
import { validNutritionData } from './__tests__/fixtures/mock-nutrition-data'

describe('ContributionSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Stop service if running
    contributionSyncService.stop()
  })

  afterEach(() => {
    contributionSyncService.stop()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('Lifecycle Management', () => {
    it('should set up 30-minute interval on start', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval')

      contributionSyncService.start()

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        30 * 60 * 1000
      )
    })

    it('should trigger immediate sync when online on start', async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true })

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([])

      contributionSyncService.start()

      // Let async operations complete
      await vi.runAllTimersAsync()

      expect(barcodeCache.getPendingContributions).toHaveBeenCalled()
    })

    it('should not sync immediately when offline on start', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([])

      contributionSyncService.start()

      await vi.runAllTimersAsync()

      expect(barcodeCache.getPendingContributions).not.toHaveBeenCalled()
    })

    it('should clear interval on stop', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

      contributionSyncService.start()
      contributionSyncService.stop()

      expect(clearIntervalSpy).toHaveBeenCalled()
    })

    it('should handle stop when not started', () => {
      expect(() => contributionSyncService.stop()).not.toThrow()
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

    it('should sync single contribution successfully', async () => {
      const contribution = {
        id: 1,
        data: validNutritionData,
        synced: false,
        timestamp: Date.now(),
      }

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        contribution,
      ])
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(1)
      expect(result.failed).toBe(0)
      expect(barcodeCache.markContributionSynced).toHaveBeenCalledWith(1, true)
    })

    it('should sync multiple contributions with rate limiting', async () => {
      const contributions = [
        { id: 1, data: validNutritionData, synced: false, timestamp: Date.now() },
        { id: 2, data: validNutritionData, synced: false, timestamp: Date.now() },
        { id: 3, data: validNutritionData, synced: false, timestamp: Date.now() },
      ]

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue(
        contributions
      )
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(3)
      expect(openfoodfactsContributor.submit).toHaveBeenCalledTimes(3)
    })

    it('should mark failed submissions correctly', async () => {
      const contribution = {
        id: 1,
        data: validNutritionData,
        synced: false,
        timestamp: Date.now(),
      }

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        contribution,
      ])
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: false,
        error: 'API validation error',
      })
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(0)
      expect(result.failed).toBe(1)
      expect(barcodeCache.markContributionSynced).toHaveBeenCalledWith(
        1,
        false,
        'API validation error'
      )
    })

    it('should leave contributions pending on network error', async () => {
      const contribution = {
        id: 1,
        data: validNutritionData,
        synced: false,
        timestamp: Date.now(),
      }

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        contribution,
      ])
      vi.spyOn(openfoodfactsContributor, 'submit').mockRejectedValue(
        new Error('Network timeout')
      )
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.pending).toBe(1) // Still pending
      expect(barcodeCache.markContributionSynced).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(
        'Network error during sync:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('should continue syncing after network error', async () => {
      const contributions = [
        { id: 1, data: validNutritionData, synced: false, timestamp: Date.now() },
        { id: 2, data: validNutritionData, synced: false, timestamp: Date.now() },
      ]

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue(
        contributions
      )
      vi.spyOn(openfoodfactsContributor, 'submit')
        .mockRejectedValueOnce(new Error('Network error')) // First fails
        .mockResolvedValueOnce({ success: true }) // Second succeeds
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(1)
      expect(result.pending).toBe(1)
    })
  })

  describe('Rate Limiting', () => {
    it('should not delay first submission', async () => {
      const contribution = {
        id: 1,
        data: validNutritionData,
        synced: false,
        timestamp: Date.now(),
      }

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        contribution,
      ])
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()

      const startTime = Date.now()
      await contributionSyncService.syncNow()
      const duration = Date.now() - startTime

      // Should complete quickly (no 1-second delay)
      expect(duration).toBeLessThan(100)
    })
  })

  describe('Error Handling', () => {
    it('should skip contributions with missing ID', async () => {
      const contribution = {
        data: validNutritionData,
        synced: false,
        timestamp: Date.now(),
        // id missing
      }

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        contribution as any,
      ])
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await contributionSyncService.syncNow()

      expect(result.synced).toBe(0)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Contribution missing ID, skipping sync'
      )

      consoleSpy.mockRestore()
    })

    it('should handle toast notification errors gracefully', async () => {
      const contribution = {
        id: 1,
        data: validNutritionData,
        synced: false,
        timestamp: Date.now(),
      }

      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        contribution,
      ])
      vi.spyOn(openfoodfactsContributor, 'submit').mockResolvedValue({
        success: true,
      })
      vi.spyOn(barcodeCache, 'markContributionSynced').mockResolvedValue()

      // Mock showToast to throw error
      const { showToast } = await import('../components/toast/ToastStore')
      vi.spyOn({ showToast }, 'showToast').mockImplementation(() => {
        throw new Error('Toast error')
      })

      // Should not throw
      await expect(contributionSyncService.syncNow()).resolves.toBeDefined()
    })
  })

  describe('Helper Methods', () => {
    it('should return pending contribution count', async () => {
      vi.spyOn(barcodeCache, 'getPendingContributions').mockResolvedValue([
        { id: 1, data: validNutritionData, synced: false, timestamp: Date.now() },
        { id: 2, data: validNutritionData, synced: false, timestamp: Date.now() },
      ])

      const count = await contributionSyncService.getPendingCount()

      expect(count).toBe(2)
    })
  })
})
```

**Step 2: Run sync service tests**

Run: `npm run vtest src/domains/nutrition/contribution-sync-service.spec.ts`
Expected: All 16 tests pass

**Step 3: Commit sync service tests**

```bash
git add src/domains/nutrition/contribution-sync-service.spec.ts
git commit -m "test: add contribution sync service unit tests

- 16 test scenarios covering lifecycle, sync logic, rate limiting
- Tests interval setup, immediate sync, offline detection
- Tests network error handling, missing ID edge case
- Uses fake timers for interval testing

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Barcode Scanner Integration Test

**Files:**
- Create: `src/domains/nutrition/__tests__/integration/barcode-scanning.spec.ts`
- Create: `src/domains/nutrition/__tests__/mocks/capacitor-barcode.mock.ts`

**Step 1: Create Capacitor barcode mock**

File: `src/domains/nutrition/__tests__/mocks/capacitor-barcode.mock.ts`

```typescript
import { vi } from 'vitest'

/**
 * Mock for @capacitor-community/barcode-scanner
 * Allows testing scanner without physical device
 */

export const mockBarcodeScanner = {
  checkPermission: vi.fn(),
  requestPermissions: vi.fn(),
  startScan: vi.fn(),
  stopScan: vi.fn(),
}

// Export as BarcodeScanner for mocking
export const BarcodeScanner = mockBarcodeScanner
```

**Step 2: Write barcode scanning integration test**

File: `src/domains/nutrition/__tests__/integration/barcode-scanning.spec.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { validBarcodes, invalidBarcodes } from '../fixtures/mock-barcodes'

// Mock Capacitor barcode scanner before importing service
vi.mock('@capacitor-community/barcode-scanner', () => ({
  BarcodeScanner: {
    checkPermission: vi.fn(),
    requestPermissions: vi.fn(),
    startScan: vi.fn(),
    stopScan: vi.fn(),
  },
}))

// Import after mocking
import { BarcodeScanner } from '@capacitor-community/barcode-scanner'
import { barcodeScannerService } from '../../barcode-scanner'

describe('Barcode Scanner Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Permission Flow', () => {
    it('should start scan when permission already granted', async () => {
      vi.mocked(BarcodeScanner.checkPermission).mockResolvedValue({
        granted: true,
      } as any)

      vi.mocked(BarcodeScanner.startScan).mockResolvedValue({
        hasContent: true,
        content: validBarcodes.ean13,
      } as any)

      const result = await barcodeScannerService.scan()

      expect(BarcodeScanner.checkPermission).toHaveBeenCalled()
      expect(BarcodeScanner.startScan).toHaveBeenCalled()
      expect(result).toBe(validBarcodes.ean13)
    })

    it('should request permission when not granted', async () => {
      vi.mocked(BarcodeScanner.checkPermission).mockResolvedValue({
        granted: false,
      } as any)

      vi.mocked(BarcodeScanner.requestPermissions).mockResolvedValue({
        granted: true,
      } as any)

      vi.mocked(BarcodeScanner.startScan).mockResolvedValue({
        hasContent: true,
        content: validBarcodes.ean13,
      } as any)

      const result = await barcodeScannerService.scan()

      expect(BarcodeScanner.requestPermissions).toHaveBeenCalled()
      expect(BarcodeScanner.startScan).toHaveBeenCalled()
      expect(result).toBe(validBarcodes.ean13)
    })

    it('should throw error when permission denied', async () => {
      vi.mocked(BarcodeScanner.checkPermission).mockResolvedValue({
        granted: false,
      } as any)

      vi.mocked(BarcodeScanner.requestPermissions).mockResolvedValue({
        granted: false,
      } as any)

      await expect(barcodeScannerService.scan()).rejects.toThrow(
        'Camera permission denied'
      )

      expect(BarcodeScanner.startScan).not.toHaveBeenCalled()
    })
  })

  describe('Scan Success', () => {
    beforeEach(() => {
      // Mock permission granted for all scan tests
      vi.mocked(BarcodeScanner.checkPermission).mockResolvedValue({
        granted: true,
      } as any)
    })

    it('should return EAN-13 barcode', async () => {
      vi.mocked(BarcodeScanner.startScan).mockResolvedValue({
        hasContent: true,
        content: validBarcodes.ean13,
      } as any)

      const result = await barcodeScannerService.scan()

      expect(result).toBe(validBarcodes.ean13)
      expect(result).toHaveLength(13)
    })

    it('should return UPC-A barcode', async () => {
      vi.mocked(BarcodeScanner.startScan).mockResolvedValue({
        hasContent: true,
        content: validBarcodes.upcA,
      } as any)

      const result = await barcodeScannerService.scan()

      expect(result).toBe(validBarcodes.upcA)
      expect(result).toHaveLength(12)
    })

    it('should return EAN-8 barcode', async () => {
      vi.mocked(BarcodeScanner.startScan).mockResolvedValue({
        hasContent: true,
        content: validBarcodes.ean8,
      } as any)

      const result = await barcodeScannerService.scan()

      expect(result).toBe(validBarcodes.ean8)
      expect(result).toHaveLength(8)
    })

    it('should call stopScan on successful scan', async () => {
      vi.mocked(BarcodeScanner.startScan).mockResolvedValue({
        hasContent: true,
        content: validBarcodes.ean13,
      } as any)

      await barcodeScannerService.scan()

      expect(BarcodeScanner.stopScan).toHaveBeenCalled()
    })
  })

  describe('Scan Failure', () => {
    beforeEach(() => {
      vi.mocked(BarcodeScanner.checkPermission).mockResolvedValue({
        granted: true,
      } as any)
    })

    it('should return null when user cancels scan', async () => {
      vi.mocked(BarcodeScanner.startScan).mockResolvedValue({
        hasContent: false,
      } as any)

      const result = await barcodeScannerService.scan()

      expect(result).toBeNull()
      expect(BarcodeScanner.stopScan).toHaveBeenCalled()
    })

    it('should cleanup on scanner error', async () => {
      vi.mocked(BarcodeScanner.startScan).mockRejectedValue(
        new Error('Camera not available')
      )

      await expect(barcodeScannerService.scan()).rejects.toThrow(
        'Camera not available'
      )

      expect(BarcodeScanner.stopScan).toHaveBeenCalled()
    })

    it('should cleanup on invalid barcode format', async () => {
      vi.mocked(BarcodeScanner.startScan).mockResolvedValue({
        hasContent: true,
        content: invalidBarcodes.tooShort,
      } as any)

      const result = await barcodeScannerService.scan()

      // Service should still return it (validation happens in nutrition-service)
      expect(result).toBe(invalidBarcodes.tooShort)
      expect(BarcodeScanner.stopScan).toHaveBeenCalled()
    })
  })

  describe('State Management', () => {
    beforeEach(() => {
      vi.mocked(BarcodeScanner.checkPermission).mockResolvedValue({
        granted: true,
      } as any)
    })

    it('should cleanup scanner state on error', async () => {
      vi.mocked(BarcodeScanner.startScan).mockRejectedValue(
        new Error('Unexpected error')
      )

      try {
        await barcodeScannerService.scan()
      } catch (e) {
        // Expected error
      }

      expect(BarcodeScanner.stopScan).toHaveBeenCalled()
    })

    it('should cleanup scanner state on success', async () => {
      vi.mocked(BarcodeScanner.startScan).mockResolvedValue({
        hasContent: true,
        content: validBarcodes.ean13,
      } as any)

      await barcodeScannerService.scan()

      expect(BarcodeScanner.stopScan).toHaveBeenCalled()
    })
  })
})
```

**Step 3: Run barcode scanning test**

Run: `npm run vtest src/domains/nutrition/__tests__/integration/barcode-scanning.spec.ts`
Expected: All 13 tests pass

**Step 4: Commit barcode scanning tests**

```bash
git add src/domains/nutrition/__tests__/integration/barcode-scanning.spec.ts src/domains/nutrition/__tests__/mocks/
git commit -m "test: add barcode scanner integration tests

- 13 test scenarios covering permissions, scan success/failure, cleanup
- Mocks Capacitor barcode scanner plugin
- Tests all barcode formats (EAN-13, UPC-A, EAN-8)
- Tests state management and error recovery

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Cypress E2E Test

**Files:**
- Create: `cypress/e2e/nutrition-contribution.cy.ts`

**Step 1: Write Cypress E2E test**

File: `cypress/e2e/nutrition-contribution.cy.ts`

```typescript
describe('Nutrition Contribution Flow', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('should complete full contribution workflow', () => {
    // Navigate to AI chat
    cy.get('[data-testid="ai-chat-button"]').click()

    // Mock barcode scanner result for non-existent product
    cy.window().then((win) => {
      // @ts-ignore
      win.mockBarcodeResult = '9999999999999'
    })

    // Trigger barcode scan
    cy.get('[data-testid="scan-barcode-button"]').click()

    // Verify contribution prompt appears
    cy.contains('Product not found', { timeout: 10000 }).should('be.visible')
    cy.contains('Would you like to add it?').should('be.visible')

    // Click to expand form
    cy.contains('Add this product to database').click()

    // Fill out nutrition form - required fields
    cy.get('[data-testid="product-name"]').type('E2E Test Product')
    cy.get('[data-testid="serving-size"]').type('100')
    cy.get('[data-testid="serving-unit"]').select('g')
    cy.get('[data-testid="calories"]').type('250')
    cy.get('[data-testid="protein"]').type('10')
    cy.get('[data-testid="carbs"]').type('30')
    cy.get('[data-testid="fat"]').type('8')

    // Mock OpenFoodFacts API to return success
    cy.intercept('POST', '**/openfoodfacts.org/**', {
      statusCode: 200,
      body: {
        status: 1,
        status_verbose: 'fields saved',
        product: {
          code: '9999999999999',
          product_name: 'E2E Test Product',
        },
      },
    }).as('submitContribution')

    // Submit form
    cy.get('[data-testid="submit-contribution"]').click()

    // Wait for API call
    cy.wait('@submitContribution')

    // Verify success message
    cy.contains('Product added to OpenFoodFacts', { timeout: 5000 }).should(
      'be.visible'
    )
    cy.contains('Cached locally').should('be.visible')
  })

  it('should show validation errors for incomplete form', () => {
    // Navigate to AI chat
    cy.get('[data-testid="ai-chat-button"]').click()

    // Mock barcode scanner result
    cy.window().then((win) => {
      // @ts-ignore
      win.mockBarcodeResult = '9999999999999'
    })

    cy.get('[data-testid="scan-barcode-button"]').click()

    // Wait for prompt
    cy.contains('Product not found', { timeout: 10000 }).should('be.visible')
    cy.contains('Add this product to database').click()

    // Try to submit without filling required fields
    cy.get('[data-testid="submit-contribution"]').should('be.disabled')

    // Fill only product name (incomplete)
    cy.get('[data-testid="product-name"]').type('Test')

    // Submit button should still be disabled
    cy.get('[data-testid="submit-contribution"]').should('be.disabled')
  })
})
```

**Step 2: Run Cypress test**

Run: `npm run cypress`
Then manually run the test in Cypress UI

Expected: Test passes in Cypress

**Step 3: Commit Cypress test**

```bash
git add cypress/e2e/nutrition-contribution.cy.ts
git commit -m "test: add Cypress E2E test for nutrition contribution

- Happy path test: scan → form → submit → success
- Validation test: incomplete form shows disabled submit button
- Uses mocked barcode scanner and API responses
- Verifies full user journey in browser

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Add data-testid Attributes

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte`
- Modify: `src/domains/nutrition/components/ManualNutritionForm.svelte`

**Step 1: Add testid to AI chat button**

File: `src/domains/ai-query/ai-query-view.svelte`

Find the AI chat button (line ~50-100) and add:
```svelte
<button data-testid="ai-chat-button" on:click={...}>
```

Find the scan barcode button and add:
```svelte
<button data-testid="scan-barcode-button" on:click={...}>
```

**Step 2: Add testids to nutrition form fields**

File: `src/domains/nutrition/components/ManualNutritionForm.svelte`

Add data-testid to each form input:

```svelte
<input data-testid="product-name" bind:value={productName} ... />
<input data-testid="serving-size" bind:value={servingSize} ... />
<select data-testid="serving-unit" bind:value={servingUnit} ...>
<input data-testid="calories" bind:value={calories} ... />
<input data-testid="protein" bind:value={protein} ... />
<input data-testid="carbs" bind:value={carbs} ... />
<input data-testid="fat" bind:value={fat} ... />

<button data-testid="submit-contribution" on:click={handleSubmit} ...>
<button data-testid="cancel-contribution" on:click={handleCancel} ...>
```

**Step 3: Test that Cypress can find elements**

Run: `npm run cypress`
Run the nutrition-contribution test
Expected: Test finds all elements by data-testid

**Step 4: Commit testid additions**

```bash
git add src/domains/ai-query/ai-query-view.svelte src/domains/nutrition/components/ManualNutritionForm.svelte
git commit -m "test: add data-testid attributes for E2E testing

- Added testids to AI chat button, scan barcode button
- Added testids to all nutrition form inputs
- Added testids to submit/cancel buttons
- Enables reliable Cypress test selectors

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Final Commit & Summary

**Files:**
- All test files

**Step 1: Run full test suite**

Run: `npm run vtest`
Expected: All tests pass (including existing 310 + new 75+ tests)

**Step 2: Generate coverage report**

Run: `npm run vtest:coverage`
Expected: Coverage >80% for nutrition domain

**Step 3: Verify no regressions**

Check that all 310 existing tests still pass.

**Step 4: Create final Phase 8 commit**

```bash
git add -A
git commit -m "feat: complete Phase 8 testing & refinement

Test implementation summary:
- 73+ new tests across 6 test files
- Integration tests: validation, API errors, workflow, scanner (48 tests)
- Unit tests: barcode-cache, sync-service (34 tests)
- E2E test: Cypress happy path (1 test)

Coverage:
- Nutrition domain: >80% line coverage
- All critical paths tested
- No regressions in existing 310 tests

Files created:
- Test fixtures (barcodes, nutrition data, API responses)
- 4 integration test files
- 2 unit test files
- 1 Cypress E2E test
- Capacitor scanner mock

Phase 8 of 8 complete

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 5: Push to origin**

```bash
git push origin master
```

---

## Success Criteria Checklist

After completing all tasks, verify:

**✅ Test Count:**
- [ ] 18+ validation tests
- [ ] 15+ API error tests
- [ ] 15+ workflow tests
- [ ] 13+ scanner tests
- [ ] 18+ barcode-cache tests
- [ ] 16+ sync-service tests
- [ ] 1 Cypress E2E test
- [ ] **Total: 96+ new tests**

**✅ Coverage:**
- [ ] Nutrition domain >80% line coverage
- [ ] All critical paths covered
- [ ] No regressions (310 existing tests pass)

**✅ Quality:**
- [ ] All tests pass in CI
- [ ] Integration tests complete in <10 seconds
- [ ] Unit tests complete in <5 seconds
- [ ] No console errors in test runs

**✅ Deliverables:**
- [ ] 6 test files created
- [ ] 3 fixture files created
- [ ] 1 E2E test created
- [ ] data-testid attributes added
- [ ] vitest.setup.ts updated

---

## Notes

- Use `npm run vtest` for unit/integration tests
- Use `npm run cypress` for E2E tests
- Use `npm run vtest:coverage` for coverage report
- All tests use mocks (no real API calls or device dependencies)
- E2E test requires manual verification in Cypress UI
- Phase 8 completes the 8-phase nutrition tracking implementation
