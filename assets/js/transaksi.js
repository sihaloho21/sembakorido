/* Transactions page: user-scoped shopping history. */
(() => {
    const $ = (id) => document.getElementById(id);
    const normalizePhone = (phone) => {
        const digits = String(phone == null ? '' : phone).replace(/[^0-9]/g, '');
        if (!digits) return '';
        let core = digits.startsWith('62') ? digits.slice(2) : digits;
        if (core.startsWith('0')) core = core.slice(1);
        return core.startsWith('8') ? `0${core}` : '';
    };
    const formatCurrency = (value) => {
        const number = typeof value === 'number' ? value : Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0;
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(number);
    };
    const formatDate = (value) => {
        if (!value) return 'Tanggal tidak tersedia';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    };
    const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    const getUser = () => {
        try { return JSON.parse(localStorage.getItem('gosembako_user') || 'null'); } catch (_) { return null; }
    };
    let allOrders = [];
    let activeFilter = 'all';
    let currentUser = null;
    let activeOrder = null;
    let activeReviewRating = 0;
    const getOrderKey = (order) => String(order.order_id || order.id || order.kode_pesanan || order.nomor_pesanan || 'Pesanan');
    const getReviewStorageKey = () => {
        const identity = normalizePhone(currentUser?.whatsapp) || currentUser?.session_token || 'guest';
        return `gosembako_reviews_${identity}`;
    };
    const getSavedReviews = () => {
        try { return JSON.parse(localStorage.getItem(getReviewStorageKey()) || '{}') || {}; } catch (_) { return {}; }
    };
    const updateReviewStars = (rating) => {
        activeReviewRating = Number(rating) || 0;
        document.querySelectorAll('[data-review-rating]').forEach((star) => {
            const selected = Number(star.dataset.reviewRating) <= activeReviewRating;
            star.classList.toggle('text-amber-400', selected);
            star.classList.toggle('text-slate-300', !selected);
            star.setAttribute('aria-checked', String(Number(star.dataset.reviewRating) === activeReviewRating));
        });
    };
    const renderSavedReview = (review) => {
        const form = $('order-review-form');
        const submitted = $('order-review-submitted');
        const error = $('order-review-error');
        if (!review) {
            form?.classList.remove('hidden');
            submitted?.classList.add('hidden');
            if (error) { error.textContent = ''; error.classList.add('hidden'); }
            $('order-review-text').value = '';
            updateReviewStars(0);
            return;
        }
        form?.classList.add('hidden');
        submitted?.classList.remove('hidden');
        $('order-review-submitted-rating').textContent = `${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`;
        $('order-review-submitted-text').textContent = review.text || 'Tidak ada komentar.';
    };
    const editSavedReview = () => {
        const review = activeOrder ? getSavedReviews()[getOrderKey(activeOrder)] : null;
        if (!review) return;
        $('order-review-form')?.classList.remove('hidden');
        $('order-review-submitted')?.classList.add('hidden');
        $('order-review-text').value = review.text || '';
        $('order-review-error')?.classList.add('hidden');
        updateReviewStars(review.rating);
        $('order-review-text')?.focus();
    };
    const deleteSavedReview = () => {
        if (!activeOrder) return;
        const orderKey = getOrderKey(activeOrder);
        const review = getSavedReviews()[orderKey];
        if (!review) return;
        if (!window.confirm('Hapus ulasan untuk pesanan ini?')) return;
        const reviews = getSavedReviews();
        delete reviews[orderKey];
        localStorage.setItem(getReviewStorageKey(), JSON.stringify(reviews));
        window.dispatchEvent(new CustomEvent('gosembako-reviews-updated', { detail: { storageKey: getReviewStorageKey() } }));
        renderSavedReview(null);
    };
    const normalizeStatus = (status) => {
        const value = String(status || '').trim().toLowerCase();
        if (['terima', 'diterima', 'selesai', 'lunas', 'paid', 'completed'].includes(value)) return 'completed';
        if (['batal', 'dibatalkan', 'gagal', 'ditolak', 'cancelled', 'canceled'].includes(value)) return 'cancelled';
        return 'processing';
    };
    const setVisible = (element, visible) => element && element.classList.toggle('hidden', !visible);
    const setError = (message) => {
        $('transaction-loading')?.classList.add('hidden');
        $('transaction-empty')?.classList.add('hidden');
        $('transaction-error-text').textContent = message;
        setVisible($('transaction-error'), true);
    };
    const renderStatus = (status) => {
        const normalized = normalizeStatus(status);
        return `<span class="status-pill ${normalized === 'completed' ? 'status-success' : normalized === 'cancelled' ? 'status-danger' : 'status-pending'}">${escapeHtml(status || 'Diproses')}</span>`;
    };
    const getTrackingStatus = (status) => {
        const value = String(status || '').trim().toLowerCase();
        if (['batal', 'dibatalkan', 'gagal', 'ditolak', 'cancelled', 'canceled'].includes(value)) return 'Dibatalkan';
        if (['terima', 'diterima', 'selesai', 'lunas', 'paid', 'completed'].includes(value)) return 'Diterima';
        if (value.includes('kirim') || value.includes('ship')) return 'Dikirim';
        if (value.includes('tunggu') || value.includes('wait')) return 'Menunggu';
        return 'Diproses';
    };
    const createTrackingTimeline = (currentStatus) => {
        if (currentStatus === 'Dibatalkan') {
            return '<div class="flex items-center justify-center gap-3 py-4"><div class="bg-red-500 w-12 h-12 rounded-full flex items-center justify-center"><svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></div><div><p class="font-extrabold text-red-600">Dibatalkan</p><p class="text-xs text-slate-500">Pesanan telah dibatalkan</p></div></div>';
        }
        const statuses = [
            { name: 'Menunggu', image: 'wait.gif' },
            { name: 'Diproses', image: 'grocery-basket.gif' },
            { name: 'Dikirim', image: 'grocery.gif' },
            { name: 'Diterima', image: 'shipping.gif' }
        ];
        const currentIndex = Math.max(0, statuses.findIndex((item) => item.name === currentStatus));
        return `<div class="flex min-w-[340px] items-center justify-between gap-2 py-2">${statuses.map((item, index) => {
            const active = index <= currentIndex;
            const current = index === currentIndex;
            const connector = index < statuses.length - 1 ? `<div class="flex-shrink-0 w-6 h-0.5 ${active && index < currentIndex ? 'bg-green-500' : 'bg-slate-300'}"></div>` : '';
            return `<div class="flex min-w-[58px] flex-1 flex-col items-center"><div class="${active ? 'bg-green-50' : 'bg-slate-100'} flex h-11 w-11 items-center justify-center rounded-full ${current ? 'ring-2 ring-green-500 ring-offset-2' : ''}"><img src="assets/images/${item.image}" alt="${item.name}" class="h-7 w-7 object-contain ${active ? '' : 'opacity-40'}" onerror="this.style.display='none'"></div><p class="mt-2 text-center text-[9px] font-semibold ${active ? 'text-slate-800' : 'text-slate-400'}">${item.name}</p>${current ? '<p class="mt-0.5 text-[8px] font-bold text-green-600">● Saat ini</p>' : '<p class="mt-0.5 text-[8px] text-transparent">●</p>'}</div>${connector}`;
        }).join('')}</div>`;
    };
    const openOrderDetail = (order) => {
        const orderId = order.order_id || order.id || order.kode_pesanan || order.nomor_pesanan || 'Pesanan';
        const date = order.tanggal || order.tanggal_pesanan || order.timestamp || order.tanggal || order.created_at || order.date;
        const items = order.items || order.produk || order.detail_produk || order.products || 'Detail produk tidak tersedia';
        const total = order.total || order.total_bayar || order.grand_total || order.amount || 0;
        const status = getTrackingStatus(order.status);
        activeOrder = order;
        $('tracking-order-id').textContent = orderId;
        $('tracking-order-date').textContent = formatDate(date);
        $('tracking-products').textContent = typeof items === 'object' ? JSON.stringify(items) : items;
        $('tracking-total').textContent = formatCurrency(total);
        const badge = $('tracking-status-badge');
        badge.textContent = status === 'Diterima' ? 'Selesai' : status;
        badge.className = `status-pill ${status === 'Diterima' ? 'status-success' : status === 'Dibatalkan' ? 'status-danger' : 'status-pending'}`;
        $('tracking-timeline').innerHTML = createTrackingTimeline(status);
        const reviewSection = $('order-review-section');
        const completed = status === 'Diterima';
        reviewSection?.classList.toggle('hidden', !completed);
        if (completed) renderSavedReview(getSavedReviews()[getOrderKey(order)]);
        $('order-tracking-modal').classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    };
    const closeOrderDetail = () => {
        $('order-tracking-modal')?.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    };
    const renderOrder = (order) => {
        const orderId = order.order_id || order.id || order.kode_pesanan || order.nomor_pesanan || 'Pesanan';
        const date = order.tanggal_pesanan || order.timestamp || order.tanggal || order.created_at || order.date;
        const items = order.items || order.produk || order.detail_produk || order.products || '';
        const payment = order.metode_pembayaran || order.payment_method || order.payment || 'Belum ditentukan';
        const total = order.total || order.total_bayar || order.grand_total || order.amount || 0;
        return `<article class="order-card cursor-pointer rounded-2xl bg-white p-4 sm:p-5" data-order-key="${escapeHtml(orderId)}" tabindex="0" role="button" aria-label="Lihat detail pesanan ${escapeHtml(orderId)}">
            <div class="flex items-start justify-between gap-3"><div><p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Nomor Pesanan</p><h4 class="mt-1 text-sm font-extrabold text-slate-900 break-all">${escapeHtml(orderId)}</h4></div>${renderStatus(order.status)}</div>
            <div class="mt-4 space-y-2 text-xs"><div class="flex justify-between gap-3"><span class="text-slate-500">Tanggal</span><span class="text-right font-semibold text-slate-700">${escapeHtml(formatDate(date))}</span></div><div class="flex justify-between gap-3"><span class="text-slate-500">Pembayaran</span><span class="text-right font-semibold text-slate-700">${escapeHtml(payment)}</span></div></div>
            <div class="mt-4 border-t border-slate-100 pt-3"><p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Detail Belanja</p><p class="mt-1 text-xs leading-5 text-slate-600 line-clamp-3">${escapeHtml(typeof items === 'object' ? JSON.stringify(items) : items || 'Detail produk tidak tersedia')}</p></div>
            <div class="mt-4 flex items-end justify-between gap-3"><span class="text-xs font-semibold text-slate-500">Total</span><strong class="text-base font-extrabold text-green-700">${escapeHtml(formatCurrency(total))}</strong></div>
        </article>`;
    };
    const parseResponse = (payload) => {
        if (payload && payload.success === false) throw new Error(payload.message || 'Gagal memuat riwayat transaksi.');
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.orders)) return payload.orders;
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.result)) return payload.result;
        return [];
    };
    const updateFilterCounts = () => {
        const counts = { all: allOrders.length, completed: 0, processing: 0, cancelled: 0 };
        allOrders.forEach((order) => { counts[normalizeStatus(order.status)] += 1; });
        Object.entries(counts).forEach(([key, value]) => { const element = $(`transaction-count-${key}`); if (element) element.textContent = value; });
    };
    const renderFilteredOrders = () => {
        const filtered = activeFilter === 'all' ? allOrders : allOrders.filter((order) => normalizeStatus(order.status) === activeFilter);
        setVisible($('transaction-empty'), filtered.length === 0);
        $('transaction-empty')?.querySelector('p.font-bold')?.replaceChildren(document.createTextNode(filtered.length ? 'Belum ada riwayat belanja' : `Belum ada pesanan ${activeFilter === 'completed' ? 'selesai' : activeFilter === 'cancelled' ? 'dibatalkan' : activeFilter === 'processing' ? 'diproses' : ''}`.trim()));
        $('transaction-list').innerHTML = filtered.map(renderOrder).join('');
    };
    const activateFilter = (filter) => {
        activeFilter = filter;
        document.querySelectorAll('[data-transaction-filter]').forEach((button) => {
            const isActive = button.dataset.transactionFilter === filter;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', String(isActive));
        });
        if (allOrders.length) renderFilteredOrders();
    };
    async function loadTransactions(user) {
        const query = user?.session_token ? `&session_token=${encodeURIComponent(user.session_token)}` : '';
        const response = await fetch(`${CONFIG.getMainApiUrl()}?action=public_user_orders${query}`, { method: 'GET', mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let orders = parseResponse(await response.json());
        const userPhone = normalizePhone(user.whatsapp);
        orders = orders.filter((order) => !userPhone || normalizePhone(order.phone || order.whatsapp || '') === userPhone);
        orders.sort((a, b) => new Date(b.tanggal_pesanan || b.timestamp || 0) - new Date(a.tanggal_pesanan || a.timestamp || 0));
        $('transaction-loading')?.classList.add('hidden');
        allOrders = orders;
        updateFilterCounts();
        const total = orders.reduce((sum, order) => normalizeStatus(order.status) === 'completed' ? sum + (Number(String(order.total || order.total_bayar || 0).replace(/[^0-9.-]/g, '')) || 0) : sum, 0);
        $('transaction-total').textContent = formatCurrency(total);
        renderFilteredOrders();
    }
    document.addEventListener('DOMContentLoaded', () => {
        const user = getUser();
        currentUser = user;
        if (!user || !user.session_token) {
            setVisible($('transaction-content'), false);
            setVisible($('transaction-login'), true);
            $('transaction-subtitle').textContent = 'Silakan masuk untuk melihat riwayat belanja Anda.';
            return;
        }
        $('transaction-user-label').textContent = user.nama || 'Akun';
        $('transaction-subtitle').textContent = `Riwayat belanja untuk ${user.nama || 'akun Anda'}.`;
        document.querySelectorAll('[data-transaction-filter]').forEach((button) => button.addEventListener('click', () => activateFilter(button.dataset.transactionFilter)));
        $('transaction-list')?.addEventListener('click', (event) => {
            const card = event.target.closest('[data-order-key]');
            if (!card) return;
            const order = allOrders.find((item) => String(item.order_id || item.id || item.kode_pesanan || item.nomor_pesanan || 'Pesanan') === card.dataset.orderKey);
            if (order) openOrderDetail(order);
        });
        $('transaction-list')?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const card = event.target.closest('[data-order-key]');
            if (!card) return;
            event.preventDefault();
            const order = allOrders.find((item) => String(item.order_id || item.id || item.kode_pesanan || item.nomor_pesanan || 'Pesanan') === card.dataset.orderKey);
            if (order) openOrderDetail(order);
        });
        document.querySelectorAll('[data-review-rating]').forEach((star) => star.addEventListener('click', () => updateReviewStars(star.dataset.reviewRating)));
        $('order-review-edit')?.addEventListener('click', editSavedReview);
        $('order-review-delete')?.addEventListener('click', deleteSavedReview);
        $('order-review-form')?.addEventListener('submit', (event) => {
            event.preventDefault();
            const error = $('order-review-error');
            const text = $('order-review-text').value.trim();
            if (!activeOrder || getTrackingStatus(activeOrder.status) !== 'Diterima') return;
            if (!activeReviewRating) { error.textContent = 'Pilih rating bintang terlebih dahulu.'; error.classList.remove('hidden'); return; }
            if (text.length < 3) { error.textContent = 'Tulis ulasan minimal 3 karakter.'; error.classList.remove('hidden'); return; }
            const reviews = getSavedReviews();
            const previousReview = reviews[getOrderKey(activeOrder)];
            reviews[getOrderKey(activeOrder)] = { rating: activeReviewRating, text, submittedAt: new Date().toISOString(), createdAt: previousReview?.createdAt || new Date().toISOString() };
            localStorage.setItem(getReviewStorageKey(), JSON.stringify(reviews));
            window.dispatchEvent(new CustomEvent('gosembako-reviews-updated', { detail: { storageKey: getReviewStorageKey() } }));
            renderSavedReview(reviews[getOrderKey(activeOrder)]);
        });
        $('close-order-tracking')?.addEventListener('click', closeOrderDetail);
        $('order-tracking-modal')?.addEventListener('click', (event) => { if (event.target.id === 'order-tracking-modal') closeOrderDetail(); });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('order-tracking-modal')?.classList.contains('hidden')) closeOrderDetail(); });
        loadTransactions(user).catch((error) => { console.error('Transactions error:', error); setError('Gagal memuat riwayat belanja. Silakan coba lagi.'); });
        $('transaction-retry')?.addEventListener('click', () => { setVisible($('transaction-error'), false); $('transaction-loading')?.classList.remove('hidden'); loadTransactions(user).catch((error) => { console.error('Transactions retry error:', error); setError('Gagal memuat riwayat belanja. Silakan coba lagi.'); }); });
    });
})();
