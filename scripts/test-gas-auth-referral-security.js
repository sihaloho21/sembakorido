const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

function createSheet(name, headers) {
  const values = [headers.slice()];
  return {
    _name: name,
    _values: values,
    getDataRange() {
      return { getValues: () => this._values.map((r) => r.slice()) };
    },
    getRange(row, col, numRows, numCols) {
      const r = Math.max(1, parseInt(row, 10) || 1);
      const c = Math.max(1, parseInt(col, 10) || 1);
      const rr = Math.max(1, parseInt(numRows, 10) || 1);
      const cc = Math.max(1, parseInt(numCols, 10) || 1);
      const sheet = this;
      return {
        setValue(v) {
          while (sheet._values.length < r) sheet._values.push([]);
          while (sheet._values[r - 1].length < c) sheet._values[r - 1].push('');
          sheet._values[r - 1][c - 1] = v;
        },
        setValues(matrix) {
          for (let i = 0; i < rr; i++) {
            for (let j = 0; j < cc; j++) {
              const tr = r + i;
              const tc = c + j;
              while (sheet._values.length < tr) sheet._values.push([]);
              while (sheet._values[tr - 1].length < tc) sheet._values[tr - 1].push('');
              sheet._values[tr - 1][tc - 1] = matrix[i][j];
            }
          }
        }
      };
    },
    appendRow(row) {
      this._values.push(Array.isArray(row) ? row.slice() : [row]);
    },
    deleteRow(row) {
      const r = parseInt(row, 10) || 0;
      if (r >= 1 && r <= this._values.length) this._values.splice(r - 1, 1);
    }
  };
}

function loadGasContext() {
  const sheets = new Map();
  const cache = new Map();
  const props = new Map();
  let cacheNowMs = Date.now();
  let uuidN = 1;
  const addSheet = (name, headers) => sheets.set(name, createSheet(name, headers));

  addSheet('settings', ['key', 'value']);
  addSheet('users', [
    'id', 'nama', 'whatsapp', 'phone', 'pin', 'total_points', 'status', 'created_at',
    'tanggal_daftar', 'kode_referral', 'referred_by', 'referred_by_phone',
    'referral_count', 'referral_points_total', 'updated_at'
  ]);
  addSheet('orders', [
    'id', 'order_id', 'pelanggan', 'phone', 'qty', 'total', 'status',
    'poin', 'point_processed', 'payment_method', 'profit_net', 'credit_limit_processed',
    'created_at', 'updated_at'
  ]);
  addSheet('user_points', ['phone', 'points', 'last_updated']);
  addSheet('claims', ['id', 'phone', 'nama', 'hadiah', 'poin', 'status', 'tanggal', 'reward_id', 'request_id']);
  addSheet('referrals', [
    'id', 'referrer_phone', 'referrer_code', 'referee_phone', 'referee_user_id',
    'status', 'trigger_order_id', 'trigger_order_total', 'reward_referrer_points',
    'reward_referee_points', 'created_at', 'approved_at', 'reversed_at', 'updated_at', 'notes'
  ]);
  addSheet('point_transactions', [
    'id', 'phone', 'type', 'points_delta', 'balance_after', 'source',
    'source_id', 'notes', 'created_at', 'actor'
  ]);
  addSheet('tukar_poin', [
    'id', 'nama', 'judul', 'poin', 'gambar', 'deskripsi',
    'reward_stock', 'daily_quota', 'daily_claim_count', 'daily_claim_date'
  ]);
  addSheet('fraud_risk_logs', [
    'id', 'created_at', 'event', 'referral_id', 'referrer_phone', 'referee_phone',
    'order_id', 'order_total', 'ip_address', 'device_id', 'user_agent',
    'risk_score', 'risk_level', 'decision', 'triggered_rules_json', 'notes'
  ]);
  addSheet('referral_audit_logs', [
    'id', 'run_at', 'status', 'mismatch_count', 'stale_pending_count', 'pending_threshold_days', 'summary_json'
  ]);
  addSheet('credit_accounts', [
    'id', 'phone', 'user_id', 'credit_limit', 'available_limit', 'used_limit', 'status',
    'admin_initial_limit', 'limit_growth_total', 'notes', 'created_at', 'updated_at'
  ]);
  addSheet('credit_invoices', [
    'id', 'invoice_id', 'phone', 'user_id', 'source_order_id',
    'principal', 'tenor_weeks', 'fee_percent', 'fee_amount',
    'penalty_percent_daily', 'penalty_cap_percent', 'penalty_amount',
    'total_before_penalty', 'total_due', 'paid_amount', 'due_date', 'status', 'notes',
    'created_at', 'updated_at', 'paid_at', 'closed_at'
  ]);
  addSheet('credit_ledger', [
    'id', 'phone', 'user_id', 'invoice_id', 'type', 'amount',
    'balance_before', 'balance_after', 'ref_id', 'note', 'actor', 'created_at'
  ]);
  addSheet('paylater_postmortem_logs', [
    'id', 'run_at', 'window_days', 'invoice_total', 'paid_ontime_count',
    'paid_late_count', 'overdue_open_count', 'defaulted_count',
    'outstanding_default_amount', 'on_time_rate', 'overdue_rate', 'default_rate',
    'summary_json', 'tuning_json'
  ]);

  const spreadsheet = {
    _sheets: sheets,
    getSheetByName(name) { return sheets.get(name) || null; },
    insertSheet(name) { const s = createSheet(name, []); sheets.set(name, s); return s; }
  };

  const context = {
    console,
    Date,
    Math,
    JSON,
    SpreadsheetApp: { openById: () => spreadsheet },
    LockService: {
      getScriptLock() { return { tryLock: () => true, releaseLock() {} }; }
    },
    CacheService: {
      getScriptCache() {
        return {
          get(key) {
            if (!cache.has(key)) return null;
            const item = cache.get(key);
            if (item.exp !== null && cacheNowMs >= item.exp) {
              cache.delete(key);
              return null;
            }
            return item.val;
          },
          put(key, val, ttlSec) {
            const ttl = parseInt(ttlSec, 10);
            const exp = Number.isFinite(ttl) && ttl > 0 ? cacheNowMs + ttl * 1000 : null;
            cache.set(key, { val: String(val), exp });
          }
        };
      }
    },
    Utilities: {
      getUuid() {
        const s = String(uuidN++).padStart(12, '0');
        return '00000000-0000-4000-8000-' + s;
      },
      computeHmacSha256Signature(msg, secret) {
        return Array.from(crypto.createHmac('sha256', String(secret)).update(String(msg)).digest());
      }
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(text) { return { _text: text, setMimeType() { return this; } }; }
    },
    MailApp: { sendEmail() {} },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200 }) },
    ScriptApp: {
      newTrigger() {
        return {
          timeBased() { return this; },
          everyHours() { return this; },
          everyDays() { return this; },
          atHour() { return this; },
          create() {}
        };
      },
      getProjectTriggers() { return []; },
      deleteTrigger() {}
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(k) { return props.has(k) ? props.get(k) : null; },
          setProperty(k, v) { props.set(k, String(v)); },
          deleteProperty(k) { props.delete(k); }
        };
      }
    },
    Logger: { log() {} }
  };

  context.__advanceCacheSeconds = function(sec) {
    cacheNowMs += (Math.max(0, parseInt(sec, 10) || 0) * 1000);
  };

  vm.createContext(context);
  const source = fs.readFileSync(path.join(process.cwd(), 'docs/gas_v62_referral_hardening.gs'), 'utf8');
  vm.runInContext(source, context);
  return context;
}

function append(ctx, sheet, data) {
  const obj = ctx.getRowsAsObjects(sheet);
  ctx.appendByHeaders(obj.sheet, obj.headers, data);
}

function rows(ctx, sheet) {
  return ctx.getRowsAsObjects(sheet).rows;
}

function run() {
  const ctx = loadGasContext();

  [
    ['referral_enabled', 'true'],
    ['referral_reward_referrer', '20'],
    ['referral_reward_referee', '10'],
    ['referral_min_first_order', '50000'],
    ['referral_fraud_enabled', 'true'],
    ['referral_fraud_review_score', '40'],
    ['referral_fraud_block_score', '70'],
    ['paylater_enabled', 'true'],
    ['paylater_pilot_enabled', 'false'],
    ['paylater_fee_week_1', '5'],
    ['paylater_fee_week_2', '10'],
    ['paylater_fee_week_3', '15'],
    ['paylater_fee_week_4', '20'],
    ['paylater_daily_penalty_percent', '0.5'],
    ['paylater_penalty_cap_percent', '15'],
    ['paylater_max_active_invoices', '1']
  ].forEach((e) => append(ctx, 'settings', { key: e[0], value: e[1] }));

  const user = (d) => append(ctx, 'users', Object.assign({
    id: '', nama: '', whatsapp: '', phone: '', pin: '', total_points: 0, status: 'aktif',
    created_at: ctx.nowIso(), tanggal_daftar: ctx.nowIso(), kode_referral: '', referred_by: '',
    referred_by_phone: '', referral_count: 0, referral_points_total: 0, updated_at: ''
  }, d || {}));

  const order = (d) => append(ctx, 'orders', Object.assign({
    id: '', order_id: '', pelanggan: '', phone: '', qty: 1, total: 0, status: 'pending',
    poin: 0, point_processed: 'No', payment_method: '', profit_net: 0, credit_limit_processed: '',
    created_at: ctx.nowIso(), updated_at: ctx.nowIso()
  }, d || {}));

  const phoneA = '081300000001';
  const phoneInactive = '081300000002';
  const phoneOther = '081300000009';
  user({ id: 'U-A', nama: 'User A', whatsapp: phoneA, phone: phoneA, pin: '123456', status: 'aktif' });
  user({ id: 'U-I', nama: 'User I', whatsapp: phoneInactive, phone: phoneInactive, pin: '111111', status: 'nonaktif' });
  append(ctx, 'user_points', { phone: phoneA, points: 120, last_updated: ctx.nowIso() });
  order({ id: 'ORD-A-1', order_id: 'ORD-A-1', phone: phoneA, pelanggan: 'User A', qty: 2, total: 90000, status: 'paid' });
  order({ id: 'ORD-Z-1', order_id: 'ORD-Z-1', phone: phoneOther, pelanggan: 'Other', qty: 1, total: 50000, status: 'paid' });

  const reg = ctx.createUserWithAtomicLock({
    id: 'U-N', nama: 'User New', whatsapp: '081300000003', phone: '081300000003',
    pin: '654321', status: 'aktif', created_at: ctx.nowIso(), tanggal_daftar: ctx.nowIso()
  });
  assert(reg && reg.success, 'Register user baru harus success');
  const regDup = ctx.createUserWithAtomicLock({
    id: 'U-N2', nama: 'User New2', whatsapp: '081300000003', phone: '081300000003',
    pin: '654321', status: 'aktif', created_at: ctx.nowIso(), tanggal_daftar: ctx.nowIso()
  });
  assert(regDup && regDup.error === 'DUPLICATE_PHONE', 'Register duplicate harus ditolak');

  const loginOk = ctx.handlePublicLogin({ phone: phoneA, pin: '123456' });
  assert(loginOk && loginOk.success && loginOk.session_token, 'Login valid harus return session_token');
  assert(ctx.handlePublicLogin({ phone: phoneA, pin: '000000' }).error === 'LOGIN_FAILED', 'Login salah pin ditolak');
  assert(ctx.handlePublicLogin({ phone: phoneInactive, pin: '111111' }).error === 'ACCOUNT_INACTIVE', 'Login nonaktif ditolak');

  assert(ctx.handlePublicUserProfile({ session_token: 'bad' }).error === 'UNAUTHORIZED_SESSION', 'Profile token invalid ditolak');
  assert(ctx.handlePublicUserPoints({ session_token: 'bad' }).error === 'UNAUTHORIZED_SESSION', 'Points token invalid ditolak');
  assert(ctx.handlePublicUserOrders({ session_token: 'bad' }).error === 'UNAUTHORIZED_SESSION', 'Orders token invalid ditolak');

  const st = loginOk.session_token;
  const profile = ctx.handlePublicUserProfile({ session_token: st });
  assert(profile && profile.success, 'public_user_profile success untuk session valid');
  assert(String(profile.user.kode_referral || '').trim().length >= 4, 'kode_referral harus otomatis terbentuk');
  const up = ctx.handlePublicUserPoints({ session_token: st });
  assert(Number(up.points) === 120, 'public_user_points harus sinkron dengan user_points');
  const uo = ctx.handlePublicUserOrders({ session_token: st });
  assert(Array.isArray(uo.orders) && uo.orders.length === 1, 'public_user_orders hanya milik user login');
  ctx.__advanceCacheSeconds(86500);
  assert(ctx.handlePublicUserProfile({ session_token: st }).error === 'UNAUTHORIZED_SESSION', 'session expired harus invalid');

  const referrerPhone = '081355500010';
  const refereePhone = '081366600020';
  const refFraudPhone = '081377700030';
  user({ id: 'U-RR', nama: 'Referrer', whatsapp: referrerPhone, phone: referrerPhone, pin: '123456', status: 'aktif', kode_referral: 'REFA10' });
  user({ id: 'U-RE1', nama: 'Referee1', whatsapp: refereePhone, phone: refereePhone, pin: '222222', status: 'aktif' });
  user({ id: 'U-RE2', nama: 'Referee2', whatsapp: refFraudPhone, phone: refFraudPhone, pin: '333333', status: 'aktif' });

  assert(ctx.handleAttachReferral({ referee_phone: referrerPhone, ref_code: 'REFA10' }).error_code === 'SELF_REFERRAL_NOT_ALLOWED', 'self referral ditolak');
  assert(ctx.handleAttachReferral({ referee_phone: refereePhone, ref_code: 'BADCODE' }).error_code === 'INVALID_REF_CODE', 'ref code invalid ditolak');
  assert(ctx.handleAttachReferral({ referee_phone: refereePhone, ref_code: 'REFA10' }).success, 'attach valid harus success');
  assert(ctx.handleAttachReferral({ referee_phone: refereePhone, ref_code: 'REFA10' }).error_code === 'REFERRAL_ALREADY_SET', 'attach dua kali ditolak');

  const evalOk = ctx.handleEvaluateReferral({
    buyer_phone: refereePhone, order_id: 'ORD-REF-1', order_status: 'paid', order_total: 120000,
    ip_address: '10.10.10.10', device_id: 'dev-1'
  });
  assert(evalOk && evalOk.success, 'evaluate referral eligible harus success');
  const evalDup = ctx.handleEvaluateReferral({
    buyer_phone: refereePhone, order_id: 'ORD-REF-1', order_status: 'paid', order_total: 120000
  });
  assert(evalDup && evalDup.success && String(evalDup.message || '').toLowerCase().includes('already'), 'evaluate idempotent by trigger_order_id');
  const rev = ctx.handleSyncReferralOrderStatus({ order_id: 'ORD-REF-1', order_status: 'cancelled' });
  assert(rev && rev.success && rev.action === 'reversed', 'cancel order harus reverse referral');
  const rev2 = ctx.handleSyncReferralOrderStatus({ order_id: 'ORD-REF-1', order_status: 'cancelled' });
  assert(rev2 && rev2.success && rev2.action === 'already_reversed', 'reverse retry harus idempotent');

  ctx.handleUpsertSetting({ key: 'referral_fraud_block_score', value: '20' });
  ctx.handleUpsertSetting({ key: 'referral_fraud_review_score', value: '10' });
  assert(ctx.handleAttachReferral({ referee_phone: refFraudPhone, ref_code: 'REFA10' }).success, 'attach referral fraud test harus success');
  const evalFraud = ctx.handleEvaluateReferral({
    buyer_phone: refFraudPhone, order_id: 'ORD-REF-F1', order_status: 'paid', order_total: 120000,
    ip_address: '10.10.10.11', device_id: 'dev-2'
  });
  assert(evalFraud && evalFraud.success === false && evalFraud.error_code === 'FRAUD_RISK_BLOCKED', 'fraud high risk harus blocked');
  assert(rows(ctx, 'fraud_risk_logs').length >= 2, 'fraud risk logs harus terisi');

  const claimPhone = '081344400001';
  user({ id: 'U-C1', nama: 'Claim User', whatsapp: claimPhone, phone: claimPhone, pin: '123456', status: 'aktif' });
  append(ctx, 'user_points', { phone: claimPhone, points: 120, last_updated: ctx.nowIso() });
  append(ctx, 'tukar_poin', { id: 'RW-1', nama: 'Voucher 50', judul: 'Voucher 50', poin: 50, reward_stock: 2, daily_quota: 5, daily_claim_count: 0, daily_claim_date: '' });
  append(ctx, 'tukar_poin', { id: 'RW-2', nama: 'Voucher 200', judul: 'Voucher 200', poin: 200, reward_stock: 2, daily_quota: 5, daily_claim_count: 0, daily_claim_date: '' });
  append(ctx, 'tukar_poin', { id: 'RW-3', nama: 'Habis', judul: 'Habis', poin: 10, reward_stock: 0, daily_quota: 5, daily_claim_count: 0, daily_claim_date: '' });

  const c1 = ctx.handleClaimReward({ reward_id: 'RW-1', phone: claimPhone, customer_name: 'Claim User', request_id: 'REQ-1' });
  assert(c1 && c1.success && Number(c1.balance_after) === 70 && Number(c1.reward_stock_after) === 1, 'claim valid harus potong poin + stock');
  const c1dup = ctx.handleClaimReward({ reward_id: 'RW-1', phone: claimPhone, customer_name: 'Claim User', request_id: 'REQ-1' });
  assert(c1dup && c1dup.success && c1dup.dedup, 'claim duplicate request_id harus dedup');
  assert(ctx.handleClaimReward({ reward_id: 'RW-2', phone: claimPhone, customer_name: 'Claim User', request_id: 'REQ-2' }).error_code === 'POINTS_INSUFFICIENT', 'claim poin tidak cukup harus ditolak');
  assert(ctx.handleClaimReward({ reward_id: 'RW-3', phone: claimPhone, customer_name: 'Claim User', request_id: 'REQ-3' }).error_code === 'REWARD_STOCK_EMPTY', 'claim stock habis harus ditolak');
  const claimTrx = rows(ctx, 'point_transactions').filter((r) => String(r.source) === 'reward_claim' && String(r.source_id) === 'REQ-1' && ctx.normalizePhone(r.phone) === ctx.normalizePhone(claimPhone));
  assert(claimTrx.length === 1, 'ledger reward_claim harus 1 untuk request_id yang sama');

  const pa = '081388800001';
  const pb = '081388800002';
  user({ id: 'U-PA', nama: 'Paylater A', whatsapp: pa, phone: pa, pin: '123456', status: 'aktif' });
  user({ id: 'U-PB', nama: 'Paylater B', whatsapp: pb, phone: pb, pin: '654321', status: 'aktif' });
  append(ctx, 'credit_accounts', { id: 'CA-A', phone: pa, user_id: 'U-PA', credit_limit: 300000, available_limit: 200000, used_limit: 100000, status: 'active', admin_initial_limit: 300000, limit_growth_total: 0, notes: '', created_at: ctx.nowIso(), updated_at: ctx.nowIso() });
  append(ctx, 'credit_accounts', { id: 'CA-B', phone: pb, user_id: 'U-PB', credit_limit: 300000, available_limit: 250000, used_limit: 50000, status: 'active', admin_initial_limit: 300000, limit_growth_total: 0, notes: '', created_at: ctx.nowIso(), updated_at: ctx.nowIso() });
  append(ctx, 'credit_invoices', { id: 'INV-A-1', invoice_id: 'INV-A-1', phone: pa, user_id: 'U-PA', source_order_id: 'ORD-PA', principal: 100000, tenor_weeks: 1, fee_percent: 10, fee_amount: 10000, penalty_percent_daily: 0.5, penalty_cap_percent: 15, penalty_amount: 0, total_before_penalty: 110000, total_due: 110000, paid_amount: 0, due_date: '2026-03-10', status: 'active', notes: '', created_at: ctx.nowIso(), updated_at: ctx.nowIso(), paid_at: '', closed_at: '' });
  append(ctx, 'credit_invoices', { id: 'INV-B-1', invoice_id: 'INV-B-1', phone: pb, user_id: 'U-PB', source_order_id: 'ORD-PB', principal: 50000, tenor_weeks: 1, fee_percent: 10, fee_amount: 5000, penalty_percent_daily: 0.5, penalty_cap_percent: 15, penalty_amount: 0, total_before_penalty: 55000, total_due: 55000, paid_amount: 0, due_date: '2026-03-10', status: 'active', notes: '', created_at: ctx.nowIso(), updated_at: ctx.nowIso(), paid_at: '', closed_at: '' });
  append(ctx, 'credit_ledger', { id: 'LED-A-1', phone: pa, user_id: 'U-PA', invoice_id: 'INV-A-1', type: 'invoice_create', amount: 100000, balance_before: 300000, balance_after: 200000, ref_id: 'INV-A-1', note: 'seed', actor: 'test', created_at: ctx.nowIso() });

  const sta = ctx.handlePublicLogin({ phone: pa, pin: '123456' }).session_token;
  assert(ctx.handlePublicPaylaterSummary({ session_token: 'bad' }).error === 'UNAUTHORIZED_SESSION', 'paylater summary token invalid ditolak');
  const sA = ctx.handlePublicPaylaterSummary({ session_token: sta });
  assert(sA && sA.success && ctx.normalizePhone(sA.phone) === ctx.normalizePhone(pa), 'paylater summary harus sesuai session user');
  const invA = ctx.handlePublicPaylaterInvoices({ session_token: sta });
  assert(Array.isArray(invA.invoices) && invA.invoices.length === 1 && String(invA.invoices[0].invoice_id) === 'INV-A-1', 'paylater invoices hanya milik user');
  const detA = ctx.handlePublicPaylaterInvoiceDetail({ session_token: sta, invoice_id: 'INV-A-1' });
  assert(detA && detA.success && Array.isArray(detA.ledger) && detA.ledger.length >= 1, 'paylater detail own invoice harus success');
  const detForbidden = ctx.handlePublicPaylaterInvoiceDetail({ session_token: sta, invoice_id: 'INV-B-1' });
  assert(detForbidden && detForbidden.error === 'FORBIDDEN', 'paylater detail invoice user lain harus forbidden');

  assert(ctx.isPublicPostAllowed('attach_referral', 'x') === true, 'whitelist attach_referral aktif');
  assert(ctx.isPublicPostAllowed('claim_reward', 'x') === true, 'whitelist claim_reward aktif');
  assert(ctx.isPublicPostAllowed('create', 'users') === true, 'whitelist create users aktif');
  assert(ctx.isPublicPostAllowed('create', 'products') === false, 'create non-whitelist harus false');
  assert(ctx.guardActionAuthorization('update', '', 'orders', 'manager').error === 'ADMIN_TOKEN_NOT_CONFIGURED', 'non-public action harus ditolak tanpa ADMIN_TOKEN');

  ctx.handleUpsertSetting({ key: 'admin_role_enforce', value: 'true' });
  ctx.handleUpsertSetting({ key: 'admin_default_role', value: 'operator' });
  assert(ctx.guardActionRoleAuthorization('delete', 'orders', 'operator').error === 'FORBIDDEN_ROLE', 'role rendah harus diblokir');
  assert(ctx.guardActionRoleAuthorization('delete', 'orders', 'superadmin') === null, 'superadmin harus lolos role guard');

  ctx.handleUpsertSetting({ key: 'public_create_require_hmac', value: 'true' });
  ctx.handleUpsertSetting({ key: 'public_create_hmac_secret', value: 'secret-hmac' });
  ctx.handleUpsertSetting({ key: 'public_create_hmac_max_age_seconds', value: '300' });
  const payload = { nama: 'User Hmac', whatsapp: '081399900001', pin: '123456' };
  const ts = Math.floor(Date.now() / 1000);
  const msg = ['create', 'users', String(ts), ctx.canonicalizeForSignature(payload)].join('|');
  const sig = ctx.hmacSha256Hex('secret-hmac', msg);
  assert(ctx.validatePublicCreateSignature({ parameter: {} }, { ts, signature: sig }, 'create', 'users', payload) === null, 'HMAC valid harus lolos');
  assert(ctx.validatePublicCreateSignature({ parameter: {} }, { ts, signature: 'deadbeef' }, 'create', 'users', payload).error === 'INVALID_SIGNATURE', 'HMAC invalid harus ditolak');
  assert(ctx.validatePublicCreateSignature({ parameter: {} }, { ts: ts - 10000, signature: sig }, 'create', 'users', payload).error === 'SIGNATURE_EXPIRED', 'HMAC expired harus ditolak');

  ctx.handleUpsertSetting({ key: 'public_login_window_seconds', value: '60' });
  ctx.handleUpsertSetting({ key: 'public_login_max_requests', value: '1' });
  ctx.handleUpsertSetting({ key: 'public_create_window_seconds', value: '60' });
  ctx.handleUpsertSetting({ key: 'public_create_max_requests', value: '1' });
  ctx.handleUpsertSetting({ key: 'attach_referral_window_seconds', value: '60' });
  ctx.handleUpsertSetting({ key: 'attach_referral_max_requests', value: '1' });
  ctx.handleUpsertSetting({ key: 'claim_reward_window_seconds', value: '60' });
  ctx.handleUpsertSetting({ key: 'claim_reward_max_requests', value: '1' });
  assert(ctx.enforcePublicLoginRateLimit('081300001111') === null, 'rate limit login request pertama harus lolos');
  assert(ctx.enforcePublicLoginRateLimit('081300001111').error === 'RATE_LIMITED', 'rate limit login request kedua harus block');
  assert(ctx.enforcePublicCreateRateLimit('users', { whatsapp: '081300001112' }) === null, 'rate limit create request pertama harus lolos');
  assert(ctx.enforcePublicCreateRateLimit('users', { whatsapp: '081300001112' }).error === 'RATE_LIMITED', 'rate limit create request kedua harus block');
  assert(ctx.enforceAttachReferralRateLimit({ referee_phone: '081300001113' }) === null, 'rate limit attach request pertama harus lolos');
  assert(ctx.enforceAttachReferralRateLimit({ referee_phone: '081300001113' }).error === 'RATE_LIMITED', 'rate limit attach request kedua harus block');
  assert(ctx.enforceClaimRewardRateLimit({ phone: '081300001114', reward_id: 'RW-S' }) === null, 'rate limit claim request pertama harus lolos');
  assert(ctx.enforceClaimRewardRateLimit({ phone: '081300001114', reward_id: 'RW-S' }).error === 'RATE_LIMITED', 'rate limit claim request kedua harus block');

  console.log('GAS auth/referral/reward/security tests passed.');
}

run();
