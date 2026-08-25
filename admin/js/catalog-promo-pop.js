(function () {
    'use strict';

    const SHEET = 'promo_flyers';
    const state = {
        products: [],
        campaigns: [],
        selectedItems: new Map(),
        featuredIds: new Set(),
        editingId: '',
        busy: false,
        templateId: 'promo-grid',
        heroDataUrl: '',
        previewZoom: 1
    };

    const $ = (id) => document.getElementById(id);

    function setStatus(message, tone) {
        const el = $('promo-pop-status');
        if (!el) return;
        el.textContent = message || '';
        el.className = 'text-sm rounded-xl px-4 py-3 ' + (tone === 'error'
            ? 'bg-red-50 text-red-700 border border-red-200'
            : tone === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-50 text-slate-600 border border-slate-200');
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function slugify(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80);
    }

    function productId(product) {
        return String(product.productId || product.id || product.kode || product.sku || '').trim();
    }

    function productName(product) {
        return String(product.nama || product.name || product.product_name || product.title || 'Produk').trim();
    }

    function firstImageUrl(value) {
        return String(value || '').split(',')[0].trim();
    }

    function productImage(product) {
        return firstImageUrl(product.gambar || product.image || product.image_url || product.foto || '');
    }

    function productPrice(product) {
        const raw = product.harga_jual ?? product.harga ?? product.price ?? product.harga_normal ?? 0;
        const numeric = Number(String(raw).replace(/[^0-9.-]/g, ''));
        return Number.isFinite(numeric) ? numeric : 0;
    }

    function normalizeProduct(row) {
        const id = productId(row);
        if (!id) return null;
        return {
            ...row,
            id,
            name: productName(row),
            image: productImage(row),
            price: productPrice(row),
            unit: String(row.satuan || row.unit || '').trim(),
            category: categoryName(row),
            brand: String(row.brand || row.merek || '').trim(),
            sku: String(row.sku || row.kode || row.productId || row.id || '').trim(),
            stock: Number(row.stok ?? row.stock ?? row.qty ?? 0) || 0,
            bestSeller: row.best_seller === true || String(row.best_seller || row.bestSeller || '').toLowerCase() === 'true'
        };
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
    }

    function readArrayResponse(payload) {
        if (Array.isArray(payload)) return payload;
        if (payload && Array.isArray(payload.data)) return payload.data;
        if (payload && Array.isArray(payload.rows)) return payload.rows;
        return [];
    }

    function categoryName(product) {
        return String(product.kategori || product.category || product.kelompok || 'Lainnya').trim() || 'Lainnya';
    }

    function themeClass(theme) {
        return String(theme || 'retail-impact').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }

    function layoutClass(layout) {
        return String(layout || 'auto').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }

    function safeHttpUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        try {
            const parsed = new URL(raw, window.location.origin);
            return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
        } catch (error) { return ''; }
    }

    function productStock(product) {
        return Number(product.stock ?? product.stok ?? product.qty ?? 0) || 0;
    }

    function productIsOutOfStock(product) {
        return productStock(product) <= 0;
    }

    function makeQrDataUrl(value) {
        const url = safeHttpUrl(value);
        if (!url || typeof qrcode !== 'function') return '';
        try {
            const qr = qrcode(0, 'M');
            qr.addData(url);
            qr.make();
            return qr.createDataURL(4, 0);
        } catch (error) { return ''; }
    }

    function selectTemplate(templateId) {
        state.templateId = String(templateId || 'promo-grid');
        document.querySelectorAll('[data-template]').forEach(button => button.classList.toggle('selected', button.dataset.template === state.templateId));
        renderPreview();
    }

    function handleHeroUpload(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.type)) {
            setStatus('Banner harus berupa JPG, PNG, atau WebP.', 'error');
            event.target.value = '';
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setStatus('Ukuran banner maksimal 5MB.', 'error');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            state.heroDataUrl = String(reader.result || '');
            const preview = $('promo-pop-hero-preview');
            if (preview) { preview.src = state.heroDataUrl; preview.style.display = 'block'; }
            renderPreview();
            setStatus('Banner siap digunakan pada preview. Untuk dipakai lintas campaign, simpan asset di library/CDN.', 'success');
        };
        reader.readAsDataURL(file);
    }

    function setPreviewZoom(delta) {
        state.previewZoom = Math.min(1.35, Math.max(.75, Number((state.previewZoom + delta).toFixed(2))));
        const preview = $('promo-pop-preview');
        if (preview) preview.style.transform = `scale(${state.previewZoom})`;
        const reset = $('promo-pop-zoom-reset');
        if (reset) reset.textContent = `${Math.round(state.previewZoom * 100)}%`;
    }

    function resetPreviewZoom() {
        state.previewZoom = 1;
        const preview = $('promo-pop-preview');
        if (preview) preview.style.transform = 'scale(1)';
        const reset = $('promo-pop-zoom-reset');
        if (reset) reset.textContent = '100%';
    }

    async function generatePdf() {
        const preview = $('promo-pop-preview');
        if (!preview) return;
        if (typeof html2canvas !== 'function' || !window.jspdf?.jsPDF) {
            return setStatus('Library PDF belum siap. Periksa koneksi CDN lalu coba lagi.', 'error');
        }
        state.busy = true;
        setStatus('Membuat PDF A4 berkualitas tinggi...', 'info');
        try {
            resetPreviewZoom();
            const canvas = await html2canvas(preview, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
            const pageW = 210, pageH = 297, margin = 5;
            const ratio = canvas.width / canvas.height;
            let width = pageW - (margin * 2), height = width / ratio;
            if (height > pageH - (margin * 2)) { height = pageH - (margin * 2); width = height * ratio; }
            pdf.addImage(canvas.toDataURL('image/jpeg', .95), 'JPEG', (pageW - width) / 2, (pageH - height) / 2, width, height, undefined, 'FAST');
            const slug = slugify($('promo-pop-title')?.value || 'promo-pop') || 'promo-pop';
            pdf.save(`${slug}-A4.pdf`);
            setStatus('PDF A4 berhasil dibuat dan diunduh.', 'success');
        } catch (error) {
            console.error('generatePdf error:', error);
            setStatus('PDF gagal dibuat. Pastikan gambar banner/produk mengizinkan CORS.', 'error');
        } finally {
            state.busy = false;
        }
    }

    async function generatePng() {
        const preview = $('promo-pop-preview');
        if (!preview) return;
        if (typeof html2canvas !== 'function') return setStatus('Library PNG belum siap. Periksa koneksi CDN lalu coba lagi.', 'error');
        state.busy = true;
        setStatus('Membuat PNG berkualitas tinggi...', 'info');
        try {
            resetPreviewZoom();
            if (document.fonts?.ready) await document.fonts.ready;
            const canvas = await html2canvas(preview, { scale: 3, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', logging: false });
            const slug = slugify($('promo-pop-title')?.value || 'promo-pop') || 'promo-pop';
            const link = document.createElement('a');
            link.download = `${slug}-POP.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            setStatus('PNG berhasil dibuat dan diunduh.', 'success');
        } catch (error) {
            console.error('generatePng error:', error);
            setStatus('PNG gagal dibuat. Pastikan gambar banner/produk mengizinkan CORS.', 'error');
        } finally {
            state.busy = false;
        }
    }

    function printPreview() {
        const preview = $('promo-pop-preview');
        if (!preview) return;
        const popup = window.open('', '_blank', 'noopener,noreferrer');
        if (!popup) return setStatus('Popup diblokir browser. Izinkan popup untuk mencetak.', 'error');
        popup.document.write(`<!doctype html><html><head><title>Print ${escapeHtml($('promo-pop-title')?.value || 'Promo POP')}</title><style>@page{size:A4 portrait;margin:5mm}body{margin:0;background:#fff}.flyer-preview{width:100%;box-shadow:none;border:0}</style></head><body>${preview.outerHTML}</body></html>`);
        popup.document.close();
        popup.focus();
        setTimeout(() => popup.print(), 250);
    }

    function clampDiscount(value) {
        return Math.min(99, Math.max(0, Math.round(Number(value) || 0)));
    }

    function promoPriceFromDiscount(normalPrice, discountPct) {
        const normal = Math.max(0, Number(normalPrice) || 0);
        const pct = clampDiscount(discountPct);
        return Math.max(0, Math.round(normal * (1 - pct / 100)));
    }

    function apiErrorMessage(payload, fallback) {
        const raw = payload && (payload.message || payload.error || payload.status);
        const text = String(raw || '').trim();
        if (/invalid sheet/i.test(text) || /catalog promo pop/i.test(text)) {
            return 'Backend GAS belum mengenali sheet promo_flyers. Terapkan source docs/gas_v63_blog_support.gs terbaru dan perbarui deployment Web App.';
        }
        return text || fallback;
    }

    async function fetchProducts() {
        const url = new URL(CONFIG.getMainApiUrl());
        url.searchParams.set('sheet', 'products');
        url.searchParams.set('_t', Date.now());
        const response = await fetch(url.toString(), { cache: 'no-store' });
        if (!response.ok) throw new Error('Produk tidak dapat dimuat');
        const payload = await response.json();
        state.products = readArrayResponse(payload).map(normalizeProduct).filter(Boolean);
        populateCategoryFilter();
        renderProductPicker();
    }

    async function fetchCampaigns() {
        const token = GASActions.getAdminToken();
        const role = GASActions.getAdminRole();
        if (!token) throw new Error('Token admin belum tersedia');
        const url = new URL(CONFIG.getAdminApiUrl());
        url.searchParams.set('sheet', SHEET);
        url.searchParams.set('token', token);
        url.searchParams.set('admin_token', token);
        if (role) url.searchParams.set('admin_role', role);
        url.searchParams.set('_t', Date.now());
        const response = await fetch(url.toString(), { cache: 'no-store' });
        if (!response.ok) throw new Error('Campaign tidak dapat dimuat');
        const payload = await response.json();
        if (payload && payload.error) throw new Error(apiErrorMessage(payload, 'Campaign tidak dapat dimuat'));
        state.campaigns = readArrayResponse(payload);
        renderCampaigns();
    }

    function populateCategoryFilter() {
        const select = $('promo-pop-category-filter');
        if (!select) return;
        const current = select.value || 'all';
        const categories = [...new Set(state.products.map(product => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
        select.innerHTML = '<option value="all">Semua kategori</option>' + categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
        select.value = categories.includes(current) ? current : 'all';
    }

    function selectedProductRows() {
        return Array.from(state.selectedItems.values());
    }

    function campaignStatus(campaign) {
        const raw = String(campaign?.status || 'draft').toLowerCase();
        if (raw === 'published' && campaign?.end_at) {
            const end = new Date(campaign.end_at);
            if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) return 'expired';
        }
        return raw;
    }

    function setFormStatusBadge(status) {
        const badge = $('promo-pop-form-status-badge');
        if (!badge) return;
        const normalized = String(status || 'draft').toLowerCase();
        const label = normalized === 'published' ? 'Published' : normalized === 'expired' ? 'Expired' : normalized === 'archived' ? 'Archived' : 'Draft';
        badge.textContent = label;
        badge.className = `status-badge status-${normalized}`;
    }

    function renderProductPicker() {
        const container = $('promo-pop-product-list');
        if (!container) return;
        const query = String($('promo-pop-product-search')?.value || '').trim().toLowerCase();
        const category = String($('promo-pop-category-filter')?.value || 'all');
        const stockFilter = String($('promo-pop-stock-filter')?.value || 'available');
        const rows = state.products.filter((product) => {
            const searchMatch = !query || [product.name, product.id, product.sku, product.category, product.brand].some(value => String(value || '').toLowerCase().includes(query));
            const categoryMatch = category === 'all' || product.category === category;
            const out = productIsOutOfStock(product);
            const stockMatch = stockFilter === 'all' || (stockFilter === 'out' ? out : !out || state.selectedItems.has(product.id));
            return searchMatch && categoryMatch && stockMatch;
        }).slice(0, 80);
        const resultCount = $('promo-pop-product-result');
        if (resultCount) resultCount.textContent = `${rows.length} hasil`;
        if (!rows.length) {
            container.innerHTML = '<div class="p-5 text-sm text-slate-500">Produk tidak ditemukan.</div>';
            return;
        }
        container.innerHTML = rows.map((product) => {
            const selected = state.selectedItems.get(product.id);
            const outOfStock = productIsOutOfStock(product);
            const discount = selected ? clampDiscount(((product.price - selected.promo_price) / Math.max(product.price, 1)) * 100) : 0;
            return `<div class="promo-product-row ${outOfStock ? 'is-out-of-stock' : ''}">
                <div class="promo-product-thumb">${product.image ? `<img src="${escapeHtml(product.image)}" alt="" loading="lazy">` : '<span>POP</span>'}</div>
                <div class="min-w-0 flex-1">
                    <div class="font-semibold text-slate-800 truncate">${escapeHtml(product.name)}</div>
                    <div class="text-xs text-slate-500">${escapeHtml(product.category)} · ${formatCurrency(product.price)}${product.brand ? ` · ${escapeHtml(product.brand)}` : ''}</div>
                    ${outOfStock ? '<div class="text-[10px] font-bold text-amber-600 mt-1">⚠ Stok habis · tetap tampilkan jika diperlukan</div>' : `<div class="text-[10px] text-emerald-600 mt-1">Stok ${productStock(product)}</div>`}
                </div>
                <div class="flex items-center gap-2 flex-wrap justify-end">
                    ${selected ? `<span class="text-[10px] font-black text-orange-600">-${discount}%</span><input class="promo-badge-input" data-promo-badge="${escapeHtml(product.id)}" type="text" value="${escapeHtml(selected.badge || '')}" placeholder="Badge" aria-label="Badge ${escapeHtml(product.name)}">` : ''}
                    <input class="promo-price-input" data-promo-price="${escapeHtml(product.id)}" type="number" min="0" step="500" value="${escapeHtml(selected ? selected.promo_price : product.price)}" aria-label="Harga promo ${escapeHtml(product.name)}">
                    <button type="button" class="promo-select-button ${selected ? 'is-selected' : ''}" data-select-product="${escapeHtml(product.id)}">${selected ? 'Dipilih' : outOfStock ? 'Tetap tampilkan' : 'Pilih'}</button>
                </div>
            </div>`;
        }).join('');
    }

    function parseJsonArray(value, depth = 0) {
        if (depth > 3 || value == null) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === 'object') {
            if (Array.isArray(value.items)) return value.items;
            if (Array.isArray(value.products)) return value.products;
            if (Array.isArray(value.data)) return value.data;
            if (value.id || value.product_id || value.productId || value.sku || value.kode) return [value];
            return [];
        }
        if (typeof value !== 'string' || !value.trim()) return [];
        try {
            const parsed = JSON.parse(value);
            return parseJsonArray(parsed, depth + 1);
        } catch (error) {
            return [];
        }
    }

    function parseCampaignItems(campaign) {
        const candidates = [campaign?.items, campaign?.products, campaign?.items_json, campaign?.products_json, campaign?.data];
        for (const candidate of candidates) {
            const parsed = parseJsonArray(candidate);
            if (parsed.length) return parsed;
        }
        return [];
    }

    function normalizeCampaignItem(item, index) {
        const raw = item || {};
        const id = String(raw.id || raw.product_id || raw.productId || raw.sku || raw.kode || '').trim();
        const source = state.products.find(product => product.id === id || product.sku === id) || {};
        const normal = Number(raw.normal_price ?? raw.normalPrice ?? raw.price ?? source.price ?? 0) || 0;
        const promo = Number(raw.promo_price ?? raw.promoPrice ?? raw.sale_price ?? raw.price ?? normal) || 0;
        return {
            ...source,
            ...raw,
            id: id || source.id || `campaign-item-${index}`,
            name: String(raw.name || raw.product_name || raw.productName || source.name || 'Produk').trim(),
            image: firstImageUrl(raw.image || raw.image_url || raw.gambar || source.image || ''),
            unit: String(raw.unit || raw.satuan || source.unit || '').trim(),
            brand: String(raw.brand || source.brand || '').trim(),
            sku: String(raw.sku || source.sku || '').trim(),
            stock: Number(raw.stock ?? raw.stok ?? source.stock ?? 0) || 0,
            normal_price: normal,
            promo_price: promo,
            badge: String(raw.badge || raw.badge_text || '').trim()
        };
    }

    function restoreCampaignItems(campaign) {
        const items = parseCampaignItems(campaign);
        state.selectedItems = new Map();
        state.featuredIds = new Set();
        items.forEach((item, index) => {
            const normalized = normalizeCampaignItem(item, index);
            state.selectedItems.set(String(normalized.id), normalized);
            if (item?.is_featured === true || String(item?.is_featured || '').toLowerCase() === 'true') state.featuredIds.add(String(normalized.id));
        });
        return items;
    }

    function selectedProducts() {
        return Array.from(state.selectedItems.values());
    }

    function setBulkResult(message, isError = false) {
        const target = $('promo-pop-bulk-result');
        if (!target) return;
        target.textContent = message;
        target.className = `text-xs font-bold ${isError ? 'text-red-600' : 'text-emerald-600'}`;
        if (message) window.setTimeout(() => { if (target.textContent === message) target.textContent = ''; }, 4200);
    }

    function applyBulkPricing(type, value) {
        const selected = selectedProducts();
        const amount = Number(value);
        if (!selected.length) return setBulkResult('Pilih minimal satu produk.', true);
        if (!Number.isFinite(amount) || amount < 0) return setBulkResult('Nilai diskon tidak valid.', true);
        const prefix = String($('promo-pop-bulk-badge')?.value || 'DISKON').trim().toUpperCase();
        selected.forEach((item) => {
            const normal = Number(item.normal_price) || 0;
            const discountPct = type === 'fixed'
                ? clampDiscount((amount / Math.max(normal, 1)) * 100)
                : clampDiscount(amount);
            item.promo_price = type === 'fixed' ? Math.max(0, Math.round(normal - amount)) : promoPriceFromDiscount(normal, discountPct);
            item.badge = prefix ? `${prefix} ${type === 'fixed' ? formatCurrency(amount) : discountPct + '%'}` : '';
        });
        renderProductPicker();
        renderSelectedItems();
        renderPreview();
        setBulkResult(`${selected.length} produk diperbarui.`);
    }

    function resetBulkPricing() {
        const selected = selectedProducts();
        selected.forEach((item) => { item.promo_price = Number(item.normal_price) || 0; item.badge = ''; });
        renderProductPicker();
        renderSelectedItems();
        renderPreview();
        setBulkResult(`${selected.length} harga dikembalikan ke harga normal.`);
    }

    function renderSelectedItems() {
        const container = $('promo-pop-selected-list');
        const count = $('promo-pop-selected-count');
        const rows = selectedProductRows();
        if (count) count.textContent = `${rows.length} produk dipilih${state.featuredIds.size ? ` · ${state.featuredIds.size} unggulan` : ''}`;
        if (!container) return;
        if (!rows.length) {
            container.innerHTML = '<div class="p-4 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">Belum ada produk. Pilih produk dari daftar di sebelah kiri.</div>';
            return;
        }
        container.innerHTML = rows.map((item, index) => {
            const isFeatured = state.featuredIds.has(String(item.id));
            const isOut = productIsOutOfStock(item);
            return `<div class="selected-product-row" draggable="true" data-selected-id="${escapeHtml(item.id)}">
                <span class="selected-number">${index + 1}</span>
                <div class="selected-product-main"><strong>${escapeHtml(item.name)}</strong><span>${isOut ? '⚠ Stok habis · ' : ''}Normal ${formatCurrency(item.normal_price)}${item.badge ? ` · ${escapeHtml(item.badge)}` : ''}</span></div>
                <div class="selected-product-actions"><strong style="color:#ea580c;font-size:12px;">${formatCurrency(item.promo_price)}</strong><button type="button" class="${isFeatured ? 'is-featured' : ''}" data-feature-product="${escapeHtml(item.id)}">${isFeatured ? '★ Unggulan' : '☆ Featured'}</button><button type="button" data-remove-product="${escapeHtml(item.id)}">Hapus</button></div>
            </div>`;
        }).join('');
    }

    function getCropSettings() {
        const frame = Math.min(220, Math.max(64, Number($('promo-pop-image-frame')?.value) || 82));
        const scalePercent = Math.min(110, Math.max(70, Number($('promo-pop-image-scale')?.value) || 100));
        const frameOutput = $('promo-pop-image-frame-output');
        const scaleOutput = $('promo-pop-image-scale-output');
        if (frameOutput) frameOutput.textContent = `${frame} px`;
        if (scaleOutput) scaleOutput.textContent = `${scalePercent}%`;
        return { frame, scale: scalePercent / 100 };
    }

    function getGridSettings() {
        const rows = Math.min(8, Math.max(1, Number($('promo-pop-grid-rows')?.value) || 4));
        const columns = Math.min(6, Math.max(1, Number($('promo-pop-grid-columns')?.value) || 3));
        const rowsOutput = $('promo-pop-grid-rows-output');
        const columnsOutput = $('promo-pop-grid-columns-output');
        if (rowsOutput) rowsOutput.textContent = String(rows);
        if (columnsOutput) columnsOutput.textContent = String(columns);
        return { rows, columns, limit: rows * columns };
    }

    function renderPreview() {
        const title = $('promo-pop-title')?.value || 'Promo Spesial';
        const subtitle = $('promo-pop-subtitle')?.value || 'Harga terbaik untuk kebutuhan harian';
        const theme = $('promo-pop-theme')?.value || 'retail-impact';
        const layout = $('promo-pop-layout')?.value || 'auto';
        const store = $('promo-pop-store')?.value || 'Paket Sembako';
        const badge = $('promo-pop-badge')?.value || 'DISKON SPESIAL';
        const hero = state.heroDataUrl || safeHttpUrl($('promo-pop-hero')?.value || '');
        const period = $('promo-pop-period')?.value || '';
        const qrUrl = safeHttpUrl($('promo-pop-qr')?.value || '');
        const address = $('promo-pop-address')?.value || '';
        const disclaimer = $('promo-pop-disclaimer')?.value || '';
        const preview = $('promo-pop-preview');
        if (!preview) return;
        const crop = getCropSettings();
        const grid = getGridSettings();
        preview.style.setProperty('--flyer-media-height', `${crop.frame}px`);
        preview.style.setProperty('--flyer-image-scale', String(crop.scale));
        preview.style.setProperty('--flyer-grid-rows', String(grid.rows));
        preview.style.setProperty('--flyer-grid-columns', String(grid.columns));
        const rows = selectedProductRows();
        const featured = rows.filter(item => state.featuredIds.has(String(item.id))).slice(0, 3);
        const qrDataUrl = makeQrDataUrl(qrUrl);
        const productMarkup = rows.slice(0, grid.limit).map((item) => `<article class="flyer-item"><div class="flyer-media-frame">${item.image ? `<img src="${escapeHtml(safeHttpUrl(item.image))}" alt="" loading="lazy">` : 'POP'}${item.badge ? `<span class="flyer-item-badge">${escapeHtml(item.badge)}</span>` : ''}</div><div class="flyer-item-name">${escapeHtml(item.name)}</div><div class="flyer-item-normal">${formatCurrency(item.normal_price)}</div><div class="flyer-item-promo">${formatCurrency(item.promo_price)}</div>${item.unit ? `<div style="font-size:9px;color:#94a3b8;">${escapeHtml(item.unit)}</div>` : ''}</article>`).join('');
        const featuredMarkup = featured.length ? `<div class="flyer-featured"><div class="flyer-media-frame">${featured[0].image ? `<img src="${escapeHtml(safeHttpUrl(featured[0].image))}" alt="" loading="lazy">` : 'POP'}</div><div><div class="flyer-featured-label">Produk Unggulan</div><div style="margin-top:4px;color:#334155;font-size:12px;font-weight:900;">${escapeHtml(featured[0].name)}</div><div class="flyer-item-normal">${formatCurrency(featured[0].normal_price)}</div><div class="flyer-item-promo">${formatCurrency(featured[0].promo_price)}</div></div></div>` : '';
        const serviceMarkup = $('promo-pop-show-service')?.checked ? '<div class="flyer-service"><strong style="color:#334155;">MELAYANI TOP UP DIGITAL & PPOB</strong><br>Pulsa · Paket Data · Token PLN · E-Wallet · Bayar Tagihan</div>' : '';
        const paymentMarkup = $('promo-pop-show-payment')?.checked ? '<div class="flyer-payment">Pembayaran: QRIS · GoPay · DANA · OVO · Transfer Bank</div>' : '';
        const disclaimerMarkup = $('promo-pop-show-disclaimer')?.checked && disclaimer ? `<div class="flyer-payment">${escapeHtml(disclaimer)}</div>` : '';
        preview.className = `flyer-preview flyer-theme-${escapeHtml(themeClass(theme))} flyer-layout-${escapeHtml(layoutClass(layout))}`;
        preview.innerHTML = `<div class="flyer-preview-hero" ${hero ? `style="background-image:url('${escapeHtml(hero)}')"` : ''}><div class="flyer-overlay"></div><div class="relative z-10"><span class="flyer-kicker">🔥 ${escapeHtml(store).toUpperCase()}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p>${period ? `<span class="flyer-period">${escapeHtml(period)}</span>` : ''}</div></div><div class="flyer-preview-meta"><strong>${escapeHtml(badge)}</strong><span>${rows.length} produk promo</span></div><div class="flyer-preview-items">${productMarkup || '<div style="grid-column:1/-1;color:#94a3b8;font-size:11px;text-align:center;padding:28px 0;">Preview produk akan tampil di sini.</div>'}${featuredMarkup}</div>${serviceMarkup}${paymentMarkup}<div class="flyer-preview-footer"><div class="flyer-footer-left"><strong>${escapeHtml(store)}</strong><span>${escapeHtml(address || 'Informasi toko akan tampil di sini')}</span></div><div class="flyer-footer-right">${qrDataUrl ? `<img class="flyer-qr" src="${qrDataUrl}" alt="QR Code">` : ''}<span>Scan<br>untuk pesan</span></div></div>${disclaimerMarkup}`;
        const size = $('promo-pop-preview-size');
        if (size) size.textContent = `A4 ${$('promo-pop-orientation')?.value === 'landscape' ? 'Landscape' : 'Portrait'} · ${rows.length} produk`;
    }

    function collectFormData() {
        const rows = selectedProductRows();
        const title = String($('promo-pop-title')?.value || '').trim();
        return {
            id: state.editingId || `POP-${Date.now()}`,
            title,
            slug: String($('promo-pop-slug')?.value || slugify(title)).trim(),
            subtitle: String($('promo-pop-subtitle')?.value || '').trim(),
            description: String($('promo-pop-description')?.value || '').trim(),
            status: 'draft',
            theme: String($('promo-pop-theme')?.value || 'retail-impact').trim(),
            layout: String($('promo-pop-layout')?.value || 'auto').trim(),
            template_id: state.templateId,
            paper_size: String($('promo-pop-paper')?.value || 'A4').trim(),
            orientation: String($('promo-pop-orientation')?.value || 'portrait').trim(),
            brochure_name: title,
            store_name: String($('promo-pop-store')?.value || '').trim(),
            store_address: String($('promo-pop-address')?.value || '').trim(),
            badge_text: String($('promo-pop-badge')?.value || '').trim(),
            hero_image: state.heroDataUrl && /^data:/i.test(state.heroDataUrl) ? '' : safeHttpUrl($('promo-pop-hero')?.value || ''),
            banner_url: state.heroDataUrl && /^data:/i.test(state.heroDataUrl) ? '' : safeHttpUrl($('promo-pop-hero')?.value || ''),
            items_json: JSON.stringify(rows.map((item) => ({
                id: item.id,
                name: item.name,
                image: item.image,
                normal_price: Number(item.normal_price) || 0,
                promo_price: Number(item.promo_price) || 0,
                unit: item.unit || '',
                badge: item.badge || '',
                is_featured: state.featuredIds.has(String(item.id)),
                sort_order: rows.indexOf(item)
            }))),
            start_at: String($('promo-pop-start')?.value || '').trim(),
            end_at: String($('promo-pop-end')?.value || '').trim(),
            sort_order: Number($('promo-pop-sort')?.value || 0),
            period_text: String($('promo-pop-period')?.value || '').trim(),
            footer_note: String($('promo-pop-footer')?.value || '').trim(),
            disclaimer_text: String($('promo-pop-disclaimer')?.value || '').trim(),
            show_service: $('promo-pop-show-service')?.checked ? 'true' : 'false',
            show_payment: $('promo-pop-show-payment')?.checked ? 'true' : 'false',
            show_disclaimer: $('promo-pop-show-disclaimer')?.checked ? 'true' : 'false',
            show_watermark: $('promo-pop-watermark')?.checked ? 'true' : 'false',
            watermark_text: String($('promo-pop-watermark-text')?.value || '').trim(),
            show_qr_code: $('promo-pop-qr')?.value ? 'true' : 'false',
            qr_url: String($('promo-pop-qr')?.value || '').trim(),
            banner_config_json: JSON.stringify({ top: String($('promo-pop-top-banner')?.value || '').trim(), bottom: String($('promo-pop-bottom-banner')?.value || '').trim() }),
            grid_config_json: JSON.stringify({ layout: String($('promo-pop-layout')?.value || 'auto').trim(), rows: getGridSettings().rows, columns: getGridSettings().columns, image_frame_height: getCropSettings().frame, image_scale: getCropSettings().scale }),
            created_by: GASActions.getAdminRole() || 'admin',
            updated_at: new Date().toISOString()
        };
    }

    function fillForm(campaign) {
        if (!campaign) return;
        state.editingId = String(campaign.id || '');
        setFormStatusBadge(campaignStatus(campaign));
        $('promo-pop-title').value = campaign.title || '';
        $('promo-pop-slug').value = campaign.slug || '';
        $('promo-pop-subtitle').value = campaign.subtitle || '';
        $('promo-pop-description').value = campaign.description || '';
        $('promo-pop-theme').value = campaign.theme || 'retail-impact';
        $('promo-pop-layout').value = campaign.layout || 'auto';
        let gridConfig = {};
        try { gridConfig = JSON.parse(campaign.grid_config_json || '{}') || {}; } catch (error) { gridConfig = {}; }
        const frameField = $('promo-pop-image-frame');
        const scaleField = $('promo-pop-image-scale');
        const rowsField = $('promo-pop-grid-rows');
        const columnsField = $('promo-pop-grid-columns');
        if (frameField) frameField.value = Math.min(220, Math.max(64, Number(gridConfig.image_frame_height) || 82));
        if (scaleField) scaleField.value = Math.min(110, Math.max(70, Math.round((Number(gridConfig.image_scale) || 1) * 100)));
        if (rowsField) rowsField.value = Math.min(8, Math.max(1, Number(gridConfig.rows) || 4));
        if (columnsField) columnsField.value = Math.min(6, Math.max(1, Number(gridConfig.columns) || 3));
        $('promo-pop-paper').value = campaign.paper_size || 'A4';
        $('promo-pop-orientation').value = campaign.orientation || 'portrait';
        state.templateId = campaign.template_id || 'promo-grid';
        $('promo-pop-store').value = campaign.store_name || '';
        $('promo-pop-badge').value = campaign.badge_text || '';
        $('promo-pop-hero').value = campaign.hero_image || campaign.banner_url || '';
        state.heroDataUrl = '';
        const heroPreview = $('promo-pop-hero-preview');
        const restoredHeroUrl = safeHttpUrl($('promo-pop-hero').value);
        if (heroPreview) { heroPreview.src = restoredHeroUrl; heroPreview.style.display = restoredHeroUrl ? 'block' : 'none'; }
        $('promo-pop-qr').value = campaign.qr_url || '';
        const periodField = $('promo-pop-period');
        if (periodField) periodField.value = campaign.period_text || '';
        $('promo-pop-footer').value = campaign.footer_note || '';
        $('promo-pop-address').value = campaign.store_address || campaign.footer_note || '';
        $('promo-pop-disclaimer').value = campaign.disclaimer_text || 'Syarat & ketentuan berlaku. Harga dapat berubah sewaktu-waktu.';
        $('promo-pop-watermark').checked = String(campaign.show_watermark || '').toLowerCase() === 'true';
        $('promo-pop-watermark-text').value = campaign.watermark_text || '';
        $('promo-pop-show-service').checked = String(campaign.show_service || 'true').toLowerCase() !== 'false';
        $('promo-pop-show-payment').checked = String(campaign.show_payment || 'true').toLowerCase() !== 'false';
        $('promo-pop-show-disclaimer').checked = String(campaign.show_disclaimer || 'true').toLowerCase() !== 'false';
        $('promo-pop-start').value = campaign.start_at ? String(campaign.start_at).slice(0, 16) : '';
        $('promo-pop-end').value = campaign.end_at ? String(campaign.end_at).slice(0, 16) : '';
        const sortField = $('promo-pop-sort');
        if (sortField) sortField.value = campaign.sort_order || 0;
        let items = [];
        try {
            items = restoreCampaignItems(campaign);
        } catch (error) {
            console.error('fillForm restore error:', error, campaign);
            setStatus(`Mode edit gagal memulihkan produk: ${error.message || 'error runtime'}`, 'error');
            return;
        }
        setStatus(`Membuka mode edit: ${items.length} item ditemukan.`, items.length ? 'info' : 'error');
        try {
            selectTemplate(state.templateId);
            renderProductPicker();
            renderSelectedItems();
            renderPreview();
        } catch (error) {
            console.error('fillForm render error:', error);
            setStatus(`Mode edit gagal dirender: ${error.message || 'error tidak diketahui'}`, 'error');
            return;
        }
        const restoredCount = selectedProductRows().length;
        setStatus(restoredCount ? `Mode edit aktif: ${restoredCount} produk dipulihkan dari campaign.` : 'Mode edit aktif, tetapi item campaign tidak ditemukan. Periksa items_json pada backend.', restoredCount ? 'success' : 'error');
        if (items.length && !restoredCount) {
            setTimeout(() => {
                if (state.editingId !== String(campaign.id || '')) return;
                restoreCampaignItems(campaign);
                renderProductPicker();
                renderSelectedItems();
                renderPreview();
                const deferredCount = selectedProductRows().length;
                setStatus(deferredCount ? `Mode edit aktif: ${deferredCount} produk dipulihkan dari campaign.` : 'Item campaign belum dapat dipulihkan. Periksa response API.', deferredCount ? 'success' : 'error');
            }, 0);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function resetForm() {
        state.editingId = '';
        setFormStatusBadge('draft');
        state.templateId = 'promo-grid';
        state.heroDataUrl = '';
        state.featuredIds.clear();
        $('promo-pop-form')?.reset();
        const heroPreview = $('promo-pop-hero-preview');
        if (heroPreview) { heroPreview.src = ''; heroPreview.style.display = 'none'; }
        state.selectedItems.clear();
        selectTemplate(state.templateId);
        renderProductPicker();
        renderSelectedItems();
        renderPreview();
        setStatus('Campaign baru siap diisi.', 'info');
    }

    function renderCampaigns() {
        const container = $('promo-pop-campaign-list');
        if (!container) return;
        if (!state.campaigns.length) {
            container.innerHTML = '<div class="p-6 text-sm text-slate-500">Belum ada campaign POP.</div>';
            return;
        }
        container.innerHTML = state.campaigns.map((campaign) => {
            const status = campaignStatus(campaign);
            const items = parseCampaignItems(campaign);
            return `<article class="campaign-row">
                <div class="campaign-color theme-${escapeHtml(campaign.theme || 'orange')}"></div>
                <div class="campaign-main"><h4>${escapeHtml(campaign.title || 'Tanpa judul')}</h4><p>${items.length} produk · ${escapeHtml(campaign.start_at || 'Tanpa mulai')} — ${escapeHtml(campaign.end_at || 'Tanpa akhir')}</p></div>
                <span class="status-badge status-${escapeHtml(status)}">${status === 'published' ? 'Published' : status === 'expired' ? 'Expired' : 'Draft'}</span><div class="campaign-actions"><button type="button" class="small-action" data-edit-campaign="${escapeHtml(campaign.id)}">Edit</button>${status !== 'expired' ? `<button type="button" class="small-action ${status === 'published' ? 'warning' : 'success'}" data-toggle-campaign="${escapeHtml(campaign.id)}" data-campaign-status="${escapeHtml(status)}">${status === 'published' ? 'Unpublish' : 'Publish'}</button>` : ''}<button type="button" class="small-action danger" data-delete-campaign="${escapeHtml(campaign.id)}">Hapus</button></div>
            </article>`;
        }).join('');
    }

    async function saveCampaign(event) {
        event.preventDefault();
        if (state.busy) return;
        const data = collectFormData();
        if (!data.title) return setStatus('Judul campaign wajib diisi.', 'error');
        const rowsWithHigherPromo = selectedProductRows().filter(item => Number(item.promo_price || 0) > Number(item.normal_price || 0));
        if (!selectedProductRows().length) return setStatus('Pilih minimal satu produk.', 'error');
        if (rowsWithHigherPromo.length && !window.confirm(`Ada ${rowsWithHigherPromo.length} produk dengan harga promo lebih tinggi daripada harga normal. Tetap simpan?`)) return;
        state.busy = true;
        try {
            if (state.editingId) {
                await GASActions.update(SHEET, state.editingId, data);
            } else {
                await GASActions.create(SHEET, data);
            }
            setStatus('Campaign POP tersimpan sebagai draft.', 'success');
            resetForm();
            await fetchCampaigns();
        } catch (error) {
            setStatus(apiErrorMessage({ error: error.message }, 'Gagal menyimpan campaign.'), 'error');
        } finally {
            state.busy = false;
        }
    }

    async function toggleCampaign(id, currentStatus) {
        if (state.busy) return;
        state.busy = true;
        try {
            await GASActions.post({ action: currentStatus === 'published' ? 'promo_flyer_unpublish' : 'promo_flyer_publish', sheet: SHEET, id, data: { id, actor: GASActions.getAdminRole() || 'admin' } });
            setStatus(currentStatus === 'published' ? 'Campaign di-unpublish.' : 'Campaign berhasil dipublikasikan.', 'success');
            await fetchCampaigns();
        } catch (error) {
            setStatus(apiErrorMessage({ error: error.message }, 'Gagal mengubah status campaign.'), 'error');
        } finally {
            state.busy = false;
        }
    }

    async function deleteCampaign(id) {
        if (!window.confirm('Hapus campaign POP ini?')) return;
        try {
            await GASActions.delete(SHEET, id);
            setStatus('Campaign dihapus.', 'success');
            await fetchCampaigns();
        } catch (error) {
            setStatus(apiErrorMessage({ error: error.message }, 'Gagal menghapus campaign.'), 'error');
        }
    }

    function shareWhatsApp() {
        const title = $('promo-pop-title')?.value || 'Promo Spesial';
        const subtitle = $('promo-pop-subtitle')?.value || '';
        const period = $('promo-pop-period')?.value || $('promo-pop-end')?.value || '';
        const qr = $('promo-pop-qr')?.value || '';
        const rows = selectedProductRows().slice(0, 6);
        if (!rows.length) return setStatus('Pilih minimal satu produk sebelum membagikan promo.', 'error');
        const itemsText = rows.map((item) => `• *${item.name}*: ~~${formatCurrency(item.normal_price)}~~ → *${formatCurrency(item.promo_price)}*${item.badge ? ` (${item.badge})` : ''}`).join('\n');
        const text = `🔥 *${title}* 🔥\n${subtitle ? `_${subtitle}_\n` : ''}${period ? `📅 Berlaku sampai ${period}\n` : ''}\n🛒 *PROMO SPESIAL:*\n${itemsText}${qr ? `\n\n🔗 ${qr}` : ''}`;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    }

    async function prepareBackend() {
        try {
            await GASActions.post({ action: 'ensure_schema', data: { repair: true } });
            setStatus('Schema backend diperiksa. Sheet promo_flyers siap digunakan.', 'success');
            await fetchCampaigns();
        } catch (error) {
            setStatus(apiErrorMessage({ error: error.message }, 'Gagal menyiapkan schema backend.'), 'error');
        }
    }

    function bindEvents() {
        $('promo-pop-form')?.addEventListener('submit', saveCampaign);
        $('promo-pop-product-search')?.addEventListener('input', renderProductPicker);
        $('promo-pop-category-filter')?.addEventListener('change', renderProductPicker);
        $('promo-pop-stock-filter')?.addEventListener('change', renderProductPicker);
        $('promo-pop-new')?.addEventListener('click', resetForm);
        $('promo-pop-save-top')?.addEventListener('click', () => $('promo-pop-form')?.requestSubmit());
        $('promo-pop-prepare-backend')?.addEventListener('click', prepareBackend);
        document.querySelectorAll('[data-template]').forEach((button) => button.addEventListener('click', () => selectTemplate(button.dataset.template)));
        ['promo-pop-title', 'promo-pop-subtitle', 'promo-pop-theme', 'promo-pop-layout', 'promo-pop-store', 'promo-pop-badge', 'promo-pop-hero', 'promo-pop-period', 'promo-pop-footer', 'promo-pop-qr', 'promo-pop-address', 'promo-pop-disclaimer', 'promo-pop-watermark-text', 'promo-pop-paper', 'promo-pop-orientation'].forEach((id) => $(id)?.addEventListener('input', renderPreview));
        ['promo-pop-watermark', 'promo-pop-show-service', 'promo-pop-show-payment', 'promo-pop-show-disclaimer'].forEach((id) => $(id)?.addEventListener('change', renderPreview));
        $('promo-pop-hero-file')?.addEventListener('change', handleHeroUpload);
        $('promo-pop-zoom-out')?.addEventListener('click', () => setPreviewZoom(-.1));
        $('promo-pop-zoom-in')?.addEventListener('click', () => setPreviewZoom(.1));
        $('promo-pop-zoom-reset')?.addEventListener('click', resetPreviewZoom);
        $('promo-pop-pdf')?.addEventListener('click', generatePdf);
        $('promo-pop-png')?.addEventListener('click', generatePng);
        $('promo-pop-print')?.addEventListener('click', printPreview);
        $('promo-pop-bulk-apply')?.addEventListener('click', () => applyBulkPricing($('promo-pop-bulk-type')?.value || 'percentage', $('promo-pop-bulk-value')?.value));
        $('promo-pop-bulk-reset')?.addEventListener('click', resetBulkPricing);
        $('promo-pop-share')?.addEventListener('click', shareWhatsApp);
        document.querySelectorAll('[data-bulk-preset]').forEach((button) => button.addEventListener('click', () => {
            $('promo-pop-bulk-type').value = 'percentage';
            $('promo-pop-bulk-value').value = button.dataset.bulkPreset;
            applyBulkPricing('percentage', button.dataset.bulkPreset);
        }));
        $('promo-pop-title')?.addEventListener('input', () => {
            if (!state.editingId) $('promo-pop-slug').value = slugify($('promo-pop-title').value);
        });
        $('promo-pop-image-frame')?.addEventListener('input', renderPreview);
        $('promo-pop-image-scale')?.addEventListener('input', renderPreview);
        $('promo-pop-grid-rows')?.addEventListener('input', renderPreview);
        $('promo-pop-grid-columns')?.addEventListener('input', renderPreview);
        $('promo-pop-product-list')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-select-product]');
            if (!button) return;
            const id = button.dataset.selectProduct;
            const product = state.products.find((item) => item.id === id);
            if (!product) return;
            if (state.selectedItems.has(id)) {
                state.selectedItems.delete(id);
                state.featuredIds.delete(id);
            } else {
                state.selectedItems.set(id, { id, name: product.name, image: product.image, unit: product.unit, brand: product.brand, sku: product.sku, stock: product.stock, normal_price: product.price, promo_price: product.price });
            }
            renderProductPicker();
            renderSelectedItems();
            renderPreview();
        });
        $('promo-pop-product-list')?.addEventListener('input', (event) => {
            const input = event.target.closest('[data-promo-badge]');
            if (!input) return;
            const item = state.selectedItems.get(input.dataset.promoBadge);
            if (item) item.badge = String(input.value || '').trim();
            renderPreview();
        });
        $('promo-pop-product-list')?.addEventListener('change', (event) => {
            const input = event.target.closest('[data-promo-price]');
            const badgeInput = event.target.closest('[data-promo-badge]');
            if (input) {
                const item = state.selectedItems.get(input.dataset.promoPrice);
                if (item) item.promo_price = Number(input.value) || 0;
            }
            if (badgeInput) {
                const item = state.selectedItems.get(badgeInput.dataset.promoBadge);
                if (item) item.badge = String(badgeInput.value || '').trim();
            }
            if (!input && !badgeInput) return;
            renderSelectedItems();
            renderPreview();
        });
        $('promo-pop-selected-list')?.addEventListener('click', (event) => {
            const featureButton = event.target.closest('[data-feature-product]');
            const removeButton = event.target.closest('[data-remove-product]');
            if (featureButton) {
                const id = featureButton.dataset.featureProduct;
                if (state.featuredIds.has(id)) state.featuredIds.delete(id);
                else if (state.featuredIds.size < 3) state.featuredIds.add(id);
                else return setStatus('Maksimal 3 produk unggulan.', 'error');
                renderSelectedItems(); renderPreview(); return;
            }
            if (!removeButton) return;
            state.selectedItems.delete(removeButton.dataset.removeProduct);
            state.featuredIds.delete(removeButton.dataset.removeProduct);
            renderProductPicker(); renderSelectedItems(); renderPreview();
        });
        let draggedProductId = '';
        $('promo-pop-selected-list')?.addEventListener('dragstart', (event) => {
            const row = event.target.closest('[data-selected-id]');
            draggedProductId = row?.dataset.selectedId || '';
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        });
        $('promo-pop-selected-list')?.addEventListener('dragover', (event) => {
            if (event.target.closest('[data-selected-id]')) event.preventDefault();
        });
        $('promo-pop-selected-list')?.addEventListener('drop', (event) => {
            event.preventDefault();
            const targetId = event.target.closest('[data-selected-id]')?.dataset.selectedId;
            if (!draggedProductId || !targetId || draggedProductId === targetId) return;
            const ids = selectedProductRows().map(item => String(item.id));
            const from = ids.indexOf(draggedProductId), to = ids.indexOf(targetId);
            if (from < 0 || to < 0) return;
            ids.splice(to, 0, ids.splice(from, 1)[0]);
            const reordered = new Map(ids.map(id => [id, state.selectedItems.get(id)]));
            state.selectedItems.clear(); reordered.forEach((item, id) => state.selectedItems.set(id, item));
            renderSelectedItems(); renderPreview();
            draggedProductId = '';
        });
        $('promo-pop-campaign-list')?.addEventListener('click', (event) => {
            const edit = event.target.closest('[data-edit-campaign]');
            const toggle = event.target.closest('[data-toggle-campaign]');
            const remove = event.target.closest('[data-delete-campaign]');
            if (edit) {
                const id = String(edit.dataset.editCampaign || '').trim();
                const campaign = state.campaigns.find((item) => String(item.id || '').trim() === id);
                if (!campaign) {
                    setStatus(`Campaign dengan ID ${id || '(kosong)'} tidak ditemukan pada response API.`, 'error');
                    return;
                }
                fillForm(campaign);
            }
            if (toggle) toggleCampaign(toggle.dataset.toggleCampaign, toggle.dataset.campaignStatus);
            if (remove) deleteCampaign(remove.dataset.deleteCampaign);
        });
    }

    async function boot() {
        if (!window.AdminAuth || !AdminAuth.ensureOrRedirect()) return;
        bindEvents();
        setStatus('Memuat produk dan campaign...', 'info');
        try {
            await Promise.all([fetchProducts(), fetchCampaigns()]);
            renderSelectedItems();
            renderPreview();
            setStatus('Generator Catalog Promo POP siap digunakan.', 'success');
        } catch (error) {
            setStatus(error.message || 'Gagal memuat data generator.', 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
