import localforage from 'localforage'
import type { N6StorageExport } from '../storage/import-export'

/**
 * Auto Backup Interface
 * Represents a single auto-backup stored in IndexedDB
 */
export interface AutoBackup {
  id: string
  timestamp: number
  type: 'daily' | 'close'
  data: N6StorageExport
  size: number
  dataHash: string
  version: string
}

/**
 * LocalForage instance configured for auto-backups
 */
export const autoBackupStore = localforage.createInstance({
  name: 'nomie-auto-backups',
  driver: localforage.INDEXEDDB,
  storeName: 'backups',
})

/**
 * Auto Backup Storage
 * Provides methods for managing auto-backups in IndexedDB
 */
export const autoBackupStorage = {
  /**
   * Save a backup to IndexedDB
   * @param backup The backup to save
   */
  async save(backup: AutoBackup): Promise<void> {
    await autoBackupStore.setItem(backup.id, backup)
  },

  /**
   * Retrieve a backup by id
   * @param id The backup id
   * @returns The backup or null if not found
   */
  async get(id: string): Promise<AutoBackup | null> {
    const backup = await autoBackupStore.getItem<AutoBackup>(id)
    return backup || null
  },

  /**
   * List all backups sorted by timestamp (newest first)
   * @returns Array of backups sorted by timestamp descending
   */
  async list(): Promise<AutoBackup[]> {
    const backups: AutoBackup[] = []
    await autoBackupStore.iterate<AutoBackup, void>((value) => {
      backups.push(value)
    })
    return backups.sort((a, b) => b.timestamp - a.timestamp)
  },

  /**
   * Delete a backup by id
   * @param id The backup id to delete
   */
  async delete(id: string): Promise<void> {
    await autoBackupStore.removeItem(id)
  },

  /**
   * Clear all backups
   */
  async clear(): Promise<void> {
    await autoBackupStore.clear()
  },

  /**
   * Get total storage size of all backups
   * @returns Total size in bytes
   */
  async getStorageSize(): Promise<number> {
    const backups = await this.list()
    return backups.reduce((total, backup) => total + backup.size, 0)
  },
}
