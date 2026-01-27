/**
 * Akun Pengguna - GoSembako
 * Handles user authentication and order history
 */

// Phone utilities
const normalizePhoneTo08 = (phone) => {
    const digits = (phone || '').toString().replace(/[^0-9]/g, '');
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

// Check if user is already logged in
document.addEventListener('DOMContentLoaded', () => {
    const loggedInUser = getLoggedInUser();
    
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

/**
 * Load loyalty points from user_points sheet
 */
async function loadLoyaltyPoints(user) {
    try {
        const apiUrl = CONFIG.getMainApiUrl();
        const normalizedPhone = normalizePhoneTo08(user.whatsapp);
        
        if (!normalizedPhone) {
            console.warn('⚠️ Invalid phone number for loyalty points lookup');
            document.getElementById('loyalty-points').textContent = '0';
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
        } else {
            console.log('⚠️ No points record found for user');
            document.getElementById('loyalty-points').textContent = '0';
        }
        
    } catch (error) {
        console.error('❌ Error loading loyalty points:', error);
        document.getElementById('loyalty-points').textContent = '0';
    }
}

/**
 * Load order history for user
 */
async function loadOrderHistory(user) {
    const loadingDiv = document.getElementById('order-loading');
    const emptyDiv = document.getElementById('order-empty');
    const orderList = document.getElementById('order-list');
    
    // Show loading
    loadingDiv.classList.remove('hidden');
    emptyDiv.classList.add('hidden');
    orderList.innerHTML = '';
    
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
            const orderPhone = order.phone || order.whatsapp || '';
            // Remove leading '0' or '+62' for comparison
            const normalizedOrderPhone = orderPhone.replace(/^(\+62|62|0)/, '');
            const normalizedUserPhone = user.whatsapp.replace(/^(\+62|62|0)/, '');
            return normalizedOrderPhone === normalizedUserPhone;
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
                <p class="text-[10px] font-bold text-gray-700 mb-1">Order ID: <span class="text-green-600">${orderId}</span></p>
            </div>
            ${statusBadge}
        </div>
        
        <div class="border-t border-gray-100 pt-2 space-y-1.5">
            <div class="text-sm">
                <p class="text-gray-600 text-xs mb-0.5">Produk:</p>
                <p class="font-semibold text-gray-800 lg:hidden">${truncatedProduct}</p>
                <p class="font-semibold text-gray-800 hidden lg:block">${productName}</p>
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
        const createResult = await apiPost(apiUrl, {
            action: 'create',
            sheet: 'users',
            data: {
                id: userId,
                nama: name,
                whatsapp: normalizedPhone,
                pin: pin,
                tanggal_daftar: today,
                status: 'aktif',
                total_points: 0,
                created_at: now
            }
        });
        
        if (!createResult.created || createResult.created < 1) {
            throw new Error('Gagal mendaftar');
        }
        
        // Show success
        successDiv.classList.remove('hidden');
        
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
        
        const updateResult = await apiPost(apiUrl, {
            action: 'update',
            sheet: 'users',
            id: user.id,
            data: updateData
        });
        
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
                
                return `
                    <div class="flex flex-col items-center flex-1">
                        <div class="${isActive ? 'bg-green-50' : 'bg-gray-100'} w-12 h-12 rounded-full flex items-center justify-center ${isCurrent ? 'ring-2 ring-green-500 ring-offset-2' : ''}">
                            <img src="assets/images/${s.gif}" alt="${s.name}" class="w-8 h-8 object-contain ${isActive ? '' : 'opacity-40'}">
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
function openRewardModal() {
    // Get user's WhatsApp number
    const user = getLoggedInUser();
    if (!user) return;
    
    // Set WhatsApp input in reward modal
    const whatsappInput = document.getElementById('reward-phone');
    if (whatsappInput) {
        whatsappInput.value = user.whatsapp;
    }
    
    // Show the reward modal from homepage script
    if (typeof showRewardModal === 'function') {
        showRewardModal();
    } else {
        alert('Fitur reward akan segera hadir!');
    }
}

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
                <h5 class="font-bold text-gray-800">${claim.hadiah || claim.reward || 'Reward'}</h5>
                <p class="text-xs text-gray-500 mt-1">${formattedDate}</p>
            </div>
            <span class="${statusColor} text-xs font-bold px-3 py-1 rounded-full">${statusLabel}</span>
        </div>
        <div class="flex items-center justify-between pt-3 border-t border-gray-100">
            <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span class="text-sm font-semibold text-gray-700">${claim.poin || 0} Poin</span>
            </div>
            ${claim.id ? `<span class="text-xs text-gray-400">#${claim.id}</span>` : ''}
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
function openRewardModal() {
    const user = getLoggedInUser();
    if (!user) return;
    
    // Load and display user's current points
    loadModalPoints();
    
    // Show modal
    document.getElementById('loyalty-modal').classList.remove('hidden');
    
    // Default to exchange tab
    switchRewardTab('exchange');
}

/**
 * Load points for the modal display
 */
async function loadModalPoints() {
    const user = getLoggedInUser();
    if (!user) return;
    
    try {
        const apiUrl = CONFIG.getMainApiUrl();
        const response = await fetch(`${apiUrl}?sheet=user_points`);
        
        if (!response.ok) {
            document.getElementById('loyalty-modal-points').textContent = '0';
            return;
        }
        
        const allPoints = await response.json();
        const pointsData = Array.isArray(allPoints) ? allPoints.filter(p => normalizePhoneTo08(p.phone) === normalizePhoneTo08(user.whatsapp)) : [];
        
        if (pointsData && pointsData.length > 0) {
            const userPoints = pointsData[0];
            const points = parseInt(userPoints.points || userPoints.poin || 0);
            document.getElementById('loyalty-modal-points').textContent = points;
        } else {
            document.getElementById('loyalty-modal-points').textContent = '0';
        }
    } catch (error) {
        console.error('Error loading modal points:', error);
        document.getElementById('loyalty-modal-points').textContent = '0';
    }
}
