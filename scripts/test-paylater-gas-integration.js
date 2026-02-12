const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createSheet(name, headers) {
  const values = [headers.slice()];
  return {
    _name: name,
    _values: values,
    getName() {
      return this._name;
    },
    getDataRange() {
      return {
        getValues: () => this._values.map((row) => row.slice())
      };
    },
    getRange(row, col, numRows, numCols) {
      const r = Math.max(1, parseInt(row, 10) || 1);
      const c = Math.max(1, parseInt(col, 10) || 1);
      const rr = Math.max(1, parseInt(numRows, 10) || 1);
      const cc = Math.max(1, parseInt(numCols, 10) || 1);
      const sheet = this;
      return {
        setValue(value) {
          while (sheet._values.length < r) sheet._values.push([]);
          while (sheet._values[r - 1].length < c) sheet._values[r - 1].push('');
          sheet._values[r - 1][c - 1] = value;
        },
        setValues(matrix) {
          for (let i = 0; i < rr; i++) {
            for (let j = 0; j < cc; j++) {
              const targetRow = r + i;
              const targetCol = c + j;
              while (sheet._values.length < targetRow) sheet._values.push([]);
              while (sheet._values[targetRow - 1].length < targetCol) sheet._values[targetRow - 1].push('');
              sheet._values[targetRow - 1][targetCol - 1] = matrix[i][j];
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
      if (r >= 1 && r <= this._values.length) {
        this._values.splice(r - 1, 1);
      }
    }
  };
}

function createSpreadsheetMock() {
  const sheets = new Map();
  return {
    _sheets: sheets,
    getSheetByName(name) {
      return sheets.get(name) || null;
    },
    insertSheet(name) {
      const sheet = createSheet(name, []);
      sheets.set(name, sheet);
      return sheet;
    }
  };
}

function loadGasContext() {
  const spreadsheet = createSpreadsheetMock();
  const scriptCache = new Map();
  const scriptProps = new Map();

  function addSheet(name, headers) {
    spreadsheet._sheets.set(name, createSheet(name, headers));
  }

  addSheet('settings', ['key', 'value']);
  addSheet('credit_accounts', [
    'id', 'phone', 'user_id', 'credit_limit', 'available_limit', 'used_limit',
    'status', 'admin_initial_limit', 'limit_growth_total', 'notes', 'created_at', 'updated_at'
  ]);
  addSheet('credit_invoices', [
    'id', 'invoice_id', 'phone', 'user_id', 'source_order_id',
    'principal', 'tenor_weeks', 'fee_percent', 'fee_amount',
    'penalty_percent_daily', 'penalty_cap_percent', 'penalty_amount',
    'total_before_penalty', 'total_due', 'paid_amount',
    'due_date', 'status', 'notes', 'created_at', 'updated_at', 'paid_at', 'closed_at'
  ]);
  addSheet('credit_ledger', [
    'id', 'phone', 'user_id', 'invoice_id', 'type', 'amount',
    'balance_before', 'balance_after', 'ref_id', 'note', 'actor', 'created_at'
  ]);
  addSheet('orders', ['id', 'order_id', 'phone', 'status', 'profit_net', 'credit_limit_processed']);

  const scriptAppMock = {
    _triggers: [],
    newTrigger(handler) {
      const self = this;
      return {
        _handler: handler,
        _mode: null,
        _hour: null,
        timeBased() { return this; },
        everyHours() { this._mode = 'hourly'; return this; },
        everyDays() { this._mode = 'daily'; return this; },
        atHour(hour) { this._hour = hour; return this; },
        create() {
          self._triggers.push({
            getHandlerFunction() { return handler; }
          });
        }
      };
    },
    getProjectTriggers() {
      return this._triggers.slice();
    },
    deleteTrigger(trigger) {
      this._triggers = this._triggers.filter((t) => t !== trigger);
    }
  };

  const context = {
    console,
    Date,
    Math,
    JSON,
    SpreadsheetApp: {
      openById() {
        return spreadsheet;
      }
    },
    LockService: {
      getScriptLock() {
        return {
          tryLock() { return true; },
          releaseLock() {}
        };
      }
    },
    CacheService: {
      getScriptCache() {
        return {
          get(key) { return scriptCache.has(key) ? scriptCache.get(key) : null; },
          put(key, value) { scriptCache.set(key, String(value)); }
        };
      }
    },
    Utilities: {
      getUuid() {
        return '00000000-0000-4000-8000-000000000000';
      },
      computeHmacSha256Signature(message, secret) {
        return Array.from(crypto.createHmac('sha256', String(secret)).update(String(message)).digest());
      }
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(text) {
        return {
          _text: text,
          setMimeType() { return this; }
        };
      }
    },
    MailApp: { sendEmail() {} },
    UrlFetchApp: {
      fetch() {
        return { getResponseCode: () => 200 };
      }
    },
    ScriptApp: scriptAppMock,
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            return scriptProps.has(key) ? scriptProps.get(key) : null;
          },
          setProperty(key, value) {
            scriptProps.set(key, String(value));
          },
          deleteProperty(key) {
            scriptProps.delete(key);
          }
        };
      }
    },
    Logger: { log() {} }
  };

  vm.createContext(context);
  const gasPath = path.join(process.cwd(), 'docs/gas_v62_referral_hardening.gs');
  const source = fs.readFileSync(gasPath, 'utf8');
  vm.runInContext(source, context);

  return context;
}

function addSetting(ctx, key, value) {
  const s = ctx.getRowsAsObjects('settings');
  ctx.appendByHeaders(s.sheet, s.headers, { key, value });
}

function addCreditAccount(ctx, data) {
  const a = ctx.getRowsAsObjects('credit_accounts');
  ctx.appendByHeaders(a.sheet, a.headers, data);
}

function getRows(ctx, sheet) {
  return ctx.getRowsAsObjects(sheet).rows;
}

function testInvoiceCheckoutPayRelease(ctx) {
  const phone = '081234567890';
  addCreditAccount(ctx, {
    id: 'CAC-1',
    phone,
    user_id: 'USR-1',
    credit_limit: 200000,
    available_limit: 200000,
    used_limit: 0,
    status: 'active',
    admin_initial_limit: 200000,
    limit_growth_total: 0,
    notes: '',
    created_at: ctx.nowIso(),
    updated_at: ctx.nowIso()
  });

  const created = ctx.handleCreditInvoiceCreate({
    phone,
    user_id: 'USR-1',
    principal: 100000,
    tenor_weeks: 2,
    source_order_id: 'ORD-INT-1',
    invoice_id: 'INV-INT-1',
    actor: 'test'
  });
  assert(created && created.success, 'Invoice create harus success');
  assert(created.total_due === 110000, 'Total due invoice harus 110000');

  const accountAfterCreate = ctx.findCreditAccountByPhone(phone).row;
  assert(Number(accountAfterCreate.used_limit) === 100000, 'Used limit setelah checkout harus 100000');
  assert(Number(accountAfterCreate.available_limit) === 100000, 'Available limit setelah checkout harus 100000');

  const paid = ctx.handleCreditInvoicePay({
    invoice_id: 'INV-INT-1',
    payment_amount: 110000,
    payment_ref_id: 'PAY-INT-1',
    actor: 'test'
  });
  assert(paid && paid.success, 'Payment invoice harus success');
  assert(String(paid.status).toLowerCase() === 'paid', 'Status invoice harus paid');

  const accountAfterPay = ctx.findCreditAccountByPhone(phone).row;
  assert(Number(accountAfterPay.used_limit) === 0, 'Used limit setelah lunas harus 0');
  assert(Number(accountAfterPay.available_limit) === 200000, 'Available limit setelah lunas harus kembali 200000');

  const ledRows = getRows(ctx, 'credit_ledger').filter((r) => String(r.invoice_id) === 'INV-INT-1');
  const hasRelease = ledRows.some((r) => String(r.type) === 'limit_release');
  assert(hasRelease, 'Ledger harus punya entry limit_release');
}

function testOverduePenaltyFreeze(ctx) {
  const phone = '081234567891';
  addCreditAccount(ctx, {
    id: 'CAC-2',
    phone,
    user_id: 'USR-2',
    credit_limit: 300000,
    available_limit: 300000,
    used_limit: 0,
    status: 'active',
    admin_initial_limit: 300000,
    limit_growth_total: 0,
    notes: '',
    created_at: ctx.nowIso(),
    updated_at: ctx.nowIso()
  });

  const created = ctx.handleCreditInvoiceCreate({
    phone,
    user_id: 'USR-2',
    principal: 100000,
    tenor_weeks: 1,
    source_order_id: 'ORD-INT-2',
    invoice_id: 'INV-OD-1',
    due_date: '2026-02-01',
    actor: 'test'
  });
  assert(created && created.success, 'Invoice overdue test harus berhasil dibuat');

  const penalized = ctx.handleCreditInvoiceApplyPenalty({
    invoice_id: 'INV-OD-1',
    as_of_date: '2026-02-12',
    actor: 'test'
  });
  assert(penalized && penalized.success, 'Apply penalty harus success');
  assert(Number(penalized.processed) === 1, 'Apply penalty harus memproses 1 invoice');

  const inv = ctx.findCreditInvoiceByInvoiceId('INV-OD-1').row;
  assert(String(inv.status).toLowerCase() === 'overdue', 'Invoice harus status overdue');
  assert(Number(inv.penalty_amount) > 0, 'Penalty amount harus > 0');

  const account = ctx.findCreditAccountByPhone(phone).row;
  assert(String(account.status).toLowerCase() === 'frozen', 'Account harus auto frozen pada overdue threshold');

  const ledRows = getRows(ctx, 'credit_ledger');
  const hasPenalty = ledRows.some((r) =>
    String(r.type) === 'penalty' &&
    String(r.invoice_id) === 'INV-OD-1'
  );
  const hasFrozen = ledRows.some((r) =>
    String(r.type) === 'frozen' &&
    String(r.ref_id) === 'INV-OD-1'
  );
  assert(hasPenalty, 'Ledger harus punya entry penalty');
  assert(hasFrozen, 'Ledger harus punya entry frozen');
}

function testIdempotency(ctx) {
  const phoneInv = '081234567892';
  addCreditAccount(ctx, {
    id: 'CAC-3',
    phone: phoneInv,
    user_id: 'USR-3',
    credit_limit: 250000,
    available_limit: 250000,
    used_limit: 0,
    status: 'active',
    admin_initial_limit: 250000,
    limit_growth_total: 0,
    notes: '',
    created_at: ctx.nowIso(),
    updated_at: ctx.nowIso()
  });

  const c1 = ctx.handleCreditInvoiceCreate({
    phone: phoneInv,
    user_id: 'USR-3',
    principal: 100000,
    tenor_weeks: 1,
    source_order_id: 'ORD-IDEMP-1',
    invoice_id: 'INV-IDEMP-1',
    actor: 'test'
  });
  assert(c1 && c1.success, 'Create pertama harus success');
  const invoiceCountBeforeRetry = getRows(ctx, 'credit_invoices').filter((r) => String(r.invoice_id) === 'INV-IDEMP-1').length;

  const c2 = ctx.handleCreditInvoiceCreate({
    phone: phoneInv,
    user_id: 'USR-3',
    principal: 100000,
    tenor_weeks: 1,
    source_order_id: 'ORD-IDEMP-1',
    invoice_id: 'INV-IDEMP-1',
    actor: 'test'
  });
  assert(c2 && c2.success && c2.dedup, 'Create retry harus dedup=true');
  const invoiceCountAfterRetry = getRows(ctx, 'credit_invoices').filter((r) => String(r.invoice_id) === 'INV-IDEMP-1').length;
  assert(invoiceCountAfterRetry === invoiceCountBeforeRetry, 'Retry create tidak boleh menambah invoice');

  const p1 = ctx.handleCreditInvoicePay({
    invoice_id: 'INV-IDEMP-1',
    payment_amount: 105000,
    payment_ref_id: 'PAY-IDEMP-1',
    actor: 'test'
  });
  assert(p1 && p1.success, 'Payment pertama harus success');
  const payLedgerBefore = getRows(ctx, 'credit_ledger').filter((r) => String(r.ref_id) === 'PAY-IDEMP-1' && String(r.invoice_id) === 'INV-IDEMP-1').length;

  const p2 = ctx.handleCreditInvoicePay({
    invoice_id: 'INV-IDEMP-1',
    payment_amount: 105000,
    payment_ref_id: 'PAY-IDEMP-1',
    actor: 'test'
  });
  assert(p2 && p2.success && p2.dedup, 'Payment retry harus dedup=true');
  const payLedgerAfter = getRows(ctx, 'credit_ledger').filter((r) => String(r.ref_id) === 'PAY-IDEMP-1' && String(r.invoice_id) === 'INV-IDEMP-1').length;
  assert(payLedgerAfter === payLedgerBefore, 'Retry payment tidak boleh menambah ledger payment');

  const phoneLimit = '081234567893';
  addCreditAccount(ctx, {
    id: 'CAC-4',
    phone: phoneLimit,
    user_id: 'USR-4',
    credit_limit: 100000,
    available_limit: 100000,
    used_limit: 0,
    status: 'active',
    admin_initial_limit: 100000,
    limit_growth_total: 0,
    notes: '',
    created_at: ctx.nowIso(),
    updated_at: ctx.nowIso()
  });

  const l1 = ctx.handleCreditLimitFromProfit({
    phone: phoneLimit,
    order_id: 'ORD-LIMIT-IDEMP-1',
    profit_net: 50000,
    actor: 'test'
  });
  assert(l1 && l1.success && Number(l1.increased) === 5000, 'Limit increase pertama harus 5000');

  const l2 = ctx.handleCreditLimitFromProfit({
    phone: phoneLimit,
    order_id: 'ORD-LIMIT-IDEMP-1',
    profit_net: 50000,
    actor: 'test'
  });
  assert(l2 && l2.success && l2.dedup, 'Limit increase retry harus dedup=true');
  const limitLedCount = getRows(ctx, 'credit_ledger').filter((r) =>
    String(r.type) === 'limit_increase' &&
    String(r.ref_id) === 'ORD-LIMIT-IDEMP-1' &&
    String(ctx.normalizePhone(r.phone || '')) === String(ctx.normalizePhone(phoneLimit))
  ).length;
  assert(limitLedCount === 1, 'Retry limit increase tidak boleh menambah ledger limit_increase');
}

function testRefundLimitReversal(ctx) {
  const phone = '081234567894';
  addCreditAccount(ctx, {
    id: 'CAC-5',
    phone,
    user_id: 'USR-5',
    credit_limit: 100000,
    available_limit: 100000,
    used_limit: 0,
    status: 'active',
    admin_initial_limit: 100000,
    limit_growth_total: 0,
    notes: '',
    created_at: ctx.nowIso(),
    updated_at: ctx.nowIso()
  });

  const inc = ctx.handleCreditLimitFromProfit({
    phone,
    order_id: 'ORD-REFUND-1',
    profit_net: 50000,
    actor: 'test'
  });
  assert(inc && inc.success && Number(inc.increased) === 5000, 'Kenaikan limit awal harus 5000');

  const rev1 = ctx.handleCreditLimitRefundReversal({
    phone,
    order_id: 'ORD-REFUND-1',
    actor: 'test'
  });
  assert(rev1 && rev1.success && Number(rev1.reversed) === 5000, 'Reversal penuh harus 5000');
  assert(Number(rev1.credit_limit) === 100000, 'Credit limit harus kembali ke nilai awal');
  assert(Number(rev1.limit_growth_total) === 0, 'Limit growth total harus kembali 0');

  const rev2 = ctx.handleCreditLimitRefundReversal({
    phone,
    order_id: 'ORD-REFUND-1',
    actor: 'test'
  });
  assert(rev2 && rev2.success && rev2.dedup, 'Retry reversal harus dedup=true');

  const revLedgerCount = getRows(ctx, 'credit_ledger').filter((r) =>
    String(r.type) === 'limit_reversal' &&
    String(r.ref_id) === 'ORD-REFUND-1' &&
    String(ctx.normalizePhone(r.phone || '')) === String(ctx.normalizePhone(phone))
  ).length;
  assert(revLedgerCount === 1, 'Retry reversal tidak boleh menambah ledger limit_reversal');
}

function seedSettings(ctx) {
  addSetting(ctx, 'paylater_enabled', 'true');
  addSetting(ctx, 'paylater_profit_to_limit_percent', '10');
  addSetting(ctx, 'paylater_fee_week_1', '5');
  addSetting(ctx, 'paylater_fee_week_2', '10');
  addSetting(ctx, 'paylater_fee_week_3', '15');
  addSetting(ctx, 'paylater_fee_week_4', '20');
  addSetting(ctx, 'paylater_daily_penalty_percent', '0.5');
  addSetting(ctx, 'paylater_penalty_cap_percent', '15');
  addSetting(ctx, 'paylater_max_active_invoices', '1');
  addSetting(ctx, 'paylater_max_limit', '1000000');
  addSetting(ctx, 'paylater_overdue_freeze_days', '3');
  addSetting(ctx, 'paylater_overdue_lock_days', '14');
  addSetting(ctx, 'paylater_overdue_reduce_limit_days', '7');
  addSetting(ctx, 'paylater_overdue_reduce_limit_percent', '10');
  addSetting(ctx, 'paylater_overdue_default_days', '30');
}

function run() {
  const ctx = loadGasContext();
  seedSettings(ctx);
  testInvoiceCheckoutPayRelease(ctx);
  testOverduePenaltyFreeze(ctx);
  testIdempotency(ctx);
  testRefundLimitReversal(ctx);
  console.log('PayLater GAS integration + idempotency tests passed.');
}

run();
