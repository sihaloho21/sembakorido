/**
 * Bundle Package Carousel
 * Menampilkan produk dengan kategori "Paket" di carousel
 * Menggunakan template card yang sama dengan katalog
 */

class BundleCarousel {
    constructor() {
        this.bundles = [];
        this.currentIndex = 0;
        this.autoRotateInterval = null;
        this.isTransitioning = false;
        this.init();
    }

    async init() {
        await this.fetchBundles();
        if (this.bundles.length > 0) {
            this.render();
            this.setupEventListeners();
            this.startAutoRotate();
        }
    }

    async fetchBundles() {
        try {
            const response = await fetch(CONFIG.getMainApiUrl());
            const allProducts = await response.json();
            
            // Filter dan map produk dengan kategori "Paket"
            this.bundles = allProducts
                .filter(p => p.kategori && p.kategori.toLowerCase().includes('paket'))
                .map(p => {
                    const cashPrice = parseInt(p.harga_cash || p.harga || 0);
                    const gajianPrice = parseInt(p.harga_gajian || p.hargaGajian || 0);
                    
                    // Calculate gajian price if not provided
                    const finalGajianPrice = gajianPrice > 0 ? gajianPrice : (typeof calculateGajianPrice === 'function' ? calculateGajianPrice(cashPrice).price : cashPrice);
                    
                    return {
                        ...p,
                        harga: cashPrice,
                        hargaGajian: finalGajianPrice,
                        hargaCoret: parseInt(p.harga_coret || p.hargaCoret || 0),
                        stok: parseInt(p.stok_tersedia || p.stok || 0),
                        gambar: p.gambar || 'https://placehold.co/300x200?text=Produk'
                    };
                });
            
            console.log(`✅ Loaded ${this.bundles.length} bundle packages`);
        } catch (error) {
            console.error('❌ Error fetching bundles:', error);
            this.bundles = [];
        }
    }

    render() {
        const container = document.getElementById('bundle-carousel-container');
        if (!container || this.bundles.length === 0) {
            if (container) container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = `
            <div class="bundle-carousel-wrapper">
                <button class="carousel-nav carousel-prev" id="carousel-prev" aria-label="Previous">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                    </svg>
                </button>
                
                <div class="carousel-track-container">
                    <div class="carousel-track" id="carousel-track">
                        ${this.bundles.map((p, index) => this.renderProductCard(p, index)).join('')}
                    </div>
                </div>
                
                <button class="carousel-nav carousel-next" id="carousel-next" aria-label="Next">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                </button>
            </div>
            
            <div class="carousel-dots" id="carousel-dots">
                ${this.bundles.map((_, index) => `
                    <button class="carousel-dot ${index === 0 ? 'active' : ''}" data-index="${index}" aria-label="Go to slide ${index + 1}"></button>
                `).join('')}
            </div>
        `;

        this.updateCarousel();
    }

    renderProductCard(p, index) {
        // Stok label
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

        const rewardPoints = typeof calculateRewardPoints === 'function' ? calculateRewardPoints(p.harga, p.nama) : 0;
        
        // Harga coret
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

        return `
            <div class="carousel-slide" data-index="${index}">
                <div class="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition duration-300 relative h-full">
                    <div class="absolute top-3 left-3 z-10 flex flex-col gap-2">
                        <div class="bg-amber-400 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm flex items-center gap-1">
                            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                            +${rewardPoints} Poin
                        </div>
                    </div>
                    <img src="${mainImage}" alt="${p.nama}" onclick='bundleCarousel.openProductDetail(${index})' class="w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity ${p.stok === 0 ? 'grayscale opacity-60' : ''}" onerror="this.src='https://placehold.co/300x200?text=Produk'">
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
                        ${hasVariations ? `
                        <button onclick='bundleCarousel.openProductDetail(${index}); event.stopPropagation();' class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 mb-3">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                            Pilih Variasi
                        </button>
                        ` : `
                        <button onclick='bundleCarousel.addProductToCart(${index}, event)' ${p.stok === 0 ? 'disabled' : ''} class="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 mb-3">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                            Tambah ke Keranjang
                        </button>
                        `}
                        <div class="grid grid-cols-2 gap-2">
                            <button onclick='bundleCarousel.openProductDetail(${index}); event.stopPropagation();' class="bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2 rounded-lg text-sm transition">Rincian</button>
                            <button onclick='bundleCarousel.directOrderProduct(${index}); event.stopPropagation();' ${p.stok === 0 ? 'disabled' : ''} class="bg-green-100 hover:bg-green-200 text-green-700 font-bold py-2 rounded-lg text-sm transition">Beli Sekarang</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const prevBtn = document.getElementById('carousel-prev');
        const nextBtn = document.getElementById('carousel-next');
        const dots = document.querySelectorAll('.carousel-dot');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prev());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.next());
        }

        dots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.goToSlide(index);
            });
        });

        // Touch/swipe support
        const track = document.getElementById('carousel-track');
        if (track) {
            let startX = 0;
            let currentX = 0;
            let isDragging = false;

            track.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                isDragging = true;
                this.stopAutoRotate();
            });

            track.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                currentX = e.touches[0].clientX;
            });

            track.addEventListener('touchend', () => {
                if (!isDragging) return;
                isDragging = false;
                
                const diff = startX - currentX;
                if (Math.abs(diff) > 50) {
                    if (diff > 0) {
                        this.next();
                    } else {
                        this.prev();
                    }
                }
                
                this.startAutoRotate();
            });
        }
    }

    updateCarousel() {
        const track = document.getElementById('carousel-track');
        const dots = document.querySelectorAll('.carousel-dot');
        const prevBtn = document.getElementById('carousel-prev');
        const nextBtn = document.getElementById('carousel-next');

        if (!track) return;

        // Determine slides per view based on screen width
        const isMobile = window.innerWidth < 768;
        const slidesPerView = isMobile ? 1 : 2;
        
        // Calculate slide width based on CSS flex-basis
        // Mobile: 90% per slide, Desktop: 45% per slide
        const slideWidth = isMobile ? 90 : 45;
        const peekAmount = isMobile ? 5 : 5; // 5% peek on each side

        // Calculate offset with peek
        const baseOffset = -(this.currentIndex * slideWidth);
        const offset = baseOffset + peekAmount;

        track.style.transform = `translateX(${offset}%)`;

        // Update dots
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === this.currentIndex);
        });

        // Update navigation buttons visibility
        if (prevBtn && nextBtn) {
            prevBtn.style.opacity = this.currentIndex === 0 ? '0.5' : '1';
            nextBtn.style.opacity = this.currentIndex >= this.bundles.length - slidesPerView ? '0.5' : '1';
        }
    }

    next() {
        if (this.isTransitioning) return;
        
        const isMobile = window.innerWidth < 768;
        const slidesPerView = isMobile ? 1 : 2;
        const maxIndex = this.bundles.length - slidesPerView;

        if (this.currentIndex >= maxIndex) {
            this.currentIndex = 0;
        } else {
            this.currentIndex++;
        }

        this.isTransitioning = true;
        this.updateCarousel();
        setTimeout(() => {
            this.isTransitioning = false;
        }, 500);
    }

    prev() {
        if (this.isTransitioning) return;
        
        const isMobile = window.innerWidth < 768;
        const slidesPerView = isMobile ? 1 : 2;
        const maxIndex = this.bundles.length - slidesPerView;

        if (this.currentIndex <= 0) {
            this.currentIndex = maxIndex;
        } else {
            this.currentIndex--;
        }

        this.isTransitioning = true;
        this.updateCarousel();
        setTimeout(() => {
            this.isTransitioning = false;
        }, 500);
    }

    goToSlide(index) {
        if (this.isTransitioning) return;
        
        this.currentIndex = index;
        this.isTransitioning = true;
        this.updateCarousel();
        setTimeout(() => {
            this.isTransitioning = false;
        }, 500);
        
        this.stopAutoRotate();
        this.startAutoRotate();
    }

    startAutoRotate() {
        this.stopAutoRotate();
        this.autoRotateInterval = setInterval(() => {
            this.next();
        }, 3000);
    }

    stopAutoRotate() {
        if (this.autoRotateInterval) {
            clearInterval(this.autoRotateInterval);
            this.autoRotateInterval = null;
        }
    }

    openProductDetail(index) {
        const product = this.bundles[index];
        if (!product) return;

        this.stopAutoRotate();

        if (typeof showDetail === 'function') {
            showDetail(product);
        } else {
            console.error('showDetail function not found');
        }

        // Resume auto-rotate when modal closes
        const modal = document.getElementById('detail-modal');
        if (modal) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'class') {
                        if (modal.classList.contains('hidden')) {
                            this.startAutoRotate();
                            observer.disconnect();
                        }
                    }
                });
            });
            observer.observe(modal, { attributes: true });
        }
    }

    addProductToCart(index, event) {
        const product = this.bundles[index];
        if (!product) return;

        if (typeof addToCart === 'function') {
            addToCart(product, event);
        } else {
            console.error('addToCart function not found');
        }
    }

    directOrderProduct(index) {
        const product = this.bundles[index];
        if (!product) return;

        this.stopAutoRotate();

        if (typeof directOrder === 'function') {
            directOrder(product);
        } else {
            console.error('directOrder function not found');
        }
    }

    async refresh() {
        await this.fetchBundles();
        this.currentIndex = 0;
        this.render();
        this.setupEventListeners();
        this.startAutoRotate();
    }
}

// Initialize carousel when DOM is ready
let bundleCarousel;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        bundleCarousel = new BundleCarousel();
    });
} else {
    bundleCarousel = new BundleCarousel();
}

// Handle window resize
let bundleResizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(bundleResizeTimeout);
    bundleResizeTimeout = setTimeout(() => {
        if (bundleCarousel) {
            bundleCarousel.updateCarousel();
        }
    }, 250);
});
