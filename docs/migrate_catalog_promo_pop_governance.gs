/**
 * Catalog Promo POP — Production Governance Migration
 *
 * Jalankan melalui Apps Script editor setelah gas_v63_blog_support.gs terbaru
 * sudah ditempelkan ke project aktif. Semua operasi idempotent dan append-only.
 *
 * Prasyarat:
 * - Script Property SPREADSHEET_ID, atau project terikat ke Spreadsheet.
 * - ADMIN_TOKEN tersedia sebagai Script Property ADMIN_TOKEN. Token tidak pernah
 *   ditulis ke Spreadsheet; hanya SHA-256 hash yang disimpan.
 */

var CATALOG_POP_GOVERNANCE_SCHEMA_VERSION = '20260826.1';

var CATALOG_POP_GOVERNANCE_SCHEMAS = {
  promo_flyers: [
    'id', 'title', 'slug', 'subtitle', 'description', 'status', 'theme', 'layout',
    'store_name', 'badge_text', 'hero_image', 'items_json', 'start_at', 'end_at',
    'published_at', 'created_at', 'updated_at', 'created_by', 'sort_order',
    'share_image_url', 'pdf_url', 'qr_url', 'period_text', 'footer_note',
    'show_watermark', 'watermark_text', 'show_qr_code', 'banner_config_json',
    'grid_config_json', 'visual_config_json', 'brochure_name', 'paper_size', 'orientation', 'template_id',
    'store_address', 'banner_url', 'disclaimer_text', 'show_service',
    'ppob_wallets_json', 'show_payment', 'show_disclaimer',
    'approval_status', 'current_version_id', 'approved_at', 'approved_by',
    'minimum_price_policy_id'
  ],
  promo_flyer_versions: [
    'id', 'campaign_id', 'version_no', 'snapshot_json', 'change_summary', 'status',
    'created_at', 'created_by', 'request_id', 'is_current'
  ],
  promo_flyer_approvals: [
    'id', 'campaign_id', 'version_id', 'from_status', 'to_status', 'decision_note',
    'actor', 'actor_role', 'created_at', 'request_id'
  ],
  promo_flyer_audit_logs: [
    'id', 'event_type', 'campaign_id', 'version_id', 'actor', 'actor_role',
    'request_id', 'details_json', 'created_at'
  ],
  promo_admin_users: [
    'id', 'email', 'display_name', 'role', 'token_hash', 'status', 'created_at',
    'updated_at', 'created_by'
  ],
  promo_role_permissions: [
    'id', 'role', 'permission', 'allowed', 'created_at', 'updated_at'
  ],
  promo_margin_policies: [
    'id', 'scope', 'scope_key', 'minimum_margin_percent', 'minimum_price', 'mode',
    'status', 'updated_at', 'updated_by'
  ]
};

var CATALOG_POP_DEFAULT_PERMISSIONS = [
  ['superadmin', 'promo.read', 'true', 'Membaca campaign, versi, approval, audit, dan asset.'],
  ['superadmin', 'promo.write', 'true', 'Membuat dan mengubah campaign POP.'],
  ['superadmin', 'promo.review', 'true', 'Mengirim, menyetujui, atau menolak review.'],
  ['superadmin', 'promo.publish', 'true', 'Mempublikasikan atau membatalkan publikasi.'],
  ['superadmin', 'promo.policy.manage', 'true', 'Mengubah kebijakan margin dan harga minimum.'],
  ['superadmin', 'promo.admin.manage', 'true', 'Mengelola admin dan role.'],
  ['manager', 'promo.read', 'true', 'Membaca data campaign dan governance.'],
  ['manager', 'promo.write', 'true', 'Membuat dan mengubah campaign POP.'],
  ['manager', 'promo.review', 'true', 'Mengirim atau menyetujui review.'],
  ['manager', 'promo.publish', 'true', 'Mempublikasikan campaign yang disetujui.'],
  ['manager', 'promo.policy.manage', 'false', 'Tidak dapat mengubah kebijakan margin global.'],
  ['manager', 'promo.admin.manage', 'false', 'Tidak dapat mengelola admin.'],
  ['operator', 'promo.read', 'true', 'Membaca campaign untuk operasional.'],
  ['operator', 'promo.write', 'false', 'Tidak dapat mengubah campaign.'],
  ['operator', 'promo.review', 'false', 'Tidak dapat mengubah workflow.'],
  ['operator', 'promo.publish', 'false', 'Tidak dapat mempublikasikan.'],
  ['operator', 'promo.policy.manage', 'false', 'Tidak dapat mengubah kebijakan margin.'],
  ['operator', 'promo.admin.manage', 'false', 'Tidak dapat mengelola admin.'],
  ['viewer', 'promo.read', 'true', 'Membaca data campaign.'],
  ['viewer', 'promo.write', 'false', 'Tidak dapat mengubah campaign.'],
  ['viewer', 'promo.review', 'false', 'Tidak dapat mengubah workflow.'],
  ['viewer', 'promo.publish', 'false', 'Tidak dapat mempublikasikan.'],
  ['viewer', 'promo.policy.manage', 'false', 'Tidak dapat mengubah kebijakan margin.'],
  ['viewer', 'promo.admin.manage', 'false', 'Tidak dapat mengelola admin.']
];

function migrateCatalogPromoPopGovernance() {
  return runCatalogPromoPopGovernanceMigration();
}

function runCatalogPromoPopGovernanceMigration() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var spreadsheet = catalogPromoPopGovernanceSpreadsheet_();
    var result = { success: true, schema_version: CATALOG_POP_GOVERNANCE_SCHEMA_VERSION, repaired: [], errors: [] };
    Object.keys(CATALOG_POP_GOVERNANCE_SCHEMAS).forEach(function(sheetName) {
      try {
        var outcome = ensureCatalogPopSheet_(spreadsheet, sheetName, CATALOG_POP_GOVERNANCE_SCHEMAS[sheetName]);
        result.repaired = result.repaired.concat(outcome.repaired);
      } catch (error) {
        result.success = false;
        result.errors.push(sheetName + ': ' + error.message);
      }
    });
    seedCatalogPromoPopPermissions_(spreadsheet, result);
    PropertiesService.getScriptProperties().setProperty('CATALOG_POP_GOVERNANCE_SCHEMA_VERSION', CATALOG_POP_GOVERNANCE_SCHEMA_VERSION);
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function verifyCatalogPromoPopGovernanceMigration() {
  var spreadsheet = catalogPromoPopGovernanceSpreadsheet_();
  var missing = [];
  var actual = {};
  Object.keys(CATALOG_POP_GOVERNANCE_SCHEMAS).forEach(function(sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    actual[sheetName] = sheet ? catalogPopHeaders_(sheet) : [];
    if (!sheet) missing.push(sheetName + ':sheet_missing');
    CATALOG_POP_GOVERNANCE_SCHEMAS[sheetName].forEach(function(header) {
      if (actual[sheetName].indexOf(header) === -1) missing.push(sheetName + ':' + header);
    });
  });
  var result = {
    success: missing.length === 0,
    schema_version: PropertiesService.getScriptProperties().getProperty('CATALOG_POP_GOVERNANCE_SCHEMA_VERSION') || '',
    spreadsheet_id: spreadsheet.getId(),
    missing: missing,
    headers: actual
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function seedCatalogPromoPopAdminAccess() {
  var spreadsheet = catalogPromoPopGovernanceSpreadsheet_();
  var token = catalogPromoPopConfiguredToken_();
  if (!token) throw new Error('ADMIN_TOKEN belum tersedia sebagai Script Property. Tidak ada token raw yang disimpan.');
  var sheet = spreadsheet.getSheetByName('promo_admin_users');
  if (!sheet) throw new Error('Jalankan runCatalogPromoPopGovernanceMigration() terlebih dahulu.');
  var headers = catalogPopHeaders_(sheet);
  var values = sheet.getDataRange().getValues();
  var hash = catalogPopSha256_(token);
  var exists = values.slice(1).some(function(row) { return String(row[headers.indexOf('token_hash')] || '') === hash; });
  if (exists) return { success: true, created: false, role: 'superadmin' };
  var now = new Date().toISOString();
  var record = {
    id: 'admin-master', email: '', display_name: 'Master Admin', role: 'superadmin',
    token_hash: hash, status: 'active', created_at: now, updated_at: now, created_by: 'migration'
  };
  sheet.appendRow(headers.map(function(header) { return record[header] === undefined ? '' : record[header]; }));
  return { success: true, created: true, role: 'superadmin' };
}

function setCatalogPromoPopRoleEnforcement(enabled) {
  var value = enabled === true || String(enabled).toLowerCase() === 'true';
  PropertiesService.getScriptProperties().setProperty('PROMO_POP_ROLE_ENFORCE', value ? 'true' : 'false');
  return { success: true, role_enforce: value };
}

function backfillCatalogPromoPopVersions() {
  var spreadsheet = catalogPromoPopGovernanceSpreadsheet_();
  var campaignSheet = spreadsheet.getSheetByName('promo_flyers');
  var versionSheet = spreadsheet.getSheetByName('promo_flyer_versions');
  if (!campaignSheet || !versionSheet) throw new Error('Jalankan migration schema terlebih dahulu.');
  var campaignHeaders = catalogPopHeaders_(campaignSheet);
  var versionHeaders = catalogPopHeaders_(versionSheet);
  var campaignRows = campaignSheet.getDataRange().getValues().slice(1);
  var existing = versionSheet.getDataRange().getValues().slice(1).map(function(row) {
    return String(row[versionHeaders.indexOf('campaign_id')] || '') + '|1';
  });
  var created = 0;
  campaignRows.forEach(function(row) {
    var campaign = catalogPopToObject_(campaignHeaders, row);
    var campaignId = String(campaign.id || '').trim();
    if (!campaignId || existing.indexOf(campaignId + '|1') !== -1) return;
    var now = new Date().toISOString();
    var record = {
      id: 'pfv-' + Date.now() + '-' + created,
      campaign_id: campaignId,
      version_no: 1,
      snapshot_json: JSON.stringify(campaign),
      change_summary: 'Initial version backfill',
      status: String(campaign.approval_status || campaign.status || 'draft').toLowerCase(),
      created_at: now,
      created_by: String(campaign.created_by || 'migration'),
      request_id: 'backfill-' + campaignId,
      is_current: 'true'
    };
    versionSheet.appendRow(versionHeaders.map(function(header) { return record[header] === undefined ? '' : record[header]; }));
    created++;
  });
  return { success: true, created: created };
}

function catalogPromoPopGovernanceSpreadsheet_() {
  var id = String(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '').trim();
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('SPREADSHEET_ID belum diatur dan project tidak terikat ke Spreadsheet.');
}

function ensureCatalogPopSheet_(spreadsheet, sheetName, requiredHeaders) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  var repaired = [];
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setFontWeight('bold');
    repaired.push(sheetName + ':sheet_created');
    repaired.push(sheetName + ':headers_created');
    return { repaired: repaired };
  }
  var actual = catalogPopHeaders_(sheet);
  if (!actual.length) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setFontWeight('bold');
    repaired.push(sheetName + ':headers_created');
    return { repaired: repaired };
  }
  var missing = requiredHeaders.filter(function(header) { return actual.indexOf(header) === -1; });
  if (missing.length) {
    sheet.getRange(1, actual.length + 1, 1, missing.length).setValues([missing]);
    repaired.push(sheetName + ':added=' + missing.join(','));
  }
  return { repaired: repaired };
}

function seedCatalogPromoPopPermissions_(spreadsheet, result) {
  var sheet = spreadsheet.getSheetByName('promo_role_permissions');
  if (!sheet) return;
  var headers = catalogPopHeaders_(sheet);
  var existing = sheet.getDataRange().getValues().slice(1).map(function(row) {
    return String(row[headers.indexOf('role')] || '') + '|' + String(row[headers.indexOf('permission')] || '');
  });
  var now = new Date().toISOString();
  CATALOG_POP_DEFAULT_PERMISSIONS.forEach(function(item, index) {
    var key = item[0] + '|' + item[1];
    if (existing.indexOf(key) !== -1) return;
    var record = {
      id: 'prp-' + item[0] + '-' + item[1].replace(/[^a-z0-9]+/gi, '-'),
      role: item[0],
      permission: item[1],
      allowed: item[2],
      description: item[3],
      created_at: now,
      updated_at: now,
      updated_by: 'migration'
    };
    sheet.appendRow(headers.map(function(header) { return record[header] === undefined ? '' : record[header]; }));
    result.repaired.push('promo_role_permissions:seeded=' + key);
  });
}

function catalogPopHeaders_(sheet) {
  if (!sheet || sheet.getLastColumn() < 1 || sheet.getLastRow() < 1) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) {
    return String(value || '').trim().toLowerCase();
  }).filter(Boolean);
}

function catalogPopToObject_(headers, row) {
  var object = {};
  headers.forEach(function(header, index) { object[header] = row[index] === undefined ? '' : row[index]; });
  return object;
}

function catalogPopConfiguredToken_() {
  var propertyToken = String(PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN') || '').trim();
  if (propertyToken) return propertyToken;
  return '';
}

function catalogPopSha256_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(function(byte) {
    var normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}
