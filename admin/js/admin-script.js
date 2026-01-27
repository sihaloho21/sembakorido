
// Auth Check
if (localStorage.getItem('admin_logged_in') !== 'true') {
    window.location.href = 'login.html';
}
function logout() {
    localStorage.removeItem('admin_logged_in');
    window.location.href = 'login.html';
}

let API_URL = CONFIG.getAdminApiUrl();
const CATEGORIES_SHEET = 'categories';
const PRODUCTS_SHEET = 'products';
const ORDERS_SHEET = 'orders';
const TUKAR_POIN_SHEET = 'tukar_poin';

let allProducts = [];
let allCategories = [];
let allOrders = [];
let allTukarPoin = [];
let currentOrderFilter = 'semua';

function showSection(sectionId) {
    document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`section-${sectionId}`).classList.remove('hidden');
    document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
    document.getElementById(`nav-${sectionId}`).classList.add('active');
    
    const titles = {
        dashboard: 'Dashboard',
        produk: 'Produk',
        kategori: 'Kategori',
        pesanan: 'Pesanan',
        'tukar-poin': 'Tukar Poin',
        banners: 'Banner Promosi',
        'user-points': 'Poin Pengguna',
        'tiered-pricing': 'Harga Grosir Bertingkat',
        pengaturan: 'Pengaturan'
    };
    document.getElementById('section-title').innerText = titles[sectionId];

    if (sectionId === 'kategori') fetchCategories();
    if (sectionId === 'produk') fetchAdminProducts();
    if (sectionId === 'pesanan') fetchOrders();
    if (sectionId === 'tukar-poin') fetchTukarPoin();
    if (sectionId === 'banners') fetchBanners();
    if (sectionId === 'user-points') fetchUserPoints();
    if (sectionId === 'tiered-pricing') fetchTieredPricingProducts();
    if (sectionId === 'dashboard') {
        updateDashboardStats();
        loadStoreStatus();
    }
    if (sectionId === 'pengaturan') loadSettings();
}

// ============ DASHBOARD FUNCTIONS ============
function loadStoreStatus() {
    const isClosed = CONFIG.isStoreClosed();
    const toggle = document.getElementById('store-closed-toggle');
    const label = document.getElementById('store-status-label');
    
    if (toggle && label) {
        toggle.checked = isClosed;
        if (isClosed) {
            label.innerText = 'TOKO TUTUP';
            label.className = 'text-sm font-bold px-3 py-1 rounded-full bg-red-100 text-red-700';
        } else {
            label.innerText = 'TOKO BUKA';
            label.className = 'text-sm font-bold px-3 py-1 rounded-full bg-green-100 text-green-700';
        }
    }
}

function toggleStoreStatus() {
    const toggle = document.getElementById('store-closed-toggle');
    const isClosed = toggle.checked;
    CONFIG.setStoreClosed(isClosed);
    loadStoreStatus();
    showAdminToast(isClosed ? 'Toko sekarang TUTUP' : 'Toko sekarang BUKA', isClosed ? 'warning' : 'success');
}

async function updateDashboardStats() {
    try {
        const [prodRes, orderRes] = await Promise.all([
            fetch(`${API_URL}?sheet=${PRODUCTS_SHEET}`),
            fetch(`${API_URL}?sheet=${ORDERS_SHEET}`)
        ]);
        const prods = await prodRes.json();
        const orders = await orderRes.json();
        
        document.getElementById('stat-total-produk').innerText = prods.length || 0;
        document.getElementById('stat-total-pesanan').innerText = orders.length || 0;
        const lowStock = prods.filter(p => parseInt(p.stok) <= 5).length;
        document.getElementById('stat-stok-menipis').innerText = lowStock;
    } catch (e) { console.error(e); }
}

// ============ ORDER FUNCTIONS ============
async function fetchOrders() {
    const tbody = document.getElementById('order-list-body');
    tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-10 text-center text-gray-500">Memuat data pesanan...</td></tr>';
    
    try {
        const response = await fetch(`${API_URL}?sheet=${ORDERS_SHEET}`);
        allOrders = await response.json();
        if (!Array.isArray(allOrders)) allOrders = [];
        renderOrderTable();
        updateOrderStats();
    } catch (error) {
        console.error('Error:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-10 text-center text-red-500">Gagal memuat data pesanan.</td></tr>';
    }
}

function updateOrderStats() {
    const total = allOrders.length;
    const pending = allOrders.filter(o => o.status.toLowerCase() === 'menunggu').length;
    const revenue = allOrders.reduce((acc, o) => acc + (parseInt(o.total) || 0), 0);
    const avg = total > 0 ? Math.round(revenue / total) : 0;

    document.getElementById('order-stat-total').innerText = total;
    document.getElementById('order-stat-pending').innerText = pending;
    document.getElementById('order-stat-revenue').innerText = `Rp ${revenue.toLocaleString('id-ID')}`;
    document.getElementById('order-stat-avg').innerText = `Rp ${avg.toLocaleString('id-ID')}`;
    document.getElementById('order-count-display').innerText = `(${total})`;
}

function filterOrders(status) {
    currentOrderFilter = status;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-green-600', 'text-white');
        btn.classList.add('bg-gray-100', 'text-gray-600');
    });
    event.target.classList.add('active', 'bg-green-600', 'text-white');
    event.target.classList.remove('bg-gray-100', 'text-gray-600');
    renderOrderTable();
}

function renderOrderTable() {
    const tbody = document.getElementById('order-list-body');
    const filtered = currentOrderFilter === 'semua' 
        ? allOrders 
        : allOrders.filter(o => o.status.toLowerCase() === currentOrderFilter.toLowerCase());

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-10 text-center text-gray-500">Tidak ada pesanan.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(o => `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4 font-bold text-blue-600 text-xs">${o.id}</td>
            <td class="px-6 py-4 text-sm text-gray-800 font-medium">${o.pelanggan}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${o.produk}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${o.qty}</td>
            <td class="px-6 py-4 text-sm font-bold text-gray-800">Rp ${parseInt(o.total).toLocaleString('id-ID')}</td>
            <td class="px-6 py-4">
                <span class="status-badge status-${o.status.toLowerCase()}">${o.status}</span>
            </td>
            <td class="px-6 py-4 text-xs text-gray-500">${o.tanggal}</td>
            <td class="px-6 py-4 text-right">
                <select onchange="updateOrderStatus('${o.id}', this.value)" class="text-xs border rounded-lg p-1 outline-none focus:ring-1 focus:ring-green-500">
                    <option value="">Ubah Status</option>
                    <option value="Menunggu">Menunggu</option>
                    <option value="Diproses">Diproses</option>
                    <option value="Dikirim">Dikirim</option>
                    <option value="Terima">Terima</option>
                    <option value="Dibatalkan">Dibatalkan</option>
                </select>
            </td>
        </tr>
    `).join('');
}

function normalizePhone(phone) {
    if (!phone) return '';
    let p = phone.toString().replace(/[^0-9]/g, '');
    if (p.startsWith('62')) p = '0' + p.slice(2);
    else if (p.startsWith('8')) p = '0' + p;
    else if (!p.startsWith('0')) p = '0' + p;
    return p;
}


async function updateOrderStatus(id, newStatus) {
    if (!newStatus) return;
    
    const selectElement = event.target;
    selectElement.disabled = true;

    try {
        const order = allOrders.find(o => o.id === id);
        if (!order) {
            showAdminToast('Pesanan tidak ditemukan!', 'error');
            selectElement.disabled = false;
            return;
        }

        const result = await apiPost(API_URL, { 
            action: 'update',
            sheet: ORDERS_SHEET,
            id: id,
            data: { status: newStatus } 
        });
        
        if (result.affected > 0) {
            if (newStatus === 'Terima' && order.point_processed !== 'Yes') {
                if (order.phone && order.poin) {
                    const pointsToAdd = parseFloat(order.poin) || 0;
                    const phone = normalizePhone(order.phone);
                    
                    const userRes = await fetch(`${API_URL}?sheet=user_points`);
                    const allUsers = await userRes.json();
                    const userData = Array.isArray(allUsers) ? allUsers.filter(u => normalizePhone(u.phone) === phone) : [];
                    
                    let pointUpdateSuccess = false;
                    if (Array.isArray(userData) && userData.length > 0) {
                        const currentPoints = parseFloat(userData[0].points) || 0;
                        const updateRes = await apiPost(API_URL, { 
                            action: 'update',
                            sheet: 'user_points',
                            id: userData[0].id,
                            data: { 
                                points: currentPoints + pointsToAdd,
                                last_updated: new Date().toLocaleString('id-ID')
                            } 
                        });
                        if (updateRes.affected > 0) pointUpdateSuccess = true;
                    } else {
                        const createRes = await apiPost(API_URL, { 
                            action: 'create',
                            sheet: 'user_points',
                            data: { 
                                id: Date.now().toString(),
                                phone: phone,
                                points: pointsToAdd,
                                last_updated: new Date().toLocaleString('id-ID')
                            } 
                        });
                        if (createRes.created > 0) pointUpdateSuccess = true;
                    }

                    if (pointUpdateSuccess) {
                        await apiPost(API_URL, { 
                            action: 'update',
                            sheet: ORDERS_SHEET,
                            id: id,
                            data: { point_processed: 'Yes' } 
                        });
                        

                        
                        showAdminToast(`Status diperbarui & +${pointsToAdd} poin diberikan ke ${phone}`, 'success');
                    } else {
                        showAdminToast('Status diperbarui, tapi gagal update poin.', 'warning');
                    }
                }
            } else {
                showAdminToast('Status pesanan diperbarui!', 'success');
            }

            const orderIndex = allOrders.findIndex(o => o.id === id);
            if (orderIndex !== -1) {
                allOrders[orderIndex].status = newStatus;
                if (newStatus === 'Terima') allOrders[orderIndex].point_processed = 'Yes';
                renderOrderTable();
                updateOrderStats();
            }
        } else {
            showAdminToast('Gagal memperbarui status di database.', 'error');
        }
    } catch (e) {
        console.error(e);
        showAdminToast('Terjadi kesalahan saat memperbarui status.', 'error');
    } finally {
        selectElement.disabled = false;
    }
}

// ============ CATEGORY FUNCTIONS ============
async function fetchCategories() {
    try {
        const response = await fetch(`${API_URL}?sheet=${CATEGORIES_SHEET}`);
        allCategories = await response.json();
        renderCategoryTable();
        updateCategoryDropdown();
    } catch (error) { console.error(error); }
}

function renderCategoryTable() {
    const tbody = document.getElementById('category-list-body');
    if (allCategories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="px-6 py-10 text-center text-gray-500">Belum ada kategori.</td></tr>';
        return;
    }
    tbody.innerHTML = allCategories.map(c => `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4 font-bold text-gray-800 text-sm">${c.nama}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${c.deskripsi || '-'}</td>
            <td class="px-6 py-4 text-right flex justify-end gap-2">
                <button onclick="openEditCategory('${c.id}', '${c.nama}', '${c.deskripsi}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button onclick="handleDeleteCategory('${c.id}')" class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        </tr>
    `).join('');
    document.getElementById('category-count').innerText = `(${allCategories.length})`;
}

function openEditCategory(id, nama, deskripsi) {
    const newNama = prompt('Nama Kategori:', nama);
    if (newNama === null) return;
    const newDeskripsi = prompt('Deskripsi:', deskripsi);
    if (newDeskripsi === null) return;
    handleEditCategory(id, newNama, newDeskripsi);
}

async function handleEditCategory(id, nama, deskripsi) {
    try {
        const result = await apiPost(API_URL, { 
            action: 'update',
            sheet: CATEGORIES_SHEET,
            id: id,
            data: { nama, deskripsi } 
        });
        if (result.affected > 0) {
            showAdminToast('Kategori berhasil diperbarui!', 'success');
            fetchCategories();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal memperbarui kategori.', 'error');
    }
}

async function handleDeleteCategory(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus kategori ini?')) return;
    try {
        const result = await apiPost(API_URL, { 
            action: 'delete',
            sheet: CATEGORIES_SHEET,
            id: id
        });
        if (result.deleted > 0) {
            showAdminToast('Kategori berhasil dihapus!', 'success');
            fetchCategories();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal menghapus kategori.', 'error');
    }
}

function updateCategoryDropdown() {
    const select = document.getElementById('form-category');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Pilih Kategori --</option>' + 
        allCategories.map(c => `<option value="${c.nama}">${c.nama}</option>`).join('');
    select.value = currentVal;
}

// ============ PRODUCT FUNCTIONS ============
async function fetchAdminProducts() {
    const tbody = document.getElementById('admin-product-list');
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500">Memuat data...</td></tr>';
    try {
        const response = await fetch(`${API_URL}?sheet=${PRODUCTS_SHEET}`);
        allProducts = await response.json();
        renderAdminTable();
        updateDashboardStats();
    } catch (error) { console.error(error); }
}

function renderAdminTable() {
    const tbody = document.getElementById('admin-product-list');
    if (allProducts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500">Belum ada produk.</td></tr>';
        return;
    }
    tbody.innerHTML = allProducts.map(p => `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <img src="${p.gambar ? p.gambar.split(',')[0] : 'https://via.placeholder.com/50'}" class="w-10 h-10 object-cover rounded-lg bg-gray-100">
                    <span class="font-bold text-gray-800 text-sm">${p.nama}</span>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-[10px] font-bold uppercase">${p.kategori || '-'}</span>
            </td>
            <td class="px-6 py-4">
                <div class="flex flex-col">
                    ${p.harga_coret ? `<span class="text-[10px] text-gray-400 line-through">Rp ${parseInt(p.harga_coret).toLocaleString('id-ID')}</span>` : ''}
                    <span class="font-bold text-green-700 text-sm">Rp ${parseInt(p.harga).toLocaleString('id-ID')}</span>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="text-sm ${parseInt(p.stok) <= 5 ? 'text-red-600 font-bold' : 'text-gray-600'}">${p.stok}</span>
            </td>
            <td class="px-6 py-4 text-right flex justify-end gap-2">
                <button onclick="openEditModal('${p.id}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button onclick="handleDelete('${p.id}')" class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        </tr>
    `).join('');
}

function openAddModal() {
    document.getElementById('modal-title').innerText = 'Tambah Produk';
    document.getElementById('product-id').value = '';
    document.getElementById('product-form').reset();
    document.getElementById('variants-container').innerHTML = '';
    document.getElementById('product-modal').classList.remove('hidden');
}

function openEditModal(id) {
    const p = allProducts.find(prod => prod.id == id);
    if (!p) return;

    document.getElementById('modal-title').innerText = 'Edit Produk';
    document.getElementById('product-id').value = p.id;
    document.getElementById('form-nama').value = p.nama;
    document.getElementById('form-harga').value = p.harga;
    document.getElementById('form-harga-coret').value = p.harga_coret || '';
    document.getElementById('form-stok').value = p.stok;
    document.getElementById('form-category').value = p.kategori || '';
    document.getElementById('form-deskripsi').value = p.deskripsi || '';
    
    const images = p.gambar ? p.gambar.split(',') : [];
    document.getElementById('form-gambar-1').value = images[0] || '';
    document.getElementById('form-gambar-2').value = images[1] || '';
    document.getElementById('form-gambar-3').value = images[2] || '';

    // Load variants
    loadVariants(p.variasi);

    document.getElementById('product-modal').classList.remove('hidden');
}

function closeModal() { document.getElementById('product-modal').classList.add('hidden'); }

document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    const submitBtn = document.getElementById('submit-btn');
    const originalText = submitBtn.innerText;
    
    submitBtn.disabled = true;
    submitBtn.innerText = 'Menyimpan...';

    const images = [
        document.getElementById('form-gambar-1').value,
        document.getElementById('form-gambar-2').value,
        document.getElementById('form-gambar-3').value
    ].filter(url => url.trim() !== '').join(',');

    const variantsData = collectVariants();
    const variantsJson = variantsData.length > 0 ? JSON.stringify(variantsData) : '';

    const data = {
        nama: document.getElementById('form-nama').value,
        harga: document.getElementById('form-harga').value,
        harga_coret: document.getElementById('form-harga-coret').value,
        stok: document.getElementById('form-stok').value,
        kategori: document.getElementById('form-category').value,
        deskripsi: document.getElementById('form-deskripsi').value,
        gambar: images,
        variasi: variantsJson
    };

    try {
        const action = id ? 'update' : 'create';
        const productId = id || Date.now().toString();
        
        const result = await apiPost(API_URL, { 
            action: action,
            sheet: PRODUCTS_SHEET,
            id: productId,
            data: id ? data : { ...data, id: productId }
        });
        if (result.affected > 0 || result.created > 0) {
            showAdminToast(id ? 'Produk berhasil diperbarui!' : 'Produk berhasil ditambahkan!', 'success');
            closeModal();
            fetchAdminProducts();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Terjadi kesalahan saat menyimpan data.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
    }
});

async function handleDelete(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus produk ini?')) return;
    try {
        const result = await apiPost(API_URL, { 
            action: 'delete',
            sheet: PRODUCTS_SHEET,
            id: id
        });
        if (result.deleted > 0) {
            showAdminToast('Produk berhasil dihapus!', 'success');
            fetchAdminProducts();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal menghapus produk.', 'error');
    }
}

document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = document.getElementById('form-category-nama').value;
    const deskripsi = document.getElementById('form-category-deskripsi').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Menyimpan...';

    try {
        const result = await apiPost(API_URL, { 
            action: 'create',
            sheet: CATEGORIES_SHEET,
            data: { id: Date.now().toString(), nama, deskripsi }
        });
        if (result.created > 0) {
            showAdminToast('Kategori berhasil ditambahkan!', 'success');
            e.target.reset();
            fetchCategories();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Terjadi kesalahan saat menyimpan data.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
});

// ============ TUKAR POIN FUNCTIONS ============
async function fetchTukarPoin() {
    const tbody = document.getElementById('tukar-poin-list');
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500">Memuat data tukar poin...</td></tr>';
    try {
        const response = await fetch(`${API_URL}?sheet=${TUKAR_POIN_SHEET}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        allTukarPoin = await response.json();
        if (!Array.isArray(allTukarPoin)) allTukarPoin = [];
        renderTukarPoinTable();
    } catch (error) {
        console.error('Error:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-red-500">Gagal memuat data tukar poin. Pastikan sheet "tukar_poin" sudah ada.</td></tr>';
    }
}

function renderTukarPoinTable() {
    const tbody = document.getElementById('tukar-poin-list');
    if (allTukarPoin.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500">Belum ada produk tukar poin.</td></tr>';
        return;
    }
    tbody.innerHTML = allTukarPoin.map(p => `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <img src="${p.gambar || 'https://via.placeholder.com/50'}" class="w-10 h-10 object-cover rounded-lg bg-gray-100" alt="${p.judul}">
                    <span class="font-bold text-gray-800 text-sm">${p.judul || p.nama}</span>
                </div>
            </td>
            <td class="px-6 py-4 font-bold text-amber-600 text-sm">${p.poin} Poin</td>
            <td class="px-6 py-4 text-sm text-gray-600">${p.deskripsi || '-'}</td>
            <td class="px-6 py-4 text-right flex justify-end gap-2">
                <button onclick="openEditTukarPoinModal('${p.id}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Edit">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button onclick="handleDeleteTukarPoin('${p.id}')" class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition" title="Hapus">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        </tr>
    `).join('');
}

function openAddTukarPoinModal() {
    document.getElementById('tukar-poin-id').value = '';
    document.getElementById('tukar-poin-form').reset();
    document.getElementById('tukar-poin-modal-title').innerText = 'Tambah Produk Tukar Poin';
    document.getElementById('tukar-poin-submit-btn').innerText = 'Simpan';
    document.getElementById('tukar-poin-modal').classList.remove('hidden');
}

function openEditTukarPoinModal(id) {
    const product = allTukarPoin.find(p => p.id === id);
    if (!product) {
        showAdminToast('Produk tidak ditemukan!', 'error');
        return;
    }
    
    document.getElementById('tukar-poin-id').value = product.id;
    document.getElementById('form-tukar-judul').value = product.judul || '';
    document.getElementById('form-tukar-poin').value = product.poin || '';
    document.getElementById('form-tukar-gambar').value = product.gambar || '';
    document.getElementById('form-tukar-deskripsi').value = product.deskripsi || '';
    
    document.getElementById('tukar-poin-modal-title').innerText = 'Edit Produk Tukar Poin';
    document.getElementById('tukar-poin-submit-btn').innerText = 'Perbarui';
    document.getElementById('tukar-poin-modal').classList.remove('hidden');
}

function closeTukarPoinModal() {
    document.getElementById('tukar-poin-modal').classList.add('hidden');
    document.getElementById('tukar-poin-form').reset();
}

async function handleDeleteTukarPoin(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus produk tukar poin ini?')) return;
    
    try {
        const result = await apiPost(API_URL, { 
            action: 'delete',
            sheet: TUKAR_POIN_SHEET,
            id: id
        });
        if (result.deleted > 0) {
            showAdminToast('Produk tukar poin berhasil dihapus!', 'success');
            fetchTukarPoin();
        } else {
            showAdminToast('Gagal menghapus produk.', 'error');
        }
    } catch (e) {
        console.error(e);
        showAdminToast('Gagal menghapus produk.', 'error');
    }
}

document.getElementById('tukar-poin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('tukar-poin-id').value;
    const judul = document.getElementById('form-tukar-judul').value.trim();
    const poin = document.getElementById('form-tukar-poin').value.trim();
    const gambar = document.getElementById('form-tukar-gambar').value.trim();
    const deskripsi = document.getElementById('form-tukar-deskripsi').value.trim();
    
    if (!judul || !poin || !gambar) {
        showAdminToast('Semua field yang ditandai wajib diisi!', 'error');
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Menyimpan...';
    
    try {
        const data = {
            judul,
            poin: parseInt(poin),
            gambar,
            deskripsi
        };
        
        const action = id ? 'update' : 'create';
        const productId = id || Date.now().toString();
        
        const result = await apiPost(API_URL, { 
            action: action,
            sheet: TUKAR_POIN_SHEET,
            id: productId,
            data: id ? data : { ...data, id: productId }
        });
        
        if (result.created > 0 || result.affected > 0) {
            showAdminToast(id ? 'Produk tukar poin berhasil diperbarui!' : 'Produk tukar poin berhasil ditambahkan!', 'success');
            closeTukarPoinModal();
            fetchTukarPoin();
        } else {
            showAdminToast('Gagal menyimpan data.', 'error');
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal menyimpan data.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
});

// ============ USER POINTS FUNCTIONS ============
async function fetchUserPoints() {
    const tbody = document.getElementById('user-points-list');
    tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-gray-500">Memuat data...</td></tr>';
    try {
        const response = await fetch(`${API_URL}?sheet=user_points`);
        const data = await response.json();
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-gray-500">Belum ada data poin pengguna.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(u => `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-6 py-4 font-bold text-gray-800 text-sm">${u.phone}</td>
                <td class="px-6 py-4 font-bold text-green-600 text-sm">${parseFloat(u.points).toFixed(1)} Poin</td>
                <td class="px-6 py-4 text-xs text-gray-500">${u.last_updated || '-'}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="editUserPoints('${u.phone}', ${u.points})" class="text-blue-600 hover:underline text-sm font-bold">Edit Poin</button>
                </td>
            </tr>
        `).join('');
    } catch (error) { console.error(error); }
}

async function editUserPoints(phone, currentPoints) {
    const newPoints = prompt(`Masukkan saldo poin baru untuk ${phone}:`, currentPoints);
    if (newPoints === null || newPoints === "") return;
    
    try {
        // First, get the user data to find the ID
        const searchRes = await fetch(`${API_URL}?sheet=user_points`);
        const allUsers = await searchRes.json();
        const user = allUsers.find(u => u.phone === phone);
        
        if (!user || !user.id) {
            showAdminToast('User tidak ditemukan!', 'error');
            return;
        }
        
        const result = await apiPost(API_URL, { 
            action: 'update',
            sheet: 'user_points',
            id: user.id,
            data: { 
                points: parseFloat(newPoints),
                last_updated: new Date().toLocaleString('id-ID')
            } 
        });
        if (result.affected > 0) {
            showAdminToast('Saldo poin diperbarui!', 'success');
            fetchUserPoints();
        }
    } catch (error) {
        console.error(error);
        showAdminToast('Gagal memperbarui poin.', 'error');
    }
}

// ============ SETTINGS FUNCTIONS ============
function loadSettings() {
    const config = CONFIG.getAllConfig();
    
    // API Settings
    document.getElementById('settings-main-api').value = config.mainApi;
    document.getElementById('settings-admin-api').value = config.adminApi;
    
    // Gajian Settings
    document.getElementById('gajian-target-day').value = config.gajian.targetDay;
    document.getElementById('gajian-default-markup').value = config.gajian.defaultMarkup * 100;
    
    // Markup Ranges
    renderGajianMarkups(config.gajian.markups);
    
    // Reward Settings
    document.getElementById('reward-point-value').value = config.reward.pointValue;
    document.getElementById('reward-min-point').value = config.reward.minPoint;
    
    // Manual Overrides
    renderRewardOverrides(config.reward.manualOverrides);
}

function renderGajianMarkups(markups) {
    const tbody = document.getElementById('gajian-markups-table');
    tbody.innerHTML = markups.map((m, index) => `
        <tr class="border-b border-gray-50">
            <td class="py-2 px-2">${m.minDays} Hari</td>
            <td class="py-2 px-2 font-bold text-green-600">${(m.rate * 100).toFixed(1)}%</td>
            <td class="py-2 px-2">
                <button onclick="openEditMarkupModal(${index})" class="text-blue-600 hover:underline">Edit</button>
            </td>
        </tr>
    `).join('');
}

function renderRewardOverrides(overrides) {
    const tbody = document.getElementById('reward-overrides-table');
    tbody.innerHTML = Object.entries(overrides).map(([name, points]) => `
        <tr class="border-b border-gray-50">
            <td class="py-2 px-2">${name}</td>
            <td class="py-2 px-2 font-bold text-amber-600">${points} Poin</td>
            <td class="py-2 px-2">
                <button onclick="deleteRewardOverride('${name}')" class="text-red-600 hover:underline">Hapus</button>
            </td>
        </tr>
    `).join('');
}

async function saveSettings() {
    const mainApi = document.getElementById('settings-main-api').value.trim();
    const adminApi = document.getElementById('settings-admin-api').value.trim();
    
    if (!mainApi || !adminApi) {
        showAdminToast('URL API tidak boleh kosong!', 'error');
        return;
    }

    // Save API URLs to localStorage
    CONFIG.setMainApiUrl(mainApi);
    CONFIG.setAdminApiUrl(adminApi);
    API_URL = adminApi; // Update local variable immediately
    
    // Clear cache when API URL changes
    if (typeof ApiService !== 'undefined') {
        ApiService.clearCache();
        console.log('✅ Cache cleared after API URL change');
    }
    
    const targetDay = parseInt(document.getElementById('gajian-target-day').value);
    const defaultMarkup = parseFloat(document.getElementById('gajian-default-markup').value) / 100;
    
    const currentGajian = CONFIG.getGajianConfig();
    CONFIG.setGajianConfig({
        ...currentGajian,
        targetDay,
        defaultMarkup
    });
    
    const pointValue = parseInt(document.getElementById('reward-point-value').value);
    const minPoint = parseFloat(document.getElementById('reward-min-point').value);
    
    const currentReward = CONFIG.getRewardConfig();
    CONFIG.setRewardConfig({
        ...currentReward,
        pointValue,
        minPoint
    });
    
    // Trigger API config change event for all open tabs/windows
    window.dispatchEvent(new Event('api-config-changed'));
    console.log('🔔 [ADMIN] Dispatched api-config-changed event to all listeners');
    
    // Show detailed success message
    const successMsg = `✅ Pengaturan Berhasil Disimpan!\n\n📡 Main API: ${mainApi.substring(0, 40)}...\n🔧 Admin API: ${adminApi.substring(0, 40)}...\n🗑️ Cache cleared\n\n⏳ Reloading...`;
    alert(successMsg);
    
    showAdminToast('Pengaturan berhasil disimpan! Halaman akan reload...', 'success');
    setTimeout(() => location.reload(), 1500);
}


// ============ MARKUP MODAL FUNCTIONS ============
function openEditMarkupModal(index) {
    const config = CONFIG.getGajianConfig();
    const markup = config.markups[index];
    if (!markup) return;

    document.getElementById('edit-markup-index').value = index;
    document.getElementById('edit-markup-min-days').value = markup.minDays;
    document.getElementById('edit-markup-rate').value = (markup.rate * 100).toFixed(1);
    document.getElementById('edit-markup-modal').classList.remove('hidden');
}

function closeEditMarkupModal() {
    document.getElementById('edit-markup-modal').classList.add('hidden');
}

document.getElementById('edit-markup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const index = parseInt(document.getElementById('edit-markup-index').value);
    const minDays = parseInt(document.getElementById('edit-markup-min-days').value);
    const rate = parseFloat(document.getElementById('edit-markup-rate').value) / 100;

    const config = CONFIG.getGajianConfig();
    config.markups[index] = { minDays, rate };
    
    // Sort markups by minDays descending to keep logic consistent
    config.markups.sort((a, b) => b.minDays - a.minDays);
    
    CONFIG.setGajianConfig(config);
    renderGajianMarkups(config.markups);
    closeEditMarkupModal();
    showAdminToast('Skema markup diperbarui!', 'success');
});

// ============ REWARD OVERRIDE MODAL FUNCTIONS ============
function openAddOverrideModal() {
    document.getElementById('override-modal-title').innerText = 'Tambah Override Poin';
    document.getElementById('reward-override-form').reset();
    
    const select = document.getElementById('override-product-name');
    select.innerHTML = '<option value="">-- Pilih Produk --</option>' + 
        allProducts.map(p => `<option value="${p.nama}">${p.nama}</option>`).join('');
    
    document.getElementById('reward-override-modal').classList.remove('hidden');
}

function closeRewardOverrideModal() {
    document.getElementById('reward-override-modal').classList.add('hidden');
}

document.getElementById('reward-override-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const productName = document.getElementById('override-product-name').value;
    const points = parseFloat(document.getElementById('override-point-value').value);

    const config = CONFIG.getRewardConfig();
    config.manualOverrides[productName] = points;
    
    CONFIG.setRewardConfig(config);
    renderRewardOverrides(config.manualOverrides);
    closeRewardOverrideModal();
    showAdminToast('Override poin disimpan!', 'success');
});

function deleteRewardOverride(name) {
    if (!confirm(`Hapus override untuk ${name}?`)) return;
    const config = CONFIG.getRewardConfig();
    delete config.manualOverrides[name];
    CONFIG.setRewardConfig(config);
    renderRewardOverrides(config.manualOverrides);
    showAdminToast('Override poin dihapus!', 'success');
}

// ============ TOAST NOTIFICATION ============
function showAdminToast(message, type = 'info') {
    let container = document.getElementById('admin-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'admin-toast-container';
        container.className = 'fixed bottom-8 right-8 z-[100] flex flex-col gap-3';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgColors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-amber-500',
        info: 'bg-blue-600'
    };
    
    toast.className = `${bgColors[type] || 'bg-gray-800'} text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-in-right min-w-[300px]`;
    
    const icons = {
        success: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
        error: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>',
        warning: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>',
        info: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
    };

    toast.innerHTML = `
        <div class="flex-shrink-0">${icons[type] || icons.info}</div>
        <div class="flex-1 font-medium text-sm">${message}</div>
        <button onclick="this.parentElement.remove()" class="flex-shrink-0 hover:bg-white/20 p-1 rounded-lg transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('animate-fade-out');
            setTimeout(() => toast.remove(), 500);
        }
    }, 4000);
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
    showSection('dashboard');

});

// ============ VARIANT MANAGEMENT FUNCTIONS ============

/**
 * Load variants from JSON string and render them in the form
 */
function loadVariants(variantsJson) {
    const container = document.getElementById('variants-container');
    container.innerHTML = '';
    
    if (!variantsJson) return;
    
    try {
        const variants = JSON.parse(variantsJson);
        if (Array.isArray(variants) && variants.length > 0) {
            variants.forEach((variant, index) => {
                renderVariantRow(variant, index);
            });
        }
    } catch (e) {
        console.error('Error parsing variants:', e);
    }
}

/**
 * Render a single variant row in the form
 */
function renderVariantRow(variant, index) {
    const container = document.getElementById('variants-container');
    const row = document.createElement('div');
    row.className = 'bg-white p-4 rounded-lg border border-gray-200 variant-row';
    row.dataset.index = index;
    
    const hargaCoret = variant.harga_coret || '';
    const gambar = variant.gambar || '';
    const grosir = variant.grosir || '';
    
    row.innerHTML = `
        <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
                <label class="text-xs font-bold text-gray-600">SKU</label>
                <input type="text" class="variant-sku w-full p-2 border rounded text-sm" value="${variant.sku || ''}" placeholder="MG-1L" required>
            </div>
            <div>
                <label class="text-xs font-bold text-gray-600">Nama Varian</label>
                <input type="text" class="variant-nama w-full p-2 border rounded text-sm" value="${variant.nama || ''}" placeholder="1 Liter" required>
            </div>
            <div>
                <label class="text-xs font-bold text-gray-600">Harga (Rp)</label>
                <input type="number" class="variant-harga w-full p-2 border rounded text-sm" value="${variant.harga || ''}" placeholder="15000" required>
            </div>
            <div>
                <label class="text-xs font-bold text-gray-600">Harga Coret (Rp)</label>
                <input type="number" class="variant-harga-coret w-full p-2 border rounded text-sm" value="${hargaCoret}" placeholder="16000">
            </div>
            <div>
                <label class="text-xs font-bold text-gray-600">Stok</label>
                <input type="number" class="variant-stok w-full p-2 border rounded text-sm" value="${variant.stok || ''}" placeholder="10" required>
            </div>
            <div class="col-span-2">
                <label class="text-xs font-bold text-gray-600">URL Gambar Varian (Opsional)</label>
                <input type="text" class="variant-gambar w-full p-2 border rounded text-sm mb-2" value="${gambar}" placeholder="https://example.com/variant-image.jpg" onchange="previewVariantImage(this)">
                <p class="text-[10px] text-gray-500 mb-2">Jika diisi, gambar ini akan tampil saat varian dipilih. Jika kosong, akan gunakan gambar produk utama.</p>
                ${gambar ? `<img src="${gambar}" class="variant-image-preview w-24 h-24 object-cover rounded border" onerror="this.style.display='none'">` : ''}
            </div>
        </div>
        <div class="mb-3">
            <label class="text-xs font-bold text-gray-600">Harga Grosir (JSON)</label>
            <textarea class="variant-grosir w-full p-2 border rounded text-xs" rows="2" placeholder='[{"min_qty":5,"price":14000}]'>${grosir}</textarea>
        </div>
        <div class="flex justify-end">
            <button type="button" onclick="removeVariantRow(this)" class="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded text-sm font-bold transition">
                Hapus Varian
            </button>
        </div>
    `;
    
    container.appendChild(row);
}

/**
 * Add a new empty variant row
 */
function addVariantRow() {
    const container = document.getElementById('variants-container');
    const index = container.children.length;
    renderVariantRow({}, index);
}

/**
 * Remove a variant row
 */
function removeVariantRow(button) {
    button.closest('.variant-row').remove();
}

/**
 * Collect all variant data from the form
 */
function collectVariants() {
    const rows = document.querySelectorAll('.variant-row');
    const variants = [];
    
    rows.forEach(row => {
        const sku = row.querySelector('.variant-sku').value.trim();
        const nama = row.querySelector('.variant-nama').value.trim();
        const harga = row.querySelector('.variant-harga').value.trim();
        const hargaCoret = row.querySelector('.variant-harga-coret').value.trim();
        const stok = row.querySelector('.variant-stok').value.trim();
        const gambar = row.querySelector('.variant-gambar').value.trim();
        const grosir = row.querySelector('.variant-grosir').value.trim();
        
        // Only add if at least SKU, nama, harga, and stok are filled
        if (sku && nama && harga && stok) {
            const variant = {
                sku: sku,
                nama: nama,
                harga: parseInt(harga),
                stok: parseInt(stok)
            };
            
            if (hargaCoret) variant.harga_coret = parseInt(hargaCoret);
            if (gambar) variant.gambar = gambar;
            if (grosir) variant.grosir = grosir;
            
            variants.push(variant);
        }
    });
    
    return variants;
}

/**
 * Preview variant image when URL is entered
 */
function previewVariantImage(input) {
    const url = input.value.trim();
    const row = input.closest('.variant-row');
    
    // Remove existing preview
    const existingPreview = row.querySelector('.variant-image-preview');
    if (existingPreview) {
        existingPreview.remove();
    }
    
    // Add new preview if URL is valid
    if (url) {
        const preview = document.createElement('img');
        preview.src = url;
        preview.className = 'variant-image-preview w-24 h-24 object-cover rounded border mt-2';
        preview.onerror = function() {
            this.style.display = 'none';
            showToast('Gagal memuat gambar. Periksa URL gambar.', 'error');
        };
        input.parentElement.appendChild(preview);
    }
}


// ============ CACHE MANAGEMENT FUNCTIONS ============

/**
 * Update cache count display
 */
function updateCacheCount() {
    if (typeof ApiService !== 'undefined') {
        const stats = ApiService.getCacheStats();
        const countEl = document.getElementById('cache-count');
        if (countEl) {
            countEl.textContent = stats.totalEntries;
        }
    }
}

/**
 * Clear API cache
 */
function clearApiCache() {
    if (typeof ApiService === 'undefined') {
        alert('ApiService tidak tersedia.');
        return;
    }
    
    if (!confirm('Hapus semua cache API? Data akan di-fetch ulang dari server.')) {
        return;
    }
    
    const cleared = ApiService.clearCache();
    alert(`✅ Cache berhasil dihapus!\n\n${cleared} entries dihapus.`);
    updateCacheCount();
}

/**
 * View cache statistics
 */
function viewCacheStats() {
    if (typeof ApiService === 'undefined') {
        alert('ApiService tidak tersedia.');
        return;
    }
    
    const stats = ApiService.getCacheStats();
    
    let message = `📊 STATISTIK CACHE API\n\n`;
    message += `Total Entries: ${stats.totalEntries}\n`;
    message += `Pending Requests: ${stats.pendingRequests}\n\n`;
    
    if (stats.entries.length > 0) {
        message += `DETAIL CACHE:\n`;
        message += `${'='.repeat(40)}\n\n`;
        
        stats.entries.forEach((entry, idx) => {
            const endpoint = entry.key.split(':')[1]?.split('?')[1] || 'unknown';
            message += `${idx + 1}. ${endpoint}\n`;
            message += `   Age: ${entry.age}s\n`;
            message += `   Size: ${(entry.size / 1024).toFixed(2)} KB\n\n`;
        });
    } else {
        message += `Tidak ada cache tersimpan.`;
    }
    
    alert(message);
}

// Update cache count on page load and when switching to settings
document.addEventListener('DOMContentLoaded', () => {
    // Update cache count every 5 seconds
    setInterval(updateCacheCount, 5000);
    updateCacheCount();
});


// ============ API TESTING FUNCTIONS ============

/**
 * Test Main API URL
 */
async function testMainApi() {
    const apiUrl = document.getElementById('settings-main-api').value.trim();
    const statusEl = document.getElementById('main-api-status');
    
    if (!apiUrl) {
        showApiStatus(statusEl, 'error', '❌ API URL tidak boleh kosong!');
        return;
    }
    
    // Validate URL format
    if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
        showApiStatus(statusEl, 'error', '❌ API URL harus dimulai dengan http:// atau https://');
        return;
    }
    
    showApiStatus(statusEl, 'loading', '⏳ Testing API...');
    
    try {
        // Test with ?sheet=products endpoint
        const testUrl = `${apiUrl}?sheet=products`;
        const response = await fetch(testUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data)) {
            throw new Error('Response bukan array. Pastikan sheet "products" ada di spreadsheet.');
        }
        
        showApiStatus(statusEl, 'success', `✅ API Valid! Ditemukan ${data.length} produk.`);
    } catch (error) {
        console.error('API Test Error:', error);
        showApiStatus(statusEl, 'error', `❌ API Error: ${error.message}`);
    }
}

/**
 * Test Admin API URL
 */
async function testAdminApi() {
    const apiUrl = document.getElementById('settings-admin-api').value.trim();
    const statusEl = document.getElementById('admin-api-status');
    
    if (!apiUrl) {
        showApiStatus(statusEl, 'error', '❌ API URL tidak boleh kosong!');
        return;
    }
    
    // Validate URL format
    if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
        showApiStatus(statusEl, 'error', '❌ API URL harus dimulai dengan http:// atau https://');
        return;
    }
    
    showApiStatus(statusEl, 'loading', '⏳ Testing API...');
    
    try {
        // Test with ?sheet=products endpoint
        const testUrl = `${apiUrl}?sheet=products`;
        const response = await fetch(testUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data)) {
            throw new Error('Response bukan array. Pastikan sheet "products" ada di spreadsheet.');
        }
        
        showApiStatus(statusEl, 'success', `✅ API Valid! Ditemukan ${data.length} produk.`);
    } catch (error) {
        console.error('API Test Error:', error);
        showApiStatus(statusEl, 'error', `❌ API Error: ${error.message}`);
    }
}

/**
 * Show API test status
 */
function showApiStatus(element, type, message) {
    element.classList.remove('hidden', 'bg-green-100', 'text-green-700', 'bg-red-100', 'text-red-700', 'bg-yellow-100', 'text-yellow-700');
    
    if (type === 'success') {
        element.classList.add('bg-green-100', 'text-green-700');
    } else if (type === 'error') {
        element.classList.add('bg-red-100', 'text-red-700');
    } else if (type === 'loading') {
        element.classList.add('bg-yellow-100', 'text-yellow-700');
    }
    
    element.textContent = message;
}
