(function () {
    'use strict';

    const BADGE_ID = 'mobile-transaction-count';
    const ACTIVE_STATUSES = new Set([
        'pending',
        'processing',
        'paid',
        'confirmed',
        'shipped',
        'in_transit',
        'on_delivery'
    ]);

    function normalize(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, '_');
    }

    function normalizeStatus(status) {
        const value = normalize(status);
        if (['selesai', 'diterima', 'terima', 'completed', 'complete', 'done', 'delivered'].includes(value)) return 'completed';
        if (['dibatalkan', 'dibatalkan_oleh_pengguna', 'cancelled', 'canceled', 'batal', 'failed', 'rejected'].includes(value)) return 'cancelled';
        if (['dikirim', 'dalam_perjalanan', 'on_delivery', 'in_transit', 'shipped'].includes(value)) return 'shipped';
        if (['diproses', 'diproses_admin', 'processing', 'processed'].includes(value)) return 'processing';
        if (['dibayar', 'paid', 'lunas', 'confirmed', 'confirm'].includes(value)) return 'paid';
        return value || 'pending';
    }

    function normalizePhone(value) {
        return String(value || '').replace(/[^0-9]/g, '').replace(/^62/, '0');
    }

    function getUser() {
        if (typeof getStoredLoggedInUser === 'function') return getStoredLoggedInUser();
        try {
            const raw = localStorage.getItem('gosembako_user');
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function setBadge(count) {
        const badge = document.getElementById(BADGE_ID);
        if (!badge) return;
        const safeCount = Math.max(0, Number(count) || 0);
        badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
        badge.classList.toggle('hidden', safeCount === 0);
        badge.setAttribute('aria-label', `${safeCount} pesanan aktif`);
        badge.dataset.count = String(safeCount);
    }

    function parseOrders(payload) {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.orders)) return payload.orders;
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.result)) return payload.result;
        return [];
    }

    async function updateActiveOrderBadge() {
        const user = getUser();
        if (!user?.session_token || !window.CONFIG?.getMainApiUrl) {
            setBadge(0);
            return;
        }

        try {
            const query = `?action=public_user_orders&session_token=${encodeURIComponent(user.session_token)}`;
            const response = await fetch(`${CONFIG.getMainApiUrl()}${query}`, { method: 'GET', mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const orders = parseOrders(await response.json());
            const phone = normalizePhone(user.whatsapp || user.phone);
            const userOrders = orders.filter((order) => {
                const orderPhone = normalizePhone(order.phone || order.whatsapp || '');
                return !phone || !orderPhone || orderPhone === phone;
            });
            const activeCount = userOrders.filter((order) => ACTIVE_STATUSES.has(normalizeStatus(order.status))).length;
            setBadge(activeCount);
        } catch (error) {
            console.warn('Gagal memuat badge pesanan aktif:', error);
            setBadge(0);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        updateActiveOrderBadge();
        window.setInterval(updateActiveOrderBadge, 30000);
    });

    window.addEventListener('storage', (event) => {
        if (event.key === 'gosembako_user') updateActiveOrderBadge();
    });

    window.updateActiveOrderBadge = updateActiveOrderBadge;
})();
