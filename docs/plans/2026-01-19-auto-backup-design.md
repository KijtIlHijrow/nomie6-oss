# Auto-Backup System Design

**Date:** 2026-01-19
**Status:** Design Complete - Ready for Implementation

## Overview

Implement automatic backup system to prevent data loss events. System will create automatic backups on both daily schedule and app close, storing them in IndexedDB with 30-day retention.

## Problem Statement

Recent data loss incident (trackers deleted, auto-compaction removed history) highlighted need for automatic backup protection. Current manual backup requires user action and is easily forgotten.

## Requirements

1. **Automatic triggers**: Daily + on browser close
2. **Storage**: IndexedDB for auto-backups, Downloads for manual exports
3. **Retention**: Keep 30 most recent backups with smart rotation
4. **UI**: Full management interface in Settings
5. **Silent operation**: No user interruption during auto-backup
6. **Recovery**: Easy restore with safety checks

## Architecture

### Storage Layer

**IndexedDB Database: `nomie-auto-backups`**

```typescript
interface AutoBackup {
  id: string;                    // e.g., "backup-2026-01-19-14-30-close"
  timestamp: number;              // Unix timestamp
  type: 'daily' | 'close';       // Trigger type
  data: N6StorageExport;         // Full export data (same as manual backup)
  size: number;                  // Bytes
  dataHash: string;              // MD5 hash for deduplication
  version: string;               // App version
}
```

**Storage Location**
- Auto-backups → IndexedDB (`nomie-auto-backups` database)
- Manual backups → Downloads folder (existing behaviour)

### Core Components

**1. AutoBackupService** (`src/domains/backup/AutoBackupService.ts`)

Main service handling backup operations:

```typescript
class AutoBackupService {
  // Backup operations
  async createBackup(type: 'daily' | 'close'): Promise<void>
  async listBackups(): Promise<AutoBackup[]>
  async restoreBackup(backupId: string): Promise<void>
  async deleteBackup(backupId: string): Promise<void>
  async downloadBackup(backupId: string): Promise<void>

  // Rotation & maintenance
  async rotateBackups(): Promise<void>
  async getStorageUsage(): Promise<number>

  // Deduplication
  private async calculateDataHash(data: any): Promise<string>
  private async shouldSkipBackup(): Promise<boolean>
}
```

**2. BackupScheduler** (`src/domains/backup/BackupScheduler.ts`)

Manages automatic backup triggers:

```typescript
class BackupScheduler {
  // Initialize triggers
  init(): void {
    this.setupDailyCheck()
    this.setupCloseHandler()
  }

  // Daily backup check (on app startup)
  private async setupDailyCheck(): Promise<void>

  // Close backup handler
  private setupCloseHandler(): void {
    window.addEventListener('beforeunload', async (e) => {
      await AutoBackupService.createBackup('close')
    })
  }
}
```

**3. AutoBackupUI** (`src/domains/backup/auto-backup-ui.svelte`)

Settings UI component showing backup management interface.

## Backup Triggers

### Daily Trigger

**When**: On app startup
**Condition**: Last daily backup is >24 hours old
**Process**:
1. Check `last-daily-backup` timestamp in localStorage
2. If >24h old, create backup
3. Update timestamp
4. Run rotation

### Close Trigger

**When**: Browser `beforeunload` event
**Condition**: App is closing/navigating away
**Process**:
1. Capture event
2. Create backup (must be synchronous for `beforeunload`)
3. Update timestamp
4. Run rotation

### Smart Deduplication

Before creating backup:
1. Calculate MD5 hash of current data
2. Compare with last backup hash
3. Skip if identical (no changes since last backup)

This prevents duplicate backups when app is opened/closed multiple times without data changes.

## Rotation Strategy

**Goal**: Keep 30 most recent backups with intelligent prioritization

**Rules**:
1. **Keep all**: Backups from last 7 days (full granularity)
2. **Keep daily**: Days 8-30 keep newest backup per day
3. **Delete oldest**: When >30 backups, remove oldest first

**Example Timeline**:
- Day 1: 5 close backups + 1 daily → All 6 kept
- Day 5: Still all kept (within 7 days)
- Day 10: Day 1 backups reduced to 1 (newest of that day)
- Day 35: Day 5 backups removed (>30 days old)

**Implementation**:

```typescript
async rotateBackups() {
  const backups = await this.listBackups()
  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000

  // Group by day
  const byDay = new Map<string, AutoBackup[]>()
  backups.forEach(backup => {
    const day = new Date(backup.timestamp).toISOString().split('T')[0]
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day).push(backup)
  })

  const toKeep: AutoBackup[] = []

  byDay.forEach((dayBackups, day) => {
    const dayAge = (now - new Date(day).getTime()) / DAY

    if (dayAge <= 7) {
      // Keep all from last 7 days
      toKeep.push(...dayBackups)
    } else if (dayAge <= 30) {
      // Keep newest from each day 8-30
      const newest = dayBackups.sort((a, b) => b.timestamp - a.timestamp)[0]
      toKeep.push(newest)
    }
    // Days >30 are not kept
  })

  // Delete backups not in toKeep list
  const toDelete = backups.filter(b => !toKeep.includes(b))
  for (const backup of toDelete) {
    await this.deleteBackup(backup.id)
  }
}
```

## Error Handling

### Backup Failures

**Silent Operation**: Auto-backups never show error dialogs to user.

**Failure Tracking**:

```typescript
interface BackupStatus {
  lastAttempt: number;
  lastSuccess: number;
  failureCount: number;
  lastError: string;
}
```

Stored in localStorage: `auto-backup-status`

**Retry Logic**:
1. First failure: Retry after 30 seconds
2. Second failure: Log error, increment counter
3. Third consecutive failure: Show warning badge in Settings

**Quota Exceeded**:
If IndexedDB quota exceeded during backup:
1. Delete oldest 5 backups
2. Retry backup creation
3. If still fails, disable auto-backup and notify user in Settings

### Restore Failures

**Pre-restore Safety**:
1. Create emergency backup of current state
2. Label as `pre-restore-safety-<timestamp>`
3. Never auto-delete safety backups

**Restore Process**:
1. Show preview modal with backup contents
2. Confirm with warning about data overwrite
3. Create safety backup
4. Import backup data (reuse `importStorage()`)
5. Reload page

**Rollback**: If restore fails, user can restore the safety backup.

## UI Design

### Settings Location

**Settings → Data → Auto-Backup** (new section)

### Components

**1. Status Card**

```
┌─────────────────────────────────────┐
│ Auto-Backup Status                  │
├─────────────────────────────────────┤
│ ✓ Last backup: 2 minutes ago (close)│
│ 📦 Stored: 24 backups (45.2 MB)     │
│ 🔄 Next daily: in 22 hours          │
│                                     │
│ [⚙️ Settings] [📋 View All Backups] │
└─────────────────────────────────────┘
```

**2. Backup List Table**

```
┌──────────────────────────────────────────────────────────┐
│ Auto-Backups (24)                     Storage: 45.2/100MB│
├────────────┬───────┬────────┬─────────────────────────────┤
│ Date       │ Type  │ Size   │ Actions                     │
├────────────┼───────┼────────┼─────────────────────────────┤
│ 2 min ago  │ Close │ 1.8 MB │ [Preview] [Restore] [Download]│
│ Today 9am  │ Daily │ 1.8 MB │ [Preview] [Restore] [Download]│
│ Yesterday  │ Close │ 1.7 MB │ [Preview] [Restore] [Download]│
│ ...        │       │        │                             │
└────────────┴───────┴────────┴─────────────────────────────┘
```

**3. Settings Toggles**

```
☑ Enable daily backups
☑ Enable backups on close
☐ Confirm before close backup (adds delay)
```

**4. Storage Gauge**

```
Auto-Backup Storage
[████████░░░░░░░░░░] 45.2 MB / 100 MB
30 backups retained
```

### Modals

**Preview Modal**:
```
┌─────────────────────────────────────┐
│ Backup Preview                      │
│ Created: 2026-01-19 14:30           │
├─────────────────────────────────────┤
│ Trackers: 72                        │
│ Log Entries: 1,245                  │
│ Books: 2 (Jan 2026, Dec 2025)       │
│ People: 0                           │
│ Boards: 3                           │
│                                     │
│ [Cancel] [Restore This Backup]      │
└─────────────────────────────────────┘
```

**Restore Confirmation**:
```
┌─────────────────────────────────────┐
│ ⚠️  Restore Backup                   │
├─────────────────────────────────────┤
│ This will replace ALL current data  │
│ with backup from 2 hours ago.       │
│                                     │
│ A safety backup of current data     │
│ will be created first.              │
│                                     │
│ [Cancel] [Yes, Restore Backup]      │
└─────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Core Backup Service
1. Create `AutoBackupService.ts` with IndexedDB storage
2. Implement `createBackup()` method
3. Implement `listBackups()` and `deleteBackup()`
4. Add data hashing for deduplication

### Phase 2: Scheduling & Triggers
1. Create `BackupScheduler.ts`
2. Implement daily check logic
3. Add `beforeunload` handler for close trigger
4. Add localStorage tracking for last backup times

### Phase 3: Rotation Logic
1. Implement `rotateBackups()` method
2. Add tests for rotation scenarios
3. Handle quota exceeded errors

### Phase 4: UI Components
1. Create status card component
2. Create backup list table
3. Add settings toggles
4. Implement preview modal
5. Implement restore confirmation

### Phase 5: Error Handling & Polish
1. Add failure tracking
2. Implement retry logic
3. Add warning badges for failures
4. Create safety backup system
5. Add storage usage monitoring

## Testing Scenarios

1. **Daily backup**: Open app after 25 hours, verify daily backup created
2. **Close backup**: Close browser, reopen, verify close backup exists
3. **Deduplication**: Close/open without changes, verify no duplicate backup
4. **Rotation**: Create 35 backups over 35 days, verify only 30 kept with correct prioritization
5. **Quota exceeded**: Fill quota, verify oldest deleted and backup succeeds
6. **Restore**: Restore old backup, verify data matches and safety backup created
7. **Failure tracking**: Simulate 3 failures, verify warning badge appears

## Success Criteria

✅ Auto-backups created daily without user action
✅ Auto-backups created on browser close
✅ 30 most recent backups retained
✅ No duplicate backups when data unchanged
✅ Full UI for viewing and restoring backups
✅ Silent operation (no user interruption)
✅ Safety backup before restore
✅ Handles quota exceeded gracefully

## Future Enhancements

- Cloud backup sync (optional)
- Compress backups to save space
- Incremental backups (delta storage)
- Export multiple backups as archive
- Scheduled backups (hourly option)
