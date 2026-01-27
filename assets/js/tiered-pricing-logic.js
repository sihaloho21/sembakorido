/**
 * Tiered Pricing Logic for Customer Side
 */

/**
 * Calculate tiered price based on quantity
 * @param {number} basePrice - The original price
 * @param {number} quantity - The quantity being purchased
 * @param {Array|string} tieredPrices - The tiered pricing data (JSON string or Array)
 * @returns {number} - The effective price per unit
 */
function calculateTieredPrice(basePrice, quantity, tieredPrices) {
    if (!tieredPrices) return basePrice;
    
    let tiers = [];
    if (typeof tieredPrices === 'string') {
        try {
            tiers = JSON.parse(tieredPrices);
        } catch (e) {
            console.error('Error parsing tiered prices:', e);
            return basePrice;
        }
    } else {
        tiers = tieredPrices;
    }
    
    if (!Array.isArray(tiers) || tiers.length === 0) {
        return basePrice;
    }
    
    // Sort by min_qty descending to find the highest applicable tier
    const sorted = [...tiers].sort((a, b) => b.min_qty - a.min_qty);
    
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
 * Get the next tier information for progress bar
 * @param {number} quantity - Current quantity
 * @param {Array|string} tieredPrices - Tiered pricing data
 * @returns {object|null} - Next tier info or null if no more tiers
 */
function getNextTierInfo(quantity, tieredPrices) {
    if (!tieredPrices) return null;
    
    let tiers = [];
    if (typeof tieredPrices === 'string') {
        try {
            tiers = JSON.parse(tieredPrices);
        } catch (e) {
            return null;
        }
    } else {
        tiers = tieredPrices;
    }
    
    if (!Array.isArray(tiers) || tiers.length === 0) return null;
    
    // Sort by min_qty ascending
    const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
    
    for (const tier of sorted) {
        if (quantity < tier.min_qty) {
            return tier;
        }
    }
    
    return null;
}

/**
 * Update Tiered Pricing UI in Product Detail Modal
 * @param {object} product - The product object
 * @param {number} currentQty - Current quantity in modal (default 1)
 */
function updateTieredPricingUI(product, currentQty = 1) {
    const container = document.getElementById('tiered-pricing-ui');
    const table = document.getElementById('price-tiers-table');
    const badge = document.getElementById('current-tier-badge');
    const progressContainer = document.getElementById('tier-progress-container');
    const progressText = document.getElementById('tier-progress-text');
    const progressBar = document.getElementById('tier-progress-bar');
    const progressPercent = document.getElementById('tier-progress-percent');

    if (!container || !product.grosir) {
        if (container) container.classList.add('hidden');
        return;
    }

    let tiers = [];
    try {
        tiers = typeof product.grosir === 'string' ? JSON.parse(product.grosir) : product.grosir;
    } catch (e) {
        container.classList.add('hidden');
        return;
    }

    if (!Array.isArray(tiers) || tiers.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    
    // Sort tiers by min_qty ascending for display
    const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
    
    // Find active tier
    const effectivePrice = calculateTieredPrice(product.harga, currentQty, tiers);
    const isGrosirActive = effectivePrice < product.harga;
    
    if (badge) {
        if (isGrosirActive) {
            badge.classList.remove('hidden');
            badge.innerText = 'Harga Grosir Aktif';
        } else {
            badge.classList.add('hidden');
        }
    }

    // Render Tiers Table
    if (table) {
        table.innerHTML = sortedTiers.map(t => {
            const isActive = currentQty >= t.min_qty && effectivePrice === t.price;
            return `
                <div class="${isActive ? 'bg-blue-600 border-blue-600' : 'bg-white border-blue-100'} border rounded-xl p-2 text-center transition-all duration-300">
                    <p class="text-[8px] ${isActive ? 'text-blue-100' : 'text-blue-500'} font-bold uppercase leading-tight">Min. ${t.min_qty}</p>
                    <p class="text-xs ${isActive ? 'text-white' : 'text-blue-800'} font-black">Rp ${t.price.toLocaleString('id-ID')}</p>
                </div>
            `;
        }).join('');
    }

    // Progress Bar Logic
    const nextTier = getNextTierInfo(currentQty, tiers);
    if (nextTier && progressContainer) {
        progressContainer.classList.remove('hidden');
        const needed = nextTier.min_qty - currentQty;
        
        // Find previous tier min_qty for percentage calculation
        const prevTier = [...sortedTiers].reverse().find(t => t.min_qty <= currentQty);
        const startQty = prevTier ? prevTier.min_qty : 0;
        const range = nextTier.min_qty - startQty;
        const progress = ((currentQty - startQty) / range) * 100;
        
        if (progressText) progressText.innerHTML = `Beli <span class="font-bold">${needed} lagi</span> untuk harga <span class="font-bold">Rp ${nextTier.price.toLocaleString('id-ID')}</span>`;
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (progressPercent) progressPercent.innerText = `${Math.round(progress)}%`;
    } else if (progressContainer) {
        progressContainer.classList.add('hidden');
    }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.calculateTieredPrice = calculateTieredPrice;
    window.getNextTierInfo = getNextTierInfo;
    window.updateTieredPricingUI = updateTieredPricingUI;
}
