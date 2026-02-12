/**
 * PayLater Logic Helpers
 * Utility murni untuk perhitungan biaya, denda, limit, dan eligibility.
 * Tidak melakukan side effect jaringan agar aman dipakai di frontend/admin.
 */

function getPaylaterConfigSafe() {
    if (typeof CONFIG !== 'undefined' && typeof CONFIG.getPaylaterConfig === 'function') {
        return CONFIG.getPaylaterConfig();
    }
    return {
        enabled: false,
        profitToLimitPercent: 10,
        tenorFees: { 1: 5, 2: 10, 3: 15, 4: 20 },
        dailyPenaltyPercent: 0.5,
        penaltyCapPercent: 15,
        maxActiveInvoices: 1,
        maxLimit: 1000000,
        minOrderAmount: 0,
        freezeOverdueDays: 7,
        lockOverdueDays: 30
    };
}

function toMoneyInt(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.round(num));
}

function normalizeTenorWeeks(tenorWeeks) {
    const n = parseInt(tenorWeeks, 10);
    if (!Number.isFinite(n)) return 1;
    return Math.min(4, Math.max(1, n));
}

function getTenorFeePercent(tenorWeeks, config) {
    const cfg = config || getPaylaterConfigSafe();
    const tenor = normalizeTenorWeeks(tenorWeeks);
    const raw = cfg && cfg.tenorFees ? cfg.tenorFees[tenor] : 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function calculatePaylaterInvoice(principal, tenorWeeks, config) {
    const principalValue = toMoneyInt(principal);
    const feePercent = getTenorFeePercent(tenorWeeks, config);
    const feeAmount = toMoneyInt((principalValue * feePercent) / 100);
    const totalBeforePenalty = principalValue + feeAmount;

    return {
        principal: principalValue,
        tenorWeeks: normalizeTenorWeeks(tenorWeeks),
        feePercent,
        feeAmount,
        totalBeforePenalty
    };
}

function calculatePenaltyAmount(baseAmount, daysLate, config) {
    const cfg = config || getPaylaterConfigSafe();
    const principal = toMoneyInt(baseAmount);
    const lateDays = Math.max(0, parseInt(daysLate, 10) || 0);

    const dailyPercent = Number(cfg.dailyPenaltyPercent) || 0;
    const capPercent = Number(cfg.penaltyCapPercent) || 0;

    const uncapped = toMoneyInt((principal * dailyPercent * lateDays) / 100);
    const capAmount = toMoneyInt((principal * capPercent) / 100);
    return Math.min(uncapped, capAmount);
}

function calculateTotalDueWithPenalty(invoiceData, daysLate, config) {
    const invoice = invoiceData || {};
    const totalBeforePenalty = toMoneyInt(invoice.totalBeforePenalty || invoice.total_due || 0);
    const penaltyAmount = calculatePenaltyAmount(totalBeforePenalty, daysLate, config);
    return {
        totalBeforePenalty,
        penaltyAmount,
        totalDue: totalBeforePenalty + penaltyAmount
    };
}

function calculateLimitIncreaseFromProfit(profitNet, config) {
    const cfg = config || getPaylaterConfigSafe();
    const profit = toMoneyInt(profitNet);
    const percent = Number(cfg.profitToLimitPercent) || 0;
    return toMoneyInt((profit * percent) / 100);
}

function evaluatePaylaterEligibility(payload, config) {
    const cfg = config || getPaylaterConfigSafe();
    const input = payload || {};
    const account = input.account || {};

    if (!cfg.enabled) {
        return { eligible: false, reason: 'paylater_disabled' };
    }

    if (!account || !account.status) {
        return { eligible: false, reason: 'account_not_found' };
    }

    const status = String(account.status).toLowerCase();
    if (status === 'frozen') return { eligible: false, reason: 'account_frozen' };
    if (status === 'locked') return { eligible: false, reason: 'account_locked' };
    if (status !== 'active') return { eligible: false, reason: 'account_inactive' };

    const activeInvoices = parseInt(input.activeInvoicesCount, 10) || 0;
    if (activeInvoices >= (parseInt(cfg.maxActiveInvoices, 10) || 1)) {
        return { eligible: false, reason: 'active_invoice_exists' };
    }

    const orderTotal = toMoneyInt(input.orderTotal);
    if (orderTotal < toMoneyInt(cfg.minOrderAmount)) {
        return { eligible: false, reason: 'below_min_order' };
    }

    const availableLimit = toMoneyInt(account.available_limit || account.availableLimit || 0);
    if (availableLimit < orderTotal) {
        return { eligible: false, reason: 'insufficient_limit' };
    }

    return {
        eligible: true,
        reason: 'ok',
        availableLimit,
        orderTotal
    };
}

const PaylaterLogic = {
    getPaylaterConfigSafe,
    toMoneyInt,
    normalizeTenorWeeks,
    getTenorFeePercent,
    calculatePaylaterInvoice,
    calculatePenaltyAmount,
    calculateTotalDueWithPenalty,
    calculateLimitIncreaseFromProfit,
    evaluatePaylaterEligibility
};

if (typeof window !== 'undefined') {
    window.PaylaterLogic = PaylaterLogic;
}
