/**
 * Nested Category Admin Actions — backend GAS patch
 *
 * Instalasi: salin fungsi ini ke project Apps Script API aktif. Pada doPost(e),
 * tempatkan dispatch berikut SETELAH guardActionAuthorization(...) dan validasi
 * isSheetValidationRequired(...) terhadap SHEET_WHITELIST, tetapi sebelum fallback CRUD:
 *
 * if (actionKey === 'nested_category_backup') {
 *   nestedCategoryAdminRequireActionSheet_(sheetName);
 *   return jsonOutput(withScriptLock(function() {
 *     return handleNestedCategoryBackup_(data || {});
 *   }));
 * }
 * if (actionKey === 'nested_category_apply') {
 *   nestedCategoryAdminRequireActionSheet_(sheetName);
 *   return jsonOutput(withScriptLock(function() {
 *     return handleNestedCategoryApply_(data || {});
 *   }));
 * }
 *
 * Cabang ini juga memeriksa bahwa sheetName tepat 'categories' dan masih ada
 * dalam SHEET_WHITELIST; jangan mengandalkan fallback CRUD generik. Pada
 * getRequiredRoleForAction(), tambahkan kedua action sebagai role 'manager'.
 * Handler ini memakai getSpreadsheetId()/getSpreadsheet(), getSheet(),
 * withScriptLock(), dan konfigurasi otorisasi dari GAS API yang sudah ada.
 *
 * Handler tidak menambah schema dan tidak memetakan produk. Header parent_id
 * harus ditambahkan dahulu lewat migrasi schema yang disetujui.
 */
const NESTED_CATEGORY_ADMIN_BACKUP_PREFIX_ = 'nested_category_backup:';
const NESTED_CATEGORY_ADMIN_BACKUP_TTL_MS_ = 6 * 60 * 60 * 1000;
const NESTED_CATEGORY_ADMIN_MAX_DEPTH_ = 3;

function handleNestedCategoryBackup_(data) {
  const payload = data || {};
  const expectedSnapshot = String(payload.expected_snapshot || '');
  if (!expectedSnapshot) throw new Error('expected_snapshot wajib dikirim.');
  const sheet = getSheet('categories');
  const snapshot = nestedCategoryAdminRead_(sheet);
  nestedCategoryAdminRequireSchema_(snapshot.headers);
  nestedCategoryAdminRequireUniqueIds_(snapshot.rows);
  const actualSnapshot = nestedCategoryAdminFingerprint_(snapshot.rows);
  if (actualSnapshot !== expectedSnapshot) {
    return { success: false, error: 'CATEGORY_SNAPSHOT_CHANGED', message: 'Data kategori berubah sejak preview. Muat ulang tree dan tinjau ulang perubahan.' };
  }
  const file = DriveApp.getFileById(getSpreadsheetId());
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyyMMdd-HHmmss');
  const backupName = file.getName() + ' — nested-category-parent-backup — ' + timestamp;
  const backupFile = file.makeCopy(backupName);
  let copiedSnapshot;
  try {
    const copiedSpreadsheet = SpreadsheetApp.openById(backupFile.getId());
    const copiedSheet = copiedSpreadsheet.getSheetByName('categories');
    if (!copiedSheet) throw new Error('Sheet categories tidak ditemukan pada salinan backup.');
    const copiedData = nestedCategoryAdminRead_(copiedSheet);
    nestedCategoryAdminRequireSchema_(copiedData.headers);
    nestedCategoryAdminRequireUniqueIds_(copiedData.rows);
    copiedSnapshot = nestedCategoryAdminFingerprint_(copiedData.rows);
    if (copiedSnapshot !== actualSnapshot) throw new Error('Fingerprint salinan tidak cocok dengan snapshot preview.');
  } catch (error) {
    throw new Error('Backup dibuat tetapi verifikasi salinan gagal; apply dibatalkan. Periksa salinan ' + backupFile.getName() + '. Detail: ' + error.message);
  }
  const backupId = Utilities.getUuid();
  const metadata = {
    backup_id: backupId,
    file_id: backupFile.getId(),
    backup_name: backupFile.getName(),
    backup_url: backupFile.getUrl(),
    source_spreadsheet_id: getSpreadsheetId(),
    expected_snapshot_hash: nestedCategoryAdminHash_(copiedSnapshot),
    created_at: new Date().toISOString(),
    expires_at: Date.now() + NESTED_CATEGORY_ADMIN_BACKUP_TTL_MS_
  };
  PropertiesService.getScriptProperties().setProperty(
    NESTED_CATEGORY_ADMIN_BACKUP_PREFIX_ + backupId,
    JSON.stringify(metadata)
  );
  return {
    success: true,
    backup_id: backupId,
    backup_name: metadata.backup_name,
    backup_url: metadata.backup_url,
    created_at: metadata.created_at,
    categories_count: snapshot.rows.length,
    snapshot_matches: true,
    snapshot_hash: metadata.expected_snapshot_hash
  };
}

function handleNestedCategoryApply_(data) {
  const payload = data || {};
  const backupId = String(payload.backup_id || '').trim();
  const expectedSnapshot = String(payload.expected_snapshot || '');
  const moves = Array.isArray(payload.moves) ? payload.moves : [];
  if (!backupId || !expectedSnapshot || !moves.length) throw new Error('backup_id, expected_snapshot, dan moves wajib tersedia.');
  const propertyKey = NESTED_CATEGORY_ADMIN_BACKUP_PREFIX_ + backupId;
  const rawMetadata = PropertiesService.getScriptProperties().getProperty(propertyKey);
  if (!rawMetadata) throw new Error('Referensi backup tidak ditemukan atau sudah kedaluwarsa. Buat backup baru.');
  const backup = JSON.parse(rawMetadata);
  if (Number(backup.expires_at || 0) < Date.now()) throw new Error('Backup sudah kedaluwarsa. Buat backup baru.');
  if (backup.source_spreadsheet_id !== getSpreadsheetId() || backup.expected_snapshot_hash !== nestedCategoryAdminHash_(expectedSnapshot)) {
    throw new Error('Backup tidak cocok dengan spreadsheet atau snapshot perubahan ini.');
  }
  // Verifikasi bahwa salinan backup masih tersedia dan memiliki snapshot yang sama.
  const backupFile = DriveApp.getFileById(backup.file_id);
  const backupSpreadsheet = SpreadsheetApp.openById(backupFile.getId());
  const backupSheet = backupSpreadsheet.getSheetByName('categories');
  if (!backupSheet) throw new Error('Sheet categories tidak ditemukan pada backup. Apply dibatalkan.');
  const backupSnapshot = nestedCategoryAdminRead_(backupSheet);
  nestedCategoryAdminRequireSchema_(backupSnapshot.headers);
  nestedCategoryAdminRequireUniqueIds_(backupSnapshot.rows);
  if (nestedCategoryAdminFingerprint_(backupSnapshot.rows) !== expectedSnapshot) {
    throw new Error('Isi backup tidak cocok dengan snapshot perubahan ini. Apply dibatalkan.');
  }

  const sheet = getSheet('categories');
  const snapshot = nestedCategoryAdminRead_(sheet);
  nestedCategoryAdminRequireSchema_(snapshot.headers);
  nestedCategoryAdminRequireUniqueIds_(snapshot.rows);
  if (nestedCategoryAdminFingerprint_(snapshot.rows) !== expectedSnapshot) {
    return { success: false, error: 'CATEGORY_SNAPSHOT_CHANGED', message: 'Data kategori berubah setelah backup. Tidak ada parent_id yang ditulis; buat preview dan backup baru.' };
  }

  const byId = nestedCategoryAdminBuildIndex_(snapshot.rows);
  const moveMap = new Map();
  moves.forEach(function(move) {
    const id = nestedCategoryAdminText_(move && move.id);
    const parentId = nestedCategoryAdminText_(move && move.parent_id);
    if (!id || !byId.has(id)) throw new Error('Kategori tujuan perubahan tidak ditemukan: ' + id);
    if (moveMap.has(id)) throw new Error('Kategori dikirim lebih dari sekali: ' + id);
    moveMap.set(id, parentId);
  });
  const proposedRows = snapshot.rows.map(function(row) {
    const id = nestedCategoryAdminId_(row);
    return Object.assign({}, row, { parent_id: moveMap.has(id) ? moveMap.get(id) : nestedCategoryAdminParentId_(row) });
  });
  const validation = nestedCategoryAdminValidate_(proposedRows);
  if (!validation.valid) throw new Error('Validasi backend gagal: ' + validation.errors.join('; '));

  const parentColumn = snapshot.headers.indexOf('parent_id') + 1;
  const originalParentValues = moves.map(function(move) {
    const id = nestedCategoryAdminText_(move.id);
    const row = byId.get(id);
    return { id: id, value: row.parent_id == null ? '' : row.parent_id };
  });
  const originalById = new Map(originalParentValues.map(function(original) { return [original.id, original]; }));
  const attemptedParentValues = [];
  let expectedRowsBeforeWrites = snapshot.rows.map(function(row) { return Object.assign({}, row); });
  try {
    moves.forEach(function(move) {
      const id = nestedCategoryAdminText_(move.id);
      const original = originalById.get(id);
      const current = nestedCategoryAdminRead_(sheet);
      nestedCategoryAdminRequireSchema_(current.headers);
      nestedCategoryAdminRequireUniqueIds_(current.rows);
      if (current.headers.indexOf('parent_id') + 1 !== parentColumn ||
          nestedCategoryAdminFingerprint_(current.rows) !== nestedCategoryAdminFingerprint_(expectedRowsBeforeWrites)) {
        throw new Error('Snapshot atau posisi kolom berubah tepat sebelum penulisan berikutnya. Apply dihentikan.');
      }
      const row = nestedCategoryAdminBuildIndex_(current.rows).get(id);
      if (!row) throw new Error('Kategori tidak ditemukan tepat sebelum penulisan: ' + id);
      if (nestedCategoryAdminParentId_(row) !== nestedCategoryAdminText_(original.value)) {
        throw new Error('Parent kategori berubah tepat sebelum penulisan: ' + id + '. Apply dibatalkan.');
      }
      attemptedParentValues.push({ id: original.id, value: original.value, appliedValue: moveMap.get(id) });
      sheet.getRange(row.__rowNumber, parentColumn).setValue(moveMap.get(id));
      SpreadsheetApp.flush();
      expectedRowsBeforeWrites = expectedRowsBeforeWrites.map(function(expectedRow) {
        return nestedCategoryAdminId_(expectedRow) === id
          ? Object.assign({}, expectedRow, { parent_id: moveMap.get(id) })
          : expectedRow;
      });
    });
    SpreadsheetApp.flush();
    const after = nestedCategoryAdminRead_(sheet);
    const verified = nestedCategoryAdminValidate_(after.rows);
    const appliedMap = new Map(after.rows.map(function(row) {
      return [nestedCategoryAdminId_(row), nestedCategoryAdminParentId_(row)];
    }));
    const allMovesApplied = moves.every(function(move) {
      return appliedMap.get(nestedCategoryAdminText_(move.id)) === nestedCategoryAdminText_(move.parent_id);
    });
    if (!verified.valid || !allMovesApplied) throw new Error('Verifikasi pasca-write gagal: ' + verified.errors.join('; '));
  } catch (error) {
    // Rollback mencari ulang setiap ID; jangan memakai nomor baris lama jika sheet berubah.
    const rollbackFailures = [];
    attemptedParentValues.forEach(function(original) {
      try {
        const row = nestedCategoryAdminFindUniqueRow_(sheet, original.id, parentColumn);
        const currentParent = nestedCategoryAdminParentId_(row);
        if (currentParent === nestedCategoryAdminText_(original.appliedValue)) {
          sheet.getRange(row.__rowNumber, parentColumn).setValue(original.value);
        } else if (currentParent !== nestedCategoryAdminText_(original.value)) {
          throw new Error('nilai parent berubah bersamaan; tidak ditimpa oleh rollback');
        }
      } catch (rollbackError) {
        rollbackFailures.push(original.id + ': ' + rollbackError.message);
      }
    });
    try {
      SpreadsheetApp.flush();
    } catch (flushError) {
      rollbackFailures.push('flush: ' + flushError.message);
    }
    try {
      const restored = nestedCategoryAdminBuildIndex_(nestedCategoryAdminRead_(sheet).rows);
      attemptedParentValues.forEach(function(original) {
        const row = restored.get(original.id);
        if (!row || nestedCategoryAdminParentId_(row) !== nestedCategoryAdminText_(original.value)) {
          rollbackFailures.push(original.id + ': verifikasi nilai awal gagal');
        }
      });
    } catch (verifyError) {
      rollbackFailures.push('verifikasi rollback: ' + verifyError.message);
    }
    if (rollbackFailures.length) {
      throw new Error('Apply gagal: ' + error.message + '. Rollback tidak lengkap: ' + rollbackFailures.join('; ') + '. Periksa spreadsheet dan backup sebelum melanjutkan.');
    }
    throw new Error('Apply gagal; semua nilai parent_id yang ditargetkan berhasil dipulihkan. Penyebab: ' + error.message);
  }
  PropertiesService.getScriptProperties().deleteProperty(propertyKey);
  return {
    success: true,
    affected: moves.length,
    max_depth: validation.maxDepth,
    backup_id: backupId,
    backup_name: backup.backup_name,
    backup_url: backup.backup_url,
    writes: { categories_parent_id_cells_changed: moves.length, products_changed: 0, category_showcase_config_changed: false }
  };
}

function nestedCategoryAdminRead_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('Sheet categories tidak memiliki header.');
  const headers = values[0].map(function(value) { return String(value || '').trim(); });
  const seen = new Set();
  headers.forEach(function(header) {
    if (!header) return;
    if (seen.has(header)) throw new Error('Header categories duplikat: ' + header);
    seen.add(header);
  });
  const rows = values.slice(1).map(function(row, index) {
    const object = {};
    headers.forEach(function(header, index) { if (header) object[header] = row[index]; });
    object.__rowNumber = index + 2;
    return object;
  }).filter(function(row) { return nestedCategoryAdminText_(row.nama || row.name || row.kategori || row.category); });
  return { headers: headers, rows: rows };
}

function nestedCategoryAdminRequireSchema_(headers) {
  ['id', 'nama', 'parent_id'].forEach(function(header) {
    if (headers.indexOf(header) < 0) throw new Error('Schema categories belum siap: header ' + header + ' wajib tersedia.');
  });
}

function nestedCategoryAdminText_(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function nestedCategoryAdminRequireActionSheet_(sheetName) {
  const name = nestedCategoryAdminText_(sheetName);
  if (name !== 'categories' || SHEET_WHITELIST.indexOf(name) === -1) {
    throw new Error('nested_category actions hanya menerima sheet=categories yang diizinkan whitelist.');
  }
}

function nestedCategoryAdminFirstText_(row, fields) {
  for (let index = 0; index < fields.length; index += 1) {
    const value = row && row[fields[index]];
    if (value == null) continue;
    const text = nestedCategoryAdminText_(value);
    if (text) return text;
  }
  return '';
}

function nestedCategoryAdminId_(row) {
  return nestedCategoryAdminFirstText_(row, ['id', 'category_id', 'kategori_id', 'ID']);
}

function nestedCategoryAdminName_(row) {
  return nestedCategoryAdminFirstText_(row, ['nama', 'name', 'kategori', 'category', 'judul', 'title']);
}

function nestedCategoryAdminParentId_(row) {
  return nestedCategoryAdminFirstText_(row, ['parent_id', 'parentId', 'id_induk', 'kategori_induk_id']);
}

function nestedCategoryAdminRequireUniqueIds_(rows) {
  const seen = new Set();
  rows.forEach(function(row, index) {
    const id = nestedCategoryAdminId_(row);
    if (!id) throw new Error('Kategori pada baris ' + (row.__rowNumber || index + 2) + ' tidak memiliki ID.');
    if (seen.has(id)) throw new Error('ID kategori duplikat: ' + id);
    seen.add(id);
  });
}

function nestedCategoryAdminBuildIndex_(rows) {
  nestedCategoryAdminRequireUniqueIds_(rows);
  const index = new Map();
  rows.forEach(function(row) { index.set(nestedCategoryAdminId_(row), row); });
  return index;
}

function nestedCategoryAdminFindUniqueRow_(sheet, categoryId, expectedParentColumn) {
  const current = nestedCategoryAdminRead_(sheet);
  nestedCategoryAdminRequireSchema_(current.headers);
  if (expectedParentColumn && current.headers.indexOf('parent_id') + 1 !== expectedParentColumn) {
    throw new Error('Posisi kolom parent_id berubah saat apply.');
  }
  const row = nestedCategoryAdminBuildIndex_(current.rows).get(categoryId);
  if (!row) throw new Error('Kategori tidak ditemukan saat penulisan ulang: ' + categoryId);
  return row;
}

function nestedCategoryAdminHash_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''), Utilities.Charset.UTF_8);
  return bytes.map(function(byte) {
    const normalized = (byte + 256) % 256;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function nestedCategoryAdminFingerprint_(rows) {
  const canonical = rows.map(function(row) {
    return {
      id: nestedCategoryAdminId_(row),
      name: nestedCategoryAdminName_(row),
      parent_id: nestedCategoryAdminParentId_(row),
      sort_order: String(row.sort_order == null ? (row.urutan == null ? (row.order == null ? (row.sort == null ? '' : row.sort) : row.order) : row.urutan) : row.sort_order),
      is_active: String(row.is_active == null ? (row.active == null ? '' : row.active) : row.is_active)
    };
  }).filter(function(item) { return item.name; }).sort(function(a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });
  return JSON.stringify(canonical);
}

function nestedCategoryAdminValidate_(rows) {
  const records = rows.map(function(row) {
    return {
      id: nestedCategoryAdminId_(row),
      name: nestedCategoryAdminName_(row),
      parentId: nestedCategoryAdminParentId_(row)
    };
  }).filter(function(item) { return item.name; });
  const ids = new Set();
  const missing = [];
  const duplicates = [];
  records.forEach(function(item) {
    if (!item.id) missing.push(item.name);
    else if (ids.has(item.id)) duplicates.push(item.id);
    else ids.add(item.id);
  });
  const byId = new Map(records.filter(function(item) { return item.id; }).map(function(item) { return [item.id, item]; }));
  const invalidParents = records.filter(function(item) { return item.parentId && !byId.has(item.parentId); }).map(function(item) { return item.id; });
  const cycles = [];
  let maxDepth = 0;
  records.forEach(function(item) {
    const visited = new Set();
    let current = item;
    let depth = 0;
    while (current) {
      if (visited.has(current.id)) { cycles.push(item.id); break; }
      visited.add(current.id);
      depth += 1;
      current = current.parentId ? byId.get(current.parentId) : null;
    }
    maxDepth = Math.max(maxDepth, depth);
  });
  const errors = [];
  if (missing.length) errors.push(missing.length + ' kategori tanpa ID');
  if (duplicates.length) errors.push(duplicates.length + ' ID duplikat');
  if (invalidParents.length) errors.push(invalidParents.length + ' parent tidak valid');
  if (cycles.length) errors.push(cycles.length + ' circular reference');
  if (maxDepth > NESTED_CATEGORY_ADMIN_MAX_DEPTH_) errors.push('kedalaman maksimum ' + maxDepth + ' melebihi batas 3');
  return { valid: errors.length === 0, errors: errors, maxDepth: maxDepth };
}
