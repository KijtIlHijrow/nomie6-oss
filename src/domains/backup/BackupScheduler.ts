import { AutoBackupService } from './AutoBackupService'

const LAST_DAILY_BACKUP_KEY = 'auto-backup-last-daily'
const PENDING_CLOSE_BACKUP_KEY = 'auto-backup-pending-close'
const DAY_MS = 24 * 60 * 60 * 1000

class BackupSchedulerClass {
  private initialized = false

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    console.log('[BackupScheduler] Initializing...')

    // Process any pending close backup first
    await this.processPendingCloseBackup()

    // Check for daily backup
    await this.checkDailyBackup()

    // Setup close handler for future closes
    this.setupCloseHandler()
  }

  private async checkDailyBackup(): Promise<void> {
    try {
      const lastDaily = localStorage.getItem(LAST_DAILY_BACKUP_KEY)
      const now = Date.now()

      if (!lastDaily) {
        // First time - create backup
        console.log('[BackupScheduler] No previous daily backup found, creating first backup')
        await AutoBackupService.createBackup('daily')
        localStorage.setItem(LAST_DAILY_BACKUP_KEY, String(now))
        return
      }

      const lastDailyTime = parseInt(lastDaily, 10)

      // Validate parseInt result
      if (isNaN(lastDailyTime)) {
        console.warn('[BackupScheduler] Invalid timestamp in localStorage, treating as first backup')
        await AutoBackupService.createBackup('daily')
        localStorage.setItem(LAST_DAILY_BACKUP_KEY, String(now))
        return
      }

      const timeSinceLastDaily = now - lastDailyTime

      if (timeSinceLastDaily >= DAY_MS) {
        console.log('[BackupScheduler] Last daily backup was >24h ago, creating new backup')
        await AutoBackupService.createBackup('daily')
        localStorage.setItem(LAST_DAILY_BACKUP_KEY, String(now))
      } else {
        const hoursUntilNext = Math.round((DAY_MS - timeSinceLastDaily) / (60 * 60 * 1000))
        console.log(`[BackupScheduler] Next daily backup in ~${hoursUntilNext} hours`)
      }
    } catch (error) {
      console.error('[BackupScheduler] Failed to check/create daily backup:', error)
    }
  }

  private async processPendingCloseBackup(): Promise<void> {
    const pendingClose = localStorage.getItem(PENDING_CLOSE_BACKUP_KEY)
    if (!pendingClose) return

    try {
      console.log('[BackupScheduler] Pending close backup detected, creating now')
      await AutoBackupService.createBackup('close')
      localStorage.removeItem(PENDING_CLOSE_BACKUP_KEY)
    } catch (error) {
      console.error('[BackupScheduler] Failed to process pending close backup:', error)
      // Keep the flag so we can retry on next startup
    }
  }

  private setupCloseHandler(): void {
    window.addEventListener('beforeunload', () => {
      // Set flag for backup to be created on next startup
      // Note: beforeunload is synchronous, so we can't await
      console.log('[BackupScheduler] Window closing, setting pending backup flag')
      localStorage.setItem(PENDING_CLOSE_BACKUP_KEY, String(Date.now()))
    })
  }
}

export const BackupScheduler = new BackupSchedulerClass()
