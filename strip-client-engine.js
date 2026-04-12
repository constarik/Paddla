const fs = require('fs');
let content = fs.readFileSync('C:/Users/const/ClaudeLab/PADDLA/client/index.html', 'utf8');

const startMarker = '// ===== ENGINE (Input-Seeded Randomness) =====';
const endMarker = '// ===== GAME STATE =====';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found!', { startIdx, endIdx });
  process.exit(1);
}

const before = content.slice(0, startIdx);
const after = content.slice(endIdx);
// Replace inline engine with comment
const result = before + '// Engine loaded via <script src="engine/core.js">\n\n' + after;

fs.writeFileSync('C:/Users/const/ClaudeLab/PADDLA/client/index.html', result, 'utf8');
console.log('Removed', endIdx - startIdx, 'chars of inline engine code.');
