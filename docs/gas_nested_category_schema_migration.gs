/**
 * Nested Category Schema Migration — schema-only, idempotent, locked.
 *
 * Tujuan:
 * - Menambahkan header baru tanpa memindahkan atau menghapus header lama.
 * - Membuat backup spreadsheet sebelum perubahan.
 * - Mencegah dua proses migration berjalan bersamaan dengan ScriptLock.
 * - Tidak mengisi parent_id, sort_order, is_active, atau kategori_id.
 * - Tidak mengubah category_showcase_config.
 *
 * SETUP WAJIB:
 * 1. Simpan ID spreadsheet target pada Script Properties dengan key:
 *      NESTED_CATEGORY_SPREADSHEET_ID
 * 2. Pastikan nama sheet sesuai NESTED_CATEGORY_SCHEMA_CONFIG.
 * 3. Jalankan previewNestedCategorySchema() terlebih dahulu.
 * 4. Tinjau log preview dan backup target.
 * 5. Jalankan applyNestedCategorySchema({
 *      confirmation: 'APPLY_NESTED_CATEGORY_SCHEMA'
 *    }) hanya setelah mendapat otorisasi eksplisit.
 *
 * Skrip ini hanya menambahkan header schema. Mapping data produk adalah tahap
 * terpisah dan tidak dijalankan oleh applyNestedCategorySchema().
 */

const NESTED_CATEGORY_SCHEMA_CONFIG = Object.freeze({
  spreadsheetIdProperty: 'NESTED_CATEGORY_SPREADSHEET_ID',
  categoriesSheetName: 'categories',
  productsSheetName: 'products',
  backupFolderIdProperty: 'NESTED_CATEGORY_BACKUP_FOLDER_ID',
  confirmation: 'APPLY_NESTED_CATEGORY_SCHEMA',
  lockTimeoutMs: 30000,
  categoriesHeaders: ['parent_id', 'sort_order', 'is_active'],
  productsHeaders: ['kategori_id']
});

/**
 * Read-only preview. Tidak menulis spreadsheet dan tidak membuat backup.
 * Jalankan dari Apps Script editor untuk melihat hasil di Execution log.
 *
 * @return {Object} ringkasan preview
 */
function previewNestedCategorySchema() {
  const context = getNestedCategoryMigrationContext_();
  const report = buildNestedCategorySchemaPreview_(context);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Menambahkan header schema secara aman dan idempotent.
 *
 * Konfirmasi eksplisit diwajibkan agar fungsi tidak dapat dijalankan
 * tanpa sengaja dari menu atau trigger.
 *
 * @param {Object=} options
 * @param {string} options.confirmation harus sama dengan nilai konfigurasi
 * @param {boolean=} options.createBackup default true
 * @return {Object} hasil migration dan verifikasi
 */
function applyNestedCategorySchema(options) {
  const settings = options || {};
  if (settings.confirmation !== NESTED_CATEGORY_SCHEMA_CONFIG.confirmation) {
    throw new Error(
      'Migration dihentikan: confirmation wajib bernilai ' +
      NESTED_CATEGORY_SCHEMA_CONFIG.confirmation
    );
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(NESTED_CATEGORY_SCHEMA_CONFIG.lockTimeoutMs)) {
    throw new Error('Migration dihentikan: ScriptLock tidak tersedia. Coba lagi setelah proses lain selesai.');
  }

  try {
    const context = getNestedCategoryMigrationContext_();
    const before = buildNestedCategorySchemaPreview_(context);

    if (before.validation.errors.length > 0) {
      throw new Error('Migration dihentikan karena validasi gagal: ' + before.validation.errors.join('; '));
    }

    const missing = before.schema.missing;
    const nothingToChange = missing.categories.length === 0 && missing.products.length === 0;
    let backup = null;

    if (!nothingToChange && settings.createBackup !== false) {
      backup = createNestedCategoryBackup_(context);
    }

    const categoriesResult = ensureHeaders_(
      context.categoriesSheet,
      NESTED_CATEGORY_SCHEMA_CONFIG.categoriesHeaders
    );
    const productsResult = ensureHeaders_(
      context.productsSheet,
      NESTED_CATEGORY_SCHEMA_CONFIG.productsHeaders
    );

    const after = buildNestedCategorySchemaPreview_(context);
    if (after.schema.missing.categories.length || after.schema.missing.products.length) {
      throw new Error('Verifikasi gagal: masih ada header schema yang belum tersedia setelah migration.');
    }

    const result = {
      success: true,
      mode: 'schema-only',
      changed: !nothingToChange,
      backup: backup,
      added: {
        categories: categoriesResult.added,
        products: productsResult.added
      },
      before: before.schema,
      after: after.schema,
      writes: {
        categories_rows_changed: 0,
        products_rows_changed: 0,
        category_showcase_config_changed: false
      }
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Opsional: menambahkan menu manual di spreadsheet. Menu ini hanya membuka
 * preview; apply tetap harus dipanggil dengan confirmation eksplisit dari editor.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Nested Category Schema')
    .addItem('Preview schema', 'previewNestedCategorySchema')
    .addToUi();
}

function getNestedCategoryMigrationContext_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = String(properties.getProperty(
    NESTED_CATEGORY_SCHEMA_CONFIG.spreadsheetIdProperty
  ) || '').trim();

  if (!spreadsheetId) {
    throw new Error(
      'Script Property ' + NESTED_CATEGORY_SCHEMA_CONFIG.spreadsheetIdProperty +
      ' belum diatur. Tidak ada spreadsheet target yang dipilih.'
    );
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const categoriesSheet = spreadsheet.getSheetByName(NESTED_CATEGORY_SCHEMA_CONFIG.categoriesSheetName);
  const productsSheet = spreadsheet.getSheetByName(NESTED_CATEGORY_SCHEMA_CONFIG.productsSheetName);

  if (!categoriesSheet) {
    throw new Error('Sheet categories tidak ditemukan pada spreadsheet target.');
  }
  if (!productsSheet) {
    throw new Error('Sheet products tidak ditemukan pada spreadsheet target.');
  }

  return { spreadsheet, spreadsheetId, categoriesSheet, productsSheet };
}

function buildNestedCategorySchemaPreview_(context) {
  const categories = inspectSheetSchema_(
    context.categoriesSheet,
    NESTED_CATEGORY_SCHEMA_CONFIG.categoriesHeaders
  );
  const products = inspectSheetSchema_(
    context.productsSheet,
    NESTED_CATEGORY_SCHEMA_CONFIG.productsHeaders
  );
  const errors = [];

  if (categories.duplicateHeaders.length) {
    errors.push('categories memiliki header duplikat: ' + categories.duplicateHeaders.join(', '));
  }
  if (products.duplicateHeaders.length) {
    errors.push('products memiliki header duplikat: ' + products.duplicateHeaders.join(', '));
  }
  if (categories.rowCount < 1) errors.push('categories tidak memiliki baris header.');
  if (products.rowCount < 1) errors.push('products tidak memiliki baris header.');

  return {
    mode: 'read-only-schema-preview',
    generatedAt: new Date().toISOString(),
    spreadsheetId: context.spreadsheetId,
    schema: {
      categories: categories.headers,
      products: products.headers,
      missing: {
        categories: categories.missing,
        products: products.missing
      }
    },
    counts: {
      categoriesRows: categories.rowCount,
      productsRows: products.rowCount
    },
    validation: { errors: errors },
    writesPerformed: false
  };
}

function inspectSheetSchema_(sheet, requiredHeaders) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const values = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const headers = values.map(function(value) { return String(value || '').trim(); });
  const seen = {};
  const duplicateHeaders = [];

  headers.forEach(function(header) {
    if (!header) return;
    if (seen[header]) duplicateHeaders.push(header);
    seen[header] = true;
  });

  return {
    rowCount: lastRow,
    headers: headers,
    missing: requiredHeaders.filter(function(header) { return headers.indexOf(header) === -1; }),
    duplicateHeaders: duplicateHeaders
  };
}

function ensureHeaders_(sheet, requiredHeaders) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const currentHeaders = sheet
    .getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(function(value) { return String(value || '').trim(); });

  const seen = {};
  currentHeaders.forEach(function(header) {
    if (!header) return;
    if (seen[header]) {
      throw new Error('Header duplikat terdeteksi pada ' + sheet.getName() + ': ' + header);
    }
    seen[header] = true;
  });

  const missingHeaders = requiredHeaders.filter(function(header) {
    return currentHeaders.indexOf(header) === -1;
  });

  if (!missingHeaders.length) {
    return { changed: false, added: [] };
  }

  sheet
    .getRange(1, currentHeaders.length + 1, 1, missingHeaders.length)
    .setValues([missingHeaders]);
  SpreadsheetApp.flush();

  return { changed: true, added: missingHeaders };
}

function createNestedCategoryBackup_(context) {
  const sourceFile = DriveApp.getFileById(context.spreadsheetId);
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Jakarta',
    'yyyyMMdd-HHmmss'
  );
  const backupName = sourceFile.getName() + ' — nested-category-schema-backup — ' + timestamp;
  const folderId = String(PropertiesService.getScriptProperties().getProperty(
    NESTED_CATEGORY_SCHEMA_CONFIG.backupFolderIdProperty
  ) || '').trim();
  const backupFile = folderId
    ? sourceFile.makeCopy(backupName, DriveApp.getFolderById(folderId))
    : sourceFile.makeCopy(backupName);

  return {
    fileId: backupFile.getId(),
    name: backupFile.getName(),
    url: backupFile.getUrl(),
    createdAt: new Date().toISOString()
  };
}
