(function () {
    'use strict';

    const SHEET = 'promo_flyers';
    const PPOB_WALLETS = Object.freeze([
        { id: 'dana', label: 'DANA', initial: 'D' },
        { id: 'gopay', label: 'GoPay', initial: 'G' },
        { id: 'ovo', label: 'OVO', initial: 'O' },
        { id: 'shopeepay', label: 'ShopeePay', initial: 'S' },
        { id: 'linkaja', label: 'LinkAja', initial: 'L' }
    ]);
    const state = {
        products: [],
        campaigns: [],
        selectedItems: new Map(),
        featuredIds: new Set(),
        editingId: '',
        busy: false,
        templateId: 'promo-grid',
        heroDataUrl: '',
        previewZoom: 1,
        tilePositions: { __default: { image: { x: 50, y: 24, scale: 1 }, name: { x: 50, y: 73, scale: 1 }, normal: { x: 78, y: 65, scale: 1 }, promo: { x: 50, y: 86, scale: 1 }, offer: { x: 50, y: 96, scale: 1 } } },
        layoutClipboard: '',
        phase1SmartTextFit: false,
        phase1AutosaveTimer: 0,
        phase1AutosaveBusy: false
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

    function formatCurrencyMarkup(value) {
        const amount = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(value) || 0);
        return `<span class="currency-price"><span class="currency-prefix">Rp</span><span class="currency-amount">${escapeHtml(amount)}</span></span>`;
    }

    function formatStrikePrice(value) {
        const amount = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(value) || 0);
        return `<del class="strike-price">${escapeHtml(amount)}</del>`;
    }

    function getSelectedPpobWallets() {
        return PPOB_WALLETS.filter((wallet) => $(`promo-pop-wallet-${wallet.id}`)?.checked).map((wallet) => wallet.id);
    }

    function restorePpobWallets(value) {
        let selected = [];
        try { selected = Array.isArray(value) ? value : JSON.parse(String(value || '[]')); } catch (error) { selected = []; }
        const ids = new Set((selected || []).map((item) => String(item || '').trim().toLowerCase()));
        PPOB_WALLETS.forEach((wallet) => {
            const checkbox = $(`promo-pop-wallet-${wallet.id}`);
            if (checkbox) checkbox.checked = ids.has(wallet.id);
        });
    }

    function renderPpobWalletMarkup(walletIds, className) {
        const selected = new Set((walletIds || []).map((item) => String(item || '').trim().toLowerCase()));
        const wallets = PPOB_WALLETS.filter((wallet) => selected.has(wallet.id));
        if (!wallets.length) return '';
        return `<div class="${className || 'flyer-ppob-wallets'}">${wallets.map((wallet) => `<span class="flyer-ppob-wallet"><span class="flyer-ppob-wallet-icon ${wallet.id}">${wallet.initial}</span><span>${escapeHtml(wallet.label)}</span></span>`).join('')}</div>`;
    }

    // Brochure-only overrides stay on the campaign item snapshot and never mutate state.products.
    function brochureName(item) {
        return String(item?.brochure_name ?? item?.name ?? 'Produk').trim() || 'Produk';
    }

    function brochureNormalPrice(item) {
        return Number(item?.brochure_normal_price ?? item?.normal_price ?? 0) || 0;
    }

    function brochurePromoPrice(item) {
        return Number(item?.brochure_promo_price ?? item?.promo_price ?? brochureNormalPrice(item)) || 0;
    }

    function brochureOffer(item) {
        const fallback = item?.unit ? `Harga spesial · ${item.unit}` : (item?.badge || 'Promo terbatas');
        return String(item?.brochure_offer ?? fallback).trim() || 'Promo terbatas';
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

    function fitPreviewToSafeArea() {
        const preview = $('promo-pop-preview');
        const content = preview?.querySelector('.flyer-preview-content');
        const artwork = content?.querySelector('.flyer-preview-content-scale');
        if (!preview || !content || !artwork) return;
        preview.classList.add('is-fitting');
        preview.style.setProperty('--flyer-content-scale', '1');
        const availableWidth = Math.max(1, content.clientWidth);
        const availableHeight = Math.max(1, content.clientHeight);
        const naturalWidth = Math.max(1, artwork.scrollWidth, artwork.offsetWidth);
        const naturalHeight = Math.max(1, artwork.scrollHeight, artwork.offsetHeight);
        const scale = Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
        preview.style.setProperty('--flyer-content-scale', String(Math.max(.25, Number(scale.toFixed(4)))));
    }

    async function waitForPreviewAssets(preview) {
        if (document.fonts?.ready) await document.fonts.ready;
        const images = Array.from(preview.querySelectorAll('img'));
        if (!images.length) return;
        await Promise.all(images.map((image) => {
            if (image.complete) return Promise.resolve();
            return new Promise((resolve) => {
                const finish = () => { image.removeEventListener('load', finish); image.removeEventListener('error', finish); resolve(); };
                image.addEventListener('load', finish, { once: true });
                image.addEventListener('error', finish, { once: true });
                setTimeout(finish, 15000);
            });
        }));
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
            syncBrochureFieldsFromDom();
            renderPreview();
            resetPreviewZoom();
            await waitForPreviewAssets(preview);
            fitPreviewToSafeArea();
            const canvas = await html2canvas(preview, { scale: 3, useCORS: true, allowTaint: false, imageTimeout: 15000, backgroundColor: '#ffffff', logging: false });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
            const pageW = 210, pageH = 297, margin = 0;
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
            syncBrochureFieldsFromDom();
            renderPreview();
            resetPreviewZoom();
            await waitForPreviewAssets(preview);
            fitPreviewToSafeArea();
            const canvas = await html2canvas(preview, { scale: 3, useCORS: true, allowTaint: false, imageTimeout: 15000, backgroundColor: '#ffffff', logging: false });
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

    async function openPrintPreview() {
        const preview = $('promo-pop-preview');
        const modal = $('promo-pop-print-modal');
        const sheet = $('promo-pop-print-sheet');
        if (!preview || !modal || !sheet) return;
        syncBrochureFieldsFromDom();
        renderPreview();
        resetPreviewZoom();
        sheet.innerHTML = '<div class="pop-empty">Mempersiapkan pratinjau cetak...</div>';
        modal.hidden = false;
        document.body.classList.add('print-preview-open');
        try {
            await waitForPreviewAssets(preview);
            fitPreviewToSafeArea();
            if (typeof html2canvas !== 'function') throw new Error('html2canvas belum siap');
            const canvas = await html2canvas(preview, { scale: 2, useCORS: true, allowTaint: false, imageTimeout: 15000, backgroundColor: '#ffffff', logging: false });
            const image = document.createElement('img');
            image.alt = 'Pratinjau brosur A4 Portrait';
            image.src = canvas.toDataURL('image/png');
            sheet.replaceChildren(image);
        } catch (error) {
            console.error('openPrintPreview error:', error);
            sheet.replaceChildren(preview.cloneNode(true));
            setStatus('Pratinjau cetak ditampilkan. Jika ada gambar yang hilang, periksa izin CORS asset.', 'info');
        }
        $('promo-pop-print-close')?.focus();
    }

    function closePrintPreview() {
        const modal = $('promo-pop-print-modal');
        if (modal) modal.hidden = true;
        document.body.classList.remove('print-preview-open');
    }

    function printCurrentPreview() {
        const modal = $('promo-pop-print-modal');
        if (!modal || modal.hidden) return;
        window.print();
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

    function brochureInputId(input) {
        return String(input?.getAttribute('data-brochure-name')
            || input?.getAttribute('data-brochure-normal')
            || input?.getAttribute('data-brochure-promo')
            || input?.getAttribute('data-brochure-offer') || '').trim();
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
                    <input class="promo-price-input" data-promo-price="${escapeHtml(product.id)}" type="number" min="0" step="500" value="${escapeHtml(selected ? brochurePromoPrice(selected) : product.price)}" aria-label="Harga promo ${escapeHtml(product.name)}">
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
            brochure_name: String(raw.brochure_name ?? raw.display_name ?? raw.name ?? raw.product_name ?? raw.productName ?? source.name ?? 'Produk').trim(),
            brochure_normal_price: Number(raw.brochure_normal_price ?? raw.display_normal_price ?? raw.normal_price ?? raw.normalPrice ?? normal) || 0,
            brochure_promo_price: Number(raw.brochure_promo_price ?? raw.display_promo_price ?? raw.promo_price ?? raw.promoPrice ?? promo) || 0,
            brochure_offer: String(raw.brochure_offer ?? raw.display_offer ?? (raw.unit || source.unit ? `Harga spesial · ${raw.unit || source.unit}` : (raw.badge || 'Promo terbatas'))).trim(),
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
            item.brochure_promo_price = item.promo_price;
            item.badge = prefix ? `${prefix} ${type === 'fixed' ? formatCurrency(amount) : discountPct + '%'}` : '';
        });
        renderProductPicker();
        renderSelectedItems();
        renderPreview();
        setBulkResult(`${selected.length} produk diperbarui.`);
    }

    function resetBulkPricing() {
        const selected = selectedProducts();
        selected.forEach((item) => { item.promo_price = Number(item.normal_price) || 0; item.brochure_promo_price = item.promo_price; item.badge = ''; });
        renderProductPicker();
        renderSelectedItems();
        renderPreview();
        setBulkResult(`${selected.length} harga dikembalikan ke harga normal.`);
    }

    function cloneTilePositions(productId) {
        return Object.fromEntries(Object.entries(tilePositionsForProduct(productId)).map(([field, position]) => [field, { ...position }]));
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
            return `<div class="selected-product-row" draggable="true" data-selected-id="${escapeHtml(item.id)}" aria-label="Urutan ${index + 1}: ${escapeHtml(brochureName(item))}">
                <span class="selected-drag-handle" tabindex="0" role="button" title="Seret untuk mengatur urutan" aria-label="Seret ${escapeHtml(brochureName(item))} untuk mengatur urutan">⋮⋮</span><span class="selected-number">${index + 1}</span>
                <div class="selected-product-main"><strong>${escapeHtml(brochureName(item))}</strong><span>${isOut ? '⚠ Stok habis · ' : ''}Harga database ${formatCurrency(item.normal_price)}</span>
                    <div class="selected-brochure-fields" aria-label="Edit konten brosur ${escapeHtml(brochureName(item))}">
                        <input type="text" data-brochure-name="${escapeHtml(item.id)}" value="${escapeHtml(brochureName(item))}" placeholder="Nama di brosur" aria-label="Nama brosur ${escapeHtml(brochureName(item))}">
                        <input type="number" min="0" step="500" data-brochure-normal="${escapeHtml(item.id)}" value="${escapeHtml(brochureNormalPrice(item))}" placeholder="Harga coret" aria-label="Harga coret brosur ${escapeHtml(brochureName(item))}">
                        <input type="number" min="0" step="500" data-brochure-promo="${escapeHtml(item.id)}" value="${escapeHtml(brochurePromoPrice(item))}" placeholder="Harga promo" aria-label="Harga promo brosur ${escapeHtml(brochureName(item))}">
                        <input type="text" data-brochure-offer="${escapeHtml(item.id)}" value="${escapeHtml(brochureOffer(item))}" placeholder="Teks promo" aria-label="Teks promo ${escapeHtml(brochureName(item))}">
                    </div>
                </div>
                <div class="selected-product-actions"><strong style="color:#ea580c;font-size:12px;">${formatCurrency(brochurePromoPrice(item))}</strong><button type="button" class="${isFeatured ? 'is-featured' : ''}" data-feature-product="${escapeHtml(item.id)}">${isFeatured ? '★ Unggulan' : '☆ Featured'}</button><button type="button" data-copy-layout="${escapeHtml(item.id)}">Salin layout</button>${state.layoutClipboard && state.layoutClipboard !== String(item.id) ? `<button type="button" data-paste-layout="${escapeHtml(item.id)}">Tempel layout</button>` : ''}<button type="button" data-remove-product="${escapeHtml(item.id)}">Hapus</button></div>
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

    function normalizeTilePositions(value) {
        const defaults = { image: { x: 50, y: 24, scale: 1 }, name: { x: 50, y: 73, scale: 1 }, normal: { x: 78, y: 65, scale: 1 }, promo: { x: 50, y: 86, scale: 1 }, offer: { x: 50, y: 96, scale: 1 } };
        const normalizeFields = (source) => Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
            const item = source && source[key] && typeof source[key] === 'object' ? source[key] : {};
            return [key, { x: Math.min(96, Math.max(4, Number(item.x) || fallback.x)), y: Math.min(96, Math.max(4, Number(item.y) || fallback.y)), scale: Math.min(2, Math.max(.6, Number(item.scale) || fallback.scale)) }];
        }));
        const source = value && typeof value === 'object' ? value : {};
        if (Object.keys(source).some(key => ['image', 'name', 'normal', 'promo', 'offer'].includes(key))) return { __default: normalizeFields(source) };
        return Object.fromEntries(Object.entries(source).map(([productId, positions]) => [productId, normalizeFields(positions)]).concat([['__default', normalizeFields(source.__default)]]));
    }

    function tilePositionsForProduct(productId) {
        const defaults = state.tilePositions.__default || normalizeTilePositions();
        return state.tilePositions[String(productId)] || defaults;
    }

    function tilePositionStyle(productId, field, extra) {
        const position = tilePositionsForProduct(productId)[field] || { x: 50, y: 50 };
        return `left:${position.x}%;top:${position.y}%;transform:translate(-50%,-50%) scale(${position.scale || 1});${extra || ''}`;
    }

    function bindTilePositionDrag() {
        const preview = $('promo-pop-preview');
        if (!preview) return;
        preview.querySelectorAll('[data-tile-position]').forEach((element) => {
            element.addEventListener('wheel', (event) => {
                event.preventDefault();
                const field = element.dataset.tilePosition;
                const productId = element.dataset.productId;
                if (!field || !productId) return;
                const productPositions = tilePositionsForProduct(productId);
                const current = productPositions[field] || { x: 50, y: 50, scale: 1 };
                const scale = Math.min(2, Math.max(.6, (Number(current.scale) || 1) + (event.deltaY < 0 ? .05 : -.05)));
                state.tilePositions[productId] = { ...productPositions, [field]: { ...current, scale: Number(scale.toFixed(2)) } };
                element.style.transform = `translate(-50%,-50%) scale(${scale})`;
                element.title = `Ukuran ${Math.round(scale * 100)}% · Scroll untuk mengubah`;
            }, { passive: false });
            element.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                const field = element.dataset.tilePosition;
                const productId = element.dataset.productId;
                const surface = element.closest('[data-position-surface]');
                if (!surface || !field || !productId) return;
                const rect = surface.getBoundingClientRect();
                const move = (moveEvent) => {
                    const x = Math.min(96, Math.max(4, ((moveEvent.clientX - rect.left) / rect.width) * 100));
                    const y = Math.min(96, Math.max(4, ((moveEvent.clientY - rect.top) / rect.height) * 100));
                    const productPositions = tilePositionsForProduct(productId);
                    state.tilePositions[productId] = { ...productPositions, [field]: { ...productPositions[field], x, y } };
                    element.style.left = `${x}%`;
                    element.style.top = `${y}%`;
                    element.style.transform = `translate(-50%,-50%) scale(${productPositions[field].scale || 1})`;
                };
                const finish = () => {
                    element.removeEventListener('pointermove', move);
                    element.removeEventListener('pointerup', finish);
                    element.removeEventListener('pointercancel', finish);
                    renderPreview();
                };
                element.addEventListener('pointermove', move);
                element.addEventListener('pointerup', finish);
                element.addEventListener('pointercancel', finish);
                if (element.setPointerCapture) element.setPointerCapture(event.pointerId);
            });
        });
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
        const renderPositionedItem = (item) => {
            const productId = escapeHtml(String(item.id));
            const isRetail = layout === 'retail-tile';
            const itemClass = `flyer-item flyer-positioned-item${isRetail ? ' flyer-retail-tile' : ''}`;
            const elementClass = (field, legacyClass) => `flyer-positioned-element flyer-positioned-${field}${isRetail ? ` ${legacyClass}` : ''}`;
            const draggableAttrs = (field, label) => `data-tile-position="${field}" data-product-id="${productId}" style="${tilePositionStyle(item.id, field)}" tabindex="0" role="button" aria-label="Seret atau scroll ${label} untuk mengubah posisi dan ukuran"`;
            return `<article class="${itemClass}" data-position-surface="${productId}">
                <div class="${elementClass('media', 'flyer-retail-media')}" ${draggableAttrs('image', 'gambar produk')}>${item.image ? `<img src="${escapeHtml(safeHttpUrl(item.image))}" alt="" loading="eager">` : 'POP'}${item.badge ? `<span class="flyer-item-badge">${escapeHtml(item.badge)}</span>` : ''}</div>
                <div class="${elementClass('name', 'flyer-retail-name')}" ${draggableAttrs('name', 'nama produk')}>${escapeHtml(brochureName(item))}</div>
                <div class="${elementClass('normal', 'flyer-retail-normal')}" ${draggableAttrs('normal', 'harga coret')}>${formatStrikePrice(brochureNormalPrice(item))}</div>
                <div class="${elementClass('promo', 'flyer-retail-promo')}" ${draggableAttrs('promo', 'harga promo')}>${formatCurrencyMarkup(brochurePromoPrice(item))}</div>
                <div class="${elementClass('offer', 'flyer-retail-offer')}" ${draggableAttrs('offer', 'teks promo')}>${escapeHtml(brochureOffer(item))}</div>
            </article>`;
        };
        const productMarkup = rows.slice(0, grid.limit).map(renderPositionedItem).join('');
        const featuredMarkup = featured.length ? `<div class="flyer-featured"><div class="flyer-media-frame">${featured[0].image ? `<img src="${escapeHtml(safeHttpUrl(featured[0].image))}" alt="" loading="eager">` : 'POP'}</div><div><div class="flyer-featured-label">Produk Unggulan</div><div style="margin-top:4px;color:#334155;font-size:12px;font-weight:900;">${escapeHtml(brochureName(featured[0]))}</div><div class="flyer-item-normal">${formatStrikePrice(brochureNormalPrice(featured[0]))}</div><div class="flyer-item-promo">${formatCurrencyMarkup(brochurePromoPrice(featured[0]))}</div></div></div>` : '';
        const selectedWallets = getSelectedPpobWallets();
        const walletMarkup = renderPpobWalletMarkup(selectedWallets);
        const serviceMarkup = $('promo-pop-show-service')?.checked ? `<div class="flyer-service"><strong style="color:#334155;">MELAYANI TOP UP DIGITAL & PPOB</strong><br>Pulsa · Paket Data · Token PLN · E-Wallet · Bayar Tagihan${walletMarkup}</div>` : '';
        const paymentMarkup = $('promo-pop-show-payment')?.checked ? '<div class="flyer-payment">Pembayaran: QRIS · GoPay · DANA · OVO · Transfer Bank</div>' : '';
        const disclaimerMarkup = $('promo-pop-show-disclaimer')?.checked && disclaimer ? `<div class="flyer-payment">${escapeHtml(disclaimer)}</div>` : '';
        const watermarkText = String($('promo-pop-watermark-text')?.value || '').trim() || 'PaketSembako.com';
        const watermarkMarkup = $('promo-pop-watermark')?.checked ? `<span class="flyer-watermark">${escapeHtml(watermarkText)}</span>` : '';
        preview.className = `flyer-preview flyer-theme-${escapeHtml(themeClass(theme))} flyer-layout-${escapeHtml(layoutClass(layout))}${state.phase1SmartTextFit ? ' phase1-smart-fit' : ''}`;
        preview.innerHTML = `<div class="flyer-preview-content"><div class="flyer-preview-content-scale"><div class="flyer-preview-hero" ${hero ? `style="background-image:url('${escapeHtml(hero)}')"` : ''}><div class="flyer-overlay"></div><div class="relative z-10"><span class="flyer-kicker">🔥 ${escapeHtml(store).toUpperCase()}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p>${period ? `<span class="flyer-period">${escapeHtml(period)}</span>` : ''}</div></div><div class="flyer-preview-meta"><strong>${escapeHtml(badge)}</strong><span>${rows.length} produk promo</span></div><div class="flyer-preview-items">${productMarkup || '<div style="grid-column:1/-1;color:#94a3b8;font-size:11px;text-align:center;padding:28px 0;">Preview produk akan tampil di sini.</div>'}${featuredMarkup}</div>${serviceMarkup}${paymentMarkup}<div class="flyer-preview-footer"><div class="flyer-footer-left"><strong>${escapeHtml(store)}</strong><span>${escapeHtml(address || 'Informasi toko akan tampil di sini')}</span></div><div class="flyer-footer-right">${qrDataUrl ? `<img class="flyer-qr" src="${qrDataUrl}" alt="QR Code">` : ''}<span>Scan<br>untuk pesan</span></div></div>${disclaimerMarkup}${watermarkMarkup}</div></div>`;
        bindTilePositionDrag();
        fitPreviewToSafeArea();
        if (typeof phase1ScheduleAutosave === 'function') phase1ScheduleAutosave();
        const size = $('promo-pop-preview-size');
        if (size) size.textContent = `A4 Portrait · 210 × 297 mm · margin internal 0,4 cm · ${rows.length} produk`;
    }

    function enforceA4Portrait() {
        const paper = $('promo-pop-paper');
        const orientation = $('promo-pop-orientation');
        if (paper) paper.value = 'A4';
        if (orientation) orientation.value = 'portrait';
    }

    function collectFormData() {
        enforceA4Portrait();
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
                brochure_name: brochureName(item),
                brochure_normal_price: brochureNormalPrice(item),
                brochure_promo_price: brochurePromoPrice(item),
                brochure_offer: brochureOffer(item),
                unit: item.unit || '',
                badge: item.badge || '',
                is_featured: state.featuredIds.has(String(item.id)),
                sort_order: rows.indexOf(item),
                promo_rule: item.promo_rule || null
            }))),
            start_at: String($('promo-pop-start')?.value || '').trim(),
            end_at: String($('promo-pop-end')?.value || '').trim(),
            sort_order: Number($('promo-pop-sort')?.value || 0),
            period_text: String($('promo-pop-period')?.value || '').trim(),
            footer_note: String($('promo-pop-footer')?.value || '').trim(),
            disclaimer_text: String($('promo-pop-disclaimer')?.value || '').trim(),
            show_service: $('promo-pop-show-service')?.checked ? 'true' : 'false',
            ppob_wallets_json: JSON.stringify(getSelectedPpobWallets()),
            show_payment: $('promo-pop-show-payment')?.checked ? 'true' : 'false',
            show_disclaimer: $('promo-pop-show-disclaimer')?.checked ? 'true' : 'false',
            show_watermark: $('promo-pop-watermark')?.checked ? 'true' : 'false',
            watermark_text: String($('promo-pop-watermark-text')?.value || '').trim(),
            show_qr_code: $('promo-pop-qr')?.value ? 'true' : 'false',
            qr_url: String($('promo-pop-qr')?.value || '').trim(),
            banner_config_json: JSON.stringify({ top: String($('promo-pop-top-banner')?.value || '').trim(), bottom: String($('promo-pop-bottom-banner')?.value || '').trim() }),
            grid_config_json: JSON.stringify({ layout: String($('promo-pop-layout')?.value || 'auto').trim(), rows: getGridSettings().rows, columns: getGridSettings().columns, image_frame_height: getCropSettings().frame, image_scale: getCropSettings().scale, tile_positions: normalizeTilePositions(state.tilePositions) }),
            snapshot_version: '1.0',
            promo_rules_json: JSON.stringify(rows.map((item) => item.promo_rule || null)),
            bundle_config_json: JSON.stringify(rows.find((item) => item.promo_rule?.type === 'bundle')?.promo_rule || {}),
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
        state.tilePositions = normalizeTilePositions(gridConfig.tile_positions);
        enforceA4Portrait();
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
        restorePpobWallets(campaign.ppob_wallets_json);
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
        state.tilePositions = normalizeTilePositions();
        state.layoutClipboard = '';
        state.featuredIds.clear();
        $('promo-pop-form')?.reset();
        restorePpobWallets([]);
        enforceA4Portrait();
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

    function syncBrochureFieldsFromDom() {
        document.querySelectorAll('#promo-pop-selected-list [data-brochure-name],#promo-pop-selected-list [data-brochure-normal],#promo-pop-selected-list [data-brochure-promo],#promo-pop-selected-list [data-brochure-offer]').forEach((input) => {
            const item = state.selectedItems.get(brochureInputId(input));
            if (!item) return;
            if (input.hasAttribute('data-brochure-name')) item.brochure_name = String(input.value || '').trim();
            if (input.hasAttribute('data-brochure-normal')) item.brochure_normal_price = Number(input.value) || 0;
            if (input.hasAttribute('data-brochure-promo')) { item.brochure_promo_price = Number(input.value) || 0; item.promo_price = item.brochure_promo_price; }
            if (input.hasAttribute('data-brochure-offer')) item.brochure_offer = String(input.value || '').trim();
        });
    }

    function shareWhatsApp() {
        syncBrochureFieldsFromDom();
        const title = $('promo-pop-title')?.value || 'Promo Spesial';
        const subtitle = $('promo-pop-subtitle')?.value || '';
        const period = $('promo-pop-period')?.value || $('promo-pop-end')?.value || '';
        const qr = $('promo-pop-qr')?.value || '';
        const rows = selectedProductRows().slice(0, 6);
        if (!rows.length) return setStatus('Pilih minimal satu produk sebelum membagikan promo.', 'error');
        const itemsText = rows.map((item) => {
            const name = brochureName(item);
            const normal = brochureNormalPrice(item);
            const promo = brochurePromoPrice(item);
            const offer = brochureOffer(item);
            const discount = normal > promo ? ` · ${Math.round((1 - (promo / normal)) * 100)}% OFF` : '';
            return `• *${name}*: ${normal > promo ? `~${formatCurrency(normal)}~ ` : ''}→ *${formatCurrency(promo)}*${discount}${offer ? `\n  _${offer}_` : ''}`;
        }).join('\n');
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

    const PHASE1_STORAGE = Object.freeze({ draft: 'sembakopop.phase1.draft', templates: 'sembakopop.phase1.templates', snapshots: 'sembakopop.phase1.snapshots' });

    function phase1StorageRead(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            console.warn('Phase 1 storage read failed:', error);
            return fallback;
        }
    }

    function phase1StorageWrite(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; }
        catch (error) { console.warn('Phase 1 storage write failed:', error); return false; }
    }

    function phase1SetStatus(id, message, tone) {
        const el = $(id);
        if (!el) return;
        el.textContent = message || '';
        el.classList.remove('ok', 'warn', 'error');
        if (tone) el.classList.add(tone);
    }

    function phase1CaptureDraft() {
        syncBrochureFieldsFromDom();
        const data = collectFormData();
        data.id = state.editingId || '';
        data.phase1_saved_at = new Date().toISOString();
        return data;
    }

    function phase1ScheduleAutosave() {
        window.clearTimeout(state.phase1AutosaveTimer);
        state.phase1AutosaveTimer = window.setTimeout(() => {
            const draft = phase1CaptureDraft();
            const saved = phase1StorageWrite(PHASE1_STORAGE.draft, draft);
            phase1SetStatus('phase1-draft-status', saved ? `Autosave lokal · ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 'Autosave lokal gagal. Storage browser tidak tersedia.', saved ? 'ok' : 'error');
        }, 900);
    }

    function phase1ConfigFromCurrent() {
        return {
            template_id: state.templateId,
            theme: $('promo-pop-theme')?.value || 'retail-impact',
            layout: $('promo-pop-layout')?.value || 'auto',
            rows: getGridSettings().rows,
            columns: getGridSettings().columns,
            image_frame_height: getCropSettings().frame,
            image_scale: getCropSettings().scale,
            store_name: $('promo-pop-store')?.value || '',
            badge_text: $('promo-pop-badge')?.value || '',
            footer_note: $('promo-pop-footer')?.value || ''
        };
    }

    function phase1ApplyConfig(config) {
        const value = config || {};
        const setValue = (id, next) => { const el = $(id); if (el && next != null) el.value = next; };
        setValue('promo-pop-theme', value.theme || 'retail-impact');
        setValue('promo-pop-layout', value.layout || 'auto');
        setValue('promo-pop-grid-rows', Math.min(8, Math.max(1, Number(value.rows) || 4)));
        setValue('promo-pop-grid-columns', Math.min(6, Math.max(1, Number(value.columns) || 3)));
        setValue('promo-pop-image-frame', Math.min(220, Math.max(64, Number(value.image_frame_height) || 82)));
        setValue('promo-pop-image-scale', Math.min(110, Math.max(70, Math.round((Number(value.image_scale) || 1) * 100))));
        setValue('promo-pop-store', value.store_name || '');
        setValue('promo-pop-badge', value.badge_text || '');
        setValue('promo-pop-footer', value.footer_note || '');
        if (value.template_id) selectTemplate(value.template_id);
        renderPreview();
    }

    function phase1RenderTemplates() {
        const container = $('phase1-template-list');
        if (!container) return;
        const templates = phase1StorageRead(PHASE1_STORAGE.templates, []);
        if (!templates.length) {
            container.innerHTML = '<small style="color:#7f8da8;font-size:9px;">Belum ada template pribadi.</small>';
            return;
        }
        container.innerHTML = templates.map((template) => `<div class="phase1-template-row"><div style="min-width:0;"><strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.config?.layout || 'auto')} · ${template.config?.rows || 4}×${template.config?.columns || 3}</small></div><div class="phase1-mini-actions"><button type="button" data-phase1-template-apply="${escapeHtml(template.id)}">Pakai</button><button type="button" data-phase1-template-delete="${escapeHtml(template.id)}">Hapus</button></div></div>`).join('');
    }

    function phase1SaveTemplate() {
        const input = $('phase1-template-name');
        const name = String(input?.value || '').trim();
        if (!name) return phase1SetStatus('phase1-template-status', 'Nama template wajib diisi.', 'warn');
        const templates = phase1StorageRead(PHASE1_STORAGE.templates, []);
        const item = { id: `tpl-${Date.now()}`, name: name.slice(0, 60), config: phase1ConfigFromCurrent(), created_at: new Date().toISOString() };
        phase1StorageWrite(PHASE1_STORAGE.templates, [item, ...templates].slice(0, 20));
        if (input) input.value = '';
        phase1RenderTemplates();
        phase1SetStatus('phase1-template-status', `Template “${name}” tersimpan di browser ini.`, 'ok');
    }

    function phase1ApplyTemplate(id) {
        const template = phase1StorageRead(PHASE1_STORAGE.templates, []).find((item) => item.id === id);
        if (!template) return;
        phase1ApplyConfig(template.config);
        phase1SetStatus('phase1-template-status', `Template “${template.name}” diterapkan ke preview.`, 'ok');
    }

    function phase1DeleteTemplate(id) {
        const templates = phase1StorageRead(PHASE1_STORAGE.templates, []).filter((item) => item.id !== id);
        phase1StorageWrite(PHASE1_STORAGE.templates, templates);
        phase1RenderTemplates();
        phase1SetStatus('phase1-template-status', 'Template dihapus dari library lokal.', 'ok');
    }

    function phase1RenderSnapshots() {
        const container = $('phase1-snapshot-list');
        if (!container) return;
        const snapshots = phase1StorageRead(PHASE1_STORAGE.snapshots, []);
        if (!snapshots.length) {
            container.innerHTML = '<small style="color:#7f8da8;font-size:9px;">Belum ada versi lokal.</small>';
            return;
        }
        container.innerHTML = snapshots.map((snapshot) => `<div class="phase1-snapshot-row"><div style="min-width:0;"><strong>${escapeHtml(snapshot.name)}</strong><small>${new Date(snapshot.created_at).toLocaleString('id-ID')} · ${snapshot.item_count || 0} produk</small></div><div class="phase1-mini-actions"><button type="button" data-phase1-snapshot-restore="${escapeHtml(snapshot.id)}">Pulihkan</button><button type="button" data-phase1-snapshot-delete="${escapeHtml(snapshot.id)}">Hapus</button></div></div>`).join('');
    }

    function phase1SaveSnapshot() {
        const name = window.prompt('Nama versi snapshot:', `Versi ${new Date().toLocaleString('id-ID')}`);
        if (!name) return;
        const data = phase1CaptureDraft();
        const snapshots = phase1StorageRead(PHASE1_STORAGE.snapshots, []);
        const item = { id: `snapshot-${Date.now()}`, name: String(name).trim().slice(0, 70), item_count: selectedProductRows().length, created_at: new Date().toISOString(), data };
        phase1StorageWrite(PHASE1_STORAGE.snapshots, [item, ...snapshots].slice(0, 20));
        phase1RenderSnapshots();
        phase1SetStatus('phase1-draft-status', `Snapshot “${item.name}” tersimpan.`, 'ok');
    }

    function phase1RestoreSnapshot(id) {
        const snapshot = phase1StorageRead(PHASE1_STORAGE.snapshots, []).find((item) => item.id === id);
        if (!snapshot?.data) return;
        fillForm({ ...snapshot.data, id: '', status: 'draft' });
        phase1SetStatus('phase1-draft-status', `Snapshot “${snapshot.name}” dipulihkan sebagai draft baru.`, 'ok');
    }

    function phase1RestoreDraft() {
        const draft = phase1StorageRead(PHASE1_STORAGE.draft, null);
        if (!draft || (!draft.title && !draft.items_json)) return phase1SetStatus('phase1-draft-status', 'Belum ada draft lokal yang dapat dipulihkan.', 'warn');
        fillForm({ ...draft, id: draft.id || '', status: 'draft' });
        phase1SetStatus('phase1-draft-status', 'Draft lokal berhasil dipulihkan.', 'ok');
    }

    function phase1MaybeRestoreDraft() {
        const draft = phase1StorageRead(PHASE1_STORAGE.draft, null);
        if (!draft || (!draft.title && !draft.items_json)) return;
        const age = Date.now() - Date.parse(draft.phase1_saved_at || 0);
        if (!Number.isFinite(age) || age > 7 * 24 * 60 * 60 * 1000) return;
        phase1RestoreDraft();
    }

    function phase1ApplyPromoRule() {
        const mode = $('phase1-promo-mode')?.value || 'discount';
        const value = Math.max(0, Number($('phase1-promo-value')?.value) || 0);
        const bundleQty = Math.max(2, Number($('phase1-bundle-qty')?.value) || 3);
        const rows = selectedProductRows();
        if (!rows.length) return phase1SetStatus('phase1-promo-status', 'Pilih minimal satu produk terlebih dahulu.', 'warn');
        if (typeof phase2ValidatePromoRequest === 'function' && !phase2ValidatePromoRequest(rows, mode, value)) return;
        const normalTotal = rows.reduce((sum, item) => sum + brochureNormalPrice(item), 0);
        if (mode === 'bundle') {
            const bundleTotal = Math.max(0, normalTotal - value);
            rows.forEach((item) => {
                const normal = brochureNormalPrice(item);
                const share = normalTotal ? normal / normalTotal : 0;
                const promo = Math.max(0, Math.round(bundleTotal * share));
                item.brochure_promo_price = promo;
                item.promo_price = promo;
                item.promo_rule = { type: 'bundle', quantity: bundleQty, discount: value, bundle_total: bundleTotal };
                item.brochure_offer = `Bundle ${bundleQty} item · hemat ${formatCurrency(value)}`;
                item.badge = 'BUNDLE';
            });
        } else {
            rows.forEach((item) => {
                const normal = brochureNormalPrice(item);
                const promo = mode === 'fixed' ? Math.max(0, normal - value) : Math.max(0, Math.round(normal * (1 - Math.min(100, value) / 100)));
                item.brochure_promo_price = promo;
                item.promo_price = promo;
                item.promo_rule = { type: mode === 'fixed' ? 'fixed_discount' : 'percentage', value };
            });
        }
        renderSelectedItems();
        renderPreview();
        const savings = rows.reduce((sum, item) => sum + Math.max(0, brochureNormalPrice(item) - brochurePromoPrice(item)), 0);
        phase1SetStatus('phase1-promo-status', `${rows.length} produk diperbarui · estimasi hemat ${formatCurrency(savings)}.`, 'ok');
    }

    function phase1ApplyAutoLayout() {
        const preset = $('phase1-layout-preset')?.value || 'balanced';
        const presets = { compact: [5, 4], balanced: [4, 3], showcase: [3, 2], hero: [2, 2] };
        const [rows, columns] = presets[preset] || presets.balanced;
        const rowsField = $('promo-pop-grid-rows');
        const columnsField = $('promo-pop-grid-columns');
        if (rowsField) rowsField.value = rows;
        if (columnsField) columnsField.value = columns;
        renderPreview();
        phase1SetStatus('phase1-layout-status', `Preset ${preset} diterapkan · kapasitas ${rows * columns} produk per halaman.`, 'ok');
    }

    function phase1ToggleSmartFit() {
        state.phase1SmartTextFit = !state.phase1SmartTextFit;
        renderPreview();
        phase1SetStatus('phase1-layout-status', state.phase1SmartTextFit ? 'Smart text fit aktif untuk nama produk panjang.' : 'Smart text fit dimatikan.', 'ok');
    }

    function phase1RunPreflight(updateUi) {
        const rows = selectedProductRows();
        const checks = [
            { label: 'Ukuran kertas A4 Portrait', pass: $('promo-pop-paper')?.value === 'A4' && $('promo-pop-orientation')?.value === 'portrait' },
            { label: 'Judul campaign tersedia', pass: Boolean(String($('promo-pop-title')?.value || '').trim()) },
            { label: 'Minimal satu produk dipilih', pass: rows.length > 0 },
            { label: 'Semua produk memiliki nama dan harga valid', pass: rows.length > 0 && rows.every((item) => Boolean(brochureName(item)) && brochureNormalPrice(item) > 0 && brochurePromoPrice(item) >= 0) },
            { label: 'Gambar produk tersedia', pass: rows.length > 0 && rows.every((item) => Boolean(safeHttpUrl(item.image))) },
            { label: 'Kapasitas grid tidak terlampaui', pass: rows.length <= getGridSettings().limit },
            { label: 'Safe margin internal 0,4 cm aktif', pass: Boolean($('promo-pop-preview')?.classList.contains('flyer-preview')) },
            { label: 'Library export PNG/PDF siap', pass: typeof html2canvas === 'function' && Boolean(window.jspdf?.jsPDF) },
            { label: 'QR URL valid atau dikosongkan', pass: !String($('promo-pop-qr')?.value || '').trim() || Boolean(safeHttpUrl($('promo-pop-qr')?.value)) }
        ];
        const failures = checks.filter((item) => !item.pass);
        if (updateUi !== false) {
            const list = $('phase1-preflight-list');
            if (list) list.innerHTML = checks.map((item) => `<li class="${item.pass ? 'pass' : 'fail'}">${escapeHtml(item.label)}</li>`).join('');
            phase1SetStatus('phase1-preflight-summary', failures.length ? `${failures.length} pemeriksaan perlu perhatian.` : 'Semua pemeriksaan utama lulus.', failures.length ? 'warn' : 'ok');
        }
        return { checks, failures };
    }

    async function phase1GuardedExport(exporter) {
        const result = phase1RunPreflight(true);
        if (result.failures.length && !window.confirm(`${result.failures.length} pemeriksaan preflight belum lulus. Tetap lanjutkan export?`)) return;
        return exporter();
    }

    function phase1BindEvents() {
        phase1RenderTemplates();
        phase1RenderSnapshots();
        $('phase1-save-template')?.addEventListener('click', phase1SaveTemplate);
        $('phase1-save-snapshot')?.addEventListener('click', phase1SaveSnapshot);
        $('phase1-restore-draft')?.addEventListener('click', phase1RestoreDraft);
        $('phase1-apply-promo')?.addEventListener('click', phase1ApplyPromoRule);
        $('phase1-apply-layout')?.addEventListener('click', phase1ApplyAutoLayout);
        $('phase1-smart-fit')?.addEventListener('click', phase1ToggleSmartFit);
        $('phase1-run-preflight')?.addEventListener('click', () => phase1RunPreflight(true));
        $('phase1-template-list')?.addEventListener('click', (event) => {
            const apply = event.target.closest('[data-phase1-template-apply]');
            const remove = event.target.closest('[data-phase1-template-delete]');
            if (apply) phase1ApplyTemplate(apply.dataset.phase1TemplateApply);
            if (remove) phase1DeleteTemplate(remove.dataset.phase1TemplateDelete);
        });
        $('phase1-snapshot-list')?.addEventListener('click', (event) => {
            const restore = event.target.closest('[data-phase1-snapshot-restore]');
            const remove = event.target.closest('[data-phase1-snapshot-delete]');
            if (restore) phase1RestoreSnapshot(restore.dataset.phase1SnapshotRestore);
            if (remove) {
                const snapshots = phase1StorageRead(PHASE1_STORAGE.snapshots, []).filter((item) => item.id !== remove.dataset.phase1SnapshotDelete);
                phase1StorageWrite(PHASE1_STORAGE.snapshots, snapshots);
                phase1RenderSnapshots();
            }
        });
        $('promo-pop-form')?.addEventListener('input', phase1ScheduleAutosave, true);
        $('promo-pop-form')?.addEventListener('change', phase1ScheduleAutosave, true);
    }

    const PHASE2_STORAGE = Object.freeze({ versions: 'sembakopop.phase2.versions', workflow: 'sembakopop.phase2.workflow', audit: 'sembakopop.phase2.audit', assets: 'sembakopop.phase2.assets' });

    function phase2Read(key, fallback) {
        try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
        catch (error) { console.warn('Phase 2 storage read failed:', error); return fallback; }
    }

    function phase2Write(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; }
        catch (error) { console.warn('Phase 2 storage write failed:', error); return false; }
    }

    function phase2SetStatus(id, message, tone) {
        const el = $(id);
        if (!el) return;
        el.textContent = message || '';
        el.classList.remove('ok', 'warn', 'error');
        if (tone) el.classList.add(tone);
    }

    function phase2CampaignKey() { return String(state.editingId || $('promo-pop-slug')?.value || 'local-draft'); }

    function phase2Log(action, detail) {
        const entries = phase2Read(PHASE2_STORAGE.audit, []);
        const actor = typeof GASActions?.getAdminRole === 'function' ? GASActions.getAdminRole() : 'admin';
        const next = [{ id: `audit-${Date.now()}`, action, detail: String(detail || ''), actor: actor || 'admin', created_at: new Date().toISOString(), campaign: phase2CampaignKey() }, ...entries].slice(0, 40);
        phase2Write(PHASE2_STORAGE.audit, next);
        phase2RenderAudit();
    }

    function phase2RenderAudit() {
        const container = $('phase2-audit-list');
        if (!container) return;
        const entries = phase2Read(PHASE2_STORAGE.audit, []);
        if (!entries.length) {
            container.innerHTML = '<small style="color:#a9947d;font-size:9px;">Belum ada event management.</small>';
            return;
        }
        container.innerHTML = entries.slice(0, 6).map((entry) => `<div class="phase2-list-row"><div style="min-width:0;"><strong>${escapeHtml(entry.action)}</strong><small>${escapeHtml(entry.detail)} · ${new Date(entry.created_at).toLocaleString('id-ID')}</small></div></div>`).join('');
    }

    function phase2SnapshotData() {
        return { campaign_key: phase2CampaignKey(), data: phase1CaptureDraft(), workflow: phase2Read(PHASE2_STORAGE.workflow, {}).status || 'draft' };
    }

    function phase2VersionItemCount(version) {
        try { return JSON.parse(version?.data?.items_json || '[]').length; } catch (error) { return 0; }
    }

    function phase2RenderVersions() {
        const container = $('phase2-version-list');
        if (!container) return;
        const versions = phase2Read(PHASE2_STORAGE.versions, []).filter((item) => item.campaign_key === phase2CampaignKey());
        if (!versions.length) {
            container.innerHTML = '<small style="color:#a9947d;font-size:9px;">Belum ada versi campaign ini.</small>';
            return;
        }
        container.innerHTML = versions.map((version) => `<div class="phase2-list-row"><div style="min-width:0;"><strong>v${version.number} · ${escapeHtml(version.note || 'Tanpa catatan')}</strong><small>${new Date(version.created_at).toLocaleString('id-ID')} · ${phase2VersionItemCount(version)} produk</small></div><div class="phase2-mini-actions"><button type="button" data-phase2-version-restore="${escapeHtml(version.id)}">Pulihkan</button><button type="button" data-phase2-version-compare="${escapeHtml(version.id)}">Bandingkan</button></div></div>`).join('');
    }

    function phase2SaveVersion() {
        const versions = phase2Read(PHASE2_STORAGE.versions, []);
        const campaignKey = phase2CampaignKey();
        const current = versions.filter((item) => item.campaign_key === campaignKey);
        const note = String($('phase2-version-note')?.value || '').trim() || 'Manual snapshot';
        const item = { id: `version-${Date.now()}`, campaign_key: campaignKey, number: current.length + 1, note: note.slice(0, 80), created_at: new Date().toISOString(), ...phase2SnapshotData() };
        phase2Write(PHASE2_STORAGE.versions, [item, ...versions].slice(0, 80));
        phase2RenderVersions();
        phase2Log('version_created', `v${item.number} · ${note}`);
        phase2SetStatus('phase2-version-status', `Versi v${item.number} tersimpan sebagai snapshot lokal.`, 'ok');
    }

    function phase2RestoreVersion(id) {
        const version = phase2Read(PHASE2_STORAGE.versions, []).find((item) => item.id === id);
        if (!version?.data) return;
        fillForm({ ...version.data, id: '', status: 'draft' });
        phase2Log('version_restored', `v${version.number} dipulihkan sebagai draft baru`);
        phase2SetStatus('phase2-version-status', `Versi v${version.number} dipulihkan sebagai draft baru.`, 'ok');
    }

    function phase2CompareVersion(id) {
        const version = phase2Read(PHASE2_STORAGE.versions, []).find((item) => item.id === id);
        if (!version?.data) return;
        const current = phase1CaptureDraft();
        const fields = ['title', 'subtitle', 'theme', 'layout', 'footer_note', 'grid_config_json', 'items_json'];
        const changed = fields.filter((field) => String(version.data[field] || '') !== String(current[field] || ''));
        phase2SetStatus('phase2-version-status', changed.length ? `Perbedaan dengan v${version.number}: ${changed.join(', ')}.` : `v${version.number} identik dengan kondisi saat ini.`, changed.length ? 'warn' : 'ok');
        phase2Log('version_compared', `v${version.number} · ${changed.length} field berbeda`);
    }

    function phase2ApplyWorkflow() {
        const status = $('phase2-approval-status')?.value || 'in_review';
        const note = String($('phase2-approval-note')?.value || '').trim();
        const previous = phase2Read(PHASE2_STORAGE.workflow, {}).status || 'draft';
        const allowed = { draft: ['in_review'], in_review: ['approved', 'rejected', 'draft'], rejected: ['draft', 'in_review'], approved: ['in_review', 'draft'], published: ['in_review'] };
        if (previous !== status && !allowed[previous]?.includes(status)) return phase2SetStatus('phase2-approval-status-text', `Transisi ${previous} → ${status} tidak diizinkan.`, 'error');
        if (status === 'rejected' && !note) return phase2SetStatus('phase2-approval-status-text', 'Rejection wajib memiliki catatan.', 'warn');
        const actor = typeof GASActions?.getAdminRole === 'function' ? GASActions.getAdminRole() : 'admin';
        phase2Write(PHASE2_STORAGE.workflow, { status, note: note.slice(0, 200), actor: actor || 'admin', updated_at: new Date().toISOString() });
        setFormStatusBadge(status === 'in_review' ? 'draft' : status);
        phase2Log('workflow_changed', `${previous} → ${status}${note ? ` · ${note}` : ''}`);
        phase2SetStatus('phase2-approval-status-text', `Workflow berubah: ${previous} → ${status}.`, 'ok');
    }

    function phase2RenderAssets() {
        const container = $('phase2-asset-list');
        if (!container) return;
        const assets = phase2Read(PHASE2_STORAGE.assets, []);
        if (!assets.length) {
            container.innerHTML = '<small style="color:#a9947d;font-size:9px;">Belum ada asset atau brand kit lokal.</small>';
            return;
        }
        container.innerHTML = assets.slice(0, 8).map((asset) => `<div class="phase2-list-row"><div style="min-width:0;"><strong>${escapeHtml(asset.name || 'Asset banner')}</strong><small>${escapeHtml(asset.url)} · ${escapeHtml(asset.brand?.store_name || '')}</small></div><div class="phase2-mini-actions"><button type="button" data-phase2-asset-use="${escapeHtml(asset.id)}">Pakai</button><button type="button" data-phase2-asset-delete="${escapeHtml(asset.id)}">Hapus</button></div></div>`).join('');
    }

    function phase2SaveAsset() {
        const url = safeHttpUrl($('phase2-asset-url')?.value || '');
        if (!url) return phase2SetStatus('phase2-asset-status', 'Masukkan URL https asset yang valid.', 'warn');
        const assets = phase2Read(PHASE2_STORAGE.assets, []);
        const item = { id: `asset-${Date.now()}`, name: $('promo-pop-store')?.value || 'Banner campaign', url, brand: phase1ConfigFromCurrent(), created_at: new Date().toISOString() };
        phase2Write(PHASE2_STORAGE.assets, [item, ...assets].slice(0, 30));
        phase2RenderAssets();
        phase2Log('asset_saved', url);
        phase2SetStatus('phase2-asset-status', 'Asset dan snapshot brand kit tersimpan lokal.', 'ok');
    }

    function phase2UseAsset(id) {
        const asset = phase2Read(PHASE2_STORAGE.assets, []).find((item) => item.id === id);
        if (!asset) return;
        const field = $('promo-pop-hero');
        if (field) { field.value = asset.url; field.dispatchEvent(new Event('input', { bubbles: true })); }
        phase2Log('asset_used', asset.url);
        phase2SetStatus('phase2-asset-status', `${asset.name || 'Asset'} dipakai pada banner campaign.`, 'ok');
    }

    function phase2ValidatePromoRequest(rows, mode, value) {
        const cost = Number($('phase2-cost-input')?.value);
        const margin = Math.max(0, Number($('phase2-min-margin')?.value) || 0);
        const protection = $('phase2-protection-mode')?.value || 'warning';
        if (!Number.isFinite(cost) || cost <= 0 || protection !== 'strict') return true;
        const minimum = Math.round(cost * (1 + margin / 100));
        const violations = rows.filter((item) => {
            const normal = brochureNormalPrice(item);
            const proposed = mode === 'fixed' ? Math.max(0, normal - value) : mode === 'discount' ? Math.max(0, Math.round(normal * (1 - Math.min(100, value) / 100))) : brochurePromoPrice(item);
            return proposed < minimum;
        });
        if (!violations.length) return true;
        phase2SetStatus('phase2-margin-status', `Strict protection memblokir ${violations.length} produk di bawah minimum ${formatCurrency(minimum)}.`, 'error');
        phase2Log('promo_blocked', `${violations.length} produk · minimum ${minimum}`);
        return false;
    }

    function phase2RunMargin() {
        const rows = selectedProductRows();
        const cost = Number($('phase2-cost-input')?.value);
        const margin = Math.max(0, Number($('phase2-min-margin')?.value) || 0);
        if (!rows.length) return phase2SetStatus('phase2-margin-status', 'Pilih produk untuk pemeriksaan margin.', 'warn');
        if (!Number.isFinite(cost) || cost <= 0) return phase2SetStatus('phase2-margin-status', 'Cost belum tersedia; margin tidak dihitung dan tidak diestimasi.', 'warn');
        const minimum = Math.round(cost * (1 + margin / 100));
        const violations = rows.filter((item) => brochurePromoPrice(item) < minimum);
        const average = rows.reduce((sum, item) => sum + brochurePromoPrice(item), 0) / rows.length;
        const actualMargin = ((average - cost) / cost) * 100;
        phase2SetStatus('phase2-margin-status', violations.length ? `${violations.length} produk di bawah minimum ${formatCurrency(minimum)} · rata-rata margin ${actualMargin.toFixed(1)}%.` : `Semua produk lulus minimum ${formatCurrency(minimum)} · rata-rata margin ${actualMargin.toFixed(1)}%.`, violations.length ? 'warn' : 'ok');
        phase2Log('margin_checked', `${rows.length} produk · ${violations.length} violation`);
    }

    function phase2BindEvents() {
        phase2RenderVersions();
        phase2RenderAudit();
        phase2RenderAssets();
        const role = typeof GASActions?.getAdminRole === 'function' ? GASActions.getAdminRole() : 'admin';
        const roleEl = $('phase2-active-role');
        if (roleEl) roleEl.textContent = role || 'admin';
        $('phase2-save-version')?.addEventListener('click', phase2SaveVersion);
        $('phase2-apply-approval')?.addEventListener('click', phase2ApplyWorkflow);
        $('phase2-save-asset')?.addEventListener('click', phase2SaveAsset);
        $('phase2-use-asset')?.addEventListener('click', () => {
            const url = safeHttpUrl($('phase2-asset-url')?.value || '');
            if (!url) return phase2SetStatus('phase2-asset-status', 'Masukkan URL asset terlebih dahulu.', 'warn');
            const field = $('promo-pop-hero');
            if (field) { field.value = url; field.dispatchEvent(new Event('input', { bubbles: true })); }
            phase2Log('asset_used', url);
            phase2SetStatus('phase2-asset-status', 'URL asset diterapkan ke banner campaign.', 'ok');
        });
        $('phase2-run-margin')?.addEventListener('click', phase2RunMargin);
        $('phase2-version-list')?.addEventListener('click', (event) => {
            const restore = event.target.closest('[data-phase2-version-restore]');
            const compare = event.target.closest('[data-phase2-version-compare]');
            if (restore) phase2RestoreVersion(restore.dataset.phase2VersionRestore);
            if (compare) phase2CompareVersion(compare.dataset.phase2VersionCompare);
        });
        $('phase2-asset-list')?.addEventListener('click', (event) => {
            const use = event.target.closest('[data-phase2-asset-use]');
            const remove = event.target.closest('[data-phase2-asset-delete]');
            if (use) phase2UseAsset(use.dataset.phase2AssetUse);
            if (remove) {
                const assets = phase2Read(PHASE2_STORAGE.assets, []).filter((item) => item.id !== remove.dataset.phase2AssetDelete);
                phase2Write(PHASE2_STORAGE.assets, assets);
                phase2RenderAssets();
            }
        });
        $('promo-pop-save-top')?.addEventListener('click', () => phase2Log('save_intent', 'Simpan draft ditekan'));
        $('promo-pop-new')?.addEventListener('click', () => phase2Log('campaign_new', 'Campaign baru dimulai'));
        $('promo-pop-form')?.addEventListener('submit', () => phase2Log('campaign_save', 'Form campaign dikirim'), true);
        const workflow = phase2Read(PHASE2_STORAGE.workflow, null);
        if (workflow?.status) phase2SetStatus('phase2-approval-status-text', `Status lokal saat ini: ${workflow.status}.`, 'ok');
    }

    function bindEvents() {
        phase2BindEvents();
        phase1BindEvents();
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
        document.querySelectorAll('[data-ppob-wallet]').forEach((input) => input.addEventListener('change', renderPreview));
        $('promo-pop-hero-file')?.addEventListener('change', handleHeroUpload);
        $('promo-pop-zoom-out')?.addEventListener('click', () => setPreviewZoom(-.1));
        $('promo-pop-zoom-in')?.addEventListener('click', () => setPreviewZoom(.1));
        $('promo-pop-zoom-reset')?.addEventListener('click', resetPreviewZoom);
        $('promo-pop-pdf')?.addEventListener('click', () => phase1GuardedExport(generatePdf));
        $('promo-pop-png')?.addEventListener('click', () => phase1GuardedExport(generatePng));
        $('promo-pop-print')?.addEventListener('click', () => phase1GuardedExport(openPrintPreview));
        $('promo-pop-print-close')?.addEventListener('click', closePrintPreview);
        $('promo-pop-print-cancel')?.addEventListener('click', closePrintPreview);
        $('promo-pop-print-now')?.addEventListener('click', printCurrentPreview);
        $('promo-pop-print-modal')?.addEventListener('click', (event) => { if (event.target.id === 'promo-pop-print-modal') closePrintPreview(); });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('promo-pop-print-modal')?.hidden) closePrintPreview(); });
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
                state.selectedItems.set(id, { id, name: product.name, image: product.image, unit: product.unit, brand: product.brand, sku: product.sku, stock: product.stock, normal_price: product.price, promo_price: product.price, brochure_name: product.name, brochure_normal_price: product.price, brochure_promo_price: product.price, brochure_offer: product.unit ? `Harga spesial · ${product.unit}` : 'Promo terbatas' });
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
                if (item) { item.promo_price = Number(input.value) || 0; item.brochure_promo_price = item.promo_price; }
            }
            if (badgeInput) {
                const item = state.selectedItems.get(badgeInput.dataset.promoBadge);
                if (item) item.badge = String(badgeInput.value || '').trim();
            }
            if (!input && !badgeInput) return;
            renderSelectedItems();
            renderPreview();
        });
        $('promo-pop-selected-list')?.addEventListener('input', (event) => {
            const input = event.target.closest('[data-brochure-name],[data-brochure-normal],[data-brochure-promo],[data-brochure-offer]');
            if (!input) return;
            const id = brochureInputId(input);
            const item = state.selectedItems.get(id);
            if (!item) return;
            if (input.hasAttribute('data-brochure-name')) item.brochure_name = String(input.value || '').trim();
            if (input.hasAttribute('data-brochure-normal')) item.brochure_normal_price = Number(input.value) || 0;
            if (input.hasAttribute('data-brochure-promo')) { item.brochure_promo_price = Number(input.value) || 0; item.promo_price = item.brochure_promo_price; }
            if (input.hasAttribute('data-brochure-offer')) item.brochure_offer = String(input.value || '').trim();
            renderPreview();
        });
        $('promo-pop-selected-list')?.addEventListener('change', (event) => {
            const input = event.target.closest('[data-brochure-name],[data-brochure-normal],[data-brochure-promo],[data-brochure-offer]');
            if (!input) return;
            renderSelectedItems();
            renderPreview();
        });
        let safeAreaResizeTimer = 0;
        window.addEventListener('resize', () => {
            window.clearTimeout(safeAreaResizeTimer);
            safeAreaResizeTimer = window.setTimeout(fitPreviewToSafeArea, 80);
        });
        $('promo-pop-selected-list')?.addEventListener('click', (event) => {
            const featureButton = event.target.closest('[data-feature-product]');
            const copyButton = event.target.closest('[data-copy-layout]');
            const pasteButton = event.target.closest('[data-paste-layout]');
            const removeButton = event.target.closest('[data-remove-product]');
            if (copyButton) {
                state.layoutClipboard = copyButton.dataset.copyLayout || '';
                setStatus('Pengaturan layout produk disalin. Klik “Tempel layout” pada produk tujuan.', 'info');
                renderSelectedItems();
                return;
            }
            if (pasteButton) {
                const sourceId = state.layoutClipboard;
                const targetId = pasteButton.dataset.pasteLayout || '';
                if (!sourceId || !targetId || sourceId === targetId || !state.selectedItems.has(sourceId) || !state.selectedItems.has(targetId)) return;
                state.tilePositions[targetId] = cloneTilePositions(sourceId);
                setStatus('Pengaturan layout berhasil ditempel ke produk tujuan.', 'success');
                renderSelectedItems();
                renderPreview();
                return;
            }
            if (featureButton) {
                const id = featureButton.dataset.featureProduct;
                if (state.featuredIds.has(id)) state.featuredIds.delete(id);
                else if (state.featuredIds.size < 3) state.featuredIds.add(id);
                else return setStatus('Maksimal 3 produk unggulan.', 'error');
                renderSelectedItems(); renderPreview(); return;
            }
            if (!removeButton) return;
            const removedId = removeButton.dataset.removeProduct;
            state.selectedItems.delete(removedId);
            state.featuredIds.delete(removedId);
            if (state.layoutClipboard === removedId) state.layoutClipboard = '';
            renderProductPicker(); renderSelectedItems(); renderPreview();
        });
        let draggedProductId = '';
        $('promo-pop-selected-list')?.addEventListener('dragstart', (event) => {
            const row = event.target.closest('[data-selected-id]');
            draggedProductId = row?.dataset.selectedId || '';
            row?.classList.add('is-dragging');
            if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', draggedProductId); }
        });
        $('promo-pop-selected-list')?.addEventListener('dragend', () => {
            draggedProductId = '';
            $('promo-pop-selected-list')?.querySelectorAll('.is-dragging,.is-drop-target').forEach((row) => row.classList.remove('is-dragging', 'is-drop-target'));
        });
        $('promo-pop-selected-list')?.addEventListener('dragover', (event) => {
            const row = event.target.closest('[data-selected-id]');
            if (!row || row.dataset.selectedId === draggedProductId) return;
            event.preventDefault();
            $('promo-pop-selected-list')?.querySelectorAll('.is-drop-target').forEach((item) => item.classList.remove('is-drop-target'));
            row.classList.add('is-drop-target');
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
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
            phase1MaybeRestoreDraft();
            setStatus('Generator Catalog Promo POP Phase 1 siap digunakan.', 'success');
        } catch (error) {
            setStatus(error.message || 'Gagal memuat data generator.', 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
