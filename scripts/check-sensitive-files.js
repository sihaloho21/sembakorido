const { execFileSync } = require('node:child_process');

const blockedPathPatterns = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)Paket Sembako - (claims|orders|pembelian|suppliers|biaya_bulanan|user_points|users)\.csv$/i,
  /(^|\/)docs\/run_sheet_stage1_3_.*token_provided.*\.json$/i,
  /(^|\/).*\.(?:export|backup)\.csv$/i
];

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const blocked = trackedFiles.filter((file) => blockedPathPatterns.some((pattern) => pattern.test(file)));

if (blocked.length > 0) {
  console.error('Sensitive files are tracked and must be removed:');
  blocked.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log(`Sensitive-file scan passed (${trackedFiles.length} tracked files checked).`);
