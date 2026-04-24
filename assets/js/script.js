var escapeHtml = (window.FrontendSanitize && window.FrontendSanitize.escapeHtml) || ((value) => String(value || ''));
var sanitizeUrl = (window.FrontendSanitize && window.FrontendSanitize.sanitizeUrl) || ((url) => String(url || ''));
var ensureImageFallbackHandler = (window.FrontendSanitize && window.FrontendSanitize.ensureImageFallbackHandler) || (() => {});

ensureImageFallbackHandler();

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
let allCategories = [];
let currentCategory = 'Semua';
let currentPage = 1;
const itemsPerPage = 12;
let filteredProducts = [];
let storeClosed = CONFIG.isStoreClosed();
let selectedVariation = null;
let currentModalProduct = null;
let paylaterCheckoutState = {
    loading: false,
    eligible: false,
    reason: 'not_checked',
    message: 'Belum dicek',
    account: null,
    summary: null,
    config: null,
    simulation: null
};
let paylaterCheckoutRequestSeq = 0;
const HEADER_NOTIFICATION_REFRESH_INTERVAL_MS = 60000;
const HEADER_NOTIFICATION_VISIBLE_COUNT = 5;
const HEADER_NOTIFICATION_LIST_FALLBACK_MAX_HEIGHT = 'min(28rem, calc(100vh - 14rem))';
let headerNotificationRefreshTimer = null;
let headerNotificationRefreshInFlight = false;
let headerNotificationState = {
    items: [],
    unreadCount: 0,
    lastSyncedAt: '',
    lastOpenedId: '',
    detailAction: null
};
let headerNotificationOrderCache = Object.create(null);

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

function optimizeImageUrl(url, width, height) {
    const safeUrl = sanitizeUrl(url, 'https://placehold.co/300x200?text=Produk');
    if (!safeUrl || typeof safeUrl !== 'string') return safeUrl;

    if (safeUrl.includes('ik.imagekit.io')) {
        const transform = `tr=w-${width},h-${height},c-at_max,q-70,f-webp`;
        return safeUrl.includes('?')
            ? `${safeUrl}&${transform}`
            : `${safeUrl}?${transform}`;
    }

    return safeUrl;
}

function ensureProductId(p, index) {
    const base = p.id || p.sku || p.slug || createSlug(p.nama) || 'product';
    const needsSuffix = !(p.id || p.sku);
    return needsSuffix ? `${base}-${index}` : String(base);
}

function findProductById(id) {
    if (!id) return null;
    const target = String(id).trim();
    if (target === '') return null;

    return allProducts.find((p) => {
        const references = [p.productId, p.id, p.sku, p.slug]
            .map((value) => String(value || '').trim())
            .filter((value) => value !== '');
        return references.includes(target);
    }) || null;
}

function isProductInteractionLocked(product) {
    return Boolean(product && product.isHidden === true);
}

function normalizeProductStatusValue(primaryValue, fallbackValue) {
    const candidates = [primaryValue, fallbackValue];
    for (let i = 0; i < candidates.length; i += 1) {
        const normalized = String(candidates[i] || '').trim().toLowerCase();
        if (normalized === '') continue;
        if (normalized === 'sembunyikan' || normalized === 'disembunyikan' || normalized === 'hidden' || normalized === 'off') {
            return 'sembunyikan';
        }
        if (normalized === 'tampil' || normalized === 'ditampilkan' || normalized === 'show' || normalized === 'on') {
            return 'tampil';
        }
    }
    return 'tampil';
}

function sanitizeTieredPricesValue(value) {
    if (!value) return '';

    if (typeof parseTieredPricesInput === 'function') {
        const parsed = parseTieredPricesInput(value);
        return parsed.length > 0 ? JSON.stringify(parsed) : '';
    }

    const raw = String(value || '').trim();
    if (raw === '' || (!raw.startsWith('[') && !raw.startsWith('{'))) {
        return '';
    }

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0 ? JSON.stringify(parsed) : '';
    } catch (error) {
        return '';
    }
}

function getProductForCartItem(item) {
    if (!item) return null;
    const targetId = String(item.productId || item.id || '').trim();
    if (!targetId) return null;
    return allProducts.find((p) => String(p.productId || p.id || '').trim() === targetId) || null;
}

function getItemReferenceValues(item) {
    if (!item || typeof item !== 'object') return [];
    return [item.productId, item.id, item.sku, item.slug]
        .map((value) => String(value || '').trim())
        .filter((value) => value !== '');
}

function findSimpleCartItemIndexByProductId(productId) {
    const target = String(productId || '').trim();
    if (!target) return -1;

    return cart.findIndex((item) => (
        !item.selectedVariation &&
        getItemReferenceValues(item).includes(target)
    ));
}

function getSimpleProductCartQty(productId) {
    const itemIndex = findSimpleCartItemIndexByProductId(productId);
    if (itemIndex < 0) return 0;
    return Math.max(0, parseInt(cart[itemIndex].qty, 10) || 0);
}

function prefersReducedMotion() {
    return Boolean(
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
}

function getProductCardCartControlState(product) {
    const productId = String(product && (product.productId || product.id || product.sku || product.slug) || '').trim();
    const quantity = getSimpleProductCartQty(productId);
    const maxStock = getItemMaxStock(product);

    return {
        productId,
        quantity,
        maxStock,
        mode: quantity > 0 ? 'stepper' : 'button'
    };
}

function renderProductCardCartControl(product) {
    const state = getProductCardCartControlState(product);
    const { productId, quantity, maxStock, mode } = state;
    const isDisabled = maxStock <= 0;

    if (mode === 'stepper' && quantity > 0) {
        return `
            <div class="product-card-cart-control flex h-full w-full items-center justify-between rounded-2xl bg-lime-100 px-3 py-2.5 shadow-sm ring-1 ring-lime-200">
                <button type="button" data-action="update-product-card-qty" data-product-id="${productId}" data-delta="-1" class="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-green-700 shadow-sm ring-1 ring-green-200 transition hover:bg-white hover:scale-105 active:scale-95" aria-label="Kurangi jumlah produk">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M20 12H4"></path>
                    </svg>
                </button>
                <span class="product-card-cart-count text-xl font-black text-green-800 tabular-nums" aria-live="polite" aria-atomic="true">${quantity}</span>
                <button type="button" data-action="update-product-card-qty" data-product-id="${productId}" data-delta="1" ${quantity >= maxStock ? 'disabled aria-disabled="true"' : ''} class="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-green-700 shadow-sm ring-1 ring-green-200 transition hover:bg-white hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Tambah jumlah produk">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M12 4v16m8-8H4"></path>
                    </svg>
                </button>
            </div>
        `;
    }

    return `
        <button data-action="add-to-cart" data-product-id="${productId}" ${isDisabled ? 'disabled' : ''} class="product-card-cart-control flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 text-sm font-semibold text-green-700 transition hover:border-green-300 hover:bg-green-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 4h11.5M9 19.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm10 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"></path></svg>
            + Keranjang
        </button>
    `;
}

function syncProductGridCartControls() {
    const slots = document.querySelectorAll('[data-product-cart-slot]');
    if (!slots.length) return;

    slots.forEach((slot) => {
        const productId = slot.getAttribute('data-product-id');
        const product = findProductById(productId);
        if (!product) return;

        const nextState = getProductCardCartControlState(product);
        const nextHtml = renderProductCardCartControl(product).trim();
        const currentMode = slot.getAttribute('data-cart-mode') || '';
        const currentQty = parseInt(slot.getAttribute('data-cart-qty') || '0', 10) || 0;
        const currentHtml = slot.innerHTML.trim();

        if (currentMode === nextState.mode && currentQty === nextState.quantity && currentHtml === nextHtml) {
            return;
        }

        slot.innerHTML = nextHtml;
        slot.setAttribute('data-cart-mode', nextState.mode);
        slot.setAttribute('data-cart-qty', String(nextState.quantity));

        const control = slot.firstElementChild;
        if (control && !prefersReducedMotion()) {
            control.classList.remove('product-card-cart-control-enter');
            void control.offsetWidth;
            control.classList.add('product-card-cart-control-enter');
        }
    });
}

function updateProductCardQty(productId, delta) {
    const step = parseInt(delta, 10);
    if (!Number.isFinite(step) || step === 0) return;

    const cartIndex = findSimpleCartItemIndexByProductId(productId);
    if (cartIndex < 0) {
        if (step > 0) {
            const product = findProductById(productId);
            if (product) addToCart(product, null, step);
        }
        return;
    }

    updateQty(cartIndex, step);
}

function isCartItemUnavailable(item) {
    const product = getProductForCartItem(item);
    return Boolean(product && isProductInteractionLocked(product));
}

function resolveProductForModal(product) {
    if (!product || typeof product !== 'object') return null;

    const references = [product.productId, product.id, product.sku, product.slug];
    for (let i = 0; i < references.length; i += 1) {
        const matched = findProductById(references[i]);
        if (matched) return matched;
    }

    return product;
}

function getCurrentModalProduct() {
    const modal = document.getElementById('detail-modal');
    const modalRef = modal ? modal.dataset.productId : null;
    const byModalRef = findProductById(modalRef);
    if (byModalRef) return byModalRef;

    return resolveProductForModal(currentModalProduct);
}

function normalizeCategoryLabel(value) {
    return String(value || '').trim();
}

function extractCategoryName(row) {
    if (!row || typeof row !== 'object') return '';
    const candidates = ['nama', 'name', 'kategori', 'category', 'judul', 'title'];
    for (let i = 0; i < candidates.length; i += 1) {
        const name = normalizeCategoryLabel(row[candidates[i]]);
        if (name) return name;
    }
    return '';
}

function extractCategorySortOrder(row, index) {
    if (!row || typeof row !== 'object') return index;
    const candidates = ['sort_order', 'urutan', 'order', 'sort', 'no', 'id'];
    for (let i = 0; i < candidates.length; i += 1) {
        const parsed = parseInt(row[candidates[i]], 10);
        if (Number.isFinite(parsed)) return parsed;
    }
    return index;
}

function deriveCategoriesFromProducts() {
    const categoriesSet = new Set();
    allProducts.forEach((p) => {
        const category = normalizeCategoryLabel(p.category || p.kategori || '');
        if (category) categoriesSet.add(category);
    });
    return Array.from(categoriesSet).sort((a, b) => a.localeCompare(b, 'id'));
}

function getDisplayCategories() {
    const fromProducts = deriveCategoriesFromProducts();
    if (!Array.isArray(allCategories) || allCategories.length === 0) {
        return fromProducts;
    }

    const merged = [];
    const seen = {};
    const pushUnique = (name) => {
        const category = normalizeCategoryLabel(name);
        if (!category) return;
        const key = category.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        merged.push(category);
    };

    allCategories.forEach(pushUnique);
    fromProducts.forEach(pushUnique);
    return merged;
}

async function fetchCategories() {
    try {
        const rows = await ApiService.get('?sheet=categories', {
            cacheDuration: 5 * 60 * 1000
        });
        if (!Array.isArray(rows) || rows.length === 0) {
            return [];
        }

        const parsed = rows
            .map((row, index) => ({
                name: extractCategoryName(row),
                order: extractCategorySortOrder(row, index)
            }))
            .filter((item) => item.name !== '')
            .sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return a.name.localeCompare(b.name, 'id');
            })
            .map((item) => item.name);

        const unique = [];
        const seen = {};
        parsed.forEach((name) => {
            const key = name.toLowerCase();
            if (seen[key]) return;
            seen[key] = true;
            unique.push(name);
        });
        return unique;
    } catch (error) {
        console.warn('Categories endpoint unavailable, fallback ke kategori produk:', error);
        return [];
    }
}

function getItemMaxStock(item) {
    if (!item) return 0;
    const source = item.selectedVariation || item;
    const parsed = parseInt(source.stok, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getCurrentModalMaxStock() {
    if (selectedVariation) return getItemMaxStock(selectedVariation);
    if (currentModalProduct) return getItemMaxStock(currentModalProduct);
    return 0;
}

function getLatestStockForCartItem(item) {
    if (!item) return 0;
    const product = getProductForCartItem(item);
    if (!product) return getItemMaxStock(item);
    if (isProductInteractionLocked(product)) return 0;

    if (item.selectedVariation && item.selectedVariation.sku && Array.isArray(product.variations)) {
        const targetSku = String(item.selectedVariation.sku || '').trim();
        const matched = product.variations.find((v) => String(v.sku || '').trim() === targetSku);
        if (matched) {
            const variationStock = parseInt(matched.stok, 10);
            return Number.isFinite(variationStock) && variationStock > 0 ? variationStock : 0;
        }
    }

    const productStock = parseInt(product.stok, 10);
    return Number.isFinite(productStock) && productStock > 0 ? productStock : 0;
}

function syncCartWithStockLimits(options) {
    const settings = options || {};
    if (!Array.isArray(cart) || cart.length === 0) return;
    const nextCart = [];
    let adjusted = false;
    let removedUnavailableCount = 0;

    cart.forEach((item) => {
        const product = getProductForCartItem(item);
        if (product && isProductInteractionLocked(product)) {
            adjusted = true;
            removedUnavailableCount += 1;
            return;
        }
        const maxStock = getLatestStockForCartItem(item);
        if (maxStock <= 0) {
            adjusted = true;
            return;
        }

        const currentQty = Math.max(1, parseInt(item.qty, 10) || 1);
        const nextQty = Math.min(currentQty, maxStock);
        const nextItem = {
            ...item,
            stok: maxStock,
            qty: nextQty,
            grosir: sanitizeTieredPricesValue(product ? product.grosir : item.grosir)
        };
        if (product) {
            nextItem.productId = product.productId || nextItem.productId;
            nextItem.slug = product.slug || nextItem.slug;
        }
        if (nextItem.selectedVariation && typeof nextItem.selectedVariation === 'object') {
            let nextVariation = {
                ...nextItem.selectedVariation,
                stok: maxStock,
                grosir: sanitizeTieredPricesValue(nextItem.selectedVariation.grosir)
            };
            if (product && Array.isArray(product.variations)) {
                const targetSku = String(nextItem.selectedVariation.sku || '').trim();
                const matchedVariation = product.variations.find((variation) => String(variation.sku || '').trim() === targetSku);
                if (matchedVariation) {
                    nextVariation = {
                        ...nextVariation,
                        ...matchedVariation,
                        stok: maxStock,
                        grosir: sanitizeTieredPricesValue(matchedVariation.grosir)
                    };
                    nextItem.harga = parseInt(matchedVariation.harga, 10) || nextItem.harga;
                }
            }
            nextItem.selectedVariation = nextVariation;
        } else if (product) {
            nextItem.harga = parseInt(product.harga, 10) || nextItem.harga;
        }
        if (nextItem.grosir !== String(item.grosir || '')) {
            adjusted = true;
        }
        const originalVariationGrosir = item.selectedVariation && item.selectedVariation.grosir
            ? String(item.selectedVariation.grosir)
            : '';
        const nextVariationGrosir = nextItem.selectedVariation && nextItem.selectedVariation.grosir
            ? String(nextItem.selectedVariation.grosir)
            : '';
        if (nextVariationGrosir !== originalVariationGrosir) {
            adjusted = true;
        }
        if (nextQty !== currentQty) {
            adjusted = true;
        }
        nextCart.push(nextItem);
    });

    if (adjusted) {
        cart = nextCart;
        saveCart();
    }

    if (!settings.silent && removedUnavailableCount > 0) {
        showToast(removedUnavailableCount === 1
            ? 'Produk yang sedang tidak tersedia dihapus dari keranjang.'
            : 'Beberapa produk yang sedang tidak tersedia dihapus dari keranjang.');
    }
}


async function fetchProducts() {
    try {
        // Use ApiService with caching (5 minutes)
        const [products, categories] = await Promise.all([
            ApiService.get('?sheet=products', {
                cacheDuration: 5 * 60 * 1000 // 5 minutes cache
            }),
            fetchCategories()
        ]);
        allCategories = categories;
        
        allProducts = products.map((p, index) => {
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
            if (Array.isArray(variations)) {
                variations = variations.map((variation) => ({
                    ...variation,
                    grosir: sanitizeTieredPricesValue(variation.grosir)
                }));
            }

            const slug = p.slug || createSlug(p.nama);
            const productId = ensureProductId({ ...p, slug }, index);

            // Status visibility: 'tampil' (default) atau 'sembunyikan'
            const statusVal = normalizeProductStatusValue(p.status, p.grosir);
            const isHidden  = statusVal === 'sembunyikan';
            const normalizedGrosir = sanitizeTieredPricesValue(p.grosir);

            return {
                ...p,
                slug,
                productId,
                harga: cashPrice,
                hargaCoret: parseInt(p.harga_coret) || 0,
                hargaGajian: gajianInfo.price,
                stok: parseInt(p.stok) || 0,
                category: category,
                deskripsi: (p.deskripsi && p.deskripsi.trim() !== "") ? p.deskripsi : defaultDesc,
                variations: variations,
                grosir: normalizedGrosir,
                status: statusVal,
                isHidden: isHidden
            };
        });
        syncCartWithStockLimits();
        renderCategoryFilters(); // Render dynamic categories
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
 * Renders category filter buttons dynamically based on products.
 * Only shows categories that have at least one product.
 */
function renderCategoryFilters() {
    const container = document.getElementById('category-filters');
    if (!container || !allProducts || allProducts.length === 0) return;
    
    console.log('Rendering category filters...');

    const categories = getDisplayCategories();
    console.log('Categories found:', categories);

    if (currentCategory !== 'Semua' && categories.indexOf(currentCategory) === -1) {
        currentCategory = 'Semua';
    }
    
    // Keep "Semua" button and add dynamic categories with carousel styling
    const allBtnClass = currentCategory === 'Semua'
        ? 'filter-btn active snap-start flex-shrink-0 px-6 py-2 rounded-full border-2 border-green-500 bg-green-50 text-green-700 text-sm font-bold transition hover:border-green-600 hover:bg-green-100'
        : 'filter-btn snap-start flex-shrink-0 px-6 py-2 rounded-full border-2 border-gray-300 bg-white text-gray-700 text-sm font-bold transition hover:border-green-500 hover:bg-green-50';
    let html = `<button type="button" data-action="set-category" data-category="Semua" class="${allBtnClass}">Semua</button>`;
    
    categories.forEach(cat => {
        const safeCat = escapeHtml(cat);
        const btnClass = currentCategory === cat
            ? 'filter-btn active snap-start flex-shrink-0 px-6 py-2 rounded-full border-2 border-green-500 bg-green-50 text-green-700 text-sm font-bold transition hover:border-green-600 hover:bg-green-100'
            : 'filter-btn snap-start flex-shrink-0 px-6 py-2 rounded-full border-2 border-gray-300 bg-white text-gray-700 text-sm font-bold transition hover:border-green-500 hover:bg-green-50';
        html += `<button type="button" data-action="set-category" data-category="${safeCat}" class="${btnClass}">${safeCat}</button>`;
    });
    
    container.innerHTML = html;
    console.log('Category filters rendered:', categories.length, 'categories');
    renderHeaderCategoryMenu();
    
    // Add desktop scroll functionality
    initCategoryCarouselScroll();
}

function getHeaderCategoryDisplayLabel(category) {
    if (!category || category === 'Semua') return 'Kategori';
    return String(category);
}

function updateHeaderCategoryLabel(category) {
    const labelEl = document.getElementById('header-category-label');
    const trigger = document.getElementById('header-category-trigger');
    const resolvedLabel = getHeaderCategoryDisplayLabel(category || currentCategory);

    if (labelEl) {
        labelEl.textContent = resolvedLabel;
    }
    if (trigger) {
        trigger.setAttribute('title', `Kategori aktif: ${resolvedLabel}`);
    }
}

function getHeaderUserDisplayName() {
    const user = getStoredLoggedInUser();
    return String((user && (user.nama || user.name || user.pelanggan)) || 'Ridho').trim() || 'Ridho';
}

function getHeaderGreetingName() {
    const firstName = getHeaderUserDisplayName().split(/\s+/).filter(Boolean)[0] || 'Ridho';
    return firstName.slice(0, 14);
}

function getHeaderAccountSubtitle() {
    const user = getStoredLoggedInUser();
    if (!user) return 'Pelanggan Paket Sembako';

    const email = String(user.email || user.mail || user.email_address || '').trim();
    if (email) {
        return email.slice(0, 42);
    }

    const phone = String(
        (typeof normalizePhone === 'function'
            ? normalizePhone(user.whatsapp || user.phone || '')
            : (user.whatsapp || user.phone || '')) || ''
    ).trim();

    return phone || 'Pelanggan Paket Sembako';
}

function syncHeaderGreeting() {
    const greetingEl = document.getElementById('header-greeting-name');
    const accountNameEl = document.getElementById('header-account-name');
    const accountSubtitleEl = document.getElementById('header-account-subtitle');

    if (greetingEl) {
        greetingEl.textContent = getHeaderGreetingName();
    }
    if (accountNameEl) {
        accountNameEl.textContent = getHeaderUserDisplayName();
    }
    if (accountSubtitleEl) {
        accountSubtitleEl.textContent = getHeaderAccountSubtitle();
    }
}

function closeHeaderAccountMenu() {
    const menu = document.getElementById('header-account-menu');
    const trigger = document.getElementById('header-account-trigger');
    const chevron = document.getElementById('header-account-chevron');

    if (menu) {
        menu.classList.remove('is-open');
        menu.setAttribute('aria-hidden', 'true');
    }
    if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
    }
    if (chevron) {
        chevron.classList.remove('rotate-180');
    }
}

function openHeaderAccountMenu() {
    const menu = document.getElementById('header-account-menu');
    const trigger = document.getElementById('header-account-trigger');
    const chevron = document.getElementById('header-account-chevron');

    if (!menu) return;

    closeSearchSuggestions();
    closeHeaderCategoryMenu();
    syncHeaderGreeting();
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
    if (trigger) {
        trigger.setAttribute('aria-expanded', 'true');
    }
    if (chevron) {
        chevron.classList.add('rotate-180');
    }
}

function toggleHeaderAccountMenu(forceOpen) {
    const menu = document.getElementById('header-account-menu');
    if (!menu) return;

    const shouldOpen = typeof forceOpen === 'boolean'
        ? forceOpen
        : !menu.classList.contains('is-open');

    if (shouldOpen) {
        openHeaderAccountMenu();
    } else {
        closeHeaderAccountMenu();
    }
}

function handleHeaderAccountLogout() {
    try {
        localStorage.removeItem('gosembako_user');
    } catch (error) {
        console.warn('Failed clearing gosembako_user from header:', error);
    }

    closeHeaderAccountMenu();
    syncHeaderAuthState();
    syncPaylaterAvailability();
    showToast('Anda berhasil logout.');
}

function syncHeaderAuthState() {
    const isLoggedIn = hasCheckoutLoginSession();
    const guestActions = document.getElementById('header-guest-actions');
    const authIcons = document.getElementById('header-auth-icons');

    if (guestActions) {
        guestActions.classList.toggle('hidden', isLoggedIn);
        guestActions.setAttribute('aria-hidden', String(isLoggedIn));
    }

    if (authIcons) {
        authIcons.classList.toggle('hidden', !isLoggedIn);
        authIcons.setAttribute('aria-hidden', String(!isLoggedIn));
    }

    if (!isLoggedIn) {
        stopHeaderNotificationAutoRefresh();
        closeHeaderNotificationDropdown();
        closeHeaderNotificationDetailModal();
        closeHeaderOrderTrackingModal();
        headerNotificationState = {
            items: [],
            unreadCount: 0,
            lastSyncedAt: '',
            lastOpenedId: '',
            detailAction: null
        };
        headerNotificationOrderCache = Object.create(null);
        updateHeaderNotificationBadge(0, 0);
        renderHeaderNotificationDropdown();
        closeHeaderAccountMenu();
        return;
    }

    syncHeaderGreeting();
    syncHeaderNotificationState();
    startHeaderNotificationAutoRefresh();
}

function updateHeaderNotificationBadge(unreadCount, totalCount) {
    const trigger = document.getElementById('header-notification-trigger');
    const badge = document.getElementById('header-notification-count');
    if (!trigger || !badge) return;

    const unread = Math.max(0, parseInt(unreadCount, 10) || 0);
    const total = Math.max(unread, parseInt(totalCount, 10) || 0);
    const displayCount = unread > 99 ? '99+' : String(unread);

    badge.textContent = displayCount;
    badge.classList.toggle('hidden', unread <= 0);
    trigger.classList.toggle('text-amber-400', unread <= 0);
    trigger.classList.toggle('text-green-600', unread > 0);

    const label = unread > 0
        ? `Notifikasi, ${displayCount} notifikasi baru`
        : (total > 0 ? 'Notifikasi, semua sudah dibaca' : 'Notifikasi');
    trigger.setAttribute('title', label);
    trigger.setAttribute('aria-label', label);
}

function parseHeaderNotificationSuccess(payload, fallbackMessage) {
    if (payload && payload.success === true) {
        return payload;
    }
    const message = String(
        (payload && (payload.message || payload.error || payload.error_code)) ||
        fallbackMessage ||
        'Gagal memuat notifikasi.'
    ).trim();
    throw new Error(message);
}

function parseHeaderNotificationBool(value) {
    if (value === true) return true;
    const normalized = String(value === undefined ? '' : value).trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parseHeaderNotificationDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    if (raw.includes('/')) {
        const parts = raw.split(',');
        const dateOnly = parts[0] ? parts[0].trim() : raw;
        const bits = dateOnly.split('/');
        if (bits.length === 3) {
            const day = parseInt(bits[0], 10);
            const month = parseInt(bits[1], 10);
            const year = parseInt(bits[2], 10);
            const fallback = new Date(year, month - 1, day);
            if (!Number.isNaN(fallback.getTime())) return fallback;
        }
    }
    return null;
}

function formatHeaderNotificationDateTime(value) {
    const parsed = parseHeaderNotificationDate(value);
    if (!parsed || Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatHeaderNotificationRelativeTime(value) {
    const parsed = parseHeaderNotificationDate(value);
    if (!parsed) return 'Waktu tidak tersedia';
    const diffMs = Date.now() - parsed.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes <= 1) return 'Baru saja';
    if (diffMinutes < 60) return `${diffMinutes} menit yang lalu`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} jam yang lalu`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `${diffDays} hari yang lalu`;
    return parsed.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function truncateHeaderNotificationText(value, maxLength) {
    const raw = String(value || '').trim();
    const limit = parseInt(maxLength, 10) || 120;
    if (!raw) return '';
    if (raw.length <= limit) return raw;
    return `${raw.slice(0, Math.max(0, limit - 3))}...`;
}

function normalizeHeaderNotificationIcon(iconKey, fallbackType) {
    const normalized = String(iconKey || fallbackType || '').trim().toLowerCase();
    const map = {
        announcement: 'announcement',
        pengumuman: 'announcement',
        promo: 'promo',
        order: 'order',
        pesanan: 'order',
        truck: 'truck',
        shipping: 'truck',
        pengiriman: 'truck',
        feature: 'feature',
        fitur: 'feature',
        maintenance: 'maintenance',
        keamanan: 'security',
        security: 'security'
    };
    return map[normalized] || 'announcement';
}

function getHeaderNotificationIconHtml(iconKey, fallbackType) {
    const icon = normalizeHeaderNotificationIcon(iconKey, fallbackType);
    const map = {
        announcement: {
            bg: 'bg-green-100 text-green-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19a1 1 0 001.993.117L13 19v-4.382a1 1 0 01.883-.993L14 13.618l4.447-.741A2 2 0 0020 10.903V8.097a2 2 0 00-1.553-1.974L14 5.382a1 1 0 01-.993-.883L13 4.382V3a1 1 0 10-2 0v2.882zM5 10h3m-3 4h4"></path></svg>'
        },
        promo: {
            bg: 'bg-rose-100 text-rose-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path></svg>'
        },
        order: {
            bg: 'bg-amber-100 text-amber-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>'
        },
        truck: {
            bg: 'bg-indigo-100 text-indigo-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17h6m-6 0a2 2 0 11-4 0m4 0a2 2 0 104 0m0 0h2a2 2 0 002-2v-3.586a1 1 0 00-.293-.707l-2.414-2.414A1 1 0 0015.586 8H13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v9a2 2 0 002 2h1"></path></svg>'
        },
        feature: {
            bg: 'bg-cyan-100 text-cyan-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"></path></svg>'
        },
        maintenance: {
            bg: 'bg-slate-100 text-slate-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
        },
        security: {
            bg: 'bg-emerald-100 text-emerald-700',
            svg: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3l7 4v5c0 5-3.438 9.719-7 11-3.562-1.281-7-6-7-11V7l7-4z"></path></svg>'
        }
    };
    const item = map[icon] || map.announcement;
    return `<div class="w-11 h-11 rounded-2xl ${item.bg} flex items-center justify-center shrink-0">${item.svg}</div>`;
}

function normalizeHeaderNotificationRecord(row) {
    const record = row || {};
    const content = String(record.content || record.message || record.body || '').trim();
    const summary = String(record.summary || record.preview || '').trim() || truncateHeaderNotificationText(content, 140);
    return {
        id: String(record.id || record.notification_id || '').trim(),
        type: String(record.type || '').trim().toLowerCase(),
        title: String(record.title || 'Notifikasi').trim(),
        summary: summary || 'Notifikasi baru tersedia.',
        content: content || summary || 'Isi notifikasi belum tersedia.',
        icon: normalizeHeaderNotificationIcon(record.icon || record.category || record.type, record.type),
        updatedAt: String(record.updated_at || record.updatedAt || '').trim(),
        createdAt: String(record.created_at || record.createdAt || '').trim(),
        startAt: String(record.start_at || '').trim(),
        isPinned: parseHeaderNotificationBool(record.is_pinned || record.pinned),
        isRead: parseHeaderNotificationBool(record.is_read || record.isRead),
        referenceType: String(record.reference_type || '').trim().toLowerCase(),
        referenceId: String(record.reference_id || '').trim(),
        actionLabel: String(record.action_label || '').trim(),
        actionUrl: String(record.action_url || '').trim()
    };
}

function sortHeaderNotificationsByNewest(rows) {
    return (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
        const dateA = parseHeaderNotificationDate(a.updatedAt || a.createdAt || a.startAt) || new Date(0);
        const dateB = parseHeaderNotificationDate(b.updatedAt || b.createdAt || b.startAt) || new Date(0);
        const dateDelta = dateB - dateA;
        if (dateDelta !== 0) return dateDelta;
        if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
        return String(b.id || '').localeCompare(String(a.id || ''));
    });
}

function applyHeaderNotificationDropdownViewportLimit() {
    const listEl = document.getElementById('header-notification-list');
    const dropdownEl = document.getElementById('header-notification-dropdown');
    if (!listEl) return;

    const buttons = Array.from(listEl.querySelectorAll('[data-action="open-header-notification"]'));
    listEl.style.maxHeight = HEADER_NOTIFICATION_LIST_FALLBACK_MAX_HEIGHT;

    if (!dropdownEl || dropdownEl.classList.contains('hidden') || buttons.length <= HEADER_NOTIFICATION_VISIBLE_COUNT) {
        return;
    }

    window.requestAnimationFrame(() => {
        const visibleButtons = buttons.slice(0, HEADER_NOTIFICATION_VISIBLE_COUNT);
        const firstButton = visibleButtons[0];
        const lastButton = visibleButtons[visibleButtons.length - 1];
        if (!firstButton || !lastButton) return;

        const measuredHeight = (lastButton.offsetTop - firstButton.offsetTop) + lastButton.offsetHeight;
        if (measuredHeight > 0) {
            listEl.style.maxHeight = `min(${Math.ceil(measuredHeight)}px, calc(100vh - 14rem))`;
        }
    });
}

function createHeaderNotificationItemHtml(notification) {
    const unread = !notification.isRead;
    const summary = truncateHeaderNotificationText(notification.summary || notification.content, 88);
    return `
        <button type="button" data-action="open-header-notification" data-id="${escapeHtml(notification.id)}" class="w-full text-left px-4 py-4 hover:bg-gray-50 transition">
            <div class="flex items-start gap-3">
                ${getHeaderNotificationIconHtml(notification.icon, notification.type)}
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="text-sm font-bold ${unread ? 'text-gray-900' : 'text-gray-700'}">${escapeHtml(notification.title)}</p>
                            <p class="text-xs ${unread ? 'text-gray-700' : 'text-gray-500'} mt-1 leading-5">${escapeHtml(summary || 'Notifikasi baru tersedia.')}</p>
                        </div>
                        ${unread ? '<span class="shrink-0 inline-flex items-center px-2 py-1 rounded-full bg-green-600 text-white text-[10px] font-black uppercase tracking-wide">Baru</span>' : ''}
                    </div>
                    <div class="flex items-center justify-between gap-3 mt-3">
                        <span class="text-[11px] text-gray-500">${escapeHtml(formatHeaderNotificationRelativeTime(notification.updatedAt || notification.createdAt || notification.startAt))}</span>
                        ${notification.isPinned ? '<span class="inline-flex items-center px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wide">Pinned</span>' : ''}
                    </div>
                </div>
            </div>
        </button>
    `;
}

function renderHeaderNotificationDropdown() {
    const subtitleEl = document.getElementById('header-notification-subtitle');
    const markAllEl = document.getElementById('header-notification-mark-all');
    const loadingEl = document.getElementById('header-notification-loading');
    const emptyEl = document.getElementById('header-notification-empty');
    const listEl = document.getElementById('header-notification-list');
    if (!subtitleEl || !markAllEl || !loadingEl || !emptyEl || !listEl) return;

    const items = Array.isArray(headerNotificationState.items) ? headerNotificationState.items : [];
    const unreadCount = Math.max(0, parseInt(headerNotificationState.unreadCount, 10) || 0);

    subtitleEl.textContent = unreadCount > 0
        ? `${unreadCount} notifikasi baru menunggu dibaca.`
        : (items.length > 0 ? 'Semua notifikasi sudah dibaca.' : 'Belum ada notifikasi baru.');
    markAllEl.classList.toggle('hidden', unreadCount <= 0);
    loadingEl.classList.add('hidden');

    if (items.length === 0) {
        emptyEl.classList.remove('hidden');
        listEl.classList.add('hidden');
        listEl.innerHTML = '';
        return;
    }

    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    listEl.innerHTML = items.map((item) => createHeaderNotificationItemHtml(item)).join('');
    applyHeaderNotificationDropdownViewportLimit();
}

function closeHeaderNotificationDropdown() {
    const dropdown = document.getElementById('header-notification-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
}

function normalizeHeaderOrderStatus(status) {
    if (!status) return 'Menunggu';

    const statusLower = String(status).toLowerCase().trim();
    const statusMapping = {
        menunggu: 'Menunggu',
        pending: 'Menunggu',
        diproses: 'Diproses',
        proses: 'Diproses',
        processing: 'Diproses',
        dikirim: 'Dikirim',
        kirim: 'Dikirim',
        shipped: 'Dikirim',
        diterima: 'Diterima',
        terima: 'Diterima',
        selesai: 'Diterima',
        completed: 'Diterima',
        dibatalkan: 'Dibatalkan',
        batal: 'Dibatalkan',
        cancelled: 'Dibatalkan',
        canceled: 'Dibatalkan'
    };

    return statusMapping[statusLower] || String(status).trim() || 'Menunggu';
}

function getHeaderOrderStatusBadge(status) {
    const normalizedStatus = normalizeHeaderOrderStatus(status);
    const statusMap = {
        Menunggu: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Menunggu' },
        Diproses: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Diproses' },
        Dikirim: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Dikirim' },
        Diterima: { bg: 'bg-green-100', text: 'text-green-700', label: 'Diterima' },
        Dibatalkan: { bg: 'bg-red-100', text: 'text-red-700', label: 'Dibatalkan' }
    };
    const statusInfo = statusMap[normalizedStatus] || statusMap.Menunggu;
    return `<span class="${statusInfo.bg} ${statusInfo.text} text-xs font-bold px-3 py-1 rounded-full">${statusInfo.label}</span>`;
}

function formatHeaderOrderDate(dateString) {
    if (!dateString || dateString === 'N/A') return 'N/A';

    let date;
    if (typeof dateString === 'number') {
        date = new Date(dateString);
    } else {
        const raw = String(dateString).trim();
        const dateOnly = raw.split(',')[0].trim();
        date = new Date(raw);

        if (Number.isNaN(date.getTime()) && dateOnly.includes('/')) {
            const parts = dateOnly.split('/');
            if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10);
                const year = parseInt(parts[2], 10);
                if (day <= 31 && month <= 12 && year > 1900) {
                    date = new Date(year, month - 1, day);
                }
            }
        }
    }

    if (!date || Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function parseHeaderOrderCurrencyValue(value) {
    if (typeof value === 'number') return value;
    const cleaned = String(value || '')
        .replace(/[^0-9,-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatHeaderOrderCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(parseHeaderOrderCurrencyValue(amount));
}

function createHeaderOrderTimeline(currentStatus) {
    const statuses = [
        { name: 'Menunggu', gif: 'wait.gif', key: 'Menunggu' },
        { name: 'Diproses', gif: 'grocery-basket.gif', key: 'Diproses' },
        { name: 'Dikirim', gif: 'grocery.gif', key: 'Dikirim' },
        { name: 'Diterima', gif: 'shipping.gif', key: 'Diterima' }
    ];

    const normalizedStatus = normalizeHeaderOrderStatus(currentStatus);
    let currentIndex = statuses.findIndex((item) => item.key === normalizedStatus);

    if (normalizedStatus === 'Dibatalkan') {
        return `
            <div class="flex items-center justify-center gap-3 py-4">
                <div class="bg-red-500 w-12 h-12 rounded-full flex items-center justify-center animate-pulse">
                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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

    if (currentIndex === -1) currentIndex = 0;

    return `
        <div class="flex items-center justify-between gap-2 py-2">
            ${statuses.map((item, index) => {
                const isActive = index <= currentIndex;
                const isCurrent = index === currentIndex;
                const isLast = index === statuses.length - 1;
                const imagePath = `./assets/images/${item.gif}`;
                const safeImage = sanitizeUrl(imagePath, './assets/images/wait.gif');

                return `
                    <div class="flex flex-col items-center flex-1">
                        <div class="${isActive ? 'bg-green-50' : 'bg-gray-100'} w-12 h-12 rounded-full flex items-center justify-center ${isCurrent ? 'ring-2 ring-green-500 ring-offset-2' : ''}">
                            <img src="${safeImage}" alt="${item.name}" class="w-8 h-8 object-contain ${isActive ? '' : 'opacity-40'}" data-fallback-src="${imagePath}">
                        </div>
                        <p class="text-[10px] font-semibold mt-2 text-center ${isActive ? 'text-gray-800' : 'text-gray-400'}">${item.name}</p>
                        ${isCurrent ? '<p class="text-[8px] text-green-600 font-bold mt-0.5">● Saat ini</p>' : '<p class="text-[8px] text-transparent mt-0.5">●</p>'}
                    </div>
                    ${!isLast ? `<div class="flex-shrink-0 w-8 h-0.5 ${isActive && index < currentIndex ? 'bg-green-500' : 'bg-gray-300'} transition-all duration-500 mb-6"></div>` : ''}
                `;
            }).join('')}
        </div>
    `;
}

function closeHeaderOrderTrackingModal() {
    const modal = document.getElementById('order-tracking-modal');
    if (modal) modal.classList.add('hidden');
}

function showHeaderOrderTrackingModal(order) {
    const orderIdEl = document.getElementById('tracking-order-id');
    const orderDateEl = document.getElementById('tracking-order-date');
    const statusBadgeEl = document.getElementById('tracking-status-badge');
    const productsEl = document.getElementById('tracking-products');
    const totalEl = document.getElementById('tracking-total');
    const timelineEl = document.getElementById('tracking-timeline');
    const modal = document.getElementById('order-tracking-modal');

    if (orderIdEl) orderIdEl.textContent = String(order.id || order.order_id || 'N/A').trim() || 'N/A';
    if (orderDateEl) {
        orderDateEl.textContent = formatHeaderOrderDate(
            order.tanggal || order.tanggal_pesanan || order.timestamp || order.date || order.created_at
        );
    }
    if (statusBadgeEl) {
        statusBadgeEl.innerHTML = getHeaderOrderStatusBadge(order.status || 'Menunggu');
    }
    if (productsEl) productsEl.textContent = order.produk || order.items || order.product_name || 'N/A';
    if (totalEl) totalEl.textContent = formatHeaderOrderCurrency(order.total || order.total_bayar || 0);
    if (timelineEl) {
        timelineEl.innerHTML = createHeaderOrderTimeline(order.status || 'Menunggu');
    }

    if (modal) {
        modal.classList.remove('hidden');
        modal.focus();
    }
}

async function fetchHeaderOrderById(orderId, options = {}) {
    const targetId = String(orderId || '').trim();
    if (!targetId) throw new Error('ID pesanan tidak tersedia.');

    const force = Boolean(options && options.force);
    if (!force && headerNotificationOrderCache[targetId]) {
        return headerNotificationOrderCache[targetId];
    }

    const sessionQuery = getSessionQueryFromStoredUser();
    if (!sessionQuery) {
        throw new Error('Session login tidak valid. Silakan login ulang.');
    }

    const payload = parseHeaderNotificationSuccess(
        await ApiService.get(`?action=public_user_orders${sessionQuery}&_t=${Date.now()}`, {
            cache: false,
            maxRetries: 1
        }),
        'Gagal memuat detail pesanan.'
    );

    const orders = Array.isArray(payload && payload.orders) ? payload.orders : [];
    const match = orders.find((item) => {
        const currentId = String(item && (item.id || item.order_id) || '').trim();
        return currentId === targetId;
    });

    if (!match) {
        throw new Error('Detail pesanan tidak ditemukan.');
    }

    headerNotificationOrderCache[targetId] = match;
    return match;
}

async function openHeaderOrderTrackingModal(orderId) {
    const targetId = String(orderId || '').trim();
    if (!targetId) return;

    const order = await fetchHeaderOrderById(targetId, { force: true });
    closeHeaderNotificationDetailModal();
    showHeaderOrderTrackingModal(order);
}

function resolveHeaderNotificationDetailAction(notification) {
    if (!notification) return null;

    if (notification.referenceType === 'order' && notification.referenceId) {
        return {
            type: 'order',
            label: notification.actionLabel || 'Lihat Pesanan',
            orderId: notification.referenceId
        };
    }

    const actionUrl = String(notification.actionUrl || '').trim();
    if (actionUrl) {
        return {
            type: 'url',
            label: notification.actionLabel || 'Buka Tautan',
            url: actionUrl
        };
    }

    return null;
}

function setHeaderNotificationDetailAction(actionConfig) {
    const footerEl = document.getElementById('header-notification-detail-footer');
    const actionBtn = document.getElementById('header-notification-detail-action-btn');
    headerNotificationState.detailAction = actionConfig || null;
    if (!footerEl || !actionBtn) return;

    if (!actionConfig) {
        footerEl.classList.add('hidden');
        actionBtn.textContent = 'Lihat Terkait';
        return;
    }

    footerEl.classList.remove('hidden');
    actionBtn.textContent = actionConfig.label || 'Lihat Terkait';
}

function closeHeaderNotificationDetailModal() {
    const modal = document.getElementById('header-notification-detail-modal');
    if (modal) modal.classList.add('hidden');
    headerNotificationState.lastOpenedId = '';
    setHeaderNotificationDetailAction(null);
}

async function openHeaderNotificationDetailModal(notificationId) {
    const targetId = String(notificationId || '').trim();
    const notification = headerNotificationState.items.find((item) => item.id === targetId);
    if (!notification) return;

    const modal = document.getElementById('header-notification-detail-modal');
    const iconEl = document.getElementById('header-notification-detail-icon');
    const metaEl = document.getElementById('header-notification-detail-meta');
    const titleEl = document.getElementById('header-notification-detail-title');
    const dateEl = document.getElementById('header-notification-detail-date');
    const summaryEl = document.getElementById('header-notification-detail-summary');
    const contentEl = document.getElementById('header-notification-detail-content');

    if (iconEl) iconEl.innerHTML = getHeaderNotificationIconHtml(notification.icon, notification.type);
    if (metaEl) {
        const metaLabel = notification.referenceType === 'order'
            ? 'Status Pesanan'
            : (notification.icon === 'promo' ? 'Promo Publik' : 'Notifikasi');
        metaEl.textContent = metaLabel;
    }
    if (titleEl) titleEl.textContent = notification.title || 'Detail Notifikasi';
    if (dateEl) {
        dateEl.textContent = formatHeaderNotificationDateTime(
            notification.updatedAt || notification.createdAt || notification.startAt
        );
    }
    if (summaryEl) summaryEl.textContent = notification.summary || 'Notifikasi baru tersedia.';
    if (contentEl) contentEl.textContent = notification.content || notification.summary || 'Isi notifikasi belum tersedia.';
    setHeaderNotificationDetailAction(resolveHeaderNotificationDetailAction(notification));

    closeHeaderNotificationDropdown();
    if (modal) {
        modal.classList.remove('hidden');
        modal.focus();
    }
    headerNotificationState.lastOpenedId = targetId;

    if (!notification.isRead) {
        await markHeaderNotificationAsRead(targetId);
    }
}

function runHeaderNotificationDetailAction() {
    const actionConfig = headerNotificationState.detailAction;
    if (!actionConfig) return;

    if (actionConfig.type === 'order') {
        const actionBtn = document.getElementById('header-notification-detail-action-btn');
        const originalLabel = actionBtn ? actionBtn.textContent : '';
        if (actionBtn) {
            actionBtn.disabled = true;
            actionBtn.textContent = 'Memuat...';
        }

        openHeaderOrderTrackingModal(actionConfig.orderId)
            .catch((error) => {
                console.warn('Failed opening order tracking from header notification:', error);
                showToast(String((error && error.message) || 'Gagal memuat detail pesanan.'));
            })
            .finally(() => {
                if (actionBtn) {
                    actionBtn.disabled = false;
                    actionBtn.textContent = originalLabel || actionConfig.label || 'Lihat Terkait';
                }
            });
        return;
    }

    const url = String(actionConfig.url || '').trim();
    if (!url) return;

    closeHeaderNotificationDetailModal();
    if (/^https?:\/\//i.test(url)) {
        const popup = window.open(url, '_blank', 'noopener,noreferrer');
        if (popup) popup.opener = null;
        return;
    }

    window.location.href = url;
}

function toggleHeaderNotificationDropdown() {
    const dropdown = document.getElementById('header-notification-dropdown');
    if (!dropdown) return;
    const shouldOpen = dropdown.classList.contains('hidden');
    closeHeaderNotificationDropdown();
    if (!shouldOpen) return;
    dropdown.classList.remove('hidden');
    applyHeaderNotificationDropdownViewportLimit();
    if (hasCheckoutLoginSession()) {
        syncHeaderNotificationState({ force: true, showLoading: !headerNotificationState.items.length });
    }
}

function markHeaderNotificationReadLocally(notificationId) {
    const targetId = String(notificationId || '').trim();
    if (!targetId) return;
    headerNotificationState.items = headerNotificationState.items.map((item) => {
        if (item.id !== targetId) return item;
        return {
            ...item,
            isRead: true
        };
    });
    headerNotificationState.unreadCount = headerNotificationState.items.filter((item) => !item.isRead).length;
    updateHeaderNotificationBadge(headerNotificationState.unreadCount, headerNotificationState.items.length);
    renderHeaderNotificationDropdown();
}

async function markHeaderNotificationAsRead(notificationId) {
    const targetId = String(notificationId || '').trim();
    const user = getStoredLoggedInUser();
    if (!user || !targetId) return;
    markHeaderNotificationReadLocally(targetId);

    const sessionToken = String(user.session_token || user.sessionToken || user.st || '').trim();
    if (!sessionToken) return;

    try {
        const payload = await ApiService.post('', {
            action: 'public_mark_notification_read',
            data: {
                session_token: sessionToken,
                notification_id: targetId
            }
        }, {
            cache: false,
            maxRetries: 1
        });
        parseHeaderNotificationSuccess(payload, 'Gagal menyimpan status notifikasi.');
    } catch (error) {
        console.warn('Failed syncing header notification read state:', error);
        syncHeaderNotificationState();
    }
}

async function markAllHeaderNotificationsAsRead() {
    const user = getStoredLoggedInUser();
    if (!user) return;
    const unreadItems = headerNotificationState.items.filter((item) => !item.isRead);
    if (!unreadItems.length) return;

    headerNotificationState.items = headerNotificationState.items.map((item) => ({
        ...item,
        isRead: true
    }));
    headerNotificationState.unreadCount = 0;
    updateHeaderNotificationBadge(0, headerNotificationState.items.length);
    renderHeaderNotificationDropdown();

    const sessionToken = String(user.session_token || user.sessionToken || user.st || '').trim();
    if (!sessionToken) return;

    try {
        const payload = await ApiService.post('', {
            action: 'public_mark_all_notifications_read',
            data: {
                session_token: sessionToken
            }
        }, {
            cache: false,
            maxRetries: 1
        });
        parseHeaderNotificationSuccess(payload, 'Gagal menandai semua notifikasi sebagai dibaca.');
    } catch (error) {
        console.warn('Failed syncing header mark-all notification state:', error);
        syncHeaderNotificationState();
    }
}

async function syncHeaderNotificationState(options = {}) {
    const trigger = document.getElementById('header-notification-trigger');
    if (!trigger || headerNotificationRefreshInFlight) return;
    const showLoading = Boolean(options && options.showLoading);
    const loadingEl = document.getElementById('header-notification-loading');
    const emptyEl = document.getElementById('header-notification-empty');
    const listEl = document.getElementById('header-notification-list');

    const sessionQuery = getSessionQueryFromStoredUser();
    if (!sessionQuery) {
        closeHeaderNotificationDetailModal();
        closeHeaderOrderTrackingModal();
        headerNotificationState = {
            items: [],
            unreadCount: 0,
            lastSyncedAt: '',
            lastOpenedId: '',
            detailAction: null
        };
        headerNotificationOrderCache = Object.create(null);
        updateHeaderNotificationBadge(0, 0);
        renderHeaderNotificationDropdown();
        return;
    }

    headerNotificationRefreshInFlight = true;
    if (showLoading && loadingEl) {
        loadingEl.classList.remove('hidden');
        if (emptyEl) emptyEl.classList.add('hidden');
        if (listEl) {
            listEl.classList.add('hidden');
            listEl.innerHTML = '';
        }
    }
    try {
        const payload = parseHeaderNotificationSuccess(
            await ApiService.get(`?action=public_user_notifications${sessionQuery}&limit=20&_t=${Date.now()}`, {
                cache: false,
                maxRetries: 1
            }),
            'Gagal memuat notifikasi.'
        );
        const notifications = Array.isArray(payload && payload.notifications)
            ? sortHeaderNotificationsByNewest(payload.notifications.map((item) => normalizeHeaderNotificationRecord(item)))
            : [];
        const unreadCount = Number(payload && payload.unread_count);
        const computedUnread = Number.isFinite(unreadCount)
            ? unreadCount
            : notifications.filter((item) => {
                return !item.isRead;
            }).length;
        headerNotificationState = {
            items: notifications,
            unreadCount: computedUnread,
            lastSyncedAt: new Date().toISOString(),
            lastOpenedId: headerNotificationState.lastOpenedId,
            detailAction: headerNotificationState.detailAction
        };
        updateHeaderNotificationBadge(computedUnread, notifications.length);
        renderHeaderNotificationDropdown();
    } catch (error) {
        console.warn('Failed syncing header notification badge:', error);
        renderHeaderNotificationDropdown();
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
        headerNotificationRefreshInFlight = false;
    }
}

function stopHeaderNotificationAutoRefresh() {
    if (headerNotificationRefreshTimer) {
        window.clearInterval(headerNotificationRefreshTimer);
        headerNotificationRefreshTimer = null;
    }
}

function startHeaderNotificationAutoRefresh() {
    stopHeaderNotificationAutoRefresh();
    if (!hasCheckoutLoginSession()) return;
    headerNotificationRefreshTimer = window.setInterval(() => {
        if (!document.hidden) {
            syncHeaderNotificationState();
        }
    }, HEADER_NOTIFICATION_REFRESH_INTERVAL_MS);
}

function openHeaderNotifications(notificationId) {
    const targetUrl = new URL('akun.html', window.location.href);
    if (hasCheckoutLoginSession()) {
        targetUrl.searchParams.set('section', 'notifications');
        const targetId = String(notificationId || '').trim();
        if (targetId) {
            targetUrl.searchParams.set('notification_id', targetId);
        }
    }
    window.location.href = targetUrl.toString();
}

function renderHeaderCategoryMenu() {
    const list = document.getElementById('header-category-list');
    if (!list) return;

    const items = [{ value: 'Semua', label: 'Semua Produk' }]
        .concat(getDisplayCategories().map((category) => ({ value: category, label: category })));

    list.innerHTML = items.map((item) => {
        const safeValue = escapeHtml(item.value);
        const safeLabel = escapeHtml(item.label);
        const isActive = item.value === currentCategory ? ' is-active' : '';
        return `
            <button type="button" data-action="set-header-category" data-category="${safeValue}" class="header-category-item${isActive} flex w-full items-center border-l-4 border-transparent px-4 py-3 text-left text-sm font-semibold text-gray-700 transition hover:bg-green-50">
                ${safeLabel}
            </button>
        `;
    }).join('');

    updateHeaderCategoryLabel(currentCategory);
}

function closeHeaderCategoryMenu() {
    const menu = document.getElementById('header-category-menu');
    const trigger = document.getElementById('header-category-trigger');
    const chevron = document.getElementById('header-category-chevron');

    if (menu) {
        menu.classList.remove('is-open');
        menu.setAttribute('aria-hidden', 'true');
    }
    if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
    }
    if (chevron) {
        chevron.classList.remove('rotate-180');
    }
}

function openHeaderCategoryMenu() {
    const menu = document.getElementById('header-category-menu');
    const trigger = document.getElementById('header-category-trigger');
    const chevron = document.getElementById('header-category-chevron');

    if (!menu) return;

    closeSearchSuggestions();
    closeHeaderAccountMenu();
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
    if (trigger) {
        trigger.setAttribute('aria-expanded', 'true');
    }
    if (chevron) {
        chevron.classList.add('rotate-180');
    }
}

function toggleHeaderCategoryMenu(forceOpen) {
    const menu = document.getElementById('header-category-menu');
    if (!menu) return;

    const shouldOpen = typeof forceOpen === 'boolean'
        ? forceOpen
        : !menu.classList.contains('is-open');

    if (shouldOpen) {
        openHeaderCategoryMenu();
    } else {
        closeHeaderCategoryMenu();
    }
}

function syncHeaderCategoryMenuState() {
    document.querySelectorAll('.header-category-item').forEach((item) => {
        const category = item.getAttribute('data-category');
        item.classList.toggle('is-active', category === currentCategory);
    });

    updateHeaderCategoryLabel(currentCategory);
}

/**
 * Initialize carousel scroll functionality for desktop
 * Adds mouse wheel horizontal scroll and drag-to-scroll
 */
function initCategoryCarouselScroll() {
    const container = document.getElementById('category-filters');
    if (!container) return;
    
    // Mouse wheel horizontal scroll
    container.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            container.scrollLeft += e.deltaY;
        }
    }, { passive: false });
    
    // Drag to scroll
    let isDown = false;
    let startX;
    let scrollLeft;
    
    container.addEventListener('mousedown', (e) => {
        // Only enable drag on container, not on buttons
        if (e.target.classList.contains('filter-btn')) return;
        
        isDown = true;
        container.style.cursor = 'grabbing';
        startX = e.pageX - container.offsetLeft;
        scrollLeft = container.scrollLeft;
    });
    
    container.addEventListener('mouseleave', () => {
        isDown = false;
        container.style.cursor = 'grab';
    });
    
    container.addEventListener('mouseup', () => {
        isDown = false;
        container.style.cursor = 'grab';
    });
    
    container.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const walk = (x - startX) * 2; // Scroll speed multiplier
        container.scrollLeft = scrollLeft - walk;
    });
    
    // Set initial cursor
    container.style.cursor = 'grab';
    
    // Update arrow visibility on scroll
    updateCategoryArrowsVisibility();
    container.addEventListener('scroll', updateCategoryArrowsVisibility);
}

/**
 * Scroll category carousel left or right
 * @param {string} direction - 'left' or 'right'
 */
function scrollCategoryCarousel(direction) {
    const container = document.getElementById('category-filters');
    if (!container) return;
    
    const scrollAmount = 300; // Pixels to scroll
    
    if (direction === 'left') {
        container.scrollLeft -= scrollAmount;
    } else if (direction === 'right') {
        container.scrollLeft += scrollAmount;
    }
}

/**
 * Update arrow button visibility based on scroll position
 * Hide left arrow at start, hide right arrow at end
 */
function updateCategoryArrowsVisibility() {
    const container = document.getElementById('category-filters');
    const leftArrow = document.getElementById('category-scroll-left');
    const rightArrow = document.getElementById('category-scroll-right');
    
    if (!container || !leftArrow || !rightArrow) return;
    
    const isAtStart = container.scrollLeft <= 10;
    const isAtEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 10;
    
    // Show/hide left arrow
    if (isAtStart) {
        leftArrow.classList.add('opacity-0', 'pointer-events-none');
    } else {
        leftArrow.classList.remove('opacity-0', 'pointer-events-none');
    }
    
    // Show/hide right arrow
    if (isAtEnd) {
        rightArrow.classList.add('opacity-0', 'pointer-events-none');
    } else {
        rightArrow.classList.remove('opacity-0', 'pointer-events-none');
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
    
    let cardsHtml = '';
    paginatedProducts.forEach(p => {
        // Produk yang disembunyikan admin
        const isHiddenProd = p.isHidden === true;

        let stokLabel = '';
        if (isHiddenProd) {
            stokLabel = `<span class="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full font-bold">Sedang Tidak Tersedia Saat Ini</span>`;
        } else if (p.stok > 10) {
            stokLabel = '';
        } else if (p.stok > 5) {
            stokLabel = `<span class="bg-yellow-100 text-yellow-700 text-[10px] px-2 py-0.5 rounded-full font-bold">Stok Menipis (${p.stok})</span>`;
        } else if (p.stok > 0) {
            stokLabel = `<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full font-bold">Hanya sisa ${p.stok}</span>`;
        } else {
            stokLabel = `<span class="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold">Stok Habis</span>`;
        }

        const images = p.gambar ? p.gambar.split(',') : [];
        const mainImage = images[0] || 'https://placehold.co/300x200?text=Produk';
        const safeImage = sanitizeUrl(mainImage, 'https://placehold.co/300x200?text=Produk');
        const optimizedImage = optimizeImageUrl(safeImage, 720, 405);

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
                    <span class="text-[10px] text-gray-600 line-through">Rp ${p.hargaCoret.toLocaleString('id-ID')}</span>
                    <span class="bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded font-bold">-${diskon}%</span>
                </div>
            `;
        }

        const hasVariations = p.variations && p.variations.length > 0;

        const productId = p.productId;
        const isLiked = isProductInWishlist(productId);
        const wishlistLabel = isLiked ? 'Hapus dari wishlist' : 'Tambah ke wishlist';
        const heartIcon = isLiked 
            ? '<svg class="w-5 h-5 text-red-500 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
            : '<svg class="w-5 h-5 text-gray-400 hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>';

        // Kelas tambahan untuk produk hidden
        const hiddenCardClass = isHiddenProd ? ' opacity-70 pointer-events-none select-none' : '';
        const hiddenBanner = isHiddenProd
            ? `<div class="absolute inset-x-0 top-0 z-30 bg-gray-700/90 text-white text-[10px] font-bold text-center py-1.5 flex items-center justify-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>Sedang Tidak Tersedia Saat Ini</div>`
            : '';
        const wishlistButtonAttrs = isHiddenProd
            ? 'disabled aria-disabled="true" tabindex="-1"'
            : `data-action="toggle-wishlist" data-product-id="${productId}"`;
        const wishlistButtonClass = isHiddenProd
            ? 'absolute top-3 right-3 z-20 p-2 bg-white/90 rounded-full shadow-md transition opacity-60 cursor-not-allowed'
            : 'absolute top-3 right-3 z-20 p-2 bg-white/90 hover:bg-white rounded-full shadow-md transition active:scale-95';
        const imageActionAttrs = isHiddenProd ? '' : `data-action="show-detail" data-product-id="${productId}"`;
        const imageInteractiveClass = isHiddenProd ? 'cursor-default' : 'cursor-pointer hover:opacity-90';
        const inlineCartState = !isHiddenProd && !hasVariations
            ? getProductCardCartControlState(p)
            : null;
        cardsHtml += `
            <div class="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition duration-300 relative${hiddenCardClass}" data-product-id="${productId}" aria-disabled="${isHiddenProd ? 'true' : 'false'}">
                ${hiddenBanner}
                <!-- Wishlist Heart Button -->
                <button id="wishlist-btn-${productId}" ${wishlistButtonAttrs} class="${wishlistButtonClass}" aria-label="${wishlistLabel}" title="${wishlistLabel}">
                    ${heartIcon}
                </button>
                <div class="absolute top-3 left-3 z-10 flex flex-col gap-2">
                    <div class="bg-amber-300 text-amber-900 text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm flex items-center gap-1">
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
                <div class="lazy-image-wrapper bg-white" style="aspect-ratio: 16 / 9;">
                    <div class="skeleton skeleton-product-image"></div>
                    <img src="${optimizedImage}" alt="${escapeHtml(p.nama)}" ${imageActionAttrs} class="w-full h-full object-contain object-center bg-white transition-opacity ${imageInteractiveClass} ${(p.stok === 0 || isHiddenProd) ? 'grayscale opacity-60' : ''}" loading="lazy" decoding="async" width="720" height="405" data-fallback-src="https://placehold.co/300x200?text=Produk" onload="this.classList.add('loaded'); this.previousElementSibling.style.display='none';">
                </div>
                <div class="p-2">
                    <div class="flex justify-between items-start mb-4">
                        <h4 class="text-[13px] font-bold text-gray-800">${escapeHtml(p.nama)}</h4>
                        ${stokLabel}
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
                                <p class="text-[8px] text-blue-700 mb-0.5">Harga Per Tgl ${new Date().toLocaleDateString('id-ID', {day: '2-digit', month: '2-digit', year: 'numeric'}).replace(/\//g, '-')}</p>
                                <p class="text-lg font-bold text-blue-700">Rp ${p.hargaGajian.toLocaleString('id-ID')}</p>
                            </div>
                        </div>
                    </div>
                    ${grosirGridHtml}
                    ${isHiddenProd ? `
                    <div class="grid grid-cols-2 gap-2 mb-2">
                        <button disabled class="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-200 text-sm font-semibold text-gray-400 cursor-not-allowed">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                            Sedang Tidak Tersedia
                        </button>
                        <button disabled class="h-11 w-full rounded-xl bg-gray-100 text-sm font-semibold text-gray-300 cursor-not-allowed">Beli</button>
                    </div>
                    ` : `
                    <div class="grid grid-cols-2 gap-2 mb-2 items-stretch">
                        ${hasVariations ? `
                        <button data-action="show-detail" data-product-id="${productId}" class="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 text-sm font-semibold text-green-700 transition hover:border-green-300 hover:bg-green-100">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 4h11.5M9 19.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm10 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"></path></svg>
                            + Keranjang
                        </button>
                        ` : `
                        <div class="product-card-cart-slot h-full" data-product-cart-slot data-product-id="${productId}" data-cart-mode="${inlineCartState.mode}" data-cart-qty="${inlineCartState.quantity}">
                            ${renderProductCardCartControl(p)}
                        </div>
                        `}
                        <button data-action="direct-order" data-product-id="${productId}" ${p.stok === 0 ? 'disabled' : ''} class="h-11 w-full rounded-xl bg-green-600 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-300 disabled:shadow-none">Beli</button>
                    </div>
                    `}

                </div>
            </div>
        `;
    });
    grid.innerHTML = cardsHtml;
}

function filterProducts() {
    const searchInput = document.getElementById('search-input');
    const query = searchInput ? normalizeSearch(searchInput.value) : '';
    filteredProducts = allProducts.filter(p => {
        const matchesSearch = matchesQuery(p, query);
        const selectedCategory = normalizeCategoryLabel(currentCategory);
        const productCategory = normalizeCategoryLabel(p.category || p.kategori);
        const matchesCategory = selectedCategory === 'Semua' ||
            productCategory.toLowerCase() === selectedCategory.toLowerCase();
        return matchesSearch && matchesCategory;
    });
    currentPage = 1; // Reset to first page on filter
    renderProducts(filteredProducts);
    renderPagination(filteredProducts.length);
    renderSearchSuggestions(query);
}

function normalizeSearch(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\\s]/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim();
}

function tokenize(value) {
    return normalizeSearch(value).split(' ').filter(Boolean);
}

function matchesQuery(product, query) {
    if (!query) return true;
    const name = normalizeSearch(product.nama);
    const desc = normalizeSearch(product.deskripsi || '');
    const haystack = `${name} ${desc}`.trim();
    const compactQuery = query.replace(/\s+/g, '');
    const compactHaystack = haystack.replace(/\s+/g, '');
    if (haystack.includes(query)) return true;
    if (compactQuery && compactHaystack.includes(compactQuery)) return true;
    const tokens = tokenize(query);
    return tokens.every((token) => haystack.includes(token));
}

function renderSearchSuggestions(query) {
    const mainContainer = document.getElementById('search-suggestions');
    const headerContainer = document.getElementById('search-suggestions-header');
    const container = headerContainer && window.innerWidth < 768 ? headerContainer : mainContainer;
    if (!container) return;
    if (!query) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }
    const suggestions = getSearchSuggestions(query, 6);
    if (suggestions.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }
    container.innerHTML = suggestions.map((item) => `
        <button type=\"button\" class=\"w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-green-50 transition\" data-action=\"search-suggestion\" data-value=\"${escapeHtml(item)}\">${escapeHtml(item)}</button>
    `).join('');
    container.classList.remove('hidden');
}

function closeSearchSuggestions() {
    const containers = [
        document.getElementById('search-suggestions'),
        document.getElementById('search-suggestions-header')
    ];
    containers.forEach((container) => {
        if (!container) return;
        container.classList.add('hidden');
        container.innerHTML = '';
    });
}

function getSearchSuggestions(query, limit = 6) {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];
    const scored = allProducts.map((product) => {
        const nameTokens = tokenize(product.nama);
        const descTokens = tokenize(product.deskripsi || '');
        const pool = [...nameTokens, ...descTokens];
        let score = 0;
        tokens.forEach((token) => {
            pool.forEach((term) => {
                if (term === token) score = Math.max(score, 3);
                else if (term.includes(token)) score = Math.max(score, 2);
                else if (token.length > 2 && term.length > 2 && levenshtein(term, token) <= 1) score = Math.max(score, 1);
            });
        });
        return { name: product.nama, score };
    }).filter(item => item.score > 0);

    const unique = new Map();
    scored.sort((a, b) => b.score - a.score).forEach((item) => {
        if (!unique.has(item.name)) unique.set(item.name, item);
    });
    return Array.from(unique.values()).slice(0, limit).map(item => item.name);
}

function levenshtein(a, b) {
    const aLen = a.length;
    const bLen = b.length;
    if (aLen === 0) return bLen;
    if (bLen === 0) return aLen;
    const matrix = Array.from({ length: aLen + 1 }, () => new Array(bLen + 1).fill(0));
    for (let i = 0; i <= aLen; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= bLen; j += 1) matrix[0][j] = j;
    for (let i = 1; i <= aLen; i += 1) {
        for (let j = 1; j <= bLen; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[aLen][bLen];
}

let activePaginationScrollFrame = null;

function easeInOutCubic(progress) {
    if (progress < 0.5) {
        return 4 * progress * progress * progress;
    }
    return 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function getPaginationScrollAnchor() {
    return document.getElementById('product-grid') ||
        document.getElementById('search-input') ||
        document.getElementById('katalog');
}

function getPaginationScrollGap(anchor) {
    if (!anchor) return 0;
    if (anchor.id === 'product-grid') return 14;
    if (anchor.id === 'search-input') return 18;
    return 28;
}

function getPaginationScrollTop(anchor) {
    if (!anchor) return 0;

    const header = document.getElementById('main-header') || document.querySelector('header');
    const headerHeight = header ? header.offsetHeight : 0;
    const visualGap = getPaginationScrollGap(anchor);
    const anchorTop = anchor.getBoundingClientRect().top + window.scrollY;

    return Math.max(0, Math.round(anchorTop - headerHeight - visualGap));
}

function smoothScrollToPaginationAnchor() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const reducedMotionAnchor = getPaginationScrollAnchor();
        if (reducedMotionAnchor) {
            window.scrollTo(0, getPaginationScrollTop(reducedMotionAnchor));
        }
        return;
    }

    const anchor = getPaginationScrollAnchor();
    if (!anchor) return;

    const startY = window.scrollY || window.pageYOffset || 0;
    const targetY = getPaginationScrollTop(anchor);

    // Avoid nudging the page down if the user is already near the catalog top area.
    if (startY <= targetY + 24) return;

    const distance = targetY - startY;
    if (Math.abs(distance) < 24) return;

    if (activePaginationScrollFrame) {
        cancelAnimationFrame(activePaginationScrollFrame);
        activePaginationScrollFrame = null;
    }

    const duration = Math.min(950, Math.max(650, Math.abs(distance) * 0.45));
    const startTime = performance.now();

    const animateScroll = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeInOutCubic(progress);

        window.scrollTo(0, Math.round(startY + (distance * easedProgress)));

        if (progress < 1) {
            activePaginationScrollFrame = requestAnimationFrame(animateScroll);
            return;
        }

        activePaginationScrollFrame = null;
    };

    activePaginationScrollFrame = requestAnimationFrame(animateScroll);
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
        <button type="button" data-action="change-page" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} 
            class="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-gray-200 text-gray-600 hover:border-green-500 hover:text-green-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
            aria-label="Halaman sebelumnya"
            title="Halaman sebelumnya">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>
    `;

    // Page Numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `
                <button type="button" data-action="change-page" data-page="${i}" 
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
        <button type="button" data-action="change-page" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''} 
            class="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-gray-200 text-gray-600 hover:border-green-500 hover:text-green-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
            aria-label="Halaman berikutnya"
            title="Halaman berikutnya">
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

    smoothScrollToPaginationAnchor();
}

function setCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.innerText === cat) {
            btn.classList.add('active');
            // Update styling for active state
            btn.classList.remove('border-gray-300', 'bg-white', 'text-gray-700');
            btn.classList.add('border-green-500', 'bg-green-50', 'text-green-700');
            
            // Scroll button into view smoothly
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else {
            btn.classList.remove('active');
            // Reset styling for inactive state
            btn.classList.remove('border-green-500', 'bg-green-50', 'text-green-700');
            btn.classList.add('border-gray-300', 'bg-white', 'text-gray-700');
        }
    });
    syncHeaderCategoryMenuState();
    closeHeaderCategoryMenu();
    filterProducts();
}

function addToCart(p, event, qty = 1) {
    if (isProductInteractionLocked(p)) {
        showToast('Produk sedang tidak tersedia saat ini.');
        return;
    }
    if (storeClosed) {
        showStoreWarning(() => {
            proceedAddToCart(p, event, qty);
        });
        return;
    }
    proceedAddToCart(p, event, qty);
}

function getPrimaryCartButton() {
    const cartButtons = Array.from(document.querySelectorAll('[data-action="open-cart"]'));
    return cartButtons.find((button) => button.offsetParent !== null) || cartButtons[0] || null;
}

function proceedAddToCart(p, event, qty = 1) {
    if (isProductInteractionLocked(p)) {
        showToast('Produk sedang tidak tersedia saat ini.');
        return;
    }

    const triggerButton = event && event.currentTarget ? event.currentTarget : null;
    const triggerCard = triggerButton
        ? (triggerButton.closest('[data-product-id]') || triggerButton.closest('.bg-white') || document.getElementById('detail-modal'))
        : document.getElementById('detail-modal');
    const sourceImage = triggerCard ? triggerCard.querySelector('img') : null;
    const cartBtn = getPrimaryCartButton();

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

    const maxStock = getItemMaxStock(itemToAdd);
    if (maxStock <= 0) {
        showToast('Stok produk habis.');
        return;
    }
    const requestedQty = Math.max(1, parseInt(qty, 10) || 1);

    const existing = cart.find(item => {
        const sameId = item.id === itemToAdd.id;
        const sameVariation = (!item.selectedVariation && !itemToAdd.selectedVariation) || 
                             (item.selectedVariation && itemToAdd.selectedVariation && item.selectedVariation.sku === itemToAdd.selectedVariation.sku);
        return sameId && sameVariation;
    });

    if (existing) {
        const currentQty = Math.max(0, parseInt(existing.qty, 10) || 0);
        const nextQty = Math.min(maxStock, currentQty + requestedQty);
        if (nextQty <= currentQty) {
            showToast(`Maksimal stok untuk produk ini: ${maxStock}`);
            return;
        }
        existing.qty = nextQty;
        if (nextQty < currentQty + requestedQty) {
            showToast(`Qty disesuaikan ke stok maksimal: ${maxStock}`);
        }
    } else {
        const initialQty = Math.min(maxStock, requestedQty);
        cart.push({ ...itemToAdd, qty: initialQty });
        if (initialQty < requestedQty) {
            showToast(`Qty disesuaikan ke stok maksimal: ${maxStock}`);
        }
    }
    
    saveCart();
    updateCartUI();
    
    // Reset selected variation after adding to cart
    selectedVariation = null;

    // Fly to cart animation
    if (triggerButton) {
        if (sourceImage && cartBtn) {
            const imgRect = sourceImage.getBoundingClientRect();
            const cartRect = cartBtn.getBoundingClientRect();
            
            const flyImg = document.createElement('img');
            flyImg.src = sourceImage.src;
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
        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span>${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function getReceiptStoreName() {
    const title = String(document.title || '').trim();
    if (!title) return 'Paket Sembako';

    // e.g. "Paket Sembako – Paket Sembako Murah" -> "Paket Sembako"
    const parts = title.split('–');
    const primary = String(parts[0] || title).trim();
    return primary || 'Paket Sembako';
}

function formatReceiptIdr(amount) {
    const num = Number(amount);
    if (!Number.isFinite(num)) return '0';
    return Math.round(num).toLocaleString('id-ID');
}

function receiptCenterText(text, width) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    if (raw.length >= width) return raw.slice(0, width);
    const padLeft = Math.floor((width - raw.length) / 2);
    const padRight = width - raw.length - padLeft;
    return `${' '.repeat(padLeft)}${raw}${' '.repeat(padRight)}`;
}

function receiptWrapText(text, width) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return [];

    const words = normalized.split(' ');
    const lines = [];
    let current = '';

    function pushChunked(word) {
        for (let i = 0; i < word.length; i += width) {
            lines.push(word.slice(i, i + width));
        }
    }

    for (let i = 0; i < words.length; i += 1) {
        const word = words[i];
        if (!current) {
            if (word.length <= width) {
                current = word;
            } else {
                pushChunked(word);
                current = '';
            }
            continue;
        }

        if ((current.length + 1 + word.length) <= width) {
            current += ` ${word}`;
            continue;
        }

        lines.push(current);
        if (word.length <= width) {
            current = word;
        } else {
            pushChunked(word);
            current = '';
        }
    }

    if (current) lines.push(current);
    return lines;
}

function receiptLineLeftRight(left, right, width) {
    const l = String(left || '');
    const r = String(right || '');

    // Normal case: both fit in one line
    if (l.length + r.length <= width) {
        return `${l}${' '.repeat(Math.max(0, width - l.length - r.length))}${r}`;
    }

    // Fallback: wrap left and place right on the last line if possible
    const leftLines = receiptWrapText(l, width);
    const out = leftLines.length ? leftLines.slice() : [''];
    const lastIndex = out.length - 1;
    const last = out[lastIndex] || '';

    if (last.length + r.length <= width) {
        out[lastIndex] = `${last}${' '.repeat(Math.max(0, width - last.length - r.length))}${r}`;
    } else {
        out.push(`${' '.repeat(Math.max(0, width - r.length))}${r}`);
    }

    return out.join('\n');
}

function receiptDotFill(text, width, dotChar = '.') {
    const raw = String(text || '');
    const w = parseInt(width, 10);
    const maxWidth = Number.isFinite(w) && w > 0 ? w : raw.length;
    if (raw.length >= maxWidth) return raw.slice(0, maxWidth);
    return raw + String(dotChar || '.').repeat(Math.max(0, maxWidth - raw.length));
}

function formatReceiptPrintTimestamp(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return { date: `${dd}/${mm}/${yy}`, time: `${hh}:${min}` };
}

function buildReceiptText(receipt, options) {
    const opts = options || {};
    const width = parseInt(opts.width, 10);
    const lineWidth = Number.isFinite(width) && width > 10 ? width : 32;
    const dash = '-'.repeat(lineWidth);

    const storeName = String((receipt && receipt.storeName) || getReceiptStoreName() || 'Paket Sembako').trim();
    const storeUrlRaw = String((receipt && receipt.storeUrl) || 'https://paketsembako.com').trim();
    const storeUrl = storeUrlRaw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const storeAddressRaw = String((receipt && receipt.storeAddress) || 'Jalan Nambo, Kaserangan, Ciruas,\nKab. Serang, Banten').trim();
    const storeAddressLines = storeAddressRaw
        .split(/\r?\n/)
        .map((line) => String(line || '').trim())
        .filter(Boolean);
    const storeWhatsapp = String((receipt && receipt.storeWhatsapp) || '085312846180').trim();

    const orderId = String((receipt && (receipt.orderId || receipt.id)) || '').trim();
    const dateText = String((receipt && receipt.dateText) || '').trim();
    const customerName = String((receipt && receipt.customerName) || '').trim();
    const customerPhone = String((receipt && receipt.customerPhone) || '').trim();
    const paymentMethod = String((receipt && receipt.paymentMethod) || '').trim();
    const status = String((receipt && receipt.status) || '').trim();

    const total = receipt && receipt.total !== undefined ? Number(receipt.total) : null;
    const items = receipt && Array.isArray(receipt.items) ? receipt.items : [];
    const totalQty = items.reduce((sum, item) => {
        const qty = parseInt(item && item.qty, 10);
        return sum + (Number.isFinite(qty) ? qty : 0);
    }, 0);

    const pushCenteredWrapped = (text) => {
        receiptWrapText(text, lineWidth).forEach((line) => lines.push(receiptCenterText(line, lineWidth)));
    };

    const lines = [];
    if (storeName) lines.push(receiptCenterText(storeName.toUpperCase(), lineWidth));
    if (storeUrl) lines.push(receiptCenterText(storeUrl, lineWidth));
    storeAddressLines.forEach((addrLine) => pushCenteredWrapped(addrLine));
    if (storeWhatsapp) pushCenteredWrapped(`No. WA : ${storeWhatsapp}`);
    lines.push(dash);

    lines.push(...receiptWrapText(`Order ID:${orderId ? ` ${orderId}` : ''}`, lineWidth));
    lines.push(...receiptWrapText(`Tanggal:${dateText ? ` ${dateText}` : ''}`, lineWidth));
    lines.push(...receiptWrapText(`Nama:${customerName ? ` ${customerName}` : ''}`, lineWidth));
    lines.push(...receiptWrapText(`WA:${customerPhone ? ` ${customerPhone}` : ''}`, lineWidth));
    lines.push(dash);

    if (items.length > 0) {
        items.forEach((item, idx) => {
            const itemName = String((item && item.name) || '').trim() || 'Item';
            const variation = String((item && item.variation) || '').trim();
            const qty = parseInt(item && item.qty, 10) || 0;

            let title = `${idx + 1}. ${itemName}`;
            if (variation) title += ` (${variation})`;
            lines.push(...receiptWrapText(title, lineWidth));
            lines.push(...receiptWrapText(`Qty : ${qty}`, lineWidth));
        });
    } else {
        lines.push(...receiptWrapText('Tidak ada item.', lineWidth));
    }

    lines.push(dash);
    lines.push(...receiptWrapText(`Total QTY : ${totalQty}`, lineWidth));
    lines.push('');

    lines.push(...receiptWrapText(`TOTAL Rp ${formatReceiptIdr(total)}`, lineWidth));
    lines.push(...receiptWrapText(`Bayar:${paymentMethod ? ` ${paymentMethod}` : ''}`, lineWidth));
    lines.push(...receiptWrapText(`Status:${status ? ` ${status}` : ''}`, lineWidth));

    lines.push(dash);
    lines.push(receiptCenterText('Terima Kasih telah berbelanja', lineWidth));
    lines.push(dash);
    lines.push(...receiptWrapText('*Tukar poin untuk klaim produk', lineWidth));
    lines.push(...receiptWrapText('reward di menu Akun > Reward *', lineWidth));

    return lines.join('\n');
}

function buildReceiptPrintHtml(receiptText, title) {
    const safeTitle = escapeHtml(title || 'Struk');
    const safeText = escapeHtml(receiptText || '');
    let origin = '';
    try {
        origin = typeof location !== 'undefined' && location.origin ? location.origin : '';
    } catch (e) {
        origin = '';
    }
    const logoSrc = escapeHtml(`${origin}/assets/img/logo-print.png`);

    return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    html, body { margin: 0; padding: 0; background: #fff; }
	    body {
	      width: 58mm;
	      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
	      font-size: 11px;
	      line-height: 1.2;
	      color: #000;
	    }
	    .receipt { padding: 2mm; }
	    .receipt-logo {
	      display: block;
	      margin: 0 auto 1.5mm;
	      width: 28mm;
	      max-width: 100%;
	      height: auto;
	      filter: grayscale(100%) contrast(160%);
	    }
	    pre { margin: 0; white-space: pre; }
	    @media print {
	      @page { margin: 0; }
	      body { margin: 0; }
	    }
	  </style>
</head>
<body>
	  <div class="receipt"><img class="receipt-logo" src="${logoSrc}" alt="GOSEMBAKO" /><pre>${safeText}</pre></div>
	  <script>
	    (function () {
	      function doPrint() {
	        try {
          window.focus();
          window.print();
        } catch (e) {}
      }

      window.addEventListener('load', function () {
        setTimeout(doPrint, 200);
      });

      window.onafterprint = function () {
        setTimeout(function () {
          try { window.close(); } catch (e) {}
        }, 200);
      };

      // Fallback close if onafterprint doesn't fire
      setTimeout(function () {
        try { window.close(); } catch (e) {}
      }, 20000);
    })();
  </script>
</body>
</html>`;
}

function printReceipt58mm(receiptData) {
    const text = buildReceiptText(receiptData, { width: 32 });
    const orderId = receiptData && receiptData.orderId ? String(receiptData.orderId) : '';
    const title = orderId ? `Struk ${orderId}` : 'Struk';
    const html = buildReceiptPrintHtml(text, title);

    let blobUrl = '';
    try {
        const blob = new Blob([html], { type: 'text/html' });
        blobUrl = URL.createObjectURL(blob);
    } catch (error) {
        blobUrl = '';
    }

    const printWindow = window.open(blobUrl || '', '_blank', 'width=420,height=650');
    if (!printWindow) {
        if (blobUrl) {
            try {
                URL.revokeObjectURL(blobUrl);
            } catch (e) {}
        }
        alert('Popup diblokir oleh browser. Izinkan popup untuk mencetak struk.');
        return;
    }

    if (blobUrl) {
        setTimeout(() => {
            try {
                URL.revokeObjectURL(blobUrl);
            } catch (e) {}
        }, 60000);
        return;
    }

    try {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
    } catch (error) {
        console.error('Failed to open print window:', error);
        alert('Gagal membuka jendela cetak. Silakan coba lagi.');
        try {
            printWindow.close();
        } catch (e) {}
    }
}

function canCurrentUserPrintReceipt() {
    const sessionKey = 'sembako_admin_session_v1';
    let session = null;
    try {
        const raw = String(sessionStorage.getItem(sessionKey) || '').trim();
        if (raw) session = JSON.parse(raw);
    } catch (error) {
        session = null;
    }

    const expiresAt = Number(session && session.expires_at);
    if (!expiresAt || expiresAt <= Date.now()) return false;

    const role = String((session && session.role) || sessionStorage.getItem('sembako_admin_role') || localStorage.getItem('sembako_admin_role') || '')
        .trim()
        .toLowerCase();
    if (role !== 'superadmin') return false;

    const tokenKeys = [
        'sembako_admin_api_token',
        'sembako_admin_write_token',
        'sembako_admin_token',
        'admin_token',
        'api_token',
        'sembako_api_token',
        'gos_admin_token',
        'gos_api_token'
    ];

    for (let i = 0; i < tokenKeys.length; i += 1) {
        const key = tokenKeys[i];
        const token = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim();
        if (token) return true;
    }

    return false;
}

function showSuccessNotification(orderId, waUrl, receiptData) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] animate-fade-in';
    overlay.style.animation = 'fadeIn 0.3s ease-out';
    
    // Create notification card
    const notification = document.createElement('div');
    notification.className = 'bg-white rounded-2xl shadow-2xl p-8 max-w-sm mx-4 text-center transform scale-95 relative';
    notification.style.animation = 'scaleIn 0.3s ease-out forwards';
    const safeImage = sanitizeUrl('assets/images/success-shield.gif', 'assets/images/success-shield.gif');
    const canPrintReceipt = Boolean(receiptData) && canCurrentUserPrintReceipt();
    const printSectionHtml = canPrintReceipt
        ? `
        <button type="button" data-action="print-receipt" class="block w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 px-6 rounded-xl transition shadow flex items-center justify-center gap-2 mt-3">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"/>
            </svg>
            <span>Cetak Struk (58mm)</span>
        </button>
        <p class="text-xs text-gray-500 mt-2">Pastikan printer thermal 58mm sudah terpasang, lalu pilih di dialog cetak.</p>
        `
        : '';
    
    notification.innerHTML = `
        <button type="button" data-action="dismiss-notification" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition p-1 rounded-full hover:bg-gray-100">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </button>
        <div class="mb-4">
            <div class="w-32 h-32 flex items-center justify-center mx-auto mb-4">
                <img src="${safeImage}" alt="Success" class="w-full h-full object-contain" data-fallback-src="assets/images/success-shield.gif">
            </div>
            <h3 class="text-2xl font-bold text-gray-800 mb-2">Pesanan Berhasil Dikirim!</h3>
            <p class="text-gray-600 mb-4">Order ID: <span class="font-mono font-semibold text-green-600">${escapeHtml(orderId)}</span></p>
            <p class="text-sm text-gray-500 mb-6">Pesanan Anda telah tercatat dan akan segera diproses. Silakan lanjutkan ke WhatsApp untuk konfirmasi.</p>
        </div>
        <a href="${waUrl}" target="_blank" class="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-xl transition shadow-lg flex items-center justify-center gap-3 mt-4">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.432 5.631 1.433h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            <span>Lanjut ke WhatsApp</span>
        </a>
        ${printSectionHtml}
    `;
    
    overlay.appendChild(notification);
    document.body.appendChild(overlay);

    const dismissBtn = notification.querySelector('[data-action="dismiss-notification"]');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => overlay.remove());
    }

    if (canPrintReceipt) {
        const printBtn = notification.querySelector('[data-action="print-receipt"]');
        if (printBtn) {
            window.__lastReceipt = receiptData;
            printBtn.addEventListener('click', () => {
                try {
                    printReceipt58mm(receiptData);
                } catch (error) {
                    console.error('Failed printing receipt:', error);
                    alert('Gagal mencetak struk. Silakan coba lagi.');
                }
            });
        }
    }
    
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
    if (Array.isArray(allProducts) && allProducts.length > 0) {
        syncCartWithStockLimits({ silent: true });
    }

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

    syncProductGridCartControls();

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
            const safeImage = sanitizeUrl(mainImage, 'https://placehold.co/100x100?text=Produk');
            return `
                <div class="flex items-center gap-4 bg-gray-50 p-3 rounded-xl">
                    <img src="${safeImage}" class="w-16 h-16 object-cover rounded-lg" data-fallback-src="https://placehold.co/100x100?text=Produk">
                    <div class="flex-1">
                        <h5 class="font-bold text-gray-800 text-sm">${item.nama}${item.selectedVariation ? ' (' + item.selectedVariation.nama + ')' : ''}</h5>
                        <div class="flex flex-col">
                            ${isGrosir ? `<span class="text-[10px] text-gray-400 line-through">Rp ${item.harga.toLocaleString('id-ID')}</span>` : ''}
                            <p class="text-green-600 font-bold text-xs">Rp ${effectivePrice.toLocaleString('id-ID')} ${isGrosir ? '<span class="bg-green-100 text-green-700 text-[8px] px-1 rounded ml-1">Grosir</span>' : ''}</p>
                        </div>
                        <div class="flex items-center gap-3 mt-2">
                            <button type="button" data-action="update-cart-qty" data-index="${index}" data-delta="-1" class="w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-500">-</button>
                            <span class="text-sm font-bold">${item.qty}</span>
                            <button type="button" data-action="update-cart-qty" data-index="${index}" data-delta="1" class="w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-500">+</button>
                        </div>
                    </div>
                    <button type="button" data-action="remove-cart-item" data-index="${index}" class="text-red-400 hover:text-red-600">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            `;
        }).join('');
        const totalEl = document.getElementById('cart-total');
        if (totalEl) totalEl.innerText = `Rp ${total.toLocaleString('id-ID')}`;
        const summaryTotalEl = document.getElementById('order-summary-total');
        if (summaryTotalEl) summaryTotalEl.innerText = `Rp ${total.toLocaleString('id-ID')}`;
        const stickyTotalEl = document.getElementById('sticky-order-total');
        if (stickyTotalEl) stickyTotalEl.innerText = `Rp ${total.toLocaleString('id-ID')}`;
    }
}

function updateQty(index, delta) {
    const item = cart[index];
    if (!item) return;

    const currentQty = parseInt(item.qty, 10) || 0;
    const maxStock = getLatestStockForCartItem(item);
    if (maxStock <= 0) {
        cart.splice(index, 1);
        saveCart();
        updateCartUI();
        showToast('Produk yang sedang tidak tersedia dihapus dari keranjang.');
        return;
    }
    let nextQty = currentQty + delta;

    if (delta > 0 && maxStock > 0 && nextQty > maxStock) {
        nextQty = maxStock;
        showToast(`Maksimal stok untuk produk ini: ${maxStock}`);
    }

    item.qty = nextQty;
    if (item.qty < 1 || (maxStock <= 0 && delta > 0)) {
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
    const maxStock = getCurrentModalMaxStock();
    if (maxStock > 0 && qty > maxStock) {
        qty = maxStock;
        showToast(`Maksimal stok untuk produk ini: ${maxStock}`);
    }
    qtyInput.value = qty;
    
    // Trigger the oninput handler to update UI
    qtyInput.oninput({ target: qtyInput });
}

function showDetail(p) {
    // Tutup modal wishlist jika sedang terbuka agar tidak menumpuk
    closeWishlistModal();

    const resolvedProduct = resolveProductForModal(p);
    if (resolvedProduct) {
        p = resolvedProduct;
    }
    
    console.log('showDetail called for product:', p.nama);
    const modal = document.getElementById('detail-modal');
    if (!modal) return;
    currentModalProduct = p;
    modal.dataset.productId = String(p.productId || p.id || p.sku || p.slug || '');

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
    const modalContentEl = document.getElementById('modal-product-content');

    if (modalContentEl) modalContentEl.scrollTop = 0;

    if (nameEl) nameEl.innerText = p.nama;
    
    // 1. Setup Quantity Listener FIRST
    // qtyInput already declared above
    if (qtyInput) {
        qtyInput.oninput = (e) => {
            let qty = parseInt(e.target.value, 10) || 1;
            if (qty < 1) qty = 1;
            const maxStock = getCurrentModalMaxStock();
            if (maxStock > 0 && qty > maxStock) {
                qty = maxStock;
                showToast(`Maksimal stok untuk produk ini: ${maxStock}`);
            }
            e.target.value = qty;
            
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
	                <button type="button" data-action="select-variation" data-index="${idx}" class="variation-btn border-2 border-gray-200 rounded-xl p-3 text-left transition hover:border-green-500 focus:outline-none">
                    <p class="text-xs font-bold text-gray-800">${escapeHtml(v.nama)}</p>
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
            <span class="bg-green-100 text-green-700 text-[10px] px-2.5 py-1 rounded-lg font-bold">${escapeHtml(p.category)}</span>
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
        const normalizedDescription = String(p.deskripsi || '')
            .replace(/\r\n?/g, '\n')
            .replace(/\\r\\n/g, '\n')
            .replace(/\\n/g, '\n');
        const items = normalizedDescription
            .split('\n')
            .map(i => i.trim())
            .filter(i => i !== '' && !/^isi paket\s*:\s*$/i.test(i))
            .map(i => i.replace(/^[\-•]\s*/, '').trim())
            .filter(i => i !== '');
        const icons = ['🍜', '🍲', '📦', '☕', '🍚', '🍳', '🧂'];
        itemsListEl.innerHTML = items.map((item, idx) => `
            <div class="flex items-center gap-4 bg-gray-50/50 p-3 rounded-xl border border-gray-100/50">
                <span class="text-xl">${icons[idx % icons.length]}</span>
                <span class="text-sm font-medium text-gray-700">•${escapeHtml(item)}</span>
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

function getModalDescriptionItems(product) {
    const normalizedDescription = String((product && product.deskripsi) || '')
        .replace(/\r\n?/g, '\n')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n');

    return normalizedDescription
        .split('\n')
        .map((item) => String(item || '').trim())
        .filter((item) => item !== '' && !/^isi paket\s*:?\s*$/i.test(item))
        .map((item) => item.replace(/^[\-\*\u2022]+\s*/, '').trim())
        .filter((item) => item !== '');
}

function formatModalCurrency(amount) {
    const value = Number(amount);
    const safeValue = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    return `Rp ${safeValue.toLocaleString('id-ID')}`;
}

function getModalPriceDateText() {
    return `Harga per ${new Date().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    })}`;
}

function parseModalWholesaleTiers(value) {
    if (!value) return [];
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function getModalSku(product, variation) {
    const directSku = String((variation && variation.sku) || product.sku || '').trim();
    if (directSku) return directSku;

    const baseId = String(product.productId || product.id || product.slug || '').trim();
    if (!baseId) return '-';

    return `SKU-${baseId.slice(-6).toUpperCase()}`;
}

function getModalImageList(product, variation) {
    const preferredSource = (variation && variation.gambar) || product.gambar || '';
    let images = String(preferredSource || '')
        .split(',')
        .map((image) => String(image || '').trim())
        .filter(Boolean);

    if (images.length === 0 && variation && variation.gambar !== product.gambar) {
        images = String(product.gambar || '')
            .split(',')
            .map((image) => String(image || '').trim())
            .filter(Boolean);
    }

    return images.length > 0 ? images : ['https://placehold.co/600x600?text=Produk'];
}

function getModalStockLabel(stock) {
    const safeStock = Math.max(0, parseInt(stock, 10) || 0);
    if (safeStock <= 0) return 'Stok habis';
    if (safeStock <= 5) return `Sisa ${safeStock}`;
    if (safeStock <= 12) return `Stok terbatas (${safeStock})`;
    return `${safeStock} tersedia`;
}

function getModalStockBadgeHtml(stock) {
    const safeStock = Math.max(0, parseInt(stock, 10) || 0);
    if (safeStock <= 0) {
        return '<span class="detail-modal-badge bg-red-100 text-red-700">Stok habis</span>';
    }
    if (safeStock <= 5) {
        return `<span class="detail-modal-badge bg-orange-100 text-orange-700">Sisa ${safeStock}</span>`;
    }
    if (safeStock <= 12) {
        return `<span class="detail-modal-badge bg-amber-100 text-amber-700">Stok terbatas ${safeStock}</span>`;
    }
    return `<span class="detail-modal-badge bg-emerald-100 text-emerald-700">${safeStock} tersedia</span>`;
}

function renderModalDescriptionItems(product) {
    const itemsListEl = document.getElementById('modal-items-list');
    if (!itemsListEl) return;

    const items = getModalDescriptionItems(product);
    const fallbackItems = items.length > 0
        ? items
        : ['Informasi detail produk belum tersedia. Anda tetap bisa langsung menambahkannya ke keranjang.'];

    itemsListEl.innerHTML = fallbackItems.map((item) => `
        <div class="detail-modal-item">
            <span class="detail-modal-item-icon" aria-hidden="true">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M5 13l4 4L19 7"></path>
                </svg>
            </span>
            <span class="detail-modal-item-text">${escapeHtml(item)}</span>
        </div>
    `).join('');
}

function getModalQtyInputs() {
    return [
        document.getElementById('modal-qty'),
        document.getElementById('modal-qty-sticky')
    ].filter(Boolean);
}

function getModalQuantityValue() {
    const inputs = getModalQtyInputs();
    for (let i = 0; i < inputs.length; i += 1) {
        const parsedQty = parseInt(inputs[i].value, 10);
        if (Number.isFinite(parsedQty) && parsedQty > 0) {
            return parsedQty;
        }
    }
    return 1;
}

function setModalQuantityValue(value) {
    const safeQty = Math.max(1, parseInt(value, 10) || 1);
    getModalQtyInputs().forEach((input) => {
        input.value = safeQty;
    });
    return safeQty;
}

function changeModalQuantity(delta) {
    const product = getCurrentModalProduct();
    if (!product) return;

    const maxStock = getCurrentModalMaxStock();
    let nextQty = getModalQuantityValue() + delta;
    if (nextQty < 1) nextQty = 1;

    if (maxStock > 0 && nextQty > maxStock) {
        nextQty = maxStock;
        showToast(`Maksimal stok untuk produk ini: ${maxStock}`);
    }

    setModalQuantityValue(nextQty);
    refreshDetailModal(product);
}

function addCurrentModalProductToCart(event) {
    const product = getCurrentModalProduct();
    if (!product) return;

    const qty = getModalQuantityValue();
    addToCart(product, event, qty);
    closeDetailModal();
}

function buildModalState(product) {
    const quantity = getModalQuantityValue();
    const activeSelection = selectedVariation || product;
    const basePrice = parseInt(activeSelection.harga, 10) || parseInt(product.harga, 10) || 0;
    const coretPrice = parseInt(activeSelection.harga_coret, 10) || parseInt(product.hargaCoret, 10) || 0;
    const grosirData = activeSelection.grosir || product.grosir || '';
    const stock = Math.max(0, parseInt(activeSelection.stok, 10) || 0);
    const effectivePricePerUnit = typeof calculateTieredPrice === 'function'
        ? calculateTieredPrice(basePrice, quantity, grosirData)
        : basePrice;
    const totalCashPrice = effectivePricePerUnit * quantity;
    const gajianInfo = typeof calculateGajianPrice === 'function'
        ? calculateGajianPrice(effectivePricePerUnit)
        : { price: effectivePricePerUnit, daysLeft: 0, markupPercent: 0 };
    const totalGajianPrice = (parseInt(gajianInfo.price, 10) || 0) * quantity;

    return {
        quantity,
        activeSelection,
        basePrice,
        coretPrice,
        grosirData,
        stock,
        effectivePricePerUnit,
        totalCashPrice,
        totalGajianPrice,
        gajianInfo
    };
}

function renderModalBadges(product, modalState) {
    const badgesEl = document.getElementById('modal-badges');
    if (!badgesEl) return;

    const badges = [];
    if (modalState.coretPrice > modalState.basePrice) {
        const percent = Math.round(((modalState.coretPrice - modalState.basePrice) / modalState.coretPrice) * 100);
        badges.push(`<span class="detail-modal-badge bg-rose-100 text-rose-700">Sale ${percent}%</span>`);
    }

    badges.push(`<span class="detail-modal-badge bg-emerald-50 text-emerald-700">${escapeHtml(product.category || product.kategori || 'Produk Pilihan')}</span>`);

    const wholesaleTiers = parseModalWholesaleTiers(modalState.grosirData);
    if (wholesaleTiers.length > 0) {
        badges.push(`<span class="detail-modal-badge bg-cyan-100 text-cyan-700">${wholesaleTiers.length} level grosir</span>`);
    }

    badges.push(getModalStockBadgeHtml(modalState.stock));
    badgesEl.innerHTML = badges.join('');
}

function renderModalMeta(product, modalState) {
    const metaListEl = document.getElementById('modal-meta-list');
    if (!metaListEl) return;

    const wholesaleTiers = parseModalWholesaleTiers(modalState.grosirData);
    const rewardPoints = typeof calculateRewardPoints === 'function'
        ? calculateRewardPoints(modalState.totalCashPrice, product.nama)
        : 0;
    const variationName = selectedVariation && selectedVariation.nama
        ? selectedVariation.nama
        : (Array.isArray(product.variations) && product.variations.length > 0 ? 'Belum dipilih' : 'Tidak ada variasi');

    const metaItems = [
        { label: 'Kategori', value: product.category || product.kategori || 'Produk' },
        { label: 'Varian', value: variationName },
        { label: 'SKU', value: getModalSku(product, selectedVariation) },
        { label: 'Stok', value: getModalStockLabel(modalState.stock) },
        { label: 'Reward', value: `+${Number(rewardPoints || 0).toFixed(1)} poin` },
        { label: 'Grosir', value: wholesaleTiers.length > 0 ? `${wholesaleTiers.length} level harga` : 'Tidak tersedia' }
    ];

    metaListEl.innerHTML = metaItems.map((item) => `
        <div class="detail-modal-spec-item">
            <p class="detail-modal-spec-label">${escapeHtml(item.label)}</p>
            <p class="detail-modal-spec-value">${escapeHtml(item.value)}</p>
        </div>
    `).join('');
}

function updateModalActionState(product, modalState) {
    const unavailable = isProductInteractionLocked(product) || modalState.stock <= 0;
    const unavailableLabel = isProductInteractionLocked(product) ? 'Tidak tersedia' : 'Stok habis';
    const addCartButtons = [
        document.getElementById('modal-add-cart'),
        document.getElementById('modal-add-cart-sticky')
    ].filter(Boolean);
    const buyNowButtons = [
        document.getElementById('modal-buy-now'),
        document.getElementById('modal-buy-now-sticky')
    ].filter(Boolean);

    setModalQuantityValue(modalState.quantity);

    addCartButtons.forEach((button) => {
        button.disabled = unavailable;
        button.innerHTML = unavailable
            ? unavailableLabel
            : `
                <svg aria-hidden="true" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.1" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.5 4h11.5M9 19.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm10 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"></path>
                </svg>
                Tambah ke keranjang
            `;
    });

    buyNowButtons.forEach((button) => {
        button.disabled = unavailable;
        button.textContent = unavailable ? unavailableLabel : 'Beli sekarang';
    });

    getModalQtyInputs().forEach((input) => {
        input.disabled = unavailable;
    });

    document.querySelectorAll('[data-action="update-modal-qty"], [data-action="update-modal-qty-sticky"]').forEach((button) => {
        button.disabled = unavailable;
    });
}

function syncModalSliderImages(product) {
    const images = getModalImageList(product, selectedVariation);
    if (typeof initializeSlider === 'function') {
        initializeSlider(images);
    }
}

function renderModalRelatedProducts(product) {
    const relatedSection = document.getElementById('modal-related-section');
    const relatedProductsEl = document.getElementById('modal-related-products');
    if (!relatedSection || !relatedProductsEl) return;

    const productId = String(product.productId || product.id || product.sku || product.slug || '').trim();
    const currentCategoryValue = normalizeCategoryLabel(product.category || product.kategori || '');
    const visibleProducts = allProducts.filter((item) => (
        item &&
        String(item.productId || item.id || item.sku || item.slug || '').trim() !== productId &&
        !isProductInteractionLocked(item)
    ));

    const sameCategory = visibleProducts.filter((item) => (
        normalizeCategoryLabel(item.category || item.kategori || '') === currentCategoryValue
    ));
    const fallbackProducts = visibleProducts.filter((item) => (
        normalizeCategoryLabel(item.category || item.kategori || '') !== currentCategoryValue
    ));
    const relatedProducts = sameCategory.concat(fallbackProducts).slice(0, 3);

    if (relatedProducts.length === 0) {
        relatedSection.classList.add('hidden');
        relatedProductsEl.innerHTML = '';
        return;
    }

    relatedProductsEl.innerHTML = relatedProducts.map((item) => {
        const itemImages = getModalImageList(item, null);
        const mainImage = optimizeImageUrl(sanitizeUrl(itemImages[0], 'https://placehold.co/300x300?text=Produk'), 480, 480);
        const stockLabel = getModalStockLabel(item.stok);
        const hasDiscount = item.hargaCoret > item.harga;
        const discountPercent = hasDiscount
            ? Math.round(((item.hargaCoret - item.harga) / item.hargaCoret) * 100)
            : 0;

        return `
            <article class="detail-related-card">
                <div class="detail-related-media">
                    ${hasDiscount ? `<span class="detail-related-badge">${discountPercent}%</span>` : ''}
                    <img src="${mainImage}" alt="${escapeHtml(item.nama)}" data-fallback-src="https://placehold.co/300x300?text=Produk">
                </div>
                <div class="detail-related-body">
                    <p class="detail-related-category">${escapeHtml(item.category || item.kategori || 'Produk')}</p>
                    <h5 class="detail-related-name">${escapeHtml(item.nama)}</h5>
                    <div class="detail-related-price-row">
                        <span class="detail-related-price">${formatModalCurrency(item.harga)}</span>
                        ${hasDiscount ? `<span class="detail-related-price-old">${formatModalCurrency(item.hargaCoret)}</span>` : ''}
                    </div>
                    <div class="detail-related-footer">
                        <span class="detail-related-stock">${escapeHtml(stockLabel)}</span>
                        <button type="button" data-action="show-related-product" data-product-id="${escapeHtml(item.productId)}" class="detail-related-link">
                            Lihat detail
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join('');

    relatedSection.classList.remove('hidden');
}

function refreshDetailModal(product) {
    if (!product) return;

    const modalState = buildModalState(product);
    const priceDateEl = document.getElementById('modal-price-date');

    if (priceDateEl) {
        const gajianText = modalState.gajianInfo && Number.isFinite(Number(modalState.gajianInfo.daysLeft))
            ? `${getModalPriceDateText()} | jatuh tempo ${modalState.gajianInfo.daysLeft} hari`
            : getModalPriceDateText();
        priceDateEl.textContent = gajianText;
    }

    renderModalBadges(product, modalState);
    renderModalMeta(product, modalState);
    updateModalActionState(product, modalState);
    updateModalPrices(
        modalState.totalCashPrice,
        modalState.totalGajianPrice,
        modalState.coretPrice * modalState.quantity
    );

    if (typeof updateTieredPricingUI === 'function') {
        updateTieredPricingUI({
            ...product,
            harga: modalState.basePrice,
            grosir: modalState.grosirData
        }, modalState.quantity);
    }
}

function showDetail(p) {
    closeWishlistModal();

    const resolvedProduct = resolveProductForModal(p);
    if (resolvedProduct) {
        p = resolvedProduct;
    }

    console.log('showDetail called for product:', p.nama);
    const modal = document.getElementById('detail-modal');
    if (!modal) return;

    currentModalProduct = p;
    modal.dataset.productId = String(p.productId || p.id || p.sku || p.slug || '');

    selectedVariation = null;
    const qtyInput = document.getElementById('modal-qty');
    if (qtyInput) {
        setModalQuantityValue(1);
    }

    const nameEl = document.getElementById('modal-product-name');
    const variationContainer = document.getElementById('modal-variation-container');
    const modalContentEl = document.getElementById('modal-product-content');

    if (modalContentEl) {
        modalContentEl.scrollTop = 0;
    }

    if (nameEl) {
        nameEl.textContent = p.nama;
    }

    renderModalDescriptionItems(p);
    renderModalRelatedProducts(p);
    syncModalSliderImages(p);

    if (qtyInput) {
        qtyInput.oninput = (event) => {
            let nextQty = parseInt(event.target.value, 10) || 1;
            if (nextQty < 1) nextQty = 1;

            const maxStock = getCurrentModalMaxStock();
            if (maxStock > 0 && nextQty > maxStock) {
                nextQty = maxStock;
                showToast(`Maksimal stok untuk produk ini: ${maxStock}`);
            }

            event.target.value = nextQty;
            refreshDetailModal(p);
        };
    }

    if (variationContainer) {
        if (Array.isArray(p.variations) && p.variations.length > 0) {
            variationContainer.classList.remove('hidden');
            const variationList = document.getElementById('modal-variation-list');
            if (variationList) {
                variationList.innerHTML = p.variations.map((variation, index) => {
                    const variationStock = Math.max(0, parseInt(variation.stok, 10) || 0);
                    const isDisabled = variationStock <= 0;
                    return `
                        <button
                            type="button"
                            data-action="select-variation"
                            data-index="${index}"
                            ${isDisabled ? 'disabled aria-disabled="true"' : ''}
                            class="variation-btn border-2 border-gray-200 rounded-2xl p-3 text-left transition focus:outline-none ${isDisabled ? 'cursor-not-allowed opacity-50 bg-gray-50' : 'hover:border-green-500 hover:bg-green-50/60'}"
                        >
                            <p class="text-sm font-bold text-gray-800">${escapeHtml(variation.nama)}</p>
                            <div class="mt-2 flex items-center justify-between gap-2">
                                <p class="text-xs text-green-600 font-bold">${formatModalCurrency(variation.harga)}</p>
                                <span class="text-[10px] font-bold ${variationStock > 0 ? 'text-emerald-600' : 'text-red-500'}">
                                    ${variationStock > 0 ? `${variationStock} stok` : 'Stok habis'}
                                </span>
                            </div>
                        </button>
                    `;
                }).join('');
            }

            const firstAvailableIndex = p.variations.findIndex((variation) => (parseInt(variation.stok, 10) || 0) > 0);
            const defaultVariationIndex = firstAvailableIndex >= 0 ? firstAvailableIndex : 0;
            selectVariation(p.variations[defaultVariationIndex], defaultVariationIndex);
        } else {
            variationContainer.classList.add('hidden');
            refreshDetailModal(p);
        }
    } else {
        refreshDetailModal(p);
    }

    modal.classList.remove('hidden');
    document.body.classList.add('modal-active');
}

function selectVariation(v, index) {
    selectedVariation = v;

    document.querySelectorAll('.variation-btn').forEach((button, buttonIndex) => {
        if (buttonIndex === index) {
            button.classList.add('border-green-500', 'bg-green-50');
            button.classList.remove('border-gray-200');
        } else {
            button.classList.remove('border-green-500', 'bg-green-50');
            button.classList.add('border-gray-200');
        }
    });

    if (currentModalProduct) {
        syncModalSliderImages(currentModalProduct);
        refreshDetailModal(currentModalProduct);
    }
}

function updateModalPrices(cash, gajian, coret) {
    const cashPriceEl = document.getElementById('modal-cash-price');
    const gajianPriceEl = document.getElementById('modal-gajian-price');
    const originalPriceEl = document.getElementById('modal-original-price');
    const discountBadgeEl = document.getElementById('modal-discount-badge');
    const savingsHighlight = document.getElementById('savings-highlight');
    const savingsAmount = document.getElementById('savings-amount');

    if (cashPriceEl) cashPriceEl.textContent = formatModalCurrency(cash);
    if (gajianPriceEl) gajianPriceEl.textContent = formatModalCurrency(gajian);

    if (coret > cash) {
        const discountPercent = Math.round(((coret - cash) / coret) * 100);

        if (originalPriceEl) {
            originalPriceEl.textContent = formatModalCurrency(coret);
            originalPriceEl.classList.remove('hidden');
        }
        if (discountBadgeEl) {
            discountBadgeEl.textContent = `${discountPercent}% OFF`;
            discountBadgeEl.classList.remove('hidden');
        }
        if (savingsHighlight) savingsHighlight.classList.remove('hidden');
        if (savingsAmount) savingsAmount.textContent = formatModalCurrency(coret - cash);
    } else {
        if (originalPriceEl) {
            originalPriceEl.textContent = '';
            originalPriceEl.classList.add('hidden');
        }
        if (discountBadgeEl) {
            discountBadgeEl.textContent = '';
            discountBadgeEl.classList.add('hidden');
        }
        if (savingsHighlight) savingsHighlight.classList.add('hidden');
    }
}

function closeDetailModal() {
    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('modal-product-content');
    const skeletonLoader = document.getElementById('slider-skeleton');
    const hasOtherOpenModal = Array.from(document.querySelectorAll('[data-modal]'))
        .some((item) => item !== modal && !item.classList.contains('hidden'));
    if (modal) {
        modal.classList.add('hidden');
        delete modal.dataset.productId;
    }
    if (content) content.scrollTop = 0;
    if (skeletonLoader) skeletonLoader.classList.remove('hidden');
    document.body.classList.toggle('modal-active', hasOtherOpenModal);
    selectedVariation = null;
    currentModalProduct = null;
}

function directOrder(p) {
    if (isProductInteractionLocked(p)) {
        showToast('Produk sedang tidak tersedia saat ini.');
        return;
    }
    if (storeClosed) {
        showStoreWarning(() => {
            proceedDirectOrder(p);
        });
        return;
    }
    proceedDirectOrder(p);
}

function proceedDirectOrder(p) {
    if (isProductInteractionLocked(p)) {
        showToast('Produk sedang tidak tersedia saat ini.');
        return;
    }
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

    const maxStock = getItemMaxStock(itemToAdd);
    if (maxStock <= 0) {
        showToast('Stok produk habis.');
        return;
    }

    // Get quantity from modal input (default to 1 if not found)
    const requestedQty = getModalQuantityValue();
    const quantity = Math.min(maxStock, Math.max(1, requestedQty));
    if (quantity < requestedQty) {
        showToast(`Qty disesuaikan ke stok maksimal: ${maxStock}`);
    }

    cart = [{ ...itemToAdd, qty: quantity }];
    saveCart();
    updateCartUI();
    openOrderModal();
    selectedVariation = null;
}

function directOrderFromModal() {
    const product = getCurrentModalProduct();
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
    if (Array.isArray(allProducts) && allProducts.length > 0) {
        syncCartWithStockLimits();
    }
    if (cart.length === 0) {
        showToast('Keranjang kosong atau produk sedang tidak tersedia untuk dipesan.');
        return;
    }
    
    closeCartModal();
    resetOrderValidationState();
    syncPaylaterAvailability();

    prefillCustomerInfo();
    updateDeliveryLocationHint();
    
    updateOrderTotal();
    updateOrderCTAState();

    const modal = document.getElementById('order-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.classList.add('modal-active');
    }
}

function prefillCustomerInfo() {
    const nameEl = document.getElementById('customer-name');
    const phoneEl = document.getElementById('customer-phone');
    if (!nameEl || !phoneEl) return;

    const user = getStoredLoggedInUser();
    if (!user) return;

    const savedName = (user.nama || '').trim();
    const savedPhone = normalizePhoneNumber(user.whatsapp || user.phone || '');

    if (!nameEl.value.trim() && savedName) {
        nameEl.value = savedName;
    }
    if (!phoneEl.value.trim() && savedPhone) {
        phoneEl.value = savedPhone;
    }
}

function closeOrderModal() {
    const modal = document.getElementById('order-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-active');
    }
    resetOrderValidationState();
}

const DEFAULT_PICKUP_ADDRESS = 'Jl. Nambo, Kaserangan, Kec. Ciruas, Kabupaten Serang';

const SHIPPING_METHOD_META = {
    'Antar Nikomas': {
        label: 'Diantar Nikomas',
        areaLabel: 'Area PT Nikomas Gemilang',
        fee: 0,
        showLocationField: false,
        showDeliveryUI: false,
        showPickupUI: false,
        includeLocationLink: false,
        locationLabel: 'Area PT Nikomas Gemilang'
    },
    'Antar Kerumah': {
        label: 'Diantar Kerumah',
        areaLabel: 'Area Serang & sekitarnya',
        fee: 2000,
        showLocationField: true,
        showDeliveryUI: true,
        showPickupUI: false,
        includeLocationLink: true,
        locationLabel: 'Area Serang & sekitarnya'
    },
    'Ambil Ditempat': {
        label: 'Ambil di Tempat',
        areaLabel: DEFAULT_PICKUP_ADDRESS,
        fee: 0,
        showLocationField: true,
        showDeliveryUI: false,
        showPickupUI: true,
        includeLocationLink: false,
        locationLabel: DEFAULT_PICKUP_ADDRESS
    }
};

const PAYMENT_METHOD_META = {
    'Cash / Transfer': {
        label: 'Tunai/COD',
        sheetCode: 'cash'
    },
    'QRIS': {
        label: 'QRIS',
        sheetCode: 'qris'
    },
    'Bayar Gajian': {
        label: 'Bayar Gajian',
        sheetCode: 'gajian'
    },
    'PayLater': {
        label: 'PayLater',
        sheetCode: 'paylater'
    }
};

function formatOrderCurrency(amount) {
    return `Rp ${Number(amount || 0).toLocaleString('id-ID')}`;
}

function formatShippingFeeText(amount) {
    return Number(amount || 0) > 0 ? formatOrderCurrency(amount) : 'Gratis';
}

function getSelectedShipMethodValue() {
    const shipEl = document.querySelector('input[name="ship-method"]:checked');
    return shipEl ? String(shipEl.value || '').trim() : '';
}

function getShippingMethodMeta(shipMethod) {
    const key = String(shipMethod || '').trim();
    if (Object.prototype.hasOwnProperty.call(SHIPPING_METHOD_META, key)) {
        return SHIPPING_METHOD_META[key];
    }
    return {
        label: key,
        areaLabel: '',
        fee: 0,
        showLocationField: false,
        showDeliveryUI: false,
        showPickupUI: false,
        includeLocationLink: false,
        locationLabel: ''
    };
}

function getPaymentMethodMeta(payMethod) {
    const key = String(payMethod || '').trim();
    if (Object.prototype.hasOwnProperty.call(PAYMENT_METHOD_META, key)) {
        return PAYMENT_METHOD_META[key];
    }
    return {
        label: key,
        sheetCode: 'cash'
    };
}

function resetLocationShareButton() {
    const btn = document.getElementById('get-location-btn');
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('border-red-300', 'bg-red-50');
    btn.classList.remove('bg-green-600', 'text-white', 'border-green-600');
    btn.classList.add('bg-white', 'text-blue-700', 'border-blue-200');
    btn.innerHTML = '<span>📍 Bagikan Lokasi Saya</span>';
    updateLocationShareStatus('Bagikan lokasi Maps. Jika tidak bisa, isi alamat manual di bawah.', 'info');
}

function getOrderLocationLinkByShipMethod(shipMethod) {
    const shipMeta = getShippingMethodMeta(shipMethod);
    if (!shipMeta.includeLocationLink) return '';
    const locationInput = document.getElementById('location-link');
    return locationInput ? String(locationInput.value || '').trim() : '';
}

function getManualDeliveryAddress() {
    const manualAddressInput = document.getElementById('manual-address');
    return manualAddressInput ? String(manualAddressInput.value || '').trim() : '';
}

function getOrderLocationLabel(shipMethod) {
    const shipMeta = getShippingMethodMeta(shipMethod);
    if (String(shipMethod || '').trim() === 'Antar Kerumah') {
        const manualAddress = getManualDeliveryAddress();
        if (manualAddress) return manualAddress;
        if (getOrderLocationLinkByShipMethod(shipMethod)) return 'Titik Maps dibagikan';
    }
    return shipMeta.locationLabel || shipMeta.areaLabel || shipMeta.label || '';
}

let orderValidationTouched = {
    name: false,
    phone: false,
    shipping: false,
    payment: false,
    deliveryAddress: false
};

function updateLocationShareStatus(message, tone) {
    const statusEl = document.getElementById('location-share-status');
    if (!statusEl) return;

    const toneMap = {
        info: 'text-blue-700',
        success: 'text-green-700',
        error: 'text-red-600'
    };

    statusEl.className = `text-[10px] italic text-center ${toneMap[tone] || toneMap.info}`;
    statusEl.textContent = String(message || '');
}

function setOrderInputErrorState(inputId, errorId, message) {
    const inputEl = document.getElementById(inputId);
    const errorEl = document.getElementById(errorId);
    const hasError = Boolean(message);

    if (inputEl) {
        inputEl.classList.toggle('border-red-300', hasError);
        inputEl.classList.toggle('bg-red-50', hasError);
        inputEl.setAttribute('aria-invalid', hasError ? 'true' : 'false');
    }
    if (errorEl) {
        errorEl.textContent = hasError ? String(message) : '';
        errorEl.classList.toggle('hidden', !hasError);
    }
}

function setOrderGroupErrorState(errorId, message) {
    const errorEl = document.getElementById(errorId);
    if (!errorEl) return;
    errorEl.textContent = message ? String(message) : '';
    errorEl.classList.toggle('hidden', !message);
}

function setDeliveryLocationErrorState(message) {
    const manualAddressEl = document.getElementById('manual-address');
    const locationBtn = document.getElementById('get-location-btn');
    const hasError = Boolean(message);
    const hasLocationLink = Boolean(getOrderLocationLinkByShipMethod('Antar Kerumah'));

    if (manualAddressEl) {
        manualAddressEl.classList.toggle('border-red-300', hasError);
        manualAddressEl.classList.toggle('bg-red-50', hasError);
        manualAddressEl.setAttribute('aria-invalid', hasError ? 'true' : 'false');
    }
    if (locationBtn) {
        locationBtn.classList.toggle('border-red-300', hasError && !hasLocationLink);
        locationBtn.classList.toggle('bg-red-50', hasError && !hasLocationLink);
    }

    setOrderGroupErrorState('manual-address-error', message);
}

function resetOrderValidationUI() {
    setOrderInputErrorState('customer-name', 'customer-name-error', '');
    setOrderInputErrorState('customer-phone', 'customer-phone-error', '');
    setOrderGroupErrorState('shipping-method-error', '');
    setOrderGroupErrorState('payment-method-error', '');
    setDeliveryLocationErrorState('');
}

function resetOrderValidationState() {
    orderValidationTouched = {
        name: false,
        phone: false,
        shipping: false,
        payment: false,
        deliveryAddress: false
    };
    resetOrderValidationUI();
}

function markOrderFieldTouched(fieldKey) {
    if (!fieldKey) return;
    if (Object.prototype.hasOwnProperty.call(orderValidationTouched, fieldKey)) {
        orderValidationTouched[fieldKey] = true;
    }
}

function getOrderNameValidationMessage(name) {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return 'Nama lengkap wajib diisi.';

    const nameWithoutSpaces = trimmedName.replace(/\s/g, '');
    if (nameWithoutSpaces.length < 4) {
        return 'Masukkan nama lengkap minimal 4 karakter.';
    }

    const nameLower = nameWithoutSpaces.toLowerCase();
    const invalidNamePatterns = [
        /^(.)\1{3,}$/,
        /^(.{2})\1{2,}$/,
        /^(.{3})\1{2,}$/,
        /^([a-z])([a-z])\1\2{2,}$/
    ];

    for (const pattern of invalidNamePatterns) {
        if (pattern.test(nameLower)) {
            return 'Masukkan nama lengkap yang valid, bukan huruf berulang.';
        }
    }

    return '';
}

function getOrderPhoneValidationMessage(phone) {
    const rawPhone = String(phone || '').trim();
    if (!rawPhone) return 'Nomor WhatsApp wajib diisi.';

    const cleanPhone = normalizePhone(rawPhone).replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
        return 'Masukkan nomor WhatsApp yang valid.';
    }

    const invalidPatterns = [
        /^(\d)\1{9,}$/,
        /^08(\d)\1{8,}$/,
        /^(\d{2})\1{4,}$/,
        /^(\d{3})\1{3,}$/
    ];

    for (const pattern of invalidPatterns) {
        if (pattern.test(cleanPhone)) {
            return 'Masukkan nomor WhatsApp yang valid.';
        }
    }

    return '';
}

function getOrderFormValidationState() {
    const nameEl = document.getElementById('customer-name');
    const phoneEl = document.getElementById('customer-phone');
    const payMethod = getSelectedPayMethodValue();
    const shipMethod = getSelectedShipMethodValue();
    const manualAddress = getManualDeliveryAddress();
    const locationLink = getOrderLocationLinkByShipMethod(shipMethod);
    const errors = {
        name: '',
        phone: '',
        shipping: '',
        payment: '',
        deliveryAddress: ''
    };

    errors.name = getOrderNameValidationMessage(nameEl ? nameEl.value : '');
    errors.phone = getOrderPhoneValidationMessage(phoneEl ? phoneEl.value : '');

    if (!shipMethod) {
        errors.shipping = 'Pilih metode pengiriman terlebih dahulu.';
    } else if (shipMethod === 'Antar Kerumah') {
        if (!locationLink && !manualAddress) {
            errors.deliveryAddress = 'Bagikan lokasi Maps atau isi alamat manual yang jelas.';
        } else if (!locationLink && manualAddress.replace(/\s/g, '').length < 10) {
            errors.deliveryAddress = 'Alamat manual terlalu singkat. Tambahkan jalan, kampung, atau patokan.';
        }
    }

    if (!payMethod) {
        errors.payment = 'Pilih metode pembayaran terlebih dahulu.';
    } else if (payMethod === 'PayLater') {
        if (paylaterCheckoutState && paylaterCheckoutState.loading) {
            errors.payment = 'Tunggu pengecekan PayLater selesai.';
        } else if (!paylaterCheckoutState || !paylaterCheckoutState.eligible) {
            errors.payment = (paylaterCheckoutState && paylaterCheckoutState.message) || 'PayLater belum memenuhi syarat untuk pesanan ini.';
        }
    }

    const order = ['name', 'phone', 'shipping', 'deliveryAddress', 'payment'];
    const firstInvalidField = order.find((field) => Boolean(errors[field])) || '';

    return {
        errors: errors,
        firstInvalidField: firstInvalidField,
        isValid: !firstInvalidField
    };
}

function applyOrderValidationState(validationState, options) {
    const settings = options || {};
    const showInlineErrors = Boolean(settings.showInlineErrors || settings.forceShowAllErrors);
    const forceShowAllErrors = Boolean(settings.forceShowAllErrors);
    const shouldShow = (fieldKey) => showInlineErrors && (forceShowAllErrors || orderValidationTouched[fieldKey]);

    setOrderInputErrorState(
        'customer-name',
        'customer-name-error',
        shouldShow('name') ? validationState.errors.name : ''
    );
    setOrderInputErrorState(
        'customer-phone',
        'customer-phone-error',
        shouldShow('phone') ? validationState.errors.phone : ''
    );
    setOrderGroupErrorState(
        'shipping-method-error',
        shouldShow('shipping') ? validationState.errors.shipping : ''
    );
    setOrderGroupErrorState(
        'payment-method-error',
        shouldShow('payment') ? validationState.errors.payment : ''
    );
    setDeliveryLocationErrorState(
        shouldShow('deliveryAddress') ? validationState.errors.deliveryAddress : ''
    );
}

function focusOrderField(fieldKey) {
    let target = null;

    if (fieldKey === 'name') {
        target = document.getElementById('customer-name');
    } else if (fieldKey === 'phone') {
        target = document.getElementById('customer-phone');
    } else if (fieldKey === 'shipping') {
        target = document.querySelector('input[name="ship-method"]');
    } else if (fieldKey === 'payment') {
        target = document.querySelector('input[name="pay-method"]:checked') || document.querySelector('input[name="pay-method"]');
    } else if (fieldKey === 'deliveryAddress') {
        target = document.getElementById('manual-address') || document.getElementById('get-location-btn');
    }

    if (target && typeof target.focus === 'function') {
        target.focus();
    }
}

function updateDeliveryLocationHint() {
    const shipMethod = getSelectedShipMethodValue();
    const locationLink = getOrderLocationLinkByShipMethod(shipMethod);
    const manualAddress = getManualDeliveryAddress();

    if (shipMethod !== 'Antar Kerumah') {
        updateLocationShareStatus('', 'info');
        return;
    }

    if (locationLink) {
        updateLocationShareStatus('Lokasi Maps sudah dibagikan. Anda bisa menambah patokan di alamat manual bila perlu.', 'success');
        return;
    }

    if (manualAddress) {
        updateLocationShareStatus('Alamat manual akan dipakai untuk pengiriman. Tambahkan titik Maps bila tersedia.', 'info');
        return;
    }

    updateLocationShareStatus('Bagikan lokasi Maps. Jika tidak bisa, isi alamat manual di bawah.', 'info');
}

function getOrderItemsForPayMethod(payMethod) {
    const selectedPayMethod = String(payMethod || '').trim();
    const isGajian = selectedPayMethod === 'Bayar Gajian';

    return cart
        .filter((item) => !isCartItemUnavailable(item))
        .map((item) => {
        const basePrice = isGajian ? item.hargaGajian : item.harga;
        const effectivePrice = calculateTieredPrice(basePrice, item.qty, item.grosir);
        const itemTotal = effectivePrice * item.qty;
        const itemPoints = calculateRewardPoints(item.harga, item.nama) * item.qty;

        return {
            item: item,
            qty: item.qty,
            basePrice: basePrice,
            effectivePrice: effectivePrice,
            itemTotal: itemTotal,
            isGrosir: effectivePrice < basePrice,
            itemPoints: itemPoints
        };
        });
}

function getOrderSnapshot(payMethod, shipMethod) {
    const items = getOrderItemsForPayMethod(payMethod);
    const shipMeta = getShippingMethodMeta(shipMethod);
    const paymentMeta = getPaymentMethodMeta(payMethod);
    const subtotal = items.reduce((sum, entry) => sum + entry.itemTotal, 0);
    const shippingFee = Number(shipMeta.fee || 0);
    const total = subtotal + shippingFee;
    const totalQty = items.reduce((sum, entry) => sum + (parseInt(entry.qty, 10) || 0), 0);
    const totalPoints = items.reduce((sum, entry) => sum + entry.itemPoints, 0);

    return {
        items: items,
        shipMeta: shipMeta,
        paymentMeta: paymentMeta,
        subtotal: subtotal,
        shippingFee: shippingFee,
        total: total,
        totalQty: totalQty,
        totalPoints: totalPoints
    };
}

function renderOrderSummary() {
    const summaryEl = document.getElementById('order-summary');
    if (!summaryEl) return;

    const payMethod = getSelectedPayMethodValue();
    const shipMethod = getSelectedShipMethodValue();
    const snapshot = getOrderSnapshot(payMethod, shipMethod);

    if (!snapshot.items.length) {
        summaryEl.innerHTML = '<p class="text-sm text-gray-500">Keranjang Anda masih kosong.</p>';
        return;
    }

    const activeMethodChips = [];
    if (snapshot.paymentMeta.label) {
        activeMethodChips.push(`Bayar: ${snapshot.paymentMeta.label}`);
    }
    if (snapshot.shipMeta.label) {
        activeMethodChips.push(`Kirim: ${snapshot.shipMeta.label}`);
    }

    summaryEl.innerHTML = snapshot.items.map((entry) => {
        const item = entry.item;
        return `
                <div class="flex justify-between items-center py-1">
                    <div class="flex flex-col">
                        <span class="font-medium">${escapeHtml(item.nama)}${item.selectedVariation ? ' (' + escapeHtml(item.selectedVariation.nama) + ')' : ''} (x${item.qty})</span>
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                                +${entry.itemPoints.toFixed(1)} Poin
                            </span>
                            ${entry.isGrosir ? '<span class="bg-green-100 text-green-700 text-[8px] px-1 rounded font-bold">Harga Grosir</span>' : ''}
                        </div>
                    </div>
                    <div class="flex flex-col items-end">
                        ${entry.isGrosir ? `<span class="text-[10px] text-gray-400 line-through">${formatOrderCurrency(entry.basePrice * item.qty)}</span>` : ''}
                        <span class="font-bold">${formatOrderCurrency(entry.itemTotal)}</span>
                    </div>
                </div>
            `;
    }).join('');

    if (activeMethodChips.length > 0) {
        const chipsContainer = document.createElement('div');
        chipsContainer.className = 'flex flex-wrap gap-2 border-t border-dashed border-gray-200 mt-2 pt-2';

        activeMethodChips.forEach((chipLabel) => {
            const chipEl = document.createElement('span');
            chipEl.className = 'inline-flex items-center rounded-full bg-white border border-green-100 px-2.5 py-1 text-[10px] font-semibold text-green-700';
            chipEl.textContent = chipLabel;
            chipsContainer.appendChild(chipEl);
        });

        summaryEl.appendChild(chipsContainer);
    }

    summaryEl.innerHTML += `
            <div class="border-t border-dashed border-gray-200 mt-2 pt-2 flex justify-between items-center">
                <span class="text-xs font-bold text-amber-700">Total Poin Didapat:</span>
                <span class="text-sm font-black text-amber-700 flex items-center gap-1">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                    ${escapeHtml(snapshot.totalPoints.toFixed(1))} Poin
                </span>
            </div>
        `;
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
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
            <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z"></path></svg>
            </div>
        <p class="text-xs font-medium text-gray-700">${escapeHtml(text)}</p>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchProducts();
    fetchTukarPoin();

    // Product card event delegation
    const productGrid = document.getElementById('product-grid');
    if (productGrid) {
        productGrid.addEventListener('click', (event) => {
            const actionEl = event.target.closest('[data-action]');
            if (!actionEl || actionEl.disabled) return;

            const action = actionEl.getAttribute('data-action');
            const productId = actionEl.getAttribute('data-product-id') ||
                actionEl.closest('[data-product-id]')?.getAttribute('data-product-id');
            const product = findProductById(productId);
            if (isProductInteractionLocked(product)) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            switch (action) {
                case 'toggle-wishlist':
                    if (productId) toggleWishlist(productId);
                    break;
                case 'show-detail':
                    if (product) showDetail(product);
                    break;
                case 'add-to-cart':
                    if (product) addToCart(product, event);
                    break;
                case 'update-product-card-qty': {
                    const delta = parseInt(actionEl.getAttribute('data-delta'), 10);
                    if (productId && !Number.isNaN(delta)) updateProductCardQty(productId, delta);
                    break;
                }
                case 'direct-order':
                    if (product) directOrder(product);
                    break;
                default:
                    break;
            }
        });
    }

    // Category filters delegation
    const categoryFilters = document.getElementById('category-filters');
    if (categoryFilters) {
        categoryFilters.addEventListener('click', (event) => {
            const actionEl = event.target.closest('[data-action="set-category"]');
            if (!actionEl) return;
            const category = actionEl.getAttribute('data-category');
            if (category) setCategory(category);
        });
    }

    const sidebarCategoryList = document.getElementById('sidebar-category-list');
    if (sidebarCategoryList) {
        sidebarCategoryList.addEventListener('click', (event) => {
            const actionEl = event.target.closest('[data-action="select-sidebar-category"]');
            if (!actionEl) return;
            const category = actionEl.getAttribute('data-category');
            if (category) selectSidebarCategory(category);
        });
    }

    renderHeaderCategoryMenu();
    syncHeaderAuthState();

    const headerCategoryTrigger = document.getElementById('header-category-trigger');
    if (headerCategoryTrigger) {
        headerCategoryTrigger.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleHeaderCategoryMenu();
        });
    }

    const headerAccountTrigger = document.getElementById('header-account-trigger');
    if (headerAccountTrigger) {
        headerAccountTrigger.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleHeaderAccountMenu();
        });
    }

    const headerNotificationTrigger = document.getElementById('header-notification-trigger');
    if (headerNotificationTrigger) {
        headerNotificationTrigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleHeaderNotificationDropdown();
        });
    }

    const headerNotificationDropdown = document.getElementById('header-notification-dropdown');
    if (headerNotificationDropdown) {
        headerNotificationDropdown.addEventListener('click', (event) => {
            event.stopPropagation();

            const openTrigger = event.target.closest('[data-action="open-header-notification"]');
            if (openTrigger) {
                const notificationId = String(openTrigger.getAttribute('data-id') || '').trim();
                openHeaderNotificationDetailModal(notificationId);
                return;
            }

            const markAllTrigger = event.target.closest('[data-action="mark-all-header-notifications-read"]');
            if (markAllTrigger) {
                markAllHeaderNotificationsAsRead();
                return;
            }

            const viewAllTrigger = event.target.closest('[data-action="view-all-header-notifications"]');
            if (viewAllTrigger) {
                closeHeaderNotificationDropdown();
                openHeaderNotifications();
            }
        });
    }

    window.addEventListener('resize', applyHeaderNotificationDropdownViewportLimit);

    const headerNotificationDetailModal = document.getElementById('header-notification-detail-modal');
    if (headerNotificationDetailModal) {
        headerNotificationDetailModal.addEventListener('click', (event) => {
            if (event.target === headerNotificationDetailModal) {
                closeHeaderNotificationDetailModal();
                return;
            }

            const closeTrigger = event.target.closest('[data-action="close-header-notification-detail"]');
            if (closeTrigger) {
                closeHeaderNotificationDetailModal();
                return;
            }

            const actionTrigger = event.target.closest('[data-action="header-notification-detail-action"]');
            if (actionTrigger) {
                runHeaderNotificationDetailAction();
            }
        });
    }

    const orderTrackingModal = document.getElementById('order-tracking-modal');
    if (orderTrackingModal) {
        orderTrackingModal.addEventListener('click', (event) => {
            if (event.target === orderTrackingModal) {
                closeHeaderOrderTrackingModal();
                return;
            }

            const closeTrigger = event.target.closest('[data-action="close-order-tracking"]');
            if (closeTrigger) {
                closeHeaderOrderTrackingModal();
            }
        });
    }

    const headerAccountMenu = document.getElementById('header-account-menu');
    if (headerAccountMenu) {
        headerAccountMenu.addEventListener('click', (event) => {
            const logoutTrigger = event.target.closest('#header-account-logout');
            if (logoutTrigger) {
                event.preventDefault();
                handleHeaderAccountLogout();
                return;
            }

            const closeTrigger = event.target.closest('[data-close-account-menu="true"]');
            if (closeTrigger) {
                closeHeaderAccountMenu();
            }
        });
    }

    const headerCategoryList = document.getElementById('header-category-list');
    if (headerCategoryList) {
        headerCategoryList.addEventListener('click', (event) => {
            const actionEl = event.target.closest('[data-action="set-header-category"]');
            if (!actionEl) return;
            const category = actionEl.getAttribute('data-category');
            if (category) {
                setCategory(category);
            }
        });
    }

    const headerSearchSubmit = document.getElementById('header-search-submit');
    if (headerSearchSubmit) {
        headerSearchSubmit.addEventListener('click', () => {
            filterProducts();
            closeSearchSuggestions();
            const target = getPaginationScrollAnchor();
            if (target) {
                window.scrollTo({
                    top: getPaginationScrollTop(target),
                    behavior: 'smooth'
                });
            }
        });
    }

    window.addEventListener('pageshow', syncHeaderAuthState);
    window.addEventListener('storage', syncHeaderAuthState);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            syncHeaderAuthState();
        }
    });

    // Pagination delegation
    const pagination = document.getElementById('pagination-container');
    if (pagination) {
        pagination.addEventListener('click', (event) => {
            const actionEl = event.target.closest('[data-action="change-page"]');
            if (!actionEl || actionEl.disabled) return;
            const page = parseInt(actionEl.getAttribute('data-page'), 10);
            if (!Number.isNaN(page)) changePage(page);
        });
    }

    // Add event listener for detail modal add to cart button
    const modalAddCartBtn = document.getElementById('modal-add-cart');
    if (modalAddCartBtn) {
        modalAddCartBtn.addEventListener('click', (event) => {
            addCurrentModalProductToCart(event);
        });
    }

    const orderModal = document.getElementById('order-modal');
    if (orderModal) {
        const orderInputs = orderModal.querySelectorAll(
            'input[name="ship-method"], input[name="pay-method"], #customer-name, #customer-phone, #manual-address'
        );
        orderInputs.forEach((input) => {
            const eventName = input.type === 'radio' ? 'change' : 'input';
            input.addEventListener(eventName, () => {
                if (input.id === 'customer-name') {
                    markOrderFieldTouched('name');
                } else if (input.id === 'customer-phone') {
                    markOrderFieldTouched('phone');
                } else if (input.id === 'manual-address') {
                    markOrderFieldTouched('deliveryAddress');
                    updateDeliveryLocationHint();
                } else if (input.name === 'ship-method') {
                    markOrderFieldTouched('shipping');
                    if (getSelectedShipMethodValue() === 'Antar Kerumah') {
                        markOrderFieldTouched('deliveryAddress');
                    }
                    updateDeliveryLocationHint();
                } else if (input.name === 'pay-method') {
                    markOrderFieldTouched('payment');
                }
                updateOrderCTAState({ showInlineErrors: true });
            });
        });
        const phoneInput = document.getElementById('customer-phone');
        if (phoneInput) {
            phoneInput.addEventListener('input', () => {
                if (isPaylaterSelected()) refreshPaylaterCheckoutState();
            });
        }
        const paylaterTenorEl = document.getElementById('paylater-tenor');
        if (paylaterTenorEl) {
            paylaterTenorEl.addEventListener('change', () => {
                if (isPaylaterSelected()) refreshPaylaterCheckoutState(true);
            });
        }
        syncPaylaterAvailability();
        updateOrderCTAState();
    }

    // Modal variation delegation
    const detailModal = document.getElementById('detail-modal');
    if (detailModal) {
        detailModal.addEventListener('click', (event) => {
            if (event.target === detailModal) {
                closeDetailModal();
                return;
            }

            const actionEl = event.target.closest('[data-action]');
            if (!actionEl || actionEl.disabled) return;

            const action = actionEl.getAttribute('data-action');
            if (action === 'close-detail') {
                event.preventDefault();
                closeDetailModal();
                return;
            }

            if (action === 'show-related-product') {
                const productId = actionEl.getAttribute('data-product-id');
                const product = findProductById(productId);
                if (product) {
                    event.preventDefault();
                    showDetail(product);
                }
                return;
            }

            if (action === 'add-to-cart-sticky') {
                event.preventDefault();
                addCurrentModalProductToCart(event);
                return;
            }

            if (action === 'buy-now' || action === 'buy-now-sticky') {
                event.preventDefault();
                directOrderFromModal();
                return;
            }

            if (action === 'update-modal-qty' || action === 'update-modal-qty-sticky') {
                event.preventDefault();
                const delta = parseInt(actionEl.getAttribute('data-qty'), 10);
                if (!Number.isNaN(delta)) changeModalQuantity(delta);
                return;
            }

            if (action !== 'select-variation') return;

            const index = parseInt(actionEl.getAttribute('data-index'), 10);
            if (!currentModalProduct || !currentModalProduct.variations || Number.isNaN(index)) return;
            const variation = currentModalProduct.variations[index];
            if (variation) selectVariation(variation, index);
        });
    }

    // Wishlist delegation
    const wishlistContainer = document.getElementById('wishlist-items-container');
    if (wishlistContainer) {
        wishlistContainer.addEventListener('click', (event) => {
            const actionEl = event.target.closest('[data-action]');
            if (!actionEl || actionEl.disabled) return;
            const action = actionEl.getAttribute('data-action');
            const productId = actionEl.getAttribute('data-product-id');
            const product = findProductById(productId);

            if (action === 'wishlist-toggle' && productId) {
                toggleWishlist(productId);
                return;
            }
            if (action === 'wishlist-buy' && isProductInteractionLocked(product)) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (action === 'wishlist-buy' && product) {
                showDetail(product);
            }
        });
    }

    // Reward "Tukar" button delegation (items rendered dynamically)
    const rewardItemsList = document.getElementById('reward-items-list');
    if (rewardItemsList) {
        rewardItemsList.addEventListener('click', (event) => {
            const actionEl = event.target.closest('[data-action="show-confirm-tukar"]');
            if (!actionEl || actionEl.disabled) return;

            const rewardId = actionEl.getAttribute('data-reward-id');
            if (!rewardId) return;

            showConfirmTukarModal(rewardId);
        });
    }

    // Cart controls delegation
    const cartItems = document.getElementById('cart-items');
    if (cartItems) {
        cartItems.addEventListener('click', (event) => {
            const actionEl = event.target.closest('[data-action]');
            if (!actionEl || actionEl.disabled) return;
            const action = actionEl.getAttribute('data-action');
            const index = parseInt(actionEl.getAttribute('data-index'), 10);
            const delta = parseInt(actionEl.getAttribute('data-delta'), 10);

            if (action === 'update-cart-qty' && !Number.isNaN(index) && !Number.isNaN(delta)) {
                updateQty(index, delta);
            }
            if (action === 'remove-cart-item' && !Number.isNaN(index)) {
                removeItem(index);
            }
        });
    }

    const searchSuggestions = document.getElementById('search-suggestions');
    if (searchSuggestions) {
        searchSuggestions.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-action="search-suggestion"]');
            if (!btn) return;
            const value = btn.getAttribute('data-value') || '';
            const input = document.getElementById('search-input');
            if (input) {
                input.value = value;
                filterProducts();
            }
            closeSearchSuggestions();
        });
    }
    const searchSuggestionsHeader = document.getElementById('search-suggestions-header');
    if (searchSuggestionsHeader) {
        searchSuggestionsHeader.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-action="search-suggestion"]');
            if (!btn) return;
            const value = btn.getAttribute('data-value') || '';
            const input = document.getElementById('search-input-header');
            const mainInput = document.getElementById('search-input');
            if (input) {
                input.value = value;
            }
            if (mainInput) {
                mainInput.value = value;
            }
            filterProducts();
            closeSearchSuggestions();
        });
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const mobileInput = document.getElementById('search-input-header');
            if (mobileInput && mobileInput.value !== searchInput.value) {
                mobileInput.value = searchInput.value;
            }
        });
        searchInput.addEventListener('focus', () => {
            closeHeaderCategoryMenu();
            closeHeaderAccountMenu();
        });
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeSearchSuggestions();
            }
            if (event.key === 'Enter') {
                closeSearchSuggestions();
                event.preventDefault();
                searchInput.blur();
            }
        });
    }
    const headerInput = document.getElementById('search-input-header');
    if (headerInput) {
        headerInput.addEventListener('focus', () => {
            closeHeaderCategoryMenu();
            closeHeaderAccountMenu();
        });
        headerInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeSearchSuggestions();
            }
            if (event.key === 'Enter') {
                closeSearchSuggestions();
                event.preventDefault();
                headerInput.blur();
            }
        });
    }

    document.addEventListener('click', (event) => {
        const isInsideSearch = event.target.closest('#search-input') ||
            event.target.closest('#search-suggestions') ||
            event.target.closest('#search-input-header') ||
            event.target.closest('#search-suggestions-header');
        const isInsideHeaderCategory = event.target.closest('#header-category-trigger') ||
            event.target.closest('#header-category-menu');
        const isInsideHeaderAccount = event.target.closest('#header-account-trigger') ||
            event.target.closest('#header-account-menu');
        const isInsideHeaderNotification = event.target.closest('#header-notification-wrap');
        if (!isInsideSearch) {
            closeSearchSuggestions();
        }
        if (!isInsideHeaderCategory) {
            closeHeaderCategoryMenu();
        }
        if (!isInsideHeaderAccount) {
            closeHeaderAccountMenu();
        }
        if (!isInsideHeaderNotification) {
            closeHeaderNotificationDropdown();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        closeSearchSuggestions();
        closeHeaderCategoryMenu();
        closeHeaderAccountMenu();
        closeHeaderNotificationDropdown();
        closeHeaderNotificationDetailModal();
        closeHeaderOrderTrackingModal();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden || !hasCheckoutLoginSession()) return;
        syncHeaderNotificationState();
    });

    window.addEventListener('focus', () => {
        if (!hasCheckoutLoginSession()) return;
        syncHeaderNotificationState();
    });


    const headerSearch = document.getElementById('search-input-header');
    if (headerSearch) {
        headerSearch.addEventListener('input', (event) => {
            const value = event.target.value || '';
            const mainSearch = document.getElementById('search-input');
            if (mainSearch) {
                mainSearch.value = value;
            }
            filterProducts();
        });
        headerSearch.addEventListener('focus', () => {
            const header = document.getElementById('main-header');
            if (header) header.classList.add('header-search-active');
        });
        headerSearch.addEventListener('blur', () => {
            const header = document.getElementById('main-header');
            if (!header) return;
            setTimeout(() => header.classList.remove('header-search-active'), 120);
        });
    }
});

function toggleLocationField() {
    const shipMethod = getSelectedShipMethodValue();
    const shipMeta = getShippingMethodMeta(shipMethod);
    const locationField = document.getElementById('location-field');
    const deliveryUI = document.getElementById('delivery-location-ui');
    const pickupUI = document.getElementById('pickup-location-ui');
    const locationInput = document.getElementById('location-link');
    
    if (locationField) {
        locationField.classList.toggle('hidden', !shipMeta.showLocationField);
    }
    if (deliveryUI) {
        deliveryUI.classList.toggle('hidden', !shipMeta.showDeliveryUI);
    }
    if (pickupUI) {
        pickupUI.classList.toggle('hidden', !shipMeta.showPickupUI);
    }

    if (!shipMeta.includeLocationLink) {
        if (locationInput) locationInput.value = '';
        resetLocationShareButton();
    } else if (locationInput && !String(locationInput.value || '').trim()) {
        resetLocationShareButton();
    }

    updateDeliveryLocationHint();
    updateOrderTotal();
}

function getCurrentLocation() {
    const btn = document.getElementById('get-location-btn');
    const locationInput = document.getElementById('location-link');
    
    if (!navigator.geolocation) {
        markOrderFieldTouched('deliveryAddress');
        updateLocationShareStatus('Browser ini tidak mendukung akses lokasi. Silakan isi alamat manual.', 'error');
        updateOrderCTAState({ showInlineErrors: true });
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span>⌛ Mengambil Lokasi...</span>';
    updateLocationShareStatus('Sedang mengambil titik Maps Anda...', 'info');

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            locationInput.value = mapsUrl;
            markOrderFieldTouched('deliveryAddress');
            
            btn.classList.remove('border-red-300', 'bg-red-50');
            btn.classList.remove('bg-white', 'text-blue-700', 'border-blue-200');
            btn.classList.add('bg-green-600', 'text-white', 'border-green-600');
            btn.innerHTML = '<span>✅ Lokasi Berhasil Dibagikan</span>';
            updateLocationShareStatus('Lokasi Maps berhasil dibagikan. Anda bisa menambah patokan di alamat manual bila perlu.', 'success');
            updateOrderCTAState({ showInlineErrors: true });
        },
        (error) => {
            markOrderFieldTouched('deliveryAddress');
            resetLocationShareButton();
            let msg = 'Gagal mengambil lokasi.';
            if (error.code === 1) msg = 'Mohon izinkan akses lokasi, atau isi alamat manual di bawah.';
            if (error.code === 3) msg = 'Lokasi belum berhasil diambil. Silakan coba lagi atau isi alamat manual.';
            updateLocationShareStatus(msg, 'error');
            updateOrderCTAState({ showInlineErrors: true });
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
}

function getSelectedPayMethodValue() {
    const payEl = document.querySelector('input[name="pay-method"]:checked');
    return payEl ? String(payEl.value || '').trim() : '';
}

function isPaylaterSelected() {
    return getSelectedPayMethodValue() === 'PayLater';
}

function getOrderSubtotalByPayMethod(payMethod) {
    return getOrderSnapshot(payMethod, getSelectedShipMethodValue()).subtotal;
}

function getShippingFeeBySelection() {
    return getShippingMethodMeta(getSelectedShipMethodValue()).fee;
}

function getCurrentOrderGrandTotal() {
    const payMethod = getSelectedPayMethodValue();
    return getOrderSubtotalByPayMethod(payMethod) + getShippingFeeBySelection();
}

function getStoredLoggedInUser() {
    const raw = localStorage.getItem('gosembako_user');
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;

        const normalizedPhone = normalizePhone(parsed.whatsapp || parsed.phone || '');
        const resolvedPhone = normalizedPhone || String(parsed.whatsapp || parsed.phone || '').trim();
        const sessionToken = String(parsed.session_token || parsed.sessionToken || parsed.st || '').trim();

        return {
            ...parsed,
            whatsapp: resolvedPhone,
            phone: resolvedPhone,
            session_token: sessionToken
        };
    } catch (error) {
        return null;
    }
}

function getSessionQueryFromStoredUser() {
    const user = getStoredLoggedInUser();
    if (!user) return '';
    const token = String(user.session_token || user.sessionToken || user.st || '').trim();
    if (!token) return '';
    return '&session_token=' + encodeURIComponent(token);
}

function hasCheckoutLoginSession() {
    return Boolean(getSessionQueryFromStoredUser());
}

function syncPaylaterAvailability() {
    const paylaterInput = document.getElementById('paylater-method');
    const paylaterCard = document.getElementById('paylater-method-card');
    const paylaterSubtitle = document.getElementById('paylater-method-subtitle');
    const paymentInfo = document.getElementById('payment-method-info');
    const qrisDisplay = document.getElementById('qris-display');
    const paylaterPanel = document.getElementById('paylater-checkout-panel');
    const isLoggedIn = hasCheckoutLoginSession();

    if (!paylaterInput || !paylaterCard || !paylaterSubtitle) {
        return isLoggedIn;
    }

    paylaterInput.disabled = !isLoggedIn;
    paylaterInput.setAttribute('aria-disabled', String(!isLoggedIn));

    paylaterCard.classList.toggle('opacity-60', !isLoggedIn);
    paylaterCard.classList.toggle('cursor-not-allowed', !isLoggedIn);
    paylaterCard.classList.toggle('border-dashed', !isLoggedIn);
    paylaterCard.classList.toggle('border-amber-200', !isLoggedIn);

    const cardLabel = paylaterInput.closest('label');
    if (cardLabel) {
        cardLabel.classList.toggle('cursor-pointer', isLoggedIn);
        cardLabel.classList.toggle('cursor-not-allowed', !isLoggedIn);
        cardLabel.title = isLoggedIn ? 'PayLater' : 'Login akun dulu untuk mengaktifkan PayLater';
    }

    paylaterSubtitle.textContent = isLoggedIn ? 'Bayar bertahap' : 'Login dulu untuk aktifkan';

    if (!isLoggedIn && paylaterInput.checked) {
        paylaterInput.checked = false;
        if (paymentInfo) {
            paymentInfo.classList.add('hidden', 'opacity-0', 'scale-95');
        }
        if (qrisDisplay) {
            qrisDisplay.classList.add('hidden', 'opacity-0', 'scale-95');
        }
        if (paylaterPanel) {
            paylaterPanel.classList.add('hidden');
        }
    }

    return isLoggedIn;
}

function getOrCreatePublicClientId() {
    const key = 'gosembako_public_client_id';

    const storages = [];
    try { storages.push(localStorage); } catch (error) { /* ignore */ }
    try { storages.push(sessionStorage); } catch (error) { /* ignore */ }

    for (let i = 0; i < storages.length; i++) {
        try {
            const storage = storages[i];
            const existing = storage.getItem(key);
            if (existing && String(existing).length >= 16) return String(existing);
        } catch (error) {
            // ignore storage read errors
        }
    }

    let id = '';
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            id = crypto.randomUUID();
        }
    } catch (error) {
        // ignore
    }

    if (!id) {
        id = 'cid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    }

    for (let i = 0; i < storages.length; i++) {
        try {
            storages[i].setItem(key, id);
            break;
        } catch (error) {
            // ignore storage write errors
        }
    }

    return id;
}

function getPaylaterEligibilityMessage(reason) {
    const key = String(reason || '').toLowerCase();
    const map = {
        ok: 'PayLater bisa dipakai untuk pesanan ini.',
        loading: 'Sedang cek eligibility PayLater...',
        not_checked: 'Belum dicek.',
        login_required: 'Login akun dulu untuk memakai PayLater.',
        phone_mismatch: 'Nomor checkout harus sama dengan nomor akun yang login.',
        session_invalid: 'Session login tidak valid. Silakan login ulang.',
        paylater_disabled: 'PayLater sedang nonaktif.',
        pilot_not_included: 'PayLater masih tahap pilot. Akun Anda belum termasuk whitelist.',
        account_not_found: 'Akun kredit belum tersedia untuk nomor ini.',
        account_frozen: 'Akun kredit sedang freeze.',
        account_locked: 'Akun kredit sedang lock.',
        account_inactive: 'Akun kredit belum aktif.',
        active_invoice_exists: 'Masih ada tagihan aktif/overdue.',
        below_min_order: 'Total belanja belum memenuhi minimum PayLater.',
        insufficient_limit: 'Limit tersedia tidak mencukupi.',
        fetch_failed: 'Gagal cek data PayLater, coba lagi.'
    };
    return map[key] || 'PayLater belum memenuhi syarat.';
}

function getPaylaterCheckoutConfigFallback() {
    try {
        return (typeof CONFIG !== 'undefined' && typeof CONFIG.getPaylaterConfig === 'function')
            ? CONFIG.getPaylaterConfig()
            : {
                enabled: false,
                tenorFees: { 1: 5, 2: 10, 3: 15, 4: 20 },
                dailyPenaltyPercent: 0.5,
                penaltyCapPercent: 15,
                maxActiveInvoices: 1,
                minOrderAmount: 0
            };
    } catch (error) {
        return {
            enabled: false,
            tenorFees: { 1: 5, 2: 10, 3: 15, 4: 20 },
            dailyPenaltyPercent: 0.5,
            penaltyCapPercent: 15,
            maxActiveInvoices: 1,
            minOrderAmount: 0
        };
    }
}

async function fetchPublicPaylaterConfig() {
    try {
        const resp = await ApiService.get('?action=public_paylater_config', { cache: false });
        if (resp && resp.success) {
            return {
                enabled: String(resp.paylater_enabled || 'false').toLowerCase() === 'true',
                tenorFees: {
                    1: parseFloat(resp.fee_week_1 || 5) || 5,
                    2: parseFloat(resp.fee_week_2 || 10) || 10,
                    3: parseFloat(resp.fee_week_3 || 15) || 15,
                    4: parseFloat(resp.fee_week_4 || 20) || 20
                },
                dailyPenaltyPercent: parseFloat(resp.daily_penalty_percent || 0.5) || 0.5,
                penaltyCapPercent: parseFloat(resp.penalty_cap_percent || 15) || 15,
                maxActiveInvoices: parseInt(resp.max_active_invoices || 1, 10) || 1,
                minOrderAmount: parseInt(resp.min_order_amount || 0, 10) || 0
            };
        }
    } catch (error) {
        console.warn('public_paylater_config unavailable, fallback to local config:', error);
    }
    return getPaylaterCheckoutConfigFallback();
}

function renderPaylaterCheckoutState() {
    const panel = document.getElementById('paylater-checkout-panel');
    const badge = document.getElementById('paylater-eligibility-badge');
    const msg = document.getElementById('paylater-eligibility-message');
    const limitAvailableEl = document.getElementById('paylater-limit-available');
    const activeInvoicesEl = document.getElementById('paylater-active-invoices');
    const simPrincipalEl = document.getElementById('paylater-sim-principal');
    const simFeeEl = document.getElementById('paylater-sim-fee');
    const simPenaltyDailyEl = document.getElementById('paylater-sim-penalty-daily');
    const simPenaltyCapEl = document.getElementById('paylater-sim-penalty-cap');
    const simTotalDueEl = document.getElementById('paylater-sim-total-due');
    if (!panel) {
        updateOrderCTAState();
        return;
    }

    if (!isPaylaterSelected()) {
        panel.classList.add('hidden');
        updateOrderCTAState();
        return;
    }
    panel.classList.remove('hidden');

    const state = paylaterCheckoutState || {};
    const eligibilityReason = state.loading ? 'loading' : (state.reason || 'not_checked');
    const isEligible = Boolean(state.eligible);
    const statusLabel = state.loading ? 'Mengecek...' : (isEligible ? 'Eligible' : 'Tidak Eligible');
    const badgeClass = state.loading
        ? 'bg-amber-100 text-amber-700'
        : (isEligible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700');

    if (badge) {
        badge.className = `text-[10px] font-bold px-2 py-1 rounded-full ${badgeClass}`;
        badge.textContent = statusLabel;
    }
    if (msg) {
        msg.textContent = state.message || getPaylaterEligibilityMessage(eligibilityReason);
    }

    const account = state.account || {};
    const summary = state.summary || {};
    const sim = state.simulation || {};

    if (limitAvailableEl) {
        limitAvailableEl.textContent = `Rp ${((parseInt(account.available_limit || 0, 10) || 0)).toLocaleString('id-ID')}`;
    }
    if (activeInvoicesEl) {
        activeInvoicesEl.textContent = String(parseInt(summary.invoice_count_active || 0, 10) || 0);
    }
    if (simPrincipalEl) simPrincipalEl.textContent = `Rp ${((parseInt(sim.principal || 0, 10) || 0)).toLocaleString('id-ID')}`;
    if (simFeeEl) simFeeEl.textContent = `Rp ${((parseInt(sim.feeAmount || 0, 10) || 0)).toLocaleString('id-ID')}`;
    if (simPenaltyDailyEl) simPenaltyDailyEl.textContent = `Rp ${((parseInt(sim.dailyPenaltyAmount || 0, 10) || 0)).toLocaleString('id-ID')}`;
    if (simPenaltyCapEl) simPenaltyCapEl.textContent = `Rp ${((parseInt(sim.penaltyCapAmount || 0, 10) || 0)).toLocaleString('id-ID')}`;
    if (simTotalDueEl) simTotalDueEl.textContent = `Rp ${((parseInt(sim.totalBeforePenalty || 0, 10) || 0)).toLocaleString('id-ID')}`;
    updateOrderCTAState();
}

async function refreshPaylaterCheckoutState(force) {
    if (!isPaylaterSelected()) {
        paylaterCheckoutState = {
            loading: false,
            eligible: false,
            reason: 'not_checked',
            message: getPaylaterEligibilityMessage('not_checked'),
            account: null,
            summary: null,
            config: null,
            simulation: null
        };
        renderPaylaterCheckoutState();
        return paylaterCheckoutState;
    }

    const reqId = ++paylaterCheckoutRequestSeq;
    paylaterCheckoutState.loading = true;
    paylaterCheckoutState.message = getPaylaterEligibilityMessage('loading');
    paylaterCheckoutState.reason = 'loading';
    renderPaylaterCheckoutState();

    const phoneInput = document.getElementById('customer-phone');
    const checkoutPhone = normalizePhone(phoneInput ? phoneInput.value : '');
    const user = getStoredLoggedInUser();
    const userPhone = normalizePhone((user && (user.whatsapp || user.phone)) || '');
    const sessionQuery = getSessionQueryFromStoredUser();

    if (!sessionQuery) {
        paylaterCheckoutState = {
            loading: false,
            eligible: false,
            reason: 'login_required',
            message: getPaylaterEligibilityMessage('login_required'),
            account: null,
            summary: null,
            config: null,
            simulation: null
        };
        renderPaylaterCheckoutState();
        return paylaterCheckoutState;
    }
    if (!checkoutPhone || !userPhone || checkoutPhone !== userPhone) {
        paylaterCheckoutState = {
            loading: false,
            eligible: false,
            reason: 'phone_mismatch',
            message: getPaylaterEligibilityMessage('phone_mismatch'),
            account: null,
            summary: null,
            config: null,
            simulation: null
        };
        renderPaylaterCheckoutState();
        return paylaterCheckoutState;
    }

    try {
        const apiUrl = CONFIG.getMainApiUrl();
        const [summaryResp, cfg] = await Promise.all([
            fetch(`${apiUrl}?action=public_paylater_summary${sessionQuery}&_t=${Date.now()}`),
            fetchPublicPaylaterConfig()
        ]);

        let summaryPayload = null;
        if (summaryResp.ok) summaryPayload = await summaryResp.json();
        if (!summaryPayload || summaryPayload.success !== true) {
            const errCode = summaryPayload && (summaryPayload.error || summaryPayload.error_code);
            const reason = errCode === 'UNAUTHORIZED_SESSION' ? 'session_invalid' : 'fetch_failed';
            paylaterCheckoutState = {
                loading: false,
                eligible: false,
                reason: reason,
                message: getPaylaterEligibilityMessage(reason),
                account: null,
                summary: null,
                config: cfg,
                simulation: null
            };
            renderPaylaterCheckoutState();
            return paylaterCheckoutState;
        }

        const orderTotal = getCurrentOrderGrandTotal();
        const tenorSelect = document.getElementById('paylater-tenor');
        const tenorWeeks = tenorSelect ? (parseInt(tenorSelect.value || '1', 10) || 1) : 1;
        const logic = (typeof PaylaterLogic !== 'undefined') ? PaylaterLogic : null;
        const account = summaryPayload.account || {};
        const summary = summaryPayload.summary || {};
        const pilot = summaryPayload.pilot || {};
        const activeInvoicesCount = parseInt(summary.invoice_count_active || 0, 10) || 0;

        let eligibility = { eligible: false, reason: 'fetch_failed' };
        if (logic && typeof logic.evaluatePaylaterEligibility === 'function') {
            eligibility = logic.evaluatePaylaterEligibility({
                account: account,
                activeInvoicesCount: activeInvoicesCount,
                orderTotal: orderTotal
            }, cfg);
        }
        if (pilot && pilot.active === true && pilot.eligible === false) {
            eligibility = { eligible: false, reason: 'pilot_not_included' };
        }

        let simulation = null;
        if (logic && typeof logic.calculatePaylaterInvoice === 'function') {
            const invoiceSim = logic.calculatePaylaterInvoice(orderTotal, tenorWeeks, cfg);
            const principal = parseInt(invoiceSim.principal || 0, 10) || 0;
            const dailyPenaltyPercent = parseFloat(cfg.dailyPenaltyPercent || 0) || 0;
            const penaltyCapPercent = parseFloat(cfg.penaltyCapPercent || 0) || 0;
            simulation = {
                tenorWeeks: tenorWeeks,
                feePercent: parseFloat(invoiceSim.feePercent || 0) || 0,
                principal: principal,
                feeAmount: parseInt(invoiceSim.feeAmount || 0, 10) || 0,
                totalBeforePenalty: parseInt(invoiceSim.totalBeforePenalty || 0, 10) || 0,
                dailyPenaltyAmount: Math.max(0, Math.round((principal * dailyPenaltyPercent) / 100)),
                penaltyCapAmount: Math.max(0, Math.round((principal * penaltyCapPercent) / 100))
            };
        }

        if (reqId !== paylaterCheckoutRequestSeq && !force) {
            return paylaterCheckoutState;
        }

        paylaterCheckoutState = {
            loading: false,
            eligible: Boolean(eligibility.eligible),
            reason: eligibility.reason || (eligibility.eligible ? 'ok' : 'fetch_failed'),
            message: getPaylaterEligibilityMessage(eligibility.reason || (eligibility.eligible ? 'ok' : 'fetch_failed')),
            account: account,
            summary: summary,
            config: cfg,
            simulation: simulation
        };
        renderPaylaterCheckoutState();
        return paylaterCheckoutState;
    } catch (error) {
        console.error('Failed refresh PayLater checkout state:', error);
        paylaterCheckoutState = {
            loading: false,
            eligible: false,
            reason: 'fetch_failed',
            message: getPaylaterEligibilityMessage('fetch_failed'),
            account: null,
            summary: null,
            config: null,
            simulation: null
        };
        renderPaylaterCheckoutState();
        return paylaterCheckoutState;
    }
}

function updateOrderTotal() {
    const payMethod = getSelectedPayMethodValue();
    const shipMethod = getSelectedShipMethodValue();
    const snapshot = getOrderSnapshot(payMethod, shipMethod);
    const subtotal = snapshot.subtotal;
    const shippingFee = snapshot.shippingFee;
    const total = snapshot.total;
    
    renderOrderSummary();

    const totalEl = document.getElementById('sticky-order-total');
    const summaryTotalEl = document.getElementById('order-summary-total');
    if (totalEl) {
        totalEl.innerText = formatOrderCurrency(total);
    }
    if (summaryTotalEl) {
        summaryTotalEl.innerText = formatOrderCurrency(total);
    }
    
    const subtotalEl = document.getElementById('order-subtotal');
    const shippingEl = document.getElementById('order-shipping');
    if (subtotalEl) subtotalEl.innerText = formatOrderCurrency(subtotal);
    if (shippingEl) shippingEl.innerText = formatShippingFeeText(shippingFee);

    updateOrderCTAState();
    if (isPaylaterSelected()) {
        refreshPaylaterCheckoutState();
    } else {
        renderPaylaterCheckoutState();
    }
}

function isOrderFormValid() {
    return getOrderFormValidationState().isValid;
}

function updateOrderCTAState(options) {
    const sendButton = document.getElementById('send-order-btn') || document.querySelector('[data-action="send-wa"]');
    const validationState = getOrderFormValidationState();
    const settings = (typeof options === 'boolean') ? { showInlineErrors: options } : { ...(options || {}) };
    const hasOrderableItems = getOrderItemsForPayMethod(getSelectedPayMethodValue()).length > 0;

    if (!Object.prototype.hasOwnProperty.call(settings, 'showInlineErrors') && !settings.forceShowAllErrors) {
        settings.showInlineErrors = Object.values(orderValidationTouched).some(Boolean);
    }

    applyOrderValidationState(validationState, settings);

    if (!sendButton) return validationState;

    sendButton.disabled = !validationState.isValid || !hasOrderableItems;
    sendButton.setAttribute('aria-disabled', String(!validationState.isValid || !hasOrderableItems));
    return validationState;
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

/**
 * Log order to GAS via FormData to avoid CORS preflight
 * Ensures required fields are present before sending
 * @param {object} order - Order data to log
 * @returns {Promise<object>} Response from GAS
 */
async function logOrderToGAS(order) {
    const normalizedOrderId = String(order.order_id || order.id || '').trim() || generateOrderId();
    const normalizedId = String(order.id || '').trim() || normalizedOrderId;
    const nowIso = new Date().toISOString();
    const phone = normalizePhone(order.phone || '');
    const paymentMethod = String(order.payment_method || '').trim().toLowerCase();

    // Keep orders payload aligned with sheet columns while preserving paylater metadata.
    const orderData = {
        id: normalizedId,
        order_id: normalizedOrderId,
        pelanggan: order.pelanggan || '',
        phone: phone,
        produk: order.produk || '',
        qty: order.qty || 0,
        total: order.total || 0,
        poin: order.poin || 0,
        status: order.status || 'Pending',
        point_processed: order.point_processed || 'No',
        tanggal: order.tanggal || new Date().toLocaleString('id-ID'),
        payment_method: paymentMethod || 'cash',
        profit_net: order.profit_net !== undefined ? order.profit_net : '',
        credit_limit_processed: order.credit_limit_processed || 'No',
        created_at: order.created_at || nowIso,
        updated_at: order.updated_at || nowIso,
        paylater_tenor_weeks: order.paylater_tenor_weeks !== undefined ? order.paylater_tenor_weeks : '',
        paylater_fee_percent: order.paylater_fee_percent !== undefined ? order.paylater_fee_percent : '',
        paylater_fee_amount: order.paylater_fee_amount !== undefined ? order.paylater_fee_amount : '',
        paylater_total_due: order.paylater_total_due !== undefined ? order.paylater_total_due : ''
    };
    
    console.log('📝 Logging order to GAS:', orderData);
    
    try {
        const result = await GASActions.create('orders', orderData);
        console.log('✅ Order logged successfully:', result);
        return result;
    } catch (error) {
        console.error('❌ Error logging order to GAS:', error);
        throw error;
    }
}

function resolveOrderLoggingErrorMessage(error) {
    const raw = String((error && error.message) || error || '').trim();
    if (raw.indexOf('INVALID_SIGNATURE') !== -1 || raw.indexOf('SIGNATURE_EXPIRED') !== -1) {
        return 'Pesanan ditolak oleh konfigurasi keamanan server (HMAC). Hubungi admin untuk menonaktifkan public_create_require_hmac atau aktifkan signer backend.';
    }
    if (raw.indexOf('HMAC_NOT_CONFIGURED') !== -1) {
        return 'Konfigurasi keamanan HMAC di server belum lengkap. Hubungi admin.';
    }
    return 'Gagal menyimpan pesanan. Silakan coba lagi atau hubungi admin.';
}

async function sendToWA() {
    // Get the button element
    const sendButton = event?.target || document.querySelector('[data-action="send-wa"]');
    
    // Check if button is already disabled (prevent double submission)
    if (sendButton && sendButton.disabled) {
        return;
    }
    
    orderValidationTouched = {
        name: true,
        phone: true,
        shipping: true,
        payment: true,
        deliveryAddress: true
    };

    if (Array.isArray(allProducts) && allProducts.length > 0) {
        syncCartWithStockLimits();
        updateCartUI();
        updateOrderTotal();
    }

    if (cart.length === 0 || getOrderItemsForPayMethod(getSelectedPayMethodValue()).length === 0) {
        showToast('Keranjang kosong atau produk sedang tidak tersedia untuk dipesan.');
        closeOrderModal();
        return;
    }

    let validationState = updateOrderCTAState({ forceShowAllErrors: true });
    if (!validationState.isValid) {
        focusOrderField(validationState.firstInvalidField);
        return;
    }

    const name = document.getElementById('customer-name').value.trim();
    const phone = normalizePhone(document.getElementById('customer-phone').value);
    const payMethod = getSelectedPayMethodValue();
    const shipMethod = getSelectedShipMethodValue();
    
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
    
    const paymentMeta = getPaymentMethodMeta(payMethod);
    const shipMeta = getShippingMethodMeta(shipMethod);
    const isPaylater = payMethod === 'PayLater';
    const snapshot = getOrderSnapshot(payMethod, shipMethod);
    const subtotal = snapshot.subtotal;
    const shippingFee = snapshot.shippingFee;
    const total = snapshot.total;
    const totalQty = snapshot.totalQty;
    const location = getOrderLocationLabel(shipMethod);
    const locationLink = getOrderLocationLinkByShipMethod(shipMethod);
    const shippingFeeText = formatShippingFeeText(shippingFee);
    let itemsText = '';
    let itemsForSheet = '';
    let receiptItems = [];
    
    snapshot.items.forEach((entry, idx) => {
        const item = entry.item;
        
        const variationText = item.selectedVariation ? ` (${item.selectedVariation.nama})` : '';
        const grosirText = entry.isGrosir ? ` (Harga Grosir: ${formatOrderCurrency(entry.effectivePrice)}/unit)` : '';
        itemsText += `${idx + 1}. ${item.nama}${variationText} x${item.qty}${grosirText} = ${formatOrderCurrency(entry.itemTotal)}\n`;
        itemsForSheet += `${item.nama}${variationText} (x${item.qty}) | `;
        receiptItems.push({
            name: item.nama || '',
            variation: item.selectedVariation ? item.selectedVariation.nama : '',
            qty: item.qty || 0,
            unitPrice: entry.effectivePrice,
            total: entry.itemTotal,
            isGrosir: entry.isGrosir
        });
    });

    let paylaterDetailText = '';
    let paylaterOrderMeta = {};
    let paylaterState = null;
    if (isPaylater) {
        paylaterState = await refreshPaylaterCheckoutState(true);
        validationState = updateOrderCTAState({ forceShowAllErrors: true });
        if (!validationState.isValid || !paylaterState || !paylaterState.simulation) {
            focusOrderField(validationState.firstInvalidField || 'payment');
            if (sendButton) {
                sendButton.disabled = false;
                sendButton.innerHTML = `
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.432 5.631 1.433h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Kirim Pesanan ke WhatsApp
                `;
                sendButton.classList.remove('opacity-75', 'cursor-not-allowed');
            }
            return;
        }
        paylaterOrderMeta = {
            paylater_tenor_weeks: paylaterState.simulation.tenorWeeks,
            paylater_fee_percent: paylaterState.simulation.feePercent,
            paylater_fee_amount: paylaterState.simulation.feeAmount,
            paylater_total_due: paylaterState.simulation.totalBeforePenalty,
            payment_method: 'paylater'
        };
        paylaterDetailText =
            `*PayLater Simulasi:*\n` +
            `- Pokok: ${formatOrderCurrency(paylaterState.simulation.principal || 0)}\n` +
            `- Tenor: ${Number(paylaterState.simulation.tenorWeeks || 1)} minggu\n` +
            `- Biaya Layanan (${Number(paylaterState.simulation.feePercent || 0)}%): ${formatOrderCurrency(paylaterState.simulation.feeAmount || 0)}\n` +
            `- Total Jatuh Tempo: ${formatOrderCurrency(paylaterState.simulation.totalBeforePenalty || 0)}\n\n`;
    }
    
    // Calculate reward points (1 point per 10,000 IDR)
    const rewardConfig = CONFIG.getRewardConfig();
    const pointValue = rewardConfig.pointValue || 10000;
    const pointsEarned = Math.floor(total / pointValue);
    const orderDateText = new Date().toLocaleString('id-ID');
    
    const orderId = generateOrderId();
    
    const locationText = locationLink ? `\n*Lokasi Maps:* ${locationLink}` : '';

    const receiptData = {
        storeName: getReceiptStoreName(),
        storeUrl: 'https://paketsembako.com',
        orderId: orderId,
        dateText: orderDateText,
        customerName: name,
        customerPhone: normalizePhone(phone),
        paymentMethod: paymentMeta.label,
        status: isPaylater ? 'Pending PayLater' : 'Pending',
        shippingMethod: shipMeta.label,
        location: location,
        locationLink: locationLink,
        items: receiptItems,
        subtotal: subtotal,
        shippingFee: shippingFee,
        total: total,
        pointsEarned: pointsEarned,
        paylaterSimulation: paylaterState && paylaterState.simulation ? paylaterState.simulation : null
    };

    const message = `*PESANAN BARU - GOSEMBAKO*\n\n` +
        `*Order ID: ${orderId}*\n` +
        `*Data Pelanggan:*\n` +
        `Nama: ${name}\n` +
        `WhatsApp: ${phone}\n\n` +
        `*Detail Pesanan:*\n${itemsText}\n` +
        `*Metode Pembayaran:* ${paymentMeta.label}\n` +
        `*Metode Pengiriman:* ${shipMeta.label}\n` +
        `*Lokasi/Titik:* ${location}${locationText}\n\n` +
        `*Ongkir:* ${shippingFeeText}\n` +
        `*TOTAL BAYAR: ${formatOrderCurrency(total)}*\n` +
        `${paylaterDetailText}` +
        `*Estimasi Poin:* +${pointsEarned} Poin\n\n` +
        `Mohon segera diproses ya, terima kasih!`;
        
    const waUrl = `https://wa.me/628993370200?text=${encodeURIComponent(message)}`;
    
    // Log order to spreadsheet before opening WhatsApp
    // Mapping to spreadsheet columns: id, order_id, pelanggan, produk, qty, total, status, tanggal, phone, poin, point_processed
    const orderData = {
        id: orderId,
        order_id: orderId,
        pelanggan: name,
        produk: itemsForSheet.slice(0, -3), // Remove trailing ' | '
        qty: totalQty,
        total: total,
        status: isPaylater ? 'Pending PayLater' : 'Pending',
        tanggal: orderDateText,
        phone: normalizePhone(phone),
        poin: pointsEarned,
        point_processed: 'No',
        payment_method: paymentMeta.sheetCode,
        ...paylaterOrderMeta
    };

    // Log order to GAS using FormData (no CORS preflight)
    try {
        await logOrderToGAS(orderData);
        console.log('✅ Order logged to spreadsheet successfully');
        
        // Clear cart after successful order logging
        cart = [];
        saveCart();
        updateCartUI();
        closeOrderModal();
        
        // Show success notification with WhatsApp button
        showSuccessNotification(orderId, waUrl, receiptData);
        
    } catch (err) {
        console.error('❌ Error logging order:', err);
        showToast(resolveOrderLoggingErrorMessage(err));
    } finally {
        // Re-enable button after completion (reset state)
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
    }
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

/**
 * Hide global reward loader (for index.html modal)
 */
function hideGlobalRewardLoader() {
    const loadingEl = document.getElementById('reward-items-loading');
    const legacyLoadingEl = document.getElementById('rewards-loading');
    
    if (loadingEl) loadingEl.classList.add('hidden');
    if (legacyLoadingEl) legacyLoadingEl.classList.add('hidden');
}

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
    } finally {
        // Always hide loaders in finally block
        hideGlobalRewardLoader();
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
        const safeImage = sanitizeUrl(gambar, 'https://via.placeholder.com/100?text=Reward');
        const deskripsi = r.deskripsi || '';

        const safeNama = escapeHtml(nama);
        const safeDesc = escapeHtml(deskripsi);
        return `
            <div class="bg-white p-4 rounded-2xl border-2 border-gray-100 hover:border-green-500 transition-all group shadow-sm">
                <div class="flex gap-4">
                    <div class="w-20 h-20 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0">
                        <img src="${safeImage}" alt="${safeNama}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" data-fallback-src="https://via.placeholder.com/100?text=Reward">
                    </div>
                    <div class="flex-1 min-w-0">
                        <h5 class="font-bold text-gray-800 truncate">${safeNama}</h5>
                        <p class="text-[10px] text-gray-500 line-clamp-2 mb-2">${safeDesc}</p>
                        <div class="flex items-center justify-between">
                            <div class="bg-amber-100 text-amber-700 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1">
                                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                                ${poin} Poin
                            </div>
                            <button type="button" data-action="show-confirm-tukar" data-reward-id="${escapeHtml(id)}" class="bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition active:scale-95">
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

function normalizeApiRows(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.result)) return data.result;
    if (Array.isArray(data.rows)) return data.rows;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.items)) return data.items;
    return [];
}

/**
 * Check user points from SheetDB
 * Fetches points data based on phone number
 */
function checkUserPoints(triggerEvent) {
    const phoneInput = document.getElementById('reward-phone');
    const phone = phoneInput ? phoneInput.value.trim() : '';
    
    const storedUser = (typeof getStoredLoggedInUser === 'function') ? getStoredLoggedInUser() : null;
    const sessionQuery = (typeof getSessionQueryFromStoredUser === 'function') ? getSessionQueryFromStoredUser() : '';
    const storedPhone = storedUser ? normalizePhone(storedUser.phone || storedUser.whatsapp || '') : '';
    const normalizedPhone = normalizePhone(phone || storedPhone);
    
    if (!normalizedPhone) {
        alert('Mohon masukkan nomor WhatsApp.');
        return;
    }

    // Show loading state
    const checkBtn = (triggerEvent && triggerEvent.currentTarget) || document.querySelector('[data-action="check-points"]');
    const originalText = checkBtn ? checkBtn.innerText : 'Cek Poin';
    if (checkBtn && checkBtn.tagName === 'BUTTON') {
        checkBtn.innerText = 'Mencari...';
        checkBtn.disabled = true;
    }

    // Use ApiService with no caching (always fresh data)
    const clientId = getOrCreatePublicClientId();
    const url = sessionQuery
        ? `?action=public_user_points${sessionQuery}&_t=${Date.now()}`
        : `?action=public_points_check&phone=${encodeURIComponent(normalizedPhone)}${clientId ? `&client_id=${encodeURIComponent(clientId)}` : ''}&_t=${Date.now()}`;

    ApiService.get(url, { cache: false })
        .then(payload => {
            if (!payload || payload.success !== true) {
                const message = String((payload && (payload.message || payload.error)) || 'Gagal mengecek poin.');
                throw new Error(message);
            }

            const display = document.getElementById('points-display');
            const value = document.querySelector('#points-display h4');
            if (!display || !value) return;

            // Fix: Handle comma as decimal separator from spreadsheet
            const rawPoints = String(payload.points || 0).replace(',', '.');
            const pts = parseFloat(rawPoints) || 0;
            value.innerHTML = `${escapeHtml(pts.toFixed(1))} <span class="text-sm font-bold">Poin</span>`;

            // Prefer stored phone from session to avoid mismatch
            const resolvedPhone = storedPhone || normalizedPhone;
            sessionStorage.setItem('user_points', pts);
            sessionStorage.setItem('reward_phone', resolvedPhone);
            sessionStorage.setItem('reward_customer_name', (storedUser && (storedUser.nama || storedUser.pelanggan)) || resolvedPhone);
            if (phoneInput && resolvedPhone) phoneInput.value = resolvedPhone;

            showToast(pts > 0 ? `Saldo poin Anda: ${pts.toFixed(1)} poin.` : 'Poin Anda saat ini 0.0.');
            display.classList.remove('hidden');
        })
        .catch(error => {
            console.error('Error checking points:', error);
            const msg = String((error && error.message) || '').trim();
            const msgLower = msg.toLowerCase();
            if (msgLower.includes('unauthorized_session') || msgLower.includes('session login') || msgLower.includes('session')) {
                alert('Session login tidak valid. Silakan login ulang lewat menu Akun.');
                return;
            }
            if (msg) {
                alert(msg);
                return;
            }
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
function ensureLoggedInForRewardExchange() {
    const sessionQuery = (typeof getSessionQueryFromStoredUser === 'function') ? getSessionQueryFromStoredUser() : '';
    if (sessionQuery) return true;
    showToast('Tukar poin harus login dulu. Mengarahkan ke halaman Akun...');
    setTimeout(() => {
        window.location.href = '/akun.html';
    }, 1200);
    return false;
}

async function claimReward(rewardId) {
    if (!ensureLoggedInForRewardExchange()) return;
    const phone = sessionStorage.getItem('reward_phone');
    
    if (!phone) {
        alert('Mohon cek poin Anda terlebih dahulu.');
        return;
    }

    try {
        // 1. Get reward details for confirmation UI
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
        const userPoints = parseFloat(sessionStorage.getItem('user_points')) || 0;

        // 2. Confirm redemption and ask for name
        const message = `Tukar ${requiredPoints} poin Anda dengan "${rewardName}"?\nSaldo poin saat ini: ${userPoints.toFixed(1)}`;
        if (!confirm(message)) return;

        // Ask for customer name
        let customerName = prompt("Silakan masukkan nama Anda untuk klaim ini:", sessionStorage.getItem('reward_customer_name') || "");
        if (customerName === null) return; // User cancelled
        customerName = customerName.trim() || "Pelanggan";

        // Show loading state
        showToast('Sedang memproses penukaran...');
        
        // 3. Atomic claim on server side
        const requestId = `RW-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        const claimResult = await GASActions.post({
            action: 'claim_reward',
            sheet: 'tukar_poin',
            data: {
                reward_id: rewardId,
                phone: phone,
                customer_name: customerName,
                request_id: requestId
            }
        });

        const claimId = claimResult.claim_id || ('CLM-' + Date.now().toString().slice(-6));
        const pointsUsed = parseFloat(claimResult.points_used || requiredPoints) || 0;
        const newPoints = parseFloat(claimResult.balance_after);
        const finalPoints = Number.isNaN(newPoints) ? Math.max(0, userPoints - pointsUsed) : newPoints;

        // 4. Update local state and UI
        sessionStorage.setItem('user_points', finalPoints);
        const pointsDisplay = document.querySelector('#points-display h4');
        if (pointsDisplay) {
            pointsDisplay.innerHTML = `${escapeHtml(finalPoints.toFixed(1))} <span class="text-sm font-bold">Poin</span>`;
        }

        // 5. Send to WhatsApp for notification
        const waMessage = `*KLAIM REWARD POIN BERHASIL*\n\nID Klaim: ${claimId}\nPelanggan: ${customerName}\nNomor WhatsApp: ${phone}\nReward: ${rewardName}\nPoin Ditukar: ${pointsUsed}\nSisa Poin: ${finalPoints.toFixed(1)}\n\nMohon segera diproses. Terima kasih!`;
        const waUrl = `https://wa.me/628993370200?text=${encodeURIComponent(waMessage)}`;
        
        showToast('Penukaran poin berhasil!');
        
        // Small delay before opening WhatsApp
        setTimeout(() => {
            const popup = window.open(waUrl, '_blank', 'noopener,noreferrer');
            if (popup) popup.opener = null;
        }, 1500);

    } catch (error) {
        console.error('Error in claimReward:', error);
        const msg = buildClaimRewardErrorMessage(error);
        alert(msg);
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
    if (!ensureLoggedInForRewardExchange()) return;
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
    if (!ensureLoggedInForRewardExchange()) return;
    const phone = sessionStorage.getItem('reward_phone');
    if (!phone) {
        showToast('Mohon cek poin Anda terlebih dahulu.');
        return;
    }
    
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
        const userPoints = parseFloat(sessionStorage.getItem('user_points')) || 0;

        // Show loading state
        showToast('Sedang memproses penukaran...');

        // 2. Atomic claim on server side
        const requestId = `RW-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        const claimResult = await GASActions.post({
            action: 'claim_reward',
            sheet: 'tukar_poin',
            data: {
                reward_id: rewardId,
                phone: phone,
                customer_name: customerName,
                request_id: requestId
            }
        });

        const claimId = claimResult.claim_id || ('CLM-' + Date.now().toString().slice(-6));
        const pointsUsed = parseFloat(claimResult.points_used || requiredPoints) || 0;
        const newPoints = parseFloat(claimResult.balance_after);
        const finalPoints = Number.isNaN(newPoints) ? Math.max(0, userPoints - pointsUsed) : newPoints;

        // 3. Update local state and UI
        sessionStorage.setItem('user_points', finalPoints);
        const pointsDisplay = document.querySelector('#points-display h4');
        if (pointsDisplay) {
            pointsDisplay.innerHTML = `${escapeHtml(finalPoints.toFixed(1))} <span class="text-sm font-bold">Poin</span>`;
        }

        // 4. Prepare WhatsApp message
        const waMessage = `*KLAIM REWARD POIN BERHASIL*\n\nID Klaim: ${claimId}\nPelanggan: ${customerName}\nNomor WhatsApp: ${phone}\nReward: ${rewardName}\nPoin Ditukar: ${pointsUsed}\nSisa Poin: ${finalPoints.toFixed(1)}\n\nMohon segera diproses. Terima kasih!`;
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
        showToast(buildClaimRewardErrorMessage(error));
    }
}

function buildClaimRewardErrorMessage(error) {
    const raw = String((error && error.message) || error || '');
    const normalized = raw.toLowerCase();
    if (normalized.includes('reward_stock_empty')) return 'Stok reward sedang habis.';
    if (normalized.includes('reward_daily_quota_reached')) return 'Quota harian reward sudah habis.';
    if (normalized.includes('points_insufficient')) return 'Poin Anda tidak cukup untuk reward ini.';
    if (normalized.includes('user_not_found')) return 'Data poin pengguna tidak ditemukan.';
    if (normalized.includes('rate_limited')) return 'Terlalu banyak percobaan klaim, coba lagi sebentar.';
    return 'Gagal memproses penukaran. Silakan coba lagi.';
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
    const wishlistLabel = isLiked ? 'Hapus dari wishlist' : 'Tambah ke wishlist';
    const heartIcon = isLiked 
        ? '<svg class="w-5 h-5 text-red-500 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
        : '<svg class="w-5 h-5 text-gray-400 hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>';
    
    button.innerHTML = heartIcon;
    button.setAttribute('aria-label', wishlistLabel);
    button.setAttribute('title', wishlistLabel);
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
    
    console.log('🔍 Rendering wishlist items:', { wishlistIds, containerFound: !!container });
    
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
        console.log('📦 Fetching products for wishlist...');
        try {
            await fetchProducts();
            console.log('✅ Products fetched:', allProducts.length);
        } catch (error) {
            console.error('❌ Failed to fetch products:', error);
            container.innerHTML = '<p class="text-center text-red-500 py-4">Gagal memuat produk. Silakan refresh halaman.</p>';
            return;
        }
    }
    
    // ✅ FIX: Normalize IDs to string for comparison
    const wishlistSet = new Set(wishlistIds.map(id => String(id).trim()));
    console.log('🔍 Wishlist Set:', Array.from(wishlistSet));
    
    const wishlistProducts = allProducts.filter(p => {
        const productId = String(p.productId || '').trim();
        const isInWishlist = wishlistSet.has(productId);
        if (isInWishlist) {
            console.log('✅ Found wishlist product:', productId, p.nama);
        }
        return isInWishlist;
    });

    console.log('📊 Wishlist products found:', wishlistProducts.length);

    if (wishlistProducts.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-4">Produk tidak ditemukan. Mungkin produk sudah tidak tersedia.</p>';
        return;
    }

    container.innerHTML = wishlistProducts.map(p => {
        const productId = p.productId;
        const harga = parseFloat(p.harga_tunai || p.harga || 0);
        const imageUrl = p.gambar ? String(p.gambar).split(',')[0].trim() : '';
        const safeImage = sanitizeUrl(imageUrl, 'https://placehold.co/100x100?text=Produk');
        const isHiddenProd = isProductInteractionLocked(p);
        const buyButtonAttrs = isHiddenProd
            ? 'disabled aria-disabled="true" tabindex="-1"'
            : `data-action="wishlist-buy" data-product-id="${productId}"`;
        const buyButtonClass = isHiddenProd
            ? 'bg-gray-200 text-gray-400 text-xs font-bold px-3 py-1.5 rounded-lg cursor-not-allowed'
            : 'bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition active:scale-95';
        const availabilityHtml = isHiddenProd
            ? '<p class="text-[10px] text-gray-500 font-semibold mt-1">Sedang Tidak Tersedia</p>'
            : '';
        return `
            <div class="flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 transition">
                <div class="flex items-center gap-3 flex-1">
                    <img src="${safeImage}" alt="${escapeHtml(p.nama)}" class="w-16 h-16 object-cover rounded-lg shadow-sm" data-fallback-src="https://placehold.co/100x100?text=Produk">
                    <div class="flex-1">
                        <p class="font-semibold text-sm text-gray-800">${escapeHtml(p.nama)}</p>
                        <p class="text-xs text-green-600 font-bold mt-1">Rp ${harga.toLocaleString('id-ID')}</p>
                        ${availabilityHtml}
                    </div>
                </div>
                <div class="flex gap-2">
                    <button type="button" data-action="wishlist-toggle" data-product-id="${productId}" class="text-red-500 hover:text-red-700 p-2 transition active:scale-95" title="Hapus dari Wishlist">
                        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    </button>
                    <button type="button" ${buyButtonAttrs} class="${buyButtonClass}">
                        ${isHiddenProd ? 'Tidak Tersedia' : 'Beli'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    console.log('✅ Wishlist rendered successfully');
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
    const modal = document.getElementById('claim-success-modal');
    const claimIdElement = document.getElementById('claim-success-id');

    if (!modal || !claimIdElement) {
        console.error('Claim success modal elements not found.');
        showToast('Klaim berhasil diproses. ID: ' + claimId);
        return;
    }

    claimIdElement.textContent = claimId;
    modal.classList.remove('hidden');
    document.body.classList.add('modal-active');
}

/**
 * Close claim success modal
 */
function closeClaimSuccessModal() {
    const modal = document.getElementById('claim-success-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    document.body.classList.remove('modal-active');
}

/**
 * Open WhatsApp with claim message
 */
function openClaimWhatsApp() {
    if (window.claimWhatsAppUrl) {
        const popup = window.open(window.claimWhatsAppUrl, '_blank', 'noopener,noreferrer');
        if (popup) popup.opener = null;
        // Close modal after opening WhatsApp
        setTimeout(() => {
            closeClaimSuccessModal();
        }, 500);
    } else {
        showToast('Link WhatsApp klaim belum tersedia.');
    }
}

/**
 * Update payment method info text dynamically with smooth animations
 * @param {string} method - Payment method: 'tunai', 'qris', 'gajian', or 'paylater'
 */
function updatePaymentMethodInfo(method) {
    const infoContainer = document.getElementById('payment-method-info');
    const infoText = document.getElementById('payment-method-info-text');
    const qrisDisplay = document.getElementById('qris-display');
    
    if (!infoContainer || !infoText) return;
    
    // Payment method information mapping
    const paymentInfo = {
        'qris': 'Setelah memilih QRIS, scan kode di bawah lalu lanjutkan kirim pesanan untuk konfirmasi pembayaran.',
        'paylater': 'Setelah memilih PayLater, kami cek kelayakan akun dan tampilkan simulasi tagihannya di bawah.'
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

        if (method === 'paylater') {
            refreshPaylaterCheckoutState();
        } else {
            renderPaylaterCheckoutState();
        }
    }, 150); // Half of transition duration
}


// ============ CATEGORY SIDEBAR FUNCTIONS ============

/**
 * Open category sidebar with animation
 */
function openCategorySidebar() {
    const sidebar = document.getElementById('category-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar && overlay) {
        // Show overlay first
        overlay.classList.remove('hidden');
        
        // Then slide in sidebar
        setTimeout(() => {
            sidebar.classList.remove('-translate-x-full');
            sidebar.classList.add('translate-x-0');
        }, 10);
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
        
        // Load categories if not already loaded
        loadSidebarCategories();
    }
}

/**
 * Close category sidebar with animation
 */
function closeCategorySidebar() {
    const sidebar = document.getElementById('category-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar && overlay) {
        // Slide out sidebar
        sidebar.classList.remove('translate-x-0');
        sidebar.classList.add('-translate-x-full');
        
        // Hide overlay after animation
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 300);
        
        // Re-enable body scroll
        document.body.style.overflow = '';
    }
}

/**
 * Load categories dynamically from products into sidebar
 */
function loadSidebarCategories() {
    const categoryList = document.getElementById('sidebar-category-list');
    if (!categoryList) return;
    
    // Use merged categories (sheet categories + fallback from products)
    const categories = [{ value: 'Semua', label: 'Semua Produk' }]
        .concat(getDisplayCategories().map((category) => ({ value: category, label: category })));

    categoryList.innerHTML = categories.map((item) => {
        const iconSvg = getCategoryIcon(item.label);
        const safeCategory = escapeHtml(item.value);
        const safeLabel = escapeHtml(item.label);
        const isActive = item.value === currentCategory;
        const buttonClass = isActive
            ? 'flex items-center gap-3 py-3 px-2 rounded-lg transition group bg-green-50'
            : 'flex items-center gap-3 py-3 px-2 hover:bg-green-50 rounded-lg transition group';
        const iconClass = isActive
            ? 'w-12 h-12 bg-green-200 rounded-lg flex items-center justify-center transition'
            : 'w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition';
        const labelClass = isActive
            ? 'font-semibold text-green-700'
            : 'font-semibold text-gray-700 group-hover:text-green-700';

        return `
            <li class="border-b border-gray-100 last:border-0">
                <button type="button" data-action="select-sidebar-category" data-category="${safeCategory}" class="${buttonClass}">
                    <div class="${iconClass}">
                        ${iconSvg}
                    </div>
                    <span class="${labelClass}">${safeLabel}</span>
                </button>
            </li>
        `;
    }).join('');
}

/**
 * Get icon SVG for category (simple fallback icons)
 */
function getCategoryIcon(category) {
    // Default icon
    return `
        <svg class="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd"/>
        </svg>
    `;
}

/**
 * Select category from sidebar and filter products
 */
function selectSidebarCategory(category) {
    // Set category and filter products
    setCategory(category);
    
    // Close sidebar
    closeCategorySidebar();
    
    // Scroll to products section
    const productsSection = document.getElementById('product-grid') || document.getElementById('katalog');
    if (productsSection) {
        window.scrollTo({
            top: getPaginationScrollTop(productsSection),
            behavior: 'smooth'
        });
    }
}

/**
 * Sync mobile cart count with header cart count
 */
function updateMobileCartCount() {
    const mobileCartCount = document.getElementById('mobile-cart-count');
    const headerCartCount = document.getElementById('cart-count');
    
    if (mobileCartCount && headerCartCount) {
        const count = cart.length;
        
        if (count > 0) {
            mobileCartCount.textContent = count;
            mobileCartCount.classList.remove('hidden');
        } else {
            mobileCartCount.classList.add('hidden');
        }
    }
}

// Hook into existing updateCartUI to sync mobile count
const originalUpdateCartUI = updateCartUI;
updateCartUI = function() {
    if (typeof originalUpdateCartUI === 'function') {
        originalUpdateCartUI();
    }
    updateMobileCartCount();
};

// Initialize mobile cart count on page load
document.addEventListener('DOMContentLoaded', function() {
    updateMobileCartCount();
});
