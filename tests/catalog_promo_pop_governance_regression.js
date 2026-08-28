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
  ['public preview applies persisted product-image background OFF state', publicHtml.includes('showImageBackground') && publicHtml.includes('pk-pop-image-background-off')],
  ['featured product tile persists and expands visual emphasis', pop.includes('is_featured: state.featuredIds.has') && html.includes('is-featured:not(.flyer-retail-tile)') && publicHtml.includes('pk-pop-is-featured:not(.pk-pop-retail-tile)')],
  ['semantic promo badge types persist and render publicly', pop.includes('badge_type: brochureBadgeType') && pop.includes('data-promo-badge-type') && publicHtml.includes('badgeType') && publicHtml.includes('pk-pop-badge-type-')],
  ['promotion mechanics persist and render quantity labels', pop.includes('promo_mechanic: brochureMechanic') && pop.includes('data-promo-mechanic') && pop.includes('data-promo-quantity') && publicHtml.includes('promoMechanic')],
  ['saving calculator derives amount and percentage', pop.includes('function brochureSaving') && publicHtml.includes('savingPercent') && publicHtml.includes('savingAmount')],
  ['configurable price panel persists and renders publicly', pop.includes('pricePanelColor') && pop.includes('pricePanelShape') && pop.includes('pricePanelLabel') && publicHtml.includes('pk-pop-price-panel-')],
  ['safe-area validator warns without blocking freeform overlap', pop.includes('function updateSafeAreaStatus') && pop.includes('safeAreaValidator') && pop.includes('dataset.safeArea')],
  ['footer channels and ornaments persist in visual settings', pop.includes('footerChannels') && pop.includes('ornamentsEnabled') && html.includes('promo-pop-footer-channels') && html.includes('promo-pop-ornaments')],
  ['public renderer mirrors footer channels and ornament settings', publicHtml.includes('footerChannels') && publicHtml.includes('ornamentsEnabled') && publicHtml.includes('pk-pop-campaign-ornament')],
  ['public renderer supports configurable category section styles', publicHtml.includes('sectionStyle') && publicHtml.includes('pk-pop-section-band') && publicHtml.includes('pk-pop-section-minimal')],
  ['Campaign Identity Studio fields persist and restore', pop.includes('campaignType') && pop.includes('campaignMood') && pop.includes('campaignAudience') && pop.includes('headlineVariant') && pop.includes('trustSignal')],
  ['Campaign Identity Studio controls are present in section 01', html.includes('promo-pop-campaign-type') && html.includes('promo-pop-campaign-mood') && html.includes('promo-pop-campaign-audience') && html.includes('promo-pop-headline-variant')],
  ['campaign mood and type classes reach admin preview', pop.includes('flyer-mood-') && pop.includes('flyer-campaign-type-') && pop.includes('identityHeadline')],
  ['public renderer mirrors campaign identity and headline variants', publicHtml.includes('campaignMood') && publicHtml.includes('identityHeadline') && publicHtml.includes('pk-pop-mood-') && publicHtml.includes('pk-pop-identity-signals')],
  ['instant campaign identity presets define Retail Aggressive, Premium, and Seasonal', pop.includes('CAMPAIGN_IDENTITY_PRESETS') && pop.includes("'retail-aggressive'") && pop.includes('premium:') && pop.includes('seasonal:')],
  ['instant preset controls are present in the Campaign Identity Studio', html.includes('data-campaign-identity-preset="retail-aggressive"') && html.includes('data-campaign-identity-preset="premium"') && html.includes('data-campaign-identity-preset="seasonal"')],
  ['instant presets apply grouped identity and visual settings', pop.includes('function applyCampaignIdentityPreset') && pop.includes('applyVisualPreset(preset.visualPreset, false)') && pop.includes('updateCampaignIdentityPresetButtons')],
  ['instant preset buttons are wired to the admin event flow', pop.includes("[data-campaign-identity-preset]") && pop.includes('applyCampaignIdentityPreset(button.dataset.campaignIdentityPreset)')],
  ['output presets define print and digital starting points', pop.includes('OUTPUT_PRESETS') && pop.includes('a4-retail-flyer') && pop.includes('instagram-square') && pop.includes('whatsapp-story')],
  ['output preset controls are present in Section 02', html.includes('data-output-preset="a4-retail-flyer"') && html.includes('data-output-preset="instagram-square"') && html.includes('data-output-preset="whatsapp-story"')],
  ['print and digital profiles are separated while A4 remains print standard', html.includes('promo-pop-output-profile') && pop.includes("profile === 'print'") && /generatePdf[\s\S]*format: 'a4'/.test(pop) && /openPrintPreview[\s\S]*outputField\) outputField\.value = 'a4'/.test(pop)],
  ['margins default to 0.4 cm and persist in visual config', html.includes('promo-pop-margin-top') && html.includes('value="0.4"') && pop.includes('marginTop') && pop.includes('marginLeft') && pop.includes('visual_config_json: JSON.stringify(readVisualSettings())')],
  ['safe-area display and non-blocking validation are both wired', html.includes('promo-pop-safe-area-display') && pop.includes('safeAreaDisplay') && pop.includes('flyer-safe-area-guide') && pop.includes('updateSafeAreaStatus')],
  ['density presets map to grid dimensions and manual edits become Custom', pop.includes('OUTPUT_DENSITY_PRESETS') && pop.includes('applyDensityPreset') && pop.includes("density: 'custom'") && html.includes('promo-pop-density')],
  ['public renderer mirrors profile, density, margins, and safe-area display', publicHtml.includes('outputProfile') && publicHtml.includes('density') && publicHtml.includes('marginTop') && publicHtml.includes('pk-pop-safe-area-guide') && publicHtml.includes('pk-pop-density-')],
  ['promo badge is rendered outside the product image element', /flyer-item-badge-shelf[\s\S]*flyer-retail-media/.test(pop) && !/flyer-retail-media[^<]*>[\s\S]*flyer-item-badge/.test(pop)],
  ['detached badge shelf has independent spacing and stacking', html.includes('.flyer-item-badge-shelf') && html.includes('top:-75px') && html.includes('right:8px') && html.includes('z-index:6')]
];

const failed = checks.filter(([, ok]) => !ok);
checks.forEach(([label, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`));
if (failed.length) {
  console.error(`\n${failed.length} regression check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} regression checks passed.`);

if (require.main === module) process.exit(0);
