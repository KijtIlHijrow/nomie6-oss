import { AutoBackupService } from './AutoBackupService'

const LAST_DAILY_BACKUP_KEY = 'auto-backup-last-daily'
const DAY_MS = 24 * 60 * 60 * 1000

class BackupSchedulerClass {
  private initialized = false

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    console.log('[BackupScheduler] Initializing...')

    // Check for daily backup
    await this.checkDailyBackup()

    // Setup close handler
    this.setupCloseHandler()
  }

  private async checkDailyBackup(): Promise<void> {
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
    const timeSinceLastDaily = now - lastDailyTime

    if (timeSinceLastDaily >= DAY_MS) {
      console.log('[BackupScheduler] Last daily backup was >24h ago, creating new backup')
      await AutoBackupService.createBackup('daily')
      localStorage.setItem(LAST_DAILY_BACKUP_KEY, String(now))
    } else {
      const hoursUntilNext = Math.round((DAY_MS - timeSinceLastDaily) / (60 * 60 * 1000))
      console.log(`[BackupScheduler] Next daily backup in ~${hoursUntilNext} hours`)
    }
  }

  private setupCloseHandler(): void {
    window.addEventListener('beforeunload', () => {
      // Create backup on close
      // Note: beforeunload is synchronous, so we can't await
      // We'll use a synchronous approach with sendBeacon or localStorage flag
      console.log('[BackupScheduler] Window closing, triggering close backup')

      // Set flag for backup to be created
      localStorage.setItem('auto-backup-pending-close', String(Date.now()))
    })

    // On startup, check for pending close backup
    const pendingClose = localStorage.getItem('auto-backup-pending-close')
    if (pendingClose) {
      console.log('[BackupScheduler] Pending close backup detected, creating now')
      AutoBackupService.createBackup('close').then(() => {
        localStorage.removeItem('auto-backup-pending-close')
      })
    }
  }
}

export const BackupScheduler = new BackupSchedulerClass()
