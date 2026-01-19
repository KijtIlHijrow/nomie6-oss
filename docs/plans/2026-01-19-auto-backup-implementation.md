# Auto-Backup System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build automatic backup system that creates backups daily and on browser close, stores them in IndexedDB with 30-day retention, and provides full UI for management.

**Architecture:** Separate IndexedDB store for auto-backups, reusing existing `exportStorage()` logic. BackupScheduler handles triggers, AutoBackupService manages storage/rotation, UI components in Settings.

**Tech Stack:** TypeScript, Svelte, IndexedDB (via localforage), existing Nomie storage infrastructure

---

## Phase 1: Core Backup Service

### Task 1: Setup IndexedDB Store for Auto-Backups

**Files:**
- Create: `src/domains/backup/auto-backup-storage.ts`

**Step 1: Write the storage module**

```typescript
import localforage from 'localforage'

export interface AutoBackup {
  id: string
  timestamp: number
  type: 'daily' | 'close'
  data: any // N6StorageExport
  size: number
  dataHash: string
  version: string
}

// Create separate IndexedDB instance for auto-backups
export const autoBackupStore = localforage.createInstance({
  name: 'nomie-auto-backups',
  driver: localforage.INDEXEDDB,
  storeName: 'backups'
})

export const autoBackupStorage = {
  async save(backup: AutoBackup): Promise<void> {
    await autoBackupStore.setItem(backup.id, backup)
  },

  async get(id: string): Promise<AutoBackup | null> {
    return await autoBackupStore.getItem<AutoBackup>(id)
  },

  async list(): Promise<AutoBackup[]> {
    const keys = await autoBackupStore.keys()
    const backups: AutoBackup[] = []

    for (const key of keys) {
      const backup = await autoBackupStore.getItem<AutoBackup>(key)
      if (backup) backups.push(backup)
    }

    return backups.sort((a, b) => b.timestamp - a.timestamp)
  },

  async delete(id: string): Promise<void> {
    await autoBackupStore.removeItem(id)
  },

  async clear(): Promise<void> {
    await autoBackupStore.clear()
  },

  async getStorageSize(): Promise<number> {
    const backups = await this.list()
    return backups.reduce((total, b) => total + b.size, 0)
  }
}
```

**Step 2: Commit**

```bash
git add src/domains/backup/auto-backup-storage.ts
git commit -m "feat(backup): add IndexedDB storage for auto-backups"
```

---

### Task 2: Create AutoBackupService Core

**Files:**
- Create: `src/domains/backup/AutoBackupService.ts`
- Reference: `src/domains/storage/import-export.ts` (for exportStorage)

**Step 1: Write AutoBackupService skeleton**

```typescript
import { autoBackupStorage, AutoBackup } from './auto-backup-storage'
import Storage from '../storage/storage'
import dayjs from 'dayjs'
import config from '../../config/appConfig'
import { MD5 } from 'crypto-js'

class AutoBackupServiceClass {
  private lastBackupHash: string | null = null

  async createBackup(type: 'daily' | 'close'): Promise<void> {
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
        version: `${config.version}`,
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
        id: `backup-${dayjs().format('YYYY-MM-DD-HH-mm')}-${type}`,
        timestamp: Date.now(),
        type,
        data,
        size,
        dataHash,
        version: config.version
      }

      // Save to IndexedDB
      await autoBackupStorage.save(backup)
      this.lastBackupHash = dataHash

      console.log(`[AutoBackup] Created ${type} backup: ${backup.id} (${(size / 1024 / 1024).toFixed(2)} MB)`)

      // Run rotation after creating backup
      await this.rotateBackups()
    } catch (error) {
      console.error('[AutoBackup] Failed to create backup:', error)
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
    // Placeholder - will implement in Phase 3
    console.log('[AutoBackup] Rotation not yet implemented')
  }
}

export const AutoBackupService = new AutoBackupServiceClass()
```

**Step 2: Commit**

```bash
git add src/domains/backup/AutoBackupService.ts
git commit -m "feat(backup): add AutoBackupService with createBackup method"
```

---

## Phase 2: Scheduling & Triggers

### Task 3: Create BackupScheduler for Daily Trigger

**Files:**
- Create: `src/domains/backup/BackupScheduler.ts`

**Step 1: Write BackupScheduler with daily check**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/domains/backup/BackupScheduler.ts
git commit -m "feat(backup): add BackupScheduler with daily and close triggers"
```

---

### Task 4: Integrate BackupScheduler into App Startup

**Files:**
- Modify: `src/BootStore.ts`

**Step 1: Import and initialize BackupScheduler**

Find the `bootNomie` function around line 79 and add scheduler initialization:

```typescript
// Add import at top
import { BackupScheduler } from './domains/backup/BackupScheduler'

// In bootNomie function, after line 99 (after migrations)
export const bootNomie = async ($Prefs: PreferencesStateType) => {
  // ... existing code ...

  return new Promise((resolve) => {
    try {
      Storage.onReady(async () => {
        if (locked && $Prefs.usePin) {
          await presentLockScreen($Prefs)
        }
        await LedgerStore.init()
        const trackables = await InitTrackableStore()

        // Run one-time migrations
        try {
          await migrateNutritionTrackerReferences()
          await migrateSatfatToSaturatedFat()
        } catch (error) {
          console.error('Migration failed, but continuing boot:', error)
        }

        // Initialize auto-backup scheduler
        try {
          await BackupScheduler.init()
        } catch (error) {
          console.error('BackupScheduler failed to initialize:', error)
        }

        bootCoreComponents(trackables)
        resolve(true)
      })
    } catch (e) {
      console.error(e);
    }
  })
}
```

**Step 2: Test manually**

1. Start app: `npm run dev`
2. Open console, look for: `[BackupScheduler] Initializing...`
3. Check IndexedDB (DevTools → Application → IndexedDB → nomie-auto-backups)
4. Should see first daily backup created

**Step 3: Commit**

```bash
git add src/BootStore.ts
git commit -m "feat(backup): integrate BackupScheduler into app startup"
```

---

## Phase 3: Rotation Logic

### Task 5: Implement Backup Rotation

**Files:**
- Modify: `src/domains/backup/AutoBackupService.ts`

**Step 1: Implement rotateBackups method**

Replace the placeholder `rotateBackups()` method with:

```typescript
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
      const sorted = dayBackups.sort((a, b) => b.timestamp - a.timestamp)
      toKeep.push(sorted[0])
    }
    // Days >30 are not kept (will be deleted)
  })

  // Delete backups not in toKeep list
  const toDelete = backups.filter(b => !toKeep.some(keep => keep.id === b.id))

  for (const backup of toDelete) {
    console.log(`[AutoBackup] Rotating out old backup: ${backup.id}`)
    await this.deleteBackup(backup.id)
  }

  if (toDelete.length > 0) {
    console.log(`[AutoBackup] Rotation complete: kept ${toKeep.length}, deleted ${toDelete.length}`)
  }
}
```

**Step 2: Test rotation logic**

Manual test in console:

```javascript
// Create test backups with different ages
const service = (await import('./src/domains/backup/AutoBackupService')).AutoBackupService
const storage = (await import('./src/domains/backup/auto-backup-storage')).autoBackupStorage

// Create old backups (simulate days 1-35)
for (let daysAgo = 1; daysAgo <= 35; daysAgo++) {
  const timestamp = Date.now() - (daysAgo * 24 * 60 * 60 * 1000)
  await storage.save({
    id: `test-backup-day-${daysAgo}`,
    timestamp,
    type: 'daily',
    data: { test: true },
    size: 1024,
    dataHash: `hash-${daysAgo}`,
    version: '6.0.0'
  })
}

// Run rotation
await service.rotateBackups()

// Check results
const remaining = await service.listBackups()
console.log('Remaining backups:', remaining.length) // Should be ~30
```

**Step 3: Commit**

```bash
git add src/domains/backup/AutoBackupService.ts
git commit -m "feat(backup): implement 30-day rotation logic"
```

---

## Phase 4: UI Components

### Task 6: Create Auto-Backup Settings UI

**Files:**
- Create: `src/domains/backup/auto-backup-ui.svelte`

**Step 1: Create backup list UI component**

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { AutoBackupService } from './AutoBackupService'
  import type { AutoBackup } from './auto-backup-storage'
  import dayjs from 'dayjs'
  import relativeTime from 'dayjs/plugin/relativeTime'
  import { Interact } from '../../store/interact'

  dayjs.extend(relativeTime)

  let backups: AutoBackup[] = []
  let storageUsage = 0
  let loading = true

  async function loadBackups() {
    loading = true
    try {
      backups = await AutoBackupService.listBackups()
      storageUsage = await AutoBackupService.getStorageUsage()
    } catch (error) {
      console.error('Failed to load backups:', error)
      Interact.error('Failed to load auto-backups')
    } finally {
      loading = false
    }
  }

  async function downloadBackup(backup: AutoBackup) {
    try {
      const blob = new Blob([JSON.stringify(backup.data, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${backup.id}.json`
      a.click()
      URL.revokeObjectURL(url)

      Interact.toast('Backup downloaded')
    } catch (error) {
      console.error('Failed to download backup:', error)
      Interact.error('Failed to download backup')
    }
  }

  async function deleteBackup(backup: AutoBackup) {
    const confirmed = await Interact.confirm(
      'Delete Backup',
      `Delete backup from ${dayjs(backup.timestamp).format('MMM D, YYYY h:mm A')}?`
    )

    if (confirmed) {
      try {
        await AutoBackupService.deleteBackup(backup.id)
        await loadBackups()
        Interact.toast('Backup deleted')
      } catch (error) {
        console.error('Failed to delete backup:', error)
        Interact.error('Failed to delete backup')
      }
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  }

  onMount(() => {
    loadBackups()
  })
</script>

<div class="auto-backup-ui">
  <header class="status-card">
    <h3>Auto-Backup Status</h3>
    {#if loading}
      <p>Loading...</p>
    {:else}
      <div class="status-info">
        <div class="stat">
          <span class="label">Backups:</span>
          <span class="value">{backups.length} stored</span>
        </div>
        <div class="stat">
          <span class="label">Storage:</span>
          <span class="value">{formatSize(storageUsage)}</span>
        </div>
        {#if backups.length > 0}
          <div class="stat">
            <span class="label">Last backup:</span>
            <span class="value">{dayjs(backups[0].timestamp).fromNow()} ({backups[0].type})</span>
          </div>
        {/if}
      </div>
    {/if}
  </header>

  {#if !loading && backups.length > 0}
    <div class="backup-list">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Size</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each backups as backup}
            <tr>
              <td>{dayjs(backup.timestamp).format('MMM D, YYYY h:mm A')}</td>
              <td>
                <span class="badge badge-{backup.type}">
                  {backup.type}
                </span>
              </td>
              <td>{formatSize(backup.size)}</td>
              <td class="actions">
                <button class="btn-small" on:click={() => downloadBackup(backup)}>
                  Download
                </button>
                <button class="btn-small btn-danger" on:click={() => deleteBackup(backup)}>
                  Delete
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if !loading}
    <p class="empty-state">No auto-backups yet. Backups are created daily and when you close the app.</p>
  {/if}
</div>

<style>
  .auto-backup-ui {
    padding: 1rem;
  }

  .status-card {
    background: var(--color-solid);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .status-card h3 {
    margin: 0 0 1rem 0;
  }

  .status-info {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat .label {
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .stat .value {
    font-weight: 600;
  }

  .backup-list {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--color-divider);
  }

  th {
    font-weight: 600;
    opacity: 0.7;
    font-size: 0.875rem;
  }

  .badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge-daily {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  .badge-close {
    background: var(--color-secondary-light);
    color: var(--color-secondary);
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-small {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
  }

  .btn-danger {
    background: var(--color-red);
    color: white;
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    opacity: 0.7;
  }
</style>
```

**Step 2: Commit**

```bash
git add src/domains/backup/auto-backup-ui.svelte
git commit -m "feat(backup): add auto-backup UI component"
```

---

### Task 7: Add Auto-Backup UI to Settings

**Files:**
- Modify: `src/domains/settings/settings-data-list.svelte`

**Step 1: Import and add auto-backup section**

Find the data settings section and add:

```svelte
<script>
  // Add import
  import AutoBackupUI from '../backup/auto-backup-ui.svelte'

  // ... existing code ...
</script>

<!-- Add section after existing backup/export section -->
<div class="n-list">
  <div class="n-item">
    <div class="title">Auto-Backups</div>
    <div class="description">Automatic daily backups and backups on close</div>
  </div>

  <AutoBackupUI />
</div>
```

**Step 2: Test UI**

1. Start app: `npm run dev`
2. Go to Settings → Data
3. Should see "Auto-Backups" section
4. Should see list of backups with Download/Delete buttons

**Step 3: Commit**

```bash
git add src/domains/settings/settings-data-list.svelte
git commit -m "feat(backup): integrate auto-backup UI into settings"
```

---

## Phase 5: Error Handling & Polish

### Task 8: Add Error Tracking and Retry Logic

**Files:**
- Modify: `src/domains/backup/AutoBackupService.ts`

**Step 1: Add error tracking**

Add at top of AutoBackupServiceClass:

```typescript
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
    if (!stored) {
      return {
        lastAttempt: 0,
        lastSuccess: 0,
        failureCount: 0,
        lastError: ''
      }
    }
    return JSON.parse(stored)
  }

  private setStatus(status: BackupStatus): void {
    localStorage.setItem(this.STATUS_KEY, JSON.stringify(status))
  }

  async createBackup(type: 'daily' | 'close', isRetry = false): Promise<void> {
    const status = this.getStatus()
    status.lastAttempt = Date.now()

    try {
      // ... existing createBackup logic ...

      // On success, update status
      status.lastSuccess = Date.now()
      status.failureCount = 0
      status.lastError = ''
      this.setStatus(status)

      console.log(`[AutoBackup] Created ${type} backup: ${backup.id}`)
      await this.rotateBackups()

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[AutoBackup] Failed to create backup:', error)

      status.failureCount++
      status.lastError = errorMsg
      this.setStatus(status)

      // Check if quota exceeded
      if (errorMsg.includes('quota') || errorMsg.includes('QuotaExceededError')) {
        console.log('[AutoBackup] Quota exceeded, attempting to free space')
        await this.freeSpace()

        // Retry once
        if (!isRetry) {
          console.log('[AutoBackup] Retrying after freeing space')
          await this.createBackup(type, true)
          return
        }
      }

      // Retry once for other errors
      if (!isRetry && status.failureCount < this.MAX_RETRIES) {
        console.log('[AutoBackup] Retrying backup after 30 seconds')
        setTimeout(() => {
          this.createBackup(type, true)
        }, 30000)
      }

      throw error
    }
  }

  private async freeSpace(): Promise<void> {
    const backups = await this.listBackups()
    const toDelete = backups
      .sort((a, b) => a.timestamp - b.timestamp) // Oldest first
      .slice(0, 5) // Delete oldest 5

    console.log(`[AutoBackup] Deleting ${toDelete.length} oldest backups to free space`)

    for (const backup of toDelete) {
      await this.deleteBackup(backup.id)
    }
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
```

**Step 2: Commit**

```bash
git add src/domains/backup/AutoBackupService.ts
git commit -m "feat(backup): add error tracking and retry logic"
```

---

### Task 9: Add Restore Functionality

**Files:**
- Modify: `src/domains/backup/AutoBackupService.ts`
- Modify: `src/domains/backup/auto-backup-ui.svelte`

**Step 1: Add restore method to service**

In AutoBackupService.ts, add:

```typescript
async restoreBackup(backupId: string): Promise<void> {
  const backup = await autoBackupStorage.get(backupId)
  if (!backup) {
    throw new Error(`Backup ${backupId} not found`)
  }

  // Create safety backup before restore
  const safetyBackupId = `pre-restore-safety-${Date.now()}`
  console.log(`[AutoBackup] Creating safety backup: ${safetyBackupId}`)

  try {
    await this.createBackup('daily') // Use 'daily' type for safety backups

    // Rename the backup to mark it as safety
    const safetyBackup = (await this.listBackups())[0]
    await autoBackupStorage.delete(safetyBackup.id)
    safetyBackup.id = safetyBackupId
    await autoBackupStorage.save(safetyBackup)
  } catch (error) {
    console.error('[AutoBackup] Failed to create safety backup:', error)
    throw new Error('Could not create safety backup before restore')
  }

  // Import the backup data
  const { importStorageArchive } = await import('../storage/import-export')

  try {
    console.log(`[AutoBackup] Restoring backup: ${backupId}`)
    await importStorageArchive(backup.data, false) // false = replace, don't merge

    console.log('[AutoBackup] Restore complete, reloading app')
    // Reload page to reinitialize app
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  } catch (error) {
    console.error('[AutoBackup] Restore failed:', error)
    throw new Error('Restore failed. Safety backup preserved.')
  }
}

async getBackupPreview(backupId: string): Promise<{
  trackerCount: number
  logCount: number
  bookCount: number
  peopleCount: number
  boardCount: number
}> {
  const backup = await autoBackupStorage.get(backupId)
  if (!backup) {
    throw new Error(`Backup ${backupId} not found`)
  }

  const files = backup.data.files || {}

  return {
    trackerCount: files['trackers.json'] ? Object.keys(files['trackers.json']).length : 0,
    logCount: Object.keys(files).filter(k => k.startsWith('data/books/')).reduce((total, key) => {
      const book = files[key]
      return total + (book?.data?.length || 0)
    }, 0),
    bookCount: Object.keys(files).filter(k => k.startsWith('data/books/') && !k.endsWith('_last')).length,
    peopleCount: files['people.json'] ? Object.keys(files['people.json']).length : 0,
    boardCount: files['boards.json'] ? (files['boards.json'].length || 0) : 0
  }
}
```

**Step 2: Add restore UI to component**

In auto-backup-ui.svelte, add preview and restore functions:

```svelte
<script lang="ts">
  // ... existing imports ...

  async function previewBackup(backup: AutoBackup) {
    try {
      const preview = await AutoBackupService.getBackupPreview(backup.id)

      const message = `
Backup from: ${dayjs(backup.timestamp).format('MMM D, YYYY h:mm A')}

Contents:
• Trackers: ${preview.trackerCount}
• Log Entries: ${preview.logCount}
• Books: ${preview.bookCount}
• People: ${preview.peopleCount}
• Boards: ${preview.boardCount}

Size: ${formatSize(backup.size)}
      `.trim()

      await Interact.alert('Backup Preview', message)
    } catch (error) {
      console.error('Failed to preview backup:', error)
      Interact.error('Failed to preview backup')
    }
  }

  async function restoreBackup(backup: AutoBackup) {
    const confirmed = await Interact.confirm(
      '⚠️ Restore Backup',
      `This will replace ALL current data with backup from ${dayjs(backup.timestamp).format('MMM D, YYYY h:mm A')}.\n\nA safety backup of current data will be created first.\n\nContinue?`,
      'Yes, Restore Backup'
    )

    if (!confirmed) return

    try {
      Interact.blocker('Creating safety backup...')
      await AutoBackupService.restoreBackup(backup.id)
      // Page will reload after restore
    } catch (error) {
      Interact.stopBlocker()
      console.error('Failed to restore backup:', error)
      Interact.error('Failed to restore backup: ' + error.message)
    }
  }
</script>

<!-- Update actions column in table -->
<td class="actions">
  <button class="btn-small" on:click={() => previewBackup(backup)}>
    Preview
  </button>
  <button class="btn-small" on:click={() => restoreBackup(backup)}>
    Restore
  </button>
  <button class="btn-small" on:click={() => downloadBackup(backup)}>
    Download
  </button>
  <button class="btn-small btn-danger" on:click={() => deleteBackup(backup)}>
    Delete
  </button>
</td>
```

**Step 3: Test restore flow**

1. Go to Settings → Data → Auto-Backups
2. Click "Preview" on a backup - should show counts
3. Click "Restore" - should show confirmation
4. Confirm - should see "Creating safety backup..." then reload

**Step 4: Commit**

```bash
git add src/domains/backup/AutoBackupService.ts src/domains/backup/auto-backup-ui.svelte
git commit -m "feat(backup): add backup restore with safety backup"
```

---

### Task 10: Add Settings Toggles

**Files:**
- Create: `src/domains/backup/auto-backup-settings.ts`
- Modify: `src/domains/backup/auto-backup-ui.svelte`

**Step 1: Create settings store**

```typescript
import { writable } from 'svelte/store'

interface AutoBackupSettings {
  dailyEnabled: boolean
  closeEnabled: boolean
}

const SETTINGS_KEY = 'auto-backup-settings'

function createAutoBackupSettings() {
  const defaultSettings: AutoBackupSettings = {
    dailyEnabled: true,
    closeEnabled: true
  }

  const stored = localStorage.getItem(SETTINGS_KEY)
  const initial = stored ? JSON.parse(stored) : defaultSettings

  const { subscribe, set, update } = writable<AutoBackupSettings>(initial)

  return {
    subscribe,
    setDailyEnabled: (enabled: boolean) => {
      update(s => {
        s.dailyEnabled = enabled
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
        return s
      })
    },
    setCloseEnabled: (enabled: boolean) => {
      update(s => {
        s.closeEnabled = enabled
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
        return s
      })
    }
  }
}

export const autoBackupSettings = createAutoBackupSettings()
```

**Step 2: Update BackupScheduler to check settings**

In BackupScheduler.ts, modify to check settings:

```typescript
import { get } from 'svelte/store'
import { autoBackupSettings } from './auto-backup-settings'

// In checkDailyBackup():
private async checkDailyBackup(): Promise<void> {
  const settings = get(autoBackupSettings)
  if (!settings.dailyEnabled) {
    console.log('[BackupScheduler] Daily backups disabled')
    return
  }
  // ... rest of existing logic ...
}

// In setupCloseHandler():
private setupCloseHandler(): void {
  window.addEventListener('beforeunload', () => {
    const settings = get(autoBackupSettings)
    if (!settings.closeEnabled) {
      console.log('[BackupScheduler] Close backups disabled')
      return
    }
    // ... rest of existing logic ...
  })
  // ... rest of existing logic ...
}
```

**Step 3: Add toggles to UI**

In auto-backup-ui.svelte, add toggles:

```svelte
<script lang="ts">
  import { autoBackupSettings } from './auto-backup-settings'
  import ToggleSwitch from '../../components/toggle-switch/toggle-switch.svelte'

  // ... existing code ...
</script>

<div class="auto-backup-ui">
  <header class="status-card">
    <!-- ... existing status info ... -->
  </header>

  <div class="settings-section">
    <h4>Settings</h4>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Enable daily backups</strong>
        <p class="description">Create automatic backup once per day</p>
      </div>
      <ToggleSwitch
        value={$autoBackupSettings.dailyEnabled}
        on:change={(e) => autoBackupSettings.setDailyEnabled(e.detail)}
      />
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Enable backups on close</strong>
        <p class="description">Create backup when closing the app</p>
      </div>
      <ToggleSwitch
        value={$autoBackupSettings.closeEnabled}
        on:change={(e) => autoBackupSettings.setCloseEnabled(e.detail)}
      />
    </div>
  </div>

  <!-- ... rest of existing UI ... -->
</div>

<style>
  /* ... existing styles ... */

  .settings-section {
    background: var(--color-solid);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .settings-section h4 {
    margin: 0 0 1rem 0;
  }

  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--color-divider);
  }

  .setting-row:last-child {
    border-bottom: none;
  }

  .setting-label p.description {
    margin: 0.25rem 0 0 0;
    font-size: 0.875rem;
    opacity: 0.7;
  }
</style>
```

**Step 4: Commit**

```bash
git add src/domains/backup/auto-backup-settings.ts src/domains/backup/BackupScheduler.ts src/domains/backup/auto-backup-ui.svelte
git commit -m "feat(backup): add settings toggles for daily and close backups"
```

---

### Task 11: Final Testing and Documentation

**Step 1: Create end-to-end test script**

Save as `test-auto-backup.md`:

```markdown
# Auto-Backup System Test Plan

## Setup
1. Clear all existing auto-backups: IndexedDB → nomie-auto-backups → Delete Database
2. Clear localStorage keys: auto-backup-*, migration:*
3. Reload app

## Test 1: First Daily Backup
1. Open app
2. Check console for: `[BackupScheduler] No previous daily backup found, creating first backup`
3. Open IndexedDB → nomie-auto-backups → backups
4. Should see 1 backup with type='daily'

## Test 2: Daily Backup Skipped (Within 24h)
1. Reload app
2. Check console for: `[BackupScheduler] Next daily backup in ~24 hours`
3. IndexedDB should still have 1 backup

## Test 3: Close Backup
1. Close browser tab
2. Reopen app
3. Check console for: `[BackupScheduler] Pending close backup detected`
4. IndexedDB should have 2 backups (1 daily, 1 close)

## Test 4: Deduplication
1. Close and reopen app 3 times without making changes
2. Check console for: `[AutoBackup] Skipping close backup - no changes detected`
3. Should still have 2 backups (not 5)

## Test 5: UI Display
1. Go to Settings → Data → Auto-Backups
2. Should see:
   - Status card showing last backup time
   - List of 2 backups
   - Each backup has Preview, Restore, Download, Delete buttons

## Test 6: Download Backup
1. Click Download on a backup
2. Should download JSON file
3. Open file - should contain version, created, files structure

## Test 7: Preview Backup
1. Click Preview on a backup
2. Should show modal with counts (trackers, logs, etc.)

## Test 8: Delete Backup
1. Click Delete on a backup
2. Confirm deletion
3. Backup should be removed from list

## Test 9: Restore Backup
1. Create new tracker in app
2. Note current tracker count
3. Click Restore on older backup
4. Confirm restoration
5. Should see "Creating safety backup..." then reload
6. After reload, new tracker should be gone (restored to old state)
7. Check backups list - should see "pre-restore-safety" backup

## Test 10: Settings Toggles
1. Go to Settings → Data → Auto-Backups
2. Disable "Enable daily backups"
3. Reload app
4. Check console - should NOT create daily backup
5. Re-enable toggle
6. Reload app
7. Should create daily backup

## Test 11: Rotation (Simulated)
Run in console:
```javascript
const service = (await import('./src/domains/backup/AutoBackupService')).AutoBackupService
const storage = (await import('./src/domains/backup/auto-backup-storage')).autoBackupStorage

// Create 35 days of backups
for (let i = 1; i <= 35; i++) {
  const timestamp = Date.now() - (i * 24 * 60 * 60 * 1000)
  await storage.save({
    id: `test-day-${i}`,
    timestamp,
    type: 'daily',
    data: { test: true },
    size: 1024,
    dataHash: `hash-${i}`,
    version: '6.0.0'
  })
}

// Run rotation
await service.rotateBackups()

// Check results
const backups = await service.listBackups()
console.log('Backups after rotation:', backups.length) // Should be ~30
```

12. Refresh Settings page
13. Should see ~30 backups (days 1-30)
14. Days 31-35 should be deleted

## Success Criteria
✅ Daily backups created automatically
✅ Close backups created on browser close
✅ Deduplication prevents duplicate backups
✅ Rotation keeps 30 most recent
✅ UI displays all backups correctly
✅ Preview shows backup contents
✅ Download exports backup as JSON
✅ Restore works and creates safety backup
✅ Settings toggles enable/disable backups
```

**Step 2: Update main README**

Add to project README:

```markdown
## Auto-Backup System

Nomie automatically backs up your data:
- **Daily**: Once per day when you open the app
- **On Close**: When you close the browser

Backups are stored in your browser (IndexedDB) and kept for 30 days.

### Managing Backups

Go to **Settings → Data → Auto-Backups** to:
- View all automatic backups
- Preview backup contents
- Restore from any backup
- Download backups to your computer
- Enable/disable automatic backups

### Safety Features

- **Smart deduplication**: Skips backup if data hasn't changed
- **30-day retention**: Keeps last 30 days of backups automatically
- **Safety backups**: Creates emergency backup before restoring

### Recovering Data

If you lose data:
1. Go to Settings → Data → Auto-Backups
2. Find the most recent backup before data loss
3. Click "Preview" to verify it has your data
4. Click "Restore" to recover
```

**Step 3: Run test plan**

Execute all tests in `test-auto-backup.md` and verify they pass.

**Step 4: Final commit**

```bash
git add test-auto-backup.md README.md
git commit -m "docs: add auto-backup testing plan and README section"
```

---

## Completion Checklist

- [ ] IndexedDB storage created and tested
- [ ] AutoBackupService creates backups
- [ ] BackupScheduler triggers daily and close backups
- [ ] Rotation keeps 30 most recent backups
- [ ] UI displays backups in Settings
- [ ] Preview shows backup contents
- [ ] Download exports backup as JSON
- [ ] Restore functionality with safety backup
- [ ] Settings toggles enable/disable backups
- [ ] Error tracking and retry logic
- [ ] All tests pass
- [ ] Documentation updated

## Next Steps

After implementation:
1. Monitor auto-backup performance in production
2. Gather user feedback on retention policy
3. Consider adding compression for large backups
4. Consider cloud sync option (future enhancement)
