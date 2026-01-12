/**
 * Nutrition Service
 *
 * Orchestrates nutrition data lookup across multiple providers
 * with caching and fallback logic
 */

import type { NutritionProvider, NutritionData, BarcodeValidation } from './nutrition-types'
import { OpenFoodFactsProvider } from './providers/openfoodfacts-provider'
import { barcodeCache } from './barcode-cache'
import { appConfig } from '../../config/appConfig'

/**
 * Main nutrition service
 * Manages providers, caching, and fallback logic
 */
export class NutritionService {
  private providers: Map<string, NutritionProvider>
  private lastLookupTime: Map<string, number> // Rate limiting

  constructor() {
    this.providers = new Map()
    this.lastLookupTime = new Map()

    // Initialize providers
    this.registerProvider(new OpenFoodFactsProvider())

    // TODO Phase 6: Add Nutritionix and USDA providers
    // if (appConfig.nutritionApis.nutritionixApiKey) {
    //   this.registerProvider(new NutritionixProvider(...))
    // }
    // this.registerProvider(new USDAProvider())
  }

  /**
   * Register a nutrition provider
   */
  registerProvider(provider: NutritionProvider): void {
    this.providers.set(provider.name, provider)
  }

  /**
   * Get provider by name
   */
  getProvider(name: string): NutritionProvider | undefined {
    return this.providers.get(name)
  }

  /**
   * Get primary provider based on config
   */
  getPrimaryProvider(): NutritionProvider {
    const primaryName = appConfig.nutritionApis?.primaryProvider || 'openfoodfacts'
    return this.providers.get(primaryName) || this.providers.get('openfoodfacts')!
  }

  /**
   * Get secondary providers for fallback
   */
  getSecondaryProviders(): NutritionProvider[] {
    const primaryName = appConfig.nutritionApis?.primaryProvider || 'openfoodfacts'
    return Array.from(this.providers.values()).filter((p) => p.name !== primaryName)
  }

  /**
   * Lookup nutrition data for a barcode
   * Multi-level fallback: cache → primary → secondary → stale cache
   */
  async lookup(barcode: string): Promise<NutritionData | null> {
    // Validate barcode format
    const validation = this.validateBarcode(barcode)
    if (!validation.valid) {
      console.error(`Invalid barcode: ${validation.error}`)
      return null
    }

    // Rate limiting check
    if (!this.checkRateLimit(barcode)) {
      console.warn('Rate limit exceeded for barcode:', barcode)
      // Still allow, but use cache if available
      const cached = await barcodeCache.get(barcode)
      return cached?.data || null
    }

    // 1. Check cache first (instant)
    const cached = await barcodeCache.get(barcode)
    const cacheExpiry = appConfig.nutritionApis?.cacheExpiry || 30 * 24 * 60 * 60 * 1000 // 30 days

    if (cached && !barcodeCache.isExpired(cached, cacheExpiry)) {
      console.log('Cache hit for barcode:', barcode)
      return cached.data
    }

    // 2. Try primary provider
    const primary = this.getPrimaryProvider()
    try {
      console.log(`Trying primary provider: ${primary.name}`)
      const data = await primary.lookup(barcode)
      if (data) {
        await barcodeCache.set(barcode, data)
        this.recordLookup(barcode)
        return data
      }
    } catch (error) {
      console.error(`Primary provider ${primary.name} failed:`, error)
    }

    // 3. Try secondary providers (fallback cascade)
    const secondaries = this.getSecondaryProviders()
    for (const provider of secondaries) {
      try {
        console.log(`Trying fallback provider: ${provider.name}`)
        const data = await provider.lookup(barcode)
        if (data) {
          await barcodeCache.set(barcode, data)
          this.recordLookup(barcode)
          return data
        }
      } catch (error) {
        console.error(`Fallback provider ${provider.name} failed:`, error)
      }
    }

    // 4. Return stale cache if available (offline fallback)
    if (cached) {
      console.warn('Using stale cache for barcode:', barcode)
      return cached.data
    }

    // 5. Not found anywhere
    console.log('Barcode not found in any provider:', barcode)
    this.recordLookup(barcode)
    return null
  }

  /**
   * Search for products by name
   */
  async search(query: string): Promise<NutritionData[]> {
    const primary = this.getPrimaryProvider()

    if (!primary.search) {
      console.warn(`Provider ${primary.name} does not support search`)
      return []
    }

    try {
      return await primary.search(query)
    } catch (error) {
      console.error('Search failed:', error)
      return []
    }
  }

  /**
   * Queue a user contribution
   */
  async queueContribution(data: NutritionData): Promise<void> {
    await barcodeCache.queueContribution(data)
    console.log('Contribution queued for barcode:', data.barcode)
  }

  /**
   * Sync pending contributions to OpenFoodFacts
   * Called when app comes online
   */
  async syncContributions(): Promise<{ synced: number; failed: number }> {
    const pending = await barcodeCache.getPendingContributions()
    let synced = 0
    let failed = 0

    const offProvider = this.providers.get('openfoodfacts')
    if (!offProvider?.contribute) {
      console.warn('OpenFoodFacts provider does not support contributions')
      return { synced, failed }
    }

    for (const contribution of pending) {
      if (!contribution.id) continue

      try {
        const success = await offProvider.contribute(contribution.data)
        if (success) {
          await barcodeCache.markContributionSynced(contribution.id, true)
          synced++
        } else {
          await barcodeCache.markContributionSynced(contribution.id, false, 'Contribution failed')
          failed++
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        await barcodeCache.markContributionSynced(contribution.id, false, errorMsg)
        failed++
      }
    }

    console.log(`Contribution sync complete: ${synced} synced, ${failed} failed`)
    return { synced, failed }
  }

  /**
   * Validate barcode format
   */
  validateBarcode(barcode: string): BarcodeValidation {
    if (!barcode || typeof barcode !== 'string') {
      return { valid: false, error: 'Barcode is required' }
    }

    const cleaned = barcode.trim()

    // Check if numeric
    if (!/^\d+$/.test(cleaned)) {
      return { valid: false, error: 'Barcode must contain only digits' }
    }

    // Check length (UPC-A: 12, EAN-13: 13, EAN-8: 8)
    const length = cleaned.length
    if (length === 12) {
      return { valid: true, format: 'UPC-A' }
    } else if (length === 13) {
      return { valid: true, format: 'EAN-13' }
    } else if (length === 8) {
      return { valid: true, format: 'EAN-8' }
    } else {
      return {
        valid: false,
        error: `Invalid barcode length: ${length} (expected 8, 12, or 13 digits)`,
      }
    }
  }

  /**
   * Check rate limiting for API calls
   */
  private checkRateLimit(barcode: string): boolean {
    const now = Date.now()
    const lastLookup = this.lastLookupTime.get(barcode)
    const minInterval = 60 * 1000 // 1 minute between lookups for same barcode

    if (lastLookup && now - lastLookup < minInterval) {
      return false
    }

    return true
  }

  /**
   * Record a lookup timestamp for rate limiting
   */
  private recordLookup(barcode: string): void {
    this.lastLookupTime.set(barcode, Date.now())
  }

  /**
   * Clean up expired cache entries
   */
  async cleanCache(): Promise<number> {
    const cacheExpiry = appConfig.nutritionApis?.cacheExpiry || 30 * 24 * 60 * 60 * 1000
    return await barcodeCache.cleanExpired(cacheExpiry)
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    count: number
    pending: number
    synced: number
  }> {
    const count = await barcodeCache.count()
    const contributions = await barcodeCache.getAllContributions()
    const pending = contributions.filter((c) => !c.synced).length
    const synced = contributions.filter((c) => c.synced).length

    return { count, pending, synced }
  }
}

// Export singleton instance
export const nutritionService = new NutritionService()

// Sync contributions when app comes online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('App online, syncing nutrition contributions...')
    nutritionService.syncContributions()
  })
}
