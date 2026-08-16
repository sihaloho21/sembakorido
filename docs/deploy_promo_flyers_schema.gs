/**
 * Catalog Promo POP — Schema Deployment Script
 *
 * Jalankan fungsi runPromoFlyerSchemaDeployment() satu kali dari Apps Script
 * setelah source GAS utama terbaru sudah ditempelkan ke project aktif.
 *
 * Prasyarat:
 * 1. Script Property SPREADSHEET_ID berisi ID Google Spreadsheet target; atau
 * 2. Project Apps Script terikat langsung pada Spreadsheet target.
 *
 * Script ini idempotent: aman dijalankan berulang kali. Kolom yang sudah ada
 * tidak dihapus atau dipindahkan. Kolom yang hilang hanya ditambahkan di akhir.
 */

var PROMO_FLYER_SCHEMA_VERSION = '20260816.1';

var PROMO_FLYER_REQUIRED_HEADERS = [
  'id',
  'title',
  'slug',
  'subtitle',
  'description',
  'status',
  'theme',
  'layout',
  'store_name',
  'badge_text',
  'hero_image',
  'items_json',
  'start_at',
  'end_at',
  'published_at',
  'created_at',
  'updated_at',
  'created_by',
  'sort_order',
  'share_image_url',
  'pdf_url',
  'qr_url',
  'period_text',
  'footer_note',
  'show_watermark',
  'watermark_text',
  'show_qr_code',
  'banner_config_json',
  'grid_config_json'
];

function runPromoFlyerSchemaDeployment() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var spreadsheet = getPromoFlyerSpreadsheet_();
    var result = ensurePromoFlyerSchema_(spreadsheet, true);

    PropertiesService.getScriptProperties().setProperty(
      'PROMO_FLYER_SCHEMA_VERSION',
      PROMO_FLYER_SCHEMA_VERSION
    );

    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function verifyPromoFlyerSchema() {
  var spreadsheet = getPromoFlyerSpreadsheet_();
  var sheet = spreadsheet.getSheetByName('promo_flyers');
  var actualHeaders = sheet ? readPromoFlyerHeaders_(sheet) : [];
  var missing = PROMO_FLYER_REQUIRED_HEADERS.filter(function(header) {
    return actualHeaders.indexOf(header) === -1;
  });

  var result = {
    success: missing.length === 0,
    spreadsheet_id: spreadsheet.getId(),
    sheet_name: 'promo_flyers',
    schema_version: PropertiesService.getScriptProperties().getProperty('PROMO_FLYER_SCHEMA_VERSION') || '',
    actual_headers: actualHeaders,
    required_headers: PROMO_FLYER_REQUIRED_HEADERS.slice(),
    missing_headers: missing
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function ensurePromoFlyerSchema_(spreadsheet, repairMode) {
  var sheet = spreadsheet.getSheetByName('promo_flyers');
  var repaired = [];
  var missing = [];

  if (!sheet) {
    if (!repairMode) {
      return {
        success: false,
        repaired: [],
        missing: ['promo_flyers:sheet_missing']
      };
    }

    sheet = spreadsheet.insertSheet('promo_flyers');
    sheet.getRange(1, 1, 1, PROMO_FLYER_REQUIRED_HEADERS.length)
      .setValues([PROMO_FLYER_REQUIRED_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, PROMO_FLYER_REQUIRED_HEADERS.length)
      .setFontWeight('bold');
    repaired.push('promo_flyers:sheet_created');
    repaired.push('promo_flyers:headers_created');
  } else {
    var actualHeaders = readPromoFlyerHeaders_(sheet);

    if (!actualHeaders.length) {
      if (!repairMode) {
        missing.push('promo_flyers:headers_missing');
      } else {
        sheet.getRange(1, 1, 1, PROMO_FLYER_REQUIRED_HEADERS.length)
          .setValues([PROMO_FLYER_REQUIRED_HEADERS]);
        sheet.setFrozenRows(1);
        sheet.getRange(1, 1, 1, PROMO_FLYER_REQUIRED_HEADERS.length)
          .setFontWeight('bold');
        repaired.push('promo_flyers:headers_created');
      }
    } else {
      var missingHeaders = PROMO_FLYER_REQUIRED_HEADERS.filter(function(header) {
        return actualHeaders.indexOf(header) === -1;
      });

      if (missingHeaders.length && !repairMode) {
        missing.push('promo_flyers:missing=' + missingHeaders.join(','));
      }

      if (missingHeaders.length && repairMode) {
        var firstNewColumn = actualHeaders.length + 1;
        sheet.getRange(1, firstNewColumn, 1, missingHeaders.length)
          .setValues([missingHeaders]);
        repaired.push('promo_flyers:added=' + missingHeaders.join(','));
      }
    }
  }

  return {
    success: missing.length === 0,
    repaired: repaired,
    missing: missing,
    sheet_name: 'promo_flyers',
    schema_version: PROMO_FLYER_SCHEMA_VERSION,
    headers: readPromoFlyerHeaders_(sheet)
  };
}

function readPromoFlyerHeaders_(sheet) {
  if (!sheet || sheet.getLastColumn() < 1 || sheet.getLastRow() < 1) return [];

  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(value) {
      return String(value || '').trim().toLowerCase();
    })
    .filter(Boolean);
}

function getPromoFlyerSpreadsheet_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = String(properties.getProperty('SPREADSHEET_ID') || '').trim();

  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSpreadsheet) return activeSpreadsheet;

  throw new Error(
    'SPREADSHEET_ID belum diatur dan project Apps Script tidak terikat pada Spreadsheet.'
  );
}
