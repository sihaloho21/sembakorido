const ADMIN_SESSION_KEY = 'sembako_admin_session_v1';
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const TOKEN_STORAGE_KEYS = [
    'sembako_admin_write_token',
    'sembako_admin_api_token',
    'sembako_admin_token'
];
const ROLE_STORAGE_KEYS = ['sembako_admin_role', 'admin_role'];

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

function normalizeRole(value) {
    const role = String(value || '').trim().toLowerCase();
    if (role === 'superadmin' || role === 'manager' || role === 'operator' || role === 'viewer') {
        return role;
    }
    return 'superadmin';
}

function clearLegacyAdminFlags() {
    localStorage.removeItem('admin_logged_in');
}

function persistAdminSession(token, role) {
    const now = Date.now();
    const sessionPayload = {
        role: role,
        issued_at: now,
        expires_at: now + ADMIN_SESSION_TTL_MS
    };

    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionPayload));
    sessionStorage.setItem('sembako_admin_write_token', token);
    sessionStorage.setItem('sembako_admin_api_token', token);
    sessionStorage.setItem('sembako_admin_role', role);

    // Keep compatibility for parts of UI that still read local storage.
    localStorage.setItem('sembako_admin_role', role);
    clearLegacyAdminFlags();
}

function hasValidSession() {
    const raw = String(sessionStorage.getItem(ADMIN_SESSION_KEY) || '').trim();
    if (!raw) return false;
    try {
        const parsed = JSON.parse(raw);
        if (Number(parsed.expires_at || 0) <= Date.now()) return false;
        return Boolean(readStorageValue(TOKEN_STORAGE_KEYS));
    } catch (error) {
        return false;
    }
}

function resolveAdminApiUrl() {
    if (typeof CONFIG !== 'undefined' && typeof CONFIG.getAdminApiUrl === 'function') {
        return CONFIG.getAdminApiUrl();
    }
    return '';
}

async function verifyAdminToken(token) {
    const apiUrl = resolveAdminApiUrl();
    if (!apiUrl) {
        return { ok: false, message: 'API admin belum dikonfigurasi.' };
    }

    const verificationRole = 'superadmin';
    const payload = {
        action: 'admin_ping',
        sheet: 'settings',
        token: token,
        admin_token: token,
        role: verificationRole,
        admin_role: verificationRole,
        data: {}
    };

    const formData = new FormData();
    formData.append('json', JSON.stringify(payload));
    formData.append('token', token);
    formData.append('admin_token', token);
    formData.append('role', verificationRole);
    formData.append('admin_role', verificationRole);

    let response;
    try {
        response = await fetch(apiUrl, {
            method: 'POST',
            body: formData
        });
    } catch (error) {
        return { ok: false, message: 'Gagal terhubung ke API admin.' };
    }

    let body = {};
    try {
        body = await response.json();
    } catch (error) {
        body = {};
    }

    const errorCode = String(body.error || '').trim();
    if (!response.ok) {
        return { ok: false, message: `HTTP ${response.status}: ${errorCode || 'Gagal verifikasi token.'}` };
    }
    if (errorCode === 'ADMIN_TOKEN_NOT_CONFIGURED') {
        return { ok: false, message: 'ADMIN_TOKEN di GAS belum dikonfigurasi.' };
    }
    if (errorCode === 'Unauthorized') {
        return { ok: false, message: 'ADMIN_TOKEN tidak valid.' };
    }
    // Expected response for unknown action after auth passes.
    // Backend variant can be "Invalid action" or "Invalid action or request format".
    const normalizedError = errorCode.toLowerCase();
    if (normalizedError.includes('invalid action')) {
        return { ok: true };
    }
    if (errorCode) {
        return { ok: false, message: String(body.message || errorCode || 'Verifikasi token gagal.') };
    }
    return { ok: true };
}

if (hasValidSession()) {
    window.location.href = '/admin/index.html';
}

document.addEventListener('DOMContentLoaded', () => {
    const tokenInput = document.getElementById('admin-token');
    const roleInput = document.getElementById('admin-role');
    const errorMsg = document.getElementById('error-message');
    const loginButton = document.getElementById('login-button');
    const form = document.getElementById('login-form');

    if (!form || !tokenInput || !roleInput || !errorMsg || !loginButton) return;

    const seededToken = readStorageValue(TOKEN_STORAGE_KEYS);
    const seededRole = normalizeRole(readStorageValue(ROLE_STORAGE_KEYS) || roleInput.value);
    if (seededToken) tokenInput.value = seededToken;
    roleInput.value = seededRole;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorMsg.classList.add('hidden');

        const token = String(tokenInput.value || '').trim();
        const role = normalizeRole(roleInput.value);
        if (!token) {
            errorMsg.textContent = 'ADMIN_TOKEN wajib diisi.';
            errorMsg.classList.remove('hidden');
            return;
        }

        loginButton.disabled = true;
        loginButton.textContent = 'Memverifikasi...';

        try {
            const result = await verifyAdminToken(token);
            if (!result.ok) {
                errorMsg.textContent = result.message || 'Token tidak valid atau akses ditolak.';
                errorMsg.classList.remove('hidden');
                return;
            }
            persistAdminSession(token, role);
            window.location.href = '/admin/index.html';
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = 'Masuk';
        }
    });
});
