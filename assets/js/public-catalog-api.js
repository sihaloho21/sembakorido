/*
 * Same-origin catalog client.
 * The website backend proxies requests to the feature API, so browser CORS is not needed.
 */
(function (global) {
    'use strict';

    const DEFAULT_PATH = '/api/products';

    function getPath() {
        const configured = global.CONFIG && typeof global.CONFIG.getPublicCatalogApiPath === 'function'
            ? global.CONFIG.getPublicCatalogApiPath()
            : '';
        return configured || DEFAULT_PATH;
    }

    async function request(params) {
        const query = new URLSearchParams();
        Object.entries(params || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
        });

        const suffix = query.toString() ? `?${query.toString()}` : '';
        const response = await fetch(`${getPath()}${suffix}`, {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error(`Catalog API HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload.success) throw new Error(payload.error || 'Catalog API gagal');
        return payload.data;
    }

    global.PublicCatalogApi = {
        getPath,
        products: (params) => request(params)
    };
})(window);
