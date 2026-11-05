(function () {
    'use strict';

    const screen = document.getElementById('homepage-maintenance-screen');
    const title = document.getElementById('homepage-maintenance-title');
    const defaultDocumentTitle = document.title;

    if (!screen) return;

    function applyMaintenanceState(enabled) {
        const isEnabled = enabled === true;
        screen.hidden = !isEnabled;
        screen.setAttribute('aria-hidden', String(!isEnabled));
        document.body.classList.toggle('homepage-maintenance-active', isEnabled);
        document.title = isEnabled
            ? 'Website Sedang Dalam Perbaikan | Paket Sembako'
            : defaultDocumentTitle;

        if (isEnabled && title) {
            window.requestAnimationFrame(() => title.focus({ preventScroll: true }));
        }
    }

    const initialState = typeof CONFIG !== 'undefined'
        && typeof CONFIG.isHomepageMaintenanceEnabled === 'function'
        && CONFIG.isHomepageMaintenanceEnabled();

    applyMaintenanceState(initialState);
    window.addEventListener('homepage-maintenance-status-updated', (event) => {
        applyMaintenanceState(Boolean(event.detail && event.detail.enabled));
    });
})();
