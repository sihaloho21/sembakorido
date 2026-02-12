
var escapeHtml = (window.AdminSanitize && window.AdminSanitize.escapeHtml) || ((value) => String(value || ''));
var escapeAttr = (window.AdminSanitize && window.AdminSanitize.escapeAttr) || ((value) => String(value || ''));
var sanitizeUrl = (window.AdminSanitize && window.AdminSanitize.sanitizeUrl) || ((url) => String(url || ''));

// Auth Check
if (localStorage.getItem('admin_logged_in') !== 'true') {
    window.location.href = 'login.html';
}
function logout() {
    localStorage.removeItem('admin_logged_in');
    window.location.href = 'login.html';
}

let API_URL = CONFIG.getAdminApiUrl();
const CATEGORIES_SHEET = 'categories';
const PRODUCTS_SHEET = 'products';
const ORDERS_SHEET = 'orders';
const TUKAR_POIN_SHEET = 'tukar_poin';
const PURCHASES_SHEET = 'pembelian';
const SUPPLIERS_SHEET = 'suppliers';
const MONTHLY_COST_SHEET = 'biaya_bulanan';
const REFERRALS_SHEET = 'referrals';
const CREDIT_ACCOUNTS_SHEET = 'credit_accounts';
const CREDIT_INVOICES_SHEET = 'credit_invoices';
const CREDIT_LEDGER_SHEET = 'credit_ledger';
const REFERRAL_ALERT_STATE_KEY = 'gos_referral_alert_state_v1';

let allProducts = [];
let allCategories = [];
let allOrders = [];
let allTukarPoin = [];
let allPurchases = [];
let allSuppliers = [];
let allMonthlyCosts = [];
let allReferrals = [];
let allCreditAccounts = [];
let allCreditInvoices = [];
let allCreditLedger = [];
let creditLedgerPage = 1;
let creditLedgerPageSize = 50;
let paylaterSchedulerRefreshTimer = null;
let currentOrderFilter = 'semua';
let currentOrderPage = 1;
const ordersPerPage = 10;
let referralFilterStatus = 'all';
let referralSearch = '';

function showSection(sectionId) {
    stopPaylaterSchedulerAutoRefresh();
    document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`section-${sectionId}`).classList.remove('hidden');
    document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
    document.getElementById(`nav-${sectionId}`).classList.add('active');

    closeSidebarOnMobile();
    
    const titles = {
        dashboard: 'Dashboard',
        produk: 'Produk',
        bundle: 'Bundle Builder',
        pembelian: 'Pembelian',
        suppliers: 'Supplier',
        biaya: 'Biaya Operasional',
        kategori: 'Kategori',
        pesanan: 'Pesanan',
        referrals: 'Referral',
        'credit-accounts': 'Credit Accounts',
        'credit-invoices': 'Credit Invoices',
        'credit-ledger': 'Credit Ledger',
        'tukar-poin': 'Tukar Poin',
        banners: 'Banner Promosi',
        'user-points': 'Poin Pengguna',
        'tiered-pricing': 'Harga Grosir Bertingkat',
        pengaturan: 'Pengaturan'
    };
    document.getElementById('section-title').innerText = titles[sectionId];

    if (sectionId === 'kategori') fetchCategories();
    if (sectionId === 'produk') fetchAdminProducts();
    if (sectionId === 'bundle') {
        if (allProducts.length === 0 || allCategories.length === 0) {
            fetchAdminProducts();
            fetchCategories();
        }
        ensureBundleBuilderReady();
    }
    if (sectionId === 'pembelian') {
        if (allProducts.length === 0) fetchAdminProducts();
        fetchPurchases();
    }
    if (sectionId === 'suppliers') fetchSuppliers();
    if (sectionId === 'biaya') fetchMonthlyCosts();
    if (sectionId === 'pesanan') fetchOrders();
    if (sectionId === 'referrals') fetchReferrals();
    if (sectionId === 'credit-accounts') {
        fetchCreditAccounts();
        startPaylaterSchedulerAutoRefresh();
    }
    if (sectionId === 'credit-invoices') fetchCreditInvoices();
    if (sectionId === 'credit-ledger') fetchCreditLedger();
    if (sectionId === 'tukar-poin') fetchTukarPoin();
    if (sectionId === 'banners') fetchBanners();
    if (sectionId === 'user-points') fetchUserPoints();
    if (sectionId === 'tiered-pricing') fetchTieredPricingProducts();
    if (sectionId === 'dashboard') {
        updateDashboardStats();
        loadStoreStatus();
    }
    if (sectionId === 'pengaturan') loadSettings();
}

function closeSidebarOnMobile() {
    if (window.innerWidth > 768) return;
    const sidebar = document.querySelector('aside');
    const overlay = document.querySelector('.sidebar-overlay');
    const hamburger = document.querySelector('.hamburger-menu');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    if (hamburger) {
        hamburger.setAttribute('aria-expanded', 'false');
        const openIcon = hamburger.querySelector('.hamburger-icon');
        const closeIcon = hamburger.querySelector('.close-icon');
        if (openIcon) openIcon.classList.remove('hidden');
        if (closeIcon) closeIcon.classList.add('hidden');
    }
    document.body.style.overflow = '';
}

// ============ DASHBOARD FUNCTIONS ============
function loadStoreStatus() {
    const isClosed = CONFIG.isStoreClosed();
    const toggle = document.getElementById('store-closed-toggle');
    const label = document.getElementById('store-status-label');
    
    if (toggle && label) {
        toggle.checked = isClosed;
        if (isClosed) {
            label.innerText = 'TOKO TUTUP';
            label.className = 'text-sm font-bold px-3 py-1 rounded-full bg-red-100 text-red-700';
        } else {
            label.innerText = 'TOKO BUKA';
            label.className = 'text-sm font-bold px-3 py-1 rounded-full bg-green-100 text-green-700';
        }
    }
}

function toggleStoreStatus() {
    const toggle = document.getElementById('store-closed-toggle');
    const isClosed = toggle.checked;
    CONFIG.setStoreClosed(isClosed);
    loadStoreStatus();
    showAdminToast(isClosed ? 'Toko sekarang TUTUP' : 'Toko sekarang BUKA', isClosed ? 'warning' : 'success');
}

async function updateDashboardStats() {
    try {
        const [prodRes, orderRes, purchaseRes, costRes, referralRes, userPointsRes, ledgerRes, settingsRes] = await Promise.all([
            fetch(`${API_URL}?sheet=${PRODUCTS_SHEET}`),
            fetch(`${API_URL}?sheet=${ORDERS_SHEET}`),
            fetch(`${API_URL}?sheet=${PURCHASES_SHEET}`),
            fetch(`${API_URL}?sheet=${MONTHLY_COST_SHEET}`),
            fetch(`${API_URL}?sheet=referrals`),
            fetch(`${API_URL}?sheet=user_points`),
            fetch(`${API_URL}?sheet=point_transactions`),
            fetch(`${API_URL}?sheet=settings`)
        ]);
        const prods = await prodRes.json();
        const orders = await orderRes.json();
        const purchases = purchaseRes.ok ? await purchaseRes.json() : [];
        const costs = costRes.ok ? await costRes.json() : [];
        const referrals = referralRes.ok ? await referralRes.json() : [];
        const userPoints = userPointsRes.ok ? await userPointsRes.json() : [];
        const ledgerRows = ledgerRes.ok ? await ledgerRes.json() : [];
        const settingsRows = settingsRes.ok ? await settingsRes.json() : [];
        allProducts = Array.isArray(prods) ? prods : [];
        allPurchases = Array.isArray(purchases) ? purchases : [];
        allMonthlyCosts = Array.isArray(costs) ? costs : [];
        
        document.getElementById('stat-total-produk').innerText = prods.length || 0;
        document.getElementById('stat-total-pesanan').innerText = orders.length || 0;
        const lowStock = prods.filter(p => parseInt(p.stok) <= 5).length;
        document.getElementById('stat-stok-menipis').innerText = lowStock;

        const normalizedOrders = Array.isArray(orders) ? orders : [];
        allOrders = normalizedOrders;
        updateRevenueStats(normalizedOrders);
        renderRecentOrders(normalizedOrders);
        updateReferralStats(Array.isArray(referrals) ? referrals : []);
        renderRecentReferrals(Array.isArray(referrals) ? referrals : []);

        const monitoringConfig = buildReferralMonitoringConfig(Array.isArray(settingsRows) ? settingsRows : []);
        const anomaly = computeReferralAnomalies(
            Array.isArray(referrals) ? referrals : [],
            Array.isArray(userPoints) ? userPoints : [],
            Array.isArray(ledgerRows) ? ledgerRows : [],
            monitoringConfig
        );
        renderReferralAnomalyWidgets(anomaly, monitoringConfig);
        maybeSendReferralAlertIfNeeded(anomaly, monitoringConfig, 'dashboard');
    } catch (e) { console.error(e); }
}

function buildReferralMonitoringConfig(settingsRows) {
    const rows = Array.isArray(settingsRows) ? settingsRows : [];
    const getVal = (key, fallback) => getLatestSettingValue(rows, key, fallback);
    return {
        enabled: String(getVal('referral_alert_enabled', 'false')).toLowerCase() === 'true',
        pendingDaysThreshold: parseInt(getVal('referral_pending_days_threshold', '3'), 10) || 3,
        mismatchThreshold: parseInt(getVal('referral_mismatch_threshold', '1'), 10) || 1,
        spikeMultiplier: parseFloat(getVal('referral_spike_multiplier', '2')) || 2,
        email: String(getVal('referral_alert_email', '') || '').trim(),
        webhook: String(getVal('referral_alert_webhook', '') || '').trim(),
        cooldownMinutes: parseInt(getVal('referral_alert_cooldown_minutes', '60'), 10) || 60
    };
}

function computeReferralAnomalies(referrals, userRows, ledgerRows, config) {
    const safeReferrals = Array.isArray(referrals) ? referrals : [];
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;

    const stalePendingCount = safeReferrals.filter((row) => {
        const status = String(row.status || '').toLowerCase();
        if (status !== 'pending') return false;
        const created = new Date(row.created_at || row.approved_at || 0);
        if (Number.isNaN(created.getTime())) return false;
        const ageDays = (now.getTime() - created.getTime()) / msPerDay;
        return ageDays > config.pendingDaysThreshold;
    }).length;

    const pointsMap = new Map();
    (Array.isArray(userRows) ? userRows : []).forEach((row) => {
        const phone = normalizePhone(row.phone || row.whatsapp || '');
        if (!phone) return;
        pointsMap.set(phone, parseCurrencyValue(row.points || row.poin || 0));
    });
    const ledgerMap = new Map();
    (Array.isArray(ledgerRows) ? ledgerRows : []).forEach((row) => {
        const phone = normalizePhone(row.phone || '');
        if (!phone) return;
        const current = ledgerMap.get(phone) || 0;
        ledgerMap.set(phone, current + parseCurrencyValue(row.points_delta || 0));
    });
    const allPhones = new Set([...pointsMap.keys(), ...ledgerMap.keys()]);
    const mismatchCount = Array.from(allPhones).filter((phone) => {
        const diff = (pointsMap.get(phone) || 0) - (ledgerMap.get(phone) || 0);
        return Math.abs(diff) > 0.0001;
    }).length;

    const dayCountMap = new Map();
    safeReferrals.forEach((row) => {
        const created = new Date(row.created_at || row.approved_at || 0);
        if (Number.isNaN(created.getTime())) return;
        const key = created.toISOString().slice(0, 10);
        dayCountMap.set(key, (dayCountMap.get(key) || 0) + 1);
    });
    const todayKey = now.toISOString().slice(0, 10);
    const todayCount = dayCountMap.get(todayKey) || 0;
    let baselineSum = 0;
    let baselineDays = 0;
    for (let i = 1; i <= 7; i += 1) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        baselineSum += dayCountMap.get(key) || 0;
        baselineDays += 1;
    }
    const baselineAvg = baselineDays > 0 ? baselineSum / baselineDays : 0;
    const spikeThreshold = baselineAvg * config.spikeMultiplier;
    const isSpike = baselineAvg > 0 ? todayCount > spikeThreshold : todayCount >= 3;

    return {
        stalePendingCount,
        mismatchCount,
        todayCount,
        baselineAvg,
        spikeThreshold,
        isSpike,
        generatedAt: new Date().toISOString()
    };
}

function renderReferralAnomalyWidgets(anomaly, config) {
    const staleEl = document.getElementById('stat-referral-pending-stale');
    const mismatchEl = document.getElementById('stat-referral-ledger-mismatch');
    const spikeEl = document.getElementById('stat-referral-spike');
    const spikeDetailEl = document.getElementById('stat-referral-spike-detail');
    const noteEl = document.getElementById('referral-anomaly-note');
    const updatedEl = document.getElementById('referral-anomaly-updated');

    if (staleEl) staleEl.innerText = String(anomaly.stalePendingCount);
    if (mismatchEl) mismatchEl.innerText = String(anomaly.mismatchCount);
    if (spikeEl) spikeEl.innerText = anomaly.isSpike ? 'Anomali' : 'Normal';
    if (spikeDetailEl) {
        spikeDetailEl.innerText = `Hari ini ${anomaly.todayCount}, rata-rata 7 hari ${anomaly.baselineAvg.toFixed(1)} (x${config.spikeMultiplier})`;
    }
    if (updatedEl) {
        updatedEl.innerText = `Diperbarui ${new Date(anomaly.generatedAt).toLocaleString('id-ID')}`;
    }
    if (noteEl) {
        const messages = [];
        if (anomaly.stalePendingCount > 0) messages.push(`${anomaly.stalePendingCount} pending melewati ${config.pendingDaysThreshold} hari`);
        if (anomaly.mismatchCount >= config.mismatchThreshold) messages.push(`${anomaly.mismatchCount} mismatch ledger (ambang ${config.mismatchThreshold})`);
        if (anomaly.isSpike) messages.push(`lonjakan referral harian terdeteksi`);
        noteEl.textContent = messages.length > 0 ? `Peringatan: ${messages.join(' | ')}` : 'Belum ada peringatan anomali.';
        noteEl.className = messages.length > 0
            ? 'text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3'
            : 'text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3';
    }
}

function shouldSendReferralAlert(anomaly, config) {
    if (!config.enabled) return false;
    const hasChannel = Boolean(config.email || config.webhook);
    if (!hasChannel) return false;
    return (
        anomaly.mismatchCount >= config.mismatchThreshold ||
        anomaly.stalePendingCount > 0 ||
        anomaly.isSpike
    );
}

function getReferralAlertState() {
    try {
        const raw = localStorage.getItem(REFERRAL_ALERT_STATE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        return {};
    }
}

function setReferralAlertState(state) {
    localStorage.setItem(REFERRAL_ALERT_STATE_KEY, JSON.stringify(state || {}));
}

async function maybeSendReferralAlertIfNeeded(anomaly, config, source) {
    if (!shouldSendReferralAlert(anomaly, config)) return;
    const state = getReferralAlertState();
    const now = Date.now();
    const cooldownMs = Math.max(1, config.cooldownMinutes) * 60 * 1000;
    if (state.lastSentAt && now - state.lastSentAt < cooldownMs) {
        return;
    }

    const payload = {
        source: source || 'dashboard',
        stale_pending_count: anomaly.stalePendingCount,
        mismatch_count: anomaly.mismatchCount,
        spike_detected: anomaly.isSpike,
        today_referrals: anomaly.todayCount,
        baseline_avg: Number(anomaly.baselineAvg.toFixed(2)),
        spike_multiplier: config.spikeMultiplier,
        mismatch_threshold: config.mismatchThreshold,
        pending_days_threshold: config.pendingDaysThreshold,
        email: config.email,
        webhook: config.webhook
    };

    try {
        const res = await GASActions.post({
            action: 'notify_referral_alert',
            sheet: 'settings',
            data: payload
        });
        if (res && res.success) {
            setReferralAlertState({ lastSentAt: now });
            showAdminToast('Alert anomali referral terkirim.', 'warning');
        }
    } catch (error) {
        console.warn('notify_referral_alert failed:', error);
    }
}

function updateReferralStats(referrals) {
    const pendingEl = document.getElementById('stat-referral-pending');
    const approvedEl = document.getElementById('stat-referral-approved');
    const pointsEl = document.getElementById('stat-referral-points');
    if (!pendingEl || !approvedEl || !pointsEl) return;

    const safeReferrals = Array.isArray(referrals) ? referrals : [];
    const pending = safeReferrals.filter((r) => String(r.status || '').toLowerCase() === 'pending').length;
    const approvedRows = safeReferrals.filter((r) => String(r.status || '').toLowerCase() === 'approved');
    const approved = approvedRows.length;
    const totalPoints = approvedRows.reduce((sum, row) => {
        const referrer = parseCurrencyValue(row.reward_referrer_points || 0);
        const referee = parseCurrencyValue(row.reward_referee_points || 0);
        return sum + referrer + referee;
    }, 0);

    pendingEl.innerText = pending;
    approvedEl.innerText = approved;
    pointsEl.innerText = totalPoints.toLocaleString('id-ID');
}

function renderRecentReferrals(referrals) {
    const body = document.getElementById('recent-referrals-list');
    if (!body) return;
    if (!Array.isArray(referrals) || referrals.length === 0) {
        body.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center text-gray-500">Belum ada data referral.</td></tr>';
        return;
    }

    const sorted = [...referrals].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
    }).slice(0, 6);

    body.innerHTML = sorted.map((row) => {
        const status = String(row.status || 'pending').toLowerCase();
        const statusClass = status === 'approved'
            ? 'bg-green-100 text-green-700'
            : status === 'pending'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-red-100 text-red-700';
        const reward = parseCurrencyValue(row.reward_referrer_points || 0) + parseCurrencyValue(row.reward_referee_points || 0);
        return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-4 py-3 text-xs font-semibold text-gray-700">${escapeHtml(normalizePhone(row.referrer_phone || '-'))}</td>
                <td class="px-4 py-3 text-xs text-gray-700">${escapeHtml(normalizePhone(row.referee_phone || '-'))}</td>
                <td class="px-4 py-3"><span class="text-xs px-2 py-1 rounded-full font-bold ${statusClass}">${escapeHtml(status)}</span></td>
                <td class="px-4 py-3 text-xs font-bold text-blue-700">${reward.toLocaleString('id-ID')}</td>
            </tr>
        `;
    }).join('');
}

async function fetchReferrals() {
    const tbody = document.getElementById('referral-list-body');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">Memuat data referral...</td></tr>';
    }
    try {
        allReferrals = await fetchSheetRows(REFERRALS_SHEET);
        renderReferralTable();
    } catch (error) {
        console.error(error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-red-500">Gagal memuat referral: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
        }
    }
}

function getFilteredReferrals() {
    const normalizedSearch = normalizePhone(referralSearch || '');
    return allReferrals.filter((row) => {
        const status = String(row.status || '').toLowerCase();
        const referrer = normalizePhone(row.referrer_phone || '');
        const referee = normalizePhone(row.referee_phone || '');
        const statusMatch = referralFilterStatus === 'all' || status === referralFilterStatus;
        const phoneMatch = !normalizedSearch || referrer.includes(normalizedSearch) || referee.includes(normalizedSearch);
        return statusMatch && phoneMatch;
    });
}

function renderReferralTable() {
    const tbody = document.getElementById('referral-list-body');
    const summary = document.getElementById('referral-filter-summary');
    if (!tbody) return;

    const filtered = getFilteredReferrals();
    if (summary) summary.textContent = `${filtered.length} data`;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">Tidak ada data referral sesuai filter.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((row) => {
        const status = String(row.status || 'pending').toLowerCase();
        const badgeClass = status === 'approved'
            ? 'bg-green-100 text-green-700'
            : status === 'pending'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-red-100 text-red-700';
        const rewardReferrer = parseCurrencyValue(row.reward_referrer_points || 0);
        const rewardReferee = parseCurrencyValue(row.reward_referee_points || 0);
        const rewardText = `${rewardReferrer.toLocaleString('id-ID')} / ${rewardReferee.toLocaleString('id-ID')}`;
        const safeId = escapeHtml(row.id || '-');
        const safeOrder = escapeHtml(row.trigger_order_id || '-');
        const canApprove = status !== 'approved';
        const canReject = status !== 'rejected' && status !== 'void';

        return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-6 py-4 text-xs font-bold text-blue-600">${safeId}</td>
                <td class="px-6 py-4 text-sm text-gray-700">${escapeHtml(normalizePhone(row.referrer_phone || '-'))}</td>
                <td class="px-6 py-4 text-sm text-gray-700">${escapeHtml(normalizePhone(row.referee_phone || '-'))}</td>
                <td class="px-6 py-4"><span class="text-xs px-2 py-1 rounded-full font-bold ${badgeClass}">${escapeHtml(status)}</span></td>
                <td class="px-6 py-4 text-sm font-semibold text-gray-700">${rewardText}</td>
                <td class="px-6 py-4 text-sm text-gray-600">${safeOrder}</td>
                <td class="px-6 py-4 text-right">
                    <div class="inline-flex gap-2">
                        <button data-action="approve-referral" data-id="${escapeAttr(row.id)}" class="px-3 py-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-xs font-bold transition" ${canApprove ? '' : 'disabled'}>
                            Approve
                        </button>
                        <button data-action="reject-referral" data-id="${escapeAttr(row.id)}" class="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold transition" ${canReject ? '' : 'disabled'}>
                            Reject
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function runReferralLedgerReconciliation() {
    const body = document.getElementById('referral-reconcile-body');
    const totalEl = document.getElementById('reconcile-total-count');
    const matchEl = document.getElementById('reconcile-match-count');
    const mismatchEl = document.getElementById('reconcile-mismatch-count');
    if (body) {
        body.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">Memproses rekonsiliasi...</td></tr>';
    }
    try {
        const [userRows, ledgerRows] = await Promise.all([
            fetchSheetRows('user_points'),
            fetchSheetRows('point_transactions')
        ]);

        const pointsMap = new Map();
        userRows.forEach((row) => {
            const phone = normalizePhone(row.phone || row.whatsapp || '');
            if (!phone) return;
            pointsMap.set(phone, parseCurrencyValue(row.points || row.poin || 0));
        });

        const ledgerMap = new Map();
        ledgerRows.forEach((row) => {
            const phone = normalizePhone(row.phone || '');
            if (!phone) return;
            const current = ledgerMap.get(phone) || 0;
            const delta = parseCurrencyValue(row.points_delta || 0);
            ledgerMap.set(phone, current + delta);
        });

        const allPhones = new Set([...pointsMap.keys(), ...ledgerMap.keys()]);
        const rows = Array.from(allPhones).map((phone) => {
            const pointValue = pointsMap.get(phone) || 0;
            const ledgerValue = ledgerMap.get(phone) || 0;
            const diff = pointValue - ledgerValue;
            return {
                phone,
                userPoints: pointValue,
                ledgerSum: ledgerValue,
                diff,
                match: Math.abs(diff) < 0.0001
            };
        }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

        const total = rows.length;
        const mismatch = rows.filter((r) => !r.match).length;
        const match = total - mismatch;
        if (totalEl) totalEl.innerText = String(total);
        if (matchEl) matchEl.innerText = String(match);
        if (mismatchEl) mismatchEl.innerText = String(mismatch);

        if (!body) return;
        if (rows.length === 0) {
            body.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">Tidak ada data untuk direkonsiliasi.</td></tr>';
            return;
        }

        body.innerHTML = rows.map((row) => {
            const statusClass = row.match ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
            const statusText = row.match ? 'match' : 'mismatch';
            return `
                <tr class="hover:bg-gray-50 transition">
                    <td class="px-4 py-3 text-xs font-semibold text-gray-700">${escapeHtml(row.phone)}</td>
                    <td class="px-4 py-3 text-xs text-gray-700">${row.userPoints.toLocaleString('id-ID')}</td>
                    <td class="px-4 py-3 text-xs text-gray-700">${row.ledgerSum.toLocaleString('id-ID')}</td>
                    <td class="px-4 py-3 text-xs font-bold ${row.match ? 'text-green-700' : 'text-red-700'}">${row.diff.toLocaleString('id-ID')}</td>
                    <td class="px-4 py-3"><span class="text-xs px-2 py-1 rounded-full font-bold ${statusClass}">${statusText}</span></td>
                </tr>
            `;
        }).join('');

        showAdminToast(`Rekonsiliasi selesai: ${mismatch} mismatch`, mismatch > 0 ? 'warning' : 'success');

        const settingsRows = await fetchSettingsRowsFromSheet();
        const monitoringConfig = buildReferralMonitoringConfig(settingsRows);
        const anomaly = {
            stalePendingCount: 0,
            mismatchCount: mismatch,
            todayCount: 0,
            baselineAvg: 0,
            spikeThreshold: 0,
            isSpike: false,
            generatedAt: new Date().toISOString()
        };
        await maybeSendReferralAlertIfNeeded(anomaly, monitoringConfig, 'manual_reconcile');
    } catch (error) {
        console.error(error);
        if (body) {
            body.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-red-500">Gagal menjalankan rekonsiliasi.</td></tr>';
        }
        showAdminToast('Gagal menjalankan rekonsiliasi ledger.', 'error');
    }
}

async function fetchSettingsRowsFromSheet() {
    try {
        return await fetchSheetRows('settings', { _t: Date.now() });
    } catch (error) {
        console.warn('Failed to fetch settings from sheet:', error);
        return [];
    }
}

function getLatestSettingValue(rows, key, fallbackValue) {
    if (!Array.isArray(rows)) return fallbackValue;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (String(rows[i].key || '').trim() === key) {
            const val = rows[i].value;
            return val !== undefined && val !== null && String(val) !== '' ? val : fallbackValue;
        }
    }
    return fallbackValue;
}

async function handleApproveReferral(referralId) {
    const row = allReferrals.find((r) => String(r.id) === String(referralId));
    if (!row) {
        showAdminToast('Referral tidak ditemukan.', 'error');
        return;
    }

    try {
        const evalResult = await GASActions.post({
            action: 'evaluate_referral',
            sheet: REFERRALS_SHEET,
            data: {
                order_id: row.trigger_order_id || `MANUAL-${Date.now()}`,
                order_status: 'Selesai',
                order_total: parseCurrencyValue(row.trigger_order_total || 999999),
                buyer_phone: normalizePhone(row.referee_phone || '')
            }
        });

        if (evalResult && evalResult.success) {
            showAdminToast('Referral approved & reward diproses.', 'success');
            fetchReferrals();
            updateDashboardStats();
            return;
        }
    } catch (error) {
        console.warn('evaluate_referral failed, fallback to manual status update:', error);
    }

    try {
        const result = await GASActions.update(REFERRALS_SHEET, referralId, {
            status: 'approved',
            approved_at: new Date().toISOString(),
            notes: 'Manual approved from admin panel'
        });
        if (result.affected > 0) {
            showAdminToast('Referral di-approve manual (tanpa auto reward).', 'warning');
            fetchReferrals();
            updateDashboardStats();
        } else {
            showAdminToast('Gagal approve referral.', 'error');
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Terjadi kesalahan saat approve referral.', 'error');
    }
}

async function handleRejectReferral(referralId) {
    try {
        const result = await GASActions.update(REFERRALS_SHEET, referralId, {
            status: 'rejected',
            notes: 'Manual rejected from admin panel'
        });
        if (result.affected > 0) {
            showAdminToast('Referral di-reject.', 'success');
            fetchReferrals();
            updateDashboardStats();
        } else {
            showAdminToast('Gagal reject referral.', 'error');
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Terjadi kesalahan saat reject referral.', 'error');
    }
}

function getCreditStatusBadgeClass(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'active') return 'bg-green-100 text-green-700';
    if (s === 'frozen') return 'bg-amber-100 text-amber-700';
    if (s === 'locked') return 'bg-red-100 text-red-700';
    if (s === 'paid') return 'bg-green-100 text-green-700';
    if (s === 'overdue') return 'bg-amber-100 text-amber-700';
    if (s === 'cancelled' || s === 'defaulted') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
}

function resetCreditAccountForm() {
    const form = document.getElementById('credit-account-form');
    if (!form) return;
    form.reset();
    const statusEl = document.getElementById('credit-account-status');
    if (statusEl) statusEl.value = 'active';
}

function fillCreditAccountForm(row) {
    if (!row) return;
    const phoneEl = document.getElementById('credit-account-phone');
    const userIdEl = document.getElementById('credit-account-user-id');
    const limitEl = document.getElementById('credit-account-limit');
    const statusEl = document.getElementById('credit-account-status');
    const notesEl = document.getElementById('credit-account-notes');
    if (phoneEl) phoneEl.value = normalizePhone(row.phone || '');
    if (userIdEl) userIdEl.value = row.user_id || '';
    if (limitEl) limitEl.value = parseCurrencyValue(row.credit_limit || 0);
    if (statusEl) statusEl.value = String(row.status || 'active').toLowerCase();
    if (notesEl) notesEl.value = row.notes || '';
}

function renderCreditAccounts() {
    const tbody = document.getElementById('credit-accounts-list');
    if (!tbody) return;

    const query = normalizePhone((document.getElementById('credit-accounts-search') || {}).value || '');
    const rows = (Array.isArray(allCreditAccounts) ? allCreditAccounts : []).filter((row) => {
        if (!query) return true;
        return normalizePhone(row.phone || '').includes(query);
    });

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">Tidak ada credit account.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((row) => {
        const limit = parseCurrencyValue(row.credit_limit || 0);
        const used = parseCurrencyValue(row.used_limit || 0);
        const available = parseCurrencyValue(row.available_limit || 0);
        const status = String(row.status || 'active').toLowerCase();
        const badge = getCreditStatusBadgeClass(status);

        return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-6 py-4 text-sm font-semibold text-gray-700">${escapeHtml(normalizePhone(row.phone || '-'))}</td>
                <td class="px-6 py-4 text-sm font-bold text-gray-800">Rp ${limit.toLocaleString('id-ID')}</td>
                <td class="px-6 py-4 text-sm text-gray-700">Rp ${used.toLocaleString('id-ID')}</td>
                <td class="px-6 py-4 text-sm text-gray-700">Rp ${available.toLocaleString('id-ID')}</td>
                <td class="px-6 py-4"><span class="text-xs px-2 py-1 rounded-full font-bold ${badge}">${escapeHtml(status)}</span></td>
                <td class="px-6 py-4 text-right">
                    <div class="inline-flex gap-2">
                        <button data-action="credit-account-fill" data-phone="${escapeAttr(row.phone || '')}" class="px-3 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-bold transition">Edit</button>
                        <button data-action="credit-account-quick-status" data-phone="${escapeAttr(row.phone || '')}" data-status="active" class="px-2 py-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-xs font-bold transition">Active</button>
                        <button data-action="credit-account-quick-status" data-phone="${escapeAttr(row.phone || '')}" data-status="frozen" class="px-2 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-bold transition">Frozen</button>
                        <button data-action="credit-account-quick-status" data-phone="${escapeAttr(row.phone || '')}" data-status="locked" class="px-2 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold transition">Locked</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function fetchCreditAccounts() {
    const tbody = document.getElementById('credit-accounts-list');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">Memuat credit account...</td></tr>';
    }
    try {
        allCreditAccounts = await fetchSheetRows(CREDIT_ACCOUNTS_SHEET);
        allCreditAccounts.sort((a, b) => {
            const tA = new Date(a.updated_at || a.created_at || 0).getTime();
            const tB = new Date(b.updated_at || b.created_at || 0).getTime();
            return tB - tA;
        });
        renderCreditAccounts();
        refreshPaylaterSchedulerStatus();
    } catch (error) {
        console.error(error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-red-500">Gagal memuat credit account: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
        }
    }
}

async function runPaylaterLimitSync() {
    if (!window.confirm('Proses sinkron kenaikan limit dari order final sekarang?')) return;
    try {
        const result = await GASActions.processPaylaterLimitFromOrders({ actor: 'admin' });
        if (result && result.success) {
            const processed = parseInt(result.processed || 0, 10) || 0;
            const failed = parseInt(result.failed || 0, 10) || 0;
            showAdminToast(`Sync limit selesai. Processed: ${processed}, Failed: ${failed}.`, failed > 0 ? 'warning' : 'success');
            await fetchCreditAccounts();
            return;
        }
        showAdminToast(result && (result.message || result.error) ? String(result.message || result.error) : 'Gagal sync limit order.', 'error');
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal sync limit order.', 'error');
    }
}

function updatePaylaterSchedulerStatusText(info) {
    const statusEl = document.getElementById('paylater-scheduler-status');
    if (!statusEl) return;
    if (!info || info.success !== true) {
        statusEl.textContent = 'Gagal memuat status scheduler.';
        statusEl.className = 'text-xs text-red-600';
        return;
    }

    if (!info.active) {
        statusEl.textContent = 'Scheduler nonaktif.';
        statusEl.className = 'text-xs text-gray-600';
        return;
    }

    const mode = String(info.mode || 'hourly');
    const hour = parseInt(info.hour || 0, 10) || 0;
    statusEl.textContent = mode === 'daily'
        ? `Scheduler aktif: daily jam ${hour.toString().padStart(2, '0')}:00`
        : 'Scheduler aktif: hourly';
    statusEl.className = 'text-xs text-green-700';
}

function getPaylaterSchedulerRefreshSeconds() {
    const inputEl = document.getElementById('paylater-scheduler-refresh-seconds');
    const raw = parseInt((inputEl && inputEl.value) || '30', 10) || 30;
    return Math.max(5, Math.min(3600, raw));
}

function stopPaylaterSchedulerAutoRefresh() {
    if (paylaterSchedulerRefreshTimer) {
        clearInterval(paylaterSchedulerRefreshTimer);
        paylaterSchedulerRefreshTimer = null;
    }
}

function startPaylaterSchedulerAutoRefresh() {
    stopPaylaterSchedulerAutoRefresh();
    const section = document.getElementById('section-credit-accounts');
    if (!section || section.classList.contains('hidden')) return;
    const seconds = getPaylaterSchedulerRefreshSeconds();
    paylaterSchedulerRefreshTimer = setInterval(() => {
        refreshPaylaterSchedulerStatus();
    }, seconds * 1000);
}

async function refreshPaylaterSchedulerStatus() {
    try {
        const info = await GASActions.getPaylaterLimitScheduler();
        updatePaylaterSchedulerStatusText(info);
    } catch (error) {
        console.error(error);
        updatePaylaterSchedulerStatusText(null);
    }
}

async function installPaylaterSchedulerFromUI() {
    const modeEl = document.getElementById('paylater-scheduler-mode');
    const hourEl = document.getElementById('paylater-scheduler-hour');
    const mode = String((modeEl && modeEl.value) || 'hourly').toLowerCase();
    const hour = Math.max(0, Math.min(23, parseInt((hourEl && hourEl.value) || '1', 10) || 1));

    try {
        const result = await GASActions.installPaylaterLimitScheduler({
            mode,
            hour
        });
        if (result && result.success) {
            showAdminToast(result.message || 'Scheduler PayLater berhasil dipasang.', 'success');
            await refreshPaylaterSchedulerStatus();
            return;
        }
        showAdminToast((result && (result.message || result.error)) || 'Gagal memasang scheduler PayLater.', 'error');
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal memasang scheduler PayLater.', 'error');
    }
}

async function removePaylaterSchedulerFromUI() {
    if (!window.confirm('Hapus scheduler otomatis PayLater?')) return;
    try {
        const result = await GASActions.removePaylaterLimitScheduler();
        if (result && result.success) {
            showAdminToast(result.message || 'Scheduler PayLater dihapus.', 'success');
            await refreshPaylaterSchedulerStatus();
            return;
        }
        showAdminToast((result && (result.message || result.error)) || 'Gagal menghapus scheduler PayLater.', 'error');
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal menghapus scheduler PayLater.', 'error');
    }
}

async function submitCreditAccountForm() {
    const phone = normalizePhone((document.getElementById('credit-account-phone') || {}).value || '');
    const userId = String((document.getElementById('credit-account-user-id') || {}).value || '').trim();
    const creditLimit = parseCurrencyValue((document.getElementById('credit-account-limit') || {}).value || 0);
    const status = String((document.getElementById('credit-account-status') || {}).value || 'active').trim();
    const notes = String((document.getElementById('credit-account-notes') || {}).value || '').trim();

    if (!phone || creditLimit < 0) {
        showAdminToast('Phone dan limit wajib valid.', 'error');
        return;
    }

    try {
        const result = await GASActions.upsertCreditAccount({
            phone,
            user_id: userId,
            credit_limit: creditLimit,
            status,
            notes,
            actor: 'admin'
        });

        if (result && result.success) {
            showAdminToast('Credit account berhasil disimpan.', 'success');
            await fetchCreditAccounts();
            return;
        }
        showAdminToast(result && (result.message || result.error) ? String(result.message || result.error) : 'Gagal simpan credit account.', 'error');
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal simpan credit account.', 'error');
    }
}

async function setCreditAccountStatus(phone, status) {
    const normalizedPhone = normalizePhone(phone || '');
    if (!normalizedPhone || !status) return;
    const normalizedStatus = String(status).toLowerCase();
    const payload = {
        phone: normalizedPhone,
        status: normalizedStatus,
        note: 'Status diubah dari Admin Panel',
        actor: 'admin'
    };

    if (normalizedStatus === 'active') {
        const verified = window.confirm('Aktifkan akun ini hanya jika semua tagihan sudah lunas dan verifikasi sudah selesai. Lanjutkan?');
        if (!verified) return;
        const verificationNote = window.prompt('Isi catatan verifikasi (minimal 8 karakter):', 'Verifikasi pelunasan manual admin');
        if (verificationNote === null) return;
        if (String(verificationNote || '').trim().length < 8) {
            showAdminToast('Catatan verifikasi minimal 8 karakter.', 'error');
            return;
        }
        payload.verification_passed = true;
        payload.verification_note = String(verificationNote || '').trim();
        payload.note = `Aktivasi terverifikasi: ${payload.verification_note}`;
    }

    try {
        const result = await GASActions.setCreditAccountStatus(payload);
        if (result && result.success) {
            showAdminToast(`Status account ${normalizedPhone} => ${status}`, 'success');
            await fetchCreditAccounts();
            return;
        }
        showAdminToast(
            result && (result.message || result.error)
                ? String(result.message || result.error)
                : 'Gagal update status credit account.',
            'error'
        );
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal update status credit account.', 'error');
    }
}

function resetCreditInvoiceForm() {
    const form = document.getElementById('credit-invoice-create-form');
    if (!form) return;
    form.reset();
    const tenorEl = document.getElementById('credit-invoice-tenor');
    if (tenorEl) tenorEl.value = '1';
}

function renderCreditInvoices() {
    const tbody = document.getElementById('credit-invoices-list');
    if (!tbody) return;

    const searchEl = document.getElementById('credit-invoices-search');
    const rawQuery = String((searchEl && searchEl.value) || '').trim().toLowerCase();
    const normalizedPhoneQuery = normalizePhone(rawQuery);

    const rows = (Array.isArray(allCreditInvoices) ? allCreditInvoices : []).filter((row) => {
        if (!rawQuery) return true;
        const invoiceId = String(row.invoice_id || row.id || '').toLowerCase();
        const phone = normalizePhone(row.phone || '');
        return invoiceId.includes(rawQuery) || phone.includes(normalizedPhoneQuery);
    });

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">Tidak ada credit invoice.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((row) => {
        const invoiceId = String(row.invoice_id || row.id || '-');
        const phone = normalizePhone(row.phone || '-');
        const principal = parseCurrencyValue(row.principal || 0);
        const totalDue = parseCurrencyValue(row.total_due || 0);
        const paid = parseCurrencyValue(row.paid_amount || 0);
        const remaining = Math.max(0, totalDue - paid);
        const status = String(row.status || 'active').toLowerCase();
        const badge = getCreditStatusBadgeClass(status);
        const dueDate = row.due_date ? new Date(row.due_date).toLocaleDateString('id-ID') : '-';

        return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-6 py-4 text-sm font-semibold text-blue-700">
                    ${escapeHtml(invoiceId)}
                    <div class="text-xs text-gray-500 mt-1">Due: ${escapeHtml(dueDate)}</div>
                </td>
                <td class="px-6 py-4 text-sm text-gray-700">${escapeHtml(phone)}</td>
                <td class="px-6 py-4 text-sm text-gray-700">Rp ${principal.toLocaleString('id-ID')}</td>
                <td class="px-6 py-4 text-sm font-bold text-gray-800">
                    Rp ${totalDue.toLocaleString('id-ID')}
                    <div class="text-xs font-medium text-gray-500 mt-1">Sisa: Rp ${remaining.toLocaleString('id-ID')}</div>
                </td>
                <td class="px-6 py-4"><span class="text-xs px-2 py-1 rounded-full font-bold ${badge}">${escapeHtml(status)}</span></td>
                <td class="px-6 py-4 text-right">
                    <div class="inline-flex gap-2">
                        <button data-action="credit-invoice-pay-full" data-id="${escapeAttr(invoiceId)}" data-amount="${escapeAttr(String(remaining))}" class="px-3 py-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-xs font-bold transition" ${remaining <= 0 ? 'disabled' : ''}>Bayar Lunas</button>
                        <button data-action="credit-invoice-pay-custom" data-id="${escapeAttr(invoiceId)}" data-max="${escapeAttr(String(remaining))}" class="px-3 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-bold transition" ${remaining <= 0 ? 'disabled' : ''}>Bayar Custom</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function fetchCreditInvoices() {
    const tbody = document.getElementById('credit-invoices-list');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">Memuat credit invoice...</td></tr>';
    }
    try {
        allCreditInvoices = await fetchSheetRows(CREDIT_INVOICES_SHEET);
        allCreditInvoices.sort((a, b) => {
            const tA = new Date(a.created_at || 0).getTime();
            const tB = new Date(b.created_at || 0).getTime();
            return tB - tA;
        });
        renderCreditInvoices();
    } catch (error) {
        console.error(error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-red-500">Gagal memuat credit invoice: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
        }
    }
}

function renderCreditLedger() {
    const tbody = document.getElementById('credit-ledger-list');
    const infoEl = document.getElementById('credit-ledger-pagination-info');
    const prevBtn = document.querySelector('[data-action="credit-ledger-prev-page"]');
    const nextBtn = document.querySelector('[data-action="credit-ledger-next-page"]');
    const pageSizeEl = document.getElementById('credit-ledger-page-size');
    if (!tbody) return;

    creditLedgerPageSize = Math.max(
        1,
        parseInt((pageSizeEl && pageSizeEl.value) || String(creditLedgerPageSize), 10) || 50
    );

    const rawQuery = String((document.getElementById('credit-ledger-search') || {}).value || '').trim().toLowerCase();
    const normalizedPhoneQuery = normalizePhone(rawQuery);
    const hasDigitQuery = /[0-9]/.test(rawQuery);

    const filteredRows = (Array.isArray(allCreditLedger) ? allCreditLedger : []).filter((row) => {
        if (!rawQuery) return true;
        const phone = normalizePhone(row.phone || '');
        const invoiceId = String(row.invoice_id || '').toLowerCase();
        const type = String(row.type || '').toLowerCase();
        const refId = String(row.ref_id || '').toLowerCase();
        const note = String(row.note || '').toLowerCase();
        const phoneMatch = hasDigitQuery ? phone.includes(normalizedPhoneQuery) : false;
        return (
            phoneMatch ||
            invoiceId.includes(rawQuery) ||
            type.includes(rawQuery) ||
            refId.includes(rawQuery) ||
            note.includes(rawQuery)
        );
    });

    if (filteredRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="px-6 py-8 text-center text-gray-500">Tidak ada credit ledger.</td></tr>';
        if (infoEl) infoEl.textContent = 'Page 0 / 0 | Total 0';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        return;
    }

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / creditLedgerPageSize));
    if (creditLedgerPage > totalPages) creditLedgerPage = totalPages;
    if (creditLedgerPage < 1) creditLedgerPage = 1;
    const start = (creditLedgerPage - 1) * creditLedgerPageSize;
    const end = start + creditLedgerPageSize;
    const pageRows = filteredRows.slice(start, end);

    tbody.innerHTML = pageRows.map((row) => {
        const createdAt = row.created_at ? new Date(row.created_at).toLocaleString('id-ID') : '-';
        const amount = parseCurrencyValue(row.amount || 0);
        const before = parseCurrencyValue(row.balance_before || 0);
        const after = parseCurrencyValue(row.balance_after || 0);
        return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-4 py-3 text-xs text-gray-700">${escapeHtml(createdAt)}</td>
                <td class="px-4 py-3 text-xs font-semibold text-gray-700">${escapeHtml(normalizePhone(row.phone || '-'))}</td>
                <td class="px-4 py-3 text-xs text-blue-700 font-semibold">${escapeHtml(String(row.invoice_id || '-'))}</td>
                <td class="px-4 py-3 text-xs"><span class="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-bold">${escapeHtml(String(row.type || '-'))}</span></td>
                <td class="px-4 py-3 text-xs text-gray-700">Rp ${amount.toLocaleString('id-ID')}</td>
                <td class="px-4 py-3 text-xs text-gray-700">Rp ${before.toLocaleString('id-ID')}</td>
                <td class="px-4 py-3 text-xs text-gray-700">Rp ${after.toLocaleString('id-ID')}</td>
                <td class="px-4 py-3 text-xs text-gray-700">${escapeHtml(String(row.actor || '-'))}</td>
                <td class="px-4 py-3 text-xs text-gray-700">${escapeHtml(String(row.ref_id || '-'))}</td>
                <td class="px-4 py-3 text-xs text-gray-700">${escapeHtml(String(row.note || '-'))}</td>
            </tr>
        `;
    }).join('');

    if (infoEl) {
        infoEl.textContent = `Page ${creditLedgerPage} / ${totalPages} | Total ${filteredRows.length}`;
    }
    if (prevBtn) prevBtn.disabled = creditLedgerPage <= 1;
    if (nextBtn) nextBtn.disabled = creditLedgerPage >= totalPages;
}

async function fetchCreditLedger() {
    const tbody = document.getElementById('credit-ledger-list');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10" class="px-6 py-8 text-center text-gray-500">Memuat credit ledger...</td></tr>';
    }
    try {
        creditLedgerPage = 1;
        allCreditLedger = await fetchSheetRows(CREDIT_LEDGER_SHEET);
        allCreditLedger.sort((a, b) => {
            const tA = new Date(a.created_at || 0).getTime();
            const tB = new Date(b.created_at || 0).getTime();
            return tB - tA;
        });
        renderCreditLedger();
    } catch (error) {
        console.error(error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" class="px-6 py-8 text-center text-red-500">Gagal memuat credit ledger: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
        }
    }
}

async function submitCreditInvoiceCreateForm() {
    const phone = normalizePhone((document.getElementById('credit-invoice-phone') || {}).value || '');
    const userId = String((document.getElementById('credit-invoice-user-id') || {}).value || '').trim();
    const principal = parseCurrencyValue((document.getElementById('credit-invoice-principal') || {}).value || 0);
    const tenorWeeks = parseInt((document.getElementById('credit-invoice-tenor') || {}).value || '1', 10) || 1;
    const dueDate = String((document.getElementById('credit-invoice-due-date') || {}).value || '').trim();
    const sourceOrderId = String((document.getElementById('credit-invoice-order-id') || {}).value || '').trim();
    const notes = String((document.getElementById('credit-invoice-notes') || {}).value || '').trim();

    if (!phone || principal <= 0) {
        showAdminToast('Phone dan principal wajib valid.', 'error');
        return;
    }

    try {
        const result = await GASActions.createCreditInvoice({
            phone,
            user_id: userId,
            principal,
            tenor_weeks: tenorWeeks,
            due_date: dueDate || undefined,
            source_order_id: sourceOrderId,
            notes,
            actor: 'admin'
        });

        if (result && result.success) {
            showAdminToast('Invoice PayLater berhasil dibuat.', 'success');
            resetCreditInvoiceForm();
            await fetchCreditInvoices();
            await fetchCreditAccounts();
            return;
        }
        showAdminToast(result && (result.message || result.error) ? String(result.message || result.error) : 'Gagal membuat invoice.', 'error');
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal membuat invoice.', 'error');
    }
}

async function payCreditInvoice(invoiceId, amount) {
    const paymentAmount = parseCurrencyValue(amount || 0);
    if (!invoiceId || paymentAmount <= 0) {
        showAdminToast('Nominal pembayaran tidak valid.', 'error');
        return;
    }
    const paymentRefId = `ADM-PAY-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    try {
        const result = await GASActions.payCreditInvoice({
            invoice_id: invoiceId,
            payment_amount: paymentAmount,
            payment_ref_id: paymentRefId,
            actor: 'admin'
        });
        if (result && result.success) {
            showAdminToast('Pembayaran invoice berhasil.', 'success');
            await fetchCreditInvoices();
            await fetchCreditAccounts();
            return;
        }
        showAdminToast(result && (result.message || result.error) ? String(result.message || result.error) : 'Gagal memproses pembayaran.', 'error');
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal memproses pembayaran.', 'error');
    }
}

async function applyCreditPenaltyAllOverdue() {
    if (!window.confirm('Terapkan penalty untuk semua invoice overdue saat ini?')) return;
    try {
        const result = await GASActions.applyCreditInvoicePenalty({
            apply_all_overdue: true,
            actor: 'admin'
        });
        if (result && result.success) {
            const processed = parseInt(result.processed || 0, 10) || 0;
            showAdminToast(`Penalty diproses untuk ${processed} invoice.`, 'success');
            await fetchCreditInvoices();
            await fetchCreditAccounts();
            return;
        }
        showAdminToast(result && (result.message || result.error) ? String(result.message || result.error) : 'Gagal menerapkan penalty.', 'error');
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal menerapkan penalty.', 'error');
    }
}

function renderRecentOrders(orders) {
    const tableBody = document.getElementById('recent-orders-list');
    if (!tableBody) return;

    if (!Array.isArray(orders) || orders.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="px-6 py-6 text-center text-gray-500">Belum ada pesanan.</td></tr>';
        return;
    }

    const sorted = [...orders].sort((a, b) => {
        const dateA = parseOrderDate(a.tanggal_pesanan || a.timestamp || a.tanggal || a.date) || new Date(0);
        const dateB = parseOrderDate(b.tanggal_pesanan || b.timestamp || b.tanggal || b.date) || new Date(0);
        return dateB - dateA;
    }).slice(0, 5);

    tableBody.innerHTML = sorted.map((order) => {
        const safeId = escapeHtml(order.id || '-');
        const safeCustomer = escapeHtml(order.pelanggan || order.customer || order.nama || '-');
        const statusText = escapeHtml(order.status || 'Menunggu');
        const statusClass = String(order.status || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const totalText = `Rp ${parseCurrencyValue(order.total || order.total_bayar || 0).toLocaleString('id-ID')}`;
        return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-6 py-4 text-xs font-bold text-blue-600" data-label="ID">${safeId}</td>
                <td class="px-6 py-4 text-sm text-gray-800" data-label="Pelanggan">${safeCustomer}</td>
                <td class="px-6 py-4" data-label="Status">
                    <span class="status-badge status-${statusClass}">${statusText}</span>
                </td>
                <td class="px-6 py-4 text-right font-bold text-gray-800" data-label="Total">${totalText}</td>
            </tr>
        `;
    }).join('');
}

function updateRevenueStats(orders) {
    const dailyEl = document.getElementById('stat-omzet-harian');
    const dailyHppEl = document.getElementById('stat-hpp-harian');
    const dailyProfitEl = document.getElementById('stat-profit-harian');
    const summaryOmzetEl = document.getElementById('summary-omzet-30d');
    const summaryHppEl = document.getElementById('summary-hpp-30d');
    const summaryProfitEl = document.getElementById('summary-profit-30d');
    const summaryMarginEl = document.getElementById('summary-margin-30d');
    const summaryCostEl = document.getElementById('summary-cost-30d');
    const summaryNetEl = document.getElementById('summary-net-30d');
    if (!dailyEl && !dailyHppEl && !summaryOmzetEl && !summaryHppEl) return;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOf30Days = new Date(startOfToday);
    startOf30Days.setDate(startOf30Days.getDate() - 29);

    let dailyTotal = 0;
    let dailyHpp = 0;
    let total30 = 0;
    let hpp30 = 0;

    orders.forEach((order) => {
        const orderDate = parseOrderDate(order.tanggal_pesanan || order.timestamp || order.tanggal || order.date);
        if (!orderDate) return;
        const amount = parseCurrencyValue(order.total || order.total_bayar || order.totalBayar || 0);
        const orderHpp = calculateOrderHpp(order);

        if (orderDate >= startOfToday) {
            dailyTotal += amount;
            dailyHpp += orderHpp;
        }
        if (orderDate >= startOf30Days) {
            total30 += amount;
            hpp30 += orderHpp;
        }
    });

    if (dailyEl) dailyEl.innerText = `Rp ${dailyTotal.toLocaleString('id-ID')}`;
    if (dailyHppEl) dailyHppEl.innerText = `Rp ${Math.round(dailyHpp).toLocaleString('id-ID')}`;
    if (dailyProfitEl) dailyProfitEl.innerText = `Rp ${Math.round(dailyTotal - dailyHpp).toLocaleString('id-ID')}`;
    const monthlyCost = calculateMonthlyCostTotal();

    if (summaryOmzetEl) summaryOmzetEl.innerText = `Rp ${total30.toLocaleString('id-ID')}`;
    if (summaryHppEl) summaryHppEl.innerText = `Rp ${Math.round(hpp30).toLocaleString('id-ID')}`;
    if (summaryProfitEl) summaryProfitEl.innerText = `Rp ${Math.round(total30 - hpp30).toLocaleString('id-ID')}`;
    if (summaryCostEl) summaryCostEl.innerText = `Rp ${Math.round(monthlyCost).toLocaleString('id-ID')}`;
    if (summaryNetEl) summaryNetEl.innerText = `Rp ${Math.round((total30 - hpp30) - monthlyCost).toLocaleString('id-ID')}`;
    if (summaryMarginEl) {
        const margin = total30 > 0 ? ((total30 - hpp30) / total30) * 100 : 0;
        summaryMarginEl.innerText = `${margin.toFixed(1)}%`;
    }
}

function parseOrderDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    if (typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const str = String(value).trim();
    if (!str) return null;

    const byDate = new Date(str);
    if (!Number.isNaN(byDate.getTime())) return byDate;

    if (str.includes('/')) {
        const parts = str.split('/').map((p) => p.trim());
        if (parts.length >= 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);
            if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
                return new Date(year, month - 1, day);
            }
        }
    }

    return null;
}

function parseCurrencyValue(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function calculateMonthlyCostTotal() {
    if (!Array.isArray(allMonthlyCosts)) return 0;
    return allMonthlyCosts.reduce((sum, cost) => {
        const active = String(cost.aktif || cost.status || 'Ya').toLowerCase();
        if (active !== 'ya' && active !== 'aktif') return sum;
        const amount = parseCurrencyValue(cost.nominal || cost.amount || 0);
        return sum + amount;
    }, 0);
}

// ============ BUNDLE BUILDER FUNCTIONS ============
function getBundleRules() {
    if (CONFIG.getBundleDiscountConfig) {
        return CONFIG.getBundleDiscountConfig();
    }
    return { rule34: 5, rule56: 8, rule7plus: 10 };
}

function recommendBundleDiscount(itemCount) {
    const rules = getBundleRules();
    if (itemCount >= 7) return rules.rule7plus;
    if (itemCount >= 5) return rules.rule56;
    if (itemCount >= 3) return rules.rule34;
    return 0;
}

function ensureBundleBuilderReady() {
    const itemsContainer = document.getElementById('bundle-items');
    if (!itemsContainer) return;
    if (itemsContainer.children.length === 0) {
        addBundleItemRow();
        addBundleItemRow();
    }
    updateBundleCategoryDropdown();
    updateBundleTotals();
}

function addBundleItemRow() {
    const container = document.getElementById('bundle-items');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'grid grid-cols-1 md:grid-cols-3 gap-3 items-center bundle-item-row';
    row.innerHTML = `
        <div>
            <select class="bundle-item-product w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100">
                <option value="">-- Pilih Produk --</option>
                ${allProducts.map(p => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.nama)}</option>`).join('')}
            </select>
        </div>
        <div>
            <input type="number" min="1" step="1" value="1" class="bundle-item-qty w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100">
        </div>
        <div class="flex items-center gap-2">
            <span class="bundle-item-subtotal text-sm text-gray-600 flex-1">Rp 0</span>
            <button type="button" data-action="remove-bundle-item" class="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-2 rounded-lg text-sm font-bold transition">
                Hapus
            </button>
        </div>
    `;
    container.appendChild(row);
}

function refreshBundleItemOptions() {
    const selects = document.querySelectorAll('.bundle-item-product');
    if (!selects.length) return;
    const optionsHtml = '<option value="">-- Pilih Produk --</option>' +
        allProducts.map(p => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.nama)}</option>`).join('');
    selects.forEach(select => {
        const currentVal = select.value;
        select.innerHTML = optionsHtml;
        select.value = currentVal;
    });
}

function removeBundleItemRow(button) {
    const row = button.closest('.bundle-item-row');
    if (row) row.remove();
    updateBundleTotals();
}

function updateBundleTotals() {
    const rows = Array.from(document.querySelectorAll('.bundle-item-row'));
    let total = 0;
    let itemCount = 0;
    const itemsDesc = [];

    rows.forEach(row => {
        const productId = row.querySelector('.bundle-item-product')?.value;
        const qty = parseInt(row.querySelector('.bundle-item-qty')?.value || '0', 10);
        const product = allProducts.find(p => String(p.id) === String(productId));
        const price = product ? parseCurrencyValue(product.harga) : 0;
        const itemTotal = price * (Number.isFinite(qty) ? qty : 0);
        total += itemTotal;
        if (product && qty > 0) {
            itemCount += 1;
            itemsDesc.push(`- ${product.nama} x${qty}`);
        }
        const subtotalEl = row.querySelector('.bundle-item-subtotal');
        if (subtotalEl) subtotalEl.textContent = `Rp ${Math.round(itemTotal).toLocaleString('id-ID')}`;
    });

    const totalEl = document.getElementById('bundle-total');
    if (totalEl) totalEl.value = `Rp ${Math.round(total).toLocaleString('id-ID')}`;

    const discountEl = document.getElementById('bundle-discount');
    if (discountEl && (discountEl.value === '' || discountEl.dataset.auto === 'true')) {
        const rec = recommendBundleDiscount(itemCount);
        discountEl.value = rec;
        discountEl.dataset.auto = 'true';
    }

    const discount = parseFloat(discountEl?.value || '0') || 0;
    const finalPrice = Math.max(0, total - (total * discount / 100));
    const finalEl = document.getElementById('bundle-final');
    if (finalEl) finalEl.value = `Rp ${Math.round(finalPrice).toLocaleString('id-ID')}`;

    const descEl = document.getElementById('bundle-description');
    if (descEl && !descEl.dataset.touched) {
        descEl.value = `Isi paket:\n${itemsDesc.join('\n')}`;
    }
}

function applyBundleRecommendation() {
    const rows = Array.from(document.querySelectorAll('.bundle-item-row'));
    const itemCount = rows.reduce((count, row) => {
        const productId = row.querySelector('.bundle-item-product')?.value;
        const qty = parseInt(row.querySelector('.bundle-item-qty')?.value || '0', 10);
        if (productId && qty > 0) return count + 1;
        return count;
    }, 0);
    const discountEl = document.getElementById('bundle-discount');
    if (discountEl) {
        discountEl.value = recommendBundleDiscount(itemCount);
        discountEl.dataset.auto = 'true';
    }
    updateBundleTotals();
}

function parseOrderItems(itemsText) {
    if (!itemsText) return [];
    return String(itemsText)
        .split('|')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            const match = part.match(/(.+)\(x\s*([0-9]+)\)/i);
            let name = match ? match[1].trim() : part;
            const qty = match ? parseInt(match[2], 10) : 1;
            name = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
            return { name, qty: Number.isFinite(qty) ? qty : 1 };
        });
}

function calculateOrderHpp(order) {
    const items = parseOrderItems(order.produk || '');
    if (items.length === 0) return 0;
    let totalHpp = 0;
    items.forEach(item => {
        const product = allProducts.find(p => String(p.nama).trim().toLowerCase() === String(item.name).trim().toLowerCase());
        if (!product) return;
        const stats = getPurchaseStats(product.id);
        if (stats.avgCost > 0) {
            totalHpp += stats.avgCost * item.qty;
        }
    });
    return totalHpp;
}

// ============ SUPPLIER FUNCTIONS ============
async function fetchSuppliers() {
    const tbody = document.getElementById('supplier-list-body');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500">Memuat data supplier...</td></tr>';
    }
    try {
        const response = await fetch(`${API_URL}?sheet=${SUPPLIERS_SHEET}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        allSuppliers = Array.isArray(data) ? data : [];
        renderSuppliersTable();
        updateSupplierDatalist();
    } catch (error) {
        console.error(error);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-red-500">Gagal memuat data supplier. Pastikan sheet "suppliers" sudah ada.</td></tr>';
        }
    }
}

function renderSuppliersTable() {
    const tbody = document.getElementById('supplier-list-body');
    if (!tbody) return;
    if (!Array.isArray(allSuppliers) || allSuppliers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500">Belum ada supplier.</td></tr>';
        return;
    }
    tbody.innerHTML = allSuppliers.map(s => {
        const safeName = escapeHtml(s.nama || s.name || '');
        const safePhone = escapeHtml(s.phone || s.kontak || '');
        const safeAddress = escapeHtml(s.alamat || s.address || '');
        const safeNotes = escapeHtml(s.catatan || s.notes || '');
        return `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4 text-sm font-bold text-gray-800">${safeName}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${safePhone}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${safeAddress}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${safeNotes}</td>
            <td class="px-6 py-4 text-right flex justify-end gap-2">
                <button data-action="edit-supplier" data-id="${escapeAttr(s.id)}" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button data-action="delete-supplier" data-id="${escapeAttr(s.id)}" class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

function resetSupplierForm() {
    const form = document.getElementById('supplier-form');
    if (form) form.reset();
    const idField = document.getElementById('form-supplier-id');
    if (idField) idField.value = '';
}

function openEditSupplier(id) {
    const supplier = allSuppliers.find(s => String(s.id) === String(id));
    if (!supplier) return;
    document.getElementById('form-supplier-id').value = supplier.id;
    document.getElementById('form-supplier-name').value = supplier.nama || supplier.name || '';
    document.getElementById('form-supplier-phone').value = supplier.phone || supplier.kontak || '';
    document.getElementById('form-supplier-address').value = supplier.alamat || supplier.address || '';
    document.getElementById('form-supplier-notes').value = supplier.catatan || supplier.notes || '';
}

async function handleDeleteSupplier(id) {
    if (!confirm('Hapus supplier ini?')) return;
    try {
        const result = await GASActions.delete(SUPPLIERS_SHEET, id);
        if (result.deleted > 0) {
            showAdminToast('Supplier berhasil dihapus!', 'success');
            fetchSuppliers();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal menghapus supplier.', 'error');
    }
}

const supplierForm = document.getElementById('supplier-form');
if (supplierForm) {
    supplierForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = supplierForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;
        submitBtn.disabled = true;
        submitBtn.innerText = 'Menyimpan...';

        const id = document.getElementById('form-supplier-id').value || Date.now().toString();
        const data = {
            id,
            nama: document.getElementById('form-supplier-name').value,
            phone: document.getElementById('form-supplier-phone').value,
            alamat: document.getElementById('form-supplier-address').value,
            catatan: document.getElementById('form-supplier-notes').value
        };

        try {
            const result = document.getElementById('form-supplier-id').value
                ? await GASActions.update(SUPPLIERS_SHEET, id, data)
                : await GASActions.create(SUPPLIERS_SHEET, data);
            if (result.affected > 0 || result.created > 0) {
                showAdminToast('Supplier berhasil disimpan!', 'success');
                resetSupplierForm();
                fetchSuppliers();
            }
        } catch (error) {
            console.error(error);
            showAdminToast('Gagal menyimpan supplier.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }
    });
}

// ============ MONTHLY COST FUNCTIONS ============
async function fetchMonthlyCosts() {
    const tbody = document.getElementById('monthly-cost-list-body');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500">Memuat data biaya...</td></tr>';
    }
    try {
        const response = await fetch(`${API_URL}?sheet=${MONTHLY_COST_SHEET}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        allMonthlyCosts = Array.isArray(data) ? data : [];
        renderMonthlyCostsTable();
        updateRevenueStats(allOrders || []);
    } catch (error) {
        console.error(error);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-red-500">Gagal memuat biaya. Pastikan sheet "biaya_bulanan" sudah ada.</td></tr>';
        }
    }
}

function renderMonthlyCostsTable() {
    const tbody = document.getElementById('monthly-cost-list-body');
    if (!tbody) return;
    if (!Array.isArray(allMonthlyCosts) || allMonthlyCosts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500">Belum ada biaya.</td></tr>';
        return;
    }
    tbody.innerHTML = allMonthlyCosts.map(c => {
        const safeName = escapeHtml(c.nama || c.name || '');
        const amount = parseCurrencyValue(c.nominal || c.amount || 0);
        const status = escapeHtml(c.aktif || c.status || 'Ya');
        const notes = escapeHtml(c.catatan || c.notes || '');
        return `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4 text-sm font-bold text-gray-800">${safeName}</td>
            <td class="px-6 py-4 text-sm text-gray-600">Rp ${Math.round(amount).toLocaleString('id-ID')}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${status}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${notes}</td>
            <td class="px-6 py-4 text-right flex justify-end gap-2">
                <button data-action="edit-cost" data-id="${escapeAttr(c.id)}" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button data-action="delete-cost" data-id="${escapeAttr(c.id)}" class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

function resetMonthlyCostForm() {
    const form = document.getElementById('monthly-cost-form');
    if (form) form.reset();
    const idField = document.getElementById('form-cost-id');
    if (idField) idField.value = '';
}

function openEditMonthlyCost(id) {
    const cost = allMonthlyCosts.find(c => String(c.id) === String(id));
    if (!cost) return;
    document.getElementById('form-cost-id').value = cost.id;
    document.getElementById('form-cost-name').value = cost.nama || cost.name || '';
    document.getElementById('form-cost-amount').value = parseCurrencyValue(cost.nominal || cost.amount || 0);
    document.getElementById('form-cost-active').value = cost.aktif || cost.status || 'Ya';
    document.getElementById('form-cost-notes').value = cost.catatan || cost.notes || '';
}

async function handleDeleteMonthlyCost(id) {
    if (!confirm('Hapus biaya ini?')) return;
    try {
        const result = await GASActions.delete(MONTHLY_COST_SHEET, id);
        if (result.deleted > 0) {
            showAdminToast('Biaya berhasil dihapus!', 'success');
            fetchMonthlyCosts();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal menghapus biaya.', 'error');
    }
}

const monthlyCostForm = document.getElementById('monthly-cost-form');
if (monthlyCostForm) {
    monthlyCostForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = monthlyCostForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;
        submitBtn.disabled = true;
        submitBtn.innerText = 'Menyimpan...';

        const id = document.getElementById('form-cost-id').value || Date.now().toString();
        const data = {
            id,
            nama: document.getElementById('form-cost-name').value,
            nominal: document.getElementById('form-cost-amount').value,
            aktif: document.getElementById('form-cost-active').value,
            catatan: document.getElementById('form-cost-notes').value
        };

        try {
            const result = document.getElementById('form-cost-id').value
                ? await GASActions.update(MONTHLY_COST_SHEET, id, data)
                : await GASActions.create(MONTHLY_COST_SHEET, data);
            if (result.affected > 0 || result.created > 0) {
                showAdminToast('Biaya berhasil disimpan!', 'success');
                resetMonthlyCostForm();
                fetchMonthlyCosts();
            }
        } catch (error) {
            console.error(error);
            showAdminToast('Gagal menyimpan biaya.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }
    });
}

// ============ BUNDLE FORM ============
const bundleForm = document.getElementById('bundle-form');
if (bundleForm) {
    bundleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = bundleForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;
        submitBtn.disabled = true;
        submitBtn.innerText = 'Menyimpan...';

        const rows = Array.from(document.querySelectorAll('.bundle-item-row'));
        const items = rows.map(row => {
            const productId = row.querySelector('.bundle-item-product')?.value;
            const qty = parseInt(row.querySelector('.bundle-item-qty')?.value || '0', 10);
            const product = allProducts.find(p => String(p.id) === String(productId));
            if (!product || !qty) return null;
            return { id: product.id, nama: product.nama, qty };
        }).filter(Boolean);

        if (items.length === 0) {
            showAdminToast('Tambahkan minimal 1 item paket.', 'warning');
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
            return;
        }

        const discountPercent = parseFloat(document.getElementById('bundle-discount')?.value || '0') || 0;
        const totalValue = items.reduce((sum, item) => {
            const product = allProducts.find(p => String(p.id) === String(item.id));
            const price = product ? parseCurrencyValue(product.harga) : 0;
            return sum + price * item.qty;
        }, 0);
        const finalValue = Math.max(0, totalValue - (totalValue * discountPercent / 100));

        const descriptionEl = document.getElementById('bundle-description');
        const description = descriptionEl?.value || `Isi paket:\n${items.map(i => `- ${i.nama} x${i.qty}`).join('\n')}`;

        const data = {
            id: Date.now().toString(),
            nama: document.getElementById('bundle-name').value,
            harga: Math.round(finalValue),
            harga_coret: Math.round(totalValue),
            gambar: document.getElementById('bundle-image').value,
            stok: document.getElementById('bundle-stock').value,
            kategori: document.getElementById('bundle-category').value,
            deskripsi: description,
            variasi: '',
            grosir: ''
        };

        try {
            const result = await GASActions.create(PRODUCTS_SHEET, data);
            if (result.created > 0) {
                showAdminToast('Paket berhasil dibuat!', 'success');
                bundleForm.reset();
                document.getElementById('bundle-description').dataset.touched = '';
                document.getElementById('bundle-items').innerHTML = '';
                ensureBundleBuilderReady();
                fetchAdminProducts();
            }
        } catch (error) {
            console.error(error);
            showAdminToast('Gagal membuat paket.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }
    });
}

// ============ ORDER FUNCTIONS ============
function getAdminGetToken() {
    // Keep token resolution consistent with GASActions to avoid GET/POST mismatch.
    if (typeof GASActions !== 'undefined' && typeof GASActions.getAdminToken === 'function') {
        const tokenFromGASActions = String(GASActions.getAdminToken() || '').trim();
        if (tokenFromGASActions) return tokenFromGASActions;
    }

    try {
        const currentUrl = new URL(window.location.href);
        const currentUrlToken = String(
            currentUrl.searchParams.get('token') ||
            currentUrl.searchParams.get('admin_token') ||
            currentUrl.searchParams.get('auth_token') ||
            ''
        ).trim();
        if (currentUrlToken) return currentUrlToken;
    } catch (error) {
        console.warn('Failed reading token from current page URL:', error);
    }

    try {
        const apiUrl = CONFIG.getAdminApiUrl();
        const parsed = new URL(apiUrl, window.location.origin);
        const tokenFromUrl = String(
            parsed.searchParams.get('token') ||
            parsed.searchParams.get('admin_token') ||
            parsed.searchParams.get('auth_token') ||
            ''
        ).trim();
        if (tokenFromUrl) return tokenFromUrl;
    } catch (error) {
        console.warn('Failed reading token from admin URL:', error);
    }

    const tokenKeys = [
        'sembako_admin_api_token',
        'sembako_admin_write_token',
        'sembako_admin_token',
        'admin_token',
        'api_token',
        'sembako_api_token',
        'gos_admin_token',
        'gos_api_token'
    ];
    for (let i = 0; i < tokenKeys.length; i += 1) {
        const token = String(localStorage.getItem(tokenKeys[i]) || '').trim();
        if (token) return token;
    }
    return '';
}

function buildAdminGetUrl(sheetName, extraParams) {
    const params = new URLSearchParams({ sheet: String(sheetName || '').trim() });
    const token = getAdminGetToken();
    if (token) params.set('token', token);
    if (extraParams && typeof extraParams === 'object') {
        Object.keys(extraParams).forEach((key) => {
            const value = extraParams[key];
            if (value === undefined || value === null || value === '') return;
            params.set(key, String(value));
        });
    }
    return `${API_URL}?${params.toString()}`;
}

async function fetchSheetRows(sheetName, extraParams) {
    const response = await fetch(buildAdminGetUrl(sheetName, extraParams));
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.error) {
        throw new Error(String(payload.message || payload.error));
    }
    return Array.isArray(payload) ? payload : [];
}

async function fetchOrders() {
    const tbody = document.getElementById('order-list-body');
    tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-10 text-center text-gray-500">Memuat data pesanan...</td></tr>';
    
    try {
        allOrders = await fetchSheetRows(ORDERS_SHEET);
        renderOrderTable();
        updateOrderStats();
    } catch (error) {
        console.error('Error:', error);
        tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-10 text-center text-red-500">Gagal memuat data pesanan: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
    }
}

function updateOrderStats() {
    const total = allOrders.length;
    const pending = allOrders.filter((o) => String(o.status || '').toLowerCase() === 'menunggu').length;
    const revenue = allOrders.reduce((acc, o) => acc + (parseInt(o.total) || 0), 0);
    const avg = total > 0 ? Math.round(revenue / total) : 0;

    document.getElementById('order-stat-total').innerText = total;
    document.getElementById('order-stat-pending').innerText = pending;
    document.getElementById('order-stat-revenue').innerText = `Rp ${revenue.toLocaleString('id-ID')}`;
    document.getElementById('order-stat-avg').innerText = `Rp ${avg.toLocaleString('id-ID')}`;
    document.getElementById('order-count-display').innerText = `(${total})`;
}

function filterOrders(status, target) {
    currentOrderFilter = status;
    currentOrderPage = 1;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-green-600', 'text-white');
        btn.classList.add('bg-gray-100', 'text-gray-600');
    });
    if (target) {
        target.classList.add('active', 'bg-green-600', 'text-white');
        target.classList.remove('bg-gray-100', 'text-gray-600');
    }
    renderOrderTable();
}

function renderOrderTable() {
    const tbody = document.getElementById('order-list-body');
    const pagination = document.getElementById('order-pagination-admin');
    const filtered = (currentOrderFilter === 'semua'
        ? allOrders
        : allOrders.filter(o => String(o.status || '').toLowerCase() === currentOrderFilter.toLowerCase()))
        .slice()
        .sort((a, b) => {
            const dateA = parseOrderDate(a.tanggal_pesanan || a.timestamp || a.tanggal || a.date) || new Date(0);
            const dateB = parseOrderDate(b.tanggal_pesanan || b.timestamp || b.tanggal || b.date) || new Date(0);
            return dateB - dateA;
        });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-10 text-center text-gray-500">Tidak ada pesanan.</td></tr>';
        if (pagination) pagination.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(filtered.length / ordersPerPage);
    const startIndex = (currentOrderPage - 1) * ordersPerPage;
    const endIndex = Math.min(startIndex + ordersPerPage, filtered.length);
    const visibleOrders = filtered.slice(startIndex, endIndex);

    tbody.innerHTML = visibleOrders.map(o => {
        const safeId = escapeHtml(o.id);
        const safeCustomer = escapeHtml(o.pelanggan);
        const safeProduct = escapeHtml(o.produk);
        const safeQty = escapeHtml(o.qty);
        const safeStatusText = escapeHtml(o.status);
        const safeStatusClass = String(o.status || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const safeDate = escapeHtml(o.tanggal || '');
        return `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4 font-bold text-blue-600 text-xs" data-label="ID Pesanan">${safeId}</td>
            <td class="px-6 py-4 text-sm text-gray-800 font-medium" data-label="Pelanggan">${safeCustomer}</td>
            <td class="px-6 py-4 text-sm text-gray-600" data-label="Produk">${safeProduct}</td>
            <td class="px-6 py-4 text-sm text-gray-600" data-label="Qty">${safeQty}</td>
            <td class="px-6 py-4 text-sm font-bold text-gray-800" data-label="Total">Rp ${parseInt(o.total).toLocaleString('id-ID')}</td>
            <td class="px-6 py-4" data-label="Status">
                <span class="status-badge status-${safeStatusClass}">${safeStatusText}</span>
            </td>
            <td class="px-6 py-4 text-xs text-gray-500" data-label="Tanggal">${safeDate}</td>
            <td class="px-6 py-4 text-right" data-label="Aksi">
                <select data-action="update-order-status" data-id="${escapeAttr(o.id)}" class="text-xs border rounded-lg p-1 outline-none focus:ring-1 focus:ring-green-500">
                    <option value="">Ubah Status</option>
                    <option value="Menunggu">Menunggu</option>
                    <option value="Diproses">Diproses</option>
                    <option value="Dikirim">Dikirim</option>
                    <option value="Terima">Terima</option>
                    <option value="Dibatalkan">Dibatalkan</option>
                </select>
            </td>
        </tr>
    `;
    }).join('');

    if (pagination) {
        pagination.innerHTML = renderOrderPagination(totalPages);
    }
}

function renderOrderPagination(totalPages) {
    if (totalPages <= 1) return '';
    let html = '<div class="flex flex-wrap justify-center items-center gap-2">';
    if (currentOrderPage > 1) {
        html += `<button data-action="order-page" data-page="${currentOrderPage - 1}" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold text-xs">← Prev</button>`;
    }

    const maxButtons = 5;
    let start = Math.max(1, currentOrderPage - 2);
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start < maxButtons - 1) {
        start = Math.max(1, end - maxButtons + 1);
    }

    for (let i = start; i <= end; i++) {
        if (i === currentOrderPage) {
            html += `<button class="px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-xs">${i}</button>`;
        } else {
            html += `<button data-action="order-page" data-page="${i}" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-bold text-xs">${i}</button>`;
        }
    }

    if (currentOrderPage < totalPages) {
        html += `<button data-action="order-page" data-page="${currentOrderPage + 1}" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold text-xs">Next →</button>`;
    }
    html += '</div>';
    return html;
}

function normalizePhone(phone) {
    if (!phone) return '';
    let p = phone.toString().replace(/[^0-9]/g, '');
    if (p.startsWith('62')) p = '0' + p.slice(2);
    else if (p.startsWith('8')) p = '0' + p;
    else if (!p.startsWith('0')) p = '0' + p;
    return p;
}


async function updateOrderStatus(id, newStatus, selectElement) {
    if (!newStatus) return;
    if (!selectElement) return;
    selectElement.disabled = true;

    try {
        const order = allOrders.find(o => o.id === id);
        if (!order) {
            showAdminToast('Pesanan tidak ditemukan!', 'error');
            selectElement.disabled = false;
            return;
        }

        const result = await GASActions.update(ORDERS_SHEET, id, { status: newStatus });
        
        if (result.affected > 0) {
            const normalizedStatus = String(newStatus || '').toLowerCase();
            const referralLifecycleStatuses = ['paid', 'selesai', 'batal', 'dibatalkan', 'cancel', 'canceled', 'cancelled', 'void'];
            const shouldSyncReferral = referralLifecycleStatuses.includes(normalizedStatus);

            if (shouldSyncReferral && order.phone) {
                try {
                    const syncResult = await GASActions.post({
                        action: 'sync_referral_order_status',
                        sheet: 'referrals',
                        data: {
                            order_id: order.id,
                            order_status: newStatus,
                            order_total: parseCurrencyValue(order.total || order.total_bayar || 0),
                            buyer_phone: normalizePhone(order.phone || '')
                        }
                    });

                    if (syncResult && syncResult.success && syncResult.action === 'reversed') {
                        showAdminToast(`Referral direversal: ${syncResult.referral_id || order.id}`, 'warning');
                    } else if (syncResult && syncResult.success && (syncResult.referral_id || syncResult.action === 'approved')) {
                        showAdminToast(`Referral diproses: ${syncResult.referral_id || order.id}`, 'success');
                    }
                } catch (referralError) {
                    console.warn('Referral lifecycle sync failed:', referralError);
                }
            }

            if (newStatus === 'Terima' && order.point_processed !== 'Yes') {
                if (order.phone && order.poin) {
                    const pointsToAdd = parseFloat(order.poin) || 0;
                    const phone = normalizePhone(order.phone);
                    
                    const userRes = await fetch(`${API_URL}?sheet=user_points`);
                    const allUsers = await userRes.json();
                    const userData = Array.isArray(allUsers) ? allUsers.filter(u => normalizePhone(u.phone) === phone) : [];
                    
                    let pointUpdateSuccess = false;
                    if (Array.isArray(userData) && userData.length > 0) {
                        const currentPoints = parseFloat(userData[0].points) || 0;
                        const updateRes = await GASActions.update('user_points', userData[0].id, { 
                            points: currentPoints + pointsToAdd,
                            last_updated: new Date().toLocaleString('id-ID')
                        });
                        if (updateRes.affected > 0) pointUpdateSuccess = true;
                    } else {
                        const createRes = await GASActions.create('user_points', { 
                            id: Date.now().toString(),
                            phone: phone,
                            points: pointsToAdd,
                            last_updated: new Date().toLocaleString('id-ID')
                        });
                        if (createRes.created > 0) pointUpdateSuccess = true;
                    }

                    if (pointUpdateSuccess) {
                        await GASActions.update(ORDERS_SHEET, id, { point_processed: 'Yes' });
                        

                        
                        showAdminToast(`Status diperbarui & +${pointsToAdd} poin diberikan ke ${phone}`, 'success');
                    } else {
                        showAdminToast('Status diperbarui, tapi gagal update poin.', 'warning');
                    }
                }
            } else {
                showAdminToast('Status pesanan diperbarui!', 'success');
            }

            const orderIndex = allOrders.findIndex(o => o.id === id);
            if (orderIndex !== -1) {
                allOrders[orderIndex].status = newStatus;
                if (newStatus === 'Terima') allOrders[orderIndex].point_processed = 'Yes';
                renderOrderTable();
                updateOrderStats();
            }
        } else {
            showAdminToast('Gagal memperbarui status di database.', 'error');
        }
    } catch (e) {
        console.error(e);
        showAdminToast('Terjadi kesalahan saat memperbarui status.', 'error');
    } finally {
        selectElement.disabled = false;
    }
}

// ============ CATEGORY FUNCTIONS ============
async function fetchCategories() {
    try {
        const response = await fetch(`${API_URL}?sheet=${CATEGORIES_SHEET}`);
        allCategories = await response.json();
        renderCategoryTable();
        updateCategoryDropdown();
        const bundleSection = document.getElementById('section-bundle');
        if (bundleSection && !bundleSection.classList.contains('hidden')) {
            ensureBundleBuilderReady();
        }
    } catch (error) { console.error(error); }
}

function renderCategoryTable() {
    const tbody = document.getElementById('category-list-body');
    if (allCategories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="px-6 py-10 text-center text-gray-500">Belum ada kategori.</td></tr>';
        return;
    }
    tbody.innerHTML = allCategories.map(c => {
        const safeName = escapeHtml(c.nama);
        const safeDesc = escapeHtml(c.deskripsi || '-');
        return `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4 font-bold text-gray-800 text-sm" data-label="Nama Kategori">${safeName}</td>
            <td class="px-6 py-4 text-sm text-gray-600" data-label="Deskripsi">${safeDesc}</td>
            <td class="px-6 py-4 text-right flex justify-end gap-2" data-label="Aksi">
                <button data-action="edit-category" data-id="${escapeAttr(c.id)}" data-name="${escapeAttr(c.nama)}" data-description="${escapeAttr(c.deskripsi || '')}" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button data-action="delete-category" data-id="${escapeAttr(c.id)}" class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        </tr>
    `;
    }).join('');
    document.getElementById('category-count').innerText = `(${allCategories.length})`;
}

function openEditCategory(id, nama, deskripsi) {
    const newNama = prompt('Nama Kategori:', nama);
    if (newNama === null) return;
    const newDeskripsi = prompt('Deskripsi:', deskripsi);
    if (newDeskripsi === null) return;
    handleEditCategory(id, newNama, newDeskripsi);
}

async function handleEditCategory(id, nama, deskripsi) {
    try {
        const result = await GASActions.update(CATEGORIES_SHEET, id, { nama, deskripsi });
        if (result.affected > 0) {
            showAdminToast('Kategori berhasil diperbarui!', 'success');
            fetchCategories();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal memperbarui kategori.', 'error');
    }
}

async function handleDeleteCategory(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus kategori ini?')) return;
    try {
        const result = await GASActions.delete(CATEGORIES_SHEET, id);
        if (result.deleted > 0) {
            showAdminToast('Kategori berhasil dihapus!', 'success');
            fetchCategories();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal menghapus kategori.', 'error');
    }
}

function updateCategoryDropdown() {
    const select = document.getElementById('form-category');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Pilih Kategori --</option>' + 
        allCategories.map(c => {
            const safeName = escapeHtml(c.nama);
            return `<option value="${safeName}">${safeName}</option>`;
        }).join('');
    select.value = currentVal;
    updateBundleCategoryDropdown();
}

function updateBundleCategoryDropdown() {
    const select = document.getElementById('bundle-category');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Pilih Kategori --</option>' +
        allCategories.map(c => {
            const safeName = escapeHtml(c.nama);
            return `<option value="${safeName}">${safeName}</option>`;
        }).join('');
    select.value = currentVal;
}

function updatePurchaseProductDropdown() {
    const select = document.getElementById('form-purchase-product');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Pilih Produk --</option>' +
        allProducts.map(p => {
            const safeName = escapeHtml(p.nama);
            return `<option value="${escapeAttr(p.id)}">${safeName}</option>`;
        }).join('');
    select.value = currentVal;
}

function updateSupplierDatalist() {
    const list = document.getElementById('supplier-list');
    if (!list) return;
    list.innerHTML = allSuppliers.map(s => {
        const safeName = escapeHtml(s.nama || s.name || '');
        return `<option value="${safeName}"></option>`;
    }).join('');
}

function getPurchaseStats(productId) {
    if (!productId) return { avgCost: 0, lastCost: 0, totalQty: 0 };
    const idStr = String(productId);
    const purchases = allPurchases.filter(p => String(p.product_id || p.productId || p.id_produk || '') === idStr);
    let totalQty = 0;
    let totalCost = 0;
    let lastCost = 0;
    let lastDate = new Date(0);
    purchases.forEach(p => {
        const qty = parseFloat(p.qty || p.jumlah || p.quantity || 0);
        const cost = parseCurrencyValue(p.harga_modal || p.modal || p.cost || p.harga || 0);
        if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost <= 0) return;
        totalQty += qty;
        totalCost += qty * cost;
        const dt = parseOrderDate(p.tanggal || p.date || p.created_at || p.timestamp) || new Date(0);
        if (dt > lastDate) {
            lastDate = dt;
            lastCost = cost;
        }
    });
    const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
    return { avgCost, lastCost, totalQty };
}

// ============ PRODUCT FUNCTIONS ============
async function fetchAdminProducts() {
    const tbody = document.getElementById('admin-product-list');
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500">Memuat data...</td></tr>';
    try {
        const [productsRes, purchasesRes, suppliersRes] = await Promise.all([
            fetch(`${API_URL}?sheet=${PRODUCTS_SHEET}`),
            fetch(`${API_URL}?sheet=${PURCHASES_SHEET}`),
            fetch(`${API_URL}?sheet=${SUPPLIERS_SHEET}`)
        ]);
        allProducts = await productsRes.json();
        if (purchasesRes.ok) {
            const purchasesData = await purchasesRes.json();
            allPurchases = Array.isArray(purchasesData) ? purchasesData : [];
        } else {
            allPurchases = [];
        }
        if (suppliersRes.ok) {
            const suppliersData = await suppliersRes.json();
            allSuppliers = Array.isArray(suppliersData) ? suppliersData : [];
        } else {
            allSuppliers = [];
        }
        renderAdminTable();
        updatePurchaseProductDropdown();
        updateSupplierDatalist();
        refreshBundleItemOptions();
        if (document.getElementById('section-pembelian') && !document.getElementById('section-pembelian').classList.contains('hidden')) {
            renderPurchaseTable();
        }
        const bundleSection = document.getElementById('section-bundle');
        if (bundleSection && !bundleSection.classList.contains('hidden')) {
            ensureBundleBuilderReady();
        }
        updateDashboardStats();
    } catch (error) { console.error(error); }
}

function renderAdminTable() {
    const tbody = document.getElementById('admin-product-list');
    if (allProducts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500">Belum ada produk.</td></tr>';
        return;
    }
    tbody.innerHTML = allProducts.map(p => {
        const safeName = escapeHtml(p.nama);
        const safeCategory = escapeHtml(p.kategori || '-');
        const safeStock = escapeHtml(p.stok);
        const imageUrl = p.gambar ? p.gambar.split(',')[0] : 'https://via.placeholder.com/50';
        const safeImage = sanitizeUrl(imageUrl, 'https://via.placeholder.com/50');
        const priceValue = parseCurrencyValue(p.harga);
        const costStats = getPurchaseStats(p.id);
        const avgCost = costStats.avgCost;
        const lastCost = costStats.lastCost;
        const marginValue = avgCost > 0 ? priceValue - avgCost : 0;
        const marginPercent = avgCost > 0 ? (marginValue / avgCost) * 100 : 0;
        const marginThreshold = CONFIG.getMarginAlertThreshold ? CONFIG.getMarginAlertThreshold() : 10;
        const isLowMargin = avgCost > 0 && marginPercent < marginThreshold;
        return `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4" data-label="Produk">
                <div class="flex items-center gap-3">
                    <img src="${safeImage}" class="w-10 h-10 object-cover rounded-lg bg-gray-100" alt="${safeName}">
                    <span class="font-bold text-gray-800 text-sm">${safeName}</span>
                </div>
            </td>
            <td class="px-6 py-4" data-label="Kategori">
                <span class="px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-[10px] font-bold uppercase">${safeCategory}</span>
            </td>
            <td class="px-6 py-4" data-label="Harga">
                <div class="flex flex-col">
                    ${p.harga_coret ? `<span class="text-[10px] text-gray-400 line-through">Rp ${parseInt(p.harga_coret).toLocaleString('id-ID')}</span>` : ''}
                    <span class="font-bold text-green-700 text-sm">Rp ${parseInt(p.harga).toLocaleString('id-ID')}</span>
                    ${avgCost > 0 ? `<span class="text-[10px] text-gray-500">Modal avg: Rp ${Math.round(avgCost).toLocaleString('id-ID')}</span>` : '<span class="text-[10px] text-gray-400">Modal avg: -</span>'}
                    ${lastCost > 0 ? `<span class="text-[10px] text-gray-500">Modal last: Rp ${Math.round(lastCost).toLocaleString('id-ID')}</span>` : '<span class="text-[10px] text-gray-400">Modal last: -</span>'}
                    ${avgCost > 0 ? `<span class="text-[10px] ${isLowMargin ? 'text-red-600 font-bold' : 'text-green-600'}">Margin: Rp ${Math.round(marginValue).toLocaleString('id-ID')} (${marginPercent.toFixed(1)}%)</span>` : ''}
                    ${isLowMargin ? `<span class="text-[10px] text-red-500 font-bold">Margin Rendah</span>` : ''}
                </div>
            </td>
            <td class="px-6 py-4" data-label="Stok">
                <span class="text-sm ${parseInt(p.stok) <= 5 ? 'text-red-600 font-bold' : 'text-gray-600'}">${safeStock}</span>
            </td>
            <td class="px-6 py-4 text-right flex justify-end gap-2" data-label="Aksi">
                <button data-action="edit-product" data-id="${escapeAttr(p.id)}" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button data-action="delete-product" data-id="${escapeAttr(p.id)}" class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        </tr>
    `;
    }).join('');
}

function openAddModal() {
    document.getElementById('modal-title').innerText = 'Tambah Produk';
    document.getElementById('product-id').value = '';
    document.getElementById('product-form').reset();
    document.getElementById('variants-container').innerHTML = '';
    document.getElementById('product-modal').classList.remove('hidden');
}

function openEditModal(id) {
    const p = allProducts.find(prod => prod.id == id);
    if (!p) return;

    document.getElementById('modal-title').innerText = 'Edit Produk';
    document.getElementById('product-id').value = p.id;
    document.getElementById('form-nama').value = p.nama;
    document.getElementById('form-harga').value = p.harga;
    document.getElementById('form-harga-coret').value = p.harga_coret || '';
    document.getElementById('form-stok').value = p.stok;
    document.getElementById('form-category').value = p.kategori || '';
    document.getElementById('form-deskripsi').value = p.deskripsi || '';
    
    const images = p.gambar ? p.gambar.split(',') : [];
    document.getElementById('form-gambar-1').value = images[0] || '';
    document.getElementById('form-gambar-2').value = images[1] || '';
    document.getElementById('form-gambar-3').value = images[2] || '';

    // Load variants
    loadVariants(p.variasi);

    document.getElementById('product-modal').classList.remove('hidden');
}

function closeModal() { document.getElementById('product-modal').classList.add('hidden'); }

document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    const submitBtn = document.getElementById('submit-btn');
    const originalText = submitBtn.innerText;
    
    submitBtn.disabled = true;
    submitBtn.innerText = 'Menyimpan...';

    const images = [
        document.getElementById('form-gambar-1').value,
        document.getElementById('form-gambar-2').value,
        document.getElementById('form-gambar-3').value
    ].filter(url => url.trim() !== '').join(',');

    const variantsData = collectVariants();
    const variantsJson = variantsData.length > 0 ? JSON.stringify(variantsData) : '';

    const data = {
        nama: document.getElementById('form-nama').value,
        harga: document.getElementById('form-harga').value,
        harga_coret: document.getElementById('form-harga-coret').value,
        stok: document.getElementById('form-stok').value,
        kategori: document.getElementById('form-category').value,
        deskripsi: document.getElementById('form-deskripsi').value,
        gambar: images,
        variasi: variantsJson
    };

    try {
        const action = id ? 'update' : 'create';
        const productId = id || Date.now().toString();
        
        let result;
        if (id) {
            result = await GASActions.update(PRODUCTS_SHEET, productId, data);
        } else {
            result = await GASActions.create(PRODUCTS_SHEET, { ...data, id: productId });
        }
        if (result.affected > 0 || result.created > 0) {
            showAdminToast(id ? 'Produk berhasil diperbarui!' : 'Produk berhasil ditambahkan!', 'success');
            closeModal();
            fetchAdminProducts();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Terjadi kesalahan saat menyimpan data.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
    }
});

async function handleDelete(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus produk ini?')) return;
    try {
        const result = await GASActions.delete(PRODUCTS_SHEET, id);
        if (result.deleted > 0) {
            showAdminToast('Produk berhasil dihapus!', 'success');
            fetchAdminProducts();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal menghapus produk.', 'error');
    }
}

// ============ PURCHASE FUNCTIONS ============
async function fetchPurchases() {
    const tbody = document.getElementById('purchase-list-body');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-gray-500">Memuat data pembelian...</td></tr>';
    }
    try {
        const response = await fetch(`${API_URL}?sheet=${PURCHASES_SHEET}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        allPurchases = Array.isArray(data) ? data : [];
        renderPurchaseTable();
        renderAdminTable();
    } catch (error) {
        console.error(error);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-red-500">Gagal memuat data pembelian. Pastikan sheet "pembelian" sudah ada dan GAS mengizinkan sheet tersebut.</td></tr>';
        }
    }
}

function renderPurchaseTable() {
    const tbody = document.getElementById('purchase-list-body');
    if (!tbody) return;
    if (!Array.isArray(allPurchases) || allPurchases.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-gray-500">Belum ada data pembelian.</td></tr>';
        return;
    }
    const sorted = [...allPurchases].sort((a, b) => {
        const dateA = parseOrderDate(a.tanggal || a.date || a.created_at || a.timestamp) || new Date(0);
        const dateB = parseOrderDate(b.tanggal || b.date || b.created_at || b.timestamp) || new Date(0);
        return dateB - dateA;
    });
    tbody.innerHTML = sorted.map(p => {
        const productId = p.product_id || p.productId || p.id_produk || '';
        const product = allProducts.find(prod => String(prod.id) === String(productId));
        const productName = escapeHtml(p.product_nama || (product && product.nama) || '-');
        const supplier = escapeHtml(p.supplier || '-');
        const qty = parseFloat(p.qty || p.jumlah || p.quantity || 0);
        const cost = parseCurrencyValue(p.harga_modal || p.modal || p.cost || 0);
        const total = qty * cost;
        const date = parseOrderDate(p.tanggal || p.date || p.created_at || p.timestamp);
        const dateLabel = date ? date.toLocaleDateString('id-ID') : '-';
        return `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4 text-sm text-gray-600">${escapeHtml(dateLabel)}</td>
            <td class="px-6 py-4 text-sm font-bold text-gray-800">${productName}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${supplier}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${Number.isFinite(qty) ? qty : '-'}</td>
            <td class="px-6 py-4 text-sm text-gray-600">Rp ${Math.round(cost || 0).toLocaleString('id-ID')}</td>
            <td class="px-6 py-4 text-sm text-gray-700 font-bold">Rp ${Math.round(total || 0).toLocaleString('id-ID')}</td>
            <td class="px-6 py-4 text-right">
                <button data-action="delete-purchase" data-id="${escapeAttr(p.id)}" class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

async function handleDeletePurchase(id) {
    if (!confirm('Hapus data pembelian ini?')) return;
    try {
        const result = await GASActions.delete(PURCHASES_SHEET, id);
        if (result.deleted > 0) {
            showAdminToast('Pembelian berhasil dihapus!', 'success');
            fetchPurchases();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal menghapus pembelian.', 'error');
    }
}

const purchaseForm = document.getElementById('purchase-form');
if (purchaseForm) {
    purchaseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = purchaseForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;
        submitBtn.disabled = true;
        submitBtn.innerText = 'Menyimpan...';

        const productId = document.getElementById('form-purchase-product').value;
        const product = allProducts.find(p => String(p.id) === String(productId));
        const data = {
            id: Date.now().toString(),
            product_id: productId,
            product_nama: product ? product.nama : '',
            supplier: document.getElementById('form-purchase-supplier').value,
            qty: document.getElementById('form-purchase-qty').value,
            harga_modal: document.getElementById('form-purchase-cost').value,
            tanggal: document.getElementById('form-purchase-date').value || new Date().toISOString().slice(0, 10)
        };

        try {
            const result = await GASActions.create(PURCHASES_SHEET, data);
            if (result.created > 0) {
                showAdminToast('Pembelian berhasil disimpan!', 'success');
                purchaseForm.reset();
                fetchPurchases();
            }
        } catch (error) {
            console.error(error);
            const msg = String(error && error.message ? error.message : error);
            if (msg.includes('Invalid sheet')) {
                showAdminToast('Sheet "pembelian" belum diizinkan di GAS. Tambahkan "pembelian" ke daftar sheet yang diizinkan.', 'warning');
            } else {
                showAdminToast('Gagal menyimpan pembelian.', 'error');
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }
    });
}

document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = document.getElementById('form-category-nama').value;
    const deskripsi = document.getElementById('form-category-deskripsi').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Menyimpan...';

    try {
        const result = await GASActions.create(CATEGORIES_SHEET, { id: Date.now().toString(), nama, deskripsi });
        if (result.created > 0) {
            showAdminToast('Kategori berhasil ditambahkan!', 'success');
            e.target.reset();
            fetchCategories();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Terjadi kesalahan saat menyimpan data.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
});

// ============ TUKAR POIN FUNCTIONS ============
async function ensureProductsLoadedForTukarPoinSelector() {
    if (Array.isArray(allProducts) && allProducts.length > 0) {
        return allProducts;
    }
    try {
        const response = await fetch(`${API_URL}?sheet=${PRODUCTS_SHEET}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        allProducts = Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Gagal memuat products untuk dropdown reward:', error);
        allProducts = [];
    }
    return allProducts;
}

function getProductRecordId(product) {
    if (!product) return '';
    return String(
        product.id ||
        product.product_id ||
        product.productId ||
        ''
    ).trim();
}

function findProductByRecordId(productId) {
    const target = String(productId || '').trim();
    if (!target) return null;
    return allProducts.find((p) => getProductRecordId(p) === target) || null;
}

function resolveTukarPoinTitle(row) {
    if (!row) return '';
    const directTitle = String(row.judul || row.nama || '').trim();
    if (directTitle) return directTitle;
    const fallbackName = String(row.product_name || row.nama_produk || '').trim();
    if (fallbackName) return fallbackName;
    const linkedProductId = String(row.product_id || row.productId || '').trim();
    if (!linkedProductId) return '';
    const linkedProduct = findProductByRecordId(linkedProductId);
    if (linkedProduct) return String(linkedProduct.nama || linkedProduct.name || '').trim();
    // Legacy fallback: some old rows stored product name in description.
    return String(row.deskripsi || '').trim();
}

function guessExistingProductIdFromReward(rewardRow) {
    if (!rewardRow) return '';
    const productId = String(rewardRow.product_id || rewardRow.productId || '').trim();
    if (productId) return productId;
    const rewardTitle = resolveTukarPoinTitle(rewardRow).toLowerCase();
    if (!rewardTitle) return '';
    const matched = allProducts.find((p) => String(p.nama || '').trim().toLowerCase() === rewardTitle);
    return matched ? getProductRecordId(matched) : '';
}

async function populateTukarPoinExistingProductOptions(selectedId) {
    const selectEl = document.getElementById('form-tukar-existing-product');
    if (!selectEl) return;
    await ensureProductsLoadedForTukarPoinSelector();
    const options = [
        '<option value="">-- Pilih Produk --</option>',
        ...allProducts.map((p) => `<option value="${escapeAttr(getProductRecordId(p))}">${escapeHtml(p.nama || 'Tanpa Nama')}</option>`)
    ];
    selectEl.innerHTML = options.join('');
    if (selectedId) {
        selectEl.value = String(selectedId);
    }
}

function applyExistingProductToTukarPoinForm(productId) {
    if (!productId) return;
    const product = findProductByRecordId(productId);
    if (!product) return;

    const titleEl = document.getElementById('form-tukar-judul');
    const imageEl = document.getElementById('form-tukar-gambar');
    const descEl = document.getElementById('form-tukar-deskripsi');

    if (titleEl) titleEl.value = String(product.nama || product.name || '').trim();
    if (imageEl) imageEl.value = String(product.gambar || '').split(',')[0].trim();
    if (descEl) descEl.value = String(product.deskripsi || '').trim();
}

async function fetchTukarPoin() {
    const tbody = document.getElementById('tukar-poin-list');
    tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500">Memuat data tukar poin...</td></tr>';
    try {
        const response = await fetch(`${API_URL}?sheet=${TUKAR_POIN_SHEET}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        allTukarPoin = await response.json();
        if (!Array.isArray(allTukarPoin)) allTukarPoin = [];
        await ensureProductsLoadedForTukarPoinSelector();
        renderTukarPoinTable();
    } catch (error) {
        console.error('Error:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-red-500">Gagal memuat data tukar poin. Pastikan sheet "tukar_poin" sudah ada.</td></tr>';
    }
}

function renderTukarPoinTable() {
    const tbody = document.getElementById('tukar-poin-list');
    if (allTukarPoin.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500">Belum ada produk tukar poin.</td></tr>';
        return;
    }
    tbody.innerHTML = allTukarPoin.map(p => {
        const safeTitle = escapeHtml(resolveTukarPoinTitle(p) || '(Tanpa nama produk)');
        const safeDesc = escapeHtml(p.deskripsi || '-');
        const safePoints = escapeHtml(p.poin);
        const safeImage = sanitizeUrl(p.gambar, 'https://via.placeholder.com/50');
        const rewardStock = Math.max(0, parseInt(p.reward_stock, 10) || 0);
        const dailyQuota = Math.max(0, parseInt(p.daily_quota, 10) || 0);
        const quotaText = dailyQuota > 0 ? `${dailyQuota}/hari` : 'Tanpa batas';
        const stockTone = rewardStock > 0 ? 'text-emerald-700' : 'text-red-600';
        return `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4" data-label="Produk">
                <div class="flex items-center gap-3">
                    <img src="${safeImage}" class="w-10 h-10 object-cover rounded-lg bg-gray-100" alt="${safeTitle}">
                    <span class="font-bold text-gray-800 text-sm">${safeTitle}</span>
                </div>
            </td>
            <td class="px-6 py-4 font-bold text-amber-600 text-sm" data-label="Poin">${safePoints} Poin</td>
            <td class="px-6 py-4 text-sm font-bold ${stockTone}" data-label="Stok Reward">${rewardStock}</td>
            <td class="px-6 py-4 text-sm text-gray-700" data-label="Quota Harian">${quotaText}</td>
            <td class="px-6 py-4 text-sm text-gray-600" data-label="Deskripsi">${safeDesc}</td>
            <td class="px-6 py-4 text-right flex justify-end gap-2" data-label="Aksi">
                <button data-action="edit-tukar-poin" data-id="${escapeAttr(p.id)}" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Edit">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button data-action="delete-tukar-poin" data-id="${escapeAttr(p.id)}" class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition" title="Hapus">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        </tr>
    `;
    }).join('');
}

async function openAddTukarPoinModal() {
    document.getElementById('tukar-poin-id').value = '';
    document.getElementById('tukar-poin-form').reset();
    await populateTukarPoinExistingProductOptions('');
    document.getElementById('form-tukar-reward-stock').value = '0';
    document.getElementById('form-tukar-daily-quota').value = '0';
    document.getElementById('tukar-poin-modal-title').innerText = 'Tambah Produk Tukar Poin';
    document.getElementById('tukar-poin-submit-btn').innerText = 'Simpan';
    document.getElementById('tukar-poin-modal').classList.remove('hidden');
}

async function openEditTukarPoinModal(id) {
    const product = allTukarPoin.find(p => p.id === id);
    if (!product) {
        showAdminToast('Produk tidak ditemukan!', 'error');
        return;
    }
    
    document.getElementById('tukar-poin-id').value = product.id;
    const linkedProductId = guessExistingProductIdFromReward(product);
    const resolvedTitle = resolveTukarPoinTitle(product);
    document.getElementById('form-tukar-judul').value = resolvedTitle;
    document.getElementById('form-tukar-poin').value = product.poin || '';
    document.getElementById('form-tukar-reward-stock').value = Math.max(0, parseInt(product.reward_stock, 10) || 0);
    document.getElementById('form-tukar-daily-quota').value = Math.max(0, parseInt(product.daily_quota, 10) || 0);
    document.getElementById('form-tukar-gambar').value = product.gambar || '';
    document.getElementById('form-tukar-deskripsi').value = product.deskripsi || '';
    await populateTukarPoinExistingProductOptions(linkedProductId);
    if (!resolvedTitle && linkedProductId) {
        applyExistingProductToTukarPoinForm(linkedProductId);
    }
    
    document.getElementById('tukar-poin-modal-title').innerText = 'Edit Produk Tukar Poin';
    document.getElementById('tukar-poin-submit-btn').innerText = 'Perbarui';
    document.getElementById('tukar-poin-modal').classList.remove('hidden');
}

function closeTukarPoinModal() {
    document.getElementById('tukar-poin-modal').classList.add('hidden');
    document.getElementById('tukar-poin-form').reset();
}

async function handleDeleteTukarPoin(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus produk tukar poin ini?')) return;
    
    try {
        const result = await GASActions.delete(TUKAR_POIN_SHEET, id);
        if (result.deleted > 0) {
            showAdminToast('Produk tukar poin berhasil dihapus!', 'success');
            fetchTukarPoin();
        } else {
            showAdminToast('Gagal menghapus produk.', 'error');
        }
    } catch (e) {
        console.error(e);
        showAdminToast('Gagal menghapus produk.', 'error');
    }
}

document.getElementById('tukar-poin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('tukar-poin-id').value;
    let judul = document.getElementById('form-tukar-judul').value.trim();
    const poin = document.getElementById('form-tukar-poin').value.trim();
    const rewardStockRaw = document.getElementById('form-tukar-reward-stock').value.trim();
    const dailyQuotaRaw = document.getElementById('form-tukar-daily-quota').value.trim();
    const existingProductId = document.getElementById('form-tukar-existing-product').value.trim();
    const gambar = document.getElementById('form-tukar-gambar').value.trim();
    const deskripsi = document.getElementById('form-tukar-deskripsi').value.trim();
    
    if (!judul && existingProductId) {
        const linkedProduct = findProductByRecordId(existingProductId);
        if (linkedProduct) {
            judul = String(linkedProduct.nama || linkedProduct.name || '').trim();
            document.getElementById('form-tukar-judul').value = judul;
        }
    }

    if (!judul || !poin || !gambar || rewardStockRaw === '' || dailyQuotaRaw === '') {
        showAdminToast('Semua field yang ditandai wajib diisi!', 'error');
        return;
    }

    const rewardStock = parseInt(rewardStockRaw, 10);
    const dailyQuota = parseInt(dailyQuotaRaw, 10);
    if (Number.isNaN(rewardStock) || rewardStock < 0) {
        showAdminToast('Stok reward harus angka 0 atau lebih.', 'error');
        return;
    }
    if (Number.isNaN(dailyQuota) || dailyQuota < 0) {
        showAdminToast('Quota harian harus angka 0 atau lebih.', 'error');
        return;
    }
    const poinValue = parseFloat(poin);
    if (!Number.isFinite(poinValue) || poinValue <= 0) {
        showAdminToast('Poin wajib berupa angka dan harus lebih dari 0.', 'error');
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Menyimpan...';
    
    try {
        const data = {
            judul,
            nama: judul,
            poin: poinValue,
            reward_stock: rewardStock,
            daily_quota: dailyQuota,
            gambar,
            deskripsi,
            product_id: existingProductId
        };
        
        const action = id ? 'update' : 'create';
        const productId = id || Date.now().toString();
        
        let result;
        if (id) {
            result = await GASActions.update(TUKAR_POIN_SHEET, productId, data);
        } else {
            result = await GASActions.create(TUKAR_POIN_SHEET, { ...data, id: productId });
        }
        
        if (result.created > 0 || result.affected > 0) {
            showAdminToast(id ? 'Produk tukar poin berhasil diperbarui!' : 'Produk tukar poin berhasil ditambahkan!', 'success');
            closeTukarPoinModal();
            fetchTukarPoin();
        } else {
            showAdminToast('Gagal menyimpan data.', 'error');
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal menyimpan data.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
});

// ============ USER POINTS FUNCTIONS ============
async function fetchUserPoints() {
    const tbody = document.getElementById('user-points-list');
    tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-gray-500">Memuat data...</td></tr>';
    try {
        const response = await fetch(`${API_URL}?sheet=user_points`);
        const data = await response.json();
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-gray-500">Belum ada data poin pengguna.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(u => {
            const safePhone = escapeHtml(u.phone);
            const safeUpdated = escapeHtml(u.last_updated || '-');
            return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-6 py-4 font-bold text-gray-800 text-sm" data-label="Telepon">${safePhone}</td>
                <td class="px-6 py-4 font-bold text-green-600 text-sm" data-label="Poin">${parseFloat(u.points).toFixed(1)} Poin</td>
                <td class="px-6 py-4 text-xs text-gray-500" data-label="Terakhir Update">${safeUpdated}</td>
                <td class="px-6 py-4 text-right" data-label="Aksi">
                    <button data-action="edit-user-points" data-phone="${escapeAttr(u.phone)}" data-points="${escapeAttr(u.points)}" class="text-blue-600 hover:underline text-sm font-bold">Edit Poin</button>
                </td>
            </tr>
        `;
        }).join('');
    } catch (error) { console.error(error); }
}

async function editUserPoints(phone, currentPoints) {
    const newPoints = prompt(`Masukkan saldo poin baru untuk ${phone}:`, currentPoints);
    if (newPoints === null || newPoints === "") return;
    
    try {
        // First, get the user data to find the ID
        const searchRes = await fetch(`${API_URL}?sheet=user_points`);
        const allUsers = await searchRes.json();
        const user = allUsers.find(u => u.phone === phone);
        
        if (!user || !user.id) {
            showAdminToast('User tidak ditemukan!', 'error');
            return;
        }
        
        const result = await GASActions.update('user_points', user.id, { 
            points: parseFloat(newPoints),
            last_updated: new Date().toLocaleString('id-ID')
        });
        if (result.affected > 0) {
            showAdminToast('Saldo poin diperbarui!', 'success');
            fetchUserPoints();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal memperbarui poin.', 'error');
    }
}

// ============ SETTINGS FUNCTIONS ============
async function loadSettings() {
    const config = CONFIG.getAllConfig();
    
    // API Settings
    document.getElementById('settings-main-api').value = config.mainApi;
    document.getElementById('settings-admin-api').value = config.adminApi;
    
    // Gajian Settings
    document.getElementById('gajian-target-day').value = config.gajian.targetDay;
    document.getElementById('gajian-default-markup').value = config.gajian.defaultMarkup * 100;
    
    // Markup Ranges
    renderGajianMarkups(config.gajian.markups);
    
    // Reward Settings
    document.getElementById('reward-point-value').value = config.reward.pointValue;
    document.getElementById('reward-min-point').value = config.reward.minPoint;
    
    // Manual Overrides
    renderRewardOverrides(config.reward.manualOverrides);

    const marginEl = document.getElementById('margin-alert-threshold');
    if (marginEl) marginEl.value = config.marginAlert || CONFIG.getMarginAlertThreshold();

    if (config.bundleDiscount) {
        const r34 = document.getElementById('bundle-rule-34');
        const r56 = document.getElementById('bundle-rule-56');
        const r7 = document.getElementById('bundle-rule-7');
    if (r34) r34.value = config.bundleDiscount.rule34 ?? 5;
    if (r56) r56.value = config.bundleDiscount.rule56 ?? 8;
    if (r7) r7.value = config.bundleDiscount.rule7plus ?? 10;
    }

    const rows = await fetchSettingsRowsFromSheet();
    const paylaterEnabledEl = document.getElementById('paylater-enabled');
    const paylaterProfitToLimitPercentEl = document.getElementById('paylater-profit-to-limit-percent');
    const paylaterFeeWeek1El = document.getElementById('paylater-fee-week-1');
    const paylaterFeeWeek2El = document.getElementById('paylater-fee-week-2');
    const paylaterFeeWeek3El = document.getElementById('paylater-fee-week-3');
    const paylaterFeeWeek4El = document.getElementById('paylater-fee-week-4');
    const paylaterDailyPenaltyPercentEl = document.getElementById('paylater-daily-penalty-percent');
    const paylaterPenaltyCapPercentEl = document.getElementById('paylater-penalty-cap-percent');
    const paylaterMaxActiveInvoicesEl = document.getElementById('paylater-max-active-invoices');
    const paylaterMaxLimitEl = document.getElementById('paylater-max-limit');
    const paylaterOverdueFreezeDaysEl = document.getElementById('paylater-overdue-freeze-days');
    const paylaterOverdueLockDaysEl = document.getElementById('paylater-overdue-lock-days');
    const paylaterOverdueReduceLimitDaysEl = document.getElementById('paylater-overdue-reduce-limit-days');
    const paylaterOverdueReduceLimitPercentEl = document.getElementById('paylater-overdue-reduce-limit-percent');
    const paylaterOverdueDefaultDaysEl = document.getElementById('paylater-overdue-default-days');

    if (paylaterEnabledEl) paylaterEnabledEl.value = String(getLatestSettingValue(rows, 'paylater_enabled', 'false')).toLowerCase() === 'true' ? 'true' : 'false';
    if (paylaterProfitToLimitPercentEl) paylaterProfitToLimitPercentEl.value = parseFloat(getLatestSettingValue(rows, 'paylater_profit_to_limit_percent', '10')) || 10;
    if (paylaterFeeWeek1El) paylaterFeeWeek1El.value = parseFloat(getLatestSettingValue(rows, 'paylater_fee_week_1', '5')) || 5;
    if (paylaterFeeWeek2El) paylaterFeeWeek2El.value = parseFloat(getLatestSettingValue(rows, 'paylater_fee_week_2', '10')) || 10;
    if (paylaterFeeWeek3El) paylaterFeeWeek3El.value = parseFloat(getLatestSettingValue(rows, 'paylater_fee_week_3', '15')) || 15;
    if (paylaterFeeWeek4El) paylaterFeeWeek4El.value = parseFloat(getLatestSettingValue(rows, 'paylater_fee_week_4', '20')) || 20;
    if (paylaterDailyPenaltyPercentEl) paylaterDailyPenaltyPercentEl.value = parseFloat(getLatestSettingValue(rows, 'paylater_daily_penalty_percent', '0.5')) || 0.5;
    if (paylaterPenaltyCapPercentEl) paylaterPenaltyCapPercentEl.value = parseFloat(getLatestSettingValue(rows, 'paylater_penalty_cap_percent', '15')) || 15;
    if (paylaterMaxActiveInvoicesEl) paylaterMaxActiveInvoicesEl.value = parseInt(getLatestSettingValue(rows, 'paylater_max_active_invoices', '1'), 10) || 1;
    if (paylaterMaxLimitEl) paylaterMaxLimitEl.value = parseInt(getLatestSettingValue(rows, 'paylater_max_limit', '1000000'), 10) || 1000000;
    if (paylaterOverdueFreezeDaysEl) paylaterOverdueFreezeDaysEl.value = parseInt(getLatestSettingValue(rows, 'paylater_overdue_freeze_days', '3'), 10) || 3;
    if (paylaterOverdueLockDaysEl) paylaterOverdueLockDaysEl.value = parseInt(getLatestSettingValue(rows, 'paylater_overdue_lock_days', '14'), 10) || 14;
    if (paylaterOverdueReduceLimitDaysEl) paylaterOverdueReduceLimitDaysEl.value = parseInt(getLatestSettingValue(rows, 'paylater_overdue_reduce_limit_days', '7'), 10) || 7;
    if (paylaterOverdueReduceLimitPercentEl) paylaterOverdueReduceLimitPercentEl.value = parseFloat(getLatestSettingValue(rows, 'paylater_overdue_reduce_limit_percent', '10')) || 10;
    if (paylaterOverdueDefaultDaysEl) paylaterOverdueDefaultDaysEl.value = parseInt(getLatestSettingValue(rows, 'paylater_overdue_default_days', '30'), 10) || 30;

    const referralEnabled = getLatestSettingValue(rows, 'referral_enabled', 'true');
    const referralRewardReferrer = getLatestSettingValue(rows, 'referral_reward_referrer', '20');
    const referralRewardReferee = getLatestSettingValue(rows, 'referral_reward_referee', '10');
    const referralMinFirstOrder = getLatestSettingValue(rows, 'referral_min_first_order', '50000');

    const referralEnabledEl = document.getElementById('referral-enabled');
    const referralRewardReferrerEl = document.getElementById('referral-reward-referrer');
    const referralRewardRefereeEl = document.getElementById('referral-reward-referee');
    const referralMinFirstOrderEl = document.getElementById('referral-min-first-order');
    if (referralEnabledEl) referralEnabledEl.value = String(referralEnabled).toLowerCase() === 'false' ? 'false' : 'true';
    if (referralRewardReferrerEl) referralRewardReferrerEl.value = parseInt(referralRewardReferrer, 10) || 20;
    if (referralRewardRefereeEl) referralRewardRefereeEl.value = parseInt(referralRewardReferee, 10) || 10;
    if (referralMinFirstOrderEl) referralMinFirstOrderEl.value = parseInt(referralMinFirstOrder, 10) || 50000;

    const alertEnabledEl = document.getElementById('referral-alert-enabled');
    const pendingThresholdEl = document.getElementById('referral-pending-days-threshold');
    const mismatchThresholdEl = document.getElementById('referral-mismatch-threshold');
    const spikeMultiplierEl = document.getElementById('referral-spike-multiplier');
    const alertEmailEl = document.getElementById('referral-alert-email');
    const alertWebhookEl = document.getElementById('referral-alert-webhook');
    const cooldownEl = document.getElementById('referral-alert-cooldown-minutes');

    if (alertEnabledEl) alertEnabledEl.value = String(getLatestSettingValue(rows, 'referral_alert_enabled', 'false')).toLowerCase() === 'true' ? 'true' : 'false';
    if (pendingThresholdEl) pendingThresholdEl.value = parseInt(getLatestSettingValue(rows, 'referral_pending_days_threshold', '3'), 10) || 3;
    if (mismatchThresholdEl) mismatchThresholdEl.value = parseInt(getLatestSettingValue(rows, 'referral_mismatch_threshold', '1'), 10) || 1;
    if (spikeMultiplierEl) spikeMultiplierEl.value = parseFloat(getLatestSettingValue(rows, 'referral_spike_multiplier', '2')) || 2;
    if (alertEmailEl) alertEmailEl.value = String(getLatestSettingValue(rows, 'referral_alert_email', '') || '');
    if (alertWebhookEl) alertWebhookEl.value = String(getLatestSettingValue(rows, 'referral_alert_webhook', '') || '');
    if (cooldownEl) cooldownEl.value = parseInt(getLatestSettingValue(rows, 'referral_alert_cooldown_minutes', '60'), 10) || 60;
}

function renderGajianMarkups(markups) {
    const tbody = document.getElementById('gajian-markups-table');
    tbody.innerHTML = markups.map((m, index) => {
        const safeMinDays = escapeHtml(m.minDays);
        const safeRate = escapeHtml((m.rate * 100).toFixed(1));
        return `
        <tr class="border-b border-gray-50">
            <td class="py-2 px-2">${safeMinDays} Hari</td>
            <td class="py-2 px-2 font-bold text-green-600">${safeRate}%</td>
            <td class="py-2 px-2">
                <button data-action="edit-markup" data-index="${index}" class="text-blue-600 hover:underline">Edit</button>
            </td>
        </tr>
    `;
    }).join('');
}

function renderRewardOverrides(overrides) {
    const tbody = document.getElementById('reward-overrides-table');
    tbody.innerHTML = Object.entries(overrides).map(([name, points]) => {
        const safeName = escapeHtml(name);
        const safePoints = escapeHtml(points);
        return `
        <tr class="border-b border-gray-50">
            <td class="py-2 px-2">${safeName}</td>
            <td class="py-2 px-2 font-bold text-amber-600">${safePoints} Poin</td>
            <td class="py-2 px-2">
                <button data-action="delete-reward-override" data-name="${escapeAttr(name)}" class="text-red-600 hover:underline">Hapus</button>
            </td>
        </tr>
    `;
    }).join('');
}

async function saveSettings() {
    const mainApi = document.getElementById('settings-main-api').value.trim();
    const adminApi = document.getElementById('settings-admin-api').value.trim();
    
    if (!mainApi || !adminApi) {
        showAdminToast('URL API tidak boleh kosong!', 'error');
        return;
    }

    // Save API URLs to localStorage
    CONFIG.setMainApiUrl(mainApi);
    CONFIG.setAdminApiUrl(adminApi);
    API_URL = adminApi; // Update local variable immediately
    
    // Clear cache when API URL changes
    if (typeof ApiService !== 'undefined') {
        ApiService.clearCache();
        console.log('✅ Cache cleared after API URL change');
    }
    
    const targetDay = parseInt(document.getElementById('gajian-target-day').value);
    const defaultMarkup = parseFloat(document.getElementById('gajian-default-markup').value) / 100;
    
    const currentGajian = CONFIG.getGajianConfig();
    CONFIG.setGajianConfig({
        ...currentGajian,
        targetDay,
        defaultMarkup
    });
    
    const pointValue = parseInt(document.getElementById('reward-point-value').value);
    const minPoint = parseFloat(document.getElementById('reward-min-point').value);
    
    const currentReward = CONFIG.getRewardConfig();
    CONFIG.setRewardConfig({
        ...currentReward,
        pointValue,
        minPoint
    });

    const marginEl = document.getElementById('margin-alert-threshold');
    if (marginEl) {
        CONFIG.setMarginAlertThreshold(parseFloat(marginEl.value));
    }

    const rule34 = document.getElementById('bundle-rule-34');
    const rule56 = document.getElementById('bundle-rule-56');
    const rule7 = document.getElementById('bundle-rule-7');
    if (rule34 && rule56 && rule7 && CONFIG.setBundleDiscountConfig) {
        CONFIG.setBundleDiscountConfig({
            rule34: parseFloat(rule34.value) || 0,
            rule56: parseFloat(rule56.value) || 0,
            rule7plus: parseFloat(rule7.value) || 0
        });
    }

    const referralEnabledEl = document.getElementById('referral-enabled');
    const referralRewardReferrerEl = document.getElementById('referral-reward-referrer');
    const referralRewardRefereeEl = document.getElementById('referral-reward-referee');
    const referralMinFirstOrderEl = document.getElementById('referral-min-first-order');
    const referralEnabled = referralEnabledEl ? referralEnabledEl.value : 'true';
    const referralRewardReferrer = referralRewardReferrerEl ? parseInt(referralRewardReferrerEl.value || '20', 10) : 20;
    const referralRewardReferee = referralRewardRefereeEl ? parseInt(referralRewardRefereeEl.value || '10', 10) : 10;
    const referralMinFirstOrder = referralMinFirstOrderEl ? parseInt(referralMinFirstOrderEl.value || '50000', 10) : 50000;
    const referralAlertEnabledEl = document.getElementById('referral-alert-enabled');
    const referralPendingDaysThresholdEl = document.getElementById('referral-pending-days-threshold');
    const referralMismatchThresholdEl = document.getElementById('referral-mismatch-threshold');
    const referralSpikeMultiplierEl = document.getElementById('referral-spike-multiplier');
    const referralAlertEmailEl = document.getElementById('referral-alert-email');
    const referralAlertWebhookEl = document.getElementById('referral-alert-webhook');
    const referralAlertCooldownEl = document.getElementById('referral-alert-cooldown-minutes');

    const referralAlertEnabled = referralAlertEnabledEl ? referralAlertEnabledEl.value : 'false';
    const referralPendingDaysThreshold = referralPendingDaysThresholdEl ? parseInt(referralPendingDaysThresholdEl.value || '3', 10) : 3;
    const referralMismatchThreshold = referralMismatchThresholdEl ? parseInt(referralMismatchThresholdEl.value || '1', 10) : 1;
    const referralSpikeMultiplier = referralSpikeMultiplierEl ? parseFloat(referralSpikeMultiplierEl.value || '2') : 2;
    const referralAlertEmail = referralAlertEmailEl ? String(referralAlertEmailEl.value || '').trim() : '';
    const referralAlertWebhook = referralAlertWebhookEl ? String(referralAlertWebhookEl.value || '').trim() : '';
    const referralAlertCooldownMinutes = referralAlertCooldownEl ? parseInt(referralAlertCooldownEl.value || '60', 10) : 60;
    const paylaterEnabledEl = document.getElementById('paylater-enabled');
    const paylaterProfitToLimitPercentEl = document.getElementById('paylater-profit-to-limit-percent');
    const paylaterFeeWeek1El = document.getElementById('paylater-fee-week-1');
    const paylaterFeeWeek2El = document.getElementById('paylater-fee-week-2');
    const paylaterFeeWeek3El = document.getElementById('paylater-fee-week-3');
    const paylaterFeeWeek4El = document.getElementById('paylater-fee-week-4');
    const paylaterDailyPenaltyPercentEl = document.getElementById('paylater-daily-penalty-percent');
    const paylaterPenaltyCapPercentEl = document.getElementById('paylater-penalty-cap-percent');
    const paylaterMaxActiveInvoicesEl = document.getElementById('paylater-max-active-invoices');
    const paylaterMaxLimitEl = document.getElementById('paylater-max-limit');
    const paylaterOverdueFreezeDaysEl = document.getElementById('paylater-overdue-freeze-days');
    const paylaterOverdueLockDaysEl = document.getElementById('paylater-overdue-lock-days');
    const paylaterOverdueReduceLimitDaysEl = document.getElementById('paylater-overdue-reduce-limit-days');
    const paylaterOverdueReduceLimitPercentEl = document.getElementById('paylater-overdue-reduce-limit-percent');
    const paylaterOverdueDefaultDaysEl = document.getElementById('paylater-overdue-default-days');

    const paylaterEnabled = paylaterEnabledEl ? paylaterEnabledEl.value : 'false';
    const paylaterProfitToLimitPercent = paylaterProfitToLimitPercentEl ? parseFloat(paylaterProfitToLimitPercentEl.value || '10') : 10;
    const paylaterFeeWeek1 = paylaterFeeWeek1El ? parseFloat(paylaterFeeWeek1El.value || '5') : 5;
    const paylaterFeeWeek2 = paylaterFeeWeek2El ? parseFloat(paylaterFeeWeek2El.value || '10') : 10;
    const paylaterFeeWeek3 = paylaterFeeWeek3El ? parseFloat(paylaterFeeWeek3El.value || '15') : 15;
    const paylaterFeeWeek4 = paylaterFeeWeek4El ? parseFloat(paylaterFeeWeek4El.value || '20') : 20;
    const paylaterDailyPenaltyPercent = paylaterDailyPenaltyPercentEl ? parseFloat(paylaterDailyPenaltyPercentEl.value || '0.5') : 0.5;
    const paylaterPenaltyCapPercent = paylaterPenaltyCapPercentEl ? parseFloat(paylaterPenaltyCapPercentEl.value || '15') : 15;
    const paylaterMaxActiveInvoices = paylaterMaxActiveInvoicesEl ? parseInt(paylaterMaxActiveInvoicesEl.value || '1', 10) : 1;
    const paylaterMaxLimit = paylaterMaxLimitEl ? parseInt(paylaterMaxLimitEl.value || '1000000', 10) : 1000000;
    const paylaterOverdueFreezeDays = paylaterOverdueFreezeDaysEl ? parseInt(paylaterOverdueFreezeDaysEl.value || '0', 10) : 0;
    const paylaterOverdueLockDays = paylaterOverdueLockDaysEl ? parseInt(paylaterOverdueLockDaysEl.value || '0', 10) : 0;
    const paylaterOverdueReduceLimitDays = paylaterOverdueReduceLimitDaysEl ? parseInt(paylaterOverdueReduceLimitDaysEl.value || '0', 10) : 0;
    const paylaterOverdueReduceLimitPercent = paylaterOverdueReduceLimitPercentEl ? parseFloat(paylaterOverdueReduceLimitPercentEl.value || '0') : 0;
    const paylaterOverdueDefaultDays = paylaterOverdueDefaultDaysEl ? parseInt(paylaterOverdueDefaultDaysEl.value || '0', 10) : 0;

    const settingEntries = [
        ['referral_enabled', String(referralEnabled)],
        ['referral_reward_referrer', String(referralRewardReferrer)],
        ['referral_reward_referee', String(referralRewardReferee)],
        ['referral_min_first_order', String(referralMinFirstOrder)],
        ['referral_alert_enabled', String(referralAlertEnabled)],
        ['referral_pending_days_threshold', String(referralPendingDaysThreshold)],
        ['referral_mismatch_threshold', String(referralMismatchThreshold)],
        ['referral_spike_multiplier', String(referralSpikeMultiplier)],
        ['referral_alert_email', String(referralAlertEmail)],
        ['referral_alert_webhook', String(referralAlertWebhook)],
        ['referral_alert_cooldown_minutes', String(referralAlertCooldownMinutes)],
        ['paylater_enabled', String(paylaterEnabled)],
        ['paylater_profit_to_limit_percent', String(paylaterProfitToLimitPercent)],
        ['paylater_fee_week_1', String(paylaterFeeWeek1)],
        ['paylater_fee_week_2', String(paylaterFeeWeek2)],
        ['paylater_fee_week_3', String(paylaterFeeWeek3)],
        ['paylater_fee_week_4', String(paylaterFeeWeek4)],
        ['paylater_daily_penalty_percent', String(paylaterDailyPenaltyPercent)],
        ['paylater_penalty_cap_percent', String(paylaterPenaltyCapPercent)],
        ['paylater_max_active_invoices', String(paylaterMaxActiveInvoices)],
        ['paylater_max_limit', String(paylaterMaxLimit)],
        ['paylater_overdue_freeze_days', String(Math.max(0, paylaterOverdueFreezeDays))],
        ['paylater_overdue_lock_days', String(Math.max(0, paylaterOverdueLockDays))],
        ['paylater_overdue_reduce_limit_days', String(Math.max(0, paylaterOverdueReduceLimitDays))],
        ['paylater_overdue_reduce_limit_percent', String(Math.max(0, paylaterOverdueReduceLimitPercent))],
        ['paylater_overdue_default_days', String(Math.max(0, paylaterOverdueDefaultDays))]
    ];

    try {
        await Promise.all(settingEntries.map(([key, value]) => GASActions.upsertSetting(key, value)));
    } catch (settingError) {
        console.warn('upsert_setting not available, fallback to append create:', settingError);
        try {
            await Promise.all(settingEntries.map(([key, value]) => GASActions.create('settings', { key, value })));
            showAdminToast('Fallback aktif: settings masih disimpan dengan metode append.', 'warning');
        } catch (fallbackErr) {
            console.warn('Fallback create settings failed:', fallbackErr);
            showAdminToast('Pengaturan lokal tersimpan, tapi gagal simpan setting referral ke sheet.', 'warning');
        }
    }
    
    // Trigger API config change event for all open tabs/windows
    window.dispatchEvent(new Event('api-config-changed'));
    console.log('🔔 [ADMIN] Dispatched api-config-changed event to all listeners');
    
    // Show detailed success message
    const successMsg = `✅ Pengaturan Berhasil Disimpan!\n\n📡 Main API: ${mainApi.substring(0, 40)}...\n🔧 Admin API: ${adminApi.substring(0, 40)}...\n🗑️ Cache cleared\n\n⏳ Reloading...`;
    alert(successMsg);
    
    showAdminToast('Pengaturan berhasil disimpan! Halaman akan reload...', 'success');
    setTimeout(() => location.reload(), 1500);
}


// ============ MARKUP MODAL FUNCTIONS ============
function openEditMarkupModal(index) {
    const config = CONFIG.getGajianConfig();
    const markup = config.markups[index];
    if (!markup) return;

    document.getElementById('edit-markup-index').value = index;
    document.getElementById('edit-markup-min-days').value = markup.minDays;
    document.getElementById('edit-markup-rate').value = (markup.rate * 100).toFixed(1);
    document.getElementById('edit-markup-modal').classList.remove('hidden');
}

function closeEditMarkupModal() {
    document.getElementById('edit-markup-modal').classList.add('hidden');
}

document.getElementById('edit-markup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const index = parseInt(document.getElementById('edit-markup-index').value);
    const minDays = parseInt(document.getElementById('edit-markup-min-days').value);
    const rate = parseFloat(document.getElementById('edit-markup-rate').value) / 100;

    const config = CONFIG.getGajianConfig();
    config.markups[index] = { minDays, rate };
    
    // Sort markups by minDays descending to keep logic consistent
    config.markups.sort((a, b) => b.minDays - a.minDays);
    
    CONFIG.setGajianConfig(config);
    renderGajianMarkups(config.markups);
    closeEditMarkupModal();
    showAdminToast('Skema markup diperbarui!', 'success');
});

// ============ REWARD OVERRIDE MODAL FUNCTIONS ============
function openAddOverrideModal() {
    document.getElementById('override-modal-title').innerText = 'Tambah Override Poin';
    document.getElementById('reward-override-form').reset();
    
    const select = document.getElementById('override-product-name');
    select.innerHTML = '<option value="">-- Pilih Produk --</option>' + 
        allProducts.map(p => {
            const safeName = escapeHtml(p.nama);
            return `<option value="${safeName}">${safeName}</option>`;
        }).join('');
    
    document.getElementById('reward-override-modal').classList.remove('hidden');
}

function closeRewardOverrideModal() {
    document.getElementById('reward-override-modal').classList.add('hidden');
}

document.getElementById('reward-override-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const productName = document.getElementById('override-product-name').value;
    const points = parseFloat(document.getElementById('override-point-value').value);

    const config = CONFIG.getRewardConfig();
    config.manualOverrides[productName] = points;
    
    CONFIG.setRewardConfig(config);
    renderRewardOverrides(config.manualOverrides);
    closeRewardOverrideModal();
    showAdminToast('Override poin disimpan!', 'success');
});

function deleteRewardOverride(name) {
    if (!confirm(`Hapus override untuk ${name}?`)) return;
    const config = CONFIG.getRewardConfig();
    delete config.manualOverrides[name];
    CONFIG.setRewardConfig(config);
    renderRewardOverrides(config.manualOverrides);
    showAdminToast('Override poin dihapus!', 'success');
}

// ============ TOAST NOTIFICATION ============
function showAdminToast(message, type = 'info') {
    let container = document.getElementById('admin-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'admin-toast-container';
        container.className = 'fixed bottom-8 right-8 z-[100] flex flex-col gap-3';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgColors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-amber-500',
        info: 'bg-blue-600'
    };
    
    toast.className = `${bgColors[type] || 'bg-gray-800'} text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-in-right min-w-[300px]`;
    
    const icons = {
        success: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
        error: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>',
        warning: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>',
        info: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
    };

    toast.dataset.toast = 'admin';
    toast.innerHTML = `
        <div class="flex-shrink-0">${icons[type] || icons.info}</div>
        <div class="flex-1 font-medium text-sm">${escapeHtml(message)}</div>
        <button data-action="dismiss-admin-toast" class="flex-shrink-0 hover:bg-white/20 p-1 rounded-lg transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('animate-fade-out');
            setTimeout(() => toast.remove(), 500);
        }
    }, 4000);
}

function bindAdminActions() {
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-action]');
        if (!trigger) return;
        const action = trigger.dataset.action;

        if (action === 'show-section') {
            showSection(trigger.dataset.section);
            return;
        }

        if (action === 'logout') {
            logout();
            return;
        }

        if (action === 'open-add-modal') {
            openAddModal();
            return;
        }

        if (action === 'filter-orders') {
            filterOrders(trigger.dataset.filter || 'semua', trigger);
            return;
        }
        if (action === 'order-page') {
            const page = parseInt(trigger.dataset.page, 10);
            if (!Number.isNaN(page)) {
                currentOrderPage = page;
                renderOrderTable();
            }
            return;
        }

        if (action === 'open-add-tukar-poin') {
            openAddTukarPoinModal();
            return;
        }

        if (action === 'open-add-banner') {
            if (typeof openAddBannerModal === 'function') {
                openAddBannerModal();
            }
            return;
        }

        if (action === 'refresh-user-points') {
            fetchUserPoints();
            return;
        }

        if (action === 'open-add-override') {
            openAddOverrideModal();
            return;
        }

        if (action === 'test-main-api') {
            testMainApi();
            return;
        }

        if (action === 'test-admin-api') {
            testAdminApi();
            return;
        }

        if (action === 'view-cache-stats') {
            viewCacheStats();
            return;
        }

        if (action === 'clear-api-cache') {
            clearApiCache();
            return;
        }

        if (action === 'save-settings') {
            saveSettings();
            return;
        }

        if (action === 'close-edit-markup-modal') {
            closeEditMarkupModal();
            return;
        }

        if (action === 'close-reward-override-modal') {
            closeRewardOverrideModal();
            return;
        }

        if (action === 'close-tukar-poin-modal') {
            closeTukarPoinModal();
            return;
        }

        if (action === 'close-banner-modal') {
            if (typeof closeBannerModal === 'function') {
                closeBannerModal();
            }
            return;
        }

        if (action === 'add-variant-row') {
            addVariantRow();
            return;
        }

        if (action === 'close-product-modal') {
            closeModal();
            return;
        }

        if (action === 'edit-category') {
            openEditCategory(trigger.dataset.id, trigger.dataset.name, trigger.dataset.description);
            return;
        }

        if (action === 'delete-category') {
            handleDeleteCategory(trigger.dataset.id);
            return;
        }

        if (action === 'edit-product') {
            openEditModal(trigger.dataset.id);
            return;
        }

        if (action === 'delete-product') {
            handleDelete(trigger.dataset.id);
            return;
        }

        if (action === 'edit-tukar-poin') {
            openEditTukarPoinModal(trigger.dataset.id);
            return;
        }

        if (action === 'delete-tukar-poin') {
            handleDeleteTukarPoin(trigger.dataset.id);
            return;
        }

        if (action === 'delete-purchase') {
            handleDeletePurchase(trigger.dataset.id);
            return;
        }

        if (action === 'edit-supplier') {
            openEditSupplier(trigger.dataset.id);
            return;
        }

        if (action === 'delete-supplier') {
            handleDeleteSupplier(trigger.dataset.id);
            return;
        }

        if (action === 'reset-supplier-form') {
            resetSupplierForm();
            return;
        }

        if (action === 'edit-cost') {
            openEditMonthlyCost(trigger.dataset.id);
            return;
        }

        if (action === 'delete-cost') {
            handleDeleteMonthlyCost(trigger.dataset.id);
            return;
        }

        if (action === 'refresh-referrals') {
            fetchReferrals();
            return;
        }

        if (action === 'refresh-credit-accounts') {
            fetchCreditAccounts();
            return;
        }

        if (action === 'sync-paylater-limit-orders') {
            runPaylaterLimitSync();
            return;
        }

        if (action === 'install-paylater-scheduler') {
            installPaylaterSchedulerFromUI();
            return;
        }

        if (action === 'remove-paylater-scheduler') {
            removePaylaterSchedulerFromUI();
            return;
        }

        if (action === 'refresh-paylater-scheduler') {
            refreshPaylaterSchedulerStatus();
            return;
        }

        if (action === 'refresh-credit-invoices') {
            fetchCreditInvoices();
            return;
        }

        if (action === 'refresh-credit-ledger') {
            fetchCreditLedger();
            return;
        }

        if (action === 'credit-ledger-prev-page') {
            creditLedgerPage = Math.max(1, creditLedgerPage - 1);
            renderCreditLedger();
            return;
        }

        if (action === 'credit-ledger-next-page') {
            creditLedgerPage += 1;
            renderCreditLedger();
            return;
        }

        if (action === 'apply-credit-penalty-all') {
            applyCreditPenaltyAllOverdue();
            return;
        }

        if (action === 'reset-credit-account-form') {
            resetCreditAccountForm();
            return;
        }

        if (action === 'reset-credit-invoice-form') {
            resetCreditInvoiceForm();
            return;
        }

        if (action === 'credit-account-fill') {
            const row = allCreditAccounts.find((item) => normalizePhone(item.phone || '') === normalizePhone(trigger.dataset.phone || ''));
            fillCreditAccountForm(row);
            return;
        }

        if (action === 'credit-account-quick-status') {
            setCreditAccountStatus(trigger.dataset.phone, trigger.dataset.status);
            return;
        }

        if (action === 'credit-invoice-pay-full') {
            payCreditInvoice(trigger.dataset.id, trigger.dataset.amount);
            return;
        }

        if (action === 'credit-invoice-pay-custom') {
            const maxAmount = parseCurrencyValue(trigger.dataset.max || 0);
            if (maxAmount <= 0) {
                showAdminToast('Sisa tagihan tidak tersedia.', 'warning');
                return;
            }
            const input = window.prompt(`Masukkan nominal pembayaran (maks Rp ${maxAmount.toLocaleString('id-ID')}):`, String(maxAmount));
            if (input === null) return;
            const amount = parseCurrencyValue(input);
            if (amount <= 0) {
                showAdminToast('Nominal pembayaran tidak valid.', 'error');
                return;
            }
            payCreditInvoice(trigger.dataset.id, Math.min(amount, maxAmount));
            return;
        }

        if (action === 'reconcile-referral-ledger') {
            runReferralLedgerReconciliation();
            return;
        }

        if (action === 'approve-referral') {
            handleApproveReferral(trigger.dataset.id);
            return;
        }

        if (action === 'reject-referral') {
            handleRejectReferral(trigger.dataset.id);
            return;
        }

        if (action === 'reset-cost-form') {
            resetMonthlyCostForm();
            return;
        }

        if (action === 'add-bundle-item') {
            addBundleItemRow();
            updateBundleTotals();
            return;
        }

        if (action === 'remove-bundle-item') {
            removeBundleItemRow(trigger);
            return;
        }

        if (action === 'apply-bundle-recommendation') {
            applyBundleRecommendation();
            return;
        }

        if (action === 'edit-user-points') {
            editUserPoints(trigger.dataset.phone, trigger.dataset.points);
            return;
        }

        if (action === 'edit-markup') {
            const index = parseInt(trigger.dataset.index, 10);
            if (!Number.isNaN(index)) {
                openEditMarkupModal(index);
            }
            return;
        }

        if (action === 'delete-reward-override') {
            deleteRewardOverride(trigger.dataset.name);
            return;
        }

        if (action === 'dismiss-admin-toast') {
            const toast = trigger.closest('[data-toast="admin"]');
            if (toast) toast.remove();
            return;
        }

        if (action === 'remove-variant-row') {
            removeVariantRow(trigger);
            return;
        }
    });

    document.addEventListener('change', (e) => {
        const trigger = e.target.closest('[data-action]');
        if (!trigger) return;
        const action = trigger.dataset.action;

        if (action === 'toggle-store-status') {
            toggleStoreStatus();
            return;
        }

        if (action === 'update-order-status') {
            const id = trigger.dataset.id;
            updateOrderStatus(id, trigger.value, trigger);
        }
    });

    document.addEventListener('input', (e) => {
        const trigger = e.target.closest('[data-action="preview-variant-image"]');
        if (trigger) {
            previewVariantImage(trigger);
            return;
        }

        if (e.target.classList.contains('bundle-item-product') || e.target.classList.contains('bundle-item-qty') || e.target.id === 'bundle-discount') {
            const discountEl = document.getElementById('bundle-discount');
            if (discountEl && e.target.id === 'bundle-discount') {
                discountEl.dataset.auto = 'false';
            }
            updateBundleTotals();
        }

        if (e.target.id === 'bundle-description') {
            e.target.dataset.touched = 'true';
        }
    });
}

function bindAdminImageFallbackHandler() {
    if (window.__adminImageFallbackHandlerAdded) return;
    window.__adminImageFallbackHandlerAdded = true;
    document.addEventListener('error', (event) => {
        const target = event.target;
        if (!target || target.tagName !== 'IMG') return;
        const fallback = target.getAttribute('data-fallback-src');
        const action = target.getAttribute('data-fallback-action');
        if (fallback && target.src !== fallback) {
            target.src = fallback;
            return;
        }
        if (action === 'hide') {
            target.style.display = 'none';
        }
    }, true);
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
    showSection('dashboard');
    bindAdminActions();
    bindAdminImageFallbackHandler();
    const tukarExistingProductEl = document.getElementById('form-tukar-existing-product');
    if (tukarExistingProductEl) {
        tukarExistingProductEl.addEventListener('change', (event) => {
            applyExistingProductToTukarPoinForm(event.target.value);
        });
    }

    const referralSearchEl = document.getElementById('referral-search');
    if (referralSearchEl) {
        referralSearchEl.addEventListener('input', (event) => {
            referralSearch = event.target.value || '';
            renderReferralTable();
        });
    }

    const referralStatusEl = document.getElementById('referral-filter-status');
    if (referralStatusEl) {
        referralStatusEl.addEventListener('change', (event) => {
            referralFilterStatus = event.target.value || 'all';
            renderReferralTable();
        });
    }

    const creditAccountForm = document.getElementById('credit-account-form');
    if (creditAccountForm) {
        creditAccountForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            await submitCreditAccountForm();
        });
    }

    const creditInvoiceForm = document.getElementById('credit-invoice-create-form');
    if (creditInvoiceForm) {
        creditInvoiceForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            await submitCreditInvoiceCreateForm();
        });
    }

    const creditAccountSearchEl = document.getElementById('credit-accounts-search');
    if (creditAccountSearchEl) {
        creditAccountSearchEl.addEventListener('input', () => {
            renderCreditAccounts();
        });
    }

    const creditInvoiceSearchEl = document.getElementById('credit-invoices-search');
    if (creditInvoiceSearchEl) {
        creditInvoiceSearchEl.addEventListener('input', () => {
            renderCreditInvoices();
        });
    }

    const creditLedgerSearchEl = document.getElementById('credit-ledger-search');
    if (creditLedgerSearchEl) {
        creditLedgerSearchEl.addEventListener('input', () => {
            creditLedgerPage = 1;
            renderCreditLedger();
        });
    }

    const creditLedgerPageSizeEl = document.getElementById('credit-ledger-page-size');
    if (creditLedgerPageSizeEl) {
        creditLedgerPageSizeEl.addEventListener('change', () => {
            creditLedgerPage = 1;
            renderCreditLedger();
        });
    }

    const schedulerRefreshSecondsEl = document.getElementById('paylater-scheduler-refresh-seconds');
    if (schedulerRefreshSecondsEl) {
        schedulerRefreshSecondsEl.addEventListener('change', () => {
            startPaylaterSchedulerAutoRefresh();
        });
    }
});

// ============ VARIANT MANAGEMENT FUNCTIONS ============

/**
 * Load variants from JSON string and render them in the form
 */
function loadVariants(variantsJson) {
    const container = document.getElementById('variants-container');
    container.innerHTML = '';
    
    if (!variantsJson) return;
    
    try {
        const variants = JSON.parse(variantsJson);
        if (Array.isArray(variants) && variants.length > 0) {
            variants.forEach((variant, index) => {
                renderVariantRow(variant, index);
            });
        }
    } catch (e) {
        console.error('Error parsing variants:', e);
    }
}

/**
 * Render a single variant row in the form
 */
function renderVariantRow(variant, index) {
    const container = document.getElementById('variants-container');
    const row = document.createElement('div');
    row.className = 'bg-white p-4 rounded-lg border border-gray-200 variant-row';
    row.dataset.index = index;
    
    const hargaCoret = variant.harga_coret || '';
    const gambar = variant.gambar || '';
    const grosir = variant.grosir || '';
    const safeSku = escapeAttr(variant.sku || '');
    const safeNama = escapeAttr(variant.nama || '');
    const safeHarga = escapeAttr(variant.harga || '');
    const safeHargaCoret = escapeAttr(hargaCoret);
    const safeStok = escapeAttr(variant.stok || '');
    const safeGrosir = escapeHtml(grosir);
    const safeImage = sanitizeUrl(gambar, '');
    
    row.innerHTML = `
        <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
                <label class="text-xs font-bold text-gray-600">SKU</label>
                <input type="text" class="variant-sku w-full p-2 border rounded text-sm" value="${safeSku}" placeholder="MG-1L" required>
            </div>
            <div>
                <label class="text-xs font-bold text-gray-600">Nama Varian</label>
                <input type="text" class="variant-nama w-full p-2 border rounded text-sm" value="${safeNama}" placeholder="1 Liter" required>
            </div>
            <div>
                <label class="text-xs font-bold text-gray-600">Harga (Rp)</label>
                <input type="number" class="variant-harga w-full p-2 border rounded text-sm" value="${safeHarga}" placeholder="15000" required>
            </div>
            <div>
                <label class="text-xs font-bold text-gray-600">Harga Coret (Rp)</label>
                <input type="number" class="variant-harga-coret w-full p-2 border rounded text-sm" value="${safeHargaCoret}" placeholder="16000">
            </div>
            <div>
                <label class="text-xs font-bold text-gray-600">Stok</label>
                <input type="number" class="variant-stok w-full p-2 border rounded text-sm" value="${safeStok}" placeholder="10" required>
            </div>
            <div class="col-span-2">
                <label class="text-xs font-bold text-gray-600">URL Gambar Varian (Opsional)</label>
                <input type="text" class="variant-gambar w-full p-2 border rounded text-sm mb-2" value="${escapeAttr(gambar)}" placeholder="https://example.com/variant-image.jpg" data-action="preview-variant-image">
                <p class="text-[10px] text-gray-500 mb-2">Jika diisi, gambar ini akan tampil saat varian dipilih. Jika kosong, akan gunakan gambar produk utama.</p>
                ${safeImage ? `<img src="${safeImage}" class="variant-image-preview w-24 h-24 object-cover rounded border" data-fallback-src="https://placehold.co/96x96?text=Img" data-fallback-action="hide">` : ''}
            </div>
        </div>
        <div class="mb-3">
            <label class="text-xs font-bold text-gray-600">Harga Grosir (JSON)</label>
            <textarea class="variant-grosir w-full p-2 border rounded text-xs" rows="2" placeholder='[{"min_qty":5,"price":14000}]'>${escapeHtml(grosir)}</textarea>
        </div>
        <div class="flex justify-end">
            <button type="button" data-action="remove-variant-row" class="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded text-sm font-bold transition">
                Hapus Varian
            </button>
        </div>
    `;
    
    container.appendChild(row);
}

/**
 * Add a new empty variant row
 */
function addVariantRow() {
    const container = document.getElementById('variants-container');
    const index = container.children.length;
    renderVariantRow({}, index);
}

/**
 * Remove a variant row
 */
function removeVariantRow(button) {
    button.closest('.variant-row').remove();
}

/**
 * Collect all variant data from the form
 */
function collectVariants() {
    const rows = document.querySelectorAll('.variant-row');
    const variants = [];
    
    rows.forEach(row => {
        const sku = row.querySelector('.variant-sku').value.trim();
        const nama = row.querySelector('.variant-nama').value.trim();
        const harga = row.querySelector('.variant-harga').value.trim();
        const hargaCoret = row.querySelector('.variant-harga-coret').value.trim();
        const stok = row.querySelector('.variant-stok').value.trim();
        const gambar = row.querySelector('.variant-gambar').value.trim();
        const grosir = row.querySelector('.variant-grosir').value.trim();
        
        // Only add if at least SKU, nama, harga, and stok are filled
        if (sku && nama && harga && stok) {
            const variant = {
                sku: sku,
                nama: nama,
                harga: parseInt(harga),
                stok: parseInt(stok)
            };
            
            if (hargaCoret) variant.harga_coret = parseInt(hargaCoret);
            if (gambar) variant.gambar = gambar;
            if (grosir) variant.grosir = grosir;
            
            variants.push(variant);
        }
    });
    
    return variants;
}

/**
 * Preview variant image when URL is entered
 */
function previewVariantImage(input) {
    const url = input.value.trim();
    const row = input.closest('.variant-row');
    
    // Remove existing preview
    const existingPreview = row.querySelector('.variant-image-preview');
    if (existingPreview) {
        existingPreview.remove();
    }
    
    // Add new preview if URL is valid
    if (url) {
        const safeUrl = sanitizeUrl(url, '');
        if (!safeUrl) {
            showAdminToast('URL gambar tidak valid.', 'warning');
            return;
        }
        const preview = document.createElement('img');
        preview.src = safeUrl;
        preview.className = 'variant-image-preview w-24 h-24 object-cover rounded border mt-2';
        preview.onerror = function() {
            this.style.display = 'none';
            showToast('Gagal memuat gambar. Periksa URL gambar.', 'error');
        };
        input.parentElement.appendChild(preview);
    }
}


// ============ CACHE MANAGEMENT FUNCTIONS ============

/**
 * Update cache count display
 */
function updateCacheCount() {
    if (typeof ApiService !== 'undefined') {
        const stats = ApiService.getCacheStats();
        const countEl = document.getElementById('cache-count');
        if (countEl) {
            countEl.textContent = stats.totalEntries;
        }
    }
}

/**
 * Clear API cache
 */
function clearApiCache() {
    if (typeof ApiService === 'undefined') {
        alert('ApiService tidak tersedia.');
        return;
    }
    
    if (!confirm('Hapus semua cache API? Data akan di-fetch ulang dari server.')) {
        return;
    }
    
    const cleared = ApiService.clearCache();
    alert(`✅ Cache berhasil dihapus!\n\n${cleared} entries dihapus.`);
    updateCacheCount();
}

/**
 * View cache statistics
 */
function viewCacheStats() {
    if (typeof ApiService === 'undefined') {
        alert('ApiService tidak tersedia.');
        return;
    }
    
    const stats = ApiService.getCacheStats();
    
    let message = `📊 STATISTIK CACHE API\n\n`;
    message += `Total Entries: ${stats.totalEntries}\n`;
    message += `Pending Requests: ${stats.pendingRequests}\n\n`;
    
    if (stats.entries.length > 0) {
        message += `DETAIL CACHE:\n`;
        message += `${'='.repeat(40)}\n\n`;
        
        stats.entries.forEach((entry, idx) => {
            const endpoint = entry.key.split(':')[1]?.split('?')[1] || 'unknown';
            message += `${idx + 1}. ${endpoint}\n`;
            message += `   Age: ${entry.age}s\n`;
            message += `   Size: ${(entry.size / 1024).toFixed(2)} KB\n\n`;
        });
    } else {
        message += `Tidak ada cache tersimpan.`;
    }
    
    alert(message);
}

// Update cache count on page load and when switching to settings
document.addEventListener('DOMContentLoaded', () => {
    // Update cache count every 5 seconds
    setInterval(updateCacheCount, 5000);
    updateCacheCount();
});


// ============ API TESTING FUNCTIONS ============

/**
 * Test Main API URL
 */
async function testMainApi() {
    const apiUrl = document.getElementById('settings-main-api').value.trim();
    const statusEl = document.getElementById('main-api-status');
    
    if (!apiUrl) {
        showApiStatus(statusEl, 'error', '❌ API URL tidak boleh kosong!');
        return;
    }
    
    // Validate URL format
    if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
        showApiStatus(statusEl, 'error', '❌ API URL harus dimulai dengan http:// atau https://');
        return;
    }
    
    showApiStatus(statusEl, 'loading', '⏳ Testing API...');
    
    try {
        // Test with ?sheet=products endpoint
        const testUrl = `${apiUrl}?sheet=products`;
        const response = await fetch(testUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data)) {
            throw new Error('Response bukan array. Pastikan sheet "products" ada di spreadsheet.');
        }
        
        showApiStatus(statusEl, 'success', `✅ API Valid! Ditemukan ${data.length} produk.`);
    } catch (error) {
        console.error('API Test Error:', error);
        showApiStatus(statusEl, 'error', `❌ API Error: ${error.message}`);
    }
}

/**
 * Test Admin API URL
 */
async function testAdminApi() {
    const apiUrl = document.getElementById('settings-admin-api').value.trim();
    const statusEl = document.getElementById('admin-api-status');
    
    if (!apiUrl) {
        showApiStatus(statusEl, 'error', '❌ API URL tidak boleh kosong!');
        return;
    }
    
    // Validate URL format
    if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
        showApiStatus(statusEl, 'error', '❌ API URL harus dimulai dengan http:// atau https://');
        return;
    }
    
    showApiStatus(statusEl, 'loading', '⏳ Testing API...');
    
    try {
        // Test with ?sheet=products endpoint
        const testUrl = `${apiUrl}?sheet=products`;
        const response = await fetch(testUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data)) {
            throw new Error('Response bukan array. Pastikan sheet "products" ada di spreadsheet.');
        }
        
        showApiStatus(statusEl, 'success', `✅ API Valid! Ditemukan ${data.length} produk.`);
    } catch (error) {
        console.error('API Test Error:', error);
        showApiStatus(statusEl, 'error', `❌ API Error: ${error.message}`);
    }
}

/**
 * Show API test status
 */
function showApiStatus(element, type, message) {
    element.classList.remove('hidden', 'bg-green-100', 'text-green-700', 'bg-red-100', 'text-red-700', 'bg-yellow-100', 'text-yellow-700');
    
    if (type === 'success') {
        element.classList.add('bg-green-100', 'text-green-700');
    } else if (type === 'error') {
        element.classList.add('bg-red-100', 'text-red-700');
    } else if (type === 'loading') {
        element.classList.add('bg-yellow-100', 'text-yellow-700');
    }
    
    element.textContent = message;
}
