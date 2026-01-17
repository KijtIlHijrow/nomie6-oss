# Tracker Aliases

## Overview

Nomie automatically detects when you're creating trackers with names similar to existing ones and suggests using the existing tracker instead. This prevents duplicate trackers with slightly different names like "carbohydrates" and "carbs", or "fat" and "fats".

The system learns from your choices and automatically resolves aliases in the future, making data entry faster and more consistent.

## How It Works

When creating a new tracker (either through AI product search or manual creation), Nomie performs intelligent matching against your existing trackers using three strategies:

### 1. Exact Abbreviation Patterns (Confidence: 95%)

Common abbreviations are recognized automatically:
- `carbs` → `carbohydrates`
- `cal` → `calories`
- `cals` → `calories`
- `protein` → `proteins` (and vice versa)

### 2. Plural Variations (Confidence: 90%)

Detects singular/plural forms:
- `fat` ↔ `fats`
- `calorie` ↔ `calories`
- `activity` ↔ `activities`

Handles English plural rules:
- Adding 's' (tracker → trackers)
- Adding 'es' (glass → glasses)
- Changing 'y' to 'ies' (activity → activities)

### 3. Similar Spelling (Confidence: 60-90%)

Uses fuzzy matching (Levenshtein distance) to detect similar names:
- `carbohidrates` → `carbohydrates` (typo)
- `protien` → `protein` (typo)
- `sodum` → `sodium` (typo)

Confidence scores are based on how similar the strings are.

## Using Tracker Aliases

### In AI Product Search

When searching for food products in the AI chat:

1. Search for a product (e.g., "chicken breast")
2. Select a nutrition product from the results
3. If Nomie detects a similar existing tracker:
   - A modal appears showing potential matches
   - Each match displays:
     - Tracker name and emoji/color
     - Match reason (abbreviation, plural, or similar spelling)
     - Confidence indicator:
       - **Green "Recommended"** - High confidence (≥90%)
       - **Yellow "Suggested"** - Medium confidence (60-89%)
   - Choose one of:
     - **Use existing tracker** - Reuses the matched tracker
     - **Create new tracker** - Creates a new tracker anyway

4. If you choose "Use existing":
   - Nomie creates an alias mapping
   - Next time you use the same term, it automatically uses the existing tracker without asking
   - The mapping is saved permanently

### Manual Tracker Creation

The same flow applies when manually creating trackers:

1. Open the tracker editor
2. Enter a tracker name
3. Click Save
4. If similar trackers exist, the match modal appears
5. Choose to use existing or create new

### First-Time vs. Learned Aliases

**First time using a name:**
- Modal shows potential matches
- You decide whether to use existing or create new
- Your choice is remembered

**After you've made a choice:**
- Nomie automatically applies your previous decision
- No modal appears - it just works
- Faster data entry with consistent trackers

## Match Confidence Levels

| Confidence | Indicator | Meaning | Examples |
|------------|-----------|---------|----------|
| 95% | Green "Recommended" | Exact abbreviation | carbs → carbohydrates |
| 90% | Green "Recommended" | Plural variation | fat → fats |
| 80-89% | Yellow "Suggested" | Close spelling | carbohidrate → carbohydrate |
| 60-79% | Yellow "Suggested" | Similar spelling | protien → protein |
| <60% | Not shown | Too different to suggest | - |

Only matches with confidence ≥60% are shown in the modal.

## Data Storage and Privacy

### Storage Location

- Alias mappings: `tracker-aliases.json` in your local storage
- All data stays on your device
- No server synchronization

### Data Structure

Each alias mapping stores:
- Canonical tracker tag (e.g., `#carbohydrates`)
- Alias term (e.g., `carbs`)
- Confidence score (0-1)
- User confirmation flag
- Creation timestamp
- Usage count (for analytics)

### Data Persistence

- Mappings persist across app restarts
- Mappings survive tracker deletion (in case you recreate the tracker)
- Mappings can be manually cleared by deleting `tracker-aliases.json`

### Usage Analytics

- Each alias mapping tracks how many times it's been used
- Helps identify your most common aliases
- Data stays local - never sent anywhere

## Examples

### Example 1: Nutrition Tracking

You have a tracker `#carbohydrates` for tracking carbs.

**AI Product Search:**
1. Search "pasta"
2. Select "Barilla Penne Pasta"
3. Modal shows: "Similar tracker found: Carbohydrates (Recommended - abbreviation)"
4. Choose "Use existing tracker"
5. Entry created: `#carbohydrates(45g)`
6. Mapping saved: `carbs` → `#carbohydrates`

**Next time:**
1. Search "bread"
2. Select "Whole Wheat Bread"
3. No modal - automatically uses `#carbohydrates`
4. Entry created: `#carbohydrates(30g)`

### Example 2: Typo Correction

You have a tracker `#protein`.

**Manual Creation:**
1. Try to create tracker "protien" (typo)
2. Modal shows: "Similar tracker found: Protein (Suggested - similar spelling, 85%)"
3. Choose "Use existing tracker"
4. Editor switches to editing `#protein` instead
5. Mapping saved: `protien` → `#protein`

**Result:**
Your typo is caught and corrected automatically.

## Technical Details

### For Developers

**Core Components:**
- `TrackerAliasStore.ts` - Persistence layer for alias mappings
- `TrackerMatcher.ts` - Fuzzy matching algorithms
- `TrackerMatchModal.svelte` - User confirmation UI
- `TrackerStore.ts:getOrCreate()` - Integration point

**Matching Algorithm:**
1. Check exact tag match (fastest path)
2. Check saved alias mappings
3. Run fuzzy matching against all trackers
4. Return matches with confidence ≥60%

**Performance:**
- Alias lookup: O(1) via hash map
- Fuzzy matching: O(n) where n = number of trackers
- Runs asynchronously to avoid blocking UI

**Testing:**
- Unit tests: `TrackerAliasStore.spec.ts`, `TrackerMatcher.spec.ts`, `TrackerStore.spec.ts`
- Integration points tested in AI query view and tracker editor
- 20 passing tests covering all workflows

## Troubleshooting

### Modal doesn't appear

**Possible causes:**
- The tracker name is too different (confidence <60%)
- You're editing an existing tracker (not creating new)
- An alias mapping already exists (auto-applied)

**Solution:**
Try a name closer to the existing tracker, or create the tracker with the desired name.

### Wrong tracker suggested

**Cause:**
Fuzzy matching sometimes suggests unrelated trackers with similar spellings.

**Solution:**
Choose "Create new tracker" instead of "Use existing tracker".

### Want to change a mapping

**Current limitation:**
No UI to edit or delete individual mappings.

**Workaround:**
Delete the mapping from `tracker-aliases.json` manually, or create the tracker with a different name.

## Future Enhancements

Planned improvements:
- UI for viewing and managing alias mappings
- Export/import mappings for backup
- Semantic matching using AI (understanding "carbs" means "carbohydrates" contextually)
- Suggest creating aliases for frequently used variations

## Privacy & Security

- All matching happens locally on your device
- No data is sent to external servers
- Alias mappings cannot be accessed by other apps
- Safe to use with sensitive health data

## Related Documentation

- [Tracker System](../architecture/trackers.md) - How trackers work in Nomie
- [AI Query View](./ai-query.md) - Using AI for food tracking
- [Data Storage](../architecture/storage.md) - How Nomie stores data locally
