/**
 * ========================================
 * GOSEMBAKO - Google Apps Script API
 * Version: 6.2 (Referral Hardening)
 * ========================================
 *
 * PENAMBAHAN v6.2:
 * - LockService pada flow referral (attach/evaluate) untuk mencegah race condition.
 * - Idempotency evaluate referral berbasis trigger_order_id global.
 * - Dedup ledger point_transactions berbasis (source + source_id + phone).
 * - upsert_setting untuk update-in-place settings (tanpa menumpuk baris).
 */

// ========================================
// KONFIGURASI
// ========================================

const SPREADSHEET_ID = '174qAwA2hddfQOFUFDx7czOtpRlD9WUiiIaf6Yao8WRc';
const ADMIN_TOKEN = ''; // contoh: 'SECRET123'

const SHEET_WHITELIST = [
  'products', 'categories', 'orders', 'users', 'user_points', 'tukar_poin',
  'banners', 'claims', 'settings', 'pembelian', 'suppliers', 'biaya_bulanan',
  'referrals', 'point_transactions'
];

const LOCK_TIMEOUT_MS = 30000;

// ========================================
// MAIN HANDLERS
// ========================================

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const sheetName = (params.sheet || '').trim();
  const action = (params.action || 'read').trim();
  const id = params.id;
  const phone = params.phone;
  const whatsapp = params.whatsapp;
  const token = params.token || '';

  if (!sheetName || SHEET_WHITELIST.indexOf(sheetName) === -1) {
    return jsonOutput({ error: 'Invalid sheet' });
  }

  if (ADMIN_TOKEN && token !== ADMIN_TOKEN) {
    return jsonOutput({ error: 'Unauthorized' });
  }

  try {
    const sheet = getSheet(sheetName);
    const data = sheet.getDataRange().getValues();
    if (data.length === 0) return jsonOutput([]);

    const headers = data[0];
    const rows = data.slice(1).map(function(r) { return toObject(headers, r); });

    if (id !== undefined) {
      return jsonOutput(rows.filter(function(r) {
        return String(r.id) === String(id);
      }));
    }

    if (phone !== undefined) {
      const normalizedPhone = normalizePhone(phone);
      return jsonOutput(rows.filter(function(r) {
        const candidates = [
          r.phone, r.whatsapp, r.referrer_phone, r.referee_phone, r.referred_by_phone
        ];
        return candidates.some(function(c) {
          return normalizePhone(c || '') === normalizedPhone;
        });
      }));
    }

    if (whatsapp !== undefined) {
      const normalizedPhone = normalizePhone(whatsapp);
      return jsonOutput(rows.filter(function(r) {
        return [r.whatsapp, r.phone].some(function(c) {
          return normalizePhone(c || '') === normalizedPhone;
        });
      }));
    }

    if (action === 'search' && id !== undefined) {
      return jsonOutput(rows.filter(function(r) {
        return String(r.id) === String(id);
      }));
    }

    return jsonOutput(rows);
  } catch (error) {
    Logger.log('Error in doGet: ' + error.toString());
    return jsonOutput({ error: error.toString() });
  }
}

function doPost(e) {
  const token = (e && e.parameter && e.parameter.token) ? e.parameter.token : '';
  if (ADMIN_TOKEN && token !== ADMIN_TOKEN) {
    return jsonOutput({ error: 'Unauthorized' });
  }

  try {
    let body;
    if (e.parameter && e.parameter.json) {
      body = JSON.parse(e.parameter.json);
    } else if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else {
      return jsonOutput({ error: 'No data received' });
    }

    const action = body.action;
    const sheetName = (e.parameter.sheet || body.sheet || '').trim();
    const id = body.id;
    const data = body.data;

    if (!sheetName || SHEET_WHITELIST.indexOf(sheetName) === -1) {
      return jsonOutput({ error: 'Invalid sheet: ' + sheetName });
    }

    if (action === 'attach_referral') {
      return jsonOutput(withScriptLock(function() {
        return handleAttachReferral(data);
      }));
    }

    if (action === 'evaluate_referral') {
      return jsonOutput(withScriptLock(function() {
        return handleEvaluateReferral(data);
      }));
    }

    if (action === 'upsert_setting') {
      return jsonOutput(handleUpsertSetting(data));
    }

    const sheet = getSheet(sheetName);
    const values = sheet.getDataRange().getValues();
    if (values.length === 0) {
      return jsonOutput({ error: 'Sheet has no headers: ' + sheetName });
    }

    const headers = values[0];
    const rows = values.slice(1);

    if (!action && data && Array.isArray(data)) {
      let inserted = 0;
      data.forEach(function(record) {
        const row = headers.map(function(h) {
          return (record[h] !== undefined ? record[h] : '');
        });
        sheet.appendRow(row);
        inserted++;
      });
      return jsonOutput({ success: true, inserted: inserted });
    }

    if (action === 'create') {
      const row = headers.map(function(h) {
        return (data && data[h] !== undefined ? data[h] : '');
      });
      sheet.appendRow(row);
      return jsonOutput({ success: true, created: 1 });
    }

    if (action === 'update') {
      if (id === undefined) return jsonOutput({ error: 'id required for update' });

      let idColIndex = headers.indexOf('id');
      let identifierColumn = 'id';
      if (idColIndex === -1) {
        idColIndex = headers.indexOf('phone');
        identifierColumn = 'phone';
        if (idColIndex === -1) {
          return jsonOutput({ error: 'Neither id nor phone column found in sheet' });
        }
      }

      const searchValue = identifierColumn === 'phone' ? normalizePhone(String(id)) : String(id);
      const rowIndex = rows.findIndex(function(r) {
        const cellValue = identifierColumn === 'phone'
          ? normalizePhone(String(r[idColIndex]))
          : String(r[idColIndex]);
        return cellValue === searchValue;
      });
      if (rowIndex === -1) return jsonOutput({ error: 'Record not found' });

      const actualRowIndex = rowIndex + 2;
      headers.forEach(function(h, colIndex) {
        if (data && data[h] !== undefined) {
          sheet.getRange(actualRowIndex, colIndex + 1).setValue(data[h]);
        }
      });
      return jsonOutput({ success: true, affected: 1 });
    }

    if (action === 'delete') {
      if (id === undefined) return jsonOutput({ error: 'id required for delete' });
      const idColIndex = headers.indexOf('id');
      if (idColIndex === -1) return jsonOutput({ error: 'id column not found in sheet' });
      const rowIndex = rows.findIndex(function(r) { return String(r[idColIndex]) === String(id); });
      if (rowIndex === -1) return jsonOutput({ error: 'Record not found' });
      sheet.deleteRow(rowIndex + 2);
      return jsonOutput({ success: true, deleted: 1 });
    }

    return jsonOutput({ error: 'Invalid action or request format' });
  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return jsonOutput({ error: error.toString() });
  }
}

// ========================================
// REFERRAL HARDENING
// ========================================

function handleAttachReferral(data) {
  if (!data) return { success: false, error_code: 'INVALID_PAYLOAD', message: 'data required' };

  const cfg = getReferralConfig();
  if (!cfg.enabled) {
    return { success: false, error_code: 'REFERRAL_DISABLED', message: 'Referral disabled' };
  }

  const refereePhone = normalizePhone(data.referee_phone || '');
  const refCode = String(data.ref_code || '').trim();
  if (!refereePhone || !refCode) {
    return { success: false, error_code: 'INVALID_PAYLOAD', message: 'referee_phone and ref_code required' };
  }

  const usersData = getRowsAsObjects('users');
  const users = usersData.rows;

  let referrer = null;
  let referee = null;
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var uPhone = normalizePhone(u.whatsapp || u.phone || '');
    if (String(u.kode_referral || '').trim() === refCode) referrer = u;
    if (uPhone === refereePhone) referee = u;
  }

  if (!referrer) {
    return { success: false, error_code: 'INVALID_REF_CODE', message: 'Kode referral tidak ditemukan' };
  }
  if (!referee) {
    return { success: false, error_code: 'REFEREE_NOT_FOUND', message: 'User referee tidak ditemukan' };
  }

  const referrerPhone = normalizePhone(referrer.whatsapp || referrer.phone || '');
  if (referrerPhone === refereePhone) {
    return { success: false, error_code: 'SELF_REFERRAL_NOT_ALLOWED', message: 'Self referral tidak diizinkan' };
  }
  if (String(referee.referred_by || '').trim() !== '') {
    return { success: false, error_code: 'REFERRAL_ALREADY_SET', message: 'User sudah punya referrer' };
  }

  // Guard duplicate attach by existing pending/approved referral record
  const refsSnapshot = getRowsAsObjects('referrals').rows;
  const existed = refsSnapshot.some(function(r) {
    const sameReferee = normalizePhone(r.referee_phone || '') === refereePhone;
    const st = String(r.status || '').toLowerCase();
    return sameReferee && (st === 'pending' || st === 'approved');
  });
  if (existed) {
    return {
      success: false,
      error_code: 'REFERRAL_ALREADY_EXISTS',
      message: 'Referral pending/approved sudah ada untuk user ini'
    };
  }

  const headers = usersData.headers;
  const referredByCol = headers.indexOf('referred_by');
  const referredByPhoneCol = headers.indexOf('referred_by_phone');
  if (referredByCol === -1 || referredByPhoneCol === -1) {
    return { success: false, error_code: 'USERS_HEADERS_INVALID', message: 'Kolom users referral belum lengkap' };
  }

  let refereeRowIndex = -1;
  for (var j = 0; j < users.length; j++) {
    if (String(users[j].id) === String(referee.id)) {
      refereeRowIndex = j + 2;
      break;
    }
  }
  if (refereeRowIndex === -1) {
    return { success: false, error_code: 'REFEREE_NOT_FOUND', message: 'User referee tidak ditemukan' };
  }

  usersData.sheet.getRange(refereeRowIndex, referredByCol + 1).setValue(refCode);
  usersData.sheet.getRange(refereeRowIndex, referredByPhoneCol + 1).setValue(referrerPhone);

  const refs = getRowsAsObjects('referrals');
  if (refs.headers.length === 0) {
    return { success: false, error_code: 'REFERRALS_HEADERS_INVALID', message: 'Sheet referrals belum ada header' };
  }

  const referralId = genId('REF');
  appendByHeaders(refs.sheet, refs.headers, {
    id: referralId,
    referrer_phone: referrerPhone,
    referrer_code: refCode,
    referee_phone: refereePhone,
    referee_user_id: referee.id || '',
    status: 'pending',
    trigger_order_id: '',
    trigger_order_total: '',
    reward_referrer_points: cfg.rewardReferrer,
    reward_referee_points: cfg.rewardReferee,
    created_at: nowIso(),
    approved_at: '',
    notes: ''
  });

  return { success: true, message: 'Referral attached', referral_id: referralId, status: 'pending' };
}

function handleEvaluateReferral(data) {
  if (!data) return { success: false, error_code: 'INVALID_PAYLOAD', message: 'data required' };

  const cfg = getReferralConfig();
  if (!cfg.enabled) {
    return { success: false, error_code: 'REFERRAL_DISABLED', message: 'Referral disabled' };
  }

  const buyerPhone = normalizePhone(data.buyer_phone || '');
  const orderId = normalizeOrderId(data.order_id || '');
  const orderStatus = String(data.order_status || '').toLowerCase();
  const orderTotal = parseNumber(data.order_total);

  if (!buyerPhone || !orderId) {
    return { success: false, error_code: 'INVALID_PAYLOAD', message: 'buyer_phone and order_id required' };
  }
  if (!(orderStatus === 'selesai' || orderStatus === 'paid')) {
    return { success: false, error_code: 'ORDER_NOT_ELIGIBLE', message: 'Order status belum eligible' };
  }
  if (orderTotal < cfg.minFirstOrder) {
    return { success: false, error_code: 'MIN_ORDER_NOT_MET', message: 'Minimum order belum terpenuhi' };
  }

  // Global idempotency guard: if any referral already attached to this order_id, skip.
  const existingByOrder = findReferralByTriggerOrderId(orderId);
  if (existingByOrder) {
    return {
      success: true,
      message: 'Already processed by trigger_order_id',
      referral_id: existingByOrder.id,
      order_id: orderId
    };
  }

  const refs = getRowsAsObjects('referrals');
  const headers = refs.headers;
  const rows = refs.rows;
  const sheet = refs.sheet;

  if (headers.length === 0) {
    return { success: false, error_code: 'REFERRALS_HEADERS_INVALID', message: 'Sheet referrals belum ada header' };
  }

  let rowNumber = -1;
  let ref = null;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (normalizePhone(r.referee_phone || '') === buyerPhone) {
      var st = String(r.status || '').toLowerCase();

      if (st === 'approved') {
        return { success: true, message: 'Already processed', referral_id: r.id };
      }
      if (st === 'pending') {
        rowNumber = i + 2;
        ref = r;
        break;
      }
    }
  }

  if (!ref) {
    return { success: false, error_code: 'REFERRAL_NOT_FOUND', message: 'Referral pending tidak ditemukan' };
  }

  setCellIfColumnExists(sheet, headers, rowNumber, 'status', 'approved');
  setCellIfColumnExists(sheet, headers, rowNumber, 'trigger_order_id', orderId);
  setCellIfColumnExists(sheet, headers, rowNumber, 'trigger_order_total', orderTotal);
  setCellIfColumnExists(sheet, headers, rowNumber, 'approved_at', nowIso());

  const rewardReferrer = parseInt(ref.reward_referrer_points || cfg.rewardReferrer, 10) || cfg.rewardReferrer;
  const rewardReferee = parseInt(ref.reward_referee_points || cfg.rewardReferee, 10) || cfg.rewardReferee;

  const u1 = upsertUserPoints(
    ref.referrer_phone,
    rewardReferrer,
    'referrals',
    orderId,
    'Referral bonus referrer',
    'system'
  );
  const u2 = upsertUserPoints(
    ref.referee_phone,
    rewardReferee,
    'referrals',
    orderId,
    'Referral welcome bonus',
    'system'
  );

  if (!u1.success || !u2.success) {
    return { success: false, error_code: 'POINT_UPDATE_FAILED', message: 'Gagal update points' };
  }

  updateReferrerSummary(ref.referrer_phone, rewardReferrer);

  return {
    success: true,
    message: 'Referral approved',
    referral_id: ref.id,
    order_id: orderId,
    referrer_reward: rewardReferrer,
    referee_reward: rewardReferee
  };
}

// ========================================
// SETTINGS UPSERT
// ========================================

function handleUpsertSetting(data) {
  if (!data) return { success: false, error: 'data required' };
  const key = String(data.key || '').trim();
  const value = String(data.value === undefined ? '' : data.value);
  if (!key) return { success: false, error: 'key required' };

  const s = getRowsAsObjects('settings');
  const headers = s.headers;
  const keyIdx = headers.indexOf('key');
  const valIdx = headers.indexOf('value');
  if (keyIdx === -1 || valIdx === -1) {
    return { success: false, error: 'settings headers invalid (require key,value)' };
  }

  let rowNo = -1;
  for (var i = 0; i < s.rows.length; i++) {
    if (String(s.rows[i].key || '').trim() === key) {
      rowNo = i + 2;
      break;
    }
  }

  if (rowNo === -1) {
    appendByHeaders(s.sheet, headers, { key: key, value: value });
    return { success: true, created: 1, key: key, value: value };
  }

  s.sheet.getRange(rowNo, valIdx + 1).setValue(value);
  return { success: true, affected: 1, key: key, value: value };
}

// ========================================
// UTILS
// ========================================

function withScriptLock(callback) {
  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(LOCK_TIMEOUT_MS);
  if (!locked) {
    return {
      success: false,
      error_code: 'LOCK_TIMEOUT',
      message: 'Sistem sedang sibuk, coba lagi beberapa detik.'
    };
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function getSheet(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  return sheet;
}

function getRowsAsObjects(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length === 0) return { sheet: sheet, headers: [], rows: [] };
  const headers = values[0];
  const rows = values.slice(1).map(function(r) { return toObject(headers, r); });
  return { sheet: sheet, headers: headers, rows: rows };
}

function toObject(headers, row) {
  const obj = {};
  headers.forEach(function(h, i) { obj[h] = row[i]; });
  return obj;
}

function appendByHeaders(sheet, headers, obj) {
  const row = headers.map(function(h) {
    return obj[h] !== undefined ? obj[h] : '';
  });
  sheet.appendRow(row);
}

function setCellIfColumnExists(sheet, headers, rowNumber, colName, value) {
  const idx = headers.indexOf(colName);
  if (idx !== -1) sheet.getRange(rowNumber, idx + 1).setValue(value);
}

function jsonOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function nowIso() {
  return new Date().toISOString();
}

function genId(prefix) {
  return prefix + '-' + Date.now().toString();
}

function parseNumber(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function normalizeOrderId(orderId) {
  return String(orderId || '').trim();
}

function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/[^0-9]/g, '');
  if (p.indexOf('62') === 0) {
    p = '0' + p.substring(2);
  } else if (p.indexOf('8') === 0 && p.indexOf('08') !== 0) {
    p = '0' + p;
  } else if (p.indexOf('0') !== 0) {
    p = '0' + p;
  }
  return p;
}

function getSettingsMap() {
  const s = getRowsAsObjects('settings');
  const map = {};
  const keyCol = s.headers.indexOf('key');
  const valCol = s.headers.indexOf('value');
  if (keyCol === -1 || valCol === -1) return map;
  s.rows.forEach(function(r) {
    const k = String(r.key || '').trim();
    if (k) map[k] = r.value;
  });
  return map;
}

function getReferralConfig() {
  const set = getSettingsMap();
  return {
    enabled: String(set.referral_enabled || 'true').toLowerCase() === 'true',
    rewardReferrer: parseInt(set.referral_reward_referrer || '20', 10) || 20,
    rewardReferee: parseInt(set.referral_reward_referee || '10', 10) || 10,
    minFirstOrder: parseNumber(set.referral_min_first_order || '50000')
  };
}

function findReferralByTriggerOrderId(orderId) {
  const normalizedOrderId = normalizeOrderId(orderId);
  if (!normalizedOrderId) return null;
  const refs = getRowsAsObjects('referrals').rows;
  for (var i = 0; i < refs.length; i++) {
    var triggerOrder = normalizeOrderId(refs[i].trigger_order_id || '');
    if (triggerOrder && triggerOrder === normalizedOrderId) {
      return refs[i];
    }
  }
  return null;
}

function pointTransactionExists(phone, source, sourceId) {
  const normalizedPhone = normalizePhone(phone || '');
  const normalizedSource = String(source || '').trim();
  const normalizedSourceId = String(sourceId || '').trim();
  if (!normalizedPhone || !normalizedSource || !normalizedSourceId) return false;

  const trx = getRowsAsObjects('point_transactions');
  if (!trx.headers.length) return false;

  for (var i = 0; i < trx.rows.length; i++) {
    var row = trx.rows[i];
    var samePhone = normalizePhone(row.phone || '') === normalizedPhone;
    var sameSource = String(row.source || '').trim() === normalizedSource;
    var sameSourceId = String(row.source_id || '').trim() === normalizedSourceId;
    if (samePhone && sameSource && sameSourceId) {
      return true;
    }
  }
  return false;
}

function upsertUserPoints(phone, delta, source, sourceId, notes, actor) {
  const normalized = normalizePhone(phone || '');
  if (!normalized) return { success: false, error: 'Invalid phone' };

  // Ledger dedup guard before mutation.
  if (pointTransactionExists(normalized, source, sourceId)) {
    const snap = getRowsAsObjects('user_points');
    var currentBalance = 0;
    for (var i = 0; i < snap.rows.length; i++) {
      if (normalizePhone(snap.rows[i].phone || '') === normalized) {
        currentBalance = parseNumber(snap.rows[i].points);
        break;
      }
    }
    return { success: true, dedup: true, balance: currentBalance };
  }

  const u = getRowsAsObjects('user_points');
  const pCol = u.headers.indexOf('phone');
  const pointsCol = u.headers.indexOf('points');
  const lastCol = u.headers.indexOf('last_updated');
  if (pCol === -1 || pointsCol === -1 || lastCol === -1) {
    return { success: false, error: 'Invalid user_points headers' };
  }

  var rowNo = -1;
  var current = 0;
  for (var j = 0; j < u.rows.length; j++) {
    if (normalizePhone(u.rows[j].phone || '') === normalized) {
      rowNo = j + 2;
      current = parseNumber(u.rows[j].points);
      break;
    }
  }

  const next = current + parseNumber(delta);
  if (rowNo === -1) {
    u.sheet.appendRow([normalized, next, nowIso()]);
  } else {
    u.sheet.getRange(rowNo, pointsCol + 1).setValue(next);
    u.sheet.getRange(rowNo, lastCol + 1).setValue(nowIso());
  }

  const trx = getRowsAsObjects('point_transactions');
  if (trx.headers.length > 0) {
    appendByHeaders(trx.sheet, trx.headers, {
      id: genId('PTX'),
      phone: normalized,
      type: parseNumber(delta) >= 0 ? 'referral_bonus' : 'adjustment',
      points_delta: parseNumber(delta),
      balance_after: next,
      source: source || 'referrals',
      source_id: sourceId || '',
      notes: notes || '',
      created_at: nowIso(),
      actor: actor || 'system'
    });
  }

  return { success: true, balance: next };
}

function updateReferrerSummary(referrerPhone, rewardPoints) {
  const usersData = getRowsAsObjects('users');
  const headers = usersData.headers;
  const rows = usersData.rows;
  const sheet = usersData.sheet;

  const waCol = headers.indexOf('whatsapp');
  const countCol = headers.indexOf('referral_count');
  const totalCol = headers.indexOf('referral_points_total');
  if (waCol === -1 || countCol === -1 || totalCol === -1) return;

  const target = normalizePhone(referrerPhone);
  for (var i = 0; i < rows.length; i++) {
    const rowPhone = normalizePhone(rows[i].whatsapp || '');
    if (rowPhone === target) {
      const rowNo = i + 2;
      const oldCount = parseInt(rows[i].referral_count || 0, 10) || 0;
      const oldTotal = parseInt(rows[i].referral_points_total || 0, 10) || 0;
      sheet.getRange(rowNo, countCol + 1).setValue(oldCount + 1);
      sheet.getRange(rowNo, totalCol + 1).setValue(oldTotal + rewardPoints);
      break;
    }
  }
}

// ========================================
// BACKGROUND JOB: LOYALTY POINTS
// ========================================

function processLoyaltyPoints() {
  try {
    const ordersSheet = getSheet('orders');
    const pointsSheet = getSheet('user_points');

    const ordersData = ordersSheet.getDataRange().getValues();
    const pointsData = pointsSheet.getDataRange().getValues();
    if (ordersData.length < 2) return;

    const ordersHeaders = ordersData[0];
    const pointsHeaders = pointsData[0];

    const phoneColIdx = ordersHeaders.indexOf('phone');
    const poinColIdx = ordersHeaders.indexOf('poin');
    const processedColIdx = ordersHeaders.indexOf('point_processed');
    if (phoneColIdx === -1 || poinColIdx === -1 || processedColIdx === -1) return;

    let processed = 0;
    for (var i = 1; i < ordersData.length; i++) {
      const row = ordersData[i];
      const phone = normalizePhone(row[phoneColIdx]);
      const poin = parseFloat(row[poinColIdx]) || 0;
      const isProcessed = row[processedColIdx];
      if (isProcessed === 'Yes' || poin <= 0 || !phone) continue;

      let userPointsRowIdx = -1;
      let currentPoints = 0;
      for (var j = 1; j < pointsData.length; j++) {
        const pointsRow = pointsData[j];
        const pointsPhone = normalizePhone(pointsRow[pointsHeaders.indexOf('phone')]);
        if (pointsPhone === phone) {
          userPointsRowIdx = j + 1;
          currentPoints = parseFloat(pointsRow[pointsHeaders.indexOf('points')]) || 0;
          break;
        }
      }

      const newPoints = currentPoints + poin;
      const timestamp = new Date().toLocaleString('id-ID');
      if (userPointsRowIdx === -1) {
        pointsSheet.appendRow([phone, newPoints, timestamp]);
      } else {
        pointsSheet.getRange(userPointsRowIdx, pointsHeaders.indexOf('points') + 1).setValue(newPoints);
        pointsSheet.getRange(userPointsRowIdx, pointsHeaders.indexOf('last_updated') + 1).setValue(timestamp);
      }

      ordersSheet.getRange(i + 1, processedColIdx + 1).setValue('Yes');
      processed++;
    }

    return { success: true, processed: processed };
  } catch (error) {
    Logger.log('Error in processLoyaltyPoints: ' + error.toString());
    return { error: error.toString() };
  }
}
