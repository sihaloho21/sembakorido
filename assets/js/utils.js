/**
 * UTILITIES - Centralized Utility Functions
 * Fungsi-fungsi yang digunakan across multiple pages
 * 
 * Contents:
 * - Notifications (toast, alert, success)
 * - Formatting (number, date, phone)
 * - Storage (localStorage helpers)
 * - DOM Helpers (show/hide, addClass/removeClass)
 * - Validation (email, phone, etc)
 */

// ============================================================================
// NOTIFICATION UTILITIES
// ============================================================================

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {number} duration - Duration in milliseconds (default: 3000)
 * @param {string} type - Type: 'success', 'error', 'warning', 'info' (default: 'info')
 */
function showToastNotification(message, duration = 3000, type = 'info') {
    const bgColor = {
        'success': 'bg-green-100 border-green-400 text-green-700',
        'error': 'bg-red-100 border-red-400 text-red-700',
        'warning': 'bg-yellow-100 border-yellow-400 text-yellow-700',
        'info': 'bg-blue-100 border-blue-400 text-blue-700'
    }[type] || 'bg-blue-100 border-blue-400 text-blue-700';
    
    const toast = document.createElement('div');
    toast.className = `fixed top-20 left-4 right-4 md:left-auto md:right-4 md:w-80 border-l-4 ${bgColor} px-4 py-3 rounded z-50 animate-pulse`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('animate-pulse');
        toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
        
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, duration);
}

/**
 * Show alert dialog
 * @param {string} title - Alert title
 * @param {string} message - Alert message
 * @param {string} type - Type: 'success', 'error', 'warning', 'info'
 */
function showAlert(title, message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
    
    // You can enhance this with a proper modal library later
    if (typeof alert !== 'undefined') {
        alert(`${title}\n\n${message}`);
    }
}

/**
 * Show error message
 * @param {string} message - Error message
 * @param {number} duration - Duration in milliseconds (default: 5000)
 */
function showErrorMessage(message, duration = 5000) {
    showToastNotification(`⚠️ ${message}`, duration, 'error');
}

/**
 * Show success message
 * @param {string} message - Success message
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
function showSuccessMessage(message, duration = 3000) {
    showToastNotification(`✅ ${message}`, duration, 'success');
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format number ke Indonesian locale (add thousands separator)
 * @param {number} number - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(number) {
    if (typeof number !== 'number') {
        number = parseInt(number) || 0;
    }
    return number.toLocaleString('id-ID');
}

/**
 * Format date ke Indonesian format
 * @param {Date|string} date - Date to format
 * @param {string} format - Format: 'short', 'long', 'time' (default: 'short')
 * @returns {string} Formatted date
 */
function formatDate(date, format = 'short') {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    
    const options = {
        'short': { year: 'numeric', month: 'short', day: 'numeric' },
        'long': { year: 'numeric', month: 'long', day: 'numeric' },
        'time': { hour: '2-digit', minute: '2-digit', second: '2-digit' }
    }[format];
    
    return new Date(date).toLocaleDateString('id-ID', options);
}

/**
 * Format currency (Rupiah)
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency
 */
function formatCurrency(amount) {
    if (typeof amount !== 'number') {
        amount = parseInt(amount) || 0;
    }
    
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

/**
 * Format phone number
 * @param {string} phone - Phone number
 * @returns {string} Formatted phone (e.g., 0812-3456-7890)
 */
function formatPhone(phone) {
    if (!phone) return '';
    
    const cleaned = phone.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{4})(\d{4})(\d{4})$/);
    
    if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`;
    }
    
    return cleaned;
}

// ============================================================================
// STORAGE UTILITIES
// ============================================================================

/**
 * Save to localStorage
 * @param {string} key - Storage key
 * @param {any} value - Value to store (will be JSON stringified)
 */
function saveToStorage(key, value) {
    try {
        const json = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, json);
        return true;
    } catch (error) {
        console.error('❌ Error saving to localStorage:', error);
        return false;
    }
}

/**
 * Load from localStorage
 * @param {string} key - Storage key
 * @param {any} defaultValue - Default value if not found
 * @returns {any} Stored value or default
 */
function loadFromStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        if (!item) return defaultValue;
        
        try {
            return JSON.parse(item);
        } catch {
            return item; // Return as string if not JSON
        }
    } catch (error) {
        console.error('❌ Error loading from localStorage:', error);
        return defaultValue;
    }
}

/**
 * Remove from localStorage
 * @param {string} key - Storage key
 */
function removeFromStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error('❌ Error removing from localStorage:', error);
        return false;
    }
}

/**
 * Clear all localStorage
 */
function clearStorage() {
    try {
        localStorage.clear();
        return true;
    } catch (error) {
        console.error('❌ Error clearing localStorage:', error);
        return false;
    }
}

// ============================================================================
// DOM UTILITIES
// ============================================================================

/**
 * Show element
 * @param {string|Element} selector - CSS selector or element
 */
function showElement(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) {
        el.classList.remove('hidden');
        el.style.display = '';
    }
}

/**
 * Hide element
 * @param {string|Element} selector - CSS selector or element
 */
function hideElement(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) {
        el.classList.add('hidden');
        el.style.display = 'none';
    }
}

/**
 * Toggle element visibility
 * @param {string|Element} selector - CSS selector or element
 */
function toggleElement(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) {
        el.classList.toggle('hidden');
    }
}

/**
 * Add class to element
 * @param {string|Element} selector - CSS selector or element
 * @param {string} className - Class name
 */
function addClass(selector, className) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) {
        el.classList.add(className);
    }
}

/**
 * Remove class from element
 * @param {string|Element} selector - CSS selector or element
 * @param {string} className - Class name
 */
function removeClass(selector, className) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) {
        el.classList.remove(className);
    }
}

/**
 * Set element text content
 * @param {string|Element} selector - CSS selector or element
 * @param {string} text - Text content
 */
function setText(selector, text) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) {
        el.textContent = text;
    }
}

/**
 * Set element HTML content
 * @param {string|Element} selector - CSS selector or element
 * @param {string} html - HTML content
 */
function setHTML(selector, html) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) {
        el.innerHTML = html;
    }
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate email
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate phone number
 * @param {string} phone - Phone to validate
 * @returns {boolean} True if valid (Indonesian format)
 */
function isValidPhone(phone) {
    const phoneRegex = /^08\d{8,11}$/;
    const normalized = phone.replace(/\D/g, '');
    return phoneRegex.test(normalized);
}

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}


// ============================================================================
// UTILITY EXPORTS (for reusability)
// ============================================================================

const Utils = {
    // Notifications
    showToast: showToastNotification,
    showAlert,
    showError: showErrorMessage,
    showSuccess: showSuccessMessage,
    
    // Formatting
    formatNumber,
    formatDate,
    formatCurrency,
    formatPhone,
    
    // Storage
    saveToStorage,
    loadFromStorage,
    removeFromStorage,
    clearStorage,
    
    // DOM
    show: showElement,
    hide: hideElement,
    toggle: toggleElement,
    addClass,
    removeClass,
    setText,
    setHTML,
    
    // Validation
    isValidEmail,
    isValidPhone,
    isValidUrl
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}
