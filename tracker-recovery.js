/**
 * Tracker Recovery Script
 * Rebuilds trackers from log entries after data loss
 *
 * Run this in browser console while Nomie is open
 */

(async () => {
  console.log('🔧 Starting tracker recovery...');

  // Get storage engine
  const storage = window.NStorage.getEngine();

  // Fetch all log books
  const books = await Promise.all([
    storage.get('data/books/2026-01-1'),
    storage.get('data/books/2026-01-0')
  ]);

  // Extract all notes
  const allNotes = books.flatMap(book =>
    (book?.data || []).map(log => log.note)
  ).filter(Boolean);

  console.log(`📖 Analyzing ${allNotes.length} log entries...`);

  // Analyze tracker usage
  const trackerData = new Map();

  allNotes.forEach(note => {
    // Find all tracker references: #tag or #tag(value)
    const matches = note.matchAll(/#([\w_-]+)(?:\(([^)]*)\))?/g);

    for (const match of matches) {
      const tag = match[1];
      const value = match[2];

      if (!trackerData.has(tag)) {
        trackerData.set(tag, {
          tag,
          count: 0,
          hasValues: false,
          values: [],
          sampleNote: note
        });
      }

      const data = trackerData.get(tag);
      data.count++;

      if (value !== undefined) {
        data.hasValues = true;
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          data.values.push(numValue);
        }
      }
    }
  });

  console.log(`📊 Found ${trackerData.size} unique trackers`);

  // Infer tracker types and create tracker objects
  const trackers = {};

  // Known nutrition trackers
  const nutritionTags = ['calories', 'protein', 'carbs', 'fat', 'fibre', 'sodium', 'sugars', 'satfat', 'saturated_fat'];

  // Known boolean/event trackers
  const eventKeywords = ['peed', 'pooped', 'shower', 'brush', 'workout', 'walk', 'help', 'dried', 'meal_prep'];

  // Known mood/scale trackers
  const scaleTags = ['mood', 'energy', 'focus', 'anxiety', 'stress', 'motivation', 'sleep_quality', 'fidgety', 'hyperactivity'];

  trackerData.forEach((data, tag) => {
    let tracker = {
      tag,
      type: 'tick',
      color: '#369DD3',
      math: 'sum',
      uom: '',
      emoji: '',
      default: null,
      max: null,
      min: null,
      score: 'default',
      score_calc: []
    };

    // Generate label from tag
    tracker.label = tag
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Determine type based on usage
    if (nutritionTags.includes(tag)) {
      tracker.type = 'value';
      tracker.uom = tag === 'calories' ? 'kcal' : 'g';
      tracker.color = '#4CAF50';
      tracker.include = ''; // Could be populated with formulas if needed
    } else if (scaleTags.includes(tag)) {
      tracker.type = 'range';
      tracker.min = 1;
      tracker.max = 10;
      tracker.color = '#FF9800';
    } else if (data.hasValues && data.values.length > 0) {
      tracker.type = 'value';

      // Infer unit of measurement
      if (tag.includes('weight')) {
        tracker.uom = 'kg';
      } else if (tag.includes('water') || tag.includes('shake') || tag.includes('juice')) {
        tracker.uom = 'ml';
      } else if (tag.includes('amount') || tag.includes('po_')) {
        tracker.uom = '';
      }

      // Sample values for reference
      const avg = data.values.reduce((a, b) => a + b, 0) / data.values.length;
      console.log(`  ${tag}: avg value = ${avg.toFixed(1)}`);

    } else if (eventKeywords.some(keyword => tag.includes(keyword))) {
      tracker.type = 'tick';
      tracker.color = '#2196F3';
    } else {
      // Default to tick
      tracker.type = 'tick';
    }

    trackers[tag] = tracker;
  });

  console.log(`\n✨ Created ${Object.keys(trackers).length} tracker definitions\n`);

  // Show sample
  console.log('Sample trackers:');
  Object.values(trackers).slice(0, 5).forEach(t => {
    console.log(`  ${t.tag} (${t.type}): "${t.label}"`);
  });

  // Confirm before saving
  console.log(`\n⚠️  Ready to save ${Object.keys(trackers).length} trackers to storage`);
  const confirmed = confirm(
    `This will restore ${Object.keys(trackers).length} trackers from your log history.\n\n` +
    `Your log data will NOT be affected.\n\n` +
    `Continue?`
  );

  if (!confirmed) {
    console.log('❌ Recovery cancelled');
    return;
  }

  // Save to storage
  console.log('💾 Saving trackers...');
  await storage.put('trackers.json', trackers);

  console.log('✅ Recovery complete!');
  console.log('\n📋 Summary:');
  console.log(`  - Recovered: ${Object.keys(trackers).length} trackers`);
  console.log(`  - From: ${allNotes.length} log entries`);
  console.log(`  - Types: ${Object.values(trackers).filter(t => t.type === 'tick').length} tick, ${Object.values(trackers).filter(t => t.type === 'value').length} value, ${Object.values(trackers).filter(t => t.type === 'range').length} range`);

  console.log('\n🔄 Reloading page to apply changes...');
  setTimeout(() => {
    window.location.reload();
  }, 2000);

})();
