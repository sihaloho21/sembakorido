/* Category Product Carousel — shared storefront integration */
(function () {
    'use strict';

    const CONFIG_KEY = 'category_showcase_config';
    const CACHE_DURATION = 5 * 60 * 1000;
    const MAX_CATEGORIES = 100;
    const CATEGORY_MAX = 50;
    const CATEGORY_MIN = 1;
    let publicConfigPromise = null;

    function normalizeCategory(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    }

    function escapeAttribute(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function normalizeConfig(input) {
        const raw = input && typeof input === 'object' ? input : {};
        const rawCategories = Array.isArray(raw.categories) ? raw.categories : [];
        const seen = new Set();
        const categories = rawCategories.slice(0, MAX_CATEGORIES).map((entry, index) => {
            const category = normalizeCategory(entry && entry.category);
            const key = category.toLocaleLowerCase('id');
            if (!category || seen.has(key)) return null;
            seen.add(key);
            const sortOrder = Number.isInteger(Number(entry.sort_order)) ? Number(entry.sort_order) : index + 1;
            const maxProducts = Number(entry.max_products);
            if (!Number.isInteger(maxProducts) || maxProducts < CATEGORY_MIN || maxProducts > CATEGORY_MAX) return null;
            return {
                category,
                enabled: entry.enabled === true || String(entry.enabled).toLowerCase() === 'true',
                sort_order: sortOrder,
                max_products: maxProducts
            };
        }).filter(Boolean).sort((a, b) => a.sort_order - b.sort_order);
        return {
            version: Number(raw.version) || 1,
            enabled: raw.enabled === true || String(raw.enabled).toLowerCase() === 'true',
            categories
        };
    }

    function extractConfig(response) {
        if (!response || response.success === false) return null;
        const candidate = response.config || response.category_showcase_config || response.data || response;
        if (typeof candidate === 'string') {
            try { return normalizeConfig(JSON.parse(candidate)); } catch (error) { return null; }
        }
        return candidate && typeof candidate === 'object' ? normalizeConfig(candidate) : null;
    }

    async function loadPublicConfig() {
        if (publicConfigPromise) return publicConfigPromise;
        publicConfigPromise = (async () => {
            try {
                const response = await ApiService.get(`?action=public_category_showcase_config&_=${Date.now()}`, {
                    cacheDuration: CACHE_DURATION,
                    maxRetries: 1
                });
                return extractConfig(response) || { version: 1, enabled: false, categories: [] };
            } catch (error) {
                console.warn('Category showcase config unavailable; keeping catalog fallback:', error);
                return { version: 1, enabled: false, categories: [] };
            }
        })();
        return publicConfigPromise;
    }

    function isProductAvailable(product) {
        if (!product || typeof product !== 'object' || product.isHidden === true) return false;
        const status = normalizeCategory(product.status).toLocaleLowerCase('id').replace(/[_-]+/g, ' ');
        if (['sembunyikan', 'disembunyikan', 'hidden', 'off', 'tidak tersedia', 'tidak tersedia saat ini', 'unavailable', 'not available', 'out of stock', 'habis', 'stok habis'].includes(status)) return false;
        const stock = Number(product.stok);
        return Number.isFinite(stock) && stock > 0;
    }

    function filterAvailableProducts(products) {
        return (Array.isArray(products) ? products : []).filter(isProductAvailable);
    }

    function sortProductsByAvailability(products) {
        return (Array.isArray(products) ? products : [])
            .map((product, index) => ({ product, index }))
            .sort((a, b) => {
                const aAvailable = isProductAvailable(a.product);
                const bAvailable = isProductAvailable(b.product);

                if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;

                // Preserve catalog/source order for products with the same availability.
                return a.index - b.index;
            })
            .map(({ product }) => product);
    }

    function getCategoryProducts(category, limit) {
        const target = normalizeCategory(category).toLocaleLowerCase('id');
        const categoryProducts = (Array.isArray(window.categoryShowcaseProducts) ? window.categoryShowcaseProducts : []).filter((product) => {
            const productCategory = normalizeCategory(product.category || product.kategori).toLocaleLowerCase('id');
            return productCategory === target;
        });
        return sortProductsByAvailability(filterAvailableProducts(categoryProducts)).slice(0, limit);
    }

    function renderSharedCards(products) {
        const grid = document.getElementById('product-grid');
        if (!grid || typeof window.renderProducts !== 'function') return '';
        const temporary = document.createElement('div');
        temporary.id = 'product-grid';
        temporary.className = 'grid grid-cols-3 gap-2';
        grid.id = 'product-grid-source';
        grid.parentNode.insertBefore(temporary, grid);
        try {
            window.renderProducts(products);
            return temporary.innerHTML;
        } finally {
            temporary.remove();
            grid.id = 'product-grid';
            if (typeof window.filterProducts === 'function') window.filterProducts();
        }
    }

    function scrollShowcase(id, direction) {
        const track = document.getElementById(id);
        if (!track) return;
        const amount = Math.max(240, Math.floor(track.clientWidth * 0.85));
        track.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        window.setTimeout(() => updateControls(track), 250);
    }

    function updateControls(track) {
        const section = track && track.closest('[data-category-showcase-section]');
        if (!section || !track) return;
        const left = section.querySelector('[data-showcase-scroll="left"]');
        const right = section.querySelector('[data-showcase-scroll="right"]');
        const overflow = track.scrollWidth > track.clientWidth + 4;
        const atStart = track.scrollLeft <= 4;
        const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
        if (left) { left.disabled = !overflow || atStart; left.setAttribute('aria-disabled', String(left.disabled)); }
        if (right) { right.disabled = !overflow || atEnd; right.setAttribute('aria-disabled', String(right.disabled)); }
        track.classList.toggle('has-overflow', overflow && !atEnd);
    }

    function render(config) {
        const host = document.getElementById('category-showcase');
        if (!host) return;
        host.innerHTML = '';
        if (!config || !config.enabled) { host.classList.add('hidden'); return; }
        const sections = config.categories.map((entry, index) => {
            const products = getCategoryProducts(entry.category, entry.max_products);
            if (!entry.enabled || products.length === 0) return '';
            const trackId = `category-showcase-track-${index}`;
            const cards = renderSharedCards(products);
            return `<section class="category-showcase-section" data-category-showcase-section data-category="${escapeHtml(entry.category)}" aria-labelledby="${trackId}-title">
                <div class="category-showcase-header">
                    <span class="category-showcase-title-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-1.5 11h-13L4 9Z"/><path d="m8 9 2-5m6 5-2-5M8 13v3m4-3v3m4-3v3"/></svg>
                    </span>
                    <h2 id="${trackId}-title" class="category-showcase-title">${escapeHtml(entry.category)}</h2>
                </div>
                <div class="category-showcase-viewport">
                    <button type="button" class="category-showcase-scroll category-showcase-scroll--left" data-showcase-scroll="left" data-track-id="${trackId}" aria-label="Geser ${escapeAttribute(entry.category)} ke kiri">‹</button>
                    <div id="${trackId}" class="category-showcase-track" role="region" aria-labelledby="${trackId}-title" tabindex="0">${cards}</div>
                    <button type="button" class="category-showcase-scroll category-showcase-scroll--right" data-showcase-scroll="right" data-track-id="${trackId}" aria-label="Geser ${escapeAttribute(entry.category)} ke kanan">›</button>
                </div>
            </section>`;
        }).filter(Boolean).join('');
        host.innerHTML = sections;
        host.classList.toggle('hidden', !sections);
        host.querySelectorAll('.category-showcase-track').forEach((track) => {
            track.addEventListener('scroll', () => updateControls(track), { passive: true });
            track.addEventListener('keydown', (event) => {
                if (event.key === 'ArrowLeft') { event.preventDefault(); scrollShowcase(track.id, 'left'); }
                if (event.key === 'ArrowRight') { event.preventDefault(); scrollShowcase(track.id, 'right'); }
            });
            updateControls(track);
        });
    }

    function handleAction(event) {
        const trigger = event.target.closest('[data-action]');
        if (!trigger) return;
        const action = trigger.getAttribute('data-action');
        if (action === 'showcase-scroll') return;
        if (!['show-detail', 'add-to-cart', 'update-product-card-qty', 'direct-order'].includes(action)) return;
        const id = trigger.getAttribute('data-product-id') || trigger.closest('[data-product-id]')?.getAttribute('data-product-id');
        const product = typeof window.findProductById === 'function' ? window.findProductById(id) : null;
        if (!product) return;
        if (action === 'show-detail' && typeof window.showDetail === 'function') window.showDetail(product);
        if (action === 'add-to-cart' && typeof window.addToCart === 'function') window.addToCart(product, event);
        if (action === 'direct-order' && typeof window.directOrder === 'function') window.directOrder(product);
        if (action === 'update-product-card-qty' && typeof window.updateProductCardQty === 'function') window.updateProductCardQty(id, parseInt(trigger.getAttribute('data-delta'), 10));
    }

    window.CategoryShowcase = { CONFIG_KEY, normalizeConfig, loadPublicConfig, render, renderSharedCards, isProductAvailable, filterAvailableProducts, sortProductsByAvailability };
    document.addEventListener('DOMContentLoaded', () => {
        const host = document.getElementById('category-showcase');
        if (!host) return;
        host.addEventListener('click', (event) => {
            const scroll = event.target.closest('[data-showcase-scroll]');
            if (scroll) { event.preventDefault(); scrollShowcase(scroll.getAttribute('data-track-id'), scroll.getAttribute('data-showcase-scroll')); return; }
            handleAction(event);
        });
        loadPublicConfig().then(render);
    });
})();
