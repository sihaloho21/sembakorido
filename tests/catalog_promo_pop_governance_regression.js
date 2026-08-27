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
  ['boot loads governance context before production data', /async function boot[\s\S]*?await loadGovernanceContext\('[^']*'[\s\S]*?fetchProducts/.test(pop)],
  ['publish path checks publish permission', /async function toggleCampaign[\s\S]*?requirePromoPermission\('promo\.publish'/.test(pop)],
  ['structured GAS errors preserve backend payload', /error\.code = String\(result\.error\)[\s\S]*?error\.payload = result/.test(gasActions)],
  ['canonical backend enforces write-boundary price validation', /function validatePromoFlyerWriteAtBoundary_[\s\S]*?validatePromoFlyerPriceCandidate_/.test(gas)],
  ['canonical backend blocks publish without approval', /PROMO_APPROVAL_REQUIRED/.test(gas)],
  ['migration contains canonical role-permission columns', /promo_role_permissions:[\s\S]*?'id', 'role', 'permission', 'allowed', 'created_at', 'updated_at'/.test(migration)],
  ['migration seeds deterministic permission ids', /id: 'prp-'/.test(migration)],
  ['production page keeps A4 portrait invariants', /A4 Portrait[\s\S]*?0,4 cm/.test(html) && /promo-pop-paper/.test(html) && /promo-pop-orientation/.test(html)],
  ['production page loads GAS adapter before POP controller', /gas-actions\.js[\s\S]*?catalog-promo-pop\.js/.test(html)],
  ['admin and public use semantic strike-through markup', /<del class="strike-price"/.test(pop) && /<del class="strike-price"/.test(publicHtml)],
  ['admin and public apply explicit strike-through CSS', /\.strike-price::after[\s\S]*?top:50%[\s\S]*?background:currentColor/.test(html) && /\.strike-price::after[\s\S]*?top:50%[\s\S]*?background:currentColor/.test(publicHtml)],
  ['PNG and PDF capture the same rendered preview DOM', /async function generatePdf[\s\S]*?html2canvas\(preview/.test(pop) && /async function generatePng[\s\S]*?html2canvas\(preview/.test(pop)],
  ['print preview captures the same rendered preview DOM', /async function openPrintPreview[\s\S]*?html2canvas\(preview/.test(pop)],
  ['Retail Tile renders a corner resize handle', /data-tile-resize/.test(pop) && /flyer-tile-resize-handle/.test(pop)],
  ['Retail Tile resize uses a locked scale range and proportional transform', /tileSizeForProduct[\s\S]*?Math\.min\(1\.8, Math\.max\(\.65/.test(pop) && /flyer-retail-tile[\s\S]*?transform:scale\(var\(--retail-tile-scale/.test(html)],
  ['Retail Tile resize enforces canvas bounds while allowing overlap', /const inside = tileRect\.left >= boundsRect\.left[\s\S]*?if \(!inside\)/.test(pop)],
  ['Retail Tile sizes persist through campaign save and restore', /tile_sizes: normalizeTileSizes\(state\.tileSizes\)/.test(pop) && /state\.tileSizes = normalizeTileSizes\(gridConfig\.tile_sizes\)/.test(pop)],
  ['public renderer applies persisted Retail Tile scale', /tileSizes: normalizeTileSizes\(gridConfig\.tile_sizes\)/.test(publicHtml) && /--pk-pop-retail-tile-scale/.test(publicHtml)],
  ['freeform element resize controls present', pop.includes('data-element-resize') || html.includes('flyer-element-resize-handle')],
  ['tile anchors persist', pop.includes('normalizeTileAnchors') && pop.includes('tile_anchors')],
  ['multi-direction element resize states present', pop.includes('is-element-resizing') && html.includes('flyer-element-resize-nw')],
  ['freeform resize allows overlap while enforcing canvas bounds', pop.includes('if (!inside)') && !pop.includes("const overlaps = Array.from(bounds.querySelectorAll('.flyer-retail-tile'))")],
  ['public renderer receives tile anchors', publicHtml.includes('normalizeTileAnchors') && publicHtml.includes('pk-pop-retail-tile-offset-x')],
  ['product-image background toggle is persisted and restored', pop.includes('showImageBackground') && pop.includes('promo-pop-image-background')],
  ['admin preview applies product-image background OFF state', html.includes('flyer-image-background-off') && pop.includes('flyer-image-background-off')],
  ['public preview applies persisted product-image background OFF state', publicHtml.includes('showImageBackground') && publicHtml.includes('pk-pop-image-background-off')]
];

const failed = checks.filter(([, ok]) => !ok);
checks.forEach(([label, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`));
if (failed.length) {
  console.error(`\n${failed.length} regression check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} regression checks passed.`);

if (require.main === module) process.exit(0);
