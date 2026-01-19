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
2. Check console for message showing hours until next backup (e.g., `[BackupScheduler] Next daily backup in ~23 hours`)
3. IndexedDB should still have 1 backup

## Test 3: Close Backup
1. Close browser tab
2. Reopen app
3. Check console for: `[BackupScheduler] Pending close backup detected, creating now`
4. IndexedDB should have 2 backups (1 daily, 1 close)

## Test 4: Deduplication
1. Note the current backup count
2. Close the browser tab (sets pending close backup flag)
3. Reopen the app (processes pending close backup)
4. Check console - should create the close backup
5. Close and reopen again WITHOUT making any data changes
6. Check console for: `[AutoBackup] Skipping close backup - no changes detected`
7. Backup count should only increase by 1 (from step 3), not 2

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
7. Check backups list - should see backup with ID starting with "pre-restore-safety-" followed by timestamp

## Test 10: Settings Toggles
1. Go to Settings → Data → Auto-Backups
2. Disable "Daily Backups" toggle
3. Reload app
4. Check console - should NOT create daily backup
5. Re-enable "Daily Backups" toggle
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
console.log('Backups after rotation:', backups.length) // Should be 30 (keeps last 30 days)
```

12. Refresh Settings page
13. Should see exactly 30 backups (days 1-30, since we created one per day)
14. Days 31-35 should be deleted by rotation

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
