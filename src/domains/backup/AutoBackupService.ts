import { autoBackupStorage } from './auto-backup-storage'
import type { AutoBackup } from './auto-backup-storage'
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
  private retryTimer: NodeJS.Timeout | null = null

  private getStatus(): BackupStatus {
    const stored = localStorage.getItem(this.STATUS_KEY)
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch (error) {
        console.warn('[AutoBackup] Failed to parse status from localStorage:', error)
        return {
          lastAttempt: 0,
          lastSuccess: 0,
          failureCount: 0,
          lastError: ''
        }
      }
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
    // Clear any pending retry timer
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }

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

      // Update status on success (re-read to avoid race conditions)
      const successStatus = this.getStatus()
      successStatus.lastSuccess = Date.now()
      successStatus.failureCount = 0
      successStatus.lastError = ''
      this.setStatus(successStatus)
    } catch (error) {
      console.error('[AutoBackup] Failed to create backup:', error)

      // Update failure status (re-read to avoid race conditions)
      const failureStatus = this.getStatus()
      failureStatus.failureCount++
      failureStatus.lastError = error instanceof Error ? error.message : String(error)
      this.setStatus(failureStatus)

      // Check for quota exceeded errors
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isQuotaError = errorMessage.toLowerCase().includes('quota') ||
                          errorMessage.includes('QuotaExceededError')

      if (isQuotaError && !isRetry) {
        console.log('[AutoBackup] Quota exceeded, freeing space and retrying...')
        await this.freeSpace()
        await this.createBackup(type, true)
        return // Don't schedule another retry or throw
      }

      if (!isRetry) {
        console.log('[AutoBackup] Will retry in 30 seconds...')
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null
          this.createBackup(type, true).catch(err => {
            console.error('[AutoBackup] Retry failed:', err)
          })
        }, 30000)
        return // Don't throw, let retry handle it
      }

      // This is a retry that failed - throw the error
      throw error
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

  async restoreBackup(backupId: string): Promise<void> {
    try {
      // Get the backup from storage
      const backups = await this.listBackups()
      const backup = backups.find(b => b.id === backupId)

      if (!backup) {
        throw new Error(`Backup not found: ${backupId}`)
      }

      // Create a safety backup before restoring
      await this.createBackup('daily')

      // Rename the safety backup
      const safetyBackups = await this.listBackups()
      const latestBackup = safetyBackups.sort((a, b) => b.timestamp - a.timestamp)[0]
      if (latestBackup && latestBackup.type === 'daily') {
        latestBackup.id = `pre-restore-safety-${Date.now()}`
        await autoBackupStorage.save(latestBackup)
      }

      // Import the backup data
      const { importStorageArchive } = await import('../storage/import-export')
      await importStorageArchive(backup.data, false)

      // Reload the page after a short delay
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error) {
      console.error('[AutoBackup] Failed to restore backup:', error)
      throw error
    }
  }

  async getBackupPreview(backupId: string): Promise<{
    trackerCount: number
    logCount: number
    bookCount: number
    peopleCount: number
    boardCount: number
  }> {
    const backups = await this.listBackups()
    const backup = backups.find(b => b.id === backupId)

    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`)
    }

    const files = backup.data.files

    // Count trackers
    let trackerCount = 0
    if (files['trackers.json']) {
      try {
        const trackers = JSON.parse(files['trackers.json'])
        trackerCount = Object.keys(trackers).length
      } catch (e) {
        console.warn('Failed to parse trackers.json:', e)
      }
    }

    // Count logs from all book files
    let logCount = 0
    Object.keys(files).forEach(key => {
      if (key.startsWith('data/books/') && !key.endsWith('_last')) {
        try {
          const bookData = JSON.parse(files[key])
          if (bookData.data && Array.isArray(bookData.data)) {
            logCount += bookData.data.length
          }
        } catch (e) {
          console.warn(`Failed to parse book file ${key}:`, e)
        }
      }
    })

    // Count books
    const bookCount = Object.keys(files).filter(key =>
      key.startsWith('data/books/') && !key.endsWith('_last')
    ).length

    // Count people
    let peopleCount = 0
    if (files['people.json']) {
      try {
        const people = JSON.parse(files['people.json'])
        peopleCount = Array.isArray(people) ? people.length : 0
      } catch (e) {
        console.warn('Failed to parse people.json:', e)
      }
    }

    // Count boards
    let boardCount = 0
    if (files['boards.json']) {
      try {
        const boards = JSON.parse(files['boards.json'])
        boardCount = Array.isArray(boards) ? boards.length : 0
      } catch (e) {
        console.warn('Failed to parse boards.json:', e)
      }
    }

    return {
      trackerCount,
      logCount,
      bookCount,
      peopleCount,
      boardCount
    }
  }
}

export const AutoBackupService = new AutoBackupServiceClass()
