/**
 * Cart Module
 * Handles shopping cart operations
 */

class CartModule {
    constructor(storageKey = 'sembako_cart') {
        this.storageKey = storageKey;
        this.items = this.loadCart();
    }

    /**
     * Load cart from localStorage
     */
    loadCart() {
        try {
            const cart = localStorage.getItem(this.storageKey);
            return cart ? JSON.parse(cart) : [];
        } catch (error) {
            console.error('Error loading cart:', error);
            return [];
        }
    }

    /**
     * Save cart to localStorage
     */
    saveCart() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.items));
            return true;
        } catch (error) {
            console.error('Error saving cart:', error);
            return false;
        }
    }

    /**
     * Add item to cart
     */
    addItem(product, quantity = 1) {
        const existingItem = this.items.find(item => item.id === product.id);
        
        if (existingItem) {
            existingItem.qty += quantity;
        } else {
            this.items.push({
                id: product.id,
                nama: product.nama,
                harga: product.harga,
                qty: quantity,
                slug: product.slug
            });
        }
        
        this.saveCart();
        return this.items;
    }

    /**
     * Remove item from cart
     */
    removeItem(productId) {
        this.items = this.items.filter(item => item.id !== productId);
        this.saveCart();
        return this.items;
    }

    /**
     * Update item quantity
     */
    updateQuantity(productId, quantity) {
        const item = this.items.find(item => item.id === productId);
        if (item) {
            if (quantity <= 0) {
                this.removeItem(productId);
            } else {
                item.qty = quantity;
                this.saveCart();
            }
        }
        return this.items;
    }

    /**
     * Clear cart
     */
    clearCart() {
        this.items = [];
        this.saveCart();
        return this.items;
    }

    /**
     * Get cart items
     */
    getItems() {
        return this.items;
    }

    /**
     * Get cart total
     */
    getTotal() {
        return this.items.reduce((total, item) => {
            return total + (parseInt(item.harga) || 0) * item.qty;
        }, 0);
    }

    /**
     * Get cart item count
     */
    getItemCount() {
        return this.items.reduce((count, item) => count + item.qty, 0);
    }

    /**
     * Check if cart is empty
     */
    isEmpty() {
        return this.items.length === 0;
    }

    /**
     * Get cart summary
     */
    getSummary() {
        return {
            itemCount: this.getItemCount(),
            total: this.getTotal(),
            items: this.items,
            isEmpty: this.isEmpty()
        };
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CartModule;
}
