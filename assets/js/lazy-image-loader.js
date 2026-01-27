/**
 * Lazy Image Loader
 * Implements lazy loading for images to improve page load performance
 * Supports both native lazy loading and Intersection Observer API
 */

class LazyImageLoader {
    constructor(options = {}) {
        this.options = {
            threshold: options.threshold || 0.1,
            rootMargin: options.rootMargin || '50px',
            placeholderSrc: options.placeholderSrc || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"%3E%3Crect fill="%23f0f0f0" width="400" height="300"/%3E%3C/svg%3E'
        };
        
        this.observer = null;
        this.images = [];
        this.init();
    }

    /**
     * Initialize lazy image loader
     */
    init() {
        // Check if browser supports Intersection Observer
        if ('IntersectionObserver' in window) {
            this.setupIntersectionObserver();
        } else {
            // Fallback: load all images immediately
            this.loadAllImages();
        }
        
        // Also setup native lazy loading attribute
        this.setupNativeLazyLoading();
    }

    /**
     * Setup Intersection Observer for lazy loading
     */
    setupIntersectionObserver() {
        const observerOptions = {
            threshold: this.options.threshold,
            rootMargin: this.options.rootMargin
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadImage(entry.target);
                    this.observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        // Observe all lazy-loadable images
        document.querySelectorAll('img[data-src]').forEach(img => {
            this.images.push(img);
            this.observer.observe(img);
        });
    }

    /**
     * Setup native lazy loading attribute
     */
    setupNativeLazyLoading() {
        document.querySelectorAll('img[data-src]').forEach(img => {
            img.setAttribute('loading', 'lazy');
        });
    }

    /**
     * Load a single image
     */
    loadImage(img) {
        const src = img.getAttribute('data-src');
        const srcset = img.getAttribute('data-srcset');

        if (src) {
            img.src = src;
        }
        if (srcset) {
            img.srcset = srcset;
        }

        img.removeAttribute('data-src');
        img.removeAttribute('data-srcset');
        img.classList.add('lazy-loaded');

        // Add fade-in animation
        img.style.animation = 'fadeIn 0.3s ease-in';
    }

    /**
     * Load all images (fallback for older browsers)
     */
    loadAllImages() {
        document.querySelectorAll('img[data-src]').forEach(img => {
            this.loadImage(img);
        });
    }

    /**
     * Destroy observer and cleanup
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
    }
}

/**
 * Initialize lazy image loader when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
    window.lazyImageLoader = new LazyImageLoader({
        threshold: 0.1,
        rootMargin: '50px'
    });
});

/**
 * CSS for lazy image loading
 * Add this to your stylesheet:
 * 
 * img[data-src] {
 *     opacity: 0;
 *     transition: opacity 0.3s ease-in;
 * }
 * 
 * img.lazy-loaded {
 *     opacity: 1;
 * }
 * 
 * @keyframes fadeIn {
 *     from { opacity: 0; }
 *     to { opacity: 1; }
 * }
 */

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LazyImageLoader;
}
