# Tracker Alias Mapping - Integration Testing

## Test Environment Setup

**Prerequisites:**
- Build and run the app: `npm run dev`
- Create test trackers:
  - `#carbohydrates` (label: "Carbohydrates", nutrition tracker)
  - `#protein` (label: "Protein", nutrition tracker)
  - `#calories` (label: "Calories", nutrition tracker)

**Test Data Location:**
- Alias mappings: `tracker-aliases.json` in localStorage
- Check browser DevTools → Application → Local Storage

---

## Test Suite 1: AI Query Flow

### Test 1.1: First-Time Abbreviation Match
**Steps:**
1. Open AI chat
2. Search for "chicken breast"
3. Select a nutrition product
4. When prompted for tracker name, enter "carbs"

**Expected:**
- ✅ Modal appears showing "Carbohydrates" as a match
- ✅ Match shows "Recommended" (green indicator)
- ✅ Reason shows "abbreviation"
- ✅ Confidence shows 95%

**Choose: "Use existing tracker"**

**Expected:**
- ✅ Modal closes
- ✅ Entry created with `#carbohydrates` tag
- ✅ Success message: "Using existing tracker: Carbohydrates"
- ✅ Alias mapping saved in `tracker-aliases.json`

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 1.2: Learned Alias Auto-Application
**Steps:**
1. Search for another product (e.g., "pasta")
2. Select a nutrition product
3. When prompted, enter "carbs" again

**Expected:**
- ✅ No modal appears
- ✅ Automatically uses `#carbohydrates`
- ✅ Entry created immediately

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 1.3: Plural Variation Match
**Steps:**
1. Search for "chicken"
2. Select a product
3. Enter "proteins" (plural)

**Expected:**
- ✅ Modal shows "Protein" as match
- ✅ Match shows "Recommended"
- ✅ Reason shows "plural variation"

**Choose: "Create new tracker"**

**Expected:**
- ✅ New tracker `#proteins` created
- ✅ No alias mapping created
- ✅ Success message: "Proteins created"

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 1.4: Fuzzy Spelling Match
**Steps:**
1. Search for "bread"
2. Select a product
3. Enter "calries" (typo for calories)

**Expected:**
- ✅ Modal shows "Calories" as match
- ✅ Match shows "Suggested" (yellow indicator)
- ✅ Confidence between 60-90%
- ✅ Reason shows "similar spelling"

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 1.5: No Matches Found
**Steps:**
1. Search for a product
2. Enter a completely unique name: "my_unique_tracker_xyz"

**Expected:**
- ✅ No modal appears
- ✅ New tracker created immediately
- ✅ Success message shows tracker name

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 1.6: Multiple Matches
**Preparation:**
Create trackers: `#fat`, `#fats`, `#fatty_acids`

**Steps:**
1. Search for a product
2. Enter "fat"

**Expected:**
- ✅ Modal shows all similar matches
- ✅ Matches sorted by confidence (highest first)
- ✅ Each match shows confidence and reason

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

## Test Suite 2: Manual Tracker Creation Flow

### Test 2.1: Creating Similar Tracker
**Steps:**
1. Open tracker editor (click + button)
2. Enter label: "Carbs"
3. Click Save

**Expected:**
- ✅ Modal appears before saving
- ✅ Shows "Carbohydrates" as match
- ✅ Can choose "Use existing" or "Create new"

**Choose: "Use existing tracker"**

**Expected:**
- ✅ Editor updates to show existing tracker
- ✅ Tag updates to `#carbohydrates`
- ✅ Success message: "Using existing tracker: Carbohydrates"
- ✅ Alias mapping created

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 2.2: Creating New Despite Match
**Steps:**
1. Open tracker editor
2. Enter label: "Cals"
3. Click Save
4. Modal shows "Calories" as match

**Choose: "Create new tracker"**

**Expected:**
- ✅ New tracker `#cals` created
- ✅ No alias mapping created
- ✅ Success message shows "Cals"
- ✅ Tracker appears in tracker list

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 2.3: Editing Existing Tracker
**Steps:**
1. Open existing tracker `#carbohydrates`
2. Change label to "Carbs Updated"
3. Click Save

**Expected:**
- ✅ No modal appears
- ✅ Tracker updated directly
- ✅ Tag remains `#carbohydrates`

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

## Test Suite 3: Edge Cases

### Test 3.1: Case Insensitive Matching
**Steps:**
1. Try to create tracker "CARBS" (uppercase)

**Expected:**
- ✅ Modal shows "Carbohydrates" match
- ✅ Matching is case-insensitive

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 3.2: Whitespace Handling
**Steps:**
1. Try to create tracker "  carbs  " (with spaces)

**Expected:**
- ✅ Tag normalized to "carbs"
- ✅ Modal shows "Carbohydrates" match

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 3.3: Empty or Invalid Names
**Steps:**
1. Try to create tracker with empty label

**Expected:**
- ✅ Save button disabled
- ✅ No matching attempted

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 3.4: Special Characters
**Steps:**
1. Try to create "carbs!!!" (with special chars)

**Expected:**
- ✅ Special characters handled properly
- ✅ Matching works on alphanumeric portion

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

## Test Suite 4: Data Persistence

### Test 4.1: Mapping Persistence Across Reload
**Steps:**
1. Create an alias mapping ("carbs" → "carbohydrates")
2. Verify mapping in localStorage
3. Refresh the page
4. Try using "carbs" again

**Expected:**
- ✅ Mapping persists after reload
- ✅ Auto-applies without showing modal

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 4.2: Mapping Survives Tracker Deletion
**Steps:**
1. Create mapping for a tracker
2. Delete the tracker
3. Recreate the tracker with same tag
4. Try using the alias

**Expected:**
- ✅ Mapping still exists
- ✅ Auto-applies to recreated tracker

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 4.3: Usage Count Increments
**Steps:**
1. Create a mapping
2. Check usage count in localStorage (should be 0)
3. Use the alias 3 times
4. Check usage count again

**Expected:**
- ✅ Usage count = 3
- ✅ Increments each time alias is used

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

## Test Suite 5: UI/UX Testing

### Test 5.1: Modal Visual Design
**Check:**
- [ ] Modal has proper backdrop (dims background)
- [ ] Modal is centered on screen
- [ ] Tracker avatars display properly (emoji/color)
- [ ] Confidence indicators are color-coded (green/yellow)
- [ ] Text is readable (proper contrast)
- [ ] Mobile responsive (test on small screen)

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 5.2: Modal Actions
**Steps:**
1. Open a match modal
2. Click outside modal (on backdrop)

**Expected:**
- ✅ Modal stays open (doesn't close)

**Then:**
3. Click "Cancel" or close button

**Expected:**
- ✅ Modal closes
- ✅ No tracker created
- ✅ Returns to previous state

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 5.3: Loading States
**Steps:**
1. Create a tracker that triggers matching
2. Observe any loading indicators

**Expected:**
- ✅ No UI freeze during matching
- ✅ Smooth transition to modal
- ✅ Responsive during save

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

## Test Suite 6: Performance Testing

### Test 6.1: Many Trackers
**Setup:**
- Create 50+ trackers

**Steps:**
1. Try to create a tracker similar to one of them

**Expected:**
- ✅ Matching completes quickly (<500ms)
- ✅ UI remains responsive

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

### Test 6.2: Many Mappings
**Setup:**
- Create 20+ alias mappings

**Steps:**
1. Use an existing alias
2. Observe lookup speed

**Expected:**
- ✅ Instant lookup (O(1))
- ✅ No noticeable delay

**Actual Results:**
- [ ] Pass
- [ ] Fail: ____________________

---

## Test Results Summary

**Date Tested:** _______________
**Tester:** _______________
**Environment:** _______________

**Total Tests:** 25
**Passed:** _____
**Failed:** _____
**Pass Rate:** _____%

**Critical Issues Found:**
1. _______________
2. _______________

**Minor Issues Found:**
1. _______________
2. _______________

**Notes:**
_______________________________________________
_______________________________________________
_______________________________________________
