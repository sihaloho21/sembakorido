(() => {
    'use strict';

    const state = { campaigns: [], loading: true };
    const $ = (id) => document.getElementById(id);
    const THEMES = [
        'retail-impact', 'modern-minimalist', 'seasonal-festive', 'flash-sale-neon',
        'fresh-organic', 'retro-pasar', 'cyber-grosir', 'carnival-pesta', 'luxury-gold', 'pastel-korean',
        'orange', 'blue', 'green', 'purple'
    ];
    const LAYOUTS = ['auto', 'bento', 'diagonal', 'magazine-asymmetric', 'mosaic-grid', 'featured-spotlight', 'zigzag-tier', 'starburst', 'filmstrip', 'custom-flexible'];

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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

    function parseItems(campaign) {
        if (Array.isArray(campaign.items)) return campaign.items;
        try {
            const parsed = JSON.parse(campaign.items_json || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function themeClass(theme) {
        const value = String(theme || '').toLowerCase();
        return THEMES.includes(value) ? value : 'retail-impact';
    }

    function layoutClass(layout) {
        const value = String(layout || '').toLowerCase();
        return LAYOUTS.includes(value) ? value : 'auto';
    }

    function parseJson(value, fallback) {
        try { return value ? JSON.parse(value) : fallback; } catch (error) { return fallback; }
    }

    function displayPeriod(campaign) {
        if (campaign.period_text) return String(campaign.period_text);
        if (campaign.end_at) return `Berlaku sampai ${String(campaign.end_at).replace('T', ' ')}`;
        return '';
    }

    function renderLoading() {
        const container = $('promo-pop-public-list');
        if (container) container.innerHTML = '<div class="promo-pop-public-loading"><span class="promo-pop-spinner" aria-hidden="true"></span><span>Memuat promo produk...</span></div>';
    }

    function renderEmpty() {
        const container = $('promo-pop-public-list');
        if (container) container.innerHTML = '<div class="promo-pop-public-empty"><div class="text-4xl mb-3" aria-hidden="true">🔥</div><h3 class="text-lg font-bold text-gray-800">Belum ada Catalog Promo POP aktif</h3><p class="text-sm text-gray-500 mt-2">Promo produk terbaru akan tampil di halaman ini saat campaign dipublikasikan.</p></div>';
    }

    function renderCampaign(campaign) {
        const items = parseItems(campaign);
        const theme = themeClass(campaign.theme);
        const layout = layoutClass(campaign.layout || parseJson(campaign.grid_config_json, {}).layout);
        const heroStyle = campaign.hero_image ? `style="background-image:url('${escapeHtml(campaign.hero_image)}')"` : '';
        const store = campaign.store_name || 'Paket Sembako';
        const campaignBadge = campaign.badge_text || 'PROMO SPESIAL';
        const period = displayPeriod(campaign);
        const footerNote = campaign.footer_note || '';
        const gridConfig = parseJson(campaign.grid_config_json, {});
        const columns = Number(gridConfig.columns) >= 2 && Number(gridConfig.columns) <= 6 ? Number(gridConfig.columns) : 4;
        const itemMarkup = items.map((item, index) => {
            const normal = Number(item.normal_price || item.price || 0);
            const promo = Number(item.promo_price || item.price || 0);
            const hasDiscount = normal > promo && promo > 0;
            return `<article class="promo-pop-public-item promo-pop-public-item-${index % 4 === 0 ? 'featured' : 'standard'}">
                <div class="promo-pop-public-image">${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name || 'Produk promo')}" loading="lazy">` : '<span>POP</span>'}${item.badge ? `<span class="promo-pop-public-badge">${escapeHtml(item.badge)}</span>` : ''}</div>
                <h4>${escapeHtml(item.name || 'Produk')}</h4>
                ${item.unit ? `<p class="promo-pop-public-unit">${escapeHtml(item.unit)}</p>` : ''}
                ${hasDiscount ? `<div class="promo-pop-public-normal">${formatCurrency(normal)}</div>` : ''}
                <div class="promo-pop-public-price">${formatCurrency(promo || normal)}</div>
            </article>`;
        }).join('');
        const qr = campaign.qr_url || '';
        const watermark = String(campaign.show_watermark || '').toLowerCase() === 'true' ? (campaign.watermark_text || 'Paket Sembako') : '';
        return `<article class="promo-pop-public-campaign promo-pop-public-theme-${theme} promo-pop-public-layout-${layout}" style="--promo-pop-columns:${columns}">
            <div class="promo-pop-public-hero" ${heroStyle}>
                <div class="promo-pop-public-overlay"></div>
                <div class="relative z-10">
                    <span class="promo-pop-public-kicker">🔥 ${escapeHtml(store).toUpperCase()}</span>
                    <h3>${escapeHtml(campaign.title || 'Promo Spesial')}</h3>
                    ${campaign.subtitle ? `<p>${escapeHtml(campaign.subtitle)}</p>` : ''}
                    ${period ? `<span class="promo-pop-public-period">${escapeHtml(period)}</span>` : ''}
                </div>
                ${campaignBadge ? `<span class="promo-pop-public-campaign-badge">${escapeHtml(campaignBadge)}</span>` : ''}
            </div>
            ${campaign.description ? `<div class="promo-pop-public-description">${escapeHtml(campaign.description)}</div>` : ''}
            <div class="promo-pop-public-meta"><span>${items.length} produk pilihan</span>${qr ? `<a href="${escapeHtml(qr)}" target="_blank" rel="noopener noreferrer">Buka katalog / QR</a>` : ''}</div>
            <div class="promo-pop-public-items">${itemMarkup || '<p class="text-sm text-gray-500 col-span-full">Produk promo belum tersedia.</p>'}</div>
            ${footerNote || watermark ? `<footer class="promo-pop-public-footer">${footerNote ? `<span>${escapeHtml(footerNote)}</span>` : ''}${watermark ? `<small>${escapeHtml(watermark)}</small>` : ''}</footer>` : ''}
        </article>`;
    }

    function render() {
        const container = $('promo-pop-public-list');
        if (!container) return;
        if (state.loading) return renderLoading();
        if (!state.campaigns.length) return renderEmpty();
        container.innerHTML = state.campaigns.map(renderCampaign).join('');
    }

    async function loadCampaigns() {
        render();
        try {
            const url = new URL(CONFIG.getMainApiUrl());
            url.searchParams.set('action', 'public_promo_flyers');
            url.searchParams.set('_t', Date.now());
            const response = await fetch(url.toString(), { cache: 'no-store' });
            if (!response.ok) throw new Error('Promo tidak dapat dimuat');
            const payload = await response.json();
            if (payload && payload.error) throw new Error(payload.message || payload.error);
            state.campaigns = readArrayResponse(payload);
        } catch (error) {
            const container = $('promo-pop-public-list');
            if (container) container.innerHTML = '<div class="promo-pop-public-empty"><div class="text-4xl mb-3" aria-hidden="true">⚠️</div><h3 class="text-lg font-bold text-gray-800">Promo belum dapat dimuat</h3><p class="text-sm text-gray-500 mt-2">Silakan coba lagi beberapa saat.</p></div>';
            console.warn('[promo-pop] public load failed', error);
        } finally {
            state.loading = false;
            render();
        }
    }

    document.addEventListener('DOMContentLoaded', loadCampaigns);
})();
