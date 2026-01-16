# Tracker Alias Mapping Design

**Date:** 2026-01-16
**Status:** Design Complete

## Problem

When creating trackers from AI chat nutrition lookups, name variations cause duplicates:
- "carbs" vs "carbohydrates"
- "fat" vs "fats"
- "protein" vs "proteins"
- Provider-dependent naming (OpenFoodFacts vs USDA)

Variations are unpredictable and can't be hardcoded.

## Solution

Smart mapping system that learns user preferences and automatically resolves tracker name variations.

---

## Data Structure & Storage

### Tracker Alias Mapping Table

Store learned mappings in a new store following TrackerStore pattern:

```typescript
interface TrackerAliasMapping {
  id: string;                    // unique mapping ID
  canonical: string;             // the "real" tracker tag (e.g., "#carbohydrates")
  alias: string;                 // the variation (e.g., "carbs")
  confidence: number;            // 0-1 score from matching algorithm
  userConfirmed: boolean;        // true if user explicitly approved
  createdAt: Date;
  usageCount: number;            // how many times this mapping was applied
}
```

**Storage:** Use existing Nomie storage system (localStorage/indexedDB via LedgerStore pattern).

**Lifecycle:**
- Mappings persist across sessions
- Survive tracker deletion (canonical tracker might be recreated)
- Orphaned mappings remain if tracker deleted

---

## Fuzzy Matching Algorithm

### Three-tier matching strategy

**1. Exact abbreviation matching** (confidence: 0.9-1.0)
- Predefined common patterns: carbs→carbohydrates, fat→fats, protein→proteins
- Plural/singular: fiber→fibers, calorie→calories

**2. String similarity** (confidence: 0.6-0.9)
- Levenshtein distance for typos/variations
- Normalized edit distance accounting for length
- Case-insensitive comparison

**3. Semantic similarity** (confidence: 0.5-0.8)
- Use existing AI query infrastructure
- Ask LLM: "Are 'dietary fiber' and 'fibre' the same nutrition tracker?"
- Cache results to avoid repeated API calls
- Only trigger for nutrition/health-related terms

### Confidence thresholds
- **≥0.8:** Show as "Recommended match"
- **0.6-0.79:** Show as "Possible match"
- **<0.6:** Don't suggest

---

## User Interaction Flow

### During tracker creation (AI query or manual)

1. **New tracker name entered** → Check existing trackers + alias mappings

2. **If match found** → Show inline confirmation modal:
   ```
   Similar tracker found

   Creating: #carbs
   Existing: #carbohydrates (last used 2 days ago)

   [Use existing tracker] [Create new anyway]
   ```

3. **User chooses:**
   - **"Use existing"** → Save mapping (carbs→carbohydrates), apply existing tracker
   - **"Create new anyway"** → Create new tracker, don't save mapping

4. **Next time "carbs" appears** → Automatically use #carbohydrates (no prompt)

### Confidence indicators
- **High confidence (≥0.8):** Green checkmark, "Recommended"
- **Medium confidence (0.6-0.79):** Yellow dot, "Suggested"
- Show match reason: "Similar spelling" / "Common abbreviation" / "Semantically related"

### Multiple matches
If 2+ trackers match, show list ranked by confidence.

---

## Integration Points

### Where matching logic hooks in

**1. TrackerStore.getOrCreate()** - New central method:
- Checks alias mappings first
- Runs fuzzy matching if no mapping exists
- Returns existing tracker if match found + confirmed
- Creates new tracker if user declines match

**2. AI Query View** (ai-query-view.svelte):
- When creating nutrition trackers from product results
- Call TrackerStore.getOrCreate() instead of direct creation
- Handle confirmation modal inline

**3. Manual tracker creation** (tracker editor/board):
- Same getOrCreate() flow
- Works for any new tracker, not just nutrition

### New components needed
- `TrackerAliasStore.ts` - Store for alias mappings
- `TrackerMatcher.ts` - Fuzzy matching logic
- `TrackerMatchModal.svelte` - Confirmation UI component

### Backward compatibility
Existing direct tracker creation still works; only new paths use smart matching.

---

## Error Handling & Edge Cases

**Circular mappings prevention:**
- Don't allow A→B if B→A already exists
- Show warning: "This would create a circular mapping"

**Tracker deletion:**
- Mappings survive deletion (canonical tracker might be recreated)
- Optional: Show warning when deleting tracker with aliases: "3 aliases point to this tracker"

**Semantic matching failures:**
- If AI query fails, fall back to string similarity only
- Cache negative results: don't re-query same pair

**Performance:**
- Run matching asynchronously (don't block UI)
- Limit fuzzy search to trackers of same type (nutrition, mood, etc.)
- Index tracker tags for fast lookup

**Data migration:**
- No migration needed - new feature starts with empty mapping table
- Existing trackers work as before

---

## Testing Strategy

### Unit tests
- Fuzzy matching algorithm with known pairs (carbs/carbohydrates, fat/fats)
- Confidence scoring edge cases
- Circular mapping prevention
- Alias mapping CRUD operations

### Integration tests
- AI query → existing tracker match flow
- Manual creation → existing tracker match flow
- User confirms match → mapping saved
- User declines match → new tracker created

### User testing scenarios
- Create nutrition tracker from AI with common variation
- Create duplicate manually, verify suggestion
- Delete canonical tracker, recreate it, verify mappings still work

### Performance benchmarks
- Fuzzy matching with 100+ existing trackers should be <100ms

---

## Implementation Notes

- Reusable system available everywhere, not just AI query
- User always confirms before linking (safety with power)
- Aggressive semantic matching but with user control
- Mappings independent of trackers (survive deletion)
- Start with empty mapping table, learn over time
