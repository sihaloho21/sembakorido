/**
 * Tiered Pricing Management Module
 * Mengelola harga grosir bertingkat untuk produk
 */

let tieredPricingProducts = [];
let currentEditingProductId = null;

/**
 * Fetch all products and display them in the tiered pricing UI
 */
async function fetchTieredPricingProducts() {
    const container = document.getElementById('tiered-pricing-list');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center py-10 text-gray-500">Memuat data produk...</div>';
    
    try {
        const response = await fetch(`${API_URL}?sheet=${PRODUCTS_SHEET}`);
        tieredPricingProducts = await response.json();
        renderTieredPricingList();
    } catch (error) {
        console.error('Error fetching products:', error);
        container.innerHTML = '<div class="text-center py-10 text-red-500">Gagal memuat data produk.</div>';
    }
}

/**
 * Render the tiered pricing product list
 */
function renderTieredPricingList() {
    const container = document.getElementById('tiered-pricing-list');
    if (!container) return;
    
    if (tieredPricingProducts.length === 0) {
        container.innerHTML = '<div class="text-center py-10 text-gray-500">Belum ada produk.</div>';
        return;
    }
    
    container.innerHTML = tieredPricingProducts.map(product => {
        const grosirData = parseGrosirData(product.grosir);
        const isEnabled = grosirData && grosirData.length > 0;
        
        return `
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-3 mb-3">
                            <img src="${product.gambar ? product.gambar.split(',')[0] : 'https://via.placeholder.com/50'}" 
                                 class="w-12 h-12 object-cover rounded-lg bg-gray-100">
                            <div>
                                <h4 class="font-bold text-gray-800">${product.nama}</h4>
                                <p class="text-xs text-gray-500">Harga Satuan: Rp ${parseInt(product.harga).toLocaleString('id-ID')}</p>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" 
                                   ${isEnabled ? 'checked' : ''} 
                                   onchange="toggleTieredPricing('${product.id}')" 
                                   class="sr-only peer">
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                        </label>
                        <span class="text-xs font-bold ${isEnabled ? 'text-green-600' : 'text-gray-500'}">
                            ${isEnabled ? 'Aktif' : 'Nonaktif'}
                        </span>
                    </div>
                </div>
                
                ${isEnabled ? `
                    <div class="mt-6 pt-6 border-t border-gray-100">
                        <div id="tiered-form-${product.id}" class="space-y-4">
                            <h5 class="font-bold text-gray-800 text-sm mb-4">Tingkatan Harga Grosir</h5>
                            
                            <div id="tiers-container-${product.id}" class="space-y-3">
                                ${grosirData.map((tier, index) => renderTierInput(product.id, tier, index)).join('')}
                            </div>
                            
                            <button type="button" 
                                    onclick="addTierInput('${product.id}')" 
                                    class="w-full mt-4 py-2 px-4 border-2 border-dashed border-green-300 text-green-600 rounded-lg font-bold hover:bg-green-50 transition text-sm">
                                + Tambah Tingkatan
                            </button>
                            
                            <div class="flex gap-3 pt-4">
                                <button type="button" 
                                        onclick="saveTieredPricing('${product.id}')" 
                                        class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg transition">
                                    Simpan
                                </button>
                                <button type="button" 
                                        onclick="cancelTieredPricing('${product.id}')" 
                                        class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2 rounded-lg transition">
                                    Batal
                                </button>
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Render a single tier input row
 */
function renderTierInput(productId, tier, index) {
    return `
        <div class="flex gap-3 items-end">
            <div class="flex-1">
                <label class="block text-xs font-bold text-gray-600 mb-1">Min. Qty</label>
                <input type="number" 
                       class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-green-500 text-sm" 
                       value="${tier.min_qty}" 
                       data-tier-min-qty="${index}"
                       data-product-id="${productId}"
                       min="1">
            </div>
            <div class="flex-1">
                <label class="block text-xs font-bold text-gray-600 mb-1">Harga per Unit (Rp)</label>
                <input type="number" 
                       class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-green-500 text-sm" 
                       value="${tier.price}" 
                       data-tier-price="${index}"
                       data-product-id="${productId}"
                       min="0">
            </div>
            <button type="button" 
                    onclick="removeTierInput('${productId}', ${index})" 
                    class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        </div>
    `;
}

/**
 * Parse grosir data from JSON string
 */
function parseGrosirData(grosirString) {
    if (!grosirString) return [];
    try {
        const parsed = JSON.parse(grosirString);
        if (Array.isArray(parsed)) {
            // Sort by min_qty descending for proper tier ordering
            return parsed.sort((a, b) => b.min_qty - a.min_qty);
        }
        return [];
    } catch (e) {
        console.error('Error parsing grosir data:', e);
        return [];
    }
}

/**
 * Toggle tiered pricing for a product
 */
async function toggleTieredPricing(productId) {
    const product = tieredPricingProducts.find(p => p.id === productId);
    if (!product) return;
    
    const grosirData = parseGrosirData(product.grosir);
    const isCurrentlyEnabled = grosirData && grosirData.length > 0;
    
    try {
        if (isCurrentlyEnabled) {
            // Disable tiered pricing
            await updateProductGrosir(productId, []);
            showAdminToast('Harga grosir dinonaktifkan', 'success');
        } else {
            // Enable with one default tier
            const defaultTier = [{ min_qty: 5, price: parseInt(product.harga) * 0.95 }];
            await updateProductGrosir(productId, defaultTier);
            showAdminToast('Harga grosir diaktifkan', 'success');
        }
        fetchTieredPricingProducts();
    } catch (error) {
        console.error('Error toggling tiered pricing:', error);
        showAdminToast('Gagal mengubah status harga grosir', 'error');
    }
}

/**
 * Add a new tier input row
 */
function addTierInput(productId) {
    const container = document.getElementById(`tiers-container-${productId}`);
    const currentTiers = container.querySelectorAll('[data-tier-min-qty]');
    const newIndex = currentTiers.length;
    
    // Calculate default values
    const lastTier = currentTiers[currentTiers.length - 1];
    const lastMinQty = lastTier ? parseInt(lastTier.value) : 5;
    const lastPriceInput = container.querySelector(`[data-tier-price="${currentTiers.length - 1}"]`);
    const lastPrice = lastPriceInput ? parseInt(lastPriceInput.value) : 0;
    
    const newTier = {
        min_qty: lastMinQty + 5,
        price: Math.max(0, lastPrice - 100)
    };
    
    const tierHtml = renderTierInput(productId, newTier, newIndex);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = tierHtml;
    container.appendChild(tempDiv.firstElementChild);
}

/**
 * Remove a tier input row
 */
function removeTierInput(productId, index) {
    const inputs = document.querySelectorAll(`[data-product-id="${productId}"][data-tier-min-qty]`);
    if (inputs.length <= 1) {
        showAdminToast('Minimal harus ada satu tingkatan harga', 'warning');
        return;
    }
    
    const tierToRemove = Array.from(inputs).find(input => input.getAttribute('data-tier-min-qty') === index.toString());
    if (tierToRemove) {
        tierToRemove.parentElement.parentElement.remove();
    }
}

/**
 * Save tiered pricing for a product
 */
async function saveTieredPricing(productId) {
    const product = tieredPricingProducts.find(p => p.id === productId);
    if (!product) return;
    
    // Collect tier data from inputs
    const minQtyInputs = document.querySelectorAll(`[data-product-id="${productId}"][data-tier-min-qty]`);
    const priceInputs = document.querySelectorAll(`[data-product-id="${productId}"][data-tier-price]`);
    
    if (minQtyInputs.length === 0) {
        showAdminToast('Tidak ada tingkatan harga untuk disimpan', 'warning');
        return;
    }
    
    const tiers = [];
    minQtyInputs.forEach((input, index) => {
        const minQty = parseInt(input.value);
        const price = parseInt(priceInputs[index].value);
        
        if (isNaN(minQty) || isNaN(price) || minQty < 1 || price < 0) {
            throw new Error('Input tidak valid');
        }
        
        tiers.push({ min_qty: minQty, price });
    });
    
    // Validate tiers
    if (!validateTiers(tiers)) {
        showAdminToast('Tingkatan harga tidak valid. Pastikan min_qty naik dan harga turun', 'error');
        return;
    }
    
    try {
        // Sort tiers by min_qty descending for consistent ordering
        tiers.sort((a, b) => b.min_qty - a.min_qty);
        
        await updateProductGrosir(productId, tiers);
        showAdminToast('Harga grosir berhasil disimpan!', 'success');
        fetchTieredPricingProducts();
    } catch (error) {
        console.error('Error saving tiered pricing:', error);
        showAdminToast('Gagal menyimpan harga grosir', 'error');
    }
}

/**
 * Validate tier structure
 */
function validateTiers(tiers) {
    if (tiers.length <= 1) return true;
    
    // Sort by min_qty ascending for validation
    const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
    
    for (let i = 0; i < sorted.length - 1; i++) {
        // As min_qty increases, price must decrease
        if (sorted[i].min_qty >= sorted[i + 1].min_qty) {
            return false; // min_qty must be strictly increasing
        }
        if (sorted[i].price <= sorted[i + 1].price) {
            return false; // price must be strictly decreasing
        }
    }
    
    return true;
}

/**
 * Cancel tiered pricing edit
 */
function cancelTieredPricing(productId) {
    fetchTieredPricingProducts();
}

/**
 * Update product grosir data via SheetDB API
 */
async function updateProductGrosir(productId, tiers) {
    const grosirJson = JSON.stringify(tiers);
    
    try {
        const response = await fetch(`${API_URL}/id/${productId}?sheet=${PRODUCTS_SHEET}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                data: { 
                    grosir: grosirJson
                } 
            })
        });
        
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || 'Failed to update product');
        }
        
        return result;
    } catch (error) {
        console.error('Error updating product grosir:', error);
        throw error;
    }
}

/**
 * Calculate tiered price based on quantity
 */
function calculateTieredPrice(basePrice, quantity, tieredPrices) {
    if (!tieredPrices || tieredPrices.length === 0) {
        return basePrice;
    }
    
    // Sort by min_qty descending
    const sorted = [...tieredPrices].sort((a, b) => b.min_qty - a.min_qty);
    
    let effectivePrice = basePrice;
    for (const tier of sorted) {
        if (quantity >= tier.min_qty) {
            effectivePrice = tier.price;
            break;
        }
    }
    
    return effectivePrice;
}

/**
 * Show admin toast notification
 */
function showAdminToast(message, type = 'info') {
    const toast = document.getElementById('admin-toast');
    const toastContent = document.getElementById('admin-toast-content');
    
    if (!toast || !toastContent) return;
    
    // Set color based on type
    const colors = {
        'success': 'bg-green-600',
        'error': 'bg-red-600',
        'warning': 'bg-yellow-500',
        'info': 'bg-blue-600'
    };
    
    toast.className = `fixed bottom-5 right-5 ${colors[type] || colors.info} text-white px-6 py-3 rounded-xl shadow-lg transition-all duration-300 transform translate-y-0 opacity-100 z-50`;
    toastContent.textContent = message;
    
    // Hide after 3 seconds
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}
