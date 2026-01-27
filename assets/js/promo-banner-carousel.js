/**
 * Promotional Banner Carousel
 * Menampilkan banner promosi dari sheet "banners" di SheetDB
 * Mendukung manajemen konten terpusat dengan status dan tanggal
 */

class PromotionalBannerCarousel {
    constructor() {
        this.banners = [];
        this.currentIndex = 0;
        this.autoRotateInterval = null;
        this.isTransitioning = false;
        this.autoRotateDelay = 5000; // 5 detik per slide
        this.init();
    }

    async init() {
        await this.fetchBanners();
        if (this.banners.length > 0) {
            this.render();
            this.setupEventListeners();
            this.startAutoRotate();
        } else {
            this.hideContainer();
        }
    }

    async fetchBanners() {
        try {
            const apiUrl = CONFIG.getMainApiUrl();
            console.log('🔄 [PROMO-BANNER] Fetching banners from:', apiUrl);
            
            const response = await fetch(`${apiUrl}?sheet=banners`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const allBanners = await response.json();
            console.log('📥 [PROMO-BANNER] Received banners:', allBanners);
            
            // Filter banner yang aktif dan dalam rentang tanggal yang valid
            const now = new Date();
            this.banners = allBanners.filter(banner => {
                // Cek status
                if (banner.status !== 'active') {
                    return false;
                }
                
                // Cek tanggal mulai (jika ada)
                if (banner.start_date) {
                    const startDate = new Date(banner.start_date);
                    if (now < startDate) {
                        return false;
                    }
                }
                
                // Cek tanggal akhir (jika ada)
                if (banner.end_date) {
                    const endDate = new Date(banner.end_date);
                    if (now > endDate) {
                        return false;
                    }
                }
                
                return true;
            });
            
            console.log(`✅ [PROMO-BANNER] Loaded ${this.banners.length} active banners`);
        } catch (error) {
            console.error('❌ [PROMO-BANNER] Error fetching banners:', error);
            this.banners = [];
        }
    }

    hideContainer() {
        const container = document.getElementById('promo-banner-carousel-container');
        if (container) {
            container.style.display = 'none';
        }
    }

    render() {
        const container = document.getElementById('promo-banner-carousel-container');
        if (!container) {
            console.warn('⚠️ [PROMO-BANNER] Container not found');
            return;
        }

        container.style.display = 'block';
        
        // Jika hanya ada 1 banner, sembunyikan navigasi
        const showNavigation = this.banners.length > 1;
        
        container.innerHTML = `
            <div class="promo-banner-wrapper">
                ${showNavigation ? `
                <button class="promo-carousel-nav promo-carousel-prev" id="promo-carousel-prev" aria-label="Previous">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                    </svg>
                </button>
                ` : ''}
                
                <div class="promo-carousel-track-container">
                    <div class="promo-carousel-track" id="promo-carousel-track">
                        ${this.banners.map((banner, index) => this.renderBannerSlide(banner, index)).join('')}
                    </div>
                </div>
                
                ${showNavigation ? `
                <button class="promo-carousel-nav promo-carousel-next" id="promo-carousel-next" aria-label="Next">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                </button>
                ` : ''}
            </div>
            
            ${showNavigation ? `
            <div class="promo-carousel-dots" id="promo-carousel-dots">
                ${this.banners.map((_, index) => `
                    <button class="promo-carousel-dot ${index === 0 ? 'active' : ''}" data-index="${index}" aria-label="Go to slide ${index + 1}"></button>
                `).join('')}
            </div>
            ` : ''}
        `;

        this.updateCarousel();
    }

    renderBannerSlide(banner, index) {
        const hasLink = banner.cta_url && banner.cta_url.trim() !== '';
        const hasCaption = (banner.title && banner.title.trim() !== '') || 
                          (banner.subtitle && banner.subtitle.trim() !== '') || 
                          (banner.cta_text && banner.cta_text.trim() !== '');
        
        // Log deep link detection for debugging
        if (hasLink && banner.cta_url.startsWith('#produk-')) {
            console.log(`[Banner] Creating deep link for: ${banner.title || 'Untitled'} -> ${banner.cta_url}`);
        }
        
        return `
            <div class="promo-carousel-slide" data-index="${index}">
                <div class="promo-banner-card">
                    ${hasLink ? `<a href="${banner.cta_url}" class="promo-banner-link">` : ''}
                        <div class="promo-banner-image-container lazy-image-wrapper">
                            <div class="skeleton skeleton-banner"></div>
                            <img src="${banner.image_url}" alt="${banner.title || 'Banner Promosi'}" class="promo-banner-image" loading="${index === 0 ? 'eager' : 'lazy'}" onerror="this.src='https://placehold.co/1200x400?text=Banner+Promosi'" onload="this.classList.add('loaded'); this.previousElementSibling.style.display='none';">
                        </div>
                        ${hasCaption ? `
                        <div class="promo-banner-caption">
                            ${banner.title ? `<h3 class="promo-banner-title">${banner.title}</h3>` : ''}
                            ${banner.subtitle ? `<p class="promo-banner-subtitle">${banner.subtitle}</p>` : ''}
                            ${banner.cta_text && hasLink ? `<button class="promo-cta-button">${banner.cta_text}</button>` : ''}
                        </div>
                        ` : ''}
                    ${hasLink ? `</a>` : ''}
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const prevBtn = document.getElementById('promo-carousel-prev');
        const nextBtn = document.getElementById('promo-carousel-next');
        const dots = document.querySelectorAll('.promo-carousel-dot');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.prev();
                this.stopAutoRotate();
                this.startAutoRotate();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.next();
                this.stopAutoRotate();
                this.startAutoRotate();
            });
        }

        dots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.goToSlide(index);
                this.stopAutoRotate();
                this.startAutoRotate();
            });
        });

        // Touch/swipe support
        const track = document.getElementById('promo-carousel-track');
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

        // Pause on hover (desktop only)
        const container = document.getElementById('promo-banner-carousel-container');
        if (container && window.innerWidth >= 768) {
            container.addEventListener('mouseenter', () => {
                this.stopAutoRotate();
            });

            container.addEventListener('mouseleave', () => {
                this.startAutoRotate();
            });
        }
    }

    updateCarousel() {
        const track = document.getElementById('promo-carousel-track');
        const dots = document.querySelectorAll('.promo-carousel-dot');
        const prevBtn = document.getElementById('promo-carousel-prev');
        const nextBtn = document.getElementById('promo-carousel-next');

        if (!track) return;

        // Calculate offset (100% per slide for full-width banners)
        const offset = -(this.currentIndex * 100);
        track.style.transform = `translateX(${offset}%)`;

        // Update dots
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === this.currentIndex);
        });

        // Update navigation buttons state
        if (prevBtn && nextBtn) {
            prevBtn.style.opacity = this.currentIndex === 0 ? '0.5' : '1';
            nextBtn.style.opacity = this.currentIndex >= this.banners.length - 1 ? '0.5' : '1';
        }
    }

    next() {
        if (this.isTransitioning) return;
        
        if (this.currentIndex >= this.banners.length - 1) {
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
        
        if (this.currentIndex <= 0) {
            this.currentIndex = this.banners.length - 1;
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
        if (this.isTransitioning || index === this.currentIndex) return;
        
        this.currentIndex = index;
        this.isTransitioning = true;
        this.updateCarousel();
        setTimeout(() => {
            this.isTransitioning = false;
        }, 500);
    }

    startAutoRotate() {
        if (this.banners.length <= 1) return; // Tidak perlu rotasi jika hanya 1 banner
        
        this.stopAutoRotate();
        this.autoRotateInterval = setInterval(() => {
            this.next();
        }, this.autoRotateDelay);
    }

    stopAutoRotate() {
        if (this.autoRotateInterval) {
            clearInterval(this.autoRotateInterval);
            this.autoRotateInterval = null;
        }
    }

    async refresh() {
        this.stopAutoRotate();
        await this.fetchBanners();
        this.currentIndex = 0;
        
        if (this.banners.length > 0) {
            this.render();
            this.setupEventListeners();
            this.startAutoRotate();
        } else {
            this.hideContainer();
        }
    }
}

// Initialize promotional banner carousel when DOM is ready
let promoBannerCarousel;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        promoBannerCarousel = new PromotionalBannerCarousel();
    });
} else {
    promoBannerCarousel = new PromotionalBannerCarousel();
}

// Handle window resize
let promoResizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(promoResizeTimeout);
    promoResizeTimeout = setTimeout(() => {
        if (promoBannerCarousel) {
            promoBannerCarousel.updateCarousel();
        }
    }, 250);
});
