# Tracker Alias Mapping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a smart tracker alias mapping system that learns user preferences and automatically resolves tracker name variations (carbs→carbohydrates, fat→fats, etc.)

**Architecture:** Three-tier matching (exact abbreviations, string similarity, semantic AI), KVStore-based persistence, modal confirmation UI, integrated into TrackerStore.getOrCreate() and AI query flow

**Tech Stack:** TypeScript, Svelte, Vitest, existing KVStore pattern, Levenshtein string distance, AI query infrastructure

---

## Task 1: Create TrackerAliasStore (Data Layer)

**Files:**
- Create: `src/domains/tracker/TrackerAliasStore.ts`
- Test: `src/domains/tracker/TrackerAliasStore.spec.ts`

**Step 1: Write failing test for store initialization**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { TrackerAliasStore } from './TrackerAliasStore'
import { get } from 'svelte/store'

describe('TrackerAliasStore', () => {
  beforeEach(async () => {
    await TrackerAliasStore.clear()
  })

  it('should initialize as empty store', async () => {
    await TrackerAliasStore.init()
    const state = get(TrackerAliasStore)
    expect(Object.keys(state).length).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run vtest TrackerAliasStore.spec.ts`
Expected: FAIL with "Cannot find module './TrackerAliasStore'"

**Step 3: Create TrackerAliasMapping interface and store**

```typescript
import { createKVStore } from '../../store/KVStore'
import NPaths from '../../paths'
import nid from '../../modules/nid/nid'

export interface TrackerAliasMapping {
  id: string
  canonical: string      // e.g., "#carbohydrates"
  alias: string          // e.g., "carbs"
  confidence: number     // 0-1 score
  userConfirmed: boolean
  createdAt: Date
  usageCount: number
}

export const TrackerAliasStore = createKVStore(NPaths.storage.trackerAliases(), {
  label: 'TrackerAliases',
  key: 'id',
  itemSerializer: (item: TrackerAliasMapping) => {
    return {
      ...item,
      createdAt: item.createdAt.toISOString()
    }
  },
  itemInitializer: (item: any) => {
    return {
      ...item,
      createdAt: new Date(item.createdAt)
    }
  },
})

export const createMapping = async (
  canonical: string,
  alias: string,
  confidence: number,
  userConfirmed: boolean = false
): Promise<TrackerAliasMapping> => {
  const mapping: TrackerAliasMapping = {
    id: nid(),
    canonical,
    alias: alias.toLowerCase(),
    confidence,
    userConfirmed,
    createdAt: new Date(),
    usageCount: 0
  }
  await TrackerAliasStore.upsert(mapping)
  return mapping
}

export const findMappingByAlias = async (alias: string): Promise<TrackerAliasMapping | null> => {
  await TrackerAliasStore.init()
  const state = await TrackerAliasStore.state()
  const mappings = Object.values(state) as TrackerAliasMapping[]
  return mappings.find(m => m.alias.toLowerCase() === alias.toLowerCase()) || null
}

export const incrementUsage = async (mappingId: string): Promise<void> => {
  await TrackerAliasStore.updateSync((state) => {
    if (state[mappingId]) {
      state[mappingId].usageCount++
    }
    return state
  })
}
```

**Step 4: Add storage path to NPaths**

Modify: `src/paths.ts`

Find the storage object and add:
```typescript
trackerAliases: () => `${root}/tracker-aliases.json`,
```

**Step 5: Run test to verify it passes**

Run: `npm run vtest TrackerAliasStore.spec.ts`
Expected: PASS

**Step 6: Add more comprehensive tests**

```typescript
it('should create and retrieve mapping', async () => {
  await TrackerAliasStore.init()
  const mapping = await createMapping('#carbohydrates', 'carbs', 0.95, true)

  const found = await findMappingByAlias('carbs')
  expect(found).not.toBeNull()
  expect(found?.canonical).toBe('#carbohydrates')
  expect(found?.confidence).toBe(0.95)
})

it('should increment usage count', async () => {
  await TrackerAliasStore.init()
  const mapping = await createMapping('#carbohydrates', 'carbs', 0.95, true)

  await incrementUsage(mapping.id)
  const found = await findMappingByAlias('carbs')
  expect(found?.usageCount).toBe(1)
})

it('should handle case-insensitive alias lookup', async () => {
  await TrackerAliasStore.init()
  await createMapping('#carbohydrates', 'CARBS', 0.95, true)

  const found = await findMappingByAlias('carbs')
  expect(found).not.toBeNull()
})
```

**Step 7: Run tests**

Run: `npm run vtest TrackerAliasStore.spec.ts`
Expected: PASS (all tests)

**Step 8: Commit**

```bash
git add src/domains/tracker/TrackerAliasStore.ts src/domains/tracker/TrackerAliasStore.spec.ts src/paths.ts
git commit -m "feat: add TrackerAliasStore for persistent alias mappings"
```

---

## Task 2: Create TrackerMatcher (Fuzzy Matching Logic)

**Files:**
- Create: `src/domains/tracker/TrackerMatcher.ts`
- Test: `src/domains/tracker/TrackerMatcher.spec.ts`

**Step 1: Write failing tests for fuzzy matching**

```typescript
import { describe, it, expect } from 'vitest'
import {
  calculateStringDistance,
  calculateConfidence,
  findSimilarTrackers,
  type MatchResult
} from './TrackerMatcher'
import TrackerClass from '../../modules/tracker/TrackerClass'

describe('TrackerMatcher - String Distance', () => {
  it('should calculate Levenshtein distance', () => {
    expect(calculateStringDistance('carbs', 'carbohydrates')).toBeGreaterThan(0)
    expect(calculateStringDistance('fat', 'fats')).toBe(1)
    expect(calculateStringDistance('protein', 'protein')).toBe(0)
  })
})

describe('TrackerMatcher - Confidence Scoring', () => {
  it('should give high confidence to exact abbreviations', () => {
    const confidence = calculateConfidence('carbs', 'carbohydrates')
    expect(confidence).toBeGreaterThan(0.8)
  })

  it('should give high confidence to plural variations', () => {
    const confidence = calculateConfidence('fat', 'fats')
    expect(confidence).toBeGreaterThan(0.9)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run vtest TrackerMatcher.spec.ts`
Expected: FAIL with "Cannot find module './TrackerMatcher'"

**Step 3: Implement Levenshtein distance function**

```typescript
/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of edits needed to transform one string into another
 */
export function calculateStringDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  const matrix: number[][] = []

  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[s2.length][s1.length]
}
```

**Step 4: Run distance tests**

Run: `npm run vtest TrackerMatcher.spec.ts -t "String Distance"`
Expected: PASS

**Step 5: Implement common abbreviation patterns**

```typescript
/**
 * Common nutrition/tracker abbreviations
 */
const ABBREVIATION_PATTERNS: Record<string, string[]> = {
  'carbohydrates': ['carbs', 'carb'],
  'protein': ['proteins'],
  'fat': ['fats'],
  'calories': ['calorie', 'cals', 'cal'],
  'fiber': ['fibre'],
  'sodium': ['salt'],
  'cholesterol': ['chol'],
}

/**
 * Check if one string is a known abbreviation of another
 */
function isKnownAbbreviation(short: string, long: string): boolean {
  const shortLower = short.toLowerCase()
  const longLower = long.toLowerCase()

  // Check direct match
  if (ABBREVIATION_PATTERNS[longLower]?.includes(shortLower)) {
    return true
  }

  // Check reverse (user typed long form, tracker is short)
  if (ABBREVIATION_PATTERNS[shortLower]?.includes(longLower)) {
    return true
  }

  return false
}

/**
 * Check if strings are plural variations of each other
 */
function isPluralVariation(str1: string, str2: string): boolean {
  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  return (s1 + 's' === s2) || (s2 + 's' === s1)
}
```

**Step 6: Implement confidence calculation**

```typescript
export interface MatchReason {
  type: 'abbreviation' | 'plural' | 'similar_spelling' | 'semantic'
  description: string
}

/**
 * Calculate confidence score (0-1) and reason for potential match
 */
export function calculateConfidence(
  input: string,
  trackerLabel: string
): { confidence: number; reason: MatchReason } {
  const inputLower = input.toLowerCase().trim()
  const labelLower = trackerLabel.toLowerCase().trim()

  // Exact match
  if (inputLower === labelLower) {
    return {
      confidence: 1.0,
      reason: { type: 'similar_spelling', description: 'Exact match' }
    }
  }

  // Known abbreviation
  if (isKnownAbbreviation(inputLower, labelLower)) {
    return {
      confidence: 0.95,
      reason: { type: 'abbreviation', description: 'Common abbreviation' }
    }
  }

  // Plural variation
  if (isPluralVariation(inputLower, labelLower)) {
    return {
      confidence: 0.9,
      reason: { type: 'plural', description: 'Plural variation' }
    }
  }

  // String similarity
  const distance = calculateStringDistance(inputLower, labelLower)
  const maxLength = Math.max(inputLower.length, labelLower.length)
  const normalizedDistance = 1 - (distance / maxLength)

  // Only consider matches with normalized distance > 0.5
  if (normalizedDistance > 0.5) {
    return {
      confidence: normalizedDistance,
      reason: { type: 'similar_spelling', description: 'Similar spelling' }
    }
  }

  return { confidence: 0, reason: { type: 'similar_spelling', description: 'No match' } }
}
```

**Step 7: Run confidence tests**

Run: `npm run vtest TrackerMatcher.spec.ts -t "Confidence"`
Expected: PASS

**Step 8: Implement findSimilarTrackers**

```typescript
import TrackerClass from '../../modules/tracker/TrackerClass'

export interface MatchResult {
  tracker: TrackerClass
  confidence: number
  reason: MatchReason
}

/**
 * Find similar trackers from existing tracker list
 * Returns matches above confidence threshold, sorted by confidence
 */
export function findSimilarTrackers(
  input: string,
  existingTrackers: TrackerClass[],
  minConfidence: number = 0.6
): MatchResult[] {
  const results: MatchResult[] = []

  for (const tracker of existingTrackers) {
    const { confidence, reason } = calculateConfidence(input, tracker.label || tracker.tag)

    if (confidence >= minConfidence) {
      results.push({ tracker, confidence, reason })
    }
  }

  // Sort by confidence descending
  return results.sort((a, b) => b.confidence - a.confidence)
}
```

**Step 9: Add tests for findSimilarTrackers**

```typescript
describe('TrackerMatcher - Find Similar Trackers', () => {
  it('should find exact abbreviation matches', () => {
    const trackers = [
      new TrackerClass({ tag: 'carbohydrates', label: 'Carbohydrates' }),
      new TrackerClass({ tag: 'protein', label: 'Protein' }),
    ]

    const matches = findSimilarTrackers('carbs', trackers)
    expect(matches.length).toBe(1)
    expect(matches[0].tracker.tag).toBe('carbohydrates')
    expect(matches[0].confidence).toBeGreaterThan(0.8)
  })

  it('should sort results by confidence', () => {
    const trackers = [
      new TrackerClass({ tag: 'fat', label: 'Fat' }),
      new TrackerClass({ tag: 'fats', label: 'Fats' }),
      new TrackerClass({ tag: 'fatty_acids', label: 'Fatty Acids' }),
    ]

    const matches = findSimilarTrackers('fat', trackers)
    expect(matches[0].tracker.tag).toBe('fat') // exact match
    expect(matches[0].confidence).toBe(1.0)
  })

  it('should respect minimum confidence threshold', () => {
    const trackers = [
      new TrackerClass({ tag: 'completely_different', label: 'Completely Different' }),
    ]

    const matches = findSimilarTrackers('carbs', trackers, 0.6)
    expect(matches.length).toBe(0)
  })
})
```

**Step 10: Run all tests**

Run: `npm run vtest TrackerMatcher.spec.ts`
Expected: PASS (all tests)

**Step 11: Commit**

```bash
git add src/domains/tracker/TrackerMatcher.ts src/domains/tracker/TrackerMatcher.spec.ts
git commit -m "feat: add fuzzy matching logic for tracker aliases"
```

---

## Task 3: Create TrackerMatchModal (UI Component)

**Files:**
- Create: `src/domains/tracker/TrackerMatchModal.svelte`

**Step 1: Create modal component structure**

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import PanelModal from '../../components/modal/PanelModal.svelte'
  import Button from '../../components/button/button.svelte'
  import type TrackerClass from '../../modules/tracker/TrackerClass'
  import type { MatchResult } from './TrackerMatcher'

  export let visible: boolean = false
  export let inputName: string = ''
  export let matches: MatchResult[] = []

  const dispatch = createEventDispatcher()

  function handleUseExisting(tracker: TrackerClass) {
    dispatch('useExisting', { tracker })
    visible = false
  }

  function handleCreateNew() {
    dispatch('createNew')
    visible = false
  }

  function getConfidenceLabel(confidence: number): string {
    if (confidence >= 0.8) return 'Recommended'
    return 'Suggested'
  }

  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return 'text-green-600 dark:text-green-400'
    return 'text-yellow-600 dark:text-yellow-400'
  }
</script>

<PanelModal
  id="tracker-match-modal"
  bind:visible
  title="Similar Tracker Found"
  on:close={handleCreateNew}
>
  <div class="p-4 space-y-4">
    <div class="text-sm text-gray-600 dark:text-gray-400">
      Creating: <span class="font-semibold">#{inputName}</span>
    </div>

    <div class="space-y-2">
      {#each matches as match}
        <button
          class="w-full p-4 border rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          on:click={() => handleUseExisting(match.tracker)}
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="font-semibold text-base">
                #{match.tracker.tag}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {match.reason.description}
              </div>
            </div>
            <div class={`text-xs font-medium ${getConfidenceColor(match.confidence)}`}>
              {getConfidenceLabel(match.confidence)}
            </div>
          </div>
        </button>
      {/each}
    </div>

    <div class="pt-4 border-t dark:border-gray-700">
      <Button
        className="w-full"
        color="secondary"
        on:click={handleCreateNew}
      >
        Create New Tracker
      </Button>
    </div>
  </div>
</PanelModal>
```

**Step 2: Test modal manually in dev environment**

Run: `npm run dev`
- Navigate to AI query view
- Manually import and test the modal component

**Step 3: Commit**

```bash
git add src/domains/tracker/TrackerMatchModal.svelte
git commit -m "feat: add tracker match confirmation modal UI"
```

---

## Task 4: Integrate Matching Into TrackerStore

**Files:**
- Modify: `src/domains/tracker/TrackerStore.ts`
- Test: `src/domains/tracker/TrackerStore.spec.ts` (create if doesn't exist)

**Step 1: Write test for getOrCreate**

Create `src/domains/tracker/TrackerStore.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { TrackerStore, getOrCreate } from './TrackerStore'
import TrackerClass from '../../modules/tracker/TrackerClass'
import { TrackerAliasStore, createMapping } from './TrackerAliasStore'

describe('TrackerStore.getOrCreate', () => {
  beforeEach(async () => {
    await TrackerStore.clear()
    await TrackerAliasStore.clear()
  })

  it('should return existing tracker when alias mapping exists', async () => {
    // Create a tracker
    const tracker = new TrackerClass({ tag: 'carbohydrates', label: 'Carbohydrates' })
    await TrackerStore.upsert(tracker)

    // Create alias mapping
    await TrackerAliasStore.init()
    await createMapping('#carbohydrates', 'carbs', 0.95, true)

    // Try to create with alias
    const result = await getOrCreate('carbs', { label: 'Carbs' })

    expect(result.tracker.tag).toBe('carbohydrates')
    expect(result.used Existing).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run vtest TrackerStore.spec.ts`
Expected: FAIL with "getOrCreate is not defined"

**Step 3: Implement getOrCreate in TrackerStore**

Add to `src/domains/tracker/TrackerStore.ts`:

```typescript
import { findMappingByAlias, incrementUsage } from './TrackerAliasStore'
import { findSimilarTrackers } from './TrackerMatcher'

export interface GetOrCreateResult {
  tracker: TrackerClass
  usedExisting: boolean
  matches?: Array<{ tracker: TrackerClass; confidence: number; reason: any }>
  requiresConfirmation?: boolean
}

/**
 * Get existing tracker or prepare to create new one
 * Checks alias mappings first, then fuzzy matches
 * Returns requiresConfirmation=true if user needs to choose
 */
export const getOrCreate = async (
  tag: string,
  config?: Partial<ITracker>
): Promise<GetOrCreateResult> => {
  await TrackerStore.init()
  const normalizedTag = tag.toLowerCase().trim()

  // 1. Check if tracker already exists with exact tag
  const state = await TrackerStore.state()
  if (state[normalizedTag]) {
    return {
      tracker: state[normalizedTag],
      usedExisting: true
    }
  }

  // 2. Check alias mappings
  const mapping = await findMappingByAlias(normalizedTag)
  if (mapping) {
    const canonicalTag = mapping.canonical.replace('#', '')
    if (state[canonicalTag]) {
      await incrementUsage(mapping.id)
      return {
        tracker: state[canonicalTag],
        usedExisting: true
      }
    }
  }

  // 3. Find similar trackers via fuzzy matching
  const allTrackers = Object.values(state) as TrackerClass[]
  const matches = findSimilarTrackers(normalizedTag, allTrackers, 0.6)

  if (matches.length > 0) {
    // Return matches for user confirmation
    return {
      tracker: new TrackerClass({ tag: normalizedTag, ...config }),
      usedExisting: false,
      matches,
      requiresConfirmation: true
    }
  }

  // 4. No matches - create new tracker
  return {
    tracker: new TrackerClass({ tag: normalizedTag, ...config }),
    usedExisting: false,
    requiresConfirmation: false
  }
}
```

**Step 4: Run test**

Run: `npm run vtest TrackerStore.spec.ts`
Expected: PASS

**Step 5: Add more comprehensive tests**

```typescript
it('should find fuzzy matches and require confirmation', async () => {
  const tracker = new TrackerClass({ tag: 'carbohydrates', label: 'Carbohydrates' })
  await TrackerStore.upsert(tracker)

  const result = await getOrCreate('carbs', { label: 'Carbs' })

  expect(result.requiresConfirmation).toBe(true)
  expect(result.matches?.length).toBeGreaterThan(0)
  expect(result.matches?.[0].tracker.tag).toBe('carbohydrates')
})

it('should create new tracker when no matches found', async () => {
  const result = await getOrCreate('completely_new', { label: 'Completely New' })

  expect(result.usedExisting).toBe(false)
  expect(result.requiresConfirmation).toBe(false)
  expect(result.tracker.tag).toBe('completely_new')
})
```

**Step 6: Run all tests**

Run: `npm run vtest TrackerStore.spec.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/domains/tracker/TrackerStore.ts src/domains/tracker/TrackerStore.spec.ts
git commit -m "feat: add getOrCreate method with alias and fuzzy matching to TrackerStore"
```

---

## Task 5: Integrate Into AI Query View

**Files:**
- Modify: `src/domains/ai-query/ai-query-view.svelte`

**Step 1: Import dependencies**

Add to imports section (around line 20):

```typescript
import TrackerMatchModal from '../tracker/TrackerMatchModal.svelte'
import { getOrCreate, type GetOrCreateResult } from '../tracker/TrackerStore'
import { createMapping } from '../tracker/TrackerAliasStore'
import type { MatchResult } from '../tracker/TrackerMatcher'
```

**Step 2: Add state variables**

Add after line 133 (around pendingValueRequest):

```typescript
// Tracker matching state
let showTrackerMatchModal: boolean = false
let pendingTrackerCreation: {
  name: string
  config: any
  matches: MatchResult[]
  productData?: NutritionData
} | null = null
```

**Step 3: Find the product selection handler**

Search for the function that handles product selection (around line 600-700).
The function creates a tracker from nutrition data.

**Step 4: Replace direct tracker creation with getOrCreate**

Replace the tracker creation code (approximately lines 650-680):

```typescript
// OLD CODE (remove):
// const tracker = new TrackerClass({
//   tag: toTag(productName),
//   ...
// })
// await TrackerStore.upsert(tracker)

// NEW CODE:
const trackerTag = toTag(productName)
const trackerConfig = {
  label: productName,
  type: 'value' as const,
  math: 'sum' as const,
  uom: mapServingUnitToUOM(product.servingUnit),
  default: parseFloat(product.servingSize) || undefined,
  emoji: '🍽️'
}

const result: GetOrCreateResult = await getOrCreate(trackerTag, trackerConfig)

if (result.requiresConfirmation && result.matches) {
  // Show modal for user to choose
  pendingTrackerCreation = {
    name: trackerTag,
    config: trackerConfig,
    matches: result.matches,
    productData: product
  }
  showTrackerMatchModal = true
  return // Wait for user decision
}

// Use existing or new tracker
const tracker = result.usedExisting
  ? result.tracker
  : await TrackerStore.upsert(result.tracker).then(() => result.tracker)
```

**Step 5: Add modal event handlers**

Add after the product selection function:

```typescript
async function handleUseExistingTracker(event: CustomEvent) {
  const { tracker } = event.detail

  if (!pendingTrackerCreation) return

  // Create alias mapping for future use
  await createMapping(
    `#${tracker.tag}`,
    pendingTrackerCreation.name,
    0.95,
    true
  )

  // Continue with the selected tracker
  if (pendingTrackerCreation.productData) {
    await createTrackerEntry(tracker, pendingTrackerCreation.productData)
  }

  // Clean up
  pendingTrackerCreation = null
  showTrackerMatchModal = false
}

async function handleCreateNewTracker() {
  if (!pendingTrackerCreation) return

  // Create new tracker with original config
  const tracker = new TrackerClass({
    tag: pendingTrackerCreation.name,
    ...pendingTrackerCreation.config
  })
  await TrackerStore.upsert(tracker)
  await InitTrackableStore()

  // Continue with new tracker
  if (pendingTrackerCreation.productData) {
    await createTrackerEntry(tracker, pendingTrackerCreation.productData)
  }

  // Clean up
  pendingTrackerCreation = null
  showTrackerMatchModal = false
}

async function createTrackerEntry(tracker: TrackerClass, product: NutritionData) {
  // Existing entry creation logic
  const trackable = new Trackable({ type: 'tracker', id: tracker.tag, tracker })
  const log = new NLog({
    note: `#${tracker.tag}(${product.servingSize || 1})`,
    end: new Date()
  })
  await saveLog(log)
}
```

**Step 6: Add modal to template**

Add at end of template (before closing tags):

```svelte
<TrackerMatchModal
  bind:visible={showTrackerMatchModal}
  inputName={pendingTrackerCreation?.name || ''}
  matches={pendingTrackerCreation?.matches || []}
  on:useExisting={handleUseExistingTracker}
  on:createNew={handleCreateNewTracker}
/>
```

**Step 7: Test manually**

Run: `npm run dev`
- Go to AI query view
- Search for a product (e.g., "chicken")
- Select a product
- If you have an existing tracker like "protein", try creating "proteins"
- Verify modal shows suggesting "protein"
- Test both "Use existing" and "Create new" paths

**Step 8: Commit**

```bash
git add src/domains/ai-query/ai-query-view.svelte
git commit -m "feat: integrate tracker alias matching into AI product search flow"
```

---

## Task 6: Add Manual Tracker Creation Integration

**Files:**
- Modify: `src/domains/tracker/editor/TrackerEditorStore.ts` (or equivalent tracker creation component)

**Step 1: Find manual tracker creation component**

Search for files that handle manual tracker creation:

```bash
grep -r "new TrackerClass" src/domains/tracker --include="*.svelte"
```

**Step 2: Identify the tracker save/create function**

Look for the function that saves a new tracker (typically in tracker editor).

**Step 3: Integrate getOrCreate**

Replace direct `TrackerStore.upsert()` call with:

```typescript
import { getOrCreate } from '../TrackerStore'

// In save handler:
const result = await getOrCreate(trackerTag, trackerConfig)

if (result.requiresConfirmation && result.matches) {
  // Show confirmation modal (reuse TrackerMatchModal)
  // ... similar pattern to AI query integration
  return
}

const tracker = result.usedExisting
  ? result.tracker
  : await TrackerStore.upsert(result.tracker).then(() => result.tracker)
```

**Step 4: Test manually**

- Open tracker editor
- Try creating "carbs" when "carbohydrates" exists
- Verify modal shows

**Step 5: Commit**

```bash
git add src/domains/tracker/editor/*
git commit -m "feat: integrate tracker alias matching into manual tracker creation"
```

---

## Task 7: Integration Testing

**Files:**
- Test: Manual testing checklist

**Step 1: Test AI query flow**

- [ ] Search for "chicken breast"
- [ ] Select a product
- [ ] If "protein" tracker exists, verify it suggests using it
- [ ] Choose "Use existing"
- [ ] Verify mapping is saved (search again, should auto-use)
- [ ] Verify entry is created with correct tracker

**Step 2: Test manual creation flow**

- [ ] Create tracker "carbohydrates"
- [ ] Try to create "carbs"
- [ ] Verify modal shows "carbohydrates" as match
- [ ] Test "Use existing" path
- [ ] Test "Create new" path

**Step 3: Test edge cases**

- [ ] Create tracker with no similar matches
- [ ] Verify no modal shows
- [ ] Create tracker with multiple similar matches
- [ ] Verify all matches are shown sorted by confidence
- [ ] Test case-insensitive matching ("CARBS" → "carbohydrates")

**Step 4: Test persistence**

- [ ] Create an alias mapping
- [ ] Reload the app
- [ ] Verify mapping persists
- [ ] Verify auto-resolution works after reload

**Step 5: Document test results**

Create `docs/testing/tracker-alias-testing.md` with results.

**Step 6: Commit**

```bash
git add docs/testing/tracker-alias-testing.md
git commit -m "test: add integration testing documentation for tracker aliases"
```

---

## Task 8: Documentation

**Files:**
- Create: `docs/features/tracker-aliases.md`

**Step 1: Write user-facing documentation**

```markdown
# Tracker Aliases

## Overview

Nomie automatically detects when you're creating similar trackers and suggests using existing ones instead. This prevents duplicate trackers with slightly different names.

## How It Works

When creating a new tracker, Nomie checks for:
- **Exact abbreviations** (carbs → carbohydrates, cal → calories)
- **Plural variations** (fat → fats, protein → proteins)
- **Similar spellings** (using fuzzy matching)

## Using Tracker Aliases

### In AI Chat

When searching for food products, if you select an item that matches an existing tracker:

1. A modal will appear showing similar trackers
2. Each match shows:
   - Tracker name
   - Reason for match (abbreviation, plural, similar spelling)
   - Confidence level (Recommended or Suggested)
3. Choose "Use existing tracker" or "Create new tracker"

Once you choose to use an existing tracker, Nomie remembers this choice. Next time, it automatically uses the existing tracker without asking.

### Manual Tracker Creation

The same flow applies when creating trackers manually in the tracker editor.

## Data Storage

- Alias mappings are stored locally in `tracker-aliases.json`
- Mappings persist across app restarts
- If you delete a tracker, its aliases remain (in case you recreate it)

## Privacy

All matching happens locally on your device. No data is sent to external servers (except for semantic matching which may use your configured AI provider).
```

**Step 2: Commit**

```bash
git add docs/features/tracker-aliases.md
git commit -m "docs: add user documentation for tracker alias feature"
```

---

## Success Criteria

- [ ] TrackerAliasStore saves and loads mappings persistently
- [ ] TrackerMatcher correctly identifies similar tracker names
- [ ] TrackerMatchModal shows user-friendly confirmation UI
- [ ] AI query flow shows modal when creating similar tracker
- [ ] Manual creation flow shows modal when creating similar tracker
- [ ] User choice is remembered (alias mapping created)
- [ ] All tests pass (`npm run vtest`)
- [ ] No type errors (`npm run vbuild`)
- [ ] Feature documented

## Non-Goals (Future Enhancements)

- Semantic matching via AI (nice-to-have, not MVP)
- Bulk alias management UI
- Import/export alias mappings
- Warning when deleting tracker with many aliases
