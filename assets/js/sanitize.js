// Frontend shared sanitization helpers
window.FrontendSanitize = (function () {
    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sanitizeUrl(url, fallback = '') {
        if (!url) return fallback;
        const trimmed = String(url).trim();
        const isSafe = /^(https?:\/\/|\/(?!\/)|\.\/|\.\.\/|#)/i.test(trimmed);
        return isSafe ? trimmed : fallback;
    }

    function ensureImageFallbackHandler() {
        if (window.__imageFallbackHandlerAdded) return;
        window.__imageFallbackHandlerAdded = true;
        document.addEventListener('error', (event) => {
            const target = event.target;
            if (!target || target.tagName !== 'IMG') return;
            const fallback = target.getAttribute('data-fallback-src');
            const action = target.getAttribute('data-fallback-action');
            if (fallback && target.src !== fallback) {
                target.src = fallback;
                return;
            }
            if (action === 'hide') {
                target.style.display = 'none';
            }
        }, true);
    }

    return {
        escapeHtml,
        sanitizeUrl,
        ensureImageFallbackHandler
    };
})();

// Backward-compatible globals for inline usage
if (!window.sanitizeUrl) {
    window.sanitizeUrl = window.FrontendSanitize.sanitizeUrl;
}
if (!window.ensureImageFallbackHandler) {
    window.ensureImageFallbackHandler = window.FrontendSanitize.ensureImageFallbackHandler;
}

if (!window.AdminSanitize) {
    window.AdminSanitize = window.FrontendSanitize;
}
