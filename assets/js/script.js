/**
 * Get API URL from localStorage (set by admin) or fallback to CONFIG
 * This allows admin to change API dynamically without code changes
 */
function getApiUrl() {
    // Use CONFIG.getMainApiUrl() which handles localStorage with correct key
    const apiUrl = CONFIG.getMainApiUrl();
    console.log('Using API URL:', apiUrl);
    return apiUrl;
}

let API_URL = getApiUrl();

/**
 * Refresh API_URL from localStorage and reload data
 * Call this after admin saves new API settings
 */
function refreshApiUrl() {
    const oldApiUrl = API_URL;
    API_URL = getApiUrl();
    console.log('Old API URL:', oldApiUrl);
    console.log('New API URL:', API_URL);
    
    if (oldApiUrl !== API_URL) {
        console.log('🔄 API URL changed, clearing cache and reloading...');
        // Cache sudah di-clear oleh CONFIG.setMainApiUrl()
        // Tapi kita clear lagi untuk memastikan
        if (typeof ApiService !== 'undefined') {
            ApiService.clearCache();
        }
    }
    
    // Reload products dengan API URL baru
    fetchProducts();
}

let cart = JSON.parse(localStorage.getItem('sembako_cart')) || [];
let allProducts = [];
let currentCategory = 'Semua';
let currentPage = 1;
const itemsPerPage = 12;
let filteredProducts = [];
let storeClosed = CONFIG.isStoreClosed();
let selectedVariation = null;

/**
 * Normalize phone number to standard format (08xxxxxxxxxx)
 * Handles: 8xxx, 08xxx, 628xxx, +628xxx
 */
function normalizePhoneNumber(phone) {
    if (!phone) return null;
    
    // Remove all non-digits
    let cleaned = String(phone).replace(/[^0-9]/g, '');
    
    // Handle 628xxx → 08xxx
    if (cleaned.startsWith('62')) {
        cleaned = '0' + cleaned.substring(2);
    }
    
    // Handle 8xxx → 08xxx
    if (cleaned.startsWith('8') && !cleaned.startsWith('08')) {
        cleaned = '0' + cleaned;
    }
    
    // Validate format
    if (!cleaned.startsWith('08') || cleaned.length < 10 || cleaned.length > 13) {
        return null; // Invalid
    }
    
    return cleaned;
}

// calculateGajianPrice is now handled in assets/js/payment-logic.js

/**
 * Creates a URL-friendly slug from a string.
 * e.g., "Paket Hemat Beras 5kg" -> "paket-hemat-beras-5kg"
 */
function createSlug(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Remove special characters
        .trim()
        .replace(/[-\s]+/g, '-'); // Replace spaces and multiple hyphens with single hyphen
}

async function fetchProducts() {
    try {
        // Use ApiService with caching (5 minutes)
        const products = await ApiService.get('?sheet=products', {
            cacheDuration: 5 * 60 * 1000 // 5 minutes cache
        });
        console.log('Products received:', products);
        
        allProducts = products.map(p => {
            const cashPrice = parseInt(p.harga) || 0;
            // ✅ Add safety check for calculateGajianPrice
            const gajianInfo = typeof calculateGajianPrice === 'function' 
                ? calculateGajianPrice(cashPrice)
                : { price: cashPrice, daysLeft: 0, markupPercent: 0 };
            
            let category = p.kategori || 'Bahan Pokok';
            if (!p.kategori) {
                if (cashPrice >= 150000) category = 'Paket Lengkap';
                else if (cashPrice >= 50000) category = 'Paket Hemat';
            }
            
            const defaultDesc = "Kualitas Terjamin, Stok Selalu Baru, Harga Kompetitif";
            
            // Phase 1 & 2: Parse variations
            let variations = [];
            if (p.variasi) {
                try {
                    variations = JSON.parse(p.variasi);
                } catch (e) {
                    console.error('Error parsing variations for product:', p.id, e);
                }
            }

            return {
                ...p,
                harga: cashPrice,
                hargaCoret: parseInt(p.harga_coret) || 0,
                hargaGajian: gajianInfo.price,
                stok: parseInt(p.stok) || 0,
                category: category,
                deskripsi: (p.deskripsi && p.deskripsi.trim() !== "") ? p.deskripsi : defaultDesc,
                variations: variations,
                slug: createSlug(p.nama) // Add slug for deep linking
            };
        });
        filterProducts();
        updateCartUI();
        checkStoreStatus();
        startNotificationLoop();
    } catch (error) {
        console.error('Error fetching products:', error);
        const grid = document.getElementById('product-grid');
        if (grid) {
            grid.innerHTML = '<p class="text-center col-span-full text-red-500">Gagal memuat produk. Silakan coba lagi nanti.</p>';
        }
    }
}

/**
 * Finds a product in the allProducts array by its slug.
 * @param {string} slug - The URL-friendly slug of the product
 * @returns {Object|null} The product object if found, null otherwise
 */
function findProductBySlug(slug) {
    if (!slug || !allProducts || allProducts.length === 0) {
        return null;
    }
    return allProducts.find(p => p.slug === slug);
}

function renderProducts(products) {
    const grid = document.getElementById('product-grid');
    if (!grid) return;
    
    if (products.length === 0) {
        grid.innerHTML = '<p class="text-center col-span-full text-gray-500 py-10">Tidak ada produk yang ditemukan.</p>';
        document.getElementById('pagination-container').innerHTML = '';
        return;
    }

    // Pagination Logic
    const totalPages = Math.ceil(products.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;
    
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedProducts = products.slice(start, end);
    
    grid.innerHTML = '';
    paginatedProducts.forEach(p => {
        let stokLabel = '';
        if (p.stok > 5) {
            stokLabel = `<span class="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-bold">Stok Tersedia</span>`;
        } else if (p.stok > 0) {
            stokLabel = `<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full font-bold">Stok Terbatas (${p.stok})</span>`;
        } else {
            stokLabel = `<span class="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold">Stok Habis</span>`;
        }

        const pData = JSON.stringify(p).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const images = p.gambar ? p.gambar.split(',') : [];
        const mainImage = images[0] || 'https://placehold.co/300x200?text=Produk';

        const rewardPoints = calculateRewardPoints(p.harga, p.nama);
        
        // Parse wholesale pricing
        let grosirGridHtml = '';
        let hasGrosir = false;
        if (p.grosir) {
            try {
                const tiers = JSON.parse(p.grosir);
                if (Array.isArray(tiers) && tiers.length > 0) {
                    hasGrosir = true;
                    const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
                    const gridItems = sortedTiers.map(t => `
                        <div class="bg-green-50 border border-green-100 rounded-lg p-1.5 text-center">
                            <p class="text-[8px] text-green-600 font-bold uppercase leading-tight">Min. ${t.min_qty}</p>
                            <p class="text-[10px] text-green-700 font-black">Rp ${t.price.toLocaleString('id-ID')}</p>
                        </div>
                    `).join('');
                    grosirGridHtml = `
                        <div class="grid grid-cols-3 gap-2 mb-3">
                            ${gridItems}
                        </div>
                    `;
                }
            } catch (e) {
                console.error('Error parsing grosir data for product:', p.id, e);
            }
        }

        let hargaCoretHtml = '';
        if (p.hargaCoret > p.harga) {
            const diskon = Math.round(((p.hargaCoret - p.harga) / p.hargaCoret) * 100);
            hargaCoretHtml = `
                <div class="flex items-center gap-1 mb-0.5">
                    <span class="text-[10px] text-gray-400 line-through">Rp ${p.hargaCoret.toLocaleString('id-ID')}</span>
                    <span class="bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded font-bold">-${diskon}%</span>
                </div>
            `;
        }

        const hasVariations = p.variations && p.variations.length > 0;

        const productId = p.id || p.sku;
        const isLiked = isProductInWishlist(productId);
        const heartIcon = isLiked 
            ? '<svg class="w-5 h-5 text-red-500 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
            : '<svg class="w-5 h-5 text-gray-400 hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>';

        grid.innerHTML += `
            <div class="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition duration-300 relative">
                <!-- Wishlist Heart Button -->
                <button id="wishlist-btn-${productId}" onclick="toggleWishlist('${productId}'); event.stopPropagation();" class="absolute top-3 right-3 z-20 p-2 bg-white/90 hover:bg-white rounded-full shadow-md transition active:scale-95">
                    ${heartIcon}
                </button>
                <div class="absolute top-3 left-3 z-10 flex flex-col gap-2">
                    <div class="bg-amber-400 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm flex items-center gap-1">
                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                        +${rewardPoints} Poin
                    </div>
                    ${hasGrosir ? `
                    <div class="bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7c.78.78.78 2.047 0 2.828l-7 7c-.78.78-2.047.78-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path></svg>
                        Harga Grosir Tersedia
                    </div>
                    ` : ''}
                </div>
                <div class="lazy-image-wrapper">
                    <div class="skeleton skeleton-product-image"></div>
                    <img src="${mainImage}" alt="${p.nama}" onclick='showDetail(${pData})' class="w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity ${p.stok === 0 ? 'grayscale opacity-60' : ''}" loading="lazy" onerror="this.src='https://placehold.co/300x200?text=Produk'" onload="this.classList.add('loaded'); this.previousElementSibling.style.display='none';">
                </div>
                <div class="p-6">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="text-lg font-bold text-gray-800">${p.nama}</h4>
                        ${stokLabel}
                    </div>
                    <div class="flex justify-between items-center mb-4">
                        <button onclick="shareProduct('${p.nama}')" class="text-green-600 hover:text-green-700 flex items-center gap-1 text-xs font-medium">
                            <span>Share</span>
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.432 5.631 1.433h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        </button>
                    </div>
                    <div class="grid grid-cols-2 gap-4 mb-6">
                        <div class="bg-green-50 p-3 rounded-lg">
                            <p class="text-[10px] text-green-600 font-bold uppercase">Harga Cash</p>
                            <div class="flex flex-col">
                                ${hargaCoretHtml}
                                <p class="text-lg font-bold text-green-700">Rp ${p.harga.toLocaleString('id-ID')}</p>
                            </div>
                        </div>
                        <div class="bg-blue-50 p-3 rounded-lg">
                            <p class="text-[10px] text-blue-600 font-bold uppercase">Bayar Gajian</p>
                            <div class="flex flex-col">
                                <p class="text-[8px] text-blue-400 mb-0.5">Harga Per Tgl ${new Date().toLocaleDateString('id-ID', {day: '2-digit', month: '2-digit', year: 'numeric'}).replace(/\//g, '-')}</p>
                                <p class="text-lg font-bold text-blue-700">Rp ${p.hargaGajian.toLocaleString('id-ID')}</p>
                            </div>
                        </div>
                    </div>
                    ${grosirGridHtml}
                    ${hasVariations ? `
                    <button onclick='showDetail(${pData}); event.stopPropagation();' class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 mb-3">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                        Pilih Variasi
                    </button>
                    ` : `
                    <button onclick='addToCart(${pData}, event)' ${p.stok === 0 ? 'disabled' : ''} class="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 mb-3">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        Tambah ke Keranjang
                    </button>
                    `}
                    <div class="grid grid-cols-2 gap-2">
                        <button onclick='showDetail(${pData}); event.stopPropagation();' class="bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2 rounded-lg text-sm transition">Rincian</button>
                        <button onclick='directOrder(${pData}); event.stopPropagation();' ${p.stok === 0 ? 'disabled' : ''} class="bg-green-100 hover:bg-green-200 text-green-700 font-bold py-2 rounded-lg text-sm transition">Beli Sekarang</button>
                    </div>

                </div>
            </div>
        `;
    });
}

function filterProducts() {
    const query = document.getElementById('search-input').value.toLowerCase();
    filteredProducts = allProducts.filter(p => {
        const matchesSearch = p.nama.toLowerCase().includes(query) || 
                            (p.deskripsi && p.deskripsi.toLowerCase().includes(query));
        const matchesCategory = currentCategory === 'Semua' || p.category === currentCategory;
        return matchesSearch && matchesCategory;
    });
    currentPage = 1; // Reset to first page on filter
    renderProducts(filteredProducts);
    renderPagination(filteredProducts.length);
}

function renderPagination(totalItems) {
    const container = document.getElementById('pagination-container');
    if (!container) return;

    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    
    // Previous Arrow
    html += `
        <button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} 
            class="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-gray-200 text-gray-600 hover:border-green-500 hover:text-green-600 disabled:opacity-30 disabled:cursor-not-allowed transition">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>
    `;

    // Page Numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `
                <button onclick="changePage(${i})" 
                    class="w-10 h-10 flex items-center justify-center rounded-lg border-2 font-bold transition ${i === currentPage ? 'bg-green-600 border-green-600 text-white' : 'border-gray-200 text-gray-600 hover:border-green-500 hover:text-green-600'}">
                    ${i}
                </button>
            `;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span class="text-gray-400">...</span>`;
        }
    }

    // Next Arrow
    html += `
        <button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} 
            class="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-gray-200 text-gray-600 hover:border-green-500 hover:text-green-600 disabled:opacity-30 disabled:cursor-not-allowed transition">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
        </button>
    `;

    container.innerHTML = html;
}

function changePage(page) {
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    renderProducts(filteredProducts);
    renderPagination(filteredProducts.length);
    
    // Scroll to top of catalog
    document.getElementById('katalog').scrollIntoView({ behavior: 'smooth' });
}

function setCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.innerText === cat) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    filterProducts();
}

function addToCart(p, event, qty = 1) {
    if (storeClosed) {
        showStoreWarning(() => {
            proceedAddToCart(p, event, qty);
        });
        return;
    }
    proceedAddToCart(p, event, qty);
}

function proceedAddToCart(p, event, qty = 1) {
    // If product has variations and none selected, show detail
    if (p.variations && p.variations.length > 0 && !selectedVariation) {
        showDetail(p);
        return;
    }

    const itemToAdd = { ...p };
    if (selectedVariation) {
        itemToAdd.selectedVariation = selectedVariation;
        itemToAdd.harga = selectedVariation.harga;
        itemToAdd.sku = selectedVariation.sku;
        itemToAdd.stok = selectedVariation.stok;
        // Recalculate gajian price for variation
        const gajianInfo = typeof calculateGajianPrice === 'function'
            ? calculateGajianPrice(selectedVariation.harga)
            : { price: selectedVariation.harga, daysLeft: 0, markupPercent: 0 };
        itemToAdd.hargaGajian = gajianInfo.price;
    }

    const existing = cart.find(item => {
        const sameId = item.id === itemToAdd.id;
        const sameVariation = (!item.selectedVariation && !itemToAdd.selectedVariation) || 
                             (item.selectedVariation && itemToAdd.selectedVariation && item.selectedVariation.sku === itemToAdd.selectedVariation.sku);
        return sameId && sameVariation;
    });

    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({ ...itemToAdd, qty: qty });
    }
    
    saveCart();
    updateCartUI();
    
    // Reset selected variation after adding to cart
    selectedVariation = null;

    // Fly to cart animation
    if (event && event.currentTarget) {
        const btn = event.currentTarget;
        const card = btn.closest('.bg-white') || document.getElementById('detail-modal');
        const img = card.querySelector('img');
        const cartBtn = document.querySelector('header button');
        
        if (img && cartBtn) {
            const imgRect = img.getBoundingClientRect();
            const cartRect = cartBtn.getBoundingClientRect();
            
            const flyImg = document.createElement('img');
            flyImg.src = img.src;
            flyImg.className = 'fly-item';
            flyImg.style.top = `${imgRect.top}px`;
            flyImg.style.left = `${imgRect.left}px`;
            flyImg.style.width = `${imgRect.width}px`;
            flyImg.style.height = `${imgRect.height}px`;
            flyImg.style.borderRadius = '12px';
            
            document.body.appendChild(flyImg);
            
            // Trigger animation
            requestAnimationFrame(() => {
                flyImg.style.top = `${cartRect.top + cartRect.height / 2}px`;
                flyImg.style.left = `${cartRect.left + cartRect.width / 2}px`;
                flyImg.style.width = '20px';
                flyImg.style.height = '20px';
                flyImg.style.opacity = '0.5';
                flyImg.style.borderRadius = '50%';
            });
            
            setTimeout(() => {
                flyImg.remove();
                cartBtn.classList.add('cart-pop');
                setTimeout(() => cartBtn.classList.remove('cart-pop'), 400);
            }, 800);
        }
    } else {
        // Fallback if no event (e.g. from modal)
        const cartBtn = document.querySelector('header button');
        if (cartBtn) {
            cartBtn.classList.add('cart-pop');
            setTimeout(() => cartBtn.classList.remove('cart-pop'), 400);
        }
    }

    // Show Toast
    showToast(`${itemToAdd.nama}${itemToAdd.selectedVariation ? ' (' + itemToAdd.selectedVariation.nama + ')' : ''} ditambahkan ke keranjang`);
}

function showToast(message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showSuccessNotification(orderId, waUrl) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] animate-fade-in';
    overlay.style.animation = 'fadeIn 0.3s ease-out';
    
    // Create notification card
    const notification = document.createElement('div');
    notification.className = 'bg-white rounded-2xl shadow-2xl p-8 max-w-sm mx-4 text-center transform scale-95 relative';
    notification.style.animation = 'scaleIn 0.3s ease-out forwards';
    
    notification.innerHTML = `
        <button onclick="this.closest('.fixed').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition p-1 rounded-full hover:bg-gray-100">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </button>
        <div class="mb-4">
            <div class="w-32 h-32 flex items-center justify-center mx-auto mb-4">
                <img src="assets/images/success-shield.gif" alt="Success" class="w-full h-full object-contain">
            </div>
            <h3 class="text-2xl font-bold text-gray-800 mb-2">Pesanan Berhasil Dikirim!</h3>
            <p class="text-gray-600 mb-4">Order ID: <span class="font-mono font-semibold text-green-600">${orderId}</span></p>
            <p class="text-sm text-gray-500 mb-6">Pesanan Anda telah tercatat dan akan segera diproses. Silakan lanjutkan ke WhatsApp untuk konfirmasi.</p>
        </div>
        <a href="${waUrl}" target="_blank" class="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-xl transition shadow-lg flex items-center justify-center gap-3 mt-4">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.432 5.631 1.433h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            <span>Lanjut ke WhatsApp</span>
        </a>
    `;
    
    overlay.appendChild(notification);
    document.body.appendChild(overlay);
    
    // Add CSS animations if not exist
    if (!document.getElementById('success-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'success-notification-styles';
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes scaleIn {
                from { transform: scale(0.95); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            @keyframes successCircle {
                0% {
                    transform: scale(0);
                    opacity: 0;
                }
                50% {
                    transform: scale(1.1);
                }
                100% {
                    transform: scale(1);
                    opacity: 1;
                }
            }
            @keyframes successCheck {
                0% {
                    stroke-dashoffset: 50;
                    opacity: 0;
                }
                50% {
                    opacity: 1;
                }
                100% {
                    stroke-dashoffset: 0;
                }
            }
            @keyframes bounce {
                0%, 100% {
                    transform: translateY(0);
                }
                50% {
                    transform: translateY(-10px);
                }
            }
            .animate-success-circle {
                animation: successCircle 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            }
            .animate-success-check {
                animation: successCheck 0.6s ease-in-out 0.3s forwards, bounce 0.6s ease-in-out 0.9s;
            }
            .checkmark-path {
                stroke-dasharray: 50;
                stroke-dashoffset: 50;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Allow manual close by clicking overlay
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => overlay.remove(), 300);
        }
    });
}

function saveCart() {
    localStorage.setItem('sembako_cart', JSON.stringify(cart));
}

function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const countEl = document.getElementById('cart-count');
    
    if (countEl) {
        if (count > 0) {
            countEl.innerText = count;
            countEl.classList.remove('hidden');
        } else {
            countEl.classList.add('hidden');
        }
    }

    const itemsContainer = document.getElementById('cart-items');
    const footer = document.getElementById('cart-footer');
    const empty = document.getElementById('cart-empty');

    if (!itemsContainer) return;

    if (cart.length === 0) {
        itemsContainer.innerHTML = '';
        if (footer) footer.classList.add('hidden');
        if (empty) empty.classList.remove('hidden');
    } else {
        if (empty) empty.classList.add('hidden');
        if (footer) footer.classList.remove('hidden');
        
        let total = 0;
        itemsContainer.innerHTML = cart.map((item, index) => {
            // Calculate tiered price
            const effectivePrice = calculateTieredPrice(item.harga, item.qty, item.grosir);
            const isGrosir = effectivePrice < item.harga;
            const itemTotal = effectivePrice * item.qty;
            total += itemTotal;
            
            const images = item.gambar ? item.gambar.split(',') : [];
            let mainImage = images[0] || 'https://placehold.co/100x100?text=Produk';
            if (item.selectedVariation && item.selectedVariation.gambar) {
                mainImage = item.selectedVariation.gambar;
            }
            return `
                <div class="flex items-center gap-4 bg-gray-50 p-3 rounded-xl">
                    <img src="${mainImage}" class="w-16 h-16 object-cover rounded-lg">
                    <div class="flex-1">
                        <h5 class="font-bold text-gray-800 text-sm">${item.nama}${item.selectedVariation ? ' (' + item.selectedVariation.nama + ')' : ''}</h5>
                        <div class="flex flex-col">
                            ${isGrosir ? `<span class="text-[10px] text-gray-400 line-through">Rp ${item.harga.toLocaleString('id-ID')}</span>` : ''}
                            <p class="text-green-600 font-bold text-xs">Rp ${effectivePrice.toLocaleString('id-ID')} ${isGrosir ? '<span class="bg-green-100 text-green-700 text-[8px] px-1 rounded ml-1">Grosir</span>' : ''}</p>
                        </div>
                        <div class="flex items-center gap-3 mt-2">
                            <button onclick="updateQty(${index}, -1)" class="w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-500">-</button>
                            <span class="text-sm font-bold">${item.qty}</span>
                            <button onclick="updateQty(${index}, 1)" class="w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-500">+</button>
                        </div>
                    </div>
                    <button onclick="removeItem(${index})" class="text-red-400 hover:text-red-600">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            `;
        }).join('');
        const totalEl = document.getElementById('cart-total');
        if (totalEl) totalEl.innerText = `Rp ${total.toLocaleString('id-ID')}`;
    }
}

function updateQty(index, delta) {
    cart[index].qty += delta;
    if (cart[index].qty < 1) {
        cart.splice(index, 1);
    }
    saveCart();
    updateCartUI();
}

function removeItem(index) {
    cart.splice(index, 1);
    saveCart();
    updateCartUI();
}

function openCartModal() {
    const modal = document.getElementById('cart-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.classList.add('modal-active');
    }
}

function closeCartModal() {
    const modal = document.getElementById('cart-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-active');
    }
}

function updateModalQty(delta) {
    const qtyInput = document.getElementById('modal-qty');
    if (!qtyInput) return;
    
    let qty = parseInt(qtyInput.value) || 1;
    qty += delta;
    if (qty < 1) qty = 1;
    qtyInput.value = qty;
    
    // Trigger the oninput handler to update UI
    qtyInput.oninput({ target: qtyInput });
}

function showDetail(p) {
    // Tutup modal wishlist jika sedang terbuka agar tidak menumpuk
    closeWishlistModal();
    
    console.log('showDetail called for product:', p.nama);
    const modal = document.getElementById('detail-modal');
    if (!modal) return;

    // Reset selected variation and quantity when opening modal
    selectedVariation = null;
    const qtyInput = document.getElementById('modal-qty');
    if (qtyInput) qtyInput.value = 1;

    const nameEl = document.getElementById('modal-product-name');
    const imageEl = document.getElementById('modal-product-image');
    const cashPriceEl = document.getElementById('modal-cash-price');
    const gajianPriceEl = document.getElementById('modal-gajian-price');
    const priceDateEl = document.getElementById('modal-price-date');
    const itemsListEl = document.getElementById('modal-items-list');
    const badgesEl = document.getElementById('modal-badges');
    const savingsHighlight = document.getElementById('savings-highlight');
    const savingsAmount = document.getElementById('savings-amount');
    const variationContainer = document.getElementById('modal-variation-container');

    if (nameEl) nameEl.innerText = p.nama;
    
    // 1. Setup Quantity Listener FIRST
    // qtyInput already declared above
    if (qtyInput) {
        qtyInput.oninput = (e) => {
            const qty = parseInt(e.target.value) || 1;
            
            // If variation is selected, use variation price, otherwise use base product price
            const basePrice = selectedVariation ? selectedVariation.harga : p.harga;
            const grosirData = selectedVariation ? selectedVariation.grosir : p.grosir;
            const coretPrice = selectedVariation ? (selectedVariation.harga_coret || 0) : (p.hargaCoret || 0);

            if (typeof updateTieredPricingUI === 'function') {
                updateTieredPricingUI({ ...p, harga: basePrice, grosir: grosirData }, qty);
            }
            
            // Calculate tiered price per unit
            const effectivePricePerUnit = typeof calculateTieredPrice === 'function' ? calculateTieredPrice(basePrice, qty, grosirData) : basePrice;
            
            // Calculate TOTAL prices (unit price × quantity)
            const totalCashPrice = effectivePricePerUnit * qty;
            
            // Calculate gajian price per unit, then multiply by quantity
            const gajianInfo = typeof calculateGajianPrice === 'function' ? calculateGajianPrice(effectivePricePerUnit) : { price: effectivePricePerUnit };
            const totalGajianPrice = gajianInfo.price * qty;
            
            // Update display with TOTAL prices
            updateModalPrices(totalCashPrice, totalGajianPrice, coretPrice * qty);
        };
    }

    // 2. Handle Variations UI
    if (variationContainer) {
        if (p.variations && p.variations.length > 0) {
            variationContainer.classList.remove('hidden');
            const variationList = document.getElementById('modal-variation-list');
            variationList.innerHTML = p.variations.map((v, idx) => `
	                <button onclick='selectVariation(${JSON.stringify(v).replace(/'/g, "\\'").replace(/"/g, "&quot;")}, ${idx})' class="variation-btn border-2 border-gray-200 rounded-xl p-3 text-left transition hover:border-green-500 focus:outline-none" data-index="${idx}">
                    <p class="text-xs font-bold text-gray-800">${v.nama}</p>
                    <p class="text-[10px] text-green-600 font-bold">Rp ${v.harga.toLocaleString('id-ID')}</p>
                    ${v.stok <= 0 ? '<p class="text-[8px] text-red-500 font-bold">Stok Habis</p>' : ''}
                </button>
            `).join('');
            
            // Select first variation by default
            selectVariation(p.variations[0], 0);
        } else {
            variationContainer.classList.add('hidden');
            updateModalPrices(p.harga, p.hargaGajian, p.hargaCoret);
        }
    } else {
        updateModalPrices(p.harga, p.hargaGajian, p.hargaCoret);
    }

    if (priceDateEl) {
        priceDateEl.innerText = `Harga Per Tgl ${new Date().toLocaleDateString('id-ID', {day: '2-digit', month: '2-digit', year: 'numeric'}).replace(/\//g, '-')}`;
    }

    if (badgesEl) {
        badgesEl.innerHTML = `
            <span class="bg-green-100 text-green-700 text-[10px] px-2.5 py-1 rounded-lg font-bold">${p.category}</span>
            ${p.stok > 0 ? 
                `<span class="bg-blue-100 text-blue-700 text-[10px] px-2.5 py-1 rounded-lg font-bold">Stok: ${p.stok}</span>` : 
                `<span class="bg-red-100 text-red-700 text-[10px] px-2.5 py-1 rounded-lg font-bold">Stok Habis</span>`
            }
        `;
    }

    // Initialize Image Slider
    const images = p.gambar ? p.gambar.split(',') : [];
    if (typeof initializeSlider === 'function') {
        initializeSlider(images);
    } else if (imageEl) {
        imageEl.src = images.length > 0 ? images[0] : 'https://placehold.co/300x200?text=Produk';
        imageEl.onerror = function() { this.src = 'https://placehold.co/300x200?text=Produk'; };
    }

    if (itemsListEl) {
        const items = p.deskripsi.split('\n').filter(i => i.trim() !== "");
        const icons = ['🍜', '🍲', '📦', '☕', '🍚', '🍳', '🧂'];
        itemsListEl.innerHTML = items.map((item, idx) => `
            <div class="flex items-center gap-4 bg-gray-50/50 p-3 rounded-xl border border-gray-100/50">
                <span class="text-xl">${icons[idx % icons.length]}</span>
                <span class="text-sm font-medium text-gray-700">${item.trim()}</span>
            </div>
        `).join('');
    }

    // 3. Initial UI Update
    if (typeof updateTieredPricingUI === 'function') {
        updateTieredPricingUI(p, 1);
    }

    modal.classList.remove('hidden');
    document.body.classList.add('modal-active');
}

function selectVariation(v, index) {
    selectedVariation = v;
    
    // Update UI for selected button
    document.querySelectorAll('.variation-btn').forEach((btn, i) => {
        if (i === index) {
            btn.classList.add('border-green-500', 'bg-green-50');
            btn.classList.remove('border-gray-200');
        } else {
            btn.classList.remove('border-green-500', 'bg-green-50');
            btn.classList.add('border-gray-200');
        }
    });

    // Update product image if variation has custom image
    if (v.gambar && typeof initializeSlider === 'function') {
        // Re-initialize slider with variant image
        const variantImages = v.gambar.split(',');
        initializeSlider(variantImages);
    }

    // Trigger quantity update to recalculate prices with the new variation
    const qtyInput = document.getElementById('modal-qty');
    if (qtyInput) {
        qtyInput.oninput({ target: qtyInput });
    } else {
        // Fallback if qtyInput is not found
        const gajianInfo = typeof calculateGajianPrice === 'function'
            ? calculateGajianPrice(v.harga)
            : { price: v.harga, daysLeft: 0, markupPercent: 0 };
        updateModalPrices(v.harga, gajianInfo.price, v.harga_coret || 0);
    }
}

function updateModalPrices(cash, gajian, coret) {
    const cashPriceEl = document.getElementById('modal-cash-price');
    const gajianPriceEl = document.getElementById('modal-gajian-price');
    const savingsHighlight = document.getElementById('savings-highlight');
    const savingsAmount = document.getElementById('savings-amount');

    if (cashPriceEl) cashPriceEl.innerText = `Rp ${cash.toLocaleString('id-ID')}`;
    if (gajianPriceEl) gajianPriceEl.innerText = `Rp ${gajian.toLocaleString('id-ID')}`;

    if (coret > cash) {
        if (savingsHighlight) savingsHighlight.classList.remove('hidden');
        if (savingsAmount) savingsAmount.innerText = `Rp ${(coret - cash).toLocaleString('id-ID')}`;
    } else {
        if (savingsHighlight) savingsHighlight.classList.add('hidden');
    }
}

function closeDetailModal() {
    const modal = document.getElementById('detail-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-active');
    }
    selectedVariation = null;
}

function directOrder(p) {
    if (storeClosed) {
        showStoreWarning(() => {
            proceedDirectOrder(p);
        });
        return;
    }
    proceedDirectOrder(p);
}

function proceedDirectOrder(p) {
    // If product has variations and none selected, show detail
    if (p.variations && p.variations.length > 0 && !selectedVariation) {
        showDetail(p);
        return;
    }

    const itemToAdd = { ...p };
    if (selectedVariation) {
        itemToAdd.selectedVariation = selectedVariation;
        itemToAdd.harga = selectedVariation.harga;
        itemToAdd.sku = selectedVariation.sku;
        itemToAdd.stok = selectedVariation.stok;
        const gajianInfo = typeof calculateGajianPrice === 'function'
            ? calculateGajianPrice(selectedVariation.harga)
            : { price: selectedVariation.harga, daysLeft: 0, markupPercent: 0 };
        itemToAdd.hargaGajian = gajianInfo.price;
    }

    // Get quantity from modal input (default to 1 if not found)
    const qtyInput = document.getElementById('modal-qty');
    const quantity = qtyInput ? parseInt(qtyInput.value) || 1 : 1;

    cart = [{ ...itemToAdd, qty: quantity }];
    saveCart();
    updateCartUI();
    openOrderModal();
    selectedVariation = null;
}

function directOrderFromModal() {
    const name = document.getElementById('modal-product-name').innerText;
    const product = allProducts.find(p => p.nama === name);
    if (product) {
        directOrder(product);
        closeDetailModal();
    }
}

// ============ STORE CLOSED LOGIC ============
function checkStoreStatus() {
    storeClosed = CONFIG.isStoreClosed();
    const banner = document.getElementById('store-closed-banner');
    const header = document.getElementById('main-header');
    
    if (storeClosed) {
        if (banner) banner.classList.remove('hidden');
        if (header) header.style.top = '36px';
        
        // Show modal only once per session
        if (!sessionStorage.getItem('store_closed_modal_shown')) {
            setTimeout(() => {
                document.getElementById('store-closed-modal').classList.remove('hidden');
                sessionStorage.setItem('store_closed_modal_shown', 'true');
            }, 1000);
        }
    } else {
        if (banner) banner.classList.add('hidden');
        if (header) header.style.top = '0';
    }
}

function closeStoreClosedModal() {
    document.getElementById('store-closed-modal').classList.add('hidden');
}

function showStoreWarning(onConfirm) {
    const modal = document.getElementById('store-warning-modal');
    const confirmBtn = document.getElementById('confirm-store-warning');
    
    modal.classList.remove('hidden');
    
    // Use a new function to avoid multiple event listeners
    confirmBtn.onclick = () => {
        modal.classList.add('hidden');
        if (onConfirm) onConfirm();
    };
}

function closeStoreWarningModal() {
    document.getElementById('store-warning-modal').classList.add('hidden');
}

function openOrderModal() {
    if (cart.length === 0) return;
    
    closeCartModal();
    
    // Update Order Summary
    const summaryEl = document.getElementById('order-summary');
    const payEl = document.querySelector('input[name="pay-method"]:checked');
    const isGajian = payEl && payEl.value === 'Bayar Gajian';
    
    if (summaryEl) {
        let totalPoints = 0;
        summaryEl.innerHTML = cart.map(item => {
            const price = isGajian ? item.hargaGajian : item.harga;
            const effectivePrice = calculateTieredPrice(price, item.qty, item.grosir);
            const isGrosir = effectivePrice < price;
            
            // Points are always calculated based on the base cash price for fairness
            // Use variation price for points if it's a variant
            const itemPoints = calculateRewardPoints(item.harga, item.nama) * item.qty;
            totalPoints += itemPoints;
            return `
                <div class="flex justify-between items-center py-1">
                    <div class="flex flex-col">
                        <span class="font-medium">${item.nama}${item.selectedVariation ? ' (' + item.selectedVariation.nama + ')' : ''} (x${item.qty})</span>
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                                +${itemPoints.toFixed(1)} Poin
                            </span>
                            ${isGrosir ? '<span class="bg-green-100 text-green-700 text-[8px] px-1 rounded font-bold">Harga Grosir</span>' : ''}
                        </div>
                    </div>
                    <div class="flex flex-col items-end">
                        ${isGrosir ? `<span class="text-[10px] text-gray-400 line-through">Rp ${(price * item.qty).toLocaleString('id-ID')}</span>` : ''}
                        <span class="font-bold">Rp ${(effectivePrice * item.qty).toLocaleString('id-ID')}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add total points to summary
        summaryEl.innerHTML += `
            <div class="border-t border-dashed border-gray-200 mt-2 pt-2 flex justify-between items-center">
                <span class="text-xs font-bold text-amber-700">Total Poin Didapat:</span>
                <span class="text-sm font-black text-amber-700 flex items-center gap-1">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                    ${totalPoints.toFixed(1)} Poin
                </span>
            </div>
        `;
    }
    
    updateOrderTotal();

    const modal = document.getElementById('order-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.classList.add('modal-active');
    }
}

function closeOrderModal() {
    const modal = document.getElementById('order-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-active');
    }
}

function shareProduct(name) {
    const text = `Cek paket sembako murah "${name}" di GoSembako! Kualitas terjamin, harga bersahabat.`;
    const url = window.location.href;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
    window.open(waUrl, '_blank');
}

function startNotificationLoop() {
    const names = ['Siti', 'Budi', 'Ani', 'Joko', 'Rina', 'Agus', 'Dewi', 'Eko'];
    const products = allProducts.length > 0 ? allProducts.map(p => p.nama) : ['Paket Sembako'];
    
    setInterval(() => {
        if (Math.random() > 0.7) {
            const name = names[Math.floor(Math.random() * names.length)];
            const product = products[Math.floor(Math.random() * products.length)];
            showNotification(`${name} baru saja membeli ${product}`);
        }
    }, 15000);
}

function showNotification(text) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-24 left-4 bg-white/90 backdrop-blur shadow-lg rounded-xl p-3 flex items-center gap-3 border border-green-100 z-50 animate-bounce';
    toast.innerHTML = `
        <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z"></path></svg>
        </div>
        <p class="text-xs font-medium text-gray-700">${text}</p>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchProducts();
    fetchTukarPoin();

    // Add event listener for detail modal add to cart button
    const modalAddCartBtn = document.getElementById('modal-add-cart');
    if (modalAddCartBtn) {
        modalAddCartBtn.addEventListener('click', (event) => {
            const name = document.getElementById('modal-product-name').innerText;
            const product = allProducts.find(p => p.nama === name);
            if (product) {
                const qtyInput = document.getElementById('modal-qty');
                const qty = qtyInput ? parseInt(qtyInput.value) : 1;
                addToCart(product, event, qty);
                closeDetailModal();
            }
        });
    }
});

function toggleLocationField() {
    const shipEl = document.querySelector('input[name="ship-method"]:checked');
    const locationField = document.getElementById('location-field');
    const deliveryUI = document.getElementById('delivery-location-ui');
    const pickupUI = document.getElementById('pickup-location-ui');
    
    if (shipEl) {
        if (shipEl.value === 'Antar Nikomas') {
            // DIANTAR NIKOMAS: Tidak pakai bagikan lokasi
            locationField.classList.add('hidden');
            deliveryUI.classList.add('hidden');
            pickupUI.classList.add('hidden');
        } else if (shipEl.value === 'Antar Kerumah') {
            // DIANTAR KERUMAH: Pakai bagikan lokasi
            locationField.classList.remove('hidden');
            deliveryUI.classList.remove('hidden');
            pickupUI.classList.add('hidden');
        } else if (shipEl.value === 'Ambil Ditempat') {
            // AMBIL DI TEMPAT: Tampilkan info lokasi toko
            locationField.classList.remove('hidden');
            deliveryUI.classList.add('hidden');
            pickupUI.classList.remove('hidden');
        }
    }
    updateOrderTotal();
}

function getCurrentLocation() {
    const btn = document.getElementById('get-location-btn');
    const locationInput = document.getElementById('location-link');
    
    if (!navigator.geolocation) {
        alert('Geolocation tidak didukung oleh browser Anda');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span>⌛ Mengambil Lokasi...</span>';

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            locationInput.value = mapsUrl;
            
            btn.classList.remove('bg-white', 'text-blue-700', 'border-blue-200');
            btn.classList.add('bg-green-600', 'text-white', 'border-green-600');
            btn.innerHTML = '<span>✅ Lokasi Berhasil Dibagikan</span>';
            alert('Lokasi berhasil diambil!');
        },
        (error) => {
            btn.disabled = false;
            btn.innerHTML = '<span>📍 Bagikan Lokasi Saya</span>';
            let msg = 'Gagal mengambil lokasi.';
            if (error.code === 1) msg = 'Mohon izinkan akses lokasi untuk fitur ini.';
            alert(msg);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
}

function updateOrderTotal() {
    const payEl = document.querySelector('input[name="pay-method"]:checked');
    const shipEl = document.querySelector('input[name="ship-method"]:checked');
    const isGajian = payEl && payEl.value === 'Bayar Gajian';
    const isDelivery = shipEl && shipEl.value === 'Antar Nikomas';
    
    let subtotal = 0;
    cart.forEach(item => {
        const price = isGajian ? item.hargaGajian : item.harga;
        const effectivePrice = calculateTieredPrice(price, item.qty, item.grosir);
        subtotal += effectivePrice * item.qty;
    });
    
    const shippingFee = isDelivery ? 2000 : 0;
    const total = subtotal + shippingFee;
    
    // Update the display elements
    const totalEl = document.getElementById('sticky-order-total');
    if (totalEl) {
        totalEl.innerText = `Rp ${total.toLocaleString('id-ID')}`;
    }
    
    // Also update subtotal and shipping if they exist in the UI
    const subtotalEl = document.getElementById('order-subtotal');
    const shippingEl = document.getElementById('order-shipping');
    if (subtotalEl) subtotalEl.innerText = `Rp ${subtotal.toLocaleString('id-ID')}`;
    if (shippingEl) shippingEl.innerText = `Rp ${shippingFee.toLocaleString('id-ID')}`;
}

function normalizePhone(phone) {
    if (!phone) return '';
    let p = phone.toString().replace(/[^0-9]/g, '');
    if (p.startsWith('62')) p = '0' + p.slice(2);
    else if (p.startsWith('8')) p = '0' + p;
    else if (!p.startsWith('0')) p = '0' + p;
    
    // Ensure it starts with 08 for mobile numbers
    if (p.startsWith('0') && !p.startsWith('08') && p.length > 1) {
        // Optional: handle other prefixes if needed
    }
    return p;
}

function generateOrderId() {
    const chars = '0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `ORD-${result}`;
}

function sendToWA() {
    // Get the button element
    const sendButton = event?.target || document.querySelector('button[onclick="sendToWA()"]');
    
    // Check if button is already disabled (prevent double submission)
    if (sendButton && sendButton.disabled) {
        return;
    }
    
    const name = document.getElementById('customer-name').value;
    const phone = document.getElementById('customer-phone').value;
    const payMethod = document.querySelector('input[name="pay-method"]:checked')?.value;
    const shipMethod = document.querySelector('input[name="ship-method"]:checked')?.value;
    
    // Validation 1: Check if name is filled
    if (!name || name.trim().length === 0) {
        alert('Masukkan Nama Lengkap');
        return;
    }
    
    // Validation 2: Name must be at least 4 characters (excluding spaces)
    const nameWithoutSpaces = name.replace(/\s/g, '');
    if (nameWithoutSpaces.length < 4) {
        alert('Masukkan Nama Lengkap');
        return;
    }
    
    // Validation 3: Check for invalid name patterns (repeated characters)
    const nameLower = nameWithoutSpaces.toLowerCase();
    const invalidNamePatterns = [
        /^(.)\1{3,}$/,              // Same character repeated 4+ times (aaaa, bbbb)
        /^(.{2})\1{2,}$/,           // Pairs repeated 3+ times (asasas, adadad)
        /^(.{3})\1{2,}$/,           // Triplets repeated 3+ times (abcabcabc)
        /^([a-z])([a-z])\1\2{2,}$/, // Alternating pairs (ababab, cdcdcd)
    ];
    
    for (const pattern of invalidNamePatterns) {
        if (pattern.test(nameLower)) {
            alert('Masukkan Nama Lengkap');
            return;
        }
    }
    
    // Validation 4: Phone number validation
    if (!phone || phone.trim().length === 0) {
        alert('Nomor WhatsApp tidak valid');
        return;
    }
    
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    
    // Check minimum 10 digits
    if (cleanPhone.length < 10) {
        alert('Nomor WhatsApp tidak valid');
        return;
    }
    
    // Check for invalid patterns (repeated digits)
    const invalidPatterns = [
        /^(\d)\1{9,}$/,           // Same digit repeated (e.g., 08333333333)
        /^08(\d)\1{8,}$/,         // 08 followed by repeated digits
        /^(\d{2})\1{4,}$/,        // Pairs repeated (e.g., 081212121212)
        /^(\d{3})\1{3,}$/         // Triplets repeated (e.g., 081818181818)
    ];
    
    for (const pattern of invalidPatterns) {
        if (pattern.test(cleanPhone)) {
            alert('Nomor WhatsApp tidak valid');
            return;
        }
    }
    
    // Validation 5: Payment method must be selected
    if (!payMethod) {
        alert('Pilih metode pembayaran terlebih dahulu');
        return;
    }
    
    // Validation 6: Shipping method must be selected
    if (!shipMethod) {
        alert('Pilih metode pengiriman terlebih dahulu');
        return;
    }
    
    // Disable button and show loading state
    if (sendButton) {
        sendButton.disabled = true;
        sendButton.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Memproses Pesanan...</span>
        `;
        sendButton.classList.add('opacity-75', 'cursor-not-allowed');
    }
    
    let location = '';
    if (shipMethod === 'Antar Nikomas') {
        location = 'Antar Nikomas (Area PT Nikomas Gemilang)';
    } else if (shipMethod === 'Antar Kerumah') {
        location = 'Antar Kerumah (Area Serang & sekitarnya)';
    } else {
        location = 'Ambil Ditempat (Kp. Baru, Kec. Kibin)';
    }
    
    const isGajian = payMethod === 'Bayar Gajian';
    let total = 0;
    let totalQty = 0;
    let itemsText = '';
    let itemsForSheet = '';
    
    cart.forEach((item, idx) => {
        const price = isGajian ? item.hargaGajian : item.harga;
        const effectivePrice = calculateTieredPrice(price, item.qty, item.grosir);
        const isGrosir = effectivePrice < price;
        const itemTotal = effectivePrice * item.qty;
        total += itemTotal;
        totalQty += item.qty;
        
        const variationText = item.selectedVariation ? ` (${item.selectedVariation.nama})` : '';
        const grosirText = isGrosir ? ` (Harga Grosir: Rp ${effectivePrice.toLocaleString('id-ID')}/unit)` : '';
        itemsText += `${idx + 1}. ${item.nama}${variationText} x${item.qty}${grosirText} = Rp ${itemTotal.toLocaleString('id-ID')}\n`;
        itemsForSheet += `${item.nama}${variationText} (x${item.qty}) | `;
    });
    
    const shippingFee = shipMethod === 'Antar Nikomas' ? 2000 : 0;
    total += shippingFee;
    
    // Calculate reward points (1 point per 10,000 IDR)
    const rewardConfig = CONFIG.getRewardConfig();
    const pointValue = rewardConfig.pointValue || 10000;
    const pointsEarned = Math.floor(total / pointValue);
    
    const orderId = generateOrderId();
    
    const locationLink = document.getElementById('location-link')?.value || '';
    const locationText = locationLink ? `\n*Lokasi Maps:* ${locationLink}` : '';

    const message = `*PESANAN BARU - GOSEMBAKO*\n\n` +
        `*Order ID: ${orderId}*\n` +
        `*Data Pelanggan:*\n` +
        `Nama: ${name}\n` +
        `WhatsApp: ${phone}\n\n` +
        `*Detail Pesanan:*\n${itemsText}\n` +
        `*Metode Pembayaran:* ${payMethod}\n` +
        `*Metode Pengiriman:* ${shipMethod}\n` +
        `*Lokasi/Titik:* ${location}${locationText}\n\n` +
        `*Ongkir:* Rp ${shippingFee.toLocaleString('id-ID')}\n` +
        `*TOTAL BAYAR: Rp ${total.toLocaleString('id-ID')}*\n` +
        `*Estimasi Poin:* +${pointsEarned} Poin\n\n` +
        `Mohon segera diproses ya, terima kasih!`;
        
    const waUrl = `https://wa.me/628993370200?text=${encodeURIComponent(message)}`;
    
    // Log order to spreadsheet before opening WhatsApp
    // Mapping to spreadsheet columns: id, pelanggan, produk, qty, total, status, tanggal, phone, poin, point_processed
    const orderData = {
        id: orderId,
        pelanggan: name,
        produk: itemsForSheet.slice(0, -3), // Remove trailing ' | '
        qty: totalQty,
        total: total,
        status: 'Pending',
        tanggal: new Date().toLocaleString('id-ID'),
        phone: normalizePhone(phone),
        poin: pointsEarned,
        point_processed: 'No'
    };

    // Use ApiService to log order (no caching for POST)
    // SheetDB requires data to be wrapped in {data: [...]}
    ApiService.post('?sheet=orders', { data: [orderData] })
        .then(data => {
            console.log('Order logged to spreadsheet:', data);
            

        })
        .catch(err => {
            console.error('Error logging order:', err);
        })
    .finally(() => {
        // Clear cart after order
        cart = [];
        saveCart();
        updateCartUI();
        closeOrderModal();
        
        // Show success notification with WhatsApp button
        showSuccessNotification(orderId, waUrl);
        
        // Re-enable button after modal closes (reset state)
        if (sendButton) {
            setTimeout(() => {
                sendButton.disabled = false;
                sendButton.innerHTML = `
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.432 5.631 1.433h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Kirim Pesanan ke WhatsApp
                `;
                sendButton.classList.remove('opacity-75', 'cursor-not-allowed');
            }, 500);
        }
    });
}

function handleLogoClick() {
    // Hidden admin access: click logo 5 times
    let clicks = parseInt(sessionStorage.getItem('logo_clicks') || 0) + 1;
    sessionStorage.setItem('logo_clicks', clicks);
    if (clicks >= 5) {
        sessionStorage.setItem('logo_clicks', 0);
        window.location.href = 'admin/login.html';
    }
    setTimeout(() => sessionStorage.setItem('logo_clicks', 0), 3000);
}

// ============ REWARD MODAL FUNCTIONS ============
async function fetchTukarPoin() {
    const rewardList = document.getElementById('reward-items-list');
    if (!rewardList) return;

    try {
        // Use ApiService with caching (3 minutes)
        const rewards = await ApiService.get('?sheet=tukar_poin', {
            cacheDuration: 3 * 60 * 1000 // 3 minutes cache
        });
        renderRewardItems(rewards);
    } catch (error) {
        console.error('Error fetching reward items:', error);
        rewardList.innerHTML = `
            <div class="text-center py-6 bg-red-50 rounded-2xl border-2 border-dashed border-red-200">
                <p class="text-xs text-red-600 font-semibold">Gagal memuat hadiah. Silakan coba lagi nanti.</p>
            </div>
        `;
    }
}

function renderRewardItems(rewards) {
    const rewardList = document.getElementById('reward-items-list');
    if (!rewardList) return;

    if (!rewards || rewards.length === 0) {
        rewardList.innerHTML = `
            <div class="text-center py-10 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border-2 border-dashed border-gray-300">
                <p class="text-sm text-gray-600 font-semibold">Belum ada hadiah yang tersedia.</p>
            </div>
        `;
        return;
    }

    rewardList.innerHTML = rewards.map(r => {
        const id = r.id || '';
        const nama = r.nama || r.judul || 'Hadiah';
        const poin = r.poin || 0;
        const gambar = r.gambar || 'https://via.placeholder.com/100?text=Reward';
        const deskripsi = r.deskripsi || '';

        return `
            <div class="bg-white p-4 rounded-2xl border-2 border-gray-100 hover:border-green-500 transition-all group shadow-sm">
                <div class="flex gap-4">
                    <div class="w-20 h-20 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0">
                        <img src="${gambar}" alt="${nama}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                    </div>
                    <div class="flex-1 min-w-0">
                        <h5 class="font-bold text-gray-800 truncate">${nama}</h5>
                        <p class="text-[10px] text-gray-500 line-clamp-2 mb-2">${deskripsi}</p>
                        <div class="flex items-center justify-between">
                            <div class="bg-amber-100 text-amber-700 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1">
                                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                                ${poin} Poin
                            </div>
                            <button onclick="showConfirmTukarModal('${id}')" class="bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition active:scale-95">
                                Tukar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function openRewardModal() {
    const modal = document.getElementById('reward-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.classList.add('modal-active');
        fetchTukarPoin();
    }
}

function closeRewardModal() {
    const modal = document.getElementById('reward-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-active');
    }
}

/**
 * Check user points from SheetDB
 * Fetches points data based on phone number
 */
function checkUserPoints() {
    const phoneInput = document.getElementById('reward-phone');
    const phone = phoneInput ? phoneInput.value.trim() : '';
    
    if (!phone) {
        alert('Mohon masukkan nomor WhatsApp.');
        return;
    }

    const normalizedPhone = normalizePhone(phone);

    // Show loading state
    const checkBtn = event.target;
    const originalText = checkBtn ? checkBtn.innerText : 'Cek Poin';
    if (checkBtn && checkBtn.tagName === 'BUTTON') {
        checkBtn.innerText = 'Mencari...';
        checkBtn.disabled = true;
    }

    // Use ApiService with no caching (always fresh data)
    ApiService.get('?sheet=user_points', { cache: false })
        .then(data => {
            // Find user by normalized phone
            // Fix: API uses 'phone' field, not 'whatsapp'
            const user = data.find(r => normalizePhone(r.phone || r.whatsapp || '') === normalizedPhone);

            const display = document.getElementById('points-display');
            const value = document.querySelector('#points-display h4');

            if (user) {
                // Fix: Handle comma as decimal separator from spreadsheet
                const rawPoints = (user.points || user.poin || '0').toString().replace(',', '.');
                const pts = parseFloat(rawPoints) || 0;
                value.innerHTML = `${pts.toFixed(1)} <span class="text-sm font-bold">Poin</span>`;
                sessionStorage.setItem('user_points', pts);
                sessionStorage.setItem('reward_phone', normalizedPhone);
                sessionStorage.setItem('reward_customer_name', user.nama || user.pelanggan || normalizedPhone);
                showToast(`Ditemukan ${pts.toFixed(1)} poin untuk nomor ini!`);
            } else {
                value.innerHTML = `0.0 <span class="text-sm font-bold">Poin</span>`;
                sessionStorage.setItem('user_points', 0);
                sessionStorage.setItem('reward_phone', normalizedPhone);
                sessionStorage.setItem('reward_customer_name', normalizedPhone);
                showToast('Nomor tidak ditemukan atau belum memiliki poin.');
            }
            display.classList.remove('hidden');
        })
        .catch(error => {
            console.error('Error checking points:', error);
            alert('Gagal mengecek poin. Silakan coba lagi.');
        })
        .finally(() => {
            if (checkBtn && checkBtn.tagName === 'BUTTON') {
                checkBtn.innerText = originalText;
                checkBtn.disabled = false;
            }
        });
}

/**
 * Claim reward
 */
async function claimReward(rewardId) {
    const phone = sessionStorage.getItem('reward_phone');
    const userPoints = parseFloat(sessionStorage.getItem('user_points')) || 0;
    
    if (!phone) {
        alert('Mohon cek poin Anda terlebih dahulu.');
        return;
    }

    try {
        // 1. Get reward details to know the required points
        const rewardData = await ApiService.get(`?sheet=tukar_poin&action=search&id=${rewardId}`, {
            cache: false // Don't cache search results
        });
        
        if (!rewardData || rewardData.length === 0) {
            alert('Data hadiah tidak ditemukan.');
            return;
        }

        const reward = rewardData[0];
        const requiredPoints = parseFloat(reward.poin) || 0;
        const rewardName = reward.nama || reward.judul || 'Hadiah';

        if (userPoints < requiredPoints) {
            alert(`Poin Anda tidak cukup. Dibutuhkan ${requiredPoints} poin, saldo Anda ${userPoints.toFixed(1)} poin.`);
            return;
        }

        // 2. Confirm redemption and ask for name
        const message = `Tukar ${requiredPoints} poin Anda dengan "${rewardName}"?\nSaldo poin saat ini: ${userPoints.toFixed(1)}`;
        if (!confirm(message)) return;

        // Ask for customer name
        let customerName = prompt("Silakan masukkan nama Anda untuk klaim ini:", sessionStorage.getItem('reward_customer_name') || "");
        if (customerName === null) return; // User cancelled
        customerName = customerName.trim() || "Pelanggan";

        // Show loading state
        showToast('Sedang memproses penukaran...');
        // 3. Deduct points from user_points sheet
        const newPoints = userPoints - requiredPoints;
        await ApiService.patch(`/phone/${phone}?sheet=user_points`, { points: newPoints });

        // 4. Record claim in claims sheet
        const claimId = 'CLM-' + Date.now().toString().slice(-6);
        await ApiService.post('?sheet=claims', {
            data: [{
                id: claimId,
                phone: phone,
                nama: customerName,
                hadiah: rewardName,
                poin: requiredPoints,
                status: 'Menunggu',
                tanggal: new Date().toLocaleString('id-ID')
            }]
        });

        // 5. Update local state and UI
        sessionStorage.setItem('user_points', newPoints);
        const pointsDisplay = document.querySelector('#points-display h4');
        if (pointsDisplay) {
            pointsDisplay.innerHTML = `${newPoints.toFixed(1)} <span class="text-sm font-bold">Poin</span>`;
        }

        // 6. Send to WhatsApp for notification
        const waMessage = `*KLAIM REWARD POIN BERHASIL*\n\nID Klaim: ${claimId}\nPelanggan: ${customerName}\nNomor WhatsApp: ${phone}\nReward: ${rewardName}\nPoin Ditukar: ${requiredPoints}\nSisa Poin: ${newPoints.toFixed(1)}\n\nMohon segera diproses. Terima kasih!`;
        const waUrl = `https://wa.me/628993370200?text=${encodeURIComponent(waMessage)}`;
        
        showToast('Penukaran poin berhasil!');
        
        // Small delay before opening WhatsApp
        setTimeout(() => {
            window.open(waUrl, '_blank');
        }, 1500);

    } catch (error) {
        console.error('Error in claimReward:', error);
        alert('Terjadi kesalahan saat memproses penukaran: ' + error.message);
    }
}

/**
 * ==========================================
 * MODAL KONFIRMASI TUKAR POIN
 * ==========================================
 */

/**
 * Variabel global untuk menyimpan data reward sementara
 */
let pendingRewardData = {
    id: null,
    nama: null,
    poin: null,
    gambar: null,
    deskripsi: null
};

/**
 * Tampilkan modal konfirmasi penukaran poin
 * @param {string} rewardId - ID reward dari database
 */
async function showConfirmTukarModal(rewardId) {
    const userPoints = parseFloat(sessionStorage.getItem('user_points')) || 0;
    
    if (!sessionStorage.getItem('reward_phone')) {
        showToast('Mohon cek poin Anda terlebih dahulu.');
        return;
    }

    try {
        // Fetch reward details
        const rewardData = await ApiService.get(`?sheet=tukar_poin&action=search&id=${rewardId}`, {
            cache: false
        });
        
        if (!rewardData || rewardData.length === 0) {
            showToast('Data hadiah tidak ditemukan.');
            return;
        }

        const reward = rewardData[0];
        const requiredPoints = parseFloat(reward.poin) || 0;
        const rewardName = reward.nama || reward.judul || 'Hadiah';

        // Validasi poin cukup
        if (userPoints < requiredPoints) {
            showToast(`Poin Anda tidak cukup. Dibutuhkan ${requiredPoints} poin, saldo Anda ${userPoints.toFixed(1)} poin.`);
            return;
        }

        // Simpan data reward ke variabel global
        pendingRewardData = {
            id: rewardId,
            nama: rewardName,
            poin: requiredPoints,
            gambar: reward.gambar || '',
            deskripsi: reward.deskripsi || ''
        };

        // Update modal dengan data
        document.getElementById('confirm-reward-name').textContent = rewardName;
        document.getElementById('confirm-reward-points').textContent = requiredPoints;
        document.getElementById('confirm-remaining-points').textContent = (userPoints - requiredPoints).toFixed(1);

        // Tampilkan modal
        const modal = document.getElementById('confirm-tukar-modal');
        modal.classList.remove('hidden');
        document.body.classList.add('modal-active');

    } catch (error) {
        console.error('Error showing confirm modal:', error);
        showToast('Terjadi kesalahan saat memproses permintaan Anda.');
    }
}

/**
 * Tutup modal konfirmasi
 */
function cancelTukarModal() {
    const modal = document.getElementById('confirm-tukar-modal');
    modal.classList.add('hidden');
    document.body.classList.remove('modal-active');
    pendingRewardData = { id: null, nama: null, poin: null, gambar: null, deskripsi: null };
}

/**
 * Lanjutkan ke modal input nama
 */
function proceedToNameInput() {
    // Tutup modal konfirmasi
    document.getElementById('confirm-tukar-modal').classList.add('hidden');
    
    // Buka modal input nama
    const nameModal = document.getElementById('name-input-modal');
    nameModal.classList.remove('hidden');
    
    // Focus ke input field
    setTimeout(() => {
        document.getElementById('claim-name-input').focus();
    }, 100);
}

/**
 * Kembali ke modal konfirmasi
 */
function backToConfirmModal() {
    document.getElementById('name-input-modal').classList.add('hidden');
    document.getElementById('confirm-tukar-modal').classList.remove('hidden');
    document.getElementById('claim-name-input').value = '';
}

/**
 * Submit nama dan lanjutkan proses klaim
 */
async function submitNameAndClaim() {
    const customerName = document.getElementById('claim-name-input').value.trim();
    
    if (!customerName) {
        showToast('Mohon masukkan nama Anda terlebih dahulu.');
        return;
    }

    if (customerName.length < 3) {
        showToast('Nama harus minimal 3 karakter.');
        return;
    }

    // Tutup modal
    document.getElementById('name-input-modal').classList.add('hidden');
    document.body.classList.remove('modal-active');

    // Proses klaim dengan data yang sudah dikumpulkan
    await processClaimReward(pendingRewardData.id, customerName);
}

/**
 * Proses klaim reward (logika utama)
 * @param {string} rewardId - ID reward
 * @param {string} customerName - Nama pelanggan
 */
async function processClaimReward(rewardId, customerName) {
    const phone = sessionStorage.getItem('reward_phone');
    const userPoints = parseFloat(sessionStorage.getItem('user_points')) || 0;
    
    try {
        // 1. Get reward details
        const rewardData = await ApiService.get(`?sheet=tukar_poin&action=search&id=${rewardId}`, {
            cache: false
        });
        
        if (!rewardData || rewardData.length === 0) {
            showToast('Data hadiah tidak ditemukan.');
            return;
        }

        const reward = rewardData[0];
        const requiredPoints = parseFloat(reward.poin) || 0;
        const rewardName = reward.nama || reward.judul || 'Hadiah';

        // Validasi final
        if (userPoints < requiredPoints) {
            showToast(`Poin Anda tidak cukup.`);
            return;
        }

        // Show loading state
        showToast('Sedang memproses penukaran...');

        // 2. Deduct points from user_points sheet
        const newPoints = userPoints - requiredPoints;
        await ApiService.patch(`/phone/${phone}?sheet=user_points`, {
            data: {
                points: newPoints,
                last_updated: new Date().toLocaleString('id-ID')
            }
        });

        // 3. Record claim in claims sheet
        const claimId = 'CLM-' + Date.now().toString().slice(-6);
        await ApiService.post('?sheet=claims', {
            data: [{
                id: claimId,
                phone: phone,
                nama: customerName,
                hadiah: rewardName,
                poin: requiredPoints,
                status: 'Menunggu',
                tanggal: new Date().toLocaleString('id-ID')
            }]
        });

        // 4. Update local state and UI
        sessionStorage.setItem('user_points', newPoints);
        const pointsDisplay = document.querySelector('#points-display h4');
        if (pointsDisplay) {
            pointsDisplay.innerHTML = `${newPoints.toFixed(1)} <span class="text-sm font-bold">Poin</span>`;
        }

        // 5. Prepare WhatsApp message
        const waMessage = `*KLAIM REWARD POIN BERHASIL*\n\nID Klaim: ${claimId}\nPelanggan: ${customerName}\nNomor WhatsApp: ${phone}\nReward: ${rewardName}\nPoin Ditukar: ${requiredPoints}\nSisa Poin: ${newPoints.toFixed(1)}\n\nMohon segera diproses. Terima kasih!`;
        const waUrl = `https://wa.me/628993370200?text=${encodeURIComponent(waMessage)}`;
        
        // Store WhatsApp URL for later use
        window.claimWhatsAppUrl = waUrl;
        
        // Clear pending data
        pendingRewardData = { id: null, nama: null, poin: null, gambar: null, deskripsi: null };
        
        // Close all modals
        document.getElementById('name-input-modal').classList.add('hidden');
        document.getElementById('confirm-tukar-modal').classList.add('hidden');
        
        // Show success modal after a small delay to ensure other modals are closed
        setTimeout(() => {
            showClaimSuccessModal(claimId);
        }, 300);

    } catch (error) {
        console.error('Error processing claim:', error);
        showToast('Gagal memproses penukaran. Silakan coba lagi.');
    }
}


/**
 * ==========================================
 * WISHLIST (DAFTAR KEINGINAN) FEATURE
 * ==========================================
 */

const WISHLIST_KEY = 'gos_wishlist';

/**
 * Mengambil daftar ID produk di Wishlist dari localStorage.
 * @returns {Array<string>} Array berisi ID produk.
 */
function getWishlist() {
    const wishlistJson = localStorage.getItem(WISHLIST_KEY);
    return wishlistJson ? JSON.parse(wishlistJson) : [];
}

/**
 * Menyimpan daftar ID produk ke localStorage.
 * @param {Array<string>} wishlist - Array ID produk.
 */
function saveWishlist(wishlist) {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
    updateWishlistCount();
}

/**
 * Menambah atau menghapus produk dari Wishlist.
 * @param {string} productId - ID unik produk.
 */
function toggleWishlist(productId) {
    let wishlist = getWishlist();
    const index = wishlist.indexOf(productId);

    if (index > -1) {
        // Produk sudah ada, hapus (Unlike)
        wishlist.splice(index, 1);
        showToast('Produk dihapus dari Wishlist.');
    } else {
        // Produk belum ada, tambah (Like)
        wishlist.push(productId);
        showToast('Produk ditambahkan ke Wishlist!');
    }

    saveWishlist(wishlist);
    // Perbarui tampilan ikon di kartu produk yang bersangkutan
    updateProductWishlistIcon(productId);
    
    // Jika modal wishlist terbuka, refresh isinya
    const wishlistModal = document.getElementById('wishlist-modal');
    if (wishlistModal && !wishlistModal.classList.contains('hidden')) {
        renderWishlistItems();
    }
}

/**
 * Memeriksa apakah produk ada di Wishlist.
 * @param {string} productId - ID unik produk.
 * @returns {boolean} True jika ada di Wishlist.
 */
function isProductInWishlist(productId) {
    return getWishlist().includes(productId);
}

/**
 * Memperbarui angka Wishlist di header.
 */
function updateWishlistCount() {
    const count = getWishlist().length;
    const countElement = document.getElementById('wishlist-count');
    if (countElement) {
        countElement.textContent = count;
        if (count > 0) {
            countElement.classList.remove('hidden');
        } else {
            countElement.classList.add('hidden');
        }
    }
}

/**
 * Memperbarui ikon Heart di kartu produk tanpa re-render
 * @param {string} productId - ID unik produk
 */
function updateProductWishlistIcon(productId) {
    const button = document.getElementById(`wishlist-btn-${productId}`);
    if (!button) return;

    const isLiked = isProductInWishlist(productId);
    const heartIcon = isLiked 
        ? '<svg class="w-5 h-5 text-red-500 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
        : '<svg class="w-5 h-5 text-gray-400 hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>';
    
    button.innerHTML = heartIcon;
}

/**
 * Membuka modal Wishlist
 */
function openWishlistModal() {
    const modal = document.getElementById('wishlist-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.classList.add('modal-active');
        renderWishlistItems();
    }
}

/**
 * Menutup modal Wishlist
 */
function closeWishlistModal() {
    const modal = document.getElementById('wishlist-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-active');
    }
}

/**
 * Mengambil data produk lengkap dan merender item Wishlist.
 */
async function renderWishlistItems() {
    const wishlistIds = getWishlist();
    const container = document.getElementById('wishlist-items-container');
    
    if (!container) return;

    if (wishlistIds.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10">
                <svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                </svg>
                <p class="text-gray-500 font-semibold">Wishlist Anda kosong.</p>
                <p class="text-gray-400 text-sm mt-2">Tambahkan produk favorit Anda!</p>
            </div>
        `;
        return;
    }

    // Use global allProducts which already has complete structure with hargaGajian, etc.
    // If allProducts is empty, fetch it first
    if (!allProducts || allProducts.length === 0) {
        await fetchProducts();
    }
    
    const wishlistProducts = allProducts.filter(p => wishlistIds.includes(p.id || p.sku));

    if (wishlistProducts.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-4">Produk tidak ditemukan.</p>';
        return;
    }

    container.innerHTML = wishlistProducts.map(p => {
        const productId = p.id || p.sku;
        const harga = parseFloat(p.harga_tunai || p.harga || 0);
        return `
            <div class="flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 transition">
                <div class="flex items-center gap-3 flex-1">
                    <img src="${p.gambar}" alt="${p.nama}" class="w-16 h-16 object-cover rounded-lg shadow-sm">
                    <div class="flex-1">
                        <p class="font-semibold text-sm text-gray-800">${p.nama}</p>
                        <p class="text-xs text-green-600 font-bold mt-1">Rp ${harga.toLocaleString('id-ID')}</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="toggleWishlist('${productId}')" class="text-red-500 hover:text-red-700 p-2 transition active:scale-95" title="Hapus dari Wishlist">
                        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    </button>
                    <button onclick="showDetail(${JSON.stringify(p).replace(/"/g, '&quot;')})" class="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition active:scale-95">
                        Beli
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Panggil saat website pertama kali dimuat
document.addEventListener('DOMContentLoaded', updateWishlistCount);

// ============ QRIS MODAL FUNCTIONS ============
function showQRISModal() {
    const modal = document.getElementById('qris-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function closeQRISModal() {
    const modal = document.getElementById('qris-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ============ DEEP LINK HANDLER ============
/**
 * Handles deep linking to a product modal via URL hash.
 * e.g., #produk-paket-hemat
 */
async function handleDeepLink() {
    console.log('[DeepLink] Checking for hash:', window.location.hash);
    
    // Wait for products to be loaded if not yet
    if (allProducts.length === 0) {
        console.log('[DeepLink] Products not loaded yet, waiting...');
        // Wait a bit and try again
        setTimeout(handleDeepLink, 500);
        return;
    }

    if (window.location.hash) {
        const hash = window.location.hash.substring(1); // Remove # symbol
        console.log('[DeepLink] Hash found:', hash);

        if (hash.startsWith('produk-')) {
            const productSlug = hash.substring(7); // Remove "produk-" prefix
            console.log('[DeepLink] Looking for product with slug:', productSlug);

            const product = findProductBySlug(productSlug);

            if (product) {
                console.log('[DeepLink] Product found:', product.nama);
                // Give a small delay to ensure UI is ready
                setTimeout(() => {
                    showDetail(product);
                }, 500); // 500ms delay
            } else {
                console.warn('[DeepLink] Product with slug not found:', productSlug);
            }
        }
    }
}

// Handle hash change after page load (when user clicks banner while already on page)
window.addEventListener('hashchange', handleDeepLink, false);

// Add deep link handler to existing DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for products to load first
    setTimeout(handleDeepLink, 1000);
});


/**
 * Show claim success modal with claim ID
 * @param {string} claimId - The claim ID to display
 */
function showClaimSuccessModal(claimId) {
    console.log('showClaimSuccessModal called with claimId:', claimId);
    const modal = document.getElementById('claim-success-modal');
    const claimIdElement = document.getElementById('claim-success-id');
    
    console.log('Modal element:', modal);
    console.log('Claim ID element:', claimIdElement);
    
    if (modal && claimIdElement) {
        claimIdElement.textContent = claimId;
        modal.classList.remove('hidden');
        console.log('Modal should now be visible');
    } else {
        console.error('Modal or claimIdElement not found!');
    }
}

/**
 * Close claim success modal
 */
function closeClaimSuccessModal() {
    const modal = document.getElementById('claim-success-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Open WhatsApp with claim message
 */
function openClaimWhatsApp() {
    if (window.claimWhatsAppUrl) {
        window.open(window.claimWhatsAppUrl, '_blank');
        // Close modal after opening WhatsApp
        setTimeout(() => {
            closeClaimSuccessModal();
        }, 500);
    }
}

/**
 * Update payment method info text dynamically with smooth animations
 * @param {string} method - Payment method: 'tunai', 'qris', or 'gajian'
 */
function updatePaymentMethodInfo(method) {
    const infoContainer = document.getElementById('payment-method-info');
    const infoText = document.getElementById('payment-method-info-text');
    const qrisDisplay = document.getElementById('qris-display');
    
    if (!infoContainer || !infoText) return;
    
    // Payment method information mapping
    const paymentInfo = {
        'tunai': 'Pembayaran dilakukan secara tunai saat pesanan diterima atau diambil.',
        'qris': 'Pembayaran dilakukan melalui QRIS menggunakan e-wallet atau mobile banking.',
        'gajian': 'Pembayaran ditagihkan pada periode gajian berikutnya, jatuh tempo tanggal 6–7.'
    };
    
    // Hide all first with fade out animation
    if (!infoContainer.classList.contains('hidden')) {
        infoContainer.classList.add('opacity-0', 'scale-95');
    }
    if (qrisDisplay && !qrisDisplay.classList.contains('hidden')) {
        qrisDisplay.classList.add('opacity-0', 'scale-95');
    }
    
    // Wait for fade out, then update content
    setTimeout(() => {
        // Update text and show info container
        if (paymentInfo[method]) {
            infoText.textContent = paymentInfo[method];
            infoContainer.classList.remove('hidden');
            
            // Trigger reflow for animation
            void infoContainer.offsetWidth;
            
            // Fade in with animation
            setTimeout(() => {
                infoContainer.classList.remove('opacity-0', 'scale-95');
                infoContainer.classList.add('opacity-100', 'scale-100');
            }, 10);
        } else {
            infoContainer.classList.add('hidden');
        }
        
        // Show QRIS display only for QRIS method
        if (qrisDisplay) {
            if (method === 'qris') {
                qrisDisplay.classList.remove('hidden');
                
                // Trigger reflow for animation
                void qrisDisplay.offsetWidth;
                
                // Fade in with animation
                setTimeout(() => {
                    qrisDisplay.classList.remove('opacity-0', 'scale-95');
                    qrisDisplay.classList.add('opacity-100', 'scale-100');
                }, 10);
            } else {
                qrisDisplay.classList.add('hidden');
            }
        }
    }, 150); // Half of transition duration
}
