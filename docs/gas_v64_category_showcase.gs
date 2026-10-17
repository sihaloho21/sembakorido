/*
 * GAS v6.4 — Category Product Carousel (PRD phases 1–2)
 *
 * Apply to the connected Google Apps Script backend. This repository does not
 * contain the deployed GAS source, so this file is an auditable patch rather
 * than an automatic deployment.
 *
 * Required doGet routing (before generic sheet reads):
 *   if (String(e.parameter.action || '') === 'public_category_showcase_config') {
 *     return jsonOutput(handlePublicCategoryShowcaseConfig());
 *   }
 *
 * Required doPost routing (after authentication and before generic CRUD):
 *   if (String(payload.action || '') === 'upsert_setting' &&
 *       String(payload.data && payload.data.key || '') === 'category_showcase_config') {
 *     return jsonOutput(handleCategoryShowcaseUpsert(payload.data));
 *   }
 */

var CATEGORY_SHOWCASE_KEY = 'category_showcase_config';
var CATEGORY_SHOWCASE_MAX = 50;
var CATEGORY_SHOWCASE_ALLOWED_FIELDS = ['version', 'enabled', 'categories'];

function categoryShowcaseNormalizeLabel(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function validateCategoryShowcaseConfig(input) {
  var source = input || {};
  var raw = source.categories;
  if (!Array.isArray(raw)) raw = [];
  var seen = {};
  var categories = [];
  raw.slice(0, 100).forEach(function (row, index) {
    row = row || {};
    var category = categoryShowcaseNormalizeLabel(row.category);
    var key = category.toLowerCase();
    var max = Number(row.max_products);
    if (!category || seen[key] || !Number.isInteger(max) || max < 1 || max > CATEGORY_SHOWCASE_MAX) return;
    seen[key] = true;
    categories.push({
      category: category,
      enabled: row.enabled === true || String(row.enabled).toLowerCase() === 'true',
      sort_order: Number.isInteger(Number(row.sort_order)) ? Number(row.sort_order) : index + 1,
      max_products: max
    });
  });
  categories.sort(function (a, b) { return a.sort_order - b.sort_order; });
  return {
    version: Number(source.version) || 1,
    enabled: source.enabled === true || String(source.enabled).toLowerCase() === 'true',
    categories: categories
  };
}

function readCategoryShowcaseConfig() {
  var sheet = getSheet('settings');
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return validateCategoryShowcaseConfig({});
  var headers = values[0];
  var keyIndex = headers.indexOf('key');
  var valueIndex = headers.indexOf('value');
  if (keyIndex < 0 || valueIndex < 0) return validateCategoryShowcaseConfig({});
  for (var i = values.length - 1; i >= 1; i -= 1) {
    if (String(values[i][keyIndex] || '').trim() !== CATEGORY_SHOWCASE_KEY) continue;
    try { return validateCategoryShowcaseConfig(JSON.parse(String(values[i][valueIndex] || '{}'))); }
    catch (error) { return validateCategoryShowcaseConfig({}); }
  }
  return validateCategoryShowcaseConfig({});
}

function handlePublicCategoryShowcaseConfig() {
  var config = readCategoryShowcaseConfig();
  return {
    success: true,
    config: {
      version: config.version,
      enabled: config.enabled,
      categories: config.categories.map(function (row) {
        return { category: row.category, enabled: row.enabled, sort_order: row.sort_order, max_products: row.max_products };
      })
    },
    cache_ttl_seconds: 300
  };
}

function handleCategoryShowcaseUpsert(data) {
  if (!data || String(data.key || '').trim() !== CATEGORY_SHOWCASE_KEY) {
    return { success: false, error: 'invalid category showcase key' };
  }
  var parsed;
  try { parsed = JSON.parse(String(data.value || '{}')); }
  catch (error) { return { success: false, error: 'invalid JSON configuration' }; }
  var config = validateCategoryShowcaseConfig(parsed);
  var sheet = getSheet('settings');
  var values = sheet.getDataRange().getValues();
  if (!values || values.length === 0) return { success: false, error: 'settings sheet has no header' };
  var headers = values[0];
  var keyIndex = headers.indexOf('key');
  var valueIndex = headers.indexOf('value');
  if (keyIndex < 0 || valueIndex < 0) return { success: false, error: 'settings header must contain key,value' };
  var serialized = JSON.stringify(config);
  var targetRow = -1;
  for (var i = values.length - 1; i >= 1; i -= 1) {
    if (String(values[i][keyIndex] || '').trim() === CATEGORY_SHOWCASE_KEY) { targetRow = i + 1; break; }
  }
  if (targetRow < 0) {
    var row = headers.map(function (header) { return header === 'key' ? CATEGORY_SHOWCASE_KEY : (header === 'value' ? serialized : ''); });
    sheet.appendRow(row);
    return { success: true, mode: 'create', key: CATEGORY_SHOWCASE_KEY, value: serialized };
  }
  sheet.getRange(targetRow, valueIndex + 1).setValue(serialized);
  return { success: true, mode: 'update', key: CATEGORY_SHOWCASE_KEY, row: targetRow, value: serialized };
}

/* Security gate for the backend review:
 * public_category_showcase_config must never call the generic settings read
 * route or return any other key. Keep this allowlist-only response shape.
 */
