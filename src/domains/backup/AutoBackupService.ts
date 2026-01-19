import { autoBackupStorage, AutoBackup } from './auto-backup-storage'
import Storage from '../storage/storage'
import dayjs from 'dayjs'
import { AppVersion } from '../../modules/app-version/app-version'
import { MD5 } from 'crypto-js'

interface BackupStatus {
  lastAttempt: number
  lastSuccess: number
  failureCount: number
  lastError: string
}

class AutoBackupServiceClass {
  private lastBackupHash: string | null = null
  private readonly STATUS_KEY = 'auto-backup-status'
  private readonly MAX_RETRIES = 1

  private getStatus(): BackupStatus {
    const stored = localStorage.getItem(this.STATUS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
    return {
      lastAttempt: 0,
      lastSuccess: 0,
      failureCount: 0,
      lastError: ''
    }
  }

  private setStatus(status: BackupStatus): void {
    localStorage.setItem(this.STATUS_KEY, JSON.stringify(status))
  }

  async createBackup(type: 'daily' | 'close', isRetry = false): Promise<void> {
    // Get and update status
    const status = this.getStatus()
    status.lastAttempt = Date.now()
    this.setStatus(status)

    try {
      // Get all storage data
      const files: Array<string> = await Storage.list()
      const storage: any = {}

      for (const file of files) {
        const path = Storage.convertPath(file)
        const content = await Storage.get(path)
        if (content) {
          storage[path] = content
        }
      }

      // Create backup payload
      const data = {
        version: AppVersion,
        created: new Date(),
        files: storage
      }

      // Calculate hash for deduplication
      const dataString = JSON.stringify(data)
      const dataHash = MD5(dataString).toString()

      // Skip if data unchanged
      if (this.lastBackupHash === dataHash) {
        console.log(`[AutoBackup] Skipping ${type} backup - no changes detected`)
        return
      }

      // Calculate size
      const size = new Blob([dataString]).size

      // Create backup record
      const backup: AutoBackup = {
        id: `backup-${dayjs().format('YYYY-MM-DD-HH-mm-ss')}-${type}`,
        timestamp: Date.now(),
        type,
        data,
        size,
        dataHash,
        version: AppVersion
      }

      // Save to IndexedDB
      await autoBackupStorage.save(backup)
      this.lastBackupHash = dataHash

      console.log(`[AutoBackup] Created ${type} backup: ${backup.id} (${(size / 1024 / 1024).toFixed(2)} MB)`)

      // Run rotation after creating backup
      await this.rotateBackups()

      // Update status on success
      status.lastSuccess = Date.now()
      status.failureCount = 0
      status.lastError = ''
      this.setStatus(status)
    } catch (error) {
      console.error('[AutoBackup] Failed to create backup:', error)

      // Update failure status
      status.failureCount++
      status.lastError = error instanceof Error ? error.message : String(error)
      this.setStatus(status)

      // Check for quota exceeded errors
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isQuotaError = errorMessage.toLowerCase().includes('quota') ||
                          errorMessage.includes('QuotaExceededError')

      if (isQuotaError && !isRetry) {
        console.log('[AutoBackup] Quota exceeded, freeing space and retrying...')
        await this.freeSpace()
        await this.createBackup(type, true)
      } else if (!isRetry) {
        console.log('[AutoBackup] Will retry in 30 seconds...')
        setTimeout(() => {
          this.createBackup(type, true).catch(err => {
            console.error('[AutoBackup] Retry failed:', err)
          })
        }, 30000)
      } else {
        throw error
      }
    }
  }

  async listBackups(): Promise<AutoBackup[]> {
    return await autoBackupStorage.list()
  }

  async deleteBackup(backupId: string): Promise<void> {
    await autoBackupStorage.delete(backupId)
  }

  async getStorageUsage(): Promise<number> {
    return await autoBackupStorage.getStorageSize()
  }

  async rotateBackups(): Promise<void> {
    const backups = await this.listBackups()
    const now = Date.now()
    const DAY_MS = 24 * 60 * 60 * 1000

    // Group backups by day
    const byDay = new Map<string, AutoBackup[]>()

    backups.forEach(backup => {
      const day = dayjs(backup.timestamp).format('YYYY-MM-DD')
      if (!byDay.has(day)) {
        byDay.set(day, [])
      }
      byDay.get(day)!.push(backup)
    })

    const toKeep: AutoBackup[] = []

    byDay.forEach((dayBackups, day) => {
      const dayTimestamp = dayjs(day).valueOf()
      const dayAge = (now - dayTimestamp) / DAY_MS

      if (dayAge <= 7) {
        // Keep all from last 7 days
        toKeep.push(...dayBackups)
      } else if (dayAge <= 30) {
        // Keep newest from each day 8-30
        const sorted = [...dayBackups].sort((a, b) => b.timestamp - a.timestamp)
        toKeep.push(sorted[0])
      }
      // Days >30 are not kept (will be deleted)
    })

    // Delete backups not in toKeep list (using Set for O(n) lookup)
    const keepIds = new Set(toKeep.map(b => b.id))
    const toDelete = backups.filter(b => !keepIds.has(b.id))

    for (const backup of toDelete) {
      console.log(`[AutoBackup] Rotating out old backup: ${backup.id}`)
      await this.deleteBackup(backup.id)
    }

    if (toDelete.length > 0) {
      console.log(`[AutoBackup] Rotation complete: kept ${toKeep.length}, deleted ${toDelete.length}`)
    }
  }

  async freeSpace(): Promise<void> {
    const backups = await this.listBackups()
    // Sort oldest first
    const sorted = backups.sort((a, b) => a.timestamp - b.timestamp)
    // Delete oldest 5 backups
    const toDelete = sorted.slice(0, 5)

    for (const backup of toDelete) {
      await this.deleteBackup(backup.id)
    }

    console.log(`[AutoBackup] Freed space by deleting ${toDelete.length} old backups`)
  }

  getBackupHealth(): { healthy: boolean; failureCount: number; lastError: string } {
    const status = this.getStatus()
    return {
      healthy: status.failureCount < 3,
      failureCount: status.failureCount,
      lastError: status.lastError
    }
  }
}

export const AutoBackupService = new AutoBackupServiceClass()
