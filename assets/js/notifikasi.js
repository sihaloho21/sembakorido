/*
 * Riwayat Notifikasi Pengguna - Paket Sembako
 * Uses the same public notification contract and per-user read-state key as akun.js.
 */
(() => {
    'use strict';

    const state = {
        all: [],
        filter: 'all',
        detailId: '',
        detailAction: null,
        loading: false
    };

    const $ = (id) => document.getElementById(id);
    const SESSION_INVALID_MESSAGE = 'Session login tidak valid. Silakan login ulang.';
    const NETWORK_ERROR_MESSAGE = 'Gagal memuat data. Periksa koneksi lalu coba lagi.';

    const getLoggedInUser = () => {
        try {
            const raw = localStorage.getItem('gosembako_user');
            if (!raw) return null;
            const user = JSON.parse(raw);
            return user && typeof user === 'object' ? user : null;
        } catch (error) {
            console.warn('Failed reading local user:', error);
            return null;
        }
    };

    const normalizePhoneTo08 = (phone) => {
        const digits = String(phone == null ? '' : phone).replace(/[^0-9]/g, '');
        if (!digits) return '';
        let core = digits;
        if (core.startsWith('62')) core = core.slice(2);
        if (core.startsWith('0')) core = core.slice(1);
        return core.startsWith('8') ? `0${core}` : '';
    };

    const buildSessionQuery = (user) => {
        const token = String(user?.session_token || '').trim();
        return token ? `&session_token=${encodeURIComponent(token)}` : '';
    };

    const parseNotificationDate = (value) => {
        if (!value) return null;
        const raw = String(value).trim();
        if (!raw) return null;
        const direct = new Date(raw);
        if (!Number.isNaN(direct.getTime())) return direct;
        if (raw.includes('/')) {
            const dateOnly = raw.split(',')[0].trim();
            const parts = dateOnly.split('/');
            if (parts.length === 3) {
                const date = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                if (!Number.isNaN(date.getTime())) return date;
            }
        }
        return null;
    };

    const formatDateTime = (value) => {
        const date = parseNotificationDate(value);
        return date ? date.toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
    };

    const formatRelativeTime = (value) => {
        const date = parseNotificationDate(value);
        if (!date) return 'Waktu tidak tersedia';
        const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
        if (diffMinutes <= 1) return 'Baru saja';
        if (diffMinutes < 60) return `${diffMinutes} menit yang lalu`;
        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours} jam yang lalu`;
        const diffDays = Math.round(diffHours / 24);
        if (diffDays < 7) return `${diffDays} hari yang lalu`;
        return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const truncate = (value, maxLength) => {
        const text = String(value || '').trim();
        return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
    };

    const parseBool = (value) => value === true || ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase());
    const normalizeAudience = (value, fallbackPhone) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (['personal', 'private', 'order_status'].includes(normalized)) return 'personal';
        if (['public', 'broadcast', 'all', 'public_announcement'].includes(normalized)) return 'public';
        return fallbackPhone ? 'personal' : 'public';
    };
    const normalizeIcon = (value) => {
        const icon = String(value || '').trim().toLowerCase();
        const map = { pengumuman: 'announcement', announcement: 'announcement', promo: 'promo', order: 'order', pesanan: 'order', truck: 'truck', shipping: 'truck', pengiriman: 'truck', feature: 'feature', fitur: 'feature', maintenance: 'maintenance', security: 'security', keamanan: 'security' };
        return map[icon] || 'announcement';
    };

    const normalizeRecord = (raw) => {
        const record = raw || {};
        const recipientPhone = normalizePhoneTo08(record.recipient_phone || record.phone || '');
        const content = String(record.content || record.message || record.body || '').trim();
        const summary = String(record.summary || record.preview || '').trim() || truncate(content, 140);
        const readAt = String(record.read_at || record.readAt || '').trim();
        return {
            id: String(record.id || record.notification_id || '').trim(),
            type: String(record.type || '').trim().toLowerCase(),
            audience: normalizeAudience(record.audience || record.type, recipientPhone),
            recipientPhone,
            title: String(record.title || 'Notifikasi').trim(),
            summary: summary || 'Notifikasi baru tersedia.',
            content: content || summary || 'Isi notifikasi belum tersedia.',
            icon: normalizeIcon(record.icon || record.category || record.type),
            status: String(record.status || 'published').trim().toLowerCase(),
            actionLabel: String(record.action_label || '').trim(),
            actionUrl: String(record.action_url || '').trim(),
            referenceType: String(record.reference_type || '').trim().toLowerCase(),
            referenceId: String(record.reference_id || '').trim(),
            createdAt: String(record.created_at || record.createdAt || record.tanggal || record.date || '').trim(),
            updatedAt: String(record.updated_at || record.updatedAt || '').trim(),
            startAt: String(record.start_at || '').trim(),
            endAt: String(record.end_at || '').trim(),
            isPinned: parseBool(record.is_pinned || record.pinned),
            readAt,
            isRead: parseBool(record.is_read) || Boolean(readAt)
        };
    };

    const isVisibleForUser = (notification, phone) => {
        if (!notification?.id || notification.status !== 'published') return false;
        const now = new Date();
        const start = parseNotificationDate(notification.startAt || notification.createdAt);
        const end = parseNotificationDate(notification.endAt);
        if (start && start > now) return false;
        if (end && end < now) return false;
        return notification.audience !== 'personal' || normalizePhoneTo08(notification.recipientPhone) === normalizePhoneTo08(phone);
    };

    const getReadMapKey = (phone) => `gos_notifications_read_v1:${normalizePhoneTo08(phone) || 'guest'}`;
    const getReadMap = (phone) => {
        try {
            const parsed = JSON.parse(localStorage.getItem(getReadMapKey(phone)) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return {};
        }
    };
    const setReadMap = (phone, map) => {
        try { localStorage.setItem(getReadMapKey(phone), JSON.stringify(map || {})); } catch (error) { console.warn('Failed persisting notification read state:', error); }
    };

    const mergeReadState = (rows, phone) => {
        const localMap = getReadMap(phone);
        return rows.map((item) => ({ ...item, readAt: item.readAt || localMap[item.id] || '', isRead: item.isRead || Boolean(localMap[item.id]) }))
            .sort((a, b) => {
                const dateA = parseNotificationDate(a.updatedAt || a.createdAt || a.startAt)?.getTime() || 0;
                const dateB = parseNotificationDate(b.updatedAt || b.createdAt || b.startAt)?.getTime() || 0;
                if (dateB !== dateA) return dateB - dateA;
                if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
                return String(b.id).localeCompare(String(a.id));
            });
    };

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

    const iconHtml = (iconKey) => {
        const map = {
            announcement: ['bg-green-100 text-green-700', '<path d="M11 5.882V19a1 1 0 001.993.117L13 19v-4.382a1 1 0 01.883-.993L14 13.618l4.447-.741A2 2 0 0020 10.903V8.097a2 2 0 00-1.553-1.974L14 5.382a1 1 0 00-.993-.883L13 4.382V3a1 1 0 10-2 0v2.882zM5 10h3m-3 4h4"/>'],
            promo: ['bg-rose-100 text-rose-700', '<path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>'],
            order: ['bg-amber-100 text-amber-700', '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>'],
            truck: ['bg-indigo-100 text-indigo-700', '<path d="M9 17h6m-6 0a2 2 0 11-4 0m4 0a2 2 0 104 0m0 0h2a2 2 0 002-2v-3.586a1 1 0 00-.293-.707l-2.414-2.414A1 1 0 0015.586 8H13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v9a2 2 0 002 2h1"/>'],
            feature: ['bg-cyan-100 text-cyan-700', '<path d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"/>'],
            maintenance: ['bg-slate-100 text-slate-700', '<path d="M5 13l4 4L19 7"/>'],
            security: ['bg-emerald-100 text-emerald-700', '<path d="M12 3l7 4v5c0 5-3.438 9.719-7 11-3.562-1.281-7-6-7-11V7l7-4z"/>']
        };
        const item = map[normalizeIcon(iconKey)] || map.announcement;
        return `<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${item[0]}"><svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">${item[1]}</svg></div>`;
    };

    const parseApiSuccess = (payload) => {
        if (payload?.success === true) return payload;
        const code = String(payload?.error || payload?.error_code || '').toLowerCase();
        const message = String(payload?.message || payload?.error || '').trim();
        if (code === 'unauthorized_session' || code === 'session_unavailable' || message.toLowerCase().includes('session login tidak valid')) throw new Error(SESSION_INVALID_MESSAGE);
        throw new Error(message || NETWORK_ERROR_MESSAGE);
    };

    const apiGet = async (endpoint, options = {}) => {
        if (typeof ApiService === 'undefined' || typeof ApiService.get !== 'function') throw new Error('ApiService belum tersedia.');
        return ApiService.get(endpoint, { cache: false, maxRetries: 2, ...options });
    };
    const apiPost = async (payload) => {
        if (typeof ApiService === 'undefined' || typeof ApiService.post !== 'function') throw new Error('ApiService belum tersedia.');
        return ApiService.post('', payload, { cache: false, maxRetries: 2 });
    };

    const parseRows = (payload) => {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.result)) return payload.result;
        return payload?.result ? [payload.result] : [];
    };

    const setVisible = (id, visible) => $(id)?.classList.toggle('hidden', !visible);
    const setLoading = (visible) => {
        state.loading = visible;
        setVisible('notification-history-loading', visible);
        if (visible) {
            setVisible('notification-history-empty', false);
            setVisible('notification-history-error', false);
            setVisible('notification-history-list', false);
        }
    };

    const renderCounts = () => {
        const total = state.all.length;
        const unread = state.all.filter((item) => !item.isRead).length;
        $('notification-count-all').textContent = total;
        $('notification-count-unread').textContent = unread;
        $('notification-count-read').textContent = total - unread;
        $('notification-history-summary').textContent = total === 0 ? 'Belum ada notifikasi baru.' : unread > 0 ? `${unread} notifikasi belum dibaca dari total ${total} notifikasi.` : `Semua ${total} notifikasi sudah dibaca.`;
        const markAll = $('notification-history-mark-all');
        if (markAll) markAll.classList.toggle('hidden', unread === 0);
        const user = getLoggedInUser();
        const label = user?.name || user?.nama || user?.whatsapp || user?.phone || 'akun Anda';
        $('notification-history-subtitle').textContent = total > 0 ? `Informasi terbaru untuk ${label}.` : `Belum ada informasi baru untuk ${label}.`;
    };

    const renderList = () => {
        if (state.loading) return;
        const items = state.all.filter((item) => state.filter === 'all' || (state.filter === 'unread' ? !item.isRead : item.isRead));
        renderCounts();
        setVisible('notification-history-error', false);
        if (!items.length) {
            setVisible('notification-history-list', false);
            setVisible('notification-history-empty', true);
            $('notification-history-empty-title').textContent = state.filter === 'unread' ? 'Semua notifikasi sudah dibaca' : state.filter === 'read' ? 'Belum ada notifikasi dibaca' : 'Belum ada notifikasi';
            $('notification-history-empty-text').textContent = state.filter === 'all' ? 'Informasi penting tentang pesanan dan layanan akan muncul di sini.' : 'Coba pilih filter lainnya untuk melihat notifikasi Anda.';
            return;
        }
        setVisible('notification-history-empty', false);
        setVisible('notification-history-list', true);
        $('notification-history-list').innerHTML = items.map((item) => {
            const unread = !item.isRead;
            return `<button type="button" data-action="open-notification" data-id="${escapeHtml(item.id)}" class="notification-item ${unread ? 'is-unread' : 'bg-white'} w-full rounded-2xl p-4 text-left">
                <div class="flex items-start gap-3 sm:gap-4">
                    ${iconHtml(item.icon)}
                    <div class="min-w-0 flex-1">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0"><p class="text-sm font-extrabold ${unread ? 'text-slate-900' : 'text-slate-700'} break-words">${escapeHtml(item.title)}</p><p class="mt-1 text-sm leading-6 ${unread ? 'text-slate-700' : 'text-slate-500'}">${escapeHtml(truncate(item.summary || item.content, 180))}</p></div>
                            ${unread ? '<span class="shrink-0 rounded-full bg-green-600 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white">Baru</span>' : '<span class="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Dibaca</span>'}
                        </div>
                        <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span>${escapeHtml(formatRelativeTime(item.updatedAt || item.createdAt || item.startAt))}</span>${item.isPinned ? '<span class="rounded-full bg-amber-100 px-2 py-1 font-bold text-amber-700">Pinned</span>' : ''}${item.referenceType === 'order' ? '<span class="rounded-full bg-indigo-50 px-2 py-1 font-bold text-indigo-700">Pesanan</span>' : ''}</div>
                    </div>
                    <svg class="mt-3 h-5 w-5 shrink-0 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </div>
            </button>`;
        }).join('');
    };

    const markReadLocally = (notificationId) => {
        const user = getLoggedInUser();
        const phone = normalizePhoneTo08(user?.whatsapp || user?.phone || '');
        if (!phone) return;
        const readMap = getReadMap(phone);
        const readAt = new Date().toISOString();
        readMap[notificationId] = readAt;
        setReadMap(phone, readMap);
        state.all = state.all.map((item) => item.id === notificationId ? { ...item, isRead: true, readAt } : item);
        renderList();
    };

    const markRead = async (notificationId) => {
        const user = getLoggedInUser();
        if (!user || !notificationId) return;
        markReadLocally(notificationId);
        if (!String(user.session_token || '').trim()) return;
        try {
            parseApiSuccess(await apiPost({ action: 'public_mark_notification_read', data: { session_token: user.session_token, notification_id: notificationId } }));
        } catch (error) {
            console.warn('Failed syncing notification read state:', error);
        }
    };

    const markAllRead = async () => {
        const user = getLoggedInUser();
        if (!user) return;
        const unread = state.all.filter((item) => !item.isRead);
        if (!unread.length) return;
        const phone = normalizePhoneTo08(user.whatsapp || user.phone || '');
        const readMap = getReadMap(phone);
        const readAt = new Date().toISOString();
        unread.forEach((item) => { readMap[item.id] = readAt; });
        setReadMap(phone, readMap);
        state.all = state.all.map((item) => ({ ...item, isRead: true, readAt: item.readAt || readAt }));
        renderList();
        if (!String(user.session_token || '').trim()) return;
        try {
            parseApiSuccess(await apiPost({ action: 'public_mark_all_notifications_read', data: { session_token: user.session_token } }));
        } catch (error) {
            console.warn('Failed syncing all notification read state:', error);
        }
    };

    const resolveAction = (item) => {
        if (item.actionUrl) return { label: item.actionLabel || 'Buka Tautan', url: item.actionUrl };
        if (item.referenceType === 'order' && item.referenceId) return { label: item.actionLabel || 'Lihat Pesanan', url: `transaksi.html?order_id=${encodeURIComponent(item.referenceId)}` };
        return null;
    };

    const closeDetail = () => {
        $('notification-history-detail-modal')?.classList.add('hidden');
        state.detailId = '';
        state.detailAction = null;
    };

    const openDetail = async (notificationId) => {
        const item = state.all.find((notification) => notification.id === String(notificationId));
        if (!item) return;
        $('notification-history-detail-icon').innerHTML = iconHtml(item.icon);
        $('notification-history-detail-meta').textContent = item.referenceType === 'order' ? 'Status Pesanan' : item.icon === 'promo' ? 'Promo Publik' : 'Notifikasi';
        $('notification-history-detail-title').textContent = item.title;
        $('notification-history-detail-date').textContent = formatDateTime(item.updatedAt || item.createdAt || item.startAt);
        $('notification-history-detail-summary').textContent = item.summary || 'Notifikasi baru tersedia.';
        $('notification-history-detail-content').textContent = item.content || item.summary || 'Isi notifikasi belum tersedia.';
        const action = resolveAction(item);
        state.detailId = item.id;
        state.detailAction = action;
        const footer = $('notification-history-detail-footer');
        const actionLink = $('notification-history-detail-action');
        if (action) {
            footer.classList.remove('hidden');
            actionLink.textContent = action.label;
            actionLink.href = action.url;
            actionLink.target = /^https?:\/\//i.test(action.url) ? '_blank' : '_self';
            actionLink.rel = actionLink.target === '_blank' ? 'noopener noreferrer' : '';
        } else {
            footer.classList.add('hidden');
            actionLink.removeAttribute('href');
        }
        $('notification-history-detail-modal').classList.remove('hidden');
        if (!item.isRead) await markRead(item.id);
    };

    const showLoginState = () => {
        setVisible('notification-history-login', true);
        setVisible('notification-history-content', false);
        $('notification-history-subtitle').textContent = 'Silakan masuk untuk mengakses notifikasi Anda.';
    };

    const showError = (message) => {
        setLoading(false);
        setVisible('notification-history-list', false);
        setVisible('notification-history-empty', false);
        setVisible('notification-history-error', true);
        $('notification-history-error-text').textContent = message || NETWORK_ERROR_MESSAGE;
    };

    const loadNotifications = async () => {
        const user = getLoggedInUser();
        const phone = normalizePhoneTo08(user?.whatsapp || user?.phone || '');
        if (!user || !phone || !String(user.session_token || '').trim()) {
            showLoginState();
            return;
        }
        setVisible('notification-history-login', false);
        setVisible('notification-history-content', true);
        setLoading(true);
        try {
            let rows;
            try {
                const payload = parseApiSuccess(await apiGet(`?action=public_user_notifications${buildSessionQuery(user)}`));
                rows = Array.isArray(payload.notifications) ? payload.notifications : [];
            } catch (endpointError) {
                const fallback = parseRows(await apiGet('?sheet=notifications', { maxRetries: 1 }));
                if (!fallback.length) throw endpointError;
                rows = fallback;
            }
            state.all = mergeReadState(rows.map(normalizeRecord).filter((item) => isVisibleForUser(item, phone)), phone);
            setLoading(false);
            renderList();
        } catch (error) {
            console.error('Error loading notification history:', error);
            const errorMessage = String(error.message || '').toLowerCase();
            showError(errorMessage.includes('session') ? SESSION_INVALID_MESSAGE : NETWORK_ERROR_MESSAGE);
        }
    };

    const setFilter = (filter) => {
        state.filter = filter;
        document.querySelectorAll('[data-notification-filter]').forEach((button) => {
            const active = button.dataset.notificationFilter === filter;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        renderList();
    };

    document.addEventListener('click', (event) => {
        const filterButton = event.target.closest('[data-notification-filter]');
        if (filterButton) { setFilter(filterButton.dataset.notificationFilter || 'all'); return; }
        const openButton = event.target.closest('[data-action="open-notification"]');
        if (openButton) { openDetail(openButton.dataset.id); return; }
        if (event.target.closest('[data-action="close-notification-detail"]')) { closeDetail(); return; }
        if (event.target.closest('#notification-history-mark-all')) { markAllRead(); return; }
        if (event.target.id === 'notification-history-detail-modal') closeDetail();
        if (event.target.closest('#notification-history-retry')) loadNotifications();
    });

    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDetail(); });
    window.addEventListener('focus', () => { if (!state.loading && getLoggedInUser()) loadNotifications(); });
    loadNotifications();
})();
