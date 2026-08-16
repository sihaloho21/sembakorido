(function () {
    'use strict';

    const SHEET = 'promo_flyers';
    const state = {
        products: [],
        campaigns: [],
        selectedItems: new Map(),
        editingId: '',
        busy: false
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

    function productImage(product) {
        return String(product.gambar || product.image || product.image_url || product.foto || '').trim();
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
            category: categoryName(row)
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

    function clampDiscount(value) {
        return Math.min(99, Math.max(0, Math.round(Number(value) || 0)));
    }

    function promoPriceFromDiscount(normalPrice, discountPct) {
        const normal = Math.max(0, Number(normalPrice) || 0);
        const pct = clampDiscount(discountPct);
        return Math.max(0, Math.round(normal * (1 - pct / 100)));
    }

    async function fetchProducts() {
        const url = new URL(CONFIG.getMainApiUrl());
        url.searchParams.set('sheet', 'products');
        url.searchParams.set('_t', Date.now());
        const response = await fetch(url.toString(), { cache: 'no-store' });
        if (!response.ok) throw new Error('Produk tidak dapat dimuat');
        const payload = await response.json();
        state.products = readArrayResponse(payload).map(normalizeProduct).filter(Boolean);
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
        if (payload && payload.error) throw new Error(payload.message || payload.error);
        state.campaigns = readArrayResponse(payload);
        renderCampaigns();
    }

    function selectedProductRows() {
        return Array.from(state.selectedItems.values());
    }

    function renderProductPicker() {
        const container = $('promo-pop-product-list');
        if (!container) return;
        const query = String($('promo-pop-product-search')?.value || '').trim().toLowerCase();
        const rows = state.products.filter((product) => {
            if (!query) return true;
            return product.name.toLowerCase().includes(query) || product.id.toLowerCase().includes(query);
        }).slice(0, 80);
        if (!rows.length) {
            container.innerHTML = '<div class="p-5 text-sm text-slate-500">Produk tidak ditemukan.</div>';
            return;
        }
        container.innerHTML = rows.map((product) => {
            const selected = state.selectedItems.get(product.id);
            const discount = selected ? clampDiscount(((product.price - selected.promo_price) / Math.max(product.price, 1)) * 100) : 0;
            return `<div class="promo-product-row">
                <div class="promo-product-thumb">${product.image ? `<img src="${escapeHtml(product.image)}" alt="" loading="lazy">` : '<span>POP</span>'}</div>
                <div class="min-w-0 flex-1">
                    <div class="font-semibold text-slate-800 truncate">${escapeHtml(product.name)}</div>
                    <div class="text-xs text-slate-500">${escapeHtml(product.category)} · ${formatCurrency(product.price)}</div>
                </div>
                <div class="flex items-center gap-2 flex-wrap justify-end">
                    ${selected ? `<span class="text-[10px] font-black text-orange-600">-${discount}%</span><input class="promo-badge-input" data-promo-badge="${escapeHtml(product.id)}" type="text" value="${escapeHtml(selected.badge || '')}" placeholder="Badge" aria-label="Badge ${escapeHtml(product.name)}">` : ''}
                    <input class="promo-price-input" data-promo-price="${escapeHtml(product.id)}" type="number" min="0" step="500" value="${escapeHtml(selected ? selected.promo_price : product.price)}" aria-label="Harga promo ${escapeHtml(product.name)}">
                    <button type="button" class="promo-select-button ${selected ? 'is-selected' : ''}" data-select-product="${escapeHtml(product.id)}">${selected ? 'Dipilih' : 'Pilih'}</button>
                </div>
            </div>`;
        }).join('');
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
        if (count) count.textContent = `${rows.length} produk dipilih`;
        if (!container) return;
        if (!rows.length) {
            container.innerHTML = '<div class="p-4 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">Belum ada produk. Pilih produk dari daftar di sebelah kiri.</div>';
            return;
        }
        container.innerHTML = rows.map((item, index) => `<div class="selected-product-row">
            <span class="selected-number">${index + 1}</span>
            <div class="min-w-0 flex-1"><div class="font-semibold truncate">${escapeHtml(item.name)}</div><div class="text-xs text-slate-500">Harga normal ${formatCurrency(item.normal_price)}${item.badge ? ` · ${escapeHtml(item.badge)}` : ''}</div></div>
            <div class="text-right"><div class="font-bold text-orange-600">${formatCurrency(item.promo_price)}</div><button type="button" class="text-xs text-red-600 hover:underline" data-remove-product="${escapeHtml(item.id)}">Hapus</button></div>
        </div>`).join('');
    }

    function renderPreview() {
        const title = $('promo-pop-title')?.value || 'Promo Spesial';
        const subtitle = $('promo-pop-subtitle')?.value || 'Harga terbaik untuk kebutuhan harian';
        const theme = $('promo-pop-theme')?.value || 'retail-impact';
        const layout = $('promo-pop-layout')?.value || 'auto';
        const store = $('promo-pop-store')?.value || 'Paket Sembako';
        const badge = $('promo-pop-badge')?.value || 'DISKON SPESIAL';
        const hero = $('promo-pop-hero')?.value || '';
        const period = $('promo-pop-period')?.value || '';
        const qrUrl = $('promo-pop-qr')?.value || '';
        const preview = $('promo-pop-preview');
        if (!preview) return;
        preview.className = `flyer-preview flyer-theme-${escapeHtml(themeClass(theme))} flyer-layout-${escapeHtml(layoutClass(layout))}`;
        preview.innerHTML = `<div class="flyer-preview-hero" ${hero ? `style="background-image:url('${escapeHtml(hero)}')"` : ''}>
            <div class="flyer-overlay"></div><div class="relative z-10"><span class="flyer-kicker">🔥 ${escapeHtml(store).toUpperCase()}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p>${period ? `<span class="flyer-period">${escapeHtml(period)}</span>` : ''}</div>
        </div><div class="flyer-preview-meta"><strong>${escapeHtml(badge)}</strong><span>${selectedProductRows().length} produk promo</span></div><div class="flyer-preview-items">${selectedProductRows().slice(0, 10).map((item) => `<article class="flyer-item"><div class="flyer-item-image">${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">` : 'POP'}${item.badge ? `<span class="flyer-item-badge">${escapeHtml(item.badge)}</span>` : ''}</div><div class="font-semibold text-sm line-clamp-2">${escapeHtml(item.name)}</div><div class="text-xs text-slate-400 line-through">${formatCurrency(item.normal_price)}</div><div class="font-black text-orange-600">${formatCurrency(item.promo_price)}</div>${item.unit ? `<div class="text-[10px] text-slate-400">${escapeHtml(item.unit)}</div>` : ''}</article>`).join('') || '<div class="col-span-full text-sm text-slate-500 text-center py-8">Preview produk akan tampil di sini.</div>'}</div>${qrUrl ? `<div class="flyer-preview-footer"><span>Scan katalog promo</span><a href="${escapeHtml(qrUrl)}" target="_blank" rel="noopener">Buka QR / katalog</a></div>` : ''}`;
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
            store_name: String($('promo-pop-store')?.value || '').trim(),
            badge_text: String($('promo-pop-badge')?.value || '').trim(),
            hero_image: String($('promo-pop-hero')?.value || '').trim(),
            items_json: JSON.stringify(rows.map((item) => ({
                id: item.id,
                name: item.name,
                image: item.image,
                normal_price: Number(item.normal_price) || 0,
                promo_price: Number(item.promo_price) || 0,
                unit: item.unit || '',
                badge: item.badge || ''
            }))),
            start_at: String($('promo-pop-start')?.value || '').trim(),
            end_at: String($('promo-pop-end')?.value || '').trim(),
            sort_order: Number($('promo-pop-sort')?.value || 0),
            period_text: String($('promo-pop-period')?.value || '').trim(),
            footer_note: String($('promo-pop-footer')?.value || '').trim(),
            show_watermark: $('promo-pop-watermark')?.checked ? 'true' : 'false',
            watermark_text: String($('promo-pop-watermark-text')?.value || '').trim(),
            show_qr_code: $('promo-pop-qr')?.value ? 'true' : 'false',
            qr_url: String($('promo-pop-qr')?.value || '').trim(),
            banner_config_json: JSON.stringify({ top: String($('promo-pop-top-banner')?.value || '').trim(), bottom: String($('promo-pop-bottom-banner')?.value || '').trim() }),
            grid_config_json: JSON.stringify({ layout: String($('promo-pop-layout')?.value || 'auto').trim(), columns: Number($('promo-pop-columns')?.value || 3) }),
            created_by: GASActions.getAdminRole() || 'admin',
            updated_at: new Date().toISOString()
        };
    }

    function fillForm(campaign) {
        state.editingId = String(campaign.id || '');
        $('promo-pop-title').value = campaign.title || '';
        $('promo-pop-slug').value = campaign.slug || '';
        $('promo-pop-subtitle').value = campaign.subtitle || '';
        $('promo-pop-description').value = campaign.description || '';
        $('promo-pop-theme').value = campaign.theme || 'retail-impact';
        $('promo-pop-layout').value = campaign.layout || 'auto';
        $('promo-pop-store').value = campaign.store_name || '';
        $('promo-pop-badge').value = campaign.badge_text || '';
        $('promo-pop-hero').value = campaign.hero_image || '';
        $('promo-pop-qr').value = campaign.qr_url || '';
        $('promo-pop-period').value = campaign.period_text || '';
        $('promo-pop-footer').value = campaign.footer_note || '';
        $('promo-pop-watermark').checked = String(campaign.show_watermark || '').toLowerCase() === 'true';
        $('promo-pop-watermark-text').value = campaign.watermark_text || '';
        $('promo-pop-start').value = campaign.start_at ? String(campaign.start_at).slice(0, 16) : '';
        $('promo-pop-end').value = campaign.end_at ? String(campaign.end_at).slice(0, 16) : '';
        $('promo-pop-sort').value = campaign.sort_order || 0;
        state.selectedItems.clear();
        let items = campaign.items;
        if (!Array.isArray(items)) {
            try { items = JSON.parse(campaign.items_json || '[]'); } catch (error) { items = []; }
        }
        (items || []).forEach((item) => state.selectedItems.set(String(item.id), {
            ...item,
            normal_price: Number(item.normal_price || item.price || 0),
            promo_price: Number(item.promo_price || item.price || 0),
            badge: String(item.badge || '').trim()
        }));
        renderProductPicker();
        renderSelectedItems();
        renderPreview();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function resetForm() {
        state.editingId = '';
        $('promo-pop-form')?.reset();
        state.selectedItems.clear();
        renderProductPicker();
        renderSelectedItems();
        renderPreview();
    }

    function renderCampaigns() {
        const container = $('promo-pop-campaign-list');
        if (!container) return;
        if (!state.campaigns.length) {
            container.innerHTML = '<div class="p-6 text-sm text-slate-500">Belum ada campaign POP.</div>';
            return;
        }
        container.innerHTML = state.campaigns.map((campaign) => {
            const status = String(campaign.status || 'draft').toLowerCase();
            const items = Array.isArray(campaign.items) ? campaign.items : (() => { try { return JSON.parse(campaign.items_json || '[]'); } catch (error) { return []; } })();
            return `<article class="campaign-row">
                <div class="campaign-color theme-${escapeHtml(campaign.theme || 'orange')}"></div>
                <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><h3 class="font-bold text-slate-800">${escapeHtml(campaign.title || 'Tanpa judul')}</h3><span class="status-badge status-${escapeHtml(status)}">${escapeHtml(status)}</span></div><p class="text-xs text-slate-500 mt-1">${items.length} produk · ${escapeHtml(campaign.start_at || 'Tanpa mulai')} — ${escapeHtml(campaign.end_at || 'Tanpa akhir')}</p></div>
                <div class="flex flex-wrap gap-2"><button type="button" class="small-action" data-edit-campaign="${escapeHtml(campaign.id)}">Edit</button><button type="button" class="small-action ${status === 'published' ? 'warning' : 'success'}" data-toggle-campaign="${escapeHtml(campaign.id)}" data-campaign-status="${escapeHtml(status)}">${status === 'published' ? 'Unpublish' : 'Publish'}</button><button type="button" class="small-action danger" data-delete-campaign="${escapeHtml(campaign.id)}">Hapus</button></div>
            </article>`;
        }).join('');
    }

    async function saveCampaign(event) {
        event.preventDefault();
        if (state.busy) return;
        const data = collectFormData();
        if (!data.title) return setStatus('Judul campaign wajib diisi.', 'error');
        if (!selectedProductRows().length) return setStatus('Pilih minimal satu produk.', 'error');
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
            setStatus(error.message || 'Gagal menyimpan campaign.', 'error');
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
            setStatus(error.message || 'Gagal mengubah status campaign.', 'error');
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
            setStatus(error.message || 'Gagal menghapus campaign.', 'error');
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
            setStatus(error.message || 'Gagal menyiapkan schema backend.', 'error');
        }
    }

    function bindEvents() {
        $('promo-pop-form')?.addEventListener('submit', saveCampaign);
        $('promo-pop-product-search')?.addEventListener('input', renderProductPicker);
        $('promo-pop-new')?.addEventListener('click', resetForm);
        $('promo-pop-prepare-backend')?.addEventListener('click', prepareBackend);
        ['promo-pop-title', 'promo-pop-subtitle', 'promo-pop-theme', 'promo-pop-layout', 'promo-pop-store', 'promo-pop-badge', 'promo-pop-hero', 'promo-pop-period', 'promo-pop-footer', 'promo-pop-qr', 'promo-pop-watermark-text'].forEach((id) => $(id)?.addEventListener('input', renderPreview));
        $('promo-pop-watermark')?.addEventListener('change', renderPreview);
        $('promo-pop-bulk-apply')?.addEventListener('click', () => applyBulkPricing($('promo-pop-bulk-type')?.value || 'percentage', $('promo-pop-bulk-value')?.value));
        $('promo-pop-bulk-reset')?.addEventListener('click', resetBulkPricing);
        $('promo-pop-print')?.addEventListener('click', () => window.print());
        $('promo-pop-share')?.addEventListener('click', shareWhatsApp);
        document.querySelectorAll('[data-bulk-preset]').forEach((button) => button.addEventListener('click', () => {
            $('promo-pop-bulk-type').value = 'percentage';
            $('promo-pop-bulk-value').value = button.dataset.bulkPreset;
            applyBulkPricing('percentage', button.dataset.bulkPreset);
        }));
        $('promo-pop-title')?.addEventListener('input', () => {
            if (!state.editingId) $('promo-pop-slug').value = slugify($('promo-pop-title').value);
        });
        $('promo-pop-product-list')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-select-product]');
            if (!button) return;
            const id = button.dataset.selectProduct;
            const product = state.products.find((item) => item.id === id);
            if (!product) return;
            if (state.selectedItems.has(id)) state.selectedItems.delete(id);
            else state.selectedItems.set(id, { id, name: product.name, image: product.image, unit: product.unit, normal_price: product.price, promo_price: product.price });
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
            const button = event.target.closest('[data-remove-product]');
            if (!button) return;
            state.selectedItems.delete(button.dataset.removeProduct);
            renderProductPicker();
            renderSelectedItems();
            renderPreview();
        });
        $('promo-pop-campaign-list')?.addEventListener('click', (event) => {
            const edit = event.target.closest('[data-edit-campaign]');
            const toggle = event.target.closest('[data-toggle-campaign]');
            const remove = event.target.closest('[data-delete-campaign]');
            if (edit) fillForm(state.campaigns.find((item) => String(item.id) === edit.dataset.editCampaign));
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
