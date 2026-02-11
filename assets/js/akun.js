/**
 * Akun Pengguna - GoSembako
 * Handles user authentication and order history
 */

// Phone utilities
const normalizePhoneTo08 = (phone) => {
    // Safely convert to string first to handle numbers, null, undefined
    const phoneStr = String(phone == null ? '' : phone);
    const digits = phoneStr.replace(/[^0-9]/g, '');
    if (!digits) return '';
    let core = digits;
    if (core.startsWith('62')) core = core.slice(2);
    if (core.startsWith('0')) core = core.slice(1);
    if (!core.startsWith('8')) return '';
    return '0' + core;
};

const phoneLookupVariants = (phone) => {
    const base = normalizePhoneTo08(phone);
    if (!base) return [];
    const core = base.slice(1);
    return [base, `+62${core}`, `62${core}`, core];
};

const displayPhone = (phone) => normalizePhoneTo08(phone) || (phone || '');

const parseSheetResponse = (data) => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.result)) return data.result;
    if (data && data.result) return Array.isArray(data.result) ? data.result : [data.result];
    return [];
};

const isUnauthorizedApiResponse = (data) => {
    return Boolean(
        data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        String(data.error || '').toLowerCase() === 'unauthorized'
    );
};

let referralProfileCache = null;

function toReferralCodeValue(value) {
    return String(value || '').trim().toUpperCase();
}

function setReferralStatus(message, type) {
    const statusEl = document.getElementById('referral-status');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = 'text-xs';
    if (type === 'success') {
        statusEl.classList.add('text-green-600');
    } else if (type === 'error') {
        statusEl.classList.add('text-red-600');
    } else if (type === 'warning') {
        statusEl.classList.add('text-amber-600');
    } else {
        statusEl.classList.add('text-gray-500');
    }
}

function generateReferralCode(name, phone, existingCodes) {
    const baseName = String(name || 'USER').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'USER';
    const digits = normalizePhoneTo08(phone).replace(/\D/g, '');
    const suffix = digits.slice(-4) || Math.floor(1000 + Math.random() * 9000).toString();
    let candidate = `${baseName}${suffix}`.slice(0, 24);

    if (!existingCodes.has(candidate)) {
        return candidate;
    }

    for (let i = 1; i <= 2000; i += 1) {
        const alt = `${baseName}${suffix}${i}`.slice(0, 24);
        if (!existingCodes.has(alt)) return alt;
    }

    return `${baseName}${Date.now().toString().slice(-6)}`.slice(0, 24);
}

async function fetchUsersList() {
    const apiUrl = CONFIG.getMainApiUrl();
    const response = await fetch(`${apiUrl}?sheet=users&_t=${Date.now()}`);
    if (!response.ok) throw new Error('Gagal memuat data users');
    return parseSheetResponse(await response.json());
}

async function ensureUserReferralCode(user, users) {
    const currentUser = users.find((u) => String(u.id) === String(user.id)) ||
        users.find((u) => normalizePhoneTo08(u.whatsapp || u.phone || '') === normalizePhoneTo08(user.whatsapp));
    if (!currentUser) {
        return {
            user: {
                id: user.id || '',
                nama: user.nama || 'User',
                whatsapp: normalizePhoneTo08(user.whatsapp || user.phone || ''),
                kode_referral: '',
                referred_by: '',
                referral_count: 0,
                referral_points_total: 0
            },
            code: '',
            missingProfile: true
        };
    }

    const currentCode = toReferralCodeValue(currentUser.kode_referral);
    if (currentCode) return { user: currentUser, code: currentCode };

    const existingCodes = new Set(
        users
            .map((u) => toReferralCodeValue(u.kode_referral))
            .filter(Boolean)
    );
    const nextCode = generateReferralCode(currentUser.nama, currentUser.whatsapp || currentUser.phone, existingCodes);

    await GASActions.update('users', currentUser.id, { kode_referral: nextCode });

    currentUser.kode_referral = nextCode;
    return { user: currentUser, code: nextCode };
}

function applyReferralDataToUI(profile) {
    const codeEl = document.getElementById('referral-code-display');
    const inputEl = document.getElementById('referral-input');
    const applyBtn = document.getElementById('apply-referral-btn');
    const countEl = document.getElementById('referral-count');
    const pointsEl = document.getElementById('referral-points-total');

    if (codeEl) codeEl.value = toReferralCodeValue(profile.kode_referral) || '-';
    if (countEl) countEl.textContent = String(parseInt(profile.referral_count || 0, 10) || 0);
    if (pointsEl) pointsEl.textContent = String(parseInt(profile.referral_points_total || 0, 10) || 0);

    const alreadyUsed = toReferralCodeValue(profile.referred_by) !== '';
    if (inputEl) {
        inputEl.value = alreadyUsed ? toReferralCodeValue(profile.referred_by) : '';
        inputEl.disabled = alreadyUsed;
    }
    if (applyBtn) applyBtn.disabled = alreadyUsed;

    if (alreadyUsed) {
        setReferralStatus(`Referral aktif dengan kode: ${toReferralCodeValue(profile.referred_by)}`, 'success');
    } else {
        setReferralStatus('Kode referral hanya bisa dipakai satu kali.', 'info');
    }
}

function getReferralStatusBadge(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'approved') return '<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">Approved</span>';
    if (s === 'rejected' || s === 'void') return '<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">Rejected</span>';
    return '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">Pending</span>';
}

async function loadReferralHistory(user) {
    const listEl = document.getElementById('referral-history-list');
    const badgeEl = document.getElementById('referral-history-badge');
    if (!listEl || !badgeEl) return;

    try {
        const apiUrl = CONFIG.getMainApiUrl();
        const phone = normalizePhoneTo08(user.whatsapp);
        const response = await fetch(`${apiUrl}?sheet=referrals&phone=${encodeURIComponent(phone)}&_t=${Date.now()}`);
        if (!response.ok) throw new Error('Gagal memuat riwayat referral');

        const rows = parseSheetResponse(await response.json());
        const mine = rows
            .filter((r) => {
                const referrer = normalizePhoneTo08(r.referrer_phone || '');
                const referee = normalizePhoneTo08(r.referee_phone || '');
                return referrer === phone || referee === phone;
            })
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .slice(0, 5);

        badgeEl.textContent = `${mine.length} data`;
        if (mine.length === 0) {
            listEl.innerHTML = '<p class="text-gray-400">Belum ada riwayat referral.</p>';
            return;
        }

        listEl.innerHTML = mine.map((r) => {
            const role = normalizePhoneTo08(r.referrer_phone || '') === phone ? 'Anda mengajak' : 'Anda diajak';
            const otherPhone = role === 'Anda mengajak'
                ? normalizePhoneTo08(r.referee_phone || '')
                : normalizePhoneTo08(r.referrer_phone || '');
            const reward = role === 'Anda mengajak'
                ? parseInt(r.reward_referrer_points || 0, 10) || 0
                : parseInt(r.reward_referee_points || 0, 10) || 0;

            return `
                <div class="border border-gray-200 rounded-lg p-2 bg-gray-50">
                    <div class="flex items-center justify-between mb-1">
                        <span class="font-bold text-gray-700">${escapeHtml(role)}</span>
                        ${getReferralStatusBadge(r.status)}
                    </div>
                    <p class="text-gray-600">No: ${escapeHtml(otherPhone || '-')}</p>
                    <p class="text-green-700 font-semibold">Reward: ${escapeHtml(String(reward))} poin</p>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading referral history:', error);
        badgeEl.textContent = 'error';
        listEl.innerHTML = '<p class="text-red-500">Gagal memuat riwayat referral.</p>';
    }
}

async function loadReferralData(user) {
    try {
        const users = await fetchUsersList();
        const ensured = await ensureUserReferralCode(user, users);
        referralProfileCache = ensured.user;
        applyReferralDataToUI(ensured.user);
        if (ensured.missingProfile) {
            setReferralStatus('Profil referral belum sinkron. Silakan hubungi admin.', 'warning');
            return;
        }
        await loadReferralHistory(user);
    } catch (error) {
        console.error('Error loading referral data:', error);
        setReferralStatus('Gagal memuat data referral. Coba refresh halaman.', 'error');
    }
}

// Check if user is already logged in
document.addEventListener('DOMContentLoaded', () => {
    const loggedInUser = getLoggedInUser();

    const referralInput = document.getElementById('referral-input');
    if (referralInput) {
        referralInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                applyReferralCode();
            }
        });
    }
    
    if (loggedInUser) {
        // User already logged in, show dashboard
        showDashboard(loggedInUser);
    } else {
        // Show login form
        showLogin();
    }
});

/**
 * Show login section
 */
function showLogin() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('forgot-pin-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
}

/**
 * Show dashboard section
 */
function showDashboard(user) {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('forgot-pin-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
    
    // Display user info
    document.getElementById('user-name').textContent = user.nama;
    document.getElementById('user-whatsapp').textContent = displayPhone(user.whatsapp);
    
    // Load loyalty points from user_points sheet
    loadLoyaltyPoints(user);

    // Load referral section
    loadReferralData(user);
    
    // Load order history
    loadOrderHistory(user);
}

/**
 * Handle login form submission
 */
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const whatsapp = document.getElementById('login-whatsapp').value.trim();
    const pin = document.getElementById('login-pin').value.trim();
    const loginBtn = document.getElementById('login-btn');
    const errorDiv = document.getElementById('login-error');
    const errorText = document.getElementById('login-error-text');
    
    // Validate input
    if (!whatsapp || !pin) {
        showError('Mohon lengkapi semua field');
        return;
    }
    
    const normalizedPhone = normalizePhoneTo08(whatsapp);
    if (!normalizedPhone) {
        showError('Gunakan format 08xxxxxxxxxx');
        return;
    }
    if (normalizedPhone.length < 10 || normalizedPhone.length > 13) {
        showError('Panjang nomor tidak valid');
        return;
    }
    
    if (pin.length !== 6) {
        showError('PIN harus 6 digit');
        return;
    }
    
    // Show loading state
    loginBtn.disabled = true;
    loginBtn.innerHTML = `
        <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Memproses...</span>
    `;
    errorDiv.classList.add('hidden');
    
    try {
        const apiUrl = CONFIG.getMainApiUrl();
        const cacheBuster = '&_t=' + Date.now();
        const variants = phoneLookupVariants(normalizedPhone);
        let foundUser = null;
        
        // Fetch all users and filter locally
        const resp = await fetch(`${apiUrl}?sheet=users${cacheBuster}`);
        if (!resp.ok) {
            showError('Gagal menghubungi server. Silakan coba lagi.');
            resetLoginButton();
            return;
        }
        const data = await resp.json();
        if (isUnauthorizedApiResponse(data)) {
            showError('Layanan login membutuhkan otorisasi API. Hubungi admin.');
            resetLoginButton();
            return;
        }
        const users = parseSheetResponse(data);
        
        // Filter by normalized phone variants
        for (const variant of variants) {
            const candidate = users.find(u => normalizePhoneTo08(u.whatsapp || u.phone || '') === normalizePhoneTo08(variant));
            if (candidate) {
                foundUser = candidate;
                break;
            }
        }
        
        if (!foundUser) {
            showError('Nomor WhatsApp tidak terdaftar');
            resetLoginButton();
            return;
        }
        
        // Validate PIN
        if ((foundUser.pin || '').toString() !== pin) {
            showError('PIN salah. Silakan coba lagi.');
            resetLoginButton();
            return;
        }
        
        // Check if account is active
        if (foundUser.status && foundUser.status.toLowerCase() !== 'aktif') {
            showError('Akun Anda tidak aktif. Hubungi admin.');
            resetLoginButton();
            return;
        }
        
        // Login successful
        foundUser.whatsapp = normalizePhoneTo08(foundUser.whatsapp || foundUser.phone || normalizedPhone);
        saveLoggedInUser(foundUser);
        showDashboard(foundUser);
        document.getElementById('dashboard-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        
    } catch (error) {
        console.error('Login error:', error);
        showError('Terjadi kesalahan. Silakan coba lagi.');
        resetLoginButton();
    }
});

/**
 * Show error message
 */
function showError(message) {
    const errorDiv = document.getElementById('login-error');
    const errorText = document.getElementById('login-error-text');
    
    errorText.textContent = message;
    errorDiv.classList.remove('hidden');
}

/**
 * Reset login button to default state
 */
function resetLoginButton() {
    const loginBtn = document.getElementById('login-btn');
    loginBtn.disabled = false;
    loginBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path>
        </svg>
        Masuk
    `;
}

/**
 * Save logged in user to localStorage
 */
function saveLoggedInUser(user) {
    const normalizedPhone = normalizePhoneTo08(user.whatsapp || user.phone || '');
    localStorage.setItem('gosembako_user', JSON.stringify({
        id: user.id,
        nama: user.nama,
        whatsapp: normalizedPhone || user.whatsapp,
        tanggal_daftar: user.tanggal_daftar
    }));
}

/**
 * Get logged in user from localStorage
 */
function getLoggedInUser() {
    const userJson = localStorage.getItem('gosembako_user');
    if (!userJson) return null;
    const user = JSON.parse(userJson);
    user.whatsapp = normalizePhoneTo08(user.whatsapp || user.phone || '') || user.whatsapp;
    return user;
}

/**
 * Logout user
 */
function logout() {
    if (confirm('Apakah Anda yakin ingin keluar?')) {
        localStorage.removeItem('gosembako_user');
        window.location.reload();
    }
}

async function copyReferralCode() {
    const codeEl = document.getElementById('referral-code-display');
    const code = toReferralCodeValue(codeEl ? codeEl.value : '');
    if (!code || code === '-') {
        setReferralStatus('Kode referral belum tersedia.', 'warning');
        return;
    }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(code);
        } else {
            const temp = document.createElement('textarea');
            temp.value = code;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
        }
        setReferralStatus('Kode referral berhasil disalin.', 'success');
    } catch (error) {
        console.error('Copy referral failed:', error);
        setReferralStatus('Gagal menyalin kode referral.', 'error');
    }
}

async function applyReferralCode() {
    const user = getLoggedInUser();
    if (!user) {
        setReferralStatus('Silakan login ulang.', 'error');
        return;
    }

    const inputEl = document.getElementById('referral-input');
    const applyBtn = document.getElementById('apply-referral-btn');
    const code = toReferralCodeValue(inputEl ? inputEl.value : '');
    if (!code) {
        setReferralStatus('Masukkan kode referral terlebih dahulu.', 'warning');
        return;
    }

    const ownCode = toReferralCodeValue(document.getElementById('referral-code-display')?.value);
    if (ownCode && code === ownCode) {
        setReferralStatus('Kode referral sendiri tidak bisa dipakai.', 'error');
        return;
    }

    if (inputEl && inputEl.disabled) {
        setReferralStatus('Kode referral sudah pernah diterapkan.', 'warning');
        return;
    }

    const originalText = applyBtn ? applyBtn.textContent : '';
    try {
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.textContent = 'Memproses...';
        }

        const result = await GASActions.post({
            action: 'attach_referral',
            sheet: 'users',
            data: {
                referee_phone: normalizePhoneTo08(user.whatsapp),
                ref_code: code
            }
        });

        if (!result || result.success === false) {
            const message = (result && (result.message || result.error || result.error_code)) || 'Gagal menerapkan referral';
            setReferralStatus(message, 'error');
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.textContent = originalText || 'Terapkan';
            }
            return;
        }

        if (inputEl) {
            inputEl.value = code;
            inputEl.disabled = true;
        }
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.textContent = 'Terapkan';
        }
        setReferralStatus('Kode referral berhasil diterapkan.', 'success');
        await loadReferralData(user);
    } catch (error) {
        console.error('applyReferralCode error:', error);
        setReferralStatus(error.message || 'Gagal menerapkan kode referral.', 'error');
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.textContent = originalText || 'Terapkan';
        }
    }
}

/**
 * Load loyalty points from user_points sheet
 */
async function loadLoyaltyPoints(user) {
    try {
        const apiUrl = CONFIG.getMainApiUrl();
        const normalizedPhone = normalizePhoneTo08(user.whatsapp);
        const fallbackPoints = parseInt(user.total_points || user.points || user.poin || 0, 10) || 0;
        
        if (!normalizedPhone) {
            console.warn('⚠️ Invalid phone number for loyalty points lookup');
            document.getElementById('loyalty-points').textContent = String(fallbackPoints);
            setRewardContextFromAkun(user.whatsapp, fallbackPoints, user.nama);
            return;
        }
        
        console.log(`🔍 Loading loyalty points for phone: ${normalizedPhone}`);
        
        // Fetch all user_points records
        const response = await fetch(`${apiUrl}?sheet=user_points`);
        
        if (!response.ok) {
            console.error('❌ Failed to fetch loyalty points');
            document.getElementById('loyalty-points').textContent = '0';
            return;
        }
        
        const pointsData = await response.json();
        console.log('📥 Points data received:', pointsData);

        if (pointsData && typeof pointsData === 'object' && String(pointsData.error || '').toLowerCase() === 'unauthorized') {
            console.warn('⚠️ Unauthorized access to user_points. Falling back to user profile points.');
            document.getElementById('loyalty-points').textContent = String(fallbackPoints);
            setRewardContextFromAkun(user.whatsapp, fallbackPoints, user.nama);
            return;
        }
        
        // Parse response (handle both array and object with result property)
        let allPoints = Array.isArray(pointsData) ? pointsData : (pointsData.result || []);
        
        if (!Array.isArray(allPoints)) {
            console.warn('⚠️ Unexpected points data format');
            document.getElementById('loyalty-points').textContent = '0';
            return;
        }
        
        // Find user by phone with multiple variants
        const variants = phoneLookupVariants(normalizedPhone);
        let userPoints = null;
        
        for (const variant of variants) {
            userPoints = allPoints.find(record => {
                const recordPhone = normalizePhoneTo08(record.phone || record.whatsapp || '');
                return recordPhone === normalizePhoneTo08(variant);
            });
            if (userPoints) {
                console.log(`✅ Found points record for ${variant}:`, userPoints);
                break;
            }
        }
        
        // Update display
        if (userPoints) {
            const points = parseInt(userPoints.points || userPoints.poin || 0);
            console.log(`✅ User points: ${points}`);
            document.getElementById('loyalty-points').textContent = points;
            
            // Auto-set reward context for seamless redemption
            setRewardContextFromAkun(user.whatsapp, points, user.nama);
        } else {
            console.log('⚠️ No points record found for user');
            document.getElementById('loyalty-points').textContent = String(fallbackPoints);
            
            // Set context with fallback points from profile
            setRewardContextFromAkun(user.whatsapp, fallbackPoints, user.nama);
        }
        
    } catch (error) {
        console.error('❌ Error loading loyalty points:', error);
        const fallbackPoints = parseInt(user.total_points || user.points || user.poin || 0, 10) || 0;
        document.getElementById('loyalty-points').textContent = String(fallbackPoints);
        setRewardContextFromAkun(user.whatsapp, fallbackPoints, user.nama);
    }
}

/**
 * Load order history for user
 */
async function loadOrderHistory(user) {
    const loadingDiv = document.getElementById('order-loading');
    const emptyDiv = document.getElementById('order-empty');
    const orderList = document.getElementById('order-list');
    const totalAcceptedEl = document.getElementById('total-accepted-spend');
    
    // Show loading
    loadingDiv.classList.remove('hidden');
    emptyDiv.classList.add('hidden');
    orderList.innerHTML = '';
    if (totalAcceptedEl) totalAcceptedEl.textContent = 'Rp 0';
    
    try {
        const apiUrl = CONFIG.getMainApiUrl();
        
        // Fetch all orders and filter by phone on client-side
        let response = await fetch(`${apiUrl}?sheet=orders`);
        
        if (!response.ok) {
            throw new Error('Gagal memuat riwayat pesanan');
        }
        
        let allOrders = await response.json();
        let orders = Array.isArray(allOrders) ? allOrders.filter(o => normalizePhoneTo08(o.phone) === normalizePhoneTo08(user.whatsapp)) : [];
        
        // Hide loading
        loadingDiv.classList.add('hidden');
        
        // Check if orders exist
        if (!orders || orders.length === 0) {
            emptyDiv.classList.remove('hidden');
            return;
        }
        
        // Filter orders to ensure only user's orders (double check phone match)
        orders = orders.filter(order => {
            const orderPhone = normalizePhoneTo08(order.phone || order.whatsapp || '');
            const userPhone = normalizePhoneTo08(user.whatsapp);
            return orderPhone === userPhone;
        });
        
        // Check again after filtering
        if (orders.length === 0) {
            emptyDiv.classList.remove('hidden');
            return;
        }
        
        // Sort orders by date (newest first)
        orders.sort((a, b) => {
            const dateA = new Date(a.tanggal_pesanan || a.timestamp || 0);
            const dateB = new Date(b.tanggal_pesanan || b.timestamp || 0);
            return dateB - dateA;
        });
        
        // Store all orders for pagination
        window.allOrders = orders;
        window.currentPage = 1;
        window.ordersPerPage = 10;

        // Update total accepted spend
        if (totalAcceptedEl) {
            const acceptedStatuses = new Set(['terima', 'diterima', 'selesai']);
            const totalAccepted = orders.reduce((sum, order) => {
                const status = String(order.status || '').toLowerCase().trim();
                if (!acceptedStatuses.has(status)) return sum;
                return sum + parseCurrencyValue(order.total || order.total_bayar || 0);
            }, 0);
            totalAcceptedEl.textContent = formatCurrency(totalAccepted);
        }
        
        // Display first page
        displayOrderPage(1);
        
    } catch (error) {
        console.error('Error loading order history:', error);
        loadingDiv.classList.add('hidden');
        orderList.innerHTML = `
            <div class="text-center py-8 text-red-600">
                <svg class="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-sm">Gagal memuat riwayat pesanan</p>
                <button onclick="location.reload()" class="mt-3 text-green-600 hover:underline text-sm font-bold">Coba Lagi</button>
            </div>
        `;
    }
}

function parseCurrencyValue(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Display orders for specific page
 */
function displayOrderPage(page) {
    const orderList = document.getElementById('order-list');
    const paginationDiv = document.getElementById('order-pagination');
    
    if (!window.allOrders || window.allOrders.length === 0) return;
    
    const totalOrders = window.allOrders.length;
    const totalPages = Math.ceil(totalOrders / window.ordersPerPage);
    const startIndex = (page - 1) * window.ordersPerPage;
    const endIndex = Math.min(startIndex + window.ordersPerPage, totalOrders);
    
    // Clear order list
    orderList.innerHTML = '';
    
    // Display orders for current page
    for (let i = startIndex; i < endIndex; i++) {
        const orderCard = createOrderCard(window.allOrders[i]);
        orderList.appendChild(orderCard);
    }
    
    // Update pagination
    if (totalPages > 1) {
        paginationDiv.classList.remove('hidden');
        paginationDiv.innerHTML = createPagination(page, totalPages);
    } else {
        paginationDiv.classList.add('hidden');
    }
    
    window.currentPage = page;
}

/**
 * Create pagination HTML
 */
function createPagination(currentPage, totalPages) {
    let html = '<div class="flex justify-center items-center gap-2 mt-6">';
    
    // Previous button
    if (currentPage > 1) {
        html += `<button onclick="displayOrderPage(${currentPage - 1})" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold text-sm">← Prev</button>`;
    }
    
    // Page numbers
    html += '<div class="flex gap-1">';
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            html += `<button class="px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-sm">${i}</button>`;
        } else if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button onclick="displayOrderPage(${i})" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-bold text-sm">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += '<span class="px-2 py-2 text-gray-500">...</span>';
        }
    }
    html += '</div>';
    
    // Next button
    if (currentPage < totalPages) {
        html += `<button onclick="displayOrderPage(${currentPage + 1})" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold text-sm">Next →</button>`;
    }
    
    html += '</div>';
    return html;
}

/**
 * Create order card element
 */
function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'border border-gray-200 rounded-xl p-3 hover:border-green-300 transition cursor-pointer';
    
    // Format date
    const orderDate = formatDate(order.tanggal_pesanan || order.timestamp);
      // Format total bayar (use 'total' column from sheet)
    const totalBayar = formatCurrency(order.total || order.total_bayar || 0);  
    // Get status badge
    const status = order.status || 'Menunggu';
    const statusBadge = getStatusBadge(status);
    
    // Get product name and truncate for mobile
    const productName = order.produk || order.items || order.product_name || 'N/A';
    const truncatedProduct = truncateText(productName, 20);
    
    // Get Order ID from 'id' column
    const orderId = order.id || 'N/A';
    
    card.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div class="flex-1">
                <p class="text-[10px] font-bold text-gray-700 mb-1">Order ID: <span class="text-green-600">${escapeHtml(orderId)}</span></p>
            </div>
            ${statusBadge}
        </div>
        
        <div class="border-t border-gray-100 pt-2 space-y-1.5">
            <div class="text-sm">
                <p class="text-gray-600 text-xs mb-0.5">Produk:</p>
                <p class="font-semibold text-gray-800 lg:hidden">${escapeHtml(truncatedProduct)}</p>
                <p class="font-semibold text-gray-800 hidden lg:block">${escapeHtml(productName)}</p>
            </div>
            <div class="flex justify-between text-xs">
                <span class="text-gray-600">Qty:</span>
                <span class="font-semibold text-gray-800">${order.qty || order.quantity || order.jumlah || 'N/A'}</span>
            </div>
            <div class="flex justify-between text-xs">
                <span class="text-gray-600">Poin:</span>
                <span class="font-semibold text-amber-600">+${order.poin || order.points || 0}</span>
            </div>
            <div class="flex justify-between text-xs">
                <span class="text-gray-600">Total Bayar:</span>
                <span class="font-bold text-green-600">${totalBayar}</span>
            </div>
        </div>
        
        <div class="mt-3 pt-2 border-t border-gray-100">
            <button onclick="window.location.href='index.html'" class="block w-full text-center bg-green-50 hover:bg-green-100 text-green-700 font-bold py-1.5 rounded-lg transition text-xs">
                Belanja Lagi
            </button>
        </div>
    `;
    
    // Add click event to show order detail modal
    card.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') {
            showOrderDetailModal(order);
        }
    });
    
    return card;
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
    // Normalize status from admin (Terima → Diterima, etc.)
    const normalizedStatus = normalizeStatus(status);
    
    const statusMap = {
        'Menunggu': { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Menunggu' },
        'Diproses': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Diproses' },
        'Dikirim': { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Dikirim' },
        'Diterima': { bg: 'bg-green-100', text: 'text-green-700', label: 'Diterima' },
        'Dibatalkan': { bg: 'bg-red-100', text: 'text-red-700', label: 'Dibatalkan' }
    };
    
    const statusInfo = statusMap[normalizedStatus] || statusMap['Menunggu'];
    
    return `<span class="${statusInfo.bg} ${statusInfo.text} text-xs font-bold px-3 py-1 rounded-full">${statusInfo.label}</span>`;
}

/**
 * Normalize status from admin to user format
 */
function normalizeStatus(status) {
    if (!status) return 'Menunggu';
    
    // Convert to lowercase for comparison
    const statusLower = status.toLowerCase().trim();
    
    // Map admin status to user status
    const statusMapping = {
        'menunggu': 'Menunggu',
        'pending': 'Menunggu',
        'diproses': 'Diproses',
        'proses': 'Diproses',
        'processing': 'Diproses',
        'dikirim': 'Dikirim',
        'kirim': 'Dikirim',
        'shipped': 'Dikirim',
        'diterima': 'Diterima',
        'terima': 'Diterima',  // Admin uses 'Terima'
        'selesai': 'Diterima',
        'completed': 'Diterima',
        'dibatalkan': 'Dibatalkan',
        'batal': 'Dibatalkan',
        'cancelled': 'Dibatalkan',
        'canceled': 'Dibatalkan'
    };
    
    return statusMapping[statusLower] || status;
}

/**
 * Format date to Indonesian format
 * Handles Google Sheets format: 21/1/2026, 09.26.20
 * Returns only date without time: 21 Januari 2026
 */
function formatDate(dateString) {
    if (!dateString || dateString === 'N/A' || dateString === '') {
        return 'N/A';
    }
    
    let date;
    
    // Handle various date formats
    if (typeof dateString === 'number') {
        // Unix timestamp (milliseconds)
        date = new Date(dateString);
    } else if (typeof dateString === 'string') {
        // Remove time part if exists (after comma)
        // Format: "21/1/2026, 09.26.20" → "21/1/2026"
        let dateOnly = dateString.split(',')[0].trim();
        
        // Try ISO format first (2026-01-22 or 2026-01-22T14:30:00)
        date = new Date(dateString);
        
        // If invalid, try DD/MM/YYYY format
        if (isNaN(date.getTime()) && dateOnly.includes('/')) {
            const parts = dateOnly.split('/');
            if (parts.length === 3) {
                const day = parseInt(parts[0]);
                const month = parseInt(parts[1]);
                const year = parseInt(parts[2]);
                
                // Create date (month is 0-indexed in JS)
                if (day <= 31 && month <= 12 && year > 1900) {
                    date = new Date(year, month - 1, day);
                }
            }
        }
    } else {
        date = new Date(dateString);
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
        return 'N/A';
    }
    
    // Format to Indonesian (date only, no time)
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric'
    };
    
    return date.toLocaleDateString('id-ID', options);
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text, maxLength) {
    if (!text) return 'N/A';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Format currency to Indonesian Rupiah
 */
function formatCurrency(amount) {
    const number = parseInt(amount) || 0;
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(number);
}

/**
 * Show register info (placeholder)
 */
function showRegisterInfo() {
    alert('Untuk mendaftar, silakan hubungi admin GoSembako melalui WhatsApp.\n\nAnda akan diberikan akun dengan nomor WhatsApp dan PIN untuk login.');
}


/**
 * ========================================
 * NEW FEATURES: Registration, Forgot PIN, Edit Profile, Tracking, Loyalty
 * ========================================
 */

/**
 * Show registration form
 */
function showRegister() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.remove('hidden');
    document.getElementById('forgot-pin-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
}

/**
 * Show forgot PIN form
 */
function showForgotPIN() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('forgot-pin-section').classList.remove('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
}

/**
 * Handle registration form submission
 */
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('register-name').value.trim();
    const whatsapp = document.getElementById('register-whatsapp').value.trim();
    const pin = document.getElementById('register-pin').value.trim();
    const pinConfirm = document.getElementById('register-pin-confirm').value.trim();
    const referralCode = toReferralCodeValue(document.getElementById('register-referral-code')?.value || '');
    
    const errorDiv = document.getElementById('register-error');
    const errorText = document.getElementById('register-error-text');
    const successDiv = document.getElementById('register-success');
    const registerBtn = document.getElementById('register-btn');
    
    // Hide messages
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    
    // Validate name (same as login validation)
    const nameWithoutSpaces = name.replace(/\s/g, '');
    if (nameWithoutSpaces.length < 4) {
        errorText.textContent = 'Masukkan Nama Lengkap';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // Check name patterns
    const nameLower = nameWithoutSpaces.toLowerCase();
    const invalidNamePatterns = [
        /^(.)\1{3,}$/,
        /^(.{2})\1{2,}$/,
        /^(.{3})\1{2,}$/,
        /^([a-z])([a-z])\1\2{2,}$/,
    ];
    
    for (const pattern of invalidNamePatterns) {
        if (pattern.test(nameLower)) {
            errorText.textContent = 'Masukkan Nama Lengkap';
            errorDiv.classList.remove('hidden');
            return;
        }
    }
    
    // Validate WhatsApp
    const normalizedPhone = normalizePhoneTo08(whatsapp);
    if (!normalizedPhone) {
        errorText.textContent = 'Gunakan format 08xxxxxxxxxx';
        errorDiv.classList.remove('hidden');
        return;
    }
    const cleanPhone = normalizedPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 13) {
        errorText.textContent = 'Nomor WhatsApp tidak valid';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // Check phone patterns
    const invalidPhonePatterns = [
        /^(\d)\1{9,}$/,
        /^08(\d)\1{8,}$/,
        /^(\d{2})\1{4,}$/,
        /^(\d{3})\1{3,}$/
    ];
    
    for (const pattern of invalidPhonePatterns) {
        if (pattern.test(cleanPhone)) {
            errorText.textContent = 'Nomor WhatsApp tidak valid';
            errorDiv.classList.remove('hidden');
            return;
        }
    }
    
    // Validate PIN
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
        errorText.textContent = 'PIN harus 6 digit angka';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if (pin !== pinConfirm) {
        errorText.textContent = 'PIN tidak cocok';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // Show loading
    registerBtn.disabled = true;
    registerBtn.innerHTML = '<svg class="animate-spin h-5 w-5 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
    
    try {
        const apiUrl = CONFIG.getMainApiUrl();
        
        // Check if WhatsApp already registered (try multiple formats)
        const phonesToCheck = phoneLookupVariants(normalizedPhone);
        let existingUsers = [];
        const cacheBuster = '&_t=' + Date.now();
        
        console.log('🔍 Checking phone formats:', phonesToCheck);
        
        try {
            const checkResponse = await fetch(`${apiUrl}?sheet=users${cacheBuster}`);
            if (!checkResponse.ok) {
                console.warn(`API error: ${checkResponse.status}`);
            } else {
                const data = await checkResponse.json();
                const allUsers = parseSheetResponse(data);
                existingUsers = allUsers.filter(u => {
                    const userPhone = normalizePhoneTo08(u.whatsapp || u.phone || '');
                    return phonesToCheck.some(p => normalizePhoneTo08(p) === userPhone);
                });
                if (existingUsers && existingUsers.length > 0) {
                    console.log(`📊 Found existing user:`, existingUsers);
                }
            }
        } catch (err) {
            console.warn(`Check failed:`, err.message);
        }
        
        console.log('📊 Final check result for', whatsapp, ':', existingUsers);
        
        if (existingUsers && existingUsers.length > 0) {
            errorText.textContent = 'Nomor WhatsApp sudah terdaftar';
            errorDiv.classList.remove('hidden');
            registerBtn.disabled = false;
            registerBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg> Daftar';
            return;
        }
        
        // Generate user ID
        const userId = `USR-${Date.now().toString().slice(-6)}`;
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toLocaleString('id-ID', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        

        
        // Create new user
        const createResult = await GASActions.create('users', {
            id: userId,
            nama: name,
            whatsapp: normalizedPhone,
            pin: pin,
            tanggal_daftar: today,
            status: 'aktif',
            total_points: 0,
            created_at: now,
            referred_by: '',
            referred_by_phone: '',
            referral_count: 0,
            referral_points_total: 0,
            kode_referral: ''
        });
        
        if (!createResult.created || createResult.created < 1) {
            throw new Error('Gagal mendaftar');
        }
        
        let referralNotice = '';
        if (referralCode) {
            try {
                const referralResult = await GASActions.post({
                    action: 'attach_referral',
                    sheet: 'users',
                    data: {
                        referee_phone: normalizedPhone,
                        ref_code: referralCode
                    }
                });
                if (referralResult && referralResult.success) {
                    referralNotice = ' Kode referral berhasil diterapkan.';
                } else {
                    referralNotice = ' Akun dibuat, namun kode referral tidak valid.';
                }
            } catch (refErr) {
                console.warn('Referral attach failed after registration:', refErr);
                referralNotice = ' Akun dibuat, namun kode referral gagal diproses.';
            }
        }

        // Show success
        successDiv.classList.remove('hidden');
        const successText = successDiv.querySelector('span');
        if (successText) {
            successText.textContent = 'Pendaftaran berhasil! Silakan login.' + referralNotice;
        }
        
        // Reset form
        document.getElementById('register-form').reset();
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
            showLogin();
        }, 2000);
        
    } catch (error) {
        console.error('Registration error:', error);
        errorText.textContent = 'Terjadi kesalahan. Silakan coba lagi.';
        errorDiv.classList.remove('hidden');
    } finally {
        registerBtn.disabled = false;
        registerBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg> Daftar';
    }
});

/**
 * Handle forgot PIN form submission
 */
document.getElementById('forgot-pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const whatsapp = document.getElementById('forgot-whatsapp').value.trim();
    const errorDiv = document.getElementById('forgot-error');
    const errorText = document.getElementById('forgot-error-text');
    const forgotBtn = document.getElementById('forgot-btn');
    
    const normalizedPhone = normalizePhoneTo08(whatsapp);
    if (!normalizedPhone) {
        errorDiv.classList.remove('hidden');
        errorText.textContent = 'Gunakan format 08xxxxxxxxxx';
        return;
    }
    errorDiv.classList.add('hidden');
    
    // Show loading
    forgotBtn.disabled = true;
    forgotBtn.innerHTML = '<svg class="animate-spin h-5 w-5 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
    
    try {
        const apiUrl = CONFIG.getMainApiUrl();
        const response = await fetch(`${apiUrl}?sheet=users`);
        const allUsers = parseSheetResponse(await response.json());
        const users = allUsers.filter(u => normalizePhoneTo08(u.whatsapp || u.phone || '') === normalizedPhone);
        
        if (!users || users.length === 0) {
            errorText.textContent = 'Nomor WhatsApp tidak terdaftar';
            errorDiv.classList.remove('hidden');
            forgotBtn.disabled = false;
            forgotBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg> Kirim Kode Verifikasi';
            return;
        }
        
        // Simulate sending verification code
        alert(`Kode verifikasi telah dikirim ke WhatsApp ${normalizedPhone}.\n\nUntuk sementara, hubungi admin untuk reset PIN.`);
        
        // Redirect to WhatsApp admin
        const waLinkPhone = normalizedPhone.replace(/^0/, '62');
        window.open(`https://wa.me/628993370200?text=Halo, saya ingin reset PIN akun saya. Nomor WhatsApp: ${waLinkPhone}`, '_blank');
        
        // Back to login
        setTimeout(() => {
            showLogin();
        }, 1000);
        
    } catch (error) {
        console.error('Forgot PIN error:', error);
        errorText.textContent = 'Terjadi kesalahan. Silakan coba lagi.';
        errorDiv.classList.remove('hidden');
    } finally {
        forgotBtn.disabled = false;
        forgotBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg> Kirim Kode Verifikasi';
    }
});

/**
 * Open edit profile modal
 */
function openEditProfile() {
    const user = getLoggedInUser();
    if (!user) return;
    
    // Populate form
    document.getElementById('edit-name').value = user.nama;
    
    // Clear PIN fields
    document.getElementById('edit-old-pin').value = '';
    document.getElementById('edit-new-pin').value = '';
    document.getElementById('edit-confirm-pin').value = '';
    
    // Hide error
    document.getElementById('edit-error').classList.add('hidden');
    
    // Show modal
    document.getElementById('edit-profile-modal').classList.remove('hidden');
}

/**
 * Close edit profile modal
 */
function closeEditProfile() {
    document.getElementById('edit-profile-modal').classList.add('hidden');
}

/**
 * Handle edit profile form submission
 */
document.getElementById('edit-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const user = getLoggedInUser();
    if (!user) return;
    
    const name = document.getElementById('edit-name').value.trim();
    const oldPin = document.getElementById('edit-old-pin').value.trim();
    const newPin = document.getElementById('edit-new-pin').value.trim();
    const confirmPin = document.getElementById('edit-confirm-pin').value.trim();
    
    const errorDiv = document.getElementById('edit-error');
    const errorText = document.getElementById('edit-error-text');
    const saveBtn = document.getElementById('edit-save-btn');
    
    errorDiv.classList.add('hidden');
    
    // Validate name
    const nameWithoutSpaces = name.replace(/\s/g, '');
    if (nameWithoutSpaces.length < 4) {
        errorText.textContent = 'Masukkan Nama Lengkap';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // If changing PIN, validate
    if (oldPin || newPin || confirmPin) {
        if (!oldPin || !newPin || !confirmPin) {
            errorText.textContent = 'Lengkapi semua field PIN';
            errorDiv.classList.remove('hidden');
            return;
        }
        
        if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
            errorText.textContent = 'PIN baru harus 6 digit angka';
            errorDiv.classList.remove('hidden');
            return;
        }
        
        if (newPin !== confirmPin) {
            errorText.textContent = 'PIN baru tidak cocok';
            errorDiv.classList.remove('hidden');
            return;
        }
    }
    
    // Show loading
    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan...';
    
    try {
        const apiUrl = CONFIG.getMainApiUrl();
        
        // Fetch current user data to verify old PIN
        const response = await fetch(`${apiUrl}?sheet=users&id=${user.id}`);
        const users = await response.json();
        
        if (!users || users.length === 0) {
            throw new Error('User not found');
        }
        
        const currentUser = users[0];
        
        // If changing PIN, verify old PIN
        if (oldPin) {
            if (currentUser.pin !== oldPin) {
                errorText.textContent = 'PIN lama salah';
                errorDiv.classList.remove('hidden');
                saveBtn.disabled = false;
                saveBtn.textContent = 'Simpan';
                return;
            }
        }
        
        // Update user data
        const updateData = {
            nama: name
        };
        
        if (newPin) {
            updateData.pin = newPin;
        }
        
        const updateResult = await GASActions.update('users', user.id, updateData);
        
        if (!updateResult.affected || updateResult.affected < 1) {
            throw new Error('Failed to update');
        }
        
        // Update localStorage
        user.nama = name;
        saveLoggedInUser(user);
        
        // Update display
        document.getElementById('user-name').textContent = name;
        
        // Close modal
        closeEditProfile();
        
        alert('Profil berhasil diperbarui!');
        
    } catch (error) {
        console.error('Edit profile error:', error);
        errorText.textContent = 'Terjadi kesalahan. Silakan coba lagi.';
        errorDiv.classList.remove('hidden');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Simpan';
    }
});

/**
 * Show order detail modal with animated timeline
 */
function showOrderDetailModal(order) {
    // Update order info
    document.getElementById('tracking-order-id').textContent = order.id || 'N/A';
    
    // Get date from sheet (priority: tanggal column)
    const dateValue = order.tanggal || order.tanggal_pesanan || order.timestamp || order.date || order.created_at;
    document.getElementById('tracking-order-date').textContent = formatDate(dateValue);
    
    // Update status badge (normalize first)
    const status = normalizeStatus(order.status || 'Menunggu');
    const statusBadge = getStatusBadge(status);
    const statusBadgeElement = document.getElementById('tracking-status-badge');
    if (statusBadgeElement) {
        statusBadgeElement.innerHTML = statusBadge;
    }
    
    // Update order details (use 'total' column from sheet)
    document.getElementById('tracking-products').textContent = order.produk || order.items || order.product_name || 'N/A';
    document.getElementById('tracking-total').textContent = formatCurrency(order.total || order.total_bayar || 0);
    
    // Create animated timeline
    const timeline = createAnimatedTimeline(status);
    document.getElementById('tracking-timeline').innerHTML = timeline;
    
    // Show modal
    document.getElementById('order-tracking-modal').classList.remove('hidden');
}

/**
 * Create animated status timeline (horizontal layout)
 */
function createAnimatedTimeline(currentStatus) {
    const statuses = [
        { name: 'Menunggu', gif: 'wait.gif', key: 'Menunggu' },
        { name: 'Diproses', gif: 'grocery-basket.gif', key: 'Diproses' },
        { name: 'Dikirim', gif: 'grocery.gif', key: 'Dikirim' },
        { name: 'Diterima', gif: 'shipping.gif', key: 'Diterima' }
    ];
    
    // Find current status index
    let currentIndex = statuses.findIndex(s => s.key === currentStatus);
    
    // Handle Dibatalkan status separately
    if (currentStatus === 'Dibatalkan') {
        return `
            <div class="flex items-center justify-center gap-3 py-4">
                <div class="bg-red-500 w-12 h-12 rounded-full flex items-center justify-center animate-pulse">
                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </div>
                <div>
                    <p class="font-bold text-red-600">Dibatalkan</p>
                    <p class="text-xs text-gray-500">Pesanan telah dibatalkan</p>
                </div>
            </div>
        `;
    }
    
    // If status not found, default to first status
    if (currentIndex === -1) currentIndex = 0;
    
    // Create horizontal timeline
    return `
        <div class="flex items-center justify-between gap-2 py-2">
            ${statuses.map((s, index) => {
                const isActive = index <= currentIndex;
                const isCurrent = index === currentIndex;
                const isLast = index === statuses.length - 1;
                const gifPath = `./assets/images/${s.gif}`;
                const safeImage = sanitizeUrl(gifPath, './assets/images/wait.gif');
                
                return `
                    <div class="flex flex-col items-center flex-1">
                        <div class="${isActive ? 'bg-green-50' : 'bg-gray-100'} w-12 h-12 rounded-full flex items-center justify-center ${isCurrent ? 'ring-2 ring-green-500 ring-offset-2' : ''}">
                            <img src="${safeImage}" alt="${s.name}" class="w-8 h-8 object-contain ${isActive ? '' : 'opacity-40'}" data-fallback-src="${gifPath}">
                        </div>
                        <p class="text-[10px] font-semibold mt-2 text-center ${isActive ? 'text-gray-800' : 'text-gray-400'}">${s.name}</p>
                        ${isCurrent ? '<p class="text-[8px] text-green-600 font-bold mt-0.5">● Saat ini</p>' : '<p class="text-[8px] text-transparent mt-0.5">●</p>'}
                    </div>
                    ${!isLast ? `
                        <div class="flex-shrink-0 w-8 h-0.5 ${isActive && index < currentIndex ? 'bg-green-500' : 'bg-gray-300'} transition-all duration-500 mb-6"></div>
                    ` : ''}
                `;
            }).join('')}
        </div>
    `;
}

/**
 * Close order tracking modal
 */
function closeOrderTracking() {
    document.getElementById('order-tracking-modal').classList.add('hidden');
}

/**
 * Open reward modal (using existing modal from homepage)
 */
/**
 * Update order card to add tracking button
 */
const originalCreateOrderCard = createOrderCard;
createOrderCard = function(order) {
    const card = originalCreateOrderCard(order);
    
    // Add click event to open tracking
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
        showOrderDetailModal(order);
    });
    
    return card;
};

/**
 * Switch between reward tabs
 */
function switchRewardTab(tab) {
    const exchangeTab = document.getElementById('tab-exchange');
    const historyTab = document.getElementById('tab-history');
    const exchangeContent = document.getElementById('exchange-content');
    const historyContent = document.getElementById('history-content');
    
    if (tab === 'exchange') {
        // Activate exchange tab
        exchangeTab.classList.add('text-amber-600', 'border-amber-600');
        exchangeTab.classList.remove('text-gray-400', 'border-transparent');
        historyTab.classList.add('text-gray-400', 'border-transparent');
        historyTab.classList.remove('text-amber-600', 'border-amber-600');
        
        exchangeContent.classList.remove('hidden');
        historyContent.classList.add('hidden');
        
        // Load reward items when switching to exchange tab
        fetchRewardItemsForAkun();
    } else if (tab === 'history') {
        // Activate history tab
        historyTab.classList.add('text-amber-600', 'border-amber-600');
        historyTab.classList.remove('text-gray-400', 'border-transparent');
        exchangeTab.classList.add('text-gray-400', 'border-transparent');
        exchangeTab.classList.remove('text-amber-600', 'border-amber-600');
        
        historyContent.classList.remove('hidden');
        exchangeContent.classList.add('hidden');
        
        // Load claims history when switching to this tab
        loadClaimsHistory();
    }
}

/**
 * Load claims history from the claims sheet
 */
async function loadClaimsHistory() {
    const user = getLoggedInUser();
    if (!user) return;
    
    const loadingDiv = document.getElementById('claims-loading');
    const emptyDiv = document.getElementById('claims-empty');
    const claimsList = document.getElementById('claims-list');
    
    // Show loading
    loadingDiv.classList.remove('hidden');
    emptyDiv.classList.add('hidden');
    claimsList.innerHTML = '';
    
    try {
        const apiUrl = CONFIG.getMainApiUrl();
        
        // Fetch claims by phone from claims sheet
        const variants = phoneLookupVariants(user.whatsapp);
        const phoneQuery = variants.map(v => `phone=${encodeURIComponent(v)}`).join('&');
        const response = await fetch(`${apiUrl}?sheet=claims&${phoneQuery}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch claims');
        }
        
        const claimsData = parseSheetResponse(await response.json());
        
        // Hide loading
        loadingDiv.classList.add('hidden');
        
        if (!claimsData || claimsData.length === 0) {
            emptyDiv.classList.remove('hidden');
            return;
        }
        
        // Sort by date (newest first)
        claimsData.sort((a, b) => {
            const dateA = new Date(a.tanggal || a.date || 0);
            const dateB = new Date(b.tanggal || b.date || 0);
            return dateB - dateA;
        });
        
        // Render claims
        claimsData.forEach(claim => {
            const claimCard = createClaimCard(claim);
            claimsList.appendChild(claimCard);
        });
        
    } catch (error) {
        console.error('Error loading claims history:', error);
        loadingDiv.classList.add('hidden');
        emptyDiv.classList.remove('hidden');
    }
}

/**
 * Create a claim card element
 */
function createClaimCard(claim) {
    const card = document.createElement('div');
    card.className = 'border border-gray-200 rounded-xl p-4 hover:shadow-md transition';
    
    // Status colors
    const statusColors = {
        'pending': 'bg-yellow-100 text-yellow-700',
        'approved': 'bg-green-100 text-green-700',
        'completed': 'bg-blue-100 text-blue-700',
        'rejected': 'bg-red-100 text-red-700'
    };
    
    const status = (claim.status || 'pending').toLowerCase();
    const statusColor = statusColors[status] || 'bg-gray-100 text-gray-700';
    
    // Status labels in Indonesian
    const statusLabels = {
        'pending': 'Menunggu',
        'approved': 'Disetujui',
        'completed': 'Selesai',
        'rejected': 'Ditolak'
    };
    
    const statusLabel = statusLabels[status] || claim.status || 'Menunggu';
    
    // Format date
    const date = new Date(claim.tanggal || claim.date);
    const formattedDate = date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    
    card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
            <div class="flex-1">
                <h5 class="font-bold text-gray-800">${escapeHtml(claim.hadiah || claim.reward || 'Reward')}</h5>
                <p class="text-xs text-gray-500 mt-1">${formattedDate}</p>
            </div>
            <span class="${statusColor} text-xs font-bold px-3 py-1 rounded-full">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="flex items-center justify-between pt-3 border-t border-gray-100">
            <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span class="text-sm font-semibold text-gray-700">${claim.poin || 0} Poin</span>
            </div>
            ${claim.id ? `<span class="text-xs text-gray-400">#${escapeHtml(claim.id)}</span>` : ''}
        </div>
    `;
    
    return card;
}

/**
 * Close loyalty modal
 */
function closeLoyaltyModal() {
    document.getElementById('loyalty-modal').classList.add('hidden');
    // Reset to exchange tab
    switchRewardTab('exchange');
}

/**
 * Update openRewardModal to load points and open modal
 */
async function openRewardModal() {
    const user = getLoggedInUser();
    if (!user) return;
    
    // Load and display user's current points
    await loadModalPoints();
    
    // Set reward context from user data
    const pointsEl = document.getElementById('loyalty-modal-points');
    const userPoints = pointsEl ? parseInt(pointsEl.textContent || '0') : 0;
    setRewardContextFromAkun(user.whatsapp, userPoints, user.nama);
    
    // Show modal
    document.getElementById('loyalty-modal').classList.remove('hidden');
    
    // Default to exchange tab
    switchRewardTab('exchange');
    
    // Fetch reward items for the exchange tab
    fetchRewardItemsForAkun();
}

/**
 * Load points for the modal display
 */
async function loadModalPoints() {
    const user = getLoggedInUser();
    if (!user) return;
    const fallbackPoints = parseInt(user.total_points || user.points || user.poin || 0, 10) || 0;
    
    try {
        const apiUrl = CONFIG.getMainApiUrl();
        const response = await fetch(`${apiUrl}?sheet=user_points`);
        
        if (!response.ok) {
            document.getElementById('loyalty-modal-points').textContent = String(fallbackPoints);
            return;
        }
        
        const allPoints = await response.json();
        if (allPoints && typeof allPoints === 'object' && String(allPoints.error || '').toLowerCase() === 'unauthorized') {
            console.warn('⚠️ Unauthorized access to user_points (modal). Falling back to user profile points.');
            document.getElementById('loyalty-modal-points').textContent = String(fallbackPoints);
            return;
        }
        const pointsData = Array.isArray(allPoints) ? allPoints.filter(p => normalizePhoneTo08(p.phone) === normalizePhoneTo08(user.whatsapp)) : [];
        
        if (pointsData && pointsData.length > 0) {
            const userPoints = pointsData[0];
            const points = parseInt(userPoints.points || userPoints.poin || 0);
            document.getElementById('loyalty-modal-points').textContent = points;
        } else {
            document.getElementById('loyalty-modal-points').textContent = String(fallbackPoints);
        }
    } catch (error) {
        console.error('Error loading modal points:', error);
        document.getElementById('loyalty-modal-points').textContent = String(fallbackPoints);
    }
}

var escapeHtml = (window.FrontendSanitize && window.FrontendSanitize.escapeHtml) || ((text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
});
var sanitizeUrl = (window.FrontendSanitize && window.FrontendSanitize.sanitizeUrl) || ((url) => String(url || ''));
var ensureImageFallbackHandler = (window.FrontendSanitize && window.FrontendSanitize.ensureImageFallbackHandler) || (() => {});

ensureImageFallbackHandler();

/**
 * Hide all reward loaders (for akun page modal)
 */
function hideRewardLoaders() {
    const loadingEl = document.getElementById('reward-items-loading');
    const legacyLoadingEl = document.getElementById('rewards-loading');
    
    if (loadingEl) loadingEl.classList.add('hidden');
    if (legacyLoadingEl) legacyLoadingEl.classList.add('hidden');
}

/**
 * Fetch reward items from tukar_poin sheet for akun page
 */
async function fetchRewardItemsForAkun() {
    const loadingEl = document.getElementById('reward-items-loading');
    const emptyEl = document.getElementById('reward-items-empty');
    const listEl = document.getElementById('reward-items-list');
    
    if (!listEl) return;
    
    // Show loading state
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');
    listEl.innerHTML = '';
    
    try {
        const apiUrl = CONFIG.getMainApiUrl();
        const response = await fetch(`${apiUrl}?sheet=tukar_poin`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch reward items');
        }
        
        const data = await response.json();
        const items = parseSheetResponse(data);
        
        // Render items
        renderRewardItemsListAkun(items);
        
    } catch (error) {
        console.error('Error fetching reward items:', error);
        
        // Hide empty state
        if (emptyEl) emptyEl.classList.add('hidden');
        
        // Show error message
        listEl.innerHTML = `
            <div class="text-center py-6 bg-red-50 rounded-2xl border-2 border-dashed border-red-200">
                <p class="text-xs text-red-600 font-semibold">Gagal memuat hadiah. Silakan coba lagi nanti.</p>
            </div>
        `;
    } finally {
        // Always hide loaders in finally block
        hideRewardLoaders();
    }
}

/**
 * Render reward items list for akun page
 */
function renderRewardItemsListAkun(items) {
    const emptyEl = document.getElementById('reward-items-empty');
    const listEl = document.getElementById('reward-items-list');
    
    if (!listEl) return;
    
    // Check if items is empty
    if (!items || items.length === 0) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        listEl.innerHTML = '';
        return;
    }
    
    // Hide empty state
    if (emptyEl) emptyEl.classList.add('hidden');
    
    // Render items with image on left, matching reference style
    listEl.innerHTML = items.map(item => {
        const id = escapeHtml((item.id || '').toString());
        const nama = escapeHtml((item.nama || item.judul || 'Hadiah').toString());
        const poin = parseInt(item.poin || item.Poin || 0);
        const gambar = (item.gambar || 'https://via.placeholder.com/80?text=Reward').toString();
        const safeImage = sanitizeUrl(gambar, 'https://via.placeholder.com/80?text=Reward');
        const deskripsi = escapeHtml((item.deskripsi || '').toString());
        
        return `
            <div class="border-2 border-gray-200 rounded-xl p-4 hover:border-amber-500 transition">
                <div class="flex gap-3 mb-3">
                    <!-- Left: Image -->
                    <div class="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        <img src="${safeImage}" alt="${nama}" class="w-full h-full object-cover" data-fallback-src="https://via.placeholder.com/80?text=Reward">
                    </div>
                    
                    <!-- Middle: Title & Description -->
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-gray-800 text-sm mb-1">${nama}</p>
                        <p class="text-xs text-gray-500 line-clamp-2">${deskripsi}</p>
                    </div>
                    
                    <!-- Right: Badge -->
                    <div class="flex-shrink-0">
                        <span class="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">${poin} Poin</span>
                    </div>
                </div>
                
                <!-- Full-width Button -->
                <button class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 rounded-lg transition text-sm" onclick="handleTukarSekarangAkun('${id}')">
                    Tukar Sekarang
                </button>
            </div>
        `;
    }).join('');
}

/**
 * Set reward context from akun page automatically
 * @param {string} userPhone - User's phone number
 * @param {number} userPoints - User's current points
 * @param {string} userName - User's name
 */
function setRewardContextFromAkun(userPhone, userPoints, userName) {
    if (userPhone) {
        sessionStorage.setItem('reward_phone', userPhone);
        console.log('✅ Reward context set - phone:', userPhone);
    }
    if (userPoints !== undefined && userPoints !== null) {
        sessionStorage.setItem('user_points', userPoints.toString());
        console.log('✅ Reward context set - points:', userPoints);
    }
    if (userName) {
        sessionStorage.setItem('reward_customer_name', userName);
        console.log('✅ Reward context set - name:', userName);
    }
}

/**
 * Handle "Tukar Sekarang" button click from akun page
 * Ensures reward context is set before opening confirmation modal
 * @param {string} rewardId - ID of the reward to exchange
 */
function handleTukarSekarangAkun(rewardId) {
    const user = getLoggedInUser();
    if (!user) {
        showToast('Mohon login terlebih dahulu.');
        return;
    }
    
    // Get user's current points from the akun page display
    const pointsEl = document.getElementById('loyalty-points');
    const userPoints = pointsEl ? parseInt(pointsEl.textContent || '0') : 0;
    
    // Set reward context automatically with phone, points, and name
    setRewardContextFromAkun(user.whatsapp, userPoints, user.nama);
    
    // Call the existing showConfirmTukarModal function
    if (typeof showConfirmTukarModal === 'function') {
        showConfirmTukarModal(rewardId);
    } else if (typeof window.claimReward === 'function') {
        // Fallback to claimReward if showConfirmTukarModal is not available
        window.claimReward(rewardId);
    } else {
        showToast('Fitur tukar poin akan segera hadir!');
    }
}


/**
 * Hide mobile bottom navigation when user is logged in (dashboard view)
 */
function hideMobileBottomNavOnDashboard() {
    const bottomNav = document.getElementById('mobile-bottom-nav');
    const dashboardSection = document.getElementById('dashboard-section');
    
    if (bottomNav && dashboardSection) {
        // Check if dashboard is visible (user is logged in)
        if (!dashboardSection.classList.contains('hidden')) {
            bottomNav.classList.add('hidden');
        } else {
            bottomNav.classList.remove('hidden');
        }
    }
}

// Call on page load and after login
document.addEventListener('DOMContentLoaded', function() {
    // Initial check
    setTimeout(hideMobileBottomNavOnDashboard, 100);
});

// Hook into showDashboard to hide bottom nav
const originalShowDashboard = showDashboard;
showDashboard = function(user) {
    if (typeof originalShowDashboard === 'function') {
        originalShowDashboard(user);
    }
    // Hide bottom nav after showing dashboard
    setTimeout(hideMobileBottomNavOnDashboard, 100);
};

// Hook into showLogin to show bottom nav
const originalShowLogin = showLogin;
showLogin = function() {
    if (typeof originalShowLogin === 'function') {
        originalShowLogin();
    }
    // Show bottom nav when back to login
    const bottomNav = document.getElementById('mobile-bottom-nav');
    if (bottomNav) {
        bottomNav.classList.remove('hidden');
    }
};
