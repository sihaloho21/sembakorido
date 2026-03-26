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
    notifications: {
        loadingId: 'notifications-loading',
        errorId: 'notifications-error',
        errorTextId: 'notifications-error-text',
        loginCtaId: 'notifications-login-cta',
        retryAction: 'retry-notifications'
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
let sessionRecoveryTriggered = false;
const NOTIFICATION_REFRESH_INTERVAL_MS = 60000;
let notificationRefreshTimer = null;
let notificationRefreshInFlight = false;
let notificationState = {
    all: [],
    unreadCount: 0,
    lastOpenedId: '',
    detailAction: null,
    lastSyncedAt: '',
    requestedDetailHandled: false
};

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
        if (showLogin) {
            invalidateLocalSessionAndShowLogin(SESSION_INVALID_MESSAGE);
        }
    }
    if (errorEl) errorEl.classList.remove('hidden');
}

function invalidateLocalSessionAndShowLogin(message) {
    if (sessionRecoveryTriggered) return;
    sessionRecoveryTriggered = true;
    try {
        localStorage.removeItem('gosembako_user');
    } catch (error) {
        console.warn('Failed clearing gosembako_user:', error);
    }
    showLogin();
    if (message) showError(message);
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

function buildNotificationLocalReadKey(phone) {
    const normalizedPhone = normalizePhoneTo08(phone);
    return `gos_notifications_read_v1:${normalizedPhone || 'guest'}`;
}

function getNotificationLocalReadMap(phone) {
    try {
        const raw = localStorage.getItem(buildNotificationLocalReadKey(phone));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.warn('Failed reading notification local read map:', error);
        return {};
    }
}

function setNotificationLocalReadMap(phone, map) {
    try {
        localStorage.setItem(buildNotificationLocalReadKey(phone), JSON.stringify(map || {}));
    } catch (error) {
        console.warn('Failed persisting notification local read map:', error);
    }
}

function parseNotificationBool(value) {
    if (value === true) return true;
    const normalized = String(value === undefined ? '' : value).trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function normalizeNotificationAudience(value, fallbackPhone) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'personal' || normalized === 'private' || normalized === 'order_status') return 'personal';
    if (normalized === 'public' || normalized === 'broadcast' || normalized === 'all' || normalized === 'public_announcement') return 'public';
    return fallbackPhone ? 'personal' : 'public';
}

function normalizeNotificationPriority(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'high' || normalized === 'low') return normalized;
    return 'normal';
}

function normalizeNotificationIcon(value) {
    const normalized = String(value || '').trim().toLowerCase();
    const iconMap = {
        announcement: 'announcement',
        pengumuman: 'announcement',
        promo: 'promo',
        order: 'order',
        pesanan: 'order',
        truck: 'truck',
        shipping: 'truck',
        pengiriman: 'truck',
        feature: 'feature',
        fitur: 'feature',
        maintenance: 'maintenance',
        security: 'security',
        keamanan: 'security'
    };
    return iconMap[normalized] || 'announcement';
}

function getNotificationPriorityRank(priority) {
    const normalized = normalizeNotificationPriority(priority);
    if (normalized === 'high') return 3;
    if (normalized === 'normal') return 2;
    return 1;
}

function parseNotificationDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct;
    if (raw.includes('/')) {
        const parts = raw.split(',');
        const dateOnly = parts[0] ? parts[0].trim() : raw;
        const bits = dateOnly.split('/');
        if (bits.length === 3) {
            const day = parseInt(bits[0], 10);
            const month = parseInt(bits[1], 10);
            const year = parseInt(bits[2], 10);
            const fallback = new Date(year, month - 1, day);
            if (!Number.isNaN(fallback.getTime())) return fallback;
        }
    }
    return null;
}

function formatNotificationDateTime(value) {
    const parsed = parseNotificationDate(value);
    if (!parsed || Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatNotificationRelativeTime(value) {
    const parsed = parseNotificationDate(value);
    if (!parsed || Number.isNaN(parsed.getTime())) return 'Waktu tidak tersedia';
    const diffMs = Date.now() - parsed.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes <= 1) return 'Baru saja';
    if (diffMinutes < 60) return `${diffMinutes} menit yang lalu`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} jam yang lalu`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `${diffDays} hari yang lalu`;
    return parsed.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function truncateNotificationText(text, maxLength) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    if (raw.length <= maxLength) return raw;
    return `${raw.slice(0, Math.max(0, maxLength - 3))}...`;
}

function normalizeNotificationRecord(raw) {
    const record = raw || {};
    const recipientPhone = normalizePhoneTo08(record.recipient_phone || record.phone || '');
    const createdAt = String(record.created_at || record.createdAt || record.tanggal || record.date || '').trim();
    const updatedAt = String(record.updated_at || record.updatedAt || '').trim();
    const startAt = String(record.start_at || '').trim();
    const endAt = String(record.end_at || '').trim();
    const content = String(record.content || record.message || record.body || '').trim();
    const summary = String(record.summary || record.preview || '').trim() || truncateNotificationText(content, 140);
    const readAt = String(record.read_at || record.readAt || '').trim();

    return {
        id: String(record.id || record.notification_id || '').trim(),
        type: String(record.type || '').trim().toLowerCase(),
        audience: normalizeNotificationAudience(record.audience || record.type, recipientPhone),
        recipientPhone,
        title: String(record.title || 'Notifikasi').trim(),
        summary: summary || 'Notifikasi baru tersedia.',
        content: content || summary || 'Isi notifikasi belum tersedia.',
        icon: normalizeNotificationIcon(record.icon || record.category || record.type),
        priority: normalizeNotificationPriority(record.priority),
        status: String(record.status || 'published').trim().toLowerCase(),
        isPinned: parseNotificationBool(record.is_pinned || record.pinned),
        actionLabel: String(record.action_label || '').trim(),
        actionUrl: String(record.action_url || '').trim(),
        referenceType: String(record.reference_type || '').trim().toLowerCase(),
        referenceId: String(record.reference_id || '').trim(),
        createdAt,
        updatedAt,
        startAt,
        endAt,
        source: String(record.source || '').trim().toLowerCase(),
        readAt,
        isRead: parseNotificationBool(record.is_read) || Boolean(readAt)
    };
}

function isNotificationVisibleForUser(notification, userPhone) {
    const phone = normalizePhoneTo08(userPhone);
    if (!notification || !notification.id) return false;
    if (String(notification.status || '').toLowerCase() !== 'published') return false;

    const startDate = parseNotificationDate(notification.startAt || notification.createdAt);
    const endDate = parseNotificationDate(notification.endAt);
    const now = new Date();
    if (startDate && startDate > now) return false;
    if (endDate && endDate < now) return false;

    if (notification.audience === 'personal') {
        return normalizePhoneTo08(notification.recipientPhone) === phone;
    }
    return true;
}

function sortNotificationsForUser(rows) {
    return (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
        if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
        const priorityDelta = getNotificationPriorityRank(b.priority) - getNotificationPriorityRank(a.priority);
        if (priorityDelta !== 0) return priorityDelta;
        const dateA = parseNotificationDate(a.updatedAt || a.createdAt || a.startAt) || new Date(0);
        const dateB = parseNotificationDate(b.updatedAt || b.createdAt || b.startAt) || new Date(0);
        return dateB - dateA;
    });
}

function getNotificationIconHtml(iconKey) {
    const icon = normalizeNotificationIcon(iconKey);
    const map = {
        announcement: {
            bg: 'bg-green-100 text-green-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19a1 1 0 001.993.117L13 19v-4.382a1 1 0 01.883-.993L14 13.618l4.447-.741A2 2 0 0020 10.903V8.097a2 2 0 00-1.553-1.974L14 5.382a1 1 0 01-.993-.883L13 4.382V3a1 1 0 10-2 0v2.882zM5 10h3m-3 4h4"></path></svg>'
        },
        promo: {
            bg: 'bg-rose-100 text-rose-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path></svg>'
        },
        order: {
            bg: 'bg-amber-100 text-amber-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>'
        },
        truck: {
            bg: 'bg-indigo-100 text-indigo-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17h6m-6 0a2 2 0 11-4 0m4 0a2 2 0 104 0m0 0h2a2 2 0 002-2v-3.586a1 1 0 00-.293-.707l-2.414-2.414A1 1 0 0015.586 8H13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v9a2 2 0 002 2h1"></path></svg>'
        },
        feature: {
            bg: 'bg-cyan-100 text-cyan-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"></path></svg>'
        },
        maintenance: {
            bg: 'bg-slate-100 text-slate-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
        },
        security: {
            bg: 'bg-emerald-100 text-emerald-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3l7 4v5c0 5-3.438 9.719-7 11-3.562-1.281-7-6-7-11V7l7-4z"></path></svg>'
        }
    };
    const item = map[icon] || map.announcement;
    return `<div class="w-11 h-11 rounded-2xl ${item.bg} flex items-center justify-center shrink-0">${item.svg}</div>`;
}

function updateNotificationUnreadBadges() {
    const bellButtonEl = document.getElementById('notification-bell-button');
    const badgeEl = document.getElementById('notification-unread-badge');
    const dropdownSubtitleEl = document.getElementById('notification-dropdown-subtitle');
    const summaryEl = document.getElementById('notifications-summary-text');
    const topMarkAllEl = document.getElementById('notification-mark-all-top');
    const sectionMarkAllEl = document.getElementById('notification-mark-all-section');
    const unreadCount = notificationState.unreadCount || 0;
    const cappedUnreadCount = unreadCount > 99 ? '99+' : String(unreadCount);

    if (badgeEl) {
        badgeEl.textContent = cappedUnreadCount;
        badgeEl.classList.toggle('hidden', unreadCount <= 0);
        badgeEl.classList.toggle('animate-pulse', unreadCount > 0);
    }
    if (bellButtonEl) {
        bellButtonEl.classList.toggle('bg-amber-50', unreadCount <= 0);
        bellButtonEl.classList.toggle('text-amber-600', unreadCount <= 0);
        bellButtonEl.classList.toggle('text-green-700', unreadCount > 0);
        bellButtonEl.classList.toggle('bg-green-50', unreadCount > 0);
        bellButtonEl.classList.toggle('ring-2', unreadCount > 0);
        bellButtonEl.classList.toggle('ring-green-100', unreadCount > 0);
        const label = unreadCount > 0
            ? `Lihat notifikasi, ada ${cappedUnreadCount} notifikasi baru`
            : 'Lihat notifikasi';
        bellButtonEl.setAttribute('title', label);
        bellButtonEl.setAttribute('aria-label', label);
    }
    if (dropdownSubtitleEl) {
        dropdownSubtitleEl.textContent = unreadCount > 0
            ? `${unreadCount} notifikasi baru menunggu dibaca.`
            : 'Semua notifikasi sudah dibaca.';
    }
    if (summaryEl) {
        const totalCount = Array.isArray(notificationState.all) ? notificationState.all.length : 0;
        if (totalCount === 0) {
            summaryEl.textContent = 'Belum ada notifikasi baru.';
        } else if (unreadCount > 0) {
            summaryEl.textContent = `${unreadCount} notifikasi baru dari total ${totalCount} notifikasi.`;
        } else {
            summaryEl.textContent = `Semua ${totalCount} notifikasi sudah dibaca.`;
        }
    }
    if (topMarkAllEl) topMarkAllEl.classList.toggle('hidden', unreadCount <= 0);
    if (sectionMarkAllEl) sectionMarkAllEl.classList.toggle('hidden', unreadCount <= 0);
}

function createNotificationItemHtml(notification, compactMode) {
    const compact = Boolean(compactMode);
    const unread = !notification.isRead;
    const summaryText = compact
        ? truncateNotificationText(notification.summary || notification.content, 72)
        : truncateNotificationText(notification.summary || notification.content, 150);
    const wrapperClass = compact
        ? 'w-full text-left px-4 py-4 hover:bg-gray-50 transition'
        : `w-full text-left rounded-2xl border p-4 transition ${unread ? 'border-green-200 bg-green-50 hover:bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`;
    return `
        <button type="button" data-action="open-notification" data-id="${escapeHtml(notification.id)}" class="${wrapperClass}">
            <div class="flex items-start gap-3">
                ${getNotificationIconHtml(notification.icon)}
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="text-sm font-bold ${unread ? 'text-gray-900' : 'text-gray-700'}">${escapeHtml(notification.title)}</p>
                            <p class="text-xs ${unread ? 'text-gray-700' : 'text-gray-500'} mt-1 leading-5">${escapeHtml(summaryText || 'Notifikasi baru tersedia.')}</p>
                        </div>
                        ${unread ? '<span class="shrink-0 inline-flex items-center px-2 py-1 rounded-full bg-green-600 text-white text-[10px] font-black uppercase tracking-wide">Baru</span>' : ''}
                    </div>
                    <div class="flex items-center justify-between gap-3 mt-3">
                        <span class="text-[11px] text-gray-500">${escapeHtml(formatNotificationRelativeTime(notification.updatedAt || notification.createdAt || notification.startAt))}</span>
                        ${notification.isPinned ? '<span class="inline-flex items-center px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wide">Pinned</span>' : ''}
                    </div>
                </div>
            </div>
        </button>
    `;
}

function renderNotificationDropdown() {
    const loadingEl = document.getElementById('notification-dropdown-loading');
    const emptyEl = document.getElementById('notification-dropdown-empty');
    const listEl = document.getElementById('notification-dropdown-list');
    if (!loadingEl || !emptyEl || !listEl) return;

    loadingEl.classList.add('hidden');
    const items = Array.isArray(notificationState.all) ? notificationState.all.slice(0, 5) : [];
    if (items.length === 0) {
        emptyEl.classList.remove('hidden');
        listEl.classList.add('hidden');
        listEl.innerHTML = '';
        return;
    }

    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    listEl.innerHTML = items.map((item) => createNotificationItemHtml(item, true)).join('');
}

function renderNotificationCenterList() {
    const emptyEl = document.getElementById('notifications-empty');
    const listEl = document.getElementById('notifications-list');
    if (!emptyEl || !listEl) return;
    const errorEl = document.getElementById('notifications-error');
    const loadingEl = document.getElementById('notifications-loading');
    const hasError = errorEl && !errorEl.classList.contains('hidden');
    const isLoading = loadingEl && !loadingEl.classList.contains('hidden');
    if (hasError || isLoading) {
        emptyEl.classList.add('hidden');
        listEl.classList.add('hidden');
        listEl.innerHTML = '';
        return;
    }
    const items = Array.isArray(notificationState.all) ? notificationState.all : [];
    if (items.length === 0) {
        emptyEl.classList.remove('hidden');
        listEl.classList.add('hidden');
        listEl.innerHTML = '';
        return;
    }
    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    listEl.innerHTML = items.map((item) => createNotificationItemHtml(item, false)).join('');
}

function renderNotificationUI() {
    updateNotificationUnreadBadges();
    renderNotificationDropdown();
    renderNotificationCenterList();
}

function closeNotificationDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
}

function toggleNotificationDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;
    const shouldOpen = dropdown.classList.contains('hidden');
    closeNotificationDropdown();
    if (shouldOpen) dropdown.classList.remove('hidden');
}

function scrollToNotificationSection() {
    const section = document.getElementById('notifications-section');
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    highlightAccountSection(section);
}

function getCurrentNotificationUserPhone() {
    const user = getLoggedInUser();
    return user ? normalizePhoneTo08(user.whatsapp || user.phone || '') : '';
}

function markNotificationReadLocally(notificationId) {
    const targetId = String(notificationId || '').trim();
    if (!targetId) return;
    const phone = getCurrentNotificationUserPhone();
    const localMap = getNotificationLocalReadMap(phone);
    localMap[targetId] = new Date().toISOString();
    setNotificationLocalReadMap(phone, localMap);
    notificationState.all = notificationState.all.map((item) => {
        if (item.id !== targetId) return item;
        return {
            ...item,
            isRead: true,
            readAt: localMap[targetId]
        };
    });
    notificationState.unreadCount = notificationState.all.filter((item) => !item.isRead).length;
    renderNotificationUI();
}

async function markNotificationAsRead(notificationId) {
    const targetId = String(notificationId || '').trim();
    const user = getLoggedInUser();
    if (!user || !targetId) return;
    markNotificationReadLocally(targetId);

    const sessionToken = String(user.session_token || '').trim();
    if (!sessionToken) return;

    try {
        await parsePublicSuccess(
            await akunApiPost({
                action: 'public_mark_notification_read',
                data: {
                    session_token: sessionToken,
                    notification_id: targetId
                }
            }),
            'Gagal memperbarui status baca notifikasi.'
        );
    } catch (error) {
        console.warn('Failed syncing notification read state:', error);
    }
}

async function markAllNotificationsAsRead() {
    const user = getLoggedInUser();
    if (!user) return;
    const unreadItems = notificationState.all.filter((item) => !item.isRead);
    if (unreadItems.length === 0) return;

    unreadItems.forEach((item) => markNotificationReadLocally(item.id));

    const sessionToken = String(user.session_token || '').trim();
    if (!sessionToken) return;
    try {
        await parsePublicSuccess(
            await akunApiPost({
                action: 'public_mark_all_notifications_read',
                data: {
                    session_token: sessionToken
                }
            }),
            'Gagal menandai semua notifikasi sebagai dibaca.'
        );
    } catch (error) {
        console.warn('Failed syncing mark all notifications:', error);
    }
}

function resolveNotificationDetailAction(notification) {
    if (!notification) return null;
    if (notification.actionUrl) {
        return {
            type: 'url',
            label: notification.actionLabel || 'Buka Tautan',
            url: notification.actionUrl
        };
    }
    if (notification.referenceType === 'order' && notification.referenceId) {
        return {
            type: 'order',
            label: notification.actionLabel || 'Lihat Pesanan',
            orderId: notification.referenceId
        };
    }
    return null;
}

function setNotificationDetailAction(actionConfig) {
    const footerEl = document.getElementById('notification-detail-footer');
    const actionBtn = document.getElementById('notification-detail-action-btn');
    notificationState.detailAction = actionConfig || null;
    if (!footerEl || !actionBtn) return;
    if (!actionConfig) {
        footerEl.classList.add('hidden');
        actionBtn.textContent = 'Lihat Terkait';
        return;
    }
    footerEl.classList.remove('hidden');
    actionBtn.textContent = actionConfig.label || 'Lihat Terkait';
}

function closeNotificationDetailModal() {
    const modal = document.getElementById('notification-detail-modal');
    if (modal) modal.classList.add('hidden');
    notificationState.lastOpenedId = '';
    setNotificationDetailAction(null);
}

async function openNotificationDetailModal(notificationId) {
    const targetId = String(notificationId || '').trim();
    const notification = notificationState.all.find((item) => item.id === targetId);
    if (!notification) return;

    const modal = document.getElementById('notification-detail-modal');
    const iconEl = document.getElementById('notification-detail-icon');
    const metaEl = document.getElementById('notification-detail-meta');
    const titleEl = document.getElementById('notification-detail-title');
    const dateEl = document.getElementById('notification-detail-date');
    const summaryEl = document.getElementById('notification-detail-summary');
    const contentEl = document.getElementById('notification-detail-content');

    if (iconEl) iconEl.innerHTML = getNotificationIconHtml(notification.icon);
    if (metaEl) {
        const metaLabel = notification.referenceType === 'order'
            ? 'Status Pesanan'
            : (notification.icon === 'promo' ? 'Promo Publik' : 'Notifikasi');
        metaEl.textContent = metaLabel;
    }
    if (titleEl) titleEl.textContent = notification.title;
    if (dateEl) dateEl.textContent = formatNotificationDateTime(notification.updatedAt || notification.createdAt || notification.startAt);
    if (summaryEl) summaryEl.textContent = notification.summary || 'Notifikasi baru tersedia.';
    if (contentEl) contentEl.textContent = notification.content || notification.summary || 'Isi notifikasi belum tersedia.';
    setNotificationDetailAction(resolveNotificationDetailAction(notification));

    if (modal) modal.classList.remove('hidden');
    notificationState.lastOpenedId = targetId;
    closeNotificationDropdown();
    if (!notification.isRead) {
        await markNotificationAsRead(targetId);
    }
}

function runNotificationDetailAction() {
    const actionConfig = notificationState.detailAction;
    if (!actionConfig) return;

    if (actionConfig.type === 'url' && actionConfig.url) {
        const url = String(actionConfig.url || '').trim();
        if (/^https?:\/\//i.test(url)) {
            const popup = window.open(url, '_blank', 'noopener,noreferrer');
            if (popup) popup.opener = null;
        } else {
            window.location.href = url;
        }
        return;
    }

    if (actionConfig.type === 'order') {
        const orderId = String(actionConfig.orderId || '').trim();
        closeNotificationDetailModal();
        const targetOrder = Array.isArray(window.allOrders)
            ? window.allOrders.find((item) => String(item && (item.id || item.order_id) || '').trim() === orderId)
            : null;
        if (targetOrder) {
            showOrderDetailModal(targetOrder);
            return;
        }
        const ordersSection = document.getElementById('orders-section');
        if (ordersSection) {
            ordersSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            highlightAccountSection(ordersSection);
        }
    }
}

function mergeNotificationLocalReadState(rows, userPhone) {
    const phone = normalizePhoneTo08(userPhone);
    const localMap = getNotificationLocalReadMap(phone);
    return sortNotificationsForUser((Array.isArray(rows) ? rows : []).map((item) => {
        const localReadAt = String(localMap[item.id] || '').trim();
        return {
            ...item,
            readAt: item.readAt || localReadAt,
            isRead: item.isRead || Boolean(localReadAt)
        };
    }));
}

async function fetchNotificationsFallbackDirect(user) {
    const userPhone = normalizePhoneTo08(user && (user.whatsapp || user.phone) || '');
    if (!userPhone) return null;
    try {
        const rows = await akunApiGet('?sheet=notifications', {
            cache: false,
            maxRetries: 1
        });
        if (!Array.isArray(rows)) return null;
        const normalizedRows = rows
            .map((row) => normalizeNotificationRecord(row))
            .filter((notification) => isNotificationVisibleForUser(notification, userPhone));
        return normalizedRows;
    } catch (error) {
        return null;
    }
}

async function loadNotifications(user, options = {}) {
    const silent = Boolean(options && options.silent);
    const userPhone = normalizePhoneTo08(user && (user.whatsapp || user.phone) || '');
    if (!userPhone) {
        notificationState.all = [];
        notificationState.unreadCount = 0;
        notificationState.lastSyncedAt = '';
        renderNotificationUI();
        return;
    }
    if (notificationRefreshInFlight) return;
    notificationRefreshInFlight = true;

    clearSectionError('notifications');
    if (!silent) {
        setSectionLoading('notifications', true);
        notificationState.all = [];
        notificationState.unreadCount = 0;
    }

    const dropdownLoadingEl = document.getElementById('notification-dropdown-loading');
    const dropdownEmptyEl = document.getElementById('notification-dropdown-empty');
    const dropdownListEl = document.getElementById('notification-dropdown-list');
    const listEl = document.getElementById('notifications-list');
    const emptyEl = document.getElementById('notifications-empty');

    if (!silent) {
        if (dropdownLoadingEl) dropdownLoadingEl.classList.remove('hidden');
        if (dropdownEmptyEl) dropdownEmptyEl.classList.add('hidden');
        if (dropdownListEl) {
            dropdownListEl.classList.add('hidden');
            dropdownListEl.innerHTML = '';
        }
        if (listEl) {
            listEl.classList.add('hidden');
            listEl.innerHTML = '';
        }
        if (emptyEl) emptyEl.classList.add('hidden');
    }

    try {
        const sessionQuery = buildSessionQuery(user);
        if (!sessionQuery) {
            throw createAkunError(SESSION_INVALID_MESSAGE, 'UNAUTHORIZED_SESSION');
        }

        let notifications = [];
        try {
            const payload = parsePublicSuccess(
                await akunApiGet(`?action=public_user_notifications${sessionQuery}`),
                'Gagal memuat notifikasi.'
            );
            notifications = Array.isArray(payload.notifications)
                ? payload.notifications.map((row) => normalizeNotificationRecord(row))
                : [];
        } catch (endpointError) {
            const fallbackRows = await fetchNotificationsFallbackDirect(user);
            if (!fallbackRows) {
                throw endpointError;
            }
            notifications = fallbackRows;
        }

        notificationState.all = mergeNotificationLocalReadState(
            notifications.filter((notification) => isNotificationVisibleForUser(notification, userPhone)),
            userPhone
        );
        notificationState.unreadCount = notificationState.all.filter((item) => !item.isRead).length;
        notificationState.lastSyncedAt = new Date().toISOString();
        renderNotificationUI();
        if (!silent) {
            maybeOpenRequestedNotification();
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
        setSectionError('notifications', resolvePublicErrorMessage(error), 'retry-notifications');
        renderNotificationUI();
    } finally {
        if (!silent) {
            setSectionLoading('notifications', false);
            if (dropdownLoadingEl) dropdownLoadingEl.classList.add('hidden');
        }
        notificationRefreshInFlight = false;
        renderNotificationUI();
    }
}

function retryNotificationsSection() {
    const user = getLoggedInUser();
    if (!user) {
        showLogin();
        return;
    }
    loadNotifications(user);
}

function stopNotificationAutoRefresh() {
    if (notificationRefreshTimer) {
        window.clearInterval(notificationRefreshTimer);
        notificationRefreshTimer = null;
    }
}

function refreshNotificationsSilently() {
    const user = getLoggedInUser();
    if (!user || document.hidden) return;
    loadNotifications(user, { silent: true });
}

function startNotificationAutoRefresh() {
    stopNotificationAutoRefresh();
    notificationRefreshTimer = window.setInterval(() => {
        refreshNotificationsSilently();
    }, NOTIFICATION_REFRESH_INTERVAL_MS);
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

function getInitialAccountViewMode() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const mode = String(params.get('mode') || '').trim().toLowerCase();
        const hash = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();

        if (mode === 'register' || hash === 'register' || hash === 'daftar') {
            return 'register';
        }
        if (mode === 'forgot' || hash === 'forgot' || hash === 'lupa-pin') {
            return 'forgot';
        }
    } catch (error) {
        console.warn('Failed parsing initial account view mode:', error);
    }

    return 'login';
}

const ACCOUNT_SECTION_ID_MAP = {
    profile: 'profile-section',
    notifications: 'notifications-section',
    orders: 'orders-section',
    points: 'points-section',
    settings: 'settings-section',
    payments: 'payments-section',
    addresses: 'shipping-address-section'
};

function getRequestedAccountSectionKey() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const sectionFromQuery = String(params.get('section') || '').trim().toLowerCase();
        const sectionFromHash = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
        return sectionFromQuery || sectionFromHash || '';
    } catch (error) {
        console.warn('Failed parsing requested account section:', error);
        return '';
    }
}

function getRequestedNotificationId() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        return String(params.get('notification_id') || params.get('notification') || '').trim();
    } catch (error) {
        console.warn('Failed parsing requested notification id:', error);
        return '';
    }
}

function clearRequestedNotificationId() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('notification_id');
        url.searchParams.delete('notification');
        window.history.replaceState({}, document.title, url.toString());
    } catch (error) {
        console.warn('Failed clearing requested notification id:', error);
    }
}

function highlightAccountSection(target) {
    if (!target) return;
    target.classList.remove('account-section-highlight');
    void target.offsetWidth;
    target.classList.add('account-section-highlight');

    clearTimeout(window.__accountSectionHighlightTimeout);
    window.__accountSectionHighlightTimeout = setTimeout(() => {
        target.classList.remove('account-section-highlight');
    }, 1800);
}

function focusRequestedAccountSection() {
    const sectionKey = getRequestedAccountSectionKey();
    const sectionId = ACCOUNT_SECTION_ID_MAP[sectionKey];
    if (!sectionId) return;

    const target = document.getElementById(sectionId);
    if (!target) return;

    setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        highlightAccountSection(target);
    }, 160);
}

function maybeOpenRequestedNotification() {
    const requestedId = getRequestedNotificationId();
    if (!requestedId || notificationState.requestedDetailHandled) return;
    const exists = notificationState.all.some((item) => item.id === requestedId);
    if (!exists) return;

    notificationState.requestedDetailHandled = true;
    clearRequestedNotificationId();
    setTimeout(() => {
        openNotificationDetailModal(requestedId);
    }, 220);
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
    const initialViewMode = getInitialAccountViewMode();

    const referralInput = document.getElementById('referral-input');
    if (referralInput) {
        referralInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                applyReferralCode();
            }
        });
    }

    const notificationBellButton = document.getElementById('notification-bell-button');
    if (notificationBellButton) {
        notificationBellButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleNotificationDropdown();
        });
    }

    const notificationDropdown = document.getElementById('notification-dropdown');
    if (notificationDropdown) {
        notificationDropdown.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    }

    document.addEventListener('click', (event) => {
        const bellTrigger = event.target.closest('[data-action="toggle-notification-dropdown"]');
        if (bellTrigger) {
            toggleNotificationDropdown();
            return;
        }
        const openNotificationTrigger = event.target.closest('[data-action="open-notification"]');
        if (openNotificationTrigger) {
            openNotificationDetailModal(openNotificationTrigger.getAttribute('data-id'));
            return;
        }
        const markAllNotificationTrigger = event.target.closest('[data-action="mark-all-notifications-read"]');
        if (markAllNotificationTrigger) {
            markAllNotificationsAsRead();
            return;
        }
        const viewAllNotificationsTrigger = event.target.closest('[data-action="view-all-notifications"]');
        if (viewAllNotificationsTrigger) {
            closeNotificationDropdown();
            scrollToNotificationSection();
            return;
        }
        const closeNotificationDetailTrigger = event.target.closest('[data-action="close-notification-detail"]');
        if (closeNotificationDetailTrigger) {
            closeNotificationDetailModal();
            return;
        }
        const notificationDetailActionTrigger = event.target.closest('[data-action="notification-detail-action"]');
        if (notificationDetailActionTrigger) {
            runNotificationDetailAction();
            return;
        }
        const showLoginTrigger = event.target.closest('[data-action="show-login"]');
        if (showLoginTrigger) {
            showLogin();
            return;
        }
        const retryNotificationsTrigger = event.target.closest('[data-action="retry-notifications"]');
        if (retryNotificationsTrigger) {
            retryNotificationsSection();
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
            return;
        }

        if (!event.target.closest('#notification-bell-wrap')) {
            closeNotificationDropdown();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        refreshNotificationsSilently();
    });

    window.addEventListener('focus', () => {
        refreshNotificationsSilently();
    });
    
    if (loggedInUser) {
        // User already logged in, show dashboard
        showDashboard(loggedInUser);
    } else if (initialViewMode === 'register') {
        showRegister();
    } else if (initialViewMode === 'forgot') {
        showForgotPIN();
    } else {
        // Show login form
        showLogin();
    }
});

/**
 * Show login section
 */
function showLogin() {
    stopNotificationAutoRefresh();
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('forgot-pin-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
}

/**
 * Show dashboard section
 */
function showDashboard(user) {
    sessionRecoveryTriggered = false;
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('forgot-pin-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
    
    // Display user info
    document.getElementById('user-name').textContent = user.nama;
    document.getElementById('user-whatsapp').textContent = displayPhone(user.whatsapp);
    
    // Load loyalty points from user_points sheet
    loadLoyaltyPoints(user);

    // Load notification center
    loadNotifications(user);
    startNotificationAutoRefresh();

    // Load referral section
    loadReferralData(user);

    // Load paylater section
    loadPaylaterData(user);
    
    // Load order history
    loadOrderHistory(user);
    focusRequestedAccountSection();
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
        stopNotificationAutoRefresh();
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
    const availableProgressEl = document.getElementById('paylater-available-progress');
    const availablePercentEl = document.getElementById('paylater-available-percent');
    const totalEl = document.getElementById('paylater-invoice-total');
    const activeEl = document.getElementById('paylater-invoice-active');
    const overdueEl = document.getElementById('paylater-invoice-overdue');
    const remainingEl = document.getElementById('paylater-remaining-open');

    const limitValue = Math.max(0, parseCurrencyValue(account.credit_limit || 0));
    const usedValue = Math.max(0, parseCurrencyValue(account.used_limit || 0));
    const fallbackAvailable = Math.max(0, limitValue - usedValue);
    const availableValue = Math.max(0, parseCurrencyValue(account.available_limit ?? fallbackAvailable));
    const availablePercent = limitValue > 0
        ? Math.max(0, Math.min(100, Math.round((availableValue / limitValue) * 100)))
        : 0;

    if (statusEl) {
        statusEl.textContent = status || 'inactive';
        statusEl.className = `text-xs font-bold px-2 py-1 rounded-full ${getPaylaterStatusBadgeClass(status)}`;
    }
    if (limitEl) limitEl.textContent = formatCurrency(limitValue);
    if (availableEl) availableEl.textContent = formatCurrency(availableValue);
    if (usedEl) usedEl.textContent = formatCurrency(usedValue);
    if (availableProgressEl) availableProgressEl.style.width = `${availablePercent}%`;
    if (availablePercentEl) availablePercentEl.textContent = `${availablePercent}%`;
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
let openRewardModalInProgress = false;

async function openRewardModal(triggerEvent) {
    const openRewardBtn =
        (triggerEvent && triggerEvent.currentTarget) ||
        document.querySelector('[data-action="open-reward"]');

    if (openRewardModalInProgress) return;
    openRewardModalInProgress = true;
    setButtonLoadingState(openRewardBtn, true, 'Memuat...');

    try {
        const user = getLoggedInUser();
        if (!user) {
            showToast('Mohon login terlebih dahulu.');
            if (typeof showLogin === 'function') showLogin();
            return;
        }

        // Show modal immediately, then hydrate data.
        const modal = document.getElementById('loyalty-modal');
        if (modal) modal.classList.remove('hidden');

        // Default to exchange tab (will trigger rewards loading state).
        switchRewardTab('exchange');

        // Set reward context with fallback points first to avoid delays.
        const fallbackPoints = parseInt(user.total_points || user.points || user.poin || 0, 10) || 0;
        setRewardContextFromAkun(user.whatsapp, fallbackPoints, user.nama);

        // Load fresh points and update context again.
        await loadModalPoints();
        const pointsEl = document.getElementById('loyalty-modal-points');
        const latestPoints = pointsEl ? (parseInt(pointsEl.textContent || '0', 10) || fallbackPoints) : fallbackPoints;
        setRewardContextFromAkun(user.whatsapp, latestPoints, user.nama);
    } finally {
        setButtonLoadingState(openRewardBtn, false);
        openRewardModalInProgress = false;
    }
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

function showToast(message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span>${escapeHtml(String(message || ''))}</span>
    `;
    
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function setButtonLoadingState(button, isLoading, loadingText) {
    const btn = button && button.tagName === 'BUTTON' ? button : null;
    if (!btn) return;

    if (isLoading) {
        if (btn.dataset.loading === '1') return;
        btn.dataset.loading = '1';
        btn.dataset.originalHtml = btn.innerHTML;
        btn.dataset.originalClass = btn.className;
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        btn.className = `${btn.dataset.originalClass || ''} flex items-center justify-center gap-2 opacity-90 cursor-not-allowed`;
        btn.innerHTML = `
            <svg aria-hidden="true" class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>${escapeHtml(String(loadingText || 'Memuat...'))}</span>
        `;
        return;
    }

    if (btn.dataset.loading !== '1') return;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (btn.dataset.originalHtml !== undefined) btn.innerHTML = btn.dataset.originalHtml;
    if (btn.dataset.originalClass !== undefined) btn.className = btn.dataset.originalClass;
    delete btn.dataset.loading;
    delete btn.dataset.originalHtml;
    delete btn.dataset.originalClass;
}

let rewardCatalogCacheAkun = [];

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
        rewardCatalogCacheAkun = items;
        
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
        showToast('Tukar poin harus login dulu. Silakan login terlebih dahulu.');
        if (typeof showLogin === 'function') showLogin();
        setTimeout(() => {
            const phoneInput = document.getElementById('login-whatsapp');
            if (phoneInput) phoneInput.focus();
        }, 50);
        return;
    }
    
    // Get user's current points from the akun page display
    const modalPointsEl = document.getElementById('loyalty-modal-points');
    const pointsEl = modalPointsEl || document.getElementById('loyalty-points');
    const userPoints = pointsEl ? (parseInt(pointsEl.textContent || '0', 10) || 0) : 0;
    
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

let pendingRewardDataAkun = {
    id: null,
    nama: null,
    poin: null,
    gambar: null,
    deskripsi: null
};

let claimWhatsAppUrlAkun = '';
let claimRewardInProgressAkun = false;

function parseRewardPointsValue(value) {
    const normalized = String(value || '0').replace(',', '.');
    const num = parseFloat(normalized);
    return Number.isFinite(num) ? num : 0;
}

function getCurrentUserPointsAkun() {
    const modalPointsEl = document.getElementById('loyalty-modal-points');
    const dashboardPointsEl = document.getElementById('loyalty-points');
    const raw =
        (modalPointsEl && modalPointsEl.textContent) ||
        (dashboardPointsEl && dashboardPointsEl.textContent) ||
        sessionStorage.getItem('user_points') ||
        '0';
    return parseRewardPointsValue(raw);
}

function ensureLoggedInForRewardExchangeAkun() {
    const user = getLoggedInUser();
    if (user) return user;

    showToast('Tukar poin harus login dulu. Silakan login terlebih dahulu.');
    const modalIdsToClose = ['confirm-tukar-modal', 'name-input-modal', 'claim-success-modal', 'loyalty-modal'];
    modalIdsToClose.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    if (typeof showLogin === 'function') showLogin();
    setTimeout(() => {
        const phoneInput = document.getElementById('login-whatsapp');
        if (phoneInput) phoneInput.focus();
    }, 50);

    return null;
}

function findRewardByIdInCatalogAkun(rewardId) {
    const rid = String(rewardId || '').trim();
    if (!rid) return null;
    if (!Array.isArray(rewardCatalogCacheAkun) || rewardCatalogCacheAkun.length === 0) return null;

    return rewardCatalogCacheAkun.find((item) => {
        return String(item && (item.id || item.reward_id || '')).trim() === rid;
    }) || null;
}

async function resolveRewardDetailAkun(rewardId) {
    const cached = findRewardByIdInCatalogAkun(rewardId);
    if (cached) return cached;

    // Best-effort refresh catalog using strict-public endpoint (requires session)
    const user = getLoggedInUser();
    const sessionQuery = buildSessionQuery(user);
    if (sessionQuery) {
        try {
            const payload = parsePublicSuccess(
                await akunApiGet(`?action=public_rewards_catalog${sessionQuery}`),
                'Gagal memuat daftar hadiah.'
            );
            const items = Array.isArray(payload.rewards) ? payload.rewards : [];
            rewardCatalogCacheAkun = items;
            const refreshed = findRewardByIdInCatalogAkun(rewardId);
            if (refreshed) return refreshed;
        } catch (error) {
            console.warn('Failed refreshing rewards catalog:', error);
        }
    }

    // Fallback: direct sheet lookup (public)
    try {
        const rows = await ApiService.get(`?sheet=tukar_poin&action=search&id=${encodeURIComponent(String(rewardId || ''))}`, { cache: false });
        if (Array.isArray(rows) && rows.length > 0) return rows[0];
    } catch (error) {
        console.warn('Failed fetching reward by id:', error);
    }

    return null;
}

function buildClaimRewardErrorMessageAkun(error) {
    const raw = String((error && error.message) || error || '');
    const normalized = raw.toLowerCase();
    if (normalized.includes('reward_stock_empty')) return 'Stok reward sedang habis.';
    if (normalized.includes('reward_daily_quota_reached')) return 'Quota harian reward sudah habis.';
    if (normalized.includes('points_insufficient')) return 'Poin Anda tidak cukup untuk reward ini.';
    if (normalized.includes('user_not_found')) return 'Data poin pengguna tidak ditemukan.';
    if (normalized.includes('rate_limited')) return 'Terlalu banyak percobaan klaim, coba lagi sebentar.';
    return 'Gagal memproses penukaran. Silakan coba lagi.';
}

/**
 * Show confirm modal for reward exchange (akun page)
 */
async function showConfirmTukarModal(rewardId) {
    const user = ensureLoggedInForRewardExchangeAkun();
    if (!user) return;

    // Ensure context is up to date
    const userPoints = getCurrentUserPointsAkun();
    setRewardContextFromAkun(user.whatsapp, userPoints, user.nama);

    if (!sessionStorage.getItem('reward_phone')) {
        showToast('Mohon cek poin Anda terlebih dahulu.');
        return;
    }

    const reward = await resolveRewardDetailAkun(rewardId);
    if (!reward) {
        showToast('Data hadiah tidak ditemukan.');
        return;
    }

    const rewardName = String(reward.nama || reward.judul || reward.reward || 'Hadiah');
    const requiredPoints = parseRewardPointsValue(reward.poin || reward.Poin || reward.points || 0);
    const currentPoints = getCurrentUserPointsAkun();

    if (requiredPoints <= 0) {
        showToast('Poin reward tidak valid.');
        return;
    }

    if (currentPoints < requiredPoints) {
        showToast(`Poin Anda tidak cukup. Dibutuhkan ${requiredPoints} poin, saldo Anda ${currentPoints.toFixed(1)} poin.`);
        return;
    }

    pendingRewardDataAkun = {
        id: String(rewardId || ''),
        nama: rewardName,
        poin: requiredPoints,
        gambar: String(reward.gambar || ''),
        deskripsi: String(reward.deskripsi || '')
    };

    const nameEl = document.getElementById('confirm-reward-name');
    const pointsEl = document.getElementById('confirm-reward-points');
    const remainingEl = document.getElementById('confirm-remaining-points');
    if (nameEl) nameEl.textContent = rewardName;
    if (pointsEl) pointsEl.textContent = String(requiredPoints);
    if (remainingEl) remainingEl.textContent = (currentPoints - requiredPoints).toFixed(1);

    const modal = document.getElementById('confirm-tukar-modal');
    if (modal) modal.classList.remove('hidden');
}

function cancelTukarModal() {
    const modal = document.getElementById('confirm-tukar-modal');
    if (modal) modal.classList.add('hidden');
    pendingRewardDataAkun = { id: null, nama: null, poin: null, gambar: null, deskripsi: null };
}

function proceedToNameInput() {
    const confirmModal = document.getElementById('confirm-tukar-modal');
    if (confirmModal) confirmModal.classList.add('hidden');

    const nameModal = document.getElementById('name-input-modal');
    if (nameModal) nameModal.classList.remove('hidden');

    const input = document.getElementById('claim-name-input');
    if (input && !String(input.value || '').trim()) {
        input.value = String(sessionStorage.getItem('reward_customer_name') || '').trim();
    }
    setTimeout(() => {
        const el = document.getElementById('claim-name-input');
        if (el) el.focus();
    }, 50);
}

function backToConfirmModal() {
    const nameModal = document.getElementById('name-input-modal');
    if (nameModal) nameModal.classList.add('hidden');

    const input = document.getElementById('claim-name-input');
    if (input) input.value = '';

    const confirmModal = document.getElementById('confirm-tukar-modal');
    if (confirmModal) confirmModal.classList.remove('hidden');
}

async function submitNameAndClaim(triggerEvent) {
    if (claimRewardInProgressAkun) return;

    const submitBtn =
        (triggerEvent && triggerEvent.currentTarget) ||
        document.querySelector('[data-action="submit-name-claim"]');
    const backBtn = document.querySelector('[data-action="back-to-confirm"]');
    const input = document.getElementById('claim-name-input');

    const customerName = String(input && input.value ? input.value : '').trim();

    if (!customerName) {
        showToast('Mohon masukkan nama Anda terlebih dahulu.');
        return;
    }

    if (customerName.length < 3) {
        showToast('Nama harus minimal 3 karakter.');
        return;
    }

    claimRewardInProgressAkun = true;
    setButtonLoadingState(submitBtn, true, 'Memproses...');
    if (backBtn) {
        backBtn.disabled = true;
        backBtn.classList.add('opacity-70', 'cursor-not-allowed');
    }
    if (input) input.disabled = true;

    try {
        await processClaimRewardAkun(pendingRewardDataAkun.id, customerName);
    } finally {
        claimRewardInProgressAkun = false;
        setButtonLoadingState(submitBtn, false);
        if (backBtn) {
            backBtn.disabled = false;
            backBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
        if (input) input.disabled = false;
    }
}

async function processClaimRewardAkun(rewardId, customerName) {
    const user = ensureLoggedInForRewardExchangeAkun();
    if (!user) return;

    const phone = String(sessionStorage.getItem('reward_phone') || user.whatsapp || '').trim();
    if (!phone) {
        showToast('Mohon cek poin Anda terlebih dahulu.');
        return;
    }

    if (!rewardId) {
        showToast('Data hadiah tidak ditemukan.');
        return;
    }

    try {
        showToast('Sedang memproses penukaran...');

        const requestId = `RW-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        const claimResult = await GASActions.post({
            action: 'claim_reward',
            sheet: 'tukar_poin',
            data: {
                reward_id: rewardId,
                phone: phone,
                customer_name: customerName,
                request_id: requestId
            }
        });

        const claimId = claimResult.claim_id || ('CLM-' + Date.now().toString().slice(-6));
        const requiredPoints = parseRewardPointsValue(pendingRewardDataAkun.poin || 0);
        const pointsUsed = parseRewardPointsValue(claimResult.points_used || requiredPoints);
        const balanceAfter = parseRewardPointsValue(claimResult.balance_after);
        const currentPoints = getCurrentUserPointsAkun();
        const finalPoints = balanceAfter > 0 ? balanceAfter : Math.max(0, currentPoints - pointsUsed);

        // Update local state and UI
        sessionStorage.setItem('user_points', String(finalPoints));
        const dashboardPointsEl = document.getElementById('loyalty-points');
        const modalPointsEl = document.getElementById('loyalty-modal-points');
        if (dashboardPointsEl) dashboardPointsEl.textContent = String(parseInt(finalPoints, 10) || 0);
        if (modalPointsEl) modalPointsEl.textContent = String(parseInt(finalPoints, 10) || 0);

        // Prepare WhatsApp message
        const rewardName = String(pendingRewardDataAkun.nama || 'Reward');
        const waMessage =
            `*KLAIM REWARD POIN BERHASIL*\n\n` +
            `ID Klaim: ${claimId}\n` +
            `Pelanggan: ${customerName}\n` +
            `Nomor WhatsApp: ${phone}\n` +
            `Reward: ${rewardName}\n` +
            `Poin Ditukar: ${pointsUsed}\n` +
            `Sisa Poin: ${finalPoints.toFixed(1)}\n\n` +
            `Mohon segera diproses. Terima kasih!`;
        claimWhatsAppUrlAkun = `https://wa.me/628993370200?text=${encodeURIComponent(waMessage)}`;

        // Reset pending data & close other modals
        pendingRewardDataAkun = { id: null, nama: null, poin: null, gambar: null, deskripsi: null };
        const confirmModal = document.getElementById('confirm-tukar-modal');
        const nameModal = document.getElementById('name-input-modal');
        if (confirmModal) confirmModal.classList.add('hidden');
        if (nameModal) nameModal.classList.add('hidden');

        // Show success modal
        showClaimSuccessModal(claimId);

        // Refresh claim history if tab is open
        const historyContent = document.getElementById('history-content');
        if (historyContent && !historyContent.classList.contains('hidden')) {
            loadClaimsHistory();
        }

    } catch (error) {
        console.error('Error processing claim:', error);
        showToast(buildClaimRewardErrorMessageAkun(error));
    }
}

function showClaimSuccessModal(claimId) {
    const modal = document.getElementById('claim-success-modal');
    const idEl = document.getElementById('claim-success-id');
    if (idEl) idEl.textContent = String(claimId || '');
    if (modal) modal.classList.remove('hidden');
}

function closeClaimSuccessModal() {
    const modal = document.getElementById('claim-success-modal');
    if (modal) modal.classList.add('hidden');
}

function openClaimWhatsApp() {
    if (!claimWhatsAppUrlAkun) {
        showToast('Link WhatsApp klaim belum tersedia.');
        return;
    }
    const popup = window.open(claimWhatsAppUrlAkun, '_blank', 'noopener,noreferrer');
    if (popup) popup.opener = null;
    setTimeout(() => closeClaimSuccessModal(), 500);
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

window.addEventListener('hashchange', () => {
    if (getLoggedInUser()) {
        focusRequestedAccountSection();
    }
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
