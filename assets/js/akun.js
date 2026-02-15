/**
 * Akun Pengguna - GoSembako
 * Handles user authentication and order history
 */

// Phone utilities
const normalizePhoneTo08 = (phone) => {
    // Safely convert to string first to handle numbers, null, undefined
    const phoneStr = String(phone == null ? '' : phone);
    const digits = phoneStr.replace(/[^0-9]/g, '');
    if (!digits) return '';
    let core = digits;
    if (core.startsWith('62')) core = core.slice(2);
    if (core.startsWith('0')) core = core.slice(1);
    if (!core.startsWith('8')) return '';
    return '0' + core;
};

const phoneLookupVariants = (phone) => {
    const base = normalizePhoneTo08(phone);
    if (!base) return [];
    const core = base.slice(1);
    return [base, `+62${core}`, `62${core}`, core];
};

const displayPhone = (phone) => normalizePhoneTo08(phone) || (phone || '');

const parseSheetResponse = (data) => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.result)) return data.result;
    if (data && data.result) return Array.isArray(data.result) ? data.result : [data.result];
    return [];
};

const buildSessionQuery = (user) => {
    const sessionToken = String((user && user.session_token) || '').trim();
    return sessionToken ? `&session_token=${encodeURIComponent(sessionToken)}` : '';
};

const hasPublicSession = (user) => {
    return String((user && user.session_token) || '').trim() !== '';
};

const SESSION_INVALID_MESSAGE = 'Session login tidak valid. Silakan login ulang.';
const NETWORK_ERROR_MESSAGE = 'Gagal memuat data. Periksa koneksi lalu coba lagi.';

const SECTION_UI_MAP = {
    referral: {
        loadingId: 'referral-loading',
        errorId: 'referral-error',
        errorTextId: 'referral-error-text',
        loginCtaId: 'referral-login-cta',
        retryAction: 'retry-referral'
    },
    paylater: {
        loadingId: 'paylater-loading',
        errorId: 'paylater-error',
        errorTextId: 'paylater-error-text',
        loginCtaId: 'paylater-login-cta',
        retryAction: 'retry-paylater'
    },
    orders: {
        loadingId: 'order-loading',
        errorId: 'order-error',
        errorTextId: 'order-error-text',
        loginCtaId: 'orders-login-cta',
        retryAction: 'retry-orders'
    },
    points: {
        loadingId: 'points-loading',
        errorId: 'points-error',
        errorTextId: 'points-error-text',
        loginCtaId: 'points-login-cta',
        retryAction: 'retry-points'
    }
};

let lastPaylaterDetailInvoiceId = '';

function createAkunError(message, code) {
    const err = new Error(message || 'Unknown error');
    err.code = String(code || '').toUpperCase();
    err.isSessionError = err.code === 'UNAUTHORIZED_SESSION';
    return err;
}

function setPointsStaleNotice(state) {
    const staleEl = document.getElementById('points-stale-note');
    if (!staleEl) return;
    staleEl.classList.toggle('hidden', !state);
}

function setSectionLoading(section, state) {
    const cfg = SECTION_UI_MAP[section];
    if (!cfg || !cfg.loadingId) return;
    const loadingEl = document.getElementById(cfg.loadingId);
    if (!loadingEl) return;
    loadingEl.classList.toggle('hidden', !state);
}

function clearSectionError(section) {
    const cfg = SECTION_UI_MAP[section];
    if (!cfg) return;
    const errorEl = cfg.errorId ? document.getElementById(cfg.errorId) : null;
    const errorTextEl = cfg.errorTextId ? document.getElementById(cfg.errorTextId) : null;
    const loginCtaEl = cfg.loginCtaId ? document.getElementById(cfg.loginCtaId) : null;
    if (errorEl) errorEl.classList.add('hidden');
    if (errorTextEl) errorTextEl.textContent = '';
    if (loginCtaEl) loginCtaEl.classList.add('hidden');
}

function setSectionError(section, message, retryAction) {
    const cfg = SECTION_UI_MAP[section];
    if (!cfg) return;
    const errorEl = cfg.errorId ? document.getElementById(cfg.errorId) : null;
    const errorTextEl = cfg.errorTextId ? document.getElementById(cfg.errorTextId) : null;
    const loginCtaEl = cfg.loginCtaId ? document.getElementById(cfg.loginCtaId) : null;
    const retryBtn = errorEl ? errorEl.querySelector('[data-action^="retry-"]') : null;
    const resolvedMessage = String(message || NETWORK_ERROR_MESSAGE);

    if (errorTextEl) errorTextEl.textContent = resolvedMessage;
    if (retryBtn) retryBtn.setAttribute('data-action', retryAction || cfg.retryAction);
    if (loginCtaEl) {
        const showLogin = resolvedMessage.indexOf(SESSION_INVALID_MESSAGE) !== -1;
        loginCtaEl.classList.toggle('hidden', !showLogin);
    }
    if (errorEl) errorEl.classList.remove('hidden');
}

function isSessionError(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const code = String(payload.error || payload.error_code || '').toLowerCase();
    const msg = String(payload.message || '').toLowerCase();
    return code === 'unauthorized_session' ||
        code === 'session_unavailable' ||
        msg.indexOf('session login tidak valid') !== -1;
}

function parsePublicSuccess(payload, fallbackMessage) {
    if (payload && payload.success === true) {
        return payload;
    }
    if (isSessionError(payload)) {
        throw createAkunError(SESSION_INVALID_MESSAGE, 'UNAUTHORIZED_SESSION');
    }
    const message = String(
        (payload && (payload.message || payload.error || payload.error_code)) ||
        fallbackMessage ||
        NETWORK_ERROR_MESSAGE
    ).trim();
    const errorCode = String((payload && (payload.error || payload.error_code)) || '').toUpperCase();
    throw createAkunError(message, errorCode);
}

function resolvePublicErrorMessage(error, fallbackMessage) {
    if (!error) return fallbackMessage || NETWORK_ERROR_MESSAGE;
    const code = String(error.code || '').toUpperCase();
    const rawMessage = String(error.message || '').trim();
    const rawLower = rawMessage.toLowerCase();
    if (error.isSessionError || code === 'UNAUTHORIZED_SESSION' || rawLower.indexOf('session') !== -1) {
        return SESSION_INVALID_MESSAGE;
    }
    if (
        rawLower.indexOf('failed to fetch') !== -1 ||
        rawLower.indexOf('network') !== -1 ||
        rawLower.indexOf('rate limit') !== -1 ||
        rawLower.indexOf('http ') !== -1 ||
        rawLower.indexOf('timeout') !== -1
    ) {
        return NETWORK_ERROR_MESSAGE;
    }
    return rawMessage || fallbackMessage || NETWORK_ERROR_MESSAGE;
}

async function akunApiGet(endpoint, options = {}) {
    if (typeof ApiService === 'undefined' || typeof ApiService.get !== 'function') {
        throw createAkunError('ApiService belum tersedia.', 'API_SERVICE_UNAVAILABLE');
    }
    return ApiService.get(endpoint, {
        cache: false,
        maxRetries: 3,
        ...options
    });
}

async function akunApiPost(payload, options = {}) {
    if (typeof ApiService === 'undefined' || typeof ApiService.post !== 'function') {
        throw createAkunError('ApiService belum tersedia.', 'API_SERVICE_UNAVAILABLE');
    }
    return ApiService.post('', payload, {
        cache: false,
        maxRetries: 2,
        ...options
    });
}

let referralProfileCache = null;
let pendingReferralCodeFromUrl = '';
let referralConfigCache = {
    rewardReferrerPoints: 20,
    rewardRefereePoints: 10,
    minFirstOrder: 50000
};

function toReferralCodeValue(value) {
    return String(value || '').trim().toUpperCase();
}

function getReferralCodeFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        return toReferralCodeValue(
            params.get('ref') ||
            params.get('referral') ||
            params.get('kode_referral') ||
            ''
        );
    } catch (error) {
        console.warn('Failed parsing referral code from URL:', error);
        return '';
    }
}

function buildReferralShareUrl(code) {
    const referralCode = toReferralCodeValue(code);
    if (!referralCode || referralCode === '-') return '';
    const shareUrl = new URL(`${window.location.origin}${window.location.pathname}`);
    shareUrl.searchParams.set('ref', referralCode);
    return shareUrl.toString();
}

function updateRegisterReferralInfo() {
    const infoEl = document.getElementById('register-referral-info');
    const textEl = document.getElementById('register-referral-info-text');
    if (!infoEl || !textEl) return;

    if (pendingReferralCodeFromUrl) {
        textEl.textContent = `Referral dari link aktif: ${pendingReferralCodeFromUrl}`;
        infoEl.classList.remove('hidden');
    } else {
        infoEl.classList.add('hidden');
    }
}

function buildReferralShareMessage(code, link) {
    const referralCode = toReferralCodeValue(code);
    if (!referralCode || referralCode === '-' || !link) return '';
    const rewardReferrer = parseInt(referralConfigCache.rewardReferrerPoints || 0, 10) || 0;
    const rewardReferee = parseInt(referralConfigCache.rewardRefereePoints || 0, 10) || 0;
    const minOrder = parseInt(referralConfigCache.minFirstOrder || 0, 10) || 0;
    const minOrderText = minOrder > 0 ? formatCurrency(minOrder) : 'sesuai ketentuan program';

    return [
        'Halo, yuk daftar GoSembako pakai link referral saya.',
        '',
        `Link: ${link}`,
        `Kode Referral: ${referralCode}`,
        '',
        `Bonus pengguna baru: ${rewardReferee} poin`,
        `Bonus pengajak: ${rewardReferrer} poin`,
        `Bonus aktif setelah pesanan pertama selesai (minimal ${minOrderText}).`,
        '',
        'Terima kasih.'
    ].join('\n');
}

function updateReferralShareUI(profile) {
    const code = toReferralCodeValue(
        (profile && profile.kode_referral) ||
        (referralProfileCache && referralProfileCache.kode_referral) ||
        (getLoggedInUser() && getLoggedInUser().kode_referral) ||
        ''
    );
    const link = buildReferralShareUrl(code);
    const displayEl = document.getElementById('referral-code-display');
    const messageEl = document.getElementById('referral-share-message');
    const rewardEl = document.getElementById('referral-reward-info');

    if (displayEl) {
        displayEl.value = link || '-';
        displayEl.dataset.referralCode = code || '';
    }
    if (messageEl) {
        messageEl.textContent = link
            ? buildReferralShareMessage(code, link)
            : 'Link referral akan muncul setelah kode referral tersedia.';
    }
    if (rewardEl) {
        const rewardReferrer = parseInt(referralConfigCache.rewardReferrerPoints || 0, 10) || 0;
        const rewardReferee = parseInt(referralConfigCache.rewardRefereePoints || 0, 10) || 0;
        const minOrder = parseInt(referralConfigCache.minFirstOrder || 0, 10) || 0;
        rewardEl.textContent = `Pengajak: ${rewardReferrer} poin, Pengguna baru: ${rewardReferee} poin (setelah pesanan pertama selesai${minOrder > 0 ? `, minimal ${formatCurrency(minOrder)}` : ''}).`;
    }
}

function getCurrentReferralCode() {
    const displayEl = document.getElementById('referral-code-display');
    const fromDataset = toReferralCodeValue(displayEl?.dataset?.referralCode || '');
    if (fromDataset) return fromDataset;
    const fromUser = toReferralCodeValue(getLoggedInUser()?.kode_referral || '');
    return fromUser;
}

async function loadPublicReferralConfig() {
    try {
        const data = parsePublicSuccess(
            await akunApiGet('?action=public_referral_config', { cache: true, cacheDuration: 5 * 60 * 1000 }),
            'Gagal memuat konfigurasi referral.'
        );

        referralConfigCache = {
            rewardReferrerPoints: parseInt(data.reward_referrer_points || referralConfigCache.rewardReferrerPoints, 10) || referralConfigCache.rewardReferrerPoints,
            rewardRefereePoints: parseInt(data.reward_referee_points || referralConfigCache.rewardRefereePoints, 10) || referralConfigCache.rewardRefereePoints,
            minFirstOrder: parseInt(data.min_first_order || referralConfigCache.minFirstOrder, 10) || referralConfigCache.minFirstOrder
        };
    } catch (error) {
        console.warn('Failed to load public referral config:', error);
    }
}

function setReferralStatus(message, type) {
    const statusEl = document.getElementById('referral-status');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = 'text-xs';
    if (type === 'success') {
        statusEl.classList.add('text-green-600');
    } else if (type === 'error') {
        statusEl.classList.add('text-red-600');
    } else if (type === 'warning') {
        statusEl.classList.add('text-amber-600');
    } else {
        statusEl.classList.add('text-gray-500');
    }
}

function applyReferralDataToUI(profile) {
    const codeEl = document.getElementById('referral-code-display');
    const inputEl = document.getElementById('referral-input');
    const applyBtn = document.getElementById('apply-referral-btn');
    const countEl = document.getElementById('referral-count');
    const pointsEl = document.getElementById('referral-points-total');

    if (codeEl) codeEl.value = '-';
    if (countEl) countEl.textContent = String(parseInt(profile.referral_count || 0, 10) || 0);
    if (pointsEl) pointsEl.textContent = String(parseInt(profile.referral_points_total || 0, 10) || 0);

    const alreadyUsed = toReferralCodeValue(profile.referred_by) !== '';
    if (inputEl) {
        inputEl.value = alreadyUsed ? toReferralCodeValue(profile.referred_by) : '';
        inputEl.disabled = alreadyUsed;
    }
    if (applyBtn) applyBtn.disabled = alreadyUsed;

    if (alreadyUsed) {
        setReferralStatus(`Referral aktif dengan kode: ${toReferralCodeValue(profile.referred_by)}`, 'success');
    } else {
        setReferralStatus('Kode referral hanya bisa dipakai satu kali.', 'info');
    }

    updateReferralShareUI(profile);
}

function buildReferralProfileFallback(user) {
    return {
        id: user && user.id ? user.id : '',
        nama: user && user.nama ? user.nama : 'User',
        whatsapp: normalizePhoneTo08((user && (user.whatsapp || user.phone)) || ''),
        kode_referral: toReferralCodeValue(user && user.kode_referral ? user.kode_referral : ''),
        referred_by: toReferralCodeValue(user && user.referred_by ? user.referred_by : ''),
        referral_count: parseInt((user && user.referral_count) || 0, 10) || 0,
        referral_points_total: parseInt((user && user.referral_points_total) || 0, 10) || 0
    };
}

function getReferralStatusBadge(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'approved') return '<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">Approved</span>';
    if (s === 'rejected' || s === 'void') return '<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">Rejected</span>';
    return '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">Pending</span>';
}

async function loadReferralHistory(user) {
    const listEl = document.getElementById('referral-history-list');
    const badgeEl = document.getElementById('referral-history-badge');
    if (!listEl || !badgeEl) return;

    const sessionQuery = buildSessionQuery(user);
    if (!sessionQuery) {
        throw createAkunError(SESSION_INVALID_MESSAGE, 'UNAUTHORIZED_SESSION');
    }

    const payload = parsePublicSuccess(
        await akunApiGet(`?action=public_referral_history${sessionQuery}`),
        'Gagal memuat riwayat referral.'
    );

    const phone = normalizePhoneTo08(user.whatsapp);
    const rows = Array.isArray(payload.referrals) ? payload.referrals : [];
    const mine = rows
        .filter((r) => {
            const referrer = normalizePhoneTo08(r.referrer_phone || '');
            const referee = normalizePhoneTo08(r.referee_phone || '');
            return referrer === phone || referee === phone;
        })
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 10);

    badgeEl.textContent = `${mine.length} data`;
    if (mine.length === 0) {
        listEl.innerHTML = '<p class="text-gray-400">Belum ada riwayat referral.</p>';
        return;
    }

    listEl.innerHTML = mine.map((r) => {
        const role = normalizePhoneTo08(r.referrer_phone || '') === phone ? 'Anda mengajak' : 'Anda diajak';
        const otherPhone = role === 'Anda mengajak'
            ? normalizePhoneTo08(r.referee_phone || '')
            : normalizePhoneTo08(r.referrer_phone || '');
        const reward = role === 'Anda mengajak'
            ? parseInt(r.reward_referrer_points || 0, 10) || 0
            : parseInt(r.reward_referee_points || 0, 10) || 0;

        return `
            <div class="border border-gray-200 rounded-lg p-2 bg-gray-50">
                <div class="flex items-center justify-between mb-1">
                    <span class="font-bold text-gray-700">${escapeHtml(role)}</span>
                    ${getReferralStatusBadge(r.status)}
                </div>
                <p class="text-gray-600">No: ${escapeHtml(otherPhone || '-')}</p>
                <p class="text-green-700 font-semibold">Reward: ${escapeHtml(String(reward))} poin</p>
            </div>
        `;
    }).join('');
}

async function fetchPublicReferralProfile(user) {
    const sessionQuery = buildSessionQuery(user);
    if (!sessionQuery) {
        throw createAkunError(SESSION_INVALID_MESSAGE, 'UNAUTHORIZED_SESSION');
    }

    const payload = parsePublicSuccess(
        await akunApiGet(`?action=public_user_profile${sessionQuery}`),
        'Gagal memuat profil referral.'
    );
    return payload.user || null;
}

async function loadReferralData(user) {
    clearSectionError('referral');
    setSectionLoading('referral', true);
    try {
        const publicProfile = await fetchPublicReferralProfile(user);
        if (!publicProfile) {
            throw createAkunError('Profil referral tidak tersedia', 'REFERRAL_PROFILE_NOT_FOUND');
        }

        referralProfileCache = publicProfile;
        applyReferralDataToUI(publicProfile);
        await loadReferralHistory({
            ...user,
            session_token: String(user.session_token || publicProfile.session_token || '').trim()
        });
    } catch (error) {
        console.error('Error loading referral data:', error);
        applyReferralDataToUI(buildReferralProfileFallback(user));
        setReferralStatus('Kode referral hanya bisa dipakai satu kali.', 'info');
        const listEl = document.getElementById('referral-history-list');
        const badgeEl = document.getElementById('referral-history-badge');
        if (badgeEl) badgeEl.textContent = 'error';
        if (listEl) listEl.innerHTML = '<p class="text-red-500">Gagal memuat riwayat referral.</p>';
        setSectionError('referral', resolvePublicErrorMessage(error), 'retry-referral');
    } finally {
        setSectionLoading('referral', false);
    }
}

// Check if user is already logged in
document.addEventListener('DOMContentLoaded', () => {
    pendingReferralCodeFromUrl = getReferralCodeFromUrl();
    updateRegisterReferralInfo();
    loadPublicReferralConfig().then(() => {
        if (referralProfileCache) updateReferralShareUI(referralProfileCache);
    });

    const loggedInUser = getLoggedInUser();

    const referralInput = document.getElementById('referral-input');
    if (referralInput) {
        referralInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                applyReferralCode();
            }
        });
    }

    document.addEventListener('click', (event) => {
        const showLoginTrigger = event.target.closest('[data-action="show-login"]');
        if (showLoginTrigger) {
            showLogin();
            return;
        }
        const retryPaylaterDetail = event.target.closest('[data-action="retry-paylater-detail"]');
        if (retryPaylaterDetail) {
            if (lastPaylaterDetailInvoiceId) {
                openPaylaterDetailModal(lastPaylaterDetailInvoiceId);
            }
            return;
        }
        const detailTrigger = event.target.closest('[data-action="view-paylater-invoice"]');
        if (detailTrigger) {
            openPaylaterDetailModal(detailTrigger.getAttribute('data-invoice-id'));
            return;
        }
        const confirmTrigger = event.target.closest('[data-action="confirm-paylater-payment"]');
        if (confirmTrigger) {
            const link = String(confirmTrigger.getAttribute('data-wa-link') || '').trim();
            if (link) {
                const popup = window.open(link, '_blank', 'noopener,noreferrer');
                if (popup) popup.opener = null;
            }
        }
    });
    
    if (loggedInUser) {
        // User already logged in, show dashboard
        showDashboard(loggedInUser);
    } else {
        // Show login form
        showLogin();
    }
});

/**
 * Show login section
 */
function showLogin() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('forgot-pin-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
}

/**
 * Show dashboard section
 */
function showDashboard(user) {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('forgot-pin-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
    
    // Display user info
    document.getElementById('user-name').textContent = user.nama;
    document.getElementById('user-whatsapp').textContent = displayPhone(user.whatsapp);
    
    // Load loyalty points from user_points sheet
    loadLoyaltyPoints(user);

    // Load referral section
    loadReferralData(user);

    // Load paylater section
    loadPaylaterData(user);
    
    // Load order history
    loadOrderHistory(user);
}

function retryReferralSection() {
    const user = getLoggedInUser();
    if (!user) {
        showLogin();
        return;
    }
    loadReferralData(user);
}

function retryPaylaterSection() {
    const user = getLoggedInUser();
    if (!user) {
        showLogin();
        return;
    }
    loadPaylaterData(user);
}

function retryOrdersSection() {
    const user = getLoggedInUser();
    if (!user) {
        showLogin();
        return;
    }
    loadOrderHistory(user);
}

function retryPointsSection() {
    const user = getLoggedInUser();
    if (!user) {
        showLogin();
        return;
    }
    loadLoyaltyPoints(user);
}

/**
 * Handle login form submission
 */
function mapPublicLoginError(payload) {
    const code = String((payload && (payload.error || payload.error_code)) || '').toUpperCase();
    if (code === 'LOGIN_FAILED') return 'Nomor WhatsApp atau PIN salah';
    if (code === 'ACCOUNT_INACTIVE') return 'Akun Anda tidak aktif. Hubungi admin.';
    if (code === 'RATE_LIMITED') return String(payload.message || 'Terlalu banyak percobaan login, coba lagi.');
    if (code === 'UNAUTHORIZED_SESSION') return SESSION_INVALID_MESSAGE;
    return String((payload && payload.message) || 'Login gagal. Silakan coba lagi.');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const whatsapp = document.getElementById('login-whatsapp').value.trim();
    const pin = document.getElementById('login-pin').value.trim();
    const loginBtn = document.getElementById('login-btn');
    const errorDiv = document.getElementById('login-error');
    const errorText = document.getElementById('login-error-text');
    
    // Validate input
    if (!whatsapp || !pin) {
        showError('Mohon lengkapi semua field');
        return;
    }
    
    const normalizedPhone = normalizePhoneTo08(whatsapp);
    if (!normalizedPhone) {
        showError('Gunakan format 08xxxxxxxxxx');
        return;
    }
    if (normalizedPhone.length < 10 || normalizedPhone.length > 13) {
        showError('Panjang nomor tidak valid');
        return;
    }
    
    if (pin.length !== 6) {
        showError('PIN harus 6 digit');
        return;
    }
    
    // Show loading state
    loginBtn.disabled = true;
    loginBtn.innerHTML = `
        <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Memproses...</span>
    `;
    errorDiv.classList.add('hidden');
    
    try {
        const loginPayload = await akunApiGet(
            `?action=public_login&phone=${encodeURIComponent(normalizedPhone)}&pin=${encodeURIComponent(pin)}`
        );
        if (!loginPayload || loginPayload.success !== true || !loginPayload.user) {
            showError(mapPublicLoginError(loginPayload));
            resetLoginButton();
            return;
        }
        const foundUser = loginPayload.user;
        
        // Check if account is active
        if (foundUser.status && foundUser.status.toLowerCase() !== 'aktif') {
            showError('Akun Anda tidak aktif. Hubungi admin.');
            resetLoginButton();
            return;
        }
        
        // Login successful
        foundUser.whatsapp = normalizePhoneTo08(foundUser.whatsapp || foundUser.phone || normalizedPhone);
        saveLoggedInUser(foundUser);
        showDashboard(foundUser);
        document.getElementById('dashboard-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        
    } catch (error) {
        console.error('Login error:', error);
        showError(resolvePublicErrorMessage(error, NETWORK_ERROR_MESSAGE));
        resetLoginButton();
    }
});

/**
 * Show error message
 */
function showError(message) {
    const errorDiv = document.getElementById('login-error');
    const errorText = document.getElementById('login-error-text');
    
    errorText.textContent = message;
    errorDiv.classList.remove('hidden');
}

/**
 * Reset login button to default state
 */
function resetLoginButton() {
    const loginBtn = document.getElementById('login-btn');
    loginBtn.disabled = false;
    loginBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path>
        </svg>
        Masuk
    `;
}

/**
 * Save logged in user to localStorage
 */
function saveLoggedInUser(user) {
    const normalizedPhone = normalizePhoneTo08(user.whatsapp || user.phone || '');
    localStorage.setItem('gosembako_user', JSON.stringify({
        id: user.id,
        nama: user.nama,
        whatsapp: normalizedPhone || user.whatsapp,
        tanggal_daftar: user.tanggal_daftar,
        status: user.status || '',
        total_points: parseInt(user.total_points || user.points || user.poin || 0, 10) || 0,
        kode_referral: toReferralCodeValue(user.kode_referral || ''),
        referred_by: toReferralCodeValue(user.referred_by || ''),
        referral_count: parseInt(user.referral_count || 0, 10) || 0,
        referral_points_total: parseInt(user.referral_points_total || 0, 10) || 0,
        session_token: String(user.session_token || '').trim()
    }));
}

/**
 * Get logged in user from localStorage
 */
function getLoggedInUser() {
    const userJson = localStorage.getItem('gosembako_user');
    if (!userJson) return null;
    try {
        const user = JSON.parse(userJson);
        if (!user || typeof user !== 'object') return null;
        user.whatsapp = normalizePhoneTo08(user.whatsapp || user.phone || '') || user.whatsapp || '';
        user.session_token = String(user.session_token || user.sessionToken || user.st || '').trim();
        return user;
    } catch (error) {
        console.warn('Invalid gosembako_user payload:', error);
        return null;
    }
}

/**
 * Logout user
 */
function logout() {
    if (confirm('Apakah Anda yakin ingin keluar?')) {
        localStorage.removeItem('gosembako_user');
        window.location.reload();
    }
}

async function copyReferralCode() {
    const code = getCurrentReferralCode();
    if (!code || code === '-') {
        setReferralStatus('Link referral belum tersedia.', 'warning');
        return;
    }
    const referralLink = buildReferralShareUrl(code);
    if (!referralLink) {
        setReferralStatus('Link referral tidak tersedia.', 'warning');
        return;
    }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(referralLink);
        } else {
            const temp = document.createElement('textarea');
            temp.value = referralLink;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
        }
        setReferralStatus('Link referral berhasil disalin.', 'success');
    } catch (error) {
        console.error('Copy referral failed:', error);
        setReferralStatus('Gagal menyalin link referral.', 'error');
    }
}

function shareReferralWhatsApp() {
    const code = getCurrentReferralCode();
    const link = buildReferralShareUrl(code);
    if (!link) {
        setReferralStatus('Link referral belum tersedia.', 'warning');
        return;
    }

    const message = buildReferralShareMessage(code, link);
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    const userAgent = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(userAgent);

    if (isMobile) {
        window.location.href = whatsappUrl;
    } else {
        const popup = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        if (popup) {
            popup.opener = null;
        } else {
            window.location.href = whatsappUrl;
        }
    }

    setReferralStatus('Link referral siap dibagikan ke WhatsApp.', 'success');
}

async function applyReferralCode() {
    const user = getLoggedInUser();
    if (!user) {
        setReferralStatus('Silakan login ulang.', 'error');
        return;
    }

    const inputEl = document.getElementById('referral-input');
    const applyBtn = document.getElementById('apply-referral-btn');
    const code = toReferralCodeValue(inputEl ? inputEl.value : '');
    if (!code) {
        setReferralStatus('Masukkan kode referral terlebih dahulu.', 'warning');
        return;
    }

    const ownCode = getCurrentReferralCode();
    if (ownCode && code === ownCode) {
        setReferralStatus('Kode referral sendiri tidak bisa dipakai.', 'error');
        return;
    }

    if (inputEl && inputEl.disabled) {
        setReferralStatus('Kode referral sudah pernah diterapkan.', 'warning');
        return;
    }

    const originalText = applyBtn ? applyBtn.textContent : '';
    try {
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.textContent = 'Memproses...';
        }

        const result = await GASActions.post({
            action: 'attach_referral',
            sheet: 'users',
            data: {
                referee_phone: normalizePhoneTo08(user.whatsapp),
                ref_code: code
            }
        });

        if (!result || result.success === false) {
            const message = (result && (result.message || result.error || result.error_code)) || 'Gagal menerapkan referral';
            setReferralStatus(message, 'error');
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.textContent = originalText || 'Terapkan';
            }
            return;
        }

        if (inputEl) {
            inputEl.value = code;
            inputEl.disabled = true;
        }
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.textContent = 'Terapkan';
        }
        setReferralStatus('Kode referral berhasil diterapkan.', 'success');
        await loadReferralData(user);
    } catch (error) {
        console.error('applyReferralCode error:', error);
        setReferralStatus(error.message || 'Gagal menerapkan kode referral.', 'error');
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.textContent = originalText || 'Terapkan';
        }
    }
}

/**
 * Load loyalty points from user_points sheet
 */
async function loadLoyaltyPoints(user) {
    const pointsEl = document.getElementById('loyalty-points');
    if (!pointsEl) return;

    const fallbackPoints = parseInt(user.total_points || user.points || user.poin || 0, 10) || 0;
    clearSectionError('points');
    setSectionLoading('points', true);
    setPointsStaleNotice(false);

    try {
        const sessionQuery = buildSessionQuery(user);
        if (!sessionQuery) {
            throw createAkunError(SESSION_INVALID_MESSAGE, 'UNAUTHORIZED_SESSION');
        }

        const payload = parsePublicSuccess(
            await akunApiGet(`?action=public_user_points${sessionQuery}`),
            'Gagal memuat poin loyalitas.'
        );
        const points = parseInt(payload.points || 0, 10) || 0;
        pointsEl.textContent = String(points);
        setRewardContextFromAkun(user.whatsapp, points, user.nama);
    } catch (error) {
        console.error('Error loading loyalty points:', error);
        pointsEl.textContent = String(fallbackPoints);
        setRewardContextFromAkun(user.whatsapp, fallbackPoints, user.nama);
        setPointsStaleNotice(true);
        const message = resolvePublicErrorMessage(error);
        setSectionError('points', `${message} data bisa tidak terbaru`, 'retry-points');
    } finally {
        setSectionLoading('points', false);
    }
}

function getPaylaterStatusBadgeClass(status) {
    const normalized = String(status || '').toLowerCase().trim();
    if (normalized === 'active') return 'bg-green-100 text-green-700';
    if (normalized === 'frozen') return 'bg-amber-100 text-amber-700';
    if (normalized === 'locked') return 'bg-red-100 text-red-700';
    if (normalized === 'overdue') return 'bg-red-100 text-red-700';
    if (normalized === 'paid') return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-700';
}

function renderPaylaterSummary(summaryPayload) {
    const account = (summaryPayload && summaryPayload.account) || {};
    const summary = (summaryPayload && summaryPayload.summary) || {};
    const status = String(account.status || 'inactive').toLowerCase().trim();

    const statusEl = document.getElementById('paylater-account-status');
    const limitEl = document.getElementById('paylater-credit-limit');
    const availableEl = document.getElementById('paylater-available-limit');
    const usedEl = document.getElementById('paylater-used-limit');
    const totalEl = document.getElementById('paylater-invoice-total');
    const activeEl = document.getElementById('paylater-invoice-active');
    const overdueEl = document.getElementById('paylater-invoice-overdue');
    const remainingEl = document.getElementById('paylater-remaining-open');

    if (statusEl) {
        statusEl.textContent = status || 'inactive';
        statusEl.className = `text-xs font-bold px-2 py-1 rounded-full ${getPaylaterStatusBadgeClass(status)}`;
    }
    if (limitEl) limitEl.textContent = formatCurrency(account.credit_limit || 0);
    if (availableEl) availableEl.textContent = formatCurrency(account.available_limit || 0);
    if (usedEl) usedEl.textContent = formatCurrency(account.used_limit || 0);
    if (totalEl) totalEl.textContent = String(parseInt(summary.invoice_count_total || 0, 10) || 0);
    if (activeEl) activeEl.textContent = String(parseInt(summary.invoice_count_active || 0, 10) || 0);
    if (overdueEl) overdueEl.textContent = String(parseInt(summary.invoice_count_overdue || 0, 10) || 0);
    if (remainingEl) remainingEl.textContent = formatCurrency(summary.remaining_open || 0);
}

function renderPaylaterInvoices(invoices) {
    const listEl = document.getElementById('paylater-invoice-list');
    const badgeEl = document.getElementById('paylater-history-badge');
    if (!listEl) return;

    const rows = Array.isArray(invoices) ? invoices : [];
    if (badgeEl) badgeEl.textContent = `${rows.length} data`;

    if (!rows.length) {
        listEl.innerHTML = '<p class="text-gray-400">Belum ada riwayat invoice.</p>';
        return;
    }

    listEl.innerHTML = rows.slice(0, 10).map((row) => {
        const invoiceId = String(row.invoice_id || row.id || '-');
        const status = String(row.status || 'active').toLowerCase();
        const totalDue = parseCurrencyValue(row.total_due || 0);
        const paid = parseCurrencyValue(row.paid_amount || 0);
        const remaining = Math.max(0, totalDue - paid);
        const dueDate = formatDate(row.due_date || row.created_at || '');
        return `
            <div class="rounded-xl border border-gray-200 p-3 bg-white">
                <div class="flex items-center justify-between gap-2 mb-2">
                    <p class="font-bold text-gray-800">${escapeHtml(invoiceId)}</p>
                    <span class="text-[10px] font-bold px-2 py-1 rounded-full ${getPaylaterStatusBadgeClass(status)}">${escapeHtml(status)}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-[11px] text-gray-600">
                    <p>Total Due: <span class="font-bold text-gray-800">${escapeHtml(formatCurrency(totalDue))}</span></p>
                    <p>Sisa: <span class="font-bold text-red-600">${escapeHtml(formatCurrency(remaining))}</span></p>
                    <p>Paid: <span class="font-bold text-green-700">${escapeHtml(formatCurrency(paid))}</span></p>
                    <p>Jatuh Tempo: <span class="font-bold text-gray-800">${escapeHtml(dueDate)}</span></p>
                </div>
                <div class="mt-2">
                    <button type="button" data-action="view-paylater-invoice" data-invoice-id="${escapeHtml(invoiceId)}" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition">Lihat Detail</button>
                </div>
            </div>
        `;
    }).join('');
}

function closePaylaterDetailModal() {
    const modal = document.getElementById('paylater-detail-modal');
    if (!modal) return;
    modal.classList.add('hidden');
}

async function openPaylaterDetailModal(invoiceId) {
    const user = getLoggedInUser();
    if (!user || !invoiceId) return;
    const modal = document.getElementById('paylater-detail-modal');
    const contentEl = document.getElementById('paylater-detail-content');
    if (!modal || !contentEl) return;

    lastPaylaterDetailInvoiceId = String(invoiceId || '').trim();
    modal.classList.remove('hidden');
    contentEl.innerHTML = '<p class="text-gray-500">Memuat detail tagihan...</p>';

    try {
        const sessionQuery = buildSessionQuery(user);
        if (!sessionQuery) {
            throw createAkunError(SESSION_INVALID_MESSAGE, 'UNAUTHORIZED_SESSION');
        }
        const payload = parsePublicSuccess(
            await akunApiGet(`?action=public_paylater_invoice_detail&invoice_id=${encodeURIComponent(invoiceId)}${sessionQuery}`),
            'Gagal memuat detail tagihan.'
        );

        const invoice = payload.invoice || {};
        const ledgerRows = Array.isArray(payload.ledger) ? payload.ledger : [];
        const totalDue = parseCurrencyValue(invoice.total_due || 0);
        const paid = parseCurrencyValue(invoice.paid_amount || 0);
        const remaining = Math.max(0, totalDue - paid);
        const invoiceStatus = String(invoice.status || '').toLowerCase().trim();
        const canConfirmPayment = remaining > 0 && !['paid', 'cancelled', 'defaulted'].includes(invoiceStatus);
        const invoiceCode = String(invoice.invoice_id || invoice.id || invoiceId || '-');
        const waMessage = `KONFIRMASI PEMBAYARAN PAYLATER%0A%0A` +
            `Invoice: ${encodeURIComponent(invoiceCode)}%0A` +
            `Total Due: ${encodeURIComponent(formatCurrency(totalDue))}%0A` +
            `Sudah Dibayar: ${encodeURIComponent(formatCurrency(paid))}%0A` +
            `Sisa Tagihan: ${encodeURIComponent(formatCurrency(remaining))}%0A` +
            `Mohon verifikasi pembayaran saya.`;
        const waLink = `https://wa.me/628993370200?text=${waMessage}`;

        const ledgerHtml = ledgerRows.length
            ? ledgerRows.map((row) => {
                return `
                    <div class="rounded-lg border border-gray-200 p-2">
                        <p class="text-xs font-bold text-gray-700">${escapeHtml(String(row.type || '-'))}</p>
                        <p class="text-xs text-gray-600">${escapeHtml(formatDate(row.created_at || ''))}</p>
                        <p class="text-xs text-gray-700">Amount: <span class="font-bold">${escapeHtml(formatCurrency(row.amount || 0))}</span></p>
                        <p class="text-xs text-gray-500">${escapeHtml(String(row.note || '-'))}</p>
                    </div>
                `;
            }).join('')
            : '<p class="text-xs text-gray-500">Belum ada ledger untuk invoice ini.</p>';
        const confirmPaymentHtml = canConfirmPayment
            ? `
                <div class="pt-3 border-t border-gray-100">
                    <button type="button" data-action="confirm-paylater-payment" data-wa-link="${escapeHtml(waLink)}" class="w-full bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2.5 rounded-lg transition">
                        Konfirmasi Bayar via WhatsApp
                    </button>
                </div>
              `
            : '';

        contentEl.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="rounded-xl bg-gray-50 border border-gray-200 p-3">
                    <p class="text-xs text-gray-500">Invoice ID</p>
                    <p class="font-bold text-gray-800">${escapeHtml(String(invoice.invoice_id || invoice.id || '-'))}</p>
                </div>
                <div class="rounded-xl bg-gray-50 border border-gray-200 p-3">
                    <p class="text-xs text-gray-500">Status</p>
                    <p class="font-bold text-gray-800">${escapeHtml(String(invoice.status || '-'))}</p>
                </div>
                <div class="rounded-xl bg-gray-50 border border-gray-200 p-3">
                    <p class="text-xs text-gray-500">Total Due</p>
                    <p class="font-bold text-gray-800">${escapeHtml(formatCurrency(totalDue))}</p>
                </div>
                <div class="rounded-xl bg-gray-50 border border-gray-200 p-3">
                    <p class="text-xs text-gray-500">Sisa Tagihan</p>
                    <p class="font-bold text-red-700">${escapeHtml(formatCurrency(remaining))}</p>
                </div>
                <div class="rounded-xl bg-gray-50 border border-gray-200 p-3">
                    <p class="text-xs text-gray-500">Jatuh Tempo</p>
                    <p class="font-bold text-gray-800">${escapeHtml(formatDate(invoice.due_date || '-'))}</p>
                </div>
                <div class="rounded-xl bg-gray-50 border border-gray-200 p-3">
                    <p class="text-xs text-gray-500">Tenor</p>
                    <p class="font-bold text-gray-800">${escapeHtml(String(invoice.tenor_weeks || '-'))} minggu</p>
                </div>
            </div>
            <div class="pt-3 border-t border-gray-100">
                <p class="text-sm font-bold text-gray-800 mb-2">Riwayat Ledger</p>
                <div class="space-y-2">${ledgerHtml}</div>
            </div>
            ${confirmPaymentHtml}
        `;
    } catch (error) {
        console.error('Error load paylater detail:', error);
        const message = resolvePublicErrorMessage(error, 'Gagal memuat detail tagihan.');
        const showLogin = message === SESSION_INVALID_MESSAGE;
        contentEl.innerHTML = `
            <div class="rounded-xl border border-red-200 bg-red-50 p-3">
                <p class="text-red-700 text-sm font-semibold">${escapeHtml(message)}</p>
                <div class="flex items-center gap-2 mt-3">
                    <button type="button" data-action="retry-paylater-detail" class="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition">
                        Coba Lagi
                    </button>
                    ${showLogin ? '<button type="button" data-action="show-login" class="px-3 py-1.5 rounded-lg bg-white text-red-700 text-xs font-bold border border-red-200 hover:bg-red-100 transition">Login Ulang</button>' : ''}
                </div>
            </div>
        `;
    }
}

async function loadPaylaterData(user) {
    clearSectionError('paylater');
    setSectionLoading('paylater', true);
    try {
        const sessionQuery = buildSessionQuery(user);
        if (!sessionQuery) {
            throw createAkunError(SESSION_INVALID_MESSAGE, 'UNAUTHORIZED_SESSION');
        }

        const [summaryPayload, invoicesPayload] = await Promise.all([
            akunApiGet(`?action=public_paylater_summary${sessionQuery}`),
            akunApiGet(`?action=public_paylater_invoices${sessionQuery}`)
        ]);
        const summary = parsePublicSuccess(summaryPayload, 'Gagal memuat ringkasan PayLater.');
        const invoices = parsePublicSuccess(invoicesPayload, 'Gagal memuat daftar invoice PayLater.');
        renderPaylaterSummary(summary);
        renderPaylaterInvoices(invoices.invoices || []);
    } catch (error) {
        console.error('Error loading paylater data:', error);
        setSectionError('paylater', resolvePublicErrorMessage(error), 'retry-paylater');
    } finally {
        setSectionLoading('paylater', false);
    }
}

/**
 * Load order history for user
 */
async function loadOrderHistory(user) {
    const loadingDiv = document.getElementById('order-loading');
    const emptyDiv = document.getElementById('order-empty');
    const orderList = document.getElementById('order-list');
    const orderError = document.getElementById('order-error');
    const paginationDiv = document.getElementById('order-pagination');
    const totalAcceptedEl = document.getElementById('total-accepted-spend');

    clearSectionError('orders');
    setSectionLoading('orders', true);
    if (emptyDiv) emptyDiv.classList.add('hidden');
    if (orderError) orderError.classList.add('hidden');
    if (orderList) orderList.innerHTML = '';
    if (paginationDiv) {
        paginationDiv.classList.add('hidden');
        paginationDiv.innerHTML = '';
    }
    if (totalAcceptedEl) totalAcceptedEl.textContent = 'Rp 0';
    
    try {
        const sessionQuery = buildSessionQuery(user);
        if (!sessionQuery) {
            throw createAkunError(SESSION_INVALID_MESSAGE, 'UNAUTHORIZED_SESSION');
        }

        const payload = parsePublicSuccess(
            await akunApiGet(`?action=public_user_orders${sessionQuery}`),
            'Gagal memuat riwayat pesanan.'
        );
        let orders = Array.isArray(payload.orders) ? payload.orders : [];
        
        setSectionLoading('orders', false);
        
        // Check if orders exist
        if (!orders || orders.length === 0) {
            if (emptyDiv) emptyDiv.classList.remove('hidden');
            return;
        }
        
        // Filter orders to ensure only user's orders (double check phone match)
        orders = orders.filter(order => {
            const orderPhone = normalizePhoneTo08(order.phone || order.whatsapp || '');
            const userPhone = normalizePhoneTo08(user.whatsapp);
            return orderPhone === userPhone;
        });
        
        // Check again after filtering
        if (orders.length === 0) {
            if (emptyDiv) emptyDiv.classList.remove('hidden');
            return;
        }
        
        // Sort orders by date (newest first)
        orders.sort((a, b) => {
            const dateA = new Date(a.tanggal_pesanan || a.timestamp || 0);
            const dateB = new Date(b.tanggal_pesanan || b.timestamp || 0);
            return dateB - dateA;
        });
        
        // Store all orders for pagination
        window.allOrders = orders;
        window.currentPage = 1;
        window.ordersPerPage = 10;

        // Update total accepted spend
        if (totalAcceptedEl) {
            const acceptedStatuses = new Set(['terima', 'diterima', 'selesai']);
            const totalAccepted = orders.reduce((sum, order) => {
                const status = String(order.status || '').toLowerCase().trim();
                if (!acceptedStatuses.has(status)) return sum;
                return sum + parseCurrencyValue(order.total || order.total_bayar || 0);
            }, 0);
            totalAcceptedEl.textContent = formatCurrency(totalAccepted);
        }
        
        // Display first page
        displayOrderPage(1);
        
    } catch (error) {
        console.error('Error loading order history:', error);
        setSectionLoading('orders', false);
        if (emptyDiv) emptyDiv.classList.add('hidden');
        if (orderList) orderList.innerHTML = '';
        if (paginationDiv) paginationDiv.classList.add('hidden');
        setSectionError('orders', resolvePublicErrorMessage(error), 'retry-orders');
    }
}

function parseCurrencyValue(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Display orders for specific page
 */
function displayOrderPage(page) {
    const orderList = document.getElementById('order-list');
    const paginationDiv = document.getElementById('order-pagination');
    
    if (!window.allOrders || window.allOrders.length === 0) return;
    
    const totalOrders = window.allOrders.length;
    const totalPages = Math.ceil(totalOrders / window.ordersPerPage);
    const startIndex = (page - 1) * window.ordersPerPage;
    const endIndex = Math.min(startIndex + window.ordersPerPage, totalOrders);
    
    // Clear order list
    orderList.innerHTML = '';
    
    // Display orders for current page
    for (let i = startIndex; i < endIndex; i++) {
        const orderCard = createOrderCard(window.allOrders[i]);
        orderList.appendChild(orderCard);
    }
    
    // Update pagination
    if (totalPages > 1) {
        paginationDiv.classList.remove('hidden');
        paginationDiv.innerHTML = createPagination(page, totalPages);
    } else {
        paginationDiv.classList.add('hidden');
    }
    
    window.currentPage = page;
}

/**
 * Create pagination HTML
 */
function createPagination(currentPage, totalPages) {
    let html = '<div class="flex justify-center items-center gap-2 mt-6">';
    
    // Previous button
    if (currentPage > 1) {
        html += `<button onclick="displayOrderPage(${currentPage - 1})" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold text-sm">← Prev</button>`;
    }
    
    // Page numbers
    html += '<div class="flex gap-1">';
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            html += `<button class="px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-sm">${i}</button>`;
        } else if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button onclick="displayOrderPage(${i})" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-bold text-sm">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += '<span class="px-2 py-2 text-gray-500">...</span>';
        }
    }
    html += '</div>';
    
    // Next button
    if (currentPage < totalPages) {
        html += `<button onclick="displayOrderPage(${currentPage + 1})" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold text-sm">Next →</button>`;
    }
    
    html += '</div>';
    return html;
}

/**
 * Create order card element
 */
function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'border border-gray-200 rounded-xl p-3 hover:border-green-300 transition cursor-pointer';
    
    // Format date
    const orderDate = formatDate(order.tanggal_pesanan || order.timestamp);
      // Format total bayar (use 'total' column from sheet)
    const totalBayar = formatCurrency(order.total || order.total_bayar || 0);  
    // Get status badge
    const status = order.status || 'Menunggu';
    const statusBadge = getStatusBadge(status);
    
    // Get product name and truncate for mobile
    const productName = order.produk || order.items || order.product_name || 'N/A';
    const truncatedProduct = truncateText(productName, 20);
    
    // Get Order ID from 'id' column
    const orderId = order.id || 'N/A';
    
    card.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div class="flex-1">
                <p class="text-[10px] font-bold text-gray-700 mb-1">Order ID: <span class="text-green-600">${escapeHtml(orderId)}</span></p>
            </div>
            ${statusBadge}
        </div>
        
        <div class="border-t border-gray-100 pt-2 space-y-1.5">
            <div class="text-sm">
                <p class="text-gray-600 text-xs mb-0.5">Produk:</p>
                <p class="font-semibold text-gray-800 lg:hidden">${escapeHtml(truncatedProduct)}</p>
                <p class="font-semibold text-gray-800 hidden lg:block">${escapeHtml(productName)}</p>
            </div>
            <div class="flex justify-between text-xs">
                <span class="text-gray-600">Qty:</span>
                <span class="font-semibold text-gray-800">${order.qty || order.quantity || order.jumlah || 'N/A'}</span>
            </div>
            <div class="flex justify-between text-xs">
                <span class="text-gray-600">Poin:</span>
                <span class="font-semibold text-amber-600">+${order.poin || order.points || 0}</span>
            </div>
            <div class="flex justify-between text-xs">
                <span class="text-gray-600">Total Bayar:</span>
                <span class="font-bold text-green-600">${totalBayar}</span>
            </div>
        </div>
        
        <div class="mt-3 pt-2 border-t border-gray-100">
            <button onclick="window.location.href='index.html'" class="block w-full text-center bg-green-50 hover:bg-green-100 text-green-700 font-bold py-1.5 rounded-lg transition text-xs">
                Belanja Lagi
            </button>
        </div>
    `;
    
    // Add click event to show order detail modal
    card.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') {
            showOrderDetailModal(order);
        }
    });
    
    return card;
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
    // Normalize status from admin (Terima → Diterima, etc.)
    const normalizedStatus = normalizeStatus(status);
    
    const statusMap = {
        'Menunggu': { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Menunggu' },
        'Diproses': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Diproses' },
        'Dikirim': { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Dikirim' },
        'Diterima': { bg: 'bg-green-100', text: 'text-green-700', label: 'Diterima' },
        'Dibatalkan': { bg: 'bg-red-100', text: 'text-red-700', label: 'Dibatalkan' }
    };
    
    const statusInfo = statusMap[normalizedStatus] || statusMap['Menunggu'];
    
    return `<span class="${statusInfo.bg} ${statusInfo.text} text-xs font-bold px-3 py-1 rounded-full">${statusInfo.label}</span>`;
}

/**
 * Normalize status from admin to user format
 */
function normalizeStatus(status) {
    if (!status) return 'Menunggu';
    
    // Convert to lowercase for comparison
    const statusLower = status.toLowerCase().trim();
    
    // Map admin status to user status
    const statusMapping = {
        'menunggu': 'Menunggu',
        'pending': 'Menunggu',
        'diproses': 'Diproses',
        'proses': 'Diproses',
        'processing': 'Diproses',
        'dikirim': 'Dikirim',
        'kirim': 'Dikirim',
        'shipped': 'Dikirim',
        'diterima': 'Diterima',
        'terima': 'Diterima',  // Admin uses 'Terima'
        'selesai': 'Diterima',
        'completed': 'Diterima',
        'dibatalkan': 'Dibatalkan',
        'batal': 'Dibatalkan',
        'cancelled': 'Dibatalkan',
        'canceled': 'Dibatalkan'
    };
    
    return statusMapping[statusLower] || status;
}

/**
 * Format date to Indonesian format
 * Handles Google Sheets format: 21/1/2026, 09.26.20
 * Returns only date without time: 21 Januari 2026
 */
function formatDate(dateString) {
    if (!dateString || dateString === 'N/A' || dateString === '') {
        return 'N/A';
    }
    
    let date;
    
    // Handle various date formats
    if (typeof dateString === 'number') {
        // Unix timestamp (milliseconds)
        date = new Date(dateString);
    } else if (typeof dateString === 'string') {
        // Remove time part if exists (after comma)
        // Format: "21/1/2026, 09.26.20" → "21/1/2026"
        let dateOnly = dateString.split(',')[0].trim();
        
        // Try ISO format first (2026-01-22 or 2026-01-22T14:30:00)
        date = new Date(dateString);
        
        // If invalid, try DD/MM/YYYY format
        if (isNaN(date.getTime()) && dateOnly.includes('/')) {
            const parts = dateOnly.split('/');
            if (parts.length === 3) {
                const day = parseInt(parts[0]);
                const month = parseInt(parts[1]);
                const year = parseInt(parts[2]);
                
                // Create date (month is 0-indexed in JS)
                if (day <= 31 && month <= 12 && year > 1900) {
                    date = new Date(year, month - 1, day);
                }
            }
        }
    } else {
        date = new Date(dateString);
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
        return 'N/A';
    }
    
    // Format to Indonesian (date only, no time)
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric'
    };
    
    return date.toLocaleDateString('id-ID', options);
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text, maxLength) {
    if (!text) return 'N/A';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Format currency to Indonesian Rupiah
 */
function formatCurrency(amount) {
    const number = parseInt(amount) || 0;
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(number);
}

/**
 * Show register info (placeholder)
 */
function showRegisterInfo() {
    alert('Untuk mendaftar, silakan hubungi admin GoSembako melalui WhatsApp.\n\nAnda akan diberikan akun dengan nomor WhatsApp dan PIN untuk login.');
}


/**
 * ========================================
 * NEW FEATURES: Registration, Forgot PIN, Edit Profile, Tracking, Loyalty
 * ========================================
 */

/**
 * Show registration form
 */
function showRegister() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.remove('hidden');
    document.getElementById('forgot-pin-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
    updateRegisterReferralInfo();
}

/**
 * Show forgot PIN form
 */
function showForgotPIN() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('forgot-pin-section').classList.remove('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
}

/**
 * Handle registration form submission
 */
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('register-name').value.trim();
    const whatsapp = document.getElementById('register-whatsapp').value.trim();
    const pin = document.getElementById('register-pin').value.trim();
    const pinConfirm = document.getElementById('register-pin-confirm').value.trim();
    const referralCode = pendingReferralCodeFromUrl;
    
    const errorDiv = document.getElementById('register-error');
    const errorText = document.getElementById('register-error-text');
    const successDiv = document.getElementById('register-success');
    const registerBtn = document.getElementById('register-btn');
    
    // Hide messages
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    
    // Validate name (same as login validation)
    const nameWithoutSpaces = name.replace(/\s/g, '');
    if (nameWithoutSpaces.length < 4) {
        errorText.textContent = 'Masukkan Nama Lengkap';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // Check name patterns
    const nameLower = nameWithoutSpaces.toLowerCase();
    const invalidNamePatterns = [
        /^(.)\1{3,}$/,
        /^(.{2})\1{2,}$/,
        /^(.{3})\1{2,}$/,
        /^([a-z])([a-z])\1\2{2,}$/,
    ];
    
    for (const pattern of invalidNamePatterns) {
        if (pattern.test(nameLower)) {
            errorText.textContent = 'Masukkan Nama Lengkap';
            errorDiv.classList.remove('hidden');
            return;
        }
    }
    
    // Validate WhatsApp
    const normalizedPhone = normalizePhoneTo08(whatsapp);
    if (!normalizedPhone) {
        errorText.textContent = 'Gunakan format 08xxxxxxxxxx';
        errorDiv.classList.remove('hidden');
        return;
    }
    const cleanPhone = normalizedPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 13) {
        errorText.textContent = 'Nomor WhatsApp tidak valid';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // Check phone patterns
    const invalidPhonePatterns = [
        /^(\d)\1{9,}$/,
        /^08(\d)\1{8,}$/,
        /^(\d{2})\1{4,}$/,
        /^(\d{3})\1{3,}$/
    ];
    
    for (const pattern of invalidPhonePatterns) {
        if (pattern.test(cleanPhone)) {
            errorText.textContent = 'Nomor WhatsApp tidak valid';
            errorDiv.classList.remove('hidden');
            return;
        }
    }
    
    // Validate PIN
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
        errorText.textContent = 'PIN harus 6 digit angka';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if (pin !== pinConfirm) {
        errorText.textContent = 'PIN tidak cocok';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // Show loading
    registerBtn.disabled = true;
    registerBtn.innerHTML = '<svg class="animate-spin h-5 w-5 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
    
    try {
        // Generate user ID
        const userId = `USR-${Date.now().toString().slice(-6)}`;
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toLocaleString('id-ID', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        

        
        // Create new user
        const createResult = await akunApiPost({
            action: 'create',
            sheet: 'users',
            data: {
                id: userId,
                nama: name,
                whatsapp: normalizedPhone,
                pin: pin,
                tanggal_daftar: today,
                status: 'aktif',
                total_points: 0,
                created_at: now,
                referred_by: '',
                referred_by_phone: '',
                referral_count: 0,
                referral_points_total: 0,
                kode_referral: ''
            }
        });

        if (createResult && createResult.error) {
            throw createAkunError(
                String(createResult.message || createResult.error || 'Gagal mendaftar'),
                String(createResult.error || '')
            );
        }
        
        if (!createResult || createResult.success !== true || !createResult.created || createResult.created < 1) {
            throw new Error(
                String(
                    (createResult && (createResult.message || createResult.error || createResult.error_code)) ||
                    'Gagal mendaftar'
                )
            );
        }
        
        let referralNotice = '';
        if (referralCode) {
            try {
                const referralResult = await GASActions.post({
                    action: 'attach_referral',
                    sheet: 'users',
                    data: {
                        referee_phone: normalizedPhone,
                        ref_code: referralCode
                    }
                });
                if (referralResult && referralResult.success) {
                    referralNotice = ' Kode referral berhasil diterapkan.';
                } else {
                    referralNotice = ' Akun dibuat, namun kode referral tidak valid.';
                }
            } catch (refErr) {
                console.warn('Referral attach failed after registration:', refErr);
                referralNotice = ' Akun dibuat, namun kode referral gagal diproses.';
            }
        }

        // Show success
        successDiv.classList.remove('hidden');
        const successText = successDiv.querySelector('span');
        if (successText) {
            successText.textContent = 'Pendaftaran berhasil! Silakan login.' + referralNotice;
        }
        
        // Reset form
        document.getElementById('register-form').reset();
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
            showLogin();
        }, 2000);
        
    } catch (error) {
        console.error('Registration error:', error);
        const errorCode = String(error.code || error.message || '').toUpperCase();
        if (errorCode.indexOf('DUPLICATE_PHONE') !== -1) {
            errorText.textContent = 'Nomor WhatsApp sudah terdaftar';
        } else if (errorCode.indexOf('RATE_LIMITED') !== -1) {
            errorText.textContent = 'Terlalu banyak percobaan pendaftaran. Coba lagi sebentar.';
        } else {
            errorText.textContent = 'Terjadi kesalahan. Silakan coba lagi.';
        }
        errorDiv.classList.remove('hidden');
    } finally {
        registerBtn.disabled = false;
        registerBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg> Daftar';
    }
});

/**
 * Handle forgot PIN form submission
 */
document.getElementById('forgot-pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const whatsapp = document.getElementById('forgot-whatsapp').value.trim();
    const errorDiv = document.getElementById('forgot-error');
    const errorText = document.getElementById('forgot-error-text');
    const forgotBtn = document.getElementById('forgot-btn');
    
    const normalizedPhone = normalizePhoneTo08(whatsapp);
    if (!normalizedPhone) {
        errorDiv.classList.remove('hidden');
        errorText.textContent = 'Gunakan format 08xxxxxxxxxx';
        return;
    }
    errorDiv.classList.add('hidden');
    
    // Show loading
    forgotBtn.disabled = true;
    forgotBtn.innerHTML = '<svg class="animate-spin h-5 w-5 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
    
    try {
        // Strict-public: tidak melakukan enumerasi user dari sheet users.
        alert(`Untuk reset PIN, hubungi admin melalui WhatsApp terdaftar: ${normalizedPhone}.`);
        const waLinkPhone = normalizedPhone.replace(/^0/, '62');
        const popup = window.open(`https://wa.me/628993370200?text=Halo, saya ingin reset PIN akun saya. Nomor WhatsApp: ${waLinkPhone}`, '_blank', 'noopener,noreferrer');
        if (popup) popup.opener = null;
        
        // Back to login
        setTimeout(() => {
            showLogin();
        }, 1000);
        
    } catch (error) {
        console.error('Forgot PIN error:', error);
        errorText.textContent = 'Terjadi kesalahan. Silakan coba lagi.';
        errorDiv.classList.remove('hidden');
    } finally {
        forgotBtn.disabled = false;
        forgotBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg> Kirim Kode Verifikasi';
    }
});

/**
 * Open edit profile modal
 */
function openEditProfile() {
    const user = getLoggedInUser();
    if (!user) return;
    
    // Populate form
    document.getElementById('edit-name').value = user.nama;
    
    // Clear PIN fields
    document.getElementById('edit-old-pin').value = '';
    document.getElementById('edit-new-pin').value = '';
    document.getElementById('edit-confirm-pin').value = '';
    
    // Hide error
    document.getElementById('edit-error').classList.add('hidden');
    
    // Show modal
    document.getElementById('edit-profile-modal').classList.remove('hidden');
}

/**
 * Close edit profile modal
 */
function closeEditProfile() {
    document.getElementById('edit-profile-modal').classList.add('hidden');
}

/**
 * Handle edit profile form submission
 */
document.getElementById('edit-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const user = getLoggedInUser();
    if (!user) return;
    
    const name = document.getElementById('edit-name').value.trim();
    const oldPin = document.getElementById('edit-old-pin').value.trim();
    const newPin = document.getElementById('edit-new-pin').value.trim();
    const confirmPin = document.getElementById('edit-confirm-pin').value.trim();
    
    const errorDiv = document.getElementById('edit-error');
    const errorText = document.getElementById('edit-error-text');
    const saveBtn = document.getElementById('edit-save-btn');
    
    errorDiv.classList.add('hidden');
    
    // Validate name
    const nameWithoutSpaces = name.replace(/\s/g, '');
    if (nameWithoutSpaces.length < 4) {
        errorText.textContent = 'Masukkan Nama Lengkap';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // If changing PIN, validate
    if (oldPin || newPin || confirmPin) {
        if (!oldPin || !newPin || !confirmPin) {
            errorText.textContent = 'Lengkapi semua field PIN';
            errorDiv.classList.remove('hidden');
            return;
        }
        
        if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
            errorText.textContent = 'PIN baru harus 6 digit angka';
            errorDiv.classList.remove('hidden');
            return;
        }
        
        if (newPin !== confirmPin) {
            errorText.textContent = 'PIN baru tidak cocok';
            errorDiv.classList.remove('hidden');
            return;
        }
    }
    
    // Show loading
    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan...';
    
    try {
        const sessionToken = String(user.session_token || '').trim();
        if (!sessionToken) {
            throw createAkunError(SESSION_INVALID_MESSAGE, 'UNAUTHORIZED_SESSION');
        }

        const payload = parsePublicSuccess(
            await akunApiPost({
                action: 'public_update_profile',
                data: {
                    session_token: sessionToken,
                    nama: name,
                    old_pin: oldPin,
                    new_pin: newPin,
                    confirm_pin: confirmPin
                }
            }),
            'Gagal memperbarui profil.'
        );
        const updatedUser = payload && payload.user ? payload.user : user;
        saveLoggedInUser(updatedUser);
        
        // Update display
        document.getElementById('user-name').textContent = updatedUser.nama || name;
        
        // Close modal
        closeEditProfile();
        
        alert('Profil berhasil diperbarui!');
        
    } catch (error) {
        console.error('Edit profile error:', error);
        const code = String(error.code || error.message || '').toUpperCase();
        if (code.indexOf('OLD_PIN_INVALID') !== -1) {
            errorText.textContent = 'PIN lama salah';
        } else if (code.indexOf('UNAUTHORIZED_SESSION') !== -1) {
            errorText.textContent = SESSION_INVALID_MESSAGE;
        } else {
            errorText.textContent = 'Terjadi kesalahan. Silakan coba lagi.';
        }
        errorDiv.classList.remove('hidden');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Simpan';
    }
});

/**
 * Show order detail modal with animated timeline
 */
function showOrderDetailModal(order) {
    // Update order info
    document.getElementById('tracking-order-id').textContent = order.id || 'N/A';
    
    // Get date from sheet (priority: tanggal column)
    const dateValue = order.tanggal || order.tanggal_pesanan || order.timestamp || order.date || order.created_at;
    document.getElementById('tracking-order-date').textContent = formatDate(dateValue);
    
    // Update status badge (normalize first)
    const status = normalizeStatus(order.status || 'Menunggu');
    const statusBadge = getStatusBadge(status);
    const statusBadgeElement = document.getElementById('tracking-status-badge');
    if (statusBadgeElement) {
        statusBadgeElement.innerHTML = statusBadge;
    }
    
    // Update order details (use 'total' column from sheet)
    document.getElementById('tracking-products').textContent = order.produk || order.items || order.product_name || 'N/A';
    document.getElementById('tracking-total').textContent = formatCurrency(order.total || order.total_bayar || 0);
    
    // Create animated timeline
    const timeline = createAnimatedTimeline(status);
    document.getElementById('tracking-timeline').innerHTML = timeline;
    
    // Show modal
    document.getElementById('order-tracking-modal').classList.remove('hidden');
}

/**
 * Create animated status timeline (horizontal layout)
 */
function createAnimatedTimeline(currentStatus) {
    const statuses = [
        { name: 'Menunggu', gif: 'wait.gif', key: 'Menunggu' },
        { name: 'Diproses', gif: 'grocery-basket.gif', key: 'Diproses' },
        { name: 'Dikirim', gif: 'grocery.gif', key: 'Dikirim' },
        { name: 'Diterima', gif: 'shipping.gif', key: 'Diterima' }
    ];
    
    // Find current status index
    let currentIndex = statuses.findIndex(s => s.key === currentStatus);
    
    // Handle Dibatalkan status separately
    if (currentStatus === 'Dibatalkan') {
        return `
            <div class="flex items-center justify-center gap-3 py-4">
                <div class="bg-red-500 w-12 h-12 rounded-full flex items-center justify-center animate-pulse">
                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </div>
                <div>
                    <p class="font-bold text-red-600">Dibatalkan</p>
                    <p class="text-xs text-gray-500">Pesanan telah dibatalkan</p>
                </div>
            </div>
        `;
    }
    
    // If status not found, default to first status
    if (currentIndex === -1) currentIndex = 0;
    
    // Create horizontal timeline
    return `
        <div class="flex items-center justify-between gap-2 py-2">
            ${statuses.map((s, index) => {
                const isActive = index <= currentIndex;
                const isCurrent = index === currentIndex;
                const isLast = index === statuses.length - 1;
                const gifPath = `./assets/images/${s.gif}`;
                const safeImage = sanitizeUrl(gifPath, './assets/images/wait.gif');
                
                return `
                    <div class="flex flex-col items-center flex-1">
                        <div class="${isActive ? 'bg-green-50' : 'bg-gray-100'} w-12 h-12 rounded-full flex items-center justify-center ${isCurrent ? 'ring-2 ring-green-500 ring-offset-2' : ''}">
                            <img src="${safeImage}" alt="${s.name}" class="w-8 h-8 object-contain ${isActive ? '' : 'opacity-40'}" data-fallback-src="${gifPath}">
                        </div>
                        <p class="text-[10px] font-semibold mt-2 text-center ${isActive ? 'text-gray-800' : 'text-gray-400'}">${s.name}</p>
                        ${isCurrent ? '<p class="text-[8px] text-green-600 font-bold mt-0.5">● Saat ini</p>' : '<p class="text-[8px] text-transparent mt-0.5">●</p>'}
                    </div>
                    ${!isLast ? `
                        <div class="flex-shrink-0 w-8 h-0.5 ${isActive && index < currentIndex ? 'bg-green-500' : 'bg-gray-300'} transition-all duration-500 mb-6"></div>
                    ` : ''}
                `;
            }).join('')}
        </div>
    `;
}

/**
 * Close order tracking modal
 */
function closeOrderTracking() {
    document.getElementById('order-tracking-modal').classList.add('hidden');
}

/**
 * Open reward modal (using existing modal from homepage)
 */
/**
 * Update order card to add tracking button
 */
const originalCreateOrderCard = createOrderCard;
createOrderCard = function(order) {
    const card = originalCreateOrderCard(order);
    
    // Add click event to open tracking
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
        showOrderDetailModal(order);
    });
    
    return card;
};

/**
 * Switch between reward tabs
 */
function switchRewardTab(tab) {
    const exchangeTab = document.getElementById('tab-exchange');
    const historyTab = document.getElementById('tab-history');
    const exchangeContent = document.getElementById('exchange-content');
    const historyContent = document.getElementById('history-content');
    
    if (tab === 'exchange') {
        // Activate exchange tab
        exchangeTab.classList.add('text-amber-600', 'border-amber-600');
        exchangeTab.classList.remove('text-gray-400', 'border-transparent');
        historyTab.classList.add('text-gray-400', 'border-transparent');
        historyTab.classList.remove('text-amber-600', 'border-amber-600');
        
        exchangeContent.classList.remove('hidden');
        historyContent.classList.add('hidden');
        
        // Load reward items when switching to exchange tab
        fetchRewardItemsForAkun();
    } else if (tab === 'history') {
        // Activate history tab
        historyTab.classList.add('text-amber-600', 'border-amber-600');
        historyTab.classList.remove('text-gray-400', 'border-transparent');
        exchangeTab.classList.add('text-gray-400', 'border-transparent');
        exchangeTab.classList.remove('text-amber-600', 'border-amber-600');
        
        historyContent.classList.remove('hidden');
        exchangeContent.classList.add('hidden');
        
        // Load claims history when switching to this tab
        loadClaimsHistory();
    }
}

/**
 * Load claims history from the claims sheet
 */
async function loadClaimsHistory() {
    const user = getLoggedInUser();
    if (!user) return;
    
    const loadingDiv = document.getElementById('claims-loading');
    const emptyDiv = document.getElementById('claims-empty');
    const claimsList = document.getElementById('claims-list');
    
    // Show loading
    loadingDiv.classList.remove('hidden');
    emptyDiv.classList.add('hidden');
    claimsList.innerHTML = '';
    
    try {
        const sessionQuery = buildSessionQuery(user);
        if (!sessionQuery) {
            throw createAkunError(SESSION_INVALID_MESSAGE, 'UNAUTHORIZED_SESSION');
        }
        const payload = parsePublicSuccess(
            await akunApiGet(`?action=public_claim_history${sessionQuery}`),
            'Gagal memuat riwayat klaim.'
        );
        const claimsData = Array.isArray(payload.claims) ? payload.claims : [];
        
        // Hide loading
        loadingDiv.classList.add('hidden');
        
        if (!claimsData || claimsData.length === 0) {
            emptyDiv.classList.remove('hidden');
            return;
        }
        
        // Sort by date (newest first)
        claimsData.sort((a, b) => {
            const dateA = new Date(a.tanggal || a.date || 0);
            const dateB = new Date(b.tanggal || b.date || 0);
            return dateB - dateA;
        });
        
        // Render claims
        claimsData.forEach(claim => {
            const claimCard = createClaimCard(claim);
            claimsList.appendChild(claimCard);
        });
        
    } catch (error) {
        console.error('Error loading claims history:', error);
        loadingDiv.classList.add('hidden');
        emptyDiv.classList.remove('hidden');
    }
}

/**
 * Create a claim card element
 */
function createClaimCard(claim) {
    const card = document.createElement('div');
    card.className = 'border border-gray-200 rounded-xl p-4 hover:shadow-md transition';
    
    // Status colors
    const statusColors = {
        'pending': 'bg-yellow-100 text-yellow-700',
        'approved': 'bg-green-100 text-green-700',
        'completed': 'bg-blue-100 text-blue-700',
        'rejected': 'bg-red-100 text-red-700'
    };
    
    const status = (claim.status || 'pending').toLowerCase();
    const statusColor = statusColors[status] || 'bg-gray-100 text-gray-700';
    
    // Status labels in Indonesian
    const statusLabels = {
        'pending': 'Menunggu',
        'approved': 'Disetujui',
        'completed': 'Selesai',
        'rejected': 'Ditolak'
    };
    
    const statusLabel = statusLabels[status] || claim.status || 'Menunggu';
    
    // Format date
    const date = new Date(claim.tanggal || claim.date);
    const formattedDate = date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    
    card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
            <div class="flex-1">
                <h5 class="font-bold text-gray-800">${escapeHtml(claim.hadiah || claim.reward || 'Reward')}</h5>
                <p class="text-xs text-gray-500 mt-1">${formattedDate}</p>
            </div>
            <span class="${statusColor} text-xs font-bold px-3 py-1 rounded-full">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="flex items-center justify-between pt-3 border-t border-gray-100">
            <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span class="text-sm font-semibold text-gray-700">${claim.poin || 0} Poin</span>
            </div>
            ${claim.id ? `<span class="text-xs text-gray-400">#${escapeHtml(claim.id)}</span>` : ''}
        </div>
    `;
    
    return card;
}

/**
 * Close loyalty modal
 */
function closeLoyaltyModal() {
    document.getElementById('loyalty-modal').classList.add('hidden');
    // Reset to exchange tab
    switchRewardTab('exchange');
}

/**
 * Update openRewardModal to load points and open modal
 */
async function openRewardModal() {
    const user = getLoggedInUser();
    if (!user) return;
    
    // Load and display user's current points
    await loadModalPoints();
    
    // Set reward context from user data
    const pointsEl = document.getElementById('loyalty-modal-points');
    const userPoints = pointsEl ? parseInt(pointsEl.textContent || '0') : 0;
    setRewardContextFromAkun(user.whatsapp, userPoints, user.nama);
    
    // Show modal
    document.getElementById('loyalty-modal').classList.remove('hidden');
    
    // Default to exchange tab
    switchRewardTab('exchange');
    
    // Fetch reward items for the exchange tab
    fetchRewardItemsForAkun();
}

/**
 * Load points for the modal display
 */
async function loadModalPoints() {
    const user = getLoggedInUser();
    if (!user) return;
    const fallbackPoints = parseInt(user.total_points || user.points || user.poin || 0, 10) || 0;
    const pointsEl = document.getElementById('loyalty-modal-points');
    if (!pointsEl) return;

    try {
        const sessionQuery = buildSessionQuery(user);
        if (!sessionQuery) {
            pointsEl.textContent = String(fallbackPoints);
            return;
        }
        const payload = parsePublicSuccess(
            await akunApiGet(`?action=public_user_points${sessionQuery}`),
            'Gagal memuat poin.'
        );
        pointsEl.textContent = String(parseInt(payload.points || 0, 10) || 0);
    } catch (error) {
        console.error('Error loading modal points:', error);
        pointsEl.textContent = String(fallbackPoints);
    }
}

var escapeHtml = (window.FrontendSanitize && window.FrontendSanitize.escapeHtml) || ((text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
});
var sanitizeUrl = (window.FrontendSanitize && window.FrontendSanitize.sanitizeUrl) || ((url) => String(url || ''));
var ensureImageFallbackHandler = (window.FrontendSanitize && window.FrontendSanitize.ensureImageFallbackHandler) || (() => {});

ensureImageFallbackHandler();

/**
 * Hide all reward loaders (for akun page modal)
 */
function hideRewardLoaders() {
    const loadingEl = document.getElementById('reward-items-loading');
    const legacyLoadingEl = document.getElementById('rewards-loading');
    
    if (loadingEl) loadingEl.classList.add('hidden');
    if (legacyLoadingEl) legacyLoadingEl.classList.add('hidden');
}

/**
 * Fetch reward items via strict-public catalog endpoint for akun page
 */
async function fetchRewardItemsForAkun() {
    const loadingEl = document.getElementById('reward-items-loading');
    const emptyEl = document.getElementById('reward-items-empty');
    const listEl = document.getElementById('reward-items-list');
    
    if (!listEl) return;
    
    // Show loading state
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');
    listEl.innerHTML = '';
    
    try {
        const user = getLoggedInUser();
        const sessionQuery = buildSessionQuery(user);
        if (!sessionQuery) {
            throw createAkunError(SESSION_INVALID_MESSAGE, 'UNAUTHORIZED_SESSION');
        }
        const payload = parsePublicSuccess(
            await akunApiGet(`?action=public_rewards_catalog${sessionQuery}`),
            'Gagal memuat daftar hadiah.'
        );
        const items = Array.isArray(payload.rewards) ? payload.rewards : [];
        
        // Render items
        renderRewardItemsListAkun(items);
        
    } catch (error) {
        console.error('Error fetching reward items:', error);
        
        // Hide empty state
        if (emptyEl) emptyEl.classList.add('hidden');
        
        // Show error message
        listEl.innerHTML = `
            <div class="text-center py-6 bg-red-50 rounded-2xl border-2 border-dashed border-red-200">
                <p class="text-xs text-red-600 font-semibold">Gagal memuat hadiah. Silakan coba lagi nanti.</p>
            </div>
        `;
    } finally {
        // Always hide loaders in finally block
        hideRewardLoaders();
    }
}

/**
 * Render reward items list for akun page
 */
function renderRewardItemsListAkun(items) {
    const emptyEl = document.getElementById('reward-items-empty');
    const listEl = document.getElementById('reward-items-list');
    
    if (!listEl) return;
    
    // Check if items is empty
    if (!items || items.length === 0) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        listEl.innerHTML = '';
        return;
    }
    
    // Hide empty state
    if (emptyEl) emptyEl.classList.add('hidden');
    
    // Render items with image on left, matching reference style
    listEl.innerHTML = items.map(item => {
        const id = escapeHtml((item.id || '').toString());
        const nama = escapeHtml((item.nama || item.judul || 'Hadiah').toString());
        const poin = parseInt(item.poin || item.Poin || 0);
        const gambar = (item.gambar || 'https://via.placeholder.com/80?text=Reward').toString();
        const safeImage = sanitizeUrl(gambar, 'https://via.placeholder.com/80?text=Reward');
        const deskripsi = escapeHtml((item.deskripsi || '').toString());
        
        return `
            <div class="border-2 border-gray-200 rounded-xl p-4 hover:border-amber-500 transition">
                <div class="flex gap-3 mb-3">
                    <!-- Left: Image -->
                    <div class="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        <img src="${safeImage}" alt="${nama}" class="w-full h-full object-cover" data-fallback-src="https://via.placeholder.com/80?text=Reward">
                    </div>
                    
                    <!-- Middle: Title & Description -->
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-gray-800 text-sm mb-1">${nama}</p>
                        <p class="text-xs text-gray-500 line-clamp-2">${deskripsi}</p>
                    </div>
                    
                    <!-- Right: Badge -->
                    <div class="flex-shrink-0">
                        <span class="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">${poin} Poin</span>
                    </div>
                </div>
                
                <!-- Full-width Button -->
                <button class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 rounded-lg transition text-sm" onclick="handleTukarSekarangAkun('${id}')">
                    Tukar Sekarang
                </button>
            </div>
        `;
    }).join('');
}

/**
 * Set reward context from akun page automatically
 * @param {string} userPhone - User's phone number
 * @param {number} userPoints - User's current points
 * @param {string} userName - User's name
 */
function setRewardContextFromAkun(userPhone, userPoints, userName) {
    if (userPhone) {
        sessionStorage.setItem('reward_phone', userPhone);
        console.log('✅ Reward context set - phone:', userPhone);
    }
    if (userPoints !== undefined && userPoints !== null) {
        sessionStorage.setItem('user_points', userPoints.toString());
        console.log('✅ Reward context set - points:', userPoints);
    }
    if (userName) {
        sessionStorage.setItem('reward_customer_name', userName);
        console.log('✅ Reward context set - name:', userName);
    }
}

/**
 * Handle "Tukar Sekarang" button click from akun page
 * Ensures reward context is set before opening confirmation modal
 * @param {string} rewardId - ID of the reward to exchange
 */
function handleTukarSekarangAkun(rewardId) {
    const user = getLoggedInUser();
    if (!user) {
        showToast('Mohon login terlebih dahulu.');
        return;
    }
    
    // Get user's current points from the akun page display
    const pointsEl = document.getElementById('loyalty-points');
    const userPoints = pointsEl ? parseInt(pointsEl.textContent || '0') : 0;
    
    // Set reward context automatically with phone, points, and name
    setRewardContextFromAkun(user.whatsapp, userPoints, user.nama);
    
    // Call the existing showConfirmTukarModal function
    if (typeof showConfirmTukarModal === 'function') {
        showConfirmTukarModal(rewardId);
    } else if (typeof window.claimReward === 'function') {
        // Fallback to claimReward if showConfirmTukarModal is not available
        window.claimReward(rewardId);
    } else {
        showToast('Fitur tukar poin akan segera hadir!');
    }
}


/**
 * Hide mobile bottom navigation when user is logged in (dashboard view)
 */
function hideMobileBottomNavOnDashboard() {
    const bottomNav = document.getElementById('mobile-bottom-nav');
    const dashboardSection = document.getElementById('dashboard-section');
    
    if (bottomNav && dashboardSection) {
        // Check if dashboard is visible (user is logged in)
        if (!dashboardSection.classList.contains('hidden')) {
            bottomNav.classList.add('hidden');
        } else {
            bottomNav.classList.remove('hidden');
        }
    }
}

// Call on page load and after login
document.addEventListener('DOMContentLoaded', function() {
    // Initial check
    setTimeout(hideMobileBottomNavOnDashboard, 100);
});

// Hook into showDashboard to hide bottom nav
const originalShowDashboard = showDashboard;
showDashboard = function(user) {
    if (typeof originalShowDashboard === 'function') {
        originalShowDashboard(user);
    }
    // Hide bottom nav after showing dashboard
    setTimeout(hideMobileBottomNavOnDashboard, 100);
};

// Hook into showLogin to show bottom nav
const originalShowLogin = showLogin;
showLogin = function() {
    if (typeof originalShowLogin === 'function') {
        originalShowLogin();
    }
    // Show bottom nav when back to login
    const bottomNav = document.getElementById('mobile-bottom-nav');
    if (bottomNav) {
        bottomNav.classList.remove('hidden');
    }
};
