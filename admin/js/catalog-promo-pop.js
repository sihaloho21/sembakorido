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
        visual: {
            preset: 'fresh-market',
            badgeStyle: 'sticker',
            heroLayout: 'split',
            smartFit: true,
            groupCategories: false,
            showFeatured: true,
            ctaStyle: 'solid',
            outputFormat: 'a4'
        },
        governance: {
            actor: '',
            role: '',
            permissions: {},
            policies: [],
            campaignPolicyId: '',
            policy: { id: 'implicit-default', minimum_price: 0, minimum_margin_percent: 0, mode: 'warning', status: 'active' },
            roleEnforce: true,
            requireApproval: false,
            loaded: false
        }
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

    function hasPromoPermission(permission) {
        if (!state.governance.loaded || !state.governance.roleEnforce) return true;
        return state.governance.permissions && state.governance.permissions[permission] === true;
    }

    function requirePromoPermission(permission, message) {
        if (hasPromoPermission(permission)) return true;
        setStatus(message || `Akses ditolak. Permission ${permission} diperlukan.`, 'error');
        return false;
    }

    function applyGovernanceUiState() {
        if (!state.governance.loaded) return;
        const canWrite = hasPromoPermission('promo.write');
        const canPublish = hasPromoPermission('promo.publish');
        document.body.dataset.promoRole = state.governance.role || 'unknown';
        document.body.dataset.promoRoleEnforce = state.governance.roleEnforce ? 'true' : 'false';
        document.querySelectorAll('#promo-pop-form input, #promo-pop-form select, #promo-pop-form textarea, #promo-pop-form button[type="submit"], #promo-pop-save-top, #promo-pop-new').forEach((element) => {
            element.disabled = state.governance.roleEnforce && !canWrite;
        });
        document.querySelectorAll('[data-promo-price],[data-promo-badge],[data-select-product],[data-brochure-name],[data-brochure-normal],[data-brochure-promo],[data-brochure-offer],[data-feature-product],[data-copy-layout],[data-paste-layout],[data-remove-product]').forEach((element) => {
            element.disabled = state.governance.roleEnforce && !canWrite;
        });
        document.querySelectorAll('[data-toggle-campaign]').forEach((element) => {
            element.disabled = state.governance.roleEnforce && !canPublish;
        });
        document.querySelectorAll('[data-delete-campaign],[data-edit-campaign]').forEach((element) => {
            element.disabled = state.governance.roleEnforce && !canWrite;
        });
    }

    function governanceErrorMessage(error, fallback) {
        const code = String(error?.code || error?.payload?.error || error?.message || '').trim();
        const payload = error?.payload || {};
        if (code === 'PRICE_BELOW_MINIMUM') {
            const violations = Array.isArray(payload.violations) ? payload.violations : [];
            const first = violations[0];
            return `${payload.message || 'Harga promo berada di bawah minimum price policy.'}${first?.product_name ? ` Produk: ${first.product_name}.` : ''}${first?.minimum_allowed ? ` Minimal ${formatCurrency(first.minimum_allowed)}.` : ''}`;
        }
        if (code === 'PROMO_APPROVAL_REQUIRED') return payload.message || 'Campaign harus disetujui terlebih dahulu sebelum dipublikasikan.';
        if (/unauthorized|permission denied|forbidden/i.test(code)) return 'Akses ditolak oleh kebijakan role backend.';
        return apiErrorMessage({ error: code, message: payload.message || error?.message }, fallback);
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
            cost_price: numericPrice(row.cost_price ?? row.hpp ?? row.cost ?? row.buy_price ?? row.modal),
            minimum_price: numericPrice(row.minimum_price ?? row.min_price),
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

    function numericPrice(value) {
        const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function activeMinimumPricePolicy(item) {
        const policies = Array.isArray(state.governance.policies) ? state.governance.policies.filter((policy) => String(policy.status || 'active').toLowerCase() !== 'disabled') : [];
        const campaignPolicyId = String($('promo-pop-minimum-price-policy')?.value || state.governance.campaignPolicyId || '').trim();
        const itemId = String(item?.product_id || item?.id || item?.sku || '').trim();
        const categoryId = String(item?.category_id || item?.category || '').trim();
        return (campaignPolicyId && policies.find((policy) => String(policy.id || '') === campaignPolicyId))
            || policies.find((policy) => String(policy.scope || '').toLowerCase() === 'product' && String(policy.scope_key || '') === itemId)
            || policies.find((policy) => String(policy.scope || '').toLowerCase() === 'category' && String(policy.scope_key || '') === categoryId)
            || policies.find((policy) => String(policy.scope || '').toLowerCase() === 'global' || !String(policy.scope || '').trim())
            || state.governance.policy
            || { id: 'implicit-default', minimum_price: 0, minimum_margin_percent: 0, mode: 'warning', status: 'active' };
    }

    function minimumPriceForItem(item) {
        const policy = activeMinimumPricePolicy(item);
        const explicitFloor = Math.max(numericPrice(item?.minimum_price ?? item?.min_price), numericPrice(policy.minimum_price));
        const cost = numericPrice(item?.cost_price ?? item?.hpp ?? item?.cost ?? item?.buy_price ?? item?.modal);
        const marginPct = Math.max(0, numericPrice(policy.minimum_margin_percent));
        const marginFloor = cost > 0 ? cost * (1 + marginPct / 100) : 0;
        return { minimum: Math.max(explicitFloor, marginFloor), policy, cost, marginPercent: marginPct };
    }

    function priceViolationForItem(item, promoValue) {
        const pricing = minimumPriceForItem(item);
        const promo = numericPrice(promoValue);
        if (promo <= 0 || pricing.minimum <= 0 || promo >= pricing.minimum) return null;
        return {
            id: String(item?.id || ''),
            name: brochureName(item),
            promo,
            minimum: Math.ceil(pricing.minimum),
            mode: String(pricing.policy.mode || 'warning').toLowerCase(),
            policyId: String(pricing.policy.id || '')
        };
    }

    function validateMinimumPrices(items = selectedProductRows(), options = {}) {
        const violations = [];
        const warnings = [];
        (items || []).forEach((item) => {
            const violation = priceViolationForItem(item, brochurePromoPrice(item));
            if (!violation) return;
            if (violation.mode === 'strict') violations.push(violation);
            else warnings.push(violation);
        });
        if (violations.length && options.showStatus !== false) {
            const first = violations[0];
            setStatus(`${violations.length} produk berada di bawah minimum harga${first?.name ? `: ${first.name}` : ''}. Harga minimal ${formatCurrency(first.minimum)}.`, 'error');
        } else if (warnings.length && options.showWarning) {
            setStatus(`${warnings.length} produk berada di bawah minimum harga (mode warning).`, 'info');
        }
        return { violations, warnings, valid: violations.length === 0 };
    }

    function enforceItemMinimumPrice(item, proposedPromo, input, previousPromo) {
        const violation = priceViolationForItem(item, proposedPromo);
        if (!violation || violation.mode !== 'strict') return true;
        const previous = numericPrice(previousPromo);
        item.brochure_promo_price = previous;
        item.promo_price = previous;
        if (input) input.value = String(previous);
        setStatus(`Harga ${brochureName(item)} tidak boleh di bawah ${formatCurrency(violation.minimum)}.`, 'error');
        return false;
    }

    async function loadGovernanceContext(campaignId = '') {
        if (!window.GASActions?.getPromoGovernanceContext) return null;
        try {
            const response = await GASActions.getPromoGovernanceContext(campaignId);
            const context = response?.context || response?.data || response || {};
            state.governance = {
                ...state.governance,
                actor: String(context.actor?.id || context.actor?.actor || context.actor_id || (typeof context.actor === 'string' ? context.actor : '') || ''),
                role: String(context.actor?.role || context.role || GASActions.getAdminRole?.() || ''),
                permissions: context.permissions || {},
                policies: Array.isArray(context.policies) ? context.policies : [],
                campaignPolicyId: String(context.campaign_policy_id || state.governance.campaignPolicyId || '').trim(),
                policy: context.policy || context.minimum_price_policy || (Array.isArray(context.policies) ? (context.policies.find((policy) => String(policy.scope || '').toLowerCase() === 'global' || !String(policy.scope || '').trim()) || state.governance.policy) : state.governance.policy),
                roleEnforce: context.role_enforce !== false,
                requireApproval: context.require_approval === true || String(context.require_approval || '').toLowerCase() === 'true',
                loaded: true
            };
            applyGovernanceUiState();
            return state.governance;
        } catch (error) {
            console.warn('Governance context belum tersedia:', error);
            state.governance.loaded = false;
            return null;
        }
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

    const VISUAL_PRESETS = Object.freeze({
        'fresh-market': { theme: 'fresh-organic', badgeStyle: 'sticker', heroLayout: 'split', ctaStyle: 'solid' },
        'flash-sale': { theme: 'flash-sale-neon', badgeStyle: 'burst', heroLayout: 'center', ctaStyle: 'ribbon' },
        premium: { theme: 'modern-minimalist', badgeStyle: 'pill', heroLayout: 'minimal', ctaStyle: 'outline' },
        minimal: { theme: 'modern-minimalist', badgeStyle: 'plain', heroLayout: 'left', ctaStyle: 'minimal' },
        colorful: { theme: 'seasonal-festive', badgeStyle: 'ribbon', heroLayout: 'center', ctaStyle: 'solid' }
    });

    function readVisualSettings() {
        return {
            preset: String($('promo-pop-visual-preset')?.value || state.visual.preset || 'fresh-market'),
            badgeStyle: String($('promo-pop-badge-style')?.value || state.visual.badgeStyle || 'sticker'),
            heroLayout: String($('promo-pop-hero-layout')?.value || state.visual.heroLayout || 'split'),
            smartFit: $('promo-pop-smart-fit') ? $('promo-pop-smart-fit').checked : state.visual.smartFit !== false,
            groupCategories: $('promo-pop-group-categories') ? $('promo-pop-group-categories').checked : state.visual.groupCategories === true,
            showFeatured: $('promo-pop-show-featured') ? $('promo-pop-show-featured').checked : state.visual.showFeatured !== false,
            ctaStyle: String($('promo-pop-cta-style')?.value || state.visual.ctaStyle || 'solid'),
            outputFormat: String($('promo-pop-output-format')?.value || state.visual.outputFormat || 'a4')
        };
    }

    function applyVisualPreset(presetId, render = true) {
        const preset = VISUAL_PRESETS[String(presetId || '')] || VISUAL_PRESETS['fresh-market'];
        state.visual = { ...state.visual, preset: String(presetId || 'fresh-market'), ...preset };
        const theme = $('promo-pop-theme');
        const badgeStyle = $('promo-pop-badge-style');
        const heroLayout = $('promo-pop-hero-layout');
        const ctaStyle = $('promo-pop-cta-style');
        if (theme) theme.value = preset.theme;
        if (badgeStyle) badgeStyle.value = preset.badgeStyle;
        if (heroLayout) heroLayout.value = preset.heroLayout;
        if (ctaStyle) ctaStyle.value = preset.ctaStyle;
        if (render) renderPreview();
    }

    function layoutClass(layout) {
        return String(layout || 'auto').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }

    function outputFormatConfig(format) {
        const configs = { a4: { ratio: '210 / 297', label: 'A4 Portrait', width: 210, height: 297 }, square: { ratio: '1 / 1', label: 'Square 1:1', width: 1080, height: 1080 }, story: { ratio: '9 / 16', label: 'Story 9:16', width: 1080, height: 1920 }, landscape: { ratio: '16 / 9', label: 'Landscape 16:9', width: 1600, height: 900 } };
        return configs[String(format || 'a4')] || configs.a4;
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
        let outputField;
        let previousOutput = 'a4';
        try {
            syncBrochureFieldsFromDom();
            outputField = $('promo-pop-output-format');
            previousOutput = outputField?.value || state.visual.outputFormat || 'a4';
            if (outputField) outputField.value = 'a4';
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
            if (outputField) outputField.value = previousOutput;
            renderPreview();
            setStatus('PDF A4 berhasil dibuat dan diunduh.', 'success');
        } catch (error) {
            console.error('generatePdf error:', error);
            if (outputField) { outputField.value = previousOutput; renderPreview(); }
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
            const format = outputFormatConfig(state.visual.outputFormat);
            link.download = `${slug}-${format.label.replace(/[^a-z0-9]+/gi, '-')}.png`;
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
        applyGovernanceUiState();
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
            category: String(raw.category || raw.kategori || source.category || '').trim(),
            cost_price: numericPrice(raw.cost_price ?? raw.hpp ?? raw.cost ?? raw.buy_price ?? raw.modal ?? source.cost_price ?? source.hpp ?? source.cost),
            minimum_price: numericPrice(raw.minimum_price ?? raw.min_price ?? source.minimum_price ?? source.min_price),
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
        const normalizedItems = items.map((item, index) => normalizeCampaignItem(item, index));
        const priceCheck = validateMinimumPrices(normalizedItems, { showStatus: false });
        if (!priceCheck.valid) {
            const error = new Error('PRICE_BELOW_MINIMUM');
            error.code = 'PRICE_BELOW_MINIMUM';
            error.payload = { error: 'PRICE_BELOW_MINIMUM', operation: 'restore', violations: priceCheck.violations, warnings: priceCheck.warnings };
            throw error;
        }
        state.selectedItems = new Map();
        state.featuredIds = new Set();
        normalizedItems.forEach((normalized, index) => {
            const item = items[index] || {};
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
        if (!requirePromoPermission('promo.write', 'Anda tidak memiliki akses untuk mengubah campaign.')) return;
        const selected = selectedProducts();
        const amount = Number(value);
        if (!selected.length) return setBulkResult('Pilih minimal satu produk.', true);
        if (!Number.isFinite(amount) || amount < 0) return setBulkResult('Nilai diskon tidak valid.', true);
        const prefix = String($('promo-pop-bulk-badge')?.value || 'DISKON').trim().toUpperCase();
        const changes = selected.map((item) => {
            const normal = Number(item.normal_price) || 0;
            const discountPct = type === 'fixed'
                ? clampDiscount((amount / Math.max(normal, 1)) * 100)
                : clampDiscount(amount);
            const promo = type === 'fixed' ? Math.max(0, Math.round(normal - amount)) : promoPriceFromDiscount(normal, discountPct);
            return { item, promo, badge: prefix ? `${prefix} ${type === 'fixed' ? formatCurrency(amount) : discountPct + '%'}` : '' };
        });
        const priceCheck = validateMinimumPrices(changes.map(({ item, promo }) => ({ ...item, brochure_promo_price: promo })), { showStatus: false });
        if (!priceCheck.valid) {
            const names = priceCheck.violations.slice(0, 3).map((violation) => violation.name).join(', ');
            return setBulkResult(`Bulk dibatalkan: ${priceCheck.violations.length} produk di bawah minimum${names ? ` (${names})` : ''}.`, true);
        }
        changes.forEach(({ item, promo, badge }) => {
            item.promo_price = promo;
            item.brochure_promo_price = promo;
            item.badge = badge;
        });
        if (priceCheck.warnings.length) setStatus(`${priceCheck.warnings.length} produk berada di bawah minimum harga (mode warning).`, 'info');
        renderProductPicker();
        renderSelectedItems();
        renderPreview();
        setBulkResult(`${selected.length} produk diperbarui.`);
    }

    function resetBulkPricing() {
        if (!requirePromoPermission('promo.write', 'Anda tidak memiliki akses untuk mengubah campaign.')) return;
        const selected = selectedProducts();
        const priceCheck = validateMinimumPrices(selected.map((item) => ({ ...item, brochure_promo_price: Number(item.normal_price) || 0 })), { showStatus: false });
        if (!priceCheck.valid) return setBulkResult(`Reset dibatalkan: ${priceCheck.violations.length} produk berada di bawah minimum harga.`, true);
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
        applyGovernanceUiState();
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
        const visual = readVisualSettings();
        state.visual = visual;
        const output = outputFormatConfig(visual.outputFormat);
        preview.style.setProperty('--flyer-media-height', `${crop.frame}px`);
        preview.style.setProperty('--flyer-image-scale', String(crop.scale));
        preview.style.setProperty('--flyer-grid-rows', String(grid.rows));
        preview.style.setProperty('--flyer-grid-columns', String(grid.columns));
        preview.style.aspectRatio = output.ratio;
        const rows = selectedProductRows();
        const visibleRows = rows.slice(0, grid.limit);
        const qrDataUrl = makeQrDataUrl(qrUrl);
        const renderPositionedItem = (item) => {
            const productId = escapeHtml(String(item.id));
            const isRetail = layout === 'retail-tile';
            const isFeatured = visual.showFeatured && state.featuredIds.has(String(item.id));
            const itemClass = `flyer-item flyer-positioned-item${isRetail ? ' flyer-retail-tile' : ''}${isFeatured ? ' is-featured' : ''}`;
            const elementClass = (field, legacyClass) => `flyer-positioned-element flyer-positioned-${field}${isRetail ? ` ${legacyClass}` : ''}`;
            const draggableAttrs = (field, label) => `data-tile-position="${field}" data-product-id="${productId}" style="${tilePositionStyle(item.id, field)}" tabindex="0" role="button" aria-label="Seret atau scroll ${label} untuk mengubah posisi dan ukuran"`;
            const badgeClass = `flyer-item-badge flyer-badge-${escapeHtml(visual.badgeStyle)}`;
            return `<article class="${itemClass}" data-position-surface="${productId}">
                ${isFeatured ? '<span class="flyer-featured-mark">UNGGULAN</span>' : ''}
                <div class="${elementClass('media', 'flyer-retail-media')}" ${draggableAttrs('image', 'gambar produk')}>${item.image ? `<img src="${escapeHtml(safeHttpUrl(item.image))}" alt="" loading="eager">` : 'POP'}${item.badge ? `<span class="${badgeClass}">${escapeHtml(item.badge)}</span>` : ''}</div>
                <div class="${elementClass('name', 'flyer-retail-name')}" ${draggableAttrs('name', 'nama produk')}>${escapeHtml(brochureName(item))}</div>
                <div class="${elementClass('normal', 'flyer-retail-normal')}" ${draggableAttrs('normal', 'harga coret')}>${formatStrikePrice(brochureNormalPrice(item))}</div>
                <div class="${elementClass('promo', 'flyer-retail-promo')}" ${draggableAttrs('promo', 'harga promo')}>${formatCurrencyMarkup(brochurePromoPrice(item))}</div>
                <div class="${elementClass('offer', 'flyer-retail-offer')}" ${draggableAttrs('offer', 'teks promo')}>${escapeHtml(brochureOffer(item))}</div>
            </article>`;
        };
        let previousCategory = '';
        const productMarkup = visibleRows.map((item) => {
            const category = String(item.category || 'Lainnya').trim() || 'Lainnya';
            const heading = visual.groupCategories && category !== previousCategory ? `<div class="flyer-category-heading">${escapeHtml(category)}</div>` : '';
            previousCategory = category;
            return heading + renderPositionedItem(item);
        }).join('');
        const selectedWallets = getSelectedPpobWallets();
        const walletMarkup = renderPpobWalletMarkup(selectedWallets);
        const serviceMarkup = $('promo-pop-show-service')?.checked ? `<div class="flyer-service"><strong style="color:var(--flyer-accent);">MELAYANI TOP UP DIGITAL & PPOB</strong><br>Pulsa · Paket Data · Token PLN · E-Wallet · Bayar Tagihan${walletMarkup}</div>` : '';
        const paymentMarkup = $('promo-pop-show-payment')?.checked ? '<div class="flyer-payment">Pembayaran: QRIS · GoPay · DANA · OVO · Transfer Bank</div>' : '';
        const disclaimerMarkup = $('promo-pop-show-disclaimer')?.checked && disclaimer ? `<div class="flyer-payment">${escapeHtml(disclaimer)}</div>` : '';
        const watermarkText = String($('promo-pop-watermark-text')?.value || '').trim() || 'PaketSembako.com';
        const watermarkMarkup = $('promo-pop-watermark')?.checked ? `<span class="flyer-watermark">${escapeHtml(watermarkText)}</span>` : '';
        preview.className = `flyer-preview flyer-theme-${escapeHtml(themeClass(theme))} flyer-layout-${escapeHtml(layoutClass(layout))} flyer-hero-layout-${escapeHtml(visual.heroLayout)} flyer-output-${escapeHtml(visual.outputFormat)}`;
        preview.innerHTML = `<div class="flyer-preview-content${visual.smartFit ? ' is-smart-fit' : ''}"><div class="flyer-preview-content-scale"><div class="flyer-preview-hero" ${hero ? `style="background-image:url('${escapeHtml(hero)}')"` : ''}><div class="flyer-overlay"></div><div class="relative z-10"><span class="flyer-kicker">🔥 ${escapeHtml(store).toUpperCase()}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p>${period ? `<span class="flyer-period">${escapeHtml(period)}</span>` : ''}</div></div><div class="flyer-preview-meta"><strong>${escapeHtml(badge)}</strong><span>${visibleRows.length} produk promo</span></div><div class="flyer-preview-items">${productMarkup || '<div style="grid-column:1/-1;color:#94a3b8;font-size:11px;text-align:center;padding:28px 0;">Preview produk akan tampil di sini.</div>'}</div>${serviceMarkup}${paymentMarkup}<div class="flyer-preview-footer flyer-cta-${escapeHtml(visual.ctaStyle)}"><div class="flyer-footer-left"><strong>${escapeHtml(store)}</strong><span>${escapeHtml(address || 'Informasi toko akan tampil di sini')}</span><b class="flyer-cta-copy">${escapeHtml($('promo-pop-footer')?.value || 'Pesan sekarang')}</b></div><div class="flyer-footer-right">${qrDataUrl ? `<img class="flyer-qr" src="${qrDataUrl}" alt="QR Code">` : ''}<span>Scan<br>untuk pesan</span></div></div>${disclaimerMarkup}${watermarkMarkup}</div></div>`;
        bindTilePositionDrag();
        fitPreviewToSafeArea();
        const size = $('promo-pop-preview-size');
        if (size) size.textContent = `${output.label} · ${visual.outputFormat === 'a4' ? 'margin internal 0,4 cm' : 'format digital adaptif'} · ${visibleRows.length} produk`;
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
                cost_price: numericPrice(item.cost_price ?? item.hpp ?? item.cost ?? item.buy_price ?? item.modal),
                minimum_price: numericPrice(item.minimum_price ?? item.min_price),
                category: item.category || '',
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
            ppob_wallets_json: JSON.stringify(getSelectedPpobWallets()),
            show_payment: $('promo-pop-show-payment')?.checked ? 'true' : 'false',
            show_disclaimer: $('promo-pop-show-disclaimer')?.checked ? 'true' : 'false',
            show_watermark: $('promo-pop-watermark')?.checked ? 'true' : 'false',
            watermark_text: String($('promo-pop-watermark-text')?.value || '').trim(),
            show_qr_code: $('promo-pop-qr')?.value ? 'true' : 'false',
            qr_url: String($('promo-pop-qr')?.value || '').trim(),
            minimum_price_policy_id: String($('promo-pop-minimum-price-policy')?.value || state.governance.campaignPolicyId || '').trim(),
            request_id: `pop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            banner_config_json: JSON.stringify({ top: String($('promo-pop-top-banner')?.value || '').trim(), bottom: String($('promo-pop-bottom-banner')?.value || '').trim() }),
            grid_config_json: JSON.stringify({ layout: String($('promo-pop-layout')?.value || 'auto').trim(), rows: getGridSettings().rows, columns: getGridSettings().columns, image_frame_height: getCropSettings().frame, image_scale: getCropSettings().scale, tile_positions: normalizeTilePositions(state.tilePositions) }),
            visual_config_json: JSON.stringify(readVisualSettings()),
            created_by: GASActions.getAdminRole() || 'admin',
            updated_at: new Date().toISOString()
        };
    }

    function fillForm(campaign) {
        if (!campaign) return;
        state.editingId = String(campaign.id || '');
        state.governance.campaignPolicyId = String(campaign.minimum_price_policy_id || '').trim();
        setFormStatusBadge(campaignStatus(campaign));
        $('promo-pop-title').value = campaign.title || '';
        $('promo-pop-slug').value = campaign.slug || '';
        $('promo-pop-subtitle').value = campaign.subtitle || '';
        $('promo-pop-description').value = campaign.description || '';
        $('promo-pop-theme').value = campaign.theme || 'retail-impact';
        $('promo-pop-layout').value = campaign.layout || 'auto';
        let gridConfig = {};
        try { gridConfig = JSON.parse(campaign.grid_config_json || '{}') || {}; } catch (error) { gridConfig = {}; }
        let visualConfig = {};
        try { visualConfig = JSON.parse(campaign.visual_config_json || '{}') || {}; } catch (error) { visualConfig = {}; }
        state.visual = { ...state.visual, ...visualConfig };
        const visualFields = {
            'promo-pop-visual-preset': state.visual.preset,
            'promo-pop-badge-style': state.visual.badgeStyle,
            'promo-pop-hero-layout': state.visual.heroLayout,
            'promo-pop-cta-style': state.visual.ctaStyle,
            'promo-pop-output-format': state.visual.outputFormat
        };
        Object.entries(visualFields).forEach(([id, value]) => { const field = $(id); if (field && value) field.value = value; });
        ['promo-pop-smart-fit', 'promo-pop-group-categories', 'promo-pop-show-featured'].forEach((id) => { const field = $(id); const key = id.replace('promo-pop-', '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); if (field && Object.prototype.hasOwnProperty.call(state.visual, key)) field.checked = state.visual[key] === true; });
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
                try {
                    restoreCampaignItems(campaign);
                    renderProductPicker();
                    renderSelectedItems();
                    renderPreview();
                    const deferredCount = selectedProductRows().length;
                    setStatus(deferredCount ? `Mode edit aktif: ${deferredCount} produk dipulihkan dari campaign.` : 'Item campaign belum dapat dipulihkan. Periksa response API.', deferredCount ? 'success' : 'error');
                } catch (error) {
                    setStatus(governanceErrorMessage(error, 'Item campaign gagal dipulihkan karena kebijakan harga minimum.'), 'error');
                }
            }, 0);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function resetForm() {
        state.editingId = '';
        state.governance.campaignPolicyId = '';
        state.visual = { preset: 'fresh-market', badgeStyle: 'sticker', heroLayout: 'split', smartFit: true, groupCategories: false, showFeatured: true, ctaStyle: 'solid', outputFormat: 'a4' };
        const visualDefaults = { 'promo-pop-visual-preset': 'fresh-market', 'promo-pop-theme': 'fresh-organic', 'promo-pop-badge-style': 'sticker', 'promo-pop-hero-layout': 'split', 'promo-pop-cta-style': 'solid', 'promo-pop-output-format': 'a4' };
        Object.entries(visualDefaults).forEach(([id, value]) => { const field = $(id); if (field) field.value = value; });
        ['promo-pop-smart-fit', 'promo-pop-show-featured'].forEach((id) => { const field = $(id); if (field) field.checked = true; });
        const grouping = $('promo-pop-group-categories'); if (grouping) grouping.checked = false;
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
            const canWrite = hasPromoPermission('promo.write');
            const canPublish = hasPromoPermission('promo.publish');
            return `<article class="campaign-row">
                <div class="campaign-color theme-${escapeHtml(campaign.theme || 'orange')}"></div>
                <div class="campaign-main"><h4>${escapeHtml(campaign.title || 'Tanpa judul')}</h4><p>${items.length} produk · ${escapeHtml(campaign.start_at || 'Tanpa mulai')} — ${escapeHtml(campaign.end_at || 'Tanpa akhir')}</p></div>
                <span class="status-badge status-${escapeHtml(status)}">${status === 'published' ? 'Published' : status === 'expired' ? 'Expired' : 'Draft'}</span><div class="campaign-actions"><button type="button" class="small-action" data-edit-campaign="${escapeHtml(campaign.id)}"${canWrite ? '' : ' disabled'}>Edit</button>${status !== 'expired' ? `<button type="button" class="small-action ${status === 'published' ? 'warning' : 'success'}" data-toggle-campaign="${escapeHtml(campaign.id)}" data-campaign-status="${escapeHtml(status)}"${canPublish ? '' : ' disabled'}>${status === 'published' ? 'Unpublish' : 'Publish'}</button>` : ''}<button type="button" class="small-action danger" data-delete-campaign="${escapeHtml(campaign.id)}"${canWrite ? '' : ' disabled'}>Hapus</button></div>
            </article>`;
        }).join('');
        applyGovernanceUiState();
    }

    async function saveCampaign(event) {
        event.preventDefault();
        if (state.busy) return;
        if (!requirePromoPermission('promo.write', 'Anda tidak memiliki akses untuk menyimpan campaign.')) return;
        syncBrochureFieldsFromDom();
        const priceCheck = validateMinimumPrices(selectedProductRows(), { showStatus: true, showWarning: true });
        if (!priceCheck.valid) return;
        const data = collectFormData();
        if (!data.title) return setStatus('Judul campaign wajib diisi.', 'error');
        const rowsWithHigherPromo = selectedProductRows().filter(item => Number(item.promo_price || 0) > Number(item.normal_price || 0));
        if (!selectedProductRows().length) return setStatus('Pilih minimal satu produk.', 'error');
        if (rowsWithHigherPromo.length && !window.confirm(`Ada ${rowsWithHigherPromo.length} produk dengan harga promo lebih tinggi daripada harga normal. Tetap simpan?`)) return;
        state.busy = true;
        try {
            let result;
            if (state.editingId) {
                result = await GASActions.update(SHEET, state.editingId, data);
            } else {
                result = await GASActions.create(SHEET, data);
            }
            if (result?.warnings?.length) setStatus(`Draft tersimpan dengan ${result.warnings.length} peringatan minimum harga (mode warning).`, 'info');
            else setStatus('Campaign POP tersimpan sebagai draft.', 'success');
            resetForm();
            await fetchCampaigns();
        } catch (error) {
            setStatus(governanceErrorMessage(error, 'Gagal menyimpan campaign.'), 'error');
        } finally {
            state.busy = false;
        }
    }

    async function toggleCampaign(id, currentStatus) {
        if (state.busy) return;
        if (!requirePromoPermission('promo.publish', 'Anda tidak memiliki akses untuk publish campaign.')) return;
        state.busy = true;
        try {
            const result = await GASActions.post({ action: currentStatus === 'published' ? 'promo_flyer_unpublish' : 'promo_flyer_publish', sheet: SHEET, id, data: { id, actor: GASActions.getAdminRole() || 'admin', actor_role: state.governance.role || GASActions.getAdminRole() || 'admin' } });
            if (result?.warnings?.length) setStatus(`Campaign diproses dengan ${result.warnings.length} peringatan minimum harga.`, 'info');
            else setStatus(currentStatus === 'published' ? 'Campaign di-unpublish.' : 'Campaign berhasil dipublikasikan.', 'success');
            await fetchCampaigns();
        } catch (error) {
            setStatus(governanceErrorMessage(error, 'Gagal mengubah status campaign.'), 'error');
        } finally {
            state.busy = false;
        }
    }

    async function deleteCampaign(id) {
        if (!requirePromoPermission('promo.write', 'Anda tidak memiliki akses untuk menghapus campaign.')) return;
        if (!window.confirm('Hapus campaign POP ini?')) return;
        try {
            await GASActions.delete(SHEET, id);
            setStatus('Campaign dihapus.', 'success');
            await fetchCampaigns();
        } catch (error) {
            setStatus(governanceErrorMessage(error, 'Gagal menghapus campaign.'), 'error');
        }
    }

    function syncBrochureFieldsFromDom() {
        document.querySelectorAll('#promo-pop-selected-list [data-brochure-name],#promo-pop-selected-list [data-brochure-normal],#promo-pop-selected-list [data-brochure-promo],#promo-pop-selected-list [data-brochure-offer]').forEach((input) => {
            const item = state.selectedItems.get(brochureInputId(input));
            if (!item) return;
            if (input.hasAttribute('data-brochure-name')) item.brochure_name = String(input.value || '').trim();
            if (input.hasAttribute('data-brochure-normal')) item.brochure_normal_price = Number(input.value) || 0;
            if (input.hasAttribute('data-brochure-promo')) {
                const previousPromo = brochurePromoPrice(item);
                const proposedPromo = Number(input.value) || 0;
                item.brochure_promo_price = proposedPromo;
                item.promo_price = proposedPromo;
                enforceItemMinimumPrice(item, proposedPromo, input, previousPromo);
            }
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
        ['promo-pop-visual-preset', 'promo-pop-badge-style', 'promo-pop-hero-layout', 'promo-pop-cta-style', 'promo-pop-output-format'].forEach((id) => $(id)?.addEventListener('change', () => { state.visual = readVisualSettings(); renderPreview(); }));
        $('promo-pop-visual-preset')?.addEventListener('change', (event) => applyVisualPreset(event.target.value));
        ['promo-pop-watermark', 'promo-pop-show-service', 'promo-pop-show-payment', 'promo-pop-show-disclaimer', 'promo-pop-smart-fit', 'promo-pop-group-categories', 'promo-pop-show-featured'].forEach((id) => $(id)?.addEventListener('change', renderPreview));
        document.querySelectorAll('[data-ppob-wallet]').forEach((input) => input.addEventListener('change', renderPreview));
        $('promo-pop-hero-file')?.addEventListener('change', handleHeroUpload);
        $('promo-pop-zoom-out')?.addEventListener('click', () => setPreviewZoom(-.1));
        $('promo-pop-zoom-in')?.addEventListener('click', () => setPreviewZoom(.1));
        $('promo-pop-zoom-reset')?.addEventListener('click', resetPreviewZoom);
        $('promo-pop-pdf')?.addEventListener('click', generatePdf);
        $('promo-pop-png')?.addEventListener('click', generatePng);
        $('promo-pop-print')?.addEventListener('click', openPrintPreview);
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
        ['promo-pop-image-frame', 'promo-pop-image-scale', 'promo-pop-grid-rows', 'promo-pop-grid-columns'].forEach((id) => $(id)?.addEventListener('change', renderPreview));
        $('promo-pop-product-list')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-select-product]');
            if (!button) return;
            if (!requirePromoPermission('promo.write', 'Anda tidak memiliki akses untuk mengubah produk campaign.')) return;
            const id = button.dataset.selectProduct;
            const product = state.products.find((item) => item.id === id);
            if (!product) return;
            if (state.selectedItems.has(id)) {
                state.selectedItems.delete(id);
                state.featuredIds.delete(id);
            } else {
                state.selectedItems.set(id, { id, name: product.name, image: product.image, unit: product.unit, brand: product.brand, sku: product.sku, category: product.category, stock: product.stock, cost_price: product.cost_price, minimum_price: product.minimum_price, normal_price: product.price, promo_price: product.price, brochure_name: product.name, brochure_normal_price: product.price, brochure_promo_price: product.price, brochure_offer: product.unit ? `Harga spesial · ${product.unit}` : 'Promo terbatas' });
            }
            renderProductPicker();
            renderSelectedItems();
            renderPreview();
        });
        $('promo-pop-product-list')?.addEventListener('input', (event) => {
            const input = event.target.closest('[data-promo-badge]');
            if (!input) return;
            if (!requirePromoPermission('promo.write', 'Anda tidak memiliki akses untuk mengubah campaign.')) return;
            const item = state.selectedItems.get(input.dataset.promoBadge);
            if (item) item.badge = String(input.value || '').trim();
            renderPreview();
        });
        $('promo-pop-product-list')?.addEventListener('change', (event) => {
            const input = event.target.closest('[data-promo-price]');
            const badgeInput = event.target.closest('[data-promo-badge]');
            if ((input || badgeInput) && !requirePromoPermission('promo.write', 'Anda tidak memiliki akses untuk mengubah campaign.')) return;
            if (input) {
                const item = state.selectedItems.get(input.dataset.promoPrice);
                if (item) {
                    const previousPromo = brochurePromoPrice(item);
                    const proposedPromo = Number(input.value) || 0;
                    item.promo_price = proposedPromo;
                    item.brochure_promo_price = proposedPromo;
                    enforceItemMinimumPrice(item, proposedPromo, input, previousPromo);
                }
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
            if (!requirePromoPermission('promo.write', 'Anda tidak memiliki akses untuk mengubah campaign.')) return;
            const id = brochureInputId(input);
            const item = state.selectedItems.get(id);
            if (!item) return;
            if (input.hasAttribute('data-brochure-name')) item.brochure_name = String(input.value || '').trim();
            if (input.hasAttribute('data-brochure-normal')) item.brochure_normal_price = Number(input.value) || 0;
            if (input.hasAttribute('data-brochure-promo')) {
                const previousPromo = brochurePromoPrice(item);
                const proposedPromo = Number(input.value) || 0;
                item.brochure_promo_price = proposedPromo;
                item.promo_price = proposedPromo;
                enforceItemMinimumPrice(item, proposedPromo, input, previousPromo);
            }
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
            if (featureButton || copyButton || pasteButton || removeButton) {
                if (!requirePromoPermission('promo.write', 'Anda tidak memiliki akses untuk mengelola campaign.')) return;
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
            if (!requirePromoPermission('promo.write', 'Anda tidak memiliki akses untuk mengurutkan produk.')) return;
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
        setStatus('Memuat produk dan governance...', 'info');
        try {
            await loadGovernanceContext('');
            await Promise.all([fetchProducts(), fetchCampaigns()]);
            renderSelectedItems();
            renderPreview();
            renderCampaigns();
            const roleLabel = state.governance.role ? ` Role: ${state.governance.role}.` : '';
            setStatus(`Generator Catalog Promo POP siap digunakan.${roleLabel}`, 'success');
        } catch (error) {
            setStatus(error.message || 'Gagal memuat data generator.', 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
