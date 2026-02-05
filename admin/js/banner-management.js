/**
 * Banner Management Module
 * Mengelola banner promosi melalui admin panel
 */

var escapeHtml = (window.AdminSanitize && window.AdminSanitize.escapeHtml) || ((value) => String(value || ''));
var escapeAttr = (window.AdminSanitize && window.AdminSanitize.escapeAttr) || ((value) => String(value || ''));
var sanitizeUrl = (window.AdminSanitize && window.AdminSanitize.sanitizeUrl) || ((url) => String(url || ''));

// Global variables
let currentBannerEdit = null;
let bannerCache = [];

/**
 * Fetch banners from SheetDB
 */
async function fetchBanners() {
    try {
        const apiUrl = CONFIG.getAdminApiUrl();
        console.log('🔄 [BANNER-ADMIN] Fetching banners from:', apiUrl);
        
        const response = await fetch(`${apiUrl}?sheet=banners`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const banners = await response.json();
        console.log('📥 [BANNER-ADMIN] Received banners:', banners);
        
        bannerCache = Array.isArray(banners) ? banners : [];
        renderBannersTable(bannerCache);
    } catch (error) {
        console.error('❌ [BANNER-ADMIN] Error fetching banners:', error);
        bannerCache = [];
        
        // Show error message
        const listElement = document.getElementById('banners-list');
        if (listElement) {
            listElement.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-8 text-center text-gray-500">
                        <div class="flex flex-col items-center gap-2">
                            <svg class="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <p class="font-medium">Gagal memuat data banner</p>
                            <p class="text-sm">${escapeHtml(error.message)}</p>
                            <button data-action="retry-fetch-banners" class="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition">Coba Lagi</button>
                        </div>
                    </td>
                </tr>
            `;
        }
    }
}

/**
 * Render banners table
 */
function renderBannersTable(banners) {
    const listElement = document.getElementById('banners-list');
    if (!listElement) return;
    bannerCache = Array.isArray(banners) ? banners : [];

    if (bannerCache.length === 0) {
        listElement.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-8 text-center text-gray-500">
                    <div class="flex flex-col items-center gap-2">
                        <svg class="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        <p class="font-medium">Belum ada banner promosi</p>
                        <p class="text-sm">Klik tombol "Tambah Banner" untuk membuat banner baru</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    listElement.innerHTML = bannerCache.map(banner => {
        const statusBadge = banner.status === 'active' 
            ? '<span class="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-bold">Aktif</span>'
            : '<span class="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full font-bold">Tidak Aktif</span>';
        
        let periodText = '-';
        if (banner.start_date || banner.end_date) {
            const start = banner.start_date ? new Date(banner.start_date).toLocaleDateString('id-ID') : '-';
            const end = banner.end_date ? new Date(banner.end_date).toLocaleDateString('id-ID') : '-';
            periodText = `${start} s/d ${end}`;
        }

        const safeTitle = escapeHtml(banner.title || '-');
        const safeSubtitle = escapeHtml(banner.subtitle || '-');
        const safeId = escapeAttr(banner.id);
        const safeImage = sanitizeUrl(banner.image_url, 'https://placehold.co/300x100?text=Banner');
        return `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4" data-label="Gambar">
                    <img src="${safeImage}" alt="${safeTitle || 'Banner'}" class="w-32 h-auto rounded-lg object-cover" data-fallback-src="https://placehold.co/300x100?text=Banner">
                </td>
                <td class="px-6 py-4" data-label="Banner">
                    <div class="font-bold text-gray-800">${safeTitle}</div>
                    <div class="text-sm text-gray-500 mt-1">${safeSubtitle}</div>
                    <div class="text-xs text-gray-400 mt-1">ID: ${safeId}</div>
                </td>
                <td class="px-6 py-4" data-label="Status">${statusBadge}</td>
                <td class="px-6 py-4" data-label="Periode">
                    <div class="text-sm text-gray-700">${periodText}</div>
                </td>
                <td class="px-6 py-4 text-right" data-label="Aksi">
                    <button data-action="edit-banner" data-id="${safeId}"
                        class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition mr-2">
                        Edit
                    </button>
                    <button data-action="delete-banner" data-id="${safeId}"
                        class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition">
                        Hapus
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Open add banner modal
 */
function openAddBannerModal() {
    currentBannerEdit = null;
    
    // Reset form
    document.getElementById('banner-form').reset();
    document.getElementById('banner-id').value = '';
    document.getElementById('form-banner-id-input').disabled = false;
    
    // Update modal title
    document.getElementById('banner-modal-title').textContent = 'Tambah Banner Promosi';
    
    // Show modal
    document.getElementById('banner-modal').classList.remove('hidden');
}

/**
 * Close banner modal
 */
function closeBannerModal() {
    document.getElementById('banner-modal').classList.add('hidden');
    currentBannerEdit = null;
}

/**
 * Edit banner
 */
function editBanner(banner) {
    currentBannerEdit = banner;
    
    // Fill form
    document.getElementById('banner-id').value = banner.id;
    document.getElementById('form-banner-id-input').value = banner.id;
    document.getElementById('form-banner-id-input').disabled = true; // Disable ID editing
    document.getElementById('form-banner-image').value = banner.image_url || '';
    document.getElementById('form-banner-title').value = banner.title || '';
    document.getElementById('form-banner-subtitle').value = banner.subtitle || '';
    document.getElementById('form-banner-cta-text').value = banner.cta_text || '';
    document.getElementById('form-banner-cta-url').value = banner.cta_url || '';
    document.getElementById('form-banner-start-date').value = banner.start_date || '';
    document.getElementById('form-banner-end-date').value = banner.end_date || '';
    document.getElementById('form-banner-status').value = banner.status || 'active';
    
    // Update modal title
    document.getElementById('banner-modal-title').textContent = 'Edit Banner Promosi';
    
    // Show modal
    document.getElementById('banner-modal').classList.remove('hidden');
}

function editBannerById(bannerId) {
    const banner = bannerCache.find(item => String(item.id) === String(bannerId));
    if (!banner) {
        alert('Banner tidak ditemukan.');
        return;
    }
    editBanner(banner);
}

function bindBannerActions() {
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-action]');
        if (!trigger) return;
        const action = trigger.dataset.action;

        if (action === 'retry-fetch-banners') {
            fetchBanners();
            return;
        }

        if (action === 'edit-banner') {
            editBannerById(trigger.dataset.id);
            return;
        }

        if (action === 'delete-banner') {
            deleteBanner(trigger.dataset.id);
        }
    });

    document.addEventListener('error', (e) => {
        const target = e.target;
        if (target && target.matches && target.matches('img[data-fallback-src]')) {
            const fallback = target.getAttribute('data-fallback-src');
            if (fallback && target.src !== fallback) {
                target.src = fallback;
            }
        }
    }, true);
}

/**
 * Delete banner
 */
async function deleteBanner(bannerId) {
    if (!confirm('Apakah Anda yakin ingin menghapus banner ini?')) {
        return;
    }

    try {
        console.log('🗑️ [BANNER-ADMIN] Deleting banner:', bannerId);
        
        await GASActions.delete('banners', bannerId);

        console.log('✅ [BANNER-ADMIN] Banner deleted successfully');
        alert('Banner berhasil dihapus!');
        
        // Refresh list
        await fetchBanners();
    } catch (error) {
        console.error('❌ [BANNER-ADMIN] Error deleting banner:', error);
        alert('Gagal menghapus banner: ' + error.message);
    }
}

/**
 * Handle banner form submission
 */
document.addEventListener('DOMContentLoaded', () => {
    bindBannerActions();
    const bannerForm = document.getElementById('banner-form');
    if (bannerForm) {
        bannerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('banner-submit-btn');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Menyimpan...';

            try {
                const bannerId = document.getElementById('form-banner-id-input').value.trim();
                const bannerData = {
                    id: bannerId,
                    image_url: document.getElementById('form-banner-image').value.trim(),
                    title: document.getElementById('form-banner-title').value.trim(),
                    subtitle: document.getElementById('form-banner-subtitle').value.trim(),
                    cta_text: document.getElementById('form-banner-cta-text').value.trim(),
                    cta_url: document.getElementById('form-banner-cta-url').value.trim(),
                    start_date: document.getElementById('form-banner-start-date').value,
                    end_date: document.getElementById('form-banner-end-date').value,
                    status: document.getElementById('form-banner-status').value
                };

                if (currentBannerEdit) {
                    // Update existing banner
                    console.log('📝 [BANNER-ADMIN] Updating banner:', bannerData);
                    
                    await GASActions.update('banners', currentBannerEdit.id, bannerData);

                    console.log('✅ [BANNER-ADMIN] Banner updated successfully');
                    alert('Banner berhasil diperbarui!');
                } else {
                    // Create new banner - ensure ID is present
                    if (!bannerId) {
                        bannerData.id = Date.now().toString();
                    }
                    console.log('➕ [BANNER-ADMIN] Creating banner:', bannerData);
                    
                    await GASActions.create('banners', bannerData);

                    console.log('✅ [BANNER-ADMIN] Banner created successfully');
                    alert('Banner berhasil ditambahkan!');
                }

                // Close modal and refresh
                closeBannerModal();
                await fetchBanners();

            } catch (error) {
                console.error('❌ [BANNER-ADMIN] Error saving banner:', error);
                alert('Gagal menyimpan banner: ' + error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }
});
