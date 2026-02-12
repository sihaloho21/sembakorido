/**
 * ========================================
 * GOSEMBAKO - Google Apps Script API
 * Version: 7.1 (Fraud Risk Engine Rule-Based)
 * ========================================
 *
 * PENAMBAHAN v6.8:
 * - LockService pada flow referral (attach/evaluate) untuk mencegah race condition.
 * - Idempotency evaluate referral berbasis trigger_order_id global.
 * - Dedup ledger point_transactions berbasis (source + source_id + phone).
 * - upsert_setting untuk update-in-place settings (tanpa menumpuk baris).
 * - Integrasi lifecycle order referral:
 *   - Grant reward hanya untuk status final: paid/selesai.
 *   - Reversal otomatis saat order dibatalkan setelah reward.
 *   - Reversal idempotent (tidak rollback ganda).
 * - Monitoring alert:
 *   - Endpoint notify_referral_alert (email + webhook opsional).
 *   - Throttle alert via CacheService berdasarkan cooldown menit.
 * - Hardening security:
 *   - Guard action: aksi sensitif wajib ADMIN_TOKEN.
 * - Schema validator:
 *   - ensureSchema() untuk create/melengkapi kolom sheet penting.
 * - Rekonsiliasi terjadwal:
 *   - runReferralReconciliationAudit() + log ke referral_audit_logs.
 *   - helper install/remove trigger audit.
 * - Akses publik terkontrol:
 *   - doGet: token hanya wajib untuk sheet sensitif.
 *   - doPost: whitelist action+sheet publik yang aman.
 * - Perbaikan header:
 *   - Normalisasi header kosong (anggap kosong jika semua sel header blank).
 * - Hardening public create:
 *   - Validasi payload minimal.
 *   - Rate-limit berbasis CacheService.
 * - Hardening attach_referral:
 *   - Validasi payload minimal.
 *   - Rate-limit berbasis CacheService.
 * - Mapping object:
 *   - Skip header kosong ('') saat mapping row ke object.
 * - Create users:
 *   - Duplicate-check nomor whatsapp/phone.
 *   - Atomic lock saat create untuk cegah race condition.
 * - Monitoring webhook:
 *   - Verifikasi status code HTTP (hanya 2xx dianggap sukses).
 * - Public create security:
 *   - Optional signature HMAC (settings-driven).
 * - Fraud Risk Engine:
 *   - Rule-based screening pada evaluasi referral.
 *   - Flag otomatis untuk pola berisiko (IP/device/kecepatan/cancel/nomor mirip).
 *   - Logging keputusan ke fraud_risk_logs.
 */

// ========================================
// KONFIGURASI
// ========================================

const SPREADSHEET_ID = '174qAwA2hddfQOFUFDx7czOtpRlD9WUiiIaf6Yao8WRc';
const ADMIN_TOKEN = ''; // contoh: 'SECRET123'

const SHEET_WHITELIST = [
  'products', 'categories', 'orders', 'users', 'user_points', 'tukar_poin',
  'banners', 'claims', 'settings', 'pembelian', 'suppliers', 'biaya_bulanan',
  'referrals', 'point_transactions', 'referral_audit_logs', 'fraud_risk_logs',
  'credit_accounts', 'credit_invoices', 'credit_ledger'
];

const LOCK_TIMEOUT_MS = 30000;
const AUDIT_TRIGGER_HANDLER = 'runReferralReconciliationAudit';
const PAYLATER_LIMIT_TRIGGER_HANDLER = 'runProcessPaylaterLimitFromOrdersTrigger';
const PAYLATER_LIMIT_TRIGGER_MODE_PROP = 'paylater_limit_trigger_mode';
const PAYLATER_LIMIT_TRIGGER_HOUR_PROP = 'paylater_limit_trigger_hour';
const PUBLIC_CREATE_WINDOW_SECONDS = 60;
const PUBLIC_CREATE_MAX_REQUESTS = 6;
const ATTACH_REFERRAL_WINDOW_SECONDS = 60;
const ATTACH_REFERRAL_MAX_REQUESTS = 8;
const PUBLIC_CREATE_HMAC_MAX_AGE_SECONDS = 300;
const FRAUD_PHONE_DISTANCE_THRESHOLD = 2;
const CLAIM_REWARD_WINDOW_SECONDS = 60;
const CLAIM_REWARD_MAX_REQUESTS = 8;
const PUBLIC_LOGIN_WINDOW_SECONDS = 60;
const PUBLIC_LOGIN_MAX_REQUESTS = 12;
const PUBLIC_SESSION_TTL_SECONDS = 86400;

const SENSITIVE_GET_SHEETS = {
  orders: true,
  users: true,
  user_points: true,
  claims: true,
  settings: true,
  pembelian: true,
  suppliers: true,
  biaya_bulanan: true,
  referrals: true,
  point_transactions: true,
  referral_audit_logs: true,
  fraud_risk_logs: true,
  credit_accounts: true,
  credit_invoices: true,
  credit_ledger: true
};

const PUBLIC_POST_RULES = {
  attach_referral: { anySheet: true },
  claim_reward: { anySheet: true },
  create: { sheets: { orders: true, users: true, claims: true } }
};

const SCHEMA_REQUIREMENTS = {
  users: [
    'id', 'nama', 'whatsapp', 'pin', 'total_points', 'status', 'created_at',
    'tanggal_daftar', 'kode_referral', 'referred_by', 'referred_by_phone',
    'referral_count', 'referral_points_total'
  ],
  user_points: ['phone', 'points', 'last_updated'],
  referrals: [
    'id', 'referrer_phone', 'referrer_code', 'referee_phone', 'referee_user_id',
    'status', 'trigger_order_id', 'trigger_order_total', 'reward_referrer_points',
    'reward_referee_points', 'created_at', 'approved_at', 'reversed_at',
    'updated_at', 'notes'
  ],
  point_transactions: [
    'id', 'phone', 'type', 'points_delta', 'balance_after', 'source',
    'source_id', 'notes', 'created_at', 'actor'
  ],
  settings: ['key', 'value'],
  referral_audit_logs: [
    'id', 'run_at', 'status', 'mismatch_count', 'stale_pending_count',
    'pending_threshold_days', 'summary_json'
  ],
  tukar_poin: [
    'id', 'nama', 'judul', 'poin', 'gambar', 'deskripsi',
    'reward_stock', 'daily_quota', 'daily_claim_count', 'daily_claim_date'
  ],
  fraud_risk_logs: [
    'id', 'created_at', 'event', 'referral_id', 'referrer_phone', 'referee_phone',
    'order_id', 'order_total', 'ip_address', 'device_id', 'user_agent',
    'risk_score', 'risk_level', 'decision', 'triggered_rules_json', 'notes'
  ],
  credit_accounts: [
    'id', 'phone', 'user_id', 'credit_limit', 'available_limit', 'used_limit',
    'status', 'admin_initial_limit', 'limit_growth_total', 'notes',
    'created_at', 'updated_at'
  ],
  credit_invoices: [
    'id', 'invoice_id', 'phone', 'user_id', 'source_order_id',
    'principal', 'tenor_weeks', 'fee_percent', 'fee_amount',
    'penalty_percent_daily', 'penalty_cap_percent', 'penalty_amount',
    'total_before_penalty', 'total_due', 'paid_amount',
    'due_date', 'status', 'notes', 'created_at', 'updated_at', 'paid_at', 'closed_at'
  ],
  credit_ledger: [
    'id', 'phone', 'user_id', 'invoice_id', 'type', 'amount',
    'balance_before', 'balance_after', 'ref_id', 'note', 'actor', 'created_at'
  ]
};

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

  if (action === 'public_login') {
    return jsonOutput(handlePublicLogin(params));
  }
  if (action === 'public_user_profile') {
    return jsonOutput(handlePublicUserProfile(params));
  }
  if (action === 'public_user_points') {
    return jsonOutput(handlePublicUserPoints(params));
  }
  if (action === 'public_user_orders') {
    return jsonOutput(handlePublicUserOrders(params));
  }
  if (action === 'public_referral_history') {
    return jsonOutput(handlePublicReferralHistory(params));
  }
  if (action === 'public_referral_config') {
    return jsonOutput(handlePublicReferralConfig(params));
  }
  if (action === 'public_paylater_summary') {
    return jsonOutput(handlePublicPaylaterSummary(params));
  }
  if (action === 'public_paylater_invoices') {
    return jsonOutput(handlePublicPaylaterInvoices(params));
  }
  if (action === 'public_paylater_invoice_detail') {
    return jsonOutput(handlePublicPaylaterInvoiceDetail(params));
  }

  if (!sheetName || SHEET_WHITELIST.indexOf(sheetName) === -1) {
    return jsonOutput({ error: 'Invalid sheet' });
  }

  if (isGetSheetSensitive(sheetName) && ADMIN_TOKEN && token !== ADMIN_TOKEN) {
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

function handlePublicLogin(params) {
  const phone = normalizePhone(params.phone || params.whatsapp || '');
  const pin = String(params.pin || '').trim();

  if (!phone || !pin) {
    return {
      success: false,
      error: 'INVALID_PAYLOAD',
      message: 'phone dan pin wajib diisi'
    };
  }
  if (!/^\d{6}$/.test(pin)) {
    return {
      success: false,
      error: 'INVALID_PAYLOAD',
      message: 'PIN harus 6 digit angka'
    };
  }

  const rateLimitError = enforcePublicLoginRateLimit(phone);
  if (rateLimitError) return rateLimitError;

  const usersData = getRowsAsObjects('users');
  if (!usersData.headers.length) {
    return {
      success: false,
      error: 'USERS_HEADERS_INVALID',
      message: 'Sheet users belum ada header'
    };
  }

  var foundUser = null;
  var foundUserRowNumber = -1;
  for (var i = 0; i < usersData.rows.length; i++) {
    var row = usersData.rows[i];
    const rowPhone = normalizePhone(row.whatsapp || row.phone || '');
    if (rowPhone === phone) {
      foundUser = row;
      foundUserRowNumber = i + 2;
      break;
    }
  }

  if (!foundUser || String(foundUser.pin || '').trim() !== pin) {
    return {
      success: false,
      error: 'LOGIN_FAILED',
      message: 'Nomor WhatsApp atau PIN salah'
    };
  }

  if (foundUser.status && String(foundUser.status).toLowerCase() !== 'aktif') {
    return {
      success: false,
      error: 'ACCOUNT_INACTIVE',
      message: 'Akun tidak aktif'
    };
  }

  const headers = usersData.headers;
  const kodeReferralCol = headers.indexOf('kode_referral');
  const referredByCol = headers.indexOf('referred_by');
  const referralCountCol = headers.indexOf('referral_count');
  const referralPointsTotalCol = headers.indexOf('referral_points_total');

  // Ensure user has referral code for seamless akun referral UI.
  var kodeReferral = String(foundUser.kode_referral || '').trim().toUpperCase();
  if (!kodeReferral && kodeReferralCol !== -1 && foundUserRowNumber !== -1) {
    const existingCodes = {};
    for (var j = 0; j < usersData.rows.length; j++) {
      const code = String(usersData.rows[j].kode_referral || '').trim().toUpperCase();
      if (code) existingCodes[code] = true;
    }
    kodeReferral = generateReferralCodeForUser(foundUser.nama || 'USER', phone, existingCodes);
    usersData.sheet.getRange(foundUserRowNumber, kodeReferralCol + 1).setValue(kodeReferral);
    foundUser.kode_referral = kodeReferral;
  }

  const sessionToken = issuePublicSession(phone);

  return {
    success: true,
    session_token: sessionToken,
    user: {
      id: foundUser.id || '',
      nama: foundUser.nama || '',
      whatsapp: phone,
      phone: phone,
      status: foundUser.status || '',
      tanggal_daftar: foundUser.tanggal_daftar || '',
      total_points: parseNumber(foundUser.total_points || foundUser.points || foundUser.poin || 0),
      kode_referral: kodeReferral || '',
      referred_by: referredByCol !== -1 ? String(foundUser.referred_by || '').trim().toUpperCase() : '',
      referral_count: referralCountCol !== -1 ? parseInt(foundUser.referral_count || 0, 10) || 0 : 0,
      referral_points_total: referralPointsTotalCol !== -1 ? parseInt(foundUser.referral_points_total || 0, 10) || 0 : 0,
      session_token: sessionToken
    }
  };
}

function issuePublicSession(phone) {
  const normalizedPhone = normalizePhone(phone || '');
  if (!normalizedPhone) return '';
  const token = 'sess_' + Utilities.getUuid() + '_' + Date.now();
  try {
    const cache = CacheService.getScriptCache();
    cache.put('pub_session:' + token, normalizedPhone, PUBLIC_SESSION_TTL_SECONDS);
  } catch (error) {
    Logger.log('Issue public session cache error: ' + error.toString());
  }
  return token;
}

function resolvePublicSessionPhone(params) {
  const token = String((params && (params.session_token || params.session || params.st)) || '').trim();
  if (!token) return '';
  try {
    const cache = CacheService.getScriptCache();
    return normalizePhone(cache.get('pub_session:' + token) || '');
  } catch (error) {
    Logger.log('Resolve public session cache error: ' + error.toString());
    return '';
  }
}

function findUserByPhone(phone) {
  const target = normalizePhone(phone || '');
  if (!target) return { usersData: null, user: null, rowNumber: -1 };
  const usersData = getRowsAsObjects('users');
  for (var i = 0; i < usersData.rows.length; i++) {
    const row = usersData.rows[i];
    if (normalizePhone(row.whatsapp || row.phone || '') === target) {
      return { usersData: usersData, user: row, rowNumber: i + 2 };
    }
  }
  return { usersData: usersData, user: null, rowNumber: -1 };
}

function ensureReferralCodeForUser(usersData, foundUser, foundUserRowNumber, phone) {
  const headers = usersData.headers || [];
  const kodeReferralCol = headers.indexOf('kode_referral');
  var kodeReferral = String(foundUser.kode_referral || '').trim().toUpperCase();
  if (!kodeReferral && kodeReferralCol !== -1 && foundUserRowNumber !== -1) {
    const existingCodes = {};
    for (var j = 0; j < usersData.rows.length; j++) {
      const code = String(usersData.rows[j].kode_referral || '').trim().toUpperCase();
      if (code) existingCodes[code] = true;
    }
    kodeReferral = generateReferralCodeForUser(foundUser.nama || 'USER', phone, existingCodes);
    usersData.sheet.getRange(foundUserRowNumber, kodeReferralCol + 1).setValue(kodeReferral);
    foundUser.kode_referral = kodeReferral;
  }
  return kodeReferral;
}

function buildPublicUserPayload(foundUser, phone, sessionToken) {
  return {
    id: foundUser.id || '',
    nama: foundUser.nama || '',
    whatsapp: phone,
    phone: phone,
    status: foundUser.status || '',
    tanggal_daftar: foundUser.tanggal_daftar || '',
    total_points: parseNumber(foundUser.total_points || foundUser.points || foundUser.poin || 0),
    kode_referral: String(foundUser.kode_referral || '').trim().toUpperCase(),
    referred_by: String(foundUser.referred_by || '').trim().toUpperCase(),
    referral_count: parseInt(foundUser.referral_count || 0, 10) || 0,
    referral_points_total: parseInt(foundUser.referral_points_total || 0, 10) || 0,
    session_token: sessionToken || ''
  };
}

function handlePublicUserProfile(params) {
  const phone = resolvePublicSessionPhone(params);
  if (!phone) {
    return { success: false, error: 'UNAUTHORIZED_SESSION', message: 'Session login tidak valid' };
  }
  const found = findUserByPhone(phone);
  if (!found.user) {
    return { success: false, error: 'USER_NOT_FOUND', message: 'User tidak ditemukan' };
  }
  const kodeReferral = ensureReferralCodeForUser(found.usersData, found.user, found.rowNumber, phone);
  found.user.kode_referral = kodeReferral;
  return { success: true, user: buildPublicUserPayload(found.user, phone, String(params.session_token || '')) };
}

function handlePublicUserPoints(params) {
  const phone = resolvePublicSessionPhone(params);
  if (!phone) {
    return { success: false, error: 'UNAUTHORIZED_SESSION', message: 'Session login tidak valid' };
  }
  const pointsObj = getRowsAsObjects('user_points');
  var points = 0;
  var updatedAt = '';
  for (var i = 0; i < pointsObj.rows.length; i++) {
    const row = pointsObj.rows[i];
    if (normalizePhone(row.phone || row.whatsapp || '') === phone) {
      points = parseNumber(row.points || row.poin || 0);
      updatedAt = String(row.last_updated || '');
      break;
    }
  }
  return {
    success: true,
    phone: phone,
    points: points,
    last_updated: updatedAt
  };
}

function handlePublicUserOrders(params) {
  const phone = resolvePublicSessionPhone(params);
  if (!phone) {
    return { success: false, error: 'UNAUTHORIZED_SESSION', message: 'Session login tidak valid' };
  }
  const ordersObj = getRowsAsObjects('orders');
  const rows = ordersObj.rows.filter(function(r) {
    return normalizePhone(r.phone || r.whatsapp || '') === phone;
  });
  return { success: true, phone: phone, orders: rows };
}

function handlePublicReferralHistory(params) {
  const phone = resolvePublicSessionPhone(params);
  if (!phone) {
    return { success: false, error: 'UNAUTHORIZED_SESSION', message: 'Session login tidak valid' };
  }
  const refsObj = getRowsAsObjects('referrals');
  const rows = refsObj.rows
    .filter(function(r) {
      const referrer = normalizePhone(r.referrer_phone || '');
      const referee = normalizePhone(r.referee_phone || '');
      return referrer === phone || referee === phone;
    })
    .sort(function(a, b) {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    })
    .slice(0, 10);
  return { success: true, phone: phone, referrals: rows };
}

function handlePublicReferralConfig(params) {
  const cfg = getReferralConfig();
  return {
    success: true,
    referral_enabled: cfg.enabled,
    reward_referrer_points: parseInt(cfg.rewardReferrer || 0, 10) || 0,
    reward_referee_points: parseInt(cfg.rewardReferee || 0, 10) || 0,
    min_first_order: parseNumber(cfg.minFirstOrder || 0)
  };
}

function handlePublicPaylaterSummary(params) {
  const phone = resolvePublicSessionPhone(params);
  if (!phone) {
    return { success: false, error: 'UNAUTHORIZED_SESSION', message: 'Session login tidak valid' };
  }

  const found = findCreditAccountByPhone(phone);
  const account = (found && found.row) ? found.row : null;
  const invObj = getRowsAsObjects('credit_invoices');
  const rows = invObj.rows.filter(function(row) {
    return normalizePhone(row.phone || '') === phone;
  });

  var activeCount = 0;
  var overdueCount = 0;
  var openDue = 0;
  var openPaid = 0;
  for (var i = 0; i < rows.length; i++) {
    var st = String(rows[i].status || '').toLowerCase().trim();
    var totalDue = toMoneyInt(rows[i].total_due || 0);
    var paid = toMoneyInt(rows[i].paid_amount || 0);
    if (st === 'active' || st === 'overdue') {
      activeCount++;
      openDue += totalDue;
      openPaid += paid;
    }
    if (st === 'overdue') overdueCount++;
  }

  return {
    success: true,
    phone: phone,
    account: account || {
      phone: phone,
      credit_limit: 0,
      available_limit: 0,
      used_limit: 0,
      status: 'inactive'
    },
    summary: {
      invoice_count_total: rows.length,
      invoice_count_active: activeCount,
      invoice_count_overdue: overdueCount,
      total_due_open: openDue,
      paid_amount_open: openPaid,
      remaining_open: Math.max(0, openDue - openPaid)
    }
  };
}

function handlePublicPaylaterInvoices(params) {
  const phone = resolvePublicSessionPhone(params);
  if (!phone) {
    return { success: false, error: 'UNAUTHORIZED_SESSION', message: 'Session login tidak valid' };
  }

  const invObj = getRowsAsObjects('credit_invoices');
  const rows = invObj.rows
    .filter(function(row) {
      return normalizePhone(row.phone || '') === phone;
    })
    .sort(function(a, b) {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

  return {
    success: true,
    phone: phone,
    invoices: rows.slice(0, 50)
  };
}

function handlePublicPaylaterInvoiceDetail(params) {
  const phone = resolvePublicSessionPhone(params);
  if (!phone) {
    return { success: false, error: 'UNAUTHORIZED_SESSION', message: 'Session login tidak valid' };
  }

  const invoiceId = String(params.invoice_id || params.id || '').trim();
  if (!invoiceId) {
    return { success: false, error: 'INVALID_PAYLOAD', message: 'invoice_id wajib diisi' };
  }

  const found = findCreditInvoiceByInvoiceId(invoiceId);
  if (!found || !found.row) {
    return { success: false, error: 'INVOICE_NOT_FOUND', message: 'Invoice tidak ditemukan' };
  }
  const invoicePhone = normalizePhone(found.row.phone || '');
  if (invoicePhone !== phone) {
    return { success: false, error: 'FORBIDDEN', message: 'Invoice bukan milik user ini' };
  }

  const ledObj = getRowsAsObjects('credit_ledger');
  const ledgerRows = ledObj.rows
    .filter(function(row) {
      return String(row.invoice_id || '').trim() === invoiceId &&
        normalizePhone(row.phone || '') === phone;
    })
    .sort(function(a, b) {
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    });

  return {
    success: true,
    phone: phone,
    invoice: found.row,
    ledger: ledgerRows
  };
}

function generateReferralCodeForUser(name, phone, existingCodesMap) {
  const baseName = String(name || 'USER').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'USER';
  const phoneDigits = normalizePhone(phone || '').replace(/[^0-9]/g, '');
  const suffix = phoneDigits.slice(-4) || String(Math.floor(1000 + Math.random() * 9000));
  var candidate = (baseName + suffix).slice(0, 24);

  if (!existingCodesMap[candidate]) return candidate;

  for (var i = 1; i <= 2000; i++) {
    const alt = (baseName + suffix + String(i)).slice(0, 24);
    if (!existingCodesMap[alt]) return alt;
  }

  return (baseName + String(Date.now()).slice(-6)).slice(0, 24);
}

function doPost(e) {
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
    const actionKey = resolveActionKey(action, data);
    const token = resolveRequestToken(e, body);

    const authError = guardActionAuthorization(actionKey, token, sheetName);
    if (authError) return jsonOutput(authError);

    if (actionKey === 'attach_referral') {
      const attachPayloadError = validateAttachReferralPayload(data);
      if (attachPayloadError) return jsonOutput(attachPayloadError);
      const attachRateLimitError = enforceAttachReferralRateLimit(data);
      if (attachRateLimitError) return jsonOutput(attachRateLimitError);
    }

    if (actionKey === 'claim_reward') {
      const claimPayloadError = validateClaimRewardPayload(data);
      if (claimPayloadError) return jsonOutput(claimPayloadError);
      const claimRateLimitError = enforceClaimRewardRateLimit(data);
      if (claimRateLimitError) return jsonOutput(claimRateLimitError);
    }

    if (isPublicCreateAction(actionKey, sheetName)) {
      const signatureError = validatePublicCreateSignature(e, body, actionKey, sheetName, data);
      if (signatureError) return jsonOutput(signatureError);
      const payloadError = validatePublicCreatePayload(sheetName, data);
      if (payloadError) return jsonOutput(payloadError);
      const limitError = enforcePublicCreateRateLimit(sheetName, data);
      if (limitError) return jsonOutput(limitError);
    }

    if (isSheetValidationRequired(actionKey) && (!sheetName || SHEET_WHITELIST.indexOf(sheetName) === -1)) {
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

    if (action === 'sync_referral_order_status') {
      return jsonOutput(withScriptLock(function() {
        return handleSyncReferralOrderStatus(data);
      }));
    }

    if (action === 'claim_reward') {
      return jsonOutput(withScriptLock(function() {
        return handleClaimReward(data);
      }));
    }

    if (action === 'notify_referral_alert') {
      return jsonOutput(handleNotifyReferralAlert(data));
    }

    if (action === 'upsert_setting') {
      return jsonOutput(handleUpsertSetting(data));
    }

    if (action === 'ensure_schema') {
      return jsonOutput(handleEnsureSchema(data));
    }

    if (action === 'run_referral_reconciliation_audit') {
      return jsonOutput(withScriptLock(function() {
        return runReferralReconciliationAudit();
      }));
    }

    if (action === 'credit_account_get') {
      return jsonOutput(handleCreditAccountGet(data));
    }

    if (action === 'credit_account_upsert') {
      return jsonOutput(withScriptLock(function() {
        return handleCreditAccountUpsert(data);
      }));
    }

    if (action === 'credit_invoice_create') {
      return jsonOutput(withScriptLock(function() {
        return handleCreditInvoiceCreate(data);
      }));
    }

    if (action === 'credit_invoice_pay') {
      return jsonOutput(withScriptLock(function() {
        return handleCreditInvoicePay(data);
      }));
    }

    if (action === 'credit_limit_from_profit') {
      return jsonOutput(withScriptLock(function() {
        return handleCreditLimitFromProfit(data);
      }));
    }

    if (action === 'process_paylater_limit_from_orders') {
      return jsonOutput(withScriptLock(function() {
        return processPaylaterLimitFromOrders(data);
      }));
    }

    if (action === 'credit_invoice_apply_penalty') {
      return jsonOutput(withScriptLock(function() {
        return handleCreditInvoiceApplyPenalty(data);
      }));
    }

    if (action === 'credit_account_set_status') {
      return jsonOutput(withScriptLock(function() {
        return handleCreditAccountSetStatus(data);
      }));
    }

    if (action === 'install_paylater_limit_scheduler') {
      return jsonOutput(installPaylaterLimitScheduler(data));
    }

    if (action === 'remove_paylater_limit_scheduler') {
      return jsonOutput(removePaylaterLimitScheduler());
    }

    if (action === 'get_paylater_limit_scheduler') {
      return jsonOutput(getPaylaterLimitSchedulerInfo());
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
      if (sheetName === 'users') {
        return jsonOutput(createUserWithAtomicLock(data));
      }
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

  const fraudCheck = evaluateReferralFraudRisk(ref, data, orderId, orderTotal);
  logFraudRiskEvent({
    event: 'evaluate_referral',
    referral_id: ref.id || '',
    referrer_phone: ref.referrer_phone || '',
    referee_phone: ref.referee_phone || buyerPhone,
    order_id: orderId,
    order_total: orderTotal,
    ip_address: data.ip_address || data.ip || '',
    device_id: data.device_id || '',
    user_agent: data.user_agent || '',
    risk_score: fraudCheck.score,
    risk_level: fraudCheck.level,
    decision: fraudCheck.decision,
    triggered_rules_json: JSON.stringify(fraudCheck.triggeredRules),
    notes: fraudCheck.notes || ''
  });
  if (fraudCheck.decision !== 'allow') {
    setCellIfColumnExists(sheet, headers, rowNumber, 'status', 'fraud_review');
    setCellIfColumnExists(
      sheet,
      headers,
      rowNumber,
      'notes',
      'Referral ditahan oleh fraud engine: ' + fraudCheck.level
    );
    setCellIfColumnExists(sheet, headers, rowNumber, 'updated_at', nowIso());
    return {
      success: false,
      error_code: fraudCheck.decision === 'block' ? 'FRAUD_RISK_BLOCKED' : 'FRAUD_REVIEW_REQUIRED',
      message: 'Referral ditahan oleh fraud engine',
      risk_level: fraudCheck.level,
      risk_score: fraudCheck.score,
      triggered_rules: fraudCheck.triggeredRules
    };
  }

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
    // Best-effort compensation if one side already got points but the other failed.
    const rollback = [];
    if (u1.success && !u1.dedup) {
      const rb1 = upsertUserPoints(
        ref.referrer_phone,
        -Math.abs(rewardReferrer),
        'referrals_compensation',
        orderId,
        'Rollback referral reward (partial failure)',
        'system'
      );
      rollback.push({ target: 'referrer', success: rb1.success });
    }
    if (u2.success && !u2.dedup) {
      const rb2 = upsertUserPoints(
        ref.referee_phone,
        -Math.abs(rewardReferee),
        'referrals_compensation',
        orderId,
        'Rollback referral reward (partial failure)',
        'system'
      );
      rollback.push({ target: 'referee', success: rb2.success });
    }
    return {
      success: false,
      error_code: 'POINT_UPDATE_FAILED',
      message: 'Gagal update points',
      rollback: rollback
    };
  }

  // Finalize referral only after point mutation succeeds.
  setCellIfColumnExists(sheet, headers, rowNumber, 'status', 'approved');
  setCellIfColumnExists(sheet, headers, rowNumber, 'trigger_order_id', orderId);
  setCellIfColumnExists(sheet, headers, rowNumber, 'trigger_order_total', orderTotal);
  setCellIfColumnExists(sheet, headers, rowNumber, 'approved_at', nowIso());

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

function handleSyncReferralOrderStatus(data) {
  if (!data) return { success: false, error_code: 'INVALID_PAYLOAD', message: 'data required' };

  const orderStatus = String(data.order_status || '').toLowerCase().trim();
  const orderId = normalizeOrderId(data.order_id || '');
  if (!orderId) {
    return { success: false, error_code: 'INVALID_PAYLOAD', message: 'order_id required' };
  }

  if (isFinalReferralOrderStatus(orderStatus)) {
    return handleEvaluateReferral(data);
  }

  if (isCancelledReferralOrderStatus(orderStatus)) {
    return handleReverseReferralByOrder(data);
  }

  return {
    success: true,
    action: 'noop',
    message: 'Order status tidak memicu referral lifecycle',
    order_id: orderId
  };
}

function handleReverseReferralByOrder(data) {
  const orderId = normalizeOrderId(data.order_id || '');
  if (!orderId) {
    return { success: false, error_code: 'INVALID_PAYLOAD', message: 'order_id required' };
  }

  const refs = getRowsAsObjects('referrals');
  const headers = refs.headers;
  const rows = refs.rows;
  const sheet = refs.sheet;
  if (headers.length === 0) {
    return { success: false, error_code: 'REFERRALS_HEADERS_INVALID', message: 'Sheet referrals belum ada header' };
  }

  let rowNumber = -1;
  let referral = null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (normalizeOrderId(r.trigger_order_id || '') === orderId) {
      rowNumber = i + 2;
      referral = r;
      break;
    }
  }

  if (!referral) {
    return {
      success: true,
      action: 'noop',
      message: 'Tidak ada referral terkait order ini',
      order_id: orderId
    };
  }

  const referralStatus = String(referral.status || '').toLowerCase().trim();
  if (referralStatus === 'reversed') {
    return {
      success: true,
      action: 'already_reversed',
      message: 'Referral sudah pernah di-reversal',
      referral_id: referral.id,
      order_id: orderId
    };
  }

  if (referralStatus !== 'approved') {
    return {
      success: true,
      action: 'noop',
      message: 'Referral belum approved, tidak perlu reversal',
      referral_id: referral.id,
      order_id: orderId
    };
  }

  const rewardReferrer = parseInt(referral.reward_referrer_points || 0, 10) || 0;
  const rewardReferee = parseInt(referral.reward_referee_points || 0, 10) || 0;

  const r1 = upsertUserPoints(
    referral.referrer_phone,
    -Math.abs(rewardReferrer),
    'referrals_reversal',
    orderId,
    'Referral reversal: order canceled',
    'system'
  );
  const r2 = upsertUserPoints(
    referral.referee_phone,
    -Math.abs(rewardReferee),
    'referrals_reversal',
    orderId,
    'Referral reversal: order canceled',
    'system'
  );

  if (!r1.success || !r2.success) {
    return { success: false, error_code: 'POINT_REVERSAL_FAILED', message: 'Gagal reversal points' };
  }

  setCellIfColumnExists(sheet, headers, rowNumber, 'status', 'reversed');
  setCellIfColumnExists(sheet, headers, rowNumber, 'notes', 'Auto reversal karena order dibatalkan');
  setCellIfColumnExists(sheet, headers, rowNumber, 'reversed_at', nowIso());
  setCellIfColumnExists(sheet, headers, rowNumber, 'updated_at', nowIso());

  rollbackReferrerSummary(referral.referrer_phone, rewardReferrer);

  return {
    success: true,
    action: 'reversed',
    message: 'Referral rewards berhasil direversal',
    referral_id: referral.id,
    order_id: orderId,
    referrer_reversed: Math.abs(rewardReferrer),
    referee_reversed: Math.abs(rewardReferee)
  };
}

function handleClaimReward(data) {
  if (!data) return { success: false, error_code: 'INVALID_PAYLOAD', message: 'data required' };

  const rewardId = String(data.reward_id || data.id || '').trim();
  const phone = normalizePhone(data.phone || data.whatsapp || '');
  const customerName = String(data.customer_name || data.nama || '').trim();
  const requestId = String(data.request_id || data.claim_request_id || '').trim() || genId('RREQ');
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (!rewardId || !phone) {
    return {
      success: false,
      error_code: 'INVALID_PAYLOAD',
      message: 'reward_id dan phone wajib diisi'
    };
  }

  // Idempotent guard for same public request_id.
  if (pointTransactionExists(phone, 'reward_claim', requestId)) {
    const userSnapshot = getRowsAsObjects('user_points').rows;
    var currentBalance = 0;
    for (var i = 0; i < userSnapshot.length; i++) {
      if (normalizePhone(userSnapshot[i].phone || '') === phone) {
        currentBalance = parseNumber(userSnapshot[i].points);
        break;
      }
    }
    return {
      success: true,
      dedup: true,
      message: 'Request already processed',
      balance_after: currentBalance,
      request_id: requestId
    };
  }

  const rewardsObj = getRowsAsObjects('tukar_poin');
  if (!rewardsObj.headers.length) {
    return { success: false, error_code: 'TUKAR_POIN_HEADERS_INVALID', message: 'Header tukar_poin belum valid' };
  }
  const rewardRows = rewardsObj.rows;
  const rewardHeaders = rewardsObj.headers;
  const rewardSheet = rewardsObj.sheet;

  var rewardRowNumber = -1;
  var reward = null;
  for (var j = 0; j < rewardRows.length; j++) {
    if (String(rewardRows[j].id || '').trim() === rewardId) {
      rewardRowNumber = j + 2;
      reward = rewardRows[j];
      break;
    }
  }
  if (!reward) {
    return { success: false, error_code: 'REWARD_NOT_FOUND', message: 'Reward tidak ditemukan' };
  }

  const requiredPoints = parseNumber(reward.poin || 0);
  if (requiredPoints <= 0) {
    return { success: false, error_code: 'INVALID_REWARD_POINTS', message: 'Nilai poin reward tidak valid' };
  }

  const stockCol = rewardHeaders.indexOf('reward_stock');
  const quotaCol = rewardHeaders.indexOf('daily_quota');
  const countCol = rewardHeaders.indexOf('daily_claim_count');
  const dateCol = rewardHeaders.indexOf('daily_claim_date');

  var rewardStock = Math.max(0, parseInt(reward.reward_stock || 0, 10) || 0);
  var dailyQuota = Math.max(0, parseInt(reward.daily_quota || 0, 10) || 0);
  var dailyCount = Math.max(0, parseInt(reward.daily_claim_count || 0, 10) || 0);
  var dailyDate = String(reward.daily_claim_date || '').slice(0, 10);
  if (dailyDate !== today) {
    dailyCount = 0;
    dailyDate = today;
  }

  if (rewardStock <= 0) {
    return { success: false, error_code: 'REWARD_STOCK_EMPTY', message: 'Stok reward habis' };
  }
  if (dailyQuota > 0 && dailyCount >= dailyQuota) {
    return {
      success: false,
      error_code: 'REWARD_DAILY_QUOTA_REACHED',
      message: 'Quota harian reward sudah habis'
    };
  }

  const pointsObj = getRowsAsObjects('user_points');
  if (!pointsObj.headers.length) {
    return { success: false, error_code: 'USER_POINTS_HEADERS_INVALID', message: 'Header user_points belum valid' };
  }
  const pHeaders = pointsObj.headers;
  const pSheet = pointsObj.sheet;
  const pRows = pointsObj.rows;
  const pPhoneCol = pHeaders.indexOf('phone');
  const pPointsCol = pHeaders.indexOf('points');
  const pLastCol = pHeaders.indexOf('last_updated');
  if (pPhoneCol === -1 || pPointsCol === -1 || pLastCol === -1) {
    return { success: false, error_code: 'USER_POINTS_HEADERS_INVALID', message: 'Kolom user_points belum lengkap' };
  }

  var userRowNumber = -1;
  var userPoints = 0;
  for (var k = 0; k < pRows.length; k++) {
    if (normalizePhone(pRows[k].phone || '') === phone) {
      userRowNumber = k + 2;
      userPoints = parseNumber(pRows[k].points || 0);
      break;
    }
  }
  if (userRowNumber === -1) {
    return { success: false, error_code: 'USER_NOT_FOUND', message: 'User poin tidak ditemukan' };
  }
  if (userPoints < requiredPoints) {
    return {
      success: false,
      error_code: 'POINTS_INSUFFICIENT',
      message: 'Poin tidak cukup',
      balance: userPoints,
      required: requiredPoints
    };
  }

  const claimId = genId('CLM');
  const rewardName = String(reward.nama || reward.judul || 'Reward');

  const deduction = upsertUserPoints(
    phone,
    -Math.abs(requiredPoints),
    'reward_claim',
    requestId,
    'Claim reward: ' + rewardName,
    'public_claim'
  );
  if (!deduction.success) {
    return { success: false, error_code: 'POINT_DEDUCTION_FAILED', message: 'Gagal memotong poin user' };
  }

  // Update reward counters after deduction. If this fails, compensate point deduction.
  try {
    if (stockCol !== -1) rewardSheet.getRange(rewardRowNumber, stockCol + 1).setValue(Math.max(0, rewardStock - 1));
    if (quotaCol !== -1) rewardSheet.getRange(rewardRowNumber, quotaCol + 1).setValue(dailyQuota);
    if (countCol !== -1) rewardSheet.getRange(rewardRowNumber, countCol + 1).setValue(dailyCount + 1);
    if (dateCol !== -1) rewardSheet.getRange(rewardRowNumber, dateCol + 1).setValue(today);
  } catch (error) {
    upsertUserPoints(
      phone,
      Math.abs(requiredPoints),
      'reward_claim_compensation',
      requestId,
      'Rollback reward claim karena update stok gagal',
      'system'
    );
    return { success: false, error_code: 'REWARD_STOCK_UPDATE_FAILED', message: 'Gagal update stok/quota reward' };
  }

  const claimsObj = getRowsAsObjects('claims');
  if (claimsObj.headers.length > 0) {
    appendByHeaders(claimsObj.sheet, claimsObj.headers, {
      id: claimId,
      phone: phone,
      nama: customerName || phone,
      hadiah: rewardName,
      poin: requiredPoints,
      status: 'Pending',
      tanggal: nowIso(),
      reward_id: rewardId,
      request_id: requestId
    });
  }

  return {
    success: true,
    claim_id: claimId,
    reward_id: rewardId,
    reward_name: rewardName,
    points_used: requiredPoints,
    balance_after: deduction.balance,
    reward_stock_after: Math.max(0, rewardStock - 1),
    daily_quota: dailyQuota,
    daily_claim_count: dailyCount + 1,
    request_id: requestId
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

function handleNotifyReferralAlert(data) {
  const payload = data || {};
  const email = String(payload.email || '').trim();
  const webhook = String(payload.webhook || '').trim();

  if (!email && !webhook) {
    return {
      success: false,
      error_code: 'NO_CHANNEL',
      message: 'email atau webhook wajib diisi'
    };
  }

  const cooldownMinutes = Math.max(1, parseInt(payload.cooldown_minutes || payload.cooldownMinutes || 60, 10) || 60);
  const cooldownSeconds = cooldownMinutes * 60;
  const source = String(payload.source || 'dashboard').trim();

  const stalePendingCount = parseInt(payload.stale_pending_count || 0, 10) || 0;
  const mismatchCount = parseInt(payload.mismatch_count || 0, 10) || 0;
  const spikeDetected = Boolean(payload.spike_detected);
  const todayReferrals = parseNumber(payload.today_referrals || 0);
  const baselineAvg = parseNumber(payload.baseline_avg || 0);
  const mismatchThreshold = parseInt(payload.mismatch_threshold || 0, 10) || 0;
  const pendingDaysThreshold = parseInt(payload.pending_days_threshold || 0, 10) || 0;

  const alertKey = [
    'ref_alert',
    source,
    stalePendingCount,
    mismatchCount,
    spikeDetected ? '1' : '0',
    mismatchThreshold,
    pendingDaysThreshold
  ].join('|');

  if (isAlertCooldownActive(alertKey)) {
    return {
      success: true,
      throttled: true,
      message: 'Alert cooldown active'
    };
  }

  const subject = '[GoSembako] Alert Anomali Referral';
  const lines = [
    'Anomali referral terdeteksi:',
    '- Source: ' + source,
    '- Pending terlalu lama: ' + stalePendingCount,
    '- Mismatch ledger: ' + mismatchCount + ' (threshold ' + mismatchThreshold + ')',
    '- Lonjakan harian: ' + (spikeDetected ? 'YA' : 'TIDAK'),
    '- Referral hari ini: ' + todayReferrals,
    '- Baseline rata-rata: ' + baselineAvg,
    '- Pending threshold (hari): ' + pendingDaysThreshold,
    '- Waktu: ' + nowIso()
  ];
  const body = lines.join('\n');

  const sent = [];
  const errors = [];

  if (email) {
    try {
      MailApp.sendEmail(email, subject, body);
      sent.push('email');
    } catch (error) {
      errors.push('email: ' + error.toString());
    }
  }

  if (webhook) {
    try {
      const resp = UrlFetchApp.fetch(webhook, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          subject: subject,
          message: body,
          data: {
            source: source,
            stale_pending_count: stalePendingCount,
            mismatch_count: mismatchCount,
            spike_detected: spikeDetected,
            today_referrals: todayReferrals,
            baseline_avg: baselineAvg,
            mismatch_threshold: mismatchThreshold,
            pending_days_threshold: pendingDaysThreshold,
            timestamp: nowIso()
          }
        }),
        muteHttpExceptions: true
      });
      const code = resp.getResponseCode();
      if (code >= 200 && code < 300) {
        sent.push('webhook');
      } else {
        errors.push('webhook_http_' + code);
      }
    } catch (error) {
      errors.push('webhook: ' + error.toString());
    }
  }

  if (sent.length > 0) {
    setAlertCooldown(alertKey, cooldownSeconds);
  }

  return {
    success: sent.length > 0,
    channels: sent,
    errors: errors
  };
}

function handleEnsureSchema(data) {
  const repairMode = !data || data.repair !== false;
  return ensureSchema(repairMode);
}

// ========================================
// PAYLATER CORE
// ========================================

function toMoneyInt(value) {
  const n = parseFloat(value);
  if (isNaN(n) || !isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function getPaylaterConfig() {
  const set = getSettingsMap();
  return {
    enabled: String(set.paylater_enabled || 'false').toLowerCase() === 'true',
    profitToLimitPercent: parseFloat(set.paylater_profit_to_limit_percent || '10') || 10,
    feeWeek1: parseFloat(set.paylater_fee_week_1 || '5') || 5,
    feeWeek2: parseFloat(set.paylater_fee_week_2 || '10') || 10,
    feeWeek3: parseFloat(set.paylater_fee_week_3 || '15') || 15,
    feeWeek4: parseFloat(set.paylater_fee_week_4 || '20') || 20,
    dailyPenaltyPercent: parseFloat(set.paylater_daily_penalty_percent || '0.5') || 0.5,
    penaltyCapPercent: parseFloat(set.paylater_penalty_cap_percent || '15') || 15,
    maxActiveInvoices: parseInt(set.paylater_max_active_invoices || '1', 10) || 1,
    maxLimit: toMoneyInt(set.paylater_max_limit || '1000000'),
    overdueFreezeDays: parseInt(set.paylater_overdue_freeze_days || '3', 10) || 3,
    overdueLockDays: parseInt(set.paylater_overdue_lock_days || '14', 10) || 14,
    overdueReduceLimitDays: parseInt(set.paylater_overdue_reduce_limit_days || '7', 10) || 7,
    overdueReduceLimitPercent: parseFloat(set.paylater_overdue_reduce_limit_percent || '10') || 10,
    overdueDefaultDays: parseInt(set.paylater_overdue_default_days || '30', 10) || 30
  };
}

function getPaylaterFeePercentForTenor(tenorWeeks, cfg) {
  const week = Math.max(1, Math.min(4, parseInt(tenorWeeks, 10) || 1));
  if (week === 1) return parseFloat(cfg.feeWeek1 || 0) || 0;
  if (week === 2) return parseFloat(cfg.feeWeek2 || 0) || 0;
  if (week === 3) return parseFloat(cfg.feeWeek3 || 0) || 0;
  return parseFloat(cfg.feeWeek4 || 0) || 0;
}

function findCreditAccountByPhone(phone) {
  const normalizedPhone = normalizePhone(phone || '');
  if (!normalizedPhone) return null;
  const accObj = getRowsAsObjects('credit_accounts');
  for (var i = 0; i < accObj.rows.length; i++) {
    const row = accObj.rows[i];
    if (normalizePhone(row.phone || '') === normalizedPhone) {
      return {
        sheet: accObj.sheet,
        headers: accObj.headers,
        row: row,
        rowNumber: i + 2
      };
    }
  }
  return {
    sheet: accObj.sheet,
    headers: accObj.headers,
    row: null,
    rowNumber: -1
  };
}

function hasActiveCreditInvoice(phone) {
  const normalizedPhone = normalizePhone(phone || '');
  if (!normalizedPhone) return false;
  const invObj = getRowsAsObjects('credit_invoices');
  var count = 0;
  for (var i = 0; i < invObj.rows.length; i++) {
    const row = invObj.rows[i];
    if (normalizePhone(row.phone || '') !== normalizedPhone) continue;
    const st = String(row.status || '').toLowerCase().trim();
    if (st === 'active' || st === 'overdue') count++;
  }
  return count > 0;
}

function appendCreditLedger(entry) {
  const ledObj = getRowsAsObjects('credit_ledger');
  if (!ledObj.headers.length) {
    return { success: false, error: 'credit_ledger headers invalid' };
  }
  appendByHeaders(ledObj.sheet, ledObj.headers, {
    id: entry.id || genId('CLG'),
    phone: normalizePhone(entry.phone || ''),
    user_id: entry.user_id || '',
    invoice_id: entry.invoice_id || '',
    type: entry.type || 'adjustment',
    amount: toMoneyInt(entry.amount || 0),
    balance_before: toMoneyInt(entry.balance_before || 0),
    balance_after: toMoneyInt(entry.balance_after || 0),
    ref_id: entry.ref_id || '',
    note: entry.note || '',
    actor: entry.actor || 'system',
    created_at: entry.created_at || nowIso()
  });
  return { success: true };
}

function findCreditInvoiceByInvoiceId(invoiceId) {
  const targetId = String(invoiceId || '').trim();
  if (!targetId) return { invObj: null, row: null, rowNumber: -1 };
  const invObj = getRowsAsObjects('credit_invoices');
  for (var i = 0; i < invObj.rows.length; i++) {
    const row = invObj.rows[i];
    if (String(row.invoice_id || row.id || '').trim() === targetId) {
      return { invObj: invObj, row: row, rowNumber: i + 2 };
    }
  }
  return { invObj: invObj, row: null, rowNumber: -1 };
}

function findCreditPaymentLedgerByRef(paymentRefId, invoiceId) {
  const ref = String(paymentRefId || '').trim();
  const inv = String(invoiceId || '').trim();
  if (!ref || !inv) return null;
  const ledObj = getRowsAsObjects('credit_ledger');
  for (var i = 0; i < ledObj.rows.length; i++) {
    const row = ledObj.rows[i];
    const type = String(row.type || '').trim().toLowerCase();
    if (type !== 'payment_partial' && type !== 'payment_settle') continue;
    if (String(row.ref_id || '').trim() !== ref) continue;
    if (String(row.invoice_id || '').trim() !== inv) continue;
    return row;
  }
  return null;
}

function creditLedgerEntryExists(type, refId, phone) {
  const t = String(type || '').trim().toLowerCase();
  const r = String(refId || '').trim();
  const p = normalizePhone(phone || '');
  if (!t || !r || !p) return false;
  const ledObj = getRowsAsObjects('credit_ledger');
  for (var i = 0; i < ledObj.rows.length; i++) {
    const row = ledObj.rows[i];
    const rowType = String(row.type || '').trim().toLowerCase();
    const rowRef = String(row.ref_id || '').trim();
    const rowPhone = normalizePhone(row.phone || '');
    if (rowType === t && rowRef === r && rowPhone === p) {
      return true;
    }
  }
  return false;
}

function applyOverdueLimitReduction(phone, invoiceId, cfg, actor, overdueDays) {
  const normalizedPhone = normalizePhone(phone || '');
  const refId = String(invoiceId || '').trim();
  if (!normalizedPhone || !refId) {
    return { success: false, skipped: true, reason: 'invalid_input' };
  }
  if (creditLedgerEntryExists('limit_reduce_overdue', refId, normalizedPhone)) {
    return { success: true, skipped: true, dedup: true, reason: 'already_reduced' };
  }

  const found = findCreditAccountByPhone(normalizedPhone);
  if (!found || !found.row) {
    return { success: false, skipped: true, reason: 'account_not_found' };
  }

  const account = found.row;
  const oldLimit = toMoneyInt(account.credit_limit || 0);
  const oldUsed = toMoneyInt(account.used_limit || 0);
  const oldAvailable = toMoneyInt(account.available_limit || Math.max(0, oldLimit - oldUsed));
  const reducePercent = Math.max(0, parseFloat(cfg.overdueReduceLimitPercent || 0) || 0);
  const rawReduction = toMoneyInt((oldLimit * reducePercent) / 100);
  const plannedReduction = Math.max(0, rawReduction);
  const nextLimit = Math.max(oldUsed, oldLimit - plannedReduction);
  const realReduction = Math.max(0, oldLimit - nextLimit);
  if (realReduction <= 0) {
    return { success: true, skipped: true, reason: 'no_reduction' };
  }

  const nextAvailable = Math.max(0, nextLimit - oldUsed);
  setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'credit_limit', nextLimit);
  setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'available_limit', nextAvailable);
  setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'updated_at', nowIso());

  appendCreditLedger({
    phone: normalizedPhone,
    user_id: account.user_id || '',
    type: 'limit_reduce_overdue',
    amount: realReduction,
    balance_before: oldLimit,
    balance_after: nextLimit,
    ref_id: refId,
    note: 'Reduce limit overdue ' + overdueDays + ' hari',
    actor: actor
  });

  return {
    success: true,
    reduced: realReduction,
    credit_limit_before: oldLimit,
    credit_limit_after: nextLimit,
    available_before: oldAvailable,
    available_after: nextAvailable
  };
}

function getUtcDateStart(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(raw + 'T00:00:00.000Z');
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function getOverdueDays(dueDateValue, asOfDateValue) {
  const dueDate = getUtcDateStart(dueDateValue);
  const asOfDate = getUtcDateStart(asOfDateValue || nowIso());
  if (!dueDate || !asOfDate) return 0;
  const diffDays = Math.floor((asOfDate.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diffDays);
}

function resolveCreditStatusFromActionOrStatus(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return '';
  const map = {
    active: 'active',
    unfreeze: 'active',
    unlock: 'active',
    frozen: 'frozen',
    freeze: 'frozen',
    locked: 'locked',
    lock: 'locked'
  };
  return map[value] || '';
}

function getCreditStatusRank(status) {
  const s = String(status || '').toLowerCase().trim();
  if (s === 'locked') return 3;
  if (s === 'frozen') return 2;
  return 1;
}

function applyCreditAccountStatus(phone, targetStatus, actor, note, refId, allowDowngrade) {
  const normalizedPhone = normalizePhone(phone || '');
  const resolvedStatus = resolveCreditStatusFromActionOrStatus(targetStatus);
  if (!normalizedPhone || !resolvedStatus) {
    return { success: false, error: 'INVALID_PAYLOAD', message: 'phone/status wajib valid' };
  }

  const found = findCreditAccountByPhone(normalizedPhone);
  if (!found || !found.row) {
    return { success: false, error: 'ACCOUNT_NOT_FOUND', message: 'Credit account belum ada' };
  }

  const currentStatus = String(found.row.status || 'active').toLowerCase().trim() || 'active';
  if (currentStatus === resolvedStatus) {
    return { success: true, dedup: true, phone: normalizedPhone, status: currentStatus };
  }

  if (!allowDowngrade && getCreditStatusRank(resolvedStatus) < getCreditStatusRank(currentStatus)) {
    return {
      success: true,
      skipped: true,
      phone: normalizedPhone,
      status: currentStatus,
      message: 'Status account lebih ketat, downgrade dilewati'
    };
  }

  setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'status', resolvedStatus);
  setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'updated_at', nowIso());

  appendCreditLedger({
    phone: normalizedPhone,
    user_id: found.row.user_id || '',
    type: resolvedStatus === 'active' ? 'unfreeze' : resolvedStatus,
    amount: 0,
    balance_before: toMoneyInt(found.row.available_limit || 0),
    balance_after: toMoneyInt(found.row.available_limit || 0),
    ref_id: String(refId || ''),
    note: String(note || ('Set status account: ' + resolvedStatus)),
    actor: String(actor || 'admin')
  });

  return { success: true, phone: normalizedPhone, status: resolvedStatus };
}

function handleCreditAccountGet(data) {
  data = data || {};
  const phone = normalizePhone(data.phone || data.whatsapp || '');
  if (!phone) {
    return { success: false, error: 'INVALID_PAYLOAD', message: 'phone wajib diisi' };
  }
  const found = findCreditAccountByPhone(phone);
  if (!found || !found.row) {
    return { success: false, error: 'ACCOUNT_NOT_FOUND', message: 'Credit account belum ada' };
  }
  return { success: true, account: found.row };
}

function handleCreditAccountUpsert(data) {
  data = data || {};
  const phone = normalizePhone(data.phone || data.whatsapp || '');
  const userId = String(data.user_id || '').trim();
  if (!phone) {
    return { success: false, error: 'INVALID_PAYLOAD', message: 'phone wajib diisi' };
  }

  const found = findCreditAccountByPhone(phone);
  const now = nowIso();
  const status = String(data.status || '').trim().toLowerCase() || 'active';
  const allowedStatus = { active: true, frozen: true, locked: true };
  const safeStatus = allowedStatus[status] ? status : 'active';

  if (!found.row) {
    const initialLimit = toMoneyInt(data.admin_initial_limit || data.credit_limit || 0);
    const creditLimit = initialLimit;
    const usedLimit = 0;
    const availableLimit = Math.max(0, creditLimit - usedLimit);
    appendByHeaders(found.sheet, found.headers, {
      id: genId('CAC'),
      phone: phone,
      user_id: userId,
      credit_limit: creditLimit,
      available_limit: availableLimit,
      used_limit: usedLimit,
      status: safeStatus,
      admin_initial_limit: initialLimit,
      limit_growth_total: 0,
      notes: data.notes || '',
      created_at: now,
      updated_at: now
    });

    if (initialLimit > 0) {
      appendCreditLedger({
        phone: phone,
        user_id: userId,
        type: 'limit_init',
        amount: initialLimit,
        balance_before: 0,
        balance_after: creditLimit,
        ref_id: String(data.ref_id || ''),
        note: 'Set limit awal manual',
        actor: data.actor || 'admin'
      });
    }

    return { success: true, created: 1, phone: phone, credit_limit: creditLimit, available_limit: availableLimit };
  }

  const headers = found.headers;
  const rowNumber = found.rowNumber;
  const row = found.row;

  const oldLimit = toMoneyInt(row.credit_limit || 0);
  const oldUsed = toMoneyInt(row.used_limit || 0);
  const oldAvailable = toMoneyInt(row.available_limit || Math.max(0, oldLimit - oldUsed));

  const nextLimit = data.credit_limit !== undefined ? toMoneyInt(data.credit_limit) : oldLimit;
  const nextUsed = data.used_limit !== undefined ? toMoneyInt(data.used_limit) : oldUsed;
  const nextAvailable = data.available_limit !== undefined
    ? toMoneyInt(data.available_limit)
    : Math.max(0, nextLimit - nextUsed);

  setCellIfColumnExists(found.sheet, headers, rowNumber, 'user_id', userId || row.user_id || '');
  setCellIfColumnExists(found.sheet, headers, rowNumber, 'credit_limit', nextLimit);
  setCellIfColumnExists(found.sheet, headers, rowNumber, 'used_limit', nextUsed);
  setCellIfColumnExists(found.sheet, headers, rowNumber, 'available_limit', nextAvailable);
  setCellIfColumnExists(found.sheet, headers, rowNumber, 'status', safeStatus);
  if (data.notes !== undefined) {
    setCellIfColumnExists(found.sheet, headers, rowNumber, 'notes', String(data.notes || ''));
  }
  setCellIfColumnExists(found.sheet, headers, rowNumber, 'updated_at', now);

  if (nextLimit !== oldLimit) {
    appendCreditLedger({
      phone: phone,
      user_id: userId || row.user_id || '',
      type: 'limit_adjustment',
      amount: Math.abs(nextLimit - oldLimit),
      balance_before: oldLimit,
      balance_after: nextLimit,
      ref_id: String(data.ref_id || ''),
      note: 'Adjust limit manual',
      actor: data.actor || 'admin'
    });
  }

  if (nextAvailable !== oldAvailable) {
    appendCreditLedger({
      phone: phone,
      user_id: userId || row.user_id || '',
      type: 'available_adjustment',
      amount: Math.abs(nextAvailable - oldAvailable),
      balance_before: oldAvailable,
      balance_after: nextAvailable,
      ref_id: String(data.ref_id || ''),
      note: 'Adjust available limit manual',
      actor: data.actor || 'admin'
    });
  }

  return { success: true, affected: 1, phone: phone, credit_limit: nextLimit, available_limit: nextAvailable };
}

function handleCreditInvoiceCreate(data) {
  data = data || {};
  const phone = normalizePhone(data.phone || data.whatsapp || '');
  const userId = String(data.user_id || '').trim();
  const principal = toMoneyInt(data.principal || data.amount || 0);
  const tenorWeeks = Math.max(1, Math.min(4, parseInt(data.tenor_weeks, 10) || 1));
  const sourceOrderId = String(data.source_order_id || '').trim();
  const actor = String(data.actor || 'system');
  const invoiceId = String(data.invoice_id || genId('INV')).trim();

  if (!phone) return { success: false, error: 'INVALID_PAYLOAD', message: 'phone wajib diisi' };
  if (principal <= 0) return { success: false, error: 'INVALID_PAYLOAD', message: 'principal harus > 0' };
  if (!invoiceId) return { success: false, error: 'INVALID_PAYLOAD', message: 'invoice_id wajib valid' };

  const cfg = getPaylaterConfig();
  if (!cfg.enabled) return { success: false, error: 'PAYLATER_DISABLED', message: 'PayLater nonaktif' };

  // Idempotency guard by invoice_id and source_order_id.
  const invLookup = findCreditInvoiceByInvoiceId(invoiceId);
  if (invLookup.row) {
    return {
      success: true,
      dedup: true,
      message: 'Invoice sudah pernah dibuat',
      invoice_id: String(invLookup.row.invoice_id || invLookup.row.id || ''),
      total_due: toMoneyInt(invLookup.row.total_due || 0),
      status: String(invLookup.row.status || '')
    };
  }
  if (sourceOrderId) {
    const invObjForOrder = getRowsAsObjects('credit_invoices');
    for (var io = 0; io < invObjForOrder.rows.length; io++) {
      const invRow = invObjForOrder.rows[io];
      const samePhone = normalizePhone(invRow.phone || '') === phone;
      const sameOrder = String(invRow.source_order_id || '').trim() === sourceOrderId;
      if (samePhone && sameOrder) {
        return {
          success: true,
          dedup: true,
          message: 'Invoice source_order_id sudah pernah dibuat',
          invoice_id: String(invRow.invoice_id || invRow.id || ''),
          total_due: toMoneyInt(invRow.total_due || 0),
          status: String(invRow.status || '')
        };
      }
    }
  }

  const maxActive = Math.max(1, parseInt(cfg.maxActiveInvoices || 1, 10) || 1);
  if (hasActiveCreditInvoice(phone) && maxActive <= 1) {
    return { success: false, error: 'ACTIVE_INVOICE_EXISTS', message: 'Masih ada tagihan aktif' };
  }

  const found = findCreditAccountByPhone(phone);
  if (!found || !found.row) {
    return { success: false, error: 'ACCOUNT_NOT_FOUND', message: 'Credit account belum tersedia' };
  }

  const account = found.row;
  const accountStatus = String(account.status || 'active').toLowerCase();
  if (accountStatus !== 'active') {
    return { success: false, error: 'ACCOUNT_NOT_ACTIVE', message: 'Akun kredit tidak aktif' };
  }

  const oldLimit = toMoneyInt(account.credit_limit || 0);
  const oldUsed = toMoneyInt(account.used_limit || 0);
  const oldAvailable = toMoneyInt(account.available_limit || Math.max(0, oldLimit - oldUsed));
  if (oldAvailable < principal) {
    return { success: false, error: 'INSUFFICIENT_LIMIT', message: 'Limit tersedia tidak cukup' };
  }

  const feePercent = data.fee_percent !== undefined
    ? parseFloat(data.fee_percent) || 0
    : getPaylaterFeePercentForTenor(tenorWeeks, cfg);
  const feeAmount = toMoneyInt((principal * feePercent) / 100);
  const totalBeforePenalty = principal + feeAmount;
  const penaltyDaily = parseFloat(cfg.dailyPenaltyPercent || 0) || 0;
  const penaltyCap = parseFloat(cfg.penaltyCapPercent || 0) || 0;
  const dueDate = String(data.due_date || '').trim() || nowIso();
  const now = nowIso();

  const invObj = getRowsAsObjects('credit_invoices');
  appendByHeaders(invObj.sheet, invObj.headers, {
    id: invoiceId,
    invoice_id: invoiceId,
    phone: phone,
    user_id: userId || account.user_id || '',
    source_order_id: sourceOrderId,
    principal: principal,
    tenor_weeks: tenorWeeks,
    fee_percent: feePercent,
    fee_amount: feeAmount,
    penalty_percent_daily: penaltyDaily,
    penalty_cap_percent: penaltyCap,
    penalty_amount: 0,
    total_before_penalty: totalBeforePenalty,
    total_due: totalBeforePenalty,
    paid_amount: 0,
    due_date: dueDate,
    status: 'active',
    notes: String(data.notes || ''),
    created_at: now,
    updated_at: now,
    paid_at: '',
    closed_at: ''
  });

  const newUsed = oldUsed + principal;
  const newAvailable = Math.max(0, oldLimit - newUsed);
  setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'used_limit', newUsed);
  setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'available_limit', newAvailable);
  setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'updated_at', now);

  appendCreditLedger({
    phone: phone,
    user_id: userId || account.user_id || '',
    invoice_id: invoiceId,
    type: 'invoice_create',
    amount: principal,
    balance_before: oldAvailable,
    balance_after: newAvailable,
    ref_id: sourceOrderId || invoiceId,
    note: 'Membuat tagihan PayLater',
    actor: actor
  });

  return {
    success: true,
    created: 1,
    invoice_id: invoiceId,
    principal: principal,
    fee_amount: feeAmount,
    total_due: totalBeforePenalty,
    account_available_limit: newAvailable
  };
}

function handleCreditInvoicePay(data) {
  data = data || {};
  const invoiceId = String(data.invoice_id || data.id || '').trim();
  const paymentAmount = toMoneyInt(data.payment_amount || data.amount || 0);
  const paymentRefId = String(data.payment_ref_id || data.request_id || '').trim();
  const actor = String(data.actor || 'admin');
  const note = String(data.note || 'Pembayaran tagihan');
  if (!invoiceId) return { success: false, error: 'INVALID_PAYLOAD', message: 'invoice_id wajib diisi' };
  if (paymentAmount <= 0) return { success: false, error: 'INVALID_PAYLOAD', message: 'payment_amount harus > 0' };

  if (paymentRefId) {
    const paymentDup = findCreditPaymentLedgerByRef(paymentRefId, invoiceId);
    if (paymentDup) {
      const lookup = findCreditInvoiceByInvoiceId(invoiceId);
      const paidSnapshot = lookup.row ? toMoneyInt(lookup.row.paid_amount || 0) : 0;
      const dueSnapshot = lookup.row ? toMoneyInt(lookup.row.total_due || 0) : 0;
      return {
        success: true,
        dedup: true,
        message: 'Payment request sudah pernah diproses',
        invoice_id: invoiceId,
        paid_total: paidSnapshot,
        total_due: dueSnapshot,
        status: lookup.row ? String(lookup.row.status || '') : ''
      };
    }
  }

  const invObj = getRowsAsObjects('credit_invoices');
  let invoice = null;
  let rowNumber = -1;
  for (var i = 0; i < invObj.rows.length; i++) {
    const row = invObj.rows[i];
    if (String(row.invoice_id || row.id || '').trim() === invoiceId) {
      invoice = row;
      rowNumber = i + 2;
      break;
    }
  }
  if (!invoice) return { success: false, error: 'INVOICE_NOT_FOUND', message: 'Invoice tidak ditemukan' };

  const currentStatus = String(invoice.status || '').toLowerCase().trim();
  if (currentStatus === 'paid' || currentStatus === 'cancelled' || currentStatus === 'defaulted') {
    return { success: false, error: 'INVOICE_CLOSED', message: 'Invoice sudah tidak aktif' };
  }

  const phone = normalizePhone(invoice.phone || '');
  const found = findCreditAccountByPhone(phone);
  if (!found || !found.row) {
    return { success: false, error: 'ACCOUNT_NOT_FOUND', message: 'Credit account tidak ditemukan' };
  }

  const totalDue = toMoneyInt(invoice.total_due || 0);
  const oldPaid = toMoneyInt(invoice.paid_amount || 0);
  const remaining = Math.max(0, totalDue - oldPaid);
  const paidNow = Math.min(paymentAmount, remaining);
  const newPaid = oldPaid + paidNow;
  const isSettled = newPaid >= totalDue;
  const nextStatus = isSettled ? 'paid' : currentStatus || 'active';

  setCellIfColumnExists(invObj.sheet, invObj.headers, rowNumber, 'paid_amount', newPaid);
  setCellIfColumnExists(invObj.sheet, invObj.headers, rowNumber, 'status', nextStatus);
  setCellIfColumnExists(invObj.sheet, invObj.headers, rowNumber, 'updated_at', nowIso());
  if (isSettled) {
    setCellIfColumnExists(invObj.sheet, invObj.headers, rowNumber, 'paid_at', nowIso());
    setCellIfColumnExists(invObj.sheet, invObj.headers, rowNumber, 'closed_at', nowIso());
  }

  const principal = toMoneyInt(invoice.principal || 0);
  const account = found.row;
  const oldLimit = toMoneyInt(account.credit_limit || 0);
  const oldUsed = toMoneyInt(account.used_limit || 0);
  const oldAvailable = toMoneyInt(account.available_limit || Math.max(0, oldLimit - oldUsed));

  let newUsed = oldUsed;
  let newAvailable = oldAvailable;
  if (isSettled) {
    newUsed = Math.max(0, oldUsed - principal);
    newAvailable = Math.max(0, oldLimit - newUsed);
    setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'used_limit', newUsed);
    setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'available_limit', newAvailable);
    setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'updated_at', nowIso());
  }

  appendCreditLedger({
    phone: phone,
    user_id: invoice.user_id || account.user_id || '',
    invoice_id: invoiceId,
    type: isSettled ? 'payment_settle' : 'payment_partial',
    amount: paidNow,
    balance_before: oldPaid,
    balance_after: newPaid,
    ref_id: paymentRefId || invoiceId,
    note: note,
    actor: actor
  });

  if (isSettled) {
    appendCreditLedger({
      phone: phone,
      user_id: invoice.user_id || account.user_id || '',
      invoice_id: invoiceId,
      type: 'limit_release',
      amount: principal,
      balance_before: oldAvailable,
      balance_after: newAvailable,
      ref_id: invoiceId,
      note: 'Release limit setelah pelunasan',
      actor: actor
    });
  }

  return {
    success: true,
    invoice_id: invoiceId,
    payment_ref_id: paymentRefId || '',
    paid_now: paidNow,
    paid_total: newPaid,
    total_due: totalDue,
    status: nextStatus,
    account_available_limit: newAvailable
  };
}

function handleCreditLimitFromProfit(data) {
  data = data || {};
  const phone = normalizePhone(data.phone || data.whatsapp || '');
  const orderId = normalizeOrderId(data.order_id || data.ref_id || '');
  const profitNet = toMoneyInt(data.profit_net || data.profit || 0);
  const actor = String(data.actor || 'system');
  if (!phone) return { success: false, error: 'INVALID_PAYLOAD', message: 'phone wajib diisi' };
  if (!orderId) return { success: false, error: 'INVALID_PAYLOAD', message: 'order_id wajib diisi' };
  if (profitNet <= 0) return { success: false, error: 'INVALID_PAYLOAD', message: 'profit_net harus > 0' };

  const cfg = getPaylaterConfig();
  const increase = toMoneyInt((profitNet * (parseFloat(cfg.profitToLimitPercent || 0) || 0)) / 100);
  if (increase <= 0) {
    return { success: true, increased: 0, message: 'Tidak ada kenaikan limit' };
  }

  const ledObj = getRowsAsObjects('credit_ledger');
  const dedupFound = ledObj.rows.some(function(row) {
    return String(row.type || '') === 'limit_increase' &&
      String(row.ref_id || '') === orderId &&
      normalizePhone(row.phone || '') === phone;
  });
  if (dedupFound) {
    return { success: true, increased: 0, dedup: true, message: 'Order sudah diproses sebelumnya' };
  }

  const found = findCreditAccountByPhone(phone);
  if (!found || !found.row) {
    return { success: false, error: 'ACCOUNT_NOT_FOUND', message: 'Credit account belum tersedia' };
  }

  const account = found.row;
  const oldLimit = toMoneyInt(account.credit_limit || 0);
  const oldUsed = toMoneyInt(account.used_limit || 0);
  const oldAvailable = toMoneyInt(account.available_limit || Math.max(0, oldLimit - oldUsed));
  const oldGrowth = toMoneyInt(account.limit_growth_total || 0);
  const maxLimit = toMoneyInt(cfg.maxLimit || 0) || oldLimit + increase;

  let newLimit = oldLimit + increase;
  if (newLimit > maxLimit) newLimit = maxLimit;
  const realIncrease = Math.max(0, newLimit - oldLimit);
  const newAvailable = Math.max(0, oldAvailable + realIncrease);
  const newGrowth = oldGrowth + realIncrease;

  if (realIncrease <= 0) {
    return { success: true, increased: 0, message: 'Limit sudah mencapai maksimum' };
  }

  setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'credit_limit', newLimit);
  setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'available_limit', newAvailable);
  setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'limit_growth_total', newGrowth);
  setCellIfColumnExists(found.sheet, found.headers, found.rowNumber, 'updated_at', nowIso());

  appendCreditLedger({
    phone: phone,
    user_id: account.user_id || '',
    type: 'limit_increase',
    amount: realIncrease,
    balance_before: oldLimit,
    balance_after: newLimit,
    ref_id: orderId,
    note: 'Kenaikan limit dari profit order',
    actor: actor
  });

  return {
    success: true,
    increased: realIncrease,
    credit_limit: newLimit,
    available_limit: newAvailable,
    limit_growth_total: newGrowth
  };
}

function isFinalOrderStatusForLimit(status) {
  const normalized = String(status || '').toLowerCase().trim();
  const finals = {
    lunas: true,
    diterima: true
  };
  return Boolean(finals[normalized]);
}

function processPaylaterLimitFromOrders(data) {
  data = data || {};
  const onlyOrderId = String(data.order_id || '').trim();
  const actor = String(data.actor || 'system');
  const dryRun = Boolean(data.dry_run);

  const ordersObj = getRowsAsObjects('orders');
  if (!ordersObj.headers.length) {
    return { success: false, error: 'ORDERS_HEADERS_INVALID', message: 'Header orders belum valid' };
  }

  const headers = ordersObj.headers;
  const sheet = ordersObj.sheet;
  const rows = ordersObj.rows;

  const statusCol = headers.indexOf('status');
  const processedCol = headers.indexOf('credit_limit_processed');
  const profitCol = headers.indexOf('profit_net');
  const phoneCol = headers.indexOf('phone');
  const orderIdCol = headers.indexOf('id');
  const orderCodeCol = headers.indexOf('order_id');

  if (statusCol === -1 || processedCol === -1 || profitCol === -1 || phoneCol === -1) {
    return {
      success: false,
      error: 'ORDERS_HEADERS_INVALID',
      message: 'Kolom orders wajib: status, credit_limit_processed, profit_net, phone'
    };
  }

  var scanned = 0;
  var eligible = 0;
  var processed = 0;
  var skipped = 0;
  var failed = 0;
  const details = [];

  for (var i = 0; i < rows.length; i++) {
    const row = rows[i];
    scanned++;

    const rowStatus = String(row.status || '').trim().toLowerCase();
    if (!isFinalOrderStatusForLimit(rowStatus)) {
      skipped++;
      continue;
    }

    const processedFlag = String(row.credit_limit_processed || '').trim().toLowerCase();
    if (processedFlag === 'yes') {
      skipped++;
      continue;
    }

    const orderIdRaw = (orderIdCol !== -1 ? row.id : '') || (orderCodeCol !== -1 ? row.order_id : '') || ('orders_row_' + (i + 2));
    const orderId = normalizeOrderId(orderIdRaw);
    if (onlyOrderId && orderId !== onlyOrderId) {
      continue;
    }

    const phone = normalizePhone(row.phone || '');
    const profitNet = toMoneyInt(row.profit_net || 0);
    if (!phone || profitNet <= 0) {
      skipped++;
      continue;
    }

    eligible++;
    if (dryRun) {
      details.push({ order_id: orderId, phone: phone, profit_net: profitNet, action: 'would_process' });
      continue;
    }

    const result = handleCreditLimitFromProfit({
      phone: phone,
      order_id: orderId,
      profit_net: profitNet,
      actor: actor
    });

    if (result && (result.success || result.dedup)) {
      sheet.getRange(i + 2, processedCol + 1).setValue('Yes');
      processed++;
      details.push({
        order_id: orderId,
        phone: phone,
        increased: parseInt(result.increased || 0, 10) || 0,
        dedup: Boolean(result.dedup)
      });
    } else {
      failed++;
      details.push({
        order_id: orderId,
        phone: phone,
        error: result && (result.error || result.message) ? String(result.error || result.message) : 'UNKNOWN_ERROR'
      });
    }
  }

  if (onlyOrderId && scanned > 0 && details.length === 0) {
    return {
      success: false,
      error: 'ORDER_NOT_ELIGIBLE_OR_NOT_FOUND',
      message: 'Order tidak ditemukan atau belum eligible untuk proses limit'
    };
  }

  return {
    success: true,
    scanned: scanned,
    eligible: eligible,
    processed: processed,
    skipped: skipped,
    failed: failed,
    dry_run: dryRun,
    details: details.slice(0, 100)
  };
}

function runProcessPaylaterLimitFromOrdersTrigger() {
  return processPaylaterLimitFromOrders({ actor: 'trigger_scheduler' });
}

function installPaylaterLimitScheduler(data) {
  data = data || {};
  const modeRaw = String(data.mode || data.schedule || 'hourly').toLowerCase().trim();
  const mode = (modeRaw === 'daily') ? 'daily' : 'hourly';
  const hour = Math.max(0, Math.min(23, parseInt(data.hour || data.at_hour || 1, 10) || 1));

  removePaylaterLimitScheduler();

  var builder = ScriptApp.newTrigger(PAYLATER_LIMIT_TRIGGER_HANDLER).timeBased();
  if (mode === 'daily') {
    builder = builder.everyDays(1).atHour(hour);
  } else {
    builder = builder.everyHours(1);
  }
  builder.create();

  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty(PAYLATER_LIMIT_TRIGGER_MODE_PROP, mode);
    props.setProperty(PAYLATER_LIMIT_TRIGGER_HOUR_PROP, String(hour));
  } catch (error) {
    Logger.log('Failed save paylater trigger props: ' + error.toString());
  }

  return {
    success: true,
    mode: mode,
    hour: hour,
    message: mode === 'daily'
      ? ('Scheduler paylater aktif daily jam ' + hour + ':00')
      : 'Scheduler paylater aktif hourly'
  };
}

function removePaylaterLimitScheduler() {
  const triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === PAYLATER_LIMIT_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  try {
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty(PAYLATER_LIMIT_TRIGGER_MODE_PROP);
    props.deleteProperty(PAYLATER_LIMIT_TRIGGER_HOUR_PROP);
  } catch (error) {
    Logger.log('Failed clear paylater trigger props: ' + error.toString());
  }
  return { success: true, removed: removed, message: 'Scheduler paylater dihapus' };
}

function getPaylaterLimitSchedulerInfo() {
  const triggers = ScriptApp.getProjectTriggers();
  const found = triggers.filter(function(trigger) {
    return trigger.getHandlerFunction() === PAYLATER_LIMIT_TRIGGER_HANDLER;
  });

  var mode = 'hourly';
  var hour = 1;
  try {
    const props = PropertiesService.getScriptProperties();
    mode = String(props.getProperty(PAYLATER_LIMIT_TRIGGER_MODE_PROP) || 'hourly');
    hour = Math.max(0, Math.min(23, parseInt(props.getProperty(PAYLATER_LIMIT_TRIGGER_HOUR_PROP) || '1', 10) || 1));
  } catch (error) {
    Logger.log('Failed read paylater trigger props: ' + error.toString());
  }

  return {
    success: true,
    active: found.length > 0,
    count: found.length,
    mode: mode === 'daily' ? 'daily' : 'hourly',
    hour: hour
  };
}

function handleCreditAccountSetStatus(data) {
  data = data || {};
  const phone = normalizePhone(data.phone || data.whatsapp || '');
  const targetStatus = resolveCreditStatusFromActionOrStatus(data.status || data.action || '');
  const actor = String(data.actor || 'admin');
  const note = String(data.note || data.notes || '').trim();
  const refId = String(data.ref_id || '').trim();
  if (!phone) return { success: false, error: 'INVALID_PAYLOAD', message: 'phone wajib diisi' };
  if (!targetStatus) return { success: false, error: 'INVALID_PAYLOAD', message: 'status/action wajib valid' };
  return applyCreditAccountStatus(phone, targetStatus, actor, note, refId, true);
}

function handleCreditInvoiceApplyPenalty(data) {
  data = data || {};
  const invoiceId = String(data.invoice_id || data.id || '').trim();
  const applyAll = Boolean(data.apply_all_overdue) || !invoiceId;
  const asOfDate = data.as_of_date || nowIso();
  const actor = String(data.actor || 'system');
  const cfg = getPaylaterConfig();

  const invObj = getRowsAsObjects('credit_invoices');
  if (!invObj.headers.length) {
    return { success: false, error: 'CREDIT_INVOICES_HEADERS_INVALID', message: 'Header credit_invoices belum valid' };
  }

  const candidates = [];
  for (var i = 0; i < invObj.rows.length; i++) {
    const row = invObj.rows[i];
    const invId = String(row.invoice_id || row.id || '').trim();
    const st = String(row.status || '').toLowerCase().trim();
    if (st === 'paid' || st === 'cancelled' || st === 'defaulted') continue;
    if (!applyAll && invId !== invoiceId) continue;
    candidates.push({ row: row, rowNumber: i + 2, invoiceId: invId });
  }

  if (!candidates.length) {
    return {
      success: false,
      error: invoiceId ? 'INVOICE_NOT_FOUND' : 'NO_OVERDUE_INVOICE',
      message: invoiceId ? 'Invoice tidak ditemukan/aktif' : 'Tidak ada invoice aktif untuk diproses'
    };
  }

  const results = [];
  for (var c = 0; c < candidates.length; c++) {
    const item = candidates[c];
    const row = item.row;
    const overdueDays = getOverdueDays(row.due_date || '', asOfDate);
    if (overdueDays <= 0) continue;

    const principal = toMoneyInt(row.principal || 0);
    const totalBeforePenalty = toMoneyInt(row.total_before_penalty || 0);
    const paidAmount = toMoneyInt(row.paid_amount || 0);
    const currentPenalty = toMoneyInt(row.penalty_amount || 0);
    const dailyPenaltyPercent = parseFloat(row.penalty_percent_daily || cfg.dailyPenaltyPercent || 0) || 0;
    const penaltyCapPercent = parseFloat(row.penalty_cap_percent || cfg.penaltyCapPercent || 0) || 0;
    const capAmount = toMoneyInt((principal * penaltyCapPercent) / 100);
    const targetPenalty = Math.min(capAmount, toMoneyInt((principal * dailyPenaltyPercent * overdueDays) / 100));
    const additionalPenalty = Math.max(0, targetPenalty - currentPenalty);
    const nextTotalDue = totalBeforePenalty + targetPenalty;

    if (additionalPenalty <= 0 && String(row.status || '').toLowerCase().trim() === 'overdue') {
      continue;
    }

    const isSettled = paidAmount >= nextTotalDue;
    const defaultDays = Math.max(0, parseInt(cfg.overdueDefaultDays || 0, 10) || 0);
    const isDefaulted = !isSettled && defaultDays > 0 && overdueDays >= defaultDays;
    const nextStatus = isSettled ? 'paid' : (isDefaulted ? 'defaulted' : 'overdue');

    setCellIfColumnExists(invObj.sheet, invObj.headers, item.rowNumber, 'penalty_amount', targetPenalty);
    setCellIfColumnExists(invObj.sheet, invObj.headers, item.rowNumber, 'total_due', nextTotalDue);
    setCellIfColumnExists(invObj.sheet, invObj.headers, item.rowNumber, 'status', nextStatus);
    setCellIfColumnExists(invObj.sheet, invObj.headers, item.rowNumber, 'updated_at', nowIso());

    if (isSettled) {
      setCellIfColumnExists(invObj.sheet, invObj.headers, item.rowNumber, 'paid_at', nowIso());
      setCellIfColumnExists(invObj.sheet, invObj.headers, item.rowNumber, 'closed_at', nowIso());
    }

    if (additionalPenalty > 0) {
      appendCreditLedger({
        phone: normalizePhone(row.phone || ''),
        user_id: row.user_id || '',
        invoice_id: item.invoiceId,
        type: 'penalty',
        amount: additionalPenalty,
        balance_before: currentPenalty,
        balance_after: targetPenalty,
        ref_id: item.invoiceId,
        note: 'Apply penalty overdue ' + overdueDays + ' hari',
        actor: actor
      });
    }

    const actionsTaken = [];
    const reduceDays = Math.max(0, parseInt(cfg.overdueReduceLimitDays || 0, 10) || 0);
    if (!isSettled && reduceDays > 0 && overdueDays >= reduceDays) {
      const reduction = applyOverdueLimitReduction(
        normalizePhone(row.phone || ''),
        item.invoiceId,
        cfg,
        actor,
        overdueDays
      );
      if (reduction.success && !reduction.skipped) {
        actionsTaken.push({
          action: 'reduce_limit',
          reduced: reduction.reduced || 0,
          credit_limit_after: reduction.credit_limit_after || 0
        });
      }
    }

    const freezeDays = Math.max(0, parseInt(cfg.overdueFreezeDays || 0, 10) || 0);
    const lockDays = Math.max(0, parseInt(cfg.overdueLockDays || 0, 10) || 0);
    if (!isSettled && (isDefaulted || (lockDays > 0 && overdueDays >= lockDays))) {
      const lockResult = applyCreditAccountStatus(
        normalizePhone(row.phone || ''),
        'locked',
        actor,
        isDefaulted
          ? ('Auto lock + defaulted karena overdue >= ' + defaultDays + ' hari')
          : ('Auto lock karena overdue ' + overdueDays + ' hari'),
        item.invoiceId,
        false
      );
      if (lockResult && lockResult.success && !lockResult.skipped) {
        actionsTaken.push({ action: 'lock_account' });
      }
    } else if (!isSettled && freezeDays > 0 && overdueDays >= freezeDays) {
      const freezeResult = applyCreditAccountStatus(
        normalizePhone(row.phone || ''),
        'frozen',
        actor,
        'Auto freeze karena overdue ' + overdueDays + ' hari',
        item.invoiceId,
        false
      );
      if (freezeResult && freezeResult.success && !freezeResult.skipped) {
        actionsTaken.push({ action: 'freeze_account' });
      }
    }

    results.push({
      invoice_id: item.invoiceId,
      overdue_days: overdueDays,
      penalty_added: additionalPenalty,
      penalty_total: targetPenalty,
      total_due: nextTotalDue,
      status: nextStatus,
      actions: actionsTaken
    });
  }

  return {
    success: true,
    processed: results.length,
    invoices: results
  };
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

function resolveActionKey(action, data) {
  if (!action && data && Array.isArray(data)) return 'bulk_insert';
  if (!action) return 'unknown';
  return String(action).trim();
}

function resolveRequestToken(e, body) {
  const params = (e && e.parameter) ? e.parameter : {};
  const payload = body || {};
  const data = payload.data || {};
  return String(
    params.token ||
    payload.token ||
    payload.admin_token ||
    payload.auth_token ||
    data.token ||
    data.admin_token ||
    ''
  ).trim();
}

function isSheetValidationRequired(actionKey) {
  const skip = {
    attach_referral: true,
    claim_reward: true,
    credit_account_get: true,
    credit_account_upsert: true,
    credit_invoice_create: true,
    credit_invoice_pay: true,
    credit_limit_from_profit: true,
    credit_invoice_apply_penalty: true,
    credit_account_set_status: true,
    process_paylater_limit_from_orders: true,
    install_paylater_limit_scheduler: true,
    remove_paylater_limit_scheduler: true,
    get_paylater_limit_scheduler: true
  };
  return !skip[actionKey];
}

function isPublicCreateAction(actionKey, sheetName) {
  return actionKey === 'create' && isPublicPostAllowed(actionKey, sheetName);
}

function guardActionAuthorization(actionKey, token, sheetName) {
  if (isPublicPostAllowed(actionKey, sheetName)) return null;
  if (!ADMIN_TOKEN) {
    return {
      error: 'ADMIN_TOKEN_NOT_CONFIGURED',
      message: 'Set ADMIN_TOKEN untuk menjalankan aksi ini'
    };
  }
  if (token !== ADMIN_TOKEN) {
    return {
      error: 'Unauthorized',
      message: 'Token tidak valid'
    };
  }
  return null;
}

function isPublicPostAllowed(actionKey, sheetName) {
  const rule = PUBLIC_POST_RULES[actionKey];
  if (!rule) return false;
  if (rule.anySheet) return true;
  if (rule.sheets && rule.sheets[sheetName]) return true;
  return false;
}

function isGetSheetSensitive(sheetName) {
  return Boolean(SENSITIVE_GET_SHEETS[sheetName]);
}

function isAlertCooldownActive(key) {
  try {
    const cache = CacheService.getScriptCache();
    return cache.get(key) === '1';
  } catch (error) {
    Logger.log('Cache read failed: ' + error.toString());
    return false;
  }
}

function setAlertCooldown(key, ttlSeconds) {
  try {
    const cache = CacheService.getScriptCache();
    cache.put(key, '1', Math.max(1, ttlSeconds));
  } catch (error) {
    Logger.log('Cache write failed: ' + error.toString());
  }
}

function getSheet(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  return sheet;
}

function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function getRowsAsObjects(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = getNormalizedHeadersFromValues(values);
  if (!headers.length) return { sheet: sheet, headers: [], rows: [] };
  const rows = values.slice(1).map(function(r) { return toObject(headers, r); });
  return { sheet: sheet, headers: headers, rows: rows };
}

function toObject(headers, row) {
  const obj = {};
  headers.forEach(function(h, i) {
    const key = String(h || '').trim();
    if (!key) return;
    obj[key] = row[i];
  });
  return obj;
}

function appendByHeaders(sheet, headers, obj) {
  const row = headers.map(function(h) {
    return obj[h] !== undefined ? obj[h] : '';
  });
  sheet.appendRow(row);
}

function ensureSchema(repairMode) {
  const repaired = [];
  const missing = [];
  const checked = [];

  Object.keys(SCHEMA_REQUIREMENTS).forEach(function(sheetName) {
    const requiredHeaders = SCHEMA_REQUIREMENTS[sheetName];
    checked.push(sheetName);
    const sheet = getOrCreateSheet(sheetName);
    const values = sheet.getDataRange().getValues();
    let headers = getNormalizedHeadersFromValues(values);

    if (!headers.length) {
      if (repairMode) {
        sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
        repaired.push(sheetName + ':headers_created');
      } else {
        missing.push(sheetName + ':headers_missing');
      }
      return;
    }

    const toAdd = requiredHeaders.filter(function(h) { return headers.indexOf(h) === -1; });
    if (!toAdd.length) return;

    if (!repairMode) {
      missing.push(sheetName + ':missing=' + toAdd.join(','));
      return;
    }

    const startCol = headers.length + 1;
    sheet.getRange(1, startCol, 1, toAdd.length).setValues([toAdd]);
    repaired.push(sheetName + ':added=' + toAdd.join(','));
  });

  return {
    success: true,
    checked: checked.length,
    repaired: repaired,
    missing: missing
  };
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

function getNormalizedHeadersFromValues(values) {
  if (!values || !values.length) return [];
  const raw = values[0] || [];
  const headers = raw.map(function(h) { return String(h || '').trim(); });
  const hasAnyHeader = headers.some(function(h) { return h !== ''; });
  return hasAnyHeader ? headers : [];
}

function getPublicCreateIdentity(sheetName, payload) {
  const data = payload || {};
  if (sheetName === 'users') {
    return normalizePhone(data.whatsapp || data.phone || '');
  }
  if (sheetName === 'orders' || sheetName === 'claims') {
    return normalizePhone(data.phone || data.whatsapp || '');
  }
  return '';
}

function validatePublicCreatePayload(sheetName, payload) {
  const data = payload || {};

  if (sheetName === 'users') {
    const name = String(data.nama || '').trim();
    const phone = normalizePhone(data.whatsapp || data.phone || '');
    if (!name || name.length < 2) {
      return { success: false, error: 'INVALID_PAYLOAD', message: 'nama minimal 2 karakter' };
    }
    if (!phone || phone.length < 10) {
      return { success: false, error: 'INVALID_PAYLOAD', message: 'nomor whatsapp tidak valid' };
    }
    return null;
  }

  if (sheetName === 'orders') {
    const customer = String(data.pelanggan || '').trim();
    const phone = normalizePhone(data.phone || '');
    const total = parseNumber(data.total);
    const qty = parseNumber(data.qty);
    if (!customer || customer.length < 2) {
      return { success: false, error: 'INVALID_PAYLOAD', message: 'pelanggan minimal 2 karakter' };
    }
    if (!phone || phone.length < 10) {
      return { success: false, error: 'INVALID_PAYLOAD', message: 'phone tidak valid' };
    }
    if (qty <= 0 || total <= 0) {
      return { success: false, error: 'INVALID_PAYLOAD', message: 'qty/total harus lebih besar dari 0' };
    }
    return null;
  }

  if (sheetName === 'claims') {
    const phone = normalizePhone(data.phone || data.whatsapp || '');
    const hadiah = String(data.hadiah || '').trim();
    const poin = parseNumber(data.poin);
    if (!phone || phone.length < 10) {
      return { success: false, error: 'INVALID_PAYLOAD', message: 'phone tidak valid' };
    }
    if (!hadiah) {
      return { success: false, error: 'INVALID_PAYLOAD', message: 'hadiah wajib diisi' };
    }
    if (poin <= 0) {
      return { success: false, error: 'INVALID_PAYLOAD', message: 'poin harus lebih besar dari 0' };
    }
    return null;
  }

  return null;
}

function validatePublicCreateSignature(e, body, actionKey, sheetName, payload) {
  const cfg = getSecurityConfig();
  if (!cfg.publicCreateRequireHmac) return null;

  if (!cfg.publicCreateHmacSecret) {
    return {
      success: false,
      error: 'HMAC_NOT_CONFIGURED',
      message: 'public_create_hmac_secret belum diset'
    };
  }

  const params = (e && e.parameter) ? e.parameter : {};
  const tsRaw = String(
    (body && (body.ts || body.timestamp)) ||
    params.ts ||
    params.timestamp ||
    ''
  ).trim();
  const sigRaw = String(
    (body && (body.signature || body.sig)) ||
    params.signature ||
    params.sig ||
    ''
  ).trim();

  if (!tsRaw || !sigRaw) {
    return {
      success: false,
      error: 'INVALID_SIGNATURE',
      message: 'ts/timestamp dan signature wajib diisi'
    };
  }

  const ts = parseInt(tsRaw, 10);
  if (!ts) {
    return {
      success: false,
      error: 'INVALID_SIGNATURE',
      message: 'timestamp tidak valid'
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const maxAge = Math.max(30, cfg.publicCreateHmacMaxAgeSeconds);
  if (Math.abs(nowSec - ts) > maxAge) {
    return {
      success: false,
      error: 'SIGNATURE_EXPIRED',
      message: 'timestamp signature sudah lewat'
    };
  }

  const normalizedSig = normalizeProvidedSignature(sigRaw);
  const canonical = canonicalizeForSignature(payload || {});
  const message = [actionKey, sheetName, String(ts), canonical].join('|');
  const expected = hmacSha256Hex(cfg.publicCreateHmacSecret, message);
  if (!timingSafeEqual(expected, normalizedSig)) {
    return {
      success: false,
      error: 'INVALID_SIGNATURE',
      message: 'signature tidak valid'
    };
  }

  return null;
}

function createUserWithAtomicLock(payload) {
  return withScriptLock(function() {
    const dupError = ensureUserPhoneNotDuplicate(payload);
    if (dupError) return dupError;

    const users = getRowsAsObjects('users');
    if (!users.headers.length) {
      return { success: false, error: 'USERS_HEADERS_INVALID', message: 'Sheet users belum ada header' };
    }

    const row = users.headers.map(function(h) {
      return (payload && payload[h] !== undefined ? payload[h] : '');
    });
    users.sheet.appendRow(row);
    return { success: true, created: 1 };
  });
}

function validateAttachReferralPayload(payload) {
  const data = payload || {};
  const refereePhone = normalizePhone(data.referee_phone || '');
  const refCode = String(data.ref_code || '').trim();
  if (!refereePhone || refereePhone.length < 10) {
    return {
      success: false,
      error: 'INVALID_PAYLOAD',
      message: 'referee_phone tidak valid'
    };
  }
  if (!refCode || refCode.length < 4) {
    return {
      success: false,
      error: 'INVALID_PAYLOAD',
      message: 'ref_code tidak valid'
    };
  }
  return null;
}

function enforceAttachReferralRateLimit(payload) {
  const data = payload || {};
  const refereePhone = normalizePhone(data.referee_phone || '');
  const key = 'attach_ref:' + (refereePhone || 'anon');
  try {
    const cache = CacheService.getScriptCache();
    const current = parseInt(cache.get(key) || '0', 10) || 0;
    if (current >= ATTACH_REFERRAL_MAX_REQUESTS) {
      return {
        success: false,
        error: 'RATE_LIMITED',
        message: 'Terlalu banyak percobaan referral, coba lagi sebentar.'
      };
    }
    cache.put(key, String(current + 1), ATTACH_REFERRAL_WINDOW_SECONDS);
  } catch (error) {
    Logger.log('Attach referral rate limit cache error: ' + error.toString());
  }
  return null;
}

function validateClaimRewardPayload(payload) {
  const data = payload || {};
  const rewardId = String(data.reward_id || data.id || '').trim();
  const phone = normalizePhone(data.phone || data.whatsapp || '');
  if (!rewardId) {
    return {
      success: false,
      error: 'INVALID_PAYLOAD',
      message: 'reward_id wajib diisi'
    };
  }
  if (!phone || phone.length < 10) {
    return {
      success: false,
      error: 'INVALID_PAYLOAD',
      message: 'phone tidak valid'
    };
  }
  return null;
}

function enforceClaimRewardRateLimit(payload) {
  const data = payload || {};
  const phone = normalizePhone(data.phone || data.whatsapp || '');
  const rewardId = String(data.reward_id || data.id || '').trim();
  const key = 'claim_reward:' + (phone || 'anon') + ':' + (rewardId || 'unknown');
  try {
    const cache = CacheService.getScriptCache();
    const current = parseInt(cache.get(key) || '0', 10) || 0;
    if (current >= CLAIM_REWARD_MAX_REQUESTS) {
      return {
        success: false,
        error: 'RATE_LIMITED',
        message: 'Terlalu banyak percobaan klaim, coba lagi sebentar.'
      };
    }
    cache.put(key, String(current + 1), CLAIM_REWARD_WINDOW_SECONDS);
  } catch (error) {
    Logger.log('Claim reward rate limit cache error: ' + error.toString());
  }
  return null;
}

function ensureUserPhoneNotDuplicate(payload) {
  const data = payload || {};
  const newPhone = normalizePhone(data.whatsapp || data.phone || '');
  if (!newPhone) {
    return {
      success: false,
      error: 'INVALID_PAYLOAD',
      message: 'nomor whatsapp tidak valid'
    };
  }
  const users = getRowsAsObjects('users').rows;
  const duplicate = users.some(function(row) {
    const existing = normalizePhone(row.whatsapp || row.phone || '');
    return existing && existing === newPhone;
  });
  if (duplicate) {
    return {
      success: false,
      error: 'DUPLICATE_PHONE',
      message: 'nomor whatsapp sudah terdaftar'
    };
  }
  return null;
}

function enforcePublicCreateRateLimit(sheetName, payload) {
  const identity = getPublicCreateIdentity(sheetName, payload);
  const key = 'pub_create:' + sheetName + ':' + (identity || 'anon');
  try {
    const cache = CacheService.getScriptCache();
    const current = parseInt(cache.get(key) || '0', 10) || 0;
    if (current >= PUBLIC_CREATE_MAX_REQUESTS) {
      return {
        success: false,
        error: 'RATE_LIMITED',
        message: 'Terlalu banyak request, coba lagi sebentar.'
      };
    }
    cache.put(key, String(current + 1), PUBLIC_CREATE_WINDOW_SECONDS);
  } catch (error) {
    Logger.log('Rate limit cache error: ' + error.toString());
  }
  return null;
}

function enforcePublicLoginRateLimit(phone) {
  const normalizedPhone = normalizePhone(phone || '');
  const key = 'pub_login:' + (normalizedPhone || 'anon');
  try {
    const cache = CacheService.getScriptCache();
    const current = parseInt(cache.get(key) || '0', 10) || 0;
    if (current >= PUBLIC_LOGIN_MAX_REQUESTS) {
      return {
        success: false,
        error: 'RATE_LIMITED',
        message: 'Terlalu banyak percobaan login, coba lagi sebentar.'
      };
    }
    cache.put(key, String(current + 1), PUBLIC_LOGIN_WINDOW_SECONDS);
  } catch (error) {
    Logger.log('Public login rate limit cache error: ' + error.toString());
  }
  return null;
}

function normalizeProvidedSignature(signature) {
  const raw = String(signature || '').trim().toLowerCase();
  if (raw.indexOf('sha256=') === 0) return raw.substring(7);
  return raw;
}

function hmacSha256Hex(secret, message) {
  const bytes = Utilities.computeHmacSha256Signature(String(message), String(secret));
  return bytesToHex(bytes).toLowerCase();
}

function bytesToHex(bytes) {
  return bytes.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function canonicalizeForSignature(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return '[' + value.map(function(item) {
      return canonicalizeForSignature(item);
    }).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(function(k) {
      return JSON.stringify(k) + ':' + canonicalizeForSignature(value[k]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function timingSafeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (var i = 0; i < x.length; i++) {
    diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  }
  return diff === 0;
}

function isFinalReferralOrderStatus(status) {
  const normalized = String(status || '').toLowerCase().trim();
  return normalized === 'paid' || normalized === 'selesai';
}

function isCancelledReferralOrderStatus(status) {
  const normalized = String(status || '').toLowerCase().trim();
  const cancelled = [
    'batal',
    'dibatalkan',
    'cancel',
    'canceled',
    'cancelled',
    'void'
  ];
  return cancelled.indexOf(normalized) !== -1;
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

function getMonitoringAlertConfig() {
  const set = getSettingsMap();
  return {
    enabled: String(set.referral_alert_enabled || 'false').toLowerCase() === 'true',
    pendingDaysThreshold: parseInt(set.referral_pending_days_threshold || '3', 10) || 3,
    mismatchThreshold: parseInt(set.referral_mismatch_threshold || '1', 10) || 1,
    cooldownMinutes: parseInt(set.referral_alert_cooldown_minutes || '60', 10) || 60,
    email: String(set.referral_alert_email || '').trim(),
    webhook: String(set.referral_alert_webhook || '').trim()
  };
}

function getFraudConfig() {
  const set = getSettingsMap();
  return {
    enabled: String(set.referral_fraud_enabled || 'true').toLowerCase() === 'true',
    ipDistinctRefereeThreshold: parseInt(set.referral_fraud_ip_distinct_referee_threshold || '3', 10) || 3,
    deviceDistinctRefereeThreshold: parseInt(set.referral_fraud_device_distinct_referee_threshold || '3', 10) || 3,
    lookbackDays: parseInt(set.referral_fraud_lookback_days || '14', 10) || 14,
    minMinutesAfterAttach: parseInt(set.referral_fraud_min_minutes_after_attach || '3', 10) || 3,
    cancelRateThreshold: parseFloat(set.referral_fraud_cancel_rate_threshold || '0.5') || 0.5,
    cancelRateMinSamples: parseInt(set.referral_fraud_cancel_rate_min_samples || '4', 10) || 4,
    reviewScore: parseInt(set.referral_fraud_review_score || '40', 10) || 40,
    blockScore: parseInt(set.referral_fraud_block_score || '70', 10) || 70
  };
}

function getSecurityConfig() {
  const set = getSettingsMap();
  return {
    publicCreateRequireHmac: String(set.public_create_require_hmac || 'false').toLowerCase() === 'true',
    publicCreateHmacSecret: String(set.public_create_hmac_secret || '').trim(),
    publicCreateHmacMaxAgeSeconds: parseInt(
      set.public_create_hmac_max_age_seconds || String(PUBLIC_CREATE_HMAC_MAX_AGE_SECONDS),
      10
    ) || PUBLIC_CREATE_HMAC_MAX_AGE_SECONDS
  };
}

function evaluateReferralFraudRisk(referral, data, orderId, orderTotal) {
  const cfg = getFraudConfig();
  if (!cfg.enabled) {
    return { score: 0, level: 'low', decision: 'allow', triggeredRules: [], notes: 'fraud engine disabled' };
  }

  const triggeredRules = [];
  let score = 0;

  const refereePhone = normalizePhone(referral.referee_phone || data.buyer_phone || '');
  const referrerPhone = normalizePhone(referral.referrer_phone || '');
  const ipAddress = String(data.ip_address || data.ip || '').trim();
  const deviceId = String(data.device_id || '').trim();
  const createdAt = new Date(referral.created_at || 0);

  const addRule = function(code, weight, meta) {
    triggeredRules.push({ code: code, weight: weight, meta: meta || {} });
    score += weight;
  };

  if (!Number.isNaN(createdAt.getTime())) {
    const minutesFromAttach = (Date.now() - createdAt.getTime()) / (60 * 1000);
    if (minutesFromAttach < cfg.minMinutesAfterAttach) {
      addRule('rapid_order_after_attach', 30, {
        minutes_from_attach: minutesFromAttach,
        threshold: cfg.minMinutesAfterAttach
      });
    }
  }

  if (ipAddress) {
    const ipDistinct = getDistinctRecentCountByField('ip_address', ipAddress, cfg.lookbackDays);
    if (ipDistinct >= cfg.ipDistinctRefereeThreshold) {
      addRule('shared_ip_many_referees', 30, {
        distinct_referees: ipDistinct,
        threshold: cfg.ipDistinctRefereeThreshold
      });
    }
  }

  if (deviceId) {
    const deviceDistinct = getDistinctRecentCountByField('device_id', deviceId, cfg.lookbackDays);
    if (deviceDistinct >= cfg.deviceDistinctRefereeThreshold) {
      addRule('shared_device_many_referees', 35, {
        distinct_referees: deviceDistinct,
        threshold: cfg.deviceDistinctRefereeThreshold
      });
    }
  }

  if (referrerPhone) {
    const cancelStats = getReferrerCancelStats(referrerPhone);
    if (cancelStats.total >= cfg.cancelRateMinSamples && cancelStats.rate >= cfg.cancelRateThreshold) {
      addRule('high_referrer_cancel_rate', 35, {
        rate: cancelStats.rate,
        threshold: cfg.cancelRateThreshold,
        total: cancelStats.total
      });
    }
  }

  if (referrerPhone && refereePhone) {
    const dist = computePhoneDistance(referrerPhone, refereePhone);
    if (dist <= FRAUD_PHONE_DISTANCE_THRESHOLD) {
      addRule('similar_referrer_referee_phone', 20, {
        distance: dist,
        threshold: FRAUD_PHONE_DISTANCE_THRESHOLD
      });
    }
  }

  let level = 'low';
  let decision = 'allow';
  if (score >= cfg.blockScore) {
    level = 'high';
    decision = 'block';
  } else if (score >= cfg.reviewScore) {
    level = 'medium';
    decision = 'review';
  }

  return {
    score: score,
    level: level,
    decision: decision,
    triggeredRules: triggeredRules,
    notes: 'rules=' + triggeredRules.length + ',order_id=' + orderId + ',order_total=' + orderTotal
  };
}

function getDistinctRecentCountByField(fieldName, fieldValue, lookbackDays) {
  const logs = getRowsAsObjects('fraud_risk_logs').rows;
  const cutoffMs = Date.now() - Math.max(1, lookbackDays) * 24 * 60 * 60 * 1000;
  const uniqueReferees = {};
  for (var i = 0; i < logs.length; i++) {
    var row = logs[i];
    if (String(row[fieldName] || '').trim() !== String(fieldValue || '').trim()) continue;
    var createdAt = new Date(row.created_at || 0);
    if (Number.isNaN(createdAt.getTime()) || createdAt.getTime() < cutoffMs) continue;
    var referee = normalizePhone(row.referee_phone || '');
    if (!referee) continue;
    uniqueReferees[referee] = true;
  }
  return Object.keys(uniqueReferees).length;
}

function getReferrerCancelStats(referrerPhone) {
  const refs = getRowsAsObjects('referrals').rows;
  let approved = 0;
  let reversed = 0;
  const target = normalizePhone(referrerPhone || '');
  for (var i = 0; i < refs.length; i++) {
    var row = refs[i];
    if (normalizePhone(row.referrer_phone || '') !== target) continue;
    var st = String(row.status || '').toLowerCase().trim();
    if (st === 'approved') approved++;
    if (st === 'reversed') reversed++;
  }
  const total = approved + reversed;
  return {
    total: total,
    reversed: reversed,
    rate: total > 0 ? reversed / total : 0
  };
}

function computePhoneDistance(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (!x || !y) return 99;
  if (x.length === y.length) {
    var diff = 0;
    for (var i = 0; i < x.length; i++) {
      if (x.charAt(i) !== y.charAt(i)) diff++;
    }
    return diff;
  }

  // Fallback levenshtein for different-length values.
  const m = x.length;
  const n = y.length;
  const dp = [];
  for (var r = 0; r <= m; r++) {
    dp[r] = [];
    dp[r][0] = r;
  }
  for (var c = 0; c <= n; c++) {
    dp[0][c] = c;
  }
  for (var i1 = 1; i1 <= m; i1++) {
    for (var j1 = 1; j1 <= n; j1++) {
      var cost = x.charAt(i1 - 1) === y.charAt(j1 - 1) ? 0 : 1;
      dp[i1][j1] = Math.min(
        dp[i1 - 1][j1] + 1,
        dp[i1][j1 - 1] + 1,
        dp[i1 - 1][j1 - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function logFraudRiskEvent(eventObj) {
  const row = eventObj || {};
  const sheetObj = getRowsAsObjects('fraud_risk_logs');
  if (!sheetObj.headers.length) return;
  appendByHeaders(sheetObj.sheet, sheetObj.headers, {
    id: row.id || genId('FRD'),
    created_at: row.created_at || nowIso(),
    event: row.event || 'evaluate_referral',
    referral_id: row.referral_id || '',
    referrer_phone: normalizePhone(row.referrer_phone || ''),
    referee_phone: normalizePhone(row.referee_phone || ''),
    order_id: normalizeOrderId(row.order_id || ''),
    order_total: parseNumber(row.order_total || 0),
    ip_address: String(row.ip_address || '').trim(),
    device_id: String(row.device_id || '').trim(),
    user_agent: String(row.user_agent || '').trim(),
    risk_score: parseInt(row.risk_score || 0, 10) || 0,
    risk_level: String(row.risk_level || 'low'),
    decision: String(row.decision || 'allow'),
    triggered_rules_json: String(row.triggered_rules_json || '[]'),
    notes: String(row.notes || '')
  });
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

function runReferralReconciliationAudit() {
  const schemaResult = ensureSchema(true);
  const monitorCfg = getMonitoringAlertConfig();

  const userRows = getRowsAsObjects('user_points').rows;
  const trxRows = getRowsAsObjects('point_transactions').rows;
  const referralRows = getRowsAsObjects('referrals').rows;

  const userMap = {};
  userRows.forEach(function(row) {
    const phone = normalizePhone(row.phone || '');
    if (!phone) return;
    userMap[phone] = parseNumber(row.points || 0);
  });

  const trxMap = {};
  trxRows.forEach(function(row) {
    const phone = normalizePhone(row.phone || '');
    if (!phone) return;
    trxMap[phone] = (trxMap[phone] || 0) + parseNumber(row.points_delta || 0);
  });

  const mismatchDetails = [];
  const phones = {};
  Object.keys(userMap).forEach(function(p) { phones[p] = true; });
  Object.keys(trxMap).forEach(function(p) { phones[p] = true; });

  Object.keys(phones).forEach(function(phone) {
    const sheetBalance = parseNumber(userMap[phone] || 0);
    const ledgerBalance = parseNumber(trxMap[phone] || 0);
    const diff = sheetBalance - ledgerBalance;
    if (Math.abs(diff) > 0.0001) {
      mismatchDetails.push({
        phone: phone,
        user_points: sheetBalance,
        ledger_sum: ledgerBalance,
        diff: diff
      });
    }
  });

  const now = new Date();
  const threshold = monitorCfg.pendingDaysThreshold;
  const stalePendingCount = referralRows.filter(function(row) {
    const status = String(row.status || '').toLowerCase().trim();
    if (status !== 'pending') return false;
    const createdAt = new Date(row.created_at || 0);
    if (Number.isNaN(createdAt.getTime())) return false;
    const ageDays = (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
    return ageDays > threshold;
  }).length;

  const mismatchCount = mismatchDetails.length;
  const status = (mismatchCount > 0 || stalePendingCount > 0) ? 'warning' : 'ok';
  const summary = {
    mismatch_count: mismatchCount,
    stale_pending_count: stalePendingCount,
    pending_threshold_days: threshold,
    schema_repaired: schemaResult.repaired,
    mismatch_sample: mismatchDetails.slice(0, 25)
  };

  const auditSheetObj = getRowsAsObjects('referral_audit_logs');
  appendByHeaders(auditSheetObj.sheet, auditSheetObj.headers, {
    id: genId('AUD'),
    run_at: nowIso(),
    status: status,
    mismatch_count: mismatchCount,
    stale_pending_count: stalePendingCount,
    pending_threshold_days: threshold,
    summary_json: JSON.stringify(summary)
  });

  if (monitorCfg.enabled && (mismatchCount >= monitorCfg.mismatchThreshold || stalePendingCount > 0)) {
    handleNotifyReferralAlert({
      source: 'scheduled_reconciliation',
      stale_pending_count: stalePendingCount,
      mismatch_count: mismatchCount,
      spike_detected: false,
      today_referrals: 0,
      baseline_avg: 0,
      mismatch_threshold: monitorCfg.mismatchThreshold,
      pending_days_threshold: threshold,
      cooldown_minutes: monitorCfg.cooldownMinutes,
      email: monitorCfg.email,
      webhook: monitorCfg.webhook
    });
  }

  return {
    success: true,
    status: status,
    mismatch_count: mismatchCount,
    stale_pending_count: stalePendingCount
  };
}

function installReferralAuditTrigger() {
  removeReferralAuditTrigger();
  ScriptApp.newTrigger(AUDIT_TRIGGER_HANDLER)
    .timeBased()
    .everyHours(1)
    .create();
  return { success: true, message: 'Trigger audit per jam berhasil dibuat' };
}

function removeReferralAuditTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === AUDIT_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  return { success: true, message: 'Trigger audit dihapus' };
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

function rollbackReferrerSummary(referrerPhone, reversedPoints) {
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
      const nextCount = Math.max(0, oldCount - 1);
      const nextTotal = Math.max(0, oldTotal - Math.abs(parseInt(reversedPoints || 0, 10) || 0));
      sheet.getRange(rowNo, countCol + 1).setValue(nextCount);
      sheet.getRange(rowNo, totalCol + 1).setValue(nextTotal);
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
    const ordersData = ordersSheet.getDataRange().getValues();
    if (ordersData.length < 2) return;

    const ordersHeaders = ordersData[0];

    const phoneColIdx = ordersHeaders.indexOf('phone');
    const poinColIdx = ordersHeaders.indexOf('poin');
    const processedColIdx = ordersHeaders.indexOf('point_processed');
    const orderIdColIdx = ordersHeaders.indexOf('id');
    const orderCodeColIdx = ordersHeaders.indexOf('order_id');
    if (phoneColIdx === -1 || poinColIdx === -1 || processedColIdx === -1) return;

    let processed = 0;
    let failed = 0;
    for (var i = 1; i < ordersData.length; i++) {
      const row = ordersData[i];
      const phone = normalizePhone(row[phoneColIdx]);
      const poin = parseFloat(row[poinColIdx]) || 0;
      const isProcessed = row[processedColIdx];
      if (isProcessed === 'Yes' || poin <= 0 || !phone) continue;

      const rawOrderId = (orderIdColIdx !== -1 ? row[orderIdColIdx] : '') ||
        (orderCodeColIdx !== -1 ? row[orderCodeColIdx] : '');
      const orderId = normalizeOrderId(rawOrderId || ('orders_row_' + (i + 1)));
      const u = upsertUserPoints(
        phone,
        poin,
        'loyalty_points',
        orderId,
        'Loyalty points from order',
        'system'
      );
      if (!u.success) {
        failed++;
        continue;
      }

      ordersSheet.getRange(i + 1, processedColIdx + 1).setValue('Yes');
      processed++;
    }

    return { success: true, processed: processed, failed: failed };
  } catch (error) {
    Logger.log('Error in processLoyaltyPoints: ' + error.toString());
    return { error: error.toString() };
  }
}
