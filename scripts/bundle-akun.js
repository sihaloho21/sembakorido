const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sources = [
  'assets/js/sanitize.min.js',
  'assets/js/script.min.js',
  'assets/js/akun.min.js'
];

const outFile = path.join(root, 'assets/js/akun.bundle.js');

const parts = sources.map((relPath) => {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing bundle source: ${relPath}`);
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  return `\n/* ===== ${relPath} ===== */\n${content}\n`;
});

fs.writeFileSync(outFile, parts.join('\n'), 'utf8');
console.log(`Bundled ${sources.length} files -> ${path.relative(root, outFile)}`);
