/**
 * Tracker Recovery Script - CouchDB Version
 * Rebuilds trackers from log entries in CouchDB server
 *
 * Run this in browser console while Nomie is open
 */

(async () => {
  console.log('🔧 Starting tracker recovery from CouchDB...');

  // CouchDB credentials (update if different)
  const couchUrl = 'http://localhost:5984';
  const username = 'admin';
  const password = 'nomie123';
  const dbName = 'nomie6';

  const auth = btoa(`${username}:${password}`);
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json'
  };

  // Fetch log books from CouchDB
  console.log('📡 Fetching data from CouchDB...');

  const fetchDoc = async (docId) => {
    const res = await fetch(`${couchUrl}/${dbName}/${encodeURIComponent(docId)}`, { headers });
    if (!res.ok) throw new Error(`Failed to fetch ${docId}: ${res.statusText}`);
    return res.json();
  };

  const books = await Promise.all([
    fetchDoc('data/books/2026-01-1'),
    fetchDoc('data/books/2026-01-0')
  ]);

  // Extract all notes
  const allNotes = books.flatMap(book =>
    (book?.data || []).map(log => log.note)
  ).filter(Boolean);

  console.log(`📖 Analyzing ${allNotes.length} log entries...`);

  if (allNotes.length === 0) {
    console.error('❌ No log entries found in CouchDB!');
    return;
  }

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
  Object.values(trackers).slice(0, 10).forEach(t => {
    console.log(`  ${t.tag} (${t.type}): "${t.label}"`);
  });

  // Confirm before saving
  console.log(`\n⚠️  Ready to save ${Object.keys(trackers).length} trackers`);
  const confirmed = confirm(
    `This will restore ${Object.keys(trackers).length} trackers from your CouchDB log history.\n\n` +
    `Your log data will NOT be affected.\n\n` +
    `Continue?`
  );

  if (!confirmed) {
    console.log('❌ Recovery cancelled');
    return;
  }

  // Save to both CouchDB and browser PouchDB
  console.log('💾 Saving trackers to CouchDB...');

  // First, get current trackers.json doc to preserve _rev
  let currentDoc;
  try {
    currentDoc = await fetchDoc('trackers.json');
  } catch (e) {
    console.log('No existing trackers.json, will create new');
  }

  const trackerDoc = {
    _id: 'trackers.json',
    data: trackers
  };

  if (currentDoc && currentDoc._rev) {
    trackerDoc._rev = currentDoc._rev;
  }

  // Save to CouchDB
  const saveRes = await fetch(`${couchUrl}/${dbName}/trackers.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(trackerDoc)
  });

  if (!saveRes.ok) {
    const error = await saveRes.text();
    console.error('❌ Failed to save to CouchDB:', error);
    return;
  }

  console.log('✅ Saved to CouchDB');

  // Also save to browser PouchDB
  console.log('💾 Saving to browser...');
  const storage = window.NStorage.getEngine();
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
