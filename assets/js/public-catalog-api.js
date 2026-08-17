/*
 * Public Catalog API client for integrations.
 * Read-only: safe to expose to browser clients.
 */
(function (global) {
    'use strict';

    const DEFAULT_BASE_URL = 'https://paket-sembako-online-943127658752.asia-southeast1.run.app';

    function getBaseUrl() {
        const configured = global.CONFIG && typeof global.CONFIG.getPublicCatalogApiUrl === 'function'
            ? global.CONFIG.getPublicCatalogApiUrl()
            : '';
        return (configured || DEFAULT_BASE_URL).replace(/\/$/, '');
    }

    async function request(path, params) {
        const query = new URLSearchParams();
        Object.entries(params || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
        });

        const suffix = query.toString() ? `?${query.toString()}` : '';
        const response = await fetch(`${getBaseUrl()}${path}${suffix}`, {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error(`Public Catalog API HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload.success) throw new Error(payload.error || 'Public Catalog API gagal');
        return payload.data;
    }

    global.PublicCatalogApi = {
        getBaseUrl,
        health: () => request('/api/health'),
        categories: () => request('/api/catalog/categories'),
        products: (params) => request('/api/catalog/products', params),
        product: (id) => request(`/api/catalog/products/${encodeURIComponent(id)}`),
        store: () => request('/api/catalog/store')
    };
})(window);
