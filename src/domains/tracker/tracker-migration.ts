/**
 * Tracker Migration Utilities
 * One-time migrations to update existing tracker data
 */

import TrackerClass from '../../modules/tracker/TrackerClass'
import { TrackerStore, getOrCreate } from './TrackerStore'
import { get } from 'svelte/store'

/**
 * Migrate nutrition tracker references in existing product trackers
 *
 * This migration updates product trackers that have hardcoded nutrition tags
 * (e.g., #carbs, #fat) to use the correct resolved tags based on alias matching
 * (e.g., #carbohydrates, #fats).
 *
 * Runs once on app startup if not already run.
 */
export async function migrateNutritionTrackerReferences(): Promise<void> {
  const migrationKey = 'migration:nutrition-tracker-refs:v1'

  // Check if migration already ran
  const migrationComplete = localStorage.getItem(migrationKey)
  if (migrationComplete === 'true') {
    console.log('🔄 [MIGRATION] Nutrition tracker migration already completed, skipping')
    return
  }

  console.log('🔄 [MIGRATION] Starting nutrition tracker reference migration...')

  try {
    // Get all current trackers
    const trackers = get(TrackerStore)

    // Nutrition tag patterns to look for
    const nutritionTags = ['calories', 'protein', 'carbs', 'fat', 'sodium']
    const nutritionTagPattern = new RegExp(`#(${nutritionTags.join('|')})\\(`, 'g')

    let updatedCount = 0
    const trackersToUpdate: TrackerClass[] = []

    // Find all trackers with nutrition includes
    for (const tag in trackers) {
      const tracker = trackers[tag]

      // Skip if no include string
      if (!tracker.include || typeof tracker.include !== 'string') {
        continue
      }

      // Check if include has any nutrition tags
      if (!nutritionTagPattern.test(tracker.include)) {
        continue
      }

      console.log(`🔄 [MIGRATION] Found tracker with nutrition tags: ${tracker.tag}`)
      console.log(`🔄 [MIGRATION] Current include: ${tracker.include}`)

      // Build mapping of current tag → resolved tag
      const resolvedTags: Record<string, string> = {}

      for (const nutritionTag of nutritionTags) {
        // Check if this tag is used in the include string
        if (tracker.include.includes(`#${nutritionTag}(`)) {
          // Use getOrCreate to find the correct tracker (might be similar name)
          const result = await getOrCreate(nutritionTag, {
            label: nutritionTag.charAt(0).toUpperCase() + nutritionTag.slice(1),
            type: 'value' as const,
            math: 'sum' as const,
          })

          // If fuzzy matching found similar trackers, auto-select the best match
          if (result.requiresConfirmation && result.matches && result.matches.length > 0) {
            // Pick the highest confidence match (first one, already sorted)
            const bestMatch = result.matches[0]
            resolvedTags[nutritionTag] = bestMatch.tracker.tag
            console.log(`🔄 [MIGRATION]   ${nutritionTag} → ${bestMatch.tracker.tag} (matched ${Math.round(bestMatch.confidence * 100)}%)`)
          } else {
            // Use the returned tracker (either exact match or newly created)
            resolvedTags[nutritionTag] = result.tracker.tag
            console.log(`🔄 [MIGRATION]   ${nutritionTag} → ${result.tracker.tag}${result.usedExisting ? ' (existing)' : ' (new)'}`)
          }
        }
      }

      // Rebuild include string with resolved tags
      let newInclude = tracker.include

      // Replace each nutrition tag with its resolved version
      for (const [oldTag, newTag] of Object.entries(resolvedTags)) {
        if (oldTag !== newTag) {
          // Replace #oldtag( with #newtag(
          const oldPattern = new RegExp(`#${oldTag}\\(`, 'g')
          newInclude = newInclude.replace(oldPattern, `#${newTag}(`)
        }
      }

      // Only update if something changed
      if (newInclude !== tracker.include) {
        console.log(`🔄 [MIGRATION] New include: ${newInclude}`)

        tracker.include = newInclude
        tracker._dirty = true
        trackersToUpdate.push(tracker)
        updatedCount++
      }
    }

    // Save updated trackers
    if (trackersToUpdate.length > 0) {
      console.log(`🔄 [MIGRATION] Updating ${trackersToUpdate.length} trackers...`)

      for (const tracker of trackersToUpdate) {
        await TrackerStore.upsert(tracker)
      }

      console.log(`🔄 [MIGRATION] ✅ Migration complete! Updated ${updatedCount} trackers`)
    } else {
      console.log('🔄 [MIGRATION] No trackers needed updating')
    }

    // Mark migration as complete
    localStorage.setItem(migrationKey, 'true')

  } catch (error) {
    console.error('🔄 [MIGRATION] ❌ Migration failed:', error)
    // Don't mark as complete so it retries next time
    throw error
  }
}
