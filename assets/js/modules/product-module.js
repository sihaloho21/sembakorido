/**
 * Product Module
 * Handles product fetching, filtering, and rendering
 */

class ProductModule {
    constructor() {
        this.allProducts = [];
        this.filteredProducts = [];
        this.currentCategory = 'Semua';
        this.currentPage = 1;
        this.itemsPerPage = 12;
    }

    /**
     * Fetch products from API
     */
    async fetchProducts() {
        try {
            const products = await ApiService.get('?sheet=products', {
                cacheDuration: 5 * 60 * 1000 // 5 minutes cache
            });
            
            this.allProducts = products.map(p => {
                const cashPrice = parseInt(p.harga) || 0;
                const gajianInfo = typeof calculateGajianPrice === 'function' 
                    ? calculateGajianPrice(cashPrice)
                    : { price: cashPrice, installments: [] };
                
                return {
                    ...p,
                    slug: this.createSlug(p.nama),
                    cashPrice,
                    gajianPrice: gajianInfo.price,
                    installments: gajianInfo.installments
                };
            });
            
            this.filteredProducts = this.allProducts;
            return this.allProducts;
        } catch (error) {
            console.error('Error fetching products:', error);
            return [];
        }
    }

    /**
     * Create URL-friendly slug
     */
    createSlug(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .trim()
            .replace(/[-\s]+/g, '-');
    }

    /**
     * Find product by slug
     */
    findProductBySlug(slug) {
        return this.allProducts.find(p => p.slug === slug);
    }

    /**
     * Filter products by category
     */
    filterByCategory(category) {
        this.currentCategory = category;
        this.currentPage = 1;
        
        if (category === 'Semua') {
            this.filteredProducts = this.allProducts;
        } else {
            this.filteredProducts = this.allProducts.filter(p => p.kategori === category);
        }
        
        return this.filteredProducts;
    }

    /**
     * Get paginated products
     */
    getPaginatedProducts() {
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        return this.filteredProducts.slice(start, end);
    }

    /**
     * Get total pages
     */
    getTotalPages() {
        return Math.ceil(this.filteredProducts.length / this.itemsPerPage);
    }

    /**
     * Get categories
     */
    getCategories() {
        const categories = ['Semua'];
        const uniqueCategories = [...new Set(this.allProducts.map(p => p.kategori))];
        return categories.concat(uniqueCategories.filter(cat => cat));
    }

    /**
     * Set current page
     */
    setPage(page) {
        const totalPages = this.getTotalPages();
        if (page >= 1 && page <= totalPages) {
            this.currentPage = page;
            return true;
        }
        return false;
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProductModule;
}
