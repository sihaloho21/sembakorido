/**
 * One-time updater for category_showcase_config.
 *
 * Usage:
 * 1. Paste this file into the EXISTING Apps Script project that backs the store API.
 * 2. Save, then run updateCategoryShowcaseImageUrlsAndVerify() from the editor.
 * 3. Approve Spreadsheet and UrlFetch permissions when Google prompts.
 *
 * The function validates the image bytes, updates only image_url/image_alt for
 * the two active categories, preserves all other settings, then checks the
 * deployed public endpoint. It does not deploy or change web-app code.
 */
function updateCategoryShowcaseImageUrlsAndVerify() {
  var updates = {
    'keperluan dapur': {
      image_url: 'https://cdn-klik.klikindomaret.com/home/section/1c8bd383-3926-4897-a080-bd8d6ac40316.png',
      image_alt: 'Promo kategori produk KEPERLUAN DAPUR'
    },
    'mie': {
      image_url: 'https://cdn-klik.klikindomaret.com/home/section/e31e6fff-d831-4fe0-825b-4c81e141616c.png',
      image_alt: 'Promo kategori produk Mie'
    }
  };
  var result = {
    success: false,
    spreadsheet_updated: false,
    public_endpoint_verified: false,
    setting: 'category_showcase_config'
  };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    Object.keys(updates).forEach(function(categoryKey) {
      validateShowcaseImageUrl_(updates[categoryKey].image_url);
    });

    var spreadsheetId = String(
      PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || ''
    ).trim();
    if (!spreadsheetId) {
      throw new Error('Script Property SPREADSHEET_ID belum dikonfigurasi.');
    }

    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet = spreadsheet.getSheetByName('settings');
    if (!sheet) throw new Error('Sheet settings tidak ditemukan.');

    var values = sheet.getDataRange().getValues();
    if (values.length < 2) throw new Error('Sheet settings belum memiliki baris konfigurasi.');
    var headers = values[0].map(function(value) {
      return String(value == null ? '' : value).trim().toLowerCase();
    });
    var keyColumn = headers.indexOf('key');
    var valueColumn = headers.indexOf('value');
    if (keyColumn < 0 || valueColumn < 0) {
      throw new Error('Header sheet settings harus memiliki kolom key dan value.');
    }

    // The public config reader uses the last matching setting row; update that row.
    var settingRow = -1;
    for (var rowIndex = values.length - 1; rowIndex >= 1; rowIndex -= 1) {
      if (String(values[rowIndex][keyColumn] || '').trim() === 'category_showcase_config') {
        settingRow = rowIndex + 1;
        break;
      }
    }
    if (settingRow < 0) throw new Error('Setting category_showcase_config tidak ditemukan.');

    var configText = String(values[settingRow - 1][valueColumn] || '{}');
    var config;
    try {
      config = JSON.parse(configText);
    } catch (error) {
      throw new Error('Nilai category_showcase_config bukan JSON yang valid.');
    }
    if (!config || !Array.isArray(config.categories)) {
      throw new Error('category_showcase_config tidak memiliki array categories.');
    }

    var matched = {};
    config.categories = config.categories.map(function(category) {
      var row = category || {};
      var categoryKey = String(row.category || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!updates[categoryKey]) return row;
      if (matched[categoryKey]) {
        throw new Error('Kategori duplikat di category_showcase_config: ' + row.category);
      }
      if (!(row.enabled === true || String(row.enabled).toLowerCase() === 'true')) {
        throw new Error('Kategori tidak aktif; tidak diubah: ' + row.category);
      }
      matched[categoryKey] = true;
      return Object.assign({}, row, updates[categoryKey]);
    });

    Object.keys(updates).forEach(function(categoryKey) {
      if (!matched[categoryKey]) {
        throw new Error('Kategori aktif tidak ditemukan di category_showcase_config: ' + categoryKey);
      }
    });
    if (!(config.enabled === true || String(config.enabled).toLowerCase() === 'true')) {
      throw new Error('Showcase global sedang nonaktif; konfigurasi tidak diubah.');
    }

    var updatedJson = JSON.stringify(config);
    sheet.getRange(settingRow, valueColumn + 1).setValue(updatedJson);
    SpreadsheetApp.flush();
    result.spreadsheet_updated = true;

    var savedConfig = JSON.parse(String(sheet.getRange(settingRow, valueColumn + 1).getValue() || '{}'));
    assertShowcaseImageUrls_(savedConfig, updates, 'nilai sheet');

    try {
      var serviceUrl = String(ScriptApp.getService().getUrl() || '').trim();
      if (!serviceUrl) throw new Error('URL Web App tidak tersedia; periksa deployment Apps Script yang aktif.');
      var separator = serviceUrl.indexOf('?') >= 0 ? '&' : '?';
      var publicUrl = serviceUrl + separator + 'action=public_category_showcase_config&_=' + Date.now();
      var response = UrlFetchApp.fetch(publicUrl, {
        followRedirects: true,
        muteHttpExceptions: true
      });
      var status = response.getResponseCode();
      if (status < 200 || status >= 300) {
        throw new Error('Endpoint publik merespons HTTP ' + status + '.');
      }

      var publicPayload;
      try {
        publicPayload = JSON.parse(response.getContentText());
      } catch (error) {
        throw new Error('Endpoint publik tidak mengembalikan JSON yang valid.');
      }
      var publicConfig = publicPayload && (publicPayload.config || publicPayload.category_showcase_config);
      if (!publicConfig) throw new Error('Endpoint publik tidak mengembalikan objek config.');
      assertShowcaseImageUrls_(publicConfig, updates, 'endpoint publik');

      result.public_endpoint_verified = true;
      result.public_endpoint_http_status = status;
      result.categories = Object.keys(updates).map(function(categoryKey) {
        var entry = publicConfig.categories.find(function(category) {
          return String(category.category || '').replace(/\s+/g, ' ').trim().toLowerCase() === categoryKey;
        });
        return {
          category: entry.category,
          image_url: entry.image_url,
          image_alt: entry.image_alt
        };
      });
      result.success = true;
    } catch (verificationError) {
      // Do not imply rollback: the sheet write has already succeeded.
      result.verification_error = String(verificationError && verificationError.message || verificationError);
      result.next_step = 'Deploy/repair the public GAS handler so it returns image_url, then rerun only the endpoint verification.';
    }

    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}

/** Validates HTTPS, a successful response, and a recognized image file signature. */
function validateShowcaseImageUrl_(url) {
  if (!/^https:\/\//i.test(String(url || '').trim())) {
    throw new Error('URL gambar harus menggunakan HTTPS: ' + url);
  }
  var response = UrlFetchApp.fetch(url, {
    followRedirects: true,
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('URL gambar merespons HTTP ' + status + ': ' + url);
  }
  if (!hasShowcaseImageSignature_(response.getContent())) {
    throw new Error('URL tidak mengembalikan berkas JPEG, PNG, GIF, atau WEBP: ' + url);
  }
}

function hasShowcaseImageSignature_(bytes) {
  if (!bytes || bytes.length < 12) return false;
  var byte = function(index) { return bytes[index] & 255; };
  var jpeg = byte(0) === 0xff && byte(1) === 0xd8 && byte(2) === 0xff;
  var png = byte(0) === 0x89 && byte(1) === 0x50 && byte(2) === 0x4e && byte(3) === 0x47 &&
    byte(4) === 0x0d && byte(5) === 0x0a && byte(6) === 0x1a && byte(7) === 0x0a;
  var gif = byte(0) === 0x47 && byte(1) === 0x49 && byte(2) === 0x46 && byte(3) === 0x38;
  var webp = byte(0) === 0x52 && byte(1) === 0x49 && byte(2) === 0x46 && byte(3) === 0x46 &&
    byte(8) === 0x57 && byte(9) === 0x45 && byte(10) === 0x42 && byte(11) === 0x50;
  return jpeg || png || gif || webp;
}

function assertShowcaseImageUrls_(config, updates, sourceName) {
  if (!config || !Array.isArray(config.categories)) {
    throw new Error(sourceName + ' tidak memiliki array categories.');
  }
  if (!(config.enabled === true || String(config.enabled).toLowerCase() === 'true')) {
    throw new Error(sourceName + ' menunjukkan showcase global tidak aktif.');
  }
  Object.keys(updates).forEach(function(categoryKey) {
    var entry = config.categories.find(function(category) {
      return String(category.category || '').replace(/\s+/g, ' ').trim().toLowerCase() === categoryKey;
    });
    if (!entry) throw new Error(sourceName + ' tidak memiliki kategori ' + categoryKey + '.');
    if (!(entry.enabled === true || String(entry.enabled).toLowerCase() === 'true')) {
      throw new Error(sourceName + ' menunjukkan kategori tidak aktif: ' + entry.category + '.');
    }
    if (String(entry.image_url || '').trim() !== updates[categoryKey].image_url) {
      throw new Error(
        sourceName + ' belum mengembalikan image_url yang diharapkan untuk ' + entry.category +
        '. Pastikan deployed GAS public handler mengekspor image_url.'
      );
    }
  });
}
