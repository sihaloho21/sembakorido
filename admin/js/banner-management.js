/**
 * Banner Management Module
 * Mengelola banner promosi melalui admin panel
 */

// Global variables
let currentBannerEdit = null;

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
        
        renderBannersTable(banners);
    } catch (error) {
        console.error('❌ [BANNER-ADMIN] Error fetching banners:', error);
        
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
                            <p class="text-sm">${error.message}</p>
                            <button onclick="fetchBanners()" class="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition">Coba Lagi</button>
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

    if (banners.length === 0) {
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

    listElement.innerHTML = banners.map(banner => {
        const statusBadge = banner.status === 'active' 
            ? '<span class="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-bold">Aktif</span>'
            : '<span class="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full font-bold">Tidak Aktif</span>';
        
        let periodText = '-';
        if (banner.start_date || banner.end_date) {
            const start = banner.start_date ? new Date(banner.start_date).toLocaleDateString('id-ID') : '-';
            const end = banner.end_date ? new Date(banner.end_date).toLocaleDateString('id-ID') : '-';
            periodText = `${start} s/d ${end}`;
        }

        return `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4">
                    <img src="${banner.image_url}" alt="${banner.title || 'Banner'}" class="w-32 h-auto rounded-lg object-cover" onerror="this.src='https://placehold.co/300x100?text=Banner'">
                </td>
                <td class="px-6 py-4">
                    <div class="font-bold text-gray-800">${banner.title || '-'}</div>
                    <div class="text-sm text-gray-500 mt-1">${banner.subtitle || '-'}</div>
                    <div class="text-xs text-gray-400 mt-1">ID: ${banner.id}</div>
                </td>
                <td class="px-6 py-4">${statusBadge}</td>
                <td class="px-6 py-4">
                    <div class="text-sm text-gray-700">${periodText}</div>
                </td>
                <td class="px-6 py-4 text-right">
                    <button onclick='editBanner(${JSON.stringify(banner).replace(/'/g, "\\'")})'
                        class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition mr-2">
                        Edit
                    </button>
                    <button onclick="deleteBanner('${banner.id}')"
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

/**
 * Delete banner
 */
async function deleteBanner(bannerId) {
    if (!confirm('Apakah Anda yakin ingin menghapus banner ini?')) {
        return;
    }

    try {
        const apiUrl = CONFIG.getAdminApiUrl();
        console.log('🗑️ [BANNER-ADMIN] Deleting banner:', bannerId);
        
        const response = await fetch(`${apiUrl}/id/${bannerId}?sheet=banners`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

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

                const apiUrl = CONFIG.getAdminApiUrl();

                if (currentBannerEdit) {
                    // Update existing banner
                    console.log('📝 [BANNER-ADMIN] Updating banner:', bannerData);
                    
                    const response = await fetch(`${apiUrl}/id/${currentBannerEdit.id}?sheet=banners`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ data: bannerData })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    console.log('✅ [BANNER-ADMIN] Banner updated successfully');
                    alert('Banner berhasil diperbarui!');
                } else {
                    // Create new banner
                    console.log('➕ [BANNER-ADMIN] Creating banner:', bannerData);
                    
                    const response = await fetch(`${apiUrl}?sheet=banners`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ data: [bannerData] })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

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
