#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Load emoji data from emoji-datasource-apple
const emojiData = require('emoji-datasource-apple/emoji.json');

// Category mapping
const categoryMap = {
  'Smileys & Emotion': 'People',
  'People & Body': 'People',
  'Animals & Nature': 'Nature',
  'Food & Drink': 'Eat',
  'Travel & Places': 'Places',
  'Activities': 'Activities',
  'Objects': 'Objects',
  'Symbols': 'Symbols',
  'Flags': 'Flags',
  'Component': 'Skin Tones'
};

// Convert emoji data to the format used by the app
const convertedEmojis = emojiData
  .filter(emoji => emoji.has_img_apple) // Only include emojis with Apple images
  .map(emoji => {
    // Get the unified emoji character
    const unified = emoji.unified.split('-').map(code => String.fromCodePoint(parseInt(code, 16))).join('');

    return {
      n: emoji.short_name,
      e: unified,
      v: emoji.skin_variations ? Object.values(emoji.skin_variations).map(v => {
        const skinUnified = v.unified.split('-').map(code => String.fromCodePoint(parseInt(code, 16))).join('');
        return skinUnified;
      }) : [],
      c: categoryMap[emoji.category] || 'Objects'
    };
  });

// Generate the output file
const outputPath = path.join(__dirname, '..', 'src', 'components', 'emoji-selector', 'data', 'emoji-full.ts');
const output = `export default ${JSON.stringify(convertedEmojis, null, 2)};\n`;

fs.writeFileSync(outputPath, output, 'utf8');

console.log(`Generated ${convertedEmojis.length} emojis to ${outputPath}`);
console.log(`\nSample emojis:`);
console.log(`  Salt: ${convertedEmojis.find(e => e.n === 'salt')?.e || 'Not found'}`);
console.log(`  Banana: ${convertedEmojis.find(e => e.n === 'banana')?.e || 'Not found'}`);
console.log(`  Coffee: ${convertedEmojis.find(e => e.n === 'coffee')?.e || 'Not found'}`);
