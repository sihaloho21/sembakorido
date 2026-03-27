(function (window) {
    const ADMIN_SESSION_KEY = 'sembako_admin_session_v1';
    const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

    function readStorageValue(keys) {
        for (let i = 0; i < keys.length; i += 1) {
            const key = keys[i];
            const sessionValue = String(sessionStorage.getItem(key) || '').trim();
            if (sessionValue) return sessionValue;
            const localValue = String(localStorage.getItem(key) || '').trim();
            if (localValue) return localValue;
        }
        return '';
    }

    function clear() {
        const keys = [
            ADMIN_SESSION_KEY,
            'admin_logged_in',
            'sembako_admin_api_token',
            'sembako_admin_write_token',
            'sembako_admin_token',
            'admin_token',
            'api_token',
            'sembako_api_token',
            'gos_admin_token',
            'gos_api_token',
            'sembako_admin_role',
            'admin_role',
            'sembako_role'
        ];
        keys.forEach((key) => {
            sessionStorage.removeItem(key);
            localStorage.removeItem(key);
        });
    }

    function readSession() {
        const raw = String(sessionStorage.getItem(ADMIN_SESSION_KEY) || '').trim();
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            const expiresAt = Number(parsed.expires_at || 0);
            if (!expiresAt || expiresAt <= Date.now()) return null;
            if (expiresAt - Date.now() > ADMIN_SESSION_TTL_MS) return null;
            return parsed;
        } catch (error) {
            return null;
        }
    }

    function hasToken() {
        return Boolean(readStorageValue([
            'sembako_admin_api_token',
            'sembako_admin_write_token',
            'sembako_admin_token',
            'admin_token',
            'api_token',
            'sembako_api_token',
            'gos_admin_token',
            'gos_api_token'
        ]));
    }

    function ensureOrRedirect() {
        const session = readSession();
        if (!session || !hasToken()) {
            clear();
            window.location.href = 'login.html';
            return null;
        }
        return session;
    }

    function logout() {
        clear();
        window.location.href = 'login.html';
    }

    window.AdminAuth = {
        clear,
        hasToken,
        logout,
        readSession,
        ensureOrRedirect
    };
})(window);
