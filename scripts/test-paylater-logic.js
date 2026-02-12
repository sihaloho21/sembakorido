const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadPaylaterLogic() {
  const filePath = path.join(process.cwd(), 'assets/js/paylater-logic.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const context = {
    window: {},
    CONFIG: {
      getPaylaterConfig() {
        return {
          enabled: true,
          profitToLimitPercent: 10,
          tenorFees: { 1: 5, 2: 10, 3: 15, 4: 20 },
          dailyPenaltyPercent: 0.5,
          penaltyCapPercent: 15,
          maxActiveInvoices: 1,
          maxLimit: 1000000,
          minOrderAmount: 0
        };
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.PaylaterLogic;
}

function testFeeCalculation(logic) {
  const inv = logic.calculatePaylaterInvoice(100000, 2, {
    tenorFees: { 1: 5, 2: 10, 3: 15, 4: 20 }
  });
  assert(inv.principal === 100000, 'principal harus 100000');
  assert(inv.tenorWeeks === 2, 'tenor harus 2 minggu');
  assert(inv.feePercent === 10, 'fee 2 minggu harus 10%');
  assert(inv.feeAmount === 10000, 'fee amount harus 10000');
  assert(inv.totalBeforePenalty === 110000, 'totalBeforePenalty harus 110000');
}

function testPenaltyCap(logic) {
  const penalty = logic.calculatePenaltyAmount(100000, 60, {
    dailyPenaltyPercent: 0.5,
    penaltyCapPercent: 15
  });
  assert(penalty === 15000, 'penalty harus kena cap 15% (15000)');

  const belowCap = logic.calculatePenaltyAmount(100000, 10, {
    dailyPenaltyPercent: 0.5,
    penaltyCapPercent: 15
  });
  assert(belowCap === 5000, 'penalty 10 hari harus 5000');
}

function testEligibility(logic) {
  const cfg = {
    enabled: true,
    maxActiveInvoices: 1,
    minOrderAmount: 50000
  };

  const ok = logic.evaluatePaylaterEligibility({
    account: { status: 'active', available_limit: 200000 },
    activeInvoicesCount: 0,
    orderTotal: 100000
  }, cfg);
  assert(ok.eligible === true, 'eligible harus true untuk akun aktif dan limit cukup');

  const insufficient = logic.evaluatePaylaterEligibility({
    account: { status: 'active', available_limit: 30000 },
    activeInvoicesCount: 0,
    orderTotal: 100000
  }, cfg);
  assert(insufficient.eligible === false && insufficient.reason === 'insufficient_limit',
    'harus gagal karena limit tidak cukup');

  const activeInvoice = logic.evaluatePaylaterEligibility({
    account: { status: 'active', available_limit: 500000 },
    activeInvoicesCount: 1,
    orderTotal: 100000
  }, cfg);
  assert(activeInvoice.eligible === false && activeInvoice.reason === 'active_invoice_exists',
    'harus gagal karena masih ada invoice aktif');

  const frozen = logic.evaluatePaylaterEligibility({
    account: { status: 'frozen', available_limit: 500000 },
    activeInvoicesCount: 0,
    orderTotal: 100000
  }, cfg);
  assert(frozen.eligible === false && frozen.reason === 'account_frozen',
    'harus gagal karena akun frozen');
}

function testLimitIncrease(logic) {
  const increase = logic.calculateLimitIncreaseFromProfit(250000, {
    profitToLimitPercent: 10
  });
  assert(increase === 25000, 'kenaikan limit harus 10% dari profit bersih');
}

function run() {
  const logic = loadPaylaterLogic();
  assert(logic, 'PaylaterLogic tidak ter-load');
  testFeeCalculation(logic);
  testPenaltyCap(logic);
  testEligibility(logic);
  testLimitIncrease(logic);
  console.log('PayLater logic tests passed.');
}

run();
