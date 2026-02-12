const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sources = [
  'assets/js/config.min.js',
  'assets/js/api-service.min.js',
  'assets/js/gas-actions.min.js',
  'assets/js/api-helper.min.js',
  'assets/js/payment-logic.min.js',
  'assets/js/paylater-logic.min.js',
  'assets/js/tiered-pricing-logic.min.js',
  'assets/js/image-slider.min.js',
  'assets/js/promo-banner-carousel.min.js',
  'assets/js/banner-carousel.min.js',
  'assets/js/sanitize.min.js',
  'assets/js/script.min.js'
];

const outFile = path.join(root, 'assets/js/index.bundle.js');

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
