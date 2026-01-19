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
