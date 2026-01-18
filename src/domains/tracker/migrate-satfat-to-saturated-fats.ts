/**
 * One-time migration: Update all #satfat entries to use existing Saturated Fat tracker
 *
 * This script:
 * 1. Finds your existing "Saturated Fat" tracker
 * 2. Updates all log entries containing #satfat to use the correct tag
 * 3. Optionally removes the old satfat tracker
 */

import Storage from '../storage/storage'
import { TrackerStore } from './TrackerStore'
import { get } from 'svelte/store'

export async function migrateSatfatToSaturatedFat(): Promise<{
  success: boolean
  logsUpdated: number
  booksUpdated: number
  error?: string
}> {
  const migrationKey = 'migration:satfat-to-saturated-fat:v1'

  // Check if migration already ran
  const migrationComplete = localStorage.getItem(migrationKey)
  if (migrationComplete === 'true') {
    console.log('🔄 [MIGRATION] Satfat migration already completed, skipping')
    return { success: true, logsUpdated: 0, booksUpdated: 0 }
  }

  console.log('🔄 [MIGRATION] Starting satfat → Saturated Fat migration...')

  try {
    // Step 1: Get trackers from Storage (PouchDB: trackers.json)
    const trackersData = await Storage.get('trackers.json')
    const trackers = trackersData?.data || trackersData || {}
    console.log('🔄 [MIGRATION] Loaded trackers:', Object.keys(trackers).length)

    // Look for "Saturated Fat" tracker (case-insensitive search)
    let targetTracker = null
    let targetTag = null

    for (const tag in trackers) {
      const tracker = trackers[tag]
      const label = (tracker.label || '').toLowerCase()

      if (label.includes('saturated fat')) {
        targetTracker = tracker
        targetTag = tag
        console.log(`🔄 [MIGRATION] Found target tracker: #${targetTag} (${tracker.label})`)
        break
      }
    }

    if (!targetTracker || !targetTag) {
      const error = 'Could not find "Saturated Fat" tracker. Available trackers:'
      console.error('🔄 [MIGRATION] ❌', error)
      for (const tag in trackers) {
        console.log(`  - #${tag}: ${trackers[tag].label}`)
      }
      return { success: false, logsUpdated: 0, booksUpdated: 0, error }
    }

    // Step 2: Get all book document IDs (PouchDB: data/books/*)
    const allKeys = await Storage.list()
    const bookKeys = allKeys.filter((key: string) =>
      key.startsWith('data/books/') && !key.endsWith('_last')
    )

    console.log(`🔄 [MIGRATION] Found ${bookKeys.length} books to scan`)

    let logsUpdated = 0
    let booksUpdated = 0

    // Step 3: Process each book
    for (const bookKey of bookKeys) {
      const bookDoc = await Storage.get(bookKey)

      if (!bookDoc || !bookDoc.data || !Array.isArray(bookDoc.data)) {
        console.log(`🔄 [MIGRATION] Skipping ${bookKey} (invalid format)`)
        continue
      }

      let bookModified = false

      // Check each log in the book
      for (const log of bookDoc.data) {
        if (log.note && log.note.includes('#satfat')) {
          const oldNote = log.note
          log.note = log.note.replace(/#satfat\b/g, `#${targetTag}`)

          console.log(`🔄 [MIGRATION] Updated log:`)
          console.log(`  Old: ${oldNote}`)
          console.log(`  New: ${log.note}`)

          bookModified = true
          logsUpdated++
        }
      }

      // Save the book if it was modified
      if (bookModified) {
        await Storage.put(bookKey, bookDoc)
        booksUpdated++
        console.log(`🔄 [MIGRATION] ✓ Saved ${bookKey}`)
      }
    }

    console.log(`🔄 [MIGRATION] ✅ Migration complete!`)
    console.log(`🔄 [MIGRATION]   - Updated ${logsUpdated} log entries`)
    console.log(`🔄 [MIGRATION]   - Modified ${booksUpdated} books`)

    // Mark migration as complete
    localStorage.setItem(migrationKey, 'true')

    return { success: true, logsUpdated, booksUpdated }

  } catch (error) {
    console.error('🔄 [MIGRATION] ❌ Migration failed:', error)
    return {
      success: false,
      logsUpdated: 0,
      booksUpdated: 0,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Delete the old satfat tracker after migration is complete
 */
export async function deleteOldSatfatTracker(): Promise<boolean> {
  try {
    const trackers = get(TrackerStore)

    if (trackers['satfat']) {
      console.log('🗑️ [CLEANUP] Removing old satfat tracker...')
      await TrackerStore.deleteItem('satfat')
      console.log('🗑️ [CLEANUP] ✅ Old satfat tracker removed')
      return true
    } else {
      console.log('🗑️ [CLEANUP] Old satfat tracker not found, nothing to remove')
      return false
    }
  } catch (error) {
    console.error('🗑️ [CLEANUP] ❌ Failed to remove old satfat tracker:', error)
    return false
  }
}
