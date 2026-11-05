(function () {
    'use strict';

    const screen = document.getElementById('homepage-maintenance-screen');
    const title = document.getElementById('homepage-maintenance-title');
    const dismissedKey = 'sembako_homepage_maintenance_dismissed';
    const defaultDocumentTitle = document.title;
    let dismissedInMemory = false;

    if (!screen) return;

    function isDismissed() {
        if (dismissedInMemory) return true;
        try {
            return window.sessionStorage.getItem(dismissedKey) === 'true';
        } catch (error) {
            return false;
        }
    }

    function applyMaintenanceState(enabled) {
        const isEnabled = enabled === true;
        if (!isEnabled) {
            dismissedInMemory = false;
            try {
                window.sessionStorage.removeItem(dismissedKey);
            } catch (error) {
                // The page can still be opened or dismissed if storage is unavailable.
            }
        }

        const shouldShow = isEnabled && !isDismissed();
        const wasVisible = !screen.hidden;
        screen.hidden = !shouldShow;
        screen.setAttribute('aria-hidden', String(!shouldShow));
        document.body.classList.toggle('homepage-maintenance-active', shouldShow);
        document.title = shouldShow
            ? 'Website Sedang Dalam Perbaikan | Paket Sembako'
            : defaultDocumentTitle;

        if (shouldShow && !wasVisible && title) {
            window.requestAnimationFrame(() => title.focus({ preventScroll: true }));
        }
    }

    function closeMaintenancePage() {
        dismissedInMemory = true;
        try {
            window.sessionStorage.setItem(dismissedKey, 'true');
        } catch (error) {
            // Hiding the notice for the current page still works without sessionStorage.
        }
        screen.hidden = true;
        screen.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('homepage-maintenance-active');
        document.title = defaultDocumentTitle;

        const mainContent = document.getElementById('main-content');
        if (mainContent) mainContent.focus({ preventScroll: true });
    }

    const initialState = typeof CONFIG !== 'undefined'
        && typeof CONFIG.isHomepageMaintenanceEnabled === 'function'
        && CONFIG.isHomepageMaintenanceEnabled();

    applyMaintenanceState(initialState);
    window.addEventListener('homepage-maintenance-status-updated', (event) => {
        applyMaintenanceState(Boolean(event.detail && event.detail.enabled));
    });

    screen.addEventListener('click', (event) => {
        if (event.target.closest('[data-action="close-maintenance"]')) {
            closeMaintenancePage();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !screen.hidden) {
            closeMaintenancePage();
        }
    });
})();
