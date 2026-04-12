const fs = require('fs');
let content = fs.readFileSync('C:/Users/const/ClaudeLab/PADDLA/client/index.html', 'utf8');

// Find and replace the verifyBtn click handler
const oldStart = "document.getElementById('verifyBtn').addEventListener('click', async () => {";
const oldEnd = "});";

const startIdx = content.indexOf(oldStart);
if (startIdx === -1) { console.error('verifyBtn handler not found'); process.exit(1); }

// Find the matching closing });
let depth = 0;
let endIdx = startIdx;
for (let i = startIdx; i < content.length - 1; i++) {
  if (content[i] === '{') depth++;
  if (content[i] === '}') depth--;
  if (depth === 0 && content.slice(i, i+3) === '});') {
    endIdx = i + 3;
    break;
  }
}

const newHandler = `async function verifyLocal() {
  if (!lastVerificationData?.regSeed) return;
  const vd = lastVerificationData;
  try {
    const { bytes } = buildWasm(vd.regSeed);
    const wasmMod = await WebAssembly.compile(bytes.buffer);
    const wasmInst = await WebAssembly.instantiate(wasmMod);
    const localResult = wasmInst.exports.compute(vd.gameSeed) >>> 0;
    if (localResult === vd.wasmResult) {
      document.getElementById('verifyLocal').innerHTML = '<span style="color:#00ff66">✓ LOCAL VERIFIED! WASM rebuilt independently.</span>';
    } else {
      document.getElementById('verifyLocal').innerHTML = \`<span style="color:#ff4444">❌ Mismatch! Local: 0x\${localResult.toString(16)} vs Recorded: 0x\${vd.wasmResult.toString(16)}</span>\`;
    }
  } catch (err) {
    document.getElementById('verifyLocal').innerHTML = \`<span style="color:#ff4444">❌ Error: \${err.message}</span>\`;
  }
}

document.getElementById('verifyBtn').addEventListener('click', verifyLocal);`;

content = content.slice(0, startIdx) + newHandler + content.slice(endIdx);
fs.writeFileSync('C:/Users/const/ClaudeLab/PADDLA/client/index.html', content, 'utf8');
console.log('Done. Replaced verifyBtn handler with verifyLocal function.');
