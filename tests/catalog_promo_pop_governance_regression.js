const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const adminIndex = read('admin/index.html');
const gasActions = read('assets/js/gas-actions.js');
const gas = read('docs/gas_v63_blog_support.gs');
const migration = read('docs/migrate_catalog_promo_pop_governance.gs');
const publicCatalog = read('promo_katalog.html');

const removedFrontendFiles = [
  'admin/catalog-promo-pop.html',
  'admin/catalog-promo-pop-phase1.html',
  'admin/catalog-promo-pop-phase2.html',
  'admin/catalog-promo-pop-redesign.html',
  'admin/js/catalog-promo-pop.js',
  'admin/js/catalog-promo-pop-phase1.js',
  'admin/js/catalog-promo-pop-phase2.js'
];

const checks = [
  ['admin navigation no longer links to Catalog Promo POP', !/href=["']catalog-promo-pop(?:-[^"']+)?\.html["']/.test(adminIndex)],
  ['all Catalog Promo POP admin pages and controllers are removed', removedFrontendFiles.every((file) => !exists(file))],
  ['structured GAS errors continue preserving backend payloads', /error\.code = String\(result\.error\)[\s\S]*?error\.payload = result/.test(gasActions)],
  ['Google Apps Script retains public promo-flyer handling', /action === 'public_promo_flyers'/.test(gas)],
  ['Google Apps Script retains write-boundary price validation', /function validatePromoFlyerWriteAtBoundary_[\s\S]*?validatePromoFlyerPriceCandidate_/.test(gas)],
  ['Google Apps Script still blocks publishing without approval', /PROMO_APPROVAL_REQUIRED/.test(gas)],
  ['governance migration retains canonical role-permission columns', /promo_role_permissions:[\s\S]*?'id', 'role', 'permission', 'allowed', 'created_at', 'updated_at'/.test(migration)],
  ['governance migration retains deterministic permission IDs', /id: 'prp-'/.test(migration)],
  ['public promo catalog still requests published flyer data', /async function fetchPublicPromoFlyers[\s\S]*?public_promo_flyers/.test(publicCatalog)],
  ['public promo catalog renderer remains available', /function normalizePromoFlyer/.test(publicCatalog) && /promo_flyer/.test(publicCatalog)]
];

const failed = checks.filter(([, ok]) => !ok);
checks.forEach(([label, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`));
if (failed.length) {
  console.error(`\n${failed.length} regression check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} regression checks passed.`);
