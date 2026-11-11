/*
 * GAS v7.2 patch — Category Showcase fixed-left image support.
 *
 * Apply to the deployed v7.1 GAS source. Keep the existing auth guard and
 * upsert_setting implementation. Add these routes inside doPost AFTER the
 * existing authorization gate and before generic CRUD:
 *
 *   if (String(payload.action || '') === 'upload_category_showcase_image') {
 *     return jsonOutput(handleCategoryShowcaseImageUpload(payload.data));
 *   }
 *
 * Configure Script Properties:
 *   CATEGORY_SHOWCASE_IMAGE_FOLDER_ID = Google Drive folder ID
 *
 * The Drive folder must be accessible to the Apps Script deployment. The
 * upload action is admin-only and returns a public view URL for config storage.
 */

var CATEGORY_SHOWCASE_IMAGE_MAX_BYTES_V72 = 2 * 1024 * 1024;
var CATEGORY_SHOWCASE_IMAGE_MIME_TYPES_V72 = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

function normalizeCategoryShowcaseImageUrlV72(value) {
  var url = String(value == null ? '' : value).trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

function normalizeCategoryShowcaseImageAltV72(value, category) {
  var alt = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return alt || ('Promo kategori produk ' + String(category || '').trim());
}

function normalizeCategoryShowcaseColorV72(value, fallback) {
  var color = String(value == null ? '' : value).trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  var safeFallback = String(fallback || '#f0fdf4').trim();
  return /^#[0-9a-f]{6}$/i.test(safeFallback) ? safeFallback.toLowerCase() : '#f0fdf4';
}

function validateCategoryShowcaseConfigV72(input) {
  var source = input && typeof input === 'object' ? input : {};
  var raw = Array.isArray(source.categories) ? source.categories : [];
  var seen = {};
  var background = normalizeCategoryShowcaseColorV72(source.background_color, '#f0fdf4');
  var categories = [];
  raw.slice(0, 100).forEach(function(row, index) {
    row = row || {};
    var category = String(row.category == null ? '' : row.category).replace(/\s+/g, ' ').trim();
    var key = category.toLowerCase();
    var maxProducts = Number(row.max_products);
    if (!category || seen[key] || !Number.isInteger(maxProducts) || maxProducts < 1 || maxProducts > 50) return;
    seen[key] = true;
    categories.push({
      category: category,
      enabled: row.enabled === true || String(row.enabled).toLowerCase() === 'true',
      sort_order: Number.isInteger(Number(row.sort_order)) ? Number(row.sort_order) : index + 1,
      max_products: maxProducts,
      image_url: normalizeCategoryShowcaseImageUrlV72(row.image_url),
      image_alt: normalizeCategoryShowcaseImageAltV72(row.image_alt, category),
      theme_color: normalizeCategoryShowcaseColorV72(row.theme_color, background)
    });
  });
  categories.sort(function(a, b) { return a.sort_order - b.sort_order; });
  return {
    version: 2,
    enabled: source.enabled === true || String(source.enabled).toLowerCase() === 'true',
    background_color: background,
    categories: categories
  };
}

function sanitizeCategoryShowcaseFilenameV72(filename, mimeType) {
  var base = String(filename || 'category-showcase').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  if (!base) base = 'category-showcase';
  var extension = CATEGORY_SHOWCASE_IMAGE_MIME_TYPES_V72[mimeType];
  if (!extension) throw new Error('Unsupported image type');
  if (!/\.[a-z0-9]+$/i.test(base)) base += extension;
  return 'category-showcase-' + new Date().getTime() + '-' + base;
}

function handleCategoryShowcaseImageUpload(data) {
  data = data || {};
  var mimeType = String(data.mime_type || '').trim().toLowerCase();
  var base64 = String(data.base64 || '').trim();
  if (!CATEGORY_SHOWCASE_IMAGE_MIME_TYPES_V72[mimeType]) return { success: false, error: 'invalid_image_type' };
  if (!base64 || base64.length > Math.ceil(CATEGORY_SHOWCASE_IMAGE_MAX_BYTES_V72 * 1.4)) return { success: false, error: 'image_too_large' };
  var folderId = PropertiesService.getScriptProperties().getProperty('CATEGORY_SHOWCASE_IMAGE_FOLDER_ID');
  if (!folderId) return { success: false, error: 'image_folder_not_configured' };
  try {
    var bytes = Utilities.base64Decode(base64);
    if (bytes.length > CATEGORY_SHOWCASE_IMAGE_MAX_BYTES_V72) return { success: false, error: 'image_too_large' };
    var blob = Utilities.newBlob(bytes, mimeType, sanitizeCategoryShowcaseFilenameV72(data.filename, mimeType));
    var file = DriveApp.getFolderById(folderId).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return {
      success: true,
      file_id: file.getId(),
      url: 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(file.getId()),
      mime_type: mimeType,
      bytes: bytes.length
    };
  } catch (error) {
    logRuntimeError('handleCategoryShowcaseImageUpload', error, { action: 'upload_category_showcase_image' });
    return { success: false, error: 'image_upload_failed', message: String(error.message || error) };
  }
}

/* Public response contract for public_category_showcase_config:
{
  "version": 2,
  "enabled": true,
  "background_color": "#f0fdf4",
  "categories": [{
    "category": "Makanan Ringan",
    "enabled": true,
    "sort_order": 1,
    "max_products": 8,
    "image_url": "https://...",
    "image_alt": "Promo makanan ringan",
    "theme_color": "#f51edb"
  }]
}

The existing public handler must call validateCategoryShowcaseConfigV72 and
return the image fields. The existing upsert_setting route must also validate
with this function before serializing category_showcase_config.
*/
