/**
 * Contribution Sync Service
 *
 * Handles background synchronization of queued nutrition contributions
 *
 * NOTE: nutrition-service.ts also has an online event listener for immediate sync.
 * This service provides:
 * - Periodic background sync (every 30 minutes)
 * - Manual sync trigger from settings
 * The online event in nutrition-service provides immediate sync when connectivity restored.
 */

import { barcodeCache } from './barcode-cache'
import { openfoodfactsContributor } from './openfoodfacts-contributor'
import { showToast } from '../../components/toast/ToastStore'

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
    const pending = await barcodeCache.getPendingContributions()

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

        if (!contribution.id) {
          console.error('Contribution missing ID, skipping sync')
          continue
        }

        if (result.success) {
          await barcodeCache.markContributionSynced(contribution.id, true)
          synced++
        } else {
          await barcodeCache.markContributionSynced(contribution.id, false, result.error)
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
      try {
        showToast({
          message: `✓ Synced ${synced} contribution${synced > 1 ? 's' : ''} to OpenFoodFacts`,
        })
      } catch (error) {
        console.error('Failed to show toast notification:', error)
      }
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
    const pending = await barcodeCache.getPendingContributions()
    return pending.length
  }
}

// Export singleton instance
export const contributionSyncService = new ContributionSyncService()
