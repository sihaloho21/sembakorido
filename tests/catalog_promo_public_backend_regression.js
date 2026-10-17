const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const gas = read('docs/gas_v63_blog_support.gs');
const schemaDeployment = read('docs/deploy_promo_flyers_schema.gs');
const publicCatalog = read('promo_katalog.html');
const sheetWhitelist = (gas.match(/const SHEET_WHITELIST = \[([\s\S]*?)\];/) || [])[1] || '';
const flyerSchema = (gas.match(/promo_flyers: \[([\s\S]*?)\n  \],/) || [])[1] || '';
const publicNormalizer = (gas.match(/function normalizePromoFlyerForPublic\(row\) \{([\s\S]*?)\n\}/) || [])[1] || '';

const removedFrontendFiles = [
  'admin/catalog-promo-pop.html',
  'admin/catalog-promo-pop-phase1.html',
  'admin/catalog-promo-pop-phase2.html',
  'admin/catalog-promo-pop-redesign.html',
  'admin/js/catalog-promo-pop.js',
  'admin/js/catalog-promo-pop-phase1.js',
  'admin/js/catalog-promo-pop-phase2.js',
  'admin-brosur.html',
  'assets/js/brosur.js'
];

const checks = [
  ['all removed promo/brochure admin pages and controllers are absent', removedFrontendFiles.every((file) => !exists(file))],
  ['promo and brochure links are absent from active admin navigation', !/admin-brosur\.html|catalog-promo-pop(?:-[\w-]+)?\.html/.test(read('admin/index.html') + read('admin-produk.html'))],
  ['public promo-flyer GET route remains available', /action === 'public_promo_flyers'[\s\S]*?handlePublicPromoFlyers/.test(gas)],
  ['public endpoint continues filtering to published campaigns within dates', /function isPromoFlyerCurrentlyActive[\s\S]*?status[\s\S]*?published[\s\S]*?start_at[\s\S]*?end_at/.test(gas)],
  ['public response uses an explicit field allowlist and parses product items', /publicFields = \[[\s\S]*?visual_config_json[\s\S]*?items_json/.test(publicNormalizer) && /result\.items = parsePromoFlyerItems/.test(publicNormalizer)],
  ['private approval and pricing-policy fields are not returned publicly', !/approval_status|current_version_id|minimum_price_policy_id|token_hash/.test(publicNormalizer)],
  ['promo_flyers is no longer exposed through generic spreadsheet CRUD', !/promo_flyers|promo_flyer_versions|promo_flyer_approvals|promo_flyer_audit_logs|promo_role_permissions|promo_margin_policies/.test(sheetWhitelist)],
  ['obsolete publish and governance actions are removed from GAS routes', !/promo_flyer_publish|promo_flyer_unpublish|promo_governance_|handlePromoFlyerSetStatus|handlePromoGovernance/.test(gas)],
  ['obsolete write-boundary and governance helpers are removed', !/validatePromoFlyerWriteAtBoundary_|validatePromoFlyerPriceCandidate_|promoGovernance/.test(gas)],
  ['public schema retains visual settings used by the public renderer', /visual_config_json/.test(flyerSchema) && /grid_config_json/.test(flyerSchema) && /ppob_wallets_json/.test(flyerSchema)],
  ['brochure-generator-only campaign columns are no longer required', !/brochure_name|paper_size|orientation|template_id|store_address|banner_url/.test(flyerSchema)],
  ['shared admin-user authentication schema remains available', /promo_admin_users: \[[\s\S]*?token_hash/.test(gas) && /'promo_admin_users'/.test(sheetWhitelist)],
  ['schema deployment helper is public-only and retains visual config', /visual_config_json/.test(schemaDeployment) && !/brochure_name|paper_size|orientation|template_id|store_address|banner_url/.test(schemaDeployment)],
  ['obsolete governance migration is removed from active source', !exists('docs/migrate_catalog_promo_pop_governance.gs')],
  ['public promo catalog continues requesting and rendering POP campaigns', /async function fetchPublicPromoFlyers[\s\S]*?public_promo_flyers/.test(publicCatalog) && /function normalizePromoFlyer\(/.test(publicCatalog)]
];

const failed = checks.filter(([, ok]) => !ok);
checks.forEach(([label, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`));
if (failed.length) {
  console.error(`\n${failed.length} regression check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} regression checks passed.`);
