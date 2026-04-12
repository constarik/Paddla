const fs = require('fs');
let content = fs.readFileSync('C:/Users/const/ClaudeLab/registrar-server/server.js', 'utf8');

// Find the start marker and end marker
const startMarker = '// createInitialState, engineTick, sha256Hex imported at top via require(\'paddla-engine\')';
const endMarker = '// POST /verify/paddla — Full game verification with diagnostic event log';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found!', { startIdx, endIdx });
  process.exit(1);
}

// Replace everything between markers with empty line
const before = content.slice(0, startIdx + startMarker.length);
const after = content.slice(endIdx);
const result = before + '\n\n' + after;

fs.writeFileSync('C:/Users/const/ClaudeLab/registrar-server/server.js', result, 'utf8');
console.log('Done. Removed', endIdx - startIdx - startMarker.length, 'chars of embedded engine code.');
