const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pop = fs.readFileSync(path.join(root, 'admin/js/catalog-promo-pop.js'), 'utf8');
const gasActions = fs.readFileSync(path.join(root, 'assets/js/gas-actions.js'), 'utf8');
const gas = fs.readFileSync(path.join(root, 'docs/gas_v63_blog_support.gs'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'docs/migrate_catalog_promo_pop_governance.gs'), 'utf8');
const html = fs.readFileSync(path.join(root, 'admin/catalog-promo-pop.html'), 'utf8');
const publicHtml = fs.readFileSync(path.join(root, 'promo_katalog.html'), 'utf8');

const checks = [
  ['bulk pricing has write permission guard', /function applyBulkPricing[\s\S]*?requirePromoPermission\('promo\.write'/.test(pop)],
  ['bulk reset has write permission guard and minimum validation', /function resetBulkPricing[\s\S]*?requirePromoPermission\('promo\.write'[\s\S]*?validateMinimumPrices/.test(pop)],
  ['direct product price input is guarded and rolled back', /data-promo-price[\s\S]*?enforceItemMinimumPrice/.test(pop)],
  ['brochure promo input is guarded and rolled back', /data-brochure-promo[\s\S]*?enforceItemMinimumPrice/.test(pop)],
  ['restore path validates minimum prices before mutating state', /function restoreCampaignItems[\s\S]*?validateMinimumPrices[\s\S]*?state\.selectedItems = new Map/.test(pop)],
  ['save path performs final minimum-price validation', /async function saveCampaign[\s\S]*?syncBrochureFieldsFromDom\(\)[\s\S]*?validateMinimumPrices/.test(pop)],
  ['boot loads governance context before production data', /async function boot[\s\S]*?await loadGovernanceContext\('\'[\s\S]*?fetchProducts/.test(pop)],
  ['publish path checks publish permission', /async function toggleCampaign[\s\S]*?requirePromoPermission\('promo\.publish'/.test(pop)],
  ['structured GAS errors preserve backend payload', /error\.code = String\(result\.error\)[\s\S]*?error\.payload = result/.test(gasActions)],
  ['canonical backend enforces write-boundary price validation', /function validatePromoFlyerWriteAtBoundary_[\s\S]*?validatePromoFlyerPriceCandidate_/.test(gas)],
  ['canonical backend blocks publish without approval', /PROMO_APPROVAL_REQUIRED/.test(gas)],
  ['migration contains canonical role-permission columns', /promo_role_permissions:[\s\S]*?'id', 'role', 'permission', 'allowed', 'created_at', 'updated_at'/.test(migration)],
  ['migration seeds deterministic permission ids', /id: 'prp-'/.test(migration)],
  ['production page keeps A4 portrait invariants', /A4 Portrait[\s\S]*?0,4 cm/.test(html) && /promo-pop-paper/.test(html) && /promo-pop-orientation/.test(html)],
  ['production page loads GAS adapter before POP controller', /gas-actions\.js[\s\S]*?catalog-promo-pop\.js/.test(html)],
  ['admin and public use semantic strike-through markup', /<del class="strike-price"/.test(pop) && /<del class="strike-price"/.test(publicHtml)],
  ['admin and public apply explicit strike-through CSS', /\.flyer-item-normal \.strike-price[\s\S]*?text-decoration-line:line-through/.test(html) && /\.pk-pop-preview-normal \.strike-price[\s\S]*?text-decoration-line:line-through/.test(publicHtml)],
  ['PNG and PDF capture the same rendered preview DOM', /async function generatePdf[\s\S]*?html2canvas\(preview/.test(pop) && /async function generatePng[\s\S]*?html2canvas\(preview/.test(pop)],
  ['print preview captures the same rendered preview DOM', /async function openPrintPreview[\s\S]*?html2canvas\(preview/.test(pop)]
];

const failed = checks.filter(([, ok]) => !ok);
checks.forEach(([label, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`));
if (failed.length) {
  console.error(`\n${failed.length} regression check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} regression checks passed.`);
