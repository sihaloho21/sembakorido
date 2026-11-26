/**
 * Nested Category Admin Actions — backend GAS patch
 *
 * Instalasi: salin fungsi ini ke project Apps Script API aktif. Pada doPost(e),
 * tempatkan dispatch berikut SETELAH guardActionAuthorization(...) berhasil dan
 * sebelum fallback CRUD generic:
 *
 * if (actionKey === 'nested_category_backup') {
 *   return jsonOutput(withScriptLock(function() {
 *     return handleNestedCategoryBackup_(data || {});
 *   }));
 * }
 * if (actionKey === 'nested_category_apply') {
 *   return jsonOutput(withScriptLock(function() {
 *     return handleNestedCategoryApply_(data || {});
 *   }));
 * }
 *
 * Pastikan request memakai sheet='categories', sehingga validasi whitelist sheet
 * tetap aktif. Jangan dispatch sebelum guardActionAuthorization. Pada
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
  const actualSnapshot = nestedCategoryAdminFingerprint_(snapshot.rows);
  if (actualSnapshot !== expectedSnapshot) {
    return { success: false, error: 'CATEGORY_SNAPSHOT_CHANGED', message: 'Data kategori berubah sejak preview. Muat ulang tree dan tinjau ulang perubahan.' };
  }
  const file = DriveApp.getFileById(getSpreadsheetId());
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyyMMdd-HHmmss');
  const backupName = file.getName() + ' — nested-category-parent-backup — ' + timestamp;
  const backupFile = file.makeCopy(backupName);
  const backupId = Utilities.getUuid();
  const metadata = {
    backup_id: backupId,
    file_id: backupFile.getId(),
    backup_name: backupFile.getName(),
    backup_url: backupFile.getUrl(),
    source_spreadsheet_id: getSpreadsheetId(),
    expected_snapshot_hash: nestedCategoryAdminHash_(actualSnapshot),
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
  // Verifikasi file backup benar-benar ada sebelum satu pun write dilakukan.
  DriveApp.getFileById(backup.file_id);

  const sheet = getSheet('categories');
  const snapshot = nestedCategoryAdminRead_(sheet);
  nestedCategoryAdminRequireSchema_(snapshot.headers);
  if (nestedCategoryAdminFingerprint_(snapshot.rows) !== expectedSnapshot) {
    return { success: false, error: 'CATEGORY_SNAPSHOT_CHANGED', message: 'Data kategori berubah setelah backup. Tidak ada parent_id yang ditulis; buat preview dan backup baru.' };
  }

  const byId = new Map();
  snapshot.rows.forEach(function(row, index) {
    const id = nestedCategoryAdminText_(row.id || row.category_id || row.kategori_id || row.ID);
    if (!id) throw new Error('Kategori pada baris ' + (index + 2) + ' tidak memiliki ID.');
    if (byId.has(id)) throw new Error('ID kategori duplikat: ' + id);
    byId.set(id, row);
  });
  const moveMap = new Map();
  moves.forEach(function(move) {
    const id = nestedCategoryAdminText_(move && move.id);
    const parentId = nestedCategoryAdminText_(move && move.parent_id);
    if (!id || !byId.has(id)) throw new Error('Kategori tujuan perubahan tidak ditemukan: ' + id);
    if (moveMap.has(id)) throw new Error('Kategori dikirim lebih dari sekali: ' + id);
    moveMap.set(id, parentId);
  });
  const proposedRows = snapshot.rows.map(function(row) {
    const id = nestedCategoryAdminText_(row.id || row.category_id || row.kategori_id || row.ID);
    return Object.assign({}, row, { parent_id: moveMap.has(id) ? moveMap.get(id) : nestedCategoryAdminText_(row.parent_id || row.parentId || row.id_induk) });
  });
  const validation = nestedCategoryAdminValidate_(proposedRows);
  if (!validation.valid) throw new Error('Validasi backend gagal: ' + validation.errors.join('; '));

  const parentColumn = snapshot.headers.indexOf('parent_id') + 1;
  const originalParentValues = moves.map(function(move) {
    const row = byId.get(nestedCategoryAdminText_(move.id));
    return { rowNumber: row.__rowNumber, value: row.parent_id == null ? '' : row.parent_id };
  });
  try {
    moves.forEach(function(move) {
      const id = nestedCategoryAdminText_(move.id);
      const row = byId.get(id);
      sheet.getRange(row.__rowNumber, parentColumn).setValue(moveMap.get(id));
    });
    SpreadsheetApp.flush();
    const after = nestedCategoryAdminRead_(sheet);
    const verified = nestedCategoryAdminValidate_(after.rows);
    const appliedMap = new Map(after.rows.map(function(row) {
      return [nestedCategoryAdminText_(row.id || row.category_id || row.kategori_id || row.ID), nestedCategoryAdminText_(row.parent_id)];
    }));
    const allMovesApplied = moves.every(function(move) {
      return appliedMap.get(nestedCategoryAdminText_(move.id)) === nestedCategoryAdminText_(move.parent_id);
    });
    if (!verified.valid || !allMovesApplied) throw new Error('Verifikasi pasca-write gagal: ' + verified.errors.join('; '));
  } catch (error) {
    // Pemulihan hanya menyentuh kolom parent_id yang sama, dari nilai yang dibaca
    // di dalam lock sebelum write. Backup spreadsheet penuh tetap disimpan.
    if (originalParentValues.length) {
      originalParentValues.forEach(function(original) {
        sheet.getRange(original.rowNumber, parentColumn).setValue(original.value);
      });
      SpreadsheetApp.flush();
    }
    throw error;
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
      id: nestedCategoryAdminText_(row.id || row.category_id || row.kategori_id || row.ID),
      name: nestedCategoryAdminText_(row.nama || row.name || row.kategori || row.category || row.judul || row.title),
      parent_id: nestedCategoryAdminText_(row.parent_id || row.parentId || row.id_induk || row.kategori_induk_id),
      sort_order: String(row.sort_order == null ? (row.urutan == null ? (row.order == null ? (row.sort == null ? '' : row.sort) : row.order) : row.urutan) : row.sort_order),
      is_active: String(row.is_active == null ? (row.active == null ? '' : row.active) : row.is_active)
    };
  }).filter(function(item) { return item.name; }).sort(function(a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });
  return JSON.stringify(canonical);
}

function nestedCategoryAdminValidate_(rows) {
  const records = rows.map(function(row) {
    return {
      id: nestedCategoryAdminText_(row.id || row.category_id || row.kategori_id || row.ID),
      name: nestedCategoryAdminText_(row.nama || row.name || row.kategori || row.category),
      parentId: nestedCategoryAdminText_(row.parent_id || row.parentId || row.id_induk || row.kategori_induk_id)
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
